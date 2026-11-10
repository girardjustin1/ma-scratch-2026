import type { PrizeBand, PrizeTier } from './types';

/**
 * Prize buckets for "how many prizes are left" views. Statewide counts from the Lottery's
 * prize table: "left" = not yet paid out (on unsold tickets or sold but not cashed).
 * Value buckets do not overlap; 'top' is the game's launch top prize level on its own.
 */
export type BucketId = 'top' | 'b100k' | 'b10k' | 'b1k' | 'b601' | 'small';

export const BUCKETS: { id: BucketId; label: string; test: (t: PrizeTier) => boolean }[] = [
  { id: 'top', label: 'Top prize', test: (t) => t.isLaunchTopPrize },
  { id: 'b100k', label: '$100,000 and up', test: (t) => t.value >= 100_000 },
  { id: 'b10k', label: '$10,000 – $99,999', test: (t) => t.value >= 10_000 && t.value < 100_000 },
  { id: 'b1k', label: '$1,000 – $9,999', test: (t) => t.value >= 1_000 && t.value < 10_000 },
  { id: 'b601', label: '$601 – $999', test: (t) => t.value > 600 && t.value < 1_000 },
  { id: 'small', label: '$600 and under', test: (t) => t.value <= 600 },
];

export interface BucketCount { left: number; total: number }

export function bucketCounts(tiers: PrizeTier[]): Record<BucketId, BucketCount> {
  const out = Object.fromEntries(BUCKETS.map((b) => [b.id, { left: 0, total: 0 }])) as Record<BucketId, BucketCount>;
  for (const t of tiers) {
    for (const b of BUCKETS) {
      if (b.test(t)) { out[b.id].left += t.remaining; out[b.id].total += t.total; }
    }
  }
  return out;
}

/** The bucket matching the map's Prize size filter, so lists follow the filter by default. */
export const bucketForBand = (band: PrizeBand): BucketId =>
  ({ all: 'top', '600-999': 'b601', '1k-9k': 'b1k', '10k-99k': 'b10k', '100k+': 'b100k' } as const)[band];
