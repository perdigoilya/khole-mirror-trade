import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface NewsItem {
  id: string;
  tweet_id: string;
  title: string;
  source: string;
  username: string;
  timestamp: string;
  category: string;
  profileImage?: string;
  likes?: number;
  retweets?: number;
  views?: number;
  relevant?: boolean;
}

const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
};

export function useTweets(filterCategory: string = 'all') {
  return useQuery({
    queryKey: ['tweets', filterCategory],
    queryFn: async (): Promise<{ tweets: NewsItem[], categories: string[], lastUpdate: Date | null }> => {
      let query = supabase
        .from('twitter_feed')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filterCategory !== "all") {
        query = query.eq('category', filterCategory);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedTweets = (data || []).map(tweet => ({
        id: tweet.id,
        tweet_id: tweet.tweet_id,
        title: tweet.text,
        source: tweet.author_name || `@${tweet.author_username}`,
        username: tweet.author_username,
        timestamp: formatTimestamp(tweet.created_at),
        category: tweet.category || 'Market News',
        profileImage: tweet.profile_image_url,
        likes: tweet.likes_count || 0,
        retweets: tweet.retweets_count || 0,
        views: tweet.views_count || 0,
        relevant: tweet.relevant || false,
      }));

      const uniqueCategories = [...new Set(data?.map(t => t.category).filter(Boolean) || [])];

      const latestFetchedAt = data
        ?.map((t: any) => t.fetched_at ? new Date(t.fetched_at as string) : null)
        .filter(Boolean)
        .sort((a: any, b: any) => b.getTime() - a.getTime())[0] as Date | undefined;

      return {
        tweets: formattedTweets,
        categories: uniqueCategories as string[],
        lastUpdate: latestFetchedAt || null,
      };
    },
    staleTime: 30 * 1000, // 30 seconds for feed data
    refetchInterval: 60 * 1000, // Auto-refetch every minute
  });
}

export function useFollowedAccounts() {
  return useQuery({
    queryKey: ['followed-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('followed_twitter_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000, // 1 minute for followed accounts
  });
}
