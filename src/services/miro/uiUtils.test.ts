import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notify, copyAndNotify } from './uiUtils';

describe('uiUtils', () => {
  beforeEach(() => {
    vi.stubGlobal('miro', {
      board: {
        notifications: {
          showInfo: vi.fn(),
          showError: vi.fn(),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('notify', () => {
    it('should call showInfo for info type', async () => {
      await notify('Test Message', 'info');
      expect(miro.board.notifications.showInfo).toHaveBeenCalledWith('Test Message');
    });

    it('should call showError for error type', async () => {
      await notify('Error Message', 'error');
      expect(miro.board.notifications.showError).toHaveBeenCalledWith('Error Message');
    });

    it('should truncate long messages', async () => {
      const longMsg = 'A'.repeat(100);
      await notify(longMsg);
      expect(miro.board.notifications.showInfo).toHaveBeenCalledWith('A'.repeat(82) + '...');
    });
  });

  describe('copyAndNotify', () => {
    it('should use navigator.clipboard if available', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', {
        clipboard: {
          writeText,
        },
      });

      const result = await copyAndNotify('test text', 'Test Label');
      expect(result).toBe(true);
      expect(writeText).toHaveBeenCalledWith('test text');
      expect(miro.board.notifications.showInfo).toHaveBeenCalledWith('Copied Test Label to clipboard');
    });

    it('should use execCommand fallback if navigator.clipboard is missing', async () => {
      vi.stubGlobal('navigator', {});
      vi.stubGlobal('document', {
        createElement: vi.fn().mockReturnValue({
          style: {},
          appendChild: vi.fn(),
          focus: vi.fn(),
          select: vi.fn(),
        }),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
        execCommand: vi.fn().mockReturnValue(true),
      });

      const result = await copyAndNotify('fallback text', 'Fallback Label');
      expect(result).toBe(true);
      expect(document.execCommand).toHaveBeenCalledWith('copy');
      expect(miro.board.notifications.showInfo).toHaveBeenCalledWith('Copied Fallback Label to clipboard');
    });
  });
});
