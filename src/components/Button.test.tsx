import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders children correctly', () => {
    render(<Button>Click Me</Button>);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('applies the correct variant class', () => {
    const { container } = render(<Button variant="secondary">Secondary</Button>);
    expect(container.firstChild).toHaveClass('btn-secondary');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);
    fireEvent.click(screen.getByText('Click Me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows loading spinner and disables button when loading', () => {
    render(<Button loading>Submit</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button').querySelector('.spinner')).toBeInTheDocument();
  });

  it('is disabled when the disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applies fullWidth style when prop is true', () => {
    render(<Button fullWidth>Full Width</Button>);
    expect(screen.getByRole('button')).toHaveStyle({ width: '100%' });
  });

  it('applies correct spinner styles when loading with children', () => {
    render(<Button loading>Loading</Button>);
    const spinner = screen.getByRole('button').querySelector('.spinner');
    expect(spinner).toHaveStyle({ marginRight: '4px' });
  });

  it('applies correct spinner styles when loading without children', () => {
    render(<Button loading />);
    const spinner = screen.getByRole('button').querySelector('.spinner');
    expect(spinner).toHaveStyle({ marginRight: '0' });
  });

  it('applies tiny spinner styles for tiny variant', () => {
    render(<Button loading variant="tiny" />);
    const spinner = screen.getByRole('button').querySelector('.spinner');
    expect(spinner).toHaveStyle({
      width: '8px',
      height: '8px',
      borderWidth: '1px'
    });
  });

  it('applies tiny spinner styles for ghost-tiny variant', () => {
    render(<Button loading variant="ghost-tiny" />);
    const spinner = screen.getByRole('button').querySelector('.spinner');
    expect(spinner).toHaveStyle({
      width: '8px',
      height: '8px',
      borderWidth: '1px'
    });
  });

  it('applies default spinner styles for non-tiny variants', () => {
    render(<Button loading variant="primary" />);
    const spinner = screen.getByRole('button').querySelector('.spinner');
    expect(spinner).toHaveStyle({
      width: '12px',
      height: '12px',
      borderWidth: '1.5px'
    });
  });

  it('renders icon when not loading', () => {
    render(<Button icon={<span data-testid="test-icon" />}>With Icon</Button>);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('does not render icon when loading', () => {
    render(<Button loading icon={<span data-testid="test-icon" />}>With Icon</Button>);
    expect(screen.queryByTestId('test-icon')).not.toBeInTheDocument();
  });
});
