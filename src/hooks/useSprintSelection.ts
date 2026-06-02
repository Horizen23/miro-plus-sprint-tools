import { useState, useEffect, useMemo } from "react";
import type { Card, AppCard, Item } from "@mirohq/websdk-types";
import { handleSetPointsOnItems, calculateSelectionSummary, type SelectionSummary } from "../services/miro/estimationUtils";
import { handleSelectAll, handleSelectInView } from "../services/miro/selectionUtils";
import {
  handleDuplicateAndLink,
  handleCreateRefinementFrame,
  handleRemoveLinks,
  handleReorderSelectedCards,
  handleSyncMetadataFromParent,
  handleClearMetadata,
} from "../services/miro/miroUtils";

export interface InspectedMetadata {
  title: string;
  data: unknown;
}

export interface UseSprintSelectionReturn {
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
  activeAction: string | null;
  estimateUnit: 'pt' | 'h';
  setEstimateUnit: (unit: 'pt' | 'h') => void;
  summary: SelectionSummary;
  selectedItems: (Card | AppCard)[];
  memoizedItems: (Card | AppCard)[];
  rawSelection: Item[];
  handleSetPoints: (points: string, itemsToUpdate?: (Card | AppCard)[]) => Promise<void>;
  handleAction: (actionName: string, fn: () => Promise<unknown>) => Promise<void>;
  handleInspectMetadata: () => Promise<void>;
  inspectedMetadata: InspectedMetadata[] | null;
  setInspectedMetadata: (data: InspectedMetadata[] | null) => void;
  handleSelectAll: () => Promise<void>;
  handleSelectInView: () => Promise<void>;
  handleDuplicateAndLink: () => Promise<void>;
  handleCreateRefinementFrame: () => Promise<void>;
  handleRemoveLinks: () => Promise<void>;
  handleReorderSelectedCards: () => Promise<void>;
  handleSyncMetadataFromParent: () => Promise<void>;
  handleClearMetadata: () => Promise<void>;
}

export function useSprintSelection(): UseSprintSelectionReturn {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [manualProcessing, setManualProcessing] = useState(false);
  const isProcessing = !!activeAction || manualProcessing;
  
  const [estimateUnit, setEstimateUnit] = useState<'pt' | 'h'>(
    (process.env.NEXT_PUBLIC_DEFAULT_ESTIMATE_UNIT as 'pt' | 'h') || 'pt'
  );
  
  const [rawSelection, setRawSelection] = useState<Item[]>([]);
  
  useEffect(() => {
    let unmounted = false;
    
    const fetchSelection = async () => {
      try {
        if (typeof miro === 'undefined') return;
        const items = await miro.board.getSelection();
        const filteredItems = items.filter(item => item.type === 'card' || item.type === 'app_card');
        if (!unmounted) {
          setRawSelection(prev => {
            const prevIds = prev.map(i => i.id).join(',');
            const newIds = filteredItems.map(i => i.id).join(',');
            return prevIds === newIds ? prev : filteredItems;
          });
        }
      } catch (e: unknown) {
        console.error("Failed to fetch selection", e);
      }
    };
    
    fetchSelection();
    
    let updateTimer: NodeJS.Timeout;
    const handleUpdate = async () => {
      clearTimeout(updateTimer);
      updateTimer = setTimeout(async () => {
        await fetchSelection();
      }, 200);
    };
    
    if (typeof miro !== 'undefined') {
      miro.board.ui.on('selection:update', handleUpdate);
    }
    return () => {
      unmounted = true;
      clearTimeout(updateTimer);
      if (typeof miro !== 'undefined') {
        miro.board.ui.off('selection:update', handleUpdate);
      }
    };
  }, []);
  
  const selectedItems = useMemo(() => {
    return rawSelection.filter((item: Item): item is Card | AppCard => item.type === 'card' || item.type === 'app_card');
  }, [rawSelection]);

  const summary = useMemo((): SelectionSummary => {
    return calculateSelectionSummary(selectedItems);
  }, [selectedItems]);

  const [memoizedItems, setMemoizedItems] = useState<(Card | AppCard)[]>([]);

  useEffect(() => {
    if (selectedItems.length > 0) {
      setMemoizedItems(selectedItems);
    }
  }, [selectedItems]);

  const handleAction = async (actionName: string, fn: () => Promise<unknown>) => {
    setActiveAction(actionName);
    try {
      await fn();
    } finally {
      setActiveAction(null);
    }
  };

  const handleSetPoints = async (points: string, itemsToUpdate?: (Card | AppCard)[]) => {
    let items = itemsToUpdate || selectedItems;
    if ((!items || items.length === 0) && memoizedItems.length > 0) {
      items = memoizedItems;
    }

    if (typeof miro === 'undefined') return;

    if (!items || items.length === 0) {
      await miro.board.notifications.showError("Please select at least one card");
      return;
    }

    setActiveAction('set-points');
    try {
      await handleSetPointsOnItems(items, points.endsWith('h') || estimateUnit === 'h' ? (points.endsWith('h') ? points : points + 'h') : points);
      await miro.board.notifications.showInfo(`Updated ${items.length} items`);
    } catch (e: unknown) {
      await miro.board.notifications.showError("Failed to update points");
    } finally {
      setActiveAction(null);
    }
  };

  const [inspectedMetadata, setInspectedMetadata] = useState<InspectedMetadata[] | null>(null);

  const handleInspectMetadata = async () => {
    if (selectedItems.length === 0) {
      if (typeof miro !== 'undefined') {
        await miro.board.notifications.showError("Please select at least one card to inspect metadata");
      }
      return;
    }
    
    setActiveAction('inspect');
    try {
      const results = await Promise.all(selectedItems.map(async (card) => {
        const metadata = await card.getMetadata();
        return { title: card.title || "Untitled", data: metadata };
      }));
      setInspectedMetadata(results as InspectedMetadata[]);
    } catch (e: unknown) {
      if (typeof miro !== 'undefined') {
        await miro.board.notifications.showError("Failed to fetch metadata");
      }
    } finally {
      setActiveAction(null);
    }
  };

  return {
    isProcessing,
    setIsProcessing: setManualProcessing,
    activeAction,
    estimateUnit,
    setEstimateUnit,
    summary,
    selectedItems,
    memoizedItems,
    rawSelection,
    handleSetPoints,
    handleAction,
    handleInspectMetadata,
    inspectedMetadata,
    setInspectedMetadata,
    handleSelectAll,
    handleSelectInView,
    handleDuplicateAndLink,
    handleCreateRefinementFrame,
    handleRemoveLinks,
    handleReorderSelectedCards,
    handleSyncMetadataFromParent,
    handleClearMetadata,
  };
}
