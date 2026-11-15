import { useEffect, useMemo, useRef, useState } from 'react';
import * as Plot from '@observablehq/plot';
import type { Claim } from '../domain/types';
import { LABELS } from '../lib/copy';
import { fmtInt, fmtShortDate } from '../lib/format';
import { chrome } from '../theme/tokens';
import { useMode } from '../theme/mode';

export interface WinnerTimelineProps {
  claims: Claim[];
  from: string;
  to: string;
  covered: { from: string; to: string }[];
  /** Fallback width before the container is measured; the chart fills its container. */
  width?: number;
  height?: number;
}

/** Prizes at or above this get their own dot; everything else is only counted in the bars. */
export const BIG_PRIZE = 10_000;

const d = (iso: string) => new Date(iso + 'T00:00:00Z');

function gaps(from: string, to: string, covered: { from: string; to: string }[]) {
  const out: { from: Date; to: Date }[] = [];
  let cursor = from;
  for (const c of [...covered].sort((a, b) => (a.from < b.from ? -1 : 1))) {
    if (c.from > cursor) out.push({ from: d(cursor), to: d(c.from) });
    if (c.to > cursor) cursor = c.to;
  }
  if (cursor < to) out.push({ from: d(cursor), to: d(to) });
  return out;
}

/**
 * Listed claims for one game over time: weekly bars count every listed claim, and a dot row
 * above marks each prize of $10,000 and up, sized by prize. Only the [from, to] window is
 * drawn (clipped). Grey bands = no coverage, so blank ≠ zero. Greyscale by the owner's rule.
 */
export function WinnerTimeline({ claims, from, to, covered, width = 640, height = 150 }: WinnerTimelineProps) {
  const dotsRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(width);
  const mode = useMode();
  const inWindow = useMemo(() => claims.filter((k) => k.listedDate >= from && k.listedDate <= to), [claims, from, to]);
  const big = useMemo(() => inWindow.filter((k) => k.prizeAmount >= BIG_PRIZE), [inWindow]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = chrome[mode];
    const x = { type: 'utc' as const, domain: [d(from), d(to)], label: null, grid: false };
    const bands = gaps(from, to, covered);
    const common = { width: w, marginLeft: 36, marginRight: 12, style: { background: 'transparent', color: c.inkSecondary, fontSize: '11px', fontFamily: 'inherit' } };
    const dots = Plot.plot({
      ...common,
      height: 44,
      marginTop: 6,
      marginBottom: 6,
      x: { ...x, axis: null },
      y: { axis: null, domain: [0, 1] },
      r: { type: 'sqrt', domain: [BIG_PRIZE, Math.max(BIG_PRIZE * 10, ...big.map((k) => k.prizeAmount))], range: [4, 14] },
      marks: [
        Plot.rectX(bands, { x1: 'from', x2: 'to', y1: 0, y2: 1, fill: c.grid, fillOpacity: 0.9 }),
        Plot.ruleY([0.5], { stroke: c.axis }),
        Plot.dot(big, {
          x: (k: Claim) => d(k.listedDate), y: 0.5, r: 'prizeAmount', clip: true,
          fill: c.inkSecondary, fillOpacity: 0.7,
          // Ring in the card's own background so overlapping dots stay separable.
          stroke: 'var(--color-bg-primary)', strokeWidth: 1.5,
          channels: { [LABELS.listedDate]: (k: Claim) => k.listedDate, Prize: (k: Claim) => `$${k.prizeAmount.toLocaleString()}` },
          tip: { format: { x: false, y: false, r: false } },
        }),
      ],
    });
    const bars = Plot.plot({
      ...common,
      height,
      marginTop: 8,
      marginBottom: 28,
      x,
      y: { grid: true, label: null, ticks: 3, tickFormat: (v: number) => fmtInt(v) },
      marks: [
        Plot.rectX(bands, { x1: 'from', x2: 'to', fill: c.grid, fillOpacity: 0.9 }), // full height
        Plot.rectY(inWindow, {
          ...Plot.binX(
            { y: 'count', title: (g: Claim[]) => {
              const ds = g.map((k) => k.listedDate).sort();
              return `${fmtShortDate(ds[0])} – ${fmtShortDate(ds[ds.length - 1])}\n${fmtInt(g.length)} listed claims`;
            } },
            { x: (k: Claim) => d(k.listedDate), interval: 'monday' }, // Monday–Sunday weeks, like the reports
          ),
          fill: c.inkMuted, insetLeft: 1, insetRight: 1, clip: true, tip: true,
        }),
        Plot.ruleY([0], { stroke: c.axis }),
      ],
    });
    dotsRef.current?.replaceChildren(dots);
    barsRef.current?.replaceChildren(bars);
    return () => { dots.remove(); bars.remove(); };
  }, [inWindow, big, from, to, covered, w, height, mode]);

  return (
    <div ref={boxRef} className="mt-2 w-full">
      <p className="text-xs text-tertiary tabular">Prizes of $10,000 and up · {fmtInt(big.length)}</p>
      <div ref={dotsRef} />
      <p className="mt-1 text-xs text-tertiary tabular">Listed claims per week · {fmtInt(inWindow.length)} in all</p>
      <div ref={barsRef} />
    </div>
  );
}
