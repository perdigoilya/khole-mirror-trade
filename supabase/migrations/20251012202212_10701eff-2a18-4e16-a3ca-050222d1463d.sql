-- Drop the existing hourly cron job
SELECT cron.unschedule('fetch-twitter-feed-hourly');

-- Create a new cron job that runs every 15 minutes
SELECT cron.schedule(
  'fetch-twitter-feed-every-15min',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT
    net.http_post(
        url:='https://pxzwzayroweafcroouvc.supabase.co/functions/v1/twitter-fetch',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4end6YXlyb3dlYWZjcm9vdXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMjM2MTAsImV4cCI6MjA3NTU5OTYxMH0.TKmW_GSqILBkBX2cs5Wn86sUyRJy_kpOzrSvLcwNTY0"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);