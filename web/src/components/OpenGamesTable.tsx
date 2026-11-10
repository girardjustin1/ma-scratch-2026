import { useMemo, useState } from 'react';
import {
  Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Typography,
} from '@mui/material';
import type { Claim, Game, PrizeTier } from '../domain/types';
import { fmtDate, fmtUsd } from '../lib/format';

export interface GameRow {
  game: Game;
  topTotal: number;
  topRemaining: number;
  largestUnclaimed: number;
  lastListed: string | null;
}

export function buildGameRows(games: Game[], tiers: PrizeTier[], claims: Claim[]): GameRow[] {
  return games
    .filter((g) => g.status !== 'closed')
    .map((game) => {
      const t = tiers.filter((x) => x.gameId === game.id);
      const top = t.find((x) => x.isLaunchTopPrize);
      const unclaimed = t.filter((x) => x.remaining > 0).map((x) => x.value);
      const last = claims.filter((c) => c.gameId === game.id).map((c) => c.listedDate).sort().at(-1) ?? null;
      return {
        game,
        topTotal: top?.total ?? 0,
        topRemaining: top?.remaining ?? 0,
        largestUnclaimed: unclaimed.length ? Math.max(...unclaimed) : 0,
        lastListed: last,
      };
    });
}

type SortKey = 'largestUnclaimed' | 'price' | 'launchDate' | 'lastListed';

export interface OpenGamesTableProps {
  rows: GameRow[];
  asOf: string;
  selectedId?: string;
  onSelect?: (gameId: string) => void;
  limit?: number;
}

export function OpenGamesTable({ rows, asOf, selectedId, onSelect, limit = 100 }: OpenGamesTableProps) {
  const [sort, setSort] = useState<SortKey>('largestUnclaimed');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const sorted = useMemo(() => {
    const val = (r: GameRow) =>
      sort === 'price' ? r.game.price : sort === 'launchDate' ? r.game.launchDate : sort === 'lastListed' ? (r.lastListed ?? '') : r.largestUnclaimed;
    return [...rows].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (dir === 'asc' ? 1 : -1)).slice(0, limit);
  }, [rows, sort, dir, limit]);
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
      <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', px: 2, pt: 1.5, pb: 1 }}>
        <Typography variant="h2">Open games</Typography>
        <Typography variant="caption">
          Top {Math.min(limit, rows.length)} of {rows.length} open games · prizes remaining as of {fmtDate(asOf)}
        </Typography>
      </Stack>
      <TableContainer sx={{ maxHeight: 560 }}>
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
            {sorted.map((r) => (
              <TableRow
                key={r.game.id} hover selected={r.game.id === selectedId}
                onClick={() => onSelect?.(r.game.id)} sx={{ cursor: onSelect ? 'pointer' : 'default' }}
              >
                <TableCell>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.game.name}</Typography>
                      <Typography variant="caption">#{r.game.id.slice(1)}</Typography>
                    </Box>
                    {r.game.status === 'closing' && <Chip size="small" label="Closing" variant="outlined" />}
                  </Stack>
                </TableCell>
                <TableCell align="right">${r.game.price}</TableCell>
                <TableCell>{fmtDate(r.game.launchDate)}</TableCell>
                <TableCell align="right">{fmtUsd(r.game.originalTopPrize)}</TableCell>
                <TableCell align="right">{r.topRemaining} of {r.topTotal}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 650 }}>{fmtUsd(r.largestUnclaimed)}</TableCell>
                <TableCell>{r.lastListed ? fmtDate(r.lastListed) : <Typography variant="body2" color="text.secondary">None in coverage</Typography>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
