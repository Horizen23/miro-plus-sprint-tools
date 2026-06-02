import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MiroAppProvider from './MiroAppProvider';

// Mock @mirohq/websdk-react-hooks
vi.mock('@mirohq/websdk-react-hooks', () => ({
  MiroProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="miro-provider">{children}</div>,
}));

describe('MiroAppProvider', () => {
  it('renders children within MiroProvider', () => {
    render(
      <MiroAppProvider>
        <div data-testid="child">Child Content</div>
      </MiroAppProvider>
    );
    expect(screen.getByTestId('miro-provider')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
