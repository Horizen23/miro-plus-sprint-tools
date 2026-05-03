'use client';

import { useEffect } from 'react';
import type { CustomAction, CustomEvent, Card } from "@mirohq/websdk-types";
import { RealtimeFactory } from '@/services/realtime/factory';
import { VotingState } from '@/services/realtime/types';
import { VotingSession } from '@/hooks/useVotingSession';
import { JiraService } from '@/utils/jiraService';

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
      const handleSetStatus = (status: 'to-do' | 'in-progress' | 'done') => async (props: CustomEvent) => {
        const today = new Date().toISOString().split('T')[0];
        
        let currentMiroUserId = "";
        try {
           const userInfo = await miro.board.getUserInfo();
           currentMiroUserId = userInfo.id;
        } catch(e) {}

        let jiraService: JiraService | null = null;
        let myAccountId: string | undefined;
        try {
          const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
          const savedConfig = localStorage.getItem(configKey);
          if (savedConfig) {
             const config = JSON.parse(savedConfig);
             if (config.accessToken || config.apiToken) {
               jiraService = new JiraService(config);
               try {
                 const myself = await jiraService.getMyself();
                 if (myself) myAccountId = myself.accountId;
               } catch(e) {}
             }
          }
        } catch(e) {
          console.warn("Could not load Jira config in background", e);
        }

        let processedCount = 0;
        for (const item of props.items) {
          if (item.type === 'card' && item.id) {
            try {
              const card = item as Card;
              
              if (status === 'in-progress') {
                if (!card.assignee?.userId) {
                  await notify(`❌ Cannot move "${card.title.replace(/<[^>]*>/g, '').substring(0, 10)}..." to In Progress: No Assignee!`, 'error');
                  continue; // Skip this card
                }
                if (!card.startDate) card.startDate = today;
              } else if (status === 'done') {
                if (!card.startDate) card.startDate = today;
                if (!card.dueDate) card.dueDate = today;
              }
              
              // --- Jira Sync Logic ---
              let jiraUpdated = false;
              if (jiraService) {
                const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
                const metadata = (await card.getMetadata(metadataKey)) as { key?: string; lastTitle?: string } | undefined;
                if (metadata && metadata.key) {
                   const transitions = await jiraService.getTransitions(metadata.key);
                   
                   let targetRegex = /none/;
                   if (status === 'in-progress') targetRegex = new RegExp(process.env.NEXT_PUBLIC_JIRA_STATUS_IN_PROGRESS || "progress|doing|dev", "i");
                   else if (status === 'done') targetRegex = new RegExp(process.env.NEXT_PUBLIC_JIRA_STATUS_DONE || "done|complete|resolved", "i");
                   else if (status === 'to-do') targetRegex = new RegExp(process.env.NEXT_PUBLIC_JIRA_STATUS_TODO || "to\\s*do|backlog|open", "i");

                   const transition = transitions.find((t: { id: string; name: string }) => targetRegex.test(t.name));
                   if (transition) {
                      await jiraService.transitionIssue(metadata.key, transition.id);
                      
                      // Push dates and assignee update to Jira
                      try {
                        const targetAssignee = card.assignee?.userId === currentMiroUserId ? myAccountId : undefined;
                        const plainTitle = card.title.replace(/<[^>]*>/g, '');
                        await jiraService.updateIssue(metadata.key, plainTitle, card.dueDate, card.startDate, targetAssignee);
                      } catch (updateErr) {
                        console.warn("Status updated but failed to sync dates/assignee", updateErr);
                      }

                      await notify(`🚀 Jira: ${metadata.key} moved to ${transition.name}!`);
                      jiraUpdated = true;
                   } else {
                      console.warn(`No matching transition found for ${status} in Jira`, transitions);
                      await notify(`❌ Jira: Could not move ${metadata.key}. Check valid transitions.`, 'error');
                   }
                }
              }

              // --- Miro Card Update ---
              card.taskStatus = status;
              
              try {
                await card.sync();
              } catch (syncErr: any) {
                console.warn("Miro SDK sync error:", syncErr.message);
                if (syncErr.message?.includes('Cannot move')) {
                   if (jiraUpdated) {
                     await notify(`⚠️ Jira synced, but Miro card must be dragged manually due to API limits.`, 'error');
                   } else {
                     await notify(`❌ API limit: Kanban cards must be dragged manually!`, 'error');
                   }
                } else {
                   throw syncErr;
                }
              }
              
              processedCount++;
            } catch (e) {
              console.error("Failed to update card", e);
            }
          }
        }
        
        if (processedCount > 0) {
          await notify(`✅ Marked ${processedCount} item(s) as ${status.toUpperCase()}`);
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
      realtime.connect();

      console.log("InitContent: Realtime initialized, waiting for voting events...");

      let activeModalCardId: string | null = null;

      // Listen for any voting state update to discover sessions without polling the board
      realtime.onStateUpdate(async (state: VotingState) => {
        console.log("InitContent: Received voting-state-updated event:", state);
        
        if (state.status === 'voting') {
          // Prevent reopening the same modal multiple times
          if (activeModalCardId === state.cardId) {
            return;
          }

          console.log("InitContent: Opening voting modal for card:", state.cardId);
          activeModalCardId = state.cardId;
          
          await miro.board.notifications.showInfo(
            `Estimation Started: ${state.cardTitle}`
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
