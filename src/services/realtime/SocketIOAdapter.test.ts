import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SocketIOAdapter } from './SocketIOAdapter';
import { io, Socket } from 'socket.io-client';
import { VotingState } from './types';

vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

describe('SocketIOAdapter', () => {
  let mockSocket: any;
  let adapter: SocketIOAdapter;
  const url = 'http://localhost:3000';

  beforeEach(() => {
    mockSocket = {
      on: vi.fn().mockReturnThis(),
      once: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      emit: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
      connected: true,
    };

    vi.mocked(io).mockReturnValue(mockSocket as unknown as Socket);
    adapter = new SocketIOAdapter(url);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('should initialize socket and register listeners', () => {
      adapter.connect('board-123');
      expect(io).toHaveBeenCalledWith(url);
      expect(mockSocket.on).toHaveBeenCalledWith('voting-state-updated', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should emit join-board on connect if boardId provided', () => {
      adapter.connect('board-123');
      const connectHandler = mockSocket.on.mock.calls.find((call: any) => call[0] === 'connect')[1];
      connectHandler();
      expect(mockSocket.emit).toHaveBeenCalledWith('join-board', 'board-123');
    });

    it('should not connect if already connected', () => {
      adapter.connect();
      adapter.connect();
      expect(io).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('should call socket.disconnect and nullify socket', () => {
      adapter.connect();
      adapter.disconnect();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('safeEmit', () => {
    it('should emit immediately if connected', () => {
      adapter.connect();
      mockSocket.connected = true;
      adapter.joinSession('c1', 'u1');
      expect(mockSocket.emit).toHaveBeenCalledWith('join-session', { cardId: 'c1', userId: 'u1' });
    });

    it('should queue emit if not connected', () => {
      adapter.connect();
      mockSocket.connected = false;
      adapter.joinSession('c1', 'u1');
      expect(mockSocket.emit).not.toHaveBeenCalledWith('join-session', expect.any(Object));
      expect(mockSocket.once).toHaveBeenCalledWith('connect', expect.any(Function));

      const connectHandler = mockSocket.once.mock.calls[0][1];
      connectHandler();
      expect(mockSocket.emit).toHaveBeenCalledWith('join-session', { cardId: 'c1', userId: 'u1' });
    });
  });

  describe('message sending', () => {
    beforeEach(() => {
      adapter.connect();
    });

    it('updateState should emit update-voting-state', () => {
      const state: VotingState = { cardId: 'c1', cardTitle: 'T1', status: 'voting', votes: {}, participants: [] };
      adapter.updateState('c1', state);
      expect(mockSocket.emit).toHaveBeenCalledWith('update-voting-state', { cardId: 'c1', state });
    });

    it('castVote should emit cast-vote', () => {
      adapter.castVote('c1', 'u1', '5');
      expect(mockSocket.emit).toHaveBeenCalledWith('cast-vote', { cardId: 'c1', userId: 'u1', vote: '5' });
    });

    it('endSession should emit end-voting-session', () => {
      adapter.endSession('c1');
      expect(mockSocket.emit).toHaveBeenCalledWith('end-voting-session', 'c1');
    });

    it('joinAuth should emit join-auth', () => {
      adapter.joinAuth('s1');
      expect(mockSocket.emit).toHaveBeenCalledWith('join-auth', 's1');
    });

    it('sendAuthSuccess should emit complete-auth', () => {
      adapter.sendAuthSuccess('s1', 'code1');
      expect(mockSocket.emit).toHaveBeenCalledWith('complete-auth', { state: 's1', code: 'code1' });
    });
  });

  describe('onStateUpdate', () => {
    it('should register and notify callbacks', () => {
      const callback = vi.fn();
      const unsubscribe = adapter.onStateUpdate(callback);
      
      adapter.connect();
      const stateHandler = mockSocket.on.mock.calls.find((call: any) => call[0] === 'voting-state-updated')[1];
      
      const state: VotingState = { cardId: 'c1', cardTitle: 'T1', status: 'voting', votes: {}, participants: [] };
      stateHandler(state);
      
      expect(callback).toHaveBeenCalledWith(state);
      
      unsubscribe();
      stateHandler(state);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle callback errors', () => {
      const callback = vi.fn().mockImplementation(() => { throw new Error('fail'); });
      adapter.onStateUpdate(callback);
      adapter.connect();
      const stateHandler = mockSocket.on.mock.calls.find((call: any) => call[0] === 'voting-state-updated')[1];
      
      expect(() => stateHandler({})).not.toThrow();
    });
  });

  describe('auth signaling', () => {
    it('onAuthSuccess should register listener', () => {
      adapter.connect();
      const callback = vi.fn();
      adapter.onAuthSuccess(callback);
      expect(mockSocket.on).toHaveBeenCalledWith('auth-success', callback);
    });

    it('subscribeToAuth should join and listen for success', () => {
      adapter.connect();
      const callback = vi.fn();
      const unsubscribe = adapter.subscribeToAuth('state-1', callback);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('join-auth', 'state-1');
      const authHandler = mockSocket.on.mock.calls.find((call: any) => call[0] === 'auth-success')[1];
      
      // Wrong state
      authHandler({ state: 'wrong', code: 'c1' });
      expect(callback).not.toHaveBeenCalled();
      
      // Right state
      authHandler({ state: 'state-1', code: 'code-1' });
      expect(callback).toHaveBeenCalledWith('code-1');
      expect(mockSocket.off).toHaveBeenCalledWith('auth-success', authHandler);
      
      unsubscribe();
      expect(mockSocket.off).toHaveBeenCalledTimes(2);
    });
  });
});
