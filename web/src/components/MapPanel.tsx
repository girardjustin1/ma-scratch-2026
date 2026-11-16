import { useState } from 'react';
import { ChevronDown, ChevronLeftDouble, ClockRewind, Columns03 } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { cx } from '@/utils/cx';
import type { MetricKey } from '../domain/types';
import type { Basemap } from '../map/mapStyle';
import { Info } from './Basics';
import { AreaSwitch, BasemapSwitch, DisplayFields, MetricSelect, type LayerSettings } from './Controls';
import { legendNote, MapLegend, type MapLegendProps } from './MapLegend';

/** One map's metric and the key for it. */
export interface PanelMap {
  metric: MetricKey;
  onMetric: (m: MetricKey) => void;
  legend: MapLegendProps;
}

export interface MapPanelProps {
  basemap: Basemap;
  onBasemap: (b: Basemap) => void;
  online: boolean;
  onGoOnline?: () => void;
  layers: LayerSettings;
  onLayers: (p: Partial<LayerSettings>) => void;
  compare: boolean;
  onCompare: (on: boolean) => void;
  /** Playback is running (its transport sits on the map). */
  playing: boolean;
  onPlay: () => void;
  primary: PanelMap;
  /** The right-hand map, when side by side. */
  secondary?: PanelMap;
  onCollapse?: () => void;
}

const SECTION = 'flex flex-col gap-2.5 border-t border-secondary px-4 py-3.5';

function MapKey({ map, title, claimsOnly }: { map: PanelMap; title?: string; claimsOnly: boolean }) {
  return (
    <section className={SECTION}>
      {title && <p className="text-xs font-medium text-tertiary">{title}</p>}
      <div className="flex items-center gap-2">
        <MetricSelect className="min-w-0 flex-1" value={map.metric} onChange={map.onMetric} claimsOnly={claimsOnly}
          label={title ? `Color areas by (${title.toLowerCase()})` : 'Color areas by'} />
        <Info label="About this layer" text={legendNote(map.legend)} />
      </div>
      <MapLegend {...map.legend} parts="classes" bare hideTitle />
    </section>
  );
}

/**
 * Everything about how the map is drawn, in one docked panel beside it: basemap, areas, side
 * by side, playback, display settings, then the key for what is on screen (classes, stores,
 * winners by ticket). Nothing but zoom and the selection card floats over the map.
 */
export function MapPanel({ basemap, onBasemap, online, onGoOnline, layers, onLayers, compare, onCompare, playing, onPlay, primary, secondary, onCollapse }: MapPanelProps) {
  const [display, setDisplay] = useState(false);
  const claimsOnly = layers.areaShape === 'hexes';
  return (
    <aside aria-label="Map panel" className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-secondary bg-primary">
      <section className="flex flex-col gap-2.5 px-4 pt-3 pb-3.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-primary">Map</p>
          {onCollapse && <ButtonUtility size="xs" color="tertiary" icon={ChevronLeftDouble} tooltip="Hide panel" onClick={onCollapse} />}
        </div>
        <BasemapSwitch value={basemap} online={online} onChange={onBasemap} onGoOnline={onGoOnline} />
        <AreaSwitch value={layers.areaShape} onChange={(areaShape) => onLayers({ areaShape })} />
        <div className="flex gap-2">
          <Button size="sm" color={compare ? 'primary' : 'secondary'} iconLeading={Columns03} className="flex-1" aria-pressed={compare} onClick={() => onCompare(!compare)}>
            Side by side
          </Button>
          <Button size="sm" color="secondary" iconLeading={ClockRewind} className="flex-1" isDisabled={playing} onClick={onPlay}>
            Play
          </Button>
        </div>
        <button type="button" onClick={() => setDisplay(!display)} aria-expanded={display}
          className="flex cursor-pointer items-center gap-1 text-xs font-medium text-tertiary outline-hidden hover:text-secondary focus-visible:text-secondary">
          Display
          <ChevronDown className={cx('size-3.5 transition-transform', display && 'rotate-180')} aria-hidden />
        </button>
        {display && <DisplayFields {...layers} onChange={onLayers} />}
      </section>
      <MapKey map={primary} title={secondary ? 'Left map' : undefined} claimsOnly={claimsOnly} />
      {secondary && <MapKey map={secondary} title="Right map" claimsOnly={false} />}
      <section className="px-4 pb-4">
        <MapLegend {...primary.legend} parts="stores" bare hideTitle />
      </section>
    </aside>
  );
}
