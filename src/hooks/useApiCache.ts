import { useRef, useCallback } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

export function useApiCache<T>(cacheDuration: number = 60000) {
  const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map());
  const statsRef = useRef<CacheStats>({ hits: 0, misses: 0, size: 0 });

  const get = useCallback((key: string): T | null => {
    const cached = cacheRef.current.get(key);
    if (cached && Date.now() - cached.timestamp < cacheDuration) {
      statsRef.current.hits++;
      return cached.data;
    }
    statsRef.current.misses++;
    return null;
  }, [cacheDuration]);

  const set = useCallback((key: string, data: T) => {
    cacheRef.current.set(key, {
      data,
      timestamp: Date.now()
    });

    statsRef.current.size = cacheRef.current.size;

    // Limit cache size to prevent memory issues (increased to 200 for better performance)
    if (cacheRef.current.size > 200) {
      const firstKey = cacheRef.current.keys().next().value;
      if (firstKey) {
        cacheRef.current.delete(firstKey);
        statsRef.current.size--;
      }
    }
  }, []);

  const clear = useCallback((key?: string) => {
    if (key) {
      cacheRef.current.delete(key);
    } else {
      cacheRef.current.clear();
    }
    statsRef.current.size = cacheRef.current.size;
  }, []);

  const has = useCallback((key: string): boolean => {
    const cached = cacheRef.current.get(key);
    return cached ? Date.now() - cached.timestamp < cacheDuration : false;
  }, [cacheDuration]);

  const getStats = useCallback((): CacheStats => ({
    ...statsRef.current
  }), []);

  return { get, set, clear, has, getStats };
}
