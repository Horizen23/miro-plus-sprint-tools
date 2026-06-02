import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MiroLayout from './layout';
import React from 'react';

vi.mock('next/script', () => ({
  default: ({ src, strategy }: any) => <div data-testid="next-script" data-src={src} data-strategy={strategy} />,
}));

vi.mock('../../components/Providers', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="providers">{children}</div>,
}));

describe('MiroLayout', () => {
  it('renders Miro SDK script and providers', () => {
    render(
      <MiroLayout>
        <div data-testid="child">Content</div>
      </MiroLayout>
    );

    expect(screen.getByTestId('next-script')).toBeInTheDocument();
    expect(screen.getByTestId('next-script')).toHaveAttribute('data-src', 'https://miro.com/app/static/sdk/v2/miro.js');
    expect(screen.getByTestId('providers')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
