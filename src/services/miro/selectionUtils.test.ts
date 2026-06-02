import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleSelectAll, handleSelectInView } from './selectionUtils';

describe('selectionUtils', () => {
  beforeEach(() => {
    vi.stubGlobal('miro', {
      board: {
        get: vi.fn(),
        select: vi.fn(),
        viewport: {
          get: vi.fn(),
        },
        notifications: {
          showInfo: vi.fn(),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('handleSelectAll', () => {
    it('should select all cards and appCards', async () => {
      vi.mocked(miro.board.get).mockResolvedValueOnce([{ id: 'c1', type: 'card' } as any])
                               .mockResolvedValueOnce([{ id: 'ac1', type: 'app_card' } as any]);
      
      await handleSelectAll();
      
      expect(miro.board.select).toHaveBeenCalledWith({ id: ['c1', 'ac1'] });
    });
  });

  describe('handleSelectInView', () => {
    it('should select items within viewport', async () => {
      vi.mocked(miro.board.viewport.get).mockResolvedValue({ x: 0, y: 0, width: 1000, height: 1000 } as any);
      vi.mocked(miro.board.get).mockResolvedValue([
        { id: 'c1', type: 'card', x: 0, y: 0, width: 100, height: 100 } as any,
        { id: 'c2', type: 'card', x: 2000, y: 2000, width: 100, height: 100 } as any,
      ]);

      await handleSelectInView();
      
      expect(miro.board.select).toHaveBeenCalledWith({ id: ['c1'] });
      expect(miro.board.notifications.showInfo).toHaveBeenCalledWith('Selected 1 items in view');
    });
  });
});
