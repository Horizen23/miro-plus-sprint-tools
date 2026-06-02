import type { Card, AppCard, Item } from "@mirohq/websdk-types";

export const handleSelectAll = async (): Promise<void> => {
  if (typeof miro === 'undefined') return;
  
  const cards = await miro.board.get({ type: 'card' });
  const appCards = await miro.board.get({ type: 'app_card' });
  const all = [...cards, ...appCards];
  await miro.board.select({ id: all.map(i => i.id) });
};

interface Position {
  x: number;
  y: number;
}

export const handleSelectInView = async (): Promise<void> => {
  if (typeof miro === 'undefined') return;

  try {
    const viewport = await miro.board.viewport.get();
    
    // Fetch all items to build coordinate map
    const allItems = await miro.board.get();
    const selectableItems = allItems.filter((i): i is Card | AppCard => i.type === 'card' || i.type === 'app_card');
    const allMap = new Map<string, Item>(allItems.map(i => [i.id, i]));
    const absPositions = new Map<string, Position>();

    const getAbsolutePos = (item: Item): Position => {
      const cached = absPositions.get(item.id);
      if (cached) return cached;

      const pos: Position = { 
        x: (item as unknown as Record<string, number>).x ?? 0, 
        y: (item as unknown as Record<string, number>).y ?? 0 
      };

      if ((item as unknown as { parentId?: string }).parentId) {
        const parentId = (item as unknown as { parentId: string }).parentId;
        const parent = allMap.get(parentId);
        // In Miro V2, both FRAMES and GROUPS use relative coordinates for children
        if (parent && (parent.type === 'frame' || parent.type === 'group')) {
          const parentPos = getAbsolutePos(parent);
          pos.x += parentPos.x;
          pos.y += parentPos.y;
        }
      }
      absPositions.set(item.id, pos);
      return pos;
    };

    const inView = selectableItems.filter(card => {
      const pos = getAbsolutePos(card);
      const w = (card as unknown as Record<string, number>).width ?? 100; // Default width if missing
      const h = (card as unknown as Record<string, number>).height ?? 100;
      
      // Card bounding box (using absolute coordinates)
      const cardLeft = pos.x - w / 2;
      const cardRight = pos.x + w / 2;
      const cardTop = pos.y - h / 2;
      const cardBottom = pos.y + h / 2;

      // Viewport bounding box (assuming center-based)
      const vLeft = viewport.x - viewport.width / 2;
      const vRight = viewport.x + viewport.width / 2;
      const vTop = viewport.y - viewport.height / 2;
      const vBottom = viewport.y + viewport.height / 2;

      // Simple AABB intersection check
      const intersects = cardLeft < vRight && cardRight > vLeft && 
                         cardTop < vBottom && cardBottom > vTop;

      return intersects;
    });

    if (inView.length > 0) {
      await miro.board.select({ id: inView.map(i => i.id) });
      await miro.board.notifications.showInfo(`Selected ${inView.length} items in view`);
    } else {
      await miro.board.notifications.showInfo("No cards found in current view area");
    }
  } catch (e: unknown) {
    console.error("[selectionUtils] Failed to select in view:", e);
  }
};
