import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useKalshi } from "@/contexts/KalshiContext";
import { ConnectionRequired } from "@/components/ConnectionRequired";
import { useToast } from "@/hooks/use-toast";

const Portfolio = () => {
  const { isConnected, credentials } = useKalshi();
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isConnected && credentials) {
      fetchPortfolio();
    }
  }, [isConnected, credentials]);

  const fetchPortfolio = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kalshi-portfolio`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(credentials),
        }
      );

      const data = await response.json();
      
      if (response.ok && data.positions) {
        setPositions(data.positions);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch portfolio",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch portfolio",
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
                <h1 className="text-4xl font-bold mb-2">Portfolio</h1>
                <p className="text-muted-foreground">
                  Track your positions and performance in real-time.
                </p>
              </div>

              {/* Portfolio Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="p-6 rounded-lg border border-border bg-card">
                  <p className="text-sm text-muted-foreground mb-2">Total Value</p>
                  <p className="text-3xl font-bold text-foreground">$5,247.32</p>
                </div>
                
                <div className="p-6 rounded-lg border border-border bg-card">
                  <p className="text-sm text-muted-foreground mb-2">Total P&L</p>
                  <div className="flex items-center space-x-2">
                    <p className="text-3xl font-bold text-primary">+$247.32</p>
                    <ArrowUpRight className="h-6 w-6 text-primary" />
                  </div>
                </div>
                
                <div className="p-6 rounded-lg border border-border bg-card">
                  <p className="text-sm text-muted-foreground mb-2">Active Positions</p>
                  <p className="text-3xl font-bold text-foreground">12</p>
                </div>
              </div>

              {/* Positions */}
              <div className="space-y-4">
                <h2 className="text-2xl font-bold mb-4">Active Positions</h2>
                
                {loading ? (
                  <p className="text-muted-foreground text-center py-8">Loading positions...</p>
                ) : positions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No active positions</p>
                ) : (
                  positions.map((position, index) => {
                    const pnl = position.total_traded || 0;
                    const isProfit = pnl >= 0;
                    
                    return (
                      <div
                        key={position.market_ticker || index}
                        className="p-6 rounded-lg border border-border bg-card hover:border-primary/50 transition-all duration-300"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-foreground">
                            {position.market_ticker}
                          </h3>
                          <span className={`px-3 py-1 rounded-md text-sm font-semibold ${
                            position.position === "yes" 
                              ? "bg-primary/10 text-primary" 
                              : "bg-destructive/10 text-destructive"
                          }`}>
                            {position.position?.toUpperCase() || 'N/A'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Position</p>
                            <p className="text-lg font-semibold text-foreground">
                              {position.position_count || 0}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Total Traded</p>
                            <p className="text-lg font-semibold text-foreground">
                              ${(Math.abs(position.total_traded || 0) / 100).toFixed(2)}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Resting Orders</p>
                            <p className="text-lg font-semibold text-foreground">
                              {position.resting_order_count || 0}
                            </p>
                          </div>
                          
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">P&L</p>
                            <div className="flex items-center space-x-1">
                              {isProfit ? (
                                <ArrowUpRight className="h-4 w-4 text-primary" />
                              ) : (
                                <ArrowDownRight className="h-4 w-4 text-destructive" />
                              )}
                              <p className={`text-lg font-semibold ${
                                isProfit ? "text-primary" : "text-destructive"
                              }`}>
                                ${(pnl / 100).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
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

export default Portfolio;
