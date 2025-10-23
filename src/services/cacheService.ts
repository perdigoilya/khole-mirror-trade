/**
 * Centralized caching service for API responses
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultDuration: number = 60000; // 1 minute

  /**
   * Get cached data if still valid
   */
  get<T>(key: string, duration: number = this.defaultDuration): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < duration) {
      console.log(`[CacheService] Cache hit for: ${key}`);
      return cached.data as T;
    }
    return null;
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // Limit cache size to prevent memory issues
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * Clear specific key or entire cache
   */
  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Check if cache has valid entry
   */
  has(key: string, duration: number = this.defaultDuration): boolean {
    const cached = this.cache.get(key);
    return cached ? Date.now() - cached.timestamp < duration : false;
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export const cacheService = new CacheService();
