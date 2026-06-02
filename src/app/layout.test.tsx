import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RootLayout, { metadata } from './layout';

describe('RootLayout', () => {
  it('renders children correctly', () => {
    const { getByText } = render(
      <RootLayout>
        <div data-testid="child">Test Child</div>
      </RootLayout>
    );
    expect(getByText('Test Child')).toBeInTheDocument();
  });

  it('has correct metadata', () => {
    expect(metadata.title).toBe(process.env.NEXT_PUBLIC_APP_NAME || 'Plus Sprint Tools');
    expect(metadata.description).toContain(process.env.NEXT_PUBLIC_APP_NAME || 'Plus Sprint Tools');
  });
});
