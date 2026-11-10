import { Alert, Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import type { Coverage, IncomeFlag } from '../domain/types';
import { fmtInt, fmtRange, fmtUsd } from '../lib/format';
import { SAMPLE_NOTICE } from '../lib/copy';

/** Inline caveat: icon + muted text. Used under every chart and panel it applies to. */
export function CaveatNote({ children, dense }: { children: React.ReactNode; dense?: boolean }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-start', color: 'text.secondary' }}>
      <InfoOutlinedIcon sx={{ fontSize: dense ? 14 : 16, mt: '2px' }} />
      <Typography variant="caption" sx={{ lineHeight: 1.45 }}>{children}</Typography>
    </Stack>
  );
}

/** States the claims coverage area and listed-date window. */
export function CoverageChip({ coverage }: { coverage: Coverage }) {
  return (
    <Tooltip title="Claims data exists only inside this area and date window. Everything else shows as no data.">
      <Chip
        size="small"
        variant="outlined"
        icon={<EventOutlinedIcon />}
        label={`Coverage: ${coverage.label} · ${fmtRange(coverage.dateFrom, coverage.dateTo)}`}
      />
    </Tooltip>
  );
}

/** Median household income with its margin of error, always together. */
export function IncomeValue({ value, moe, flag, compact }: { value: number | null; moe: number | null; flag: IncomeFlag; compact?: boolean }) {
  if (value === null || flag === 'suppressed') {
    return (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <WarningAmberIcon sx={{ fontSize: 15, color: 'warning.main' }} />
        <Typography variant="body2" color="text.secondary">Estimate suppressed by Census</Typography>
      </Stack>
    );
  }
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
      <Typography variant="body2" sx={{ fontWeight: 650 }} className="tabular">{fmtUsd(value)}</Typography>
      <Typography variant="caption" className="tabular">± {fmtUsd(moe ?? 0)}</Typography>
      {flag === 'high_moe' && (
        <Chip
          size="small"
          color="warning"
          variant="outlined"
          icon={<WarningAmberIcon />}
          label={compact ? 'Uncertain' : 'Very uncertain estimate'}
          sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
        />
      )}
    </Stack>
  );
}

export function SampleBanner() {
  return (
    <Alert severity="info" icon={<ScienceOutlinedIcon fontSize="small" />} sx={{ py: 0, borderRadius: 0, border: 0 }}>
      {SAMPLE_NOTICE}
    </Alert>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ display: 'block' }}>{label}</Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 650, lineHeight: 1.25 }}>
        {typeof value === 'number' ? fmtInt(value) : value}
      </Typography>
      {sub && <Typography variant="caption">{sub}</Typography>}
    </Box>
  );
}
