import * as React from "react";
import type { Card, AppCard, Item, Tag } from "@mirohq/websdk-types";
import { useGlobalConfig } from "../contexts/GlobalConfigContext";
import { calculateSelectionSummary } from "../services/miro/estimationUtils";
import { cacheUtils } from "../utils/cacheUtils";

export interface SelectedCard {
  id: string;
  type: string;
  title: string;
  description: string;
  startDate?: string;
  dueDate?: string;
  assigneeId?: string;
  detectedParentKey?: string;
  syncedKey?: string;
  lastSyncedTitle?: string;
  lastSyncedDesc?: string;
  actualHours: number;
  actualPoints: number;
  fields?: unknown[];
  x: number;
  y: number;
}

// Pre-compile Regex for plain text conversion to improve O(N) performance
const RE_BR = /<br\s*\/?>/gi;
const RE_BLOCK_END = /<\/p>|<\/div>|<\/ul>|<\/ol>/gi;
const RE_LI = /<li[^>]*>/gi;
const RE_NBSP_G = /&nbsp;/g;
const RE_TAGS = /<[^>]*>/g;
const RE_EMPTY_LI = /\n-\s*(?=\n|$)/g;
const RE_MULTI_NEWLINE = /\n+/g;

const htmlToPlainText = (html?: string): string => {
  if (!html) return "";
  let text = html;
  text = text.replace(RE_BR, '\n');
  text = text.replace(RE_BLOCK_END, '\n');
  text = text.replace(RE_LI, '\n- ');
  text = text.replace(RE_NBSP_G, ' ');
  text = text.replace(RE_TAGS, '');
  text = text.replace(RE_EMPTY_LI, '');
  text = text.replace(RE_MULTI_NEWLINE, '\n');
  return text.trim();
};

export interface UseJiraDetectionReturn {
  selectedCards: SelectedCard[];
  checkedIds: Set<string>;
  setCheckedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  detectSelection: () => Promise<void>;
  toggleCheck: (cardId: string) => void;
  handleSelectAll: () => void;
  validItemsCount: number;
  clearCache: () => void;
}

