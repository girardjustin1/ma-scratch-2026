import { Box, Chip, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import type { StatResult } from '../domain/types';
import { CAVEATS } from '../lib/copy';
import { fmtInt } from '../lib/format';
import { CaveatNote } from './Basics';

function GateBar({ label, required, have }: { label: string; required: number; have: number }) {
  const met = have >= required;
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Typography variant="caption">{label}</Typography>
        <Typography variant="caption" className="tabular">{fmtInt(have)} of {fmtInt(required)} needed</Typography>
      </Stack>
      <LinearProgress
        variant="determinate" value={Math.min(100, (have / required) * 100)}
        color={met ? 'success' : 'warning'} sx={{ height: 4, borderRadius: 2, mt: 0.5 }}
      />
    </Box>
  );
}

const p = (x: number) => (x < 0.001 ? '< 0.001' : x.toFixed(3));

/** One statistical question: a result above its sample gate, otherwise why not. */
export function StatCard({ stat, sample }: { stat: StatResult; sample?: boolean }) {
  const met = stat.gate.have >= stat.gate.required && !!stat.result;
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h3">{stat.question}</Typography>
          <Typography variant="caption">Unit: {stat.unit}</Typography>
        </Box>
        <Stack direction="row" spacing={0.75}>
        {sample && <Chip size="small" label="Sample" sx={{ fontWeight: 700 }} />}
        <Chip
          size="small" variant="outlined" color={met ? 'success' : 'warning'}
          icon={met ? <CheckCircleOutlineIcon /> : <HourglassEmptyIcon />}
          label={met ? 'Result' : 'Insufficient sample'}
        />
        </Stack>
      </Stack>
      {met && stat.result ? (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" spacing={3} sx={{ alignItems: 'baseline' }}>
            <Box>
              <Typography variant="caption" sx={{ display: 'block' }}>{stat.result.effectLabel}</Typography>
              <Typography sx={{ fontSize: 26, fontWeight: 650 }}>{stat.result.effect.toFixed(2)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ display: 'block' }}>95% interval</Typography>
              <Typography variant="body2" className="tabular">{stat.result.ciLow.toFixed(2)} to {stat.result.ciHigh.toFixed(2)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ display: 'block' }}>n</Typography>
              <Typography variant="body2" className="tabular">{fmtInt(stat.result.n)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ display: 'block' }}>p (raw · BH-adjusted)</Typography>
              <Typography variant="body2" className="tabular">{p(stat.result.pRaw)} · {p(stat.result.pAdjusted)}</Typography>
            </Box>
          </Stack>
          <Typography variant="body2" sx={{ mt: 1.5 }}>{stat.result.summary}</Typography>
        </Box>
      ) : (
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            Needs at least {fmtInt(stat.gate.required)} {stat.gate.label}; the current data has {fmtInt(stat.gate.have)}. No number is shown until the sample can support one.
          </Typography>
          <GateBar label={stat.gate.label} required={stat.gate.required} have={stat.gate.have} />
        </Box>
      )}
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Method: {stat.method}</Typography>
        <CaveatNote dense>{CAVEATS.association} {stat.id.startsWith('income') ? CAVEATS.ecological : ''}</CaveatNote>
      </Box>
    </Paper>
  );
}

export interface MlGate {
  weeks: { required: number; have: number };
  tracts: { required: number; have: number };
  claims: { required: number; have: number };
}

export function MlGatePanel({ gate }: { gate: MlGate }) {
  const met = Object.values(gate).every((g) => g.have >= g.required);
  return (
    <Paper sx={{ p: 2.5, maxWidth: 720 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h2">Exploratory model</Typography>
        <Chip size="small" variant="outlined" color={met ? 'success' : 'warning'} label={met ? 'Gate met' : 'Below data gate'} />
      </Stack>
      <Typography variant="body2" sx={{ mt: 1 }}>
        Asks whether place features (income, households, retailer count, town) explain tract-week listed claims better than
        simple baselines. It does not forecast winning stores.
      </Typography>
      <Stack spacing={1.5} sx={{ my: 2 }}>
        <GateBar label="weeks of listed claims" {...gate.weeks} />
        <GateBar label="covered tracts" {...gate.tracts} />
        <GateBar label="listed claims" {...gate.claims} />
      </Stack>
      {!met && (
        <CaveatNote>
          No model is shown. Three weeks leaves one holdout week, and one small area cannot form independent town groups for
          validation, so any score would mostly measure noise.
        </CaveatNote>
      )}
    </Paper>
  );
}
