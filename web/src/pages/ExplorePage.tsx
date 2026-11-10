import { useMemo, useState } from 'react';
import { Columns03 } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import type { ViewState } from '@vis.gl/react-maplibre';
import { distance, point } from '@turf/turf';
import { countBreaks, quantileBreaks } from '../domain/classify';
import { computeTractMetrics, filterClaims, metricValue } from '../domain/metrics';
import type {
  Claim, Coverage, Filters, GameRef, MetricKey, Retailer, TownMatch, TractCollection, TractIncome, TractMetrics,
} from '../domain/types';
import { ClaimsMap } from '../map/ClaimsMap';
import type { Basemap } from '../map/mapStyle';
import { CoverageChip } from '../components/Basics';
import { FilterBar, LayerControls, MetricSwitcher } from '../components/Controls';
import { MapLegend } from '../components/MapLegend';
import { DetailDrawer } from '../components/DetailDrawer';
import { fmtInt } from '../lib/format';
import { LABELS } from '../lib/copy';

export interface ExploreData {
  tracts: TractCollection;
  income: TractIncome[];
  retailers: Retailer[];
  claims: Claim[];
  games: GameRef[];
  coverage: Coverage;
  /** Per-town matching outcome; only present for real data. */
  townMatch?: Record<string, TownMatch>;
}

export interface ExplorePageProps {
  data: ExploreData;
  initialFilters: Filters;
  initialMetric?: MetricKey;
  initialCompare?: boolean;
  initialSelected?: string;
  online?: boolean;
  initialBasemap?: Basemap;
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
    const breaks = metric === 'claims' ? countBreaks(values, 5) : quantileBreaks(values, 5);
    const claimsByRetailer = new Map<string, number>();
    for (const c of claims) claimsByRetailer.set(c.retailerId, (claimsByRetailer.get(c.retailerId) ?? 0) + 1);
    // Store classes for the bubbles: quantile breaks over in-radius stores with listed claims,
    // so one outlier store cannot shrink every other bubble.
    const here = point(filters.pin);
    const storesInRadius = new Set(
      data.retailers.filter((r) => distance(point([r.lon, r.lat]), here, { units: 'miles' }) <= filters.radiusMiles).map((r) => r.id),
    );
    const storeCounts = [...storesInRadius].map((id) => claimsByRetailer.get(id) ?? 0).filter((n) => n > 0);
    const bubbleScale = {
      breaks: countBreaks(storeCounts, 5),
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
}: ExplorePageProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [metric, setMetric] = useState<MetricKey>(initialMetric);
  const [metricB, setMetricB] = useState<MetricKey>(initialMetric === 'income' ? 'claims' : 'income');
  const [compare, setCompare] = useState(initialCompare);
  const [selected, setSelected] = useState<string | undefined>(initialSelected);
  const [layers, setLayers] = useState({ tractOpacity: 0.78, bubbleOpacity: 0.9, showBubbles: true, basemap: initialBasemap });
  const [view, setView] = useState<Partial<ViewState>>({
    longitude: data.coverage.center[0], latitude: data.coverage.center[1], zoom: 10.4,
  });

  const a = useLayer(data, filters, metric);
  const b = useLayer(data, filters, metricB);
  const selTract = data.tracts.features.find((f) => f.properties.geoid === selected)?.properties;
  const selMetrics = a.metrics.find((m) => m.geoid === selected);
  const selRetailers = new Set(data.retailers.filter((r) => r.tractGeoid === selected).map((r) => r.id));
  const selClaims = a.claims.filter((c) => selRetailers.has(c.retailerId));
  const covered = a.metrics.filter((m) => m.inRadius && m.covered).length;

  const mapProps = {
    tracts: data.tracts, retailers: data.retailers, coverage: data.coverage,
    pin: filters.pin, radiusMiles: filters.radiusMiles, ...layers,
    basemap: online ? layers.basemap : ('outline' as const),
    onPinChange: (pin: [number, number]) => setFilters({ ...filters, pin }),
    onSelectTract: setSelected,
  };

  // Controls sit top-left, the legend bottom-right; each scrolls on its own so neither is
  // clipped or overlaps the other on short windows.
  const controlsBox = 'absolute top-3 left-3 max-h-[calc(100%-2.5rem)] overflow-y-auto';
  const legendBox = 'absolute right-3 bottom-7 max-h-[calc(100%-5.5rem)] overflow-y-auto rounded-xl';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-secondary bg-primary px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <MetricSwitcher value={metric} onChange={setMetric} />
          <Button size="sm" color={compare ? 'primary' : 'secondary'} iconLeading={Columns03} onClick={() => setCompare(!compare)}
            aria-pressed={compare}>
            Side by side
          </Button>
          <div className="flex-1" />
          <CoverageChip coverage={data.coverage} />
          <p className="text-xs text-tertiary tabular">
            {fmtInt(a.claimsInRadius)} {LABELS.listedClaims.toLowerCase()} in radius · {fmtInt(covered)} covered tracts
          </p>
        </div>
        <FilterBar
          filters={filters} games={data.games} minDate={data.coverage.dateFrom} maxDate={data.coverage.dateTo}
          claimCounts={a.claimCounts} onChange={setFilters} onReset={() => setFilters(initialFilters)}
        />
      </div>
      <div className="grid min-h-0 flex-1 gap-0.5 bg-[var(--color-border-secondary)]" style={{ gridTemplateColumns: compare ? '1fr 1fr' : '1fr' }}>
        <div className="relative min-h-0">
          <ClaimsMap {...mapProps} metric={metric} metrics={a.metrics} breaks={a.breaks} claimsByRetailer={a.claimsByRetailer}
            storesInRadius={a.storesInRadius} bubbleBreaks={a.bubbleScale.breaks}
            viewState={view} onMove={setView} />
          {!compare && (
            <div className={controlsBox}>
              <LayerControls {...layers} online={online} onChange={(p) => setLayers({ ...layers, ...p })} />
            </div>
          )}
          <div className={legendBox}>
            <MapLegend metric={metric} breaks={a.breaks} min={a.min} max={a.max} tractCount={a.tractCount} noDataCount={a.noDataCount} lowMatchCount={a.lowMatchCount} coverage={data.coverage}
              bubbles={layers.showBubbles ? a.bubbleScale : undefined} />
          </div>
          <p className="absolute top-3.5 right-13 rounded-md bg-primary/90 px-2 py-0.5 text-xs text-secondary shadow-xs ring-1 ring-secondary">
            Double-click to move the pin · click a tract for its listed claims
          </p>
        </div>
        {compare && (
          <div className="relative min-h-0">
            <ClaimsMap {...mapProps} metric={metricB} metrics={b.metrics} breaks={b.breaks} claimsByRetailer={b.claimsByRetailer}
              storesInRadius={b.storesInRadius} bubbleBreaks={b.bubbleScale.breaks}
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
      <DetailDrawer
        open={!!selected} onClose={() => setSelected(undefined)} tract={selTract} metrics={selMetrics}
        claims={selClaims} games={data.games} retailers={data.retailers} coverage={data.coverage}
      />
    </div>
  );
}
