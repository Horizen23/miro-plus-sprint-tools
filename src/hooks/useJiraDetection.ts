import * as React from "react";
import { useGlobalConfig } from "../contexts/GlobalConfigContext";
import { parseUserMapping } from "../utils/mappingUtils";

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
  x: number;
  y: number;
}

const htmlToPlainText = (html?: string) => {
  if (!html) return "";
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>|<\/div>|<\/ul>|<\/ol>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n- ');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/\n-\s*(?=\n|$)/g, '');
  text = text.replace(/\n+/g, '\n');
  return text.trim();
};

export function useJiraDetection(selection: any[], appParentKey: string) {
  const { config: globalConfig } = useGlobalConfig();
  const [selectedCards, setSelectedCards] = React.useState<SelectedCard[]>([]);
  const [checkedIds, setCheckedIds] = React.useState<Set<string>>(new Set());

  const selectionIds = selection.map(item => item.id).join(',');

  const detectSelection = React.useCallback(async () => {
    try {
      const tags = await miro.board.get({ type: 'tag' });
      const items: SelectedCard[] = [];
      
      for (const item of selection) {
        if (item.type !== 'card' && item.type !== 'app_card') continue;
        
        const itemAny = item as any;
        const itemTags = tags.filter(t => itemAny.tagIds?.includes(t.id));
        const jiraTag = itemTags.find(t => t.title.toLowerCase().startsWith('jira-'));
        
        let detectedParentKey = undefined;
        if (jiraTag) {
          const tagValue = jiraTag.title.split('-').slice(1).join('-').toUpperCase();
          const prefix = globalConfig?.jiraPrefix || "FTDGENERIC";
          detectedParentKey = tagValue.includes('-') ? tagValue : `${prefix}-${tagValue}`;
        }
        
        let syncedInfo: any = null;
        if (itemAny.getMetadata) {
          const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
          syncedInfo = await itemAny.getMetadata(metadataKey);
        }

        let cleanDesc = itemAny.description || "";
        cleanDesc = cleanDesc.split('---<br><strong>Jira')[0].replace(/(<p[^>]*>|<br\s*\/?>|\s)*$/, '');

        items.push({
          id: item.id, type: item.type,
          title: (itemAny.title || "").replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '),
          description: htmlToPlainText(cleanDesc),
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
      setSelectedCards(items);
    } catch (e) {
      console.error("[useJiraDetection] Error:", e);
    }
  }, [selection, globalConfig?.jiraPrefix]);

  React.useEffect(() => {
    detectSelection();
  }, [selectionIds, detectSelection]);

  // Automatic Checkbox Logic
  React.useEffect(() => {
    setCheckedIds(prev => {
      const currentIds = new Set(selectedCards.map(c => c.id));
      const nextChecked = new Set<string>();
      let changed = false;

      prev.forEach(id => {
        if (currentIds.has(id)) nextChecked.add(id);
        else changed = true;
      });

      selectedCards.forEach(c => {
        const isCreateValid = !!(appParentKey || c.detectedParentKey);
        const isSynced = !!c.syncedKey;
        const hasChanged = isSynced && (c.title !== c.lastSyncedTitle || c.description !== c.lastSyncedDesc);

        if (((isCreateValid && !isSynced) || hasChanged) && !nextChecked.has(c.id)) {
          nextChecked.add(c.id);
          changed = true;
        }
      });

      return changed ? nextChecked : prev;
    });
  }, [selectedCards, appParentKey]);

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

  const validItemsCount = selectedCards.filter(c => !!(appParentKey || c.detectedParentKey) || !!c.syncedKey).length;

  return {
    selectedCards,
    checkedIds,
    setCheckedIds,
    detectSelection,
    toggleCheck,
    handleSelectAll,
    validItemsCount
  };
}
