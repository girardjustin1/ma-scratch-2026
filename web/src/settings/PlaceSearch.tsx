import { useState } from 'react';
import { SearchLg } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import type { ExploreData } from '../pages/ExplorePage';
import type { AddressMatch, LookupResult } from '../data/geocode';
import { storesWithin } from './around';
import { MAX_PLACES, type SavedPlace } from './settings';
import { fmtInt } from '../lib/format';

const LOOKUP_ERRORS: Record<Exclude<LookupResult, { ok: true }>['kind'], string> = {
  no_key: 'Address lookup needs GOOGLE_MAPS_API_KEY in web/.env.local.',
  offline: 'Could not reach Google. Check the connection and try again.',
  http: 'Google returned an error. Try again, or check the address.',
};

/**
 * Address lookup → pick a match → save it as a place. Shared by the Settings tab and the
 * location dialog. Look up sends the typed text to Google once (through the local proxy).
 */
export function PlaceSearch({ data, radiusMiles, lookup, online, onGoOnline, onSave, placeCount, demo = false, autoFocus = false }: {
  data: ExploreData;
  radiusMiles: number;
  /** Absent = lookup is off (no local server, or the public demo). */
  lookup?: (query: string) => Promise<LookupResult>;
  online: boolean;
  onGoOnline?: () => void;
  /** Absent = saving is off. */
  onSave?: (place: SavedPlace) => void;
  placeCount: number;
  demo?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const enabled = !!lookup && !!onSave;
  const full = placeCount >= MAX_PLACES;

  const runLookup = async () => {
    if (!lookup || !query.trim()) return;
    if (!online) onGoOnline?.();
    setBusy(true);
    setResult(await lookup(query));
    setBusy(false);
  };
  const save = (m: AddressMatch) => {
    onSave?.({ id: `p-${Date.now().toString(36)}`, label: name.trim() || m.label, address: m.address, lon: m.lon, lat: m.lat });
    setResult(null); setQuery(''); setName('');
  };

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void runLookup(); }}>
        <Input size="sm" icon={SearchLg} aria-label="Address" placeholder="Street address, town" value={query} onChange={setQuery}
          isDisabled={!enabled} autoFocus={autoFocus} />
        <Input size="sm" aria-label="Name (optional)" placeholder="Name (optional), e.g. Home" value={name} onChange={setName}
          isDisabled={!enabled} />
        <div className="flex items-center gap-2">
          <Button size="sm" color="secondary" type="submit" isLoading={busy} isDisabled={!enabled || !query.trim() || full}>
            {online ? 'Look up' : 'Go online and look up'}
          </Button>
          {full && <span className="text-xs text-tertiary">{MAX_PLACES} places saved; remove one first.</span>}
        </div>
      </form>
      <p className="text-xs text-tertiary">
        {!enabled
          ? demo ? 'Address lookup is off in the public demo.' : 'Saving places needs the local app (npm run dev).'
          : 'Look up sends what you type to Google, once. Nothing else leaves this computer.'}
      </p>
      {result && !result.ok && <p className="text-sm text-error-primary">{LOOKUP_ERRORS[result.kind]}</p>}
      {result?.ok && result.matches.length === 0 && <p className="text-sm text-tertiary">No match in Massachusetts. Try adding the town.</p>}
      {result?.ok && result.matches.length > 0 && (
        <ul aria-label="Matches" className="flex flex-col divide-y divide-secondary rounded-lg border border-secondary">
          {result.matches.map((m) => (
            <li key={`${m.lon},${m.lat}`} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">{m.label}</p>
                <p className="truncate text-xs text-tertiary">{m.address}</p>
                <p className="text-xs text-tertiary tabular">{fmtInt(storesWithin(data, [m.lon, m.lat], radiusMiles).length)} licensed stores within {radiusMiles} mi</p>
              </div>
              <Button size="sm" color="secondary" onClick={() => save(m)}>Save and use</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
