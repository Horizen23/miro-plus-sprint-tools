import * as React from 'react';
import { createPortal } from 'react-dom';
import { SectionHeader } from "./SectionHeader";
import { Button } from "./Button";
import { Badge } from "./Badge";

import { VotingSession as VotingSessionData } from "@/hooks/useVotingSession";

interface VotingSessionProps {
  votingSession: VotingSessionData;
  handleResetVoting: () => void;
  estimateUnit: 'pt' | 'h';
  handleCastVote: (p: string) => void;
  currentUserId: string;
  handleRevealVotes: () => void;
  handleApplyVote: (pts: string) => void;
  onlineUsersCount?: number;
  isModal?: boolean;
  handleRefresh?: () => Promise<void>;
  handleVoteAgain?: () => Promise<void>;
}

export const VotingSession: React.FC<VotingSessionProps> = ({
  votingSession,
  handleResetVoting,
  estimateUnit,
  handleCastVote,
  currentUserId,
  handleRevealVotes,
  handleApplyVote,
  onlineUsersCount,
  isModal = false,
  handleRefresh,
  handleVoteAgain
}) => {
  const points = estimateUnit === 'pt' 
    ? ['1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '144', '233', '377', '?']
    : ['1h', '2h', '3h', '4h', '5h', '6h', '7h', '8h', '9h', '10h', '12h', '14h', '16h', '?'];

  const revealed = votingSession.status === 'revealed';
  const votesList = Object.values(votingSession.votes);
  const totalVotes = votesList.length;
  
  // Calculate average for revealed status
  const numericVotes = votesList
    .map(v => parseFloat(v.replace('h', '')))
    .filter(v => !isNaN(v));
  
  const average = numericVotes.length > 0 
    ? (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(1)
    : null;

  const [applying, setApplying] = React.useState<string | null>(null);

  const handleApply = async (val: string) => {
    setApplying(val);
    try {
      await handleApplyVote(val);
    } finally {
      setApplying(null);
    }
  };

  const sortedVotes = React.useMemo(() => {
    const counts: Record<string, number> = {};
    votesList.forEach(v => {
      counts[v] = (counts[v] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [votingSession.votes]);

  return (
    <div className={`voting-session ${isModal ? 'is-modal' : ''}`}>
      {!isModal && (
        <SectionHeader 
          title="Active Voting" 
          icon={<span className="voting-pulse"></span>}
          rightElement={
            <Button variant="tiny" onClick={handleResetVoting}>Cancel</Button>
          }
        />
      )}

      <div className="voting-card-info">
        <h3 className="card-title">{votingSession.cardTitle}</h3>
        <div className="voting-stats-row">
          <Badge variant="count">{totalVotes} Votes</Badge>
          {onlineUsersCount !== undefined && <span className="online-count">{onlineUsersCount} Online</span>}
        </div>
      </div>

      {!revealed ? (
        <div className="voting-area">
          <div className="voting-grid">
            {points.map(p => (
              <button
                key={p}
                className={`voting-card-btn ${votingSession.votes[currentUserId] === p ? 'active' : ''}`}
                onClick={() => handleCastVote(p)}
              >
                {p}
              </button>
            ))}
          </div>
          
          <div className="voting-actions">
            <Button 
              fullWidth 
              variant="primary"
              disabled={totalVotes === 0}
              onClick={handleRevealVotes}
            >
              Reveal Results
            </Button>
            {handleRefresh && (
              <Button variant="secondary" onClick={handleRefresh} style={{ marginTop: '8px' }}>
                Refresh
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="results-area">
          <div className="results-summary">
            <div className="result-stat">
              <span className="label">Average</span>
              <span className="value">{average}{estimateUnit === 'h' ? 'h' : ''}</span>
            </div>
          </div>

          <div className="votes-breakdown">
            <h4>Distribution</h4>
            {sortedVotes.map(([val, count]) => (
              <div key={val} className="distribution-row">
                <div className="dist-label">
                  <span className="dist-value">{val}</span>
                  <span className="dist-count">{count} {count === 1 ? 'vote' : 'votes'}</span>
                </div>
                <div className="dist-bar-bg">
                  <div 
                    className="dist-bar-fill" 
                    style={{ width: `${(count / totalVotes) * 100}%` }}
                  ></div>
                </div>
                <Button 
                  variant="tiny" 
                  onClick={() => handleApply(val)}
                  loading={applying === val}
                  disabled={!!applying}
                >
                  Apply
                </Button>
              </div>
            ))}
          </div>

          <div className="participant-list">
            <h4>Participants</h4>
            <div className="participant-grid">
              {(votingSession.participants || []).map(pid => {
                const hasVoted = !!votingSession.votes[pid];
                const voteValue = votingSession.votes[pid];
                const name = votingSession.userNames?.[pid] || `User ${pid.slice(-4)}`;
                
                return (
                  <div key={pid} className="participant-item">
                    <span className={`status-dot ${hasVoted ? 'voted' : ''}`}></span>
                    <span className="p-name">{name}</span>
                    <span className="p-vote">{voteValue}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="results-actions">
            <Button fullWidth variant="secondary" onClick={handleVoteAgain}>
              Vote Again
            </Button>
            <Button fullWidth variant="delete" onClick={handleResetVoting} style={{ marginTop: '8px' }}>
              Close Session
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
