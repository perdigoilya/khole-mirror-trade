import { useState, useEffect, useCallback, useRef } from 'react';
import { kalshiService } from '@/services/kalshiService';
import { polymarketService } from '@/services/polymarketService';
import type { Market, MarketProvider } from '@/types/market';

export function useMarketData(
  platform: MarketProvider,
  searchTerm?: string | null,
  enabled: boolean = true
) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentFetchRef = useRef<{ platform: MarketProvider; controller: AbortController } | null>(null);

  const fetchMarkets = useCallback(async () => {
    if (!enabled) return;

    // Cancel any existing fetch if switching platforms
    if (currentFetchRef.current && currentFetchRef.current.platform !== platform) {
      currentFetchRef.current.controller.abort();
      currentFetchRef.current = null;
    }

    // Create abort controller for this fetch
    const controller = new AbortController();
    currentFetchRef.current = { platform, controller };

    setLoading(true);
    setError(null);

    try {
      if (platform === 'kalshi') {
        const { events, error: apiError } = await kalshiService.fetchEvents();
        
        if (apiError) throw apiError;
        if (!events) throw new Error('No events returned');

        const flattened = kalshiService.flattenEvents(events);
        
        // Apply search filter if provided
        let filtered = flattened;
        if (searchTerm) {
          filtered = flattened.filter((market: any) =>
            (market.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (market.ticker || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (market.eventTicker || '').toLowerCase().includes(searchTerm.toLowerCase())
          );
        }

        // Check if still relevant
        if (currentFetchRef.current?.platform === platform) {
          setMarkets(filtered);
        }
      } else {
        const { markets: apiMarkets, error: apiError } = await polymarketService.fetchMarkets(searchTerm);
        
        if (apiError) throw apiError;
        
        // Check if still relevant
        if (currentFetchRef.current?.platform === platform) {
          setMarkets(apiMarkets || []);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log(`Fetch aborted for ${platform}`);
        return;
      }
      
      if (currentFetchRef.current?.platform === platform) {
        setError(err.message || 'Failed to fetch markets');
      }
    } finally {
      if (currentFetchRef.current?.platform === platform) {
        setLoading(false);
      }
    }
  }, [platform, searchTerm, enabled]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchMarkets();
    }, 300); // Debounce

    return () => {
      clearTimeout(timeoutId);
      if (currentFetchRef.current) {
        currentFetchRef.current.controller.abort();
      }
    };
  }, [fetchMarkets]);

  return {
    markets,
    loading,
    error,
    refetch: fetchMarkets,
  };
}
