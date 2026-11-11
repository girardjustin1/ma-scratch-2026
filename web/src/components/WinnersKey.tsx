import { useState } from 'react';
import { Check, ChevronDown } from '@untitledui/icons';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { cx } from '@/utils/cx';
import { TOP_GAMES, type WinnerGrouping, type WinnerRow } from '../domain/winners';
import { CAVEATS } from '../lib/copy';
import { fmtCompactUsd, fmtInt } from '../lib/format';
import { TicketThumb } from './GamePicker';

export interface WinnersKeyProps {
  /** Rows per grouping, listed claims in the radius under every filter except that grouping's own. */
  rows: Record<WinnerGrouping, WinnerRow[]>;
  /** Row ids the map is filtered to, per grouping (empty = no filter). */
  active: Record<WinnerGrouping, string[]>;
  /** Click a row to filter the map to it; click again to clear. */
  onPick: (by: WinnerGrouping, id: string) => void;
  defaultOpen?: boolean;
}

const GROUPINGS: { id: WinnerGrouping; label: string }[] = [
  { id: 'price', label: 'Price' },
  { id: 'prize', label: 'Prize' },
  { id: 'game', label: 'Game' },
];

const NOTE: Record<WinnerGrouping, string> = {
  price: 'Listed claims by the price of the winning ticket.',
  prize: 'Listed claims by prize amount. Prizes of $600 or less are never listed.',
  game: `The ${TOP_GAMES} games with the most listed claims.`,
};

/**
 * Collapsible legend section: listed claims in the radius grouped by ticket price, prize
 * size or game. Bars are gray (the GUI is monochrome); each row filters the map.
 */
export function WinnersKey({ rows, active, onPick, defaultOpen = true }: WinnersKeyProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [by, setBy] = useState<WinnerGrouping>('price');
  const all = rows[by];
  const shown = by === 'game' ? all.slice(0, TOP_GAMES) : all;
  const rest = by === 'game' ? all.slice(TOP_GAMES) : [];
  const total = all.reduce((s, r) => s + r.claims, 0);
  const max = Math.max(1, ...shown.map((r) => r.claims));
  const filtered = active[by].length > 0;

  return (
    <div className="mt-3 border-t border-secondary pt-2">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-1 text-sm font-semibold text-primary outline-hidden">
        Winners by ticket <span className="font-normal text-tertiary tabular">· {fmtInt(total)}</span>
        <ChevronDown className={cx('ml-auto size-4 text-fg-quaternary transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="mt-2">
          <ButtonGroup size="sm" aria-label="Group winners by" className="flex w-full" disallowEmptySelection selectedKeys={[by]}
            onSelectionChange={(k) => { const v = [...k][0]; if (v) setBy(v as WinnerGrouping); }}>
            {GROUPINGS.map((g) => (
              <ButtonGroupItem key={g.id} id={g.id} className="flex-1 justify-center selected:bg-tertiary selected:text-primary">{g.label}</ButtonGroupItem>
            ))}
          </ButtonGroup>
          <p className="mt-1.5 text-[11px] leading-[1.4] text-tertiary">
            {NOTE[by]} In the radius, under your other filters · click a row to filter the map{filtered ? '; click again to clear' : ''}.
          </p>
          <ul className={cx('mt-1.5 flex flex-col', by === 'game' && 'max-h-72 overflow-y-auto')}>
            {shown.map((r) => {
              const on = active[by].includes(r.id);
              const dim = filtered && !on;
              const pickable = r.id !== 'unknown';
              return (
                <li key={r.id}>
                  <button type="button" disabled={!pickable} onClick={() => onPick(by, r.id)} aria-pressed={on}
                    title={on ? 'Clear this filter' : 'Filter the map to these'}
                    className={cx(
                      '-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 py-1 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
                      pickable && 'cursor-pointer hover:bg-primary_hover',
                      on && 'bg-secondary',
                    )}>
                    {by === 'game' && <TicketThumb src={r.image} className="h-6 w-12 rounded" />}
                    <span className={cx('min-w-0 flex-1', dim && 'opacity-50')}>
                      <span className="flex items-start gap-1">
                        <span className={cx('text-xs leading-[1.35] text-secondary', by === 'game' ? 'line-clamp-2' : 'truncate', on && 'font-semibold text-primary')}>
                          {r.label}
                          {by === 'game' && r.price != null && <span className="font-normal text-tertiary tabular"> · ${r.price}</span>}
                        </span>
                        {on && <Check className="mt-0.5 size-3 shrink-0 text-fg-secondary" aria-hidden />}
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-tertiary" aria-hidden>
                        <span className="block h-full rounded-full bg-fg-secondary" style={{ width: `${(r.claims / max) * 100}%` }} />
                      </span>
                    </span>
                    <span className={cx('w-14 shrink-0 text-right', dim && 'opacity-50')}>
                      <span className="block text-xs font-semibold text-primary tabular">{fmtInt(r.claims)}</span>
                      <span className="block text-[11px] text-tertiary tabular">{fmtCompactUsd(r.prizeTotal)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {rest.length > 0 && (
              <li className="pt-1 text-[11px] text-tertiary tabular">
                + {fmtInt(rest.length)} more games · {fmtInt(rest.reduce((s, r) => s + r.claims, 0))} listed claims
              </li>
            )}
            {total === 0 && <li className="py-1 text-xs text-tertiary">No listed claims in the radius with these filters.</li>}
          </ul>
          <p className="mt-1.5 text-[11px] leading-[1.4] text-tertiary">
            Number = listed claims; amount below = their prizes added up. {CAVEATS.volumeNotLuck}
          </p>
        </div>
      )}
    </div>
  );
}
