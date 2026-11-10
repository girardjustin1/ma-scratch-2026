import { useEffect, useState } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, Globe01, HelpCircle,
  Image01, Key01, LinkExternal01, MarkerPin01, Phone, RefreshCw01, Star01, WifiOff,
} from '@untitledui/icons';
import { BadgeWithIcon } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { cx } from '@/utils/cx';
import type { Retailer } from '../domain/types';
import {
  clearPlaceCache, findPlace, mapsSearchUrl, streetViewUrl,
  type BusinessStatus, type PlaceError, type PlaceResult,
} from '../data/googlePlaces';
import { CaveatNote } from './Basics';

// Place tab, laid out like Google Maps' place card. Wording is kept here (not lib/copy.ts)
// because it only appears in this tab.
const COPY = {
  caveat: 'Store details come from Google, fetched when you open this tab. They are not Lottery data and are not stored.',
  loadedNote: 'Loaded from Google when you opened this tab.',
  noKeyTitle: 'No Google API key',
  noKey: 'Add GOOGLE_MAPS_API_KEY to web/.env.local, then restart the dev server (npm run dev). The key stays on the dev server and never reaches the browser.',
  notFoundTitle: 'No match on Google',
  notFound: 'Google returned no place for this name and address. The links below search Google Maps directly.',
  lowTitle: 'Possible mismatch',
  httpTitle: 'Google returned an error',
  offlineErrTitle: 'Could not reach Google',
  offlineErr: 'The request did not get through. Check the connection and try again.',
} as const;

export type PlaceViewState =
  | { kind: 'loading' }
  | { kind: 'error'; error: PlaceError }
  | { kind: 'loaded'; result: PlaceResult };

/**
 * Loads Google's details on mount. Opening the Place tab is the user's request (React Aria only
 * mounts a tab panel when it is selected), so this does not wait for the header's Online switch.
 * `online` is accepted for compatibility and ignored.
 */
export function PlaceDetails({ store }: { store: Retailer; online?: boolean }) {
  const [state, setState] = useState<PlaceViewState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    findPlace(store).then((r) => {
      if (live) setState(r.ok ? { kind: 'loaded', result: r } : { kind: 'error', error: r });
    });
    return () => { live = false; };
    // Keyed on the store id, so a parent re-creating the same store object does not refetch.
  }, [store.id, attempt]);

  const retry = () => {
    clearPlaceCache(store.id);
    setAttempt((n) => n + 1);
  };
  return <PlaceDetailsView store={store} state={state} onRetry={retry} />;
}

