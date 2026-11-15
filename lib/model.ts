// Token Launch Radar — the valuation model.
//
// One sealed snapshot of the protocol universe in, one ranked board out.
// The board ranks every protocol in the snapshot that records no token and
// is not a wrapped, staked or bridged product of a token that already trades
// (the watchlist is the floor; the radar also covers the rankable protocols
// below it). Tokenized protocols are kept apart and shown at the market's
// own value, never mixed into the ranked board.
//
// THE MODEL (peer multiples, computed from the snapshot itself — no name is
// ever special-cased and no multiple is hard-coded):
//
//   peer multiple  = median(mcap_usd / tvl_usd) over the tokenized protocols
//                    in the same DefiLlama category — but only when at least
//                    three tokenized peers set it; with fewer, the global
//                    median over all tokenized protocols applies instead, so
//                    no single outlier (one peer at 400x) sets a category.
//                    Clamped to [0.05, 1.50].
//   base           = tvl_usd x peer multiple
//   growth factor  = 1 + 0.6 x clamp(change_7d, -50, +100) / 100
//                    (a protocol growing 100% in a week scores 1.60x;
//                     one down 50% scores 0.70x)
//   tenure factor  = 0.85 + 0.30 x min(age_days, 1460) / 1460
//                    (age since DefiLlama first tracked it; a four-year
//                    track record with no token yet scores 1.15x, a new
//                    listing 0.85x; unknown listing date scores 1.00)
//   chains factor  = 1 + 0.03 x min(chains - 1, 5)
//                    (each extra chain up to five adds 3%: wider reach)
//   implied value  = round(base x growth x tenure x chains), at least $1
//
// "Records no token" is DefiLlama's record, not a proof: a protocol on the
// board may still have a token its record does not carry. The implied value
// is this entry's own claim about what a launch would be worth if the
// protocol's record stayed as it is — it does not predict whether or when
// a token is issued.

/** One protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants. The dashboard prints them; the page may not change them. */
export interface ModelConstants {
  multiple_floor: number;
  multiple_cap: number;
  min_peers: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  tenure_floor: number;
  tenure_range: number;
  tenure_days: number;
  chain_step: number;
  chain_max_extra: number;
}

export const MODEL: ModelConstants = {
  multiple_floor: 0.05,
  multiple_cap: 1.5,
  min_peers: 3,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  tenure_floor: 0.85,
  tenure_range: 0.3,
  tenure_days: 1460,
  chain_step: 0.03,
  chain_max_extra: 5,
};

/** The model's version label, printed by the dashboard. */
export const MODEL_VERSION = 'peer-multiple-1';

/** How many tokenized protocols the dashboard's "market yardstick" table shows. */
export const LIVE_ROWS = 12;

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  watchlist: boolean;
  implied_value_usd: number;
  peer_multiple: number;
  growth_factor: number;
  tenure_factor: number;
  chains_factor: number;
  why: string;
  farm_steps: string[];
}

/** One compact dashboard row: [rank, slug, name, category, chains, tvl, chg7d, age, implied, peerMult, growthF, tenureF, chainsF, watchlist]. */
export type RadarRow = [
  number,
  string,
  string,
  string | null,
  string,
  number,
  number | null,
  number | null,
  number,
  number,
  number,
  number,
  number,
  0 | 1,
];

/** One tokenized protocol for the yardstick table: [name, category, tvl, mcap, multiple]. */
export type LiveRow = [string, string | null, number, number, number];

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  peer_global: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The peer multiple for each category: the median mcap/TVL of the tokenized
 * protocols in that category, clamped to the model's band — but only where
 * at least `min_peers` tokenized protocols set it; thinner categories fall
 * back to the global median, so one outlier peer cannot set a category.
 * Computed from the snapshot on every run — nothing about any category is
 * assumed.
 */
export function peerMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, number>; global: number } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    if (p.category !== null) {
      const list = byCategory.get(p.category) ?? [];
      list.push(ratio);
      byCategory.set(p.category, list);
    }
  }
  const global = clamp(all.length > 0 ? median(all) : 0.2, model.multiple_floor, model.multiple_cap);
  const out = new Map<string, number>();
  for (const [category, ratios] of byCategory) {
    if (ratios.length < model.min_peers) continue;
    out.set(category, round4(clamp(median(ratios), model.multiple_floor, model.multiple_cap)));
  }
  return { byCategory: out, global: round4(global) };
}

