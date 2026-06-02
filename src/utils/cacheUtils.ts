/**
 * Simple Caching Utility with TTL (Time-To-Live)
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

/**
 * Type guard to check if a value is a valid CacheEntry
 */
function isCacheEntry<T>(value: unknown): value is CacheEntry<T> {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return 'data' in entry && typeof entry.expiry === 'number';
}

export const cacheUtils = {
  /**
   * Store data in localStorage with an expiry time
   * @param key Storage key
   * @param data Data to store
   * @param ttlSeconds Seconds until expiry
   */
  set: <T>(key: string, data: T, ttlSeconds: number): void => {
    const entry: CacheEntry<T> = {
      data,
      expiry: Date.now() + ttlSeconds * 1000,
    };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(entry));
      }
    } catch (e) {
      console.warn(`[Cache] Failed to set key "${key}":`, e);
    }
  },

  /**
   * Retrieve data from localStorage if not expired
   * @param key Storage key
   * @returns Data or null if not found or expired
   */
  get: <T>(key: string): T | null => {
    try {
      if (typeof localStorage === 'undefined') return null;
      
      const raw = localStorage.getItem(key);
      if (!raw) return null;

      const entry: unknown = JSON.parse(raw);
      
      if (!isCacheEntry<T>(entry)) {
        return null;
      }

      if (Date.now() > entry.expiry) {
        localStorage.removeItem(key);
        return null;
      }
      return entry.data;
    } catch (e) {
      return null;
    }
  },

  /**
   * Clear a specific cache key
   */
  remove: (key: string): void => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  },

  /**
   * Clear all app-related caches
   */
  clearAll: (): void => {
    if (typeof localStorage === 'undefined') return;
    
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('miro_cache_') || key.startsWith('jira_cache_')) {
        localStorage.removeItem(key);
      }
    });
  },

  /**
   * Clear caches by prefix
   */
  clearByPrefix: (prefix: string): void => {
    if (typeof localStorage === 'undefined') return;

    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    });
  }
};
