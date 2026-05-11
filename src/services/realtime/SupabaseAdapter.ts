import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { RealtimeService, VotingState, RealtimeCallback } from "./types";

export class SupabaseAdapter implements RealtimeService {
  private client: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private callback: RealtimeCallback | null = null;

  constructor(url: string, key: string) {
    this.client = createClient(url, key);
  }

  connect() {
    // We connect per session in Supabase usually, but we can set up a global listener
    this.channel = this.client.channel('voting-room', {
      config: {
        broadcast: { self: true },
      },
    });

    this.channel
      .on('broadcast', { event: 'voting-state-updated' }, (payload) => {
        if (this.callback) this.callback(payload.payload as VotingState);
      })
      .subscribe();
  }

  disconnect() {
    if (this.channel) {
      this.client.removeChannel(this.channel);
      this.channel = null;
    }
  }

  joinSession(cardId: string, userId: string) {
    // In Supabase broadcast, we don't necessarily need to "join" a room 
    // but we can send a join event if we want to track presence
    this.channel?.send({
      type: 'broadcast',
      event: 'join-session',
      payload: { cardId, userId },
    });
  }

  updateState(cardId: string, state: VotingState) {
    this.channel?.send({
      type: 'broadcast',
      event: 'voting-state-updated',
      payload: state,
    });
  }

  castVote(cardId: string, userId: string, vote: string) {
    // For Supabase, we usually update the whole state or a partial state.
    // Since we want to mimic Socket.io logic:
    this.channel?.send({
      type: 'broadcast',
      event: 'cast-vote',
      payload: { cardId, userId, vote },
    });
  }

  endSession(cardId: string) {
    this.channel?.send({
      type: 'broadcast',
      event: 'voting-state-updated',
      payload: { cardId, status: null },
    });
  }

  onStateUpdate(callback: RealtimeCallback) {
    this.callback = callback;
  }

  joinAuth(state: string) {
    // For Supabase, we create a specific channel for this state
    this.client.channel(`auth-${state}`).subscribe();
  }

  sendAuthSuccess(state: string, code: string) {
    const channel = this.client.channel(`auth-${state}`);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({
          type: 'broadcast',
          event: 'auth-success',
          payload: { state, code }
        });
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
    const channel = this.client.channel(`auth-${state}`)
      .on('broadcast', { event: 'auth-success' }, (payload) => {
        if (payload.payload?.code) {
          callback(payload.payload.code);
          this.client.removeChannel(channel);
        }
      })
      .subscribe();
    return channel;
  }
}
