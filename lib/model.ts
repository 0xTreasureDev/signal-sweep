// Signal model for the pre-token radar.
//
// Idea: a future token is priced like the equity of the protocol that would
// issue it. Comparable live tokens trade at very different FDV/TVL ratios
// depending on what the protocol actually does — a chain captures far more
// value per dollar of TVL than a passive curator vault — so the model starts
// from a category multiple, then moves it with the only momentum and
// durability signals the snapshot carries: 7-day TVL change and the number
// of years the protocol has already operated while recording no token.
//
//   multiple(category)          from the table in categoryMultiple()
//   growthFactor                1 + clamp(change_7d, -50, +80)/100 * 0.75
//   longevityFactor             0.72 + 0.28 * min(yearsLive, 4) / 4
//   breadthFactor               1 + min(extraChains, 5) * 0.03
//   implied_value_usd           round(TVL * multiple * growth * longevity * breadth)
//
// Unknown age counts as one year. No slug or name is ever special-cased.

export interface Proto {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snap {
  as_of: string; source: string; floor_usd: number;
  protocols: Proto[]; watchlist: string[];
}

const DAY = 86400000;

export function yearsLive(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const a = Date.parse(asOf + 'T00:00:00Z');
  const b = Date.parse(listedAt + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, (a - b) / DAY / 365.25);
}

/** FDV/TVL multiple for a category keyword; first matching row wins. */
export function categoryMultiple(category: string | null): number {
  const c = (category || 'uncategorised').toLowerCase();
  if (c === 'chain') return 2.2; // exact only: "Onchain Capital Allocator" is a curator, not a chain
  if (c.includes('dex') || c.includes('liquidity')) return 1.1;
  if (c.includes('payment')) return 1.3;
  if (c.includes('launchpad')) return 1.2;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) return 1.0;
  if (c.includes('bridge')) return 0.9;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 0.85;
  if (c.includes('insurance') || c.includes('privacy')) return 0.8;
  if (c.includes('rwa') || c.includes('real world')) return 0.7;
  if (c.includes('yield') || c.includes('farm') || c.includes('basis')) return 0.65;
  if (c.includes('staking') || c.includes('restaking') || c.includes('restak')) return 0.6;
  if (c.includes('curator') || c.includes('allocator') || c.includes('index')) return 0.55;
  if (c.includes('stable') || c.includes('algo')) return 0.5;
  return 0.65;
}

export interface Breakdown {
  multiple: number; growthFactor: number; longevityFactor: number;
  breadthFactor: number; years: number | null; implied: number;
}

export function scoreProtocol(p: Proto, asOf: string): Breakdown {
  const years = yearsLive(asOf, p.listed_at);
  const yrs = years === null ? 1 : years;
  const growthPct = Math.min(80, Math.max(-50, p.change_7d ?? 0));
  const growthFactor = 1 + (growthPct / 100) * 0.75;
  const longevityFactor = 0.72 + 0.28 * (Math.min(yrs, 4) / 4);
  const breadthFactor = 1 + Math.min(Math.max(p.chains.length - 1, 0), 5) * 0.03;
  const multiple = categoryMultiple(p.category);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthFactor * longevityFactor * breadthFactor));
  return { multiple, growthFactor, longevityFactor, breadthFactor, years, implied };
}

/** Pre-token means the record carries no token identifiers at all. */
export function recordsNoToken(p: Proto): boolean {
  return p.gecko_id === null && p.symbol === null;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Early rows must be plausible independent launches, not exchange books or version pools. */
export function isEarlyCandidate(p: Proto): boolean {
  return recordsNoToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

export const EARLY_TARGET = 170;

export function selectBoardProtocols(snap: Snap): Proto[] {
  const bySlug = new Map(snap.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, Proto>();
  for (const slug of snap.watchlist) {
    const p = bySlug.get(slug);
    if (p) chosen.set(slug, p);
  }
  const early = snap.protocols
    .filter((p) => !chosen.has(p.slug) && isEarlyCandidate(p) && p.tvl_usd < snap.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, EARLY_TARGET);
  for (const p of early) chosen.set(p.slug, p);
  return [...chosen.values()];
}

export function parseSnapshot(text: string): Snap {
  const raw = JSON.parse(text) as Snap;
  if (!raw || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot shape not recognised');
  }
  return raw;
}
