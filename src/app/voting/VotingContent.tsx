'use client';

import * as React from 'react';
import { VotingSession } from '@/components/VotingSession';
import { useVotingSession } from '@/hooks/useVotingSession';
import { handleSetPointsOnItem } from '@/utils/estimationUtils';

export default function VotingContent() {
  // Real implementation for applying points in the modal
  const handleSetPointsInModal = async (points: string, items?: any[]) => {
    if (!items || items.length === 0) return;
    for (const item of items) {
      await handleSetPointsOnItem(item, points);
    }
  };

  // Standalone voting page doesn't need to change tabs or have selected items
  const {
    votingSession,
    currentUserId,
    handleCastVote,
    handleRevealVotes,
    handleResetVoting,
    handleApplyVote,
    handleRefresh,
    handleVoteAgain,
    onlineUsersCount,
  } = useVotingSession(
    [],
    () => {},
    () => {},
    handleSetPointsInModal,
    'pt',
    () => {
      miro.board.ui.closeModal();
    }
  );

  if (!votingSession) {
    return (
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
        }}
      >
        <div style={{ textAlign: 'center', color: '#8c90b0' }}>
          <p>No active voting session found.</p>
          <p style={{ fontSize: '12px' }}>
            Please wait or ask the moderator to start a session.
          </p>
        </div>
      </div>
    );
  }

  return (
      <VotingSession
        votingSession={votingSession}
        handleResetVoting={handleResetVoting}
        estimateUnit={votingSession.estimateUnit || 'pt'}
        handleCastVote={handleCastVote}
        currentUserId={currentUserId}
        handleRevealVotes={handleRevealVotes}
        handleApplyVote={handleApplyVote}
        handleRefresh={handleRefresh}
        handleVoteAgain={handleVoteAgain}
        onlineUsersCount={onlineUsersCount}
        isModal={true}
      />
  );
}
