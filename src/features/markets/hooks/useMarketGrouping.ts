import { useMemo } from 'react';
import type { Market, GroupedMarket, MarketProvider } from '@/types/market';
import kalshiPoliticsImage from "@/assets/kalshi-politics.png";
import kalshiSportsImage from "@/assets/kalshi-sports.png";
import kalshiEconomicsImage from "@/assets/kalshi-economics.png";
import kalshiWeatherImage from "@/assets/kalshi-weather.png";
import kalshiGeneralImage from "@/assets/kalshi-general.png";

const getCategoryImage = (category: string): string => {
  const categoryMap: Record<string, string> = {
    'politics': kalshiPoliticsImage,
    'sports': kalshiSportsImage,
    'economics': kalshiEconomicsImage,
    'financials': kalshiEconomicsImage,
    'finance': kalshiEconomicsImage,
    'climate and weather': kalshiWeatherImage,
    'weather': kalshiWeatherImage,
    'science and technology': kalshiGeneralImage,
    'technology': kalshiGeneralImage,
    'world': kalshiGeneralImage,
    'health': kalshiGeneralImage,
    'entertainment': kalshiGeneralImage,
  };
  return categoryMap[category?.toLowerCase()] || kalshiGeneralImage;
};

export function useMarketGrouping(
  markets: Market[],
  platform: MarketProvider,
  groupByEvent: boolean
): GroupedMarket[] {
  return useMemo(() => {
    // If not grouping, return as-is with images for Kalshi
    if (!groupByEvent || platform !== 'kalshi') {
      if (platform === 'kalshi') {
        return markets.map((m) => ({
          ...m,
          image: m.image || getCategoryImage(m.category || '')
        }));
      }
      return markets;
    }

    // Group Kalshi markets by eventTicker
    console.log('🔍 [GROUPING] Starting grouping process');
    console.log('🔍 Total markets to process:', markets.length);
    
    const eventGroups = new Map<string, Market[]>();
    
    for (const market of markets) {
      const eventTicker = (market as any).eventTicker || market.id;
      if (!eventGroups.has(eventTicker)) {
        eventGroups.set(eventTicker, []);
      }
      eventGroups.get(eventTicker)!.push(market);
    }
    
    console.log('🔍 Grouped into', eventGroups.size, 'events');
    
    const result: GroupedMarket[] = [];
    let groupedCount = 0;
    
    for (const [eventTicker, mkts] of eventGroups) {
      if (mkts.length === 1) {
        // Single market - add image and return as-is
        result.push({
          ...mkts[0],
          image: mkts[0].image || getCategoryImage(mkts[0].category || '')
        });
      } else {
        // Multiple markets - group them
        const main = mkts.reduce((a, b) => 
          ((b.volumeRaw || 0) > (a.volumeRaw || 0) ? b : a), 
          mkts[0]
        );
        const sub = mkts.filter((m) => m !== main);
        
        result.push({
          ...main,
          image: main.image || getCategoryImage(main.category || ''),
          isMultiOutcome: true,
          subMarkets: sub.map(m => ({
            ...m,
            image: m.image || getCategoryImage(m.category || '')
          }))
        });
        
        groupedCount++;
      }
    }
    
    console.log('🔍 Result:', result.length, 'items', `(${groupedCount} grouped)`);
    
    return result;
  }, [markets, platform, groupByEvent]);
}
