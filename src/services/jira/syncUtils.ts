import type { Card, AppCard, Tag, UserInfo } from '@mirohq/websdk-types';
import { JiraService, JiraUser, JiraTransition } from './JiraService';
import { getCardMappedUsers, isUserOwnerOfCard } from './mappingUtils';
import { cacheUtils } from '../../utils/cacheUtils';

export interface SyncResult {
  success: boolean;
  jiraUpdated: boolean;
  message?: string;
}

/**
 * Detects Jira Issue Keys from a Miro item.
 * Prioritizes Metadata, then falls back to specifically formatted tags.
 */
export async function detectJiraKeys(item: Card | AppCard): Promise<string[]> {
  const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
  const metadata = await item.getMetadata(metadataKey) as { key?: string } | undefined;
  
  if (metadata?.key) {
    return metadata.key.split(',').map(k => k.trim()).filter(Boolean);
  }

  // Fallback: Look for tags starting with 'Jira-' or project prefix
  try {
    const TAGS_CACHE_KEY = 'miro_tags_cache';
    const TAGS_TTL = 3600; // 1 hour
    
    let allTags = cacheUtils.get<Tag[]>(TAGS_CACHE_KEY);
    
    if (!allTags) {
      if (typeof miro !== 'undefined') {
        allTags = await miro.board.get({ type: 'tag' });
        cacheUtils.set(TAGS_CACHE_KEY, allTags, TAGS_TTL);
      }
    }
    
    if (!allTags) return [];

    const itemTags = allTags
      .filter((t) => (item as unknown as { tagIds?: string[] }).tagIds?.includes(t.id))
      .map((t) => t.title);
    
    const projectPrefix = process.env.NEXT_PUBLIC_JIRA_PROJECT_PREFIX || "";
    const keys: string[] = [];
    
    itemTags.forEach((tag) => {
      if (!tag) return;
      // Format 1: Jira-KEY-123
      if (tag.toLowerCase().startsWith('jira-')) {
        keys.push(tag.substring(5).toUpperCase());
      } 
      // Format 2: KEY-123 (if project prefix matches)
      else if (projectPrefix && tag.toUpperCase().startsWith(`${projectPrefix}-`)) {
        keys.push(tag.toUpperCase());
      }
    });
    
    return keys;
  } catch (e: unknown) {
    console.error("[jiraSyncUtils] Failed to detect keys:", e);
    return [];
  }
}

/**
 * Resolves Jira Account IDs for a given Miro card based on mappings and assignees.
 */
export async function resolveJiraAssignees(
  card: Card | AppCard,
  jiraWithRefresh: <T>(fn: (s: JiraService) => Promise<T>) => Promise<T>,
  userInfo: UserInfo | null | undefined,
  myAccountId?: string,
  mapping?: Map<string, string>,
  ignoreRegex?: string,
  boardTags?: Tag[]
): Promise<string[]> {
  const tags = boardTags || (typeof miro !== 'undefined' ? await miro.board.get({ type: 'tag' }) : []);
  const cardTags = tags
    .filter(t => (card as unknown as { tagIds?: string[] }).tagIds?.includes(t.id))
    .map(t => t.title || "");
  
  const userMap = mapping || new Map<string, string>();
  
  const mappedUsers = getCardMappedUsers(cardTags, userMap, ignoreRegex);
  const isMe = isUserOwnerOfCard(cardTags, userMap, userInfo, ignoreRegex);
  const miroAssigneeId = card.type === 'card' ? (card as Card).assignee?.userId : null;
  const currentMiroUserId = userInfo?.id;

  const targetAssignees: string[] = [];

  for (const mu of mappedUsers) {
    const USER_CACHE_KEY = `jira_cache_user_${mu}`;
    let cachedUserId = cacheUtils.get<string>(USER_CACHE_KEY);
    if (cachedUserId) {
      targetAssignees.push(cachedUserId);
    } else {
      try {
        const foundUsers = await jiraWithRefresh(s => s.findUsers(mu)) as JiraUser[];
        if (foundUsers && foundUsers.length > 0 && foundUsers[0]?.accountId) {
          const accountId = foundUsers[0].accountId;
          targetAssignees.push(accountId);
          cacheUtils.set(USER_CACHE_KEY, accountId, 3600 * 24 * 7); // 7 days cache
        }
      } catch (e: unknown) {
        console.warn(`[jiraSyncUtils] Failed to resolve assignee "${mu}":`, e);
      }
    }
  }

  if (targetAssignees.length === 0) {
    if (isMe || (miroAssigneeId && miroAssigneeId === currentMiroUserId)) {
      if (myAccountId) {
        targetAssignees.push(myAccountId);
      }
    }
  }

  return targetAssignees;
}

