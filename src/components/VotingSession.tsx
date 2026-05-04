import * as React from "react";
import { SectionHeader } from "./SectionHeader";
import { Button } from "./Button";
import { Badge } from "./Badge";

interface VotingSessionProps {
  votingSession: any;
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
  onlineUsersCount = 1,
  isModal = false,
  handleRefresh,
  handleVoteAgain,
}) => {
  if (!votingSession) return null;

  const participantsList = Array.from(new Set([...(votingSession.participants || []), ...Object.keys(votingSession.votes)]));
  const totalParticipants = participantsList.length;
  const votedCount = Object.keys(votingSession.votes).length;
  const progressWidth = Math.min(100, (votedCount / Math.max(1, totalParticipants)) * 100);
  const isFacilitator = currentUserId === votingSession.facilitatorId;
  const isAllVoted = votedCount === totalParticipants && totalParticipants > 0;

  return (
    <div className={isModal ? "voting-modal-container" : "voting-container"}>
      <div className="voting-card">
        <div style={{ marginBottom: '12px' }}>
            <SectionHeader 
              title={votingSession.cardTitle}
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>}
              rightElement={(
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Badge variant={votingSession.status === 'voting' ? 'status' : 'success'}>
                    {votingSession.status}
                  </Badge>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <Button variant="tiny" onClick={handleRefresh} title="Sync State">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                    </Button>
                    
                    {/* Everyone can leave the modal */}
                    <Button variant="tiny" onClick={() => miro.board.ui.closeModal()} title="Leave Room">
                      Leave
                    </Button>

                    {/* ONLY Facilitator can end the session */}
                    {isFacilitator && (
                      <Button variant="tiny" onClick={handleResetVoting} style={{ background: '#ff4d4f', border: 'none' }} title="End Session">End</Button>
                    )}
                  </div>
                </div>
              )}
            />
          </div>

          {votingSession.status === 'voting' ? (
            <div className="voting-body" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div className="voting-progress-container" style={{ marginBottom: '16px' }}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '11px'}}>
                  <span style={{color: '#8c90b0', fontWeight: 600}}>VOTING PROGRESS</span>
                  <span style={{fontWeight: '800', color: isAllVoted ? '#34d399' : '#4262ff'}}>
                    {isAllVoted ? 'EVERYONE READY' : `${votedCount} OF ${totalParticipants} VOTED`}
                  </span>
                </div>
                <div className="voting-progress-bg" style={{ height: '8px', background: '#f1f5f9' }}>
                  <div className="voting-progress-bar" style={{ 
                    width: `${progressWidth}%`, 
                    background: isAllVoted ? '#34d399' : '#4262ff',
                    boxShadow: isAllVoted ? '0 0 10px rgba(52, 211, 153, 0.4)' : 'none'
                  }}></div>
                </div>
              </div>

              <p className="voting-hint" style={{ fontWeight: 700, color: '#050038' }}>Pick a card:</p>
              <div className="voting-card-buttons">
                {(estimateUnit === 'pt' 
                  ? ['1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '144', '233', '377', '?']
                  : ['1h', '2h', '4h', '8h', '12h', '16h', '24h', '32h', '40h', '?']
                ).map(p => (
                  <button 
                    key={p} 
                    className={`voting-card-btn ${votingSession.votes[currentUserId] === p ? 'active' : ''}`}
                    onClick={() => handleCastVote(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            
            <div className="voters-list" style={{marginTop: '16px'}}>
              <span className="group-title" style={{marginBottom: '10px', display: 'block'}}>PARTICIPANTS</span>
              <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                {participantsList.map((vId: string) => {
                  const hasVoted = !!votingSession.votes[vId];
                  const isUserFacilitator = vId === votingSession.facilitatorId;
                  const displayName = vId === currentUserId ? 'You' : (votingSession.userNames?.[vId] || `User ${vId.slice(-4)}`);
                  
                  return (
                    <div key={vId} className={`voter-row ${hasVoted ? 'voted' : ''}`} style={{
                      padding: '10px 14px', 
                      borderRadius: '12px', 
                      background: hasVoted ? '#f0fdf4' : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      border: `1px solid ${hasVoted ? '#bbf7d0' : '#e2e8f0'}`,
                      transition: 'all 0.2s ease',
                      boxShadow: hasVoted ? '0 2px 4px rgba(0,0,0,0.02)' : 'none'
                    }}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                        <div style={{
                          width: '8px', 
                          height: '8px', 
                          borderRadius: '50%', 
                          background: hasVoted ? '#10b981' : '#f6ad55',
                          boxShadow: `0 0 8px ${hasVoted ? 'rgba(16, 185, 129, 0.4)' : 'rgba(246, 173, 85, 0.4)'}`
                        }}></div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className="voter-name" style={{fontSize: '13px', fontWeight: 700, color: '#1e293b'}}>
                            {displayName}
                            {isUserFacilitator && <span className="facilitator-badge" style={{ marginLeft: '8px' }}>Host</span>}
                          </span>
                          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>
                            {hasVoted ? 'READY TO REVEAL' : 'STILL THINKING...'}
                          </span>
                        </div>
                      </div>
                      
                      {hasVoted && (
                        <div className="check-icon" style={{ animation: 'checkPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {isFacilitator && (
              <Button 
                variant="primary" 
                onClick={handleRevealVotes} 
                fullWidth 
                style={{ 
                  marginTop: '20px', 
                  height: '44px', 
                  fontSize: '14px', 
                  fontWeight: 900,
                  background: isAllVoted ? '#4262ff' : '#8c90b0',
                  boxShadow: isAllVoted ? '0 8px 16px rgba(66, 98, 255, 0.3)' : 'none',
                  animation: isAllVoted ? 'pulseConsensus 2s infinite' : 'none'
                }}
              >
                {isAllVoted ? 'REVEAL RESULTS' : 'REVEAL EARLY'}
              </Button>
            )}
          </div>
        ) : (
          <div className="voting-body" style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ 
              background: '#f8fafc', 
              padding: '24px 16px', 
              borderRadius: '20px', 
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              border: '2px solid #e2e8f0'
            }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Final Consensus</span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <h2 style={{ fontSize: '48px', margin: 0, color: '#4262ff', fontWeight: 950 }}>
                  {(() => {
                    const votes = Object.values(votingSession.votes).filter(v => v !== '?') as string[];
                    if (votes.length === 0) return '?';
                    const counts: any = {};
                    votes.forEach(v => counts[v] = (counts[v] || 0) + 1);
                    const winner = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                    const isConsensus = counts[winner] === totalParticipants;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {winner}{votingSession.estimateUnit === 'pt' ? 'P' : 'h'}
                        {isConsensus && (
                          <span className="consensus-tag" style={{ animation: 'bounce 1s infinite' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Consensus
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </h2>
              </div>
            </div>

            <span className="group-title" style={{ marginBottom: '12px', display: 'block' }}>INDIVIDUAL VOTES</span>
            <div className="results-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(85px, 1fr))', gap: '10px' }}>
              {participantsList.map(vId => (
                <div 
                  key={vId} 
                  className="result-card-inner" 
                  onClick={() => {
                    if (isFacilitator && votingSession.votes[vId] && votingSession.votes[vId] !== '?') {
                      handleApplyVote(votingSession.votes[vId]);
                    }
                  }}
                  style={{ 
                    cursor: isFacilitator && votingSession.votes[vId] && votingSession.votes[vId] !== '?' ? 'pointer' : 'default',
                    position: 'relative'
                  }}
                >
                  <span style={{ fontSize: '24px', fontWeight: 950, color: '#4262ff', marginBottom: '2px' }}>
                    {votingSession.votes[vId] || '-'}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#1e293b', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {vId === currentUserId ? 'You' : (votingSession.userNames?.[vId] || `User ${vId.slice(-4)}`)}
                  </span>
                  {isFacilitator && votingSession.votes[vId] && votingSession.votes[vId] !== '?' && (
                    <div className="apply-hint" style={{ fontSize: '8px' }}>Apply</div>
                  )}
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Button variant="secondary" onClick={() => handleResetVoting()} fullWidth style={{ height: '40px', fontWeight: 700 }}>
                  Close
                </Button>
                {isFacilitator && (
                  <Button variant="primary" onClick={() => {
                    const votes = Object.values(votingSession.votes).filter(v => v !== '?') as string[];
                    if (votes.length === 0) return;
                    const counts: any = {};
                    votes.forEach(v => counts[v] = (counts[v] || 0) + 1);
                    const winner = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                    handleApplyVote(winner);
                  }} fullWidth style={{ height: '40px', fontWeight: 800 }}>
                    Apply Consensus
                  </Button>
                )}
              </div>
              
              {isFacilitator && (
                <Button variant="secondary" onClick={handleVoteAgain} fullWidth style={{ height: '40px', borderColor: '#4262ff', color: '#4262ff', fontWeight: 700, background: 'rgba(66, 98, 255, 0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                    Re-vote (Discuss & Try Again)
                  </div>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
