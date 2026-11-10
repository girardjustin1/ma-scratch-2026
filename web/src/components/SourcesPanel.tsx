import { Button, Chip, Paper, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import RefreshIcon from '@mui/icons-material/Refresh';
import { fmtDate, fmtInt } from '../lib/format';

export interface SourceRow {
  id: string;
  label: string;
  origin: string;
  lastFetched: string;
  rows: number;
}

export function OnlineChip({ online }: { online: boolean }) {
  return online
    ? <Chip size="small" color="primary" variant="outlined" icon={<CloudQueueIcon />} label="Online" />
    : <Chip size="small" variant="outlined" icon={<CloudOffIcon />} label="Offline" />;
}

/** Per-source refresh. Nothing fetches unless the user presses a button while online. */
export function SourcesPanel({ sources, online, onToggleOnline, onRefresh }: {
  sources: readonly SourceRow[];
  online: boolean;
  onToggleOnline: (v: boolean) => void;
  onRefresh?: (id: string) => void;
}) {
  return (
    <Paper sx={{ maxWidth: 860 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
        <Stack>
          <Typography variant="h2">Data sources</Typography>
          <Typography variant="caption">The app starts offline. Official sources only: Mass Lottery and the Census Bureau.</Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <OnlineChip online={online} />
          <Switch checked={online} onChange={(e) => onToggleOnline(e.target.checked)} slotProps={{ input: { 'aria-label': 'Allow network' } }} />
        </Stack>
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Dataset</TableCell>
            <TableCell>Source</TableCell>
            <TableCell align="right">Rows</TableCell>
            <TableCell>Last fetched</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {sources.map((s) => (
            <TableRow key={s.id}>
              <TableCell sx={{ fontWeight: 600 }}>{s.label}</TableCell>
              <TableCell>{s.origin}</TableCell>
              <TableCell align="right">{fmtInt(s.rows)}</TableCell>
              <TableCell>{fmtDate(s.lastFetched)}</TableCell>
              <TableCell align="right">
                <Button size="small" startIcon={<RefreshIcon />} disabled={!online} onClick={() => onRefresh?.(s.id)}>
                  Refresh
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
