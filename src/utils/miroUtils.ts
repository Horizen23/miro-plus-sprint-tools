import type { Card, Frame, AppCard } from "@mirohq/websdk-types";

const MIRO_BOARD_URL = process.env.NEXT_PUBLIC_MIRO_BOARD_URL || "https://miro.com/app/board/";

export async function handleDuplicateAndLink() {
  const selection = await miro.board.getSelection();
  const cards = selection.filter(item => item.type === "card" || item.type === "app_card") as (Card | AppCard)[];

  if (cards.length === 0) {
    await miro.board.notifications.showError("Please select a card to duplicate.");
    return;
  }

  const { id: boardId } = await miro.board.getInfo();
  
  // 1. Calculate Global Coordinates and find the right-most boundary
  interface ItemWithGlobal {
    item: Card | AppCard;
    globalX: number;
    globalY: number;
    parentFrame: Frame | null;
  }

  const itemsWithCoords: ItemWithGlobal[] = [];
  let minLeftGlobalX = Infinity;
  let overallMaxRightX = -Infinity;

  for (const card of cards) {
    let gx = card.x;
    let gy = card.y;
    let pFrame: Frame | null = null;

    if (card.parentId) {
      try {
        const parent = await miro.board.getById(card.parentId);
        if (parent && parent.type === "frame") {
          pFrame = parent as Frame;
          gx = (pFrame.x - (pFrame.width || 0) / 2) + card.x;
          gy = (pFrame.y - (pFrame.height || 0) / 2) + card.y;
        }
      } catch (e) {}
    }
    
    itemsWithCoords.push({ item: card, globalX: gx, globalY: gy, parentFrame: pFrame });

    const left = gx - (card.width || 320) / 2;
    const right = gx + (card.width || 320) / 2;

    if (left < minLeftGlobalX) minLeftGlobalX = left;
    if (right > overallMaxRightX) overallMaxRightX = right;
    
    if (pFrame) {
      const frameRight = pFrame.x + (pFrame.width || 0) / 2;
      if (frameRight > overallMaxRightX) overallMaxRightX = frameRight;
    }
  }

  // Calculate the X offset to place new items outside the selection/frame
  const X_OFFSET_BASE = Number(process.env.NEXT_PUBLIC_MIRO_X_OFFSET || 100);
  const X_OFFSET = (overallMaxRightX - minLeftGlobalX) + X_OFFSET_BASE;
  const newItems: (Card | AppCard)[] = [];

  // Sort by Global Y to ensure consistent column ordering
  itemsWithCoords.sort((a, b) => a.globalY - b.globalY);

  // 2. Duplicate with type parity
  for (const data of itemsWithCoords) {
    const { item: originalCard, globalX, globalY } = data;
    const originalUrl = `${MIRO_BOARD_URL}${boardId}/?moveToWidget=${originalCard.id}`;

    try {
      const targetX = globalX + X_OFFSET;
      const targetY = globalY;

      let newItem: Card | AppCard;

      if (originalCard.type === 'card') {
        newItem = await miro.board.createCard({
          title: originalCard.title || "",
          description: originalCard.description || "",
          style: originalCard.style,
          x: targetX,
          y: targetY,
          width: originalCard.width || 320,
          rotation: originalCard.rotation,
          dueDate: originalCard.dueDate,
          startDate: originalCard.startDate,
          assignee: originalCard.assignee?.userId ? { userId: originalCard.assignee.userId } : undefined,
          taskStatus: originalCard.taskStatus,
          tagIds: originalCard.tagIds || [],
        });
      } else {
        newItem = await miro.board.createAppCard({
          title: originalCard.title || "",
          description: originalCard.description || "",
          style: originalCard.style,
          x: targetX,
          y: targetY,
          width: originalCard.width || 320,
          rotation: originalCard.rotation,
          status: originalCard.status || 'disconnected',
          fields: originalCard.fields || [],
          tagIds: originalCard.tagIds || [],
        });
      }
      
      // Delay briefly for SDK sync
      await new Promise((resolve) => setTimeout(resolve, 500));

      newItem.linkedTo = originalUrl;
      await newItem.sync();
      newItems.push(newItem);

      // Bidirectional link (with retry)
      const newUrl = `${MIRO_BOARD_URL}${boardId}/?moveToWidget=${newItem.id}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const freshItem = await miro.board.getById(originalCard.id);
          if (freshItem && (freshItem.type === "card" || freshItem.type === "app_card")) {
            const freshCard = freshItem as (Card | AppCard);
            if (!freshCard.linkedTo) {
              freshCard.linkedTo = newUrl;
              await freshCard.sync();
              break;
            }
          }
        } catch (e) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      console.error("Error duplicating item:", error);
    }
  }

  // Final Selection
  if (newItems.length > 0) {
    try {
      await miro.board.deselect({ id: selection.map(s => s.id) });
      await miro.board.select({ id: newItems.map(n => n.id) });
    } catch (e) {}
  }
}

export async function handleCreateRefinementFrame() {
  const selection = await miro.board.getSelection();
  const frames = selection.filter(item => item.type === 'frame');

  if (frames.length === 0) {
    await miro.board.notifications.showError("Please select at least one Frame to refine.");
    return;
  }

  const margin = Number(process.env.NEXT_PUBLIC_MIRO_FRAME_MARGIN || 200); // Distance to the right
  const newFrames: any[] = [];

  for (const item of frames) {
    const itemAny = item as any;
    let sourceName = itemAny.title || "Untitled Frame";

    // Get exact dimensions of the selected item (minimum 100 for Miro Frames)
    const w = Math.max(itemAny.width || 0, 100);
    const h = Math.max(itemAny.height || 0, 100);
    const x = itemAny.x || 0;
    const y = itemAny.y || 0;

    // Create frame exactly to the right with same height
    const targetX = x + w + margin;
    const targetY = y;

    try {
      const newFrame = await miro.board.createFrame({
        title: `Refinement: ${sourceName}`,
        x: targetX,
        y: targetY,
        width: w,
        height: h,
        style: {
          fillColor: process.env.NEXT_PUBLIC_REFINEMENT_FRAME_COLOR || '#fff2cc', // Soft Peach / Skin Tone
        }
      });
      newFrames.push(newFrame);
    } catch (error) {
      console.error("Error creating refinement frame for item:", item.id, error);
    }
  }

  if (newFrames.length > 0) {
    await miro.board.notifications.showInfo(`Created ${newFrames.length} refinement frame(s)!`);
    // Zoom to show all new frames
    await miro.board.viewport.zoomTo(newFrames);
  }
}

export async function handleCreateSticky(texts: string[]) {
  const selection = await miro.board.getSelection();
  if (selection.length === 0) return;

  let minX = Infinity, minY = Infinity;
  let foundFrame = false;

  // 1. Try to find a frame in the selection
  const frames = selection.filter(i => i.type === 'frame');
  if (frames.length > 0) {
    const f = frames[0] as any;
    minX = f.x - f.width / 2;
    minY = f.y - f.height / 2;
    foundFrame = true;
  }

  // 2. If no frame selected, check if items are inside a frame
  if (!foundFrame) {
    for (const item of selection) {
      if ((item as any).parentId) {
        try {
          const parent = await miro.board.getById((item as any).parentId);
          if (parent && parent.type === 'frame') {
            const f = parent as any;
            minX = f.x - f.width / 2;
            minY = f.y - f.height / 2;
            foundFrame = true;
            break;
          }
        } catch (e) {}
      }
    }
  }

  // 3. Fallback to selection bounds (always calculate these to get center)
  let maxX = -Infinity, maxY = -Infinity;
  for (const item of selection) {
    const itemAny = item as any;
    const w = itemAny.width || 0;
    const h = itemAny.height || 0;
    const left = itemAny.x - w / 2;
    const right = itemAny.x + w / 2;
    const top = itemAny.y - h / 2;
    const bottom = itemAny.y + h / 2;
    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    if (top < minY) minY = top;
    if (bottom > maxY) maxY = bottom;
  }

  const height = maxY - minY;
  const centerY = minY + height / 2;

  const createdItems = [];
  for (let i = 0; i < texts.length; i++) {
    try {
      const sticky = await (miro.board as any).createStickyNote({
        content: texts[i],
        x: minX - 220, // To the left of the frame
        y: centerY - 100 + (i * 210), // Centered vertically, stacked
        style: {
          fillColor: process.env.NEXT_PUBLIC_MIRO_STICKY_COLOR || 'black',
          textAlign: 'center',
          textAlignVertical: 'middle'
        }
      });
      createdItems.push(sticky);
    } catch (e) {
      console.error("Failed to create sticky", e);
    }
  }

  if (createdItems.length > 0) {
    // await miro.board.viewport.zoomTo(createdItems);
  }
}
