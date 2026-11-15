import { useEffect, useMemo, useRef } from 'react';
import * as Plot from '@observablehq/plot';
import { ArrowDown, ArrowUp, Minus } from '@untitledui/icons';
import { BadgeWithIcon } from '@/components/base/badges/badges';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { BUCKETS, type BucketId } from '../domain/prizeBuckets';
import { isCompared, noCallReason, PACE_LABEL, type GamePace, type PaceCall, type PaceData, type PaceEntry } from '../domain/pace';
import { CAVEATS } from '../lib/copy';
import { fmtDate, fmtInt, fmtPct } from '../lib/format';
import { useMode } from '../theme/mode';
import { chrome } from '../theme/tokens';
import { CaveatNote } from './Basics';

const ICON: Partial<Record<PaceCall, typeof ArrowUp>> = { ahead: ArrowUp, on_pace: Minus, behind: ArrowDown };
const BUCKET_LABEL = Object.fromEntries(BUCKETS.map((b) => [b.id, b.label])) as Record<BucketId, string>;

/** Gray status badge: icon + words, never color. */
export function PaceBadge({ entry, size = 'sm' }: { entry?: PaceEntry; size?: 'sm' | 'md' }) {
  if (!entry || !isCompared(entry.call)) return null;
  return (
    <BadgeWithIcon type="modern" size={size} color="gray" iconLeading={ICON[entry.call]!}>
      {PACE_LABEL[entry.call]}
    </BadgeWithIcon>
  );
}

/** One sentence: where the game is, and what comparable games had claimed at this age. */
export function paceSentence(pace: GamePace, bucket: BucketId, e: PaceEntry) {
  const what = bucket === 'top' ? 'top prizes' : `${BUCKET_LABEL[bucket]} prizes`;
  const now = `Week ${fmtInt(pace.ageWeeks)} since launch: ${fmtInt(e.claimed)} of ${fmtInt(e.printed)} ${what} claimed (${fmtPct(e.share)}).`;
  if (!isCompared(e.call) || e.p25 === undefined) return `${now} ${noCallReason(e, pace.price)}`;
  return `${now} $${pace.price} games at week ${fmtInt(pace.ageWeeks)} had usually claimed ${fmtPct(e.p25!)}–${fmtPct(e.p75!)}`
    + ` (middle half of ${fmtInt(e.n!)} games; median ${fmtPct(e.p50!)}).`;
}

