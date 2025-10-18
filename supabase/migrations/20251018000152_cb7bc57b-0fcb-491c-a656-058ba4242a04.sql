-- Add environment column to user_kalshi_credentials to distinguish demo vs live
ALTER TABLE public.user_kalshi_credentials
ADD COLUMN IF NOT EXISTS environment text CHECK (environment IN ('demo','live'));

-- No changes to RLS needed; existing policies already restrict by user_id
