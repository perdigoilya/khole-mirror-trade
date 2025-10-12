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
              <div className="space-y-8">
                <Card className="p-10 text-center">
                  <div className="max-w-xl mx-auto">
                    <div className="p-3 rounded-full bg-muted w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                      <Key className="h-8 w-8 text-primary" />
                    </div>
                    <h2 className="text-2xl font-semibold mb-2">
                      Connect Trading Account
                    </h2>
                    <p className="text-muted-foreground mb-8">
                      Link your Kalshi or Polymarket account to view positions and trade
                    </p>
                    <div className="flex gap-3 justify-center flex-col sm:flex-row max-w-sm mx-auto">
                      <Button 
                        size="lg"
                        variant="outline"
                        className="h-12 border-[hsl(var(--kalshi-blue))] text-[hsl(var(--kalshi-blue))] hover:bg-[hsl(var(--kalshi-blue))]/10 flex-1"
                        onClick={() => setShowKalshiDialog(true)}
                      >
                        <Key className="h-4 w-4 mr-2" />
                        Kalshi
                      </Button>
                      <Button 
                        size="lg"
                        variant="outline"
                        className="h-12 border-[hsl(var(--polymarket-purple))] text-[hsl(var(--polymarket-purple))] hover:bg-[hsl(var(--polymarket-purple))]/10 flex-1"
                        onClick={() => setShowPolymarketDialog(true)}
                      >
                        <Key className="h-4 w-4 mr-2" />
                        Polymarket
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-6">
                      Credentials stored securely in your browser
                    </p>
                  </div>
                </Card>

                {/* Feature Preview */}
                <div className="grid md:grid-cols-3 gap-4">
                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-lg bg-muted">
                        <TrendingUp className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold text-sm">Live Performance</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Track P&L and positions in real-time
                    </p>
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-lg bg-muted">
                        <BarChart3 className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold text-sm">Multi-Platform</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      View positions from both platforms
                    </p>
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-lg bg-muted">
                        <DollarSign className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold text-sm">Smart Analytics</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Insights on trading performance
                    </p>
                  </Card>
                </div>
              </div>
            ) : (
              // Has connections - show empty portfolio ready for integration
              <div className="space-y-6">
                {/* Portfolio Summary Cards - Empty State */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">Total Value</p>
                      <Badge variant="outline" className="text-xs">Connected</Badge>
                    </div>
                    <p className="text-2xl font-bold text-foreground mb-1">—</p>
                    <p className="text-xs text-muted-foreground">Awaiting position data</p>
                  </Card>
                  
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">Total P&L</p>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-bold text-foreground mb-1">—</p>
                    <p className="text-xs text-muted-foreground">Awaiting position data</p>
                  </Card>
                  
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">Active Positions</p>
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-bold text-foreground mb-1">0</p>
                    <p className="text-xs text-muted-foreground">No positions yet</p>
                  </Card>
                </div>

                {/* Positions Section - Empty State */}
                <Card className="p-10 text-center">
                  <div className="max-w-md mx-auto">
                    <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <h3 className="text-lg font-semibold mb-2">
                      No positions found
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Your portfolio positions will appear here once you start trading. Integration with {isKalshiConnected ? 'Kalshi' : ''}{isKalshiConnected && isPolymarketConnected ? ' and ' : ''}{isPolymarketConnected ? 'Polymarket' : ''} is ready.
                    </p>
                    <Button onClick={() => window.location.href = '/markets'}>
                      Browse Markets
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
