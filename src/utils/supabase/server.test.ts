import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerClient } from '@supabase/ssr';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

describe('Supabase Server Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('should call createServerClient with environment variables and cookie handlers', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';

    const { createClient } = await import('./server');
    const mockCookieStore = {
      getAll: vi.fn().mockReturnValue([{ name: 'test', value: 'val' }]),
      set: vi.fn(),
    } as any;

    createClient(mockCookieStore);

    expect(createServerClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'test-key',
      expect.objectContaining({
        cookies: expect.any(Object),
      })
    );

    const callArgs = vi.mocked(createServerClient).mock.calls[0][2];
    const cookieHandlers = callArgs?.cookies;

    expect(cookieHandlers?.getAll()).toEqual([{ name: 'test', value: 'val' }]);
    
    cookieHandlers?.setAll?.([{ name: 'new', value: 'val', options: {} }], {});
    expect(mockCookieStore.set).toHaveBeenCalledWith('new', 'val', {});
  });

  it('should handle errors in setAll gracefully', async () => {
    const { createClient } = await import('./server');
    const mockCookieStore = {
      set: vi.fn(() => { throw new Error('Cannot set cookie'); }),
      getAll: vi.fn(),
    } as any;

    createClient(mockCookieStore);
    const callArgs = vi.mocked(createServerClient).mock.calls[0][2];
    const cookieHandlers = callArgs?.cookies;

    // Should not throw
    cookieHandlers?.setAll?.([{ name: 'new', value: 'val', options: {} }], {});
  });
});
