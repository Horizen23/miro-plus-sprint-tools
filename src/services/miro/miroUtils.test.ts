import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  handleRemoveLinks, 
  handleClearMetadata, 
  handleReorderSelectedCards,
  handleDuplicateAndLink,
  handleSyncMetadataFromParent,
  handleCreateRefinementFrame,
  handleCreateSticky
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
        createCard: vi.fn(),
        createAppCard: vi.fn(),
        createFrame: vi.fn(),
        createStickyNote: vi.fn(),
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
      // Expected card1 position: currentY = 0 + 100 + 20 = 120. y = 120 + 50 = 170
      
      expect(card2.y).toBe(0);
      expect(card1.y).toBe(120);
      expect(card2.sync).toHaveBeenCalled();
      expect(card1.sync).toHaveBeenCalled();
    });
  });
});
