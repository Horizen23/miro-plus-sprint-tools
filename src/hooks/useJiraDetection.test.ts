import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useJiraDetection } from './useJiraDetection';
import { useGlobalConfig } from '../contexts/GlobalConfigContext';
import { calculateSelectionSummary } from '../services/miro/estimationUtils';
import { cacheUtils } from '../utils/cacheUtils';

// Mock dependencies
vi.mock('../contexts/GlobalConfigContext', () => ({
  useGlobalConfig: vi.fn(),
}));

vi.mock('../services/miro/estimationUtils', () => ({
  calculateSelectionSummary: vi.fn(),
}));

vi.mock('../utils/cacheUtils', () => ({
  cacheUtils: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('useJiraDetection', () => {
  const mockConfig = { jiraPrefix: 'PROJ' };
  const mockSelection = [
    { id: '1', type: 'card', title: 'Card 1', description: 'Desc 1', getMetadata: vi.fn() },
    { id: '2', type: 'app_card', title: 'Card 2', description: 'Desc 2', getMetadata: vi.fn(), fields: [] },
  ];

  beforeEach(() => {
    vi.mocked(useGlobalConfig).mockReturnValue({ config: mockConfig } as any);
    vi.mocked(calculateSelectionSummary).mockReturnValue({ points: 1, actualHours: 1 } as any);
    vi.mocked(cacheUtils.get).mockReturnValue(null);

    vi.stubGlobal('miro', {
      board: {
        get: vi.fn().mockResolvedValue([
          { id: 'tag1', title: 'jira-TASK-1' },
          { id: 'tag2', title: 'some-other-tag' },
        ]),
      },
    });

    vi.stubGlobal('process', {
      env: {
        NEXT_PUBLIC_MIRO_METADATA_KEY: 'jira-sync'
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should detect cards and identify Jira parent key from tags', async () => {
    const selection = [
      { 
        id: '1', 
        type: 'card', 
        title: 'Card 1', 
        description: 'Desc 1', 
        tagIds: ['tag1'],
        getMetadata: vi.fn().mockResolvedValue(null)
      }
    ];

    const { result } = renderHook(() => useJiraDetection(selection as any, ''));

    await act(async () => {
      await result.current.detectSelection();
    });

    expect(result.current.selectedCards).toHaveLength(1);
    expect(result.current.selectedCards[0].detectedParentKey).toBe('TASK-1');
    expect(result.current.checkedIds.has('1')).toBe(true);
  });

  it('should detect cards and identify Jira parent key using global prefix if tag is incomplete', async () => {
    vi.mocked(miro.board.get).mockResolvedValue([{ id: 'tag1', title: 'jira-123' }] as any);
    
    const selection = [
      { 
        id: '1', 
        type: 'card', 
        title: 'Card 1', 
        description: 'Desc 1', 
        tagIds: ['tag1'],
        getMetadata: vi.fn().mockResolvedValue(null)
      }
    ];

    const { result } = renderHook(() => useJiraDetection(selection as any, ''));

    await act(async () => {
      await result.current.detectSelection();
    });

    expect(result.current.selectedCards[0].detectedParentKey).toBe('PROJ-123');
  });

  it('should mark cards as checked if they have changed since last sync', async () => {
    const selection = [
      { 
        id: '1', 
        type: 'card', 
        title: 'Updated Title', 
        description: 'Desc 1', 
        getMetadata: vi.fn().mockResolvedValue({ key: 'PROJ-1', lastTitle: 'Old Title', lastDesc: 'Desc 1' })
      }
    ];

    const { result } = renderHook(() => useJiraDetection(selection as any, ''));

    await act(async () => {
      await result.current.detectSelection();
    });

    expect(result.current.checkedIds.has('1')).toBe(true);
  });

  it('should NOT mark cards as checked if they have NOT changed since last sync', async () => {
    const selection = [
      { 
        id: '1', 
        type: 'card', 
        title: 'Same Title', 
        description: 'Same Desc', 
        getMetadata: vi.fn().mockResolvedValue({ key: 'PROJ-1', lastTitle: 'Same Title', lastDesc: 'Same Desc' })
      }
    ];

    const { result } = renderHook(() => useJiraDetection(selection as any, ''));

    await act(async () => {
      await result.current.detectSelection();
    });

    expect(result.current.checkedIds.has('1')).toBe(false);
  });

  it('toggleCheck should update checkedIds', async () => {
    const selection = [
      { 
        id: '1', 
        type: 'card', 
        title: 'Card 1', 
        description: 'Desc 1', 
        getMetadata: vi.fn().mockResolvedValue({ key: 'PROJ-1' })
      }
    ];

    const { result } = renderHook(() => useJiraDetection(selection as any, ''));

    await act(async () => {
      await result.current.detectSelection();
    });

    // Initially unchecked because it's synced and hasn't changed (mocked as synced above)
    // Wait, let's make sure it's synced and not changed.
    // In the test above, metadata returns {key: 'PROJ-1'}. lastTitle and lastDesc are undefined.
    // normalize(undefined) is "", normalize("Card 1") is "Card 1". So it HAS changed.
    
    expect(result.current.checkedIds.has('1')).toBe(true);

    act(() => {
      result.current.toggleCheck('1');
    });
    expect(result.current.checkedIds.has('1')).toBe(false);

    act(() => {
      result.current.toggleCheck('1');
    });
    expect(result.current.checkedIds.has('1')).toBe(true);
  });

  it('handleSelectAll should toggle all valid items', async () => {
    const selection = [
      { id: '1', type: 'card', title: 'C1', description: 'D1', x: 0, y: 0, getMetadata: vi.fn().mockResolvedValue({ key: 'P1' }) },
      { id: '2', type: 'card', title: 'C2', description: 'D2', x: 0, y: 0, getMetadata: vi.fn().mockResolvedValue(null) },
    ];

    const { result } = renderHook(() => useJiraDetection(selection as any, ''));

    await act(async () => {
      await result.current.detectSelection();
    });

    expect(result.current.selectedCards).toHaveLength(2);
    expect(result.current.validItemsCount).toBe(1);
    // Item 1 is auto-selected because it 'changed' (metadata title was undefined)
    expect(result.current.checkedIds.size).toBe(1);

    await act(async () => {
      result.current.handleSelectAll();
    });
    
    // Toggles OFF because it was already full
    expect(result.current.checkedIds.size).toBe(0);

    await act(async () => {
      result.current.handleSelectAll();
    });
    // Toggles ON
    expect(result.current.checkedIds.size).toBe(1);
    expect(result.current.checkedIds.has('1')).toBe(true);
  });
});