/** Presentational Place tab, driven by `state`. `now` pins the clock for stories. */
export function PlaceDetailsView({ store, state, onRetry, now }: { store: Retailer; state: PlaceViewState; onRetry?: () => void; now?: Date }) {
  const r = state.kind === 'loaded' ? state.result : undefined;
  const destination = r ? `${r.name} ${r.address ?? ''}`.trim() : `${store.name} ${store.address} ${store.town} MA`;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${r ? `&destination_place_id=${encodeURIComponent(r.placeId)}` : ''}`;
  const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

  return (
    <div className="flex flex-col gap-4">
      {state.kind === 'loading' && <LoadingSkeleton />}
      {state.kind === 'error' && <ErrorNotice error={state.error} onRetry={onRetry} />}
      {r && <Loaded store={store} r={r} now={now} />}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" color="secondary" iconLeading={MarkerPin01} href={directions} {...external}>Directions</Button>
        <Button size="sm" color="secondary" iconTrailing={LinkExternal01} href={r?.googleMapsUri ?? mapsSearchUrl(store)} {...external}>
          Open in Google Maps
        </Button>
        <Button size="sm" color="secondary" iconTrailing={LinkExternal01} href={streetViewUrl(store)} {...external}>Street View</Button>
      </div>

      {r && (
        <div>
          {/* Google Maps attribution for Places content shown without a Google map: plain text,
              12px+, grey, not translated or wrapped. */}
          <p translate="no" className="text-xs whitespace-nowrap text-tertiary" style={{ fontFamily: 'Roboto, sans-serif' }}>Google Maps</p>
          <p className="text-xs text-quaternary">{COPY.loadedNote}</p>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-secondary pt-3">
        <div className="text-xs">
          <p className="font-medium text-tertiary">From this app</p>
          <p className="text-secondary [overflow-wrap:anywhere]">Lottery retailer · {store.address}, {store.town}</p>
        </div>
        <CaveatNote dense>{COPY.caveat}</CaveatNote>
      </div>
    </div>
  );
}

// ---- States -------------------------------------------------------------------------

type IconType = React.FC<{ className?: string }>;

function Notice({ icon: Icon, title, children, action }: { icon: IconType; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-lg bg-secondary p-3 ring-1 ring-secondary ring-inset">
      <Icon className="mt-0.5 size-5 shrink-0 text-fg-secondary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary">{title}</p>
        <p className="mt-0.5 text-sm text-secondary">{children}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

function ErrorNotice({ error, onRetry }: { error: PlaceError; onRetry?: () => void }) {
  const retry = onRetry && <Button size="xs" color="secondary" iconLeading={RefreshCw01} onPress={onRetry}>Try again</Button>;
  switch (error.kind) {
    case 'no_key':
      return <Notice icon={Key01} title={COPY.noKeyTitle}>{COPY.noKey}</Notice>;
    case 'offline':
      return <Notice icon={WifiOff} title={COPY.offlineErrTitle} action={retry}>{COPY.offlineErr}</Notice>;
    case 'not_found':
      return <Notice icon={HelpCircle} title={COPY.notFoundTitle}>{COPY.notFound}</Notice>;
    case 'http':
      return (
        <Notice icon={AlertTriangle} title={COPY.httpTitle} action={retry}>
          The request failed (HTTP {error.status ?? '?'}{error.detail ? `, ${error.detail}` : ''}). Details are unavailable;
          the links below still work.
        </Notice>
      );
  }
}

function Bone({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-quaternary', className)} />;
}

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading details from Google" className="flex flex-col gap-3">
      <Bone className="h-[220px] w-full rounded-lg" />
      <Bone className="h-6 w-2/3" />
      <Bone className="h-4 w-1/2" />
      <Bone className="h-4 w-1/3" />
      <div className="mt-1 flex flex-col gap-3">
        <Bone className="h-4 w-4/5" />
        <Bone className="h-4 w-3/5" />
        <Bone className="h-4 w-2/5" />
      </div>
    </div>
  );
}

// ---- Hours --------------------------------------------------------------------------

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
interface Span { open: number; close: number; openLabel: string; closeLabel: string }
type DayHours = Span[] | '24h' | 'closed' | null;

/** "7:00 AM" -> minutes after midnight; a missing AM/PM borrows `fallback`. */
function toMinutes(t: string, fallback?: string): { min: number; mer: string } | null {
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  const mer = (m[3] ?? fallback)?.toUpperCase();
  if (!mer) return null;
  return { min: (Number(m[1]) % 12) * 60 + Number(m[2] ?? 0) + (mer === 'PM' ? 720 : 0), mer };
}

/** "11:00 PM" -> "11 PM"; "9:30 AM" stays. */
function shortTime(t: string) {
  return t.trim().replace(/:00(?=\s*[AP]M)/i, '');
}

/** Parses one of Google's weekdayDescriptions lines (English, as googlePlaces.ts requests). */
function parseDay(line: string | undefined): DayHours {
  if (!line) return null;
  const body = line.replace(/[   ]/g, ' ').replace(/^[A-Za-z]+:\s*/, '').trim();
  if (/open 24 hours/i.test(body)) return '24h';
  if (/^closed$/i.test(body)) return 'closed';
  const spans: Span[] = [];
  for (const part of body.split(',')) {
    const [a, b] = part.split(/\s*[–-]\s*/);
    if (!a || !b) return null;
    const end = toMinutes(b);
    const start = toMinutes(a, end?.mer);
    if (!start || !end) return null;
    const close = end.min <= start.min ? end.min + 1440 : end.min; // closes after midnight
    const openLabel = /[AP]M/i.test(a) ? a : `${a.trim()} ${end.mer}`;
    spans.push({ open: start.min, close, openLabel: shortTime(openLabel), closeLabel: shortTime(b) });
  }
  return spans;
}

function lineFor(lines: string[], day: number) {
  return lines.find((l) => l.startsWith(DAYS[day]));
}

/** "Open now · closes 11 PM" / "Closed now · opens 9:30 AM", from Google's openNow + weekly lines. */
export function hoursSummary(r: Pick<PlaceResult, 'openNow' | 'weekdayHours'>, now = new Date()): { status: string; detail?: string } | null {
  const lines = r.weekdayHours;
  if (!lines?.length) return null;
  const day = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = parseDay(lineFor(lines, day));
  if (r.openNow === undefined) return { status: 'Hours', detail: lineFor(lines, day)?.replace(/^[A-Za-z]+:\s*/, 'today ') };
  if (r.openNow) {
    if (today === '24h') return { status: 'Open now', detail: 'open 24 hours' };
    if (Array.isArray(today) && today.length) {
      const span = today.find((s) => s.open <= nowMin && nowMin < s.close) ?? today[today.length - 1];
      return { status: 'Open now', detail: `closes ${span.closeLabel}` };
    }
    return { status: 'Open now' };
  }
  if (Array.isArray(today)) {
    const later = today.find((s) => s.open > nowMin);
    if (later) return { status: 'Closed now', detail: `opens ${later.openLabel}` };
  }
  for (let i = 1; i <= 7; i++) {
    const d = (day + i) % 7;
    const next = parseDay(lineFor(lines, d));
    const when = i === 1 ? 'tomorrow' : DAYS[d].slice(0, 3);
    if (next === '24h') return { status: 'Closed now', detail: `opens ${when}` };
    if (Array.isArray(next) && next.length) return { status: 'Closed now', detail: `opens ${next[0].openLabel} ${when}` };
  }
  return { status: 'Closed now' };
}

// ---- Loaded -------------------------------------------------------------------------

const STATUS: Partial<Record<BusinessStatus, { label: string; icon: IconType }>> = {
  CLOSED_TEMPORARILY: { label: 'Temporarily closed', icon: AlertTriangle },
  CLOSED_PERMANENTLY: { label: 'Permanently closed', icon: AlertTriangle },
  FUTURE_OPENING: { label: 'Not open yet', icon: Clock },
};

function fmtMetres(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

function hostOf(uri: string) {
  try { return new URL(uri).hostname.replace(/^www\./, ''); } catch { return uri; }
}

/** Five grey stars, filled to the rating (monochrome rule). */
function Stars({ value }: { value: number }) {
  const row = (filled: boolean) => (
    <span className="flex">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star01 key={i} className={cx('size-3.5 shrink-0', filled ? 'fill-current text-fg-secondary' : 'text-fg-quaternary')} aria-hidden />
      ))}
    </span>
  );
  return (
    <span className="relative inline-flex" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {row(false)}
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${(Math.max(0, Math.min(5, value)) / 5) * 100}%` }}>
        {row(true)}
      </span>
    </span>
  );
}

