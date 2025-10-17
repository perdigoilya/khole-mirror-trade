import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { eventTicker } = await req.json();
    
    if (!eventTicker) {
      return new Response(
        JSON.stringify({ error: 'Event ticker is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Kalshi Event Detail] Fetching event: ${eventTicker}`);

    const baseUrls = [
      'https://api.elections.kalshi.com',
      'https://api.kalshi.com'
    ];

    let eventData = null;
    let lastError = '';

    // Fetch event details with markets
    for (const base of baseUrls) {
      const url = `${base}/trade-api/v2/events/${eventTicker}`;
      console.log('[Kalshi Event Detail] Trying endpoint:', url);
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        eventData = await response.json();
        console.log(`[Kalshi Event Detail] Successfully fetched event from ${base}`);
        break;
      } else {
        lastError = await response.text();
        console.log(`[Kalshi Event Detail] Failed ${base}:`, response.status, lastError);
      }
    }

    if (!eventData || !eventData.event) {
      console.error('[Kalshi Event Detail] Failed to fetch event:', lastError);
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const event = eventData.event;
    
    // Now fetch all markets for this event
    let marketsData = null;
    for (const base of baseUrls) {
      const url = `${base}/trade-api/v2/markets?event_ticker=${eventTicker}&status=open&limit=200`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        marketsData = await response.json();
        break;
      }
    }

    const markets = (marketsData?.markets || []).map((m: any) => {
      const toCents = (num: unknown, dollars: unknown): number | null => {
        if (typeof num === 'number' && !isNaN(num)) return Math.round(num);
        if (typeof dollars === 'string') {
          const f = parseFloat(dollars);
          if (!isNaN(f)) return Math.round(f * 100);
        }
        return null;
      };

      const lastPrice = toCents(m.last_price, m.last_price_dollars);
      const yesAsk = toCents(m.yes_ask, m.yes_ask_dollars);
      const yesBid = toCents(m.yes_bid, m.yes_bid_dollars);

      let yesPrice = lastPrice;
      if (yesPrice === null && yesAsk !== null && yesBid !== null) yesPrice = Math.round((yesAsk + yesBid) / 2);
      if (yesPrice === null && yesAsk !== null) yesPrice = yesAsk;
      if (yesPrice === null && yesBid !== null) yesPrice = yesBid;
      if (yesPrice === null) yesPrice = 50;

      const volume24h = typeof m.volume_24h === 'number' ? m.volume_24h : (typeof m.volume === 'number' ? m.volume : 0);
      const liquidityDollars = m.liquidity_dollars ? parseFloat(m.liquidity_dollars) : 0;

      return {
        ticker: m.ticker,
        title: m.title,
        subtitle: m.subtitle,
        yesPrice,
        noPrice: 100 - yesPrice,
        volume: volume24h > 0 ? `${volume24h.toLocaleString('en-US')} contracts` : '$0',
        liquidity: liquidityDollars > 0 ? `$${liquidityDollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '$0',
        volumeRaw: volume24h,
        liquidityRaw: liquidityDollars,
        category: m.category || 'General',
        endDate: m.close_time || m.expiration_time,
        status: m.status || 'open',
        rules_primary: m.rules_primary || '',
        rules_secondary: m.rules_secondary || '',
      };
    }).sort((a: any, b: any) => b.volumeRaw - a.volumeRaw);

    const totalVolume = markets.reduce((sum: number, m: any) => sum + m.volumeRaw, 0);
    const totalLiquidity = markets.reduce((sum: number, m: any) => sum + m.liquidityRaw, 0);

    // Fetch event metadata for image
    let eventImage: string | null = null;
    for (const base of baseUrls) {
      const metaUrl = `${base}/trade-api/v2/events/${eventTicker}/metadata`;
      const metaResp = await fetch(metaUrl, { headers: { 'Accept': 'application/json' } });
      if (metaResp.ok) {
        const metadata = await metaResp.json();
        eventImage = metadata?.image_url || null;
        console.log(`[Kalshi Event Detail] Event image: ${eventImage}`);
        break;
      }
    }

    // Choose headline market (most liquid/volume) and get its rules
    const headline = markets[0];
    const rulesCombined = [headline?.rules_primary, headline?.rules_secondary].filter(Boolean).join('\n\n');

    return new Response(
      JSON.stringify({
        event: {
          eventTicker: event.event_ticker,
          title: event.title,
          subtitle: event.sub_title,
          category: event.category || 'General',
          rules: rulesCombined || 'No rules available for this event',
          description: event.sub_title || event.title,
          image: eventImage,
          headlineTicker: headline?.ticker || null,
          totalVolume: totalVolume > 0 ? `${totalVolume.toLocaleString()} contracts` : '$0',
          totalLiquidity: totalLiquidity > 0 ? `$${totalLiquidity.toLocaleString()}` : '$0',
          markets,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Kalshi Event Detail] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
