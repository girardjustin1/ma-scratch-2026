import { useEffect, useState } from 'react';
import { INDEX_PATH, isUnread, readSeen, type ReportIndex } from './reports';

/** How often an open app looks for newly published reports. */
const POLL_MS = 5 * 60_000;

/**
 * The local report archive's index, refetched every few minutes and when the window regains
 * focus, plus which issues this browser has opened. null = no archive (no local data or the
 * publisher has not run). `fixed` is a static archive (the public demo's sample reports):
 * nothing is fetched, but opened issues are still tracked.
 */
export function useReports(enabled: boolean, fixed?: ReportIndex) {
  const tracked = enabled || !!fixed;
  const [fetched, setIndex] = useState<ReportIndex | null>(null);
  const index = fixed ?? fetched;
  const [seen, setSeen] = useState(() => (tracked ? readSeen() : new Set<string>()));

  useEffect(() => {
    if (!tracked) return;
    const refreshSeen = () => setSeen(readSeen());
    window.addEventListener('reports-seen', refreshSeen);
    window.addEventListener('storage', refreshSeen);
    window.addEventListener('focus', refreshSeen);
    return () => {
      window.removeEventListener('reports-seen', refreshSeen);
      window.removeEventListener('storage', refreshSeen);
      window.removeEventListener('focus', refreshSeen);
    };
  }, [tracked]);

  useEffect(() => {
    if (!enabled || fixed) return;
    let on = true;
    const load = () => fetch(INDEX_PATH, { cache: 'no-store' })
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? (r.json() as Promise<ReportIndex>) : null))
      .then((i) => { if (on) setIndex((cur) => (cur?.updatedAt === i?.updatedAt ? cur : i)); })
      .catch(() => {});
    void load();
    const id = window.setInterval(load, POLL_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      on = false;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, fixed]);

  const unread = index ? index.issues.filter((m) => isUnread(m, seen)).length : 0;
  return { index, seen, unread };
}
