import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseAdapter } from './SupabaseAdapter';
import { createClient } from '@supabase/supabase-js';
import { VotingState } from './types';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('SupabaseAdapter', () => {
  let mockClient: any;
  let mockChannel: any;
  let adapter: SupabaseAdapter;
  const url = 'https://example.supabase.co';
  const key = 'test-key';

  beforeEach(() => {
    mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockImplementation((cb) => {
        if (cb) cb('SUBSCRIBED');
        return mockChannel;
      }),
      send: vi.fn().mockResolvedValue({}),
    };

    mockClient = {
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn(),
    };

    vi.mocked(createClient).mockReturnValue(mockClient);
    adapter = new SupabaseAdapter(url, key);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize supabase client in constructor', () => {
    expect(createClient).toHaveBeenCalledWith(url, key);
  });

  describe('connect', () => {
    it('should create and subscribe to a channel', () => {
      adapter.connect('board-123');
      expect(mockClient.channel).toHaveBeenCalledWith('voting-room-board-123', expect.any(Object));
      expect(mockChannel.on).toHaveBeenCalledWith('broadcast', { event: 'voting-state-updated' }, expect.any(Function));
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('should use default room name if boardId is not provided', () => {
      adapter.connect();
      expect(mockClient.channel).toHaveBeenCalledWith('voting-room', expect.any(Object));
    });

    it('should not connect if already connected', () => {
      adapter.connect();
      adapter.connect();
      expect(mockClient.channel).toHaveBeenCalledTimes(1);
    });

    it('should flush pending messages when subscribed', () => {
      // Mock subscribe to not call callback immediately
      mockChannel.subscribe = vi.fn();
      
      adapter.joinSession('card-1', 'user-1');
      adapter.connect();
      
      expect(mockChannel.send).not.toHaveBeenCalled();
      
      const subscribeCallback = mockChannel.subscribe.mock.calls[0][0];
      subscribeCallback('SUBSCRIBED');
      
      expect(mockChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'join-session',
        payload: { cardId: 'card-1', userId: 'user-1' }
      });
    });
  });

  describe('disconnect', () => {
    it('should remove the main channel and clear state', () => {
      adapter.connect();
      adapter.disconnect();
      expect(mockClient.removeChannel).toHaveBeenCalledWith(mockChannel);
    });

    it('should cleanup auth channels', () => {
      adapter.joinAuth('state-1');
      adapter.disconnect();
      expect(mockClient.removeChannel).toHaveBeenCalledTimes(1); 
    });
  });

  describe('message sending', () => {
    beforeEach(() => {
      adapter.connect();
    });

    it('joinSession should send join-session event', () => {
      adapter.joinSession('card-1', 'user-1');
      expect(mockChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'join-session',
        payload: { cardId: 'card-1', userId: 'user-1' }
      });
    });

    it('updateState should send voting-state-updated event', () => {
      const state: VotingState = { cardId: 'c1', cardTitle: 'T1', status: 'voting', votes: {}, participants: [] };
      adapter.updateState('c1', state);
      expect(mockChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'voting-state-updated',
        payload: state
      });
    });

    it('castVote should send cast-vote event', () => {
      adapter.castVote('c1', 'u1', '5');
      expect(mockChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'cast-vote',
        payload: { cardId: 'c1', userId: 'u1', vote: '5' }
      });
    });

    it('endSession should send voting-state-updated with null status', () => {
      adapter.endSession('c1');
      expect(mockChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'voting-state-updated',
        payload: { cardId: 'c1', status: null }
      });
    });
  });

  describe('onStateUpdate', () => {
    it('should register and unregister callbacks', () => {
      const callback = vi.fn();
      const unsubscribe = adapter.onStateUpdate(callback);
      
      adapter.connect();
      const onBroadcastCallback = mockChannel.on.mock.calls[0][2];
      
      const state: VotingState = { cardId: 'c1', cardTitle: 'T1', status: 'voting', votes: {}, participants: [] };
      onBroadcastCallback({ payload: state });
      
      expect(callback).toHaveBeenCalledWith(state);
      
      unsubscribe();
      onBroadcastCallback({ payload: state });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in callbacks', () => {
      const callback = vi.fn().mockImplementation(() => { throw new Error('fail'); });
      adapter.onStateUpdate(callback);
      adapter.connect();
      const onBroadcastCallback = mockChannel.on.mock.calls[0][2];
      
      expect(() => onBroadcastCallback({ payload: {} })).not.toThrow();
    });
  });

  describe('auth signaling', () => {
    it('joinAuth should subscribe to auth channel', () => {
      adapter.joinAuth('state-1');
      expect(mockClient.channel).toHaveBeenCalledWith('auth-state-1');
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('sendAuthSuccess should subscribe and send success message', () => {
      vi.useFakeTimers();
      adapter.sendAuthSuccess('state-1', 'code-123');
      
      expect(mockClient.channel).toHaveBeenCalledWith('auth-state-1');
      expect(mockChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'auth-success',
        payload: { state: 'state-1', code: 'code-123' }
      });
      
      vi.advanceTimersByTime(2000);
      expect(mockClient.removeChannel).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('onAuthSuccess should listen to global auth-signal channel', () => {
      const callback = vi.fn();
      adapter.onAuthSuccess(callback);
      
      expect(mockClient.channel).toHaveBeenCalledWith('auth-signal');
      const onBroadcastCallback = mockChannel.on.mock.calls[0][2];
      
      onBroadcastCallback({ payload: { state: 's1', code: 'c1' } });
      expect(callback).toHaveBeenCalledWith({ state: 's1', code: 'c1' });
    });

    it('subscribeToAuth should listen and cleanup', () => {
      const callback = vi.fn();
      const unsubscribe = adapter.subscribeToAuth('state-1', callback);
      
      expect(mockClient.channel).toHaveBeenCalledWith('auth-state-1');
      const onBroadcastCallback = mockChannel.on.mock.calls[0][2];
      
      onBroadcastCallback({ payload: { state: 'state-1', code: 'code-1' } });
      expect(callback).toHaveBeenCalledWith('code-1');
      expect(mockClient.removeChannel).toHaveBeenCalled();
      
      unsubscribe();
      // Should not call removeChannel again if already cleaned up
      expect(mockClient.removeChannel).toHaveBeenCalledTimes(1);
    });
  });
});
