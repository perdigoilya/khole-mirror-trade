-- Create table for followed Twitter accounts
CREATE TABLE public.followed_twitter_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_username TEXT NOT NULL UNIQUE,
  twitter_user_id TEXT,
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for storing fetched tweets
CREATE TABLE public.twitter_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tweet_id TEXT NOT NULL UNIQUE,
  author_username TEXT NOT NULL,
  author_name TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  category TEXT,
  relevant BOOLEAN DEFAULT false,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.followed_twitter_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twitter_feed ENABLE ROW LEVEL SECURITY;

-- Public read access for both tables
CREATE POLICY "Anyone can view followed accounts"
  ON public.followed_twitter_accounts
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view tweets"
  ON public.twitter_feed
  FOR SELECT
  USING (true);

-- Enable realtime for twitter_feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.twitter_feed;

-- Create index for faster queries
CREATE INDEX idx_twitter_feed_created_at ON public.twitter_feed(created_at DESC);
CREATE INDEX idx_twitter_feed_author ON public.twitter_feed(author_username);