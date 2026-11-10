import { AlertTriangle, Globe01 } from '@untitledui/icons';
import { Table, TableCard } from '@/components/application/table/table';
import { BadgeWithIcon } from '@/components/base/badges/badges';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import { useState } from 'react';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Toggle } from '@/components/base/toggle/toggle';
import { estimateEv } from '../domain/ev';
import type { Game, LegacyEv, PrizeTier } from '../domain/types';
import { CAVEATS } from '../lib/copy';
import { fmtCompactUsd, fmtDate, fmtSignedUsdCents } from '../lib/format';
import { Card } from './Basics';

const LIMITS = [
  'Claims lag sales, so prizes remaining overstates what is still unsold.',
  'Sold-but-unscratched and never-claimed tickets distort the estimate.',
  'Tickets printed is approximate.',
  'Games can close early.',
  'Annuity prizes use the advertised value, not the cash value.',
  'Taxes are excluded.',
];

export interface EvPanelProps {
  games: Game[];
  tiers: PrizeTier[];
  legacy: LegacyEv[];
  asOf: string;
}

const RIGHT_HEAD = '[&>div]:justify-end text-right';
const RIGHT = 'text-right tabular';
/** Divider that keeps the archived Wayback estimate visibly apart from the current one. */
const LEGACY = 'border-l border-secondary';

