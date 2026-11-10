import { useMemo, useState } from 'react';
import {
  Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
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

const muted = (s: string) => <Typography variant="body2" color="text.secondary">{s}</Typography>;

function GameCell({ game }: { game: Game }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{game.name}</Typography>
        <Typography variant="caption">#{game.id.slice(1)}</Typography>
      </Box>
      {game.status === 'claims_only' && (
        <Chip size="small" variant="outlined" label={`Claims only${game.claimDeadline ? ` · until ${fmtDate(game.claimDeadline)}` : ''}`} />
      )}
    </Stack>
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

  const head = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
    <TableCell align={align} sortDirection={sort === key ? dir : false}>
      <TableSortLabel
        active={sort === key}
        direction={sort === key ? dir : 'desc'}
        onClick={() => (sort === key ? setDir(dir === 'asc' ? 'desc' : 'asc') : (setSort(key), setDir('desc')))}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );

  return (
    <Paper>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', px: 2, pt: 1.5, pb: 1, flexWrap: 'wrap' }} useFlexGap>
        <Typography variant="h2">Top {limit}</Typography>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)} aria-label="Table view">
          {VIEWS.map((v) => <ToggleButton key={v.value} value={v.value} title={v.hint}>{v.label}</ToggleButton>)}
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption">
          {fmtInt(shown)} of {fmtInt(total)} {unit} · prizes remaining as of {fmtDate(asOf)}
        </Typography>
      </Stack>
      <TableContainer sx={{ maxHeight: 560 }}>
        {view === 'prizes' ? (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell align="right">Prize</TableCell>
                <TableCell>Game</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Left of total</TableCell>
                <TableCell>Launched</TableCell>
                <TableCell>Most recent listed claim</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {prizes.slice(0, limit).map((r) => (
                <TableRow
                  key={`${r.game.id}-${r.tier.value}`} hover selected={r.game.id === selectedId}
                  onClick={() => onSelect?.(r.game.id)} sx={{ cursor: onSelect ? 'pointer' : 'default' }}
                >
                  <TableCell align="right" sx={{ fontWeight: 650 }}>
                    {fmtUsd(r.tier.value)}
                    {r.tier.isLaunchTopPrize && <Typography variant="caption" sx={{ display: 'block' }}>Original top prize</Typography>}
                  </TableCell>
                  <TableCell><GameCell game={r.game} /></TableCell>
                  <TableCell align="right">${r.game.price}</TableCell>
                  <TableCell align="right">{fmtInt(r.tier.remaining)} of {fmtInt(r.tier.total)}</TableCell>
                  <TableCell>{fmtDate(r.game.launchDate)}</TableCell>
                  <TableCell>{r.lastListed ? fmtDate(r.lastListed) : muted('None in coverage')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Game</TableCell>
                {head('price', 'Price', 'right')}
                {head('launchDate', 'Launched')}
                <TableCell align="right">Original top prize</TableCell>
                <TableCell align="right">Top prizes left</TableCell>
                {head('largestUnclaimed', 'Largest unclaimed', 'right')}
                {head('lastListed', 'Most recent listed claim')}
              </TableRow>
            </TableHead>
            <TableBody>
              {gameRows.slice(0, limit).map((r) => (
                <TableRow
                  key={r.game.id} hover selected={r.game.id === selectedId}
                  onClick={() => onSelect?.(r.game.id)} sx={{ cursor: onSelect ? 'pointer' : 'default' }}
                >
                  <TableCell><GameCell game={r.game} /></TableCell>
                  <TableCell align="right">${r.game.price}</TableCell>
                  <TableCell>{fmtDate(r.game.launchDate)}</TableCell>
                  <TableCell align="right">{fmtUsd(r.game.originalTopPrize)}</TableCell>
                  <TableCell align="right">{r.topRemaining} of {r.topTotal}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 650 }}>{fmtUsd(r.largestUnclaimed)}</TableCell>
                  <TableCell>{r.lastListed ? fmtDate(r.lastListed) : muted('None in coverage')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>
    </Paper>
  );
}
