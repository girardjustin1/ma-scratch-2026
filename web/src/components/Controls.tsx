import { useMemo, useState } from 'react';
import { type CalendarDate, parseDate } from '@internationalized/date';
import { Calendar, InfoCircle, RefreshCcw01 } from '@untitledui/icons';
import type { DateValue } from 'react-aria-components';
import {
  DateRangePicker as AriaDateRangePicker, Dialog as AriaDialog, Group as AriaGroup, Popover as AriaPopover,
} from 'react-aria-components';
import { RangeCalendar, RangePresetButton } from '@/components/application/date-picker/range-calendar';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Button } from '@/components/base/buttons/button';
import { InputDateBase } from '@/components/base/input/input-date';
import { Label } from '@/components/base/input/label';
import { Select } from '@/components/base/select/select';
import { Slider } from '@/components/base/slider/slider';
import { Toggle } from '@/components/base/toggle/toggle';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import type { Filters, GameRef, MetricKey, PrizeBand } from '../domain/types';
import type { AreaShape } from '../domain/hexes';
import { CAVEATS, LABELS } from '../lib/copy';
import { fmtDate, fmtRange } from '../lib/format';
import { MAPBOX_TOKEN, type Basemap } from '../map/mapStyle';
import { Card } from './Basics';
import { GamePicker } from './GamePicker';

/** Selected item reads darker than the rest: monochrome, no brand tint. */
const SELECTED = 'selected:bg-tertiary selected:text-primary';

/** claimsOnly: the hexagon layer is on, so only listed claims can be mapped. */
export function MetricSwitcher({ value, onChange, claimsOnly = false }: { value: MetricKey; onChange: (m: MetricKey) => void; claimsOnly?: boolean }) {
  return (
    <ButtonGroup
      size="sm" aria-label="Map metric" disallowEmptySelection selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const k = [...keys][0];
        if (k) onChange(k as MetricKey);
      }}
    >
      <ButtonGroupItem id="claims" className={SELECTED}>{LABELS.listedClaims}</ButtonGroupItem>
      <ButtonGroupItem id="income" className={SELECTED} isDisabled={claimsOnly}>{LABELS.medianIncome}</ButtonGroupItem>
      <ButtonGroupItem id="perRetailer" className={SELECTED} isDisabled={claimsOnly}>{LABELS.claimsPerRetailer}</ButtonGroupItem>
    </ButtonGroup>
  );
}

const BANDS: { value: PrizeBand; label: string }[] = [
  { value: 'all', label: 'All listed prizes' },
  { value: '600-999', label: '$601 – $999' },
  { value: '1k-9k', label: '$1,000 – $9,999' },
  { value: '10k-99k', label: '$10,000 – $99,999' },
  { value: '100k+', label: '$100,000 and up' },
];

type Range = { start: CalendarDate; end: CalendarDate };

const later = (a: CalendarDate, b: CalendarDate) => (a.compare(b) >= 0 ? a : b);
const earlier = (a: CalendarDate, b: CalendarDate) => (a.compare(b) <= 0 ? a : b);

/** Clamp a range to the coverage window. null when it does not overlap the window at all. */
function clampRange(r: Range, min: CalendarDate, max: CalendarDate): Range | null {
  const start = later(r.start, min);
  const end = earlier(r.end, max);
  return start.compare(end) > 0 ? null : { start, end };
}

/**
 * Presets count back from the latest listed date (maxDate), never from today: the data
 * stops at its last listed date, so "today" would select days with no listings yet.
 */
