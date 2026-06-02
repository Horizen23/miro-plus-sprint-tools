import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSprintSelection } from './useSprintSelection';
import * as estimationUtils from '../services/miro/estimationUtils';

// Mock miro SDK
const mockMiro = {
  board: {
    getSelection: vi.fn(),
    notifications: {
      showError: vi.fn(),
      showInfo: vi.fn(),
    },
    ui: {
      on: vi.fn(),
      off: vi.fn(),
    },
  },
};

vi.stubGlobal('miro', mockMiro);

// Mock utility functions
vi.mock('../services/miro/estimationUtils', () => ({
  handleSetPointsOnItems: vi.fn(),
  calculateSelectionSummary: vi.fn(() => ({ total: 0, count: 0, unestimated: 0, distribution: {} })),
}));

vi.mock('../services/miro/selectionUtils', () => ({
  handleSelectAll: vi.fn(),
  handleSelectInView: vi.fn(),
}));

vi.mock('../services/miro/miroUtils', () => ({
  handleDuplicateAndLink: vi.fn(),
  handleCreateRefinementFrame: vi.fn(),
  handleRemoveLinks: vi.fn(),
  handleReorderSelectedCards: vi.fn(),
  handleSyncMetadataFromParent: vi.fn(),
  handleClearMetadata: vi.fn(),
}));

describe('useSprintSelection', () => {
  const originalEnv = process.env.NEXT_PUBLIC_DEFAULT_ESTIMATE_UNIT;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_DEFAULT_ESTIMATE_UNIT = 'pt';
    mockMiro.board.getSelection.mockResolvedValue([]);
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DEFAULT_ESTIMATE_UNIT = originalEnv;
    vi.useRealTimers();
  });

  it('initializes with default values', async () => {
    const { result } = renderHook(() => useSprintSelection());
    
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.activeAction).toBe(null);
    expect(result.current.estimateUnit).toBe('pt');
    expect(result.current.selectedItems).toEqual([]);
  });

  it('fetches selection on mount', async () => {
    const mockCards = [{ id: '1', type: 'card' }, { id: '2', type: 'app_card' }];
    mockMiro.board.getSelection.mockResolvedValue(mockCards);

    const { result } = renderHook(() => useSprintSelection());

    // mount effect calls fetchSelection (async)
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.selectedItems).toHaveLength(2);
    expect(result.current.selectedItems[0].id).toBe('1');
  });

  it('updates selection on "selection:update" event', async () => {
    mockMiro.board.getSelection.mockResolvedValue([]);
    const { result } = renderHook(() => useSprintSelection());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.selectedItems).toEqual([]);

    // Simulate event
    const mockCards = [{ id: '3', type: 'card' }];
    mockMiro.board.getSelection.mockResolvedValue(mockCards);
    
    const updateHandler = mockMiro.board.ui.on.mock.calls.find(call => call[0] === 'selection:update')![1];
    
    await act(async () => {
      updateHandler();
      // Debounce is 200ms
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(result.current.selectedItems).toHaveLength(1);
    expect(result.current.selectedItems[0].id).toBe('3');
  });

  it('handles manual processing state', () => {
    const { result } = renderHook(() => useSprintSelection());
    
    act(() => {
      result.current.setIsProcessing(true);
    });
    
    expect(result.current.isProcessing).toBe(true);
  });

  it('handles generic actions with handleAction', async () => {
    const { result } = renderHook(() => useSprintSelection());
    
    let resolveMock: (val: any) => void;
    const mockFn = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveMock = resolve;
    }));

    let actionPromise: Promise<void>;
    await act(async () => {
      actionPromise = result.current.handleAction('test-action', mockFn);
    });

    // Check intermediate state
    expect(result.current.activeAction).toBe('test-action');
    expect(result.current.isProcessing).toBe(true);

    await act(async () => {
      resolveMock!('done');
      await actionPromise;
    });

    expect(result.current.activeAction).toBe(null);
    expect(result.current.isProcessing).toBe(false);
    expect(mockFn).toHaveBeenCalled();
  });

  it('sets points on selected items', async () => {
    const mockCards = [{ id: '1', type: 'card' }];
    mockMiro.board.getSelection.mockResolvedValue(mockCards);
    const { result } = renderHook(() => useSprintSelection());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.selectedItems).toHaveLength(1);

    await act(async () => {
      await result.current.handleSetPoints('5');
    });

    expect(estimationUtils.handleSetPointsOnItems).toHaveBeenCalledWith(mockCards, '5');
    expect(mockMiro.board.notifications.showInfo).toHaveBeenCalledWith('Updated 1 items');
  });

  it('uses memoized items if selection is empty in handleSetPoints', async () => {
    const mockCards = [{ id: '1', type: 'card' }];
    mockMiro.board.getSelection.mockResolvedValue(mockCards);
    const { result } = renderHook(() => useSprintSelection());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.selectedItems).toHaveLength(1);

    // Clear selection
    mockMiro.board.getSelection.mockResolvedValue([]);
    const updateHandler = mockMiro.board.ui.on.mock.calls.find(call => call[0] === 'selection:update')![1];
    await act(async () => {
      updateHandler();
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(result.current.selectedItems).toHaveLength(0);
    expect(result.current.memoizedItems).toHaveLength(1);

    await act(async () => {
      await result.current.handleSetPoints('8');
    });

    expect(estimationUtils.handleSetPointsOnItems).toHaveBeenCalledWith(mockCards, '8');
  });

  it('shows error in handleSetPoints if no items available', async () => {
    const { result } = renderHook(() => useSprintSelection());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.selectedItems).toHaveLength(0);

    await act(async () => {
      await result.current.handleSetPoints('5');
    });

    expect(mockMiro.board.notifications.showError).toHaveBeenCalledWith('Please select at least one card');
  });

  it('inspects metadata of selected items', async () => {
    const mockCard = { 
      id: '1', 
      type: 'card', 
      title: 'Test Card',
      getMetadata: vi.fn().mockResolvedValue({ some: 'data' })
    };
    mockMiro.board.getSelection.mockResolvedValue([mockCard]);
    const { result } = renderHook(() => useSprintSelection());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.selectedItems).toHaveLength(1);

    await act(async () => {
      await result.current.handleInspectMetadata();
    });

    expect(result.current.inspectedMetadata).toEqual([
      { title: 'Test Card', data: { some: 'data' } }
    ]);
  });
});
