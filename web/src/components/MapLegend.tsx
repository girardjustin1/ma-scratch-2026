import { AlertTriangle } from '@untitledui/icons';
import { classLabels } from '../domain/classify';
import type { Coverage, MetricKey } from '../domain/types';
import { CAVEATS, LABELS } from '../lib/copy';
import { fmtCompactUsd, fmtInt, fmtRange } from '../lib/format';
import { useMode } from '../theme/mode';
import { bubbleRadii, bubbles as bubbleTokens, chrome, noData, ramps, status } from '../theme/tokens';
import { Card } from './Basics';

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
  bubbles?: { breaks: number[]; min: number; max: number; stores: number };
}

/** Fixed-size slot so every key mark lines up with its label. */
const Key = ({ children }: { children: React.ReactNode }) => (
  <span className="flex h-3 w-[22px] shrink-0 items-center" aria-hidden>{children}</span>
);

/**
 * Monochrome card. The only colors are the swatches that key the map, taken from the same
 * tokens the map paints with, so the legend always matches what is drawn.
 */
export function MapLegend({ metric, breaks, min, max, tractCount, noDataCount, coverage, lowMatchCount = 0, bubbles }: MapLegendProps) {
  const mode = useMode();
  const ramp = metric === 'income' ? ramps.income[mode] : ramps.claims[mode];
  const labels = classLabels(breaks, min, max, metric === 'claims', (v) => fmt(metric, v), metric === 'claims');
  const classes = ramp.slice(0, breaks.length + 1);
  const hatch = noData[mode];
  const ink = chrome[mode].ink;

  return (
    <Card className="w-[260px] p-4">
      <p className="text-sm font-semibold text-primary">{TITLES[metric]}</p>
      <p className="mb-2.5 text-xs text-tertiary tabular">
        {metric === 'claims' && breaks.join() === '0,1,3,9' ? 'Fixed classes' : 'Quantile classes'} · {fmtInt(tractCount)} tracts
      </p>
      <ul className="flex flex-col gap-1.5">
        {classes.map((color, i) => (
          <li key={color} className="flex items-center gap-2">
            <Key><span className="h-3 w-full rounded-sm" style={{ backgroundColor: color }} /></Key>
            <span className="text-sm text-secondary tabular">{labels[i]}</span>
          </li>
        ))}
        <li className="flex items-center gap-2">
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
        </li>
      </ul>
      {bubbles && bubbles.stores > 0 && <BubbleKey {...bubbles} />}
      <div className="mt-3 flex flex-col gap-1.5 border-t border-secondary pt-3">
        <div className="flex items-center gap-2">
          {!coverage.statewide && <Key><span className="w-full" style={{ borderTop: `2px solid ${ink}`, opacity: 0.85 }} /></Key>}
          <span className="text-xs text-secondary tabular">
            {coverage.statewide ? 'Coverage: statewide' : 'Coverage boundary'} · {fmtRange(coverage.dateFrom, coverage.dateTo)}
          </span>
        </div>
        {metric !== 'income' && lowMatchCount > 0 && (
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
        </p>
      </div>
    </Card>
  );
}

/** Bubble key: five sizes and colors for listed claims per store, plus how groups read. */
function BubbleKey({ breaks, min, max, stores }: { breaks: number[]; min: number; max: number; stores: number }) {
  const mode = useMode();
  const t = bubbleTokens[mode];
  const labels = classLabels(breaks, min, max, true, (v) => fmtInt(Math.round(v)));
  return (
    <div className="mt-3 border-t border-secondary pt-3">
      <p className="text-sm font-semibold text-primary">Stores · listed claims</p>
      <p className="mb-2 text-xs text-tertiary tabular">Quantile classes · {fmtInt(stores)} stores with listed claims in radius</p>
      <ul className="flex flex-col gap-1">
        {labels.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span className="flex w-[32px] shrink-0 items-center justify-center" aria-hidden>
              <span
                className="rounded-full"
                style={{ width: bubbleRadii[i] * 2, height: bubbleRadii[i] * 2, backgroundColor: t.ramp[i], boxShadow: `0 0 0 1px ${t.stroke}` }}
              />
            </span>
            <span className="text-sm text-secondary tabular">{label}</span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="flex w-[32px] shrink-0 items-center justify-center" aria-hidden>
            <span className="size-[5px] rounded-full" style={{ boxShadow: `0 0 0 1px ${t.hollow}` }} />
          </span>
          <span className="text-sm text-secondary">No listed claims</span>
        </li>
        <li className="flex items-center gap-2">
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
    </div>
  );
}
