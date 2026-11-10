// Builds the insights emails' data (types.ts) from the app's local data. Pure functions: no
// React, no fetch. Runs on the owner's computer only; nothing it returns is ever committed.
//
// Same honesty rules as the app: listed claims over $600 (not wins), Lottery-listed dates,
// statewide EV only as statewide averages, every estimate above 100% flagged, the area
// described as "your pin" (never coordinates or an address). Where the data cannot support
// a section, the section comes back empty and the template shows its empty state.

import { distance, point } from '@turf/turf';
import { classOf, quantileBreaks, storeCountBreaks } from '../domain/classify';
import { estimateEv, type EvEstimate } from '../domain/ev';
import { computeTractMetrics, filterClaims } from '../domain/metrics';
import type { Claim, Filters, Game, GameRef, PrizeTier, Retailer } from '../domain/types';
import { addDays, daysBetween, fmtDate, fmtInt, fmtUsd } from '../lib/format';
import type { ExploreData } from '../pages/ExplorePage';
import type {
  Alert, AlertRadius, EvRow, EvSummary, EvWatchData, FeaturedTicket, FeaturedTicketsData, InsightsData,
  ListedClaimRow, NearbyAlertData, NearbyClaim, Period, StoreRef,
} from './types';

// ── Rules ────────────────────────────────────────────────────────────────────────────────

/** Default area: this many miles around the pin (the Map tab's default radius). */
const DEFAULT_RADIUS = 5;
/** A listed claim this large is an alert. */
const BIG_CLAIM = 10_000;
/** Alerts at the top of the weekly and monthly emails. */
const MAX_ALERTS = 5;
const MAX_TRENDING_ALERTS = 3;
/** Trend and hottest ranges: the 365 listed dates to the period's end (the Map tab's default range). */
const YEAR_DAYS = 365;
/** Hottest stores: top 3% of stores with listed claims, needs this many stores (same as the Map tab). */
const HOT_MIN_STORES = 30;
const HOT_QUANTILE = 0.97;
const LARGEST = 5;
const TOP_GAMES = 5;
const FEATURED_COUNT: Record<Period, number> = { week: 2, month: 5 };
/** Featured email: one ticket per rule by default. */
const FEATURED_EMAIL_COUNT = 4;
/** FeaturedTicket.claimsNearby counts this many listed dates back. */
const NEARBY_CLAIM_DAYS = 30;
/** Nearby alert default: this many listed dates back from the data's last date. */
const NEARBY_DAYS = 7;
const EV_BEST = 5;
const EV_WATCH_BEST = 8;
/** Analysis notes need at least this many listed claims behind them. */
const NOTE_MIN_CLAIMS = 30;
/** Income-class note: each class compared needs this many licensed stores. */
const NOTE_MIN_STORES = 10;
const HIGH_PRICES = [30, 50];

const PERIOD_WORDS = {
  week: { unit: 'week', units: 'weeks', thisP: 'this week' },
  month: { unit: 'month', units: 'months', thisP: 'this month' },
} as const;

// ── Area and claims ──────────────────────────────────────────────────────────────────────

interface Area {
  data: ExploreData;
  pin: [number, number];
  radius: number;
  /** Licensed stores within the radius, by id, with straight-line miles from the pin. */
  stores: Map<string, { r: Retailer; miles: number }>;
  games: Map<string, GameRef>;
}

const areaLabel = (radius: number) => `${radius} mi around your pin`;

function areaOf(data: ExploreData, radius: number): Area {
  const pin = data.coverage.center;
  const here = point(pin);
  const stores = new Map<string, { r: Retailer; miles: number }>();
  for (const r of data.retailers) {
    const miles = distance(point([r.lon, r.lat]), here, { units: 'miles' });
    if (miles <= radius) stores.set(r.id, { r, miles });
  }
  return { data, pin, radius, stores, games: new Map(data.games.map((g) => [g.id, g])) };
}

const filtersFor = (a: Area, from: string, to: string): Filters => ({
  dateFrom: from, dateTo: to, gameIds: [], prices: [], prizeBand: 'all', pin: a.pin, radiusMiles: a.radius,
});

/** Every listed claim from..to (inclusive, clipped to coverage), statewide. */
const claimsBetween = (a: Area, from: string, to: string) =>
  filterClaims(a.data.claims, a.data.games, filtersFor(a, from, to), a.data.coverage);

