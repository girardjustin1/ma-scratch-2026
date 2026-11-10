import { useEffect, useRef } from 'react';
import * as Plot from '@observablehq/plot';
import { Box, useTheme } from '@mui/material';
import type { Claim } from '../domain/types';
import { LABELS } from '../lib/copy';
import { chrome, ramps, type Mode } from '../theme/tokens';

export interface WinnerTimelineProps {
  claims: Claim[];
  from: string;
  to: string;
  covered: { from: string; to: string }[];
  width?: number;
  height?: number;
}

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

/** Listed claims for one game over time. Grey bands = no coverage, so blank ≠ zero. */
export function WinnerTimeline({ claims, from, to, covered, width = 640, height = 150 }: WinnerTimelineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mode = useTheme().palette.mode as Mode;
  useEffect(() => {
    const c = chrome[mode];
    const plot = Plot.plot({
      width,
      height,
      marginLeft: 8,
      marginRight: 8,
      marginBottom: 28,
      style: { background: 'transparent', color: c.inkSecondary, fontSize: '11px', fontFamily: 'inherit' },
      x: { type: 'utc', domain: [d(from), d(to)], label: null, grid: false },
      y: { axis: null, domain: [0, 1] },
      r: { type: 'sqrt', range: [3, 14] },
      marks: [
        Plot.rectX(gaps(from, to, covered), {
          x1: 'from', x2: 'to', y1: 0, y2: 1, fill: c.grid, fillOpacity: 0.9,
        }),
        Plot.ruleY([0.5], { stroke: c.axis }),
        Plot.dot(claims, {
          x: (k: Claim) => d(k.listedDate),
          y: 0.5,
          r: 'prizeAmount',
          fill: ramps.claims[mode][2],
          fillOpacity: 0.75,
          stroke: c.surface,
          strokeWidth: 1.5,
          channels: { [LABELS.listedDate]: (k: Claim) => k.listedDate, Prize: (k: Claim) => `$${k.prizeAmount.toLocaleString()}` },
          tip: { format: { x: false, y: false, r: false } },
        }),
      ],
    });
    ref.current?.replaceChildren(plot);
    return () => plot.remove();
  }, [claims, from, to, covered, width, height, mode]);
  return <Box ref={ref} sx={{ '& svg': { overflow: 'visible' } }} />;
}
