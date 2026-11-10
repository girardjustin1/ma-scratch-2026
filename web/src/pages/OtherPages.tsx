import { useMemo, useState } from 'react';
import { Box, Grid, Paper, Stack, Typography } from '@mui/material';
import type { Claim, Coverage, Game, LegacyEv, PrizeTier, StatResult } from '../domain/types';
import { buildGameRows, buildPrizeRows, OpenGamesTable } from '../components/OpenGamesTable';
import { WinnerTimeline } from '../components/WinnerTimeline';
import { EvPanel } from '../components/EvPanel';
import { MlGatePanel, StatCard, type MlGate } from '../components/Analysis';
import { SourcesPanel, type SourceRow } from '../components/SourcesPanel';
import { CaveatNote } from '../components/Basics';
import { CAVEATS } from '../lib/copy';
import { addDays, fmtDate } from '../lib/format';

const Page = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ p: 3, overflow: 'auto', height: '100%' }}><Stack spacing={2.5} sx={{ maxWidth: 1240, mx: 'auto' }}>{children}</Stack></Box>
);

export function GamesPage({ games, tiers, claims, coverage, asOf, onFilterMap }: {
  games: Game[]; tiers: PrizeTier[]; claims: Claim[]; coverage: Coverage; asOf: string; onFilterMap?: (gameId: string) => void;
}) {
  const rows = useMemo(() => buildGameRows(games, tiers, claims), [games, tiers, claims]);
  const prizeRows = useMemo(() => buildPrizeRows(games, tiers, claims), [games, tiers, claims]);
  const [sel, setSel] = useState(rows.slice().sort((a, b) => b.largestUnclaimed - a.largestUnclaimed)[0]?.game.id);
  const game = games.find((g) => g.id === sel);
  const from = addDays(asOf, -182);
  return (
    <Page>
      <OpenGamesTable rows={rows} prizeRows={prizeRows} asOf={asOf} selectedId={sel} onSelect={(id) => { setSel(id); onFilterMap?.(id); }} />
      {game && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h2">{game.name}: listed claims, last six months</Typography>
          <Typography variant="caption">Dot size by prize. Grey bands are periods with no claims coverage, not periods without claims.</Typography>
          <WinnerTimeline claims={claims.filter((c) => c.gameId === game.id)} from={from} to={asOf} covered={[{ from: coverage.dateFrom, to: coverage.dateTo }]} width={1180} />
          <CaveatNote>{CAVEATS.listedOnly} {CAVEATS.listedDate}</CaveatNote>
        </Paper>
      )}
    </Page>
  );
}

export function EvPage(props: { games: Game[]; tiers: PrizeTier[]; legacy: LegacyEv[]; asOf: string }) {
  return <Page><EvPanel {...props} /></Page>;
}

export function StatsPage({ stats }: { stats: StatResult[] }) {
  return (
    <Page>
      <Box>
        <Typography variant="h1">Statistical exploration</Typography>
        <Typography variant="body2" color="text.secondary">
          Each test runs only above its sample gate. p-values are Benjamini–Hochberg adjusted across every test on this page.
        </Typography>
      </Box>
      <Grid container spacing={2}>
        {stats.map((s) => <Grid key={s.id} size={{ xs: 12, md: 6 }}><StatCard stat={s} /></Grid>)}
      </Grid>
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
      <Paper sx={{ p: 2, maxWidth: 860 }}>
        <Typography variant="h2" sx={{ mb: 1 }}>Coverage manifest</Typography>
        <Typography variant="body2">Listed claims: {coverage.label}, {fmtDate(coverage.dateFrom)} to {fmtDate(coverage.dateTo)}.</Typography>
        <Box sx={{ mt: 1 }}><CaveatNote>{CAVEATS.coverage}</CaveatNote></Box>
      </Paper>
    </Page>
  );
}
