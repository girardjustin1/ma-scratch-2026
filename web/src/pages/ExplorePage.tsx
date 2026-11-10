import { useMemo, useState } from 'react';
import { Box, Paper, Stack, ToggleButton, Typography } from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import type { ViewState } from '@vis.gl/react-maplibre';
import { countBreaks, quantileBreaks } from '../domain/classify';
import { computeTractMetrics, filterClaims, metricValue } from '../domain/metrics';
import type {
  Claim, Coverage, Filters, Game, MetricKey, Retailer, TractCollection, TractIncome,
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
  games: Game[];
  coverage: Coverage;
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

function useLayer(data: ExploreData, filters: Filters, metric: MetricKey) {
  return useMemo(() => {
    const claims = filterClaims(data.claims, data.games, filters, data.coverage);
    const metrics = computeTractMetrics({ ...data, claims, filters });
    const shown = metrics.filter((m) => m.inRadius);
    const values = shown.map((m) => metricValue(m, metric)).filter((v): v is number => v !== null);
    const breaks = metric === 'claims' ? countBreaks(values, 5) : quantileBreaks(values, 5);
    const claimsByRetailer = new Map<string, number>();
    for (const c of claims) claimsByRetailer.set(c.retailerId, (claimsByRetailer.get(c.retailerId) ?? 0) + 1);
    return {
      claims, metrics, breaks, claimsByRetailer,
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
      tractCount: shown.length,
      noDataCount: shown.length - values.length,
    };
  }, [data, filters, metric]);
}

export function ExplorePage({
  data, initialFilters, initialMetric = 'claims', initialCompare = false, initialSelected, online = false, initialBasemap = 'outline',
}: ExplorePageProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [metric, setMetric] = useState<MetricKey>(initialMetric);
  const [metricB, setMetricB] = useState<MetricKey>('income');
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

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Paper square sx={{ px: 2, py: 1.25, borderWidth: '0 0 1px 0' }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <MetricSwitcher value={metric} onChange={setMetric} />
            <ToggleButton size="small" value="compare" selected={compare} onChange={() => setCompare(!compare)}>
              <ViewColumnIcon fontSize="small" sx={{ mr: 0.75 }} /> Side by side
            </ToggleButton>
            <Box sx={{ flex: 1 }} />
            <CoverageChip coverage={data.coverage} />
            <Typography variant="caption" className="tabular">
              {fmtInt(a.claims.length)} {LABELS.listedClaims.toLowerCase()} · {fmtInt(covered)} covered tracts in radius
            </Typography>
          </Stack>
          <FilterBar
            filters={filters} games={data.games} minDate={data.coverage.dateFrom} maxDate={data.coverage.dateTo}
            onChange={setFilters} onReset={() => setFilters(initialFilters)}
          />
        </Stack>
      </Paper>
      <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: compare ? '1fr 1fr' : '1fr', gap: '2px', bgcolor: 'divider' }}>
        <Box sx={{ position: 'relative', minHeight: 0 }}>
          <ClaimsMap {...mapProps} metric={metric} metrics={a.metrics} breaks={a.breaks} claimsByRetailer={a.claimsByRetailer}
            viewState={view} onMove={setView} />
          <Box sx={{ position: 'absolute', left: 12, bottom: 28 }}>
            <MapLegend metric={metric} breaks={a.breaks} min={a.min} max={a.max} tractCount={a.tractCount} noDataCount={a.noDataCount} coverage={data.coverage} />
          </Box>
          {!compare && (
            <Box sx={{ position: 'absolute', left: 12, top: 12 }}>
              <LayerControls {...layers} online={online} onChange={(p) => setLayers({ ...layers, ...p })} />
            </Box>
          )}
          <Typography variant="caption" sx={{ position: 'absolute', right: 52, top: 14, bgcolor: 'background.paper', px: 1, borderRadius: 1, opacity: 0.9 }}>
            Double-click to move the pin · click a tract for its listed claims
          </Typography>
        </Box>
        {compare && (
          <Box sx={{ position: 'relative', minHeight: 0 }}>
            <ClaimsMap {...mapProps} metric={metricB} metrics={b.metrics} breaks={b.breaks} claimsByRetailer={b.claimsByRetailer}
              viewState={view} onMove={setView} />
            <Box sx={{ position: 'absolute', left: 12, top: 12 }}>
              <Paper sx={{ p: 0.5 }}><MetricSwitcher value={metricB} onChange={setMetricB} /></Paper>
            </Box>
            <Box sx={{ position: 'absolute', left: 12, bottom: 28 }}>
              <MapLegend metric={metricB} breaks={b.breaks} min={b.min} max={b.max} tractCount={b.tractCount} noDataCount={b.noDataCount} coverage={data.coverage} />
            </Box>
          </Box>
        )}
      </Box>
      <DetailDrawer
        open={!!selected} onClose={() => setSelected(undefined)} tract={selTract} metrics={selMetrics}
        claims={selClaims} games={data.games} retailers={data.retailers} coverage={data.coverage}
      />
    </Stack>
  );
}
