import 'maplibre-gl/dist/maplibre-gl.css';
import './worker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, Marker, NavigationControl, Source, type MapLayerMouseEvent, type MapRef, type ViewState } from '@vis.gl/react-maplibre';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import { circle } from '@turf/turf';
import { useMode } from '../theme/mode';
import { classOf } from '../domain/classify';
import { metricValue } from '../domain/metrics';
import type { Coverage, MetricKey, Retailer, TractCollection, TractMetrics } from '../domain/types';
import { bubbleRadii, bubbles, chrome, pin as pinColor, ramps, status, type Mode } from '../theme/tokens';
import { fmtInt } from '../lib/format';
import { Card } from '../components/Basics';
import { StorePin } from './StorePin';
import { STORE_CLAIMS_MAX } from '../components/Controls';
import { baseStyle, hatchImage, type Basemap } from './mapStyle';
import { TractTooltip } from '../components/TractTooltip';

export interface ClaimsMapProps {
  tracts: TractCollection;
  metrics: TractMetrics[];
  metric: MetricKey;
  breaks: number[];
  retailers: Retailer[];
  claimsByRetailer: Map<string, number>;
  /** Stores inside the search radius (drawn at full strength; the rest are dimmed). */
  storesInRadius: Set<string>;
  /** Class breaks for listed claims per store (see ExplorePage). */
  bubbleBreaks: number[];
  /** Only stores whose listed claims fall in [min, max] are drawn; max >= storeRangeTop means no cap. */
  storeRange?: [number, number];
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
  onSelectTract?: (geoid: string, lngLat: [number, number]) => void;
  onSelectStore?: (id: string) => void;
  /** Click on empty map: clear the selection. */
  onClearSelection?: () => void;
  /** What is selected, for the highlight. */
  selection?: MapSelection;
  /** Card pinned to a map position (follows the map as it moves). */
  pinned?: { lngLat: [number, number]; node: React.ReactNode } | null;
  height?: number | string;
}

/** Class of a group's average listed claims per store; picks label ink against its fill. */
const classOfAvg = (g: { n: number; stores: number }, breaks: number[]) => classOf(g.n / g.stores, breaks);

/**
 * Which pin names to show: busiest stores claim their label box first; a name that would
 * overlap an earlier pin or label is dropped (Google Maps does the same). Pins always show.
 */
function placeLabels(map: MlMap, stores: Retailer[], counts: Map<string, number>) {
  const taken: [number, number, number, number][] = [];
  const hit = (a: [number, number, number, number]) => taken.some((t) => a[0] < t[2] && a[2] > t[0] && a[1] < t[3] && a[3] > t[1]);
  const keep = new Set<string>();
  const order = [...stores].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  for (const r of order) {
    const p = map.project([r.lon, r.lat]);
    const pinW = (counts.get(r.id) ?? 0) > 0 ? 30 : 22;
    taken.push([p.x - pinW / 2, p.y - pinW * 1.25, p.x + pinW / 2, p.y]); // the pin itself
  }
  for (const r of order) {
    const p = map.project([r.lon, r.lat]);
    const pinW = (counts.get(r.id) ?? 0) > 0 ? 30 : 22;
    const w = Math.min(150, r.name.length * 6.6) + 4;
    const box: [number, number, number, number] = [p.x + pinW / 2, p.y - pinW * 0.95, p.x + pinW / 2 + w, p.y - pinW * 0.35];
    if (!hit(box)) { taken.push(box); keep.add(r.id); }
  }
  return keep;
}

/** True when a pointer event started on an HTML marker (store pin, pinned card, labels). */
const onMarker = (ev: Event) => ev.target instanceof Element && !!ev.target.closest('.maplibregl-marker');

export type MapSelection =
  | { kind: 'store'; id: string }
  | { kind: 'tract'; geoid: string; lngLat: [number, number] }
  | null;

/** Zoom at which store bubbles give way to labelled pins, and names appear. */
const PIN_ZOOM = 14;
const NAME_ZOOM = 15.3;
const MAX_PINS = 400;

const rampFor = (metric: MetricKey, mode: Mode) => (metric === 'income' ? ramps.income[mode] : ramps.claims[mode]);

