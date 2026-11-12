import { useMemo, useState } from 'react';
import { Columns03 } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import type { ViewState } from '@vis.gl/react-maplibre';
import { distance, point } from '@turf/turf';
import { claimCountBreaks, classOf, quantileBreaks, storeCountBreaks } from '../domain/classify';
import { computeTractMetrics, filterClaims, metricValue } from '../domain/metrics';
import type {
  Claim, Coverage, Filters, GameRef, MetricKey, Retailer, TownMatch, TractCollection, TractIncome, TractMetrics,
} from '../domain/types';
import { ClaimsMap, type MapSelection } from '../map/ClaimsMap';
import type { EvData } from '../data/localView';
import type { PaceData } from '../domain/pace';
import type { Basemap } from '../map/mapStyle';
import { CoverageChip } from '../components/Basics';
import { FilterBar, LayerControls, MetricSwitcher, STORE_CLAIMS_MAX } from '../components/Controls';
import { MapLegend, type StoreInView, type StoreKeyControls } from '../components/MapLegend';
import { DetailPanel, type PanelContext } from '../components/DetailDrawer';
import { Playback, WINDOW_DAYS, type PlayMode } from '../components/Playback';
import { HexCard, StoreCard, TractCard, type PanelTab, type StoreTrend, type TrendWindow } from '../components/SelectionCard';
import { PlaceDetails } from '../components/PlaceDetails';
import { addDays, daysBetween, fmtDate, fmtInt } from '../lib/format';
import { LABELS } from '../lib/copy';
import { groupWinners, type WinnerGrouping, type WinnerRow } from '../domain/winners';
import type { WinnersKeyProps } from '../components/WinnersKey';
import { buildHexLayer, hexResForZoom, hexSizeLabel, storeCells, type AreaShape } from '../domain/hexes';

export interface ExploreData {
  tracts: TractCollection;
  income: TractIncome[];
  retailers: Retailer[];
  claims: Claim[];
  games: GameRef[];
  coverage: Coverage;
  /** Per-town matching outcome; only present for real data. */
  townMatch?: Record<string, TownMatch>;
  /** Real statewide EV inputs for the EV tab; only present for real data. */
  ev?: EvData;
  /** Typical-pace ranges and statewide context for game pace (domain/pace.ts); real data only. */
  pace?: PaceData;
}

export interface ExplorePageProps {
  data: ExploreData;
  initialFilters: Filters;
  initialMetric?: MetricKey;
  initialCompare?: boolean;
  initialSelected?: string;
  online?: boolean;
  initialBasemap?: Basemap;
  /** Start with the map filled by hexagons instead of tracts. */
  initialArea?: AreaShape;
}

/** First index with ds[i] > d (ds sorted ascending ISO dates). */
function upperBound(ds: string[], d: string) {
  let lo = 0, hi = ds.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ds[m] <= d) lo = m + 1; else hi = m; }
  return lo;
}
/** First index with ds[i] >= d. */
function lowerBound(ds: string[], d: string) {
  let lo = 0, hi = ds.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ds[m] < d) lo = m + 1; else hi = m; }
  return lo;
}

/** Listed claims per game inside the radius, ignoring the game and price filters. */
function gameCountsInRadius(data: ExploreData, filters: Filters, metrics: TractMetrics[]) {
  const tracts = new Set(metrics.filter((m) => m.inRadius && m.covered).map((m) => m.geoid));
  const stores = new Set(data.retailers.filter((r) => tracts.has(r.tractGeoid)).map((r) => r.id));
  const counts = new Map<string, number>();
  for (const c of filterClaims(data.claims, data.games, { ...filters, gameIds: [], prices: [] }, data.coverage)) {
    if (stores.has(c.retailerId)) counts.set(c.gameId, (counts.get(c.gameId) ?? 0) + 1);
  }
  return counts;
}

