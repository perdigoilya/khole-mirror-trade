-- Add profile image URL to followed Twitter accounts
ALTER TABLE public.followed_twitter_accounts
ADD COLUMN IF NOT EXISTS profile_image_url text;