export function ClaimsMap(props: ClaimsMapProps) {
  const {
    tracts, metrics, metric, breaks, retailers: allRetailers, claimsByRetailer, storesInRadius, bubbleBreaks, coverage, pin, radiusMiles,
    storeRange = [0, STORE_CLAIMS_MAX],
    tractOpacity = 0.78, bubbleOpacity = 0.9, showBubbles = true, basemap = 'outline',
    viewState, onMove, onPinChange, onSelectTract, onSelectStore, onClearSelection, selection = null, pinned = null,
    height = '100%',
  } = props;
  const mode = useMode();
  const [hover, setHover] = useState<{ x: number; y: number; geoid: string } | null>(null);
  const [groupHover, setGroupHover] = useState<{ x: number; y: number; stores: number; n: number } | null>(null);
  const [groupLabels, setGroupLabels] = useState<{ id: number; lon: number; lat: number; n: number; stores: number }[]>([]);
  const mapRef = useRef<MapRef>(null);
  // Stores in the claims-per-store range: bubbles, groups and pins all draw from this list.
  const [lo, hi] = storeRange;
  const retailers = useMemo(() => allRetailers.filter((r) => {
    const n = claimsByRetailer.get(r.id) ?? 0;
    return n >= lo && (hi >= STORE_CLAIMS_MAX || n <= hi);
  }), [allRetailers, claimsByRetailer, lo, hi]);
  const [storeHover, setStoreHover] = useState<{ x: number; y: number; id: string } | null>(null);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [labelIds, setLabelIds] = useState<Set<string>>(new Set());
  const zoom = viewState?.zoom ?? 10.4;
  const storeById = useMemo(() => new Map(allRetailers.map((r) => [r.id, r])), [allRetailers]);

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
            lowMatch: m?.lowMatch && metric !== 'income' ? 1 : 0,
          },
        };
      }),
    }),
    [tracts, byGeoid, metric, breaks],
  );

  // Stores split by radius: inside is drawn at full strength, outside dimmed. Each source
  // clusters when zoomed out; a group carries its total listed claims (n) and store count.
  const storeSources = useMemo(() => {
    const toFeature = (r: Retailer) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [r.lon, r.lat] },
      properties: { id: r.id, n: claimsByRetailer.get(r.id) ?? 0 },
    });
    const inside = retailers.filter((r) => storesInRadius.has(r.id)).map(toFeature);
    const outside = retailers.filter((r) => !storesInRadius.has(r.id)).map(toFeature);
    return {
      in: { type: 'FeatureCollection' as const, features: inside },
      out: { type: 'FeatureCollection' as const, features: outside },
    };
  }, [retailers, claimsByRetailer, storesInRadius]);

  const radiusRing = useMemo(() => circle(pin, radiusMiles, { units: 'miles', steps: 96 }), [pin, radiusMiles]);
  const coverageRing = useMemo(
    () => circle(coverage.center, coverage.radiusMiles, { units: 'miles', steps: 96 }),
    [coverage],
  );

  const ramp = rampFor(metric, mode);
  const fillColor = ['match', ['get', 'cls'], 0, ramp[0], 1, ramp[1], 2, ramp[2], 3, ramp[3], 4, ramp[4], ramp[0]];
  const c = chrome[mode];

  // Bubble classes follow classOf(): a value above break i moves to class i+1.
  const above = (b: number) => b + 1e-9;
  const stepBy = (input: unknown, out: readonly (string | number)[]) =>
    ['step', input, out[0], ...bubbleBreaks.flatMap((b, i) => [above(b), out[i + 1]])];
  const storeColor = stepBy(['get', 'n'], bubbles[mode].ramp);
  const storeRadius = stepBy(['get', 'n'], bubbleRadii);
  // Groups: color by average listed claims per store, size by the total.
  const groupColor = stepBy(['/', ['get', 'n'], ['get', 'point_count']], bubbles[mode].ramp);
  const groupRadius = ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 0, 12, 20, 18, 60, 28, 120, 36];

  // Group labels are HTML markers: the offline style has no glyphs for map text.
  const refreshGroupLabels = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !showBubbles || !map.getSource('stores-in')) return setGroupLabels([]);
    const seen = new Map<number, { id: number; lon: number; lat: number; n: number; stores: number }>();
    for (const f of map.querySourceFeatures('stores-in', { filter: ['has', 'point_count'] })) {
      const p = f.properties as { cluster_id: number; n: number; point_count: number };
      const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
      if (!seen.has(p.cluster_id)) seen.set(p.cluster_id, { id: p.cluster_id, lon, lat, n: p.n, stores: p.point_count });
    }
    setGroupLabels([...seen.values()].filter((g) => g.n > 0));
  }, [showBubbles]);

  const expandGroup = async (clusterId: number, lngLat: [number, number]) => {
    const map = mapRef.current?.getMap();
    const src = map?.getSource('stores-in') as GeoJSONSource | undefined;
    if (!map || !src) return;
    const zoom = await src.getClusterExpansionZoom(clusterId);
    map.easeTo({ center: lngLat, zoom: zoom + 0.2 });
  };
  // The pinned card opens below, above, or beside its point, wherever it fits, so it is
  // never clipped. CARD_H is the tallest card (store card with three recent rows).
  // Computed after the camera settles (onIdle, and when the card changes), because during a
  // render the map may still be at its previous position.
  type A = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  const [cardAnchor, setCardAnchor] = useState<{ anchor: A; offset: [number, number] }>({ anchor: 'bottom', offset: [0, -18] });
  const placeCard = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!pinned || !map) return;
    const CARD_H = 390, CARD_W = 330, GAP = 18;
    const pt = map.project(pinned.lngLat);
    const { width, height } = map.getContainer().getBoundingClientRect();
    const h = pt.x < CARD_W / 2 ? '-left' : pt.x > width - CARD_W / 2 ? '-right' : '';
    const next: { anchor: A; offset: [number, number] } =
      height - pt.y >= CARD_H + GAP ? { anchor: `top${h}` as A, offset: [0, GAP] }
      : pt.y >= CARD_H + GAP ? { anchor: `bottom${h}` as A, offset: [0, -GAP] }
      // Not enough room above or below: open to the side with more room, vertically centered.
      : pt.x < width / 2 ? { anchor: 'left', offset: [GAP, 0] } : { anchor: 'right', offset: [-GAP, 0] };
    setCardAnchor((cur) => (cur.anchor === next.anchor ? cur : next));
  }, [pinned]);
  useEffect(() => { placeCard(); }, [placeCard]);
  const selectedStore = selection?.kind === 'store' ? storeById.get(selection.id) : undefined;
  const selectedRadius = selectedStore ? bubbleRadii[classOf(claimsByRetailer.get(selectedStore.id) ?? 0, bubbleBreaks)] : 0;
  // Pins only for stores on screen, winners first, capped so the DOM stays light.
  const visibleStores = useMemo(() => {
    if (!bounds || zoom < PIN_ZOOM) return [];
    const [w, so, e, n] = bounds;
    return retailers
      .filter((r) => r.lon >= w && r.lon <= e && r.lat >= so && r.lat <= n)
      .sort((a, b) => (claimsByRetailer.get(b.id) ?? 0) - (claimsByRetailer.get(a.id) ?? 0))
      .slice(0, MAX_PINS);
  }, [bounds, zoom, retailers, claimsByRetailer]);
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map) setLabelIds(placeLabels(map, visibleStores, claimsByRetailer));
  }, [visibleStores, claimsByRetailer]);
  // Must be referentially stable: a new style object makes MapLibre reload the whole style
  // (every layer) on each render, which flashes the map blank on hover.
  const mapStyle = useMemo(() => baseStyle(mode, basemap), [mode, basemap]);

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
    // isolate: pins and cards stack inside the map, never above the panels laid over it.
    <div className="relative isolate w-full" style={{ height }}>
      <MapGL
        ref={mapRef}
        key={mode /* re-create so the hatch matches the theme */}
        initialViewState={{ longitude: pin[0], latitude: pin[1], zoom: 10.4 }}
        {...(viewState ? { ...viewState } : {})}
        onMove={onMove ? (e) => onMove(e.viewState) : undefined}
        mapStyle={mapStyle}
        onLoad={onLoad}
        interactiveLayerIds={showBubbles ? ['group-in', 'store-in', 'store-out', 'tract-fill', 'tract-nodata'] : ['tract-fill', 'tract-nodata']}
        onIdle={() => {
          refreshGroupLabels();
          placeCard();
          const map = mapRef.current?.getMap();
          const b = map?.getBounds();
          if (b) setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
          if (map) setLabelIds(placeLabels(map, visibleStores, claimsByRetailer));
        }}
        onMouseMove={(e: MapLayerMouseEvent) => {
          if (onMarker(e.originalEvent)) { setHover(null); setGroupHover(null); setStoreHover(null); return; }
          const f = e.features?.[0];
          if (f?.layer.id === 'group-in') {
            const p = f.properties as { n: number; point_count: number };
            setHover(null); setStoreHover(null);
            setGroupHover({ x: e.point.x, y: e.point.y, n: p.n, stores: p.point_count });
            return;
          }
          if (f?.layer.id === 'store-in' || f?.layer.id === 'store-out') {
            setHover(null); setGroupHover(null);
            setStoreHover({ x: e.point.x, y: e.point.y, id: String(f.properties?.id) });
            return;
          }
          setGroupHover(null); setStoreHover(null);
          setHover(f ? { x: e.point.x, y: e.point.y, geoid: String(f.properties?.geoid) } : null);
        }}
        onMouseLeave={() => { setHover(null); setGroupHover(null); setStoreHover(null); }}
        onClick={(e: MapLayerMouseEvent) => {
          if (onMarker(e.originalEvent)) return; // pins and the pinned card handle their own clicks
          const f = e.features?.[0];
          if (f?.layer.id === 'group-in') {
            const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
            void expandGroup(Number(f.properties?.cluster_id), [lon, lat]);
            return;
          }
          if (f?.layer.id === 'store-in' || f?.layer.id === 'store-out') {
            onSelectStore?.(String(f.properties?.id));
            return;
          }
          if (f) onSelectTract?.(String(f.properties?.geoid), [e.lngLat.lng, e.lngLat.lat]);
          else onClearSelection?.();
        }}
        onDblClick={(e) => {
          e.preventDefault();
          if (onMarker(e.originalEvent)) return;
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
          <Layer
            id="tract-lowmatch"
            type="line"
            filter={['==', ['get', 'lowMatch'], 1]}
            paint={{ 'line-color': status.warning, 'line-width': 1.6, 'line-dasharray': [1.5, 1.5] }}
          />
          {/* Selected tract: white casing under an ink outline, readable on any fill. */}
          <Layer id="tract-selected-casing" type="line"
            filter={['==', ['get', 'geoid'], selection?.kind === 'tract' ? selection.geoid : '']}
            paint={{ 'line-color': '#ffffff', 'line-width': 5 }} />
          <Layer id="tract-selected" type="line"
            filter={['==', ['get', 'geoid'], selection?.kind === 'tract' ? selection.geoid : '']}
            paint={{ 'line-color': c.ink, 'line-width': 2.5 }} />
        </Source>
        {!coverage.statewide && (
          <Source id="coverage" type="geojson" data={coverageRing}>
            <Layer id="coverage-line" type="line" paint={{ 'line-color': c.ink, 'line-width': 1.6, 'line-opacity': 0.85 }} />
          </Source>
        )}
        <Source id="radius" type="geojson" data={radiusRing}>
          <Layer
            id="radius-line"
            type="line"
            paint={{ 'line-color': c.ink, 'line-width': 1.4, 'line-dasharray': [2, 2], 'line-opacity': 0.7 }}
          />
        </Source>
        {showBubbles && (
          <>
          <Source id="stores-out" type="geojson" data={storeSources.out} cluster clusterRadius={36} clusterMaxZoom={12}
            clusterProperties={{ n: ['+', ['get', 'n']] }}>
            <Layer
              id="hollow-out"
              type="circle"
              maxzoom={PIN_ZOOM}
              filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'n'], 0]]}
              paint={{
                'circle-radius': 2.5,
                'circle-color': 'rgba(0,0,0,0)',
                'circle-stroke-color': bubbles[mode].hollow,
                'circle-stroke-width': 1,
                'circle-stroke-opacity': bubbleOpacity * 0.3 * 0.8,
              }}
            />
            <Layer
              id="group-out"
              type="circle"
              filter={['all', ['has', 'point_count'], ['>', ['get', 'n'], 0]]}
              layout={{ 'circle-sort-key': ['-', 0, ['get', 'n']] as never }}
              paint={{
                'circle-radius': groupRadius as never,
                'circle-color': groupColor as never,
                'circle-opacity': bubbleOpacity * 0.3 * 0.9,
                'circle-stroke-color': bubbles[mode].stroke,
                'circle-stroke-width': 2,
                'circle-stroke-opacity': bubbleOpacity * 0.3,
              }}
            />
            <Layer
              id="store-out"
              type="circle"
              maxzoom={PIN_ZOOM}
              filter={['all', ['!', ['has', 'point_count']], ['>', ['get', 'n'], 0]]}
              layout={{ 'circle-sort-key': ['-', 0, ['get', 'n']] as never }}
              paint={{
                'circle-radius': storeRadius as never,
                'circle-color': storeColor as never,
                'circle-opacity': bubbleOpacity * 0.3 * 0.9,
                'circle-stroke-color': bubbles[mode].stroke,
                'circle-stroke-width': 1,
                'circle-stroke-opacity': bubbleOpacity * 0.3,
              }}
            />
          </Source>
          <Source id="stores-in" type="geojson" data={storeSources.in} cluster clusterRadius={36} clusterMaxZoom={12}
            clusterProperties={{ n: ['+', ['get', 'n']] }}>
            <Layer
              id="hollow-in"
              type="circle"
              maxzoom={PIN_ZOOM}
              filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'n'], 0]]}
              paint={{
                'circle-radius': 2.5,
                'circle-color': 'rgba(0,0,0,0)',
                'circle-stroke-color': bubbles[mode].hollow,
                'circle-stroke-width': 1,
                'circle-stroke-opacity': bubbleOpacity * 0.8,
              }}
            />
            <Layer
              id="group-in"
              type="circle"
              filter={['all', ['has', 'point_count'], ['>', ['get', 'n'], 0]]}
              layout={{ 'circle-sort-key': ['-', 0, ['get', 'n']] as never }}
              paint={{
                'circle-radius': groupRadius as never,
                'circle-color': groupColor as never,
                'circle-opacity': bubbleOpacity * 0.9,
                'circle-stroke-color': bubbles[mode].stroke,
                'circle-stroke-width': 2,
                'circle-stroke-opacity': bubbleOpacity,
              }}
            />
            <Layer
              id="store-in"
              type="circle"
              maxzoom={PIN_ZOOM}
              filter={['all', ['!', ['has', 'point_count']], ['>', ['get', 'n'], 0]]}
              layout={{ 'circle-sort-key': ['-', 0, ['get', 'n']] as never }}
              paint={{
                'circle-radius': storeRadius as never,
                'circle-color': storeColor as never,
                'circle-opacity': bubbleOpacity * 0.9,
                'circle-stroke-color': bubbles[mode].stroke,
                'circle-stroke-width': 1,
                'circle-stroke-opacity': bubbleOpacity,
              }}
            />
          </Source>
          </>
        )}
        {showBubbles && groupLabels.map((g) => (
          <Marker key={g.id} longitude={g.lon} latitude={g.lat} anchor="center" style={{ pointerEvents: 'none' }}>
            <span className="text-[11px] font-semibold tabular" style={{ color: classOfAvg(g, bubbleBreaks) >= 2 ? '#fff' : '#0a0a0a' }}>
              {g.n >= 1000 ? `${(g.n / 1000).toFixed(1)}k` : g.n}
            </span>
          </Marker>
        ))}
        {selectedStore && zoom < PIN_ZOOM && (
          <Source id="selected-store" type="geojson" data={{ type: 'Feature', geometry: { type: 'Point', coordinates: [selectedStore.lon, selectedStore.lat] }, properties: {} }}>
            <Layer id="selected-store-casing" type="circle"
              paint={{ 'circle-radius': selectedRadius + 4, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 5 }} />
            <Layer id="selected-store-ring" type="circle"
              paint={{ 'circle-radius': selectedRadius + 4, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': c.ink, 'circle-stroke-width': 2.5 }} />
          </Source>
        )}
        {showBubbles && zoom >= PIN_ZOOM && visibleStores.map((r) => {
          const n = claimsByRetailer.get(r.id) ?? 0;
          const cls = classOf(n, bubbleBreaks);
          return (
            <Marker key={r.id} longitude={r.lon} latitude={r.lat} anchor="bottom-left" offset={[-15, 2]}
              style={{ zIndex: selection?.kind === 'store' && selection.id === r.id ? 3 : n > 0 ? 2 : 1, opacity: storesInRadius.has(r.id) ? 1 : 0.45 }}>
              <StorePin n={n} color={bubbles[mode].ramp[cls]} ink={cls >= 2 ? 'light' : 'dark'} name={r.name}
                showName={zoom >= NAME_ZOOM && (labelIds.has(r.id) || (selection?.kind === 'store' && selection.id === r.id))} selected={selection?.kind === 'store' && selection.id === r.id}
                onClick={() => onSelectStore?.(r.id)} />
            </Marker>
          );
        })}
        {pinned && (
          // Keyed by anchor: the Marker reads `anchor` only when it is created.
          <Marker key={cardAnchor.anchor} longitude={pinned.lngLat[0]} latitude={pinned.lngLat[1]} anchor={cardAnchor.anchor} offset={cardAnchor.offset} style={{ zIndex: 5 }}>
            <div className="cursor-default">{pinned.node}</div>
          </Marker>
        )}
        <Marker longitude={pin[0]} latitude={pin[1]} anchor="center" style={{ pointerEvents: 'none' }}>
          <span className="relative grid size-4 place-items-center" aria-label="Search pin" role="img">
            <span className="pin-pulse absolute inset-0 rounded-full"
              style={{ backgroundColor: `${pinColor[mode]}66`, boxShadow: `0 0 0 1.5px rgba(255,255,255,.9), inset 0 0 0 1.5px ${pinColor[mode]}` }} />
            <span
              className="relative size-4 rounded-full border-[3px] border-white"
              style={{ backgroundColor: pinColor[mode], boxShadow: '0 1px 4px rgba(0,0,0,.45)' }}
            />
          </span>
        </Marker>
      </MapGL>
      {groupHover && !pinned && (
        <div className="pointer-events-none absolute z-[2]" style={{ left: groupHover.x + 14, top: groupHover.y + 14 }}>
          <Card className="w-[240px] p-3">
            <p className="text-sm font-semibold text-primary tabular">{fmtInt(groupHover.stores)} stores grouped</p>
            <p className="mt-1 text-sm text-secondary tabular">{fmtInt(groupHover.n)} listed claims (over $600)</p>
            <p className="text-xs text-tertiary tabular">{(groupHover.n / groupHover.stores).toFixed(1)} per store on average</p>
            <p className="mt-2 text-xs text-tertiary">Click or zoom in to see each store.</p>
          </Card>
        </div>
      )}
      {storeHover && !pinned && storeById.get(storeHover.id) && (
        <div className="pointer-events-none absolute z-[2]" style={{ left: storeHover.x + 14, top: storeHover.y + 14 }}>
          <Card className="w-[240px] p-3">
            <p className="truncate text-sm font-semibold text-primary">{storeById.get(storeHover.id)!.name}</p>
            <p className="truncate text-xs text-tertiary">{storeById.get(storeHover.id)!.address}</p>
            <p className="mt-1 text-sm text-secondary tabular">{fmtInt(claimsByRetailer.get(storeHover.id) ?? 0)} listed claims (over $600)</p>
            <p className="mt-1.5 text-xs text-tertiary">Click for recent claims and actions.</p>
          </Card>
        </div>
      )}
      {hover && hovered && hoveredProps && !pinned && (
        <div className="pointer-events-none absolute z-[2]" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <TractTooltip tract={hoveredProps} metrics={hovered} coverage={coverage} />
        </div>
      )}
    </div>
  );
}
