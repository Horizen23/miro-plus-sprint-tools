import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useJira } from './useJira';
import { JiraService } from '@/services/jira/JiraService';

vi.mock('@/services/jira/JiraService', () => {
  return {
    JiraService: vi.fn().mockImplementation(function() {
      return {
        refreshAccessToken: vi.fn().mockResolvedValue({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token'
        })
      };
    })
  };
});

describe('useJira', () => {
  const mockConfig = {
    authType: 'oauth',
    refreshToken: 'old-refresh-token',
    accessToken: 'old-access-token'
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
    });
    vi.stubGlobal('process', {
      env: {
        NEXT_PUBLIC_LOCALSTORAGE_JIRA_CONFIG_KEY: 'jira-config-v2'
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should initialize with hasConfig based on localStorage', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(mockConfig));
    const { result } = renderHook(() => useJira());
    expect(result.current.hasConfig).toBe(true);
  });

  it('should handle token refresh on 401 error', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(mockConfig));
    
    const { result } = renderHook(() => useJira());
    
    const operation = vi.fn()
      .mockRejectedValueOnce({ status: 401 })
      .mockResolvedValueOnce('success');

    const response = await result.current.withRefresh(operation);
    
    expect(response).toBe('success');
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'jira-config-v2', 
      expect.stringContaining('new-access-token')
    );
  });
});
