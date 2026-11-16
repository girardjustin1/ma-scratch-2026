import type { StyleSpecification } from 'maplibre-gl';
import { chrome, noData, type Mode } from '../theme/tokens';

/** outline = our own layers, no tiles (works offline). streets and satellite load Mapbox tiles. */
export type Basemap = 'outline' | 'streets' | 'satellite';
export const BASEMAPS: { id: Basemap; label: string }[] = [
  { id: 'outline', label: 'Outline' },
  { id: 'streets', label: 'Streets' },
  { id: 'satellite', label: 'Satellite' },
];
export const isBasemap = (v: unknown): v is Basemap => BASEMAPS.some((b) => b.id === v);

export const MAPBOX_TOKEN: string | undefined = import.meta.env.VITE_MAPBOX_TOKEN || undefined;

/** Area fill opacity that suits each basemap: lighter over streets and imagery so they show through. */
export const DEFAULT_FILL_OPACITY: Record<Basemap, number> = { outline: 0.78, streets: 0.5, satellite: 0.4 };

/** Mapbox style per basemap: street names and neighborhoods; imagery with the same labels. */
const mapboxStyle = (basemap: Basemap, mode: Mode) =>
  basemap === 'satellite' ? 'satellite-streets-v12' : mode === 'dark' ? 'dark-v11' : 'streets-v12';

/**
 * Offline style: a plain background, no tiles, no glyphs. Tract and town outlines are
 * our own layers, so the map works with the network disabled. Streets and satellite are a
 * raster layer from the Mapbox Static Tiles API, only when online and a token is set.
 */
export function baseStyle(mode: Mode, basemap: Basemap): StyleSpecification {
  const useMapbox = basemap !== 'outline' && !!MAPBOX_TOKEN;
  return {
    version: 8,
    sources: useMapbox
      ? {
          mapbox: {
            type: 'raster',
            tiles: [`https://api.mapbox.com/styles/v1/mapbox/${mapboxStyle(basemap, mode)}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`],
            tileSize: 512,
            attribution: basemap === 'satellite' ? '© Mapbox © OpenStreetMap © Maxar' : '© Mapbox © OpenStreetMap',
          },
        }
      : {},
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': chrome[mode].mapBackground } },
      ...(useMapbox ? [{ id: 'mapbox', type: 'raster' as const, source: 'mapbox' }] : []),
    ],
  };
}

/** 8×8 diagonal hatch for "no data", drawn in code so it needs no asset fetch. */
export function hatchImage(mode: Mode) {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const bg = hex(noData[mode].fill);
  const fg = hex(noData[mode].line);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = (x + y) % size === 0 || (x + y) % size === 1;
      const [r, g, b] = on ? fg : bg;
      const i = (y * size + x) * 4;
      data.set([r, g, b, 255], i);
    }
  }
  return { width: size, height: size, data };
}
