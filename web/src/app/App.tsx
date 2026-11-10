import { useEffect, useMemo, useState } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createAppTheme } from '../theme/theme';
import * as S from '../fixtures/sample';
import { AppShell, type TabKey } from './AppShell';
import { ExplorePage } from '../pages/ExplorePage';
import { DataPage, EvPage, GamesPage, ModelPage, StatsPage } from '../pages/OtherPages';
import type { ExploreData } from '../pages/ExplorePage';
import type { Filters } from '../domain/types';
import { loadLocalView } from '../data/localView';
import { addDays } from '../lib/format';
import { LOCAL_NOTICE, SAMPLE_NOTICE } from '../lib/copy';

export const sampleExploreData = {
  tracts: S.tracts, income: S.tractIncome, retailers: S.retailers, claims: S.claims, games: S.games, coverage: S.coverage,
};

function localFilters(d: ExploreData): Filters {
  const to = d.coverage.dateTo;
  return { dateFrom: addDays(to, -364), dateTo: to, gameIds: [], prices: [], prizeBand: 'all', pin: d.coverage.center, radiusMiles: 5 };
}

/**
 * The prototype. The Map tab uses real data around the owner's pin when the gitignored
 * local view exists (useLocal); every other tab, and Storybook, use sample fixtures.
 */
export function App({ initialTab = 'map', initialMode = 'light', useLocal = false }: { initialTab?: TabKey; initialMode?: 'light' | 'dark'; useLocal?: boolean }) {
  const [local, setLocal] = useState<ExploreData | null>(null);
  useEffect(() => {
    if (useLocal) loadLocalView().then(setLocal);
  }, [useLocal]);
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [mode, setMode] = useState<'light' | 'dark'>(initialMode);
  const [online, setOnline] = useState(false);
  const [mapGame, setMapGame] = useState<string | null>(null);
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const filters = local ? localFilters(local) : mapGame ? { ...S.defaultFilters, gameIds: [mapGame] } : S.defaultFilters;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppShell tab={tab} onTab={setTab} online={online} mode={mode} onToggleMode={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        notice={local ? LOCAL_NOTICE : SAMPLE_NOTICE}>
        {tab === 'map' && (
          <ExplorePage key={local ? 'local' : (mapGame ?? 'all')} data={local ?? sampleExploreData} initialFilters={filters} online={online} />
        )}
        {tab === 'games' && (
          <GamesPage games={S.games} tiers={S.prizeTiers} claims={S.claims} coverage={S.coverage} asOf={S.AS_OF}
            onFilterMap={local ? undefined : (id) => setMapGame(id)} />
        )}
        {tab === 'ev' && <EvPage games={S.games} tiers={S.prizeTiers} legacy={S.legacyEv} asOf={S.AS_OF} />}
        {tab === 'stats' && (
          <StatsPage stats={S.statResults}
            schedule={local ? { claims: local.claims, source: `real, ${local.coverage.label}` } : { claims: S.claims, source: 'sample data' }} />
        )}
        {tab === 'model' && <ModelPage gate={S.mlGate} />}
        {tab === 'data' && <DataPage sources={S.sources} online={online} onToggleOnline={setOnline} coverage={S.coverage} />}
      </AppShell>
    </ThemeProvider>
  );
}
