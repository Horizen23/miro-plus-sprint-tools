export interface VotingState {
  cardId: string;
  cardTitle: string;
  status: 'voting' | 'revealed' | null;
  votes: Record<string, string>;
  participants: string[];
}

export type RealtimeCallback = (state: VotingState) => void;

export interface RealtimeService {
  connect(): void;
  disconnect(): void;
  joinSession(cardId: string, userId: string): void;
  updateState(cardId: string, state: VotingState): void;
  castVote(cardId: string, userId: string, vote: string): void;
  endSession(cardId: string): void;
  onStateUpdate(callback: RealtimeCallback): void;
  
  // Auth Signaling
  joinAuth(state: string): void;
  sendAuthSuccess(state: string, code: string): void;
  onAuthSuccess(callback: (data: { state: string, code: string }) => void): void;
  subscribeToAuth(state: string, callback: (code: string) => void): any;
}
