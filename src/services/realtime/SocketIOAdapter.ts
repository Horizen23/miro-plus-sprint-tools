import { io, Socket } from "socket.io-client";
import { RealtimeService, VotingState, RealtimeCallback } from "./types";

export class SocketIOAdapter implements RealtimeService {
  private socket: Socket | null = null;
  private callbacks = new Set<RealtimeCallback>();
  private boardId: string | null = null;

  constructor(private url: string) {}

  connect(boardId?: string) {
    // Guard: check existence, not just connected state — prevents duplicate during connecting phase
    if (this.socket) return;
    
    this.boardId = boardId || null;
    this.socket = io(this.url);
    
    // Join board-specific room
    if (this.boardId) {
      this.socket.on("connect", () => {
        this.socket?.emit("join-board", this.boardId);
      });
    }

    this.socket.on("voting-state-updated", (state: VotingState) => {
      this.notifyAll(state);
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  private safeEmit(event: string, data: unknown) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      this.socket?.once("connect", () => {
        this.socket?.emit(event, data);
      });
    }
  }

  joinSession(cardId: string, userId: string) {
    this.safeEmit("join-session", { cardId, userId });
  }

  updateState(cardId: string, state: VotingState) {
    this.safeEmit("update-voting-state", { cardId, state });
  }

  castVote(cardId: string, userId: string, vote: string) {
    this.safeEmit("cast-vote", { cardId, userId, vote });
  }

  endSession(cardId: string) {
    this.safeEmit("end-voting-session", cardId);
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
    this.safeEmit("join-auth", state);
  }

  sendAuthSuccess(state: string, code: string) {
    this.safeEmit("complete-auth", { state, code });
  }

  onAuthSuccess(callback: (data: { state: string, code: string }) => void) {
    this.socket?.on("auth-success", callback);
  }

  subscribeToAuth(state: string, callback: (code: string) => void) {
    this.joinAuth(state);
    const handler = (data: { state: string, code: string }) => {
      if (data.state === state) {
        callback(data.code);
        this.socket?.off("auth-success", handler);
      }
    };
    this.socket?.on("auth-success", handler);
    return () => {
      this.socket?.off("auth-success", handler);
    };
  }

  /** Notify all registered callbacks */
  private notifyAll(state: VotingState) {
    for (const cb of this.callbacks) {
      try {
        cb(state);
      } catch (e: unknown) {
        console.error('[SocketIOAdapter] Callback error:', e);
      }
    }
  }
}
