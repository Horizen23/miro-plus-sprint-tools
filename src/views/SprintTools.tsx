import * as React from "react";
import { createPortal } from "react-dom";
import { SectionHeader } from "../components/SectionHeader";
import { SelectionSummary } from "../components/SelectionSummary";
import { EstimationTools } from "../components/EstimationTools";
import { SprintActions } from "../components/SprintActions";
import { usePanel } from "@/contexts/PanelContext";

interface SprintToolsProps {
  handleCreateSticky: (notes: string[], parentFrameId?: string) => Promise<void>;
  handleRefresh?: () => Promise<void>;
  handleCastVote?: (p: string) => void;
  handleRevealVotes?: () => void;
  handleApplyVote?: (pts: string) => void;
  currentUserId?: string;
}

export const SprintTools: React.FC<SprintToolsProps> = ({
  handleCreateSticky,
  handleRefresh,
  handleCastVote,
  handleRevealVotes,
  handleApplyVote,
  currentUserId,
}) => {
  const {
    votingSession,
    handleResetVoting,
    estimateUnit,
    setEstimateUnit,
    summary,
    handleAction,
    activeAction,
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
  } = usePanel();

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
        handleCreateSticky={handleCreateSticky}
      />

      <div className="action-area">
        <EstimationTools />

        <SprintActions />
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
