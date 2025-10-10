import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useKalshi } from "@/contexts/KalshiContext";
import { ConnectionRequired } from "@/components/ConnectionRequired";

const Markets = () => {
  const { isConnected } = useKalshi();
  const mockMarkets = [
    {
      id: 1,
      title: "Will Bitcoin reach $100,000 by end of 2025?",
      probability: 67,
      volume: "$1.2M",
      trending: "up",
      change: "+5.2%",
    },
    {
      id: 2,
      title: "Will the Federal Reserve cut rates in Q1 2025?",
      probability: 45,
      volume: "$890K",
      trending: "down",
      change: "-2.1%",
    },
    {
      id: 3,
      title: "Will unemployment rate fall below 4% by March?",
      probability: 73,
      volume: "$654K",
      trending: "up",
      change: "+8.4%",
    },
  ];

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
                {mockMarkets.map((market) => (
                  <div
                    key={market.id}
                    className="p-6 rounded-lg border border-border bg-card hover:border-primary/50 transition-all duration-300 cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold mb-3 text-foreground">
                          {market.title}
                        </h3>
                        
                        <div className="flex items-center space-x-6">
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Probability</p>
                            <p className="text-2xl font-bold text-primary">{market.probability}%</p>
                          </div>
                          
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Volume</p>
                            <p className="text-lg font-semibold text-foreground">{market.volume}</p>
                          </div>
                          
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">24h Change</p>
                            <div className="flex items-center space-x-1">
                              {market.trending === "up" ? (
                                <TrendingUp className="h-4 w-4 text-primary" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-destructive" />
                              )}
                              <p className={`text-lg font-semibold ${
                                market.trending === "up" ? "text-primary" : "text-destructive"
                              }`}>
                                {market.change}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <Badge variant="outline" className="border-primary text-primary">
                        Live
                      </Badge>
                    </div>
                  </div>
                ))}
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
