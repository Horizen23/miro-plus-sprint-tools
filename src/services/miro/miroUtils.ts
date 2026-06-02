import type { Card, Frame, AppCard, Item, Tag, StickyNote } from "@mirohq/websdk-types";
import { parseCardTitle, formatCardTitle, compareSequences } from './estimationUtils';
import { notify } from './uiUtils';
import { cacheUtils } from '../../utils/cacheUtils';

const MIRO_BOARD_URL = process.env.NEXT_PUBLIC_MIRO_BOARD_URL || "https://miro.com/app/board/";

interface ItemWithGlobal {
  item: Card | AppCard;
  globalX: number;
  globalY: number;
  parentFrame: Frame | null;
}

/**
 * Helper to get currently selected Cards or AppCards.
 */
async function getSelectedCards(): Promise<(Card | AppCard)[]> {
  if (typeof miro === 'undefined') return [];
  const selection = await miro.board.getSelection();
  return selection.filter((item): item is Card | AppCard => 
    item.type === "card" || item.type === "app_card"
  );
}

/**
 * Helper to calculate global coordinates for an item, taking frames into account.
 */
async function getGlobalCoords(item: Item): Promise<{ x: number, y: number, parentFrame: Frame | null }> {
  const itemX = (item as unknown as { x?: number }).x ?? 0;
  const itemY = (item as unknown as { y?: number }).y ?? 0;
  let gx = itemX;
  let gy = itemY;
  let pFrame: Frame | null = null;

  const parentId = (item as unknown as { parentId?: string }).parentId;
  if (parentId) {
    try {
      const parent = await miro.board.getById(parentId);
      if (parent && parent.type === "frame") {
        pFrame = parent as Frame;
        const pX = (pFrame as unknown as { x?: number }).x ?? 0;
        const pY = (pFrame as unknown as { y?: number }).y ?? 0;
        const pWidth = (pFrame as unknown as { width?: number }).width ?? 0;
        const pHeight = (pFrame as unknown as { height?: number }).height ?? 0;

        gx = pX - pWidth / 2 + itemX;
        gy = pY - pHeight / 2 + itemY;
      }
    } catch (e: unknown) {
      console.warn(`[miroUtils] Failed to get parent frame for ${item.id}`, e);
    }
  }
  return { x: gx, y: gy, parentFrame: pFrame };
}

