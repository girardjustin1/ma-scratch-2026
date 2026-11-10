import { useEffect, useState } from 'react';
import {
  AlertTriangle, Building07, ChevronDown, ChevronUp, Clock, Globe01, HelpCircle, Image01, Key01,
  LinkExternal01, MarkerPin01, Phone, RefreshCw01, Star01, WifiOff,
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

// Wording for the Place tab. Kept here (not lib/copy.ts) because it only appears in this tab.
const COPY = {
  caveat: 'Store details come from Google, fetched when you open this tab. They are not Lottery data and are not stored.',
  offline: 'Turn on Online in the header to load details from Google.',
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
  | { kind: 'offline' }
  | { kind: 'loading' }
  | { kind: 'error'; error: PlaceError }
  | { kind: 'loaded'; result: PlaceResult };

/** Loads Google's details for the store when online, then renders them. */
export function PlaceDetails({ store, online }: { store: Retailer; online: boolean }) {
  const [state, setState] = useState<PlaceViewState>(online ? { kind: 'loading' } : { kind: 'offline' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!online) {
      setState({ kind: 'offline' });
      return;
    }
    let live = true;
    setState({ kind: 'loading' });
    findPlace(store).then((r) => {
      if (live) setState(r.ok ? { kind: 'loaded', result: r } : { kind: 'error', error: r });
    });
    return () => { live = false; };
    // Keyed on the store id, so a parent re-creating the same store object does not refetch.
  }, [store.id, online, attempt]);

  const retry = () => {
    clearPlaceCache(store.id);
    setAttempt((n) => n + 1);
  };
  return <PlaceDetailsView store={store} state={state} onRetry={retry} />;
}

/** Presentational Place tab: everything is driven by `state`, so stories pass a ready result. */
export function PlaceDetailsView({ store, state, onRetry }: { store: Retailer; state: PlaceViewState; onRetry?: () => void }) {
  const result = state.kind === 'loaded' ? state.result : undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-tertiary">Lottery retailer</p>
        <h3 className="text-md font-semibold text-primary [overflow-wrap:anywhere]">{store.name}</h3>
        <p className="text-xs text-tertiary">{store.address}, {store.town}, MA</p>
      </div>

      {state.kind === 'offline' && <Notice icon={WifiOff} title="Offline">{COPY.offline}</Notice>}
      {state.kind === 'loading' && <LoadingSkeleton />}
      {state.kind === 'error' && <ErrorNotice error={state.error} onRetry={onRetry} />}
      {result && <Loaded store={store} r={result} />}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm" color="secondary" iconTrailing={LinkExternal01}
          href={result?.googleMapsUri ?? mapsSearchUrl(store)} target="_blank" rel="noopener noreferrer"
        >
          Open in Google Maps
        </Button>
        <Button size="sm" color="secondary" iconTrailing={LinkExternal01} href={streetViewUrl(store)} target="_blank" rel="noopener noreferrer">
          Street View
        </Button>
      </div>

      {result && (
        // Google Maps attribution for Places data shown without a Google map: plain text,
        // 12px+, grey, not translated or wrapped.
        <p translate="no" className="text-xs whitespace-nowrap text-tertiary" style={{ fontFamily: 'Roboto, sans-serif' }}>
          Google Maps
        </p>
      )}
      <CaveatNote dense>{COPY.caveat}</CaveatNote>
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
  const retry = onRetry && (
    <Button size="xs" color="secondary" iconLeading={RefreshCw01} onPress={onRetry}>Try again</Button>
  );
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
      <div className="flex gap-2">
        <Bone className="h-24 w-32" />
        <Bone className="h-24 w-32" />
        <Bone className="h-24 w-32" />
      </div>
      <Bone className="h-5 w-2/3" />
      <Bone className="h-4 w-1/2" />
      <Bone className="h-4 w-3/5" />
      <Bone className="h-4 w-2/5" />
    </div>
  );
}

// ---- Loaded -------------------------------------------------------------------------

const STATUS: Record<BusinessStatus, { label: string; icon: IconType }> = {
  OPERATIONAL: { label: 'Operational', icon: Building07 },
  CLOSED_TEMPORARILY: { label: 'Temporarily closed', icon: AlertTriangle },
  CLOSED_PERMANENTLY: { label: 'Permanently closed', icon: AlertTriangle },
  FUTURE_OPENING: { label: 'Not open yet', icon: Clock },
  BUSINESS_STATUS_UNSPECIFIED: { label: 'Status not listed', icon: HelpCircle },
};

