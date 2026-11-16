import { useEffect, useRef, useState } from 'react';
import { Autocomplete, ListBox, ListBoxItem } from 'react-aria-components';
import { SearchLg } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { cx } from '@/utils/cx';
import type { ExploreData } from '../pages/ExplorePage';
import { newSessionToken, type AddressAutocomplete, type AddressMatch, type AddressSuggestion, type LookupResult } from '../data/geocode';
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
 * location dialog. While online, typing shows address suggestions (Google Autocomplete, after
 * a pause, 3+ characters); Look up runs one text search instead. Both go through the local proxy.
 */
export function PlaceSearch({ data, radiusMiles, lookup, autocomplete, online, onGoOnline, onSave, placeCount, demo = false, autoFocus = false }: {
  data: ExploreData;
  radiusMiles: number;
  /** Absent = lookup is off (no local server, or the public demo). */
  lookup?: (query: string) => Promise<LookupResult>;
  /** Absent = no suggestions while typing. */
  autocomplete?: AddressAutocomplete;
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

  const picking = useRef(false);
  const runLookup = async () => {
    if (!lookup || !query.trim()) return;
    if (!online) onGoOnline?.();
    setBusy(true);
    setResult(await lookup(query));
    setBusy(false);
  };
  // Suggestions: debounced, aborted when the text changes, never for the text just picked.
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const token = useRef<string | null>(null);
  const picked = useRef<string | null>(null);
  const suggestOn = enabled && !!autocomplete && online;
  useEffect(() => {
    const q = query.trim();
    if (!suggestOn || q.length < 3 || q === picked.current) { setSuggestions([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      token.current ??= newSessionToken();
      try {
        const r = await autocomplete!.suggest(q, token.current, ctrl.signal);
        if (r.ok) setSuggestions(r.suggestions);
        else { setSuggestions([]); setResult(r); }
      } catch { /* superseded by newer text */ }
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query, suggestOn, autocomplete]);
  const pick = async (placeId: string) => {
    const s = suggestions.find((x) => x.placeId === placeId);
    if (!s || !autocomplete) return;
    const text = [s.main, s.secondary].filter(Boolean).join(', ');
    picked.current = text;
    setQuery(text);
    setSuggestions([]);
    setBusy(true);
    const r = await autocomplete.resolve(s, token.current ?? newSessionToken());
    token.current = null; // the session ends with this call; the next suggestion starts a new one
    setBusy(false);
    setResult(r.ok ? { ok: true, matches: r.match ? [r.match] : [] } : r);
  };

  const save = (m: AddressMatch) => {
    onSave?.({ id: `p-${Date.now().toString(36)}`, label: name.trim() || m.label, address: m.address, lon: m.lon, lat: m.lat });
    setResult(null); setQuery(''); setName('');
  };

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-col gap-2"
        onSubmit={(e) => { e.preventDefault(); if (picking.current) { picking.current = false; return; } void runLookup(); }}
        onKeyDownCapture={(e) => {
          // Enter on a highlighted suggestion picks it (the list handles the key); the same press
          // still submits the form, so mark it to skip the Look up. Seen before the list handles it.
          // Only keys typed in the address input count (the list re-sends Enter to the option).
          const el = e.target as HTMLElement;
          if (el.tagName !== 'INPUT') return;
          picking.current = e.key === 'Enter' && !!el.closest('[data-address-field]') && !!el.getAttribute('aria-activedescendant');
        }}>
        {/* Suggestions sit in a list under the field (no popover); arrow keys move through them
            while focus stays in the field, Enter picks one. */}
        <div data-address-field className="flex flex-col gap-2">
        <Autocomplete inputValue={query} onInputChange={(v) => { setQuery(v); if (v.trim() !== picked.current) picked.current = null; }}>
          <Input size="sm" icon={SearchLg} aria-label="Address" placeholder="Street address, town" isDisabled={!enabled} autoFocus={autoFocus} />
          {suggestions.length > 0 && (
            <ListBox aria-label="Address suggestions" items={suggestions} onAction={(k) => void pick(String(k))}
              className="flex flex-col overflow-hidden rounded-lg border border-secondary py-1 outline-hidden">
              {(x) => (
                <ListBoxItem id={x.placeId} textValue={[x.main, x.secondary].filter(Boolean).join(', ')}
                  className={({ isFocused }) => cx('flex min-w-0 cursor-pointer flex-col px-3 py-1.5 outline-hidden', isFocused && 'bg-primary_hover')}>
                  <span className="truncate text-sm font-medium text-primary">{x.main}</span>
                  {x.secondary && <span className="truncate text-xs text-tertiary">{x.secondary}</span>}
                </ListBoxItem>
              )}
            </ListBox>
          )}
        </Autocomplete>
        </div>
        {enabled && autocomplete && !online && query.trim().length >= 3 && (
          <p className="text-xs text-tertiary">
            Address suggestions need the app online.{' '}
            {onGoOnline && <Button size="sm" color="link-gray" onClick={onGoOnline}>Go online</Button>}
          </p>
        )}
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
          : autocomplete
            ? 'Online, what you type goes to Google for suggestions and Look up. Nothing else leaves this computer.'
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
