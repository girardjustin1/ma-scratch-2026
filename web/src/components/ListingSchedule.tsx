import { useEffect, useMemo, useRef } from 'react';
import * as Plot from '@observablehq/plot';
import { Box, Paper, Typography, useTheme } from '@mui/material';
import type { Claim } from '../domain/types';
import { fmtInt, fmtPct } from '../lib/format';
import { chrome, ramps, type Mode } from '../theme/tokens';
import { CaveatNote } from './Basics';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function weekdayCounts(claims: Claim[]) {
  const n = [0, 0, 0, 0, 0, 0, 0];
  for (const c of claims) {
    const [y, m, d] = c.listedDate.split('-').map(Number);
    n[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7] += 1; // Monday first
  }
  const total = n.reduce((a, b) => a + b, 0);
  return DAYS.map((day, i) => ({ day, n: n[i], share: total ? n[i] / total : 0 }));
}

/**
 * Descriptive only: listed claims by weekday. The listed date follows the Lottery's claim
 * processing, so this shows the listing schedule, not when anyone bought or played.
 * Deliberately no significance test.
 */
export function ListingSchedule({ claims, source }: { claims: Claim[]; source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mode = useTheme().palette.mode as Mode;
  const rows = useMemo(() => weekdayCounts(claims), [claims]);
  const total = rows.reduce((a, r) => a + r.n, 0);

  useEffect(() => {
    const c = chrome[mode];
    const plot = Plot.plot({
      width: 560,
      height: 220,
      marginLeft: 48,
      marginTop: 18,
      style: { background: 'transparent', color: c.inkSecondary, fontSize: '11px', fontFamily: 'inherit' },
      x: { domain: DAYS, label: null, padding: 0.25 },
      y: { label: null, grid: true, tickFormat: '~s' },
      marks: [
        Plot.ruleY([0], { stroke: c.axis }),
        Plot.barY(rows, {
          x: 'day', y: 'n', fill: ramps.claims[mode][2], rx: 4,
          channels: { Share: (r: { share: number }) => fmtPct(r.share, 1) },
          tip: { format: { x: true, y: (v: number) => fmtInt(v) } },
        }),
        Plot.text(rows, {
          x: 'day', y: 'n', text: (r: { share: number }) => fmtPct(r.share, 0), dy: -8, fill: c.inkSecondary,
        }),
      ],
    });
    ref.current?.replaceChildren(plot);
    return () => plot.remove();
  }, [rows, mode]);

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="h3">Lottery listing schedule</Typography>
      <Typography variant="caption" sx={{ display: 'block' }}>
        Listed claims by weekday · {fmtInt(total)} claims · {source}
      </Typography>
      <Box ref={ref} sx={{ my: 1 }} />
      <CaveatNote dense>
        Listed dates follow when the Lottery processes claims, not when tickets were bought or played. Weekend listings
        are small because only prizes up to $5,000 can be cashed in the Lottery app. This chart is descriptive; no test is
        run on it.
      </CaveatNote>
    </Paper>
  );
}