function useLayer(data: ExploreData, filters: Filters, metric: MetricKey) {
  return useMemo(() => {
    const claims = filterClaims(data.claims, data.games, filters, data.coverage);
    const metrics = computeTractMetrics({ ...data, claims, filters });
    const shown = metrics.filter((m) => m.inRadius);
    const values = shown.map((m) => metricValue(m, metric)).filter((v): v is number => v !== null);
    const breaks = metric === 'claims' ? claimCountBreaks(values) : quantileBreaks(values, 5);
    const claimsByRetailer = new Map<string, number>();
    for (const c of claims) claimsByRetailer.set(c.retailerId, (claimsByRetailer.get(c.retailerId) ?? 0) + 1);
    // Store classes for the bubbles: quantile breaks over in-radius stores with listed claims,
    // so one outlier store cannot shrink every other bubble.
    const here = point(filters.pin);
    const storesInRadius = new Set(
      data.retailers.filter((r) => distance(point([r.lon, r.lat]), here, { units: 'miles' }) <= filters.radiusMiles).map((r) => r.id),
    );
    const storeCounts = [...storesInRadius].map((id) => claimsByRetailer.get(id) ?? 0).filter((n) => n > 0);
    // "Hottest" stores: the top 3% of in-radius stores with listed claims, always above the
    // top class's lower edge. null when there are too few stores for a top 3% to mean much.
    const sortedCounts = [...storeCounts].sort((x, y) => x - y);
    const storeBreaks = storeCountBreaks(storeCounts);
    const p97 = sortedCounts.length >= 30 ? sortedCounts[Math.floor(0.97 * (sortedCounts.length - 1))] : null;
    const hotMin = p97 === null ? null : Math.max(p97, (storeBreaks[storeBreaks.length - 1] ?? 0) + 2);
    const bubbleScale = {
      hotMin,
      breaks: storeBreaks,
      min: storeCounts.length ? Math.min(...storeCounts) : 0,
      max: storeCounts.length ? Math.max(...storeCounts) : 0,
      stores: storeCounts.length,
    };
    return {
      claims, metrics, breaks, claimsByRetailer, storesInRadius, bubbleScale, claimCounts: gameCountsInRadius(data, filters, metrics),
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
      tractCount: shown.length,
      claimsInRadius: shown.reduce((sum, m) => sum + (m.claims ?? 0), 0),
      noDataCount: shown.length - values.length,
      lowMatchCount: shown.filter((m) => m.lowMatch).length,
    };
  }, [data, filters, metric]);
}

