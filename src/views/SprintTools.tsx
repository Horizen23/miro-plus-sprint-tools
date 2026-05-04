import * as React from "react";
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
  handleAction: (fn: () => Promise<any>) => void;
  handleCreateSticky: (notes: string[], parentFrameId?: string) => Promise<any>;
  handleSetPoints: (p: string) => void;
  isProcessing: boolean;
  handleStartVoting: () => void;
  handleCreateRefinementFrame: () => Promise<any>;
  handleDuplicateAndLink: () => Promise<any>;
  handleRemoveLinks: () => Promise<any>;
  handleReorderSelectedCards: () => Promise<any>;
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
  handleCreateSticky,
  handleSetPoints,
  isProcessing,
  handleStartVoting,
  handleCreateRefinementFrame,
  handleDuplicateAndLink,
  handleRemoveLinks,
  handleReorderSelectedCards,
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
          handleCreateRefinementFrame={handleCreateRefinementFrame}
          handleDuplicateAndLink={handleDuplicateAndLink}
          handleRemoveLinks={handleRemoveLinks}
          handleReorderSelectedCards={handleReorderSelectedCards}
          isProcessing={isProcessing}
          itemCount={summary.count}
          showGuide={showGuide}
          setShowGuide={setShowGuide}
          votingSession={votingSession}
          handleResetVoting={handleResetVoting}
        />
      </div>
    </>
  );
};
