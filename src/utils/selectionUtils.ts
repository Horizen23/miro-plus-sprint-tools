export const handleSelectAll = async () => {
  const cards = await miro.board.get({ type: 'card' });
  const appCards = await miro.board.get({ type: 'app_card' });
  const all = [...cards, ...appCards];
  await miro.board.select({ id: all.map(i => i.id) });
};

export const handleSelectInView = async () => {
  try {
    const viewport = await miro.board.viewport.get();
    
    // Fetch all items to build coordinate map
    const allItems = await miro.board.get();
    const cards = allItems.filter(i => i.type === 'card' || i.type === 'app_card');
    const allMap = new Map(allItems.map(i => [i.id, i]));
    const absPositions = new Map<string, {x: number, y: number}>();

    const getAbsolutePos = (item: any): {x: number, y: number} => {
      if (absPositions.has(item.id)) return absPositions.get(item.id)!;
      let pos = { x: item.x || 0, y: item.y || 0 };
      if (item.parentId) {
        const parent = allMap.get(item.parentId);
        // In Miro V2, both FRAMES and GROUPS use relative coordinates for children
        if (parent && (parent.type === 'frame' || parent.type === 'group')) {
          const parentPos = getAbsolutePos(parent);
          pos.x += (parentPos.x || 0);
          pos.y += (parentPos.y || 0);
        }
      }
      absPositions.set(item.id, pos);
      return pos;
    };

    const inView = cards.filter(card => {
      const pos = getAbsolutePos(card);
      const w = (card as any).width || 100; // Default width if missing
      const h = (card as any).height || 100;
      
      // Card bounding box (using absolute coordinates)
      const cardLeft = pos.x - w / 2;
      const cardRight = pos.x + w / 2;
      const cardTop = pos.y - h / 2;
      const cardBottom = pos.y + h / 2;

      // Viewport bounding box (assuming center-based as it's the most likely given previous 'almost good' result)
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
  } catch (e) {
    console.error(e);
  }
};