function listedPresets(min: CalendarDate, max: CalendarDate) {
  const jan1 = max.set({ month: 1, day: 1 });
  const lastYear = jan1.subtract({ years: 1 });
  const raw: { key: string; label: string; range: Range }[] = [
    { key: '7d', label: 'Last 7 days', range: { start: max.subtract({ days: 6 }), end: max } },
    { key: '30d', label: 'Last 30 days', range: { start: max.subtract({ days: 29 }), end: max } },
    { key: '3m', label: 'Last 3 months', range: { start: max.subtract({ months: 3 }).add({ days: 1 }), end: max } },
    { key: '12m', label: 'Last 12 months', range: { start: max.subtract({ years: 1 }).add({ days: 1 }), end: max } },
    { key: 'ytd', label: 'Year to date', range: { start: jan1, end: max } },
    { key: 'lastYear', label: 'Last calendar year', range: { start: lastYear, end: lastYear.set({ month: 12, day: 31 }) } },
    { key: 'all', label: 'All listed dates', range: { start: min, end: max } },
  ];
  return raw.map((p) => ({ ...p, range: clampRange(p.range, min, max) }));
}

/** Untitled UI date range picker, adapted: presets anchored to the latest listed date and clamped to coverage. */
function ListedDatePicker({ from, to, minDate, maxDate, onChange }: {
  from: string; to: string; minDate: string; maxDate: string; onChange: (from: string, to: string) => void;
}) {
  const min = useMemo(() => parseDate(minDate), [minDate]);
  const max = useMemo(() => parseDate(maxDate), [maxDate]);
  const presets = useMemo(() => listedPresets(min, max), [min, max]);
  const committed = useMemo<Range>(() => ({ start: parseDate(from), end: parseDate(to) }), [from, to]);
  // Edits stay in a draft until Apply; closing without Apply drops them.
  const [draft, setDraft] = useState<{ start: DateValue; end: DateValue } | null>(null);
  const [focused, setFocused] = useState<DateValue>(committed.start);
  const value = draft ?? committed;

  const apply = () => {
    if (!draft) return;
    const r = clampRange({ start: parseDate(draft.start.toString()), end: parseDate(draft.end.toString()) }, min, max);
    if (r) onChange(r.start.toString(), r.end.toString());
  };

  return (
    <AriaDateRangePicker
      aria-label={LABELS.listedDate} shouldCloseOnSelect={false} minValue={min} maxValue={max}
      value={value} onChange={(v) => v && setDraft(v)}
      onOpenChange={(open) => {
        setDraft(null);
        if (open) setFocused(committed.start);
      }}
      className="flex flex-col gap-1.5"
    >
      <Label>{LABELS.listedDate}</Label>
      <AriaGroup>
        <Button size="sm" color="secondary" iconLeading={Calendar} className="tabular">{fmtRange(from, to)}</Button>
      </AriaGroup>
      <AriaPopover
        placement="bottom start" offset={8}
        className={({ isEntering, isExiting }) => cx(
          'origin-(--trigger-anchor-point) will-change-transform',
          isEntering && 'duration-150 ease-out animate-in fade-in placement-bottom:slide-in-from-top-0.5 placement-top:slide-in-from-bottom-0.5',
          isExiting && 'duration-100 ease-in animate-out fade-out placement-bottom:slide-out-to-top-0.5 placement-top:slide-out-to-bottom-0.5',
        )}
      >
        <AriaDialog aria-label={`${LABELS.listedDate} range`} className="flex rounded-2xl bg-primary shadow-xl ring ring-secondary_alt focus:outline-hidden">
          {({ close }) => (
            <>
              <div className="flex w-44 flex-col gap-0.5 border-r border-secondary p-3">
                {presets.map((p) =>
                  p.range ? (
                    <RangePresetButton
                      key={p.key} value={p.range}
                      onClick={() => {
                        setDraft(p.range);
                        setFocused(p.range!.start);
                      }}
                    >
                      {p.label}
                    </RangePresetButton>
                  ) : (
                    <p key={p.key} aria-disabled className="px-3 py-2 text-sm font-medium text-quaternary" title="No listed dates in this range">
                      {p.label}
                    </p>
                  ),
                )}
                <p className="mt-auto px-3 pt-3 text-xs leading-[1.45] text-tertiary">
                  Presets count back from the latest listed date, {fmtDate(maxDate)}.
                </p>
              </div>
              <div className="flex flex-col">
                <RangeCalendar focusedValue={focused} onFocusChange={setFocused} />
                <div className="flex justify-between gap-3 border-t border-secondary p-4">
                  <div className="flex items-center gap-2">
                    <InputDateBase slot="start" size="sm" />
                    <div className="text-md text-quaternary">–</div>
                    <InputDateBase slot="end" size="sm" />
                  </div>
                  <div className="flex gap-3">
                    <Button size="sm" color="secondary" onClick={close}>Cancel</Button>
                    <Button size="sm" color="primary" onClick={() => { apply(); close(); }}>Apply</Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </AriaDialog>
      </AriaPopover>
    </AriaDateRangePicker>
  );
}

export interface FilterBarProps {
  filters: Filters;
  games: GameRef[];
  minDate: string;
  maxDate: string;
  onChange: (f: Filters) => void;
  onReset?: () => void;
  /** Listed claims per game in the radius, for the game picker's counts and sort. */
  claimCounts?: Map<string, number>;
}

const NO_COUNTS = new Map<string, number>();

/** Top of the claims-per-store slider; reaching it means "and up" (shown as 99+). */
export const STORE_CLAIMS_MAX = 100;

export function storeRangeLabel([lo, hi]: [number, number]) {
  const top = hi >= STORE_CLAIMS_MAX ? `${STORE_CLAIMS_MAX - 1}+` : String(hi);
  if (lo === 0 && hi >= STORE_CLAIMS_MAX) return 'all';
  return lo === hi ? String(lo) : `${lo} – ${top}`;
}

/** One row of filters above the map. Dates are Lottery-listed dates, day granularity. */
export function FilterBar({ filters, games, minDate, maxDate, onChange, onReset, claimCounts }: FilterBarProps) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const storeClaims = filters.storeClaims ?? [0, STORE_CLAIMS_MAX];
  return (
    <div className="flex flex-wrap items-end gap-3">
      <ListedDatePicker
        from={filters.dateFrom} to={filters.dateTo} minDate={minDate} maxDate={maxDate}
        onChange={(dateFrom, dateTo) => set({ dateFrom, dateTo })}
      />
      <GamePicker
        games={games} value={filters.gameIds} onChange={(gameIds) => set({ gameIds })}
        prices={filters.prices} onPricesChange={(prices) => set({ prices })} prizeBand={filters.prizeBand}
        claimCounts={claimCounts ?? NO_COUNTS}
      />
      <Select
        size="sm" label="Prize size" className="w-48"
        items={BANDS.map((b) => ({ id: b.value, label: b.label }))}
        selectedKey={filters.prizeBand}
        onSelectionChange={(k) => k && set({ prizeBand: k as PrizeBand })}
      >
        {(item) => <Select.Item id={item.id} label={item.label} />}
      </Select>
      <div className="flex w-48 flex-col gap-1.5 px-1">
        <Tooltip title={CAVEATS.radiusRule}>
          <TooltipTrigger className="flex cursor-default items-center gap-1 text-sm font-medium text-secondary">
            Radius · <span className="tabular">{filters.radiusMiles} mi</span>
            <InfoCircle className="size-4 text-fg-quaternary" aria-hidden />
          </TooltipTrigger>
        </Tooltip>
        <div className="flex h-9 items-center">
          <Slider
            minValue={0.5} maxValue={25} step={0.5} value={filters.radiusMiles}
            onChange={(v) => set({ radiusMiles: v as number })} aria-label="Radius in miles"
            formatOptions={{ style: 'unit', unit: 'mile', maximumFractionDigits: 1 }}
            labelFormatter={(v) => `${v} mi`} className="w-full"
          />
        </div>
      </div>
      <div className="flex w-52 flex-col gap-1.5 px-1">
        <Tooltip title="Shows only stores with this many listed claims in the current filters. 0 includes stores with none. Tract colors are not affected.">
          <TooltipTrigger className="flex cursor-default items-center gap-1 text-sm font-medium text-secondary">
            Claims per store · <span className="tabular">{storeRangeLabel(storeClaims)}</span>
            <InfoCircle className="size-4 text-fg-quaternary" aria-hidden />
          </TooltipTrigger>
        </Tooltip>
        <div className="flex h-9 items-center">
          <Slider
            minValue={0} maxValue={STORE_CLAIMS_MAX} step={1} value={storeClaims}
            onChange={(v) => set({ storeClaims: v as [number, number] })} aria-label="Listed claims per store"
            labelFormatter={(v) => (v >= STORE_CLAIMS_MAX ? `${STORE_CLAIMS_MAX - 1}+` : String(v))} className="w-full"
          />
        </div>
      </div>
      {onReset && (
        <div className="flex h-9 items-center">
          <Button size="sm" color="link-gray" iconLeading={RefreshCcw01} onClick={onReset}>Reset</Button>
        </div>
      )}
    </div>
  );
}

export interface LayerControlsProps {
  /** Fill the map by census tract or by hexagon (hexagons always show listed claims). */
  areaShape: AreaShape;
  tractOpacity: number;
  bubbleOpacity: number;
  showBubbles: boolean;
  basemap: Basemap;
  online: boolean;
  onChange: (p: Partial<Omit<LayerControlsProps, 'onChange' | 'online'>>) => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function OpacityRow({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <div className={cx('flex flex-col gap-1', disabled && 'opacity-60')}>
      <div className="flex items-baseline justify-between text-xs text-tertiary">
        <span>{label}</span>
        <span className="tabular">{pct(value)}</span>
      </div>
      <Slider
        minValue={0} maxValue={1} step={0.05} value={value} isDisabled={disabled} aria-label={`${label} opacity`}
        labelFormatter={pct} onChange={(v) => onChange(v as number)}
      />
    </div>
  );
}

export function LayerControls({ areaShape, tractOpacity, bubbleOpacity, showBubbles, basemap, online, onChange }: LayerControlsProps) {
  const canMapbox = online && !!MAPBOX_TOKEN;
  return (
    <Card className="flex w-[260px] flex-col gap-3 p-4">
      <p className="text-sm font-semibold text-primary">Layers</p>
      <div className="flex flex-col gap-1.5">
        <ButtonGroup size="sm" aria-label="Map areas" disallowEmptySelection selectedKeys={[areaShape]}
          onSelectionChange={(keys) => { const k = [...keys][0]; if (k) onChange({ areaShape: k as AreaShape }); }}>
          <ButtonGroupItem id="tracts" className={SELECTED}>Tracts</ButtonGroupItem>
          <ButtonGroupItem id="hexes" className={SELECTED}>Hexagons</ButtonGroupItem>
        </ButtonGroup>
        {areaShape === 'hexes' && (
          <p className="text-xs text-tertiary">Hexagons count listed claims, so income and claims per retailer are off until you switch back to tracts.</p>
        )}
      </div>
      <OpacityRow label={areaShape === 'hexes' ? 'Hexagon fill' : 'Tract fill'} value={tractOpacity} onChange={(v) => onChange({ tractOpacity: v })} />
      <Toggle size="sm" label="Retailer bubbles" isSelected={showBubbles} onChange={(v) => onChange({ showBubbles: v })} />
      <OpacityRow label="Bubble fill" value={bubbleOpacity} disabled={!showBubbles} onChange={(v) => onChange({ bubbleOpacity: v })} />
      <div className="border-t border-secondary pt-3">
        <Toggle
          size="sm" label="Mapbox streets basemap" isDisabled={!canMapbox} isSelected={canMapbox && basemap === 'mapbox'}
          onChange={(v) => onChange({ basemap: v ? 'mapbox' : 'outline' })}
          hint={<span className="text-xs">{!online ? 'Offline mode: outlines only' : !MAPBOX_TOKEN ? 'No token in .env' : 'Loads tiles from Mapbox'}</span>}
        />
      </div>
    </Card>
  );
}
