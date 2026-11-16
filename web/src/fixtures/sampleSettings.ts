import type { AddressAutocomplete, AddressMatch, LookupResult } from '../data/geocode';
import type { LocalSettings } from '../settings/settings';
import { SAMPLE_CENTER } from './sample';

// Made-up places near the sample pin, for Storybook. Not real addresses.
const [lon, lat] = SAMPLE_CENTER;

export const sampleSettings: LocalSettings = {
  places: [
    { id: 'p-home', label: 'Home', address: '12 Example St, Somerville, MA 02143', lon: lon - 0.012, lat: lat + 0.02 },
    { id: 'p-work', label: 'Work', address: '400 Sample Ave, Cambridge, MA 02139', lon: lon - 0.02, lat: lat - 0.004 },
  ],
  activeId: 'p-home',
  radiusMiles: 2,
};

const matches: AddressMatch[] = [
  { label: '88 Placeholder Rd', address: '88 Placeholder Rd, Medford, MA 02155', lon: lon - 0.02, lat: lat + 0.05 },
  { label: 'Demo Square', address: '1 Demo Sq, Everett, MA 02149', lon: lon + 0.02, lat: lat + 0.04 },
];

/** A fake lookup: always the same two made-up matches, after a short pause. */
export const sampleLookup = (): Promise<LookupResult> =>
  new Promise((resolve) => setTimeout(() => resolve({ ok: true, matches }), 300));

/** A fake autocomplete over the same made-up places: matches on any word of the address. */
export const sampleAutocomplete: AddressAutocomplete = {
  suggest: (input) => new Promise((resolve) => setTimeout(() => {
    const q = input.trim().toLowerCase();
    const suggestions = matches
      .filter((m) => m.address.toLowerCase().split(/[\s,]+/).some((w) => w.startsWith(q.split(/\s+/)[0])) || m.address.toLowerCase().includes(q))
      .map((m, i) => ({ placeId: `sample-${i}`, main: m.label, secondary: m.address.split(', ').slice(1).join(', ') }));
    resolve({ ok: true, suggestions });
  }, 150)),
  resolve: (s) => Promise.resolve({ ok: true, match: matches[Number(s.placeId.split('-')[1])] ?? null }),
};
