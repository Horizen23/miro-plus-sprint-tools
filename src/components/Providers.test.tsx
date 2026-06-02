import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Providers from './Providers';

// Mock providers
vi.mock('@mirohq/websdk-react-hooks', () => ({
  MiroProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="miro-provider">{children}</div>,
}));
vi.mock('@/contexts/JiraAuthContext', () => ({
  JiraAuthProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="jira-auth-provider">{children}</div>,
}));
vi.mock('@/contexts/GlobalConfigContext', () => ({
  GlobalConfigProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="global-config-provider">{children}</div>,
}));

describe('Providers', () => {
  it('renders all providers in correct order', () => {
    render(
      <Providers>
        <div data-testid="child">App Content</div>
      </Providers>
    );
    
    expect(screen.getByTestId('miro-provider')).toBeInTheDocument();
    expect(screen.getByTestId('global-config-provider')).toBeInTheDocument();
    expect(screen.getByTestId('jira-auth-provider')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
    
    // Check nesting
    const miro = screen.getByTestId('miro-provider');
    const global = screen.getByTestId('global-config-provider');
    const jira = screen.getByTestId('jira-auth-provider');
    
    expect(miro).toContainElement(global);
    expect(global).toContainElement(jira);
    expect(jira).toContainElement(screen.getByTestId('child'));
  });
});
