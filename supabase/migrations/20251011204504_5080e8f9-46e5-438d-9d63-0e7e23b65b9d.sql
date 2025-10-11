-- Create function to update timestamps if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add engagement metrics and profile picture to twitter_feed
ALTER TABLE public.twitter_feed 
ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS retweets_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- Add category to followed_twitter_accounts
ALTER TABLE public.followed_twitter_accounts 
ADD COLUMN IF NOT EXISTS account_category TEXT DEFAULT 'General';

-- Create table for Polymarket credentials
CREATE TABLE IF NOT EXISTS public.user_polymarket_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on Polymarket credentials
ALTER TABLE public.user_polymarket_credentials ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for Polymarket credentials
CREATE POLICY "Users can view their own Polymarket credentials"
ON public.user_polymarket_credentials
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Polymarket credentials"
ON public.user_polymarket_credentials
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Polymarket credentials"
ON public.user_polymarket_credentials
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Polymarket credentials"
ON public.user_polymarket_credentials
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates on Polymarket credentials
CREATE TRIGGER update_polymarket_credentials_updated_at
BEFORE UPDATE ON public.user_polymarket_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();