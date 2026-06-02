import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders children correctly', () => {
    render(<Badge>Test Badge</Badge>);
    expect(screen.getByText('Test Badge')).toBeInTheDocument();
  });

  it('applies the default status class', () => {
    const { container } = render(<Badge>Status</Badge>);
    expect(container.firstChild).toHaveClass('voting-badge-status');
  });

  it('applies count class for count variant', () => {
    const { container } = render(<Badge variant="count">5</Badge>);
    expect(container.firstChild).toHaveClass('card-count');
  });

  it('applies error class for error variant', () => {
    const { container } = render(<Badge variant="error">Error</Badge>);
    expect(container.firstChild).toHaveClass('badge-error');
  });

  it('applies success class for success variant', () => {
    const { container } = render(<Badge variant="success">Success</Badge>);
    expect(container.firstChild).toHaveClass('badge-success');
  });

  it('applies warning class for warning variant', () => {
    const { container } = render(<Badge variant="warning">Warning</Badge>);
    expect(container.firstChild).toHaveClass('badge-warning');
  });

  it('applies custom className', () => {
    const { container } = render(<Badge className="custom-class">Custom</Badge>);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('applies custom style', () => {
    const { container } = render(<Badge style={{ color: 'red' }}>Styled</Badge>);
    expect(container.firstChild).toHaveStyle({ color: 'rgb(255, 0, 0)' });
  });

  it('returns empty string for unknown variant (though TypeScript prevents this)', () => {
    // @ts-ignore
    const { container } = render(<Badge variant="unknown">Unknown</Badge>);
    expect((container.firstChild as HTMLElement)?.className.trim()).toBe('');
  });
});
