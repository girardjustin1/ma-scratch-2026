import { useState } from 'react';
import { AlertTriangle, ChevronDown } from '@untitledui/icons';
import { cx } from '@/utils/cx';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { trendWindowLabel, type StoreTrend, type TrendWindow } from './SelectionCard';
import { classLabels } from '../domain/classify';
import type { Coverage, MetricKey } from '../domain/types';
import { hexSizeLabel, type HexLayer } from '../domain/hexes';
import { CAVEATS, LABELS } from '../lib/copy';
import { fmtCompactUsd, fmtInt, fmtRange } from '../lib/format';
import { useMode } from '../theme/mode';
import { bubbleRadii, bubbles as bubbleTokens, chrome, noData, ramps, status } from '../theme/tokens';
import { Card } from './Basics';
import { WinnersKey, type WinnersKeyProps } from './WinnersKey';

const TITLES: Record<MetricKey, string> = {
  claims: LABELS.listedClaims,
  income: LABELS.medianIncome,
  perRetailer: LABELS.claimsPerRetailer,
};

function fmt(metric: MetricKey, v: number) {
  if (metric === 'income') return fmtCompactUsd(v);
  if (metric === 'perRetailer') return v.toFixed(1);
  return fmtInt(Math.round(v));
}

export interface MapLegendProps {
  metric: MetricKey;
  breaks: number[];
  min: number;
  max: number;
  tractCount: number;
  noDataCount: number;
  coverage: Coverage;
  /** Number of tracts in view flagged for a low town match rate (claims metrics only). */
  lowMatchCount?: number;
  /** Bubble classes (listed claims per store in the radius); omit when bubbles are off. */
  bubbles?: { breaks: number[]; min: number; max: number; stores: number; hotMin?: number | null };
  /** Makes the store key interactive: show/hide by class and list the stores in view. */
  storeControls?: StoreKeyControls;
  /** Listed claims grouped by ticket price, prize size and game (collapsible). */
  winners?: WinnersKeyProps;
  /** The hexagon layer is on: the key describes hexagons instead of tracts. */
  hexes?: HexLayer | null;
}

/** Fixed-size slot so every key mark lines up with its label. */
const Key = ({ children }: { children: React.ReactNode }) => (
  <span className="flex h-3 w-[22px] shrink-0 items-center" aria-hidden>{children}</span>
);

/**
 * Monochrome card. The only colors are the swatches that key the map, taken from the same
 * tokens the map paints with, so the legend always matches what is drawn.
 */
