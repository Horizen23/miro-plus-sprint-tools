import type { Card, Frame, AppCard } from "@mirohq/websdk-types";
import { parseCardTitle, formatCardTitle } from './estimationUtils';

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
  const frames = selection.filter((item) => item.type === 'frame') as Frame[];

  if (frames.length === 0) {
    await miro.board.notifications.showError(
      'Please select at least one Frame to refine.'
    );
    return;
  }

  const margin = Number(process.env.NEXT_PUBLIC_MIRO_FRAME_MARGIN || 200);
  const newFrames: Frame[] = [];

  for (const sourceFrame of frames) {
    const sourceName = sourceFrame.title || 'Untitled Frame';
    const w = Math.max(sourceFrame.width || 0, 100);
    const h = Math.max(sourceFrame.height || 0, 100);
    const x = sourceFrame.x || 0;
    const y = sourceFrame.y || 0;

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
      let cardsInside: any[] = [];
      if (sourceFrame.childrenIds && sourceFrame.childrenIds.length > 0) {
        const children = await miro.board.get({
          id: sourceFrame.childrenIds,
        });

        cardsInside = children.filter(
          (item) => item.type === 'app_card' || item.type === 'card'
        );
      }

      // Get all existing tags once
      const allTags = await miro.board.get({ type: 'tag' });

      // 3. Get or Create Test-Frame Tag
      let testFrameTag = allTags.find((t: any) => t.title === 'Test-Frame');
      if (!testFrameTag) {
        try {
          testFrameTag = await miro.board.createTag({
            title: 'Test-Frame',
            color: 'red',
          });
          allTags.push(testFrameTag as any);
        } catch (e) {
          console.error('Failed to create Test-Frame tag', e);
        }
      }

      // Define the Simplified Workflow (TA for Test)
      const workflow = [
        // Track T: Test (Single TA Group)
        { title: 'QA Review Test Checklist', seq: 'TA1.00', estimate: '0h', track: 'T', color: '#f16d6d' },
        { title: 'Test Frame', seq: 'TA2.00', estimate: '0h', track: 'T', color: '#f16d6d' },
        { title: 'Excecute Checklist', seq: 'TA3.00', estimate: '0h', track: 'T', color: '#f16d6d' },
        { title: 'QA Test Frame Scenario Testcase', seq: 'TA4.00', estimate: '0h', track: 'T', color: '#f16d6d' },
      ];

      const trackA: any[] = []; // Dev track now handled by the main card
      const trackB = workflow.filter((w) => w.track === 'T');

      // If no cards found, create a placeholder template
      const itemsToProcess =
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
      for (const card of itemsToProcess as any) {
        // 4. Extract Issue Key from fields (Optional)
        const jiraField = card.fields?.find(
          (f: any) => f.tooltip === 'Issue type, Issue key'
        );
        const issueKey = jiraField?.value;

        let jiraTag = null;
        if (issueKey) {
          const tagName = `jira-${issueKey}`;
          jiraTag = allTags.find((t: any) => t.title === tagName);
          if (!jiraTag) {
            try {
              jiraTag = await miro.board.createTag({
                title: tagName,
                color: 'black',
              });
              allTags.push(jiraTag as any);
            } catch (e) {
              console.error('Failed to create tag', tagName, e);
            }
          }
        }

        const frameCenterX = newFrame.x || 0;
        const frameCenterY = newFrame.y || 0;
        const startX = -(newFrame.width / 2) + 180; // Offset from left edge
        const startY = -(newFrame.height / 2) + 80;  // Offset from top edge
        const verticalGap = 150;
        const columnWidth = 350; // Distance between Dev and Test columns

        // 5. Create the main card (Dev Default - Aligned Left)
        try {
          // Clean existing patterns and format using central logic
          const { cleanTitle: clean } = parseCardTitle(card.title);

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
          const maxTrackLen = Math.max(trackA.length, trackB.length);
          for (let i = 0; i < maxTrackLen; i++) {
            if (trackB[i]) {
              const w = trackB[i];
              const redCardB = await miro.board.createCard({
                title: formatCardTitle({ seq: w.seq, estimate: w.estimate, cleanTitle: w.title }),
                style: { cardTheme: w.color },
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
          }
          cardIndex += 0.5;
        } catch (e) {
          console.error('Failed to create refinement cards', e);
        }
      }

      newFrames.push(newFrame);
    } catch (error) {
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

export async function handleCreateSticky(texts: string[], parentFrameId?: string) {
  let minX = 0, minY = 0, targetFrame: any = null;

  // 1. Resolve starting position and target frame
  if (parentFrameId) {
    try {
      targetFrame = await miro.board.getById(parentFrameId);
      if (targetFrame && targetFrame.type === 'frame') {
        minX = targetFrame.x - targetFrame.width / 2;
        minY = targetFrame.y - targetFrame.height / 2;
      }
    } catch (e) {
      console.warn("Failed to get parent frame", e);
    }
  }

  // Fallback to selection or viewport if no parent frame provided or found
  if (!targetFrame) {
    const selection = await miro.board.getSelection();
    if (selection.length > 0) {
      const first = selection[0] as any;
      minX = first.x;
      minY = first.y;
      // If the selected item has a parent frame, let's use that
      if (first.parentId) {
        try {
          const parent = await miro.board.getById(first.parentId);
          if (parent && parent.type === 'frame') {
            targetFrame = parent;
            minX = targetFrame.x - targetFrame.width / 2;
            minY = targetFrame.y - targetFrame.height / 2;
          }
        } catch (e) {}
      }
    } else {
      const viewport = await miro.board.viewport.get();
      minX = viewport.x;
      minY = viewport.y;
    }
  }

  const createdItems = [];
  const startX = targetFrame ? minX + 50 : minX;
  const startY = targetFrame ? minY + 50 : minY;

  for (let i = 0; i < texts.length; i++) {
    try {
      const sticky = await miro.board.createStickyNote({
        content: texts[i],
        x: startX + (i * 220),
        y: startY,
        style: {
          fillColor: (process.env.NEXT_PUBLIC_MIRO_STICKY_COLOR as any) || 'black',
          textAlign: 'center',
          textAlignVertical: 'middle'
        }
      });
      
      createdItems.push(sticky);

      if (targetFrame && targetFrame.add) {
        await targetFrame.add(sticky);
      }
    } catch (e) {
      console.error("Failed to create sticky", e);
    }
  }

  if (createdItems.length > 0) {
    await miro.board.viewport.zoomTo(createdItems);
  }
}
