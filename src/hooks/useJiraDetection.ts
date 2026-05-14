import * as React from "react";
import { useGlobalConfig } from "../contexts/GlobalConfigContext";
import { parseUserMapping } from "../utils/mappingUtils";
import { parseCardTitle, calculateSelectionSummary } from "../utils/estimationUtils";

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
  fields?: any[];
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

const htmlToPlainText = (html?: string) => {
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

export function useJiraDetection(selection: any[], appParentKey: string) {
  const { config: globalConfig } = useGlobalConfig();
  const [selectedCards, setSelectedCards] = React.useState<SelectedCard[]>([]);
  const [checkedIds, setCheckedIds] = React.useState<Set<string>>(new Set());
  
  // Computational Cache to store results of expensive string operations
  const parseCache = React.useRef<Record<string, { title: string, desc: string, parsed: any }>>({});
  const lastSelectedIds = React.useRef<Set<string>>(new Set());

  const clearCache = React.useCallback(() => {
    parseCache.current = {};
    lastSelectedIds.current = new Set();
  }, []);

  const normalize = (text?: string) => {
    if (!text) return "";
    const jiraStampRegex = /---(?:\s|<[^>]+>)*Jira/i;
    let clean = text.split(jiraStampRegex)[0];
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
      // 1. Get Tags with a simple 5-second cache to avoid redundant SDK calls
      const CACHE_KEY = 'miro_tags_cache';
      const CACHE_TIME = 24 * 3600 * 1000; // 1 day in ms
      let tags = (window as any)[CACHE_KEY]?.data;
      const lastFetch = (window as any)[CACHE_KEY]?.timestamp || 0;

      if (!tags || Date.now() - lastFetch > CACHE_TIME) {
        tags = await miro.board.get({ type: 'tag' });
        (window as any)[CACHE_KEY] = { data: tags, timestamp: Date.now() };
      }

      const tagMap = new Map(tags.map((t: any) => [t.id, t.title]));
      const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";

      // Optimization: Fetch all metadata in parallel before the loop
      const metadataResults = await Promise.all(
        selection.map(item => (item as any).getMetadata ? (item as any).getMetadata(metadataKey) : null)
      );

      const items: SelectedCard[] = [];
      
      for (let i = 0; i < selection.length; i++) {
        const item = selection[i];
        if (item.type !== 'card' && item.type !== 'app_card') continue;
        
        const itemAny = item as any;
        const syncedInfo = metadataResults[i];
        
        const cardTagTitles = (itemAny.tagIds || [])
          .map((id: string) => tagMap.get(id))
          .filter(Boolean) as string[];
        const jiraTagTitle = cardTagTitles.find(title => title.toLowerCase().startsWith('jira-'));
        
        let detectedParentKey = undefined;
        if (jiraTagTitle) {
          const tagValue = jiraTagTitle.split('-').slice(1).join('-').toUpperCase();
          const prefix = globalConfig?.jiraPrefix || "FTDGENERIC";
          detectedParentKey = tagValue.includes('-') ? tagValue : `${prefix}-${tagValue}`;
        }

        let cleanDescRaw = itemAny.description || "";
        // Much safer regex: Look for --- followed by any tags/spaces and then Jira
        const jiraStampRegex = /---(?:\s|<[^>]+>)*Jira/i;
        cleanDescRaw = cleanDescRaw.split(jiraStampRegex)[0].replace(/(<p[^>]*>|<br\s*\/?>|\s)*$/, '');

        // 6. Calculate Estimate using central logic during detection
        const cleanDesc = htmlToPlainText(cleanDescRaw);
        const cardSummary = calculateSelectionSummary([itemAny]);

        items.push({
          id: item.id, type: item.type,
          title: itemAny.title || "",
          description: cleanDesc,
          actualHours: cardSummary.actualHours,
          actualPoints: cardSummary.points,
          fields: itemAny.fields,
          startDate: itemAny.startDate,
          dueDate: itemAny.dueDate,
          assigneeId: itemAny.assignee?.userId,
          detectedParentKey,
          syncedKey: syncedInfo?.key,
          lastSyncedTitle: syncedInfo?.lastTitle,
          lastSyncedDesc: syncedInfo?.lastDesc,
          x: itemAny.x, y: itemAny.y
        });
      }
      // Smart Auto-check logic: only for NEWLY added items that are valid/changed
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
        
        // Clean up: remove IDs that are no longer in the selection
        const currentIds = new Set(items.map(i => i.id));
        const finalNext = new Set<string>();
        next.forEach(id => {
          if (currentIds.has(id)) finalNext.add(id);
        });

        lastSelectedIds.current = currentIds;
        return finalNext;
      });

      setSelectedCards(items);
    } catch (e) {
      console.error("[useJiraDetection] Error:", e);
    }
  }, [selection, globalConfig?.jiraPrefix, appParentKey]);

  React.useEffect(() => {
    detectSelection();
  }, [selectionIds, detectSelection]);

  const toggleCheck = (cardId: string) => {
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
  };

  const handleSelectAll = () => {
    const validIds = selectedCards
      .filter(c => !!(appParentKey || c.detectedParentKey) || !!c.syncedKey)
      .map(c => c.id);
    
    if (checkedIds.size >= validIds.length && validIds.length > 0) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(validIds));
    }
  };

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
