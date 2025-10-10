import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useKalshi } from "@/contexts/KalshiContext";
import { ConnectionRequired } from "@/components/ConnectionRequired";
import { useToast } from "@/hooks/use-toast";

const Markets = () => {
  const { isConnected, credentials } = useKalshi();
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isConnected && credentials) {
      fetchMarkets();
    }
  }, [isConnected, credentials]);

  const fetchMarkets = async () => {
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
        setMarkets(data.markets.slice(0, 10));
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
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      
      <main className="flex-1 pt-24 pb-20">
        {!isConnected ? (
          <ConnectionRequired />
        ) : (
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <div className="mb-8">
                <h1 className="text-4xl font-bold mb-2">Markets</h1>
                <p className="text-muted-foreground">
                  Real-time prediction markets. Lightning-fast execution.
                </p>
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
