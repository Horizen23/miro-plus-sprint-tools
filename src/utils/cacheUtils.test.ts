import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { cacheUtils } from './cacheUtils';

describe('cacheUtils', () => {

  beforeEach(() => {
    const storage: Record<string, string> = {};
    const stub = {
      setItem: vi.fn((key, val) => { 
        storage[key] = val;
        (stub as any)[key] = val;
      }),
      getItem: vi.fn((key) => storage[key] || null),
      removeItem: vi.fn((key) => { 
        delete storage[key];
        delete (stub as any)[key];
      }),
      clear: vi.fn(() => { 
        Object.keys(storage).forEach(key => {
          delete storage[key];
          delete (stub as any)[key];
        });
      }),
    };
    vi.stubGlobal('localStorage', stub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should store and retrieve data with TTL', () => {
    cacheUtils.set('test_key', { foo: 'bar' }, 60);
    const data = cacheUtils.get<{ foo: string }>('test_key');
    expect(data).toEqual({ foo: 'bar' });
  });

  it('should return null if data is expired', () => {
    vi.useFakeTimers();
    cacheUtils.set('expired_key', 'data', 1);
    
    vi.advanceTimersByTime(2000);
    
    expect(cacheUtils.get('expired_key')).toBeNull();
    vi.useRealTimers();
  });

  it('should handle corrupt JSON data gracefully', () => {
    localStorage.setItem('corrupt_key', 'invalid-json');
    expect(cacheUtils.get('corrupt_key')).toBeNull();
  });

  it('should remove a specific key', () => {
    cacheUtils.set('key_to_remove', 'data', 60);
    cacheUtils.remove('key_to_remove');
    expect(cacheUtils.get('key_to_remove')).toBeNull();
  });

  it('should clear all app-related caches', () => {
    cacheUtils.set('miro_cache_1', 'data1', 60);
    cacheUtils.set('jira_cache_1', 'data2', 60);
    cacheUtils.set('other_cache', 'data3', 60);

    cacheUtils.clearAll();

    expect(cacheUtils.get('miro_cache_1')).toBeNull();
    expect(cacheUtils.get('jira_cache_1')).toBeNull();
    expect(cacheUtils.get('other_cache')).toBe('data3');
  });

  it('should clear caches by prefix', () => {
    cacheUtils.set('prefix_1', 'data1', 60);
    cacheUtils.set('prefix_2', 'data2', 60);
    cacheUtils.set('other', 'data3', 60);

    cacheUtils.clearByPrefix('prefix_');

    expect(cacheUtils.get('prefix_1')).toBeNull();
    expect(cacheUtils.get('prefix_2')).toBeNull();
    expect(cacheUtils.get('other')).toBe('data3');
  });

  it('should return null if isCacheEntry check fails', () => {
    localStorage.setItem('invalid_entry', JSON.stringify({ wrong: 'format' }));
    expect(cacheUtils.get('invalid_entry')).toBeNull();
  });

  it('should handle localStorage being undefined', () => {
    const originalLocalStorage = global.localStorage;
    // @ts-expect-error - testing undefined localStorage
    delete global.localStorage;
    
    // Should not throw
    cacheUtils.set('key', 'data', 60);
    expect(cacheUtils.get('key')).toBeNull();
    cacheUtils.remove('key');
    cacheUtils.clearAll();
    cacheUtils.clearByPrefix('p');

    global.localStorage = originalLocalStorage;
  });

  it('should warn when localStorage.setItem fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => { throw new Error('Quota exceeded'); }),
    });

    cacheUtils.set('key', 'data', 60);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