export function ExplorePage({
  data, initialFilters, initialMetric = 'income', initialCompare = false, initialSelected, online = false, initialBasemap = 'outline',
  initialArea = 'tracts',
}: ExplorePageProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [metric, setMetric] = useState<MetricKey>(initialArea === 'hexes' ? 'claims' : initialMetric);
  // The metric to restore when hexagons (claims only) are switched back to tracts.
  const [metricBeforeHexes, setMetricBeforeHexes] = useState<MetricKey>(initialMetric);
  const [metricB, setMetricB] = useState<MetricKey>(initialMetric === 'income' ? 'claims' : 'income');
  const [compare, setCompare] = useState(initialCompare);
  const [selection, setSelection] = useState<MapSelection>(() => {
    const f = initialSelected ? data.tracts.features.find((t) => t.properties.geoid === initialSelected) : undefined;
    return f ? { kind: 'tract', geoid: f.properties.geoid, lngLat: f.properties.centroid } : null;
  });
  // Store key: classes switched off in the legend, and the map's visible bounds.
  const [hiddenClasses, setHiddenClasses] = useState<Set<number>>(new Set());
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab | null>(initialSelected ? 'claims' : null);
  const [layers, setLayers] = useState({ areaShape: initialArea, tractOpacity: 0.78, bubbleOpacity: 0.9, showBubbles: true, basemap: initialBasemap });
  const [view, setView] = useState<Partial<ViewState>>({
    longitude: data.coverage.center[0], latitude: data.coverage.center[1], zoom: 10.4,
  });

  // Playback: the map shows listed claims up to playDate (Grow) or the 30 days to it, while
  // class breaks and bubble sizes keep the full range's scale so growth is visible.
  const [playDate, setPlayDate] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState<PlayMode>('grow');
  const a = useLayer(data, filters, metric);
  const b = useLayer(data, filters, metricB);
  // Hexagons: size follows the zoom; counts follow the same filters as the store bubbles.
  const hexRes = hexResForZoom(view.zoom ?? 10.4);
  const cells = useMemo(() => storeCells(data.retailers, hexRes), [data.retailers, hexRes]);
  const coveredTracts = useMemo(() => new Set(a.metrics.filter((m) => m.covered).map((m) => m.geoid)), [a.metrics]);
  const hexes = useMemo(
    () => (layers.areaShape === 'hexes'
      ? buildHexLayer({ res: hexRes, cells, retailers: data.retailers, claims: a.claims, coveredTracts, filters })
      : null),
    [layers.areaShape, hexRes, cells, data.retailers, a.claims, coveredTracts, filters],
  );
  // Each store's listed dates, sorted, indexed once when playback starts; every frame then
  // counts by binary search instead of refiltering every claim.
  const playing = playDate !== null;
  const storeDates = useMemo(() => {
    if (!playing) return null;
    const m = new Map<string, string[]>();
    for (const c of a.claims) {
      const list = m.get(c.retailerId);
      if (list) list.push(c.listedDate); else m.set(c.retailerId, [c.listedDate]);
    }
    for (const v of m.values()) v.sort();
    return m;
  }, [playing, a.claims]);
  const playCounts = useMemo(() => {
    if (!storeDates || !playDate) return null;
    const from = playMode === 'window' ? addDays(playDate, -(WINDOW_DAYS - 1)) : null;
    const out = new Map<string, number>();
    for (const [id, ds] of storeDates) {
      const n = upperBound(ds, playDate) - (from ? lowerBound(ds, from) : 0);
      if (n > 0) out.set(id, n);
    }
    return out;
  }, [storeDates, playDate, playMode]);
  // Bubbles use the playback counts; tracts, legend classes and sizes keep the full range.
  const storeCounts = playCounts ?? a.claimsByRetailer;
  const playInRadius = playCounts ? [...a.storesInRadius].reduce((s2, id) => s2 + (playCounts.get(id) ?? 0), 0) : null;
  // What is selected: a store or a tract, its listed claims under the current filters, and
  // the end of the date filter that "recent" counts back from.
  const anchor = filters.dateTo < data.coverage.dateTo ? filters.dateTo : data.coverage.dateTo;
  // Trending over the selected listed-date range: the later half vs the earlier half, under
  // the other filters. Trending = at least `min` in the later half and at least double the
  // earlier half; `min` scales with the half's length (8 per 90 days, never under 3).
  const trendWindow = useMemo((): TrendWindow => {
    const from = filters.dateFrom > data.coverage.dateFrom ? filters.dateFrom : data.coverage.dateFrom;
    const half = Math.max(1, Math.floor((daysBetween(from, anchor) + 1) / 2));
    const recentFrom = addDays(anchor, -(half - 1));
    return { priorFrom: addDays(recentFrom, -half), priorTo: addDays(recentFrom, -1), recentFrom, recentTo: anchor,
      min: Math.max(3, Math.round((8 * half) / 90)) };
  }, [filters.dateFrom, data.coverage.dateFrom, anchor]);
  const trend = useMemo(() => {
    const out = new Map<string, StoreTrend>();
    for (const c of filterClaims(data.claims, data.games, { ...filters, dateFrom: trendWindow.priorFrom, dateTo: anchor }, data.coverage)) {
      const t = out.get(c.retailerId) ?? { recent: 0, prior: 0, trending: false };
      if (c.listedDate >= trendWindow.recentFrom) t.recent += 1; else t.prior += 1;
      out.set(c.retailerId, t);
    }
    for (const t of out.values()) t.trending = t.recent >= trendWindow.min && t.recent >= 2 * Math.max(t.prior, 1);
    return out;
  }, [data, filters, anchor, trendWindow]);
  const selStore = selection?.kind === 'store' ? data.retailers.find((r) => r.id === selection.id) : undefined;
  const selGeoid = selection?.kind === 'tract' ? selection.geoid : selStore?.tractGeoid;
  const selTract = data.tracts.features.find((f) => f.properties.geoid === selGeoid)?.properties;
  const selMetrics = a.metrics.find((m) => m.geoid === selGeoid);
  const tractStores = selection?.kind === 'tract' ? data.retailers.filter((r) => r.tractGeoid === selection.geoid) : [];
  // A selected hexagon only matches while the zoom keeps the same hexagon size.
  const hexStores = selection?.kind === 'hex'
    ? data.retailers.filter((r) => cells.get(r.id) === selection.cell && coveredTracts.has(r.tractGeoid)) : [];
  const areaStores = selection?.kind === 'hex' ? hexStores : tractStores;
  const selClaims = selStore
    ? a.claims.filter((c) => c.retailerId === selStore.id)
    : (() => { const ids = new Set(areaStores.map((r) => r.id)); return a.claims.filter((c) => ids.has(c.retailerId)); })();
  const clear = () => { setSelection(null); setPanelTab(null); };

  // Stores in the current view (respecting the claims-per-store slider), busiest first.
  const [lo, hi] = filters.storeClaims ?? [0, STORE_CLAIMS_MAX];
  const inView: StoreInView[] = !bounds ? [] : data.retailers
    .filter((r) => r.lon >= bounds[0] && r.lon <= bounds[2] && r.lat >= bounds[1] && r.lat <= bounds[3])
    .map((r) => {
      const n = storeCounts.get(r.id) ?? 0;
      const hot = a.bubbleScale.hotMin !== null && n >= a.bubbleScale.hotMin;
      return { id: r.id, name: r.name, town: r.town, n, cls: hot ? 5 : n > 0 ? classOf(n, a.bubbleScale.breaks) : -1, trend: trend.get(r.id) };
    })
    .filter((st) => st.n >= lo && (hi >= STORE_CLAIMS_MAX || st.n <= hi))
    .sort((x, y) => y.n - x.n || x.name.localeCompare(y.name));
  const storeControls: StoreKeyControls = {
    inView, hidden: hiddenClasses, trendWindow,
    onToggle: (cls) => setHiddenClasses((h) => { const n = new Set(h); if (n.has(cls)) n.delete(cls); else n.add(cls); return n; }),
    onShowAll: () => setHiddenClasses(new Set()),
    onSelectStore: (id) => selectStore(id),
  };
  const selectStore = (id: string) => { setSelection({ kind: 'store', id }); setPanelTab((t) => (t ? (t === 'stores' ? 'claims' : t) : null)); };
  const zoomTo = (lngLat: [number, number], zoom: number) => setView({ ...view, longitude: lngLat[0], latitude: lngLat[1], zoom });

  const pinned = (() => {
    if (!selection || panelTab) return null;
    if (selStore) {
      return {
        lngLat: [selStore.lon, selStore.lat] as [number, number],
        node: <StoreCard store={selStore} claims={selClaims} games={data.games} anchor={anchor} trend={trend.get(selStore.id)} trendWindow={trendWindow}
          onOpen={setPanelTab} onZoom={() => zoomTo([selStore.lon, selStore.lat], 16)} onClose={clear} />,
      };
    }
    if (selection.kind === 'hex' && hexStores.length) {
      return {
        lngLat: selection.lngLat,
        node: <HexCard sizeLabel={hexSizeLabel(hexRes, false)} stores={hexStores} claims={selClaims} games={data.games} anchor={anchor}
          onZoom={() => zoomTo(selection.lngLat, hexRes === 6 ? 10.6 : hexRes === 7 ? 12.6 : 14.5)} onClose={clear} />,
      };
    }
    if (selection.kind === 'tract' && selTract && selMetrics) {
      return {
        lngLat: selection.lngLat,
        node: <TractCard tract={selTract} metrics={selMetrics} coverage={data.coverage} stores={tractStores} claims={selClaims}
          games={data.games} anchor={anchor} onOpen={setPanelTab} onZoom={() => zoomTo(selection.lngLat, 14.5)} onClose={clear} />,
      };
    }
    return null;
  })();
  const panelContext: PanelContext | null = selStore
    ? { kind: 'store', store: selStore, tract: selTract }
    : selection?.kind === 'tract' && selTract && selMetrics
      ? { kind: 'tract', tract: selTract, metrics: selMetrics, stores: tractStores }
      : null;
  // Winners by ticket: listed claims in the radius (same tracts as the header count), grouped
  // by price, prize size or game. Each grouping ignores its own filter so every group stays
  // visible to pick.
  const winnerRows = useMemo(() => {
    const tracts = new Set(a.metrics.filter((m) => m.inRadius && m.covered).map((m) => m.geoid));
    const stores = new Set(data.retailers.filter((r) => tracts.has(r.tractGeoid)).map((r) => r.id));
    const inRadius = (f: Filters) =>
      filterClaims(data.claims, data.games, f, data.coverage).filter((c) => stores.has(c.retailerId));
    return {
      price: groupWinners(inRadius({ ...filters, prices: [] }), data.games, 'price'),
      prize: groupWinners(inRadius({ ...filters, prizeBand: 'all' }), data.games, 'prize'),
      game: groupWinners(inRadius({ ...filters, gameIds: [] }), data.games, 'game'),
    } satisfies Record<WinnerGrouping, WinnerRow[]>;
  }, [data, filters, a.metrics]);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const winners: WinnersKeyProps = {
    rows: winnerRows,
    active: {
      price: filters.prices.map(String),
      prize: filters.prizeBand === 'all' ? [] : [filters.prizeBand],
      game: filters.gameIds,
    },
    onPick: (by, id) => setFilters((f) =>
      by === 'price' ? { ...f, prices: toggle(f.prices.map(String), id).map(Number) }
        : by === 'prize' ? { ...f, prizeBand: f.prizeBand === id ? 'all' : (id as Filters['prizeBand']) }
          : { ...f, gameIds: toggle(f.gameIds, id) }),
  };
  const covered = a.metrics.filter((m) => m.inRadius && m.covered).length;

  const mapProps = {
    tracts: data.tracts, retailers: data.retailers, coverage: data.coverage,
    pin: filters.pin, radiusMiles: filters.radiusMiles, ...layers,
    basemap: online ? layers.basemap : ('outline' as const),
    onPinChange: (pin: [number, number]) => setFilters({ ...filters, pin }),
    selection,
    storeRange: filters.storeClaims,
    hiddenClasses,
    onSelectTract: (geoid: string, lngLat: [number, number]) => setSelection({ kind: 'tract', geoid, lngLat }),
    onSelectStore: selectStore,
    onClearSelection: clear,
  };
  // Hexagons map listed claims only: switch the metric to claims, and restore it on the way back.
  const setArea = (areaShape: AreaShape) => {
    if (areaShape === layers.areaShape) return;
    if (areaShape === 'hexes') { setMetricBeforeHexes(metric); setMetric('claims'); } else setMetric(metricBeforeHexes);
    if (selection?.kind === 'tract' || selection?.kind === 'hex') clear();
    setLayers({ ...layers, areaShape });
  };

  // Controls sit top-left, the legend bottom-right; each scrolls on its own so neither is
  // clipped or overlaps the other on short windows.
  const controlsBox = 'absolute top-3 left-3 max-h-[calc(100%-2.5rem)] overflow-y-auto';
  const legendBox = 'absolute right-3 bottom-7 max-h-[calc(100%-5.5rem)] overflow-y-auto rounded-xl';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-secondary bg-primary px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <MetricSwitcher value={metric} onChange={setMetric} claimsOnly={layers.areaShape === 'hexes'} />
          <Button size="sm" color={compare ? 'primary' : 'secondary'} iconLeading={Columns03} onClick={() => setCompare(!compare)}
            aria-pressed={compare}>
            Side by side
          </Button>
          <div className="flex-1" />
          <CoverageChip coverage={data.coverage} />
          <p className="text-xs text-tertiary tabular">
            {fmtInt(playInRadius ?? a.claimsInRadius)} {LABELS.listedClaims.toLowerCase()} in radius{playDate ? ` through ${fmtDate(playDate)}` : ''} · {fmtInt(covered)} covered tracts
          </p>
        </div>
        <FilterBar
          filters={filters} games={data.games} minDate={data.coverage.dateFrom} maxDate={data.coverage.dateTo}
          claimCounts={a.claimCounts} onChange={setFilters} onReset={() => setFilters(initialFilters)}
        />
      </div>
      <div className="flex min-h-0 flex-1">
      <div className="grid min-h-0 min-w-0 flex-1 gap-0.5 bg-[var(--color-border-secondary)]" style={{ gridTemplateColumns: compare ? '1fr 1fr' : '1fr' }}>
        <div className="relative min-h-0">
          <ClaimsMap {...mapProps} metric={metric} metrics={a.metrics} breaks={a.breaks} claimsByRetailer={storeCounts} playing={playing}
            storesInRadius={a.storesInRadius} bubbleBreaks={a.bubbleScale.breaks} hotMin={a.bubbleScale.hotMin}
            viewState={view} onMove={setView} pinned={pinned} onBounds={setBounds}
            hexes={hexes} onSelectHex={(cell, lngLat) => { setSelection({ kind: 'hex', cell, lngLat }); setPanelTab(null); }} />
          <div className="absolute bottom-7 left-3 z-10">
            <Playback from={filters.dateFrom} to={filters.dateTo < data.coverage.dateTo ? filters.dateTo : data.coverage.dateTo}
              value={playDate} onChange={setPlayDate} mode={playMode} onMode={setPlayMode} />
          </div>
          {!compare && (
            <div className={controlsBox}>
              <LayerControls {...layers} online={online}
                onChange={({ areaShape, ...p }) => (areaShape ? setArea(areaShape) : setLayers({ ...layers, ...p }))} />
            </div>
          )}
          <div className={legendBox}>
            <MapLegend metric={metric} breaks={a.breaks} min={a.min} max={a.max} tractCount={a.tractCount} noDataCount={a.noDataCount} lowMatchCount={a.lowMatchCount} coverage={data.coverage}
              bubbles={layers.showBubbles ? a.bubbleScale : undefined} storeControls={layers.showBubbles ? storeControls : undefined}
              winners={winners} hexes={hexes} />
          </div>
          <p className="absolute top-3.5 right-13 rounded-md bg-primary/90 px-2 py-0.5 text-xs text-secondary shadow-xs ring-1 ring-secondary">
            Click a store or {layers.areaShape === 'hexes' ? 'hexagon' : 'tract'} for recent claims and actions · double-click to move the pin
          </p>
        </div>
        {compare && (
          <div className="relative min-h-0">
            <ClaimsMap {...mapProps} metric={metricB} metrics={b.metrics} breaks={b.breaks} claimsByRetailer={b.claimsByRetailer}
              storesInRadius={b.storesInRadius} bubbleBreaks={b.bubbleScale.breaks} hotMin={b.bubbleScale.hotMin}
              viewState={view} onMove={setView} />
            <div className={controlsBox}>
              <div className="rounded-lg bg-primary p-1 shadow-xs ring-1 ring-secondary"><MetricSwitcher value={metricB} onChange={setMetricB} /></div>
            </div>
            <div className={legendBox}>
              <MapLegend metric={metricB} breaks={b.breaks} min={b.min} max={b.max} tractCount={b.tractCount} noDataCount={b.noDataCount} lowMatchCount={b.lowMatchCount} coverage={data.coverage}
                bubbles={layers.showBubbles ? b.bubbleScale : undefined} />
            </div>
          </div>
        )}
      </div>
      {panelTab && panelContext && (
        <DetailPanel
          key={panelContext.kind === 'store' ? panelContext.store.id : panelContext.tract.geoid}
          context={panelContext} tab={panelTab} onTab={setPanelTab} onClose={() => setPanelTab(null)}
          claims={selClaims} games={data.games} retailers={data.retailers} coverage={data.coverage} anchor={anchor}
          onSelectStore={selectStore}
          placeSlot={selStore ? <PlaceDetails store={selStore} online={online} /> : null}
        />
      )}
      </div>
    </div>
  );
}
