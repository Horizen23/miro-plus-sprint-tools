'use client';

import { useEffect } from 'react';
import type { CustomAction, CustomEvent, Card } from "@mirohq/websdk-types";
import { RealtimeFactory } from '@/services/realtime/factory';
import { VotingState } from '@/services/realtime/types';
import { VotingSession } from '@/hooks/useVotingSession';
import { JiraService } from '@/utils/jiraService';
import { handleReorderSelectedCards, handleDuplicateAndLink, handleRemoveLinks } from '@/utils/miroUtils';
import { parseUserMapping, getCardMappedUser, isUserOwnerOfCard } from '@/utils/mappingUtils';

export default function InitContent() {
  useEffect(() => {
    async function init() {
      const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const getFullPath = (path: string) => {
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        return `${BASE_PATH}${cleanPath}`;
      };

      miro.board.ui.on('icon:click', async () => {
        await miro.board.ui.openPanel({ url: getFullPath('panel') });
      });

      const notify = async (msg: string, type: 'info' | 'error' = 'info') => {
        const truncated = msg.length > 80 ? msg.substring(0, 77) + "..." : msg;
        if (type === 'error') await miro.board.notifications.showError(truncated);
        else await miro.board.notifications.showInfo(truncated);
      };

      // --- Register Custom Actions ---
      const updateCardStatus = async (card: Card, status: 'to-do' | 'in-progress' | 'done', jiraWithRefresh: (<T>(fn: (s: JiraService) => Promise<T>) => Promise<T>) | null, userInfo: any, myAccountId?: string, mapping?: any, ignoreRegex?: string) => {
        const today = new Date().toISOString().split('T')[0];
        const currentMiroUserId = userInfo?.id;

        // Load Mapping for Tag-based Assignee validation
        let mappedUserIdentity: string | undefined;
        let isMe = false;

        try {
          const tags = await miro.board.get({ type: 'tag' });
          const cardTags = tags.filter(t => (card as any).tagIds?.includes(t.id)).map(t => t.title);
          
          mappedUserIdentity = getCardMappedUser(cardTags, mapping || {}, ignoreRegex);
          isMe = isUserOwnerOfCard(cardTags, mapping || {}, userInfo, ignoreRegex);
        } catch (e) {}

        if (status === 'in-progress') {
          const hasFormalAssignee = !!card.assignee?.userId;
          const hasMapping = !!mappedUserIdentity;
          
          if (!hasFormalAssignee && !hasMapping) {
            await notify(`Cannot move to In Progress: No Assignee or Tag Mapping found!`, 'error');
            return false;
          }
          if (!card.startDate) card.startDate = today;
        } else if (status === 'done') {
          if (!card.startDate) card.startDate = today;
          if (!card.dueDate) card.dueDate = today;
        } else if (status === 'to-do') {
          // IMPORTANT: Clear dates to make Miro Card return to "To Do" state
          card.startDate = undefined;
          card.dueDate = undefined;
        }
        
        // --- Jira Sync Logic ---
        let jiraUpdated = false;
        if (jiraWithRefresh) {
          const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
          const metadata = (await card.getMetadata(metadataKey)) as { key?: string; lastTitle?: string } | undefined;
          if (metadata && metadata.key) {
             try {
                const transitions = await jiraWithRefresh(s => s.getTransitions(metadata.key!));
                
                let targetRegex = /none/;
                if (status === 'in-progress') targetRegex = new RegExp(process.env.NEXT_PUBLIC_JIRA_STATUS_IN_PROGRESS || "progress|doing|dev", "i");
                else if (status === 'done') targetRegex = new RegExp(process.env.NEXT_PUBLIC_JIRA_STATUS_DONE || "done|complete|resolved", "i");
                else if (status === 'to-do') targetRegex = new RegExp(process.env.NEXT_PUBLIC_JIRA_STATUS_TODO || "to[\\s\\-]*do|backlog|open|new|ready|todo", "i");

                let targetAssignee: string | undefined;
                if (isMe || card.assignee?.userId === currentMiroUserId) {
                  targetAssignee = myAccountId;
                } else if (mappedUserIdentity) {
                  const foundUsers = await jiraWithRefresh(s => s.findUsers(mappedUserIdentity!));
                  if (foundUsers && foundUsers.length > 0) targetAssignee = foundUsers[0].accountId;
                }

                const transition = transitions.find((t: { id: string; name: string }) => targetRegex.test(t.name));
                
                if (transition) {
                  // 1. Update Issue Fields (Dates, Assignee) FIRST
                  try {
                    const plainTitle = card.title.replace(/<[^>]*>/g, '');

                    await jiraWithRefresh(s => s.updateIssue(metadata.key!, plainTitle, card.dueDate, card.startDate, targetAssignee));
                  } catch (e: any) {
                    console.error(`[JiraSync] [${metadata.key}] Field update failed:`, e.message);
                  }

                  // 2. Then Transition Status

                  await jiraWithRefresh(s => s.transitionIssue(metadata.key!, transition.id));

                  await notify(`Jira: ${metadata.key} -> ${transition.name}`);
                  jiraUpdated = true;
                } else {
                  console.warn(`[JiraSync] [${metadata.key}] No matching transition found for status: ${status}`);
                  // Fallback: Just update fields if no transition is needed or found
                  try {
                    const plainTitle = card.title.replace(/<[^>]*>/g, '');
                    await jiraWithRefresh(s => s.updateIssue(metadata.key!, plainTitle, card.dueDate, card.startDate, targetAssignee));
                    await notify(`Dates synced, but no '${status}' transition found`, 'info');
                    jiraUpdated = true;
                  } catch (e: any) {
                    console.error(`[JiraSync] [${metadata.key}] Field update fallback failed:`, e.message);
                  }
                }
             } catch (err: any) {
                console.error(`[JiraSync] [${metadata.key}] Sync Error:`, err.message);
                if (!err.message?.includes("401")) {
                  await notify(`Jira Sync Failed: ${err.message}`, 'error');
                }
             }
          } else {

          }
        } else {

        }

        // --- Miro Card Update ---
        card.taskStatus = status;
        try {
          await card.sync();
          return true;
        } catch (syncErr: any) {
          if (syncErr.message?.includes('Cannot move')) {
             await notify(jiraUpdated ? `Jira synced, but Miro card must be dragged manually.` : `API limit: Kanban cards must be dragged manually!`, 'error');
          }
          return false;
        }
      };

      // --- Register Custom Actions ---
      const handleSetStatus = (status: 'to-do' | 'in-progress' | 'done') => async (props: CustomEvent) => {

        
        let userInfo: any = null;
        try { userInfo = await miro.board.getUserInfo(); } catch(e) {}

        const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
        const savedConfig = localStorage.getItem(configKey);
        if (!savedConfig) {
          console.warn("[JiraSync] No saved config found in localStorage");
          return;
        }
        
        let jiraConfig = JSON.parse(savedConfig);

        const withRefresh = async <T,>(fn: (service: JiraService) => Promise<T>): Promise<T> => {
          let service = new JiraService(jiraConfig);
          try {
            return await fn(service);
          } catch (e: any) {

            
            // Make the 401 check more lenient
            const is401 = e.message?.includes("401") || e.status === 401;
            
            if (is401 && jiraConfig.refreshToken) {

              try {
                const refreshData = await service.refreshAccessToken();
                jiraConfig = { 
                  ...jiraConfig, 
                  accessToken: refreshData.access_token, 
                  refreshToken: refreshData.refresh_token || jiraConfig.refreshToken 
                };
                localStorage.setItem(configKey, JSON.stringify(jiraConfig));

                const nextService = new JiraService(jiraConfig);
                return await fn(nextService);
              } catch (refreshError) { 
                console.error("[JiraSync] Refresh failed:", refreshError);
                await notify("Jira session expired. Please open the app panel to re-login.", "error");
                throw refreshError; 
              }
            }
            throw e;
          }
        };

        // 1. Pre-fetch Config and User Info ONCE
        let myAccountId: string | undefined;
        let globalMapping: any = {};
        
        let ignoreRegex = "";
        try {
          const gConfig = await (miro.board as any).getAppData("globalConfig") || await (miro.board as any).getAppData("timesheetConfig");
          globalMapping = parseUserMapping(gConfig?.tsUserMapping || gConfig?.userMapping || "");
          
          const vars = gConfig?.tsVariables || gConfig?.variables || "";
          const tagLine = vars.split('\n').find((l: string) => l.trim().startsWith('tag='));
          if (tagLine) {
            const parts = tagLine.split('=');
            if (parts[1]) ignoreRegex = parts[1].trim();
          }

          

          const myself = await withRefresh(s => s.getMyself()).catch(e => {
            console.warn("[JiraSync] Could not fetch Jira profile:", e.message);
            return null;
          });
          if (myself) {
            myAccountId = myself.accountId;

          }
        } catch(e) {
          console.warn("[JiraSync] Pre-fetch failed:", e);
        }

        let processedCount = 0;
        const cards = props.items.filter(i => i.type === 'card');

        
        for (const item of cards) {
          const success = await updateCardStatus(item as Card, status, withRefresh, userInfo, myAccountId, globalMapping, ignoreRegex);
          if (success) {
            processedCount++;

            console.warn(`[JiraSync] Card ${item.id} failed`);
          }
        }
        
        if (processedCount > 0) {

          await notify(`Successfully updated ${processedCount}/${cards.length} item(s)`, "info");
        }
      };

      await miro.board.ui.on('custom:set-todo', handleSetStatus('to-do'));
      await miro.board.ui.on('custom:set-inprogress', handleSetStatus('in-progress'));
      await miro.board.ui.on('custom:set-done', handleSetStatus('done'));

      const todoAction: CustomAction = {
        event: "set-todo",
        ui: { label: "Set To Do", icon: "chat-two", description: "Set status to To Do", position: 1 },
        predicate: { type: "card" },
      };
      const inprogressAction: CustomAction = {
        event: "set-inprogress",
        ui: { label: "Set In Progress", icon: "chat-dashes-lines-two", description: "Set status and stamp start date", position: 2 },
        predicate: { type: "card" },
      };
      const doneAction: CustomAction = {
        event: "set-done",
        ui: { label: "Set Done", icon: "trophy", description: "Set status and stamp dates", position: 3 },
        predicate: { type: "card" },
      };

      try {
        await miro.board.experimental.action.register(todoAction);
        await miro.board.experimental.action.register(inprogressAction);
        await miro.board.experimental.action.register(doneAction);
      } catch (e) {
        console.warn("Failed to register custom actions", e);
      }
      const realtime = RealtimeFactory.getInstance();
      try {
        const boardInfo = await miro.board.getInfo();
        realtime.connect(boardInfo.id);
      } catch {
        realtime.connect();
      }


      let activeModalCardId: string | null = null;

      // Listen for any voting state update to discover sessions without polling the board
      realtime.onStateUpdate(async (state: VotingState) => {
        
        if (state.status === 'voting') {
          // Prevent reopening the same modal multiple times
          if (activeModalCardId === state.cardId) {
            return;
          }

          activeModalCardId = state.cardId;
          
          const displayTitle = state.cardTitle.length > 50 
            ? state.cardTitle.substring(0, 47) + "..." 
            : state.cardTitle;
          await miro.board.notifications.showInfo(
            `Estimation Started: ${displayTitle}`
          );

          try {
            await miro.board.ui.openModal({
              url: getFullPath(`/voting?cardId=${state.cardId}`),
              width: 450,
              height: 750,
            });
          } catch (e) {
            console.error("InitContent: Error opening modal", e);
          }
        } else if (state.status === null || state.status === 'revealed') {
          if (state.status === null) {
            activeModalCardId = null;
          }
        }
      });
    }

    init();
  }, []);

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
        <img
          src="/color-icon.svg"
          alt="Plus Sprint Tools"
          style={{ width: '120px', height: '120px' }}
        />
      </div>
      <div>
        <p style={{ fontSize: 'large' }}>Great, your app is running locally</p>
        <p>
          You can now create your Developer team to get your app running in
          Miro.
        </p>
      </div>
      <div>
        <a
          className="button button-primary"
          href="https://developers.miro.com/docs/create-a-developer-team"
          target="_blank"
        >
          Create a Developer team
        </a>
      </div>
      <div>
        <p>
          To see your app, open it in an app panel on Miro.com, or preview it at{' '}
          <a href="/panel" className="link link-primary">
            this url
          </a>
        </p>
      </div>
    </div>
  );
}
