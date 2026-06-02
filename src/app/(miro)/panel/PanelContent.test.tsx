import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PanelContent from './PanelContent';
import * as React from 'react';
import { usePanel } from '@/contexts/PanelContext';

// Mock the miro SDK
vi.stubGlobal('miro', {
  board: {
    ui: {
      on: vi.fn(),
      off: vi.fn(),
    },
    getInfo: vi.fn().mockResolvedValue({ id: 'test-board-id' }),
    getUserInfo: vi.fn().mockResolvedValue({ id: 'test-user-id', name: 'Test User' }),
    getSelection: vi.fn().mockResolvedValue([]),
    getAppData: vi.fn().mockResolvedValue({}),
  },
});

// Mock child components
vi.mock('@/views/SprintTools', () => ({
  SprintTools: () => <div data-testid="sprint-tools">Sprint Tools</div>,
}));
vi.mock('@/views/CapacityPlanning', () => ({
  CapacityPlanning: () => <div data-testid="capacity-planning">Capacity Planning</div>,
}));
vi.mock('@/views/JiraTools', () => ({
  JiraTools: () => <div data-testid="jira-tools">Jira Tools</div>,
}));
vi.mock('@/views/Timesheet', () => ({
  Timesheet: () => <div data-testid="timesheet">Timesheet</div>,
}));
vi.mock('@/views/Settings', () => ({
  SettingsView: () => <div data-testid="settings-view">Settings View</div>,
}));

// Mock the context hook
vi.mock('@/contexts/PanelContext', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    usePanel: vi.fn(),
  };
});

describe('PanelContent', () => {
  const mockSetActiveTab = vi.fn();
  const defaultContext = {
    activeTab: 'tools',
    setActiveTab: mockSetActiveTab,
    votingSession: null,
    summary: { count: 0 },
    memoizedItems: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (usePanel as any).mockReturnValue(defaultContext);
  });

  it('renders the initial Tools tab', () => {
    render(<PanelContent />);
    expect(screen.getByTestId('sprint-tools')).toBeInTheDocument();
  });

  it('switches tabs when clicked', async () => {
    render(<PanelContent />);
    
    const capacityTab = screen.getByText('Capacity');
    fireEvent.click(capacityTab);
    
    expect(mockSetActiveTab).toHaveBeenCalledWith('capacity');
  });

  it('shows the voting toast when a voting session is active and not on tools tab', async () => {
    (usePanel as any).mockReturnValue({
      ...defaultContext,
      activeTab: 'capacity',
      votingSession: {
        status: 'voting',
        cardTitle: 'Test Card',
      },
    });

    render(<PanelContent />);
    
    expect(screen.getByText('Voting on:')).toBeInTheDocument();
    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByText('Join Now')).toBeInTheDocument();
  });

  it('calls setActiveTab("tools") when clicking the voting toast', () => {
    (usePanel as any).mockReturnValue({
      ...defaultContext,
      activeTab: 'capacity',
      votingSession: {
        status: 'voting',
        cardTitle: 'Test Card',
      },
    });

    render(<PanelContent />);
    
    const toast = screen.getByText('Voting on:').closest('.voting-toast');
    fireEvent.click(toast!);
    
    expect(mockSetActiveTab).toHaveBeenCalledWith('tools');
  });

  it('shows footer status for selected items', () => {
    (usePanel as any).mockReturnValue({
      ...defaultContext,
      summary: { count: 5 },
    });

    render(<PanelContent />);
    expect(screen.getByText('Selected 5 items')).toBeInTheDocument();
  });

  it('shows footer status for memoized items when no items selected', () => {
    (usePanel as any).mockReturnValue({
      ...defaultContext,
      summary: { count: 0 },
      memoizedItems: [{}, {}, {}],
    });

    render(<PanelContent />);
    expect(screen.getByText('Targeting last selection (3 items)')).toBeInTheDocument();
  });

  it('shows default footer status when nothing is selected', () => {
    render(<PanelContent />);
    expect(screen.getByText('Select cards to start')).toBeInTheDocument();
  });
});
