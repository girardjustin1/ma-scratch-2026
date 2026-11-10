import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box, Paper, Stack, Typography, useTheme } from '@mui/material';
import { bubbles, brand, chrome, noData, ramps, status, type Mode } from '../theme/tokens';
import { CAVEATS, LABELS } from '../lib/copy';

const meta: Meta = { title: 'Foundations/Tokens' };
export default meta;

function Swatch({ color, label, pattern }: { color: string; label: string; pattern?: string }) {
  return (
    <Stack spacing={0.5} sx={{ width: 104 }}>
      <Box sx={{ height: 44, borderRadius: 1, background: pattern ?? color, border: 1, borderColor: 'divider' }} />
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary' }}>{label}</Typography>
      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{color}</Typography>
    </Stack>
  );
}

function Row({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="h3">{title}</Typography>
      {note && <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>{note}</Typography>}
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>{children}</Stack>
    </Box>
  );
}

export const Colors: StoryObj = {
  render: () => {
    const mode = useTheme().palette.mode as Mode;
    const c = chrome[mode];
    const nd = noData[mode];
    return (
      <Stack spacing={3}>
        <Row title="Income ramp (5 quantile classes)" note="Single blue hue, low → high. Lowest class clears 2:1 against the surface so it never reads as no data.">
          {ramps.income[mode].map((x, i) => <Swatch key={x} color={x} label={`Class ${i + 1}`} />)}
        </Row>
        <Row title="Claims ramp (listed claims, claims per retailer)" note="Single orange hue. Used on the second map in side-by-side so the two metrics never share a color.">
          {ramps.claims[mode].map((x, i) => <Swatch key={x} color={x} label={`Class ${i + 1}`} />)}
        </Row>
        <Row title="No data & overlays">
          <Swatch color={nd.fill} label="No data (hatched)" pattern={`repeating-linear-gradient(135deg, ${nd.line} 0 1.5px, ${nd.fill} 1.5px 5px)`} />
          <Swatch color={bubbles[mode].fill} label="Retailer bubble" />
          <Swatch color={bubbles[mode].hollow} label="No listed claims" />
          <Swatch color={brand.primary[mode]} label="UI accent" />
        </Row>
        <Row title="Status (state only, always with icon + label)">
          {Object.entries(status).map(([k, v]) => <Swatch key={k} color={v} label={k} />)}
        </Row>
        <Row title="Chrome">
          {Object.entries(c).map(([k, v]) => <Swatch key={k} color={v} label={k} />)}
        </Row>
      </Stack>
    );
  },
};

export const Typography_: StoryObj = {
  name: 'Typography',
  render: () => (
    <Stack spacing={1.5} sx={{ maxWidth: 640 }}>
      <Typography variant="h1">h1 · Statistical exploration</Typography>
      <Typography variant="h2">h2 · Open games</Typography>
      <Typography variant="h3">h3 · Income vs listed claims</Typography>
      <Typography variant="subtitle2">subtitle2 · Layers</Typography>
      <Typography variant="body1">body1 · The quick brown fox jumps over the lazy dog.</Typography>
      <Typography variant="body2">body2 · Used in tables, tooltips and controls.</Typography>
      <Typography variant="caption">caption · Secondary notes and caveats.</Typography>
      <Typography className="tabular" sx={{ fontSize: 26, fontWeight: 650 }}>$1,234,567 · 0.18</Typography>
    </Stack>
  ),
};

export const Wording: StoryObj = {
  render: () => (
    <Paper sx={{ p: 2, maxWidth: 760 }}>
      <Typography variant="h3" sx={{ mb: 1 }}>Canonical labels and caveats (src/lib/copy.ts)</Typography>
      <Stack spacing={1}>
        {Object.entries({ ...LABELS, ...CAVEATS }).map(([k, v]) => (
          <Stack key={k} direction="row" spacing={2}>
            <Typography variant="caption" sx={{ width: 150, flexShrink: 0, fontFamily: 'monospace' }}>{k}</Typography>
            <Typography variant="body2">{v}</Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  ),
};
