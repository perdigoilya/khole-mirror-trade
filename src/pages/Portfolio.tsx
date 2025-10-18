import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "@/components/Footer";
import { Wallet, TrendingUp, BarChart3, DollarSign, Key, RefreshCw, ExternalLink } from "lucide-react";
import { useTrading } from "@/contexts/TradingContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  // Optional: pending (resting) orders awaiting fill for this ticker (Kalshi)
  pendingCount?: number;
  pendingPrice?: number;
  pendingSide?: string;
}

interface PortfolioSummary {
  totalValue: number;
  totalPnl: number;
  totalRealizedPnl: number;
  activePositions: number;
  totalInvested: number;
}

const SUPPORTED_CHAINS = [
  { id: polygon.id, name: 'Polygon USDC', chain: polygon, symbol: 'USDC', tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as `0x${string}` }, // Native USDC on Polygon
  { id: mainnet.id, name: 'Ethereum', chain: mainnet, symbol: 'ETH', tokenAddress: undefined },
  { id: base.id, name: 'Base', chain: base, symbol: 'ETH', tokenAddress: undefined },
  { id: arbitrum.id, name: 'Arbitrum', chain: arbitrum, symbol: 'ETH', tokenAddress: undefined },
  { id: optimism.id, name: 'Optimism', chain: optimism, symbol: 'ETH', tokenAddress: undefined },
];

