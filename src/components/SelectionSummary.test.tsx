import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectionSummary } from './SelectionSummary';
import { usePanel } from '@/contexts/PanelContext';

// Mock usePanel hook
vi.mock('@/contexts/PanelContext', () => ({
  usePanel: vi.fn(),
}));

describe('SelectionSummary', () => {
  const mockHandleCreateSticky = vi.fn();
  const mockHandleAction = vi.fn((name, fn) => fn());

  const defaultSummary = {
    count: 5,
    points: 13,
    bucketedPoint: 13,
    hourRange: [11, 16],
    actualHours: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (usePanel as any).mockReturnValue({
      summary: defaultSummary,
      handleAction: mockHandleAction,
    });
  });

  it('renders summary information correctly', () => {
    render(<SelectionSummary handleCreateSticky={mockHandleCreateSticky} />);
    
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('13pt')).toBeInTheDocument();
    expect(screen.getByText(/13P/)).toBeInTheDocument();
    expect(screen.getByText('(11-16h)')).toBeInTheDocument();
  });

  it('shows actual hours hint when actualHours > 0', () => {
    (usePanel as any).mockReturnValue({
      summary: { ...defaultSummary, actualHours: 8 },
      handleAction: mockHandleAction,
    });

    render(<SelectionSummary handleCreateSticky={mockHandleCreateSticky} />);
    
    expect(screen.getByText('Actual hours detected: 8h')).toBeInTheDocument();
  });

  it('calls handleAction and handleCreateSticky when sticky button is clicked', async () => {
    // Mock global miro object
    const mockMiro = {
      board: {
        getSelection: vi.fn().mockResolvedValue([{ parentId: 'parent-123' }]),
      },
    };
    vi.stubGlobal('miro', mockMiro);

    render(<SelectionSummary handleCreateSticky={mockHandleCreateSticky} />);
    
    const button = screen.getByTitle('Create Black Sticky Notes for Points & Hours');
    fireEvent.click(button);

    expect(mockHandleAction).toHaveBeenCalledWith('create-sticky', expect.any(Function));
    
    // Since mockHandleAction calls the function immediately
    expect(mockMiro.board.getSelection).toHaveBeenCalled();
    
    // We need to wait for the async handleAction inner function if we want to check handleCreateSticky
    // But since handleAction is mocked to call it immediately, it might work synchronously if it doesn't await
    
    // Wait for promises to resolve
    await vi.waitFor(() => {
        expect(mockHandleCreateSticky).toHaveBeenCalledWith(['13pt'], 'parent-123');
    });
  });

  it('includes actual hours in sticky notes if available', async () => {
    (usePanel as any).mockReturnValue({
      summary: { ...defaultSummary, points: 21, actualHours: 15 },
      handleAction: mockHandleAction,
    });

    const mockMiro = {
      board: {
        getSelection: vi.fn().mockResolvedValue([]),
      },
    };
    vi.stubGlobal('miro', mockMiro);

    render(<SelectionSummary handleCreateSticky={mockHandleCreateSticky} />);
    
    const button = screen.getByTitle('Create Black Sticky Notes for Points & Hours');
    fireEvent.click(button);

    await vi.waitFor(() => {
        expect(mockHandleCreateSticky).toHaveBeenCalledWith(['21pt', '15h'], undefined);
    });
  });
});
