import { Alert, Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { estimateEv } from '../domain/ev';
import type { Game, LegacyEv, PrizeTier } from '../domain/types';
import { CAVEATS } from '../lib/copy';
import { fmtCompactUsd, fmtDate, fmtSignedUsdCents } from '../lib/format';

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

/** Statewide EV. Deliberately takes no map filters as props. */
export function EvPanel({ games, tiers, legacy, asOf }: EvPanelProps) {
  const legacyBy = new Map(legacy.map((l) => [l.gameId, l]));
  const rows = games
    .map((g) => ({ g, ev: estimateEv(g, tiers), legacy: legacyBy.get(g.id) }))
    .sort((a, b) => a.g.price - b.g.price || a.g.name.localeCompare(b.g.name));
  return (
    <Stack spacing={2}>
      <Alert severity="info" icon={<PublicIcon />} sx={{ fontWeight: 600 }}>{CAVEATS.evBanner}</Alert>
      <Paper>
        <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', px: 2, pt: 1.5, pb: 1 }}>
          <Typography variant="h2">Statewide expected value</Typography>
          <Typography variant="caption">Prizes remaining as of {fmtDate(asOf)} · map filters do not apply here</Typography>
        </Stack>
        <TableContainer sx={{ maxHeight: 560 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Game</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Est. tickets remaining</TableCell>
                <TableCell align="right">Net EV, all prizes</TableCell>
                <TableCell align="right">Net EV, excl. original jackpot</TableCell>
                <TableCell align="right" sx={{ borderLeft: 1, borderLeftColor: 'divider' }}>Legacy estimate</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ g, ev, legacy: l }) => (
                <TableRow key={g.id} hover>
                  <TableCell><Typography variant="body2" sx={{ fontWeight: 600 }}>{g.name}</Typography></TableCell>
                  <TableCell align="right">${g.price}</TableCell>
                  <TableCell align="right">
                    {ev ? (
                      <Tooltip title={`Range from the two lowest prize tiers: ${fmtCompactUsd(ev.ticketsRemainingLow).slice(1)} – ${fmtCompactUsd(ev.ticketsRemainingHigh).slice(1)}`}>
                        <span>{fmtCompactUsd(ev.ticketsRemaining).slice(1)}</span>
                      </Tooltip>
                    ) : '—'}
                  </TableCell>
                  <TableCell align="right">
                    {ev ? (
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                        {ev.checkInputs && (
                          <Chip size="small" color="warning" variant="outlined" icon={<WarningAmberIcon />} label="Check inputs" sx={{ height: 20 }} />
                        )}
                        <span>{fmtSignedUsdCents(ev.evAll)}</span>
                      </Stack>
                    ) : '—'}
                  </TableCell>
                  <TableCell align="right">{ev ? fmtSignedUsdCents(ev.evExJackpot) : '—'}</TableCell>
                  <TableCell align="right" sx={{ borderLeft: 1, borderLeftColor: 'divider' }}>
                    {l ? (
                      <Tooltip title={`${l.methodNote}. Read-only; never blended with new estimates.`}>
                        <Box>
                          <span>{fmtSignedUsdCents(l.evAll)}</span>
                          <Typography variant="caption" sx={{ display: 'block' }}>as of {fmtDate(l.asOf)}</Typography>
                        </Box>
                      </Tooltip>
                    ) : <Typography variant="body2" color="text.secondary">None</Typography>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h3" sx={{ mb: 1 }}>Limitations</Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary', fontSize: 13, lineHeight: 1.7 }}>
          {LIMITS.map((x) => <li key={x}>{x}</li>)}
          <li>A positive estimate is flagged "Check inputs". It is not presented as an opportunity.</li>
        </Box>
      </Paper>
    </Stack>
  );
}
