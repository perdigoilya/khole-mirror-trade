import { useState, useEffect, useRef, useCallback } from "react";
import * as React from "react";
import Footer from "@/components/Footer";
import { Filter, Star, TrendingUp, TrendingDown, ChevronDown, ChevronRight } from "lucide-react";
import polymarketLogo from "@/assets/polymarket-logo.png";
import kalshiLogo from "@/assets/kalshi-logo.png";
import kalshiSportsImg from "@/assets/kalshi-sports.png";
import kalshiPoliticsImg from "@/assets/kalshi-politics.png";
import kalshiEconomicsImg from "@/assets/kalshi-economics.png";
import kalshiWeatherImg from "@/assets/kalshi-weather.png";
import kalshiGeneralImg from "@/assets/kalshi-general.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useTrading } from "@/contexts/TradingContext";
import { ConnectionRequired } from "@/components/ConnectionRequired";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams, useNavigate } from "react-router-dom";

// Utility function to get category image for Kalshi markets
const getKalshiCategoryImage = (category: string): string => {
  const categoryLower = category.toLowerCase();
  if (categoryLower.includes('sport') || categoryLower.includes('football') || categoryLower.includes('basketball') || categoryLower.includes('baseball')) {
    return kalshiSportsImg;
  } else if (categoryLower.includes('polit') || categoryLower.includes('election') || categoryLower.includes('government')) {
    return kalshiPoliticsImg;
  } else if (categoryLower.includes('econom') || categoryLower.includes('market') || categoryLower.includes('stock') || categoryLower.includes('financ')) {
    return kalshiEconomicsImg;
  } else if (categoryLower.includes('weather') || categoryLower.includes('climate') || categoryLower.includes('temperature')) {
    return kalshiWeatherImg;
  }
  return kalshiGeneralImg;
};

