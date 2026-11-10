// Data each insights email needs. Everything here is computed before the email is built
// (emails/build.ts from the local data, or emails/fixtures.ts for Storybook); the templates
// only lay it out. Dates are Lottery-listed dates.

export interface EmailBase {
  /** Where "Open the explorer" goes. */
  appUrl: string;
  /** How the area is described, e.g. "5 mi around your pin". Never the pin's address. */
  area: string;
}

/** address (as the Lottery lists it) lets the email link the store to Google Maps. */
export interface StoreRef { name: string; town: string; address?: string }

/** Something new since the last email. Shown at the top of the weekly and monthly emails. */
export type Alert =
  | { kind: 'big_claim'; prize: number; game: string; store: string; town: string; listedDate: string }
  | { kind: 'store_trending'; store: string; town: string; recent: number; prior: number }
  | { kind: 'last_top_prize'; game: string; price: number; topPrize: number; left: number; total: number }
  | { kind: 'new_game'; game: string; price: number; topPrize: number; launchDate: string }
  | { kind: 'ending_soon'; game: string; price: number; endDate: string };

export type Period = 'week' | 'month';

export interface ListedClaimRow {
  listedDate: string;
  game: string;
  /** Lottery game identifier; links the game to its masslottery.com page. */
  gameId?: string;
  /** Store address; links the store to Google Maps. */
  address?: string;
  price: number | null;
  prize: number;
  store: string;
  town: string;
  /** Ticket art URL; a gray tile with the price is shown without one. */
  image?: string;
}

/** A short summary of statewide EV, for the weekly line and the monthly box. */
export interface EvSummary {
  asOf: string;
  gamesOnSale: number;
  medianPayback: number;
  /** Estimates above 100% (all flagged "Check inputs"). */
  positive: number;
  /** Of those, still above 100% without the original jackpot. */
  holdsUp: number;
  best: EvRow[];
}

export interface InsightsData extends EmailBase {
  period: Period;
  /** Listed dates covered: a week (Mon–Sun) or a calendar month. */
  from: string;
  to: string;
  alerts: Alert[];
  /** priorClaims = the period before (the week before, or the month before). */
  totals: { claims: number; priorClaims: number; prizeTotal: number; storesWithClaims: number; licensedStores: number };
  /** Later half of the trend range vs the earlier half (same rule as the app's Trending list). */
  trend: { recentFrom: string; recentTo: string; priorFrom: string; priorTo: string; stores: (StoreRef & { recent: number; prior: number })[] };
  /** Top 3% of stores in the area by listed claims over `period`. */
  hottest: { min: number; period: string; stores: (StoreRef & { claims: number })[] };
  largest: ListedClaimRow[];
  /** Monthly: games with the most listed claims in the area over the month. */
  topGames?: { name: string; gameId?: string; price: number | null; image?: string; claims: number; prizeTotal: number }[];
  /** Short analysis notes: one finding each, with the numbers behind it. */
  analysis: { title: string; body: string }[];
  /** Weekly: about two; monthly: up to five. */
  featured: FeaturedTicket[];
  ev?: EvSummary;
}

export interface FeaturedTicket {
  name: string;
  /** Lottery game identifier; links to the game's masslottery.com page. */
  gameId?: string;
  price: number;
  /** Ticket art URL; a gray tile is shown without one. */
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
  gameId?: string;
  price: number;
  payback: number;
  paybackExJackpot: number;
  evAll: number;
  checkInputs: boolean;
  image?: string;
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

/** Alert radius the reader chose. */
export type AlertRadius = 1 | 2 | 3;

export interface NearbyClaim extends ListedClaimRow {
  /** Store address, as the Lottery lists it (required here). */
  address: string;
  /** Straight-line miles from the reader's pin to the selling store. */
  miles: number;
}

export interface NearbyAlertData extends EmailBase {
  radiusMiles: AlertRadius;
  /** Listed dates this alert covers (since the previous alert). */
  from: string;
  to: string;
  /** Nearest first. */
  claims: NearbyClaim[];
}
