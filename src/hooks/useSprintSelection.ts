import { useState, useEffect, useMemo } from "react";
import type { Card, AppCard, Item } from "@mirohq/websdk-types";
import { handleSetPointsOnItems, calculateSelectionSummary } from "../utils/estimationUtils";

export function useSprintSelection() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [estimateUnit, setEstimateUnit] = useState<'pt' | 'h'>(
    (process.env.NEXT_PUBLIC_DEFAULT_ESTIMATE_UNIT as 'pt' | 'h') || 'pt'
  );
  
  // 1. Get raw selection using a stable custom implementation instead of the buggy @mirohq hook
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
      }, 200); // 200ms debounce
    };
    
    miro.board.ui.on('selection:update', handleUpdate);
    return () => {
      unmounted = true;
      clearTimeout(updateTimer);
      miro.board.ui.off('selection:update', handleUpdate);
    };
  }, []);
  
  const rawSelectionIds = rawSelection.map((item: Item) => item.id).join(',');

  // 2. Filter the selection reactively
  const selectedItems = useMemo(() => {
    return rawSelection.filter((item: Item) => item.type === 'card' || item.type === 'app_card') as (Card | AppCard)[];
  }, [rawSelectionIds]);

  const selectedItemsIds = selectedItems.map(item => item.id).join(',');

  // 3. Compute the summary reactively based on selected items
  const summary = useMemo(() => {
    return calculateSelectionSummary(selectedItems);
  }, [selectedItemsIds]);

  // 4. Track memoized items for when selection is lost
  const [memoizedItems, setMemoizedItems] = useState<(Card | AppCard)[]>([]);

  useEffect(() => {
    if (selectedItems.length > 0) {
      setMemoizedItems(selectedItems);
    }
  }, [selectedItemsIds]);

  const updateSummary = async () => {
    // This function is kept for backward compatibility, but state is now reactive!
    // However, if manual refresh is needed, we can just rely on the reactivity.
    // If you need to force re-calculate, it's already done by useMemo.
  };

  const handleSetPoints = async (points: string, itemsToUpdate?: (Card | AppCard)[]) => {
    let items = itemsToUpdate;
    
    if (!items) {
      items = selectedItems;
    }

    // Fallback to memoized items if selection is empty
    if ((!items || items.length === 0) && memoizedItems.length > 0) {
      items = memoizedItems;
    }

    if (!items || items.length === 0) {
      await miro.board.notifications.showError("Please select at least one card");
      return;
    }

    setIsProcessing(true);
    try {
      await handleSetPointsOnItems(items, points.endsWith('h') || estimateUnit === 'h' ? (points.endsWith('h') ? points : points + 'h') : points);
      await miro.board.notifications.showInfo(`Updated ${items.length} items`);
    } catch (e) {
      await miro.board.notifications.showError("Failed to update points");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAction = async (fn: () => Promise<void>) => {
    setIsProcessing(true);
    try {
      await fn();
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    isProcessing,
    setIsProcessing,
    estimateUnit,
    setEstimateUnit,
    summary,
    selectedItems,
    memoizedItems,
    rawSelection,
    updateSummary, // kept so other components don't break
    handleSetPoints,
    handleAction
  };
}

