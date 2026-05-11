import { io, Socket } from "socket.io-client";
import { RealtimeService, VotingState, RealtimeCallback } from "./types";

export class SocketIOAdapter implements RealtimeService {
  private socket: Socket | null = null;
  private callback: RealtimeCallback | null = null;

  constructor(private url: string) {}

  connect() {
    if (this.socket?.connected) return;
    
    this.socket = io(this.url);
    
    this.socket.on("voting-state-updated", (state: VotingState) => {
      if (this.callback) this.callback(state);
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  private safeEmit(event: string, data: any) {
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

  onStateUpdate(callback: RealtimeCallback) {
    this.callback = callback;
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
    return handler;
  }
}
