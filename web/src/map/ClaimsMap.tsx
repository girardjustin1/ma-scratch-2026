import 'maplibre-gl/dist/maplibre-gl.css';
import './worker';
import { useCallback, useMemo, useState } from 'react';
import MapGL, { Layer, Marker, NavigationControl, Source, type MapLayerMouseEvent, type ViewState } from '@vis.gl/react-maplibre';
import type { Map as MlMap } from 'maplibre-gl';
import { circle } from '@turf/turf';
import { Box, useTheme } from '@mui/material';
import PlaceIcon from '@mui/icons-material/Place';
import { classOf } from '../domain/classify';
import { metricValue } from '../domain/metrics';
import type { Coverage, MetricKey, Retailer, TractCollection, TractMetrics } from '../domain/types';
import { bubbles, chrome, ramps, type Mode } from '../theme/tokens';
import { baseStyle, hatchImage, type Basemap } from './mapStyle';
import { TractTooltip } from '../components/TractTooltip';

export interface ClaimsMapProps {
  tracts: TractCollection;
  metrics: TractMetrics[];
  metric: MetricKey;
  breaks: number[];
  retailers: Retailer[];
  claimsByRetailer: Map<string, number>;
  coverage: Coverage;
  pin: [number, number];
  radiusMiles: number;
  tractOpacity?: number;
  bubbleOpacity?: number;
  showBubbles?: boolean;
  basemap?: Basemap;
  viewState?: Partial<ViewState>;
  onMove?: (v: ViewState) => void;
  onPinChange?: (p: [number, number]) => void;
  onSelectTract?: (geoid: string) => void;
  height?: number | string;
}

const rampFor = (metric: MetricKey, mode: Mode) => (metric === 'income' ? ramps.income[mode] : ramps.claims[mode]);

