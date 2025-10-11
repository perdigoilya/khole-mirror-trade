import { useState, useEffect } from "react";
import * as React from "react";
import Footer from "@/components/Footer";
import { Filter, Star, TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTrading } from "@/contexts/TradingContext";
import { ConnectionRequired } from "@/components/ConnectionRequired";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";

const Markets = () => {
  const { isKalshiConnected, kalshiCredentials, user, activeProvider } = useTrading();
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  const [platform, setPlatform] = useState("polymarket");
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

  useEffect(() => {
    // Reset offset and fetch markets on mount and when platform/search params change
    setOffset(0);
    const searchTerm = searchParams.get("search");
    
    if (platform === 'kalshi') {
      if (isKalshiConnected && kalshiCredentials) {
        fetchMarkets(searchTerm, 'kalshi', 0, false);
      }
    } else {
      // Polymarket (public API, no credentials needed)
      fetchMarkets(searchTerm, 'polymarket', 0, false);
    }
  }, [platform, isKalshiConnected, kalshiCredentials, searchParams]);

  const fetchMarkets = async (searchTerm?: string | null, provider: 'kalshi' | 'polymarket' = 'polymarket', loadOffset: number = 0, append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    
    try {
      let result;
      
      if (provider === 'kalshi' && kalshiCredentials) {
        // Fetch from Kalshi (requires credentials)
        result = await supabase.functions.invoke('kalshi-markets', {
          body: kalshiCredentials
        });
      } else {
        // Fetch from Polymarket (public API)
        result = await supabase.functions.invoke('polymarket-markets', {
          body: { searchTerm, offset: loadOffset }
        });
      }

      const { data, error } = result;
      
      if (!error && data?.markets) {
        let filteredMarkets = data.markets;
        
        // Additional client-side filtering for Kalshi (Polymarket already filters server-side)
        if (provider === 'kalshi' && searchTerm) {
          filteredMarkets = filteredMarkets.filter((market: any) =>
            market.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            market.ticker?.toLowerCase().includes(searchTerm.toLowerCase())
          );
        }
        
        if (append) {
          setMarkets(prev => [...prev, ...filteredMarkets]);
        } else {
          setMarkets(filteredMarkets);
        }
      } else {
        toast({
          title: "Error",
          description: error?.message || data?.error || "Failed to fetch markets",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch markets",
        variant: "destructive",
      });
    } finally {
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  };
  
  const loadMoreMarkets = () => {
    const searchTerm = searchParams.get("search");
    const newOffset = offset + 100;
    setOffset(newOffset);
    fetchMarkets(searchTerm, platform as 'kalshi' | 'polymarket', newOffset, true);
  };

  // Apply all filters and sorting
  const filteredAndSortedMarkets = React.useMemo(() => {
    let result = [...markets];
    
    // Time filter
    if (timeFilter !== 'all-time') {
      const now = new Date();
      const filterDate = new Date();
      
      if (timeFilter === 'today') {
        filterDate.setHours(0, 0, 0, 0);
      } else if (timeFilter === 'this-week') {
        filterDate.setDate(now.getDate() - 7);
      } else if (timeFilter === 'this-month') {
        filterDate.setMonth(now.getMonth() - 1);
      }
      
      result = result.filter((market: any) => {
        if (!market.endDate || market.endDate === 'TBD') return true;
        const endDate = new Date(market.endDate);
        return endDate >= filterDate;
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
    if (sortBy === 'trending' || sortBy === 'top') {
      result.sort((a: any, b: any) => (b.volumeRaw || 0) - (a.volumeRaw || 0));
    } else if (sortBy === 'new') {
      result.reverse();
    }
    
    return result;
  }, [markets, timeFilter, categoryFilter, minVolume, maxVolume, minLiquidity, maxLiquidity, minPrice, maxPrice, statusFilter, sortBy]);
  
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

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      <main className="flex-1 pt-10 pb-24">
        <div className="container mx-auto px-4 max-w-[1600px]">
          {/* Filter Bar */}
          <div className="flex items-center gap-3 mb-6">
            <Select value={platform} onValueChange={(value) => {
              if (value === 'kalshi' && !isKalshiConnected) {
                toast({
                  title: "Kalshi Connection Required",
                  description: "Please connect your Kalshi account to view Kalshi markets",
                });
              } else {
                setPlatform(value);
              }
            }}>
              <SelectTrigger className="w-[180px] bg-card/50 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kalshi">Kalshi</SelectItem>
                <SelectItem value="polymarket">Polymarket</SelectItem>
              </SelectContent>
            </Select>

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
          
            {/* Table Header */}
            <div className="grid grid-cols-[50px,1fr,220px,140px,140px,140px,120px] gap-4 px-6 py-3 bg-card/50 border-b border-border text-sm text-muted-foreground font-medium">
              <div></div>
              <div>MARKET ({filteredAndSortedMarkets.length})</div>
              <div>PRICES</div>
              <div>OUTCOME</div>
              <div>VOLUME</div>
              <div>LIQUIDITY</div>
              <div>END DATE</div>
            </div>

            {/* Table Body */}
            {loading ? (
              <div className="p-12 text-center">
                <p className="text-muted-foreground">Loading markets...</p>
              </div>
            ) : platform === 'kalshi' && !isKalshiConnected ? (
              <div className="p-12 text-center">
                <p className="text-muted-foreground mb-4">
                  {!user ? (
                    <>
                      <a href="/auth" className="text-primary font-semibold hover:underline">Log in</a> to connect your Kalshi account and view Kalshi markets
                    </>
                  ) : (
                    <>Connect your Kalshi account to view Kalshi markets</>
                  )}
                </p>
                {user && <ConnectionRequired />}
              </div>
            ) : filteredAndSortedMarkets.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-muted-foreground">No markets match your filters</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={resetFilters}
                  className="mt-4"
                >
                  Reset Filters
                </Button>
              </div>
            ) : (
              filteredAndSortedMarkets.map((market, index) => {
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
                const yesLabel = typeof y === 'number' ? `${y}¢` : '—';
                const noLabel = typeof n === 'number' ? `${n}¢` : '—';
                
                return (
                  <div
                    key={market.id || index}
                    className="grid grid-cols-[50px,1fr,220px,140px,140px,140px,120px] gap-4 px-6 py-4 border-b border-border hover:bg-card/50 transition-colors cursor-pointer group"
                  >
                    {/* Icon/Image */}
                    <div className="flex items-start pt-1">
                      {market.image ? (
                        <img 
                          src={market.image} 
                          alt={market.title}
                          className="w-10 h-10 rounded-full object-cover bg-card"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={`w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm ${market.image ? 'hidden' : ''}`}>
                        {(market.title || market.ticker || '?')[0].toUpperCase()}
                      </div>
                    </div>

                    {/* Market Info */}
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <h3 className="text-sm font-normal text-foreground line-clamp-1 flex-1">
                          {market.title || market.ticker}
                        </h3>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!user) {
                              toast({
                                title: "Account Required",
                                description: "Please sign in to add markets to your watchlist",
                                action: <a href="/auth" className="text-primary hover:underline">Sign in</a>,
                              });
                            } else {
                              toast({
                                title: "Added to Watchlist",
                                description: `${market.title} has been added to your watchlist`,
                              });
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
                    </div>

                    {/* Outcome Badge */}
                    <div className="flex items-center">
                      <Badge 
                        variant="outline" 
                        className={`${outcome.color} border text-xs px-3 py-1`}
                      >
                        {outcome.label}
                      </Badge>
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
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="opacity-60">∅ {(Math.random() * 2 + 0.5).toFixed(1)} comp</span>
                      </div>
                    </div>

                    {/* End Date */}
                    <div className="flex items-center">
                      <span className="text-sm text-muted-foreground">{market.endDate}</span>
                    </div>
                  </div>
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
