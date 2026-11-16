import type { Filters, GameRef, PrizeBand } from './types';

/**
 * The map filters as state: their limits, what differs from the defaults, and the deep-link
 * query params. No browser APIs here, so the rules are the same wherever filters are read.
 * The pin is never written to a link: it can be a saved address.
 */

/** Top of the claims-per-store range; reaching it means "and up" (shown as 99+). */
export const STORE_CLAIMS_MAX = 100;
export const RADIUS = { min: 0.5, max: 25, step: 0.5 } as const;
export const PRIZE_BANDS: PrizeBand[] = ['all', '600-999', '1k-9k', '10k-99k', '100k+'];
/** Price filter value for games the catalog has no price for (matches filterClaims). */
export const UNKNOWN_PRICE = -1;

export type FilterKey = 'dates' | 'games' | 'prices' | 'prize' | 'radius' | 'stores' | 'pin';

const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
export const storeRange = (f: Filters): [number, number] => f.storeClaims ?? [0, STORE_CLAIMS_MAX];

/** Which filters differ from the defaults, in toolbar order. */
export function changedFilters(f: Filters, d: Filters): FilterKey[] {
  const out: FilterKey[] = [];
  if (f.pin[0] !== d.pin[0] || f.pin[1] !== d.pin[1]) out.push('pin');
  if (f.radiusMiles !== d.radiusMiles) out.push('radius');
  if (f.dateFrom !== d.dateFrom || f.dateTo !== d.dateTo) out.push('dates');
  if (!same(f.gameIds, d.gameIds)) out.push('games');
  if (!same(f.prices, d.prices)) out.push('prices');
  if (f.prizeBand !== d.prizeBand) out.push('prize');
  if (storeRange(f).join() !== storeRange(d).join()) out.push('stores');
  return out;
}

/** One filter back to its default, leaving the others as they are. */
export function resetFilter(f: Filters, d: Filters, key: FilterKey): Filters {
  switch (key) {
    case 'pin': return { ...f, pin: d.pin };
    case 'radius': return { ...f, radiusMiles: d.radiusMiles };
    case 'dates': return { ...f, dateFrom: d.dateFrom, dateTo: d.dateTo };
    case 'games': return { ...f, gameIds: d.gameIds };
    case 'prices': return { ...f, prices: d.prices };
    case 'prize': return { ...f, prizeBand: d.prizeBand };
    case 'stores': return { ...f, storeClaims: d.storeClaims };
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: string | null): v is string => !!v && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const list = (v: string | null) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);

export interface FilterLimits {
  /** First and last listed date in the data. */
  minDate: string;
  maxDate: string;
  games: GameRef[];
}

/**
 * Deep link → filters. Anything missing, malformed or outside the data falls back to the
 * default for that filter alone, so one bad param never discards the rest of the link.
 */
export function filtersFromParams(get: (key: string) => string | null, base: Filters, limits: FilterLimits): Filters {
  const out: Filters = { ...base };

  // Dates: clamped to the data's listed dates; an empty or reversed range is ignored.
  const from = get('from'), to = get('to');
  if (isDate(from) || isDate(to)) {
    const lo = isDate(from) ? (from < limits.minDate ? limits.minDate : from) : base.dateFrom;
    const hi = isDate(to) ? (to > limits.maxDate ? limits.maxDate : to) : base.dateTo;
    if (lo <= hi && lo <= limits.maxDate && hi >= limits.minDate) { out.dateFrom = lo; out.dateTo = hi; }
  }

  const known = new Set(limits.games.map((g) => g.id));
  const games = list(get('games')).filter((id) => known.has(id));
  if (games.length) out.gameIds = [...new Set(games)];

  const priced = new Set(limits.games.map((g) => g.price ?? UNKNOWN_PRICE));
  const prices = list(get('prices')).map(Number).filter((n) => Number.isFinite(n) && priced.has(n));
  if (prices.length) out.prices = [...new Set(prices)];

  const prize = get('prize');
  if (PRIZE_BANDS.includes(prize as PrizeBand)) out.prizeBand = prize as PrizeBand;

  const radius = Number(get('radius'));
  if (get('radius') && Number.isFinite(radius) && radius >= RADIUS.min && radius <= RADIUS.max) {
    out.radiusMiles = Math.round(radius / RADIUS.step) * RADIUS.step;
  }

  const m = /^(\d{1,3})-(\d{1,3})$/.exec(get('stores') ?? '');
  if (m) {
    const lo = Number(m[1]), hi = Math.min(Number(m[2]), STORE_CLAIMS_MAX);
    if (lo <= hi) out.storeClaims = [lo, hi];
  }
  return out;
}

/** Filters → query params, leaving out whatever is at its default. Never the pin. */
export function filterParams(f: Filters, d: Filters): Record<string, string | null> {
  const changed = new Set(changedFilters(f, d));
  return {
    from: changed.has('dates') && f.dateFrom !== d.dateFrom ? f.dateFrom : null,
    to: changed.has('dates') && f.dateTo !== d.dateTo ? f.dateTo : null,
    games: changed.has('games') ? f.gameIds.join(',') : null,
    prices: changed.has('prices') ? f.prices.join(',') : null,
    prize: changed.has('prize') ? f.prizeBand : null,
    radius: changed.has('radius') ? String(f.radiusMiles) : null,
    stores: changed.has('stores') ? storeRange(f).join('-') : null,
  };
}
