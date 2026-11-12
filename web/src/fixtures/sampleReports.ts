// Synthetic report archive for Storybook: the sample report fixtures, re-dated. Not Lottery data.
import * as E from '../emails/fixtures';
import type { IssueData, IssueFile, IssueMeta, ReportIndex } from '../reports/reports';
import { issueSubject } from '../reports/render';
import { addDays } from '../lib/format';

const SUNDAY = '2026-11-08';
const issues: IssueFile[] = [];
const add = (meta: Omit<IssueMeta, 'subject' | 'publishedAt'>, content: IssueData) =>
  issues.push({ meta: { ...meta, subject: issueSubject(content), publishedAt: `${addDays(meta.to, 1)}T12:15:00.000Z` }, content });

for (let i = 0; i < 6; i++) {
  const to = addDays(SUNDAY, -7 * i), from = addDays(to, -6);
  add({ id: `weekly-${to}`, type: 'weekly', from, to, backfilled: i > 1 }, { type: 'weekly', data: { ...(i % 2 ? E.weeklyQuiet : E.weekly), from, to } });
}
add({ id: 'monthly-2026-10', type: 'monthly', from: '2026-10-01', to: '2026-10-31', backfilled: false }, { type: 'monthly', data: E.monthly });
add({ id: 'monthly-2026-09', type: 'monthly', from: '2026-09-01', to: '2026-09-30', backfilled: true }, { type: 'monthly', data: { ...E.monthly, from: '2026-09-01', to: '2026-09-30' } });
add({ id: `featured-${SUNDAY}`, type: 'featured', from: addDays(SUNDAY, -6), to: SUNDAY, backfilled: false }, { type: 'featured', data: E.featured });
add({ id: `ev-${SUNDAY}`, type: 'ev', from: addDays(SUNDAY, -6), to: SUNDAY, backfilled: false }, { type: 'ev', data: E.evWatch });
for (const [i, d] of [E.nearby, E.nearbyOne, E.nearby].entries()) {
  const day = addDays(SUNDAY, -2 * i);
  add({ id: `nearby-${day}`, type: 'nearby', from: day, to: day, backfilled: i > 0 }, { type: 'nearby', data: { ...d, from: day, to: day } });
}

export const sampleReportIndex: ReportIndex = { updatedAt: '2026-11-09T12:15:00.000Z', issues: issues.map((f) => f.meta).sort((a, b) => (a.to < b.to ? 1 : -1)) };
const byId = new Map(issues.map((f) => [f.meta.id, f]));
export const loadSampleIssue = (id: string) => Promise.resolve(byId.get(id) ?? null);
