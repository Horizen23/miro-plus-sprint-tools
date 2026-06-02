import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import PanelPage from './page';

vi.mock('next/dynamic', () => ({
  default: vi.fn((loader: any) => {
    return function MockDynamic() {
      return <div data-testid="mock-dynamic">Dynamic Panel Content</div>;
    };
  }),
}));

describe('PanelPage', () => {
  it('renders dynamic PanelContent', () => {
    render(<PanelPage />);
    expect(screen.getByTestId('mock-dynamic')).toBeInTheDocument();
  });
});
