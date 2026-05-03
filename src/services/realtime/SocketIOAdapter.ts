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

  joinSession(cardId: string, userId: string) {
    this.socket?.emit("join-session", { cardId, userId });
  }

  updateState(cardId: string, state: VotingState) {
    this.socket?.emit("update-voting-state", { cardId, state });
  }

  castVote(cardId: string, userId: string, vote: string) {
    this.socket?.emit("cast-vote", { cardId, userId, vote });
  }

  endSession(cardId: string) {
    this.socket?.emit("end-voting-session", cardId);
  }

  onStateUpdate(callback: RealtimeCallback) {
    this.callback = callback;
  }
}
