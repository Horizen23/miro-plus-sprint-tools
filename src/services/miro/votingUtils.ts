import type { Card, AppCard, Json, Tag } from "@mirohq/websdk-types";
import { RealtimeFactory } from "../realtime/factory";

export interface VotingSession {
  cardId: string;
  cardTitle: string;
  status: 'voting' | 'revealed';
  votes: Record<string, string>; // userId -> points
  participants?: string[]; // List of userIds who joined the room
  userNames?: Record<string, string>; // userId -> name
  estimateUnit?: 'pt' | 'h';
  facilitatorId?: string;
  [key: string]: Json | undefined;
}

const VOTING_META_KEY = process.env.NEXT_PUBLIC_MIRO_METADATA_VOTING_KEY || "plus-sprint-tools";

/**
 * Utility to fetch voting session metadata from a Miro card.
 */
export async function getVotingMetadata(card: Card | AppCard): Promise<VotingSession | null> {
  try {
    const metadata = await card.getMetadata(VOTING_META_KEY);
    if (metadata && typeof metadata === 'object' && ('status' in metadata)) {
      return metadata as unknown as VotingSession;
    }
  } catch (e: unknown) {
    console.warn(`[votingUtils] Failed to get metadata for ${card.id}`, e);
  }
  return null;
}

/**
 * Utility to save voting session metadata to a Miro card and sync with realtime.
 */
export async function saveVotingMetadata(card: Card | AppCard, session: VotingSession | null): Promise<void> {
  try {
    await card.setMetadata(VOTING_META_KEY, session as unknown as Record<string, Json>);
    
    const realtime = RealtimeFactory.getInstance();
    if (session) {
      realtime.updateState(session.cardId, {
        ...session,
        participants: session.participants || []
      });
    } else {
      realtime.endSession(card.id);
    }
  } catch (e: unknown) {
    console.error(`[votingUtils] Failed to save metadata for ${card.id}`, e);
    throw e;
  }
}

/**
 * Utility to find any active voting session on the board.
 */
export async function findActiveVotingSession(): Promise<VotingSession | null> {
  if (typeof miro === 'undefined') return null;
  
  try {
    const selection = await miro.board.getSelection();
    if (selection.length === 1 && (selection[0].type === 'card' || selection[0].type === 'app_card')) {
      const session = await getVotingMetadata(selection[0] as Card | AppCard);
      if (session?.status) return session;
    }

    const [cards, appCards] = await Promise.all([
      miro.board.get({ type: 'card' }),
      miro.board.get({ type: 'app_card' })
    ]);
    
    const allCards = [...cards, ...appCards];
    for (const card of allCards) {
      const session = await getVotingMetadata(card as Card | AppCard);
      if (session?.status) return session;
    }
  } catch (e: unknown) {}
  
  return null;
}
