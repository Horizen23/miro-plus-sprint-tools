import { useState, useEffect, useMemo } from "react";
import type { Card, AppCard, Item } from "@mirohq/websdk-types";
import { handleSetPointsOnItems, calculateSelectionSummary } from "../utils/estimationUtils";

export function useSprintSelection() {
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
        const items = await miro.board.getSelection();
        const filteredItems = items.filter(item => item.type === 'card' || item.type === 'app_card');
        if (!unmounted) {
          setRawSelection(prev => {
            const prevIds = prev.map(i => i.id).join(',');
            const newIds = filteredItems.map(i => i.id).join(',');
            return prevIds === newIds ? prev : filteredItems;
          });
        }
      } catch (e) {
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
    
    miro.board.ui.on('selection:update', handleUpdate);
    return () => {
      unmounted = true;
      clearTimeout(updateTimer);
      miro.board.ui.off('selection:update', handleUpdate);
    };
  }, []);
  
  const selectedItems = useMemo(() => {
    return rawSelection.filter((item: Item) => item.type === 'card' || item.type === 'app_card') as (Card | AppCard)[];
  }, [rawSelection]);

  const summary = useMemo(() => {
    return calculateSelectionSummary(selectedItems);
  }, [selectedItems]);

  const [memoizedItems, setMemoizedItems] = useState<(Card | AppCard)[]>([]);

  useEffect(() => {
    if (selectedItems.length > 0) {
      setMemoizedItems(selectedItems);
    }
  }, [selectedItems]);

  const handleAction = async (actionName: string, fn: () => Promise<any>) => {
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

    if (!items || items.length === 0) {
      await miro.board.notifications.showError("Please select at least one card");
      return;
    }

    setActiveAction('set-points');
    try {
      await handleSetPointsOnItems(items, points.endsWith('h') || estimateUnit === 'h' ? (points.endsWith('h') ? points : points + 'h') : points);
      await miro.board.notifications.showInfo(`Updated ${items.length} items`);
    } catch (e) {
      await miro.board.notifications.showError("Failed to update points");
    } finally {
      setActiveAction(null);
    }
  };

  const [inspectedMetadata, setInspectedMetadata] = useState<{title: string, data: any}[] | null>(null);

  const handleInspectMetadata = async () => {
    if (selectedItems.length === 0) {
      await miro.board.notifications.showError("Please select at least one card to inspect metadata");
      return;
    }
    
    setActiveAction('inspect');
    try {
      const results = await Promise.all(selectedItems.map(async (card) => {
        const metadata = await card.getMetadata();
        return { title: card.title || "Untitled", data: metadata };
      }));
      setInspectedMetadata(results);
    } catch (e) {
      await miro.board.notifications.showError("Failed to fetch metadata");
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
    setInspectedMetadata
  };
}
