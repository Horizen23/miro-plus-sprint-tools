import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import HomePage from './page';

vi.mock('next/dynamic', () => ({
  default: vi.fn((loader: any) => {
    return function MockDynamic() {
      return <div data-testid="mock-dynamic">Dynamic Component</div>;
    };
  }),
}));

describe('HomePage', () => {
  it('renders dynamic InitContent', () => {
    render(<HomePage />);
    expect(screen.getByTestId('mock-dynamic')).toBeInTheDocument();
  });
});