/** The four factors and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  peerMultiple: number,
  model: ModelConstants = MODEL,
): { implied: number; growthFactor: number; tenureFactor: number; chainsFactor: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthFactor = 1 + model.growth_weight * (growthPct / 100);
  const tenureFactor = age === null ? 1 : model.tenure_floor + model.tenure_range * (Math.min(age, model.tenure_days) / model.tenure_days);
  const chainsFactor = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max_extra);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * peerMultiple * growthFactor * tenureFactor * chainsFactor));
  return { implied, growthFactor: round4(growthFactor), tenureFactor: round4(tenureFactor), chainsFactor: round4(chainsFactor), age };
}

/** Whether a protocol's record carries no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A whole word wrapped, staked or staking anywhere in a name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name that begins with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped,
 * staked or bridged product of a token that already trades. This is the
 * watchlist's own exclusion rule, applied to the whole board: WBTC is
 * Bitcoin on Ethereum, Binance staked ETH is ETH in Binance's staking
 * product, and neither is a protocol still waiting on a launch of its own.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !WRAPPED_CATEGORIES.has(p.category ?? '') &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !VERSIONED.test(p.name)
  );
}

/** A whole-dollar amount with commas: 1234567 -> "1,234,567". */
export function commas(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A short dollar amount: 1,234,567,890 -> "$1.23B", 45,000 -> "$45.0K". */
export function shortUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The hold window in days, from the protocol's age: younger protocols get longer. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/**
 * The category's one core action, in words a farmer can follow. The table is
 * by category wording, never by protocol name: the same rule scores every row.
 */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateralized')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} as a lender and leave the deposit earning.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`;
  }
  if (c.includes('yield') || c.includes('yield aggregator')) {
    return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and hold the vault shares.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the bridged funds inside its app.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and keep it parked.`;
  }
  if (c.includes('prediction')) {
    return `Fund ${name} with $${capital} and take one position in an open market.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  if (c.includes('farm')) {
    return `Deposit $${capital} of USDC into ${name}'s main farm on ${chain} and keep it staked.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with its cost and its
 * time. Every step is derived from the protocol's own record (category,
 * chains, TVL, age) — never from a hand-written list of names.
 *
 * NOTE: dashboard/app.js carries the same six steps (farmStepsFor) so the
 * page can render a plan from the compact data.js. Keep the two in step:
 * tools/verify-steps.mjs checks every row's plan matches board.json.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 250 ? 8 : 4;
  const steps = [
    `Open a fresh wallet that will only hold this farm's funds, and write its recovery phrase on paper kept offline, never in a screenshot or a chat. Cost: nothing to create, about $2 of gas for the first transaction. Time: 10 minutes to set up.`,
    `${actionFor(p, capital, chain)} Cost: $${capital} of capital plus about $${gas} of gas. Time: 15 minutes to set up.`,
    `Come back once a week and do one real action — a deposit, a swap, a borrow, a vote or a claim — so the wallet reads as an active user rather than a one-off deposit. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Leave the position untouched for at least ${hold} days so the activity is counted across more than one snapshot. Cost: the $${capital} stays locked in the position. Time: ${hold} days.`,
    `Once a month, open the protocol's own rewards or points page from its official site or docs and check this wallet's standing; never connect the wallet from a link in a DM or a reply. Cost: nothing to check, and never pay to claim. Time: 10 minutes.`,
    `Keep a one-page farm log — wallet address, dates, amounts and transaction hashes — and only unwind after the position has aged past the hold window, since withdrawing early can erase the activity that counted. Cost: nothing but the log. Time: 5 minutes.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 597)}...` : s));
}

/** One sentence saying why a row ranks where it does, from its own figures. */
export function whyLine(p: SnapshotProtocol, age: number | null, peerMultiple: number, boardSize: number, tvlRank: number): string {
  const parts: string[] = [];
  parts.push(tvlRank <= 10 ? `Top-10 TVL among the ${boardSize} pre-token protocols on this board` : tvlRank <= 50 ? `Top-50 TVL among the ${boardSize} pre-token protocols on this board` : `$${commas(p.tvl_usd)} of TVL`);
  if (p.change_7d !== null && p.change_7d > 0) parts.push(`TVL up ${p.change_7d.toFixed(1)}% in 7 days`);
  else if (p.change_7d !== null && p.change_7d < 0) parts.push(`TVL down ${Math.abs(p.change_7d).toFixed(1)}% in 7 days`);
  if (age !== null && age >= 365) parts.push(`tracked for ${Math.floor(age / 365)}y ${Math.floor((age % 365) / 30)}mo with no token recorded`);
  else if (age !== null) parts.push(`tracked for ${age} days with no token recorded`);
  else parts.push('no listing date recorded');
  parts.push(`its category's peer multiple is ${peerMultiple.toFixed(2)}x TVL`);
  return `${parts.join('; ')}.`;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot
  // no longer carries (it cannot, but coverage is the gate's row and is
  // never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL.
  // The floor is never the whole board: below-floor protocols are the radar's
  // reason to exist, and above-floor rankable ones the watchlist left out
  // (exchanges, versioned pools and wrapped products aside) belong here too.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const { byCategory, global } = peerMultiples(snapshot, model);
  const tvlOrder = [...chosen.values()].sort((a, b) => b.tvl_usd - a.tvl_usd);
  const tvlRank = new Map(tvlOrder.map((p, i) => [p.slug, i + 1]));

  const scored = [...chosen.values()].map((p) => {
    const peer = p.category !== null && byCategory.has(p.category) ? byCategory.get(p.category)! : global;
    const v = impliedValue(p, snapshot.as_of, peer, model);
    return { p, peer, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    token_status: 'pre-token' as const,
    watchlist: snapshot.watchlist.includes(s.p.slug),
    implied_value_usd: s.implied,
    peer_multiple: round4(s.peer),
    growth_factor: s.growthFactor,
    tenure_factor: s.tenureFactor,
    chains_factor: s.chainsFactor,
    why: whyLine(s.p, s.age, s.peer, scored.length, tvlRank.get(s.p.slug) ?? scored.length),
    farm_steps: farmSteps(s.p, s.age),
  }));
}

/** The tokenized protocols, by market cap, for the dashboard's yardstick table. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_ROWS)
    .map((p) => [p.name, p.category, p.tvl_usd, p.mcap_usd!, round4(p.mcap_usd! / p.tvl_usd)]);
}

/** A board row's compact form for data.js; the farm plan is generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return [
    row.rank,
    row.slug,
    row.name,
    row.category,
    row.chains.join('|'),
    row.tvl_usd,
    row.change_7d,
    row.age_days,
    row.implied_value_usd,
    row.peer_multiple,
    row.growth_factor,
    row.tenure_factor,
    row.chains_factor,
    row.watchlist ? 1 : 0,
  ];
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const { global } = peerMultiples(snapshot, model);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    peer_global: global,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not a protocol in the snapshot`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
