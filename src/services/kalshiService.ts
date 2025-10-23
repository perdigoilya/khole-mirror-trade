import { apiClient } from './apiClient';
import { cacheService } from './cacheService';
import type { KalshiEvent, KalshiMarket } from '@/types/market';

/**
 * Service for Kalshi-specific API operations
 */
class KalshiService {
  private readonly CACHE_KEY = 'kalshi-events';
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch Kalshi events (with caching)
   */
  async fetchEvents(): Promise<{ events: KalshiEvent[] | null; error: any }> {
    // Check cache first
    const cached = cacheService.get<{ events: KalshiEvent[] }>(this.CACHE_KEY, this.CACHE_DURATION);
    if (cached) {
      console.log('[KalshiService] Using cached events');
      return { events: cached.events, error: null };
    }

    // Fetch from API
    const { data, error } = await apiClient.invoke('kalshi-events', {});
    
    if (data && !error) {
      cacheService.set(this.CACHE_KEY, data);
    }

    return { events: data?.events || null, error };
  }

  /**
   * Flatten Kalshi events into individual markets
   */
  flattenEvents(events: KalshiEvent[]): KalshiMarket[] {
    const flattened = events.flatMap((ev) => {
      const evTicker = ev.eventTicker || (ev as any).ticker || (ev as any).id;
      const evImage = ev.image;
      const evCategory = ev.category || 'General';
      const evMarkets = Array.isArray(ev.markets) ? ev.markets : [];

      return evMarkets.map((m: any) => ({
        ...m,
        id: m.ticker || m.id,
        ticker: m.ticker || m.id,
        title: m.title || ev.title,
        eventTicker: m.eventTicker || evTicker,
        provider: 'kalshi' as const,
        image: m.image || evImage,
        category: m.category || evCategory,
        volumeRaw: m.volumeRaw ?? m.volume ?? 0,
        liquidityRaw: m.liquidityRaw ?? m.liquidity ?? 0,
        volume: typeof m.volume === 'string' && m.volume.startsWith('$')
          ? m.volume
          : typeof m.volumeRaw === 'number' 
            ? `$${Math.round(m.volumeRaw).toLocaleString('en-US')}` 
            : '$0',
        liquidity: typeof m.liquidity === 'string' && m.liquidity.startsWith('$')
          ? m.liquidity
          : typeof m.liquidityRaw === 'number' 
            ? `$${Math.round(m.liquidityRaw).toLocaleString('en-US')}` 
            : '$0',
        endDate: m.endDate || ev.endDate,
        status: (m.status || ev.status || 'active').toString(),
      }));
    });

    console.log(`[KalshiService] Flattened ${events.length} events into ${flattened.length} markets`);
    return flattened;
  }

  /**
   * Fetch portfolio data
   */
  async fetchPortfolio(credentials: any) {
    return await apiClient.invoke('kalshi-portfolio', credentials);
  }

  /**
   * Clear cache
   */
  clearCache() {
    cacheService.clear(this.CACHE_KEY);
  }
}

export const kalshiService = new KalshiService();
