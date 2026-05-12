'use client';

import React, { useEffect } from 'react';
import { Card, AppCard, CustomAction } from '@mirohq/websdk-types';
import { RealtimeFactory } from '@/services/realtime/factory';
import { VotingState } from '@/services/realtime/types';
import { JiraService } from '@/utils/jiraService';
import { parseUserMapping, getCardMappedUser, isUserOwnerOfCard } from '@/utils/mappingUtils';
import { cacheUtils } from '@/utils/cacheUtils';
import { useGlobalConfig } from '@/contexts/GlobalConfigContext';

// ==========================================
// 1. UTILITY FUNCTIONS
// ==========================================

const getFullPath = (path: string) => {
  const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${cleanPath}`;
};

const notify = async (msg: string, type: 'info' | 'error' = 'info') => {
  const truncated = msg.length > 80 ? msg.substring(0, 77) + "..." : msg;
  if (type === 'error') await miro.board.notifications.showError(truncated);
  else await miro.board.notifications.showInfo(truncated);
};

// ==========================================
// 2. JIRA SYNC BUSINESS LOGIC
// ==========================================

const updateCardStatus = async (
  card: Card | AppCard, 
  status: 'to-do' | 'in-progress' | 'done', 
  jiraWithRefresh: (<T>(fn: (s: JiraService) => Promise<T>) => Promise<T>) | null, 
  userInfo: any, 
  myAccountId?: string, 
  mapping?: Map<string, string>, 
  ignoreRegex?: string, 
  boardTags?: any[]
) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentMiroUserId = userInfo?.id;

  let mappedUserIdentity: string | undefined;
  let isMe = false;

  try {
    const tags = boardTags || await miro.board.get({ type: 'tag' });
    const cardTags = tags.filter(t => (card as any).tagIds?.includes(t.id)).map(t => t.title);
    const userMap = mapping || new Map<string, string>();
    mappedUserIdentity = getCardMappedUser(cardTags, userMap, ignoreRegex);
    isMe = isUserOwnerOfCard(cardTags, userMap, userInfo, ignoreRegex);
  } catch (e) {
    console.error(`[updateCardStatus] Tag/Mapping Error:`, e);
  }

  // Miro Card Validation & Date Stamping
  if (card.type === 'card') {
    const c = card as Card;
    if (status === 'in-progress') {
      const hasFormalAssignee = !!c.assignee?.userId;
      const hasMapping = !!mappedUserIdentity;
      if (!hasFormalAssignee && !hasMapping) {
        await notify(`Cannot move to In Progress: No Assignee or Tag Mapping found!`, 'error');
        return false;
      }
      if (!c.startDate) c.startDate = today;
    } else if (status === 'done') {
      if (!c.startDate) c.startDate = today;
      if (!c.dueDate) c.dueDate = today;
    } else if (status === 'to-do') {
      c.startDate = undefined;
      c.dueDate = undefined;
    }
    c.taskStatus = status; // Visual Movement
  }
  
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

          const miroAssigneeId = card.type === 'card' ? (card as Card).assignee?.userId : null;
          let targetAssignee: string | undefined;

          if (isMe || miroAssigneeId === currentMiroUserId) {
            targetAssignee = myAccountId;
          } else if (mappedUserIdentity) {
            const USER_CACHE_KEY = `jira_cache_user_${mappedUserIdentity}`;
            let cachedUserId = cacheUtils.get<string>(USER_CACHE_KEY);
            if (cachedUserId) {
              targetAssignee = cachedUserId;
            } else {
              const foundUsers: any[] = await jiraWithRefresh(s => s.findUsers(mappedUserIdentity!)) || [];
              if (foundUsers && foundUsers.length > 0) {
                targetAssignee = foundUsers[0].accountId;
                cacheUtils.set(USER_CACHE_KEY, targetAssignee!, 3600);
              }
            }
          }

          const transition = transitions.find((t: any) => targetRegex.test(t.name));
          const jiraFields: any = { summary: (card.title || "").replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ') };
          
          if (card.type === 'card') {
            const c = card as Card;
            if (c.dueDate) jiraFields.duedate = c.dueDate.split('T')[0];
            if (c.startDate) {
              const fieldId = process.env.NEXT_PUBLIC_JIRA_START_DATE_FIELD || "customfield_10015";
              jiraFields[fieldId] = c.startDate.split('T')[0];
            }
          }
          if (targetAssignee) jiraFields.assignee = { accountId: targetAssignee };

          const cardData = card.type === 'card' ? (card as Card) : null;
          await jiraWithRefresh(s => s.updateIssue(metadata.key!, jiraFields.summary, cardData?.dueDate, cardData?.startDate, targetAssignee));
          jiraUpdated = true;

          if (transition) {
            await jiraWithRefresh(s => s.transitionIssue(metadata.key!, (transition as any).id));
            await notify(`Jira: ${metadata.key} -> ${(transition as any).name}`);
          } else {
            await notify(`Dates synced, but no '${status}' transition found`, 'info');
          }
       } catch (err: any) {
          console.error(`[JiraSync] [${metadata.key}] Sync Error:`, err.message);
          if (!err.message?.includes("401")) {
            await notify(`Jira Sync Failed: ${err.message}`, 'error');
          }
       }
    }
  }

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

const createStatusHandler = (status: 'to-do' | 'in-progress' | 'done', boardId: string | null, fallbackConfig: any) => async (props: { items: any[] }) => {
  let userInfo: any = null;
  try { userInfo = await miro.board.getUserInfo(); } catch(e) {}

  const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
  const savedConfig = localStorage.getItem(configKey);
  const hasJiraConfig = !!savedConfig;
  let jiraConfig = hasJiraConfig ? JSON.parse(savedConfig!) : null;
  let refreshPromise: Promise<any> | null = null;

  const withRefresh = hasJiraConfig ? async <T,>(fn: (service: JiraService) => Promise<T>): Promise<T> => {
    let service = new JiraService(jiraConfig);
    try { return await fn(service); } catch (e: any) {
      const is401 = e.message?.includes("401") || e.status === 401;
      if (is401 && jiraConfig.refreshToken) {
        if (!refreshPromise) {
          refreshPromise = (async () => {
            const refreshData = await service.refreshAccessToken();
            jiraConfig = { ...jiraConfig, accessToken: refreshData.access_token, refreshToken: refreshData.refresh_token || jiraConfig.refreshToken };
            localStorage.setItem(configKey, JSON.stringify(jiraConfig));
            return jiraConfig;
          })();
        }
        const updatedConfig = await refreshPromise;
        return await fn(new JiraService(updatedConfig));
      }
      throw e;
    }
  } : null;

  const freshConfig = await (miro.board as any).getAppData("globalConfig");
  const activeConfig = freshConfig || fallbackConfig;
  let ignoreRegex = "";
  let globalMapping = new Map<string, string>();
  let allBoardTags: any[] = [];

  try {
    const TAGS_CACHE_KEY = `miro_cache_tags_${boardId}`;
    const cachedTags = cacheUtils.get<any[]>(TAGS_CACHE_KEY);
    
    if (cachedTags) {
      allBoardTags = cachedTags;
    } else {
      allBoardTags = await miro.board.get({ type: 'tag' }).catch(() => []);
      cacheUtils.set(TAGS_CACHE_KEY, allBoardTags, 600); // Cache for 10 minutes
    }
    globalMapping = parseUserMapping(activeConfig?.tsUserMapping || "");
    const vars = activeConfig?.tsVariables || "";
    const tagLine = vars.split('\n').find((l: string) => l.trim().startsWith('tag='));
    if (tagLine) ignoreRegex = tagLine.split('=')[1]?.trim() || "";

    var myAccountId: string | undefined;
    if (withRefresh) {
      const myself = await withRefresh(s => s.getMyself()).catch(() => null);
      myAccountId = myself?.accountId;
    }
  } catch(e) {}

  const cards = props.items.filter(i => i.type === 'card' || i.type === 'app_card') as (Card | AppCard)[];
  await Promise.all(cards.map(item => 
    updateCardStatus(item, status, withRefresh, userInfo, myAccountId, globalMapping, ignoreRegex, allBoardTags)
  ));
};


// ==========================================
// 3. MAIN COMPONENT (LIFECYCLE ONLY)
// ==========================================

export default function InitContent() {
  const { boardId, config: gConfig } = useGlobalConfig();

  useEffect(() => {
    if (!boardId) return;

    // Handlers
    const handleIconClick = async () => { await miro.board.ui.openPanel({ url: getFullPath('panel') }); };
    const todoHandler = createStatusHandler('to-do', boardId, gConfig);
    const inprogressHandler = createStatusHandler('in-progress', boardId, gConfig);
    const doneHandler = createStatusHandler('done', boardId, gConfig);

    let unsubscribeRealtime: (() => void) | undefined;

    const initExtensions = async () => {
      // 1. Clean previous listeners
      try {
        miro.board.ui.off('icon:click', handleIconClick);
        miro.board.ui.off('custom:set-todo', todoHandler);
        miro.board.ui.off('custom:set-inprogress', inprogressHandler);
        miro.board.ui.off('custom:set-done', doneHandler);
      } catch (e) {}

      // 2. Register listeners
      miro.board.ui.on('icon:click', handleIconClick);
      miro.board.ui.on('custom:set-todo', todoHandler);
      miro.board.ui.on('custom:set-inprogress', inprogressHandler);
      miro.board.ui.on('custom:set-done', doneHandler);

      // 3. Register Custom Actions in UI
      const actions: CustomAction[] = [
        { event: "set-todo", ui: { label: "Set To Do", icon: "chat-two", description: "Set status to To Do", position: 1 }, predicate: { type: "card" } },
        { event: "set-inprogress", ui: { label: "Set In Progress", icon: "chat-dashes-lines-two", description: "Set status and stamp start date", position: 2 }, predicate: { type: "card" } },
        { event: "set-done", ui: { label: "Set Done", icon: "trophy", description: "Set status and stamp dates", position: 3 }, predicate: { type: "card" } }
      ];
      try {
        for (const action of actions) await miro.board.experimental.action.register(action);
      } catch (e) {}

      // 4. Initialize Realtime Voting Socket
      const realtime = RealtimeFactory.getInstance();
      realtime.connect(boardId);

      unsubscribeRealtime = realtime.onStateUpdate(async (state: VotingState) => {
        if (state.status === 'voting') {
          await miro.board.ui.openModal({ url: getFullPath(`/voting?cardId=${state.cardId}`), width: 450, height: 750 });
        }
      });
    };

    initExtensions();

    // Cleanup phase
    return () => {
      try {
        miro.board.ui.off('icon:click', handleIconClick);
        miro.board.ui.off('custom:set-todo', todoHandler);
        miro.board.ui.off('custom:set-inprogress', inprogressHandler);
        miro.board.ui.off('custom:set-done', doneHandler);
        
        if (miro.board.experimental?.action?.deregister) {
          miro.board.experimental.action.deregister('set-todo');
          miro.board.experimental.action.deregister('set-inprogress');
          miro.board.experimental.action.deregister('set-done');
        }

        if (unsubscribeRealtime) {
          unsubscribeRealtime();
        }
      } catch (e) {}
    };
  }, [boardId]); // Deliberately omit gConfig to prevent listener thrashing; config is fetched fresh inside handlers.

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
        <img src="/color-icon.svg" alt="Plus Sprint Tools" style={{ width: '120px', height: '120px' }} />
      </div>
      <div>
        <p style={{ fontSize: 'large' }}>Great, your app is running locally</p>
        <p>You can now create your Developer team to get your app running in Miro.</p>
      </div>
      <div>
        <a className="button button-primary" href="https://developers.miro.com/docs/create-a-developer-team" target="_blank">
          Create a Developer team
        </a>
      </div>
      <div>
        <p>To see your app, open it in an app panel on Miro.com, or preview it at <a href="/panel" className="link link-primary">this url</a></p>
      </div>
    </div>
  );
}
