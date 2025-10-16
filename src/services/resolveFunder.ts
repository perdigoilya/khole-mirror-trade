// services/resolveFunder.ts
// Resolve the best funder (proxy) for a given EOA on Polygon (137)
// Note: This runs client-side; for server-side, mirror this logic in an Edge Function if needed.

async function hasPolyValueOrPositions(addr: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const v = await fetcher(`https://data-api.polymarket.com/value?user=${addr}`);
    if (v.ok) {
      const data = await v.json();
      // API often returns an array [{ user, value }] but can also return an object
      const value = Array.isArray(data) ? Number(data?.[0]?.value) : Number((data as any)?.value);
      if (Number.isFinite(value) && value > 0) return true;
    }
  } catch {}

  try {
    const p = await fetcher(`https://data-api.polymarket.com/positions?user=${addr}`);
    if (p.ok) {
      const pos = await p.json();
      if (Array.isArray(pos) && pos.length > 0) return true;
    }
  } catch {}

  return false;
}

export async function resolveFunder(eoa: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  // 1) Try Safe Client API (browser-wallet users usually have a Safe proxy)
  try {
    const safeRes = await fetcher(`https://safe-client.safe.global/v1/chains/137/owners/${eoa}/safes`);
    if (safeRes.ok) {
      const data = await safeRes.json(); // { safes: ["0xProxy...", ...] }
      const candidate = data?.safes?.[0];
      if (candidate && await hasPolyValueOrPositions(candidate, fetcher)) return candidate;
    }
  } catch {}

  // 2) Try EOA directly (rare direct-EOA trading)
  try {
    if (await hasPolyValueOrPositions(eoa, fetcher)) return eoa;
  } catch {}

  // 3) Give up -> UI should show a paste-and-verify wizard
  return null;
}
