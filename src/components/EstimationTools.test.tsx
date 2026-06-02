import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EstimationTools } from './EstimationTools';
import { usePanel } from '@/contexts/PanelContext';

vi.mock('@/contexts/PanelContext', () => ({
  usePanel: vi.fn(),
}));

describe('EstimationTools', () => {
  const mockSetEstimateUnit = vi.fn();
  const mockHandleSetPoints = vi.fn();

  const defaultContext = {
    estimateUnit: 'pt',
    setEstimateUnit: mockSetEstimateUnit,
    handleSetPoints: mockHandleSetPoints,
    isProcessing: false,
    summary: { count: 1 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (usePanel as any).mockReturnValue(defaultContext);
  });

  it('renders story point tools by default', () => {
    render(<EstimationTools />);
    expect(screen.getByText('Story Point Tools')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.queryByText('1h')).not.toBeInTheDocument();
  });

  it('renders hour tools when estimateUnit is h', () => {
    (usePanel as any).mockReturnValue({
      ...defaultContext,
      estimateUnit: 'h',
    });
    render(<EstimationTools />);
    expect(screen.getByText('Hour Tools')).toBeInTheDocument();
    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('8h')).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('switches unit when tab is clicked', () => {
    render(<EstimationTools />);
    fireEvent.click(screen.getByText('H'));
    expect(mockSetEstimateUnit).toHaveBeenCalledWith('h');
  });

  it('calls handleSetPoints when a point button is clicked', () => {
    render(<EstimationTools />);
    fireEvent.click(screen.getByText('5'));
    expect(mockHandleSetPoints).toHaveBeenCalledWith('5');
  });

  it('disables buttons when isProcessing is true', () => {
    (usePanel as any).mockReturnValue({
      ...defaultContext,
      isProcessing: true,
    });
    render(<EstimationTools />);
    expect(screen.getByText('5').closest('button')).toBeDisabled();
  });

  it('disables buttons when itemCount is 0', () => {
    (usePanel as any).mockReturnValue({
      ...defaultContext,
      summary: { count: 0 },
    });
    render(<EstimationTools />);
    expect(screen.getByText('5').closest('button')).toBeDisabled();
  });
});
