-- Add last_fetched_at column to track when each account was last checked
ALTER TABLE followed_twitter_accounts 
ADD COLUMN IF NOT EXISTS last_fetched_at TIMESTAMPTZ;

-- Add index for faster sorting by last_fetched_at
CREATE INDEX IF NOT EXISTS idx_followed_twitter_accounts_last_fetched 
ON followed_twitter_accounts(last_fetched_at NULLS FIRST);