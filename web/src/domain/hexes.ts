import { cellToBoundary, cellToLatLng, latLngToCell } from 'h3-js';
import { distance, point } from '@turf/turf';
import { claimCountBreaks, classOf } from './classify';
import type { Claim, Filters, Retailer } from './types';

/**
 * Hexagon layer: listed claims summed into H3 cells, under the same filters as the store
 * bubbles. Descriptive only — where claims were listed, never a forecast or a ranking
 * (the hex study, docs/hex-study.md, found nothing that beats each area's past volume).
 */
export type AreaShape = 'tracts' | 'hexes';
export type HexRes = 6 | 7 | 8;

/** Hexagon size follows the zoom so cells stay a readable size on screen. */
export function hexResForZoom(zoom: number): HexRes {
  return zoom < 9.3 ? 6 : zoom < 11.6 ? 7 : 8;
}

/** Average cell area in square miles (H3 averages: 36.1, 5.16, 0.737 km²). */
export const HEX_SQ_MI: Record<HexRes, number> = { 6: 13.9, 7: 1.99, 8: 0.285 };

export const hexSizeLabel = (res: HexRes, each = true) =>
  `about ${HEX_SQ_MI[res] >= 1 ? Math.round(HEX_SQ_MI[res]) : HEX_SQ_MI[res].toFixed(1)} sq mi${each ? ' each' : ''}`;

export interface HexProps {
  cell: string;
  /** Listed claims at stores in this cell, under the filters. */
  n: number;
  /** Licensed stores in this cell (covered tracts only). */
  stores: number;
  cls: number;
  inRadius: 0 | 1;
}

export interface HexLayer {
  res: HexRes;
  features: GeoJSON.FeatureCollection<GeoJSON.Polygon, HexProps>;
  breaks: number[];
  min: number;
  max: number;
  /** Hexagons inside the search radius (by center point). */
  inRadius: number;
}

/** Each store's cell at this resolution. */
export function storeCells(retailers: Retailer[], res: HexRes): Map<string, string> {
  return new Map(retailers.map((r) => [r.id, latLngToCell(r.lat, r.lon, res)]));
}

/**
 * Cells with at least one store in a covered tract. A cell with stores and no listed claims
 * is 0; a cell with no stores is not drawn (nothing could be listed there).
 */
export function buildHexLayer(args: {
  res: HexRes;
  cells: Map<string, string>;
  retailers: Retailer[];
  claims: Claim[];
  coveredTracts: Set<string>;
  filters: Pick<Filters, 'pin' | 'radiusMiles'>;
}): HexLayer {
  const { res, cells, retailers, claims, coveredTracts, filters } = args;
  const agg = new Map<string, { n: number; stores: number }>();
  for (const r of retailers) {
    if (!coveredTracts.has(r.tractGeoid)) continue;
    const cell = cells.get(r.id);
    if (!cell) continue;
    const a = agg.get(cell) ?? { n: 0, stores: 0 };
    a.stores += 1;
    agg.set(cell, a);
  }
  for (const c of claims) {
    const cell = cells.get(c.retailerId);
    const a = cell ? agg.get(cell) : undefined;
    if (a) a.n += 1;
  }
  const here = point(filters.pin);
  const rows = [...agg].map(([cell, a]) => {
    const [lat, lon] = cellToLatLng(cell);
    return { cell, ...a, inRadius: distance(point([lon, lat]), here, { units: 'miles' }) <= filters.radiusMiles };
  });
  const values = rows.filter((r) => r.inRadius).map((r) => r.n);
  const breaks = claimCountBreaks(values);
  return {
    res,
    breaks,
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    inRadius: values.length,
    features: {
      type: 'FeatureCollection',
      features: rows.map((r) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [cellToBoundary(r.cell, true)] },
        properties: { cell: r.cell, n: r.n, stores: r.stores, cls: classOf(r.n, breaks), inRadius: r.inRadius ? 1 : 0 },
      })),
    },
  };
}
