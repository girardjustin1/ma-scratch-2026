import type { ExploreData } from '../pages/ExplorePage';
import { addDays } from '../lib/format';

/**
 * What the local data shows around a place: licensed stores within the radius, and the listed
 * claims (prizes of about $600 and up) at those stores over the last 12 months of data.
 * Descriptive only: counts, totals and the most-listed games. It does not rank stores.
 */
export interface AroundSummary {
  from: string;
  to: string;
  stores: number;
  storesWithClaims: number;
  claims: number;
  prizeSum: number;
  largest: { amount: number; game: string; store: string; town: string; date: string } | null;
  topGames: { name: string; price: number | null; claims: number }[];
}

const R_MILES = 3958.8;
function miles(lon1: number, lat1: number, lon2: number, lat2: number) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.sqrt(a));
}

/** Licensed stores within radiusMiles of [lon, lat]. */
export function storesWithin(data: ExploreData, [lon, lat]: [number, number], radiusMiles: number) {
  return data.retailers.filter((s) => miles(lon, lat, s.lon, s.lat) <= radiusMiles);
}

export function summarizeAround(data: ExploreData, center: [number, number], radiusMiles: number): AroundSummary {
  const to = data.coverage.dateTo;
  const from = addDays(to, -364);
  const stores = storesWithin(data, center, radiusMiles);
  const byId = new Map(stores.map((s) => [s.id, s]));
  const games = new Map(data.games.map((g) => [g.id, g]));
  const perGame = new Map<string, number>();
  const withClaims = new Set<string>();
  let claims = 0, prizeSum = 0;
  let largest: AroundSummary['largest'] = null;
  for (const c of data.claims) {
    if (c.listedDate < from || c.listedDate > to) continue;
    const s = byId.get(c.retailerId);
    if (!s) continue;
    claims++;
    prizeSum += c.prizeAmount;
    withClaims.add(s.id);
    perGame.set(c.gameId, (perGame.get(c.gameId) ?? 0) + 1);
    if (!largest || c.prizeAmount > largest.amount || (c.prizeAmount === largest.amount && c.listedDate > largest.date)) {
      largest = { amount: c.prizeAmount, game: games.get(c.gameId)?.name ?? c.gameId, store: s.name, town: s.town, date: c.listedDate };
    }
  }
  const topGames = [...perGame].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, n]) => ({ name: games.get(id)?.name ?? id, price: games.get(id)?.price ?? null, claims: n }));
  return { from, to, stores: stores.length, storesWithClaims: withClaims.size, claims, prizeSum, largest, topGames };
}