export function ClaimsMap(props: ClaimsMapProps) {
  const {
    tracts, metrics, metric, breaks, retailers, claimsByRetailer, coverage, pin, radiusMiles,
    tractOpacity = 0.78, bubbleOpacity = 0.9, showBubbles = true, basemap = 'outline',
    viewState, onMove, onPinChange, onSelectTract, height = '100%',
  } = props;
  const mode = useTheme().palette.mode as Mode;
  const [hover, setHover] = useState<{ x: number; y: number; geoid: string } | null>(null);

  const byGeoid = useMemo(() => new Map(metrics.map((m) => [m.geoid, m])), [metrics]);

  const data = useMemo(
    () => ({
      ...tracts,
      features: tracts.features.map((f) => {
        const m = byGeoid.get(f.properties.geoid);
        const v = m ? metricValue(m, metric) : null;
        return {
          ...f,
          properties: {
            ...f.properties,
            cls: v === null ? -1 : classOf(v, breaks),
            inRadius: m?.inRadius ? 1 : 0,
          },
        };
      }),
    }),
    [tracts, byGeoid, metric, breaks],
  );

  const retailerData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: retailers.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lon, r.lat] },
        properties: { id: r.id, n: claimsByRetailer.get(r.id) ?? 0 },
      })),
    }),
    [retailers, claimsByRetailer],
  );

  const radiusRing = useMemo(() => circle(pin, radiusMiles, { units: 'miles', steps: 96 }), [pin, radiusMiles]);
  const coverageRing = useMemo(
    () => circle(coverage.center, coverage.radiusMiles, { units: 'miles', steps: 96 }),
    [coverage],
  );

  const ramp = rampFor(metric, mode);
  const fillColor = ['match', ['get', 'cls'], 0, ramp[0], 1, ramp[1], 2, ramp[2], 3, ramp[3], 4, ramp[4], ramp[0]];
  const c = chrome[mode];

  const onLoad = useCallback(
    (e: { target: MlMap }) => {
      const map = e.target;
      const add = () => {
        if (!map.hasImage('hatch')) map.addImage('hatch', hatchImage(mode));
      };
      add();
      map.on('styleimagemissing', (ev: { id: string }) => ev.id === 'hatch' && add());
    },
    [mode],
  );

  const hovered = hover ? byGeoid.get(hover.geoid) : undefined;
  const hoveredProps = hover ? tracts.features.find((f) => f.properties.geoid === hover.geoid)?.properties : undefined;

  return (
    <Box sx={{ position: 'relative', width: '100%', height }}>
      <MapGL
        key={mode /* re-create so the hatch matches the theme */}
        initialViewState={{ longitude: coverage.center[0], latitude: coverage.center[1], zoom: 10.4 }}
        {...(viewState ? { ...viewState } : {})}
        onMove={onMove ? (e) => onMove(e.viewState) : undefined}
        mapStyle={baseStyle(mode, basemap)}
        onLoad={onLoad}
        interactiveLayerIds={['tract-fill', 'tract-nodata']}
        onMouseMove={(e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          setHover(f ? { x: e.point.x, y: e.point.y, geoid: String(f.properties?.geoid) } : null);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (f && onSelectTract) onSelectTract(String(f.properties?.geoid));
        }}
        onDblClick={(e) => {
          e.preventDefault();
          onPinChange?.([e.lngLat.lng, e.lngLat.lat]);
        }}
        attributionControl={{ compact: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Source id="tracts" type="geojson" data={data}>
          <Layer
            id="tract-fill"
            type="fill"
            filter={['>=', ['get', 'cls'], 0]}
            paint={{
              'fill-color': fillColor as never,
              'fill-opacity': ['case', ['==', ['get', 'inRadius'], 1], tractOpacity, tractOpacity * 0.35],
            }}
          />
          <Layer
            id="tract-nodata"
            type="fill"
            filter={['<', ['get', 'cls'], 0]}
            paint={{ 'fill-pattern': 'hatch', 'fill-opacity': Math.min(1, tractOpacity + 0.1) }}
          />
          <Layer id="tract-line" type="line" paint={{ 'line-color': c.surface, 'line-width': 0.6, 'line-opacity': 0.9 }} />
        </Source>
        <Source id="coverage" type="geojson" data={coverageRing}>
          <Layer id="coverage-line" type="line" paint={{ 'line-color': c.ink, 'line-width': 1.6, 'line-opacity': 0.85 }} />
        </Source>
        <Source id="radius" type="geojson" data={radiusRing}>
          <Layer
            id="radius-line"
            type="line"
            paint={{ 'line-color': c.ink, 'line-width': 1.4, 'line-dasharray': [2, 2], 'line-opacity': 0.7 }}
          />
        </Source>
        {showBubbles && (
          <Source id="retailers" type="geojson" data={retailerData}>
            <Layer
              id="retailer-hollow"
              type="circle"
              filter={['==', ['get', 'n'], 0]}
              paint={{
                'circle-radius': 2.5,
                'circle-color': 'rgba(0,0,0,0)',
                'circle-stroke-color': bubbles[mode].hollow,
                'circle-stroke-width': 1,
                'circle-stroke-opacity': bubbleOpacity * 0.8,
              }}
            />
            <Layer
              id="retailer-bubble"
              type="circle"
              filter={['>', ['get', 'n'], 0]}
              paint={{
                'circle-radius': ['+', 3, ['*', 2.6, ['sqrt', ['get', 'n']]]],
                'circle-color': bubbles[mode].fill,
                'circle-opacity': bubbleOpacity * 0.85,
                'circle-stroke-color': bubbles[mode].stroke,
                'circle-stroke-width': 1.5,
                'circle-stroke-opacity': bubbleOpacity,
              }}
            />
          </Source>
        )}
        <Marker longitude={pin[0]} latitude={pin[1]} anchor="bottom">
          <PlaceIcon sx={{ fontSize: 30, color: 'primary.main', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.35))' }} />
        </Marker>
      </MapGL>
      {hover && hovered && hoveredProps && (
        <Box sx={{ position: 'absolute', left: hover.x + 14, top: hover.y + 14, pointerEvents: 'none', zIndex: 2 }}>
          <TractTooltip tract={hoveredProps} metrics={hovered} coverage={coverage} />
        </Box>
      )}
    </Box>
  );
}
