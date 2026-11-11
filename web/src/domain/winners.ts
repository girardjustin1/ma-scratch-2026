import { inPrizeBand } from './metrics';
import type { Claim, GameRef, PrizeBand } from './types';

/**
 * Listed claims grouped three ways for the legend's "Winners by ticket" section. Counts are
 * listed claims (prizes over $600) only; they describe where prizes were claimed, never
 * which ticket or store is more likely to win.
 */
export type WinnerGrouping = 'price' | 'prize' | 'game';

export interface WinnerRow {
  /** Filter value the row applies: a price ("5"), a prize band, or a game id. */
  id: string;
  label: string;
  claims: number;
  prizeTotal: number;
  /** Game rows: ticket art and price. */
  image?: string | null;
  price?: number | null;
}

/** Prize bands in order, smallest first (the map's Prize size filter, minus "All"). */
export const WINNER_BANDS: { id: Exclude<PrizeBand, 'all'>; label: string }[] = [
  { id: '600-999', label: '$601 – $999' },
  { id: '1k-9k', label: '$1,000 – $9,999' },
  { id: '10k-99k', label: '$10,000 – $99,999' },
  { id: '100k+', label: '$100,000 and up' },
];

/** Games listed in the "Game" grouping; the rest are summed into one line. */
export const TOP_GAMES = 10;

function add(m: Map<string, WinnerRow>, id: string, make: () => WinnerRow, amount: number) {
  const row = m.get(id) ?? make();
  row.claims += 1;
  row.prizeTotal += amount;
  m.set(id, row);
}

export function groupWinners(claims: Claim[], games: GameRef[], by: WinnerGrouping): WinnerRow[] {
  const game = new Map(games.map((g) => [g.id, g]));
  const m = new Map<string, WinnerRow>();
  if (by === 'prize') {
    for (const b of WINNER_BANDS) m.set(b.id, { id: b.id, label: b.label, claims: 0, prizeTotal: 0 });
    for (const c of claims) {
      const b = WINNER_BANDS.find((x) => inPrizeBand(c.prizeAmount, x.id));
      if (b) add(m, b.id, () => ({ id: b.id, label: b.label, claims: 0, prizeTotal: 0 }), c.prizeAmount);
    }
    return [...m.values()];
  }
  if (by === 'price') {
    for (const c of claims) {
      const p = game.get(c.gameId)?.price ?? null;
      const id = p === null ? 'unknown' : String(p);
      add(m, id, () => ({ id, label: p === null ? 'Price unknown' : `$${p} tickets`, claims: 0, prizeTotal: 0 }), c.prizeAmount);
    }
    return [...m.values()].sort((x, y) => (x.id === 'unknown' ? 1 : y.id === 'unknown' ? -1 : Number(x.id) - Number(y.id)));
  }
  for (const c of claims) {
    const g = game.get(c.gameId);
    add(m, c.gameId, () => ({ id: c.gameId, label: g?.name ?? c.gameId, claims: 0, prizeTotal: 0, image: g?.image, price: g?.price ?? null }), c.prizeAmount);
  }
  return [...m.values()].sort((x, y) => y.claims - x.claims || y.prizeTotal - x.prizeTotal || x.label.localeCompare(y.label));
}
