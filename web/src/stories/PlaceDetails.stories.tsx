import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlaceDetails, PlaceDetailsView, type PlaceViewState } from '../components/PlaceDetails';
import type { PlaceResult } from '../data/googlePlaces';
import type { Retailer } from '../domain/types';

// SYNTHETIC fixtures only: a made-up store, made-up address and made-up Google fields.
// Photos and Street View have no src, so they render as grey placeholder boxes.

const store: Retailer = {
  id: 'R-DEMO-1',
  name: 'SAMPLE CORNER MARKET #12',
  address: '100 Example Street',
  town: 'Sampleton',
  lon: -71.1,
  lat: 42.35,
  tractGeoid: '25000000000',
};

const week = [
  'Monday: 6:00 AM – 10:00 PM',
  'Tuesday: 6:00 AM – 10:00 PM',
  'Wednesday: 6:00 AM – 10:00 PM',
  'Thursday: 6:00 AM – 10:00 PM',
  'Friday: 6:00 AM – 11:00 PM',
  'Saturday: 7:00 AM – 11:00 PM',
  'Sunday: 8:00 AM – 9:00 PM',
];

const loaded: PlaceResult = {
  ok: true,
  placeId: 'sample-place-id',
  name: 'Sample Corner Market',
  primaryType: 'Convenience store',
  address: '100 Example St, Sampleton, MA 00000, USA',
  location: { lat: 42.3502, lon: -71.1003 },
  distanceM: 40,
  nameSimilarity: 1,
  matchConfidence: 'high',
  googleMapsUri: 'https://www.google.com/maps/search/?api=1&query=Sample%20Corner%20Market',
  websiteUri: 'https://example.com/',
  phone: '(555) 010-0100',
  phoneInternational: '+1 555-010-0100',
  rating: 4.2,
  ratingCount: 87,
  businessStatus: 'OPERATIONAL',
  openNow: true,
  weekdayHours: week,
  todayHours: week[2],
  photos: [
    { name: 'sample/photos/1', widthPx: 480, heightPx: 320, attributions: [{ displayName: 'Sample Author', uri: 'https://example.com/a' }] },
    { name: 'sample/photos/2', widthPx: 480, heightPx: 320, attributions: [{ displayName: 'Another Person', uri: 'https://example.com/b' }] },
    { name: 'sample/photos/3', widthPx: 480, heightPx: 320, attributions: [] },
  ],
  streetView: { status: 'OK', available: true, date: '2024-06', copyright: '© Sample' },
};

const lowMatch: PlaceResult = {
  ...loaded,
  name: 'Sample Gas & Go',
  primaryType: 'Gas station',
  address: '140 Example St, Sampleton, MA 00000, USA',
  distanceM: 420,
  nameSimilarity: 0.33,
  matchConfidence: 'low',
  openNow: false,
  rating: undefined,
  ratingCount: undefined,
  websiteUri: undefined,
  photos: [],
  streetView: { status: 'ZERO_RESULTS', available: false },
};

const sparse: PlaceResult = {
  ...loaded,
  phone: undefined,
  websiteUri: undefined,
  rating: undefined,
  ratingCount: undefined,
  openNow: undefined,
  weekdayHours: undefined,
  todayHours: undefined,
  businessStatus: 'CLOSED_TEMPORARILY',
  photos: [],
  streetView: { status: 'ZERO_RESULTS', available: false },
};

const meta: Meta<typeof PlaceDetailsView> = {
  title: 'Components/Place details',
  component: PlaceDetailsView,
  args: { store },
  decorators: [(Story) => <div className="w-[420px] max-w-full bg-primary p-5"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof PlaceDetailsView>;

const s = (state: PlaceViewState): Story => ({ args: { state, onRetry: () => {} } });

export const Loaded = s({ kind: 'loaded', result: loaded });
export const LowConfidence = s({ kind: 'loaded', result: lowMatch });
export const SparseAndTemporarilyClosed = s({ kind: 'loaded', result: sparse });
export const Loading = s({ kind: 'loading' });
export const Offline = s({ kind: 'offline' });
export const NoKey = s({ kind: 'error', error: { ok: false, kind: 'no_key' } });
export const NotFound = s({ kind: 'error', error: { ok: false, kind: 'not_found' } });
export const HttpError = s({ kind: 'error', error: { ok: false, kind: 'http', status: 403, detail: 'PERMISSION_DENIED' } });
export const NetworkError = s({ kind: 'error', error: { ok: false, kind: 'offline' } });

/** The container with online off: shows the offline state without touching the network. */
export const ContainerOffline: StoryObj<typeof PlaceDetails> = {
  render: () => <PlaceDetails store={store} online={false} />,
};
