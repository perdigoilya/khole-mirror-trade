import { useState } from "react";
import { useTrading } from "@/contexts/TradingContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Wallet, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useAccount, useConnect, useDisconnect, useSignTypedData, useSwitchChain, usePublicClient } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { polygon } from "wagmi/chains";
import { supabase } from "@/integrations/supabase/client";

interface ConnectPolymarketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ConnectPolymarketDialog = ({ open, onOpenChange }: ConnectPolymarketDialogProps) => {
  const { connectPolymarket, polymarketCredentials, user } = useTrading();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [registrationRequired, setRegistrationRequired] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [proxyAddress, setProxyAddress] = useState("");
  const [useEoaAsFunder, setUseEoaAsFunder] = useState(false);
  const [diagnostics, setDiagnostics] = useState<{
    credsReady?: boolean;
    l2SanityCheck?: boolean;
    funderResolved?: string;
    tradingEnabled?: boolean;
    funderHasBalance?: boolean;
    funderBalance?: number;
    eoaBalance?: number;
    proxyBalance?: number;
    detectedProxy?: string;
    ownerAddress?: string;
    connectedEOA?: string;
    closedOnly?: boolean;
    fundsReady?: boolean;
    l2Body?: any;
    accessStatus?: any;
    serverHasKey?: boolean;
    serverHasSecret?: boolean;
    serverHasPassphrase?: boolean;
    serverOwnerAddress?: string;
    serverConnectedEOA?: string;
    serverOwnerMatch?: boolean;
    serverClosedOnly?: boolean;
    serverTradingEnabled?: boolean;
  }>({});
  const { address, isConnected, chainId } = useAccount();
  const { open: openWalletModal } = useWeb3Modal();
  const publicClient = usePublicClient({ chainId: polygon.id });
  const { disconnect } = useDisconnect();
  const { signTypedDataAsync } = useSignTypedData();
  const { switchChainAsync } = useSwitchChain();

