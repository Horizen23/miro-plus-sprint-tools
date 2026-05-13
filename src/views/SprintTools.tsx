import * as React from "react";
import { createPortal } from "react-dom";
import { SectionHeader } from "../components/SectionHeader";
import { SelectionSummary } from "../components/SelectionSummary";
import { EstimationTools } from "../components/EstimationTools";
import { SprintActions } from "../components/SprintActions";

interface SprintToolsProps {
  votingSession: any;
  handleResetVoting: () => void;
  estimateUnit: 'pt' | 'h';
  setEstimateUnit: (unit: 'pt' | 'h') => void;
  summary: any;
  handleAction: (name: string, fn: () => Promise<any>) => void;
  activeAction: string | null;
  handleCreateSticky: (notes: string[], parentFrameId?: string) => Promise<any>;
  handleSetPoints: (p: string) => void;
  isProcessing: boolean;
  handleStartVoting: () => void;
  handleCreateRefinementFrame: () => Promise<any>;
  handleDuplicateAndLink: () => Promise<any>;
  handleRemoveLinks: () => Promise<any>;
  handleReorderSelectedCards: () => Promise<any>;
  handleSyncMetadataFromParent: () => Promise<any>;
  handleClearMetadata: () => Promise<any>;
  handleInspectMetadata: () => Promise<any>;
  inspectedMetadata: { title: string; data: any }[] | null;
  setInspectedMetadata: (data: { title: string; data: any }[] | null) => void;
  showGuide: boolean;
  setShowGuide: (show: boolean) => void;
  handleSelectAll: () => void;
  handleSelectInView: () => void;
  onlineUsersCount?: number;
  handleRefresh?: () => Promise<void>;
  handleCastVote?: (p: string) => void;
  handleRevealVotes?: () => void;
  handleApplyVote?: (pts: string) => void;
  currentUserId?: string;
}

export const SprintTools: React.FC<SprintToolsProps> = ({
  votingSession,
  handleResetVoting,
  estimateUnit,
  setEstimateUnit,
  summary,
  handleAction,
  activeAction,
  handleCreateSticky,
  handleSetPoints,
  isProcessing,
  handleStartVoting,
  handleCreateRefinementFrame,
  handleDuplicateAndLink,
  handleRemoveLinks,
  handleReorderSelectedCards,
  handleSyncMetadataFromParent,
  handleClearMetadata,
  handleInspectMetadata,
  inspectedMetadata,
  setInspectedMetadata,
  showGuide,
  setShowGuide,
  handleSelectAll,
  handleSelectInView,
  handleRefresh,
  handleCastVote,
  handleRevealVotes,
  handleApplyVote,
  currentUserId,
}) => {
  return (
    <>
      <SectionHeader 
        title="Sprint Tools" 
        icon={(
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21 16-4 4-4-4"></path>
            <path d="M17 20V4"></path>
            <path d="m3 8 4-4 4 4"></path>
            <path d="M7 4v16"></path>
          </svg>
        )}
      />
      
      <SelectionSummary 
        summary={summary}
        handleAction={handleAction}
        handleCreateSticky={handleCreateSticky}
      />

      <div className="action-area">
        <EstimationTools 
          estimateUnit={estimateUnit}
          setEstimateUnit={setEstimateUnit}
          handleSetPoints={handleSetPoints}
          isProcessing={isProcessing}
          itemCount={summary.count}
        />

        <SprintActions 
          handleSelectAll={handleSelectAll}
          handleSelectInView={handleSelectInView}
          handleStartVoting={handleStartVoting}
          handleAction={handleAction}
          activeAction={activeAction}
          handleCreateRefinementFrame={handleCreateRefinementFrame}
          handleDuplicateAndLink={handleDuplicateAndLink}
          handleRemoveLinks={handleRemoveLinks}
          handleReorderSelectedCards={handleReorderSelectedCards}
          handleSyncMetadataFromParent={handleSyncMetadataFromParent}
          handleClearMetadata={handleClearMetadata}
          handleInspectMetadata={handleInspectMetadata}
          isProcessing={isProcessing}
          itemCount={summary.count}
          showGuide={showGuide}
          setShowGuide={setShowGuide}
          votingSession={votingSession}
          handleResetVoting={handleResetVoting}
        />
      </div>

      {inspectedMetadata && typeof document !== 'undefined' && createPortal(
        <div className="metadata-inspector-overlay" onClick={() => setInspectedMetadata(null)}>
          <div className="metadata-inspector-content" onClick={(e) => e.stopPropagation()}>
          <div className="metadata-inspector-header">
            <h3>Metadata ({inspectedMetadata.length} items)</h3>
            <button onClick={() => setInspectedMetadata(null)} className="close-btn">&times;</button>
          </div>
          <div className="metadata-inspector-body">
            {inspectedMetadata.map((item, index) => (
              <div key={index} className="metadata-item-block" style={{ marginBottom: index < inspectedMetadata.length - 1 ? '16px' : '0' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#8c90b0', marginBottom: '4px', textTransform: 'uppercase' }}>
                  {item.title}
                </div>
                <pre>{JSON.stringify(item.data, null, 2)}</pre>
              </div>
            ))}
          </div>
          <div className="metadata-inspector-footer">
            <button onClick={() => setInspectedMetadata(null)} className="btn-primary">Close</button>
          </div>
        </div>
        </div>,
        document.body
      )}
    </>
  );
};
