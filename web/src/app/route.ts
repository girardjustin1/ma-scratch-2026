import { createContext, useCallback, useContext, useState } from 'react';
import type { TabKey } from './AppShell';

/**
 * Deep links for the prototype: each tab has a path, and the state worth sharing lives in
 * the query string (replaceState, so tweaking a filter doesn't pile up history entries).
 * Routing is on only in the real app (main.tsx); Storybook and tests leave the URL alone.
 * The search pin is never written to the URL.
 */
export const TAB_PATHS: Record<TabKey, string> = {
  map: '/', games: '/games', ev: '/ev', stats: '/stats', model: '/model', data: '/data', emails: '/emails',
};

export function tabFromPath(path: string): TabKey | null {
  const p = path.replace(/\/+$/, '') || '/';
  const hit = Object.entries(TAB_PATHS).find(([, v]) => v === p);
  return hit ? (hit[0] as TabKey) : null;
}

/** True inside the routed app; false in Storybook. */
export const RoutingContext = createContext(false);
export const useRouted = () => useContext(RoutingContext);

export function readParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}

/** Set or remove (null, undefined, '') query params in place, without a history entry. */
export function writeParams(values: Record<string, string | null | undefined>) {
  const q = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(values)) {
    if (v === null || v === undefined || v === '') q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  const next = window.location.pathname + (s ? `?${s}` : '');
  if (next !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', next);
}

/**
 * useState mirrored to one query param. Starts from the URL when routed (if the value is
 * allowed), and drops the param when the value is back at its default.
 */
export function useUrlState<T extends string>(key: string, fallback: T, allowed?: readonly T[]): [T, (v: T) => void] {
  const routed = useRouted();
  const [value, setValue] = useState<T>(() => {
    const v = routed ? readParam(key) : null;
    return v !== null && (!allowed || allowed.includes(v as T)) ? (v as T) : fallback;
  });
  const set = useCallback((v: T) => {
    setValue(v);
    if (routed) writeParams({ [key]: v === fallback ? null : v });
  }, [routed, key, fallback]);
  return [value, set];
}