function Placeholder({ className, label }: { className?: string; label: string }) {
  return (
    <div className={cx('flex items-center justify-center bg-tertiary', className)} aria-label={label} role="img">
      <Image01 className="size-6 text-fg-quaternary" aria-hidden />
    </div>
  );
}

/** Hero: Google photos one at a time (each is a billed request), else Street View. */
function Hero({ store, r }: { store: Retailer; r: PlaceResult }) {
  const [i, setI] = useState(0);
  const photos = r.photos;
  if (photos.length) {
    const idx = Math.min(i, photos.length - 1);
    const ph = photos[idx];
    const step = (d: number) => setI((n) => (n + d + photos.length) % photos.length);
    return (
      <figure>
        <div className="relative h-[220px] w-full overflow-hidden rounded-lg bg-tertiary">
          {ph.src
            ? <img key={ph.name} src={ph.src} alt={`Photo ${idx + 1} of ${photos.length} of ${r.name}, from Google`} className="size-full object-cover" />
            : <Placeholder className="size-full" label="Photo placeholder" />}
          {photos.length > 1 && (
            <>
              <Button size="xs" color="secondary" iconLeading={ChevronLeft} aria-label="Previous photo" onPress={() => step(-1)} className="absolute top-1/2 left-2 -translate-y-1/2" />
              <Button size="xs" color="secondary" iconLeading={ChevronRight} aria-label="Next photo" onPress={() => step(1)} className="absolute top-1/2 right-2 -translate-y-1/2" />
              <span className="absolute right-2 bottom-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-secondary tabular shadow-xs ring-1 ring-secondary">
                {idx + 1}/{photos.length}
              </span>
            </>
          )}
        </div>
        <figcaption className="mt-1 min-h-4 truncate text-xs text-tertiary">
          {ph.attributions.length > 0 && (
            <>
              Photo:{' '}
              {ph.attributions.map((a, j) => (
                <span key={a.displayName + j}>
                  {j > 0 && ', '}
                  {a.uri ? <a href={a.uri} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-secondary">{a.displayName}</a> : a.displayName}
                </span>
              ))}
            </>
          )}
        </figcaption>
      </figure>
    );
  }
  if (r.streetView.available) {
    return (
      <figure>
        {r.streetView.src
          ? <img src={r.streetView.src} alt={`Street View near ${store.address}, ${store.town}`} className="h-[220px] w-full rounded-lg bg-tertiary object-cover" />
          : <Placeholder className="h-[220px] w-full rounded-lg" label="Street View placeholder" />}
        <figcaption className="mt-1 text-xs text-tertiary">
          Street View{r.streetView.date ? ` · captured ${r.streetView.date}` : ''}{r.streetView.copyright ? ` · ${r.streetView.copyright}` : ''}
        </figcaption>
      </figure>
    );
  }
  return null;
}

function Loaded({ store, r, now }: { store: Retailer; r: PlaceResult; now?: Date }) {
  const [week, setWeek] = useState(false);
  const status = r.businessStatus ? STATUS[r.businessStatus] : undefined;
  const hours = hoursSummary(r, now);
  const today = (now ?? new Date()).getDay();
  const svIsHero = r.photos.length === 0 && r.streetView.available;
  const link = 'underline decoration-transparent underline-offset-2 hover:decoration-current';

  return (
    <div className="flex flex-col gap-4">
      {r.matchConfidence === 'low' && (
        <Notice icon={AlertTriangle} title={COPY.lowTitle}>
          Google's closest result is “{r.name}”
          {r.distanceM !== undefined ? `, ${fmtMetres(r.distanceM)} from the Lottery's location` : ''}. It may not be this
          store ({store.name}). Check before relying on it.
        </Notice>
      )}

      <Hero store={store} r={r} />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-lg font-semibold text-primary">{r.name}</h3>
          {r.matchConfidence === 'high' && (
            <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={MarkerPin01}>
              Match{r.distanceM !== undefined ? ` · ${fmtMetres(r.distanceM)}` : ''}
            </BadgeWithIcon>
          )}
        </div>
        {r.rating !== undefined ? (
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-secondary">
            <span className="font-medium text-primary tabular">{r.rating.toFixed(1)}</span>
            <Stars value={r.rating} />
            <span className="tabular">({(r.ratingCount ?? 0).toLocaleString('en-US')})</span>
          </div>
        ) : (
          <p className="mt-0.5 text-sm text-tertiary">No reviews on Google</p>
        )}
        {r.primaryType && <p className="text-sm text-tertiary">{r.primaryType}</p>}
        {status && (
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-primary">
            <status.icon className="size-4 text-fg-secondary" aria-hidden />
            {status.label}
          </p>
        )}
      </div>

      <dl className="flex flex-col gap-3 border-t border-secondary pt-3 text-sm">
        {r.address && <Row icon={MarkerPin01} label="Address">{r.address}</Row>}
        <Row icon={Clock} label="Hours">
          {hours ? (
            <div>
              <button
                type="button" onClick={() => setWeek((w) => !w)} aria-expanded={week}
                className="flex flex-wrap items-center gap-1 rounded text-left outline-brand focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="font-medium text-primary">{hours.status}</span>
                {hours.detail && <span className="text-secondary">· {hours.detail}</span>}
                {week ? <ChevronUp className="size-4 text-fg-quaternary" aria-hidden /> : <ChevronDown className="size-4 text-fg-quaternary" aria-hidden />}
                <span className="sr-only">{week ? 'Hide' : 'Show'} hours for the week</span>
              </button>
              {week && r.weekdayHours && (
                <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-secondary tabular">
                  {r.weekdayHours.map((l) => (
                    <li key={l} className={cx(l.startsWith(DAYS[today]) && 'font-semibold text-primary')}>{l}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <span className="text-tertiary">Hours not listed on Google</span>
          )}
        </Row>
        {r.websiteUri && (
          <Row icon={Globe01} label="Website">
            <a href={r.websiteUri} target="_blank" rel="noopener noreferrer" className={cx(link, '[overflow-wrap:anywhere]')}>{hostOf(r.websiteUri)}</a>
          </Row>
        )}
        {r.phone && (
          <Row icon={Phone} label="Phone">
            <a href={`tel:${r.phoneInternational ?? r.phone}`} className={link}>{r.phone}</a>
          </Row>
        )}
        <Row icon={Image01} label="Street View">
          <a href={streetViewUrl(store)} target="_blank" rel="noopener noreferrer" className={cx('flex items-center gap-2.5', link)}>
            {r.streetView.available && !svIsHero && (
              r.streetView.src
                ? <img src={r.streetView.src} alt="" loading="lazy" className="h-10 w-16 shrink-0 rounded bg-tertiary object-cover" />
                : <Placeholder className="h-10 w-16 shrink-0 rounded" label="Street View thumbnail placeholder" />
            )}
            <span>{r.streetView.available ? 'View Street View' : 'No Street View here · open on Google Maps'}</span>
          </a>
        </Row>
      </dl>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: IconType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 text-secondary">{children}</dd>
    </div>
  );
}