const inArea = (a: Area, claims: Claim[]) => claims.filter((c) => a.stores.has(c.retailerId));

const isCovered = (a: Area, from: string, to: string) => from >= a.data.coverage.dateFrom && to <= a.data.coverage.dateTo;

const minDate = (x: string, y: string) => (x < y ? x : y);
const maxDate = (x: string, y: string) => (x > y ? x : y);

function storeRef(a: Area, id: string): StoreRef {
  const s = a.stores.get(id)?.r;
  return { name: s?.name ?? 'Unknown store', town: s?.town ?? '', address: s?.address || undefined };
}

function claimRow(a: Area, c: Claim): ListedClaimRow {
  const g = a.games.get(c.gameId);
  const s = storeRef(a, c.retailerId);
  return {
    listedDate: c.listedDate, game: g?.name ?? 'Unknown game', price: g?.price ?? null, prize: c.prizeAmount,
    store: s.name, town: s.town, address: s.address, gameId: c.gameId, image: g?.image ?? undefined,
  };
}

function countBy<K>(items: Claim[], key: (c: Claim) => K) {
  const m = new Map<K, number>();
  for (const c of items) m.set(key(c), (m.get(key(c)) ?? 0) + 1);
  return m;
}

// ── Periods ──────────────────────────────────────────────────────────────────────────────

interface Range { from: string; to: string }

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
const monthOf = (iso: string): Range => {
  const from = `${iso.slice(0, 7)}-01`;
  const [y, m] = iso.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { from, to: addDays(next, -1) };
};

/** Week: Mon–Sun ending on the latest Sunday ≤ to. Month: the latest complete calendar month ≤ to. */
function periodRange(period: Period, to: string): Range {
  if (period === 'week') {
    const sunday = addDays(to, -weekday(to));
    return { from: addDays(sunday, -6), to: sunday };
  }
  const m = monthOf(to);
  return m.to === to ? m : monthOf(addDays(m.from, -1));
}

const priorRange = (period: Period, r: Range): Range =>
  period === 'week' ? { from: addDays(r.from, -7), to: addDays(r.from, -1) } : monthOf(addDays(r.from, -1));

// ── Trend and hottest (same rules as the Map tab) ────────────────────────────────────────

interface TrendWindow { priorFrom: string; priorTo: string; recentFrom: string; recentTo: string; min: number }

/** The Map tab's trending rule over the year to `anchor`: later half vs earlier half. */
function trendWindow(a: Area, anchor: string): TrendWindow {
  const from = maxDate(addDays(anchor, -(YEAR_DAYS - 1)), a.data.coverage.dateFrom);
  const half = Math.max(1, Math.floor((daysBetween(from, anchor) + 1) / 2));
  const recentFrom = addDays(anchor, -(half - 1));
  return { priorFrom: addDays(recentFrom, -half), priorTo: addDays(recentFrom, -1), recentFrom, recentTo: anchor,
    min: Math.max(3, Math.round((8 * half) / 90)) };
}

function trendingStores(a: Area, w: TrendWindow) {
  const out = new Map<string, { recent: number; prior: number }>();
  for (const c of inArea(a, claimsBetween(a, w.priorFrom, w.recentTo))) {
    const t = out.get(c.retailerId) ?? { recent: 0, prior: 0 };
    if (c.listedDate >= w.recentFrom) t.recent += 1; else t.prior += 1;
    out.set(c.retailerId, t);
  }
  return [...out].filter(([, t]) => t.recent >= w.min && t.recent >= 2 * Math.max(t.prior, 1))
    .sort((x, y) => y[1].recent - x[1].recent || x[1].prior - y[1].prior);
}

/** Top 3% of in-area stores with listed claims, at least the top class's lower edge + 2; needs 30+ stores. */
function hottest(a: Area, yearClaims: Claim[]): InsightsData['hottest'] {
  const period = 'the last 12 months';
  const byStore = countBy(yearClaims, (c) => c.retailerId);
  const counts = [...byStore.values()].filter((n) => n > 0);
  if (counts.length < HOT_MIN_STORES) return { min: 0, period, stores: [] };
  const sorted = [...counts].sort((x, y) => x - y);
  const breaks = storeCountBreaks(counts);
  const p97 = sorted[Math.floor(HOT_QUANTILE * (sorted.length - 1))];
  const min = Math.max(p97, (breaks[breaks.length - 1] ?? 0) + 2);
  const stores = [...byStore].filter(([, n]) => n >= min).sort((x, y) => y[1] - x[1])
    .map(([id, claims]) => ({ ...storeRef(a, id), claims }));
  return { min, period, stores };
}

