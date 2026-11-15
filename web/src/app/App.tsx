import { Fragment, useEffect, useState } from 'react';
import { ModeProvider } from '../theme/mode';
import * as S from '../fixtures/sample';
import { AppShell, type TabKey } from './AppShell';
import { href, RoutingContext, TAB_PATHS, tabFromPath } from './route';
import { ExplorePage } from '../pages/ExplorePage';
import { DataPage, EvPage, GamesPage, ModelPage, StatsPage } from '../pages/OtherPages';
import { ReportsPage } from '../pages/ReportsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { lookupAddress } from '../data/geocode';
import { loadSettings, saveSettings } from '../settings/localSettings';
import { activePlace, type LocalSettings } from '../settings/settings';
import { useReports } from '../reports/useReports';
import type { ExploreData } from '../pages/ExplorePage';
import type { Filters } from '../domain/types';
import { loadLocalView } from '../data/localView';
import { addDays } from '../lib/format';
import { DEMO_NOTICE, LOCAL_NOTICE, SAMPLE_NOTICE } from '../lib/copy';
import { loadSampleIssue, sampleReportIndex } from '../fixtures/sampleReports';

/** Sample issues link to the local app; on the public demo, point them at the demo instead. */
const loadDemoIssue = (id: string) => loadSampleIssue(id).then((f) => f && JSON.parse(
  JSON.stringify(f).replaceAll('http://127.0.0.1:5180', window.location.origin + href('')),
) as typeof f);

export const sampleExploreData = {
  tracts: S.tracts, income: S.tractIncome, retailers: S.retailers, claims: S.claims, games: S.gameRefs, coverage: S.coverage,
};

function localFilters(d: ExploreData, radiusMiles: number): Filters {
  const to = d.coverage.dateTo;
  return { dateFrom: addDays(to, -364), dateTo: to, gameIds: [], prices: [], prizeBand: 'all', pin: d.coverage.center, radiusMiles };
}

/**
 * The prototype. The Map tab uses real data around the owner's pin when the gitignored
 * local view exists (useLocal); every other tab, and Storybook, use sample fixtures.
 * `demo` is the public GitHub Pages build: sample data only, sample reports, no network.
 */
