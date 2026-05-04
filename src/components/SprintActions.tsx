import * as React from "react";
import { Button } from "./Button";

interface SprintActionsProps {
  handleSelectAll: () => void;
  handleSelectInView: () => void;
  handleInspect: () => void;
  handleStartVoting: () => void;
  handleAction: (fn: () => Promise<any>) => void;
  handleCreateRefinementFrame: () => Promise<any>;
  handleDuplicateAndLink: () => Promise<any>;
  handleRemoveLinks: () => Promise<any>;
  handleReorderSelectedCards: () => Promise<any>;
  isProcessing: boolean;
  itemCount: number;
  showGuide: boolean;
  setShowGuide: (show: boolean) => void;
  votingSession?: any;
  handleResetVoting?: () => void;
}

export const SprintActions: React.FC<SprintActionsProps> = ({
  handleSelectAll,
  handleSelectInView,
  handleInspect,
  handleStartVoting,
  handleAction,
  handleCreateRefinementFrame,
  handleDuplicateAndLink,
  handleRemoveLinks,
  handleReorderSelectedCards,
  isProcessing,
  itemCount,
  showGuide,
  setShowGuide,
  votingSession,
  handleResetVoting,
}) => {
  return (
    <>
      <div className="divider"></div>
      <span className="group-title">Selection Tools</span>
      <div className="selection-helpers">
        <button className="btn-secondary" onClick={handleSelectAll}>All</button>
        <button className="btn-secondary" onClick={handleSelectInView}>View</button>
        <button className="btn-secondary" onClick={handleInspect} disabled={isProcessing}>Log</button>
      </div>

      <span className="group-title">Smart Actions</span>
      <div style={{display: 'flex', gap: '8px'}}>
        {votingSession ? (
          <Button 
            variant="secondary" 
            onClick={handleResetVoting}
            fullWidth
            style={{ borderColor: '#ff4d4f', color: '#ff4d4f' }}
            icon={(
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            )}
          >
            End Voting
          </Button>
        ) : (
          <Button 
            variant="secondary" 
            onClick={handleStartVoting}
            fullWidth
            disabled={isProcessing || itemCount !== 1}
            icon={(
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            )}
          >
            Start Voting
          </Button>
        )}
        <Button 
          variant="secondary" 
          onClick={() => handleAction(handleCreateRefinementFrame)}
          fullWidth
          disabled={isProcessing}
          icon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          )}
        >
          Refine Frame
        </Button>
      </div>
      
      <div style={{display: 'flex', gap: '8px', marginTop: '8px'}}>
        <Button 
          loading={isProcessing}
          onClick={() => handleAction(handleDuplicateAndLink)}
          fullWidth
          disabled={itemCount === 0}
          icon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          )}
        >
          Duplicate & Link 
        </Button>

        <Button 
          variant="secondary"
          loading={isProcessing}
          onClick={() => handleAction(handleRemoveLinks)}
          fullWidth
          disabled={itemCount === 0}
          icon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              <line x1="8" y1="16" x2="16" y2="8"></line>
            </svg>
          )}
        >
          Unlink
        </Button>
      </div>

      <Button 
        variant="secondary"
        loading={isProcessing}
        onClick={() => handleAction(handleReorderSelectedCards)}
        fullWidth
        style={{marginTop: '8px'}}
        disabled={itemCount === 0}
        icon={(
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21 16-4 4-4-4"></path>
            <path d="M17 20V4"></path>
            <path d="m3 8 4-4 4 4"></path>
            <path d="M7 4v16"></path>
          </svg>
        )}
      >
        Reorder by Sequence
      </Button>

      <div className="reference-guide">
        <div className="guide-header" onClick={() => setShowGuide(!showGuide)}>
          <span className="group-title">Estimation Guide</span>
          <svg 
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" 
            style={{transform: showGuide ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.5}}
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        {showGuide && (
          <div className="guide-grid">
            {[
              {p: '2P', h: '< 2h'}, {p: '3P', h: '3-4h'}, {p: '5P', h: '5-6h'},
              {p: '8P', h: '7-10h'}, {p: '13P', h: '11-16h'}, {p: '21P', h: '17-26h'},
              {p: '34P', h: '27-42h'}, {p: '55P', h: '43-68h'}, {p: '89P', h: '69-109h'},
              {p: '144P', h: '110-175h'}, {p: '233P', h: '176-283h'}, {p: '377P', h: '284-458h'}
            ].map(item => (
              <div key={item.p} className="guide-item">
                <span className="p-val">{item.p}</span>
                <span className="h-val">{item.h}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
