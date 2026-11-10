import { Box, Paper, Stack, Typography, useTheme } from '@mui/material';
import { classLabels } from '../domain/classify';
import type { Coverage, MetricKey } from '../domain/types';
import { CAVEATS, LABELS } from '../lib/copy';
import { fmtCompactUsd, fmtInt, fmtRange } from '../lib/format';
import { noData, ramps, status, type Mode } from '../theme/tokens';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

const TITLES: Record<MetricKey, string> = {
  claims: LABELS.listedClaims,
  income: LABELS.medianIncome,
  perRetailer: LABELS.claimsPerRetailer,
};

function fmt(metric: MetricKey, v: number) {
  if (metric === 'income') return fmtCompactUsd(v);
  if (metric === 'perRetailer') return v.toFixed(1);
  return fmtInt(Math.round(v));
}

export interface MapLegendProps {
  metric: MetricKey;
  breaks: number[];
  min: number;
  max: number;
  tractCount: number;
  noDataCount: number;
  coverage: Coverage;
  /** Number of tracts in view flagged for a low town match rate (claims metrics only). */
  lowMatchCount?: number;
}

export function MapLegend({ metric, breaks, min, max, tractCount, noDataCount, coverage, lowMatchCount = 0 }: MapLegendProps) {
  const mode = useTheme().palette.mode as Mode;
  const ramp = metric === 'income' ? ramps.income[mode] : ramps.claims[mode];
  const labels = classLabels(breaks, min, max, metric === 'claims', (v) => fmt(metric, v));
  const classes = ramp.slice(0, breaks.length + 1);
  const hatch = noData[mode];

  return (
    <Paper sx={{ p: 1.5, width: 260 }}>
      <Typography variant="h3" sx={{ mb: 0.25 }}>{TITLES[metric]}</Typography>
      <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
        Quantile classes · {fmtInt(tractCount)} tracts
      </Typography>
      <Stack spacing={0.5}>
        {classes.map((color, i) => (
          <Stack key={color} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 22, height: 12, borderRadius: 0.5, bgcolor: color }} />
            <Typography variant="body2" className="tabular">
              {labels[i]}
            </Typography>
          </Stack>
        ))}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 22, height: 12, borderRadius: 0.5,
              background: `repeating-linear-gradient(135deg, ${hatch.line} 0 1.5px, ${hatch.fill} 1.5px 5px)`,
              border: `1px solid ${hatch.line}`,
            }}
          />
          <Typography variant="body2">
            {metric === 'perRetailer' ? 'No data or no retailers' : LABELS.noData}
            <Typography component="span" variant="caption"> · {fmtInt(noDataCount)}</Typography>
          </Typography>
        </Stack>
      </Stack>
      <Box sx={{ mt: 1.25, pt: 1, borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
          {!coverage.statewide && <Box sx={{ width: 22, borderTop: 2, borderColor: 'text.primary' }} />}
          <Typography variant="caption">
            {coverage.statewide ? 'Coverage: statewide' : 'Coverage boundary'} · {fmtRange(coverage.dateFrom, coverage.dateTo)}
          </Typography>
        </Stack>
        {metric !== 'income' && lowMatchCount > 0 && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
            <Box sx={{ width: 22, height: 12, border: `2px dashed ${status.warning}`, borderRadius: 0.5 }} />
            <WarningAmberIcon sx={{ fontSize: 14, color: 'warning.main' }} />
            <Typography variant="caption">Low match rate (under 80%) · {fmtInt(lowMatchCount)}</Typography>
          </Stack>
        )}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 22, borderTop: '2px dashed', borderColor: 'text.secondary' }} />
          <Typography variant="caption">Search radius</Typography>
        </Stack>
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, lineHeight: 1.4 }}>
          {metric === 'income' ? CAVEATS.ecological : metric === 'perRetailer' ? CAVEATS.perRetailer : CAVEATS.listedOnly}
          {metric !== 'income' && <> {CAVEATS.matchedOnly}</>}
        </Typography>
      </Box>
    </Paper>
  );
}