export function App({ initialTab = 'map', initialMode = 'light', useLocal = false, routed = false, demo = false }: {
  initialTab?: TabKey; initialMode?: 'light' | 'dark'; useLocal?: boolean;
  /** Deep links: tab from the path, page state in the query string (app/route.ts). */
  routed?: boolean;
  demo?: boolean;
}) {
  const [local, setLocal] = useState<ExploreData | null>(null);
  // Saved places (Settings tab); null = no local server to read or save them.
  const [settings, setSettings] = useState<LocalSettings | null>(null);
  // With local data on, pages wait for it, so a deep link never opens on sample data first.
  const [loaded, setLoaded] = useState(!useLocal);
  useEffect(() => {
    if (useLocal) {
      Promise.all([loadLocalView(), loadSettings()]).then(([d, st]) => { setLocal(d); setSettings(st); setLoaded(true); });
    }
  }, [useLocal]);
  // The active saved place moves the local view's center (the map pin, the radius, the area).
  const place = activePlace(settings);
  const radiusMiles = settings?.radiusMiles ?? 5;
  const view = local && place ? { ...local, coverage: { ...local.coverage, center: [place.lon, place.lat] as [number, number] } } : local;
  const changeSettings = async (next: LocalSettings) => {
    const ok = await saveSettings(next);
    if (ok) setSettings(next);
    return ok;
  };
  const [tab, setTabState] = useState<TabKey>(() => {
    if (!routed) return initialTab;
    // Old /emails?email=… links open the same report type under /reports (before any page reads the URL).
    if (window.location.pathname.replace(/\/+$/, '') === href('/emails')) {
      const t = new URLSearchParams(window.location.search).get('email');
      window.history.replaceState(null, '', href(`/reports${t ? `?type=${encodeURIComponent(t)}` : ''}`));
    }
    return tabFromPath(window.location.pathname) ?? initialTab;
  });
  const reports = useReports(useLocal, demo ? sampleReportIndex : undefined);
  // Back/forward: re-read the tab, and remount the page so it re-reads its query params.
  const [nav, setNav] = useState(0);
  useEffect(() => {
    if (!routed) return;
    const onPop = () => { setTabState(tabFromPath(window.location.pathname) ?? 'map'); setNav((n) => n + 1); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [routed]);
  const setTab = (t: TabKey) => {
    if (routed && t !== tab) window.history.pushState(null, '', href(TAB_PATHS[t]));
    setTabState(t);
  };
  const [mode, setMode] = useState<'light' | 'dark'>(initialMode);
  const [online, setOnline] = useState(false);
  const [mapGame, setMapGame] = useState<string | null>(null);
  const filters = view ? localFilters(view, radiusMiles) : mapGame ? { ...S.defaultFilters, gameIds: [mapGame] } : S.defaultFilters;

  return (
    <RoutingContext.Provider value={routed}>
    <ModeProvider mode={mode}>
      <AppShell tab={tab} onTab={setTab} online={online} mode={mode} onToggleMode={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        notice={local ? LOCAL_NOTICE : demo ? DEMO_NOTICE : SAMPLE_NOTICE} demo={demo} unreadReports={reports.unread}>
        {/* Keyed so back/forward remounts the page and it re-reads its deep link. */}
        <Fragment key={`${tab}-${nav}`}>
        {!loaded && <p className="p-6 text-sm text-tertiary">Loading the local data…</p>}
        {loaded && <>
        {tab === 'map' && (
          <ExplorePage key={view ? `local-${place?.id ?? 'pin'}-${radiusMiles}` : (mapGame ?? 'all')} data={view ?? sampleExploreData} initialFilters={filters} online={online} />
        )}
        {tab === 'games' && (local?.ev
          ? <GamesPage games={local.ev.games} tiers={local.ev.tiers} claims={local.claims} coverage={local.coverage} asOf={local.ev.asOf}
              images={new Map(local.games.map((g) => [g.id, g.image]))}
              pace={local.pace ? { games: new Map(local.games.map((g) => [g.id, g.pace])), data: local.pace } : undefined} />
          : <GamesPage games={S.games} tiers={S.prizeTiers} claims={S.claims} coverage={S.coverage} asOf={S.AS_OF}
              onFilterMap={(id) => setMapGame(id)} />)}
        {tab === 'ev' && (local?.ev
          ? <EvPage games={local.ev.games} tiers={local.ev.tiers} legacy={local.ev.legacy} asOf={local.ev.asOf} />
          : <EvPage games={S.games} tiers={S.prizeTiers} legacy={S.legacyEv} asOf={S.AS_OF} />)}
        {tab === 'stats' && (
          <StatsPage stats={S.statResults}
            schedule={local ? { claims: local.claims, source: `real, ${local.coverage.label}` } : { claims: S.claims, source: 'sample data' }} />
        )}
        {tab === 'model' && <ModelPage gate={S.mlGate} />}
        {tab === 'data' && <DataPage sources={S.sources} online={online} onToggleOnline={demo ? undefined : setOnline} coverage={S.coverage} />}
        {tab === 'settings' && (
          <SettingsPage data={local ?? sampleExploreData} defaultCenter={(local ?? sampleExploreData).coverage.center}
            settings={settings} onChange={settings ? changeSettings : undefined}
            lookup={settings && !demo ? lookupAddress : undefined} online={online} onGoOnline={() => setOnline(true)}
            onOpenMap={() => setTab('map')} onOpenGames={() => setTab('games')} demo={demo} />
        )}
        {tab === 'reports' && <ReportsPage index={reports.index} seen={reports.seen} loadIssue={demo ? loadDemoIssue : undefined} />}
        </>}
        </Fragment>
      </AppShell>
    </ModeProvider>
    </RoutingContext.Provider>
  );
}
