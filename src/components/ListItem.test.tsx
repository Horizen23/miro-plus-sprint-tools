import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ListItem } from './ListItem';

describe('ListItem', () => {
  it('renders title and subtitle correctly', () => {
    render(<ListItem title="Task 1" subtitle="Jira-123" />);
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Jira-123')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<ListItem title="Task 1" onClick={handleClick} />);
    fireEvent.click(screen.getByText('Task 1'));
    expect(handleClick).toHaveBeenCalled();
  });

  it('handles toggle events when checkbox is clicked', () => {
    const handleToggle = vi.fn();
    render(<ListItem title="Task 1" onToggle={handleToggle} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(handleToggle).toHaveBeenCalled();
  });

  it('handles check events if onToggle is not provided', () => {
    const handleCheck = vi.fn();
    render(<ListItem title="Task 1" onCheck={handleCheck} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(handleCheck).toHaveBeenCalled();
  });

  it('does not trigger events when disabled', () => {
    const handleClick = vi.fn();
    const handleToggle = vi.fn();
    render(<ListItem title="Task 1" onClick={handleClick} onToggle={handleToggle} disabled />);
    
    fireEvent.click(screen.getByText('Task 1'));
    expect(handleClick).not.toHaveBeenCalled();
    
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(handleToggle).not.toHaveBeenCalled();
  });

  it('shows icon when provided', () => {
    render(<ListItem title="Task 1" icon={<span data-testid="icon">🔥</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('shows bullet when showBullet is true', () => {
    const { container } = render(<ListItem title="Task 1" showBullet />);
    expect(container.querySelector('.bullet')).toBeInTheDocument();
  });

  it('renders rightElement correctly', () => {
    render(<ListItem title="Task 1" rightElement={<span data-testid="right">Right</span>} />);
    expect(screen.getByTestId('right')).toBeInTheDocument();
  });

  it('applies checked class to title-text when checked is true', () => {
    render(<ListItem title="Task 1" checked />);
    expect(screen.getByText('Task 1')).toHaveClass('checked');
  });

  it('hides checkbox when showCheckbox is false', () => {
    render(<ListItem title="Task 1" showCheckbox={false} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
