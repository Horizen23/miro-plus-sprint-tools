import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    next: vi.fn().mockReturnValue({
      cookies: {
        set: vi.fn(),
      },
    }),
  },
}));

describe('Supabase Middleware Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('should call createServerClient and handle cookies', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';

    const { createClient } = await import('./middleware');
    const mockRequest = {
      headers: new Headers(),
      cookies: {
        getAll: vi.fn().mockReturnValue([{ name: 'test', value: 'val' }]),
        set: vi.fn(),
      },
    } as any;

    createClient(mockRequest);

    expect(createServerClient).toHaveBeenCalled();
    const callArgs = vi.mocked(createServerClient).mock.calls[0][2];
    const cookieHandlers = callArgs?.cookies;

    expect(cookieHandlers?.getAll()).toEqual([{ name: 'test', value: 'val' }]);

    cookieHandlers?.setAll?.([{ name: 'new', value: 'val', options: { path: '/' } }], {});
    expect(mockRequest.cookies.set).toHaveBeenCalledWith('new', 'val');
    expect(NextResponse.next).toHaveBeenCalled();
  });
});
