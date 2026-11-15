import { useEffect, useMemo, useState } from 'react';
import { FileX02 } from '@untitledui/icons';
import { Badge } from '@/components/base/badges/badges';
import { cx } from '@/utils/cx';
import { useUrlState } from '../app/route';
import { Card, CaveatNote } from '../components/Basics';
import { EmailPreview } from '../components/EmailPreview';
import { absoluteImages } from '../emails/build';
import { fmtDate, fmtRange, fmtShortDate } from '../lib/format';
import {
  issuePath, isUnread, markSeen, REPORT_TYPES, type IssueFile, type IssueMeta, type ReportIndex, type ReportType,
} from '../reports/reports';
import { issueElement } from '../reports/render';

const TYPES = REPORT_TYPES.map((t) => t.type);

/** "Nov 2 – 8" for a period, a single date for a one-day issue, the month for monthly. */
function periodLabel(m: IssueMeta) {
  if (m.type === 'monthly') return new Date(m.from + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (m.type === 'nearby') return fmtDate(m.to);
  return fmtRange(m.from, m.to);
}

/**
 * Reports: the report designs, published on a schedule by the daily data job into a local
 * archive (reports/reports.ts). Left: report types with unread counts. Middle: the issue.
 * Right: that type's archive, newest first. Nothing is sent; unread state lives in this browser.
 */
const fetchIssue = (id: string) => fetch(issuePath(id)).then((r) => (r.ok ? (r.json() as Promise<IssueFile>) : null));

export function ReportsPage({ index, seen, loadIssue = fetchIssue }: {
  index: ReportIndex | null; seen: Set<string>;
  /** Loads one issue; Storybook passes sample issues instead of the local files. */
  loadIssue?: (id: string) => Promise<IssueFile | null>;
}) {
  const [type, setType] = useUrlState<ReportType>('type', 'weekly', TYPES);
  const issues = useMemo(() => (index?.issues ?? []).filter((m) => m.type === type), [index, type]);
  const [issueId, setIssueId] = useUrlState<string>('issue', '');
  const current = issues.find((m) => m.id === issueId) ?? issues[0];
  const [file, setFile] = useState<{ id: string; f: IssueFile | null } | null>(null);

  useEffect(() => {
    if (!current) return;
    let on = true;
    loadIssue(current.id)
      .then((f) => { if (on) setFile({ id: current.id, f }); })
      .catch(() => { if (on) setFile({ id: current.id, f: null }); });
    markSeen(current.id);
    return () => { on = false; };
  }, [current, loadIssue]);

  const unreadOf = (t: ReportType) => (index?.issues ?? []).filter((m) => m.type === t && isUnread(m, seen)).length;
  const pick = (t: ReportType) => { setType(t); setIssueId(''); };
  const shown = file && current && file.id === current.id ? file.f : undefined;
  const element = useMemo(() => (shown ? issueElement(absoluteImages(shown.content, window.location.origin)) : null), [shown]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-secondary bg-primary p-4">
        <div>
          <h1 className="text-md font-semibold text-primary">Reports</h1>
          <p className="text-xs text-tertiary">Published here on a schedule from your local data. Nothing is sent.</p>
        </div>
        <nav aria-label="Report types" className="flex flex-col gap-1">
          {REPORT_TYPES.map((t) => {
            const n = unreadOf(t.type);
            return (
              <button key={t.type} type="button" onClick={() => pick(t.type)} aria-current={type === t.type ? 'page' : undefined}
                className={cx('rounded-lg px-3 py-2 text-left outline-focus-ring transition focus-visible:outline-2',
                  type === t.type ? 'bg-tertiary' : 'hover:bg-primary_hover')}>
                <span className="flex items-center gap-2">
                  <span className={cx('flex-1 text-sm font-semibold', type === t.type ? 'text-primary' : 'text-secondary')}>{t.label}</span>
                  {n > 0 && <Badge type="modern" size="sm" color="gray">{n} new</Badge>}
                </span>
                <span className="block text-xs text-tertiary">{t.cadence}</span>
              </button>
            );
          })}
        </nav>
        <div className="flex-1" />
        <CaveatNote dense>
          The daily data job publishes each report once its data is posted. Each issue keeps the numbers it was built
          with. Reports and their archive stay on this computer.
        </CaveatNote>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto bg-secondary p-6">
        {!index ? (
          <Empty title="No reports yet"
            body="The archive is built by the daily data job (or npm --prefix web run reports:publish). It needs the local Lottery data, which is not loaded here." />
        ) : !current ? (
          <Empty title="No issues of this report yet" body="It will appear here when the next one is due." />
        ) : shown === null ? (
          <Empty title="This issue could not be loaded" body="Its file is missing from web/public/local/reports/issues/." />
        ) : element && shown ? (
          <EmailPreview key={current.id} subject={current.subject} email={element}
            note={`Published ${fmtDate(current.publishedAt.slice(0, 10))}${current.backfilled ? ' (rebuilt from past data)' : ''} · listed claims to ${fmtShortDate(current.to)}`} />
        ) : null}
      </div>

      <aside aria-label="Archive" className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-secondary bg-primary">
        <div className="sticky top-0 border-b border-secondary bg-primary px-4 py-3">
          <p className="text-sm font-semibold text-primary">Archive</p>
          <p className="text-xs text-tertiary">{REPORT_TYPES.find((t) => t.type === type)?.label} · {issues.length} {issues.length === 1 ? 'issue' : 'issues'}</p>
        </div>
        <ul className="flex flex-col p-2">
          {issues.map((m) => {
            const active = m.id === current?.id;
            const unread = isUnread(m, seen);
            return (
              <li key={m.id}>
                <button type="button" onClick={() => setIssueId(m.id)} aria-current={active ? 'true' : undefined}
                  className={cx('flex w-full gap-2 rounded-lg px-3 py-2 text-left outline-focus-ring transition focus-visible:outline-2',
                    active ? 'bg-tertiary' : 'hover:bg-primary_hover')}>
                  <span aria-hidden className={cx('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-fg-primary' : 'bg-transparent')} />
                  <span className="min-w-0">
                    <span className={cx('block text-sm tabular', unread ? 'font-semibold text-primary' : 'font-medium text-secondary')}>
                      {periodLabel(m)}{unread && <span className="sr-only"> (new)</span>}
                    </span>
                    {/* The type is the archive's heading, so drop the subject's "Weekly insights:" prefix. */}
                    <span className="line-clamp-2 text-xs text-tertiary">{m.subject.replace(/^[^:]{0,40}:\s*/, '')}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {(type === 'featured' || type === 'ev') && (
          <p className="px-4 pb-4 text-xs text-tertiary">
            Earlier weeks have no issue: they need a prize table saved after the week ended, and none was saved then.
          </p>
        )}
      </aside>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Card className="mx-auto max-w-[460px] p-5">
      <div className="flex items-start gap-3">
        <FileX02 className="mt-0.5 size-5 shrink-0 text-fg-quaternary" aria-hidden />
        <div>
          <h2 className="text-md font-semibold text-primary">{title}</h2>
          <p className="mt-1 text-sm text-tertiary">{body}</p>
        </div>
      </div>
    </Card>
  );
}
