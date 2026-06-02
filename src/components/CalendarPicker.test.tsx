import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CalendarPicker } from './CalendarPicker';

describe('CalendarPicker', () => {
  const mockOnRangeChange = vi.fn();
  const startDate = '2023-10-01';
  const endDate = '2023-10-05';

  it('renders the current month correctly', () => {
    render(
      <CalendarPicker 
        startDate={startDate} 
        endDate={endDate} 
        onRangeChange={mockOnRangeChange} 
      />
    );
    expect(screen.getByText(/October 2023/)).toBeInTheDocument();
  });

  it('navigates to the previous month', () => {
    render(
      <CalendarPicker 
        startDate={startDate} 
        endDate={endDate} 
        onRangeChange={mockOnRangeChange} 
      />
    );
    fireEvent.click(screen.getByText('<'));
    expect(screen.getByText(/September 2023/)).toBeInTheDocument();
  });

  it('navigates to the next month', () => {
    render(
      <CalendarPicker 
        startDate={startDate} 
        endDate={endDate} 
        onRangeChange={mockOnRangeChange} 
      />
    );
    fireEvent.click(screen.getByText('>'));
    expect(screen.getByText(/November 2023/)).toBeInTheDocument();
  });

  it('selects a start date and enters range selection mode', () => {
    render(
      <CalendarPicker 
        startDate={startDate} 
        endDate={endDate} 
        onRangeChange={mockOnRangeChange} 
      />
    );
    
    // Click on 10th
    const day10 = screen.getByText('10');
    fireEvent.click(day10);
    
    expect(mockOnRangeChange).toHaveBeenCalledWith('2023-10-10', '2023-10-10');
  });

  it('completes range selection when clicking a second date', () => {
    const { rerender } = render(
      <CalendarPicker 
        startDate={startDate} 
        endDate={startDate} 
        onRangeChange={mockOnRangeChange} 
      />
    );
    
    // First click to start range (already started by props in this case)
    // Actually the internal state isSelectingRange needs to be true.
    // I need to click twice in the same test or mock the state if possible.
    
    const day1 = screen.getByText('1');
    fireEvent.click(day1); // This sets isSelectingRange to true
    
    const day10 = screen.getByText('10');
    fireEvent.click(day10);
    
    expect(mockOnRangeChange).toHaveBeenLastCalledWith('2023-10-01', '2023-10-10');
  });

  it('reverses range if second date is before first date', () => {
    render(
      <CalendarPicker 
        startDate="2023-10-10" 
        endDate="2023-10-10" 
        onRangeChange={mockOnRangeChange} 
      />
    );
    
    // Click 10 to start (already "started" but we need to trigger the internal state)
    fireEvent.click(screen.getByText('10'));
    
    // Click 5 to finish
    fireEvent.click(screen.getByText('5'));
    
    expect(mockOnRangeChange).toHaveBeenLastCalledWith('2023-10-05', '2023-10-10');
  });

  it('updates hover state during range selection', () => {
    render(
      <CalendarPicker 
        startDate={startDate} 
        endDate={startDate} 
        onRangeChange={mockOnRangeChange} 
      />
    );
    
    fireEvent.click(screen.getByText('1'));
    fireEvent.mouseEnter(screen.getByText('10'));
    
    // 5 should be in range now
    expect(screen.getByText('5')).toHaveClass('in-range');
  });
});
