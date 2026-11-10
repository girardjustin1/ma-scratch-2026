import { useEffect, useMemo, useRef } from 'react';
import * as Plot from '@observablehq/plot';
import type { Claim } from '../domain/types';
import { fmtInt, fmtPct } from '../lib/format';
import { chrome } from '../theme/tokens';
import { useMode } from '../theme/mode';
import { Card, CaveatNote } from './Basics';

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
  const mode = useMode();
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
          x: 'day', y: 'n', fill: c.inkMuted, rx: 4, // greyscale: the bars carry no color meaning
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
    <Card className="h-full p-4">
      <h3 className="text-md font-semibold text-primary">Lottery listing schedule</h3>
      <p className="text-xs text-tertiary">
        Listed claims by weekday · {fmtInt(total)} claims · {source}
      </p>
      <div ref={ref} className="my-2" />
      <CaveatNote dense>
        Listed dates follow when the Lottery processes claims, not when tickets were bought or played. Weekend listings
        are small because only prizes up to $5,000 can be cashed in the Lottery app. This chart is descriptive; no test is
        run on it.
      </CaveatNote>
    </Card>
  );
}
