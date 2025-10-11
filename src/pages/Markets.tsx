import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import { Filter } from "lucide-react";
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
  
  const [platform, setPlatform] = useState("kalshi");
  const [sortBy, setSortBy] = useState("trending");
  const [timeFilter, setTimeFilter] = useState("all-time");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    // Fetch markets on mount and when search params change
    // Polymarket works without credentials (public API)
    // Kalshi requires connected credentials
    const searchTerm = searchParams.get("search");
    
    if (activeProvider === 'kalshi' && isKalshiConnected && kalshiCredentials) {
      fetchMarkets(searchTerm, 'kalshi');
    } else {
      // Default to Polymarket (public API, no credentials needed)
      fetchMarkets(searchTerm, 'polymarket');
    }
  }, [isKalshiConnected, kalshiCredentials, searchParams, activeProvider]);

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
        
        setMarkets(filteredMarkets.slice(0, 50));
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

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      
      <main className="flex-1 pt-10 pb-20">
        <div className="container mx-auto px-4">
            <div className="max-w-7xl mx-auto">
              <div className="mb-6">
                <h1 className="text-4xl font-bold mb-2">Markets</h1>
                <p className="text-muted-foreground">
                  Real-time prediction markets from {activeProvider === 'kalshi' ? 'Kalshi' : 'Polymarket'}
                  {activeProvider === 'polymarket' && ' • Public API - No login required'}
                </p>
              </div>

              {/* Filter Bar */}
              <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-card border border-border rounded-lg">
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kalshi">Kalshi</SelectItem>
                    <SelectItem value="polymarket">Polymarket</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trending">Trending</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="top">Top</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={timeFilter} onValueChange={setTimeFilter}>
                  <SelectTrigger className="w-[150px]">
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
                  className="ml-auto"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
              </div>

              <div className="space-y-4">
                {!user && activeProvider === 'kalshi' && (
                  <div className="p-4 mb-4 rounded-lg border border-primary/30 bg-primary/5">
                    <p className="text-sm text-muted-foreground text-center">
                      <a href="/auth" className="text-primary font-semibold hover:underline">Log in</a> to connect your Kalshi account and view Kalshi markets
                    </p>
                  </div>
                )}
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading markets...</p>
                ) : !isKalshiConnected && user && activeProvider === 'kalshi' ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">Connect your Kalshi account to view Kalshi markets</p>
                    <ConnectionRequired />
                  </div>
                ) : markets.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No markets available</p>
                ) : (
                  markets.map((market, index) => (
                    <div
                      key={market.ticker || index}
                      className="p-6 rounded-lg border border-border bg-card hover:border-primary/50 transition-all duration-300 cursor-pointer"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold mb-3 text-foreground">
                            {market.title || market.ticker}
                          </h3>
                          
                          <div className="flex items-center space-x-6">
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">YES Price</p>
                              <p className="text-2xl font-bold text-primary">
                                {typeof market.yesPrice === 'number'
                                  ? `$${(market.yesPrice / 100).toFixed(2)}`
                                  : (market.yes_bid ? `$${(market.yes_bid / 100).toFixed(2)}` : 'N/A')}
                              </p>
                            </div>
                            
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">NO Price</p>
                              <p className="text-lg font-semibold text-destructive">
                                {typeof market.noPrice === 'number'
                                  ? `$${(market.noPrice / 100).toFixed(2)}`
                                  : (market.no_bid ? `$${(market.no_bid / 100).toFixed(2)}` : 'N/A')}
                              </p>
                            </div>
                            
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Volume</p>
                              <p className="text-lg font-semibold text-foreground">
                                {typeof market.volume === 'string'
                                  ? market.volume
                                  : (market.volume ? `$${(market.volume / 100).toLocaleString()}` : 'N/A')}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        <Badge variant="outline" className="border-primary text-primary">
                          {market.status || 'Live'}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
      </main>

      <Footer />
    </div>
  );
};

export default Markets;
