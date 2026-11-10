import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import * as S from '../fixtures/sample';
import { computeTractMetrics, filterClaims } from '../domain/metrics';
import { CaveatNote, CoverageChip, IncomeValue } from '../components/Basics';
import { TractTooltip } from '../components/TractTooltip';
import { MapLegend } from '../components/MapLegend';
import { FilterBar, LayerControls, MetricSwitcher } from '../components/Controls';
import { GamePicker } from '../components/GamePicker';
import { DetailBody } from '../components/DetailDrawer';
import { buildGameRows, buildPrizeRows, OpenGamesTable, type GamesView } from '../components/OpenGamesTable';
import { WinnerTimeline } from '../components/WinnerTimeline';
import { EvPanel } from '../components/EvPanel';
import { MlGatePanel, StatCard } from '../components/Analysis';
import { SourcesPanel } from '../components/SourcesPanel';
import { ListingSchedule } from '../components/ListingSchedule';
import { CAVEATS } from '../lib/copy';
import { addDays } from '../lib/format';
import type { Filters, MetricKey } from '../domain/types';

const meta: Meta = { title: 'Components' };
export default meta;
type Story = StoryObj;

const metrics = computeTractMetrics({
  tracts: S.tracts, income: S.tractIncome, retailers: S.retailers,
  claims: filterClaims(S.claims, S.games, S.defaultFilters, S.coverage), coverage: S.coverage, filters: S.defaultFilters,
});
const props = (geoid: string) => S.tracts.features.find((f) => f.properties.geoid === geoid)!.properties;
const coveredBusy = [...metrics].filter((m) => m.covered && m.retailers > 0).sort((a, b) => (b.claims ?? 0) - (a.claims ?? 0))[0];
const uncovered = metrics.find((m) => !m.covered)!;
const highMoe = metrics.find((m) => m.covered && m.incomeFlag === 'high_moe') ?? coveredBusy;
const noRetailers = metrics.find((m) => m.covered && m.retailers === 0)!;

export const Caveats: Story = {
  render: () => (
    <div className="flex max-w-[560px] flex-col gap-3">
      <CoverageChip coverage={S.coverage} />
      {Object.values(CAVEATS).map((c) => <CaveatNote key={c}>{c}</CaveatNote>)}
    </div>
  ),
};

export const IncomeWithMarginOfError: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <IncomeValue value={84200} moe={9100} flag="ok" />
      <IncomeValue value={61000} moe={23800} flag="high_moe" />
      <IncomeValue value={null} moe={null} flag="suppressed" />
    </div>
  ),
};

export const TooltipCovered: Story = {
  name: 'Tract tooltip · covered',
  render: () => <TractTooltip tract={props(coveredBusy.geoid)} metrics={coveredBusy} coverage={S.coverage} />,
};
export const TooltipUncovered: Story = {
  name: 'Tract tooltip · outside coverage',
  render: () => <TractTooltip tract={props(uncovered.geoid)} metrics={uncovered} coverage={S.coverage} />,
};
export const TooltipUncertain: Story = {
  name: 'Tract tooltip · uncertain income',
  render: () => <TractTooltip tract={props(highMoe.geoid)} metrics={highMoe} coverage={S.coverage} />,
};
export const TooltipLowMatch: Story = {
  name: 'Tract tooltip · low town match rate',
  render: () => <TractTooltip tract={props(coveredBusy.geoid)} metrics={{ ...coveredBusy, lowMatch: true, townMatchRate: 0.64 }} coverage={S.coverage} />,
};
export const TooltipNoRetailers: Story = {
  name: 'Tract tooltip · no retailers',
  render: () => <TractTooltip tract={props(noRetailers.geoid)} metrics={noRetailers} coverage={S.coverage} />,
};

export const Legend: StoryObj<{ metric: MetricKey; lowMatchCount: number }> = {
  args: { metric: 'claims', lowMatchCount: 0 },
  argTypes: { metric: { control: 'inline-radio', options: ['claims', 'income', 'perRetailer'] } },
  render: ({ metric, lowMatchCount }) => (
    <MapLegend lowMatchCount={lowMatchCount} metric={metric} breaks={metric === 'income' ? [62000, 81000, 99000, 124000] : metric === 'claims' ? [1, 2, 4, 7] : [0.5, 1, 2, 3.5]}
      min={metric === 'income' ? 31000 : 0} max={metric === 'income' ? 210000 : 19} tractCount={104} noDataCount={12} coverage={S.coverage} />
  ),
};