function fmtMetres(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

function hostOf(uri: string) {
  try { return new URL(uri).hostname.replace(/^www\./, ''); } catch { return uri; }
}

function Loaded({ store, r }: { store: Retailer; r: PlaceResult }) {
  const [week, setWeek] = useState(false);
  const status = r.businessStatus ? STATUS[r.businessStatus] : undefined;
  return (
    <div className="flex flex-col gap-4">
      {r.matchConfidence === 'low' && (
        <Notice icon={AlertTriangle} title={COPY.lowTitle}>
          Google's closest result is “{r.name}”
          {r.distanceM !== undefined ? `, ${fmtMetres(r.distanceM)} from the Lottery's location` : ''}. It may not be this
          store ({store.name}). Check before relying on it.
        </Notice>
      )}

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-primary">{r.name}</p>
          {r.matchConfidence === 'high' && (
            <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={MarkerPin01}>
              Match{r.distanceM !== undefined ? ` · ${fmtMetres(r.distanceM)}` : ''}
            </BadgeWithIcon>
          )}
        </div>
        {r.primaryType && <p className="text-xs text-tertiary">{r.primaryType}</p>}
      </div>

      {r.photos.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {r.photos.map((ph, i) => (
            <figure key={ph.name} className="w-36 shrink-0">
              {ph.src ? (
                <img src={ph.src} alt={`Photo ${i + 1} of ${r.name} from Google`} loading="lazy" className="h-24 w-36 rounded-md bg-tertiary object-cover" />
              ) : (
                <div className="flex h-24 w-36 items-center justify-center rounded-md bg-tertiary" aria-label="Photo placeholder">
                  <Image01 className="size-5 text-fg-quaternary" aria-hidden />
                </div>
              )}
              {ph.attributions.length > 0 && (
                <figcaption className="mt-1 truncate text-xs text-tertiary">
                  Photo:{' '}
                  {ph.attributions.map((a, j) => (
                    <span key={a.displayName + j}>
                      {j > 0 && ', '}
                      {a.uri ? <a href={a.uri} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-secondary">{a.displayName}</a> : a.displayName}
                    </span>
                  ))}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      {r.streetView.available && (
        <figure>
          {r.streetView.src ? (
            <img src={r.streetView.src} alt={`Street View near ${store.address}, ${store.town}`} loading="lazy" className="aspect-[2/1] w-full rounded-md bg-tertiary object-cover" />
          ) : (
            <div className="flex aspect-[2/1] w-full items-center justify-center rounded-md bg-tertiary" aria-label="Street View placeholder">
              <Image01 className="size-6 text-fg-quaternary" aria-hidden />
            </div>
          )}
          <figcaption className="mt-1 text-xs text-tertiary">
            Street View{r.streetView.date ? ` · captured ${r.streetView.date}` : ''}{r.streetView.copyright ? ` · ${r.streetView.copyright}` : ''}
          </figcaption>
        </figure>
      )}

      <dl className="flex flex-col gap-2.5 text-sm">
        {r.address && <Row icon={MarkerPin01} label="Address">{r.address}</Row>}
        <Row icon={Clock} label="Hours">
          {r.weekdayHours?.length ? (
            <div>
              <p>
                <span className="font-medium text-primary">{r.openNow === undefined ? 'Hours listed' : r.openNow ? 'Open now' : 'Closed now'}</span>
                {r.todayHours && <span className="text-secondary"> · {r.todayHours.replace(/^[A-Za-z]+:\s*/, 'Today ')}</span>}
              </p>
              <Button
                size="xs" color="link-gray" iconTrailing={week ? ChevronUp : ChevronDown} onPress={() => setWeek((w) => !w)}
                aria-expanded={week} className="mt-1"
              >
                {week ? 'Hide week' : 'Show week'}
              </Button>
              {week && (
                <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-secondary tabular">
                  {r.weekdayHours.map((l) => <li key={l} className={cx(l === r.todayHours && 'font-semibold text-primary')}>{l}</li>)}
                </ul>
              )}
            </div>
          ) : (
            <span className="text-tertiary">Hours not listed on Google</span>
          )}
        </Row>
        {r.phone && (
          <Row icon={Phone} label="Phone">
            <a href={`tel:${r.phoneInternational ?? r.phone}`} className="underline decoration-transparent underline-offset-2 hover:decoration-current">{r.phone}</a>
          </Row>
        )}
        {r.websiteUri && (
          <Row icon={Globe01} label="Website">
            <a href={r.websiteUri} target="_blank" rel="noopener noreferrer" className="underline decoration-transparent underline-offset-2 [overflow-wrap:anywhere] hover:decoration-current">
              {hostOf(r.websiteUri)}
            </a>
          </Row>
        )}
        <Row icon={Star01} label="Rating">
          {r.rating !== undefined ? (
            <span><span className="font-medium text-primary tabular">{r.rating.toFixed(1)}</span> of 5 · {r.ratingCount ?? 0} Google reviews</span>
          ) : (
            <span className="text-tertiary">No rating on Google</span>
          )}
        </Row>
        {status && (
          <Row icon={status.icon} label="Status">{status.label}</Row>
        )}
      </dl>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: IconType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 text-secondary">{children}</dd>
    </div>
  );
}