type EvSort = 'price' | 'payback' | 'paybackEx';
const payback = (ev: { evAll: number } | null, price: number) => (ev ? (ev.evAll + price) / price : -Infinity);
const paybackEx = (ev: { evExJackpot: number } | null, price: number) => (ev ? (ev.evExJackpot + price) / price : -Infinity);
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Statewide EV. Deliberately takes no map filters as props. */
export function EvPanel({ games, tiers, legacy, asOf }: EvPanelProps) {
  const [sort, setSort] = useState<EvSort>('payback');
  const [positiveOnly, setPositiveOnly] = useState(false);
  const legacyBy = new Map(legacy.map((l) => [l.gameId, l]));
  const all = games.map((g) => ({ g, ev: estimateEv(g, tiers), legacy: legacyBy.get(g.id) }));
  const positives = all.filter((r) => r.ev?.checkInputs).length;
  const rows = all
    .filter((r) => !positiveOnly || r.ev?.checkInputs)
    .sort((a, b) =>
      sort === 'price' ? a.g.price - b.g.price || a.g.name.localeCompare(b.g.name)
      : sort === 'payback' ? payback(b.ev, b.g.price) - payback(a.ev, a.g.price)
      : paybackEx(b.ev, b.g.price) - paybackEx(a.ev, a.g.price));
  const median = (() => {
    const v = all.filter((r) => r.ev).map((r) => payback(r.ev, r.g.price)).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  })();
  return (
    <div className="flex flex-col gap-4">
      {/* Monochrome banner: the icon and bold words carry it, not color. */}
      <div role="note" className="flex items-center gap-3 rounded-xl bg-secondary px-4 py-3 ring-1 ring-secondary ring-inset">
        <Globe01 className="size-5 shrink-0 text-fg-secondary" aria-hidden />
        <p className="text-sm font-semibold text-primary">{CAVEATS.evBanner}</p>
      </div>
      <TableCard.Root size="sm">
        <TableCard.Header
          title="Statewide expected value"
          description={`Prizes remaining as of ${fmtDate(asOf)} · ${all.length} games${median !== null ? ` · median estimated payback ${pct(median)} per $1` : ''} · map filters do not apply here`}
          contentTrailing={
            <div className="flex flex-wrap items-center gap-3">
              <ButtonGroup size="sm" aria-label="Sort" disallowEmptySelection selectedKeys={[sort]}
                onSelectionChange={(k) => { const v = [...k][0]; if (v) setSort(v as EvSort); }}>
                <ButtonGroupItem id="payback" className="selected:bg-tertiary selected:text-primary">Best payback</ButtonGroupItem>
                <ButtonGroupItem id="paybackEx" className="selected:bg-tertiary selected:text-primary">Best excl. jackpot</ButtonGroupItem>
                <ButtonGroupItem id="price" className="selected:bg-tertiary selected:text-primary">Price</ButtonGroupItem>
              </ButtonGroup>
              <Toggle size="sm" label={`+EV estimates only · ${positives}`} isSelected={positiveOnly} onChange={setPositiveOnly} />
            </div>
          }
        />
        {positiveOnly && (
          <div className="flex items-start gap-2 border-b border-secondary bg-secondary px-4 py-2.5 text-xs text-secondary">
            <AlertTriangle className="mt-px size-4 shrink-0 text-fg-secondary" aria-hidden />
            Every positive estimate is flagged “Check inputs”. They usually come from games that are nearly sold out with a few
            large prizes still listed, or from tickets-printed estimates. Compare the “excl. original jackpot” column.
          </div>
        )}
        <div className="[&>div]:max-h-140 [&>div]:overflow-y-auto">
          <Table aria-label="Statewide expected value by game">
            <Table.Header className="sticky top-0 z-10">
              <Table.Head id="game" label="Game" isRowHeader />
              <Table.Head id="price" label="Price" className={RIGHT_HEAD} />
              <Table.Head id="tickets" label="Est. tickets remaining" className={RIGHT_HEAD} />
              <Table.Head id="payback" label="Est. payback per $1" className={RIGHT_HEAD} />
              <Table.Head id="evAll" label="Net EV, all prizes" className={RIGHT_HEAD} />
              <Table.Head id="evEx" label="Net EV, excl. original jackpot" className={RIGHT_HEAD} />
              <Table.Head id="legacy" label="Earlier estimate (Wayback)" className={cx(RIGHT_HEAD, LEGACY)} />
            </Table.Header>
            <Table.Body>
              {rows.map(({ g, ev, legacy: l }) => (
                <Table.Row key={g.id} id={g.id}>
                  <Table.Cell className="font-medium text-primary">{g.name}</Table.Cell>
                  <Table.Cell className={RIGHT}>${g.price}</Table.Cell>
                  <Table.Cell className={RIGHT}>
                    {ev ? (
                      <Tooltip title={`Range from the two lowest prize tiers: ${fmtCompactUsd(ev.ticketsRemainingLow).slice(1)} – ${fmtCompactUsd(ev.ticketsRemainingHigh).slice(1)}`}>
                        <TooltipTrigger className="ml-auto cursor-help underline decoration-dotted decoration-fg-quaternary underline-offset-4">
                          {fmtCompactUsd(ev.ticketsRemaining).slice(1)}
                        </TooltipTrigger>
                      </Tooltip>
                    ) : '—'}
                  </Table.Cell>
                  <Table.Cell className={cx(RIGHT, 'font-semibold text-primary')}>
                    {ev ? pct(payback(ev, g.price)) : '—'}
                    {ev && <span className="block text-xs font-normal text-quaternary">{pct(paybackEx(ev, g.price))} excl. jackpot</span>}
                  </Table.Cell>
                  <Table.Cell className={RIGHT}>
                    {ev ? (
                      <div className="flex items-center justify-end gap-1.5">
                        {ev.checkInputs && (
                          <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={AlertTriangle} className="whitespace-nowrap">
                            Check inputs
                          </BadgeWithIcon>
                        )}
                        <span>{fmtSignedUsdCents(ev.evAll)}</span>
                      </div>
                    ) : '—'}
                  </Table.Cell>
                  <Table.Cell className={RIGHT}>{ev ? fmtSignedUsdCents(ev.evExJackpot) : '—'}</Table.Cell>
                  <Table.Cell className={cx(RIGHT, LEGACY)}>
                    {l ? (
                      <Tooltip title={`${l.methodNote}. Computed from an archived full prize table; kept separate from the current estimate.`}>
                        <TooltipTrigger className="ml-auto cursor-help text-right">
                          <span className="block">{fmtSignedUsdCents(l.evAll)}</span>
                          <span className="block text-xs text-quaternary">as of {fmtDate(l.asOf)}</span>
                        </TooltipTrigger>
                      </Tooltip>
                    ) : <span className="text-quaternary">None</span>}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </TableCard.Root>
      <Card className="p-4">
        <h3 className="mb-2 text-md font-semibold text-primary">Limitations</h3>
        <ul className="m-0 list-disc pl-5 text-sm leading-[1.7] text-tertiary">
          {LIMITS.map((x) => <li key={x}>{x}</li>)}
          <li>A positive estimate is flagged "Check inputs". It is not presented as an opportunity.</li>
        </ul>
      </Card>
    </div>
  );
}
