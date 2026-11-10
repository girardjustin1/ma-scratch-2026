import { AlertTriangle, Globe01 } from '@untitledui/icons';
import { Table, TableCard } from '@/components/application/table/table';
import { BadgeWithIcon } from '@/components/base/badges/badges';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
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

/** Statewide EV. Deliberately takes no map filters as props. */
export function EvPanel({ games, tiers, legacy, asOf }: EvPanelProps) {
  const legacyBy = new Map(legacy.map((l) => [l.gameId, l]));
  const rows = games
    .map((g) => ({ g, ev: estimateEv(g, tiers), legacy: legacyBy.get(g.id) }))
    .sort((a, b) => a.g.price - b.g.price || a.g.name.localeCompare(b.g.name));
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
          description={`Prizes remaining as of ${fmtDate(asOf)} · map filters do not apply here`}
        />
        <div className="[&>div]:max-h-140 [&>div]:overflow-y-auto">
          <Table aria-label="Statewide expected value by game">
            <Table.Header className="sticky top-0 z-10">
              <Table.Head id="game" label="Game" isRowHeader />
              <Table.Head id="price" label="Price" className={RIGHT_HEAD} />
              <Table.Head id="tickets" label="Est. tickets remaining" className={RIGHT_HEAD} />
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
