import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useKalshi } from "@/contexts/KalshiContext";
import { ConnectionRequired } from "@/components/ConnectionRequired";

const Portfolio = () => {
  const { isConnected } = useKalshi();
  const positions = [
    {
      id: 1,
      market: "Bitcoin to $100K",
      position: "YES",
      shares: 150,
      avgPrice: 0.67,
      currentPrice: 0.72,
      pnl: "+$7.50",
      pnlPercent: "+7.5%",
      isProfit: true,
    },
    {
      id: 2,
      market: "Fed Rate Cut Q1",
      position: "NO",
      shares: 200,
      avgPrice: 0.55,
      currentPrice: 0.52,
      pnl: "+$6.00",
      pnlPercent: "+5.5%",
      isProfit: true,
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
                
                {positions.map((position) => (
                  <div
                    key={position.id}
                    className="p-6 rounded-lg border border-border bg-card hover:border-primary/50 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-foreground">
                        {position.market}
                      </h3>
                      <span className={`px-3 py-1 rounded-md text-sm font-semibold ${
                        position.position === "YES" 
                          ? "bg-primary/10 text-primary" 
                          : "bg-destructive/10 text-destructive"
                      }`}>
                        {position.position}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Shares</p>
                        <p className="text-lg font-semibold text-foreground">{position.shares}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Avg Price</p>
                        <p className="text-lg font-semibold text-foreground">${position.avgPrice}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Current Price</p>
                        <p className="text-lg font-semibold text-foreground">${position.currentPrice}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">P&L</p>
                        <p className={`text-lg font-semibold ${
                          position.isProfit ? "text-primary" : "text-destructive"
                        }`}>
                          {position.pnl}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">P&L %</p>
                        <div className="flex items-center space-x-1">
                          {position.isProfit ? (
                            <ArrowUpRight className="h-4 w-4 text-primary" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 text-destructive" />
                          )}
                          <p className={`text-lg font-semibold ${
                            position.isProfit ? "text-primary" : "text-destructive"
                          }`}>
                            {position.pnlPercent}
                          </p>
                        </div>
                      </div>
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

export default Portfolio;