export const Filters_: Story = {
  name: 'Filter bar',
  render: () => {
    const [f, setF] = useState<Filters>(S.defaultFilters);
    return (
      <FilterBar filters={f} games={S.gameRefs} minDate={S.coverage.dateFrom} maxDate={S.coverage.dateTo}
        claimCounts={sampleGameCounts} onChange={setF} onReset={() => setF(S.defaultFilters)} />
    );
  },
};

const sampleGameCounts = new Map<string, number>();
for (const c of S.claims) sampleGameCounts.set(c.gameId, (sampleGameCounts.get(c.gameId) ?? 0) + 1);

/** The game picker on its own. Click the field to open it. */
export const GamePicker_: StoryObj<{ prices: number[] }> = {
  name: 'Game picker',
  args: { prices: [] as number[] },
  argTypes: { prices: { control: 'check', options: [1, 2, 5, 10, 20, 30, 50] } },
  render: (args) => {
    const [ids, setIds] = useState<string[]>([]);
    return <GamePicker games={S.gameRefs} value={ids} onChange={setIds} prices={args.prices} claimCounts={sampleGameCounts} />;
  },
};

export const MetricSwitch: Story = {
  render: () => {
    const [m, setM] = useState<MetricKey>('claims');
    return <MetricSwitcher value={m} onChange={setM} />;
  },
};

export const Layers: StoryObj<{ online: boolean }> = {
  args: { online: false },
  render: ({ online }) => {
    const [s, setS] = useState({ tractOpacity: 0.78, bubbleOpacity: 0.9, showBubbles: true, basemap: 'outline' as const });
    return <LayerControls {...s} online={online} onChange={(p) => setS({ ...s, ...(p as typeof s) })} />;
  },
};

const sel = coveredBusy;
const selRet = new Set(S.retailers.filter((r) => r.tractGeoid === sel.geoid).map((r) => r.id));
export const DrillDown: Story = {
  name: 'Drill-down drawer body',
  render: () => (
    <div className="inline-block rounded-xl bg-primary ring-1 ring-secondary">
      <DetailBody tract={props(sel.geoid)} metrics={sel} claims={S.claims.filter((c) => selRet.has(c.retailerId))}
        games={S.games} retailers={S.retailers} coverage={S.coverage} onClose={() => {}} />
    </div>
  ),
};
export const DrillDownUncovered: Story = {
  name: 'Drill-down · outside coverage',
  render: () => (
    <div className="inline-block rounded-xl bg-primary ring-1 ring-secondary">
      <DetailBody tract={props(uncovered.geoid)} metrics={uncovered} claims={[]} games={S.games} retailers={S.retailers} coverage={S.coverage} onClose={() => {}} />
    </div>
  ),
};

const gameRows = buildGameRows(S.games, S.prizeTiers, S.claims);
const prizeRows = buildPrizeRows(S.games, S.prizeTiers, S.claims);
const top100 = (view: GamesView): Story => ({
  render: () => <OpenGamesTable key={view} rows={gameRows} prizeRows={prizeRows} asOf={S.AS_OF} initialView={view} />,
});
export const Top100OpenGames: Story = { name: 'Top 100 · open games', ...top100('open') };
export const Top100Prizes: Story = { name: 'Top 100 · largest prizes', ...top100('prizes') };
export const Top100WithClaimsOnly: Story = { name: 'Top 100 · with claims-only', ...top100('withClaimsOnly') };

const topGame = S.games[3];
export const Timeline: Story = {
  name: 'Winner timeline',
  render: () => (
    <WinnerTimeline claims={S.claims.filter((c) => c.gameId === topGame.id || c.gameId === S.games[4].id)}
      from={addDays(S.AS_OF, -182)} to={S.AS_OF} covered={S.timelineCoverage} width={900} />
  ),
};

export const ExpectedValue: Story = {
  name: 'Statewide EV panel',
  render: () => <EvPanel games={S.games} tiers={S.prizeTiers} legacy={S.legacyEv} asOf={S.AS_OF} />,
};

export const StatResultCard: Story = { name: 'Stat card · result', render: () => <div className="max-w-[560px]"><StatCard stat={S.statResults[0]} /></div> };
export const StatGated: Story = { name: 'Stat card · insufficient sample', render: () => <div className="max-w-[560px]"><StatCard stat={S.statResults[2]} /></div> };
export const Schedule: Story = { name: 'Listing schedule (no test)', render: () => <div className="max-w-[600px]"><ListingSchedule claims={S.claims} source="sample data" /></div> };
export const ModelGate: Story = { name: 'Model · below gate', render: () => <MlGatePanel gate={S.mlGate} /> };

export const Sources: Story = {
  name: 'Data sources & refresh',
  render: () => {
    const [on, setOn] = useState(false);
    return <SourcesPanel sources={S.sources} online={on} onToggleOnline={setOn} />;
  },
};
