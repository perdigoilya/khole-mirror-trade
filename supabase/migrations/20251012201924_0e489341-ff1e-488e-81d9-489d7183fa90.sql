-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a cron job to fetch Twitter data every hour
-- This runs at 15 minutes past every hour to spread out API usage
SELECT cron.schedule(
  'fetch-twitter-feed-hourly',
  '15 * * * *', -- At 15 minutes past every hour
  $$
  SELECT
    net.http_post(
        url:='https://pxzwzayroweafcroouvc.supabase.co/functions/v1/twitter-fetch',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4end6YXlyb3dlYWZjcm9vdXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMjM2MTAsImV4cCI6MjA3NTU5OTYxMH0.TKmW_GSqILBkBX2cs5Wn86sUyRJy_kpOzrSvLcwNTY0"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);