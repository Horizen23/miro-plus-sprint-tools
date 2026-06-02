import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SummaryCard, SummaryItem, SummaryRow, SummaryDivider } from './SummaryCard';

describe('SummaryCard components', () => {
  it('SummaryCard renders children correctly', () => {
    render(<SummaryCard>Test Content</SummaryCard>);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('SummaryItem renders label and value', () => {
    render(<SummaryItem label="Points" value="5" />);
    expect(screen.getByText('Points')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('SummaryItem renders hint when provided', () => {
    render(<SummaryItem label="Points" value="5" hint="Total for selected" />);
    expect(screen.getByText('Total for selected')).toBeInTheDocument();
  });

  it('SummaryItem applies alignment style', () => {
    const { container } = render(<SummaryItem label="Points" value="5" align="right" />);
    expect(container.firstChild).toHaveStyle({ textAlign: 'right' });
  });

  it('SummaryRow renders children', () => {
    render(<SummaryRow>Row Content</SummaryRow>);
    expect(screen.getByText('Row Content')).toBeInTheDocument();
  });

  it('SummaryDivider renders', () => {
    const { container } = render(<SummaryDivider />);
    expect(container.firstChild).toHaveClass('summary-divider');
  });
});