const Portfolio = () => {
  const navigate = useNavigate();
  const { user, isKalshiConnected, isPolymarketConnected, polymarketCredentials, kalshiCredentials } = useTrading();
  const { toast } = useToast();
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'history'>('overview');
  const [platformTab, setPlatformTab] = useState<'kalshi' | 'polymarket'>('polymarket');
  const [showKalshiDialog, setShowKalshiDialog] = useState(false);
  const [showPolymarketDialog, setShowPolymarketDialog] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [kalshiPositions, setKalshiPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [kalshiSummary, setKalshiSummary] = useState<PortfolioSummary | null>(null);
  const [kalshiBalance, setKalshiBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [selectedChain, setSelectedChain] = useState<number>(polygon.id);
  const [sellLoading, setSellLoading] = useState<string | null>(null);

  const hasAnyConnection = isKalshiConnected || isPolymarketConnected;

  // Get the selected chain config
  const selectedChainConfig = SUPPORTED_CHAINS.find(c => c.id === selectedChain);

  // Get balance for selected chain (USDC for Polygon, native token for others)
  const { data: balance, refetch: refetchBalance } = useBalance({
    address: address,
    chainId: selectedChain,
    token: selectedChainConfig?.tokenAddress, // Use USDC token for Polygon, undefined for native tokens
  });

  const fetchPortfolio = async () => {
    if (!user || !isPolymarketConnected) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No active session");
      }

      console.log("Fetching Polymarket portfolio data...");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/polymarket-portfolio`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Portfolio fetch error:", errorText);
        throw new Error(`Failed to fetch portfolio: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Polymarket portfolio data received:", data);

      if (data.error) {
        throw new Error(data.error);
      }

      setPositions(data.positions || []);
      setSummary(data.summary || {
        totalValue: 0,
        totalPnl: 0,
        totalRealizedPnl: 0,
        activePositions: 0,
        totalInvested: 0,
      });

      if (data.positions && data.positions.length > 0) {
        toast({
          title: "Polymarket portfolio loaded",
          description: `Found ${data.positions.length} active position${data.positions.length > 1 ? 's' : ''}`,
        });
      }
    } catch (error: any) {
      console.error("Error fetching Polymarket portfolio:", error);
      toast({
        title: "Error loading Polymarket portfolio",
        description: error.message || "Failed to load portfolio data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchKalshiPortfolio = async () => {
    if (!user || !isKalshiConnected) return;

    setLoading(true);
    try {
      console.log("Fetching Kalshi portfolio data...");

const { data, error } = await supabase.functions.invoke('kalshi-portfolio', {
  body: kalshiCredentials,
});

      if (error) {
        throw error;
      }

      console.log("Kalshi portfolio data received:", data);

      if (data.error) {
        throw new Error(data.error);
      }

      setKalshiPositions(data.positions || []);
      setKalshiSummary(data.summary || {
        totalValue: 0,
        totalPnl: 0,
        totalRealizedPnl: 0,
        activePositions: 0,
        totalInvested: 0,
      });
      setKalshiBalance(data.balance || 0);

      if (data.positions && data.positions.length > 0) {
        toast({
          title: "Kalshi portfolio loaded",
          description: `Found ${data.positions.length} active position${data.positions.length > 1 ? 's' : ''}`,
        });
      }
    } catch (error: any) {
      console.error("Error fetching Kalshi portfolio:", error);
      toast({
        title: "Error loading Kalshi portfolio",
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

  useEffect(() => {
    if (user && isKalshiConnected) {
      fetchKalshiPortfolio();
    }
  }, [user, isKalshiConnected]);

  const handleSellAll = async (position: Position) => {
    if (!position.size || position.size === 0) {
      toast({
        title: "No shares to sell",
        description: "This position has no filled shares",
        variant: "destructive",
      });
      return;
    }

    setSellLoading(position.slug);
    try {
      if (platformTab === 'kalshi') {
        // Use aggressive limit to guarantee crossing: sell YES/NO at 1¢
        const isYes = position.outcome.toLowerCase() === 'yes';
        const aggressiveYes = isYes ? 1 : undefined;
        const aggressiveNo = !isYes ? 1 : undefined;

        const { data, error } = await supabase.functions.invoke('kalshi-trade', {
          body: {
            ...kalshiCredentials,
            ticker: position.slug,
            action: 'sell',
            side: position.outcome.toLowerCase(),
            count: Math.floor(position.size),
            type: 'limit',
            yes_price: aggressiveYes,
            no_price: aggressiveNo,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast({
          title: 'Sell order placed',
          description: 'Checking fill status...'
        });

        // Poll for up to 10s to confirm the position size decreased
        let cleared = false;
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const { data: pData, error: pErr } = await supabase.functions.invoke('kalshi-portfolio', {
            body: kalshiCredentials,
          });
          if (pErr) break;
          const updated = (pData?.positions || []).find((p: any) => p.slug === position.slug);
          if (!updated || (updated.size ?? 0) < position.size) {
            cleared = true;
            setKalshiPositions(pData?.positions || []);
            setKalshiSummary(pData?.summary || null);
            setKalshiBalance(pData?.balance || 0);
            break;
          }
        }

        if (cleared) {
          toast({
            title: 'Shares sold',
            description: `Successfully submitted sale for ${Math.floor(position.size)} shares`,
          });
        } else {
          toast({
            title: 'Order pending',
            description: 'Your sell order is resting and will fill shortly at 1¢.',
          });
          // Ensure we refresh anyway
          fetchKalshiPortfolio();
        }
      } else {
        // Polymarket sell logic
        toast({
          title: "Polymarket sell not yet implemented",
          description: "Quick sell feature coming soon for Polymarket",
        });
      }
    } catch (error: any) {
      console.error("Error selling position:", error);
      toast({
        title: "Failed to sell position",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSellLoading(null);
    }
  };

  const handlePositionClick = (position: Position) => {
    if (platformTab === 'kalshi') {
      // Extract event ticker from market ticker (e.g., KXGOVTCUTS-28-2000 -> KXGOVTCUTS-28)
      const parts = position.slug.split('-');
      const eventTicker = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : position.slug;
      navigate(`/kalshi/event/${eventTicker}`);
    } else {
      // For Polymarket, navigate to market detail if we have a market ID
      // Position interface needs to be updated to include marketId for Polymarket
      navigate(`/market/${position.slug}`);
    }
  };

  // Set default platform tab based on what's connected
  useEffect(() => {
    if (isKalshiConnected && !isPolymarketConnected) {
      setPlatformTab('kalshi');
    } else if (isPolymarketConnected && !isKalshiConnected) {
      setPlatformTab('polymarket');
    }
  }, [isKalshiConnected, isPolymarketConnected]);

  // Get current platform data
  const currentPositions = platformTab === 'kalshi' ? kalshiPositions : positions;
  const currentSummary = platformTab === 'kalshi' ? kalshiSummary : summary;
  const isPlatformConnected = platformTab === 'kalshi' ? isKalshiConnected : isPolymarketConnected;

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
                        className="h-12 border-kalshi-teal text-kalshi-teal hover:bg-kalshi-teal/10 flex-1"
                        onClick={() => setShowKalshiDialog(true)}
                      >
                        <Key className="h-4 w-4 mr-2" />
                        Kalshi
                      </Button>
                      <Button 
                        size="lg"
                        variant="outline"
                        className="h-12 border-polymarket-purple text-polymarket-purple hover:bg-polymarket-purple/10 flex-1"
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
                {/* Platform Selector */}
                {(isKalshiConnected || isPolymarketConnected) && (
                  <Tabs value={platformTab} onValueChange={(v) => setPlatformTab(v as 'kalshi' | 'polymarket')}>
                    <TabsList className="grid w-full max-w-md grid-cols-2">
                      <TabsTrigger 
                        value="kalshi" 
                        disabled={!isKalshiConnected}
                        className="data-[state=active]:bg-kalshi-teal data-[state=active]:text-white"
                      >
                        Kalshi
                        {!isKalshiConnected && <Badge variant="secondary" className="ml-2 text-xs">Not Connected</Badge>}
                      </TabsTrigger>
                      <TabsTrigger 
                        value="polymarket" 
                        disabled={!isPolymarketConnected}
                        className="data-[state=active]:bg-polymarket-purple data-[state=active]:text-white"
                      >
                        Polymarket
                        {!isPolymarketConnected && <Badge variant="secondary" className="ml-2 text-xs">Not Connected</Badge>}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}

                {/* Chain Selector and Refresh - Only show for Polymarket */}
                {platformTab === 'polymarket' && (
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
                )}
                
                {/* Refresh button only for Kalshi */}
                {platformTab === 'kalshi' && (
                  <div className="flex justify-end">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => fetchKalshiPortfolio()}
                      disabled={loading}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                )}

                {/* Wallet Information Card */}
                <Card className={`p-6 border-l-4 ${platformTab === 'kalshi' ? 'border-l-kalshi-teal' : 'border-l-polymarket-purple'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">Connected Account</h3>
                    </div>
                    <Badge 
                      variant="secondary"
                      className={platformTab === 'kalshi' 
                        ? 'bg-kalshi-teal/20 text-kalshi-teal border-kalshi-teal/30' 
                        : 'bg-polymarket-purple/20 text-polymarket-purple border-polymarket-purple/30'
                      }
                    >
                      {platformTab === 'kalshi' ? "Kalshi" : "Polymarket"}
                    </Badge>
                  </div>
                  {platformTab === 'polymarket' ? (
                    <>
                      <p className="text-sm text-muted-foreground mb-2">
                        Wallet Address
                      </p>
                      <p className="font-mono text-sm mb-4">
                        {polymarketCredentials?.walletAddress 
                          ? `${polymarketCredentials.walletAddress.slice(0, 6)}...${polymarketCredentials.walletAddress.slice(-4)}`
                          : "Not connected"}
                      </p>
                      {isPolymarketConnected && !isConnected && (
                        <div className="bg-muted p-3 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-2">
                            <strong>Note:</strong> Currently showing Polymarket trading positions only.
                          </p>
                          <p className="text-xs text-muted-foreground">
                            To see your on-chain wallet balance, connect via WalletConnect button in navigation.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mb-2">
                        Connected via API Key
                      </p>
                      <div className="bg-muted p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground">
                          Kalshi positions are fetched using your API credentials
                        </p>
                      </div>
                    </>
                  )}
                </Card>

                {/* Balance Card - Kalshi USD balance or Polymarket chain balance */}
                {platformTab === 'kalshi' && kalshiBalance > 0 && (
                  <>
                    {/* Demo Account Disclaimer */}
                    {kalshiBalance <= 1000 && kalshiPositions.length === 0 && (
                      <Alert className="bg-yellow-500/10 border-yellow-500/30">
                        <AlertDescription className="text-sm">
                          <strong>Demo Account Notice:</strong> You appear to be using a Kalshi demo account. Demo balances and positions are for testing only and don't represent real funds or trades. To trade with real money, connect a production Kalshi account.
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">
                          Kalshi Account Balance
                        </p>
                        <Badge variant="outline" className="text-xs bg-kalshi-teal/20 text-kalshi-teal border-kalshi-teal/30">
                          {kalshiBalance <= 1000 && kalshiPositions.length === 0 ? 'DEMO' : 'USD'}
                        </Badge>
                      </div>
                      <p className="text-2xl font-bold text-foreground">
                        ${kalshiBalance.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Available for trading on Kalshi
                      </p>
                    </Card>
                  </>
                )}

                {/* Chain Balance Card - only shown for Polymarket if wallet is connected via WalletConnect */}
                {platformTab === 'polymarket' && isConnected && balance && (
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
                      On-Chain Wallet: {address?.slice(0, 6)}...{address?.slice(-4)}
                    </p>
                  </Card>
                )}

                {/* Portfolio Summary Cards */}
                {currentSummary && (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">{platformTab === 'kalshi' ? 'Kalshi' : 'Polymarket'} Positions</h3>
                        <p className="text-sm text-muted-foreground">Trading activity from {platformTab === 'kalshi' ? 'Kalshi' : 'Polymarket'} API</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">Total Value</p>
                        <Badge variant="outline" className="text-xs">
                          {loading ? "Loading..." : "Live"}
                        </Badge>
                      </div>
                      <p className="text-2xl font-bold text-foreground mb-1">
                        ${currentSummary?.totalValue?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Initial: ${currentSummary?.totalInvested?.toFixed(2) || '0.00'}
                      </p>
                    </Card>
                    
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">Total P&L</p>
                        <TrendingUp className={`h-4 w-4 ${(currentSummary?.totalPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                      </div>
                      <p className={`text-2xl font-bold mb-1 ${(currentSummary?.totalPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {(currentSummary?.totalPnl || 0) >= 0 ? '+' : ''}${currentSummary?.totalPnl?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Realized: ${currentSummary?.totalRealizedPnl?.toFixed(2) || '0.00'}
                      </p>
                    </Card>
                    
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">Active Positions</p>
                        <BarChart3 className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-2xl font-bold text-foreground mb-1">
                        {currentSummary?.activePositions || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Open markets
                      </p>
                    </Card>
                  </div>
                  </>
                )}

                {/* Positions List */}
                {currentPositions.length === 0 ? (
                  <Card className="p-10 text-center">
                    <div className="max-w-md mx-auto">
                      <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <h3 className="text-lg font-semibold mb-2">
                        No positions yet
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Start trading on {platformTab === 'kalshi' ? 'Kalshi' : 'Polymarket'} to see your positions here
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
                      {currentPositions.map((position, index) => (
                        <div key={index} className="p-6 hover:bg-muted/50 transition-colors group">
                          <div className="flex items-start justify-between gap-4">
                            <div 
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => handlePositionClick(position)}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                {position.icon && (
                                  <img src={position.icon} alt="" className="h-5 w-5 rounded" />
                                )}
                                <h4 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{position.title}</h4>
                                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                              </div>
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="secondary" className="text-xs">
                                  {position.outcome}
                                </Badge>
                                {position.size > 0 ? (
                                  <span className="text-xs text-muted-foreground">
                                    {position.size.toFixed(2)} shares @ ${position.avgPrice.toFixed(3)}
                                  </span>
                                ) : position.pendingCount && position.pendingCount > 0 ? (
                                  <span className="text-xs text-muted-foreground">
                                    Pending: {position.pendingCount} @ ${position.pendingPrice?.toFixed(2) ?? '—'} (resting)
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">No filled shares yet</span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>Current: ${position.curPrice.toFixed(3)}</span>
                                <span>Value: ${position.currentValue.toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 flex flex-col gap-2">
                              <div>
                                <div className={`text-lg font-bold ${position.cashPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {position.cashPnl >= 0 ? '+' : ''}${position.cashPnl.toFixed(2)}
                                </div>
                                <div className={`text-xs ${position.percentPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                  {position.percentPnl >= 0 ? '+' : ''}{position.percentPnl.toFixed(2)}%
                                </div>
                              </div>
                              {position.size > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSellAll(position);
                                  }}
                                  disabled={sellLoading === position.slug}
                                >
                                  {sellLoading === position.slug ? "Selling..." : "Sell All"}
                                </Button>
                              )}
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
