import type { ExploreData } from '../pages/ExplorePage';
import type { AlertRadius, EvWatchData, FeaturedTicketsData, InsightsData, NearbyAlertData } from '../emails/types';
import { buildEvWatch, buildFeatured, buildInsights, buildNearbyAlert } from '../emails/build';
import { addDays } from '../lib/format';

/**
 * In-app reports: the report designs (React Email templates) published on a schedule into a
 * local archive under the gitignored web/public/local/reports/. Each issue keeps the data it
 * was built from, so it reads the same later even after prize tables change. Nothing is sent.
 *
 * Schedule (dates are listed dates; the daily data job publishes once a day's list is posted):
 * - weekly:   each Monday–Sunday week, once its Sunday is posted
 * - monthly:  each calendar month, once its last day is posted
 * - featured, ev: weekly with the Monday batch, only when a prize table saved on or after
 *   that Sunday exists (earlier weeks have none, so they are never rebuilt)
 * - nearby:   each listed date with at least one listed claim within the alert radius
 */
export type ReportType = 'weekly' | 'monthly' | 'featured' | 'ev' | 'nearby';

export const REPORT_TYPES: { type: ReportType; label: string; cadence: string }[] = [
  { type: 'weekly', label: 'Weekly insights', cadence: 'Mondays, for the week just ended' },
  { type: 'monthly', label: 'Monthly report', cadence: 'The 1st, for the month just ended' },
  { type: 'featured', label: 'Featured tickets', cadence: 'Mondays' },
  { type: 'ev', label: '+EV watch', cadence: 'Mondays, from the latest prize table' },
  { type: 'nearby', label: 'Nearby alert', cadence: 'Daily, when claims are listed nearby' },
];

/** Backfill on the first publish: how many past periods each archive starts with. */
export const BACKFILL = { weekly: 12, monthly: 3, nearbyDays: 14 } as const;
export const NEARBY_RADIUS: AlertRadius = 1;

export interface IssueMeta {
  id: string;
  type: ReportType;
  /** Period covered (listed dates). For featured and ev, `to` is the week's Sunday. */
  from: string;
  to: string;
  subject: string;
  publishedAt: string;
  /** Built on the first run from past data: never shown as unread. */
  backfilled: boolean;
}

export type IssueData =
  | { type: 'weekly' | 'monthly'; data: InsightsData }
  | { type: 'featured'; data: FeaturedTicketsData }
  | { type: 'ev'; data: EvWatchData }
  | { type: 'nearby'; data: NearbyAlertData };

export interface IssueFile { meta: IssueMeta; content: IssueData }
export interface ReportIndex { updatedAt: string; issues: IssueMeta[] }

export const issuePath = (id: string) => `/local/reports/issues/${id}.json`;
export const INDEX_PATH = '/local/reports/index.json';

// ── Schedule ─────────────────────────────────────────────────────────────────────────────

const weekday = (iso: string) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7; // Mon = 0
const lastSundayOnOrBefore = (iso: string) => addDays(iso, -((weekday(iso) + 1) % 7));
const monthEnd = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};

export interface PlannedIssue { id: string; type: ReportType; from: string; to: string }

/**
 * Every issue due as of the data's last posted day, newest first per type, within the
 * backfill window. The publisher skips ids that already exist, so this is safe to rerun and
 * fills any gap (a week the Mac was off) on the next run.
 */
export function plannedIssues(data: ExploreData, radiusClaimsOn: (day: string) => number): PlannedIssue[] {
  const last = data.coverage.dateTo;
  const out: PlannedIssue[] = [];
  const sunday = lastSundayOnOrBefore(last);
  for (let i = 0; i < BACKFILL.weekly; i++) {
    const to = addDays(sunday, -7 * i);
    if (addDays(to, -6) < data.coverage.dateFrom) break;
    out.push({ id: `weekly-${to}`, type: 'weekly', from: addDays(to, -6), to });
  }
  let mEnd = monthEnd(last) === last ? last : addDays(last.slice(0, 8) + '01', -1);
  for (let i = 0; i < BACKFILL.monthly; i++) {
    const from = mEnd.slice(0, 8) + '01';
    if (from < data.coverage.dateFrom) break;
    out.push({ id: `monthly-${mEnd.slice(0, 7)}`, type: 'monthly', from, to: mEnd });
    mEnd = addDays(from, -1);
  }
  // Featured and EV need a prize table saved after the week ended.
  if (data.ev?.asOf && data.ev.asOf >= sunday) {
    out.push({ id: `featured-${sunday}`, type: 'featured', from: addDays(sunday, -6), to: sunday });
    out.push({ id: `ev-${sunday}`, type: 'ev', from: addDays(sunday, -6), to: sunday });
  }
  for (let i = 0; i < BACKFILL.nearbyDays; i++) {
    const day = addDays(last, -i);
    if (day < data.coverage.dateFrom) break;
    if (radiusClaimsOn(day) > 0) out.push({ id: `nearby-${day}`, type: 'nearby', from: day, to: day });
  }
  return out;
}

/** Where an issue's button opens: the app tab and view it describes (app/route.ts deep links). */
export function issueLink(appUrl: string, p: PlannedIssue): string {
  const base = appUrl.replace(/\/$/, '');
  switch (p.type) {
    case 'weekly': case 'monthly': return `${base}/?metric=claims&from=${p.from}&to=${p.to}`;
    case 'nearby': return `${base}/?metric=claims&from=${p.from}&to=${p.to}&radius=${NEARBY_RADIUS}`;
    case 'featured': return `${base}/games`;
    case 'ev': return `${base}/ev`;
  }
}

/** Build one planned issue's content from the local data. */
export function buildIssue(data: ExploreData, p: PlannedIssue, appRoot: string): IssueData {
  const appUrl = issueLink(appRoot, p);
  switch (p.type) {
    case 'weekly': return { type: 'weekly', data: buildInsights(data, { period: 'week', to: p.to, appUrl }) };
    case 'monthly': return { type: 'monthly', data: buildInsights(data, { period: 'month', to: p.to, appUrl }) };
    case 'featured': return { type: 'featured', data: buildFeatured(data, { to: p.to, appUrl }) };
    case 'ev': return { type: 'ev', data: buildEvWatch(data, { appUrl }) };
    case 'nearby': return { type: 'nearby', data: buildNearbyAlert(data, { radiusMiles: NEARBY_RADIUS, from: p.from, to: p.to, appUrl }) };
  }
}

// ── Unread (in-app only; kept in this browser's localStorage) ─────────────────────────────

const SEEN_KEY = 'ma-scratch.reports.seen';

export function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
export function markSeen(id: string) {
  const s = readSeen();
  if (s.has(id)) return;
  s.add(id);
  localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
  window.dispatchEvent(new Event('reports-seen'));
}
export const isUnread = (m: IssueMeta, seen: Set<string>) => !m.backfilled && !seen.has(m.id);
