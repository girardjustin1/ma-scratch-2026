import {
  Box, Button, FormControl, InputLabel, MenuItem, OutlinedInput, Paper, Select, Slider, Stack, Switch,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import type { Filters, Game, MetricKey, PrizeBand } from '../domain/types';
import { CAVEATS, LABELS } from '../lib/copy';
import { MAPBOX_TOKEN, type Basemap } from '../map/mapStyle';

export function MetricSwitcher({ value, onChange }: { value: MetricKey; onChange: (m: MetricKey) => void }) {
  return (
    <ToggleButtonGroup size="small" exclusive value={value} onChange={(_, v) => v && onChange(v)} aria-label="Map metric">
      <ToggleButton value="claims">{LABELS.listedClaims}</ToggleButton>
      <ToggleButton value="income">{LABELS.medianIncome}</ToggleButton>
      <ToggleButton value="perRetailer">{LABELS.claimsPerRetailer}</ToggleButton>
    </ToggleButtonGroup>
  );
}

const BANDS: { value: PrizeBand; label: string }[] = [
  { value: 'all', label: 'All listed prizes' },
  { value: '600-999', label: '$600 – $999' },
  { value: '1k-9k', label: '$1,000 – $9,999' },
  { value: '10k-99k', label: '$10,000 – $99,999' },
  { value: '100k+', label: '$100,000 and up' },
];

export interface FilterBarProps {
  filters: Filters;
  games: Game[];
  minDate: string;
  maxDate: string;
  onChange: (f: Filters) => void;
  onReset?: () => void;
}

/** One row of filters above the map. Dates are Lottery-listed dates, day granularity. */
export function FilterBar({ filters, games, minDate, maxDate, onChange, onReset }: FilterBarProps) {
  const prices = [...new Set(games.map((g) => g.price))].sort((a, b) => a - b);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  return (
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <TextField
        size="small" type="date" label={`${LABELS.listedDate} from`} value={filters.dateFrom}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: minDate, max: filters.dateTo } }}
        onChange={(e) => set({ dateFrom: e.target.value })} sx={{ width: 168 }}
      />
      <TextField
        size="small" type="date" label="to" value={filters.dateTo}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: filters.dateFrom, max: maxDate } }}
        onChange={(e) => set({ dateTo: e.target.value })} sx={{ width: 150 }}
      />
      <FormControl size="small" sx={{ minWidth: 190 }}>
        <InputLabel>Game</InputLabel>
        <Select
          multiple value={filters.gameIds} input={<OutlinedInput label="Game" />}
          onChange={(e) => set({ gameIds: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value })}
          renderValue={(ids) => (ids.length === 1 ? games.find((g) => g.id === ids[0])?.name : `${ids.length} games`)}
        >
          {games.map((g) => <MenuItem key={g.id} value={g.id}>{g.name} · ${g.price}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>Ticket price</InputLabel>
        <Select
          multiple value={filters.prices} input={<OutlinedInput label="Ticket price" />}
          onChange={(e) => set({ prices: (e.target.value as number[]).map(Number) })}
          renderValue={(ps) => ps.map((p) => `$${p}`).join(', ')}
        >
          {prices.map((p) => <MenuItem key={p} value={p}>${p}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 170 }}>
        <InputLabel>Prize size</InputLabel>
        <Select value={filters.prizeBand} label="Prize size" onChange={(e) => set({ prizeBand: e.target.value as PrizeBand })}>
          {BANDS.map((b) => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
        </Select>
      </FormControl>
      <Tooltip title={CAVEATS.radiusRule}>
        <Box sx={{ width: 190, px: 1 }}>
          <Typography variant="caption">Radius · {filters.radiusMiles} mi</Typography>
          <Slider
            size="small" min={0.5} max={25} step={0.5} value={filters.radiusMiles}
            onChange={(_, v) => set({ radiusMiles: v as number })} aria-label="Radius in miles"
          />
        </Box>
      </Tooltip>
      {onReset && <Button size="small" startIcon={<RestartAltIcon />} onClick={onReset}>Reset</Button>}
    </Stack>
  );
}

export interface LayerControlsProps {
  tractOpacity: number;
  bubbleOpacity: number;
  showBubbles: boolean;
  basemap: Basemap;
  online: boolean;
  onChange: (p: Partial<Omit<LayerControlsProps, 'onChange' | 'online'>>) => void;
}

export function LayerControls({ tractOpacity, bubbleOpacity, showBubbles, basemap, online, onChange }: LayerControlsProps) {
  const canMapbox = online && !!MAPBOX_TOKEN;
  return (
    <Paper sx={{ p: 1.5, width: 260 }}>
      <Typography variant="subtitle2" color="text.secondary">Layers</Typography>
      <Typography variant="caption">Tract fill</Typography>
      <Slider size="small" min={0} max={1} step={0.05} value={tractOpacity} onChange={(_, v) => onChange({ tractOpacity: v as number })} />
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption">Retailer bubbles</Typography>
        <Switch size="small" checked={showBubbles} onChange={(e) => onChange({ showBubbles: e.target.checked })} />
      </Stack>
      <Slider size="small" disabled={!showBubbles} min={0} max={1} step={0.05} value={bubbleOpacity} onChange={(_, v) => onChange({ bubbleOpacity: v as number })} />
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="caption" sx={{ display: 'block' }}>Mapbox streets basemap</Typography>
          <Typography variant="caption" color="text.disabled">
            {!online ? 'Offline mode: outlines only' : !MAPBOX_TOKEN ? 'No token in .env' : 'Loads tiles from Mapbox'}
          </Typography>
        </Box>
        <Switch
          size="small" disabled={!canMapbox} checked={canMapbox && basemap === 'mapbox'}
          onChange={(e) => onChange({ basemap: e.target.checked ? 'mapbox' : 'outline' })}
        />
      </Stack>
    </Paper>
  );
}
