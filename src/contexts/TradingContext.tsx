import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface KalshiCredentials {
  apiKeyId: string;
  privateKey: string;
}

interface PolymarketCredentials {
  walletAddress: string;
  apiKey?: string;
  apiCredentials?: {
    apiKey: string;
    secret: string;
    passphrase: string;
  };
}

type Provider = 'kalshi' | 'polymarket' | null;

interface TradingContextType {
  // Kalshi
  kalshiCredentials: KalshiCredentials | null;
  isKalshiConnected: boolean;
  connectKalshi: (credentials: KalshiCredentials) => Promise<void>;
  disconnectKalshi: () => Promise<void>;
  
  // Polymarket
  polymarketCredentials: PolymarketCredentials | null;
  isPolymarketConnected: boolean;
  connectPolymarket: (credentials: PolymarketCredentials) => Promise<void>;
  disconnectPolymarket: () => Promise<void>;
  
  // Common
  user: User | null;
  session: Session | null;
  loading: boolean;
  activeProvider: Provider;
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

// Create a displayName for better debugging
TradingContext.displayName = 'TradingContext';

export const TradingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  console.log('TradingProvider initializing...');
  const [kalshiCredentials, setKalshiCredentials] = useState<KalshiCredentials | null>(null);
  const [polymarketCredentials, setPolymarketCredentials] = useState<PolymarketCredentials | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            loadCredentials(session.user.id);
          }, 0);
        } else {
          setKalshiCredentials(null);
          setPolymarketCredentials(null);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadCredentials(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadCredentials = async (userId: string) => {
    try {
      // Load Kalshi credentials
      const { data: kalshiData } = await supabase
        .from("user_kalshi_credentials")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (kalshiData) {
        setKalshiCredentials({
          apiKeyId: kalshiData.api_key_id,
          privateKey: kalshiData.private_key,
        });
      }

      // Load Polymarket credentials
      const { data: polymarketData } = await supabase
        .from("user_polymarket_credentials")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (polymarketData) {
        setPolymarketCredentials({
          walletAddress: polymarketData.wallet_address,
          apiKey: polymarketData.api_key,
          apiCredentials: polymarketData.api_credentials_key ? {
            apiKey: polymarketData.api_credentials_key,
            secret: polymarketData.api_credentials_secret,
            passphrase: polymarketData.api_credentials_passphrase,
          } : undefined,
        });
      }
    } catch (error) {
      console.error("Failed to load credentials:", error);
    }
  };

  const connectKalshi = async (creds: KalshiCredentials) => {
    if (!user) throw new Error("Must be logged in to save credentials");

    const { error } = await supabase
      .from("user_kalshi_credentials")
      .upsert({
        user_id: user.id,
        api_key_id: creds.apiKeyId,
        private_key: creds.privateKey,
      });

    if (error) throw error;
    setKalshiCredentials(creds);
  };

  const disconnectKalshi = async () => {
    if (!user) return;

    await supabase
      .from("user_kalshi_credentials")
      .delete()
      .eq("user_id", user.id);

    setKalshiCredentials(null);
  };

  const connectPolymarket = async (creds: PolymarketCredentials) => {
    if (!user) throw new Error("Must be logged in to save credentials");

    const { error } = await supabase
      .from("user_polymarket_credentials")
      .upsert({
        user_id: user.id,
        wallet_address: creds.walletAddress,
        api_key: creds.apiKey,
        api_credentials_key: creds.apiCredentials?.apiKey,
        api_credentials_secret: creds.apiCredentials?.secret,
        api_credentials_passphrase: creds.apiCredentials?.passphrase,
      });

    if (error) throw error;
    setPolymarketCredentials(creds);
  };

  const disconnectPolymarket = async () => {
    if (!user) return;

    await supabase
      .from("user_polymarket_credentials")
      .delete()
      .eq("user_id", user.id);

    setPolymarketCredentials(null);
  };

  // Determine active provider (prefer user's connected account, default to Polymarket)
  const activeProvider: Provider = kalshiCredentials ? 'kalshi' : polymarketCredentials ? 'polymarket' : 'polymarket';

  console.log('TradingProvider rendering with context:', { user: !!user, loading, isKalshiConnected: !!kalshiCredentials, isPolymarketConnected: !!polymarketCredentials });

  return (
    <TradingContext.Provider 
      value={{ 
        kalshiCredentials,
        isKalshiConnected: !!kalshiCredentials,
        connectKalshi,
        disconnectKalshi,
        polymarketCredentials,
        isPolymarketConnected: !!polymarketCredentials,
        connectPolymarket,
        disconnectPolymarket,
        user, 
        session, 
        loading,
        activeProvider,
      }}
    >
      {children}
    </TradingContext.Provider>
  );
};

export const useTrading = () => {
  const context = useContext(TradingContext);
  if (context === undefined) {
    console.error('useTrading was called outside of TradingProvider. Make sure TradingProvider wraps your component tree.');
    throw new Error("useTrading must be used within TradingProvider");
  }
  return context;
};

// Backwards compatibility exports
export const useKalshi = useTrading;
export { TradingProvider as KalshiProvider };
