import type { Game, PrizeTier } from './types';

export interface EvEstimate {
  gameId: string;
  ticketsRemaining: number;
  ticketsRemainingLow: number;
  ticketsRemainingHigh: number;
  evAll: number;
  evExJackpot: number;
  checkInputs: boolean;
}

/**
 * Statewide EV per PRD §4.
 *   tickets remaining ≈ printed × (low-tier remaining / low-tier total)
 *   net EV = Σ remaining_i × value_i / tickets remaining − price
 * "Ex-jackpot" drops the tier that was the advertised top prize at launch, whether or
 * not any remain. The range uses the lowest two tiers separately as a rough spread.
 */
export function estimateEv(game: Game, tiers: PrizeTier[]): EvEstimate | null {
  const t = tiers.filter((x) => x.gameId === game.id).sort((a, b) => a.value - b.value);
  if (t.length === 0) return null;
  const ratios = t.slice(0, 2).map((x) => (x.total > 0 ? x.remaining / x.total : 0));
  const ratio = t[0].total > 0 ? t[0].remaining / t[0].total : 0;
  const ticketsRemaining = game.ticketsPrinted * ratio;
  if (ticketsRemaining <= 0) return null;
  const pool = (rows: PrizeTier[]) => rows.reduce((s, x) => s + x.remaining * x.value, 0);
  const evAll = pool(t) / ticketsRemaining - game.price;
  const evExJackpot = pool(t.filter((x) => !x.isLaunchTopPrize)) / ticketsRemaining - game.price;
  return {
    gameId: game.id,
    ticketsRemaining,
    ticketsRemainingLow: game.ticketsPrinted * Math.min(...ratios),
    ticketsRemainingHigh: game.ticketsPrinted * Math.max(...ratios),
    evAll,
    evExJackpot,
    checkInputs: evAll > 0,
  };
}
