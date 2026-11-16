import type { AddressMatch, LookupResult } from '../data/geocode';
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
