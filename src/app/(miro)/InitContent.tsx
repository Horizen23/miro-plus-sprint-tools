'use client';

import React, { useEffect } from 'react';
import type { Card, AppCard, CustomAction, Tag, UserInfo, Item } from '@mirohq/websdk-types';
import { RealtimeFactory } from '@/services/realtime/factory';
import { VotingState } from '@/services/realtime/types';
import { parseUserMapping } from '@/services/jira/mappingUtils';
import { useGlobalConfig, GlobalConfig } from '@/contexts/GlobalConfigContext';
import { notify } from '@/services/miro/uiUtils';
import { syncCardStatus } from '@/services/jira/syncUtils';
import { executeWithRefresh } from '@/hooks/useJira';
import { cacheUtils } from '@/utils/cacheUtils';

// ==========================================
// 1. UTILITY FUNCTIONS
// ==========================================

const getFullPath = (path: string): string => {
  const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${cleanPath}`;
};

// ==========================================
// 2. JIRA SYNC HANDLERS
// ==========================================

const createStatusHandler = (
  status: 'to-do' | 'in-progress' | 'done', 
  _boardId: string | null, 
  fallbackConfig: GlobalConfig
) => async (props?: { items?: Item[] }): Promise<void> => {
  if (typeof miro === 'undefined') return;

  let userInfo: UserInfo | null = null;
  try { 
    userInfo = await miro.board.getUserInfo(); 
  } catch(e: unknown) {
    console.warn("[InitContent] Failed to get user info:", e);
  }

  const configKey = process.env.NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY || "jira-config-v2";
  const hasJiraConfig = !!localStorage.getItem(configKey);

  const freshConfig = await (miro.board as unknown as { getAppData: (key: string) => Promise<GlobalConfig | undefined> }).getAppData("globalConfig");
  const activeConfig = freshConfig || fallbackConfig;
  
  let ignoreRegex = "";
  let globalMapping = new Map<string, string>();
  let allBoardTags: Tag[] = [];

  try {
    const TAGS_CACHE_KEY = 'miro_tags_cache';
    const TAGS_TTL = 3600;
    
    allBoardTags = cacheUtils.get<Tag[]>(TAGS_CACHE_KEY) || [];

    if (allBoardTags.length === 0) {
      allBoardTags = await miro.board.get({ type: 'tag' }).catch(() => [] as Tag[]);
      cacheUtils.set(TAGS_CACHE_KEY, allBoardTags, TAGS_TTL);
    }
    
    globalMapping = parseUserMapping(activeConfig?.tsUserMapping || "");
    const vars = activeConfig?.tsVariables || "";
    const tagLine = vars.split('\n').find((l: string) => l.trim().startsWith('tag='));
    if (tagLine) ignoreRegex = tagLine.split('=')[1]?.trim() || "";
  } catch(e: unknown) {}

  let myAccountId: string | undefined;
  if (hasJiraConfig) {
    try {
      const myself = await executeWithRefresh(s => s.getMyself());
      myAccountId = myself?.accountId;
    } catch (e: unknown) {}
  }

  // Use props items or fallback to selection
  let rawItems: Item[] = props?.items || [];
  if (rawItems.length === 0) {
    rawItems = await miro.board.getSelection();
  }

  const cards = rawItems.filter((i: Item): i is Card | AppCard => i.type === 'card' || i.type === 'app_card');
  
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await notify(`System Error: ${message}`, 'error');
    }
  }
};


// ==========================================
// 3. MAIN COMPONENT (LIFECYCLE ONLY)
// ==========================================

export default function InitContent() {
  const { boardId, config: gConfig } = useGlobalConfig();

  useEffect(() => {
    if (!boardId || typeof miro === 'undefined') return;

    // Handlers
    const handleIconClick = async () => { 
      await miro.board.ui.openPanel({ url: getFullPath('panel') }); 
    };
    
    const todoHandler = createStatusHandler('to-do', boardId, gConfig);
    const inprogressHandler = createStatusHandler('in-progress', boardId, gConfig);
    const doneHandler = createStatusHandler('done', boardId, gConfig);

    let unsubscribeRealtime: (() => void) | undefined;

    const initExtensions = async () => {
      if (typeof miro === 'undefined') return;

      // 1. Clean previous listeners
      try {
        miro.board.ui.off('icon:click', handleIconClick);
        miro.board.ui.off('custom:set-todo', todoHandler as unknown as (e: unknown) => void);
        miro.board.ui.off('custom:set-inprogress', inprogressHandler as unknown as (e: unknown) => void);
        miro.board.ui.off('custom:set-done', doneHandler as unknown as (e: unknown) => void);
      } catch (e: unknown) {}

      // 2. Register listeners
      miro.board.ui.on('icon:click', handleIconClick);
      miro.board.ui.on('custom:set-todo', todoHandler as unknown as (e: unknown) => void);
      miro.board.ui.on('custom:set-inprogress', inprogressHandler as unknown as (e: unknown) => void);
      miro.board.ui.on('custom:set-done', doneHandler as unknown as (e: unknown) => void);

      // 3. Register Custom Actions in UI
      const actions: CustomAction[] = [
        { event: "set-todo", ui: { label: "Set To Do", icon: "chat-two", description: "Set status to To Do", position: 1 }, predicate: { type: "card" } },
        { event: "set-inprogress", ui: { label: "Set In Progress", icon: "chat-dashes-lines-two", description: "Set status and stamp start date", position: 2 }, predicate: { type: "card" } },
        { event: "set-done", ui: { label: "Set Done", icon: "trophy", description: "Set status and stamp dates", position: 3 }, predicate: { type: "card" } }
      ];
      try {
        const experimental = miro.board as unknown as { 
          experimental: { 
            action: { register: (a: CustomAction) => Promise<void>, deregister: (e: string) => Promise<void> } 
          } 
        };
        if (experimental.experimental?.action?.register) {
          for (const action of actions) {
            await experimental.experimental.action.register(action);
          }
        }
      } catch (e: unknown) {}

      // 4. Initialize Realtime Voting Socket
      const realtime = RealtimeFactory.getInstance();
      if (boardId) {
        realtime.connect(boardId);
        unsubscribeRealtime = realtime.onStateUpdate(async (state: VotingState) => {
          if (state.status === 'voting') {
            await miro.board.ui.openModal({ 
              url: getFullPath(`/voting?cardId=${state.cardId}`), 
              width: 450, 
              height: 750 
            });
          }
        });
      }
    };

    initExtensions();

    // Cleanup phase
    return () => {
      if (typeof miro === 'undefined') return;
      try {
        miro.board.ui.off('icon:click', handleIconClick);
        miro.board.ui.off('custom:set-todo', todoHandler as unknown as (e: unknown) => void);
        miro.board.ui.off('custom:set-inprogress', inprogressHandler as unknown as (e: unknown) => void);
        miro.board.ui.off('custom:set-done', doneHandler as unknown as (e: unknown) => void);
        
        const experimental = miro.board as unknown as { 
          experimental: { 
            action: { deregister: (e: string) => Promise<void> } 
          } 
        };
        if (experimental.experimental?.action?.deregister) {
          experimental.experimental.action.deregister('set-todo');
          experimental.experimental.action.deregister('set-inprogress');
          experimental.experimental.action.deregister('set-done');
        }

        if (unsubscribeRealtime) {
          unsubscribeRealtime();
        }
      } catch (e: unknown) {}
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