/** Share claimed by week since launch: the typical range for this price, and this game. */
function PaceChart({ pace, bucket, data }: { pace: GamePace; bucket: BucketId; data: PaceData }) {
  const ref = useRef<HTMLDivElement>(null);
  const mode = useMode();
  const norm = useMemo(() => (data.norms[String(pace.price)]?.[bucket] ?? []).map(([week, p25, p50, p75, n]) => ({ week, p25, p50, p75, n })), [data, pace.price, bucket]);
  const entry = pace.buckets[bucket];
  const own = useMemo(() => (entry?.curve ?? []).map((share, i) => ({ week: i + 1, share })), [entry]);

  useEffect(() => {
    if (!entry) return;
    const c = chrome[mode];
    const maxW = Math.max(pace.ageWeeks, norm.at(-1)?.week ?? 0);
    const now = [{ week: pace.ageWeeks, share: entry.share }];
    const plot = Plot.plot({
      width: 640,
      height: 210,
      marginLeft: 40,
      marginBottom: 32,
      style: { background: 'transparent', color: c.inkSecondary, fontSize: '11px', fontFamily: 'inherit' },
      x: { domain: [0, maxW], label: 'Weeks since launch', labelAnchor: 'right', labelOffset: 28 },
      y: { domain: [0, 1], grid: true, tickFormat: '.0%', label: null, ticks: 5 },
      marks: [
        Plot.areaY(norm, { x: 'week', y1: 'p25', y2: 'p75', fill: c.grid, fillOpacity: 0.9 }),
        Plot.lineY(norm, { x: 'week', y: 'p50', stroke: c.inkMuted, strokeWidth: 1.5, strokeDasharray: '4 3' }),
        Plot.lineY(own, { x: 'week', y: 'share', stroke: c.ink, strokeWidth: 2 }),
        Plot.dot(now, { x: 'week', y: 'share', r: 4, fill: c.ink, stroke: c.surfaceRaised, strokeWidth: 2 }),
        Plot.ruleX(norm, Plot.pointerX({ x: 'week', stroke: c.axis })),
        Plot.tip(norm, Plot.pointerX({
          x: 'week', y: 'p50',
          title: (r: { week: number; p25: number; p50: number; p75: number; n: number }) => {
            const mine = own.find((o) => o.week === r.week);
            return [`Week ${r.week}`, `Typical ${fmtPct(r.p25)}–${fmtPct(r.p75)} (median ${fmtPct(r.p50)}, ${r.n} games)`,
              mine ? `This game ${fmtPct(mine.share)}` : null].filter(Boolean).join('\n');
          },
        })),
      ],
    });
    ref.current?.replaceChildren(plot);
    return () => plot.remove();
  }, [norm, own, entry, pace.ageWeeks, mode]);

  return (
    <div>
      <div ref={ref} />
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary" aria-label="Chart key">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: chrome[mode].grid }} />Typical range (middle half of ${pace.price} games)</li>
        <li className="flex items-center gap-1.5"><span className="w-5 border-t-[1.5px] border-dashed" style={{ borderColor: chrome[mode].inkMuted }} />Median</li>
        <li className="flex items-center gap-1.5"><span className="w-5 border-t-2" style={{ borderColor: chrome[mode].ink }} />This game{own.length ? '' : ' (today only; it launched before the winners list began)'}</li>
      </ul>
    </div>
  );
}

/**
 * Pace block for the prizes-left panel: prize-size switch, the call, one sentence, the
 * chart, and the statewide context that explains a run of "behind" calls.
 */
export function GamePaceBlock({ pace, data, bucket, onBucket }: {
  pace: GamePace; data: PaceData; bucket: BucketId; onBucket: (b: BucketId) => void;
}) {
  const options = BUCKETS.filter((b) => pace.buckets[b.id] && data.usableBuckets.includes(b.id));
  const active = pace.buckets[bucket] ? bucket : options[0]?.id;
  if (!active) return null;
  const e = pace.buckets[active]!;
  const m = data.market.buckets[active];
  return (
    <div className="mt-5 border-t border-secondary pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-md font-semibold text-primary">Pace since launch</h3>
        <PaceBadge entry={e} size="md" />
        <div className="flex-1" />
        <ButtonGroup size="sm" aria-label="Pace prize size" disallowEmptySelection selectedKeys={[active]}
          onSelectionChange={(k) => { const v = [...k][0]; if (v) onBucket(v as BucketId); }}>
          {options.map((b) => <ButtonGroupItem key={b.id} id={b.id} className="selected:bg-tertiary selected:text-primary">{b.label}</ButtonGroupItem>)}
        </ButtonGroup>
      </div>
      <p className="mt-2 text-sm text-secondary tabular">{paceSentence(pace, active, e)}</p>
      {isCompared(e.call) && <PaceChart pace={pace} bucket={active} data={data} />}
      {m && m.change !== null && (
        <p className="mt-2 text-xs text-secondary tabular">
          Statewide context: {fmtInt(m.recent)} listed claims in this prize size from {fmtDate(data.market.from)} to {fmtDate(data.market.to)},
          {' '}{m.change < 0 ? `${fmtPct(-m.change)} fewer` : `${fmtPct(m.change)} more`} than the same weeks a year earlier
          ({fmtInt(m.prior)}).{m.change < -0.05 && ' Prizes are being claimed more slowly statewide, so many games run behind the pace of earlier games.'}
        </p>
      )}
      <CaveatNote className="mt-2">{CAVEATS.pace}</CaveatNote>
    </div>
  );
}
