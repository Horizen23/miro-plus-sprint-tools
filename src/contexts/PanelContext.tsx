'use client';

import * as React from 'react';
import type { Card, AppCard, Item } from "@mirohq/websdk-types";
import { useSprintSelection, InspectedMetadata } from '@/hooks/useSprintSelection';
import { useVotingSession, VotingSession } from '@/hooks/useVotingSession';
import { SelectionSummary } from '@/services/miro/estimationUtils';

export type Tab = 'tools' | 'capacity' | 'timesheet' | 'jira' | 'settings';

interface PanelContextType {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  showGuide: boolean;
  setShowGuide: (show: boolean) => void;
  isProcessing: boolean;
  setIsProcessing: (isProcessing: boolean) => void;
  activeAction: string | null;
  estimateUnit: 'pt' | 'h';
  setEstimateUnit: (unit: 'pt' | 'h') => void;
  summary: SelectionSummary;
  selectedItems: (Card | AppCard)[];
  memoizedItems: (Card | AppCard)[];
  rawSelection: Item[];
  handleSetPoints: (p: string) => void;
  handleAction: (name: string, fn: () => Promise<unknown>) => void;
  handleInspectMetadata: () => Promise<void>;
  inspectedMetadata: InspectedMetadata[] | null;
  setInspectedMetadata: (data: InspectedMetadata[] | null) => void;
  votingSession: VotingSession | null;

  handleStartVoting: () => Promise<void>;
  handleResetVoting: () => Promise<void>;
  handleSelectAll: () => Promise<void>;
  handleSelectInView: () => Promise<void>;
  handleDuplicateAndLink: () => Promise<void>;
  handleCreateRefinementFrame: () => Promise<void>;
  handleRemoveLinks: () => Promise<void>;
  handleReorderSelectedCards: () => Promise<void>;
  handleSyncMetadataFromParent: () => Promise<void>;
  handleClearMetadata: () => Promise<void>;
}

const PanelContext = React.createContext<PanelContextType | undefined>(undefined);

export const PanelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = React.useState<Tab>('tools');
  const [showGuide, setShowGuide] = React.useState(false);

  const {
    isProcessing,
    setIsProcessing,
    activeAction,
    estimateUnit,
    setEstimateUnit,
    summary,
    selectedItems,
    memoizedItems,
    rawSelection,
    handleSetPoints,
    handleAction,
    handleInspectMetadata,
    inspectedMetadata,
    setInspectedMetadata,
    handleSelectAll,
    handleSelectInView,
    handleDuplicateAndLink,
    handleCreateRefinementFrame,
    handleRemoveLinks,
    handleReorderSelectedCards,
    handleSyncMetadataFromParent,
    handleClearMetadata,
  } = useSprintSelection();

  const { votingSession, handleStartVoting, handleResetVoting } =
    useVotingSession(
      selectedItems,
      setIsProcessing,
      setActiveTab,
      handleSetPoints,
      estimateUnit
    );

  const contextValue: PanelContextType = {
    activeTab,
    setActiveTab,
    showGuide,
    setShowGuide,
    isProcessing,
    setIsProcessing,
    activeAction,
    estimateUnit,
    setEstimateUnit,
    summary,
    selectedItems,
    memoizedItems,
    rawSelection,
    handleSetPoints,
    handleAction,
    handleInspectMetadata,
    inspectedMetadata,
    setInspectedMetadata,
    votingSession,
    handleStartVoting,
    handleResetVoting,
    handleSelectAll,
    handleSelectInView,
    handleDuplicateAndLink,
    handleCreateRefinementFrame,
    handleRemoveLinks,
    handleReorderSelectedCards,
    handleSyncMetadataFromParent,
    handleClearMetadata,
  };

  return (
    <PanelContext.Provider value={contextValue}>
      {children}
    </PanelContext.Provider>
  );
};

export const usePanel = () => {
  const context = React.useContext(PanelContext);
  if (context === undefined) {
    throw new Error('usePanel must be used within a PanelProvider');
  }
  return context;
};
