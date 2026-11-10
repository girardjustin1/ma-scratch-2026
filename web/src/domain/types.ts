import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export type IsoDate = string; // YYYY-MM-DD, a Lottery-listed date. Never a time.

export type MetricKey = 'claims' | 'income' | 'perRetailer';

export interface TractProps {
  geoid: string;
  name: string;
  town: string;
  county: string;
  centroid: [number, number];
}
export type TractFeature = Feature<Polygon | MultiPolygon, TractProps>;
export type TractCollection = FeatureCollection<Polygon | MultiPolygon, TractProps>;

export type IncomeFlag = 'ok' | 'high_moe' | 'suppressed';

export interface TractIncome {
  geoid: string;
  acsRelease: string; // e.g. "2020–2024 ACS 5-year"
  medianIncome: number | null;
  moe: number | null;
  households: number;
  flag: IncomeFlag;
}

export interface Retailer {
  id: string;
  name: string;
  address: string;
  town: string;
  lon: number;
  lat: number;
  tractGeoid: string;
}

export interface Game {
  id: string;
  name: string;
  price: number;
  launchDate: IsoDate;
  /** open = on sale; claims_only = no longer sold, prizes claimable until claimDeadline. */
  status: 'open' | 'claims_only' | 'closed';
  claimDeadline?: IsoDate;
  ticketsPrinted: number;
  overallOdds: number; // 1 in N
  originalTopPrize: number;
}

/** What the map needs about a game. Price is null when the catalog has no row for it. */
export interface GameRef {
  id: string;
  name: string;
  price: number | null;
  launchDate?: IsoDate | null;
  /** In the Lottery's on-sale catalog on the prize-table date. Undefined = not known. */
  onSale?: boolean;
  /** Statewide prize table on one date. null = no table (game not on sale that day). */
  prizes?: GamePrizes | null;
  /** The Lottery's catalog tags: new, ending (sales ending soon), secondChance, scan. */
  tags?: string[];
  /** Ticket art (2:1 tile), served locally; null/undefined when there is none. */
  image?: string | null;
  /** Statewide EV estimate (domain/ev.ts). Per ticket, never per store. */
  ev?: GameEv | null;
  /** Prizes left / printed per prize bucket (domain/prizeBuckets.ts), statewide. */
  buckets?: Record<string, { left: number; total: number }> | null;
}

/** Statewide expected value per ticket, from the prize table (PRD §4). */
export interface GameEv {
  asOf: IsoDate;
  evAll: number;
  evExJackpot: number;
  /** Estimated return per $1: (evAll + price) / price. */
  payback: number;
  paybackExJackpot: number;
  /** Positive EV: almost always an estimation artefact, so it is flagged, not trusted. */
  checkInputs: boolean;
}

/** Statewide counts from the Lottery's prize table. Never per store. */
export interface GamePrizes {
  asOf: IsoDate;
  /** Prizes over $600 not yet paid out (includes tickets not yet sold). */
  remainingOver600: number;
  totalOver600: number;
  topPrize: number;
  topRemaining: number;
  topTotal: number;
}

export interface PrizeTier {
  gameId: string;
  value: number;
  total: number;
  remaining: number;
  isLaunchTopPrize: boolean;
}

export interface Claim {
  id: string;
  listedDate: IsoDate;
  gameId: string;
  prizeAmount: number;
  retailerId: string;
}

export interface Coverage {
  label: string;
  /** Claims coverage area. Tracts whose centroid falls outside show no claims data. */
  center: [number, number];
  radiusMiles: number;
  /** True when the retailer sweep proved every MA tract is covered; no boundary is drawn. */
  statewide?: boolean;
  dateFrom: IsoDate;
  dateTo: IsoDate;
}

export interface LegacyEv {
  gameId: string;
  asOf: IsoDate;
  evAll: number;
  evExJackpot: number;
  methodNote: string;
}

export interface Filters {
  dateFrom: IsoDate;
  dateTo: IsoDate;
  gameIds: string[];
  prices: number[];
  prizeBand: PrizeBand;
  /** Stores shown on the map by listed claims: [min, max]; max STORE_CLAIMS_MAX means "and up". */
  storeClaims?: [number, number];
  pin: [number, number];
  radiusMiles: number;
}

export type PrizeBand = 'all' | '600-999' | '1k-9k' | '10k-99k' | '100k+';

/** Per-tract values after filtering and coverage masking. null = no data / not defined. */
export interface TractMetrics {
  geoid: string;
  covered: boolean;
  inRadius: boolean;
  claims: number | null;
  retailers: number;
  perRetailer: number | null;
  income: number | null;
  incomeMoe: number | null;
  incomeFlag: IncomeFlag;
  /** Share of the tract's town's listed claims matched to a retailer; null if not measured. */
  townMatchRate: number | null;
  /** True when townMatchRate is below LOW_MATCH_RATE: tract counts understate claims. */
  lowMatch: boolean;
  firstListed: IsoDate | null;
  lastListed: IsoDate | null;
}

/** Per-municipality matching outcome, from scripts/build_local_view.py. */
export interface TownMatch {
  total: number;
  matched: number;
  placed: number;
}

export interface StatResult {
  id: string;
  question: string;
  unit: string;
  method: string;
  gate: { label: string; required: number; have: number };
  result?: {
    n: number;
    effectLabel: string;
    effect: number;
    ciLow: number;
    ciHigh: number;
    pRaw: number;
    pAdjusted: number;
    summary: string;
  };
}
