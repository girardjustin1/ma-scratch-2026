// Data each insights email needs. Everything here is computed before the email is built
// (from the local data); the templates only lay it out. Dates are Lottery-listed dates.

export interface EmailBase {
  /** Where "Open the explorer" goes. */
  appUrl: string;
  /** How the area is described, e.g. "5 mi around your pin". Never the pin's address. */
  area: string;
}

export interface StoreRef { name: string; town: string }

/** Something new since the last email. Shown at the top of the weekly insights. */
export type Alert =
  | { kind: 'big_claim'; prize: number; game: string; store: string; town: string; listedDate: string }
  | { kind: 'store_trending'; store: string; town: string; recent: number; prior: number }
  | { kind: 'last_top_prize'; game: string; price: number; topPrize: number; left: number; total: number }
  | { kind: 'new_game'; game: string; price: number; topPrize: number; launchDate: string }
  | { kind: 'ending_soon'; game: string; price: number; endDate: string };

export interface WeeklyInsightsData extends EmailBase {
  weekFrom: string;
  weekTo: string;
  alerts: Alert[];
  totals: { claims: number; priorClaims: number; prizeTotal: number; storesWithClaims: number; licensedStores: number };
  /** Later half of the trend range vs the earlier half (same rule as the app's Trending list). */
  trend: { recentFrom: string; recentTo: string; priorFrom: string; priorTo: string; stores: (StoreRef & { recent: number; prior: number })[] };
  /** Top 3% of stores in the area by listed claims over `period`. */
  hottest: { min: number; period: string; stores: (StoreRef & { claims: number })[] };
  largest: { listedDate: string; game: string; price: number | null; prize: number; store: string; town: string }[];
  /** Short analysis notes: one finding each, with the numbers behind it. */
  analysis: { title: string; body: string }[];
}

export interface FeaturedTicket {
  name: string;
  price: number;
  /** Hosted image URL for the ticket art; a gray tile is shown without one. */
  image?: string;
  launchDate: string;
  tags: ('New' | 'Ending soon' | 'Second chance')[];
  /** Why this ticket is featured, in a few words. */
  why: string;
  topPrize: number;
  topLeft: number;
  topTotal: number;
  leftOver600: number;
  totalOver600: number;
  /** Estimated statewide payback per $1; null when it cannot be estimated. */
  payback: number | null;
  paybackExJackpot: number | null;
  checkInputs: boolean;
  /** Listed claims in the reader's area in the last 30 listed days. */
  claimsNearby: number;
}

export interface FeaturedTicketsData extends EmailBase {
  asOf: string;
  gamesOnSale: number;
  tickets: FeaturedTicket[];
}

export interface EvRow {
  name: string;
  price: number;
  payback: number;
  paybackExJackpot: number;
  evAll: number;
  checkInputs: boolean;
}

export interface EvWatchData extends EmailBase {
  asOf: string;
  gamesOnSale: number;
  /** Median estimated payback per $1 across games on sale. */
  medianPayback: number;
  /** Highest estimated payback, best first. */
  best: EvRow[];
  /** Estimates above 100%, each with the likely reason. Always flagged. */
  positive: (EvRow & { why: string })[];
  /** Prizes paid out since the previous prize table. */
  movers: { name: string; price: number; size: string; before: number; after: number; total: number }[];
  previousAsOf: string;
}