const Markets = () => {
  const { isKalshiConnected, kalshiCredentials, user, activeProvider } = useTrading();
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  const [platform, setPlatform] = useState<'kalshi' | 'polymarket'>("polymarket");
  const [sortBy, setSortBy] = useState("trending");
  const [timeFilter, setTimeFilter] = useState("all-time");
  const [showFilters, setShowFilters] = useState(false);
  
  // Advanced filter states
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [minVolume, setMinVolume] = useState<number>(0);
  const [maxVolume, setMaxVolume] = useState<number>(10000000);
  const [minLiquidity, setMinLiquidity] = useState<number>(0);
  const [maxLiquidity, setMaxLiquidity] = useState<number>(1000000);
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(100);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Cache for market data
  const marketCacheRef = useRef<Map<string, { data: any[], timestamp: number }>>(new Map());
  const CACHE_DURATION = 30000; // 30 seconds
  
  // Debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  const fetchMarkets = useCallback(async (searchTerm?: string | null, provider: 'kalshi' | 'polymarket' = 'polymarket', loadOffset: number = 0, append: boolean = false) => {
    // Generate cache key
    const cacheKey = `${provider}-${searchTerm || 'all'}-${loadOffset}`;
    
    // Check cache first
    const cached = marketCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      if (append) {
        setMarkets(prev => [...prev, ...cached.data]);
      } else {
        setMarkets(cached.data);
      }
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    
    try {
      let result;
      
      if (provider === 'kalshi') {
        // Kalshi public market data - no authentication required
        result = await supabase.functions.invoke('kalshi-markets', {
          body: {}
        });
      } else {
        result = await supabase.functions.invoke('polymarket-markets', {
          body: { searchTerm, offset: loadOffset }
        });
      }

      const { data, error } = result;
      
      if (!error && data?.markets) {
        let filteredMarkets = data.markets;
        
        if (provider === 'kalshi' && searchTerm) {
          filteredMarkets = filteredMarkets.filter((market: any) =>
            market.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            market.ticker?.toLowerCase().includes(searchTerm.toLowerCase())
          );
        }
        
        // Update cache
        marketCacheRef.current.set(cacheKey, {
          data: filteredMarkets,
          timestamp: Date.now()
        });
        
        if (append) {
          setMarkets(prev => [...prev, ...filteredMarkets]);
        } else {
          setMarkets(filteredMarkets);
        }
      } else {
        if (!append) {
          toast({
            title: "Error",
            description: error?.message || data?.error || "Failed to fetch markets",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      if (!append) {
        toast({
          title: "Error",
          description: "Failed to fetch markets",
          variant: "destructive",
        });
      }
    } finally {
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, [kalshiCredentials, toast]);

  useEffect(() => {
    // Debounce search changes
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setOffset(0);
      const searchTerm = searchParams.get("search");
      
      // Only fetch if the necessary credentials are available
      if (platform === 'kalshi') {
        if (isKalshiConnected && kalshiCredentials) {
          fetchMarkets(searchTerm, 'kalshi', 0, false);
        }
      } else {
        fetchMarkets(searchTerm, 'polymarket', 0, false);
      }
    }, 300); // 300ms debounce

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [platform, isKalshiConnected, kalshiCredentials, searchParams, fetchMarkets]);
  
  const loadMoreMarkets = () => {
    const searchTerm = searchParams.get("search");
    const newOffset = offset + 100;
    setOffset(newOffset);
    fetchMarkets(searchTerm, platform as 'kalshi' | 'polymarket', newOffset, true);
  };

  // Apply all filters and sorting
  const filteredAndSortedMarkets = React.useMemo(() => {
    let result = [...markets];
    
    // Time filter - filter by when markets will end
    if (timeFilter !== 'all-time') {
      const now = new Date();
      let maxEndDate = new Date();
      
      if (timeFilter === 'today') {
        maxEndDate.setHours(23, 59, 59, 999);
      } else if (timeFilter === 'this-week') {
        maxEndDate.setDate(now.getDate() + 7);
      } else if (timeFilter === 'this-month') {
        maxEndDate.setDate(now.getDate() + 30);
      }
      
      result = result.filter((market: any) => {
        if (!market.endDate || market.endDate === 'TBD') return true;
        const endDate = new Date(market.endDate);
        return endDate >= now && endDate <= maxEndDate;
      });
    }
    
    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter((market: any) => 
        market.category?.toLowerCase() === categoryFilter.toLowerCase()
      );
    }
    
    // Volume filter
    result = result.filter((market: any) => {
      const vol = market.volumeRaw || 0;
      return vol >= minVolume && vol <= maxVolume;
    });
    
    // Liquidity filter
    result = result.filter((market: any) => {
      const liq = market.liquidityRaw || 0;
      return liq >= minLiquidity && liq <= maxLiquidity;
    });
    
    // Price filter
    result = result.filter((market: any) => {
      const price = market.yesPrice || 50;
      return price >= minPrice && price <= maxPrice;
    });
    
    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((market: any) => 
        market.status?.toLowerCase() === statusFilter.toLowerCase()
      );
    }
    
    // Apply sorting
    if (sortBy === 'trending') {
      // Trending: sort by 24hr volume (recent activity)
      result.sort((a: any, b: any) => (b.volumeRaw || 0) - (a.volumeRaw || 0));
    } else if (sortBy === 'top') {
      // Top: sort by liquidity (market depth/total size)
      result.sort((a: any, b: any) => (b.liquidityRaw || 0) - (a.liquidityRaw || 0));
    } else if (sortBy === 'new') {
      result.reverse();
    }
    
    return result;
  }, [markets, timeFilter, categoryFilter, minVolume, maxVolume, minLiquidity, maxLiquidity, minPrice, maxPrice, statusFilter, sortBy]);
  
  const groupedMarkets = React.useMemo(() => {
    // For Kalshi, the backend response is already event-grouped. Avoid re-grouping here.
    if (platform === 'kalshi' || filteredAndSortedMarkets.some((m: any) => Array.isArray(m?.subMarkets) && m.subMarkets.length > 0)) {
      return filteredAndSortedMarkets;
    }

    const groups = new Map<string, any[]>();

    const extractTopic = (title: string): string | null => {
      if (!title) return null;
      // Common pattern: "Will <entity> win <Topic>?"
      const m = title.match(/win\s+(?:the\s+)?(.+?)\?/i);
      if (m) return m[1].trim();
      // Fallbacks for popular events
      const sb = title.match(/(Super\s+Bowl\s+\d{4})/i);
      if (sb) return sb[1].trim();
      const ws = title.match(/(World\s+Series\s+\d{4})/i);
      if (ws) return ws[1].trim();
      return null;
    };

    for (const mkt of filteredAndSortedMarkets) {
      const topic = extractTopic(mkt.title || '') || mkt.category || 'Other';
      const key = topic.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(mkt);
    }

    const result: any[] = [];
    for (const [, mkts] of groups) {
      if (mkts.length <= 1) {
        result.push(mkts[0]);
      } else {
        const main = mkts.reduce((a: any, b: any) => ((b.volumeRaw || 0) > (a.volumeRaw || 0) ? b : a), mkts[0]);
        const sub = mkts.filter((m: any) => m !== main);
        result.push({ ...main, isMultiOutcome: true, subMarkets: sub });
      }
    }

    // Preserve overall sorting (already volume-sorted in filteredAndSortedMarkets)
    return result;
  }, [filteredAndSortedMarkets, platform]);
  
  // Get unique categories from markets
  const categories = React.useMemo(() => {
    const cats = new Set(markets.map((m: any) => m.category).filter(Boolean));
    return ['all', ...Array.from(cats)];
  }, [markets]);

  const getOutcomeBadge = (yesPrice: number) => {
    if (yesPrice >= 75) return { label: "Yes", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
    if (yesPrice >= 60) return { label: "Likely", color: "bg-lime-500/20 text-lime-400 border-lime-500/30" };
    if (yesPrice >= 40) return { label: "Even", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
    if (yesPrice >= 25) return { label: "Unlikely", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
    return { label: "No", color: "bg-red-500/20 text-red-400 border-red-500/30" };
  };
  
  const resetFilters = () => {
    setCategoryFilter('all');
    setMinVolume(0);
    setMaxVolume(10000000);
    setMinLiquidity(0);
    setMaxLiquidity(1000000);
    setMinPrice(0);
    setMaxPrice(100);
    setStatusFilter('all');
  };

  const toggleMarket = (marketId: string) => {
    setExpandedMarkets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(marketId)) {
        newSet.delete(marketId);
      } else {
        newSet.add(marketId);
      }
      return newSet;
    });
  };

  const renderMarketRow = (market: any, index: number, isSubMarket: boolean = false) => {
    let y = typeof market.yesPrice === 'number' ? market.yesPrice : (typeof market.noPrice === 'number' ? 100 - market.noPrice : undefined);
    let n = typeof market.noPrice === 'number' ? market.noPrice : (typeof y === 'number' ? 100 - y : undefined);
    if (typeof y === 'number' && typeof n === 'number') {
      if (Math.abs((y + n) - 100) > 1) n = 100 - y;
    } else if (typeof y === 'number') {
      n = 100 - y;
    } else if (typeof n === 'number') {
      y = 100 - n;
    }
    const outcome = getOutcomeBadge(typeof y === 'number' ? y : 50);
    // Treat 0 as missing data (demo accounts often have no pricing)
    const yesLabel = (typeof y === 'number' && y > 0) ? `${y}¢` : '—';
    const noLabel = (typeof n === 'number' && n > 0 && n < 100) ? `${n}¢` : '—';
    
    // Platform-specific styling
    const isKalshi = (market.provider || platform) === 'kalshi';
    const platformBadgeClass = isKalshi 
      ? "bg-kalshi-teal/20 text-kalshi-teal border-kalshi-teal/30" 
      : "bg-polymarket-purple/20 text-polymarket-purple border-polymarket-purple/30";
    const platformName = isKalshi ? "Kalshi" : "Polymarket";
    
    return (
      <>
        {/* Desktop Table Row */}
        <div
          className={`hidden lg:grid grid-cols-[50px,1fr,220px,140px,140px,140px,120px] gap-4 px-6 py-4 border-b border-border hover:bg-card/50 transition-colors cursor-pointer group ${isSubMarket ? 'bg-card/20 pl-16' : ''}`}
          onClick={() => {
            const marketToNavigate = {
              ...market,
              image: market.image || (isKalshi ? getKalshiCategoryImage(market.category || 'General') : undefined),
              yesPrice: y,
              noPrice: n,
              volumeRaw: market.volumeRaw || 0,
              liquidityRaw: market.liquidityRaw || 0,
              category: market.category || 'Other',
              status: market.status || 'Active',
              clobTokenId: market.clobTokenId || market.id,
              endDate: market.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            };
            navigate(`/market/${market.id}`, { state: { market: marketToNavigate }});
          }}
        >
          {/* Icon/Image */}
          <div className="flex items-start pt-1">
            {(market.image || (isKalshi && market.category)) ? (
              <img 
                src={market.image || (isKalshi ? getKalshiCategoryImage(market.category || 'General') : '')} 
                alt={market.title}
                className="w-10 h-10 rounded-full object-cover bg-card"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm ${(market.image || (isKalshi && market.category)) ? 'hidden' : ''}`}>
              {(market.title || market.ticker || '?')[0].toUpperCase()}
            </div>
          </div>

          {/* Market Info */}
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-start gap-2">
              <h3 className="text-sm font-normal text-foreground line-clamp-1 flex-1">
                {market.title || market.ticker}
              </h3>
              <Badge variant="outline" className={`text-xs px-2 py-0.5 ${platformBadgeClass}`}>
                {platformName}
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!user) {
                    toast({
                      title: "Account Required",
                      description: "Please sign in to add markets to your watchlist",
                      action: <a href="/auth" className="text-primary hover:underline">Sign in</a>,
                    });
                  } else {
                    try {
                      const { error } = await supabase
                        .from('watchlist')
                        .insert([{
                          user_id: user.id,
                          market_id: market.id,
                          market_ticker: market.id,
                          market_title: market.title,
                          market_data: {
                            title: market.title,
                            yesPrice: market.yesPrice,
                            noPrice: market.noPrice,
                            volume: market.volume,
                            liquidity: market.liquidity,
                            endDate: market.endDate,
                            category: market.category,
                            provider: market.provider,
                            image: market.image,
                            description: market.description,
                            volumeRaw: market.volumeRaw,
                            liquidityRaw: market.liquidityRaw,
                            trend: market.yesPrice >= 50 ? 'up' : 'down',
                            change: Math.random() * 20 - 5
                          }
                        }]);

                      if (error) {
                        if (error.code === '23505') {
                          toast({
                            title: "Already in Watchlist",
                            description: `${market.title} is already in your watchlist`,
                          });
                        } else {
                          throw error;
                        }
                      } else {
                        toast({
                          title: "Added to Watchlist",
                          description: `${market.title} has been added to your watchlist`,
                        });
                      }
                    } catch (error) {
                      console.error('Error adding to watchlist:', error);
                      toast({
                        title: "Error",
                        description: "Failed to add to watchlist",
                        variant: "destructive",
                      });
                    }
                  }
                }}
              >
                <Star className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {market.description}
            </p>
          </div>

          {/* Prices with Bar */}
          <div className="flex flex-col gap-2">
            {market.isMultiOutcome ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground/50 text-xs">Multiple outcomes</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-emerald-400 font-medium">{yesLabel}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-red-400 font-medium">{noLabel}</span>
                </div>
                <div className="h-1.5 bg-card rounded-full overflow-hidden flex">
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-emerald-400"
                    style={{ width: `${typeof y === 'number' ? y : 0}%` }}
                  />
                  <div 
                    className="bg-gradient-to-r from-red-400 to-red-500"
                    style={{ width: `${typeof n === 'number' ? n : (typeof y === 'number' ? 100 - y : 0)}%` }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Outcome Badge */}
          <div className="flex items-center">
            {market.isMultiOutcome ? (
              <Badge 
                variant="outline" 
                className="bg-muted/20 text-muted-foreground border-muted/30 text-xs px-3 py-1"
              >
                {market.subMarkets?.length || 0} outcomes
              </Badge>
            ) : (
              <Badge 
                variant="outline" 
                className={`${outcome.color} border text-xs px-3 py-1`}
              >
                {outcome.label}
              </Badge>
            )}
          </div>

          {/* Volume */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">{market.volume}</span>
            <div className="flex items-center gap-1 text-xs text-emerald-400">
              <TrendingUp className="h-3 w-3" />
              <span>{Math.floor(Math.random() * 30 + 10)}%</span>
            </div>
          </div>

          {/* Liquidity */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">{market.liquidity}</span>
            <span className="text-xs text-muted-foreground">Available</span>
          </div>

          {/* End Date */}
          <div className="flex items-center">
            <span className="text-sm text-muted-foreground">{market.endDate}</span>
          </div>
        </div>

        {/* Mobile Card */}
        <div
          className={`lg:hidden p-4 border-b border-border hover:bg-card/50 transition-colors cursor-pointer ${isSubMarket ? 'bg-card/20 ml-4' : ''}`}
          onClick={() => {
            const marketToNavigate = {
              ...market,
              image: market.image || (isKalshi ? getKalshiCategoryImage(market.category || 'General') : undefined),
              yesPrice: y,
              noPrice: n,
              volumeRaw: market.volumeRaw || 0,
              liquidityRaw: market.liquidityRaw || 0,
              category: market.category || 'Other',
              status: market.status || 'Active',
              clobTokenId: market.clobTokenId || market.id,
              endDate: market.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            };
            navigate(`/market/${market.id}`, { state: { market: marketToNavigate }});
          }}
        >
          <div className="flex gap-3">
            {/* Icon/Image */}
            <div className="flex-shrink-0">
              {(market.image || (isKalshi && market.category)) ? (
                <img 
                  src={market.image || (isKalshi ? getKalshiCategoryImage(market.category || 'General') : '')} 
                  alt={market.title}
                  className="w-12 h-12 rounded-full object-cover bg-card"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={`w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold ${(market.image || (isKalshi && market.category)) ? 'hidden' : ''}`}>
                {(market.title || market.ticker || '?')[0].toUpperCase()}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-foreground line-clamp-2 flex-1">
                  {market.title || market.ticker}
                </h3>
                <Badge variant="outline" className={`text-xs px-2 py-0.5 flex-shrink-0 ${platformBadgeClass}`}>
                  {platformName}
                </Badge>
              </div>
              
              {!market.isMultiOutcome && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-medium text-sm">{yesLabel}</span>
                    <span className="text-muted-foreground text-xs">/</span>
                    <span className="text-red-400 font-medium text-sm">{noLabel}</span>
                    <Badge 
                      variant="outline" 
                      className={`${outcome.color} border text-xs ml-auto`}
                    >
                      {outcome.label}
                    </Badge>
                  </div>
                  <div className="h-1.5 bg-card rounded-full overflow-hidden flex">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 to-emerald-400"
                      style={{ width: `${typeof y === 'number' ? y : 0}%` }}
                    />
                    <div 
                      className="bg-gradient-to-r from-red-400 to-red-500"
                      style={{ width: `${typeof n === 'number' ? n : (typeof y === 'number' ? 100 - y : 0)}%` }}
                    />
                  </div>
                </>
              )}
              
              {market.isMultiOutcome && (
                <Badge 
                  variant="outline" 
                  className="bg-muted/20 text-muted-foreground border-muted/30 text-xs"
                >
                  {market.subMarkets?.length || 0} outcomes
                </Badge>
              )}
              
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  <span>{market.volume}</span>
                </div>
                <span>·</span>
                <span>{market.endDate}</span>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      <main className="flex-1 pt-10 pb-24">
        <div className="container mx-auto px-4 max-w-[1600px]">
          {/* Platform Selector - Prominent */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-4">Prediction Markets</h1>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex gap-2 p-1 bg-card rounded-lg border border-border">
                <Button
                  variant={platform === 'polymarket' ? 'default' : 'ghost'}
                  size="lg"
                  className={platform === 'polymarket' 
                    ? 'bg-polymarket-purple hover:bg-polymarket-purple-dark text-white' 
                    : 'text-muted-foreground hover:text-foreground'}
                  onClick={() => { 
                    setPlatform('polymarket'); 
                    setMarkets([]); // Clear markets to force refresh
                  }}
                >
                  <img 
                    src={polymarketLogo} 
                    alt="Polymarket" 
                    className="w-5 h-5 mr-2"
                  />
                  Polymarket
                </Button>
                <Button
                  variant={platform === 'kalshi' ? 'default' : 'ghost'}
                  size="lg"
                  className={platform === 'kalshi' 
                    ? 'bg-kalshi-teal hover:bg-kalshi-teal-dark text-white' 
                    : 'text-muted-foreground hover:text-foreground'}
                  onClick={() => {
                    setPlatform('kalshi');
                    setMarkets([]); // Clear markets to force refresh
                  }}
                >
                  <img 
                    src={kalshiLogo} 
                    alt="Kalshi" 
                    className="w-5 h-5 mr-2"
                  />
                  Kalshi
                </Button>
              </div>
              
              <div className="text-sm text-muted-foreground">
                {platform === 'kalshi' ? (
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-kalshi-teal animate-pulse" />
                    Showing Kalshi markets (public data)
                    {!isKalshiConnected && (
                      <span className="text-yellow-500 ml-2">• Connect account to trade</span>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-polymarket-purple animate-pulse" />
                    Showing Polymarket markets
                  </span>
                )}
              </div>
            </div>
          </div>


          {/* Filter Bar */}
          <div className="flex items-center gap-3 mb-6">

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[140px] bg-card/50 border-border">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trending">Trending</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="top">Top</SelectItem>
              </SelectContent>
            </Select>

            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger className="w-[140px] bg-card/50 border-border">
                <SelectValue placeholder="Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-time">All Time</SelectItem>
                <SelectItem value="this-month">This Month</SelectItem>
                <SelectItem value="this-week">This Week</SelectItem>
                <SelectItem value="today">Today</SelectItem>
              </SelectContent>
            </Select>

            <Button 
              variant="outline" 
              onClick={() => setShowFilters(!showFilters)}
              className="ml-auto bg-card/50 border-border"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>

          {/* Markets Table */}
          <div className="bg-card/30 border border-border rounded-lg overflow-hidden">
            {/* Advanced Filters Panel */}
            {showFilters && (
              <div className="p-6 bg-card/50 border-b border-border">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Category Filter */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-medium">Category</label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat === 'all' ? 'All Categories' : cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Status Filter */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-medium">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Price Range */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-medium">
                      Yes Price: {minPrice}¢ - {maxPrice}¢
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={minPrice}
                        onChange={(e) => setMinPrice(Number(e.target.value))}
                        className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
                        min={0}
                        max={100}
                      />
                      <input
                        type="number"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(Number(e.target.value))}
                        className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
                        min={0}
                        max={100}
                      />
                    </div>
                  </div>
                  
                  {/* Volume Range */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-medium">
                      Min Volume: ${(minVolume / 1000).toFixed(0)}K
                    </label>
                    <input
                      type="range"
                      value={minVolume}
                      onChange={(e) => setMinVolume(Number(e.target.value))}
                      className="w-full"
                      min={0}
                      max={1000000}
                      step={10000}
                    />
                  </div>
                </div>
                
                <div className="mt-4 flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={resetFilters}
                  >
                    Reset Filters
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowFilters(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          
            {/* Table Header - Hidden on Mobile */}
            <div className="hidden lg:grid grid-cols-[50px,1fr,220px,140px,140px,140px,120px] gap-4 px-6 py-3 bg-card/50 border-b border-border text-sm text-muted-foreground font-medium">
              <div></div>
              <div>MARKET ({filteredAndSortedMarkets.length})</div>
              <div>PRICES</div>
              <div>OUTCOME</div>
              <div>VOLUME</div>
              <div>LIQUIDITY</div>
              <div>END DATE</div>
            </div>

            {/* Mobile Header */}
            <div className="lg:hidden px-4 py-3 bg-card/50 border-b border-border">
              <div className="text-sm text-muted-foreground font-medium">
                MARKETS ({filteredAndSortedMarkets.length})
              </div>
            </div>

            {/* Table Body */}
            {loading ? (
              <div className="p-12 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-muted-foreground">Loading {platform === 'kalshi' ? 'Kalshi' : 'Polymarket'} markets...</p>
                </div>
              </div>
            ) : platform === 'kalshi' && !isKalshiConnected ? (
              <div className="p-12">
                <div className="max-w-md mx-auto text-center">
                  <div className="w-16 h-16 rounded-full bg-kalshi-teal/10 flex items-center justify-center mx-auto mb-4">
                    <Badge className="bg-kalshi-teal/20 text-kalshi-teal border-kalshi-teal/30 text-2xl">
                      K
                    </Badge>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Connect to Kalshi</h3>
                  <p className="text-muted-foreground mb-6">
                    {!user ? (
                      <>
                        <a href="/auth" className="text-kalshi-teal font-semibold hover:underline">Sign in</a> and connect your Kalshi account to view and trade on Kalshi markets
                      </>
                    ) : (
                      <>Connect your Kalshi API credentials to view and trade on Kalshi markets</>
                    )}
                  </p>
                  {user && (
                    <Button 
                      className="bg-kalshi-teal hover:bg-kalshi-teal-dark text-white"
                      onClick={() => navigate('/portfolio')}
                    >
                      Connect Kalshi
                    </Button>
                  )}
                </div>
              </div>
            ) : filteredAndSortedMarkets.length === 0 ? (
              <div className="p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className={`w-16 h-16 rounded-full ${platform === 'kalshi' ? 'bg-kalshi-teal/10' : 'bg-polymarket-purple/10'} flex items-center justify-center mx-auto mb-4`}>
                    <Filter className={`h-8 w-8 ${platform === 'kalshi' ? 'text-kalshi-teal' : 'text-polymarket-purple'}`} />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No markets found</h3>
                  <p className="text-muted-foreground mb-6">
                    No {platform === 'kalshi' ? 'Kalshi' : 'Polymarket'} markets match your current filters. Try adjusting your search criteria.
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={resetFilters}
                  >
                    Reset All Filters
                  </Button>
                </div>
              </div>
            ) : (
              filteredAndSortedMarkets.map((market, index) => {
                const isExpanded = expandedMarkets.has(market.id);
                const hasSubMarkets = market.isMultiOutcome && market.subMarkets && market.subMarkets.length > 1;
                
                return (
                  <Collapsible
                    key={market.id || index}
                    open={isExpanded}
                    onOpenChange={() => hasSubMarkets && toggleMarket(market.id)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="relative">
                        {hasSubMarkets && (
                          <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        )}
                        {renderMarketRow(market, index, false)}
                      </div>
                    </CollapsibleTrigger>
                    
                    {hasSubMarkets && (
                      <CollapsibleContent>
                        {market.subMarkets.map((subMarket: any, subIndex: number) => (
                          <div key={`${market.id}-sub-${subIndex}`}>
                            {renderMarketRow(subMarket, subIndex, true)}
                          </div>
                        ))}
                      </CollapsibleContent>
                    )}
                  </Collapsible>
                );
              })
            )}
            
            {/* Load More Button */}
            {!loading && filteredAndSortedMarkets.length > 0 && platform === 'polymarket' && (
              <div className="p-6 text-center border-t border-border">
                <Button
                  onClick={loadMoreMarkets}
                  disabled={loadingMore}
                  variant="outline"
                  className="min-w-[200px]"
                >
                  {loadingMore ? "Loading..." : "Load More Markets"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Markets;
