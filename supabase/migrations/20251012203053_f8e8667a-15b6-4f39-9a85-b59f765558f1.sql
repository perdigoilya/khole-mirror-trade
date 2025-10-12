-- Drop the existing 15-min cron job
SELECT cron.unschedule('fetch-twitter-feed-every-15min');

-- Create a new cron job that runs every minute
SELECT cron.schedule(
  'fetch-twitter-feed-every-minute',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
        url:='https://pxzwzayroweafcroouvc.supabase.co/functions/v1/twitter-fetch',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4end6YXlyb3dlYWZjcm9vdXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMjM2MTAsImV4cCI6MjA3NTU5OTYxMH0.TKmW_GSqILBkBX2cs5Wn86sUyRJy_kpOzrSvLcwNTY0"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Clear existing accounts and add only 15 reliable news sources
TRUNCATE TABLE followed_twitter_accounts;

INSERT INTO followed_twitter_accounts (twitter_username, display_name, account_category) VALUES
  ('Reuters', 'Reuters', 'Breaking News'),
  ('AP', 'Associated Press', 'Breaking News'),
  ('BBCBreaking', 'BBC Breaking News', 'Breaking News'),
  ('CNN', 'CNN', 'Breaking News'),
  ('Bloomberg', 'Bloomberg', 'Financial News'),
  ('CNBC', 'CNBC', 'Financial News'),
  ('WSJ', 'Wall Street Journal', 'Financial News'),
  ('FT', 'Financial Times', 'Financial News'),
  ('TheEconomist', 'The Economist', 'Economic News'),
  ('politico', 'Politico', 'Political News'),
  ('axios', 'Axios', 'Breaking News'),
  ('business', 'Bloomberg Business', 'Business News'),
  ('Financialjuice', 'Financial Juice', 'Financial News'),
  ('DeItaone', 'Walter Bloomberg', 'Financial News'),
  ('Spectatorindex', 'Spectator Index', 'Global News');