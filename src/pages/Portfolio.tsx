import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import { Wallet, TrendingUp, BarChart3, DollarSign, Key } from "lucide-react";
import { useTrading } from "@/contexts/TradingContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConnectKalshiDialog } from "@/components/ConnectKalshiDialog";
import { ConnectPolymarketDialog } from "@/components/ConnectPolymarketDialog";

const Portfolio = () => {
  const { user, isKalshiConnected, isPolymarketConnected } = useTrading();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'history'>('overview');
  const [showKalshiDialog, setShowKalshiDialog] = useState(false);
  const [showPolymarketDialog, setShowPolymarketDialog] = useState(false);

  const hasAnyConnection = isKalshiConnected || isPolymarketConnected;

  return (
    <div className="min-h-screen bg-background flex flex-col pt-14">
      
      <main className="flex-1 pt-6 pb-24">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
            </div>

            {!user ? (
              // Not logged in
              <Card className="p-12 text-center">
                <Wallet className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-2xl font-semibold mb-2">
                  Sign in to view your portfolio
                </h2>
                <p className="text-muted-foreground mb-6">
                  Track your positions and performance across multiple platforms
                </p>
                <Button onClick={() => window.location.href = '/auth'}>
                  Sign In
                </Button>
              </Card>
            ) : !hasAnyConnection ? (
              // Logged in but no connections
              <div className="space-y-6">
                <Card className="p-8 text-center border-2 border-primary/20">
                  <div className="max-w-2xl mx-auto">
                    <div className="p-4 rounded-full bg-primary/10 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                      <Key className="h-10 w-10 text-primary" />
                    </div>
                    <h2 className="text-3xl font-bold mb-3">
                      Connect Your Trading Accounts
                    </h2>
                    <p className="text-muted-foreground mb-8 text-lg">
                      Link your Kalshi or Polymarket accounts to start viewing your portfolio and placing trades
                    </p>
                    <div className="flex gap-4 justify-center flex-col sm:flex-row max-w-lg mx-auto">
                      <Button 
                        size="lg"
                        className="h-16 text-lg font-semibold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 flex-1"
                        onClick={() => setShowKalshiDialog(true)}
                      >
                        <Key className="h-5 w-5 mr-2" />
                        Connect Kalshi
                      </Button>
                      <Button 
                        size="lg"
                        className="h-16 text-lg font-semibold bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white border-0 flex-1"
                        onClick={() => setShowPolymarketDialog(true)}
                      >
                        <Key className="h-5 w-5 mr-2" />
                        Connect Polymarket
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-6">
                      Your credentials are stored securely in your browser and never shared
                    </p>
                  </div>
                </Card>

                {/* Feature Preview */}
                <div className="grid md:grid-cols-3 gap-4">
                  <Card className="p-6 bg-card/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <TrendingUp className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold">Live Performance</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Track your P&L and position values in real-time
                    </p>
                  </Card>

                  <Card className="p-6 bg-card/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <BarChart3 className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold">Multi-Platform</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      View positions from Kalshi and Polymarket in one place
                    </p>
                  </Card>

                  <Card className="p-6 bg-card/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <DollarSign className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold">Smart Analytics</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Get insights on your trading performance and strategy
                    </p>
                  </Card>
                </div>
              </div>
            ) : (
              // Has connections - show empty portfolio ready for integration
              <div className="space-y-6">
                {/* Portfolio Summary Cards - Empty State */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-muted-foreground">Total Value</p>
                      <Badge variant="outline" className="text-xs">Connected</Badge>
                    </div>
                    <p className="text-3xl font-bold text-foreground mb-1">—</p>
                    <p className="text-xs text-muted-foreground">Awaiting position data</p>
                  </Card>
                  
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-muted-foreground">Total P&L</p>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-3xl font-bold text-foreground mb-1">—</p>
                    <p className="text-xs text-muted-foreground">Awaiting position data</p>
                  </Card>
                  
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-muted-foreground">Active Positions</p>
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-3xl font-bold text-foreground mb-1">0</p>
                    <p className="text-xs text-muted-foreground">No positions yet</p>
                  </Card>
                </div>

                {/* Positions Section - Empty State */}
                <Card className="p-12 text-center">
                  <div className="max-w-md mx-auto">
                    <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">
                      No positions found
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      Your portfolio positions will appear here once you start trading. Integration with {isKalshiConnected ? 'Kalshi' : ''}{isKalshiConnected && isPolymarketConnected ? ' and ' : ''}{isPolymarketConnected ? 'Polymarket' : ''} is ready.
                    </p>
                    <Button onClick={() => window.location.href = '/markets'}>
                      Browse Markets to Trade
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Connection Dialogs */}
      <ConnectKalshiDialog open={showKalshiDialog} onOpenChange={setShowKalshiDialog} />
      <ConnectPolymarketDialog open={showPolymarketDialog} onOpenChange={setShowPolymarketDialog} />

      <Footer />
    </div>
  );
};

export default Portfolio;
