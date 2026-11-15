import type { Retailer } from '../domain/types';

// Google details for one licensed retailer, fetched through the dev/preview proxy in
// vite.config.ts (/google/...), which holds the API key. Results live in an in-memory Map for
// this browser session only: Google's terms forbid storing place content, so nothing goes to
// localStorage, IndexedDB or disk. API shapes: Places API (New) Text Search, Place Photos
// (New), Street View Static API + metadata (developers.google.com, checked 2026-11-10).

/** How far (metres) Google's place may be from the Lottery's point and still count as "high". */
const HIGH_MATCH_METRES = 150;
/** Text Search bias circle around the store. */
const BIAS_RADIUS_METRES = 300;
/**
 * Big stores sit back from the street: Google's point is the building, the Lottery's is the
 * address point, and live checks put correct matches 200–300 m apart. Within this distance a
 * match is still "high" when the house number and street name agree too.
 */
const HIGH_MATCH_SAME_ADDRESS_METRES = 400;
/** Name similarity (0..1) needed for a "high" match. */
const NAME_SIMILAR = 0.5;
/** Photos requested per place; each one is a billed Place Photo request. */
export const MAX_PHOTOS = 3;
const PHOTO_WIDTH_PX = 480;
const STREETVIEW_SIZE = '640x320';

// ---- Types --------------------------------------------------------------------------

export type PlaceErrorKind = 'no_key' | 'offline' | 'not_found' | 'http';

export interface PlaceError {
  ok: false;
  kind: PlaceErrorKind;
  /** HTTP status for kind 'http'. */
  status?: number;
  /** Short technical detail (Google's error status or message), never shown as a number. */
  detail?: string;
}

export interface PhotoAttribution {
  displayName: string;
  uri?: string;
}

export interface PlacePhoto {
  /** Google's photo resource name. Not cacheable; it can expire. */
  name: string;
  widthPx: number;
  heightPx: number;
  /** Same-origin proxy URL for the image. Undefined in fixtures (renders a placeholder). */
  src?: string;
  /** Must be shown with the photo when present (Google's photo attribution rule). */
  attributions: PhotoAttribution[];
}

export type BusinessStatus = 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | 'FUTURE_OPENING' | 'BUSINESS_STATUS_UNSPECIFIED';

export interface StreetViewInfo {
  /** Street View metadata status: OK, ZERO_RESULTS, NOT_FOUND, REQUEST_DENIED, ... or 'unchecked'. */
  status: string;
  available: boolean;
  /** Same-origin proxy URL for the image when available. Undefined in fixtures. */
  src?: string;
  /** Capture date from metadata, "YYYY" or "YYYY-MM". */
  date?: string;
  copyright?: string;
}

export interface PlaceResult {
  ok: true;
  placeId: string;
  name: string;
  primaryType?: string;
  address?: string;
  location?: { lat: number; lon: number };
  /** Metres between Google's place and the Lottery's retailer point. */
  distanceM?: number;
  /** 0..1 token overlap between the Lottery's name and Google's name. */
  nameSimilarity: number;
  /** 'high' = similar name and within ~150 m (or within 400 m at the same house number + street). Else 'low', shown as a warning. */
  matchConfidence: 'high' | 'low';
  googleMapsUri?: string;
  websiteUri?: string;
  phone?: string;
  phoneInternational?: string;
  rating?: number;
  ratingCount?: number;
  businessStatus?: BusinessStatus;
  openNow?: boolean;
  /** Google's localized lines, e.g. "Monday: 6:00 AM – 10:00 PM". */
  weekdayHours?: string[];
  /** The line in weekdayHours for today at the place (by utcOffsetMinutes). */
  todayHours?: string;
  photos: PlacePhoto[];
  streetView: StreetViewInfo;
}

// ---- Links that need no API --------------------------------------------------------

