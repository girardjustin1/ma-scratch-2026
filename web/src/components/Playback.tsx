import { useEffect, useMemo, useState } from 'react';
import { ClockRewind, PauseCircle, PlayCircle, SkipBack, SkipForward } from '@untitledui/icons';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Button } from '@/components/base/buttons/button';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { CloseButton } from '@/components/base/buttons/close-button';
import { Slider } from '@/components/base/slider/slider';
import { addDays, fmtDate } from '../lib/format';
import { Card } from './Basics';

export type PlayMode = 'grow' | 'window';

/** Days in the moving window of the "Last 30 days" mode. */
export const WINDOW_DAYS = 30;
/** One frame per listed day; a tick every TICK_MS advances SPEEDS[speed] days. */
const TICK_MS = 100;
const SPEEDS = { '1': 1, '2': 3, '4': 7 } as const;

/** Daily frames across [from, to]. */
export function frames(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export interface PlaybackProps {
  from: string;
  to: string;
  /** Current frame's end date, or null when playback is off (the map shows the full range). */
  value: string | null;
  onChange: (date: string | null) => void;
  mode: PlayMode;
  onMode: (m: PlayMode) => void;
}

/**
 * Play the selected listed-date range week by week. "Grow" accumulates listed claims up to
 * each week; "Last 30 days" shows a moving window. Listed dates only, never sale dates.
 */
export function Playback({ from, to, value, onChange, mode, onMode }: PlaybackProps) {
  const list = useMemo(() => frames(from, to), [from, to]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<keyof typeof SPEEDS>('1');
  const idx = value ? Math.max(0, list.findIndex((d) => d >= value)) : list.length - 1;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const next = Math.min(list.length - 1, idx + SPEEDS[speed]);
      onChange(list[next]);
      if (next >= list.length - 1) setPlaying(false);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [playing, idx, list, speed, onChange]);

  if (value === null) {
    return (
      <Card className="p-1.5">
        <Button size="sm" color="tertiary" iconLeading={ClockRewind} onClick={() => { onChange(list[0]); setPlaying(true); }}>
          Play over time
        </Button>
      </Card>
    );
  }

  const go = (i: number) => onChange(list[Math.min(list.length - 1, Math.max(0, i))]);
  const windowFrom = addDays(value, -(WINDOW_DAYS - 1));
  return (
    <Card className="w-[400px] p-3">
      <div className="flex items-center gap-1">
        <ButtonUtility size="xs" color="tertiary" icon={SkipBack} tooltip="Back a week" onClick={() => { setPlaying(false); go(idx - 7); }} />
        <ButtonUtility size="sm" color="secondary" icon={playing ? PauseCircle : PlayCircle} tooltip={playing ? 'Pause' : 'Play'}
          onClick={() => { if (!playing && idx >= list.length - 1) go(0); setPlaying(!playing); }} />
        <ButtonUtility size="xs" color="tertiary" icon={SkipForward} tooltip="Forward a week" onClick={() => { setPlaying(false); go(idx + 7); }} />
        <div className="ml-2 min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-primary tabular">
            {mode === 'grow' ? `Through ${fmtDate(value)}` : `${fmtDate(windowFrom < from ? from : windowFrom)} – ${fmtDate(value)}`}
          </p>
          <p className="text-xs text-tertiary tabular">Day {idx + 1} of {list.length} · listed dates</p>
        </div>
        <CloseButton size="sm" slot={null} onPress={() => { setPlaying(false); onChange(null); }} />
      </div>
      <div className="mt-2 px-1">
        <Slider minValue={0} maxValue={list.length - 1} step={1} value={idx} aria-label="Playback week"
          onChange={(v) => { setPlaying(false); go(v as number); }} labelFormatter={(v) => fmtDate(list[v] ?? to)} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ButtonGroup size="sm" aria-label="Playback mode" disallowEmptySelection selectedKeys={[mode]}
          onSelectionChange={(k) => { const v = [...k][0]; if (v) onMode(v as PlayMode); }}>
          <ButtonGroupItem id="grow" className="selected:bg-tertiary selected:text-primary">Grow</ButtonGroupItem>
          <ButtonGroupItem id="window" className="selected:bg-tertiary selected:text-primary">Last 30 days</ButtonGroupItem>
        </ButtonGroup>
        <ButtonGroup size="sm" aria-label="Speed" disallowEmptySelection selectedKeys={[speed]}
          onSelectionChange={(k) => { const v = [...k][0]; if (v) setSpeed(v as keyof typeof SPEEDS); }}>
          {Object.keys(SPEEDS).map((s) => <ButtonGroupItem key={s} id={s} className="selected:bg-tertiary selected:text-primary">{s}×</ButtonGroupItem>)}
        </ButtonGroup>
      </div>
      <p className="mt-2 text-xs leading-[1.45] text-tertiary">
        Each store is its own bubble while playing. It appears at its first listed claim and grows with its running
        total; colors follow the legend’s classes. Tract colors stay on the full range. Close to return.
      </p>
    </Card>
  );
}
