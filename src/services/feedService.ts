import { supabase } from '@/integrations/supabase/client';
import { apiClient } from './apiClient';
import type { Tweet, TwitterAccount, RelatedMarket } from '@/types/feed';

/**
 * Service for Feed/Twitter operations
 */
class FeedService {
  /**
   * Fetch tweets from database
   */
  async fetchTweets(filterCategory: string = 'all') {
    let query = supabase.from('twitter_feed')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filterCategory !== 'all') {
      query = query.eq('category', filterCategory);
    }

    const { data, error } = await query;
    return { tweets: (data || []) as Tweet[], error };
  }

  /**
   * Fetch followed Twitter accounts
   */
  async fetchFollowedAccounts() {
    const { data, error } = await supabase.from('followed_twitter_accounts')
      .select('*')
      .order('twitter_username', { ascending: true });

    return { accounts: (data || []) as TwitterAccount[], error };
  }

  /**
   * Add a new Twitter account to follow
   */
  async addAccount(username: string, displayName?: string) {
    const { error } = await supabase.from('followed_twitter_accounts')
      .insert([{
        twitter_username: username.trim().replace('@', ''),
        display_name: displayName?.trim() || username.trim(),
        account_category: 'General'
      }]);

    return { error };
  }

  /**
   * Remove a Twitter account
   */
  async removeAccount(id: string) {
    const { error } = await supabase.from('followed_twitter_accounts')
      .delete()
      .eq('id', id);

    return { error };
  }

  /**
   * Trigger Twitter feed refresh
   */
  async refreshFeed() {
    return await apiClient.invoke('twitter-fetch');
  }

  /**
   * Search for related markets based on text
   */
  async searchRelatedMarkets(text: string, provider: 'kalshi' | 'polymarket' | 'both' = 'both') {
    const { data, error } = await apiClient.invoke('search-related-markets', {
      text,
      provider,
    });

    return { markets: data?.markets as RelatedMarket[] || [], error };
  }

  /**
   * Subscribe to realtime tweet updates
   */
  subscribeToTweets(callback: () => void) {
    const channel = supabase.channel('twitter_feed_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'twitter_feed'
        },
        callback
      )
      .subscribe();

    return channel;
  }

  /**
   * Unsubscribe from realtime updates
   */
  unsubscribe(channel: any) {
    supabase.removeChannel(channel);
  }
}

export const feedService = new FeedService();