export function useJiraDetection(selection: Item[], appParentKey: string): UseJiraDetectionReturn {
  const { config: globalConfig } = useGlobalConfig();
  const [selectedCards, setSelectedCards] = React.useState<SelectedCard[]>([]);
  const [checkedIds, setCheckedIds] = React.useState<Set<string>>(new Set());
  
  const lastSelectedIds = React.useRef<Set<string>>(new Set());

  const clearCache = React.useCallback(() => {
    lastSelectedIds.current = new Set();
  }, []);

  const normalize = (text?: string): string => {
    if (!text) return "";
    const jiraStampRegex = /---(?:\s|<[^>]+>)*Jira/i;
    const clean = text.split(jiraStampRegex)[0] || "";
    return clean
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ') 
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const selectionIds = React.useMemo(() => 
    selection.map(item => item.id).join(',')
  , [selection]);

  const detectSelection = React.useCallback(async () => {
    try {
      if (typeof miro === 'undefined') return;

      const CACHE_KEY = 'miro_tags_cache';
      const CACHE_TIME = 3600;
      
      let allTags = cacheUtils.get<Tag[]>(CACHE_KEY);

      if (!allTags) {
        allTags = await miro.board.get({ type: 'tag' });
        cacheUtils.set(CACHE_KEY, allTags, CACHE_TIME);
      }

      if (!allTags) return;

      const tagMap = new Map(allTags.map((t) => [t.id, t.title]));
      const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";

      const metadataResults = await Promise.all(
        selection.map(item => (item as Card | AppCard).getMetadata ? (item as Card | AppCard).getMetadata(metadataKey) : null)
      );

      const items: SelectedCard[] = [];
      
      for (let i = 0; i < selection.length; i++) {
        const item = selection[i];
        if (item.type !== 'card' && item.type !== 'app_card') continue;
        
        const card = item as Card | AppCard;
        const syncedInfo = metadataResults[i] as { key?: string, lastTitle?: string, lastDesc?: string } | null;
        
        const tagIds = (card as unknown as { tagIds?: string[] }).tagIds || [];
        const cardTagTitles = tagIds
          .map((id) => tagMap.get(id))
          .filter((title): title is string => !!title);

        const jiraTagTitle = cardTagTitles.find(title => title.toLowerCase().startsWith('jira-'));
        
        let detectedParentKey: string | undefined = undefined;
        if (jiraTagTitle) {
          const tagValue = jiraTagTitle.split('-').slice(1).join('-').toUpperCase();
          const prefix = globalConfig?.jiraPrefix || "FTDGENERIC";
          detectedParentKey = tagValue.includes('-') ? tagValue : `${prefix}-${tagValue}`;
        }

        let cleanDescRaw = card.description || "";
        const jiraStampRegex = /---(?:\s|<[^>]+>)*Jira/i;
        cleanDescRaw = cleanDescRaw.split(jiraStampRegex)[0] || "";
        cleanDescRaw = cleanDescRaw.replace(/(<p[^>]*>|<br\s*\/?>|\s)*$/, '');

        const cleanDesc = htmlToPlainText(cleanDescRaw);
        const cardSummary = calculateSelectionSummary([card]);

        const cardX = (card as unknown as { x: number }).x ?? 0;
        const cardY = (card as unknown as { y: number }).y ?? 0;

        items.push({
          id: item.id, type: item.type,
          title: card.title || "",
          description: cleanDesc,
          actualHours: cardSummary.actualHours,
          actualPoints: cardSummary.points,
          fields: (card as AppCard).fields,
          startDate: (card as Card).startDate,
          dueDate: (card as Card).dueDate,
          assigneeId: (card as Card).assignee?.userId,
          detectedParentKey,
          syncedKey: syncedInfo?.key,
          lastSyncedTitle: syncedInfo?.lastTitle,
          lastSyncedDesc: syncedInfo?.lastDesc,
          x: cardX, y: cardY
        });
      }

      setCheckedIds(prev => {
        const next = new Set(prev);
        items.forEach(item => {
          if (!lastSelectedIds.current.has(item.id)) {
            const isCreateValid = !!(appParentKey || item.detectedParentKey);
            const isSynced = !!item.syncedKey;
            const hasChanged = isSynced && (
              normalize(item.title) !== normalize(item.lastSyncedTitle) || 
              normalize(item.description) !== normalize(item.lastSyncedDesc)
            );

            if ((isCreateValid && !isSynced) || hasChanged) {
              next.add(item.id);
            }
          }
        });
        
        const currentIds = new Set(items.map(i => i.id));
        const finalNext = new Set<string>();
        next.forEach(id => {
          if (currentIds.has(id)) finalNext.add(id);
        });

        lastSelectedIds.current = currentIds;
        return finalNext;
      });

      setSelectedCards(items);
    } catch (e: unknown) {
      console.error("[useJiraDetection] Error:", e);
    }
  }, [selection, globalConfig?.jiraPrefix, appParentKey]);

  React.useEffect(() => {
    detectSelection();
  }, [selectionIds, detectSelection]);

  const toggleCheck = React.useCallback((cardId: string) => {
    const card = selectedCards.find(c => c.id === cardId);
    if (!card) return;
    
    const isCreateValid = !!(appParentKey || card.detectedParentKey);
    const isSynced = !!card.syncedKey;
    if (!isCreateValid && !isSynced) return;

    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, [selectedCards, appParentKey]);

  const handleSelectAll = React.useCallback(() => {
    const validIds = selectedCards
      .filter(c => !!(appParentKey || c.detectedParentKey) || !!c.syncedKey)
      .map(c => c.id);
    
    if (checkedIds.size >= validIds.length && validIds.length > 0) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(validIds));
    }
  }, [selectedCards, checkedIds, appParentKey]);

  const validItemsCount = React.useMemo(() => 
    selectedCards.filter(c => !!(appParentKey || c.detectedParentKey) || !!c.syncedKey).length,
  [selectedCards, appParentKey]);

  return React.useMemo(() => ({
    selectedCards,
    checkedIds,
    setCheckedIds,
    detectSelection,
    toggleCheck,
    handleSelectAll,
    validItemsCount,
    clearCache
  }), [selectedCards, checkedIds, detectSelection, toggleCheck, handleSelectAll, validItemsCount, clearCache]);
}
