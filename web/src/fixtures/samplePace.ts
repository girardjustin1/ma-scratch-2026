// Synthetic game pace for Storybook: smooth made-up curves, not Lottery data. Shapes only.
import type { GamePace, NormRow, PaceCall, PaceData, PaceEntry } from '../domain/pace';
import { bucketCounts, type BucketId } from '../domain/prizeBuckets';
import type { GameRef } from '../domain/types';
import { AS_OF, games, gameRefs, prizeTiers } from './sample';

const BUCKETS: BucketId[] = ['top', 'b100k', 'b10k', 'b1k'];
const WEEKS = 104;
/** Weeks for the median game to claim ~63% of a bucket; bigger prizes go a little slower. */
const SPEED: Record<BucketId, number> = { top: 60, b100k: 55, b10k: 45, b1k: 40, b601: 40, small: 40 };
const median = (b: BucketId, w: number) => 1 - Math.exp(-w / SPEED[b]);
const round = (x: number) => Math.round(x * 1000) / 1000;

const prices = [...new Set(games.map((g) => g.price))].sort((a, b) => a - b);

export const samplePaceData: PaceData = {
  claimsFrom: '2023-11-09',
  claimsTo: AS_OF,
  gamesInNorms: 96,
  usableBuckets: BUCKETS,
  norms: Object.fromEntries(prices.map((p) => [String(p), Object.fromEntries(BUCKETS.map((b) => [b,
    Array.from({ length: WEEKS }, (_, i): NormRow => {
      const w = i + 1;
      const m = median(b, w);
      return [w, round(Math.max(0, m - 0.09)), round(m), round(Math.min(1, m + 0.09)), 12];
    })]))])),
  market: {
    from: '2026-08-10', to: AS_OF, priorFrom: '2025-08-11', priorTo: '2025-11-09',
    buckets: { top: { recent: 40, prior: 50, change: -0.2 }, b100k: { recent: 60, prior: 75, change: -0.2 },
      b10k: { recent: 800, prior: 1000, change: -0.2 }, b1k: { recent: 20000, prior: 22000, change: -0.091 } },
  },
};

/** A sample game's pace: faster, typical or slower than the median, by position in the list. */
function paceFor(id: string, price: number, launch: string, i: number): GamePace {
  const counts = bucketCounts(prizeTiers.filter((t) => t.gameId === id));
  const age = Math.max(1, Math.min(WEEKS, Math.floor((Date.parse(AS_OF) - Date.parse(launch)) / (7 * 864e5))));
  const factor = [1.35, 1, 0.7][i % 3];
  const buckets: Partial<Record<BucketId, PaceEntry>> = {};
  for (const b of BUCKETS) {
    const printed = counts[b].total;
    if (printed === 0) continue;
    const curve = Array.from({ length: age }, (_, w) => round(Math.min(1, median(b, w + 1) * factor)));
    const share = curve[age - 1];
    const [, p25, p50, p75] = samplePaceData.norms[String(price)][b]![age - 1];
    const call: PaceCall = b === 'top' ? 'too_few' : share > p75 ? 'ahead' : share < p25 ? 'behind' : 'on_pace';
    buckets[b] = { printed, claimed: Math.round(share * printed), share, p25, p50, p75, n: 12, call, curve };
  }
  return { price, launch, asOf: AS_OF, ageWeeks: age, buckets };
}

export const samplePace = new Map(games.map((g, i) => [g.id, paceFor(g.id, g.price, g.launchDate, i)]));

/** The sample games with pace attached (on-sale games only, like the real prize table). */
export const gameRefsWithPace: GameRef[] = gameRefs.map((g) => (g.onSale ? { ...g, pace: samplePace.get(g.id) } : g));
