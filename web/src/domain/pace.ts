import type { BucketId } from './prizeBuckets';

/**
 * Game pace (scripts/game_pace.py): how fast each prize size has been claimed since launch,
 * against games of the same ticket price at the same age. Statewide and descriptive: it
 * says how fast prizes HAVE been claimed, never which store or ticket holds the rest.
 */
export type PaceCall = 'ahead' | 'on_pace' | 'behind' | 'no_norm' | 'too_few' | 'unchecked';

export interface PaceEntry {
  printed: number;
  claimed: number;
  /** claimed / printed, from the current prize table. */
  share: number;
  /** Comparable games' share at this age: 25th, 50th and 75th percentile, and how many. */
  p25?: number;
  p50?: number;
  p75?: number;
  n?: number;
  /** Percentile rank among comparable games (ties split evenly), 0–1. */
  rank?: number;
  call: PaceCall;
  /** This game's share claimed by week since launch (week 1 first), when it launched
   *  inside the winners-list window. */
  curve?: number[];
}

export interface GamePace {
  price: number;
  launch: string;
  asOf: string;
  ageWeeks: number;
  buckets: Partial<Record<BucketId, PaceEntry>>;
}

/** [week, p25, p50, p75, n] */
export type NormRow = [number, number, number, number, number];

export interface PaceMarket {
  from: string;
  to: string;
  priorFrom: string;
  priorTo: string;
  /** Listed claims per bucket, last 13 weeks vs the same weeks a year earlier. */
  buckets: Partial<Record<BucketId, { recent: number; prior: number; change: number | null }>>;
}

/** Everything the UI needs beyond each game's own entry. */
export interface PaceData {
  claimsFrom: string;
  claimsTo: string;
  /** Games launched inside the winners-list window that the typical ranges are built from. */
  gamesInNorms: number;
  usableBuckets: BucketId[];
  /** price → bucket → rows by week. */
  norms: Record<string, Partial<Record<BucketId, NormRow[]>>>;
  market: PaceMarket;
}

/** The file scripts/game_pace.py writes. */
export interface PaceFile extends Omit<PaceData, 'market'> {
  market: Record<string, string | { recent: number; prior: number; change: number | null }>;
  games: Record<string, GamePace>;
}

export function paceData(f: PaceFile): PaceData {
  const { from, to, priorFrom, priorTo, ...rest } = f.market as Record<string, never>;
  return {
    claimsFrom: f.claimsFrom, claimsTo: f.claimsTo, gamesInNorms: f.gamesInNorms, usableBuckets: f.usableBuckets, norms: f.norms,
    market: { from, to, priorFrom, priorTo, buckets: rest },
  };
}

export const PACE_LABEL: Record<PaceCall, string> = {
  ahead: 'Ahead of pace',
  on_pace: 'On pace',
  behind: 'Behind pace',
  no_norm: 'No comparison',
  too_few: 'Too few prizes',
  unchecked: 'Not checked',
};

/** True when the call compares the game with others (ahead, on pace or behind). */
export const isCompared = (c: PaceCall) => c === 'ahead' || c === 'on_pace' || c === 'behind';

/** Why there is no comparison, in a sentence. */
export function noCallReason(e: PaceEntry, price: number, minGames = 5): string {
  if (e.call === 'too_few') return 'Too few of these prizes were printed for a pace to mean much.';
  if (e.call === 'unchecked') return 'Listed claims for this prize size could not be checked against the prize table, so there is no pace.';
  return `Fewer than ${minGames} $${price} games launched since the winners list began were this old, so there is nothing to compare with.`;
}
