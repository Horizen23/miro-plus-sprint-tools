import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { RealtimeService, VotingState, RealtimeCallback } from "./types";

export class SupabaseAdapter implements RealtimeService {
  private client: SupabaseClient;
  private channel: RealtimeChannel | null = null;

  // Suggestion 1: Set of callbacks instead of single callback
  private callbacks = new Set<RealtimeCallback>();

  // Suggestion 2: Channel readiness gate — queues messages until SUBSCRIBED
  private channelReady = false;
  private pendingMessages: Array<{ event: string; payload: any }> = [];

  // Suggestion 4: Auth channel pool to prevent leaks
  private authChannels = new Map<string, RealtimeChannel>();

  constructor(url: string, key: string) {
    this.client = createClient(url, key);
  }

  connect(boardId?: string) {
    // Guard — prevent double-connect
    if (this.channel) return;

    const roomName = boardId ? `voting-room-${boardId}` : 'voting-room';
    this.channel = this.client.channel(roomName, {
      config: {
        broadcast: { self: true },
      },
    });

    this.channel
      .on('broadcast', { event: 'voting-state-updated' }, (payload) => {
        this.notifyAll(payload.payload as VotingState);
      })
      // Wait for SUBSCRIBED before allowing sends
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.channelReady = true;
          // Flush any messages that were queued before the channel was ready
          for (const msg of this.pendingMessages) {
            this.channel!.send({ type: 'broadcast', ...msg });
          }
          this.pendingMessages = [];
        }
      });
  }

  disconnect() {
    if (this.channel) {
      this.client.removeChannel(this.channel);
      this.channel = null;
      this.channelReady = false;
      this.pendingMessages = [];
    }
    // Suggestion 4: Cleanup all auth channels too
    for (const [, ch] of this.authChannels) {
      this.client.removeChannel(ch);
    }
    this.authChannels.clear();
  }

  joinSession(cardId: string, userId: string) {
    // In Supabase broadcast, we don't necessarily need to "join" a room 
    // but we can send a join event if we want to track presence
    this.safeSend('join-session', { cardId, userId });
  }

  updateState(cardId: string, state: VotingState) {
    this.safeSend('voting-state-updated', state);
  }

  castVote(cardId: string, userId: string, vote: string) {
    // For Supabase, we usually update the whole state or a partial state.
    // Since we want to mimic Socket.io logic:
    this.safeSend('cast-vote', { cardId, userId, vote });
  }

  endSession(cardId: string) {
    this.safeSend('voting-state-updated', { cardId, status: null });
  }

  /**
   * Register a state update listener.
   * Returns an unsubscribe function to remove this specific listener.
   */
  onStateUpdate(callback: RealtimeCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  joinAuth(state: string) {
    // Suggestion 4: Reuse existing channel if available
    const channel = this.getOrCreateAuthChannel(state);
    channel.subscribe();
  }

  sendAuthSuccess(state: string, code: string) {
    const channel = this.getOrCreateAuthChannel(state);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({
          type: 'broadcast',
          event: 'auth-success',
          payload: { state, code }
        });
        // Cleanup after a short delay to ensure delivery
        setTimeout(() => this.cleanupAuthChannel(state), 2000);
      }
    });
  }

  onAuthSuccess(callback: (data: { state: string, code: string }) => void) {
    // We listen to all auth-success events globally or we could filter
    // Since we usually have the state from getMetadata, we can subscribe specifically
    this.client.channel('auth-signal')
      .on('broadcast', { event: 'auth-success' }, (payload) => {
        callback(payload.payload as { state: string, code: string });
      })
      .subscribe();
  }
  
  // Helper to subscribe to a specific state (cleaner for the app)
  subscribeToAuth(state: string, callback: (code: string) => void) {
    const channel = this.getOrCreateAuthChannel(state);
    channel
      .on('broadcast', { event: 'auth-success' }, (payload) => {
        if (payload.payload?.code) {
          callback(payload.payload.code);
          this.cleanupAuthChannel(state);
        }
      })
      .subscribe();
    return () => {
      this.cleanupAuthChannel(state);
    };
  }

  // --- Private helpers ---

  /** Notify all registered callbacks */
  private notifyAll(state: VotingState) {
    for (const cb of this.callbacks) {
      try {
        cb(state);
      } catch (e) {
        console.error('[SupabaseAdapter] Callback error:', e);
      }
    }
  }

  /** Suggestion 2: Send a message, queuing it if channel is not yet SUBSCRIBED */
  private safeSend(event: string, payload: any) {
    if (this.channelReady && this.channel) {
      this.channel.send({ type: 'broadcast', event, payload });
    } else {
      this.pendingMessages.push({ event, payload });
    }
  }

  /** Suggestion 4: Reuse or create an auth channel to prevent duplicates */
  private getOrCreateAuthChannel(state: string): RealtimeChannel {
    const key = `auth-${state}`;
    const existing = this.authChannels.get(key);
    if (existing) return existing;

    const channel = this.client.channel(key);
    this.authChannels.set(key, channel);
    return channel;
  }

  /** Suggestion 4: Remove and cleanup a specific auth channel */
  private cleanupAuthChannel(state: string) {
    const key = `auth-${state}`;
    const channel = this.authChannels.get(key);
    if (channel) {
      this.client.removeChannel(channel);
      this.authChannels.delete(key);
    }
  }
}
