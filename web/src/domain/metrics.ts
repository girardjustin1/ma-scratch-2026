import { distance, point } from '@turf/turf';
import type {
  Claim, Coverage, Filters, GameRef, PrizeBand, Retailer, TownMatch, TractCollection, TractIncome, TractMetrics,
} from './types';

const BANDS: Record<PrizeBand, [number, number]> = {
  all: [0, Infinity],
  '600-999': [600, 999.99],
  '1k-9k': [1000, 9999.99],
  '10k-99k': [10000, 99999.99],
  '100k+': [100000, Infinity],
};

export function inPrizeBand(amount: number, band: PrizeBand) {
  const [lo, hi] = BANDS[band];
  return amount >= lo && amount <= hi;
}

/** Towns below this share of claims matched to a retailer get a low-match flag on the map. */
export const LOW_MATCH_RATE = 0.8;

/** Tract town names carry a " Town" suffix for some municipalities ("Agawam Town"). */
export const municipalityOf = (town: string) => town.replace(/ Town$/, '');

const miles = (a: [number, number], b: [number, number]) =>
  distance(point(a), point(b), { units: 'miles' });

export function isCovered(centroid: [number, number], coverage: Coverage) {
  return coverage.statewide === true || miles(centroid, coverage.center) <= coverage.radiusMiles;
}

export function filterClaims(claims: Claim[], games: GameRef[], filters: Filters, coverage: Coverage) {
  const price = new Map(games.map((g) => [g.id, g.price]));
  const from = filters.dateFrom > coverage.dateFrom ? filters.dateFrom : coverage.dateFrom;
  const to = filters.dateTo < coverage.dateTo ? filters.dateTo : coverage.dateTo;
  return claims.filter(
    (c) =>
      c.listedDate >= from &&
      c.listedDate <= to &&
      (filters.gameIds.length === 0 || filters.gameIds.includes(c.gameId)) &&
      (filters.prices.length === 0 || filters.prices.includes(price.get(c.gameId) ?? -1)) &&
      inPrizeBand(c.prizeAmount, filters.prizeBand),
  );
}

/**
 * Per-tract metrics with coverage masking. A tract outside claim coverage gets
 * claims = null (no data), never 0. A tract with no retailers gets perRetailer = null
 * (not defined), never 0.
 */
export function computeTractMetrics(args: {
  tracts: TractCollection;
  income: TractIncome[];
  retailers: Retailer[];
  claims: Claim[];
  coverage: Coverage;
  filters: Filters;
  townMatch?: Record<string, TownMatch>;
}): TractMetrics[] {
  const { tracts, income, retailers, claims, coverage, filters, townMatch } = args;
  const incomeBy = new Map(income.map((r) => [r.geoid, r]));
  const retailerTract = new Map(retailers.map((r) => [r.id, r.tractGeoid]));
  const retailersPer = new Map<string, number>();
  for (const r of retailers) retailersPer.set(r.tractGeoid, (retailersPer.get(r.tractGeoid) ?? 0) + 1);

  const claimsBy = new Map<string, { n: number; first: string; last: string }>();
  for (const c of claims) {
    const g = retailerTract.get(c.retailerId);
    if (!g) continue;
    const cur = claimsBy.get(g);
    if (!cur) claimsBy.set(g, { n: 1, first: c.listedDate, last: c.listedDate });
    else {
      cur.n += 1;
      if (c.listedDate < cur.first) cur.first = c.listedDate;
      if (c.listedDate > cur.last) cur.last = c.listedDate;
    }
  }

  return tracts.features.map((f) => {
    const p = f.properties;
    const covered = isCovered(p.centroid, coverage);
    const inRadius = miles(p.centroid, filters.pin) <= filters.radiusMiles;
    const inc = incomeBy.get(p.geoid);
    const nRet = retailersPer.get(p.geoid) ?? 0;
    const agg = claimsBy.get(p.geoid);
    const tm = townMatch?.[municipalityOf(p.town)];
    const rate = tm && tm.total > 0 ? tm.matched / tm.total : null;
    const nClaims = covered ? (agg?.n ?? 0) : null;
    return {
      geoid: p.geoid,
      covered,
      inRadius,
      claims: nClaims,
      retailers: nRet,
      perRetailer: nClaims === null || nRet === 0 ? null : nClaims / nRet,
      income: inc?.medianIncome ?? null,
      incomeMoe: inc?.moe ?? null,
      incomeFlag: inc?.flag ?? 'suppressed',
      firstListed: covered ? (agg?.first ?? null) : null,
      lastListed: covered ? (agg?.last ?? null) : null,
      townMatchRate: rate,
      lowMatch: covered && rate !== null && rate < LOW_MATCH_RATE,
    };
  });
}

export function metricValue(m: TractMetrics, key: 'claims' | 'income' | 'perRetailer') {
  return key === 'claims' ? m.claims : key === 'income' ? m.income : m.perRetailer;
}
