// Design fixtures. Tract shapes and income are real Census data; claims, games, prize
// tiers, retailers, EV and statistics are SYNTHETIC and seeded so stories render the
// same every time. None of the synthetic numbers describe real Lottery activity.

import { distance, point } from '@turf/turf';
import type {
  Claim, Coverage, Filters, Game, LegacyEv, PrizeTier, Retailer, StatResult,
  TractCollection, TractIncome,
} from '../domain/types';
import census from './census_sample.json';
import { addDays } from '../lib/format';
import { LABELS } from '../lib/copy';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(20261109);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

export const SAMPLE_CENTER: [number, number] = [-71.08, 42.36];

// The owner's opening pin lives in web/.env.local (VITE_DEFAULT_PIN=lon,lat) and is never
// committed. Without it, the generic Boston point is used.
function envPin(): [number, number] | null {
  const raw = import.meta.env.VITE_DEFAULT_PIN as string | undefined;
  const [lon, lat] = (raw ?? '').split(',').map(Number);
  return Number.isFinite(lon) && Number.isFinite(lat) && raw ? [lon, lat] : null;
}
export const PIN: [number, number] = envPin() ?? SAMPLE_CENTER;
const PIN_LABEL = envPin() ? 'your pin' : 'sample pin';
export const AS_OF = '2026-11-08';

// ---- Tracts & income: REAL public Census data (scripts/build_design_fixture.py) ---
// 2020 tracts within 12.5 mi of the sample pin, with ACS 2020–2024 median household
// income and margin of error. Everything below this block is synthetic.
export const tracts = census.tracts as unknown as TractCollection;
export const tractIncome = census.income as TractIncome[];
export const ACS_RELEASES = ['2020–2024 ACS 5-year', '2019–2023 ACS 5-year'] as const;

// ---- Retailers --------------------------------------------------------------------
const STORE_WORDS = ['Corner', 'Market', 'Mart', 'Variety', 'Convenience', 'Liquors', 'Gas & Go', 'News'];
const STREETS = ['Main St', 'Elm St', 'Broadway', 'Central Ave', 'Washington St', 'Highland Ave', 'Pleasant St'];
export const retailers: Retailer[] = [];
tracts.features.forEach((f) => {
  const n = r() < 0.35 ? 0 : r() < 0.7 ? 1 : r() < 0.9 ? 2 : 3;
  for (let k = 0; k < n; k++) {
    const [lon, lat] = f.properties.centroid;
    retailers.push({
      id: `R${String(retailers.length + 1).padStart(4, '0')}`,
      name: `${pick(['Sample', 'Demo', 'Test'])} ${pick(STORE_WORDS)} ${retailers.length + 1}`,
      address: `${Math.floor(10 + r() * 980)} ${pick(STREETS)}`,
      town: f.properties.town,
      lon: lon + (r() - 0.5) * 0.008,
      lat: lat + (r() - 0.5) * 0.006,
      tractGeoid: f.properties.geoid,
    });
  }
});

// ---- Games & prize tiers ---------------------------------------------------------
const NAMES = [
  'Cash Orchard', 'Granite Gold', 'Harbor Riches', 'Lucky Lanterns', 'Bay State Bonus', 'Silver Tide',
  'Maple Millions', 'Triple Cranberry', 'Lighthouse Loot', 'Emerald 7s', 'Golden Gull', 'Snowfall Stacks',
  'Fortune Ferry', 'Cape Cash', 'Diamond Dunes', 'Patriot Payout', 'Clover Crossing', 'Hot Lobster',
  'Blizzard Bucks', 'Starry Harbor', 'Copper Kettle', 'Winter Wonders', 'Ruby Rush', 'Mega Mayflower',
];
const PRICES = [1, 2, 5, 10, 20, 30, 50];
const TOP: Record<number, number> = { 1: 10000, 2: 25000, 5: 100000, 10: 1000000, 20: 1000000, 30: 4000000, 50: 10000000 };

export const games: Game[] = NAMES.map((name, i) => {
  const price = PRICES[i % PRICES.length];
  return {
    id: `G${600 + i * 7}`,
    name,
    price,
    launchDate: addDays(AS_OF, -Math.floor(40 + r() * 700)),
    status: i % 6 === 5 ? 'claims_only' : 'open',
    claimDeadline: i % 6 === 5 ? addDays(AS_OF, 30 + i * 9) : undefined,
    ticketsPrinted: Math.round((2_000_000 + r() * 20_000_000) / 1000) * 1000,
    overallOdds: Number((2.4 + r() * 2.2).toFixed(2)),
    originalTopPrize: TOP[price],
  };
});

