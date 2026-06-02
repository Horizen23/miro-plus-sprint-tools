import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CapacityPlanning } from './CapacityPlanning';
import * as React from 'react';

// Mock the estimationUtils
vi.mock('../services/miro/estimationUtils', () => ({
  getBucketedPoint: vi.fn().mockReturnValue('8'),
  mapHoursToPoints: vi.fn().mockReturnValue(8),
}));

describe('CapacityPlanning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with initial state', () => {
    render(<CapacityPlanning />);
    
    expect(screen.getByText('Sprint Duration')).toBeInTheDocument();
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(screen.getByText('Net Capacity')).toBeInTheDocument();
    expect(screen.getByText('Suggested')).toBeInTheDocument();
  });

  it('updates work hours per day', () => {
    render(<CapacityPlanning />);
    
    // Find input by its initial value
    const input = screen.getByDisplayValue('8') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '6' } });
    
    expect(input.value).toBe('6');
  });

  it('updates event hours', () => {
    render(<CapacityPlanning />);
    
    // Find input by its initial value
    const input = screen.getByDisplayValue('12') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '10' } });
    
    expect(input.value).toBe('10');
  });

  it('adds a new team member', () => {
    render(<CapacityPlanning />);
    
    const initialMembers = screen.getAllByRole('textbox').filter(input => 
      input.classList.contains('member-name-input')
    );
    
    const addButton = screen.getByText('+ Add');
    fireEvent.click(addButton);
    
    const newMembers = screen.getAllByRole('textbox').filter(input => 
      input.classList.contains('member-name-input')
    );
    expect(newMembers.length).toBe(initialMembers.length + 1);
    expect(newMembers[newMembers.length - 1]).toHaveValue('New Member');
  });

  it('removes a team member', () => {
    render(<CapacityPlanning />);
    
    const initialMembers = screen.getAllByRole('textbox').filter(input => 
      input.classList.contains('member-name-input')
    );
    
    const delButtons = screen.getAllByText('×');
    fireEvent.click(delButtons[0]);
    
    const newMembers = screen.getAllByRole('textbox').filter(input => 
      input.classList.contains('member-name-input')
    );
    expect(newMembers.length).toBe(initialMembers.length - 1);
  });

  it('resets all attendance to full', () => {
    render(<CapacityPlanning />);
    
    // Toggle first member's first day to half
    const attButtons = screen.getAllByRole('button').filter(btn => 
      btn.classList.contains('att-btn') && !btn.classList.contains('weekend-off')
    );
    fireEvent.click(attButtons[0]); // to half (½)
    
    expect(attButtons[0]).toHaveTextContent('½');
    
    const resetButton = screen.getByTitle('Reset All to Full');
    fireEvent.click(resetButton);
    
    // Re-query buttons as they might have been re-rendered
    const resetAttButtons = screen.getAllByRole('button').filter(btn => 
      btn.classList.contains('att-btn') && !btn.classList.contains('weekend-off')
    );
    expect(resetAttButtons[0]).toHaveTextContent('•');
  });
});
