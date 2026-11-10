import { useMemo, useState } from 'react';
import type { SortDescriptor } from 'react-aria-components';
import { Table, TableCard } from '@/components/application/table/table';
import { Badge } from '@/components/base/badges/badges';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { cx } from '@/utils/cx';
import type { Claim, Game, PrizeTier } from '../domain/types';
import { fmtDate, fmtInt, fmtUsd } from '../lib/format';

export interface GameRow {
  game: Game;
  topTotal: number;
  topRemaining: number;
  largestUnclaimed: number;
  lastListed: string | null;
}

export interface PrizeRow {
  game: Game;
  tier: PrizeTier;
  lastListed: string | null;
}

export type GamesView = 'open' | 'prizes' | 'withClaimsOnly';

const lastListedBy = (claims: Claim[]) => {
  const m = new Map<string, string>();
  for (const c of claims) if (!m.has(c.gameId) || c.listedDate > m.get(c.gameId)!) m.set(c.gameId, c.listedDate);
  return m;
};

/** One row per game that is on sale or still claimable. */
export function buildGameRows(games: Game[], tiers: PrizeTier[], claims: Claim[]): GameRow[] {
  const last = lastListedBy(claims);
  return games
    .filter((g) => g.status !== 'closed')
    .map((game) => {
      const t = tiers.filter((x) => x.gameId === game.id);
      const top = t.find((x) => x.isLaunchTopPrize);
      const unclaimed = t.filter((x) => x.remaining > 0).map((x) => x.value);
      return {
        game,
        topTotal: top?.total ?? 0,
        topRemaining: top?.remaining ?? 0,
        largestUnclaimed: unclaimed.length ? Math.max(...unclaimed) : 0,
        lastListed: last.get(game.id) ?? null,
      };
    });
}

/** One row per unclaimed prize tier of a game on sale. */
export function buildPrizeRows(games: Game[], tiers: PrizeTier[], claims: Claim[]): PrizeRow[] {
  const last = lastListedBy(claims);
  const open = new Map(games.filter((g) => g.status === 'open').map((g) => [g.id, g]));
  return tiers
    .filter((t) => t.remaining > 0 && open.has(t.gameId))
    .map((tier) => ({ game: open.get(tier.gameId)!, tier, lastListed: last.get(tier.gameId) ?? null }));
}

type SortKey = 'largestUnclaimed' | 'price' | 'launchDate' | 'lastListed';

export interface OpenGamesTableProps {
  rows: GameRow[];
  prizeRows?: PrizeRow[];
  asOf: string;
  selectedId?: string;
  onSelect?: (gameId: string) => void;
  limit?: number;
  initialView?: GamesView;
}

const VIEWS: { value: GamesView; label: string; hint: string }[] = [
  { value: 'open', label: 'Open games', hint: 'One row per game on sale, ranked by its largest unclaimed prize' },
  { value: 'prizes', label: 'Largest prizes', hint: 'One row per unclaimed prize tier across games on sale' },
  { value: 'withClaimsOnly', label: 'With claims-only', hint: 'Games on sale plus games no longer sold whose prizes can still be claimed' },
];

const muted = (s: string) => <span className="text-quaternary">{s}</span>;

/** Right-aligns a header (its label sits in a flex group) or a cell. */
const RIGHT_HEAD = '[&>div]:justify-end text-right';
const RIGHT = 'text-right tabular';

function GameCell({ game }: { game: Game }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">{game.name}</p>
        <p className="text-xs text-tertiary tabular">#{game.id.slice(1)}</p>
      </div>
      {game.status === 'claims_only' && (
        <Badge type="modern" size="sm" color="gray" className="whitespace-nowrap">
          {`Claims only${game.claimDeadline ? ` · until ${fmtDate(game.claimDeadline)}` : ''}`}
        </Badge>
      )}
    </div>
  );
}