export function MapLegend(props: MapLegendProps) {
  const { metric, tractCount, noDataCount, coverage, lowMatchCount = 0, bubbles, storeControls, winners, hexes = null } = props;
  // Hexagons always show listed claims, with their own classes.
  const { breaks, min, max } = hexes ?? props;
  const mode = useMode();
  const ramp = metric === 'income' ? ramps.income[mode] : ramps.claims[mode];
  const labels = classLabels(breaks, min, max, metric === 'claims', (v) => fmt(metric, v), metric === 'claims');
  const classes = ramp.slice(0, breaks.length + 1);
  const hatch = noData[mode];
  const ink = chrome[mode].ink;

  return (
    <Card className="w-[260px] p-4">
      <p className="text-sm font-semibold text-primary">{hexes ? `${LABELS.listedClaims} per hexagon` : TITLES[metric]}</p>
      <p className="mb-2.5 text-xs text-tertiary tabular">
        {metric === 'claims' && breaks.join() === '0,1,3,9' ? 'Fixed classes' : 'Quantile classes'} ·{' '}
        {hexes ? `${fmtInt(hexes.inRadius)} hexagons, ${hexSizeLabel(hexes.res)}` : `${fmtInt(tractCount)} tracts`}
      </p>
      <ul className="flex flex-col gap-1.5">
        {classes.map((color, i) => (
          <li key={color} className="flex items-center gap-2">
            <Key><span className="h-3 w-full rounded-sm" style={{ backgroundColor: color }} /></Key>
            <span className="text-sm text-secondary tabular">{labels[i]}</span>
          </li>
        ))}
        {hexes ? (
          <li className="flex items-center gap-2">
            <Key><span className="h-3 w-full rounded-sm" style={{ border: `1px solid ${chrome[mode].grid}` }} /></Key>
            <span className="text-sm text-secondary">Blank: no licensed stores</span>
          </li>
        ) : <li className="flex items-center gap-2">
          <Key>
            <span
              className="h-3 w-full rounded-sm"
              style={{
                background: `repeating-linear-gradient(135deg, ${hatch.line} 0 1.5px, ${hatch.fill} 1.5px 5px)`,
                border: `1px solid ${hatch.line}`,
              }}
            />
          </Key>
          <span className="text-sm text-secondary">
            {metric === 'perRetailer' ? 'No data or no retailers' : LABELS.noData}
            <span className="text-xs text-tertiary tabular"> · {fmtInt(noDataCount)}</span>
          </span>
        </li>}
      </ul>
      {bubbles && bubbles.stores > 0 && <BubbleKey {...bubbles} controls={storeControls} />}
      {winners && <WinnersKey {...winners} />}
      <div className="mt-3 flex flex-col gap-1.5 border-t border-secondary pt-3">
        <div className="flex items-center gap-2">
          {!coverage.statewide && <Key><span className="w-full" style={{ borderTop: `2px solid ${ink}`, opacity: 0.85 }} /></Key>}
          <span className="text-xs text-secondary tabular">
            {coverage.statewide ? 'Coverage: statewide' : 'Coverage boundary'} · {fmtRange(coverage.dateFrom, coverage.dateTo)}
          </span>
        </div>
        {!hexes && metric !== 'income' && lowMatchCount > 0 && (
          <div className="flex items-center gap-2">
            <Key><span className="h-3 w-full rounded-sm" style={{ border: `2px dashed ${status.warning}` }} /></Key>
            <AlertTriangle className="size-3.5 shrink-0 text-fg-quaternary" aria-hidden />
            <span className="text-xs text-secondary tabular">Low match rate (under 80%) · {fmtInt(lowMatchCount)}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Key><span className="w-full" style={{ borderTop: `2px dashed ${ink}`, opacity: 0.7 }} /></Key>
          <span className="text-xs text-secondary">Search radius</span>
        </div>
        <p className="mt-1 text-xs leading-[1.45] text-tertiary">
          {metric === 'income' ? CAVEATS.ecological : metric === 'perRetailer' ? CAVEATS.perRetailer : CAVEATS.listedOnly}
          {metric !== 'income' && <> {CAVEATS.matchedOnly}</>}
          {hexes && <> {CAVEATS.hexes}</>}
        </p>
      </div>
    </Card>
  );
}

/** A store in view, for the legend's list. cls: 0–4 by the bubble breaks, -1 = no listed claims. */
export interface StoreInView { id: string; name: string; town: string; n: number; cls: number; trend?: StoreTrend }

export interface StoreKeyControls {
  /** Stores in the current map view (after the claims-per-store slider), busiest first. */
  inView: StoreInView[];
  hidden: Set<number>;
  onToggle: (cls: number) => void;
  onShowAll: () => void;
  onSelectStore: (id: string) => void;
  /** The halves of the selected range that "Trending" compares. */
  trendWindow?: TrendWindow;
}

/** One legend row that doubles as a show/hide toggle, with the count in view. */
function KeyRow({ cls, hidden, count, onToggle, mark, children }: {
  cls: number; hidden: boolean; count?: number; onToggle?: (cls: number) => void; mark: React.ReactNode; children: React.ReactNode;
}) {
  const body = (
    <>
      <span className={cx('flex w-[32px] shrink-0 items-center justify-center', hidden && 'opacity-30')} aria-hidden>{mark}</span>
      <span className={cx('flex-1 text-left text-sm text-secondary tabular', hidden && 'text-quaternary line-through')}>{children}</span>
      {count !== undefined && <span className="text-xs text-tertiary tabular">{fmtInt(count)}</span>}
    </>
  );
  if (!onToggle) return <li className="flex items-center gap-2">{body}</li>;
  return (
    <li>
      <button type="button" onClick={() => onToggle(cls)} aria-pressed={!hidden}
        title={hidden ? 'Show these stores' : 'Hide these stores'}
        className="-mx-1.5 flex w-[calc(100%+0.75rem)] cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5 outline-hidden hover:bg-primary_hover focus-visible:ring-2 focus-visible:ring-focus-ring">
        {body}
      </button>
    </li>
  );
}

/**
 * Bubble key: five sizes and colors for listed claims per store, plus how groups read.
 * With controls, each row toggles those stores on the map and shows how many are in view,
 * and a list names the stores currently in view.
 */
function BubbleKey({ breaks, min, max, stores, hotMin = null, controls }: {
  breaks: number[]; min: number; max: number; stores: number; hotMin?: number | null; controls?: StoreKeyControls;
}) {
  const mode = useMode();
  const t = bubbleTokens[mode];
  const [listOpen, setListOpen] = useState(false);
  const [listSort, setListSort] = useState<'busiest' | 'trending'>('busiest');
  const labels = classLabels(breaks, min, max, true, (v) => fmtInt(Math.round(v)), true);
  const top = labels.length - 1;
  // With a hottest tier, the top class stops just below it: "32 – 79", then "🔥 80+".
  if (hotMin !== null && top > 0) labels[top] = `${fmtInt(breaks[top - 1] + 1)} – ${fmtInt(hotMin - 1)}`;
  const count = (cls: number) => controls?.inView.filter((s) => s.cls === cls).length;
  const visible = controls ? controls.inView.filter((s) => !controls.hidden.has(s.cls)) : [];
  const trendingCount = visible.filter((s) => s.trend?.trending).length;
  const shown = listSort === 'trending'
    ? visible.filter((s) => s.trend?.trending).sort((x, y) => (y.trend!.recent - y.trend!.prior) - (x.trend!.recent - x.trend!.prior))
    : visible;
  return (
    <div className="mt-3 border-t border-secondary pt-3">
      <div className="flex items-baseline gap-2">
        <p className="flex-1 text-sm font-semibold text-primary">Stores · listed claims</p>
        {controls && controls.hidden.size > 0 && (
          <button type="button" onClick={controls.onShowAll} className="cursor-pointer text-xs font-semibold text-secondary hover:text-primary">Show all</button>
        )}
      </div>
      <p className="mb-2 text-xs text-tertiary tabular">
        {breaks.join() === '1,2,4,9' ? 'Fixed classes' : 'Quantile classes'} · {fmtInt(stores)} stores with listed claims in radius
        {controls && <> · click a row to show or hide; numbers are stores in view</>}
      </p>
      <ul className="flex flex-col gap-0.5">
        {labels.map((label, i) => (
          <KeyRow key={label} cls={i} hidden={!!controls?.hidden.has(i)} count={count(i)} onToggle={controls?.onToggle}
            mark={<span className="rounded-full" style={{ width: bubbleRadii[i] * 2, height: bubbleRadii[i] * 2, backgroundColor: t.ramp[i], boxShadow: `0 0 0 1px ${t.stroke}` }} />}>
            {label}{i === top && top === 4 && <span className="font-semibold text-primary"> · Top stores</span>}
          </KeyRow>
        ))}
        {hotMin !== null && (
          <KeyRow cls={5} hidden={!!controls?.hidden.has(5)} count={count(5)} onToggle={controls?.onToggle}
            mark={<span className="relative" style={{ width: bubbleRadii[4] * 2, height: bubbleRadii[4] * 2 }}>
              <span className="absolute inset-0 rounded-full" style={{ backgroundColor: t.ramp[4], boxShadow: `0 0 0 1px ${t.stroke}` }} />
              <span className="absolute -top-1.5 -right-1.5 text-[13px] leading-none">🔥</span>
            </span>}>
            {fmtInt(hotMin)}+ <span className="font-semibold text-primary">· Hottest</span>
            <span className="text-xs text-tertiary"> (top 3%)</span>
          </KeyRow>
        )}
        <KeyRow cls={-1} hidden={!!controls?.hidden.has(-1)} count={count(-1)} onToggle={controls?.onToggle}
          mark={<span className="size-[5px] rounded-full" style={{ boxShadow: `0 0 0 1px ${t.hollow}` }} />}>
          No listed claims
        </KeyRow>
        <li className="flex items-center gap-2 pt-1">
          <span className="flex w-[32px] shrink-0 items-center justify-center" aria-hidden>
            <span
              className="grid size-[26px] place-items-center rounded-full text-[9px] font-semibold text-white"
              style={{ backgroundColor: t.ramp[3], boxShadow: `0 0 0 2px ${t.stroke}` }}
            >
              120
            </span>
          </span>
          <span className="text-xs leading-[1.4] text-secondary">
            Group of stores when zoomed out: number and size = total; color = average per licensed store
          </span>
        </li>
      </ul>
      {controls && (
        <div className="mt-3 border-t border-secondary pt-2">
          <button type="button" onClick={() => setListOpen(!listOpen)} aria-expanded={listOpen}
            className="flex w-full cursor-pointer items-center gap-1 text-sm font-semibold text-primary outline-hidden">
            Stores in view <span className="font-normal text-tertiary tabular">· {fmtInt(shown.length)}</span>
            <ChevronDown className={cx('ml-auto size-4 text-fg-quaternary transition-transform', listOpen && 'rotate-180')} aria-hidden />
          </button>
          {listOpen && (
            <div className="mt-2">
              <ButtonGroup size="sm" aria-label="Sort stores in view" disallowEmptySelection selectedKeys={[listSort]}
                onSelectionChange={(k) => { const v = [...k][0]; if (v) setListSort(v as 'busiest' | 'trending'); }}>
                <ButtonGroupItem id="busiest" className="selected:bg-tertiary selected:text-primary">Busiest</ButtonGroupItem>
                <ButtonGroupItem id="trending" className="selected:bg-tertiary selected:text-primary">Trending · {fmtInt(trendingCount)}</ButtonGroupItem>
              </ButtonGroup>
              {listSort === 'trending' && (
                <p className="mt-1.5 text-[11px] leading-[1.4] text-tertiary">
                  {controls.trendWindow
                    ? <>Later half of your date range vs the earlier half ({trendWindowLabel(controls.trendWindow)}): {controls.trendWindow.min}+ listed and at least double.</>
                    : 'Later half of your date range vs the earlier half.'}
                </p>
              )}
            </div>
          )}
          {listOpen && (
            <ul className="mt-1.5 flex max-h-56 flex-col overflow-y-auto">
              {shown.slice(0, 200).map((st) => (
                <li key={st.id}>
                  <button type="button" onClick={() => controls.onSelectStore(st.id)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-primary_hover">
                    <span className="size-2.5 shrink-0 rounded-full"
                      style={st.cls >= 0 ? { backgroundColor: t.ramp[Math.min(st.cls, 4)] } : { boxShadow: `0 0 0 1px ${t.hollow}` }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-primary">{st.cls === 5 && '🔥 '}{st.name}</span>
                      <span className="block truncate text-[11px] text-tertiary">{st.town}</span>
                    </span>
                    {listSort === 'trending' && st.trend
                      ? <span className="text-right text-xs text-secondary tabular">
                          <span className="font-semibold text-primary">{fmtInt(st.trend.recent)}</span> vs {fmtInt(st.trend.prior)}
                        </span>
                      : <span className="text-xs font-semibold text-primary tabular">{fmtInt(st.n)}</span>}
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="py-1 text-xs text-tertiary">{listSort === 'trending' ? 'No trending stores in view.' : 'No stores in view with the current filters.'}</li>}
              {shown.length > 200 && <li className="py-1 text-xs text-tertiary">Showing the 200 busiest; zoom in for the rest.</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