// ── EV ───────────────────────────────────────────────────────────────────────────────────

interface EvFull { game: Game; est: EvEstimate; row: EvRow }

function evRows(data: ExploreData): EvFull[] {
  if (!data.ev) return [];
  const images = new Map(data.games.map((g) => [g.id, g.image ?? undefined]));
  const out: EvFull[] = [];
  for (const game of data.ev.games) {
    if (game.status !== 'open') continue;
    const est = estimateEv(game, data.ev.tiers);
    if (!est) continue;
    out.push({ game, est, row: {
      name: game.name, gameId: game.id, price: game.price,
      payback: (est.evAll + game.price) / game.price, paybackExJackpot: (est.evExJackpot + game.price) / game.price,
      evAll: est.evAll, checkInputs: est.checkInputs, image: images.get(game.id),
    } });
  }
  return out.sort((x, y) => y.row.payback - x.row.payback);
}

function median(v: number[]) {
  if (v.length === 0) return NaN;
  const s = [...v].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The likely reason an estimate is above 100%, from the same prize table the estimate uses. */
function evReason(e: EvFull, tiers: PrizeTier[]): string {
  const share = e.est.ticketsRemaining / e.game.ticketsPrinted;
  const sharePct = Math.round(share * 100);
  const left = sharePct < 1 ? 'under 1% of tickets left' : `about ${sharePct}% of tickets left`;
  const top = tiers.filter((t) => t.gameId === e.game.id && t.isLaunchTopPrize);
  const topLeft = top.reduce((s, t) => s + t.remaining, 0);
  const topValue = top.reduce((m, t) => Math.max(m, t.value), 0);
  if (e.row.paybackExJackpot < 1 && topLeft > 0) {
    return `${topLeft === 1 ? 'one' : fmtInt(topLeft)} unclaimed ${fmtUsd(topValue)} top prize${topLeft === 1 ? '' : 's'}, ${left}`;
  }
  return `Still above 100% without the original jackpot, with ${left}. Prizes on sold but uncashed tickets, or an approximate tickets-printed figure, may be inflating it.`;
}

function evSummary(data: ExploreData): EvSummary | undefined {
  if (!data.ev) return undefined;
  const rows = evRows(data);
  const positive = rows.filter((e) => e.row.payback > 1);
  return {
    asOf: data.ev.asOf,
    gamesOnSale: data.ev.games.filter((g) => g.status === 'open').length,
    medianPayback: median(rows.map((e) => e.row.payback)),
    positive: positive.length,
    holdsUp: positive.filter((e) => e.row.paybackExJackpot >= 1).length,
    best: rows.slice(0, EV_BEST).map((e) => e.row),
  };
}

// ── Featured tickets ─────────────────────────────────────────────────────────────────────

const TAG: Record<string, FeaturedTicket['tags'][number]> = { new: 'New', ending: 'Ending soon', secondChance: 'Second chance' };
const ORDINAL = ['', 'Second-', 'Third-', 'Fourth-', 'Fifth-'];
/** "Second-", "Third-" … for a game's place in a rule's ranking (0 = first). */
const ord = (i: number) => ORDINAL[i] ?? `${i + 1}th-`;
const pctText = (v: number) => `${Math.round(v * 100)}%`;

type OnSale = GameRef & { price: number; launchDate: string; prizes: NonNullable<GameRef['prizes']> };

/**
 * Picks by rule, round-robin so each rule gets a turn before any gets a second: most prizes
 * over $600 left; newest launch; tagged ending soon with a top prize left; highest estimated
 * payback (flagged when above 100%). A game is featured once.
 */
function pickFeatured(a: Area, n: number, anchor: string): FeaturedTicket[] {
  const onSale = a.data.games.filter((g): g is OnSale => g.onSale === true && !!g.prizes && g.price !== null && !!g.launchDate);
  const evBy = new Map(evRows(a.data).map((e) => [e.game.id, e]));
  const recent = countBy(inArea(a, claimsBetween(a, addDays(anchor, -(NEARBY_CLAIM_DAYS - 1)), anchor)), (c) => c.gameId);

  const rules: { list: OnSale[]; why: (g: OnSale, rank: number) => string }[] = [
    {
      list: [...onSale].sort((x, y) => y.prizes.remainingOver600 - x.prizes.remainingOver600),
      why: (g, i) => `${i === 0 ? 'Most' : `${ord(i)}most`} prizes over $600 still left of the ${fmtInt(onSale.length)} games on sale: ${fmtInt(g.prizes.remainingOver600)} of ${fmtInt(g.prizes.totalOver600)}, statewide.`,
    },
    {
      list: [...onSale].sort((x, y) => y.launchDate.localeCompare(x.launchDate)),
      why: (g, i) => `${i === 0 ? 'Newest' : `${ord(i)}newest`} game on sale, launched ${fmtDate(g.launchDate)}${g.prizes.totalOver600 > 0 ? `; ${pctText(g.prizes.remainingOver600 / g.prizes.totalOver600)} of its prizes over $600 are still out` : ''}.`,
    },
    {
      list: onSale.filter((g) => g.tags?.includes('ending') && g.prizes.topRemaining >= 1)
        .sort((x, y) => y.prizes.topPrize - x.prizes.topPrize),
      why: (g) => `Tagged ending soon by the Lottery, with ${fmtInt(g.prizes.topRemaining)} of ${fmtInt(g.prizes.topTotal)} top prizes of ${fmtUsd(g.prizes.topPrize)} still unclaimed statewide.`,
    },
    {
      list: onSale.filter((g) => evBy.has(g.id)).sort((x, y) => evBy.get(y.id)!.row.payback - evBy.get(x.id)!.row.payback),
      why: (g, i) => {
        const e = evBy.get(g.id)!;
        const head = `${i === 0 ? 'Highest' : `${ord(i)}highest`} estimated payback of any game on sale: ${pctText(e.row.payback)} per $1, statewide.`;
        return e.row.checkInputs && a.data.ev ? `${head} Check inputs: ${evReason(e, a.data.ev.tiers).replace(/^[a-z]/, (ch) => ch.toUpperCase()).replace(/\.?$/, '.')}` : head;
      },
    },
  ];

  const picked: FeaturedTicket[] = [];
  const seen = new Set<string>();
  const pos = rules.map(() => 0);
  while (picked.length < n && rules.some((r, i) => pos[i] < r.list.length)) {
    for (let i = 0; i < rules.length && picked.length < n; i++) {
      const r = rules[i];
      while (pos[i] < r.list.length && seen.has(r.list[pos[i]].id)) pos[i]++;
      if (pos[i] >= r.list.length) continue;
      // The game's place in this rule's own ranking, so the wording stays true when a game
      // ahead of it was already featured by another rule.
      const place = pos[i];
      const g = r.list[pos[i]++];
      seen.add(g.id);
      const e = evBy.get(g.id);
      picked.push({
        name: g.name, gameId: g.id, price: g.price, image: g.image ?? undefined, launchDate: g.launchDate,
        tags: (g.tags ?? []).map((t) => TAG[t]).filter((t): t is FeaturedTicket['tags'][number] => !!t),
        why: r.why(g, place),
        topPrize: g.prizes.topPrize, topLeft: g.prizes.topRemaining, topTotal: g.prizes.topTotal,
        leftOver600: g.prizes.remainingOver600, totalOver600: g.prizes.totalOver600,
        payback: e ? e.row.payback : null, paybackExJackpot: e ? e.row.paybackExJackpot : null,
        checkInputs: e ? e.row.checkInputs : false,
        claimsNearby: recent.get(g.id) ?? 0,
      });
    }
  }
  return picked;
}

// ── Alerts ───────────────────────────────────────────────────────────────────────────────

/**
 * Highest-signal first, taking turns so one kind cannot crowd out the rest: large listed
 * claims, last top prize, new games, newly trending stores. ending_soon needs a sales end
 * date; the local data has none (only the Lottery's "ending" tag), so it is not produced.
 */
function buildAlerts(a: Area, p: Range, prior: Range, periodClaims: Claim[]): Alert[] {
  const big: Alert[] = periodClaims.filter((c) => c.prizeAmount >= BIG_CLAIM)
    .sort((x, y) => y.prizeAmount - x.prizeAmount || y.listedDate.localeCompare(x.listedDate))
    .map((c) => { const r = claimRow(a, c); return { kind: 'big_claim', prize: r.prize, game: r.game, store: r.store, town: r.town, listedDate: r.listedDate }; });

  const onSale = a.data.games.filter((g) => g.onSale === true && g.prizes && g.price !== null);
  const lastTop: Alert[] = onSale.filter((g) => g.prizes!.topRemaining === 1)
    .sort((x, y) => y.prizes!.topPrize - x.prizes!.topPrize)
    .map((g) => ({ kind: 'last_top_prize', game: g.name, price: g.price!, topPrize: g.prizes!.topPrize, left: 1, total: g.prizes!.topTotal }));

  const newGames: Alert[] = onSale.filter((g) => g.launchDate && g.launchDate >= p.from && g.launchDate <= p.to)
    .sort((x, y) => y.launchDate!.localeCompare(x.launchDate!))
    .map((g) => ({ kind: 'new_game', game: g.name, price: g.price!, topPrize: g.prizes!.topPrize, launchDate: g.launchDate! }));

  // Newly trending: trending at the end of this period, not at the end of the one before.
  const before = new Set(trendingStores(a, trendWindow(a, prior.to)).map(([id]) => id));
  const trending: Alert[] = trendingStores(a, trendWindow(a, p.to)).filter(([id]) => !before.has(id)).slice(0, MAX_TRENDING_ALERTS)
    .map(([id, t]) => ({ kind: 'store_trending', store: storeRef(a, id).name, town: storeRef(a, id).town, recent: t.recent, prior: t.prior }));

  const queues = [big, lastTop, newGames, trending];
  const out: Alert[] = [];
  for (let i = 0; out.length < MAX_ALERTS && queues.some((q) => q.length > i); i++) {
    for (const q of queues) if (q[i] && out.length < MAX_ALERTS) out.push(q[i]);
  }
  return out;
}

// ── Analysis notes ───────────────────────────────────────────────────────────────────────

function analysisNotes(a: Area, period: Period, p: Range, prior: Range, periodClaims: Claim[], priorClaims: number, yearAll: Claim[], yearArea: Claim[]) {
  const w = PERIOD_WORDS[period];
  const notes: InsightsData['analysis'] = [];
  const n = periodClaims.length;

  // 1. This period against the one before, and the range of the four before that.
  if (isCovered(a, prior.from, prior.to) && priorClaims > 0 && n + priorClaims >= NOTE_MIN_CLAIMS) {
    const pct = Math.round(((n - priorClaims) / priorClaims) * 100);
    const earlier: number[] = [];
    let r = prior;
    for (let i = 0; i < 4; i++) {
      r = priorRange(period, r);
      if (!isCovered(a, r.from, r.to)) break;
      earlier.push(inArea(a, claimsBetween(a, r.from, r.to)).length);
    }
    const range = earlier.length === 4
      ? ` The four ${w.units} before that ranged from ${fmtInt(Math.min(...earlier))} to ${fmtInt(Math.max(...earlier))}${n >= Math.min(...earlier) && n <= Math.max(...earlier) ? ', so this is within the usual range' : ''}.`
      : '';
    notes.push({
      title: `Listed claims are ${pct === 0 ? 'level with' : pct > 0 ? `up ${pct}% on` : `down ${Math.abs(pct)}% on`} the ${w.unit} before`,
      body: `${fmtInt(n)} ${w.thisP} against ${fmtInt(priorClaims)}.${range}`,
    });
  }

  // 2. Share of listed claims on $30 and $50 tickets, this period vs the year.
  const priceOf = (c: Claim) => a.games.get(c.gameId)?.price ?? null;
  const share = (cs: Claim[]) => {
    const known = cs.filter((c) => priceOf(c) !== null);
    return known.length ? { n: known.length, share: known.filter((c) => HIGH_PRICES.includes(priceOf(c)!)).length / known.length } : null;
  };
  const sNow = share(periodClaims);
  const sYear = share(yearArea);
  if (sNow && sYear && sNow.n >= NOTE_MIN_CLAIMS) {
    notes.push({
      title: `$30 and $50 tickets made up ${pctText(sNow.share)} of listed claims`,
      body: `Against ${pctText(sYear.share)} over the 12 months to ${fmtDate(p.to)}. Higher-priced tickets have more prizes over $600, so they show up more often on the public list.`,
    });
  }

  // 3. Listed claims per licensed store, lowest vs highest tract-income class (the year, for stable counts).
  const metrics = computeTractMetrics({ ...a.data, claims: yearAll, filters: filtersFor(a, p.from, p.to) })
    .filter((m) => m.inRadius && m.covered && m.income !== null && m.incomeFlag !== 'suppressed' && m.retailers > 0 && m.claims !== null);
  const breaks = quantileBreaks(metrics.map((m) => m.income!), 5);
  if (breaks.length >= 1) {
    const top = breaks.length;
    const agg = (cls: number) => metrics.filter((m) => classOf(m.income!, breaks) === cls)
      .reduce((s, m) => ({ claims: s.claims + m.claims!, stores: s.stores + m.retailers }), { claims: 0, stores: 0 });
    const lo = agg(0);
    const hi = agg(top);
    if (lo.stores >= NOTE_MIN_STORES && hi.stores >= NOTE_MIN_STORES && lo.claims + hi.claims >= NOTE_MIN_CLAIMS) {
      const x = lo.claims / lo.stores;
      const y = hi.claims / hi.stores;
      const close = Math.abs(x - y) <= 0.1 * Math.max(x, y);
      const cls = top === 4 ? 'fifth' : 'class';
      notes.push({
        title: close ? 'Claims per store were about the same across tract income'
          : `${x > y ? 'Lower' : 'Higher'}-income tracts listed more claims per store`,
        body: `Over the 12 months to ${fmtDate(p.to)}, licensed stores in the lowest income ${cls} of tracts in your area averaged ${x.toFixed(1)} listed claims each (${fmtInt(lo.stores)} stores); the highest ${cls} averaged ${y.toFixed(1)} (${fmtInt(hi.stores)} stores). Retailer count is not sales volume.`,
      });
    }
  }
  return notes.slice(0, 3);
}

// ── Builders ─────────────────────────────────────────────────────────────────────────────

export interface InsightsOptions {
  period: Period;
  /** Latest listed date to consider; default and maximum is the data's last listed date. */
  to?: string;
  radiusMiles?: number;
  appUrl: string;
}

/** Weekly digest or monthly report for the area around the pin. */
export function buildInsights(data: ExploreData, opts: InsightsOptions): InsightsData {
  const radius = opts.radiusMiles ?? DEFAULT_RADIUS;
  const a = areaOf(data, radius);
  const to = minDate(opts.to ?? data.coverage.dateTo, data.coverage.dateTo);
  const p = periodRange(opts.period, to);
  const prior = priorRange(opts.period, p);

  const periodClaims = inArea(a, claimsBetween(a, p.from, p.to));
  const priorClaims = inArea(a, claimsBetween(a, prior.from, prior.to)).length;
  const yearAll = claimsBetween(a, addDays(p.to, -(YEAR_DAYS - 1)), p.to);
  const yearArea = inArea(a, yearAll);

  const w = trendWindow(a, p.to);
  const trend = {
    recentFrom: w.recentFrom, recentTo: w.recentTo, priorFrom: w.priorFrom, priorTo: w.priorTo,
    stores: trendingStores(a, w).map(([id, t]) => ({ ...storeRef(a, id), ...t })),
  };

  const largest = [...periodClaims]
    .sort((x, y) => y.prizeAmount - x.prizeAmount || y.listedDate.localeCompare(x.listedDate))
    .slice(0, LARGEST).map((c) => claimRow(a, c));

  let topGames: InsightsData['topGames'];
  if (opts.period === 'month') {
    const by = new Map<string, { claims: number; prizeTotal: number }>();
    for (const c of periodClaims) {
      const g = by.get(c.gameId) ?? { claims: 0, prizeTotal: 0 };
      g.claims += 1; g.prizeTotal += c.prizeAmount;
      by.set(c.gameId, g);
    }
    topGames = [...by].sort((x, y) => y[1].claims - x[1].claims || y[1].prizeTotal - x[1].prizeTotal).slice(0, TOP_GAMES)
      .map(([id, v]) => { const g = a.games.get(id); return { name: g?.name ?? 'Unknown game', gameId: id, price: g?.price ?? null, image: g?.image ?? undefined, ...v }; });
  }

  return {
    appUrl: opts.appUrl,
    area: areaLabel(radius),
    period: opts.period,
    from: p.from,
    to: p.to,
    alerts: buildAlerts(a, p, prior, periodClaims),
    totals: {
      claims: periodClaims.length,
      priorClaims,
      prizeTotal: periodClaims.reduce((s, c) => s + c.prizeAmount, 0),
      storesWithClaims: new Set(periodClaims.map((c) => c.retailerId)).size,
      licensedStores: a.stores.size,
    },
    trend,
    hottest: hottest(a, yearArea),
    largest,
    topGames,
    analysis: analysisNotes(a, opts.period, p, prior, periodClaims, priorClaims, yearAll, yearArea),
    featured: pickFeatured(a, FEATURED_COUNT[opts.period], p.to),
    ev: evSummary(data),
  };
}

export interface FeaturedOptions { to?: string; radiusMiles?: number; count?: number; appUrl: string }

/** Featured tickets email: one game per rule by default (see pickFeatured). */
export function buildFeatured(data: ExploreData, opts: FeaturedOptions): FeaturedTicketsData {
  const radius = opts.radiusMiles ?? DEFAULT_RADIUS;
  const a = areaOf(data, radius);
  const to = minDate(opts.to ?? data.coverage.dateTo, data.coverage.dateTo);
  const asOfs = data.games.map((g) => g.prizes?.asOf).filter((d): d is string => !!d).sort();
  return {
    appUrl: opts.appUrl, area: areaLabel(radius),
    asOf: data.ev?.asOf ?? asOfs[asOfs.length - 1] ?? to,
    gamesOnSale: data.games.filter((g) => g.onSale === true).length,
    tickets: pickFeatured(a, opts.count ?? FEATURED_EMAIL_COUNT, to),
  };
}

export interface EvWatchOptions { radiusMiles?: number; appUrl: string }

/**
 * +EV watch. Throws when the data has no prize tables (no EV inputs): the email would have
 * nothing true to say. movers is empty: the local view keeps only the latest prize table, so
 * there is no earlier one to compare against; previousAsOf is set to asOf.
 */
export function buildEvWatch(data: ExploreData, opts: EvWatchOptions): EvWatchData {
  if (!data.ev) throw new Error('No statewide EV inputs in the local data.');
  const s = evSummary(data)!;
  const tiers = data.ev.tiers;
  const rows = evRows(data);
  return {
    appUrl: opts.appUrl, area: areaLabel(opts.radiusMiles ?? DEFAULT_RADIUS),
    asOf: s.asOf, gamesOnSale: s.gamesOnSale, medianPayback: s.medianPayback,
    best: rows.slice(0, EV_WATCH_BEST).map((e) => e.row),
    positive: rows.filter((e) => e.row.payback > 1).map((e) => ({ ...e.row, why: evReason(e, tiers) })),
    movers: [],
    previousAsOf: s.asOf,
  };
}

export interface NearbyOptions { radiusMiles: AlertRadius; from?: string; to?: string; appUrl: string }

/** Listed claims at stores within the alert radius, nearest first. Default: the last 7 listed dates. */
export function buildNearbyAlert(data: ExploreData, opts: NearbyOptions): NearbyAlertData {
  const a = areaOf(data, opts.radiusMiles);
  const to = minDate(opts.to ?? data.coverage.dateTo, data.coverage.dateTo);
  const from = maxDate(opts.from ?? addDays(to, -(NEARBY_DAYS - 1)), data.coverage.dateFrom);
  const claims: NearbyClaim[] = inArea(a, claimsBetween(a, from, to)).map((c) => {
    const s = a.stores.get(c.retailerId)!;
    return { ...claimRow(a, c), address: s.r.address, miles: s.miles };
  }).sort((x, y) => x.miles - y.miles || y.prize - x.prize || y.listedDate.localeCompare(x.listedDate));
  return { appUrl: opts.appUrl, area: areaLabel(opts.radiusMiles), radiusMiles: opts.radiusMiles, from, to, claims };
}

/**
 * Ticket art paths are local (/local/tiles/…, served only by the prototype's dev server).
 * Anything rendered outside the page (an iframe, an email client) needs absolute URLs.
 */
export function absoluteImages<T>(data: T, origin: string): T {
  const base = origin.replace(/\/$/, '');
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) =>
        [k, k === 'image' && typeof x === 'string' && x.startsWith('/local/') ? base + x : walk(x)]));
    }
    return v;
  };
  return walk(data) as T;
}
