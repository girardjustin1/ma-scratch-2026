import { inMassachusetts } from '../settings/settings';

/**
 * Address lookup for the Settings tab: one Google Places Text Search through the local proxy
 * (vite.config.ts, /google/...; the key stays server-side). Runs only when the user presses
 * Look up while online. Matches outside Massachusetts are dropped: the local data is MA only.
 */
export interface AddressMatch {
  label: string;
  address: string;
  lon: number;
  lat: number;
}

export type LookupResult =
  | { ok: true; matches: AddressMatch[] }
  | { ok: false; kind: 'no_key' | 'offline' | 'http' };

/** Bias toward the middle of the state; Google caps a bias circle at 50 km. */
const MA_BIAS = { circle: { center: { latitude: 42.25, longitude: -71.8 }, radius: 50_000 } };

interface GPlace {
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
}

export async function lookupAddress(query: string): Promise<LookupResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, kind: 'offline' };
  let res: Response;
  try {
    res = await fetch('/google/places/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textQuery: query.trim(), locationBias: MA_BIAS, languageCode: 'en', regionCode: 'US', pageSize: 5 }),
    });
  } catch {
    return { ok: false, kind: 'offline' };
  }
  if (res.status === 503) return { ok: false, kind: 'no_key' };
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) return { ok: false, kind: 'http' };
  const body = (await res.json()) as { places?: GPlace[] };
  const matches = (body.places ?? []).flatMap((p): AddressMatch[] => {
    if (!p.location || !p.formattedAddress) return [];
    const { longitude: lon, latitude: lat } = p.location;
    if (!inMassachusetts(lon, lat)) return [];
    return [{ label: p.displayName?.text || p.formattedAddress.split(',')[0], address: p.formattedAddress, lon, lat }];
  });
  return { ok: true, matches };
}

// ── Autocomplete ─────────────────────────────────────────────────────────────────────────────
// Suggestions while typing, grouped by a session token: any number of suggestion calls, then
// one address call for the picked suggestion ends the session (Google bills it as one session).
// Start a new token after each pick. Suggestions are limited to Massachusetts by the proxy.

export interface AddressSuggestion {
  placeId: string;
  main: string;
  secondary: string;
}

export type SuggestResult =
  | { ok: true; suggestions: AddressSuggestion[] }
  | { ok: false; kind: 'no_key' | 'offline' | 'http' };

export type ResolveResult = { ok: true; match: AddressMatch | null } | { ok: false; kind: 'no_key' | 'offline' | 'http' };

export interface AddressAutocomplete {
  suggest: (input: string, sessionToken: string, signal?: AbortSignal) => Promise<SuggestResult>;
  resolve: (s: AddressSuggestion, sessionToken: string) => Promise<ResolveResult>;
}

export const newSessionToken = () => crypto.randomUUID();

interface GSuggestion {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
  };
}

async function suggest(input: string, sessionToken: string, signal?: AbortSignal): Promise<SuggestResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, kind: 'offline' };
  let res: Response;
  try {
    res = await fetch('/google/places/places:autocomplete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ input: input.trim(), sessionToken }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { ok: false, kind: 'offline' };
  }
  if (res.status === 503) return { ok: false, kind: 'no_key' };
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) return { ok: false, kind: 'http' };
  const body = (await res.json()) as { suggestions?: GSuggestion[] };
  const suggestions = (body.suggestions ?? []).flatMap((s): AddressSuggestion[] => {
    const p = s.placePrediction;
    if (!p?.placeId) return [];
    const main = p.structuredFormat?.mainText?.text ?? p.text?.text ?? '';
    return main ? [{ placeId: p.placeId, main, secondary: p.structuredFormat?.secondaryText?.text ?? '' }] : [];
  });
  return { ok: true, suggestions };
}

async function resolve(s: AddressSuggestion, sessionToken: string): Promise<ResolveResult> {
  let res: Response;
  try {
    res = await fetch(`/google/places/address/${encodeURIComponent(s.placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`);
  } catch {
    return { ok: false, kind: 'offline' };
  }
  if (res.status === 503) return { ok: false, kind: 'no_key' };
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) return { ok: false, kind: 'http' };
  const p = (await res.json()) as GPlace;
  if (!p.location || !p.formattedAddress) return { ok: true, match: null };
  const { longitude: lon, latitude: lat } = p.location;
  if (!inMassachusetts(lon, lat)) return { ok: true, match: null };
  return { ok: true, match: { label: s.main, address: p.formattedAddress, lon, lat } };
}

export const addressAutocomplete: AddressAutocomplete = { suggest, resolve };