export async function handleDuplicateAndLink(): Promise<void> {
  if (typeof miro === 'undefined') return;

  const selection = await miro.board.getSelection();
  const cards = selection.filter((item): item is Card | AppCard => 
    item.type === "card" || item.type === "app_card"
  );

  if (cards.length === 0) {
    await notify("Please select a card to duplicate.", "error");
    return;
  }

  const { id: boardId } = await miro.board.getInfo();
  
  const itemsWithCoords: ItemWithGlobal[] = [];
  let minLeftGlobalX = Infinity;
  let overallMaxRightX = -Infinity;

  for (const card of cards) {
    const cardWidth = (card as unknown as { width?: number }).width ?? 320;
    const { x: gx, y: gy, parentFrame: pFrame } = await getGlobalCoords(card);
    
    itemsWithCoords.push({ item: card, globalX: gx, globalY: gy, parentFrame: pFrame });

    const left = gx - cardWidth / 2;
    const right = gx + cardWidth / 2;

    if (left < minLeftGlobalX) minLeftGlobalX = left;
    if (right > overallMaxRightX) overallMaxRightX = right;
    
    if (pFrame) {
      const pX = (pFrame as unknown as { x?: number }).x ?? 0;
      const pWidth = (pFrame as unknown as { width?: number }).width ?? 0;
      const frameRight = pX + pWidth / 2;
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
        const c = originalCard as Card;
        newItem = await miro.board.createCard({
          title: c.title || "",
          description: c.description || "",
          style: c.style,
          x: targetX,
          y: targetY,
          width: (c as unknown as { width?: number }).width ?? 320,
          rotation: (c as unknown as { rotation?: number }).rotation ?? 0,
          dueDate: c.dueDate,
          startDate: c.startDate,
          assignee: c.assignee?.userId ? { userId: c.assignee.userId } : undefined,
          taskStatus: c.taskStatus,
          tagIds: c.tagIds || [],
        });
      } else {
        const ac = originalCard as AppCard;
        newItem = await miro.board.createAppCard({
          title: ac.title || "",
          description: ac.description || "",
          style: ac.style,
          x: targetX,
          y: targetY,
          width: (ac as unknown as { width?: number }).width ?? 320,
          rotation: (ac as unknown as { rotation?: number }).rotation ?? 0,
          status: ac.status || 'disconnected',
          fields: ac.fields || [],
          tagIds: ac.tagIds || [],
        });
      }
      
      // Delay briefly for SDK sync
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Copy Metadata
      const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
      try {
        const metadata = await originalCard.getMetadata(metadataKey);
        if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
          await newItem.setMetadata(metadataKey, metadata);
        }
      } catch (e: unknown) {
        console.warn("Failed to copy metadata:", e);
      }

      (newItem as unknown as { linkedTo?: string }).linkedTo = originalUrl;
      await newItem.sync();
      newItems.push(newItem);

      // Bidirectional link (with retry)
      const newUrl = `${MIRO_BOARD_URL}${boardId}/?moveToWidget=${newItem.id}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const freshItem = await miro.board.getById(originalCard.id);
          if (freshItem && (freshItem.type === "card" || freshItem.type === "app_card")) {
            const freshCard = freshItem as (Card | AppCard);
            if (!(freshCard as unknown as { linkedTo?: string }).linkedTo) {
              (freshCard as unknown as { linkedTo?: string }).linkedTo = newUrl;
              await freshCard.sync();
              break;
            }
          }
        } catch (e: unknown) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } catch (error: unknown) {
      console.error("Error duplicating item:", error);
    }
  }

  if (newItems.length > 0) {
    try {
      await miro.board.deselect({ id: selection.map(s => s.id) });
      await miro.board.select({ id: newItems.map(n => n.id) });
    } catch (e: unknown) {}
  }
}

/**
 * Removes all links (linkedTo) from selected cards.
 */
export async function handleRemoveLinks(): Promise<void> {
  const cards = await getSelectedCards();

  if (cards.length === 0) {
    await notify("Please select at least one card to remove links", "error");
    return;
  }

  let count = 0;
  for (const card of cards) {
    try {
      if (card.linkedTo) {
        card.linkedTo = undefined;
        await card.sync();
        count++;
      }
    } catch (e: unknown) {
      console.warn(`[miroUtils] Failed to remove link for ${card.id}`, e);
    }
  }

  await notify(`Removed links from ${count} card(s)`);
}

/**
 * Copies metadata from parent card (via linkedTo) to selected cards.
 */
export async function handleSyncMetadataFromParent(): Promise<void> {
  const cards = await getSelectedCards();

  if (cards.length === 0) {
    await notify("Please select at least one card to sync metadata", "error");
    return;
  }

  const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
  let count = 0;

  for (const card of cards) {
    const linkedTo = card.linkedTo;
    if (!linkedTo || typeof linkedTo !== 'string') continue;

    try {
      // Extract widget ID from Miro URL (?moveToWidget=...)
      const url = new URL(linkedTo);
      const parentId = url.searchParams.get('moveToWidget');

      if (parentId) {
        const parent = await miro.board.getById(parentId);
        if (parent && (parent.type === 'card' || parent.type === 'app_card')) {
          const metadata = await (parent as Card | AppCard).getMetadata(metadataKey);
          if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
            await card.setMetadata(metadataKey, metadata);
            count++;
          }
        }
      }
    } catch (e: unknown) {
      console.warn("Failed to sync metadata for card", card.id, e);
    }
  }

  if (count > 0) {
    await notify(`Synced metadata for ${count} card(s) from their parents.`);
  } else {
    await notify("No metadata found to sync from parents.", "error");
  }
}

/**
 * Removes sync metadata (defined by NEXT_PUBLIC_MIRO_METADATA_KEY) from selected cards.
 */
export async function handleClearMetadata(): Promise<void> {
  const cards = await getSelectedCards();

  if (cards.length === 0) {
    await notify("Please select at least one card to clear metadata", "error");
    return;
  }

  const metadataKey = process.env.NEXT_PUBLIC_MIRO_METADATA_KEY || "jira-sync";
  let count = 0;

  for (const card of cards) {
    try {
      await card.setMetadata(metadataKey, {});
      count++;
    } catch (e: unknown) {
      console.warn("Failed to clear metadata", card.id, e);
    }
  }

  if (count > 0) {
    await notify(`Cleared metadata ("${metadataKey}") for ${count} card(s).`);
  }
}

export async function handleCreateRefinementFrame(): Promise<void> {
  if (typeof miro === 'undefined') return;

  const selection = await miro.board.getSelection();
  const frames = selection.filter((item): item is Frame => item.type === 'frame');

  if (frames.length === 0) {
    await notify('Please select at least one Frame to refine.', 'error');
    return;
  }

  // Fetch global config for jiraPrefix
  let jiraPrefix = process.env.NEXT_PUBLIC_JIRA_PREFIX || 'FTDGENERIC';
  try {
    const board = miro.board as unknown as { getAppData: (key: string) => Promise<Record<string, string> | undefined> };
    const config = await board.getAppData('globalConfig');
    if (config?.['jiraPrefix']) jiraPrefix = config['jiraPrefix'];
  } catch (e: unknown) {}

  const margin = Number(process.env.NEXT_PUBLIC_MIRO_FRAME_MARGIN || 200);
  const newFrames: Frame[] = [];

  for (const sourceFrame of frames) {
    const sourceName = sourceFrame.title || 'Untitled Frame';
    const w = Math.max(sourceFrame.width ?? 0, 100);
    const h = Math.max(sourceFrame.height ?? 0, 100);
    const x = sourceFrame.x ?? 0;
    const y = sourceFrame.y ?? 0;

    const targetX = x + w + margin;
    const targetY = y;

    try {
      // 1. Create the new Refinement Frame
      const newFrame = await miro.board.createFrame({
        title: `Refinement: ${sourceName}`,
        x: targetX,
        y: targetY,
        width: w,
        height: h,
        style: {
          fillColor:
            process.env.NEXT_PUBLIC_REFINEMENT_FRAME_COLOR || '#fff2cc',
        },
      });

      // 2. Detect Jira Cards (app_cards and cards)
      let cardsInside: (Card | AppCard)[] = [];
      if (sourceFrame.childrenIds && sourceFrame.childrenIds.length > 0) {
        const children = await miro.board.get({
          id: sourceFrame.childrenIds,
        });

        cardsInside = children.filter(
          (item): item is Card | AppCard => item.type === 'app_card' || item.type === 'card'
        );
      }

      // Get all existing tags once using cacheUtils
      const TAGS_CACHE_KEY = 'miro_tags_cache';
      const TAGS_TTL = 3600; // 1 hour
      
      let allTags = cacheUtils.get<Tag[]>(TAGS_CACHE_KEY) || [];

      if (allTags.length === 0) {
        allTags = await miro.board.get({ type: 'tag' });
        cacheUtils.set(TAGS_CACHE_KEY, allTags, TAGS_TTL);
      }

      // 3. Get or Create Test-Frame Tag
      let testFrameTag = allTags.find((t) => t.title === 'Test-Frame');
      if (!testFrameTag) {
        try {
          testFrameTag = await miro.board.createTag({
            title: 'Test-Frame',
            color: 'red',
          });
          allTags.push(testFrameTag);
        } catch (e: unknown) {}
      }

      // Define the Simplified Workflow (TA for Test)
      const workflow = [
        { title: 'QA Checklist File', seq: 'TA1.00', estimate: '0h', track: 'T', color: '#f16d6d' },
        { title: 'Test Frame', seq: 'TA2.00', estimate: '0h', track: 'T', color: '#f16d6d' },
        { title: 'Excecute Checklist', seq: 'TA3.00', estimate: '0h', track: 'T', color: '#f16d6d' },
        { title: 'QA Review Test Checklist', seq: 'TA4.00', estimate: '0h', track: 'T', color: '#f16d6d' },
        { title: 'QA Test Frame Scenario Testcase', seq: 'TA5.00', estimate: '0h', track: 'T', color: '#f16d6d' },
      ];

      const trackB = workflow.filter((w) => w.track === 'T');

      // If no cards found, create a placeholder template
      const itemsToProcess: { title: string, x?: number, y?: number, fields?: unknown[] }[] =
        cardsInside.length > 0
          ? cardsInside
          : [
              {
                title: '[Template] New Item',
                x: 0,
                y: 0,
                fields: [],
              },
            ];

      let cardIndex = 0;
      for (const card of itemsToProcess) {
        // 4. Extract Issue Key from fields (Optional)
        const fields = (card as AppCard).fields || [];
        const jiraField = fields.find(
          (f) => f.tooltip === 'Issue type, Issue key'
        );
        let issueKey = jiraField?.value;
        let idPart = "";

        if (issueKey && jiraPrefix) {
          const keyOnly = issueKey.includes(',') ? issueKey.split(',').pop()?.trim() || issueKey : issueKey;
          idPart = keyOnly.includes('-') ? keyOnly.split('-').pop() || "" : keyOnly;
          issueKey = `${jiraPrefix}-${idPart}`;
        }

        let jiraTag: Tag | null = null;
        if (issueKey) {
          const tagName = `jira-${idPart || issueKey}`;
          jiraTag = allTags.find((t) => t.title === tagName) || null;
          if (!jiraTag) {
            try {
              jiraTag = await miro.board.createTag({
                title: tagName,
                color: 'black',
              });
              allTags.push(jiraTag);
            } catch (e: unknown) {
              console.error('Failed to create tag', tagName, e);
            }
          }
        }

        const frameCenterX = newFrame.x ?? 0;
        const frameCenterY = newFrame.y ?? 0;
        const startX = -( (newFrame.width ?? 0) / 2) + 180; // Offset from left edge
        const startY = -( (newFrame.height ?? 0) / 2) + 80;  // Offset from top edge
        const verticalGap = 150;

        // 5. Create the main card
        try {
          const { cleanTitle: clean } = parseCardTitle(card.title || "");

          const mainCard = await miro.board.createCard({
            title: formatCardTitle({ seq: 'A1.00', estimate: '0h', cleanTitle: clean }),
            style: { cardTheme: '#a6ccf5' },
            x: frameCenterX + startX,
            y: frameCenterY + startY + cardIndex * verticalGap,
            tagIds: jiraTag ? [jiraTag.id] : [],
          });
          await newFrame.add(mainCard);
          cardIndex++;

          // 6. Create Parallel Workflow Cards (Test Track)
          for (const w of trackB) {
            const redCardB = await miro.board.createCard({
              title: formatCardTitle({ seq: w.seq, estimate: w.estimate, cleanTitle: w.title }),
              style: { cardTheme: w.color as string },
              x: frameCenterX + startX,
              y: frameCenterY + startY + cardIndex * verticalGap,
              tagIds: [
                ...(jiraTag ? [jiraTag.id] : []),
                ...(testFrameTag ? [testFrameTag.id] : []),
              ],
            });
            await newFrame.add(redCardB);
            cardIndex++;
          }
          cardIndex += 0.5;
        } catch (e: unknown) {
          console.warn(`[miroUtils] Failed to create cards for item ${card.title}`, e);
        }
      }
      newFrames.push(newFrame);
    } catch (error: unknown) {
      console.error(
        'Error creating refinement frame for item:',
        sourceFrame.id,
        error
      );
    }
  }

  if (newFrames.length > 0) {
    await miro.board.viewport.zoomTo(newFrames);
  }
}

export async function handleCreateSticky(texts: string[], parentFrameId?: string): Promise<void> {
  if (typeof miro === 'undefined') return;

  let minX = 0, minY = 0, targetFrame: Frame | null = null;

  // 1. Resolve starting position and target frame
  if (parentFrameId) {
    try {
      const item = await miro.board.getById(parentFrameId);
      if (item && item.type === 'frame') {
        targetFrame = item as Frame;
        minX = (targetFrame.x ?? 0) - (targetFrame.width ?? 0) / 2;
        minY = (targetFrame.y ?? 0) - (targetFrame.height ?? 0) / 2;
      }
    } catch (e: unknown) {}
  }

  // Fallback to selection or viewport
  if (!targetFrame) {
    const selection = await miro.board.getSelection();
    if (selection.length > 0) {
      const first = selection[0];
      const firstX = (first as unknown as { x?: number }).x ?? 0;
      const firstY = (first as unknown as { y?: number }).y ?? 0;
      const firstParentId = (first as unknown as { parentId?: string }).parentId;

      minX = firstX;
      minY = firstY;
      // If the selected item has a parent frame, let's use that
      if (firstParentId) {
        try {
          const parent = await miro.board.getById(firstParentId);
          if (parent && parent.type === 'frame') {
            targetFrame = parent as Frame;
            minX = (targetFrame.x ?? 0) - (targetFrame.width ?? 0) / 2;
            minY = (targetFrame.y ?? 0) - (targetFrame.height ?? 0) / 2;
          }
        } catch (e: unknown) {}
      }
    } else {
      const viewport = await miro.board.viewport.get();
      minX = viewport.x;
      minY = viewport.y;
    }
  }

  const createdItems: StickyNote[] = [];
  const startX = targetFrame ? minX + 50 : minX;
  const startY = targetFrame ? minY + 50 : minY;

  for (let i = 0; i < texts.length; i++) {
    try {
      const sticky = await miro.board.createStickyNote({
        content: texts[i],
        x: startX + (i * 220),
        y: startY,
        style: {
          fillColor: 'black',
          textAlign: 'center',
          textAlignVertical: 'middle'
        }
      });
      
      createdItems.push(sticky);

      if (targetFrame) {
        await targetFrame.add(sticky);
      }
    } catch (e: unknown) {}
  }

  if (createdItems.length > 0) {
    await miro.board.viewport.zoomTo(createdItems);
  }
}

/**
 * Reorders selected cards vertically based on their sequence logic.
 */
export async function handleReorderSelectedCards(): Promise<void> {
  const cards = await getSelectedCards();
  
  if (cards.length === 0) {
    await notify("Please select at least one card to reorder", "error");
    return;
  }

  const sortedCards = [...cards].sort((a, b) => {
    const dataA = parseCardTitle(a.title || "");
    const dataB = parseCardTitle(b.title || "");
    return compareSequences(dataA.seq, dataB.seq);
  });

  let minLeft = Infinity;
  let minY = Infinity;
  
  cards.forEach(c => {
    const cardObj = c as unknown as { x?: number, y?: number, width?: number, height?: number };
    const w = cardObj.width ?? 0;
    const h = cardObj.height ?? 0;
    const left = (cardObj.x ?? 0) - w / 2;
    const top = (cardObj.y ?? 0) - h / 2;
    
    if (left < minLeft) minLeft = left;
    if (top < minY) minY = top;
  });

  if (minLeft === Infinity) minLeft = 0;
  if (minY === Infinity) minY = 0;

  let currentY = minY;
  const margin = 20;

  for (const card of sortedCards) {
    const cardObj = card as unknown as { x: number, y: number, width?: number, height?: number, sync: () => Promise<void> };
    const cardWidth = cardObj.width ?? 200;
    const cardHeight = cardObj.height ?? 120;
    
    cardObj.x = minLeft + (cardWidth / 2);
    cardObj.y = currentY + (cardHeight / 2);
    await cardObj.sync();
    
    currentY += cardHeight + margin;
  }

  await notify(`Reordered ${sortedCards.length} cards by sequence`);
}
