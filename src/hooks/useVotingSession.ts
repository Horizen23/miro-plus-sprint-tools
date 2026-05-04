import * as React from "react";
import { RealtimeFactory } from "../services/realtime/factory";
import { VotingState } from "../services/realtime/types";

export interface VotingSession {
  cardId: string;
  cardTitle: string;
  status: 'voting' | 'revealed';
  votes: Record<string, string>; // userId -> points
  participants?: string[]; // List of userIds who joined the room
  userNames?: Record<string, string>; // userId -> name
  estimateUnit?: 'pt' | 'h';
  facilitatorId?: string;
}

export function useVotingSession(
  selectedItems: any[],
  setIsProcessing: (val: boolean) => void,
  setActiveTab: (val: any) => void,
  handleSetPoints: (points: string, items?: any[]) => Promise<void>,
  estimateUnit: 'pt' | 'h',
  onFinished?: () => void
) {
  // Try to get cardId from URL for instant sync (used in modals)
  const urlParams = new URLSearchParams(window.location.search);
  const initialCardId = urlParams.get('cardId');

  const [votingSession, setVotingSession] = React.useState<VotingSession | null>(
    initialCardId ? { cardId: initialCardId, cardTitle: '', status: 'voting', votes: {} } : null
  );
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
        const info = await miro.board.getUserInfo();
        setCurrentUserId(info.id);
        setCurrentUserName(info.name || `User ${info.id.slice(-4)}`);
      } catch (e) {
        console.error("Failed to fetch user info", e);
      }
    };
    fetchUser();
  }, []);

  // Realtime Integration (Adapter Pattern)
  React.useEffect(() => {
    const realtime = RealtimeFactory.getInstance();
    realtime.connect();

    // Join room if we have a session
    if (votingSession?.cardId && currentUserId) {
      realtime.joinSession(votingSession.cardId, currentUserId);
    }

    const handleUpdate = (state: VotingSession) => {
      
      setVotingSession(prevSession => {
        // Handle session end
        if (state.status === null) {
          if (prevSession && state.cardId === prevSession.cardId) {
            lastSessionId.current = null;
            return null;
          }
          return prevSession;
        }

        // Handle updates for current session
        if (prevSession && state.cardId === prevSession.cardId) {
          return state;
        }
        
        // Discover NEW session
        if (!prevSession && state.status === 'voting' && state.cardId !== lastSessionId.current) {
          return state;
        }

        return prevSession;
      });
    };

    realtime.onStateUpdate(handleUpdate as any);
    return () => {
      // Note: We don't necessarily want to disconnect on every re-render, 
      // the factory manages the instance.
    };
  }, [votingSession?.cardId, currentUserId]);

  const syncVotingSession = async () => {
    try {
      let cardId = votingSession?.cardId;
      
      // If we already have a cardId, just sync that specific card (High performance)
      if (cardId && cardId !== '0') {
        const card = await miro.board.getById(cardId) as any;
        if (card && card.getMetadata) {
          const votingMetaKey = process.env.NEXT_PUBLIC_MIRO_METADATA_VOTING_KEY || "plus-sprint-tools";
          const metadata = await card.getMetadata(votingMetaKey) as VotingSession | null;
          if (metadata && (metadata.status === 'voting' || metadata.status === 'revealed')) {
            // Update local state immediately
            setVotingSession(metadata);
            
            // Ensure realtime server has this state (in case of server restart/lost memory)
            const realtime = RealtimeFactory.getInstance();
            realtime.updateState(metadata.cardId, metadata as any);
            
            // Notification trigger for others
            if (metadata.status === 'voting' && lastSessionId.current !== metadata.cardId) {
              const displayTitle = metadata.cardTitle.length > 50 
                ? metadata.cardTitle.substring(0, 47) + "..." 
                : metadata.cardTitle;
              await miro.board.notifications.showInfo(`Estimation Started: ${displayTitle}`);
              lastSessionId.current = metadata.cardId;
            }
            return; // Done
          }
        }
        // If we reach here, the session on this card is gone
        setVotingSession(null);
        lastSessionId.current = null;
        cardId = undefined;
      }

      // If no cardId or session ended, look for any active session on the board
      const selection = await miro.board.getSelection();
      if (selection.length === 1 && (selection[0].type === 'card' || selection[0].type === 'app_card')) {
        cardId = selection[0].id;
      } else {
        const [cards, appCards] = await Promise.all([
          miro.board.get({ type: 'card' }),
          miro.board.get({ type: 'app_card' })
        ]);
        const allCards = [...cards, ...appCards];
        
        // Parallel check for faster discovery
        const results = await Promise.all(allCards.map(async (c) => {
          try {
            const votingMetaKey = process.env.NEXT_PUBLIC_MIRO_METADATA_VOTING_KEY || "plus-sprint-tools";
            const meta = await (c as any).getMetadata(votingMetaKey) as VotingSession | null;
            return { id: c.id, meta };
          } catch (e) {
            return { id: c.id, meta: null };
          }
        }));

        for (const { id, meta } of results) {
          if (meta && (meta.status === 'voting' || meta.status === 'revealed')) {
            cardId = id;
            setVotingSession(meta);
            
            // Sync realtime server
            const realtime = RealtimeFactory.getInstance();
            realtime.updateState(id, meta as any);
            break;
          }
        }
      }
    } catch (e) {
      // Silent fail
    }
  };

  React.useEffect(() => {
    syncVotingSession();
    // Only sync on mount. Updates will be handled by Socket.io or manual actions.
  }, []); // Run once on mount

  // Separate, slow interval for online users (Doesn't need to be frequent)
  React.useEffect(() => {
    const updateOnline = async () => {
      try {
        const users = await miro.board.getOnlineUsers();
        setOnlineUsersCount(users.length);
      } catch (e) {}
    };
    updateOnline();
    const interval = setInterval(updateOnline, 15000); // Every 15 seconds
    return () => clearInterval(interval);
  }, []);

  // Auto-register presence in the room
  React.useEffect(() => {
    const joinRoom = async () => {
      if (votingSession?.status === 'voting' && currentUserId && votingSession.cardId) {
        const participants = votingSession.participants || [];
        if (!participants.includes(currentUserId)) {
          try {
            const card = await miro.board.getById(votingSession.cardId) as any;
            if (card && card.setMetadata) {
              const votingMetaKey = process.env.NEXT_PUBLIC_MIRO_METADATA_VOTING_KEY || "plus-sprint-tools";
              const currentMeta = await card.getMetadata(votingMetaKey) as VotingSession | null;
              if (currentMeta && currentMeta.status === 'voting') {
                const newParticipants = [...(currentMeta.participants || []), currentUserId];
                const newUserNames = { ...(currentMeta.userNames || {}), [currentUserId]: currentUserName };
                // Unique values only
                const uniqueParticipants = Array.from(new Set(newParticipants));
                const updatedSession = {
                  ...currentMeta,
                  participants: uniqueParticipants,
                  userNames: newUserNames
                };
                await card.setMetadata(votingMetaKey, updatedSession);
                
                // Broadcast the join to everyone else immediately
                const realtime = RealtimeFactory.getInstance();
                realtime.updateState(votingSession.cardId, updatedSession as any);
                
                setVotingSession(updatedSession);
              }
            }
          } catch (e) {
            // Ignore concurrent update errors
          }
        }
      }
    };
    joinRoom();
  }, [votingSession?.cardId, currentUserId, votingSession?.status]);

  const handleStartVoting = async () => {
    if (selectedItems.length !== 1) {
      await miro.board.notifications.showError("Please select exactly one card to start voting");
      return;
    }

    setIsProcessing(true);
    try {
      const card = selectedItems[0] as any;
      const newSession: VotingSession = {
        cardId: card.id,
        cardTitle: (card.title || "").replace(/<[^>]*>/g, ''),
        status: 'voting',
        votes: {},
        participants: [currentUserId],
        userNames: { [currentUserId]: currentUserName },
        facilitatorId: currentUserId,
        estimateUnit
      };

      if (card.setMetadata) {
        const votingMetaKey = process.env.NEXT_PUBLIC_MIRO_METADATA_VOTING_KEY || "plus-sprint-tools";
        await card.setMetadata(votingMetaKey, newSession);
        setVotingSession(newSession);
        
        // Notify via realtime
        const realtime = RealtimeFactory.getInstance();
        realtime.updateState(card.id, newSession as any);
        
        setActiveTab('tools');
        await miro.board.notifications.showInfo("Voting started!");
      } else {
        // Fallback for older SDK
        card.metadata = card.metadata || {};
        const votingMetaKey = process.env.NEXT_PUBLIC_MIRO_METADATA_VOTING_KEY || "plus-sprint-tools";
        card.metadata[votingMetaKey] = newSession;
        await card.sync();
        setVotingSession(newSession);

        const realtime = RealtimeFactory.getInstance();
        realtime.updateState(card.id, newSession as any);

        setActiveTab('tools');
      }
    } catch (e) {
      console.error("Start voting failed", e);
      await miro.board.notifications.showError("Could not start voting");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCastVote = async (points: string) => {
    if (!votingSession) return;

    try {
      const card = await miro.board.getById(votingSession.cardId) as any;
      if (!card || !card.setMetadata) {
        await miro.board.notifications.showError("Voting card not found or inaccessible");
        return;
      }

      // Retry logic for metadata update (max 2 attempts)
      let success = false;
      let attempts = 0;
      
      while (!success && attempts < 2) {
        try {
          const votingMetaKey = process.env.NEXT_PUBLIC_MIRO_METADATA_VOTING_KEY || "plus-sprint-tools";
          const currentMetadata = await card.getMetadata(votingMetaKey) as VotingSession;
          const currentSession = currentMetadata || votingSession;
          
          const updatedSession = {
            ...currentSession,
            votes: {
              ...currentSession.votes
            }
          };

          if (points === "") {
            delete updatedSession.votes[currentUserId];
          } else {
            updatedSession.votes[currentUserId] = points;
          }

          await card.setMetadata(votingMetaKey, updatedSession);
          setVotingSession(updatedSession);
          
          // Emit vote via realtime for instant sync
          const realtime = RealtimeFactory.getInstance();
          realtime.castVote(votingSession.cardId, currentUserId, points);
          
          success = true;
        } catch (retryError) {
          attempts++;
          if (attempts >= 2) throw retryError;
          await new Promise(resolve => setTimeout(resolve, 500)); // wait 500ms before retry
        }
      }
    } catch (e: any) {
      console.error("Cast vote failed", e);
      if (e.message?.includes("Metadata update failed")) {
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
    if (!votingSession) return;
    const card = await miro.board.getById(votingSession.cardId) as any;
    if (!card || !card.setMetadata) return;

    const updatedSession = {
      ...votingSession,
      status: 'voting' as const,
      votes: {}
    };

    const votingMetaKey = process.env.NEXT_PUBLIC_MIRO_METADATA_VOTING_KEY || "plus-sprint-tools";
    await card.setMetadata(votingMetaKey, updatedSession);
    
    // Broadcast to everyone
    const realtime = RealtimeFactory.getInstance();
    realtime.updateState(votingSession.cardId, updatedSession as any);
    
    setVotingSession(updatedSession);
  };

  const handleRevealVotes = async () => {
    if (!votingSession) return;
    const card = await miro.board.getById(votingSession.cardId) as any;
    if (!card || !card.setMetadata) return;

    const updatedSession = {
      ...votingSession,
      status: 'revealed' as const
    };

    const votingMetaKey = process.env.NEXT_PUBLIC_MIRO_METADATA_VOTING_KEY || "plus-sprint-tools";
    await card.setMetadata(votingMetaKey, updatedSession);
    
    // Broadcast to everyone via realtime
    const realtime = RealtimeFactory.getInstance();
    realtime.updateState(votingSession.cardId, updatedSession as any);
    
    setVotingSession(updatedSession);
  };

  const handleResetVoting = async () => {
    if (!votingSession) return;
    const cardId = votingSession.cardId;
    
    try {
      const card = await miro.board.getById(cardId) as any;
      if (card && card.setMetadata) {
        const votingMetaKey = process.env.NEXT_PUBLIC_MIRO_METADATA_VOTING_KEY || "plus-sprint-tools";
        await card.setMetadata(votingMetaKey, null);
      }
      
      // Notify realtime server to clear memory and broadcast to others
      const realtime = RealtimeFactory.getInstance();
      realtime.endSession(cardId);
      
      setVotingSession(null);
      lastSessionId.current = null;
      onFinished?.();
    } catch (e) {
      console.error("useVotingSession: Reset voting failed", e);
    }
  };

  const handleApplyVote = async (points: string) => {
    if (!votingSession) return;
    setIsProcessing(true);
    try {
      // Apply points specifically to the card involved in the voting session
      const card = await miro.board.getById(votingSession.cardId) as any;
      if (card) {
        await handleSetPoints(points, [card]);
      }
      await handleResetVoting();
      setActiveTab('tools');
      onFinished?.();
    } catch (e) {
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
