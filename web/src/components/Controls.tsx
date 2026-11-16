import { useMemo, useState, type FC, type ReactNode } from 'react';
import { type CalendarDate, parseDate } from '@internationalized/date';
import { Award01, Building07, Calendar, Check, ChevronDown, Columns03, LayersThree01, RefreshCcw01, Target04 } from '@untitledui/icons';
import type { DateValue } from 'react-aria-components';
import {
  DateRangePicker as AriaDateRangePicker, Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, Group as AriaGroup,
  ListBox as AriaListBox, ListBoxItem as AriaListBoxItem, Popover as AriaPopover,
} from 'react-aria-components';
import { RangeCalendar, RangePresetButton } from '@/components/application/date-picker/range-calendar';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Button } from '@/components/base/buttons/button';
import { InputDateBase } from '@/components/base/input/input-date';
import { Select } from '@/components/base/select/select';
import { Slider } from '@/components/base/slider/slider';
import { Toggle } from '@/components/base/toggle/toggle';
import { cx } from '@/utils/cx';
import type { Filters, GameRef, MetricKey, PrizeBand } from '../domain/types';
import { changedFilters, RADIUS, STORE_CLAIMS_MAX, storeRange } from '../domain/filterState';
import type { AreaShape } from '../domain/hexes';
import { CAVEATS, LABELS } from '../lib/copy';
import { fmtDate, fmtRange } from '../lib/format';
import { BASEMAPS, MAPBOX_TOKEN, type Basemap } from '../map/mapStyle';
import { Card } from './Basics';
import { GamePicker } from './GamePicker';

export { STORE_CLAIMS_MAX };

/** Selected item reads darker than the rest: monochrome, no brand tint. */
const SELECTED = 'selected:bg-tertiary selected:text-primary';

/** A filter that is off its default: a dark outline and darker text (words still say what it is set to). */
const ACTIVE = 'bg-secondary text-primary ring-[1.5px] ring-[var(--color-fg-primary)] hover:bg-secondary';
const POPOVER = ({ isEntering, isExiting }: { isEntering: boolean; isExiting: boolean }) => cx(
  'origin-(--trigger-anchor-point) rounded-xl bg-primary shadow-lg ring-1 ring-secondary_alt outline-hidden will-change-transform',
  isEntering && 'duration-150 ease-out animate-in fade-in placement-bottom:slide-in-from-top-0.5 placement-top:slide-in-from-bottom-0.5',
  isExiting && 'duration-100 ease-in animate-out fade-out placement-bottom:slide-out-to-top-0.5 placement-top:slide-out-to-bottom-0.5',
);

/**
 * One filter: a button showing its current value, opening a small panel to change it.
 * `label` names the filter for screen readers and heads the panel.
 */
