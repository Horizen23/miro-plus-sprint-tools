import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  handleRemoveLinks, 
  handleClearMetadata, 
  handleReorderSelectedCards,
  handleDuplicateAndLink,
  handleSyncMetadataFromParent,
  handleCreateRefinementFrame,
  handleCreateSticky,
  captureItemPosition,
  restoreItemPosition,
} from './miroUtils';

describe('miroUtils', () => {
  beforeEach(() => {
    vi.stubGlobal('miro', {
      board: {
        getSelection: vi.fn().mockResolvedValue([]),
        getById: vi.fn(),
        getInfo: vi.fn().mockResolvedValue({ id: 'board123' }),
        deselect: vi.fn(),
        select: vi.fn(),
        createCard: vi.fn().mockImplementation(async () => ({
          id: 'backup-card',
          type: 'card',
          setMetadata: vi.fn().mockResolvedValue(undefined),
          sync: vi.fn().mockResolvedValue(undefined),
        })),
        createAppCard: vi.fn().mockImplementation(async () => ({
          id: 'backup-app-card',
          type: 'app_card',
          setMetadata: vi.fn().mockResolvedValue(undefined),
          sync: vi.fn().mockResolvedValue(undefined),
        })),
        createFrame: vi.fn(),
        createStickyNote: vi.fn().mockResolvedValue({
          id: 'backup-sticky',
          type: 'sticky_note',
          setMetadata: vi.fn().mockResolvedValue(undefined),
        }),
        createShape: vi.fn().mockResolvedValue({
          id: 'backup-shape',
          type: 'shape',
          setMetadata: vi.fn().mockResolvedValue(undefined),
        }),
        createText: vi.fn().mockResolvedValue({
          id: 'backup-text',
          type: 'text',
          setMetadata: vi.fn().mockResolvedValue(undefined),
        }),
        createImage: vi.fn().mockResolvedValue({
          id: 'backup-image',
          type: 'image',
          setMetadata: vi.fn().mockResolvedValue(undefined),
        }),
        createPreview: vi.fn().mockResolvedValue({
          id: 'backup-preview',
          type: 'preview',
          setMetadata: vi.fn().mockResolvedValue(undefined),
        }),
        createTag: vi.fn().mockResolvedValue({
          id: 'tag-test-frame',
          type: 'tag',
          title: 'Test-Frame',
        }),
        get: vi.fn(),
        notifications: {
          showInfo: vi.fn(),
          showError: vi.fn(),
        },
        viewport: {
          get: vi.fn(),
          zoomTo: vi.fn(),
        }
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('item position snapshots', () => {
    it('captures and restores canvas coordinates including zero using a fresh item', async () => {
      const staleItem = { id: 'c1', x: 0, y: 0, relativeTo: 'canvas_center', sync: vi.fn() };
      const latestItem = { id: 'c1', x: 99, y: 88, relativeTo: 'canvas_center', sync: vi.fn().mockResolvedValue(undefined) };
      const snapshot = captureItemPosition(staleItem);
      vi.mocked(miro.board.getById).mockResolvedValue(latestItem as any);

      await restoreItemPosition(snapshot);

      expect(snapshot).toEqual({ id: 'c1', x: 0, y: 0, parentId: null, relativeTo: 'canvas_center' });
      expect(latestItem).toMatchObject({ x: 0, y: 0, relativeTo: 'canvas_center' });
      expect(latestItem.sync).toHaveBeenCalledOnce();
      expect(staleItem.sync).not.toHaveBeenCalled();
    });

    it('restores local frame coordinates and preserves parent-relative positioning', async () => {
      const snapshot = captureItemPosition({ id: 'c1', x: 12, y: 34, parentId: 'frame-1' });
      const latestItem = { id: 'c1', x: 500, y: 600, parentId: 'frame-1', sync: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(miro.board.getById).mockResolvedValue(latestItem as any);

      await restoreItemPosition(snapshot);

      expect(snapshot.relativeTo).toBe('parent_top_left');
      expect(latestItem).toMatchObject({ x: 12, y: 34, relativeTo: 'parent_top_left' });
    });

    it('rejects invalid coordinates and refuses to restore across coordinate spaces', async () => {
      expect(() => captureItemPosition({ id: 'bad', x: Number.NaN, y: 0 })).toThrow('invalid coordinates');
      const latestItem = { id: 'c1', x: 1, y: 2, parentId: 'frame-2', sync: vi.fn() };
      vi.mocked(miro.board.getById).mockResolvedValue(latestItem as any);

      await expect(restoreItemPosition({
        id: 'c1', x: 10, y: 20, parentId: 'frame-1', relativeTo: 'parent_top_left'
      })).rejects.toThrow('parent changed');
      expect(latestItem).toMatchObject({ x: 1, y: 2 });
      expect(latestItem.sync).not.toHaveBeenCalled();
    });
  });

  describe('handleDuplicateAndLink', () => {
    it('should duplicate selected cards and link them', async () => {
      const mockCard = {
        id: 'c1',
        type: 'card',
        title: 'Original Card',
        x: 0,
        y: 0,
        width: 320,
        height: 100,
        getMetadata: vi.fn().mockResolvedValue({}),
        sync: vi.fn().mockResolvedValue(undefined),
      };
      
      const mockNewCard = {
        id: 'c2',
        type: 'card',
        sync: vi.fn().mockResolvedValue(undefined),
        setMetadata: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([mockCard as any]);
      vi.mocked(miro.board.createCard).mockResolvedValue(mockNewCard as any);
      vi.mocked(miro.board.getById).mockResolvedValue(mockCard as any);

      await handleDuplicateAndLink();

      expect(miro.board.createCard).toHaveBeenCalled();
      expect(mockNewCard.sync).toHaveBeenCalled();
      expect(mockCard.sync).toHaveBeenCalled();
      expect(miro.board.select).toHaveBeenCalled();
    });

    it('should show error if no cards selected', async () => {
      vi.mocked(miro.board.getSelection).mockResolvedValue([]);
      await handleDuplicateAndLink();
      expect(miro.board.notifications.showError).toHaveBeenCalledWith(expect.stringContaining('select a card'));
    });

    it('should duplicate framed cards using global coordinates without moving the original card', async () => {
      const mockFrame = {
        id: 'frame-1',
        type: 'frame',
        x: 1000,
        y: 800,
        width: 600,
        height: 400,
      };
      const mockCard = {
        id: 'c1',
        type: 'card',
        parentId: 'frame-1',
        title: 'Original Card',
        x: 120,
        y: 80,
        width: 320,
        height: 100,
        getMetadata: vi.fn().mockResolvedValue({}),
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const mockNewCard = {
        id: 'c2',
        type: 'card',
        sync: vi.fn().mockResolvedValue(undefined),
        setMetadata: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([mockCard as any]);
      vi.mocked(miro.board.getById).mockImplementation(async (id: string) => {
        if (id === 'frame-1') return mockFrame as any;
        if (id === 'c1') return mockCard as any;
        return null;
      });
      vi.mocked(miro.board.createCard).mockResolvedValue(mockNewCard as any);

      await handleDuplicateAndLink();

      expect(miro.board.createCard).toHaveBeenCalledWith(expect.objectContaining({
        x: 1560,
        y: 680,
      }));
      expect(mockCard.x).toBe(120);
      expect(mockCard.y).toBe(80);
      expect(mockCard.sync).toHaveBeenCalled();
    });

    it('should scale large duplicated card width to match Miro card auto-height ratio', async () => {
      const mockCard = {
        id: 'wide-card',
        type: 'card',
        title: 'Very Wide Card',
        x: 0,
        y: 0,
        width: 2400,
        height: 1000,
        getMetadata: vi.fn().mockResolvedValue({}),
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const mockNewCard = {
        id: 'wide-card-copy',
        type: 'card',
        sync: vi.fn().mockResolvedValue(undefined),
        setMetadata: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([mockCard as any]);
      vi.mocked(miro.board.createCard).mockResolvedValue(mockNewCard as any);
      vi.mocked(miro.board.getById).mockResolvedValue(mockCard as any);

      await handleDuplicateAndLink();

      const createCardPayload = vi.mocked(miro.board.createCard).mock.calls[0][0] as Record<string, unknown>;
      expect(createCardPayload).toEqual(expect.objectContaining({
        width: 211.2,
      }));
      expect(createCardPayload).not.toHaveProperty('height');
    });

    it('should preserve narrow duplicated card width', async () => {
      const mockCard = {
        id: 'narrow-card',
        type: 'card',
        title: 'Narrow Card',
        x: 0,
        y: 0,
        width: 140,
        height: 80,
        getMetadata: vi.fn().mockResolvedValue({}),
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const mockNewCard = {
        id: 'narrow-card-copy',
        type: 'card',
        sync: vi.fn().mockResolvedValue(undefined),
        setMetadata: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([mockCard as any]);
      vi.mocked(miro.board.createCard).mockResolvedValue(mockNewCard as any);
      vi.mocked(miro.board.getById).mockResolvedValue(mockCard as any);

      await handleDuplicateAndLink();

      const createCardPayload = vi.mocked(miro.board.createCard).mock.calls[0][0] as Record<string, unknown>;
      expect(createCardPayload).toEqual(expect.objectContaining({
        width: 140,
      }));
      expect(createCardPayload).not.toHaveProperty('height');
    });

    it('should duplicate app cards without sending both width and height to Miro', async () => {
      const mockAppCard = {
        id: 'app-card-1',
        type: 'app_card',
        title: 'App Card',
        x: 0,
        y: 0,
        width: 600,
        height: 300,
        fields: [{ value: '21pt', tooltip: 'Estimate' }],
        tagIds: ['tag-1'],
        getMetadata: vi.fn().mockResolvedValue({}),
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const mockNewAppCard = {
        id: 'app-card-copy',
        type: 'app_card',
        sync: vi.fn().mockResolvedValue(undefined),
        setMetadata: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([mockAppCard as any]);
      vi.mocked(miro.board.createAppCard).mockResolvedValue(mockNewAppCard as any);
      vi.mocked(miro.board.getById).mockResolvedValue(mockAppCard as any);

      await handleDuplicateAndLink();

      const createAppCardPayload = vi.mocked(miro.board.createAppCard).mock.calls[0][0] as Record<string, unknown>;
      expect(createAppCardPayload).toEqual(expect.objectContaining({
        width: 176,
        fields: [{ value: '21pt', tooltip: 'Estimate' }],
        tagIds: ['tag-1'],
      }));
      expect(createAppCardPayload).not.toHaveProperty('height');
    });
  });

  describe('handleSyncMetadataFromParent', () => {
    it('should sync metadata from parent card', async () => {
      const parentMetadata = { some: 'data' };
      const mockParent = {
        id: 'parent1',
        type: 'card',
        getMetadata: vi.fn().mockResolvedValue(parentMetadata),
      };
      
      const mockChild = {
        id: 'child1',
        type: 'card',
        linkedTo: 'https://miro.com/app/board/board123/?moveToWidget=parent1',
        setMetadata: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([mockChild as any]);
      vi.mocked(miro.board.getById).mockResolvedValue(mockParent as any);

      await handleSyncMetadataFromParent();

      expect(mockChild.setMetadata).toHaveBeenCalledWith(expect.any(String), parentMetadata);
      expect(miro.board.notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('Synced metadata'));
    });
  });

  describe('handleCreateRefinementFrame', () => {
    it('should create a refinement frame for selected frames', async () => {
      const mockFrame = {
        id: 'f1',
        type: 'frame',
        title: 'Source Frame',
        width: 1000,
        height: 1000,
        x: 0,
        y: 0,
        childrenIds: [],
      };
      
      const mockNewFrame = {
        id: 'f2',
        type: 'frame',
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
        add: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([mockFrame as any]);
      vi.mocked(miro.board.createFrame).mockResolvedValue(mockNewFrame as any);
      vi.mocked(miro.board.get).mockResolvedValue([]);

      await handleCreateRefinementFrame();

      expect(miro.board.createFrame).toHaveBeenCalled();
      expect(miro.board.viewport.zoomTo).toHaveBeenCalled();
    });

    it('should keep refinement output bounded when the selected frame has many cards', async () => {
      const mockFrame = {
        id: 'f1',
        type: 'frame',
        title: 'Source Frame',
        width: 1000,
        height: 1000,
        x: 0,
        y: 0,
        childrenIds: ['c1', 'c2', 'c3'],
      };
      const mockNewFrame = {
        id: 'f2',
        type: 'frame',
        x: 1200,
        y: 0,
        width: 1000,
        height: 1000,
        add: vi.fn().mockResolvedValue(undefined),
      };
      const childCards = [
        { id: 'c1', type: 'card', title: '[A1.1] First', fields: [] },
        { id: 'c2', type: 'card', title: '[A1.2] Second', fields: [] },
        { id: 'c3', type: 'card', title: '[A1.3] Third', fields: [] },
      ];

      vi.mocked(miro.board.getSelection).mockResolvedValue([mockFrame as any]);
      vi.mocked(miro.board.createFrame).mockResolvedValue(mockNewFrame as any);
      vi.mocked(miro.board.get).mockImplementation(async (query: any) => {
        if (query?.id) return childCards as any;
        if (query?.type === 'tag') return [] as any;
        return [] as any;
      });
      vi.mocked(miro.board.createTag).mockResolvedValue({
        id: 'tag-test-frame',
        type: 'tag',
        title: 'Test-Frame',
      } as any);

      await handleCreateRefinementFrame();

      expect(miro.board.createCard).toHaveBeenCalledTimes(6);
      expect(mockNewFrame.add).toHaveBeenCalledTimes(6);
      expect(miro.board.createCard).toHaveBeenCalledWith(expect.objectContaining({
        title: expect.stringContaining('First'),
      }));
      expect(miro.board.createCard).not.toHaveBeenCalledWith(expect.objectContaining({
        title: expect.stringContaining('Second'),
      }));
    });
  });

  describe('handleCreateSticky', () => {
    it('should create sticky notes', async () => {
      const mockSticky = { id: 's1' };
      vi.mocked(miro.board.createStickyNote).mockResolvedValue(mockSticky as any);
      vi.mocked(miro.board.viewport.get).mockResolvedValue({ x: 0, y: 0 } as any);

      await handleCreateSticky(['text1', 'text2']);

      expect(miro.board.createStickyNote).toHaveBeenCalledTimes(2);
      expect(miro.board.viewport.zoomTo).toHaveBeenCalled();
    });
  });

  describe('handleRemoveLinks', () => {
    it('should remove linkedTo property from selected cards', async () => {
      const mockCard = {
        type: 'card',
        linkedTo: 'https://miro.com/test',
        sync: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(miro.board.getSelection).mockResolvedValue([mockCard as any]);
      
      await handleRemoveLinks();
      
      expect(mockCard.linkedTo).toBeUndefined();
      expect(mockCard.sync).toHaveBeenCalled();
      expect(miro.board.notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('Removed links'));
    });
  });

  describe('handleClearMetadata', () => {
    it('should clear metadata for selected cards', async () => {
      const mockCard = {
        id: 'c1',
        type: 'card',
        setMetadata: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(miro.board.getSelection).mockResolvedValue([mockCard as any]);
      
      await handleClearMetadata();
      
      expect(mockCard.setMetadata).toHaveBeenCalledWith(expect.any(String), {});
      expect(miro.board.notifications.showInfo).toHaveBeenCalledWith(expect.stringContaining('Cleared metadata'));
    });
  });

  describe('handleReorderSelectedCards', () => {
    it('should reorder cards vertically based on sequence', async () => {
      const card1 = {
        id: 'c1',
        type: 'card',
        title: '[A1.2] Task 2',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const card2 = {
        id: 'c2',
        type: 'card',
        title: '[A1.1] Task 1',
        x: 0,
        y: 100,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      
      vi.mocked(miro.board.getSelection).mockResolvedValue([card1 as any, card2 as any]);
      
      await handleReorderSelectedCards();
      
      // card2 (A1.1) should be first, card1 (A1.2) second
      // minY is -50 (top of card1 at 0,0) or -50 (top of card2 at 0,100)?
      // card1: x=0, y=0, w=100, h=100 -> left=-50, top=-50
      // card2: x=0, y=100, w=100, h=100 -> left=-50, top=50
      // minLeft = -50, minY = -50
      
      // Expected card2 position: x = -50 + 50 = 0, y = -50 + 50 = 0
      // Expected card1 position: currentY = -50 + 100 + 20 = 70. y = 70 + 50 = 120
      
      expect(card2.y).toBe(0);
      expect(card1.y).toBe(120);
      expect(card2.sync).toHaveBeenCalled();
      expect(card1.sync).toHaveBeenCalled();
    });

    it('should create backup copies with card data before applying reorder moves', async () => {
      const backupCard = {
        id: 'backup-c1',
        type: 'card',
        setMetadata: vi.fn().mockResolvedValue(undefined),
      };
      const card1 = {
        id: 'c1',
        type: 'card',
        title: '[A1.2] Task 2',
        description: 'Task 2 description',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        style: { cardTheme: '#a6ccf5' },
        tagIds: ['tag-1'],
        fields: [{ value: '21pt', tooltip: 'Estimate' }],
        getMetadata: vi.fn().mockResolvedValue({ 'jira-sync': { key: 'ABC-1' } }),
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const card2 = {
        id: 'c2',
        type: 'card',
        title: '[A1.1] Task 1',
        description: 'Task 1 description',
        x: 0,
        y: 100,
        width: 100,
        height: 100,
        getMetadata: vi.fn().mockResolvedValue({}),
        sync: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([card1 as any, card2 as any]);
      vi.mocked(miro.board.createCard).mockResolvedValue(backupCard as any);

      await handleReorderSelectedCards();

      expect(miro.board.createCard).toHaveBeenCalledWith(expect.objectContaining({
        title: '[BACKUP before reorder] [A1.2] Task 2',
        description: 'Task 2 description',
        style: { cardTheme: '#a6ccf5' },
        tagIds: ['tag-1'],
        fields: [{ value: '21pt', tooltip: 'Estimate' }],
      }));
      expect(backupCard.setMetadata).toHaveBeenCalledWith('jira-sync', { key: 'ABC-1' });
      expect(backupCard.setMetadata).toHaveBeenCalledWith('miro-plus-backup', expect.objectContaining({
        backupOf: 'c1',
        backupAction: 'before reorder',
      }));
      expect(vi.mocked(miro.board.createCard).mock.invocationCallOrder[0]).toBeLessThan(card1.sync.mock.invocationCallOrder[0]);
    });

    it('should back up supported non-card items in the same selection before reordering cards', async () => {
      const card1 = {
        id: 'c1',
        type: 'card',
        title: '[A1.2] Task 2',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const card2 = {
        id: 'c2',
        type: 'card',
        title: '[A1.1] Task 1',
        x: 0,
        y: 100,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const image = {
        id: 'img1',
        type: 'image',
        title: 'Evidence Screenshot',
        url: 'https://example.com/image.png',
        alt: 'screenshot',
        x: 400,
        y: 100,
        width: 300,
        height: 200,
        rotation: 0,
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([card1 as any, image as any, card2 as any]);

      await handleReorderSelectedCards();

      expect(miro.board.createImage).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://example.com/image.png',
        title: '[BACKUP before reorder] Evidence Screenshot',
        alt: 'screenshot',
        x: expect.any(Number),
        y: 100,
        width: 300,
      }));
      expect(card1.sync).toHaveBeenCalled();
      expect(card2.sync).toHaveBeenCalled();
    });

    it('should not send both width and height when backing up sticky notes and shapes', async () => {
      const card1 = {
        id: 'c1',
        type: 'card',
        title: '[A1.2] Task 2',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const card2 = {
        id: 'c2',
        type: 'card',
        title: '[A1.1] Task 1',
        x: 0,
        y: 100,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const sticky = {
        id: 'sticky-1',
        type: 'sticky_note',
        content: 'sticky',
        x: 200,
        y: 200,
        width: 120,
        height: 120,
      };
      const shape = {
        id: 'shape-1',
        type: 'shape',
        content: 'shape',
        x: 400,
        y: 200,
        width: 200,
        height: 100,
        shape: 'rectangle',
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([card1 as any, sticky as any, shape as any, card2 as any]);

      await handleReorderSelectedCards();

      const stickyPayload = vi.mocked(miro.board.createStickyNote).mock.calls[0][0] as Record<string, unknown>;
      const shapePayload = vi.mocked(miro.board.createShape).mock.calls[0][0] as Record<string, unknown>;
      expect(stickyPayload).toEqual(expect.objectContaining({ width: 120 }));
      expect(shapePayload).toEqual(expect.objectContaining({ width: 200 }));
      expect(stickyPayload).not.toHaveProperty('height');
      expect(shapePayload).not.toHaveProperty('height');
      expect(card1.sync).toHaveBeenCalled();
      expect(card2.sync).toHaveBeenCalled();
    });

    it('should create backup frames before backup content so the frame does not cover copied items', async () => {
      const backupFrame = {
        id: 'backup-frame',
        type: 'frame',
        setMetadata: vi.fn().mockResolvedValue(undefined),
      };
      const card1 = {
        id: 'c1',
        type: 'card',
        title: '[A1.2] Task 2',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const card2 = {
        id: 'c2',
        type: 'card',
        title: '[A1.1] Task 1',
        x: 0,
        y: 100,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const frame = {
        id: 'frame-1',
        type: 'frame',
        title: 'Original Frame',
        x: 0,
        y: 50,
        width: 400,
        height: 400,
      };
      const image = {
        id: 'img1',
        type: 'image',
        url: 'https://example.com/image.png',
        x: 20,
        y: 40,
        width: 200,
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([card1 as any, image as any, frame as any, card2 as any]);
      vi.mocked(miro.board.createFrame).mockResolvedValue(backupFrame as any);

      await handleReorderSelectedCards();

      expect(miro.board.createFrame).toHaveBeenCalledWith(expect.objectContaining({
        title: '[BACKUP before reorder] Original Frame',
      }));
      expect(vi.mocked(miro.board.createFrame).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(miro.board.createCard).mock.invocationCallOrder[0]
      );
      expect(vi.mocked(miro.board.createFrame).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(miro.board.createImage).mock.invocationCallOrder[0]
      );
      expect(card1.sync).toHaveBeenCalled();
      expect(card2.sync).toHaveBeenCalled();
    });

    it('should cancel reorder if backup creation fails', async () => {
      const card1 = {
        id: 'c1',
        type: 'card',
        title: '[A1.2] Task 2',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const card2 = {
        id: 'c2',
        type: 'card',
        title: '[A1.1] Task 1',
        x: 0,
        y: 100,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([card1 as any, card2 as any]);
      vi.mocked(miro.board.createCard).mockRejectedValue(new Error('backup failed'));

      await handleReorderSelectedCards();

      expect(card1.x).toBe(0);
      expect(card1.y).toBe(0);
      expect(card2.x).toBe(0);
      expect(card2.y).toBe(100);
      expect(card1.sync).not.toHaveBeenCalled();
      expect(card2.sync).not.toHaveBeenCalled();
      expect(miro.board.notifications.showError).toHaveBeenCalledWith(expect.stringContaining('Backup failed'));
    });

    it('should reorder cards only within the same parent frame coordinate space', async () => {
      const frame64CardA = {
        id: 'f64-c1',
        type: 'card',
        parentId: 'frame-64',
        title: '[A1.2] Frame 64 second',
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const frame64CardB = {
        id: 'f64-c2',
        type: 'card',
        parentId: 'frame-64',
        title: '[A1.1] Frame 64 first',
        x: 100,
        y: 240,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const frame65Card = {
        id: 'f65-c1',
        type: 'card',
        parentId: 'frame-65',
        title: '[A1.0] Frame 65 only',
        x: 900,
        y: 900,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([
        frame64CardA as any,
        frame64CardB as any,
        frame65Card as any,
      ]);

      await handleReorderSelectedCards();

      expect(frame64CardB.y).toBe(100);
      expect(frame64CardA.y).toBe(220);
      expect(frame65Card.x).toBe(900);
      expect(frame65Card.y).toBe(900);
      expect(frame64CardA.sync).toHaveBeenCalled();
      expect(frame64CardB.sync).toHaveBeenCalled();
      expect(frame65Card.sync).not.toHaveBeenCalled();
    });

    it('should keep board-level cards separate from framed cards when reordering', async () => {
      const framedCardA = {
        id: 'framed-a',
        type: 'card',
        parentId: 'frame-1',
        title: '[A1.2] Framed second',
        x: 80,
        y: 80,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const framedCardB = {
        id: 'framed-b',
        type: 'card',
        parentId: 'frame-1',
        title: '[A1.1] Framed first',
        x: 80,
        y: 220,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };
      const boardCard = {
        id: 'board-card',
        type: 'card',
        title: '[A1.0] Board card',
        x: 5000,
        y: 5000,
        width: 100,
        height: 100,
        sync: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(miro.board.getSelection).mockResolvedValue([
        framedCardA as any,
        framedCardB as any,
        boardCard as any,
      ]);

      await handleReorderSelectedCards();

      expect(framedCardB.y).toBe(80);
      expect(framedCardA.y).toBe(200);
      expect(boardCard.x).toBe(5000);
      expect(boardCard.y).toBe(5000);
      expect(boardCard.sync).not.toHaveBeenCalled();
    });
  });
});
