import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeFactory } from './factory';
import { SocketIOAdapter } from './SocketIOAdapter';
import { SupabaseAdapter } from './SupabaseAdapter';

vi.mock('./SocketIOAdapter', () => ({
  SocketIOAdapter: vi.fn().mockImplementation(function() {
    return { type: 'socketio' };
  })
}));

vi.mock('./SupabaseAdapter', () => ({
  SupabaseAdapter: vi.fn().mockImplementation(function() {
    return { type: 'supabase' };
  })
}));

describe('RealtimeFactory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Reset singleton instance using reflection since it's private
    (RealtimeFactory as any).instance = null;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return SocketIOAdapter by default', () => {
    const instance = RealtimeFactory.getInstance();
    expect(SocketIOAdapter).toHaveBeenCalled();
    expect((instance as any).type).toBe('socketio');
  });

  it('should return SupabaseAdapter when provider is supabase', () => {
    process.env.NEXT_PUBLIC_REALTIME_PROVIDER = 'supabase';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test.com';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = '';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';

    const instance = RealtimeFactory.getInstance();
    expect(SupabaseAdapter).toHaveBeenCalledWith('http://test.com', 'test-key');
    expect((instance as any).type).toBe('supabase');
  });

  it('should return the same instance (singleton)', () => {
    const instance1 = RealtimeFactory.getInstance();
    const instance2 = RealtimeFactory.getInstance();
    expect(instance1).toBe(instance2);
    expect(SocketIOAdapter).toHaveBeenCalledTimes(1);
  });
});
