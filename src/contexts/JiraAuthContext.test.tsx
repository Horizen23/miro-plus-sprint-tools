import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraAuthProvider, useJiraAuth } from './JiraAuthContext';
import { RealtimeFactory } from '../services/realtime/factory';
import { JiraService } from '../services/jira/JiraService';
import * as React from 'react';

// Mock dependencies
vi.mock('../services/realtime/factory', () => ({
  RealtimeFactory: {
    getInstance: vi.fn(() => ({
      connect: vi.fn(),
      subscribeToAuth: vi.fn(() => vi.fn()),
    })),
  },
}));

vi.mock('../services/jira/JiraService', () => ({
  JiraService: vi.fn().mockImplementation(function() {
    return {
      getAccessibleResources: vi.fn().mockResolvedValue([
        { id: 'cloud-1', name: 'Site 1', url: 'https://site1.atlassian.net' },
      ]),
    };
  }),
}));

describe('JiraAuthContext', () => {
  const mockLocalStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => mockLocalStorage[key] || null),
      setItem: vi.fn((key, val) => { mockLocalStorage[key] = val; }),
      removeItem: vi.fn((key) => { delete mockLocalStorage[key]; }),
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'test-access',
        refresh_token: 'test-refresh',
      }),
    }));

    // Mock specific window properties instead of stubbing the whole object
    vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
    
    vi.stubGlobal('process', {
      env: {
        NEXT_PUBLIC_JIRA_CLIENT_ID: 'test-client-id',
        NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY: 'jira-config-v2',
        NEXT_PUBLIC_LOCALSTORAGE_JIRA_STATE_KEY: 'jira_auth_state',
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key]);
  });

  it('should initialize config from localStorage', () => {
    const savedConfig = { authType: 'oauth', accessToken: 'saved-token' };
    mockLocalStorage['jira-config-v2'] = JSON.stringify(savedConfig);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <JiraAuthProvider>{children}</JiraAuthProvider>
    );

    const { result } = renderHook(() => useJiraAuth(), { wrapper });
    expect(result.current.config).toEqual(savedConfig);
  });

  it('logout should clear config and localStorage', () => {
    const savedConfig = { authType: 'oauth', accessToken: 'saved-token' };
    mockLocalStorage['jira-config-v2'] = JSON.stringify(savedConfig);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <JiraAuthProvider>{children}</JiraAuthProvider>
    );

    const { result } = renderHook(() => useJiraAuth(), { wrapper });
    
    act(() => {
      result.current.logout();
    });

    expect(result.current.config).toEqual({ authType: 'oauth' });
    expect(mockLocalStorage['jira-config-v2']).toBeUndefined();
  });

  it('startOAuth should set state in localStorage and open window', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <JiraAuthProvider>{children}</JiraAuthProvider>
    );

    const { result } = renderHook(() => useJiraAuth(), { wrapper });

    act(() => {
      result.current.startOAuth();
    });

    expect(mockLocalStorage['jira_auth_state']).toBeDefined();
    expect(window.open).toHaveBeenCalled();
  });

  it('handleTokenExchange should update config when only one resource is available', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <JiraAuthProvider>{children}</JiraAuthProvider>
    );

    const { result } = renderHook(() => useJiraAuth(), { wrapper });

    // Simulate OAuth callback via message
    const mockAuthCode = 'auth-code';
    const state = 'test-state';
    mockLocalStorage['jira_auth_state'] = state;
    
    // Get the message listener
    const messageListener = vi.mocked(window.addEventListener).mock.calls.find(call => call[0] === 'message')?.[1] as Function;
    
    act(() => {
      messageListener({ data: { type: 'JIRA_AUTH_CODE', code: mockAuthCode, state } });
    });

    await waitFor(() => {
      expect(result.current.config.accessToken).toBe('test-access');
    }, { timeout: 2000 });

    expect(result.current.config.cloudId).toBe('cloud-1');
    expect(mockLocalStorage['jira-config-v2']).toContain('test-access');
  });

  it('should allow selecting resource when multiple are available', async () => {
    const resources = [
      { id: 'cloud-1', name: 'Site 1', url: 'https://site1.atlassian.net', scopes: [] },
      { id: 'cloud-2', name: 'Site 2', url: 'https://site2.atlassian.net', scopes: [] },
    ];
    
    // Mock JiraService to return multiple resources
    vi.mocked(JiraService).mockImplementation(function() {
      return {
        getAccessibleResources: vi.fn().mockResolvedValue(resources),
      };
    } as any);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <JiraAuthProvider>{children}</JiraAuthProvider>
    );

    const { result } = renderHook(() => useJiraAuth(), { wrapper });

    const state = 'test-state';
    mockLocalStorage['jira_auth_state'] = state;

    const messageListener = vi.mocked(window.addEventListener).mock.calls.find(call => call[0] === 'message')?.[1] as Function;
    
    act(() => {
      messageListener({ data: { type: 'JIRA_AUTH_CODE', code: 'code', state } });
    });

    // Multiple resources should be available
    await waitFor(() => {
      expect(result.current.availableResources).toHaveLength(2);
    });

    // Select the second one
    act(() => {
      result.current.selectResource(resources[1]);
    });

    expect(result.current.config.cloudId).toBe('cloud-2');
    expect(result.current.availableResources).toHaveLength(0);
  });
});
