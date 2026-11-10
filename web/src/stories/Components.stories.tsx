import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Box, Stack } from '@mui/material';
import * as S from '../fixtures/sample';
import { computeTractMetrics, filterClaims } from '../domain/metrics';
import { CaveatNote, CoverageChip, IncomeValue } from '../components/Basics';
import { TractTooltip } from '../components/TractTooltip';
import { MapLegend } from '../components/MapLegend';
import { FilterBar, LayerControls, MetricSwitcher } from '../components/Controls';
import { DetailBody } from '../components/DetailDrawer';
import { buildGameRows, OpenGamesTable } from '../components/OpenGamesTable';
import { WinnerTimeline } from '../components/WinnerTimeline';
import { EvPanel } from '../components/EvPanel';
import { MlGatePanel, StatCard } from '../components/Analysis';
import { SourcesPanel } from '../components/SourcesPanel';
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
    <Stack spacing={1.5} sx={{ maxWidth: 560 }}>
      <CoverageChip coverage={S.coverage} />
      {Object.values(CAVEATS).map((c) => <CaveatNote key={c}>{c}</CaveatNote>)}
    </Stack>
  ),
};

export const IncomeWithMarginOfError: Story = {
  render: () => (
    <Stack spacing={1.5}>
      <IncomeValue value={84200} moe={9100} flag="ok" />
      <IncomeValue value={61000} moe={23800} flag="high_moe" />
      <IncomeValue value={null} moe={null} flag="suppressed" />
    </Stack>
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
export const TooltipNoRetailers: Story = {
  name: 'Tract tooltip · no retailers',
  render: () => <TractTooltip tract={props(noRetailers.geoid)} metrics={noRetailers} coverage={S.coverage} />,
};

export const Legend: StoryObj<{ metric: MetricKey }> = {
  args: { metric: 'claims' },
  argTypes: { metric: { control: 'inline-radio', options: ['claims', 'income', 'perRetailer'] } },
  render: ({ metric }) => (
    <MapLegend metric={metric} breaks={metric === 'income' ? [62000, 81000, 99000, 124000] : metric === 'claims' ? [1, 2, 4, 7] : [0.5, 1, 2, 3.5]}
      min={metric === 'income' ? 31000 : 0} max={metric === 'income' ? 210000 : 19} tractCount={104} noDataCount={12} coverage={S.coverage} />
  ),
};

export const Filters_: Story = {
  name: 'Filter bar',
  render: () => {
    const [f, setF] = useState<Filters>(S.defaultFilters);
    return <FilterBar filters={f} games={S.games} minDate={S.coverage.dateFrom} maxDate={S.coverage.dateTo} onChange={setF} onReset={() => setF(S.defaultFilters)} />;
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
    <Box sx={{ border: 1, borderColor: 'divider', display: 'inline-block', bgcolor: 'background.paper' }}>
      <DetailBody tract={props(sel.geoid)} metrics={sel} claims={S.claims.filter((c) => selRet.has(c.retailerId))}
        games={S.games} retailers={S.retailers} coverage={S.coverage} onClose={() => {}} />
    </Box>
  ),
};
export const DrillDownUncovered: Story = {
  name: 'Drill-down · outside coverage',
  render: () => (
    <Box sx={{ border: 1, borderColor: 'divider', display: 'inline-block', bgcolor: 'background.paper' }}>
      <DetailBody tract={props(uncovered.geoid)} metrics={uncovered} claims={[]} games={S.games} retailers={S.retailers} coverage={S.coverage} onClose={() => {}} />
    </Box>
  ),
};

export const OpenGames: Story = {
  render: () => <OpenGamesTable rows={buildGameRows(S.games, S.prizeTiers, S.claims)} asOf={S.AS_OF} />,
};

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

export const StatResultCard: Story = { name: 'Stat card · result', render: () => <Box sx={{ maxWidth: 560 }}><StatCard stat={S.statResults[0]} /></Box> };
export const StatGated: Story = { name: 'Stat card · insufficient sample', render: () => <Box sx={{ maxWidth: 560 }}><StatCard stat={S.statResults[2]} /></Box> };
export const ModelGate: Story = { name: 'Model · below gate', render: () => <MlGatePanel gate={S.mlGate} /> };

export const Sources: Story = {
  name: 'Data sources & refresh',
  render: () => {
    const [on, setOn] = useState(false);
    return <SourcesPanel sources={S.sources} online={on} onToggleOnline={setOn} />;
  },
};
