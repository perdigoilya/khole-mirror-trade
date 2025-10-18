import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useWatchlist(userId: string | undefined) {
  return useQuery({
    queryKey: ['watchlist', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', userId)
        .order('added_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(item => {
        const marketData = item.market_data as any || {};
        return {
          id: item.market_id || item.market_ticker,
          dbId: item.id,
          title: marketData.title || item.market_title,
          yesPrice: marketData.yesPrice || 50,
          noPrice: marketData.noPrice || 50,
          volume: marketData.volume || '$0',
          liquidity: marketData.liquidity || '$0',
          endDate: marketData.endDate || 'TBD',
          category: marketData.category || 'Other',
          provider: marketData.provider || 'polymarket',
          trend: marketData.trend || 'up',
          change: marketData.change || 0,
          image: marketData.image,
          description: marketData.description,
          volumeRaw: marketData.volumeRaw || 0,
          liquidityRaw: marketData.liquidityRaw || 0
        };
      });
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds for watchlist
  });
}
