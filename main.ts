// Pre-token radar entrypoint (Node 22, standard library only).
// Reads the sealed snapshot, scores pre-token protocols with lib/model.ts,
// attaches farm plans from lib/farm.ts, then writes board.json, the
// dashboard data file, dashboard/, screenshots/ and dossier.json to /output.
// Local run: MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot, recordsNoToken, scoreProtocol, selectBoardProtocols } from './lib/model.ts';
import { buildFarmSteps } from './lib/farm.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const r4 = (n: number): number => Math.round(n * 10000) / 10000;

function argValue(name: string, fallback: string): string {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  const eq = process.argv.find((a) => a.startsWith('--' + name + '='));
  return eq ? eq.slice(name.length + 3) : fallback;
}

const inputArg = argValue('input', '/input');
const inputPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputPath)) {
  process.stderr.write('radar: missing snapshot at ' + inputPath + '\n');
  process.exit(2);
}
const outDir = argValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snap = parseSnapshot(readFileSync(inputPath, 'utf8'));
const watch = new Set(snap.watchlist);

const scored = selectBoardProtocols(snap).map((p) => {
  const b = scoreProtocol(p, snap.as_of);
  return { p, b, watchlist: watch.has(p.slug) };
});
scored.sort((a, z) => z.b.implied - a.b.implied || (a.p.slug < z.p.slug ? -1 : 1));

const rows = scored.map((s, i) => ({
  rank: i + 1,
  slug: s.p.slug,
  name: s.p.name,
  category: s.p.category,
  chains: s.p.chains,
  tvl_usd: s.p.tvl_usd,
  change_7d: s.p.change_7d,
  mcap_usd: s.p.mcap_usd,
  listed_at: s.p.listed_at,
  gecko_id: s.p.gecko_id,
  symbol: s.p.symbol,
  token_status: 'pre-token' as const,
  watchlist: s.watchlist,
  years_live: s.b.years === null ? null : r4(s.b.years),
  implied_value_usd: s.b.implied,
  model: {
    category_multiple: s.b.multiple,
    growth_factor: r4(s.b.growthFactor),
    longevity_factor: r4(s.b.longevityFactor),
    breadth_factor: r4(s.b.breadthFactor),
  },
  farm_steps: buildFarmSteps(s.p, s.b.years),
}));

// Fail closed on any gate-shaped problem before writing anything.
const slugs = new Set(rows.map((r) => r.slug));
for (const s of snap.watchlist) if (!slugs.has(s)) throw new Error('watchlist slug missing: ' + s);
rows.forEach((r, i) => {
  if (r.rank !== i + 1) throw new Error('rank sequence broken');
  if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) throw new Error('values not non-increasing');
  for (const step of r.farm_steps) {
    const t = step.trim();
    if (t.length < 20 || t.length > 600) throw new Error(r.slug + ' farm step length ' + t.length);
  }
});

const liveCount = snap.protocols.filter((p) => !recordsNoToken(p)).length;
const dashData = {
  as_of: snap.as_of,
  floor_usd: snap.floor_usd,
  protocol_count: snap.protocols.length,
  watchlist_count: snap.watchlist.length,
  board_count: rows.length,
  early_count: rows.filter((r) => !r.watchlist).length,
  live_count: liveCount,
  formula: 'implied = TVL x category multiple x growth factor x longevity factor x breadth factor',
  rows: rows.map((r) => ({
    rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains,
    tvl_usd: r.tvl_usd, change_7d: r.change_7d, listed_at: r.listed_at,
    years_live: r.years_live, watchlist: r.watchlist,
    implied_value_usd: r.implied_value_usd, model: r.model, farm_steps: r.farm_steps,
  })),
};

function copyTree(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const done: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, name));
    done.push(name);
  }
  return done;
}

mkdirSync(join(outDir, 'dashboard'), { recursive: true });
writeFileSync(join(outDir, 'board.json'), JSON.stringify({ rows }) + '\n');
// data.js sits beside dashboard/ in /output (the page loads ../data.js), so the
// dashboard source itself stays small enough for the dossier to show whole.
writeFileSync(join(outDir, 'data.js'), 'window.RADAR_DATA=' + JSON.stringify(dashData) + ';\n');
copyTree(join(root, 'dashboard'), join(outDir, 'dashboard'));
const shots = copyTree(join(root, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write('radar: need 3 screenshots, found ' + shots.length + '\n');
  process.exit(1);
}
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: 65536 }));
process.stdout.write('radar: ' + rows.length + ' rows (' + dashData.early_count + ' early, ' + liveCount + ' live-token set aside), top ' + rows[0]!.slug + ' $' + rows[0]!.implied_value_usd + '\n');
