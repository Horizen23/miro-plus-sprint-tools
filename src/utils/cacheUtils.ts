/**
 * Simple Caching Utility with TTL (Time-To-Live)
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

export const cacheUtils = {
  /**
   * Store data in localStorage with an expiry time
   * @param key Storage key
   * @param data Data to store
   * @param ttlSeconds Seconds until expiry
   */
  set: <T>(key: string, data: T, ttlSeconds: number) => {
    const entry: CacheEntry<T> = {
      data,
      expiry: Date.now() + ttlSeconds * 1000,
    };
    try {
      localStorage.setItem(key, JSON.stringify(entry));
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
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
      const entry: CacheEntry<T> = JSON.parse(raw);
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
  remove: (key: string) => {
    localStorage.removeItem(key);
  },

  /**
   * Clear all app-related caches
   */
  clearAll: () => {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('miro_cache_') || key.startsWith('jira_cache_')) {
        localStorage.removeItem(key);
      }
    });
  }
};
