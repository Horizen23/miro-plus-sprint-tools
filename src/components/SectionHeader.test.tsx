import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SectionHeader } from './SectionHeader';

describe('SectionHeader', () => {
  it('renders title and icon correctly', () => {
    render(<SectionHeader title="Settings" icon={<span data-testid="icon">⚙️</span>} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('handles click toggle when expandable', () => {
    const handleToggle = vi.fn();
    render(
      <SectionHeader 
        title="Expandable" 
        icon="📁" 
        isExpandable 
        onToggle={handleToggle} 
      />
    );
    fireEvent.click(screen.getByText('Expandable'));
    expect(handleToggle).toHaveBeenCalled();
  });

  it('does not handle click when not expandable', () => {
    const handleToggle = vi.fn();
    render(
      <SectionHeader 
        title="Fixed" 
        icon="📁" 
        isExpandable={false} 
        onToggle={handleToggle} 
      />
    );
    fireEvent.click(screen.getByText('Fixed'));
    expect(handleToggle).not.toHaveBeenCalled();
  });

  it('shows expansion arrow when expandable', () => {
    const { container } = render(<SectionHeader title="Expandable" icon="📁" isExpandable />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('rotates arrow when expanded', () => {
    const { container } = render(<SectionHeader title="Expanded" icon="📁" isExpandable isExpanded />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveStyle({ transform: 'rotate(180deg)' });
  });

  it('renders rightElement correctly', () => {
    render(<SectionHeader title="Right" icon="📁" rightElement={<button>Action</button>} />);
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });
});
