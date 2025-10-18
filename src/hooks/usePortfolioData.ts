import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

interface PortfolioData {
  positions: Position[];
  summary: PortfolioSummary;
  balance?: number;
}

export function usePolymarketPortfolio(userId: string | undefined, isConnected: boolean) {
  return useQuery({
    queryKey: ['polymarket-portfolio', userId],
    queryFn: async (): Promise<PortfolioData> => {
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
        throw new Error(`Failed to fetch portfolio: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      return {
        positions: data.positions || [],
        summary: data.summary || {
          totalValue: 0,
          totalPnl: 0,
          totalRealizedPnl: 0,
          activePositions: 0,
          totalInvested: 0,
        },
      };
    },
    enabled: !!userId && isConnected,
    staleTime: 20 * 1000, // 20 seconds for portfolio data
  });
}

export function useKalshiPortfolio(userId: string | undefined, isConnected: boolean, credentials: any) {
  return useQuery({
    queryKey: ['kalshi-portfolio', userId],
    queryFn: async (): Promise<PortfolioData> => {
      const { data, error } = await supabase.functions.invoke('kalshi-portfolio', {
        body: credentials,
      });

      if (error) {
        throw error;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      return {
        positions: data.positions || [],
        summary: data.summary || {
          totalValue: 0,
          totalPnl: 0,
          totalRealizedPnl: 0,
          activePositions: 0,
          totalInvested: 0,
        },
        balance: data.balance || 0,
      };
    },
    enabled: !!userId && isConnected && !!credentials,
    staleTime: 20 * 1000, // 20 seconds for portfolio data
  });
}