/**
 * Core business logic to update a card's status in Miro and Jira.
 */
export async function syncCardStatus(
  card: Card | AppCard,
  status: 'to-do' | 'in-progress' | 'done',
  jiraWithRefresh: (<T>(fn: (s: JiraService) => Promise<T>) => Promise<T>) | null,
  context: {
    userInfo: UserInfo | null | undefined;
    myAccountId?: string;
    mapping?: Map<string, string>;
    ignoreRegex?: string;
    boardTags?: Tag[];
  }
): Promise<SyncResult> {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // 1. Miro Visual Update & Date Stamping
  if (card.type === 'card') {
    const c = card as Card;
    if (status === 'in-progress') {
      if (!c.startDate) c.startDate = today;
    } else if (status === 'done') {
      if (!c.startDate) c.startDate = today;
      if (!c.dueDate) c.dueDate = today;
    } else if (status === 'to-do') {
      c.startDate = undefined;
      c.dueDate = undefined;
    }
    c.taskStatus = status;
  }

  let jiraUpdated = false;
  
  // 2. Jira Sync
  if (jiraWithRefresh) {
    // For status sync, we should be very strict: Only sync if explicitly linked via metadata
    const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
    const metadata = await card.getMetadata(metadataKey) as { key?: string } | undefined;
    const syncedKeys = metadata?.key ? metadata.key.split(',').map(k => k.trim()).filter(Boolean) : [];
    
    if (syncedKeys.length > 0) {
      try {
        const targetAssignees = await resolveJiraAssignees(
          card, jiraWithRefresh, context.userInfo, context.myAccountId, 
          context.mapping, context.ignoreRegex, context.boardTags
        );

        const summary = (card.title || "").replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
        
        let dueDate: string | undefined;
        let startDate: string | undefined;

        if (card.type === 'card') {
          const c = card as Card;
          if (c.dueDate) dueDate = c.dueDate.split('T')[0];
          if (c.startDate) startDate = c.startDate.split('T')[0];
        }

        let statusRegex = /none/;
        if (status === 'in-progress') statusRegex = new RegExp(process.env.NEXT_PUBLIC_JIRA_STATUS_IN_PROGRESS || "progress|doing|dev", "i");
        else if (status === 'done') statusRegex = new RegExp(process.env.NEXT_PUBLIC_JIRA_STATUS_DONE || "done|complete|resolved", "i");
        else if (status === 'to-do') statusRegex = new RegExp(process.env.NEXT_PUBLIC_JIRA_STATUS_TODO || "to[\\s\\-]*do|backlog|open|new|ready|todo", "i");

        for (let i = 0; i < syncedKeys.length; i++) {
          const key = syncedKeys[i];
          if (!key) continue;
          
          const assignee = targetAssignees[i] || targetAssignees[0];

          await jiraWithRefresh(s => s.updateIssue(key, summary, dueDate, startDate, assignee));
          jiraUpdated = true;

          const transitions = await jiraWithRefresh(s => s.getTransitions(key)) as JiraTransition[];
          const transition = transitions.find((t) => t.name && statusRegex.test(t.name));

          if (transition) {
            await jiraWithRefresh(s => s.transitionIssue(key, transition.id));
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("401")) {
          return { success: false, jiraUpdated, message: `Jira Sync Error: ${message}` };
        }
      }
    }
  }

  try {
    await card.sync();
    return { success: true, jiraUpdated };
  } catch (syncErr: unknown) {
    const message = syncErr instanceof Error ? syncErr.message : String(syncErr);
    return { 
      success: false, 
      jiraUpdated, 
      message: message.includes('Cannot move') ? "Miro limit: Please drag the card manually." : message 
    };
  }
}