export function mapsSearchUrl(store: Retailer): string {
  const q = `${store.name} ${store.address} ${store.town} MA`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function streetViewUrl(store: Retailer): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${store.lat},${store.lon}`;
}

// ---- Matching ----------------------------------------------------------------------

const STOP = new Set(['the', 'inc', 'llc', 'corp', 'co', 'store', 'stores', 'of', 'and', 'ma', 'mass', 'dba']);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/#\s*\d+/g, ' ') // store numbers: "CUMBERLAND FARMS #2311"
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t)),
  );
}

/** Share of the shorter name's words found in the other (handles "STOP & SHOP #45" vs "Stop & Shop"). */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let hit = 0;
  for (const t of small) if (big.has(t) || [...big].some((u) => u.length > 3 && t.length > 3 && (u.startsWith(t) || t.startsWith(u)))) hit++;
  return hit / small.size;
}

/** House number + first street-name word, e.g. "375 CENTRE ST" -> "375 centre". */
function streetKey(address: string | undefined): string | null {
  const m = address?.toLowerCase().match(/^\s*(\d+[a-z]?)(?:\s*-\s*\d+[a-z]?)?\s+([a-z0-9]+)/);
  return m ? `${m[1]} ${m[2]}` : null;
}

/** Same house number and street name, ignoring suffixes (St/Street) and town. */
export function sameStreetAddress(lotteryAddress: string, googleAddress: string | undefined): boolean {
  const a = streetKey(lotteryAddress);
  return a !== null && a === streetKey(googleAddress);
}

export function distanceMetres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---- Google response shapes (only the fields in the proxy's field mask) -------------

interface GPlace {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: BusinessStatus;
  currentOpeningHours?: GHours;
  regularOpeningHours?: GHours;
  utcOffsetMinutes?: number;
  photos?: { name: string; widthPx: number; heightPx: number; authorAttributions?: { displayName: string; uri?: string; photoUri?: string }[] }[];
  primaryTypeDisplayName?: { text: string };
}
interface GHours { openNow?: boolean; weekdayDescriptions?: string[] }
interface GStreetViewMeta { status: string; date?: string; copyright?: string; location?: { lat: number; lng: number } }

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Today's line from weekdayDescriptions. Google warns not to assume the week's start, so match by name. */
function todayLine(lines: string[] | undefined, utcOffsetMinutes: number | undefined, now = new Date()): string | undefined {
  if (!lines?.length) return undefined;
  const local = utcOffsetMinutes === undefined ? now : new Date(now.getTime() + utcOffsetMinutes * 60_000);
  const day = WEEKDAYS[utcOffsetMinutes === undefined ? local.getDay() : local.getUTCDay()];
  return lines.find((l) => l.startsWith(day));
}

// ---- Fetching ----------------------------------------------------------------------

async function errorFrom(res: Response): Promise<PlaceError> {
  let body: { error?: string | { status?: string; message?: string } } = {};
  try { body = await res.json(); } catch { /* not JSON (e.g. Storybook has no proxy) */ }
  if (res.status === 503 && body.error === 'no_key') return { ok: false, kind: 'no_key' };
  if (res.status === 502 && body.error === 'upstream_unreachable') return { ok: false, kind: 'offline' };
  const detail = typeof body.error === 'string' ? body.error : body.error?.status ?? body.error?.message;
  return { ok: false, kind: 'http', status: res.status, detail };
}

async function checkStreetView(lat: number, lon: number): Promise<StreetViewInfo> {
  const location = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  try {
    const res = await fetch(`/google/streetview/metadata?location=${location}&source=outdoor`);
    if (!res.ok) return { status: `HTTP_${res.status}`, available: false };
    const m = (await res.json()) as GStreetViewMeta;
    if (m.status !== 'OK') return { status: m.status, available: false };
    return {
      status: 'OK',
      available: true,
      src: `/google/streetview?location=${location}&size=${STREETVIEW_SIZE}&source=outdoor&fov=80`,
      date: m.date,
      copyright: m.copyright,
    };
  } catch {
    return { status: 'unreachable', available: false };
  }
}

function toResult(store: Retailer, p: GPlace, streetView: StreetViewInfo): PlaceResult {
  const name = p.displayName?.text ?? '';
  const location = p.location ? { lat: p.location.latitude, lon: p.location.longitude } : undefined;
  const distanceM = location ? distanceMetres(store, location) : undefined;
  const similarity = nameSimilarity(store.name, name);
  const hours = p.currentOpeningHours ?? p.regularOpeningHours;
  return {
    ok: true,
    placeId: p.id,
    name,
    primaryType: p.primaryTypeDisplayName?.text,
    address: p.formattedAddress,
    location,
    distanceM,
    nameSimilarity: similarity,
    matchConfidence:
      similarity >= NAME_SIMILAR && distanceM !== undefined
      && (distanceM <= HIGH_MATCH_METRES || (distanceM <= HIGH_MATCH_SAME_ADDRESS_METRES && sameStreetAddress(store.address, p.formattedAddress)))
        ? 'high' : 'low',
    googleMapsUri: p.googleMapsUri,
    websiteUri: p.websiteUri,
    phone: p.nationalPhoneNumber,
    phoneInternational: p.internationalPhoneNumber,
    rating: p.rating,
    ratingCount: p.userRatingCount,
    businessStatus: p.businessStatus,
    openNow: p.currentOpeningHours?.openNow,
    weekdayHours: hours?.weekdayDescriptions,
    todayHours: todayLine(hours?.weekdayDescriptions, p.utcOffsetMinutes),
    photos: (p.photos ?? []).slice(0, MAX_PHOTOS).map((ph) => ({
      name: ph.name,
      widthPx: ph.widthPx,
      heightPx: ph.heightPx,
      src: `/google/photo/${ph.name}?maxWidthPx=${PHOTO_WIDTH_PX}`,
      attributions: (ph.authorAttributions ?? []).map((a) => ({ displayName: a.displayName, uri: a.uri })),
    })),
    streetView,
  };
}

/** Best candidate: similar names first, then nearest. */
function pickBest(store: Retailer, places: GPlace[]): GPlace | undefined {
  const scored = places.map((p) => {
    const d = p.location ? distanceMetres(store, { lat: p.location.latitude, lon: p.location.longitude }) : Infinity;
    const s = nameSimilarity(store.name, p.displayName?.text ?? '');
    return { p, d, similar: s >= NAME_SIMILAR, s };
  });
  scored.sort((a, b) => Number(b.similar) - Number(a.similar) || a.d - b.d || b.s - a.s);
  return scored[0]?.p;
}

async function load(store: Retailer): Promise<PlaceResult | PlaceError> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, kind: 'offline' };
  const streetViewPromise = checkStreetView(store.lat, store.lon);
  let res: Response;
  try {
    res = await fetch('/google/places/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        textQuery: `${store.name} ${store.address} ${store.town}, MA`,
        locationBias: { circle: { center: { latitude: store.lat, longitude: store.lon }, radius: BIAS_RADIUS_METRES } },
        languageCode: 'en',
        regionCode: 'US',
        pageSize: 5,
      }),
    });
  } catch {
    return { ok: false, kind: 'offline' };
  }
  if (!res.ok) return errorFrom(res);
  const body = (await res.json()) as { places?: GPlace[] };
  const best = pickBest(store, body.places ?? []);
  if (!best) return { ok: false, kind: 'not_found' };
  return toResult(store, best, await streetViewPromise);
}

const cache = new Map<string, Promise<PlaceResult | PlaceError>>();

/**
 * Google's details for a licensed retailer. One Text Search (fixed field mask in the proxy) plus
 * one free Street View metadata check. Cached in memory per store for this session; offline,
 * no-key and HTTP errors are not cached, so a retry fetches again.
 */
export function findPlace(store: Retailer): Promise<PlaceResult | PlaceError> {
  const hit = cache.get(store.id);
  if (hit) return hit;
  const p = load(store).then((r) => {
    if (!r.ok && r.kind !== 'not_found') cache.delete(store.id);
    return r;
  });
  cache.set(store.id, p);
  return p;
}

/** Forget one store (or everything), e.g. for a Retry button. */
export function clearPlaceCache(storeId?: string) {
  if (storeId) cache.delete(storeId);
  else cache.clear();
}