  // USDC on Polygon (native)
  const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as `0x${string}`;
  const ERC20_ABI = [
    {
      type: 'function',
      name: 'balanceOf',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
  ] as const;

  const getUsdcBalance = async (addr?: string): Promise<number> => {
    try {
      if (!publicClient || !addr) return 0;
      const raw = (await (publicClient as any).readContract({
        address: USDC_POLYGON,
        abi: ERC20_ABI as any,
        functionName: 'balanceOf',
        args: [addr as `0x${string}`],
      })) as unknown as bigint;
      // USDC has 6 decimals on Polygon
      return Number(raw) / 1_000_000;
    } catch (e) {
      console.warn('USDC balance read failed for', addr, e);
      return 0;
    }
  };

  const isPolymarketConnected = !!polymarketCredentials;

  const handleDialogClose = (newOpen: boolean) => {
    // Clean up state when dialog is closed
    if (!newOpen) {
      setRegistrationRequired(false);
      if (!address) {
        disconnect();
      }
    }
    onOpenChange(newOpen);
  };

  const handleWalletConnect = async () => {
    if (!isConnected) {
      try {
        // Open WalletConnect modal
        setIsLoading(true);
        setRegistrationRequired(false);
        await openWalletModal();
        // Note: Connection happens asynchronously, modal closing doesn't mean success/failure
      } catch (error: any) {
        console.error("Wallet modal error:", error);
        toast({
          title: "Connection Cancelled",
          description: "Please try connecting again",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!address) {
      toast({
        title: "No wallet address",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setRegistrationRequired(false);
    try {
      // Switch to Polygon if not already on it
      if (chainId !== polygon.id) {
        toast({
          title: "Switching to Polygon",
          description: "Please approve the network switch in your wallet",
        });
        await switchChainAsync({ chainId: polygon.id });
      }

      // Auto-detect proxy/funder address
      let detectedFunder: string | null = null;
      
      // Step 1: Try Safe Client API for browser wallet users
      try {
        const safeResponse = await fetch(`https://safe-client.safe.global/v1/chains/137/owners/${address}/safes`);
        if (safeResponse.ok) {
          const safeData = await safeResponse.json();
          if (safeData.safes && safeData.safes.length > 0) {
            const candidateProxy = safeData.safes[0];
            
            // Validate with Polymarket Data-API
            const valueResponse = await fetch(`https://data-api.polymarket.com/value?user=${candidateProxy}`);
            if (valueResponse.ok) {
              const valueData = await valueResponse.json();
              if (valueData.value && parseFloat(valueData.value) > 0) {
                detectedFunder = candidateProxy;
                console.log('Auto-detected Safe proxy:', candidateProxy);
              }
            }
          }
        }
      } catch (err) {
        console.log('Safe API detection skipped:', err);
      }

      // Step 2: If no Safe found, try EOA directly
      if (!detectedFunder) {
        try {
          const valueResponse = await fetch(`https://data-api.polymarket.com/value?user=${address}`);
          if (valueResponse.ok) {
            const valueData = await valueResponse.json();
            if (valueData.value && parseFloat(valueData.value) > 0) {
              detectedFunder = address;
              console.log('Using EOA as funder (has value):', address);
            }
          }
        } catch (err) {
          console.log('EOA value check failed:', err);
        }
      }

      // Create API credentials for authenticated trading
      toast({
        title: "Setting up API credentials...",
        description: "Please sign the message in your wallet to enable trading",
      });

      // Fetch server time required by Polymarket for EIP-712 signing
      const timeRes = await supabase.functions.invoke('polymarket-time');
      if (timeRes.error) throw new Error(timeRes.error.message || 'Failed to fetch server time');
      
      const tsRaw = timeRes.data?.timestamp;
      let timestamp = Number(typeof tsRaw === 'string' ? tsRaw.trim() : tsRaw);
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        timestamp = Math.floor(Date.now() / 1000);
      }

      const domain = {
        name: "ClobAuthDomain",
        version: "1",
        chainId: 137,
      } as const;

      const types = {
        ClobAuth: [
          { name: "address", type: "address" },
          { name: "timestamp", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "message", type: "string" },
        ],
      } as const;

      const message = {
        address,
        timestamp: String(timestamp),
        nonce: 0n,
        message: "This message attests that I control the given wallet",
      } as const;

      // Request signature from wallet
      const signature = await signTypedDataAsync({
        account: address,
        domain,
        types,
        primaryType: "ClobAuth",
        message,
      });

      // Create/derive API key (REQUIRED for trading)
      let apiCredentials = null;
      try {
        const apiKeyResponse = await supabase.functions.invoke('polymarket-create-api-key', {
          body: {
            walletAddress: address,
            signature,
            timestamp,
            nonce: 0,
          }
        });

        if (apiKeyResponse.error) {
          const errorData = apiKeyResponse.error as any;
          
          // Check if this is a registration-required error
          if (errorData.cert_required || errorData.status === 'not_registered') {
            setRegistrationRequired(true);
            toast({
              title: "Registration Required",
              description: "Please visit polymarket.com to complete your registration first",
              variant: "destructive",
            });
            return;
          }
          
          throw new Error(errorData.message || 'Failed to create Polymarket API key');
        }

        apiCredentials = apiKeyResponse.data;
        console.log('API credentials created');
      } catch (err: any) {
        console.error('API key creation failed:', err);
        throw err;
      }

      // Priority: toggle > manual input > auto-detected > API-provided > EOA
      const funderAddress = useEoaAsFunder 
        ? address 
        : (proxyAddress || detectedFunder || apiCredentials?.funderAddress || address);

      if (!apiCredentials?.apiKey || !apiCredentials?.secret || !apiCredentials?.passphrase) {
        throw new Error('Missing API credentials after creation.');
      }

      await connectPolymarket({ 
        walletAddress: address,
        apiKey: apiKey || undefined,
        apiCredentials: {
          ...apiCredentials,
          funderAddress
        }
      });

      // Store credentials in database with UPSERT (merge resolution)
      const normalizedWalletAddress = address.toLowerCase();
      const { error: dbError } = await supabase
        .from('user_polymarket_credentials')
        .upsert({
          user_id: user?.id,
          wallet_address: normalizedWalletAddress,
          api_credentials_key: apiCredentials.apiKey,
          api_credentials_secret: apiCredentials.secret,
          api_credentials_passphrase: apiCredentials.passphrase,
          funder_address: funderAddress,
        }, {
          onConflict: 'user_id'
        });

      if (dbError) {
        throw new Error('Failed to store trading credentials');
      }

      console.info('CREDS_SAVED eoa=' + normalizedWalletAddress + ' hasKey=true hasSecret=true hasPassphrase=true');

      // Step 1: Credentials created ✓
      setDiagnostics(prev => ({ 
        ...prev, 
        credsReady: true, 
        funderResolved: funderAddress,
        ownerAddress: normalizedWalletAddress,
        connectedEOA: normalizedWalletAddress,
      }));
      let eoaBalance = 0;
      let proxyBalance = 0;
      
      try {
        // Check EOA USDC balance on Polygon
        eoaBalance = await getUsdcBalance(address);
        
        // Check proxy USDC balance if a distinct proxy was detected
        if (detectedFunder && detectedFunder.toLowerCase() !== address.toLowerCase()) {
          proxyBalance = await getUsdcBalance(detectedFunder);
        }
        
        const activeFunderBalance = useEoaAsFunder ? eoaBalance : (proxyBalance || eoaBalance);
        const hasBalance = activeFunderBalance > 0;
        
        setDiagnostics(prev => ({ 
          ...prev, 
          funderHasBalance: hasBalance,
          funderBalance: activeFunderBalance,
          eoaBalance,
          proxyBalance,
          detectedProxy: detectedFunder !== address ? detectedFunder : undefined,
          fundsReady: hasBalance
        }));

        if (!hasBalance) {
          console.warn('⚠️ Active funder has no USDC balance - orders may fail with NOT_ENOUGH_BALANCE');
        }
      } catch (e) {
        console.warn('Could not check on-chain USDC balances:', e);
      }
        
      // on-chain USDC balances checked above

      // Small delay to allow credentials to propagate before L2 sanity check
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Call server-side /connect/status to get authoritative flags
      console.log('Fetching authoritative connection status...');
      const normalizedEOA = address.toLowerCase();
      try {
        const { data: statusData, error: statusError } = await supabase.functions.invoke('polymarket-connect-status', {
          body: { connectedEOA: normalizedEOA }
        });

        if (statusError || !statusData) {
          console.error('Connect status error:', statusError || 'No data');
          throw new Error('Failed to fetch connection status');
        }

        console.info('Connect status response:', JSON.stringify(statusData, null, 2));
        console.info('DB row key: user_id + eoa=' + normalizedEOA);

        const {
          hasKey: serverHasKey = false,
          hasSecret: serverHasSecret = false,
          hasPassphrase: serverHasPassphrase = false,
          ownerAddress: serverOwnerAddress = '',
          connectedEOA: serverConnectedEOA = '',
          ownerMatch: serverOwnerMatch = false,
          closed_only: serverClosedOnly = false,
          tradingEnabled: serverTradingEnabled = false,
          banStatusRaw,
        } = statusData;

        console.log('Server connection status (explicit booleans):', {
          hasKey: serverHasKey,
          hasSecret: serverHasSecret,
          hasPassphrase: serverHasPassphrase,
          ownerAddress: serverOwnerAddress,
          connectedEOA: serverConnectedEOA,
          ownerMatch: serverOwnerMatch,
          closed_only: serverClosedOnly,
          tradingEnabled: serverTradingEnabled,
        });

        // Update diagnostics with server-computed values (never undefined)
        setDiagnostics(prev => ({ 
          ...prev, 
          l2SanityCheck: true, 
          tradingEnabled: serverTradingEnabled,
          closedOnly: serverClosedOnly,
          l2Body: banStatusRaw,
          serverHasKey,
          serverHasSecret,
          serverHasPassphrase,
          serverOwnerAddress,
          serverConnectedEOA,
          serverOwnerMatch,
          serverTradingEnabled,
          serverClosedOnly,
        } as any));
        
        if (serverTradingEnabled) {
          toast({
            title: "Trading Ready",
            description: `✓ Credentials verified\n✓ L2 auth working\n✓ Funder: ${funderAddress.slice(0, 6)}...${funderAddress.slice(-4)}`,
          });
        } else if (serverClosedOnly) {
          toast({
            title: "Account in Closed-Only Mode",
            description: "Your Polymarket account can't open new positions. Visit Polymarket to resolve restrictions.",
            variant: "destructive",
          });
        }

      } catch (e: any) {
        console.error('Connect status check error:', e);
        setDiagnostics(prev => ({ ...prev, l2SanityCheck: false, tradingEnabled: false }));
        
        toast({
          title: "Connection Verification Failed",
          description: "Could not verify trading status. Try disconnecting and reconnecting.",
          variant: "destructive",
        });
        throw e;
      }
      
      // Don't auto-close dialog - let user review diagnostics
      // onOpenChange(false);
    } catch (error: any) {
      console.error('Wallet connection error:', error);
      
      if (error.message?.includes('User rejected')) {
        toast({
          title: "Signature Rejected",
          description: "You need to sign the message to connect to Polymarket",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: error.message || "Failed to connect to Polymarket",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect to Polymarket</DialogTitle>
          <DialogDescription>
            Connect your wallet - works with both proxy and direct trading setups
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isPolymarketConnected && address ? (
            <>
              <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-500">
                      Connected to Polymarket
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 font-mono break-all">
                      {address}
                    </p>
                  </div>
                </div>
              </div>

              {/* Red banner for closed-only mode */}
              {diagnostics.serverClosedOnly && (
                <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-500">
                        Account in Closed-Only Mode
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your account is in closed-only mode on Polymarket (cannot open new positions)
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 border-red-500/50 text-red-500 hover:bg-red-500/10"
                        onClick={() => window.open('https://polymarket.com', '_blank')}
                      >
                        Open Polymarket
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Diagnostics Panel */}
              {diagnostics.credsReady && (
                <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Connection Diagnostics</p>
                  <div className="space-y-1.5 text-xs">
                    {/* Display the 5 trading gate predicates (explicit booleans) */}
                    <div className="flex items-center gap-2">
                      {diagnostics.serverHasKey ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span>hasKey = {String(diagnostics.serverHasKey ?? false)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {diagnostics.serverHasSecret ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span>hasSecret = {String(diagnostics.serverHasSecret ?? false)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {diagnostics.serverHasPassphrase ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span>hasPassphrase = {String(diagnostics.serverHasPassphrase ?? false)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {diagnostics.serverOwnerMatch ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span>ownerAddress === connectedEOA = {String(diagnostics.serverOwnerMatch ?? false)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!diagnostics.serverClosedOnly ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span>closed_only === false = {String(!diagnostics.serverClosedOnly)}</span>
                    </div>
                    
                    {/* Overall trading gate result */}
                    <div className="border-t border-border pt-2 mt-2">
                      <div className="flex items-center gap-2">
                        {diagnostics.serverTradingEnabled ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="font-medium">tradingEnabled = {String(diagnostics.serverTradingEnabled ?? false)}</span>
                      </div>
                    </div>
                    {diagnostics.funderResolved && (
                      <>
                        <div className="flex items-center gap-2">
                          <Info className="h-3.5 w-3.5 text-blue-500" />
                          <span>Active Funder: {diagnostics.funderResolved.slice(0, 8)}...{diagnostics.funderResolved.slice(-6)}</span>
                        </div>
                        
                        {diagnostics.eoaBalance !== undefined && (
                          <div className="flex items-center gap-2">
                            {diagnostics.eoaBalance > 0 ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            )}
                            <span>EOA balance: ${diagnostics.eoaBalance.toFixed(2)}</span>
                          </div>
                        )}
                        
                        {diagnostics.detectedProxy && diagnostics.proxyBalance !== undefined && (
                          <div className="flex items-center gap-2">
                            {diagnostics.proxyBalance > 0 ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            )}
                            <span>Proxy balance: ${diagnostics.proxyBalance.toFixed(2)}</span>
                          </div>
                        )}
                        
                        {diagnostics.funderBalance !== undefined && (
                          <div className="flex items-center gap-2">
                            {diagnostics.funderHasBalance ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            )}
                            <span className="font-semibold">Active funder balance: ${diagnostics.funderBalance.toFixed(2)}</span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex items-center gap-2">
                      {diagnostics.tradingEnabled ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      )}
                      <span className="font-semibold">tradingEnabled = {diagnostics.tradingEnabled ? 'TRUE' : 'FALSE'}</span>
                    </div>

                    {!diagnostics.serverTradingEnabled && (
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-2"><span className="w-44 text-muted-foreground">hasKey</span><span>{String(diagnostics.serverHasKey ?? false)}</span></div>
                        <div className="flex items-center gap-2"><span className="w-44 text-muted-foreground">hasSecret</span><span>{String(diagnostics.serverHasSecret ?? false)}</span></div>
                        <div className="flex items-center gap-2"><span className="w-44 text-muted-foreground">hasPassphrase</span><span>{String(diagnostics.serverHasPassphrase ?? false)}</span></div>
                        <div className="flex items-center gap-2"><span className="w-44 text-muted-foreground">ownerAddress===connectedEOA</span><span>{String(diagnostics.serverOwnerMatch ?? false)}</span></div>
                        <div className="flex items-center gap-2"><span className="w-44 text-muted-foreground">closed_only===false</span><span>{String(!diagnostics.serverClosedOnly)}</span></div>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <div className="text-xs">
                            <p className="font-medium text-red-600 dark:text-red-400 mb-1">Trading Blocked</p>
                            <ul className="space-y-0.5 text-red-600 dark:text-red-400">
                              {diagnostics.serverClosedOnly && <li>• Account in closed-only mode (can't open new positions)</li>}
                              {!diagnostics.serverHasKey && <li>• Missing API key</li>}
                              {!diagnostics.serverHasSecret && <li>• Missing API secret</li>}
                              {!diagnostics.serverHasPassphrase && <li>• Missing API passphrase</li>}
                              {!diagnostics.serverOwnerMatch && <li>• Owner address doesn't match connected EOA</li>}
                            </ul>
                          </div>
                        </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-red-500/50 text-red-500 hover:bg-red-500/10"
                          onClick={() => window.open('https://polymarket.com', '_blank')}
                        >
                          Open Polymarket
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleWalletConnect}
                          disabled={isLoading}
                        >
                          {isLoading ? 'Retrying...' : 'Retry'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            try {
                              if (!user?.id) throw new Error('Not signed in');
                              await supabase
                                .from('user_polymarket_credentials')
                                .update({
                                  api_credentials_key: null,
                                  api_credentials_secret: null,
                                  api_credentials_passphrase: null,
                                  api_key: null,
                                })
                                .eq('user_id', user.id);
                              toast({ title: 'Credentials cleared', description: 'Recreating credentials...' });
                              await handleWalletConnect();
                            } catch (e: any) {
                              toast({ title: 'Failed to refresh credentials', description: e.message || 'Try again', variant: 'destructive' });
                            }
                          }}
                        >
                          Force fresh creds
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {diagnostics.l2Body && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-2">L2 Response Body:</p>
                      <pre className="text-[10px] text-muted-foreground bg-muted/30 p-2 rounded overflow-x-auto">
                        {JSON.stringify(diagnostics.l2Body, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {diagnostics.accessStatus && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Access Status:</p>
                      <pre className="text-[10px] text-muted-foreground bg-muted/30 p-2 rounded overflow-x-auto">
                        {JSON.stringify(diagnostics.accessStatus, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {!diagnostics.funderHasBalance && diagnostics.funderBalance === 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex items-start gap-2 mb-3">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          <span className="font-medium">Warning:</span> Proxy has no funds. Orders may fail with NOT_ENOUGH_BALANCE.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => window.open('https://polymarket.com/deposit', '_blank')}
                      >
                        Fund Proxy on Polymarket
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
            ) : registrationRequired && isConnected && address ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-amber-500">
                        Registration Required
                      </p>
                      <p className="text-sm text-muted-foreground mt-1 font-mono break-all">
                        {address}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-blue-500/50 bg-blue-500/10 p-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="font-medium text-blue-500">Complete Your Polymarket Setup</p>
                      <p className="text-muted-foreground mt-1">
                        Your wallet needs to be registered on Polymarket before you can trade. 
                        This one-time setup creates your proxy wallet and enables trading.
                      </p>
                    </div>
                    
                    <div>
                      <p className="font-medium text-foreground">Steps:</p>
                      <ol className="list-decimal list-inside space-y-1.5 ml-2 mt-2 text-muted-foreground">
                        <li>Visit <strong>polymarket.com</strong></li>
                        <li>Connect this wallet (<span className="font-mono text-xs">{address.slice(0, 6)}...{address.slice(-4)}</span>)</li>
                        <li>Complete the registration process</li>
                        <li>Return here and click <strong>Retry Connection</strong></li>
                      </ol>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open('https://polymarket.com', '_blank')}
                        className="text-xs"
                      >
                        Open Polymarket
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setRegistrationRequired(false);
                          handleWalletConnect();
                        }}
                        disabled={isLoading}
                        className="text-xs bg-[hsl(var(--polymarket-blue))] hover:bg-[hsl(var(--polymarket-blue))]/90"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            Retrying...
                          </>
                        ) : (
                          'Retry Connection'
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
           ) : isConnected && address ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm font-semibold mb-1">Connected Wallet</p>
                <p className="text-sm font-mono text-muted-foreground break-all">
                  {address}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey">Polymarket API Key (Optional)</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="Optional - for advanced trading features"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  API keys are required for placing orders and are created automatically when you sign.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="proxyAddress">Proxy/Funder Address (Optional)</Label>
                <Input
                  id="proxyAddress"
                  type="text"
                  placeholder="0x... (we'll auto-detect if left empty)"
                  value={proxyAddress}
                  onChange={(e) => setProxyAddress(e.target.value)}
                  className="font-mono text-sm"
                  disabled={useEoaAsFunder}
                />
                <p className="text-xs text-muted-foreground">
                  We'll automatically detect your Polymarket proxy via Safe API. Only fill this if auto-detection fails.
                </p>
              </div>
              
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="use-eoa" className="text-sm font-medium cursor-pointer">
                    Use EOA as Funder (Advanced)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Force your connected wallet as funder instead of proxy. Only useful if your EOA has USDC balance.
                  </p>
                </div>
                <Switch
                  id="use-eoa"
                  checked={useEoaAsFunder}
                  onCheckedChange={async (checked) => {
                    setUseEoaAsFunder(checked);
                    // Recompute balances from on-chain USDC when toggled
                    try {
                      const [eoaB, proxyB] = await Promise.all([
                        getUsdcBalance(address),
                        diagnostics.detectedProxy ? getUsdcBalance(diagnostics.detectedProxy) : Promise.resolve(0),
                      ]);
                      const newFunder = checked ? address : (diagnostics.detectedProxy || address);
                      const active = checked ? eoaB : (proxyB || eoaB);
                      setDiagnostics(prev => ({
                        ...prev,
                        eoaBalance: eoaB,
                        proxyBalance: diagnostics.detectedProxy ? proxyB : undefined,
                        funderResolved: newFunder || undefined,
                        funderBalance: active,
                        funderHasBalance: active > 0,
                        fundsReady: active > 0,
                      }));
                    } catch (e) {
                      console.warn('Toggle balance refresh failed', e);
                    }
                  }}
                />
              </div>
              
              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 text-sm">
                <p className="text-green-900 dark:text-green-300">
                  ✓ Wallet connected! Add your API key and click "Save Connection".
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-lg bg-muted p-4 text-sm space-y-4">
                <p className="font-semibold text-base mb-3">📋 Quick Start Guide:</p>
                
                <div className="space-y-3">
                  <div className="pl-2">
                    <span className="font-semibold text-foreground">Step 1: Get a Wallet</span>
                    <p className="text-muted-foreground mt-1">
                      Download <a 
                        href="https://metamask.io/download/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >MetaMask</a> or <a 
                        href="https://www.coinbase.com/wallet" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >Coinbase Wallet</a>
                    </p>
                  </div>

                  <div className="pl-2">
                    <span className="font-semibold text-foreground">Step 2: Fund Your Wallet</span>
                    <p className="text-muted-foreground mt-1">
                      Get USDC on Polygon at{" "}
                      <a 
                        href="https://polymarket.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        polymarket.com
                      </a> or buy from an exchange
                    </p>
                  </div>

                  <div className="pl-2">
                    <span className="font-semibold text-foreground">Step 3: Connect Here</span>
                    <p className="text-muted-foreground mt-1">
                      Click "Connect Wallet" below and approve the connection
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 mt-4">
                  <p className="text-sm text-blue-900 dark:text-blue-300">
                    💡 Already trading on Polymarket? Just connect the same wallet -{" "}
                    <strong>proxy wallets work fine</strong>!
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-3 text-sm mt-4">
                <p className="text-green-900 dark:text-green-300">
                  🔒 Secure connection - we never access your funds
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          {isConnected && address ? (
            <>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={isLoading}
              >
                Disconnect
              </Button>
              <Button
                onClick={handleWalletConnect}
                disabled={isLoading}
                className="bg-[hsl(var(--polymarket-blue))] hover:bg-[hsl(var(--polymarket-blue))]/90"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Connection
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => handleDialogClose(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleWalletConnect}
                disabled={isLoading}
                className="bg-[hsl(var(--polymarket-blue))] hover:bg-[hsl(var(--polymarket-blue))]/90"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {!isLoading && <Wallet className="mr-2 h-4 w-4" />}
                Connect Wallet
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
