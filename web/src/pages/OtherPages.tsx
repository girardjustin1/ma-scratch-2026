import { useMemo, useState } from 'react';
import type { Claim, Coverage, Game, LegacyEv, PrizeTier, StatResult } from '../domain/types';
import { buildGameRows, buildPrizeRows, OpenGamesTable } from '../components/OpenGamesTable';
import { PrizeTierTable } from '../components/PrizeTierTable';
import { WinnerTimeline } from '../components/WinnerTimeline';
import { EvPanel } from '../components/EvPanel';
import { MlGatePanel, StatCard, type MlGate } from '../components/Analysis';
import { SourcesPanel, type SourceRow } from '../components/SourcesPanel';
import { Card, CaveatNote } from '../components/Basics';
import { ListingSchedule } from '../components/ListingSchedule';
import { CAVEATS } from '../lib/copy';
import { addDays, fmtDate } from '../lib/format';

const Page = ({ children }: { children: React.ReactNode }) => (
  <div className="h-full overflow-auto p-6">
    <div className="mx-auto flex max-w-[1240px] flex-col gap-5">{children}</div>
  </div>
);

export function GamesPage({ games, tiers, claims, coverage, asOf, onFilterMap, images }: {
  games: Game[]; tiers: PrizeTier[]; claims: Claim[]; coverage: Coverage; asOf: string; onFilterMap?: (gameId: string) => void;
  /** Ticket art by game id (local data only). */
  images?: Map<string, string | null | undefined>;
}) {
  const rows = useMemo(() => buildGameRows(games, tiers, claims), [games, tiers, claims]);
  const prizeRows = useMemo(() => buildPrizeRows(games, tiers, claims), [games, tiers, claims]);
  const [sel, setSel] = useState(rows.slice().sort((a, b) => b.largestUnclaimed - a.largestUnclaimed)[0]?.game.id);
  const game = games.find((g) => g.id === sel);
  const from = addDays(asOf, -182);
  return (
    <Page>
      <OpenGamesTable rows={rows} prizeRows={prizeRows} asOf={asOf} selectedId={sel} onSelect={(id) => { setSel(id); onFilterMap?.(id); }} />
      {game && <PrizeTierTable game={game} tiers={tiers} asOf={asOf} image={images?.get(game.id)} />}
      {game && (
        <Card className="p-4">
          <h2 className="text-lg font-semibold text-primary">{game.name}: listed claims, last six months</h2>
          <p className="text-xs text-tertiary">Dot size by prize. Grey bands are periods with no claims coverage, not periods without claims.</p>
          <WinnerTimeline claims={claims.filter((c) => c.gameId === game.id)} from={from} to={asOf} covered={[{ from: coverage.dateFrom, to: coverage.dateTo }]} width={1180} />
          <CaveatNote>{CAVEATS.listedOnly} {CAVEATS.listedDate}</CaveatNote>
        </Card>
      )}
    </Page>
  );
}

export function EvPage(props: { games: Game[]; tiers: PrizeTier[]; legacy: LegacyEv[]; asOf: string }) {
  return <Page><EvPanel {...props} /></Page>;
}

export function StatsPage({ stats, schedule, sampleStats = true }: {
  stats: StatResult[]; schedule: { claims: Claim[]; source: string }; sampleStats?: boolean;
}) {
  return (
    <Page>
      <div>
        <h1 className="text-lg font-semibold text-primary">Statistical exploration</h1>
        <p className="text-sm text-tertiary">
          Each test runs only above its sample gate. p-values are Benjamini–Hochberg adjusted across every test on this page.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {stats.map((s) => <StatCard key={s.id} stat={s} sample={sampleStats} />)}
        <div><ListingSchedule claims={schedule.claims} source={schedule.source} /></div>
      </div>
      <CaveatNote>{CAVEATS.association} {CAVEATS.ecological} Spatial checks (Moran's I, block bootstrap, radius reruns, leave-one-town-out) appear with each result once real data is loaded.</CaveatNote>
    </Page>
  );
}

export function ModelPage({ gate }: { gate: MlGate }) {
  return <Page><MlGatePanel gate={gate} /></Page>;
}

export function DataPage({ sources, online, onToggleOnline, coverage }: {
  sources: readonly SourceRow[]; online: boolean; onToggleOnline: (v: boolean) => void; coverage: Coverage;
}) {
  return (
    <Page>
      <SourcesPanel sources={sources} online={online} onToggleOnline={onToggleOnline} />
      <Card className="max-w-[860px] p-4">
        <h2 className="mb-1 text-lg font-semibold text-primary">Coverage manifest</h2>
        <p className="text-sm text-secondary">Listed claims: {coverage.label}, {fmtDate(coverage.dateFrom)} to {fmtDate(coverage.dateTo)}.</p>
        <CaveatNote className="mt-2">{CAVEATS.coverage}</CaveatNote>
      </Card>
    </Page>
  );
}
