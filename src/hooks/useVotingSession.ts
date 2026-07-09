import * as React from "react";
import type { Card, AppCard, Json } from "@mirohq/websdk-types";
import { RealtimeFactory } from "../services/realtime/factory";
import { VotingState } from "../services/realtime/types";
import { Tab } from "@/contexts/PanelContext";
import { 
  type VotingSession, 
  getVotingMetadata, 
  saveVotingMetadata, 
  findActiveVotingSession 
} from "../services/miro/votingUtils";

export type { VotingSession };

export interface UseVotingSessionReturn {
  votingSession: VotingSession | null;
  currentUserId: string;
  handleStartVoting: () => Promise<void>;
  handleCastVote: (points: string) => Promise<void>;
  handleRevealVotes: () => Promise<void>;
  handleResetVoting: () => Promise<void>;
  handleApplyVote: (points: string) => Promise<void>;
  handleRefresh: () => Promise<void>;
  handleVoteAgain: () => Promise<void>;
  onlineUsersCount: number;
}

export function useVotingSession(
  selectedItems: (Card | AppCard)[],
  setIsProcessing: (val: boolean) => void,
  setActiveTab: (val: Tab) => void,
  handleSetPoints: (points: string, items?: (Card | AppCard)[]) => Promise<void>,
  estimateUnit: 'pt' | 'h',
  onFinished?: () => void
): UseVotingSessionReturn {
  const [votingSession, setVotingSession] = React.useState<VotingSession | null>(null);
  const votingSessionRef = React.useRef<VotingSession | null>(votingSession);
  
  // Keep ref in sync with state
  React.useEffect(() => {
    votingSessionRef.current = votingSession;
  }, [votingSession]);

  const [currentUserId, setCurrentUserId] = React.useState<string>("");
  const [currentUserName, setCurrentUserName] = React.useState<string>("");
  const [onlineUsersCount, setOnlineUsersCount] = React.useState<number>(0);
  const lastSessionId = React.useRef<string | null>(null);

  // Fetch User ID immediately on mount
  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        if (typeof miro === 'undefined') return;
        const info = await miro.board.getUserInfo();
        setCurrentUserId(info.id);
        setCurrentUserName(info.name || `User ${info.id.slice(-4)}`);
      } catch (e: unknown) {
        console.warn("Failed to fetch user info; voting will use an anonymous local user", e);
        const fallbackId = `anonymous-${Date.now().toString(36)}`;
        setCurrentUserId(fallbackId);
        setCurrentUserName("Anonymous");
      }
    };
    fetchUser();
  }, []);

  // Realtime Integration (Adapter Pattern)
  React.useEffect(() => {
    if (typeof miro === 'undefined') return;
    const realtime = RealtimeFactory.getInstance();

    const setup = async () => {
      try {
        const boardInfo = await miro.board.getInfo();
        realtime.connect(boardInfo.id);
      } catch {
        realtime.connect(); 
      }

      if (votingSession?.cardId && currentUserId) {
        realtime.joinSession(votingSession.cardId, currentUserId);
      }
    };
    setup();

    const handleUpdate = (state: VotingState) => {
      setVotingSession(prevSession => {
        if (state.status === null) {
          if (prevSession && state.cardId === prevSession.cardId) {
            lastSessionId.current = null;
            return null;
          }
          return prevSession;
        }

        const votingState = state as unknown as VotingSession;

        if (prevSession && votingState.cardId === prevSession.cardId) {
          const mergedParticipants = Array.from(new Set([
            ...(prevSession.participants || []),
            ...(votingState.participants || [])
          ]));
          const mergedUserNames = {
            ...(prevSession.userNames || {}),
            ...(votingState.userNames || {})
          };
          return {
            ...votingState,
            participants: mergedParticipants,
            userNames: mergedUserNames
          };
        }
        
        if (!prevSession && votingState.status === 'voting' && votingState.cardId !== lastSessionId.current) {
          return votingState;
        }

        return prevSession;
      });
    };

    const unsub = realtime.onStateUpdate(handleUpdate);
    return () => {
      unsub();
    };
  }, [votingSession?.cardId, currentUserId]);

  const syncVotingSession = async () => {
    try {
      if (typeof miro === 'undefined') return;
      let cardId = votingSession?.cardId;
      
      if (cardId && cardId !== '0') {
        const item = await miro.board.getById(cardId);
        if (item && (item.type === 'card' || item.type === 'app_card')) {
          const metadata = await getVotingMetadata(item as Card | AppCard);
          if (metadata && (metadata.status === 'voting' || metadata.status === 'revealed')) {
            const mergedParticipants = Array.from(new Set([
              ...(votingSessionRef.current?.participants || []),
              ...(metadata.participants || [])
            ]));
            const mergedUserNames = {
              ...(votingSessionRef.current?.userNames || {}),
              ...(metadata.userNames || {})
            };
            const mergedState: VotingSession = {
              ...metadata,
              participants: mergedParticipants,
              userNames: mergedUserNames
            };

            setVotingSession(mergedState);
            
            const prev = votingSessionRef.current;
            const hasChanges = !prev
              || mergedParticipants.length !== (prev.participants || []).length
              || Object.keys(metadata.votes || {}).length !== Object.keys(prev.votes || {}).length
              || metadata.status !== prev.status;
            
            if (hasChanges) {
              await saveVotingMetadata(item as Card | AppCard, mergedState);
            }
            
            if (metadata.status === 'voting' && lastSessionId.current !== metadata.cardId) {
              const displayTitle = metadata.cardTitle.length > 50 
                ? metadata.cardTitle.substring(0, 47) + "..." 
                : metadata.cardTitle;
              await miro.board.notifications.showInfo(`Estimation Started: ${displayTitle}`);
              lastSessionId.current = metadata.cardId;
            }
            return;
          }
        }
        setVotingSession(null);
        lastSessionId.current = null;
        cardId = undefined;
      }

      const activeSession = await findActiveVotingSession();
      if (activeSession) {
        setVotingSession(activeSession);
        const realtime = RealtimeFactory.getInstance();
        realtime.updateState(activeSession.cardId, {
          ...activeSession,
          participants: activeSession.participants || []
        });
      }
    } catch (e: unknown) {}
  };

  React.useEffect(() => {
    syncVotingSession();

    if (votingSession?.cardId && votingSession.status === 'voting') {
      const interval = setInterval(syncVotingSession, 5000);
      return () => clearInterval(interval);
    }
  }, [votingSession?.cardId, votingSession?.status]);

  React.useEffect(() => {
    const updateOnline = async () => {
      try {
        if (typeof miro !== 'undefined') {
          const users = await miro.board.getOnlineUsers();
          setOnlineUsersCount(users.length);
        }
      } catch (e: unknown) {}
    };
    updateOnline();
    const interval = setInterval(updateOnline, 15000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    const joinRoom = async () => {
      if (typeof miro === 'undefined') return;
      if (votingSession?.status === 'voting' && currentUserId && votingSession.cardId) {
        const participants = votingSession.participants || [];
        if (!participants.includes(currentUserId)) {
          try {
            const item = await miro.board.getById(votingSession.cardId);
            if (item && (item.type === 'card' || item.type === 'app_card')) {
              const card = item as Card | AppCard;
              const currentMeta = await getVotingMetadata(card);
              if (currentMeta && currentMeta.status === 'voting') {
                const uniqueParticipants = Array.from(new Set([...(currentMeta.participants || []), currentUserId]));
                const newUserNames = { ...(currentMeta.userNames || {}), [currentUserId]: currentUserName };
                const updatedSession: VotingSession = {
                  ...currentMeta,
                  participants: uniqueParticipants,
                  userNames: newUserNames
                };
                await saveVotingMetadata(card, updatedSession);
                setVotingSession(updatedSession);
              }
            }
          } catch (e: unknown) {}
        }
      }
    };
    joinRoom();
  }, [votingSession?.cardId, currentUserId, votingSession?.status]);

  const handleStartVoting = async () => {
    if (typeof miro === 'undefined') return;
    if (selectedItems.length !== 1) {
      await miro.board.notifications.showError("Please select exactly one card to start voting");
      return;
    }

    setIsProcessing(true);
    try {
      const card = selectedItems[0];
      const newSession: VotingSession = {
        cardId: card.id,
        cardTitle: (card.title || "").replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '),
        status: 'voting',
        votes: {},
        participants: [currentUserId],
        userNames: { [currentUserId]: currentUserName },
        facilitatorId: currentUserId,
        estimateUnit
      };

      await saveVotingMetadata(card, newSession);
      setVotingSession(newSession);
      setActiveTab('tools');
      await miro.board.notifications.showInfo("Voting started!");
    } catch (e: unknown) {
      console.error("Start voting failed", e);
      await miro.board.notifications.showError("Could not start voting");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCastVote = async (points: string) => {
    if (typeof miro === 'undefined' || !votingSession) return;

    try {
      const item = await miro.board.getById(votingSession.cardId);
      if (!item || (item.type !== 'card' && item.type !== 'app_card')) {
        await miro.board.notifications.showError("Voting card not found or inaccessible");
        return;
      }
      const card = item as Card | AppCard;

      let success = false;
      let attempts = 0;
      
      while (!success && attempts < 2) {
        try {
          const currentMetadata = await getVotingMetadata(card);
          const currentSession = currentMetadata || votingSession;
          
          const mergedParticipants = Array.from(new Set([
            ...(votingSessionRef.current?.participants || []),
            ...(currentSession.participants || [])
          ]));
          const mergedUserNames = {
            ...(votingSessionRef.current?.userNames || {}),
            ...(currentSession.userNames || {})
          };

          const updatedSession: VotingSession = {
            ...currentSession,
            participants: mergedParticipants,
            userNames: mergedUserNames,
            votes: {
              ...currentSession.votes
            }
          };

          if (points === "") {
            delete updatedSession.votes[currentUserId];
          } else {
            updatedSession.votes[currentUserId] = points;
          }

          await saveVotingMetadata(card, updatedSession);
          setVotingSession(updatedSession);
          success = true;
        } catch (retryError) {
          attempts++;
          if (attempts >= 2) throw retryError;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (e: unknown) {
      console.error("Cast vote failed", e);
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("Metadata update failed")) {
        await miro.board.notifications.showError("Permission Denied: You need 'Edit' access to the board to vote.");
      } else {
        await miro.board.notifications.showError("Failed to cast vote. Please try again.");
      }
    }
  };

  const handleRefresh = async () => {
    await syncVotingSession();
  };

  const handleVoteAgain = async () => {
    if (typeof miro === 'undefined' || !votingSession) return;
    const item = await miro.board.getById(votingSession.cardId);
    if (!item || (item.type !== 'card' && item.type !== 'app_card')) return;
    const card = item as Card | AppCard;

    const updatedSession: VotingSession = {
      ...votingSession,
      status: 'voting',
      votes: {}
    };

    await saveVotingMetadata(card, updatedSession);
    setVotingSession(updatedSession);
  };

  const handleRevealVotes = async () => {
    if (typeof miro === 'undefined' || !votingSession) return;
    const item = await miro.board.getById(votingSession.cardId);
    if (!item || (item.type !== 'card' && item.type !== 'app_card')) return;
    const card = item as Card | AppCard;

    const updatedSession: VotingSession = {
      ...votingSession,
      status: 'revealed'
    };

    await saveVotingMetadata(card, updatedSession);
    setVotingSession(updatedSession);
  };

  const handleResetVoting = async () => {
    if (typeof miro === 'undefined' || !votingSession) return;
    const cardId = votingSession.cardId;
    
    try {
      const item = await miro.board.getById(cardId);
      if (item && (item.type === 'card' || item.type === 'app_card')) {
        await saveVotingMetadata(item as Card | AppCard, null);
      } else {
        const realtime = RealtimeFactory.getInstance();
        realtime.endSession(cardId);
      }
      
      setVotingSession(null);
      lastSessionId.current = null;
      onFinished?.();
    } catch (e: unknown) {
      console.error("useVotingSession: Reset voting failed", e);
    }
  };

  const handleApplyVote = async (points: string) => {
    if (typeof miro === 'undefined' || !votingSession) return;
    setIsProcessing(true);
    try {
      const item = await miro.board.getById(votingSession.cardId);
      if (item && (item.type === 'card' || item.type === 'app_card')) {
        const card = item as Card | AppCard;
        await handleSetPoints(points, [card]);
      }
      await handleResetVoting();
      setActiveTab('tools');
      onFinished?.();
    } catch (e: unknown) {
      console.error("Apply vote failed", e);
      await miro.board.notifications.showError("Failed to apply results to the card.");
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    votingSession,
    currentUserId,
    handleStartVoting,
    handleCastVote,
    handleRevealVotes,
    handleResetVoting,
    handleApplyVote,
    handleRefresh,
    handleVoteAgain,
    onlineUsersCount
  };
}
