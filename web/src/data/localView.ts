import type { Claim, Coverage, Game, GameRef, LegacyEv, PrizeTier, Retailer, TownMatch, TractCollection, TractIncome } from '../domain/types';
import { estimateEv } from '../domain/ev';
import { bucketCounts } from '../domain/prizeBuckets';
import { paceData, type PaceFile } from '../domain/pace';
import type { ExploreData } from '../pages/ExplorePage';

// Real data around the owner's pin, built by scripts/build_local_view.py into the gitignored
// web/public/local/. Only the prototype fetches it; Storybook has no static dir for it and
// stays on sample data.

interface LocalViewFile {
  coverage: Coverage;
  tracts: TractCollection;
  income: TractIncome[];
  retailers: Retailer[];
  games: GameRef[];
  claims: [string, number, number, string][];
  townMatch: Record<string, TownMatch>;
  ev?: EvData & { asOf: string | null };
}

/** Real statewide EV inputs for the EV tab: games, prize tiers, earlier Wayback estimates. */
export interface EvData {
  asOf: string;
  games: Game[];
  tiers: PrizeTier[];
  legacy: LegacyEv[];
}

export async function loadLocalView(): Promise<ExploreData | null> {
  try {
    const res = await fetch('/local/view.json');
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    const f = (await res.json()) as LocalViewFile;
    // Game pace (scripts/game_pace.py) is optional: without it the picker and panel show none.
    const pace = await fetch('/local/pace.json')
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? (r.json() as Promise<PaceFile>) : null))
      .catch(() => null);
    const claims: Claim[] = f.claims.map(([listedDate, g, prizeAmount, retailerId], i) => ({
      id: `L${i}`,
      listedDate,
      gameId: f.games[g].id,
      prizeAmount,
      retailerId,
    }));
    // One EV formula (domain/ev.ts) for both the EV tab and the game picker's sort.
    const evData = f.ev?.asOf ? { asOf: f.ev.asOf, games: f.ev.games, tiers: f.ev.tiers, legacy: f.ev.legacy } : undefined;
    const evGame = new Map(evData?.games.map((g) => [g.id, g]) ?? []);
    const tiersBy = new Map<string, PrizeTier[]>();
    for (const t of evData?.tiers ?? []) tiersBy.set(t.gameId, [...(tiersBy.get(t.gameId) ?? []), t]);
    const games: GameRef[] = f.games.map((g0) => {
      const g1 = tiersBy.has(g0.id) ? { ...g0, buckets: bucketCounts(tiersBy.get(g0.id)!) } : g0;
      const g = pace?.games[g0.id] ? { ...g1, pace: pace.games[g0.id] } : g1;
      const eg = evGame.get(g.id);
      const e = eg && evData ? estimateEv(eg, evData.tiers) : null;
      return e && eg && evData
        ? { ...g, ev: {
            asOf: evData.asOf, evAll: e.evAll, evExJackpot: e.evExJackpot,
            payback: (e.evAll + eg.price) / eg.price, paybackExJackpot: (e.evExJackpot + eg.price) / eg.price,
            checkInputs: e.checkInputs,
          } }
        : g;
    });
    return {
      tracts: f.tracts, income: f.income, retailers: f.retailers, games, claims, coverage: f.coverage,
      townMatch: f.townMatch, ev: evData, pace: pace ? paceData(pace) : undefined,
    };
  } catch {
    return null;
  }
}
