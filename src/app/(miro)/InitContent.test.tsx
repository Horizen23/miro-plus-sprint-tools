import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InitContent from './InitContent';
import { useGlobalConfig } from '@/contexts/GlobalConfigContext';

vi.mock('@/contexts/GlobalConfigContext', () => ({
  useGlobalConfig: vi.fn()
}));

describe('InitContent', () => {
  const mockConfig = { tsUserMapping: '', tsVariables: '' };

  beforeEach(() => {
    vi.stubGlobal('miro', {
      board: {
        ui: {
          on: vi.fn(),
          off: vi.fn(),
        },
        getUserInfo: vi.fn().mockResolvedValue({ id: 'me' }),
        get: vi.fn().mockResolvedValue([]),
        getById: vi.fn().mockResolvedValue({}),
        getAppData: vi.fn().mockResolvedValue(mockConfig),
        getSelection: vi.fn().mockResolvedValue([]),
        notifications: {
          showInfo: vi.fn(),
          showError: vi.fn(),
        },
      },
    });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
    vi.mocked(useGlobalConfig).mockReturnValue({
      boardId: 'board123',
      config: mockConfig,
    } as any);
  });

  it('renders and registers handlers', async () => {
    let handlers: Record<string, Function> = {};
    vi.mocked(miro.board.ui.on).mockImplementation(async (event: string, handler: Function) => {
      handlers[event] = handler;
    });

    render(<InitContent />);
    
    await waitFor(() => {
      expect(miro.board.ui.on).toHaveBeenCalledWith('icon:click', expect.any(Function));
    });

    // Test a handler
    if (handlers['custom:set-todo']) {
      await handlers['custom:set-todo']({ items: [{ id: 'c1', type: 'card', title: 'Task' }] });
      // Should call syncCardStatus (which calls notify)
      expect(miro.board.getUserInfo).toHaveBeenCalled(); 
    }
    
    expect(screen.getByText(/Great, your app is running locally/i)).toBeDefined();
  });
});
