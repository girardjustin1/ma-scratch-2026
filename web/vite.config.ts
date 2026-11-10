import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ---------------------------------------------------------------------------------------
// Google Places proxy (dev + preview only).
//
// The browser calls same-origin /google/... routes; this middleware adds the API key on the
// server side and forwards to Google. GOOGLE_MAPS_API_KEY is read from web/.env.local with
// loadEnv and has NO "VITE_" prefix, so Vite never inlines it into the client bundle.
// Without a key every route answers 503 {"error":"no_key"} and nothing is forwarded.
//
// Field masks are fixed here, per route, so the client cannot widen what is billed:
//   POST /google/places/places:searchText  -> places.googleapis.com/v1/places:searchText
//   GET  /google/places/places/<id>        -> places.googleapis.com/v1/places/<id>
//   GET  /google/photo/<photo name>?maxWidthPx=N -> v1/<photo name>/media (bytes streamed back)
//   GET  /google/streetview?location=lat,lon&size=WxH  -> Street View Static image
//   GET  /google/streetview/metadata?location=lat,lon  -> Street View metadata (free)
// Responses are passed through with Cache-Control: no-store; nothing is written to disk.
// ---------------------------------------------------------------------------------------

/** Place fields shown in the Place tab. Same list for search (prefixed) and details. */
const PLACE_FIELDS = [
  'id', 'displayName', 'formattedAddress', 'location', 'googleMapsUri', 'websiteUri',
  'nationalPhoneNumber', 'internationalPhoneNumber', 'rating', 'userRatingCount', 'businessStatus',
  'currentOpeningHours', 'regularOpeningHours', 'utcOffsetMinutes', 'photos', 'primaryTypeDisplayName',
];
const SEARCH_FIELD_MASK = PLACE_FIELDS.map((f) => `places.${f}`).join(',');
const DETAILS_FIELD_MASK = PLACE_FIELDS.join(',');

