/**
 * Local settings: saved places (addresses looked up on the Settings tab) and which one the app
 * centers on. Kept in the gitignored web/public/local/settings.json, written only by the local
 * dev server (vite.config.ts, /local-settings). Addresses never go in a URL or into git.
 *
 * No browser or Node APIs here: the dev server, the app and the report publisher share it.
 */
export interface SavedPlace {
  id: string;
  /** Short name, e.g. "Home" or the place name Google returned. */
  label: string;
  /** Formatted address as Google returned it. */
  address: string;
  lon: number;
  lat: number;
}

export interface LocalSettings {
  places: SavedPlace[];
  /** The place the map, the radius and new reports center on; null = the default pin. */
  activeId: string | null;
  radiusMiles: number;
}

export const DEFAULT_SETTINGS: LocalSettings = { places: [], activeId: null, radiusMiles: 5 };
export const RADIUS_CHOICES = [1, 2, 5, 10] as const;
export const MAX_PLACES = 10;

/** Massachusetts, with a little margin: the local data is statewide MA only. */
export const MA_BOUNDS = { west: -73.6, east: -69.8, south: 41.15, north: 42.95 };
export const inMassachusetts = (lon: number, lat: number) =>
  lon >= MA_BOUNDS.west && lon <= MA_BOUNDS.east && lat >= MA_BOUNDS.south && lat <= MA_BOUNDS.north;

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);

/** Parse untrusted JSON into settings, or null if it is not valid. */
export function validSettings(x: unknown): LocalSettings | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (!Array.isArray(o.places) || o.places.length > MAX_PLACES) return null;
  const places: SavedPlace[] = [];
  for (const p of o.places as Record<string, unknown>[]) {
    const id = str(p?.id, 64), label = str(p?.label, 120), address = str(p?.address, 300);
    const lon = Number(p?.lon), lat = Number(p?.lat);
    if (!id || !label || !address || !Number.isFinite(lon) || !Number.isFinite(lat) || !inMassachusetts(lon, lat)) return null;
    if (places.some((q) => q.id === id)) return null;
    places.push({ id, label, address, lon, lat });
  }
  const activeId = o.activeId === null || o.activeId === undefined ? null : str(o.activeId, 64);
  const radiusMiles = Number(o.radiusMiles);
  if (!(RADIUS_CHOICES as readonly number[]).includes(radiusMiles)) return null;
  return { places, activeId: activeId && places.some((p) => p.id === activeId) ? activeId : null, radiusMiles };
}

export const activePlace = (s: LocalSettings | null): SavedPlace | null =>
  s?.places.find((p) => p.id === s.activeId) ?? null;

/** The dev-server endpoint; the file it writes is web/public/local/settings.json. */
export const SETTINGS_URL = '/local-settings';
