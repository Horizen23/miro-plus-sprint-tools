import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TabNav, TabItem } from './TabNav';

describe('TabNav', () => {
  const tabs: TabItem[] = [
    { id: 'tab1', label: 'Tab 1', icon: <span data-testid="icon1">Icon 1</span> },
    { id: 'tab2', label: 'Tab 2', icon: <span data-testid="icon2">Icon 2</span>, badge: true },
  ];

  it('renders all tabs correctly', () => {
    render(<TabNav tabs={tabs} activeTab="tab1" onTabChange={() => {}} />);
    
    expect(screen.getByText('Tab 1')).toBeInTheDocument();
    expect(screen.getByText('Tab 2')).toBeInTheDocument();
    expect(screen.getByTestId('icon1')).toBeInTheDocument();
    expect(screen.getByTestId('icon2')).toBeInTheDocument();
  });

  it('highlights the active tab', () => {
    render(<TabNav tabs={tabs} activeTab="tab2" onTabChange={() => {}} />);
    
    const tab1Button = screen.getByTitle('Tab 1');
    const tab2Button = screen.getByTitle('Tab 2');
    
    expect(tab1Button).not.toHaveClass('active');
    expect(tab2Button).toHaveClass('active');
  });

  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<TabNav tabs={tabs} activeTab="tab1" onTabChange={onTabChange} />);
    
    fireEvent.click(screen.getByText('Tab 2'));
    expect(onTabChange).toHaveBeenCalledWith('tab2');
  });

  it('renders a badge when tab.badge is true', () => {
    const { container } = render(<TabNav tabs={tabs} activeTab="tab1" onTabChange={() => {}} />);
    
    const badge = container.querySelector('.tab-badge');
    expect(badge).toBeInTheDocument();
    
    // Check that Tab 1 does not have a badge (needs more specific selector or logic if both could have it)
    const tab1IconWrapper = screen.getByTitle('Tab 1').querySelector('.tab-icon-wrapper');
    expect(tab1IconWrapper?.querySelector('.tab-badge')).not.toBeInTheDocument();
    
    const tab2IconWrapper = screen.getByTitle('Tab 2').querySelector('.tab-icon-wrapper');
    expect(tab2IconWrapper?.querySelector('.tab-badge')).toBeInTheDocument();
  });
});
