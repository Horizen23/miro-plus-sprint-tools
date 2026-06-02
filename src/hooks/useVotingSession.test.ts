import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useVotingSession } from './useVotingSession';
import { RealtimeFactory } from '../services/realtime/factory';
import * as votingUtils from '../services/miro/votingUtils';

// Mock miro SDK
const mockMiro = {
  board: {
    getUserInfo: vi.fn().mockResolvedValue({ id: 'user-1', name: 'User 1' }),
    getInfo: vi.fn().mockResolvedValue({ id: 'board-1' }),
    getById: vi.fn(),
    getOnlineUsers: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
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

// Mock Realtime
const mockRealtime = {
  connect: vi.fn(),
  joinSession: vi.fn(),
  updateState: vi.fn(),
  endSession: vi.fn(),
  onStateUpdate: vi.fn(() => vi.fn()), // Returns unsubscribe
};

vi.mock('../services/realtime/factory', () => ({
  RealtimeFactory: {
    getInstance: () => mockRealtime,
  },
}));

// Mock votingUtils
vi.mock('../services/miro/votingUtils', () => ({
  getVotingMetadata: vi.fn(),
  saveVotingMetadata: vi.fn(),
  findActiveVotingSession: vi.fn(),
}));

describe('useVotingSession', () => {
  const mockSetIsProcessing = vi.fn();
  const mockSetActiveTab = vi.fn();
  const mockHandleSetPoints = vi.fn();
  const mockOnFinished = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (votingUtils.getVotingMetadata as any).mockResolvedValue(null);
    (votingUtils.findActiveVotingSession as any).mockResolvedValue(null);
    (mockMiro.board.getById as any).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with user info and online users count', async () => {
    const { result } = renderHook(() => useVotingSession(
      [], mockSetIsProcessing, mockSetActiveTab, mockHandleSetPoints, 'pt'
    ));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.currentUserId).toBe('user-1');
    expect(result.current.onlineUsersCount).toBe(1);
    expect(mockRealtime.connect).toHaveBeenCalled();
  });

  it('handles start voting', async () => {
    const mockCard = { id: 'card-1', title: 'Test Card', type: 'card' } as any;
    (mockMiro.board.getById as any).mockResolvedValue(mockCard);
    const activeSession = {
      cardId: 'card-1',
      cardTitle: 'Test Card',
      status: 'voting' as const,
      votes: {},
      participants: ['user-1'],
    };
    (votingUtils.getVotingMetadata as any).mockResolvedValue(activeSession);

    const { result } = renderHook(() => useVotingSession(
      [mockCard], mockSetIsProcessing, mockSetActiveTab, mockHandleSetPoints, 'pt'
    ));

    await act(async () => {
      await result.current.handleStartVoting();
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(mockSetIsProcessing).toHaveBeenCalledWith(true);
    expect(votingUtils.saveVotingMetadata).toHaveBeenCalledWith(mockCard, expect.objectContaining({
      cardId: 'card-1',
      status: 'voting',
    }));
    
    expect(result.current.votingSession?.cardId).toBe('card-1');

    expect(mockSetActiveTab).toHaveBeenCalledWith('tools');
    expect(mockMiro.board.notifications.showInfo).toHaveBeenCalledWith('Voting started!');
  });

  it('should not start voting if multiple cards are selected', async () => {
    const mockCards = [{ id: '1' }, { id: '2' }] as any;
    const { result } = renderHook(() => useVotingSession(
      mockCards, mockSetIsProcessing, mockSetActiveTab, mockHandleSetPoints, 'pt'
    ));

    await act(async () => {
      await result.current.handleStartVoting();
    });

    expect(mockMiro.board.notifications.showError).toHaveBeenCalledWith('Please select exactly one card to start voting');
    expect(votingUtils.saveVotingMetadata).not.toHaveBeenCalled();
  });

  it('handles casting a vote', async () => {
    const mockCard = { id: 'card-1', title: 'Test Card', type: 'card' } as any;
    const activeSession = {
      cardId: 'card-1',
      cardTitle: 'Test Card',
      status: 'voting' as const,
      votes: {},
      participants: ['user-1'],
    };

    mockMiro.board.getById.mockResolvedValue(mockCard);
    (votingUtils.getVotingMetadata as any).mockResolvedValue(activeSession);
    (votingUtils.findActiveVotingSession as any).mockResolvedValue(activeSession);
    
    const { result } = renderHook(() => useVotingSession(
      [], mockSetIsProcessing, mockSetActiveTab, mockHandleSetPoints, 'pt'
    ));

    // Wait for initialization and sync
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100); 
    });

    expect(result.current.votingSession?.cardId).toBe('card-1');

    await act(async () => {
      await result.current.handleCastVote('5');
    });

    expect(votingUtils.saveVotingMetadata).toHaveBeenCalledWith(mockCard, expect.objectContaining({
      votes: { 'user-1': '5' }
    }));
  });

  it('handles revealing votes', async () => {
    const mockCard = { id: 'card-1', type: 'card' } as any;
    const activeSession = { cardId: 'card-1', status: 'voting' as const, votes: {} };
    
    mockMiro.board.getById.mockResolvedValue(mockCard);
    (votingUtils.getVotingMetadata as any).mockResolvedValue(activeSession);
    (votingUtils.findActiveVotingSession as any).mockResolvedValue(activeSession);
    
    const { result } = renderHook(() => useVotingSession(
      [], mockSetIsProcessing, mockSetActiveTab, mockHandleSetPoints, 'pt'
    ));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    await act(async () => {
      await result.current.handleRevealVotes();
    });

    expect(votingUtils.saveVotingMetadata).toHaveBeenCalledWith(mockCard, expect.objectContaining({
      status: 'revealed'
    }));
  });

  it('handles resetting voting', async () => {
    const mockCard = { id: 'card-1', type: 'card' } as any;
    const activeSession = { cardId: 'card-1', status: 'voting' as const, votes: {} };
    
    mockMiro.board.getById.mockResolvedValue(mockCard);
    (votingUtils.getVotingMetadata as any).mockResolvedValue(activeSession);
    (votingUtils.findActiveVotingSession as any).mockResolvedValue(activeSession);
    
    const { result } = renderHook(() => useVotingSession(
      [], mockSetIsProcessing, mockSetActiveTab, mockHandleSetPoints, 'pt', mockOnFinished
    ));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.votingSession).not.toBeNull();

    // Mock that session is gone from board before reset
    (votingUtils.findActiveVotingSession as any).mockResolvedValue(null);
    (votingUtils.getVotingMetadata as any).mockResolvedValue(null);

    await act(async () => {
      await result.current.handleResetVoting();
    });

    expect(votingUtils.saveVotingMetadata).toHaveBeenCalledWith(mockCard, null);
    expect(result.current.votingSession).toBeNull();
    expect(mockOnFinished).toHaveBeenCalled();
  });

  it('handles applying a vote', async () => {
    const mockCard = { id: 'card-1', type: 'card' } as any;
    const activeSession = { cardId: 'card-1', status: 'revealed' as const, votes: { 'user-1': '5' } };
    
    mockMiro.board.getById.mockResolvedValue(mockCard);
    (votingUtils.getVotingMetadata as any).mockResolvedValue(activeSession);
    (votingUtils.findActiveVotingSession as any).mockResolvedValue(activeSession);
    
    const { result } = renderHook(() => useVotingSession(
      [], mockSetIsProcessing, mockSetActiveTab, mockHandleSetPoints, 'pt', mockOnFinished
    ));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    await act(async () => {
      await result.current.handleApplyVote('5');
    });

    expect(mockHandleSetPoints).toHaveBeenCalledWith('5', [mockCard]);
    expect(mockOnFinished).toHaveBeenCalled();
  });
});
