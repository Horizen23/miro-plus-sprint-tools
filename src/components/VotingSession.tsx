import * as React from "react";
import { createPortal } from 'react-dom';
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
  const [showWheel, setShowWheel] = React.useState(false);
  const [isSpinning, setIsSpinning] = React.useState(false);
  const [wheelRotation, setWheelRotation] = React.useState(0);
  const [wheelResult, setWheelResult] = React.useState<string | null>(null);
  const [tooltip, setTooltip] = React.useState<{ visible: boolean; x: number; y: number; names: string[] }>({
    visible: false,
    x: 0,
    y: 0,
    names: []
  });

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
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <Button variant="tiny" onClick={handleRefresh} title="Sync State">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                    </Button>
                    <Badge variant={votingSession.status === 'voting' ? 'status' : 'success'}>
                      {votingSession.status}
                    </Badge>
                  </div>
              )}
            />
          </div>

          {votingSession.status === 'voting' ? (
            <div className="voting-body" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', animation: 'fadeIn 0.3s ease-out' }}>
              <div className="voting-progress-container" style={{ marginBottom: '20px' }}>
                <div className="voting-progress-header">
                  <span className="progress-label">Voting Progress</span>
                  <span className="progress-status" style={{ color: isAllVoted ? '#34d399' : '#4262ff' }}>
                    {isAllVoted ? 'Everyone Ready' : `${votedCount} OF ${totalParticipants} Voted`}
                  </span>
                </div>
                <div className="voting-progress-bg">
                  <div className="voting-progress-bar" style={{ width: `${progressWidth}%`, background: isAllVoted ? '#34d399' : '#4262ff' }}></div>
                </div>
              </div>
              <span className="group-title" style={{ marginBottom: '10px', display: 'block' }}>Pick a card</span>
              <div className="voting-card-buttons">
                {(estimateUnit === 'pt' 
                  ? ['1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '144', '233', '377', '?']
                  : [...Array.from({ length: 17 }, (_, i) => `${i + 1}h`), '?']
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
            
            <div className="voters-list" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                <span className="group-title" style={{ color: '#050038' }}>Participants</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }}></div>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>{onlineUsersCount} Online</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1 }}>
                {participantsList.map((vId: string) => {
                  const hasVoted = !!votingSession.votes[vId];
                  const isUserFacilitator = vId === votingSession.facilitatorId;
                  const displayName = vId === currentUserId ? 'You' : (votingSession.userNames?.[vId] || `User ${vId.slice(-4)}`);
                  
                  return (
                    <div key={vId} className={`voter-row ${hasVoted ? 'voted' : ''}`}>
                      <div className="voter-info">
                        <div className={`voter-status-dot ${hasVoted ? 'voted' : 'thinking'}`}></div>
                        <div className="voter-meta">
                          <span className="voter-name">
                            {displayName}
                            {isUserFacilitator && <span className="facilitator-badge">Host</span>}
                          </span>
                          <span className="voter-subtitle">
                            {hasVoted ? 'Ready to Reveal' : 'Still Thinking...'}
                          </span>
                        </div>
                      </div>
                      
                      {hasVoted && (
                        <div className="check-icon" style={{ background: 'transparent', animation: 'checkPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            </div>
        ) : (
          <div className="voting-body" style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div className="consensus-card" style={{ position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '10px', right: '10px', opacity: 0.1, color: '#4262ff' }}>
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                  <path d="M4 22h16"></path>
                  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
                </svg>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', zIndex: 1 }}>
                <span className="voter-subtitle" style={{ color: '#4262ff', fontSize: '10px', fontWeight: 900, letterSpacing: '1px' }}>FINAL ESTIMATE</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <h2 style={{ fontSize: '64px', margin: 0, color: '#050038', fontWeight: 950, letterSpacing: '-1px' }}>
                    {(() => {
                      const votes = Object.values(votingSession.votes).filter(v => v !== '?') as string[];
                      if (votes.length === 0) return '?';
                      const counts: any = {};
                      votes.forEach(v => counts[v] = (counts[v] || 0) + 1);
                      const winner = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                      // Remove unit if it's already there (e.g. "9h" -> "9")
                      return winner.replace(/[a-z]/g, '');
                    })()}
                  </h2>
                  <span style={{ fontSize: '24px', fontWeight: 900, color: '#4262ff', marginLeft: '8px' }}>
                    {votingSession.estimateUnit === 'pt' ? 'pts' : 'h'}
                  </span>
                </div>
                
                {(() => {
                  const votes = Object.values(votingSession.votes).filter(v => v !== '?') as string[];
                  if (votes.length === 0) return null;
                  const counts: any = {};
                  votes.forEach(v => counts[v] = (counts[v] || 0) + 1);
                  const winner = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                  const isConsensus = counts[winner] === totalParticipants;
                  
                  return isConsensus && (
                    <div className="consensus-tag" style={{ marginTop: '8px', padding: '4px 12px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginRight: '4px' }}><polyline points="20 6 9 17 4 12"></polyline></svg>
                      UNANIMOUS CONSENSUS
                    </div>
                  );
                })()}
              </div>
            </div>

            <span className="group-title" style={{ marginBottom: '12px', display: 'block' }}>INDIVIDUAL VOTES</span>
            <div className="results-grid">
              {(() => {
                const groupedVotes: Record<string, string[]> = {};
                participantsList.forEach(vId => {
                  const vote = votingSession.votes[vId] || '-';
                  if (!groupedVotes[vote]) groupedVotes[vote] = [];
                  groupedVotes[vote].push(vId);
                });

                return Object.entries(groupedVotes).sort((a, b) => b[1].length - a[1].length).map(([vote, vIds]) => (
                  <div 
                    key={vote} 
                    className="result-card-inner" 
                    onClick={() => {
                      if (isFacilitator && vote !== '-' && vote !== '?') {
                        handleApplyVote(vote);
                      }
                    }}
                    style={{ 
                      cursor: isFacilitator && vote !== '-' && vote !== '?' ? 'pointer' : 'default',
                      position: 'relative',
                      minHeight: '100px',
                      padding: '12px 8px'
                    }}
                  >
                    
                    <span style={{ fontSize: '24px', fontWeight: 900, color: '#4262ff', marginBottom: '8px' }}>
                      {vote}
                    </span>
                    
                    <div 
                      className="voter-tooltip-container" 
                      style={{ marginTop: 'auto' }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({
                          visible: true,
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                          names: vIds.map(vId => vId === currentUserId ? 'You' : (votingSession.userNames?.[vId] || `User ${vId.slice(-4)}`))
                        });
                      }}
                      onMouseLeave={() => setTooltip(prev => ({ ...prev, visible: false }))}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontSize: '10px', fontWeight: 700 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        {vIds.length}
                      </div>
                    </div>

                    {isFacilitator && vote !== '-' && vote !== '?' && (
                      <div className="apply-hint" style={{ fontSize: '7px', marginTop: '6px', opacity: 0.4 }}>Click to Apply</div>
                    )}
                  </div>
                ));
              })()}
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
              
              <div style={{ display: 'flex', gap: '10px' }}>
                {isFacilitator && (
                  <Button 
                    variant="secondary" 
                    onClick={() => setShowWheel(true)} 
                    fullWidth 
                    style={{ height: '40px', borderColor: '#ff4d4f', color: '#ff4d4f', fontWeight: 700, background: 'rgba(255, 77, 79, 0.05)' }}
                    icon={(
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
                      </svg>
                    )}
                  >
                    Spin Wheel (Tie Breaker)
                  </Button>
                )}

                {isFacilitator && (
                  <Button variant="secondary" onClick={handleVoteAgain} fullWidth style={{ height: '40px', borderColor: '#4262ff', color: '#4262ff', fontWeight: 700, background: 'rgba(66, 98, 255, 0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                      Re-vote
                    </div>
                  </Button>
                )}
              </div>
            </div>
            
          </div>
        )}

        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '10px', 
          marginTop: 'auto', 
          paddingTop: '12px', 
          borderTop: '1px solid #f1f5f9', 
          paddingBottom: '24px',
          flexShrink: 0 
        }}>
          {votingSession.status === 'voting' && isFacilitator && (
            <Button 
              variant="primary" 
              onClick={handleRevealVotes} 
              fullWidth 
              style={{ 
                height: '44px', 
                fontSize: '14px', 
                fontWeight: 900,
                background: isAllVoted ? '#4262ff' : '#8c90b0',
                boxShadow: isAllVoted ? '0 8px 16px rgba(66, 98, 255, 0.3)' : 'none'
              }}
            >
              {isAllVoted ? 'REVEAL RESULTS' : 'REVEAL EARLY'}
            </Button>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="tiny" onClick={() => miro.board.ui.closeModal()} title="Leave Room">
              Leave Room
            </Button>
            {isFacilitator && (
              <Button variant="tiny" onClick={handleResetVoting} style={{ color: '#ef4444', fontWeight: 700 }} title="End Session">End Session</Button>
            )}
          </div>
        </div>



        {/* Root-level Tooltip via Portal */}
        {tooltip.visible && typeof document !== 'undefined' && createPortal(
          <div 
            className="voter-tooltip" 
            style={{ 
              visibility: 'visible', 
              opacity: 1, 
              position: 'fixed', 
              left: `${tooltip.x}px`, 
              top: `${tooltip.y - 10}px`,
              bottom: 'auto',
              transform: 'translate(-50%, -100%)',
              zIndex: 999999,
              pointerEvents: 'none',
              display: 'block'
            }}
          >
            <span className="voter-tooltip-header">Voters</span>
            {tooltip.names.map((name, i) => (
              <div key={i} className="voter-tooltip-item">
                {name}
              </div>
            ))}
          </div>,
          document.body
        )}
      </div>

      {showWheel && (
        <div className="wheel-overlay" onClick={() => !isSpinning && setShowWheel(false)}>
          <div className="wheel-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#050038' }}>Decision Wheel</h3>
            <p style={{ margin: 0, fontSize: '11px', color: '#8c90b0', textAlign: 'center' }}>Can't agree? Let the wheel pick for you!</p>
            
            <div className="wheel-container">
              <div className="wheel-pointer"></div>
              <div className="wheel-inner" style={{ 
                transform: `rotate(${wheelRotation}deg)`,
                background: (() => {
                  const votes = Object.values(votingSession.votes).filter(v => v !== '?') as string[];
                  const uniqueVotes = Array.from(new Set(votes));
                  if (uniqueVotes.length === 0) return '#f1f5f9';
                  const colors = ['#4262ff', '#34d399', '#ff4d4f', '#faad14', '#722ed1', '#13c2c2'];
                  const angle = 360 / uniqueVotes.length;
                  return `conic-gradient(${uniqueVotes.map((_, i) => `${colors[i % colors.length]} ${i * angle}deg ${(i + 1) * angle}deg`).join(', ')})`;
                })()
              }}>
                {(() => {
                  const votes = Object.values(votingSession.votes).filter(v => v !== '?') as string[];
                  const uniqueVotes = Array.from(new Set(votes));
                  if (uniqueVotes.length === 0) return null;
                  
                  return uniqueVotes.map((v, i) => {
                    const angle = 360 / uniqueVotes.length;
                    // Position text in the middle of each segment
                    const midAngle = (i * angle) + (angle / 2);
                    return (
                      <div 
                        key={v} 
                        className="wheel-text-wrapper" 
                        style={{ 
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          width: '100%',
                          height: '0',
                          transform: `translate(-50%, -50%) rotate(${midAngle - 90}deg)`,
                        }}
                      >
                        <div className="wheel-text" style={{ 
                          position: 'absolute',
                          right: '25px',
                          transform: 'translateY(-50%)',
                          fontWeight: 900,
                          color: 'white',
                          fontSize: '14px',
                          textShadow: '0 1px 3px rgba(0,0,0,0.3)'
                        }}>
                          {v}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="wheel-center">SPIN</div>
            </div>

            {wheelResult && (
              <div className="wheel-result-pop">
                Result: {wheelResult}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <Button 
                variant="primary" 
                fullWidth 
                disabled={isSpinning}
                onClick={() => {
                  const votes = Object.values(votingSession.votes).filter(v => v !== '?') as string[];
                  const uniqueVotes = Array.from(new Set(votes));
                  if (uniqueVotes.length === 0) return;
                  
                  setIsSpinning(true);
                  setWheelResult(null);
                  
                  const targetIndex = Math.floor(Math.random() * uniqueVotes.length);
                  const anglePerSegment = 360 / uniqueVotes.length;
                  
                  // Add a random offset within the segment to make it look natural
                  const randomOffset = (Math.random() * 0.8 + 0.1) * anglePerSegment;
                  
                  // Calculate rotation needed to bring targetIndex to the top (0 deg)
                  // Segment i is at (i * anglePerSegment) to ((i+1) * anglePerSegment)
                  // To bring the middle of segment i to the top, we need to rotate by:
                  // 360 - (i * anglePerSegment) - (anglePerSegment / 2)
                  
                  const extraSpins = 5 + Math.floor(Math.random() * 5);
                  const targetRotation = 360 - (targetIndex * anglePerSegment) - randomOffset;
                  
                  // Ensure we always rotate forward
                  const currentRotationBase = Math.floor(wheelRotation / 360) * 360;
                  const newRotation = currentRotationBase + (extraSpins * 360) + targetRotation;
                  
                  setWheelRotation(newRotation);
                  
                  setTimeout(() => {
                    setIsSpinning(false);
                    setWheelResult(uniqueVotes[targetIndex]);
                  }, 4000);
                }}
              >
                {isSpinning ? 'Spinning...' : 'SPIN'}
              </Button>
              
                <Button variant="secondary" fullWidth onClick={() => {
                  if (wheelResult) {
                    handleApplyVote(wheelResult);
                  }
                  setShowWheel(false);
                }}>
                  Apply
                </Button>

            </div>
            
            <Button variant="tiny" onClick={() => !isSpinning && setShowWheel(false)} style={{ position: 'absolute', top: '15px', right: '15px' }}>✕</Button>
          </div>
        </div>
      )}
    </div>
  );
};
