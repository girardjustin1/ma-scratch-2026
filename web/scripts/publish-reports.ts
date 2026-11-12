/**
 * Publishes due in-app reports into web/public/local/reports/ (gitignored): one JSON per issue
 * plus index.json. Run by the daily data job after the local view is rebuilt:
 *   npm --prefix web run reports:publish
 * Idempotent: an issue that exists is never rebuilt, so published issues stay as they were.
 * The first run backfills (reports/reports.ts BACKFILL); those issues are marked backfilled
 * and never show as unread. Nothing is sent anywhere.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localViewFromFiles, type LocalViewFile } from '../src/data/localView';
import type { PaceFile } from '../src/domain/pace';
import { buildIssue, plannedIssues, NEARBY_RADIUS, type IssueFile, type IssueMeta, type ReportIndex } from '../src/reports/reports';
import { issueSubject } from '../src/reports/render';
import { distance, point } from '@turf/turf';

const LOCAL = resolve(dirname(fileURLToPath(import.meta.url)), '../public/local');
const OUT = join(LOCAL, 'reports');
const APP_URL = 'http://127.0.0.1:5180';

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
function writeAtomic(p: string, value: unknown) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p + '.part', JSON.stringify(value));
  renameSync(p + '.part', p);
}

const viewPath = join(LOCAL, 'view.json');
if (!existsSync(viewPath)) {
  console.log('reports: no local view (web/public/local/view.json); nothing to publish');
  process.exit(0);
}
const pacePath = join(LOCAL, 'pace.json');
const data = localViewFromFiles(readJson<LocalViewFile>(viewPath), existsSync(pacePath) ? readJson<PaceFile>(pacePath) : null);

// Listed claims per day at stores within the nearby-alert radius of the pin.
const pin = point(data.coverage.center);
const near = new Set(data.retailers
  .filter((r) => distance(point([r.lon, r.lat]), pin, { units: 'miles' }) <= NEARBY_RADIUS).map((r) => r.id));
const nearbyByDay = new Map<string, number>();
for (const c of data.claims) if (near.has(c.retailerId)) nearbyByDay.set(c.listedDate, (nearbyByDay.get(c.listedDate) ?? 0) + 1);

const indexPath = join(OUT, 'index.json');
const index: ReportIndex = existsSync(indexPath) ? readJson<ReportIndex>(indexPath) : { updatedAt: '', issues: [] };
const firstRun = index.issues.length === 0;
const have = new Set(index.issues.map((m) => m.id));
const planned = plannedIssues(data, (day) => nearbyByDay.get(day) ?? 0);
// On the first run, everything but the newest issue of each type is backfill.
const newestOfType = new Map<string, string>();
for (const p of planned) if (!newestOfType.has(p.type) || p.to > planned.find((q) => q.id === newestOfType.get(p.type))!.to) newestOfType.set(p.type, p.id);

const now = new Date().toISOString();
const published: IssueMeta[] = [];
const failed: string[] = [];
for (const p of planned) {
  if (have.has(p.id)) continue;
  try {
    const content = buildIssue(data, p, APP_URL);
    const meta: IssueMeta = {
      id: p.id, type: p.type, from: p.from, to: p.to, subject: issueSubject(content), publishedAt: now,
      backfilled: firstRun && newestOfType.get(p.type) !== p.id,
    };
    writeAtomic(join(OUT, 'issues', `${p.id}.json`), { meta, content } satisfies IssueFile);
    published.push(meta);
  } catch (e) {
    failed.push(`${p.id}: ${(e as Error).message}`);
  }
}

if (published.length) {
  const issues = [...index.issues, ...published].sort((a, b) => (a.to === b.to ? a.id.localeCompare(b.id) : a.to < b.to ? 1 : -1));
  writeAtomic(indexPath, { updatedAt: now, issues } satisfies ReportIndex);
}
const by = published.reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.type]: (acc[m.type] ?? 0) + 1 }), {});
console.log(`reports: data through ${data.coverage.dateTo}; published ${published.length}`
  + (published.length ? ` (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')})` : '')
  + `; ${index.issues.length + published.length} in archive${firstRun && published.length ? ' (first run: backfilled)' : ''}`);
if (failed.length) {
  console.error(`reports: ${failed.length} failed\n  ${failed.join('\n  ')}`);
  process.exit(1);
}
