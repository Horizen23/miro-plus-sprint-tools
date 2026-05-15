'use client';

import React, { useEffect } from 'react';
import { Card, AppCard, CustomAction } from '@mirohq/websdk-types';
import { RealtimeFactory } from '@/services/realtime/factory';
import { VotingState } from '@/services/realtime/types';
import { JiraService } from '@/utils/jiraService';
import { parseUserMapping, getCardMappedUser, getCardMappedUsers, isUserOwnerOfCard } from '@/utils/mappingUtils';
import { cacheUtils } from '@/utils/cacheUtils';
import { useGlobalConfig } from '@/contexts/GlobalConfigContext';

// ==========================================
// 1. UTILITY FUNCTIONS
// ==========================================

import { notify } from '@/utils/uiUtils';

const getFullPath = (path: string) => {
  const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${cleanPath}`;
};

// ==========================================
// 2. JIRA SYNC BUSINESS LOGIC
// ==========================================

import { syncCardStatus } from '@/utils/jiraSyncUtils';

// ==========================================
// 2. JIRA SYNC HANDLERS
// ==========================================

import { executeWithRefresh } from '@/hooks/useJira';

// ==========================================
// 2. JIRA SYNC HANDLERS
// ==========================================

const createStatusHandler = (status: 'to-do' | 'in-progress' | 'done', boardId: string | null, fallbackConfig: any) => async (props: { items?: any[] }) => {
  let userInfo: any = null;
  try { userInfo = await miro.board.getUserInfo(); } catch(e) {}

  const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
  const hasJiraConfig = !!localStorage.getItem(configKey);

  const freshConfig = await (miro.board as any).getAppData("globalConfig");
  const activeConfig = freshConfig || fallbackConfig;
  let ignoreRegex = "";
  let globalMapping = new Map<string, string>();
  let allBoardTags: any[] = [];

  try {
    const TAGS_CACHE_KEY = 'miro_tags_cache';
    const TAGS_CACHE_TIME = 24 * 3600 * 1000;
    let cachedTags = (window as any)[TAGS_CACHE_KEY]?.data;
    if (!cachedTags || Date.now() - ((window as any)[TAGS_CACHE_KEY]?.timestamp || 0) > TAGS_CACHE_TIME) {
      cachedTags = await miro.board.get({ type: 'tag' }).catch(() => []);
      (window as any)[TAGS_CACHE_KEY] = { data: cachedTags, timestamp: Date.now() };
    }
    allBoardTags = cachedTags!;
    globalMapping = parseUserMapping(activeConfig?.tsUserMapping || "");
    const vars = activeConfig?.tsVariables || "";
    const tagLine = vars.split('\n').find((l: string) => l.trim().startsWith('tag='));
    if (tagLine) ignoreRegex = tagLine.split('=')[1]?.trim() || "";
  } catch(e) {}

  let myAccountId: string | undefined;
  if (hasJiraConfig) {
    try {
      const myself = await executeWithRefresh(s => s.getMyself());
      myAccountId = myself?.accountId;
    } catch (e) {}
  }

  // Use props items or fallback to selection
  let rawItems = props?.items || [];
  if (rawItems.length === 0) {
    rawItems = await miro.board.getSelection();
  }

  const cards = rawItems.filter((i: any) => i.type === 'card' || i.type === 'app_card') as (Card | AppCard)[];
  
  if (cards.length === 0) {
    await notify("Please select at least one card", "error");
    return;
  }

  for (const item of cards) {
    try {
      const result = await syncCardStatus(item, status, hasJiraConfig ? executeWithRefresh : null, {
        userInfo,
        myAccountId,
        mapping: globalMapping,
        ignoreRegex,
        boardTags: allBoardTags
      });

      if (!result.success && result.message) {
        await notify(result.message, 'error');
      } else {
        const msg = result.jiraUpdated 
          ? `Jira & Miro: Status updated to ${status}` 
          : `Miro: Status updated to ${status}`;
        await notify(msg);
      }
    } catch (err: any) {
      await notify(`System Error: ${err.message}`, 'error');
    }
  }
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
      if (boardId) {
        realtime.connect(boardId);
        unsubscribeRealtime = realtime.onStateUpdate(async (state: VotingState) => {
          if (state.status === 'voting') {
            await miro.board.ui.openModal({ url: getFullPath(`/voting?cardId=${state.cardId}`), width: 450, height: 750 });
          }
        });
      }
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
