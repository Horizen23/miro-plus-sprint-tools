'use client';

import * as React from 'react';
import { Timesheet } from '@/views/Timesheet';
import { JiraTools } from '@/views/JiraTools';
import { TabNav, TabItem } from '@/components/TabNav';
import { SprintTools } from '@/views/SprintTools';
import { CapacityPlanning } from '@/views/CapacityPlanning';
import {
  handleDuplicateAndLink,
  handleCreateRefinementFrame,
  handleCreateSticky,
  handleRemoveLinks,
  handleReorderSelectedCards,
} from '@/utils/miroUtils';
import {
  handleSelectAll,
  handleSelectInView,
} from '@/utils/selectionUtils';
import { useVotingSession } from '@/hooks/useVotingSession';
import { useSprintSelection } from '@/hooks/useSprintSelection';
import { JiraAuthProvider } from '@/contexts/JiraAuthContext';

type Tab = 'tools' | 'capacity' | 'timesheet' | 'jira';

const AppPanel: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<Tab>('tools');
  const [showGuide, setShowGuide] = React.useState(false);

  const {
    isProcessing,
    setIsProcessing,
    estimateUnit,
    setEstimateUnit,
    summary,
    selectedItems,
    memoizedItems,
    rawSelection,
    handleSetPoints,
    handleAction,
  } = useSprintSelection();

  const { votingSession, handleStartVoting, handleResetVoting } =
    useVotingSession(
      selectedItems,
      setIsProcessing,
      setActiveTab,
      handleSetPoints,
      estimateUnit
    );

  const handleInspect = async () => {
    const selection = await miro.board.getSelection();
    console.log('Current selection:', selection);
    await miro.board.notifications.showInfo('Details logged to console (F12).');
  };

  const tabs: TabItem[] = [
    {
      id: 'tools',
      label: 'Tools',
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m21 16-4 4-4-4"></path>
          <path d="M17 20V4"></path>
          <path d="m3 8 4-4 4 4"></path>
          <path d="M7 4v16"></path>
        </svg>
      ),
      badge: !!(votingSession && votingSession.status === 'voting'),
    },
    {
      id: 'capacity',
      label: 'Capacity',
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
        </svg>
      ),
    },
    {
      id: 'timesheet',
      label: 'Timesheet',
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      ),
    },
    {
      id: 'jira',
      label: 'Jira',
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path>
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path>
        </svg>
      ),
    },
  ];

  const contentMap: Record<Tab, React.ReactNode> = {
    tools: (
      <SprintTools
        votingSession={votingSession}
        handleResetVoting={handleResetVoting}
        estimateUnit={estimateUnit}
        setEstimateUnit={setEstimateUnit}
        summary={summary}
        handleAction={handleAction}
        handleCreateSticky={handleCreateSticky}
        handleSetPoints={handleSetPoints}
        isProcessing={isProcessing}
        handleStartVoting={handleStartVoting}
        handleCreateRefinementFrame={handleCreateRefinementFrame}
        handleDuplicateAndLink={handleDuplicateAndLink}
        handleRemoveLinks={handleRemoveLinks}
        handleReorderSelectedCards={handleReorderSelectedCards}
        showGuide={showGuide}
        setShowGuide={setShowGuide}
        handleSelectAll={handleSelectAll}
        handleSelectInView={handleSelectInView}
        handleInspect={handleInspect}
      />
    ),
    capacity: <CapacityPlanning />,
    jira: <JiraTools selection={rawSelection} />,
    timesheet: <Timesheet items={selectedItems} />,
  };

  return (
    <div className="container">
      {votingSession &&
        votingSession.status === 'voting' &&
        activeTab !== 'tools' && (
          <div
            className="voting-toast"
            onClick={() => setActiveTab('tools')}
          >
            <div className="voting-toast-content">
              <span className="voting-pulse"></span>
              <span className="voting-text">
                Voting on: <strong>{votingSession.cardTitle}</strong>
              </span>
            </div>
            <button className="voting-join-btn">Join Now</button>
          </div>
        )}
      <TabNav
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as Tab)}
      />

      <main className="content">{contentMap[activeTab]}</main>

      <footer className="footer">
        <span
          className={`status-dot ${
            summary.count > 0 || memoizedItems.length > 0 ? 'online' : ''
          }`}
        ></span>
        {summary.count > 0
          ? `Selected ${summary.count} items`
          : memoizedItems.length > 0
          ? `Targeting last selection (${memoizedItems.length} items)`
          : 'Select cards to start'}
      </footer>
    </div>
  );
};

export default function PanelContent() {
  return <AppPanel />;
}