function FilterPopover({ icon, label, value, active = false, width = 320, children }: {
  icon: FC<{ className?: string }>; label: string; value: string; active?: boolean; width?: number;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  return (
    <AriaDialogTrigger>
      <Button size="sm" color="secondary" iconLeading={icon} iconTrailing={ChevronDown} aria-label={value === label ? label : `${label}: ${value}`} className={cx(active && ACTIVE)}>
        <span className="tabular">{value}</span>
      </Button>
      <AriaPopover placement="bottom start" offset={6} containerPadding={8} className={POPOVER}>
        <AriaDialog aria-label={label} className="flex flex-col gap-3 p-4 outline-hidden" style={{ width }}>
          {({ close }) => (
            <>
              <p className="text-sm font-semibold text-primary">{label}</p>
              {typeof children === 'function' ? children(close) : children}
            </>
          )}
        </AriaDialog>
      </AriaPopover>
    </AriaDialogTrigger>
  );
}

/** A row of quick choices inside a filter panel. */
function Presets<T extends string | number>({ label, options, value, onPick }: {
  label: string; options: { id: T; label: string }[]; value: T | null; onPick: (id: T) => void;
}) {
  return (
    <ButtonGroup size="sm" aria-label={label} className="w-full" selectedKeys={value === null ? [] : [String(value)]}
      onSelectionChange={(keys) => { const k = [...keys][0]; const o = options.find((x) => String(x.id) === k); if (o) onPick(o.id); }}>
      {options.map((o) => <ButtonGroupItem key={String(o.id)} id={String(o.id)} className={cx(SELECTED, 'flex-1 justify-center px-2 not-last:pr-2')}>{o.label}</ButtonGroupItem>)}
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
function ListedDatePicker({ from, to, minDate, maxDate, active = false, onChange }: {
  from: string; to: string; minDate: string; maxDate: string; active?: boolean; onChange: (from: string, to: string) => void;
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
    >
      <AriaGroup>
        <Button size="sm" color="secondary" iconLeading={Calendar} iconTrailing={ChevronDown} className={cx('tabular', active && ACTIVE)}>{fmtRange(from, to)}</Button>
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
                  The data has listed dates {fmtRange(minDate, maxDate)}; other days cannot be picked. Presets count back
                  from {fmtDate(maxDate)}.
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
  /** What Reset returns to, and what "changed" is measured against. Default: nothing reads as changed. */
  defaults?: Filters;
  games: GameRef[];
  minDate: string;
  maxDate: string;
  onChange: (f: Filters) => void;
  onReset?: () => void;
  /** Listed claims per game in the radius, for the game picker's counts and sort. */
  claimCounts?: Map<string, number>;
  /** Shown first: where the radius starts (the app's location button). */
  locationSlot?: ReactNode;
  /** A line under the filters: what they currently add up to. */
  summary?: ReactNode;
}

const NO_COUNTS = new Map<string, number>();

export function storeRangeLabel([lo, hi]: [number, number]) {
  const top = hi >= STORE_CLAIMS_MAX ? `${STORE_CLAIMS_MAX - 1}+` : String(hi);
  if (lo === 0 && hi >= STORE_CLAIMS_MAX) return 'all';
  if (hi >= STORE_CLAIMS_MAX) return `${lo}+`;
  return lo === hi ? String(lo) : `${lo} – ${top}`;
}

const RADIUS_PRESETS = [1, 2, 5, 10, 25].map((r) => ({ id: r, label: `${r} mi` }));
const STORE_PRESETS: { id: string; label: string; range: [number, number] }[] = [
  { id: 'all', label: 'All', range: [0, STORE_CLAIMS_MAX] },
  { id: '1', label: '1+', range: [1, STORE_CLAIMS_MAX] },
  { id: '5', label: '5+', range: [5, STORE_CLAIMS_MAX] },
  { id: '10', label: '10+', range: [10, STORE_CLAIMS_MAX] },
  { id: '25', label: '25+', range: [25, STORE_CLAIMS_MAX] },
  { id: 'none', label: 'None', range: [0, 0] },
];

/**
 * The filters above the map, one compact row: where (location, radius), when (listed dates),
 * what (games, prize size) and which stores. Each button shows its current value and opens a
 * small panel; a filter off its default reads darker, and Reset appears once anything changed.
 * Dates are Lottery-listed dates, day granularity.
 */
export function FilterBar({ filters, defaults, games, minDate, maxDate, onChange, onReset, claimCounts, locationSlot, summary }: FilterBarProps) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const changed = new Set(defaults ? changedFilters(filters, defaults) : []);
  const stores = storeRange(filters);
  const band = BANDS.find((b) => b.value === filters.prizeBand) ?? BANDS[0];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
      {locationSlot}
      <FilterPopover icon={Target04} label="Radius" value={`${filters.radiusMiles} mi`} active={changed.has('radius')}>
        <Presets label="Radius presets" options={RADIUS_PRESETS} value={RADIUS_PRESETS.some((r) => r.id === filters.radiusMiles) ? filters.radiusMiles : null}
          onPick={(r) => set({ radiusMiles: r })} />
        <Slider
          minValue={RADIUS.min} maxValue={RADIUS.max} step={RADIUS.step} value={filters.radiusMiles}
          onChange={(v) => set({ radiusMiles: v as number })} aria-label="Radius in miles"
          formatOptions={{ style: 'unit', unit: 'mile', maximumFractionDigits: 1 }}
          labelFormatter={(v) => `${v} mi`} className="w-full"
        />
        <p className="text-xs leading-[1.45] text-tertiary">
          Measured from the pin. {CAVEATS.radiusRule}{changed.has('pin') ? ' The pin has been moved; Reset puts it back.' : ''}
        </p>
      </FilterPopover>
      <span aria-hidden className="mx-1 h-5 w-px bg-[var(--color-border-secondary)]" />
      <ListedDatePicker
        from={filters.dateFrom} to={filters.dateTo} minDate={minDate} maxDate={maxDate} active={changed.has('dates')}
        onChange={(dateFrom, dateTo) => set({ dateFrom, dateTo })}
      />
      <GamePicker
        compact active={changed.has('games') || changed.has('prices')}
        games={games} value={filters.gameIds} onChange={(gameIds) => set({ gameIds })}
        prices={filters.prices} onPricesChange={(prices) => set({ prices })} prizeBand={filters.prizeBand}
        claimCounts={claimCounts ?? NO_COUNTS}
      />
      <FilterPopover icon={Award01} label="Prize size" value={band.value === 'all' ? 'All prizes' : band.label} active={changed.has('prize')} width={240}>
        {(close) => (
          <AriaListBox aria-label="Prize size" selectionMode="single" disallowEmptySelection selectedKeys={[filters.prizeBand]}
            onSelectionChange={(keys) => { const k = [...keys][0]; if (k) { set({ prizeBand: k as PrizeBand }); close(); } }}
            className="-mx-2 -mb-2 flex flex-col outline-hidden">
            {BANDS.map((b) => (
              <AriaListBoxItem key={b.value} id={b.value} textValue={b.label}
                className={({ isFocused, isSelected }) => cx('flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-hidden',
                  isSelected ? 'font-semibold text-primary' : 'text-secondary', isFocused && 'bg-primary_hover')}>
                {({ isSelected }) => (
                  <>
                    <span className="flex-1 tabular">{b.label}</span>
                    {isSelected && <Check aria-hidden className="size-4 text-fg-secondary" />}
                  </>
                )}
              </AriaListBoxItem>
            ))}
          </AriaListBox>
        )}
      </FilterPopover>
      <FilterPopover icon={Building07} label="Stores by listed claims" active={changed.has('stores')}
        value={storeRangeLabel(stores) === 'all' ? 'All stores' : `Stores: ${storeRangeLabel(stores)} claims`}>
        <Presets label="Store presets" options={STORE_PRESETS} value={STORE_PRESETS.find((x) => x.range.join() === stores.join())?.id ?? null}
          onPick={(id) => set({ storeClaims: STORE_PRESETS.find((x) => x.id === id)!.range })} />
        <Slider
          minValue={0} maxValue={STORE_CLAIMS_MAX} step={1} value={stores}
          onChange={(v) => set({ storeClaims: v as [number, number] })} aria-label="Listed claims per store"
          labelFormatter={(v) => (v >= STORE_CLAIMS_MAX ? `${STORE_CLAIMS_MAX - 1}+` : String(v))} className="w-full"
        />
        <p className="text-xs leading-[1.45] text-tertiary">
          Shows only stores with this many listed claims under the other filters. None shows stores with no listed claims.
          Area colors are not affected.
        </p>
      </FilterPopover>
      {onReset && changed.size > 0 && (
        <Button size="sm" color="link-gray" iconLeading={RefreshCcw01} onClick={onReset}>Reset</Button>
      )}
      </div>
      {summary}
    </div>
  );
}

// ── Map view controls (on the map) ────────────────────────────────────────────────────────

/** What the areas are colored by, as one dropdown. claimsOnly: hexagons are on, so only listed claims can be mapped. */
export function MetricSelect({ value, onChange, claimsOnly = false, label = 'Color areas by' }: {
  value: MetricKey; onChange: (m: MetricKey) => void; claimsOnly?: boolean; label?: string;
}) {
  return (
    <Select size="sm" aria-label={label} className="w-[250px]" selectedKey={value} disabledKeys={claimsOnly ? ['income', 'perRetailer'] : []}
      items={[{ id: 'claims', label: LABELS.listedClaims }, { id: 'income', label: LABELS.medianIncome }, { id: 'perRetailer', label: LABELS.claimsPerRetailer }]}
      onSelectionChange={(k) => k && onChange(k as MetricKey)}>
      {(item) => <Select.Item id={item.id} label={item.label} />}
    </Select>
  );
}

/** Why streets and satellite cannot be picked, or null when they can. */
export const basemapBlocker = (online: boolean, canGoOnline: boolean) =>
  !MAPBOX_TOKEN ? 'Streets and satellite need a Mapbox token (web/.env.local). They are off in the public demo.'
    : !online && !canGoOnline ? 'Streets and satellite need the app online.' : null;

/**
 * Outline | Streets | Satellite. Outline is our own layers and works offline; the other two
 * load Mapbox tiles, so picking one while offline first takes the app online.
 */
export function BasemapSwitch({ value, online, onChange, onGoOnline }: {
  value: Basemap; online: boolean; onChange: (b: Basemap) => void; onGoOnline?: () => void;
}) {
  const blocker = basemapBlocker(online, !!onGoOnline);
  const shown = online && !blocker ? value : 'outline';
  return (
    <div title={blocker ?? 'Streets and satellite load map tiles from Mapbox'}>
      <ButtonGroup size="sm" aria-label="Basemap" disallowEmptySelection selectedKeys={[shown]}
        onSelectionChange={(keys) => {
          const k = [...keys][0] as Basemap | undefined;
          if (!k) return;
          if (k !== 'outline' && !online) onGoOnline?.();
          onChange(k);
        }}>
        {BASEMAPS.map((b) => (
          <ButtonGroupItem key={b.id} id={b.id} className={SELECTED} isDisabled={b.id !== 'outline' && !!blocker}>{b.label}</ButtonGroupItem>
        ))}
      </ButtonGroup>
    </div>
  );
}

export interface LayerControlsProps {
  /** Fill the map by census tract or by hexagon (hexagons always show listed claims). */
  areaShape: AreaShape;
  tractOpacity: number;
  bubbleOpacity: number;
  showBubbles: boolean;
  onChange: (p: Partial<Omit<LayerControlsProps, 'onChange'>>) => void;
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

/** Area shape, fills and store bubbles. */
function LayerFields({ areaShape, tractOpacity, bubbleOpacity, showBubbles, onChange }: LayerControlsProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <ButtonGroup size="sm" aria-label="Map areas" disallowEmptySelection selectedKeys={[areaShape]}
          onSelectionChange={(keys) => { const k = [...keys][0]; if (k) onChange({ areaShape: k as AreaShape }); }}>
          <ButtonGroupItem id="tracts" className={cx(SELECTED, 'flex-1 justify-center')}>Tracts</ButtonGroupItem>
          <ButtonGroupItem id="hexes" className={cx(SELECTED, 'flex-1 justify-center')}>Hexagons</ButtonGroupItem>
        </ButtonGroup>
        {areaShape === 'hexes' && (
          <p className="text-xs text-tertiary">Hexagons count listed claims, so income and claims per retailer are off until you switch back to tracts.</p>
        )}
      </div>
      <OpacityRow label={areaShape === 'hexes' ? 'Hexagon fill' : 'Tract fill'} value={tractOpacity} onChange={(v) => onChange({ tractOpacity: v })} />
      <Toggle size="sm" label="Retailer bubbles" isSelected={showBubbles} onChange={(v) => onChange({ showBubbles: v })} />
      <OpacityRow label="Bubble fill" value={bubbleOpacity} disabled={!showBubbles} onChange={(v) => onChange({ bubbleOpacity: v })} />
    </>
  );
}

/** The layer settings as a card (Storybook, or anywhere they should stay open). */
export function LayerControls(props: LayerControlsProps) {
  return (
    <Card className="flex w-[260px] flex-col gap-3 p-4">
      <p className="text-sm font-semibold text-primary">Layers</p>
      <LayerFields {...props} />
    </Card>
  );
}

export interface MapToolbarProps extends LayerControlsProps {
  metric: MetricKey;
  onMetric: (m: MetricKey) => void;
  basemap: Basemap;
  onBasemap: (b: Basemap) => void;
  online: boolean;
  onGoOnline?: () => void;
  compare: boolean;
  onCompare: (on: boolean) => void;
}

/**
 * How the map is drawn, in one row over its top-left corner: what colors the areas, the
 * basemap, the layer settings (in a panel) and side by side.
 */
export function MapToolbar({ metric, onMetric, basemap, onBasemap, online, onGoOnline, compare, onCompare, ...layers }: MapToolbarProps) {
  return (
    // Only the controls take clicks: the gaps between and beside them stay part of the map.
    <div className="pointer-events-none! flex flex-wrap items-center gap-2 *:pointer-events-auto">
      <MetricSelect value={metric} onChange={onMetric} claimsOnly={layers.areaShape === 'hexes'} />
      <BasemapSwitch value={basemap} online={online} onChange={onBasemap} onGoOnline={onGoOnline} />
      <FilterPopover icon={LayersThree01} label="Layers" value="Layers" width={260}>
        <LayerFields {...layers} />
      </FilterPopover>
      <Button size="sm" color={compare ? 'primary' : 'secondary'} iconLeading={Columns03} onClick={() => onCompare(!compare)} aria-pressed={compare}>
        Side by side
      </Button>
    </div>
  );
}
