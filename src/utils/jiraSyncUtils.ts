import { Card, AppCard } from '@mirohq/websdk-types';
import { JiraService } from './jiraService';
import { getCardMappedUser, getCardMappedUsers, isUserOwnerOfCard } from './mappingUtils';
import { cacheUtils } from './cacheUtils';

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
    const tags = await miro.board.get({ type: 'tag' });
    const itemTags = tags.filter(t => (item as any).tagIds?.includes(t.id)).map(t => t.title);
    
    const projectPrefix = process.env.NEXT_PUBLIC_JIRA_PROJECT_PREFIX || "";
    const keys: string[] = [];
    
    itemTags.forEach(tag => {
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
  } catch (e) {
    return [];
  }
}

/**
 * Resolves Jira Account IDs for a given Miro card based on mappings and assignees.
 */
export async function resolveJiraAssignees(
  card: Card | AppCard,
  jiraWithRefresh: <T>(fn: (s: JiraService) => Promise<T>) => Promise<T>,
  userInfo: any,
  myAccountId?: string,
  mapping?: Map<string, string>,
  ignoreRegex?: string,
  boardTags?: any[]
): Promise<string[]> {
  const tags = boardTags || await miro.board.get({ type: 'tag' });
  const cardTags = tags.filter(t => (card as any).tagIds?.includes(t.id)).map(t => t.title);
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
        const foundUsers: any[] = await jiraWithRefresh(s => s.findUsers(mu)) || [];
        if (foundUsers && foundUsers.length > 0) {
          const accountId = foundUsers[0].accountId;
          targetAssignees.push(accountId);
          cacheUtils.set(USER_CACHE_KEY, accountId, 3600);
        }
      } catch (e) {}
    }
  }

  if (targetAssignees.length === 0) {
    if (isMe || (miroAssigneeId && miroAssigneeId === currentMiroUserId)) {
      if (myAccountId) targetAssignees.push(myAccountId);
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
    userInfo: any;
    myAccountId?: string;
    mapping?: Map<string, string>;
    ignoreRegex?: string;
    boardTags?: any[];
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
    const syncedKeys = await detectJiraKeys(card);

    if (syncedKeys.length > 0) {
      try {
        const targetAssignees = await resolveJiraAssignees(
          card, jiraWithRefresh, context.userInfo, context.myAccountId, 
          context.mapping, context.ignoreRegex, context.boardTags
        );

        const jiraFields: any = { 
          summary: (card.title || "").replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ') 
        };
        
        if (card.type === 'card') {
          const c = card as Card;
          if (c.dueDate) jiraFields.duedate = c.dueDate.split('T')[0];
          if (c.startDate) {
            const fieldId = process.env.NEXT_PUBLIC_JIRA_START_DATE_FIELD || "customfield_10015";
            jiraFields[fieldId] = c.startDate.split('T')[0];
          }
        }

        let statusRegex = /none/;
        if (status === 'in-progress') statusRegex = new RegExp(process.env.NEXT_PUBLIC_JIRA_STATUS_IN_PROGRESS || "progress|doing|dev", "i");
        else if (status === 'done') statusRegex = new RegExp(process.env.NEXT_PUBLIC_JIRA_STATUS_DONE || "done|complete|resolved", "i");
        else if (status === 'to-do') statusRegex = new RegExp(process.env.NEXT_PUBLIC_JIRA_STATUS_TODO || "to[\\s\\-]*do|backlog|open|new|ready|todo", "i");

        for (let i = 0; i < syncedKeys.length; i++) {
          const key = syncedKeys[i];
          const assignee = targetAssignees[i] || targetAssignees[0];

          await jiraWithRefresh(s => s.updateIssue(key, jiraFields.summary, (card as any).dueDate, (card as any).startDate, assignee));
          jiraUpdated = true;

          const transitions = await jiraWithRefresh(s => s.getTransitions(key));
          const transition = transitions.find((t: any) => statusRegex.test(t.name));

          if (transition) {
            await jiraWithRefresh(s => s.transitionIssue(key, transition.id));
          }
        }
      } catch (err: any) {
        if (!err.message?.includes("401")) {
          return { success: false, jiraUpdated, message: `Jira Sync Error: ${err.message}` };
        }
      }
    }
  }

  try {
    await card.sync();
    return { success: true, jiraUpdated };
  } catch (syncErr: any) {
    return { 
      success: false, 
      jiraUpdated, 
      message: syncErr.message?.includes('Cannot move') ? "Miro limit: Please drag the card manually." : syncErr.message 
    };
  }
}
