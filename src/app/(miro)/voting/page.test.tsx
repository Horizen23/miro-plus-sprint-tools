import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import VotingPage from './page';

vi.mock('next/dynamic', () => ({
  default: vi.fn((loader: any) => {
    return function MockDynamic() {
      return <div data-testid="mock-dynamic">Dynamic Voting Content</div>;
    };
  }),
}));

describe('VotingPage', () => {
  it('renders dynamic VotingContent', () => {
    render(<VotingPage />);
    expect(screen.getByTestId('mock-dynamic')).toBeInTheDocument();
  });
});