const PLACES_BASE = 'https://places.googleapis.com/v1';
const STREETVIEW_BASE = 'https://maps.googleapis.com/maps/api/streetview';
const PLACE_ID = /^places\/[A-Za-z0-9_-]+$/;
const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const LAT_LON = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Copies an upstream response to the client: status, content type and body only. */
async function relay(res: ServerResponse, upstream: Response) {
  res.statusCode = upstream.status;
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

function readBody(req: IncomingMessage, limit = 16_384): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) reject(new Error('body_too_large'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function clampInt(raw: string | null, min: number, max: number, fallback: number) {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Copies only known Street View parameters from the client query. */
function streetViewParams(q: URLSearchParams, key: string, image: boolean): URLSearchParams | null {
  const location = q.get('location') ?? '';
  if (!LAT_LON.test(location)) return null;
  const out = new URLSearchParams({ location });
  if (q.get('radius')) out.set('radius', String(clampInt(q.get('radius'), 1, 500, 50)));
  const source = q.get('source');
  if (source === 'outdoor' || source === 'default') out.set('source', source);
  if (image) {
    // The Street View Static docs give no explicit maximum; 640x640 is the long-standing limit.
    const [w, h] = (q.get('size') ?? '640x320').split('x');
    out.set('size', `${clampInt(w ?? null, 64, 640, 640)}x${clampInt(h ?? null, 64, 640, 320)}`);
    for (const p of ['heading', 'pitch', 'fov'] as const) {
      const v = q.get(p);
      if (v !== null && Number.isFinite(Number(v))) out.set(p, v);
    }
    out.set('return_error_code', 'true'); // 404 instead of a grey "no imagery" picture
  }
  out.set('key', key); // maps.googleapis.com takes the key as a query parameter; never logged
  return out;
}

function googleProxy(apiKey: string): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    // Mounted at /google, so req.url is the remainder, e.g. "/places/places:searchText".
    const url = new URL(req.url ?? '/', 'http://local');
    const path = decodeURIComponent(url.pathname);
    const route = path.startsWith('/places/') ? 'places'
      : path.startsWith('/photo/') ? 'photo'
      : path === '/streetview' || path === '/streetview/metadata' ? 'streetview'
      : null;
    if (!route) return next();
    if (!apiKey) return sendJson(res, 503, { error: 'no_key' }); // never forwarded

    try {
      if (route === 'places') {
        const rest = path.slice('/places/'.length);
        if (rest === 'places:searchText' && req.method === 'POST') {
          // Forward only the request fields the client needs; the mask is fixed above.
          const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
          if (typeof body.textQuery !== 'string' || !body.textQuery.trim()) {
            return sendJson(res, 400, { error: 'bad_request', detail: 'textQuery is required' });
          }
          const clean: Record<string, unknown> = { textQuery: body.textQuery.slice(0, 300) };
          for (const k of ['locationBias', 'languageCode', 'regionCode']) if (k in body) clean[k] = body[k];
          clean.pageSize = clampInt(String(body.pageSize ?? ''), 1, 5, 5);
          const upstream = await fetch(`${PLACES_BASE}/places:searchText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': SEARCH_FIELD_MASK },
            body: JSON.stringify(clean),
          });
          return await relay(res, upstream);
        }
        if (PLACE_ID.test(rest) && req.method === 'GET') {
          const q = new URLSearchParams();
          const lang = url.searchParams.get('languageCode');
          if (lang && /^[a-zA-Z-]{2,10}$/.test(lang)) q.set('languageCode', lang);
          const upstream = await fetch(`${PLACES_BASE}/${rest}${q.size ? `?${q}` : ''}`, {
            headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DETAILS_FIELD_MASK },
          });
          return await relay(res, upstream);
        }
        return sendJson(res, 404, { error: 'unknown_route' });
      }

      if (route === 'photo') {
        const name = path.slice('/photo/'.length);
        if (!PHOTO_NAME.test(name) || req.method !== 'GET') return sendJson(res, 404, { error: 'unknown_route' });
        const maxWidthPx = clampInt(url.searchParams.get('maxWidthPx'), 1, 1600, 480);
        // skipHttpRedirect=true returns {name, photoUri}; the image itself is then streamed back
        // so the browser only ever talks to this origin.
        const meta = await fetch(`${PLACES_BASE}/${name}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`, {
          headers: { 'X-Goog-Api-Key': apiKey },
        });
        if (!meta.ok) return await relay(res, meta);
        const { photoUri } = (await meta.json()) as { photoUri?: string };
        if (!photoUri) return sendJson(res, 502, { error: 'no_photo_uri' });
        return await relay(res, await fetch(photoUri));
      }

      // Street View image or metadata.
      const isMeta = path.endsWith('/metadata');
      const params = streetViewParams(url.searchParams, apiKey, !isMeta);
      if (!params || req.method !== 'GET') return sendJson(res, 400, { error: 'bad_request', detail: 'location=lat,lon is required' });
      return await relay(res, await fetch(`${STREETVIEW_BASE}${isMeta ? '/metadata' : ''}?${params}`));
    } catch {
      // Deliberately generic: error text from fetch can contain the upstream URL (and key).
      return sendJson(res, 502, { error: 'upstream_unreachable' });
    }
  };

  return {
    name: 'google-places-proxy',
    configureServer(server) {
      server.middlewares.use('/google', (req, res, next) => void handler(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/google', (req, res, next) => void handler(req, res, next));
    },
  };
}

// All assets are bundled from node_modules; nothing loads from a CDN, so the app
// works with the network disabled. Only the optional Mapbox basemap and the optional
// Google Place tab (through the proxy above) go online.
export default defineConfig(({ mode }) => {
  // Third argument '' loads unprefixed variables too; only this one is read, server-side.
  const apiKey = (loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '').GOOGLE_MAPS_API_KEY ?? '').trim();
  return {
    plugins: [react(), tailwindcss(), googleProxy(apiKey)],
    // "@/..." is Untitled UI's import root (src/uui), kept so its copied files stay unedited.
    resolve: { alias: { '@': fileURLToPath(new URL('./src/uui', import.meta.url)) } },
    server: { host: '127.0.0.1', port: 5180, strictPort: true },
    preview: { host: '127.0.0.1', port: 5181 },
  };
});
