import { apiClient } from './apiClient';
import { cacheService } from './cacheService';
import type { PolymarketMarket } from '@/types/market';

/**
 * Service for Polymarket-specific API operations
 */
class PolymarketService {
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch Polymarket markets
   */
  async fetchMarkets(searchTerm?: string | null, offset: number = 0): Promise<{ markets: PolymarketMarket[] | null; error: any }> {
    const cacheKey = `polymarket-${searchTerm || 'all'}-${offset}`;
    
    // Check cache
    const cached = cacheService.get<{ markets: PolymarketMarket[] }>(cacheKey, this.CACHE_DURATION);
    if (cached) {
      console.log('[PolymarketService] Using cached markets');
      return { markets: cached.markets, error: null };
    }

    // Fetch from API
    const { data, error } = await apiClient.invoke('polymarket-markets', {
      searchTerm,
      offset,
    });

    if (data && !error) {
      cacheService.set(cacheKey, data);
    }

    return { markets: data?.markets || null, error };
  }

  /**
   * Fetch portfolio data
   */
  async fetchPortfolio(): Promise<any> {
    const { data: { session } } = await apiClient.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/polymarket-portfolio`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch portfolio: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    return data;
  }

  /**
   * Clear cache for specific key or all
   */
  clearCache(searchTerm?: string, offset?: number) {
    if (searchTerm !== undefined && offset !== undefined) {
      const cacheKey = `polymarket-${searchTerm || 'all'}-${offset}`;
      cacheService.clear(cacheKey);
    } else {
      // Clear all polymarket caches
      const stats = cacheService.getStats();
      stats.keys.forEach(key => {
        if (key.startsWith('polymarket-')) {
          cacheService.clear(key);
        }
      });
    }
  }
}

export const polymarketService = new PolymarketService();
