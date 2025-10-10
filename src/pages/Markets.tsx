import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import { Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useKalshi } from "@/contexts/KalshiContext";
import { ConnectionRequired } from "@/components/ConnectionRequired";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";

const Markets = () => {
  const { isConnected, credentials, user } = useKalshi();
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  const [platform, setPlatform] = useState("kalshi");
  const [sortBy, setSortBy] = useState("trending");
  const [timeFilter, setTimeFilter] = useState("all-time");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (isConnected && credentials) {
      const searchTerm = searchParams.get("search");
      fetchMarkets(searchTerm);
    }
  }, [isConnected, credentials, searchParams]);

  const fetchMarkets = async (searchTerm?: string | null) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kalshi-markets`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(credentials),
        }
      );

      const data = await response.json();
      
      if (response.ok && data.markets) {
        let filteredMarkets = data.markets;
        
        // Filter by search term if provided
        if (searchTerm) {
          filteredMarkets = filteredMarkets.filter((market: any) =>
            market.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            market.ticker?.toLowerCase().includes(searchTerm.toLowerCase())
          );
        }
        
        setMarkets(filteredMarkets.slice(0, 10));
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch markets",
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
        {!isConnected ? (
          <ConnectionRequired />
        ) : (
          <div className="container mx-auto px-4">
            <div className="max-w-7xl mx-auto">
              <div className="mb-6">
                <h1 className="text-4xl font-bold mb-2">Markets</h1>
                <p className="text-muted-foreground">
                  Real-time prediction markets. Lightning-fast execution.
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
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading markets...</p>
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
                                {market.yes_bid ? `$${(market.yes_bid / 100).toFixed(2)}` : 'N/A'}
                              </p>
                            </div>
                            
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">NO Price</p>
                              <p className="text-lg font-semibold text-destructive">
                                {market.no_bid ? `$${(market.no_bid / 100).toFixed(2)}` : 'N/A'}
                              </p>
                            </div>
                            
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Volume</p>
                              <p className="text-lg font-semibold text-foreground">
                                {market.volume ? `$${(market.volume / 100).toLocaleString()}` : 'N/A'}
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
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Markets;