export const prizeTiers: PrizeTier[] = games.flatMap((g) => {
  const values = [g.price, g.price * 2, g.price * 5, g.price * 20, 600, 1000, 10000, g.originalTopPrize]
    .filter((v, i, a) => v <= g.originalTopPrize && a.indexOf(v) === i)
    .sort((a, b) => a - b);
  const sold = 0.2 + r() * 0.7;
  return values.map((value) => {
    const total = Math.max(2, Math.round((g.ticketsPrinted / g.overallOdds) * (g.price / value) * 0.12));
    const isTop = value === g.originalTopPrize;
    const remaining = isTop ? Math.max(0, Math.round(total * (1 - sold) + (r() - 0.6) * 2)) : Math.round(total * (1 - sold) * (0.9 + r() * 0.2));
    return { gameId: g.id, value, total, remaining: Math.min(total, remaining), isLaunchTopPrize: isTop };
  });
});

export const legacyEv: LegacyEv[] = games.slice(0, 14).map((g) => ({
  gameId: g.id,
  asOf: '2026-06-30',
  evAll: -g.price * (0.22 + r() * 0.12),
  evExJackpot: -g.price * (0.3 + r() * 0.14),
  methodNote: 'Sample: Wayback full prize table captured 2026-06-30',
}));

// ---- Coverage & claims -------------------------------------------------------------
export const coverage: Coverage = {
  label: `5 mi around ${PIN_LABEL}`,
  center: PIN,
  radiusMiles: 5,
  dateFrom: addDays(AS_OF, -20),
  dateTo: AS_OF,
};

const coveredRetailers = retailers.filter(
  (x) => distance(point([x.lon, x.lat]), point(PIN), { units: 'miles' }) <= coverage.radiusMiles,
);
const AMOUNTS = [600, 600, 600, 700, 800, 1000, 1000, 1000, 2000, 2500, 5000, 10000, 10000, 25000, 50000, 100000, 1000000];

export const claims: Claim[] = Array.from({ length: 360 }, (_, i) => {
  const ret = pick(coveredRetailers);
  return {
    id: `C${String(i + 1).padStart(5, '0')}`,
    listedDate: addDays(coverage.dateFrom, Math.floor(r() * 21)),
    gameId: pick(games).id,
    prizeAmount: pick(AMOUNTS),
    retailerId: ret.id,
  };
});

// Six months of listed claims for the winner timeline. The claims window only covers
// the last three weeks, so earlier months are deliberately sparse and partly uncovered.
export const timelineCoverage = [{ from: coverage.dateFrom, to: coverage.dateTo }];

export const defaultFilters: Filters = {
  dateFrom: coverage.dateFrom,
  dateTo: coverage.dateTo,
  gameIds: [],
  prices: [],
  prizeBand: 'all',
  pin: PIN,
  radiusMiles: 5,
};

// ---- Statistics (illustrative states for design only) ------------------------------
export const statResults: StatResult[] = [
  {
    id: 'income-claims',
    question: 'Income vs listed claims',
    unit: 'Covered tract',
    method: 'Spearman rank correlation, bootstrap 95% interval; Poisson with households as exposure',
    gate: { label: 'covered tracts', required: 30, have: 104 },
    result: {
      n: 104, effectLabel: 'Spearman ρ', effect: -0.18, ciLow: -0.36, ciHigh: 0.01, pRaw: 0.067, pAdjusted: 0.134,
      summary: 'Weak negative association; the interval includes zero.',
    },
  },
  {
    id: 'income-per-retailer',
    question: 'Income vs claims per licensed retailer',
    unit: 'Covered tract with 1+ retailer',
    method: 'Spearman rank correlation, bootstrap 95% interval; Poisson with retailers as exposure',
    gate: { label: 'tracts with a retailer', required: 30, have: 71 },
    result: {
      n: 71, effectLabel: 'Spearman ρ', effect: -0.05, ciLow: -0.27, ciHigh: 0.18, pRaw: 0.68, pAdjusted: 0.68,
      summary: 'No clear association.',
    },
  },
  {
    id: 'games',
    question: 'Differences between games',
    unit: 'Game',
    method: 'Kruskal–Wallis on tract income across games',
    gate: { label: 'games with 30+ listed claims', required: 2, have: 0 },
  },
];

export const mlGate = {
  weeks: { required: 26, have: 3 },
  tracts: { required: 200, have: 104 },
  claims: { required: 2000, have: 360 },
};

export const sources = [
  { id: 'claims', label: LABELS.listedClaims, origin: 'Mass Lottery', lastFetched: AS_OF, rows: 360 },
  { id: 'games', label: 'Games and prizes remaining', origin: 'Mass Lottery', lastFetched: AS_OF, rows: games.length },
  { id: 'retailers', label: 'Licensed retailers', origin: 'Mass Lottery', lastFetched: '2026-11-01', rows: retailers.length },
  { id: 'income', label: 'Median household income', origin: 'Census Bureau ACS', lastFetched: '2026-10-15', rows: tractIncome.length },
] as const;
