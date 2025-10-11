import { useState, useEffect } from "react";
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
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  const [platform, setPlatform] = useState("polymarket");
  const [sortBy, setSortBy] = useState("trending");
  const [timeFilter, setTimeFilter] = useState("all-time");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    // Fetch markets on mount and when platform/search params change
    const searchTerm = searchParams.get("search");
    
    if (platform === 'kalshi') {
      if (isKalshiConnected && kalshiCredentials) {
        fetchMarkets(searchTerm, 'kalshi');
      }
    } else {
      // Polymarket (public API, no credentials needed)
      fetchMarkets(searchTerm, 'polymarket');
    }
  }, [platform, isKalshiConnected, kalshiCredentials, searchParams]);

  const fetchMarkets = async (searchTerm?: string | null, provider: 'kalshi' | 'polymarket' = 'polymarket') => {
    setLoading(true);
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
          body: { searchTerm }
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
        
        // Apply sorting
        if (sortBy === 'trending' || sortBy === 'top') {
          filteredMarkets = [...filteredMarkets].sort((a: any, b: any) => 
            (b.volumeRaw || 0) - (a.volumeRaw || 0)
          );
        } else if (sortBy === 'new') {
          filteredMarkets = [...filteredMarkets].reverse();
        }
        
        setMarkets(filteredMarkets);
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
      setLoading(false);
    }
  };

  const getOutcomeBadge = (yesPrice: number) => {
    if (yesPrice >= 75) return { label: "Yes", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" };
    if (yesPrice >= 60) return { label: "Likely", color: "bg-lime-500/20 text-lime-400 border-lime-500/30" };
    if (yesPrice >= 40) return { label: "Even", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
    if (yesPrice >= 25) return { label: "Unlikely", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" };
    return { label: "No", color: "bg-red-500/20 text-red-400 border-red-500/30" };
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
            {/* Table Header */}
            <div className="grid grid-cols-[50px,1fr,220px,140px,140px,140px,120px] gap-4 px-6 py-3 bg-card/50 border-b border-border text-sm text-muted-foreground font-medium">
              <div></div>
              <div>MARKET ({markets.length})</div>
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
            ) : markets.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-muted-foreground">No markets available</p>
              </div>
            ) : (
              markets.map((market, index) => {
                const yesPrice = typeof market.yesPrice === 'number' ? market.yesPrice : 50;
                const noPrice = typeof market.noPrice === 'number' ? market.noPrice : 50;
                const yesDecimal = (yesPrice / 100).toFixed(3);
                const noDecimal = (noPrice / 100).toFixed(3);
                const outcome = getOutcomeBadge(yesPrice);
                
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
                        <span className="text-emerald-400 font-medium">{yesDecimal}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-red-400 font-medium">{noDecimal}</span>
                      </div>
                      <div className="h-1.5 bg-card rounded-full overflow-hidden flex">
                        <div 
                          className="bg-gradient-to-r from-emerald-500 to-emerald-400"
                          style={{ width: `${yesPrice}%` }}
                        />
                        <div 
                          className="bg-gradient-to-r from-red-400 to-red-500"
                          style={{ width: `${noPrice}%` }}
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
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Markets;
