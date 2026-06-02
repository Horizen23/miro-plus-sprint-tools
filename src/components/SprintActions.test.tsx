import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SprintActions } from './SprintActions';
import { usePanel } from '@/contexts/PanelContext';

vi.mock('@/contexts/PanelContext', () => ({
  usePanel: vi.fn()
}));

describe('SprintActions', () => {
  const mockContext = {
    handleSelectAll: vi.fn(),
    handleSelectInView: vi.fn(),
    handleStartVoting: vi.fn(),
    handleAction: vi.fn(),
    activeAction: null,
    handleCreateRefinementFrame: vi.fn(),
    handleDuplicateAndLink: vi.fn(),
    handleRemoveLinks: vi.fn(),
    handleReorderSelectedCards: vi.fn(),
    handleSyncMetadataFromParent: vi.fn(),
    handleClearMetadata: vi.fn(),
    handleInspectMetadata: vi.fn(),
    isProcessing: false,
    summary: { count: 0 },
    showGuide: false,
    setShowGuide: vi.fn(),
    votingSession: null,
    handleResetVoting: vi.fn(),
  };

  it('renders all buttons', () => {
    vi.mocked(usePanel).mockReturnValue(mockContext as any);
    render(<SprintActions />);
    
    expect(screen.getByText('All')).toBeDefined();
    expect(screen.getByText('View')).toBeDefined();
    expect(screen.getByText('Start Voting')).toBeDefined();
    expect(screen.getByText('Refine Frame')).toBeDefined();
    expect(screen.getByText('Duplicate & Link')).toBeDefined();
  });

  it('calls correct handlers for all buttons', () => {
    vi.mocked(usePanel).mockReturnValue({ ...mockContext, summary: { count: 1 } } as any);
    render(<SprintActions />);
    
    fireEvent.click(screen.getByText('View'));
    expect(mockContext.handleSelectInView).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Start Voting'));
    expect(mockContext.handleStartVoting).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Refine Frame'));
    expect(mockContext.handleAction).toHaveBeenCalledWith('refine', mockContext.handleCreateRefinementFrame);

    fireEvent.click(screen.getByText('Duplicate & Link'));
    expect(mockContext.handleAction).toHaveBeenCalledWith('duplicate', mockContext.handleDuplicateAndLink);

    fireEvent.click(screen.getByText('Unlink'));
    expect(mockContext.handleAction).toHaveBeenCalledWith('unlink', mockContext.handleRemoveLinks);

    fireEvent.click(screen.getByText('Reorder by Sequence'));
    expect(mockContext.handleAction).toHaveBeenCalledWith('reorder', mockContext.handleReorderSelectedCards);

    fireEvent.click(screen.getByText('Sync Metadata from Parent'));
    expect(mockContext.handleAction).toHaveBeenCalledWith('sync', mockContext.handleSyncMetadataFromParent);

    fireEvent.click(screen.getByText('Clear Metadata'));
    expect(mockContext.handleAction).toHaveBeenCalledWith('clear', mockContext.handleClearMetadata);

    fireEvent.click(screen.getByText('Inspect Metadata'));
    expect(mockContext.handleAction).toHaveBeenCalledWith('inspect', mockContext.handleInspectMetadata);
  });

  it('toggles estimation guide', () => {
    vi.mocked(usePanel).mockReturnValue(mockContext as any);
    render(<SprintActions />);
    
    fireEvent.click(screen.getByText('Estimation Guide'));
    expect(mockContext.setShowGuide).toHaveBeenCalled();
  });
});
