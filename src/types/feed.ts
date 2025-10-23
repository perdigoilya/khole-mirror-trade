import { Market } from './market';

export interface Tweet {
  id: string;
  tweet_id: string;
  text: string;
  author_username: string;
  author_name: string;
  created_at: string;
  category: string;
  profile_image_url?: string;
  likes_count?: number;
  retweets_count?: number;
  views_count?: number;
  relevant?: boolean;
  fetched_at?: string;
  // Aliases for backwards compatibility
  title?: string;
  source?: string;
  username?: string;
  timestamp?: string;
  profileImage?: string;
  likes?: number;
  retweets?: number;
  views?: number;
}

export interface TwitterAccount {
  id: string;
  twitter_username: string;
  display_name?: string;
  profile_image_url?: string;
  twitter_user_id?: string;
  account_category?: string;
  last_fetched_at?: string;
}

export interface FeedData {
  tweets: Tweet[];
  categories: string[];
  lastUpdate: Date | null;
}

export type RelatedMarket = Market;