export function OpenGamesTable({ rows, prizeRows = [], asOf, selectedId, onSelect, limit = 100, initialView = 'open' }: OpenGamesTableProps) {
  const [view, setView] = useState<GamesView>(initialView);
  const [sort, setSort] = useState<SortKey>('largestUnclaimed');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const gameRows = useMemo(() => {
    const scoped = rows.filter((r) => (view === 'withClaimsOnly' ? true : r.game.status === 'open'));
    const val = (r: GameRow) =>
      sort === 'price' ? r.game.price : sort === 'launchDate' ? r.game.launchDate : sort === 'lastListed' ? (r.lastListed ?? '') : r.largestUnclaimed;
    return scoped.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (dir === 'asc' ? 1 : -1));
  }, [rows, view, sort, dir]);

  const prizes = useMemo(
    () => [...prizeRows].sort((a, b) => b.tier.value - a.tier.value || b.tier.remaining - a.tier.remaining),
    [prizeRows],
  );

  const total = view === 'prizes' ? prizes.length : gameRows.length;
  const shown = Math.min(limit, total);
  const unit = view === 'prizes' ? 'unclaimed prize tiers' : view === 'open' ? 'open games' : 'games on sale or claims-only';

  // A new column starts descending; the same column flips direction (as before).
  const sortDescriptor: SortDescriptor = { column: sort, direction: dir === 'asc' ? 'ascending' : 'descending' };
  const onSortChange = (d: SortDescriptor) => {
    if (d.column !== sort) {
      setSort(d.column as SortKey);
      setDir('desc');
    } else setDir(dir === 'asc' ? 'desc' : 'asc');
  };

  const rowProps = (gameId: string) => ({
    onAction: onSelect ? () => onSelect(gameId) : undefined,
    className: cx(
      // Selected: shaded row plus a dark bar on its leading edge, so it reads apart from hover.
      gameId === selectedId && 'bg-secondary [&>td:first-child]:shadow-[inset_3px_0_0_0_var(--color-border-brand)]',
      onSelect ? 'cursor-pointer' : 'cursor-default',
    ),
  });

  return (
    <TableCard.Root size="sm">
      <TableCard.Header
        title={`Top ${limit}`}
        description={`${fmtInt(shown)} of ${fmtInt(total)} ${unit} · prizes remaining as of ${fmtDate(asOf)}`}
        contentTrailing={
          <ButtonGroup
            size="sm"
            aria-label="Table view"
            disallowEmptySelection
            selectedKeys={new Set([view])}
            onSelectionChange={(keys) => {
              const k = [...keys][0];
              if (k) setView(k as GamesView);
            }}
          >
            {VIEWS.map((v) => (
              <ButtonGroupItem key={v.value} id={v.value}>
                <span title={v.hint}>{v.label}</span>
              </ButtonGroupItem>
            ))}
          </ButtonGroup>
        }
      />
      {/* Scroll inside the card so the sticky header stays in view (Table wraps itself in an overflow div). */}
      <div className="[&>div]:max-h-140 [&>div]:overflow-y-auto">
        {view === 'prizes' ? (
          <Table key="prizes" aria-label="Largest unclaimed prizes in games on sale">
            <Table.Header className="sticky top-0 z-10">
              <Table.Head id="prize" label="Prize" isRowHeader className={RIGHT_HEAD} />
              <Table.Head id="game" label="Game" />
              <Table.Head id="price" label="Price" className={RIGHT_HEAD} />
              <Table.Head id="left" label="Left of total" className={RIGHT_HEAD} />
              <Table.Head id="launched" label="Launched" />
              <Table.Head id="lastListed" label="Most recent listed claim" />
            </Table.Header>
            <Table.Body>
              {prizes.slice(0, limit).map((r) => {
                const id = `${r.game.id}-${r.tier.value}`;
                return (
                  <Table.Row key={id} id={id} {...rowProps(r.game.id)}>
                    <Table.Cell className={cx(RIGHT, 'font-semibold text-primary')}>
                      {fmtUsd(r.tier.value)}
                      {r.tier.isLaunchTopPrize && <span className="block text-xs font-normal text-tertiary">Original top prize</span>}
                    </Table.Cell>
                    <Table.Cell><GameCell game={r.game} /></Table.Cell>
                    <Table.Cell className={RIGHT}>${r.game.price}</Table.Cell>
                    <Table.Cell className={RIGHT}>{fmtInt(r.tier.remaining)} of {fmtInt(r.tier.total)}</Table.Cell>
                    <Table.Cell className="whitespace-nowrap tabular">{fmtDate(r.game.launchDate)}</Table.Cell>
                    <Table.Cell className="whitespace-nowrap tabular">{r.lastListed ? fmtDate(r.lastListed) : muted('None in coverage')}</Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        ) : (
          <Table key="games" aria-label="Games by largest unclaimed prize" sortDescriptor={sortDescriptor} onSortChange={onSortChange}>
            <Table.Header className="sticky top-0 z-10">
              <Table.Head id="game" label="Game" isRowHeader />
              <Table.Head id="price" label="Price" allowsSorting className={RIGHT_HEAD} />
              <Table.Head id="launchDate" label="Launched" allowsSorting />
              <Table.Head id="originalTop" label="Original top prize" className={RIGHT_HEAD} />
              <Table.Head id="topLeft" label="Top prizes left" className={RIGHT_HEAD} />
              <Table.Head id="largestUnclaimed" label="Largest unclaimed" allowsSorting className={RIGHT_HEAD} />
              <Table.Head id="lastListed" label="Most recent listed claim" allowsSorting />
            </Table.Header>
            <Table.Body>
              {gameRows.slice(0, limit).map((r) => (
                <Table.Row key={r.game.id} id={r.game.id} {...rowProps(r.game.id)}>
                  <Table.Cell><GameCell game={r.game} /></Table.Cell>
                  <Table.Cell className={RIGHT}>${r.game.price}</Table.Cell>
                  <Table.Cell className="whitespace-nowrap tabular">{fmtDate(r.game.launchDate)}</Table.Cell>
                  <Table.Cell className={RIGHT}>{fmtUsd(r.game.originalTopPrize)}</Table.Cell>
                  <Table.Cell className={RIGHT}>{r.topRemaining} of {r.topTotal}</Table.Cell>
                  <Table.Cell className={cx(RIGHT, 'font-semibold text-primary')}>{fmtUsd(r.largestUnclaimed)}</Table.Cell>
                  <Table.Cell className="whitespace-nowrap tabular">{r.lastListed ? fmtDate(r.lastListed) : muted('None in coverage')}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </div>
    </TableCard.Root>
  );
}
