import { Box, Drawer, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { Claim, Coverage, Game, Retailer, TractMetrics, TractProps } from '../domain/types';
import { CAVEATS, LABELS } from '../lib/copy';
import { fmtDate, fmtInt, fmtUsd } from '../lib/format';
import { CaveatNote, IncomeValue, Stat } from './Basics';

export interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  tract?: TractProps;
  metrics?: TractMetrics;
  claims: Claim[];
  games: Game[];
  retailers: Retailer[];
  coverage: Coverage;
  inline?: boolean;
}

export function DetailBody({ tract, metrics, claims, games, retailers, coverage, onClose }: Omit<DetailDrawerProps, 'open' | 'inline'>) {
  if (!tract || !metrics) return null;
  const game = new Map(games.map((g) => [g.id, g]));
  const store = new Map(retailers.map((r) => [r.id, r]));
  const rows = [...claims].sort((a, b) => (a.listedDate < b.listedDate ? 1 : -1));
  return (
    <Box sx={{ width: 460, p: 2.5 }}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h2">{tract.town}</Typography>
          <Typography variant="caption">{tract.name} · {tract.geoid} · {tract.county}</Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
      </Stack>
      <Stack direction="row" spacing={3} sx={{ my: 2 }}>
        <Stat label={LABELS.listedClaims} value={metrics.claims === null ? LABELS.noData : metrics.claims} />
        <Stat label="Licensed retailers" value={metrics.retailers} />
        <Box>
          <Typography variant="caption" sx={{ display: 'block' }}>{LABELS.medianIncome}</Typography>
          <IncomeValue value={metrics.income} moe={metrics.incomeMoe} flag={metrics.incomeFlag} />
        </Box>
      </Stack>
      {metrics.claims === null ? (
        <CaveatNote>This tract is outside claims coverage ({coverage.label}). {CAVEATS.coverage}</CaveatNote>
      ) : (
        <>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{LABELS.listedDate}</TableCell>
                <TableCell>Game</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Prize</TableCell>
                <TableCell>Retailer</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(c.listedDate)}</TableCell>
                  <TableCell>{game.get(c.gameId)?.name}</TableCell>
                  <TableCell align="right">${game.get(c.gameId)?.price}</TableCell>
                  <TableCell align="right">{fmtUsd(c.prizeAmount)}</TableCell>
                  <TableCell>{store.get(c.retailerId)?.name}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No listed claims in the current filters.</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <Box sx={{ mt: 1.5 }}><CaveatNote>{fmtInt(rows.length)} listed claims. {CAVEATS.listedDate}</CaveatNote></Box>
        </>
      )}
    </Box>
  );
}

export function DetailDrawer(props: DetailDrawerProps) {
  return (
    <Drawer anchor="right" open={props.open} onClose={props.onClose}>
      <DetailBody {...props} />
    </Drawer>
  );
}
