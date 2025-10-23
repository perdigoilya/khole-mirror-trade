import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Footer from "@/components/Footer";
import { useMarketData } from "@/features/markets/hooks/useMarketData";
import { useMarketFilters } from "@/features/markets/hooks/useMarketFilters";
import { useMarketGrouping } from "@/features/markets/hooks/useMarketGrouping";
import { PlatformSelector } from "@/features/markets/components/PlatformSelector";
import { MarketFilters } from "@/features/markets/components/MarketFilters";
import { MarketList } from "@/features/markets/components/MarketList";
import type { MarketFilters as MarketFiltersType, MarketProvider } from "@/types/market";

const Markets = () => {
  const [searchParams] = useSearchParams();
  const searchTerm = searchParams.get("search");
  
  const [platform, setPlatform] = useState<MarketProvider>(() => {
    const saved = localStorage.getItem('lastMarketPlatform');
    return (saved === 'polymarket' || saved === 'kalshi') ? saved : 'polymarket';
  });

  const [groupByEvent, setGroupByEvent] = useState(() => {
    const savedPlatform = localStorage.getItem('lastMarketPlatform');
    const savedGrouping = localStorage.getItem('groupByEvent');
    if (savedGrouping !== null) return savedGrouping === 'true';
    return savedPlatform === 'kalshi';
  });

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<MarketFiltersType>({
    category: 'all',
    minVolume: 0,
    maxVolume: 10000000,
    minLiquidity: 0,
    maxLiquidity: 1000000,
    minPrice: 0,
    maxPrice: 100,
    status: 'all',
    timeFilter: 'all-time',
    sortBy: 'trending',
  });

  // Persist platform and grouping preferences
  useEffect(() => {
    localStorage.setItem('lastMarketPlatform', platform);
  }, [platform]);

  useEffect(() => {
    localStorage.setItem('groupByEvent', groupByEvent.toString());
  }, [groupByEvent]);

  // Auto-set groupByEvent when platform changes (if not manually configured)
  useEffect(() => {
    const savedGrouping = localStorage.getItem('groupByEvent');
    if (savedGrouping === null) {
      setGroupByEvent(platform === 'kalshi');
    }
  }, [platform]);

  // Fetch market data
  const { markets, loading, error, refetch } = useMarketData(platform, searchTerm);

  // Apply filters
  const filteredMarkets = useMarketFilters(markets, filters);

  // Apply grouping
  const groupedMarkets = useMarketGrouping(filteredMarkets, platform, groupByEvent);

  // Extract unique categories for filter dropdown
  const categories = Array.from(
    new Set(markets.map(m => m.category).filter(Boolean))
  ).sort() as string[];

  const handlePlatformChange = (newPlatform: MarketProvider) => {
    setPlatform(newPlatform);
  };

  const handleFiltersChange = (newFilters: Partial<MarketFiltersType>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      <main className="flex-1 pt-6 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Platform Selector */}
            <PlatformSelector
              platform={platform}
              onPlatformChange={handlePlatformChange}
            />

            {/* Filters */}
            <MarketFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
              showFilters={showFilters}
              onShowFiltersChange={setShowFilters}
              platform={platform}
              groupByEvent={groupByEvent}
              onGroupByEventChange={setGroupByEvent}
              categories={categories}
            />

            {/* Market List */}
            <MarketList
              markets={groupedMarkets}
              loading={loading}
              error={error}
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Markets;
