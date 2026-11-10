import { useMemo, useState } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createAppTheme } from '../theme/theme';
import * as S from '../fixtures/sample';
import { AppShell, type TabKey } from './AppShell';
import { ExplorePage } from '../pages/ExplorePage';
import { DataPage, EvPage, GamesPage, ModelPage, StatsPage } from '../pages/OtherPages';

export const sampleExploreData = {
  tracts: S.tracts, income: S.tractIncome, retailers: S.retailers, claims: S.claims, games: S.games, coverage: S.coverage,
};

/** The prototype. Runs on sample fixtures until the local API serves real data. */
export function App({ initialTab = 'map', initialMode = 'light' }: { initialTab?: TabKey; initialMode?: 'light' | 'dark' }) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [mode, setMode] = useState<'light' | 'dark'>(initialMode);
  const [online, setOnline] = useState(false);
  const [mapGame, setMapGame] = useState<string | null>(null);
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const filters = mapGame ? { ...S.defaultFilters, gameIds: [mapGame] } : S.defaultFilters;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppShell tab={tab} onTab={setTab} online={online} mode={mode} onToggleMode={() => setMode(mode === 'dark' ? 'light' : 'dark')}>
        {tab === 'map' && <ExplorePage key={mapGame ?? 'all'} data={sampleExploreData} initialFilters={filters} online={online} />}
        {tab === 'games' && (
          <GamesPage games={S.games} tiers={S.prizeTiers} claims={S.claims} coverage={S.coverage} asOf={S.AS_OF}
            onFilterMap={(id) => setMapGame(id)} />
        )}
        {tab === 'ev' && <EvPage games={S.games} tiers={S.prizeTiers} legacy={S.legacyEv} asOf={S.AS_OF} />}
        {tab === 'stats' && <StatsPage stats={S.statResults} />}
        {tab === 'model' && <ModelPage gate={S.mlGate} />}
        {tab === 'data' && <DataPage sources={S.sources} online={online} onToggleOnline={setOnline} coverage={S.coverage} />}
      </AppShell>
    </ThemeProvider>
  );
}
