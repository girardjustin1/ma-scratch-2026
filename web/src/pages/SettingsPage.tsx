import { useMemo, useState } from 'react';
import { MarkerPin01, SearchLg, Trash01 } from '@untitledui/icons';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Input } from '@/components/base/input/input';
import { cx } from '@/utils/cx';
import { Card, CaveatNote, Stat } from '../components/Basics';
import type { ExploreData } from './ExplorePage';
import type { AddressMatch, LookupResult } from '../data/geocode';
import { storesWithin, summarizeAround } from '../settings/around';
import {
  activePlace, DEFAULT_SETTINGS, MAX_PLACES, RADIUS_CHOICES, type LocalSettings, type SavedPlace,
} from '../settings/settings';
import { fmtDate, fmtInt, fmtRange, fmtUsd } from '../lib/format';

const SELECTED = 'selected:bg-tertiary selected:text-primary';

const LOOKUP_ERRORS: Record<Exclude<LookupResult, { ok: true }>['kind'], string> = {
  no_key: 'Address lookup needs GOOGLE_MAPS_API_KEY in web/.env.local.',
  offline: 'Could not reach Google. Check the connection and try again.',
  http: 'Google returned an error. Try again, or check the address.',
};

/**
 * Settings: saved places. Look up an address (Google, through the local proxy), save it, and
 * make it the active place: the map pin, the radius and new reports center on it. The summary
 * shows what the local data holds around the active place. Places stay on this computer.
 */
