import { useEffect, useState } from 'react';
import { INDEX_PATH, isUnread, readSeen, type ReportIndex } from './reports';

/** How often an open app looks for newly published reports. */
const POLL_MS = 5 * 60_000;

/**
 * The local report archive's index, refetched every few minutes and when the window regains
 * focus, plus which issues this browser has opened. null = no archive (no local data or the
 * publisher has not run).
 */
export function useReports(enabled: boolean) {
  const [index, setIndex] = useState<ReportIndex | null>(null);
  const [seen, setSeen] = useState(() => (enabled ? readSeen() : new Set<string>()));

  useEffect(() => {
    if (!enabled) return;
    let on = true;
    const load = () => fetch(INDEX_PATH, { cache: 'no-store' })
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? (r.json() as Promise<ReportIndex>) : null))
      .then((i) => { if (on) setIndex((cur) => (cur?.updatedAt === i?.updatedAt ? cur : i)); })
      .catch(() => {});
    const refreshSeen = () => setSeen(readSeen());
    void load();
    const id = window.setInterval(load, POLL_MS);
    const onFocus = () => { void load(); refreshSeen(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('reports-seen', refreshSeen);
    window.addEventListener('storage', refreshSeen);
    return () => {
      on = false;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('reports-seen', refreshSeen);
      window.removeEventListener('storage', refreshSeen);
    };
  }, [enabled]);

  const unread = index ? index.issues.filter((m) => isUnread(m, seen)).length : 0;
  return { index, seen, unread };
}
