import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import type { Coverage, TractMetrics, TractProps } from '../domain/types';
import { LABELS } from '../lib/copy';
import { fmtInt, fmtPct, fmtShortDate } from '../lib/format';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { IncomeValue } from './Basics';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
      <Typography variant="caption">{label}</Typography>
      <Box sx={{ textAlign: 'right' }}>{children}</Box>
    </Stack>
  );
}

const muted = (s: string) => <Typography variant="body2" color="text.secondary">{s}</Typography>;

/** Hover/tap card for one tract. Never shows EV. Missing coverage reads "No data". */
export function TractTooltip({ tract, metrics, coverage }: { tract: TractProps; metrics: TractMetrics; coverage: Coverage }) {
  return (
    <Paper sx={{ p: 1.5, width: 270, boxShadow: '0 6px 24px rgba(0,0,0,.18)' }}>
      <Typography variant="h3">{tract.town}</Typography>
      <Typography variant="caption">{tract.name} · {tract.geoid}</Typography>
      <Divider sx={{ my: 1 }} />
      <Stack spacing={0.75}>
        <Row label={LABELS.listedClaims}>
          {metrics.claims === null ? muted(LABELS.noData) : <Typography variant="body2" sx={{ fontWeight: 650 }}>{fmtInt(metrics.claims)}</Typography>}
        </Row>
        <Row label="Listed dates">
          {metrics.firstListed && metrics.lastListed
            ? <Typography variant="body2">{fmtShortDate(metrics.firstListed)} – {fmtShortDate(metrics.lastListed)}</Typography>
            : muted('—')}
        </Row>
        <Row label="Licensed retailers"><Typography variant="body2">{fmtInt(metrics.retailers)}</Typography></Row>
        <Row label={LABELS.claimsPerRetailer}>
          {metrics.perRetailer === null
            ? muted(metrics.claims === null ? LABELS.noData : LABELS.notDefined)
            : <Typography variant="body2">{metrics.perRetailer.toFixed(2)}</Typography>}
        </Row>
        <Row label={LABELS.medianIncome}>
          <IncomeValue value={metrics.income} moe={metrics.incomeMoe} flag={metrics.incomeFlag} compact />
        </Row>
      </Stack>
      {metrics.lowMatch && metrics.townMatchRate !== null && (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-start', mt: 1, color: 'warning.dark' }}>
          <WarningAmberIcon sx={{ fontSize: 15, mt: '1px', color: 'warning.main' }} />
          <Typography variant="caption" sx={{ color: 'text.primary' }}>
            Low match rate: only {fmtPct(metrics.townMatchRate)} of {tract.town}’s listed claims matched a store, so this count is low.
          </Typography>
        </Stack>
      )}
      <Divider sx={{ my: 1 }} />
      <Typography variant="caption">
        {metrics.covered ? `Inside claims coverage (${coverage.label})` : 'Outside claims coverage: no claims data'}
      </Typography>
    </Paper>
  );
}
