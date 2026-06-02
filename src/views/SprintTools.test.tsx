import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SprintTools } from './SprintTools';
import * as React from 'react';
import { usePanel } from '@/contexts/PanelContext';

// Mock dependencies
vi.mock('@/contexts/PanelContext', () => ({
  usePanel: vi.fn(),
}));

vi.mock('../components/SectionHeader', () => ({
  SectionHeader: ({ title }: any) => <div data-testid="section-header">{title}</div>,
}));

vi.mock('../components/SelectionSummary', () => ({
  SelectionSummary: () => <div data-testid="selection-summary">Selection Summary</div>,
}));

vi.mock('../components/EstimationTools', () => ({
  EstimationTools: () => <div data-testid="estimation-tools">Estimation Tools</div>,
}));

vi.mock('../components/SprintActions', () => ({
  SprintActions: () => <div data-testid="sprint-actions">Sprint Actions</div>,
}));

describe('SprintTools', () => {
  const mockSetInspectedMetadata = vi.fn();
  const defaultPanelContext = {
    votingSession: null,
    handleResetVoting: vi.fn(),
    estimateUnit: 'points',
    setEstimateUnit: vi.fn(),
    summary: { count: 0 },
    handleAction: vi.fn(),
    activeAction: null,
    handleSetPoints: vi.fn(),
    isProcessing: false,
    handleStartVoting: vi.fn(),
    handleCreateRefinementFrame: vi.fn(),
    handleDuplicateAndLink: vi.fn(),
    handleRemoveLinks: vi.fn(),
    handleReorderSelectedCards: vi.fn(),
    handleSyncMetadataFromParent: vi.fn(),
    handleClearMetadata: vi.fn(),
    handleInspectMetadata: vi.fn(),
    inspectedMetadata: null,
    setInspectedMetadata: mockSetInspectedMetadata,
    showGuide: false,
    setShowGuide: vi.fn(),
    handleSelectAll: vi.fn(),
    handleSelectInView: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (usePanel as any).mockReturnValue(defaultPanelContext);
  });

  it('renders correctly', () => {
    render(<SprintTools handleCreateSticky={vi.fn()} />);
    
    expect(screen.getByTestId('section-header')).toHaveTextContent('Sprint Tools');
    expect(screen.getByTestId('selection-summary')).toBeInTheDocument();
    expect(screen.getByTestId('estimation-tools')).toBeInTheDocument();
    expect(screen.getByTestId('sprint-actions')).toBeInTheDocument();
  });

  it('renders metadata inspector overlay when metadata is inspected', () => {
    (usePanel as any).mockReturnValue({
      ...defaultPanelContext,
      inspectedMetadata: [
        { title: 'Item 1', data: { key: 'val1' } },
        { title: 'Item 2', data: { key: 'val2' } },
      ],
    });

    render(<SprintTools handleCreateSticky={vi.fn()} />);
    
    expect(screen.getByText('Metadata (2 items)')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('closes metadata inspector when clicking close button', () => {
    (usePanel as any).mockReturnValue({
      ...defaultPanelContext,
      inspectedMetadata: [{ title: 'Item 1', data: {} }],
    });

    render(<SprintTools handleCreateSticky={vi.fn()} />);
    
    const closeBtn = screen.getByText('×');
    fireEvent.click(closeBtn);
    
    expect(mockSetInspectedMetadata).toHaveBeenCalledWith(null);
  });
});
