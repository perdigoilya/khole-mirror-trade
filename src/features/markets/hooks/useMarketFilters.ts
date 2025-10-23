import { useMemo } from 'react';
import type { Market, MarketFilters } from '@/types/market';

export function useMarketFilters(markets: Market[], filters: MarketFilters) {
  return useMemo(() => {
    let result = [...markets];
    
    // Time filter
    if (filters.timeFilter !== 'all-time') {
      const now = new Date();
      let maxEndDate = new Date();
      
      if (filters.timeFilter === 'today') {
        maxEndDate.setHours(23, 59, 59, 999);
      } else if (filters.timeFilter === 'this-week') {
        maxEndDate.setDate(now.getDate() + 7);
      } else if (filters.timeFilter === 'this-month') {
        maxEndDate.setDate(now.getDate() + 30);
      }
      
      result = result.filter((market) => {
        if (!market.endDate || market.endDate === 'TBD') return true;
        const endDate = new Date(market.endDate);
        return endDate >= now && endDate <= maxEndDate;
      });
    }
    
    // Category filter
    if (filters.category !== 'all') {
      result = result.filter((market) => 
        market.category?.toLowerCase() === filters.category.toLowerCase()
      );
    }
    
    // Volume filter
    result = result.filter((market) => {
      const vol = market.volumeRaw || 0;
      return vol >= filters.minVolume && vol <= filters.maxVolume;
    });
    
    // Liquidity filter
    result = result.filter((market) => {
      const liq = market.liquidityRaw || 0;
      return liq >= filters.minLiquidity && liq <= filters.maxLiquidity;
    });
    
    // Price filter
    result = result.filter((market) => {
      const price = market.yesPrice || 50;
      return price >= filters.minPrice && price <= filters.maxPrice;
    });
    
    // Status filter
    if (filters.status !== 'all') {
      result = result.filter((market) => 
        market.status?.toLowerCase() === filters.status.toLowerCase()
      );
    }
    
    // Apply sorting
    if (filters.sortBy === 'trending') {
      result.sort((a, b) => (b.volumeRaw || 0) - (a.volumeRaw || 0));
    } else if (filters.sortBy === 'top') {
      result.sort((a, b) => (b.liquidityRaw || 0) - (a.liquidityRaw || 0));
    } else if (filters.sortBy === 'new') {
      result.reverse();
    }
    
    return result;
  }, [markets, filters]);
}
