import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Star, TrendingUp } from "lucide-react";
import { useKalshi } from "@/contexts/KalshiContext";
import { ConnectionRequired } from "@/components/ConnectionRequired";

const Watchlist = () => {
  const { isConnected } = useKalshi();
  const watchedMarkets = [
    {
      id: 1,
      title: "Will S&P 500 reach 6000 by June 2025?",
      probability: 58,
      change: "+3.2%",
    },
    {
      id: 2,
      title: "Will inflation fall below 2% in 2025?",
      probability: 41,
      change: "-1.8%",
    },
    {
      id: 3,
      title: "Will Tesla stock hit $400 by Q2 2025?",
      probability: 34,
      change: "+12.4%",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="pt-24 pb-20">
        {!isConnected ? (
          <ConnectionRequired />
        ) : (
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <div className="mb-8">
                <h1 className="text-4xl font-bold mb-2">Watchlist</h1>
                <p className="text-muted-foreground">
                  Monitor your favorite markets and never miss an opportunity.
                </p>
              </div>

              {watchedMarkets.length > 0 ? (
                <div className="space-y-4">
                  {watchedMarkets.map((market) => (
                    <div
                      key={market.id}
                      className="p-6 rounded-lg border border-border bg-card hover:border-primary/50 transition-all duration-300 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
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
                              <p className="text-sm text-muted-foreground mb-1">24h Change</p>
                              <div className="flex items-center space-x-1">
                                <TrendingUp className="h-4 w-4 text-primary" />
                                <p className="text-lg font-semibold text-primary">{market.change}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <button className="p-2 hover:bg-muted rounded-md transition-colors">
                          <Star className="h-6 w-6 text-primary fill-primary" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <Star className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h2 className="text-2xl font-semibold mb-2 text-foreground">
                    No markets in watchlist
                  </h2>
                  <p className="text-muted-foreground">
                    Add markets to your watchlist to track them here.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Watchlist;
