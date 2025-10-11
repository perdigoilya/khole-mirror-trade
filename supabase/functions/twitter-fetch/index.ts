import { createHmac } from "node:crypto";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_KEY = Deno.env.get("TWITTER_API_KEY")?.trim();
const API_SECRET = Deno.env.get("TWITTER_API_KEY_SECRET")?.trim();
const ACCESS_TOKEN = Deno.env.get("TWITTER_ACCESS_TOKEN")?.trim();
const ACCESS_TOKEN_SECRET = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET")?.trim();
const BEARER_TOKEN = Deno.env.get("TWITTER_BEARER_TOKEN")?.trim();

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const signatureBaseString = `${method}&${encodeURIComponent(
    url
  )}&${encodeURIComponent(
    Object.entries(params)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join("&")
  )}`;
  const signingKey = `${encodeURIComponent(
    consumerSecret
  )}&${encodeURIComponent(tokenSecret)}`;
  const hmacSha1 = createHmac("sha1", signingKey);
  const signature = hmacSha1.update(signatureBaseString).digest("base64");
  return signature;
}

function generateOAuthHeader(method: string, url: string): string {
  const parsed = new URL(url);
  const baseUrl = `${parsed.origin}${parsed.pathname}`;

  const oauthParams = {
    oauth_consumer_key: API_KEY!,
    oauth_nonce: Math.random().toString(36).substring(2),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN!,
    oauth_version: "1.0",
  };

  // Include query parameters in the signature params for OAuth 1.0a
  const queryParams: Record<string, string> = {};
  for (const [k, v] of parsed.searchParams.entries()) {
    queryParams[k] = v;
  }

  const signatureParams = { ...oauthParams, ...queryParams } as Record<string, string>;

  const signature = generateOAuthSignature(
    method,
    baseUrl,
    signatureParams,
    API_SECRET!,
    ACCESS_TOKEN_SECRET!
  );

  const signedOAuthParams = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const entries = Object.entries(signedOAuthParams).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  return (
    "OAuth " +
    entries
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(", ")
  );
}

interface TwitterUser {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
}

interface TwitterTweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    impression_count?: number;
  };
}

interface TwitterResponse {
  data?: TwitterTweet[];
  includes?: {
    users?: TwitterUser[];
  };
}

async function getUserByUsername(username: string): Promise<string> {
  const cleanUsername = username.replace('@', '');
  const url = `https://api.x.com/2/users/by/username/${cleanUsername}`;
  
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (BEARER_TOKEN) {
    headers["Authorization"] = `Bearer ${BEARER_TOKEN}`;
  } else {
    headers["Authorization"] = generateOAuthHeader("GET", url);
  }

  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error fetching user ID for @${username}: ${response.status} ${errorText}`);
    throw new Error(`Twitter API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data.id;
}

async function fetchUserTimeline(username: string, userId?: string): Promise<TwitterResponse> {
  // Get user ID if not provided
  if (!userId) {
    userId = await getUserByUsername(username);
  }

  const url = `https://api.x.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,author_id,public_metrics&expansions=author_id&user.fields=name,username,profile_image_url`;

  console.log(`Fetching tweets for @${username} (ID: ${userId})`);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (BEARER_TOKEN) {
    headers["Authorization"] = `Bearer ${BEARER_TOKEN}`;
  } else {
    headers["Authorization"] = generateOAuthHeader("GET", url);
  }

  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Twitter API error for @${username}: ${response.status} ${errorText}`);
    throw new Error(`Twitter API error: ${response.status}`);
  }

  return await response.json();
}

// Helper to add delay between requests
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get list of followed accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('followed_twitter_accounts')
      .select('*');

    if (accountsError) {
      console.error('Error fetching accounts:', accountsError);
      throw accountsError;
    }

    console.log(`Found ${accounts?.length || 0} Twitter accounts to fetch`);

    let totalTweetsFetched = 0;

    // Fetch tweets from each account with rate limiting
    for (const account of accounts || []) {
      try {
        const twitterData = await fetchUserTimeline(
          account.twitter_username,
          account.twitter_user_id || undefined
        );
        
        if (!twitterData.data) {
          console.log(`No tweets found for @${account.twitter_username}`);
          continue;
        }

        const tweets = twitterData.data;
        const users = twitterData.includes?.users || [];
        const userMap = new Map(users.map((u) => [u.id, u]));

        // Insert tweets into database
        for (const tweet of tweets) {
          const author = userMap.get(tweet.author_id);
          const metrics = tweet.public_metrics || {};
          
          const { error: insertError } = await supabase
            .from('twitter_feed')
            .upsert({
              tweet_id: tweet.id,
              author_username: account.twitter_username,
              author_name: author?.name || account.display_name,
              text: tweet.text,
              created_at: tweet.created_at,
              category: 'Market News',
              likes_count: metrics.like_count || 0,
              retweets_count: metrics.retweet_count || 0,
              views_count: metrics.impression_count || 0,
              profile_image_url: author?.profile_image_url,
            }, {
              onConflict: 'tweet_id',
              ignoreDuplicates: true
            });

          if (!insertError) {
            totalTweetsFetched++;
          }
        }

        console.log(`Fetched ${tweets.length} tweets from @${account.twitter_username}`);
        
        // Add 1 second delay between accounts to respect rate limits
        await delay(1000);
      } catch (error) {
        console.error(`Error fetching tweets for @${account.twitter_username}:`, error);
        // Add delay even on error to avoid hammering the API
        await delay(1000);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Fetched ${totalTweetsFetched} new tweets from ${accounts?.length || 0} accounts` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in twitter-fetch function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