export function SettingsPage({
  data, defaultCenter, settings, onChange, lookup, online, onGoOnline, onOpenMap, onOpenGames, demo = false,
}: {
  data: ExploreData;
  /** The default pin (web/.env.local, or the sample pin). */
  defaultCenter: [number, number];
  /** null = settings cannot be saved here (Storybook, the public demo). */
  settings: LocalSettings | null;
  onChange?: (s: LocalSettings) => Promise<boolean>;
  /** Absent = address lookup is off. */
  lookup?: (query: string) => Promise<LookupResult>;
  online: boolean;
  onGoOnline?: () => void;
  onOpenMap?: () => void;
  onOpenGames?: () => void;
  demo?: boolean;
}) {
  // Without a server to save to, changes (the radius) live in memory for this visit.
  const [draft, setDraft] = useState<LocalSettings>(settings ?? DEFAULT_SETTINGS);
  const s = settings ?? draft;
  const [saveError, setSaveError] = useState(false);
  const update = async (next: LocalSettings) => {
    if (!onChange || !settings) return setDraft(next);
    setSaveError(!(await onChange(next)));
  };

  const active = activePlace(s);
  const center: [number, number] = active ? [active.lon, active.lat] : defaultCenter;
  const sum = useMemo(() => summarizeAround(data, center, s.radiusMiles), [data, center[0], center[1], s.radiusMiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const canSave = !!settings && !!onChange;
  const full = s.places.length >= MAX_PLACES;

  const runLookup = async () => {
    if (!lookup || !query.trim()) return;
    if (!online) onGoOnline?.();
    setBusy(true);
    setResult(await lookup(query));
    setBusy(false);
  };
  const savePlace = (m: AddressMatch) => {
    const place: SavedPlace = { id: `p-${Date.now().toString(36)}`, label: name.trim() || m.label, address: m.address, lon: m.lon, lat: m.lat };
    void update({ ...s, places: [...s.places, place], activeId: place.id });
    setResult(null); setQuery(''); setName('');
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-5">
        <div>
          <h1 className="text-lg font-semibold text-primary">Settings</h1>
          <p className="text-sm text-tertiary">Your places. The active place sets the map pin, the radius, and the area new reports describe.</p>
        </div>

        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-tertiary">Active place</p>
              <p className="flex items-center gap-1.5 text-md font-semibold text-primary">
                <MarkerPin01 className="size-4 shrink-0 text-fg-quaternary" aria-hidden />
                {active ? active.label : demo ? 'Sample pin' : 'Default pin'}
              </p>
              <p className="text-sm text-tertiary">{active ? active.address : demo ? 'The demo’s made-up area' : 'From web/.env.local'}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <p className="text-xs font-medium text-tertiary">Radius</p>
              <ButtonGroup size="sm" aria-label="Radius" disallowEmptySelection selectedKeys={[String(s.radiusMiles)]}
                onSelectionChange={(k) => { const v = Number([...k][0]); if (v) void update({ ...s, radiusMiles: v }); }}>
                {RADIUS_CHOICES.map((r) => <ButtonGroupItem key={r} id={String(r)} className={SELECTED}>{r} mi</ButtonGroupItem>)}
              </ButtonGroup>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-secondary pt-4 md:grid-cols-4">
            <Stat label="Licensed stores" value={sum.stores} sub={`within ${s.radiusMiles} mi`} />
            <Stat label="Listed claims (over $600)" value={sum.claims} sub={`at ${fmtInt(sum.storesWithClaims)} stores, ${fmtRange(sum.from, sum.to)}`} />
            <Stat label="Listed prizes" value={fmtUsd(sum.prizeSum)} sub="sum of listed claims" />
            <Stat label="Largest listed claim" value={sum.largest ? fmtUsd(sum.largest.amount) : '—'}
              sub={sum.largest ? `${sum.largest.game} · ${sum.largest.store}, ${sum.largest.town} · ${fmtDate(sum.largest.date)}` : 'none in this area'} />
          </div>

          {sum.topGames.length > 0 && (
            <div className="border-t border-secondary pt-4">
              <p className="mb-2 text-xs font-medium text-tertiary">Most listed claims by game, in this area</p>
              <ol className="flex flex-col gap-1">
                {sum.topGames.map((g, i) => (
                  <li key={g.name} className="flex items-baseline gap-2 text-sm">
                    <span className="w-4 text-tertiary tabular">{i + 1}</span>
                    <span className="flex-1 text-primary">{g.name}{g.price !== null && <span className="text-tertiary"> · ${g.price}</span>}</span>
                    <span className="text-secondary tabular">{fmtInt(g.claims)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {onOpenMap && <Button size="sm" color="primary" onClick={onOpenMap}>Open on the map</Button>}
            {onOpenGames && <Button size="sm" color="secondary" onClick={onOpenGames}>Open games</Button>}
          </div>
          <CaveatNote dense>
            Listed claims are the Lottery’s published winner lists (prizes of about $600 and up), counted at licensed stores within
            the radius. The map’s header counts by census tract instead, so its total can differ. A count describes where prizes
            were claimed; it does not say where the next one will be.
          </CaveatNote>
        </Card>

        <div className="grid gap-5 md:grid-cols-2">
          <Card className="flex flex-col gap-3 p-5">
            <div>
              <h2 className="text-md font-semibold text-primary">Add a place</h2>
              <p className="text-sm text-tertiary">Any address or place in Massachusetts.</p>
            </div>
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void runLookup(); }}>
              <Input size="sm" icon={SearchLg} aria-label="Address" placeholder="Street address, town" value={query} onChange={setQuery}
                isDisabled={!lookup || !canSave} />
              <Input size="sm" aria-label="Name (optional)" placeholder="Name (optional), e.g. Home" value={name} onChange={setName}
                isDisabled={!lookup || !canSave} />
              <div className="flex items-center gap-2">
                <Button size="sm" color="secondary" type="submit" isLoading={busy} isDisabled={!lookup || !canSave || !query.trim() || full}>
                  {online ? 'Look up' : 'Go online and look up'}
                </Button>
                {full && <span className="text-xs text-tertiary">{MAX_PLACES} places saved; remove one first.</span>}
              </div>
            </form>
            {!lookup || !canSave ? (
              <p className="text-xs text-tertiary">
                {demo ? 'Address lookup is off in the public demo.' : 'Saving places needs the local app (npm run dev).'}
              </p>
            ) : (
              <p className="text-xs text-tertiary">Look up sends what you type to Google, once. Nothing else leaves this computer.</p>
            )}
            {result && !result.ok && <p className="text-sm text-error-primary">{LOOKUP_ERRORS[result.kind]}</p>}
            {result?.ok && result.matches.length === 0 && <p className="text-sm text-tertiary">No match in Massachusetts. Try adding the town.</p>}
            {result?.ok && result.matches.length > 0 && (
              <ul aria-label="Matches" className="flex flex-col divide-y divide-secondary rounded-lg border border-secondary">
                {result.matches.map((m) => (
                  <li key={`${m.lon},${m.lat}`} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-primary">{m.label}</p>
                      <p className="truncate text-xs text-tertiary">{m.address}</p>
                      <p className="text-xs text-tertiary tabular">{fmtInt(storesWithin(data, [m.lon, m.lat], s.radiusMiles).length)} licensed stores within {s.radiusMiles} mi</p>
                    </div>
                    <Button size="sm" color="secondary" onClick={() => savePlace(m)}>Save and use</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <div>
              <h2 className="text-md font-semibold text-primary">Saved places</h2>
              <p className="text-sm text-tertiary">Kept in web/public/local/settings.json on this computer. Never in a link or in git.</p>
            </div>
            <ul className="flex flex-col gap-1">
              <PlaceRow label={demo ? 'Sample pin' : 'Default pin'} address={demo ? 'The demo’s made-up area' : 'From web/.env.local'}
                active={!active} onUse={() => void update({ ...s, activeId: null })} />
              {s.places.map((p) => (
                <PlaceRow key={p.id} label={p.label} address={p.address} active={p.id === active?.id}
                  onUse={() => void update({ ...s, activeId: p.id })}
                  onRemove={canSave ? () => void update({ ...s, places: s.places.filter((q) => q.id !== p.id), activeId: s.activeId === p.id ? null : s.activeId }) : undefined} />
              ))}
            </ul>
            {saveError && <p className="text-sm text-error-primary">Could not save. Is the local app running (npm run dev)?</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}

function PlaceRow({ label, address, active, onUse, onRemove }: {
  label: string; address: string; active: boolean; onUse: () => void; onRemove?: () => void;
}) {
  return (
    <li className={cx('flex items-center gap-3 rounded-lg px-3 py-2', active && 'bg-tertiary')}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <span className="truncate">{label}</span>
          {active && <Badge type="modern" size="sm" color="gray">Active</Badge>}
        </p>
        <p className="truncate text-xs text-tertiary">{address}</p>
      </div>
      {!active && <Button size="sm" color="secondary" onClick={onUse}>Use</Button>}
      {onRemove && <Button size="sm" color="tertiary" iconLeading={Trash01} aria-label={`Remove ${label}`} onClick={onRemove} />}
    </li>
  );
}
