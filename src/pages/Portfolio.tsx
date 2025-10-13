import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import { Wallet, TrendingUp, BarChart3, DollarSign, Key, RefreshCw } from "lucide-react";
import { useTrading } from "@/contexts/TradingContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConnectKalshiDialog } from "@/components/ConnectKalshiDialog";
import { ConnectPolymarketDialog } from "@/components/ConnectPolymarketDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAccount, useBalance } from "wagmi";
import { mainnet, polygon, base, arbitrum, optimism } from "wagmi/chains";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Position {
  title: string;
  outcome: string;
  size: number;
  avgPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  curPrice: number;
  slug: string;
  icon?: string;
}

interface PortfolioSummary {
  totalValue: number;
  totalPnl: number;
  totalRealizedPnl: number;
  activePositions: number;
  totalInvested: number;
}

const SUPPORTED_CHAINS = [
  { id: polygon.id, name: 'Polygon', chain: polygon, symbol: 'MATIC' },
  { id: mainnet.id, name: 'Ethereum', chain: mainnet, symbol: 'ETH' },
  { id: base.id, name: 'Base', chain: base, symbol: 'ETH' },
  { id: arbitrum.id, name: 'Arbitrum', chain: arbitrum, symbol: 'ETH' },
  { id: optimism.id, name: 'Optimism', chain: optimism, symbol: 'ETH' },
];

const Portfolio = () => {
  const { user, isKalshiConnected, isPolymarketConnected, polymarketCredentials } = useTrading();
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'history'>('overview');
  const [showKalshiDialog, setShowKalshiDialog] = useState(false);
  const [showPolymarketDialog, setShowPolymarketDialog] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedChain, setSelectedChain] = useState<number>(polygon.id);

  const hasAnyConnection = isKalshiConnected || isPolymarketConnected;

  // Get balance for selected chain
  const { data: balance, refetch: refetchBalance } = useBalance({
    address: address,
    chainId: selectedChain,
  });

  const fetchPortfolio = async () => {
    if (!user || !isPolymarketConnected) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No active session");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/polymarket-portfolio`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch portfolio");
      }

      const data = await response.json();
      setPositions(data.positions || []);
      setSummary(data.summary || null);
    } catch (error: any) {
      console.error("Error fetching portfolio:", error);
      toast({
        title: "Error loading portfolio",
        description: error.message || "Failed to load portfolio data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && isPolymarketConnected) {
      fetchPortfolio();
    }
  }, [user, isPolymarketConnected]);

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
                        className="h-12 border-[hsl(var(--kalshi-teal))] text-[hsl(var(--kalshi-teal))] hover:bg-[hsl(var(--kalshi-teal))]/10 flex-1"
                        onClick={() => setShowKalshiDialog(true)}
                      >
                        <Key className="h-4 w-4 mr-2" />
                        Kalshi
                      </Button>
                      <Button 
                        size="lg"
                        variant="outline"
                        className="h-12 border-[hsl(var(--polymarket-blue))] text-[hsl(var(--polymarket-blue))] hover:bg-[hsl(var(--polymarket-blue))]/10 flex-1"
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
              // Has connections - show portfolio data
              <div className="space-y-6">
                {/* Chain Selector and Refresh */}
                <div className="flex justify-between items-center gap-4">
                  <Tabs value={selectedChain.toString()} onValueChange={(v) => setSelectedChain(Number(v))} className="flex-1">
                    <TabsList className="grid w-full grid-cols-5">
                      {SUPPORTED_CHAINS.map((chain) => (
                        <TabsTrigger key={chain.id} value={chain.id.toString()}>
                          {chain.name}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      fetchPortfolio();
                      refetchBalance();
                    }}
                    disabled={loading}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>

                {/* Chain Balance Card */}
                {isConnected && balance && (
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">
                        {SUPPORTED_CHAINS.find(c => c.id === selectedChain)?.name} Balance
                      </p>
                      <Badge variant="outline" className="text-xs">
                        {SUPPORTED_CHAINS.find(c => c.id === selectedChain)?.symbol}
                      </Badge>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {Number(balance.formatted).toFixed(4)} {balance.symbol}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Wallet: {address?.slice(0, 6)}...{address?.slice(-4)}
                    </p>
                  </Card>
                )}

                {/* Portfolio Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">Total Value</p>
                      <Badge variant="outline" className="text-xs">Live</Badge>
                    </div>
                    <p className="text-2xl font-bold text-foreground mb-1">
                      ${summary?.totalValue?.toFixed(2) || '0.00'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Initial: ${summary?.totalInvested?.toFixed(2) || '0.00'}
                    </p>
                  </Card>
                  
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">Total P&L</p>
                      <TrendingUp className={`h-4 w-4 ${(summary?.totalPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                    </div>
                    <p className={`text-2xl font-bold mb-1 ${(summary?.totalPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {(summary?.totalPnl || 0) >= 0 ? '+' : ''}${summary?.totalPnl?.toFixed(2) || '0.00'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Realized: ${summary?.totalRealizedPnl?.toFixed(2) || '0.00'}
                    </p>
                  </Card>
                  
                  <Card className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">Active Positions</p>
                      <BarChart3 className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-2xl font-bold text-foreground mb-1">
                      {summary?.activePositions || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Open markets
                    </p>
                  </Card>
                </div>

                {/* Positions List */}
                {positions.length === 0 ? (
                  <Card className="p-10 text-center">
                    <div className="max-w-md mx-auto">
                      <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <h3 className="text-lg font-semibold mb-2">
                        No positions yet
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Start trading on Polymarket to see your positions here
                      </p>
                      <Button onClick={() => window.location.href = '/markets'}>
                        Browse Markets
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <Card>
                    <div className="p-6 border-b">
                      <h3 className="text-lg font-semibold">Open Positions</h3>
                      <p className="text-sm text-muted-foreground">Your active market positions</p>
                    </div>
                    <div className="divide-y">
                      {positions.map((position, index) => (
                        <div key={index} className="p-6 hover:bg-muted/50 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {position.icon && (
                                  <img src={position.icon} alt="" className="h-5 w-5 rounded" />
                                )}
                                <h4 className="font-semibold text-sm truncate">{position.title}</h4>
                              </div>
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="secondary" className="text-xs">
                                  {position.outcome}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {position.size.toFixed(2)} shares @ ${position.avgPrice.toFixed(3)}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>Current: ${position.curPrice.toFixed(3)}</span>
                                <span>Value: ${position.currentValue.toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className={`text-lg font-bold ${position.cashPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {position.cashPnl >= 0 ? '+' : ''}${position.cashPnl.toFixed(2)}
                              </div>
                              <div className={`text-xs ${position.percentPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {position.percentPnl >= 0 ? '+' : ''}{position.percentPnl.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
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
