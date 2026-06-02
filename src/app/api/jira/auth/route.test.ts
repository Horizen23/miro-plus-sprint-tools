import { POST } from './route';
import { NextResponse } from 'next/server';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Jira Auth API Route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.JIRA_CLIENT_SECRET = 'test-secret';
    process.env.NEXT_PUBLIC_JIRA_CLIENT_ID = 'test-client-id';
    process.env.NEXT_PUBLIC_JIRA_AUTH_URL = 'https://auth.atlassian.com';
    
    // Mock global fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns 500 if JIRA_CLIENT_SECRET is missing', async () => {
    delete process.env.JIRA_CLIENT_SECRET;

    const request = new Request('http://localhost/api/jira/auth', {
      method: 'POST',
      body: JSON.stringify({ code: 'test-code', redirect_uri: 'http://localhost/callback' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Missing JIRA_CLIENT_SECRET');
  });

  it('exchanges code for token successfully', async () => {
    const mockTokenResponse = {
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockTokenResponse,
    });

    const request = new Request('http://localhost/api/jira/auth', {
      method: 'POST',
      body: JSON.stringify({ code: 'test-code', redirect_uri: 'http://localhost/callback' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockTokenResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://auth.atlassian.com/oauth/token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: 'test-client-id',
          client_secret: 'test-secret',
          code: 'test-code',
          redirect_uri: 'http://localhost/callback',
        }),
      })
    );
  });

  it('returns error status if Jira API fails', async () => {
    const mockErrorResponse = { error: 'invalid_grant', error_description: 'Invalid code' };

    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => mockErrorResponse,
    });

    const request = new Request('http://localhost/api/jira/auth', {
      method: 'POST',
      body: JSON.stringify({ code: 'invalid-code', redirect_uri: 'http://localhost/callback' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toEqual(mockErrorResponse);
  });

  it('returns 500 if an exception occurs', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const request = new Request('http://localhost/api/jira/auth', {
      method: 'POST',
      body: JSON.stringify({ code: 'test-code', redirect_uri: 'http://localhost/callback' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal Server Error');
  });
});
