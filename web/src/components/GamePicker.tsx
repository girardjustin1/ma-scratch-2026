import { useMemo, useState } from 'react';
import {
  Box, Button, Checkbox, Chip, Divider, FormControlLabel, InputAdornment, List, ListItemButton, ListSubheader,
  MenuItem, Popover, Select, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SearchIcon from '@mui/icons-material/Search';
import type { GameRef } from '../domain/types';
import { CAVEATS } from '../lib/copy';
import { fmtCompactUsd, fmtDate, fmtInt } from '../lib/format';
import { CaveatNote } from './Basics';

export type GameSort = 'unclaimed' | 'top' | 'claims' | 'newest' | 'name';

const SORTS: { value: GameSort; label: string }[] = [
  { value: 'unclaimed', label: 'Most unclaimed prizes over $600' },
  { value: 'top', label: 'Most top prizes left' },
  { value: 'claims', label: 'Most listed claims in radius' },
  { value: 'newest', label: 'Newest launch' },
  { value: 'name', label: 'Name' },
];

/** Price filter value for games the catalog has no price for (matches filterClaims). */
export const UNKNOWN_PRICE = -1;
const nameKey = (n: string) => n.replace(/^[$\d,.\s]+/, '').trim() || n;

/** Sort and group games. Exported for tests and stories. */
export function arrangeGames(args: {
  games: GameRef[]; sort: GameSort; query: string; onSaleOnly: boolean; prices: number[];
  claimCounts: Map<string, number>; groupByPrice: boolean;
}) {
  const { games, sort, query, onSaleOnly, prices, claimCounts, groupByPrice } = args;
  const q = query.trim().toLowerCase();
  const shown = games.filter(
    (g) =>
      (!q || g.name.toLowerCase().includes(q)) &&
      (!onSaleOnly || g.onSale) &&
      (prices.length === 0 || prices.includes(g.price ?? UNKNOWN_PRICE)),
  );
  // Missing values sort last, never as zero.
  const desc = (a: number | null | undefined, b: number | null | undefined) => (b ?? -Infinity) - (a ?? -Infinity);
  const cmp: Record<GameSort, (a: GameRef, b: GameRef) => number> = {
    unclaimed: (a, b) => desc(a.prizes?.remainingOver600, b.prizes?.remainingOver600),
    top: (a, b) => desc(a.prizes?.topRemaining, b.prizes?.topRemaining) || desc(a.prizes?.topPrize, b.prizes?.topPrize),
    claims: (a, b) => desc(claimCounts.get(a.id), claimCounts.get(b.id)),
    newest: (a, b) => (b.launchDate ?? '').localeCompare(a.launchDate ?? ''),
    name: () => 0,
  };
  const byName = (a: GameRef, b: GameRef) => nameKey(a.name).localeCompare(nameKey(b.name), 'en', { numeric: true });
  shown.sort((a, b) => cmp[sort](a, b) || byName(a, b));
  if (!groupByPrice) return { total: shown.length, groups: [{ key: 'all', label: null as string | null, games: shown }] };
  const keys = [...new Set(shown.map((g) => g.price ?? UNKNOWN_PRICE))].sort(
    (a, b) => (a === UNKNOWN_PRICE ? 1 : b === UNKNOWN_PRICE ? -1 : a - b),
  );
  return {
    total: shown.length,
    groups: keys.map((p) => {
      const list = shown.filter((g) => (g.price ?? UNKNOWN_PRICE) === p);
      return {
        key: String(p),
        label: `${p === UNKNOWN_PRICE ? 'Price unknown' : `$${p} tickets`} · ${list.length} game${list.length === 1 ? '' : 's'}`,
        games: list,
      };
    }),
  };
}

function Metric({ value, label, muted }: { value: string; label: string; muted?: boolean }) {
  return (
    <Box sx={{ textAlign: 'right', minWidth: 76 }}>
      <Typography variant="body2" className="tabular" sx={{ fontWeight: 600, color: muted ? 'text.disabled' : 'text.primary' }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>{label}</Typography>
    </Box>
  );
}

function GameRow({ g, checked, claims, onToggle }: { g: GameRef; checked: boolean; claims: number; onToggle: () => void }) {
  const p = g.prizes;
  const meta = [
    g.price != null ? `$${g.price}` : 'Price unknown',
    g.launchDate ? `Launched ${fmtDate(g.launchDate)}` : null,
    p ? `Top prize ${fmtCompactUsd(p.topPrize)}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <ListItemButton dense onClick={onToggle} sx={{ gap: 1, py: 0.5, alignItems: 'center' }}>
      <Checkbox size="small" checked={checked} tabIndex={-1} disableRipple sx={{ p: 0.5 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" noWrap>{g.name}</Typography>
          {g.onSale === false && <Chip size="small" variant="outlined" label="Not on sale" sx={{ height: 18, fontSize: 11 }} />}
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{meta}</Typography>
      </Box>
      <Metric value={p ? fmtInt(p.remainingOver600) : '—'} label="unclaimed >$600" muted={!p} />
      <Metric value={p ? `${fmtInt(p.topRemaining)} of ${fmtInt(p.topTotal)}` : '—'} label="top prizes left" muted={!p} />
      <Metric value={fmtInt(claims)} label="listed in radius" muted={claims === 0} />
    </ListItemButton>
  );
}

export interface GamePickerProps {
  games: GameRef[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** The Ticket price filter: the list shows only these prices when set. */
  prices: number[];
  /** Listed claims per game inside the radius, under the current date and prize filters. */
  claimCounts: Map<string, number>;
}

/**
 * Game filter for the map: search, on-sale toggle, sort, and grouping by ticket price.
 * Unclaimed-prize counts are statewide and never imply what any store holds.
 */
export function GamePicker({ games, value, onChange, prices, claimCounts }: GamePickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const hasSaleInfo = games.some((g) => g.onSale !== undefined);
  const [onSaleOnly, setOnSaleOnly] = useState(hasSaleInfo);
  const [sort, setSort] = useState<GameSort>(games.some((g) => g.prizes) ? 'unclaimed' : 'claims');
  const [groupByPrice, setGroupByPrice] = useState(true);

  const { total, groups } = useMemo(
    () => arrangeGames({ games, sort, query, onSaleOnly, prices, claimCounts, groupByPrice }),
    [games, sort, query, onSaleOnly, prices, claimCounts, groupByPrice],
  );
  const asOf = games.find((g) => g.prizes)?.prizes?.asOf;
  const onSaleCount = games.filter((g) => g.onSale).length;
  const selected = new Set(value);
  const toggle = (id: string) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  const shownIds = groups.flatMap((gr) => gr.games.map((g) => g.id));

  const display =
    value.length === 0 ? 'All games' : value.length === 1 ? (games.find((g) => g.id === value[0])?.name ?? '1 game') : `${value.length} games`;

  return (
    <>
      <TextField
        size="small" label="Game" value={display} onClick={(e) => setAnchor(e.currentTarget)}
        slotProps={{
          input: { readOnly: true, endAdornment: <ArrowDropDownIcon sx={{ color: 'action.active', mr: -0.5 }} /> },
          htmlInput: { 'aria-haspopup': 'dialog', style: { cursor: 'pointer', textOverflow: 'ellipsis' } },
        }}
        sx={{ width: 220, '& .MuiInputBase-root': { cursor: 'pointer' } }}
      />
      <Popover
        open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 640, maxHeight: '75vh', display: 'flex', flexDirection: 'column' } } }}
      >
        <Stack spacing={1.25} sx={{ p: 1.5 }}>
          <TextField
            size="small" autoFocus placeholder="Search games" value={query} onChange={(e) => setQuery(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {hasSaleInfo && (
              <ToggleButtonGroup size="small" exclusive value={onSaleOnly ? 'sale' : 'all'} onChange={(_, v) => v && setOnSaleOnly(v === 'sale')}>
                <ToggleButton value="sale">On sale now · {onSaleCount}</ToggleButton>
                <ToggleButton value="all">All games · {games.length}</ToggleButton>
              </ToggleButtonGroup>
            )}
            <Select size="small" value={sort} onChange={(e) => setSort(e.target.value as GameSort)} sx={{ minWidth: 250 }}
              renderValue={(v) => `Sort: ${SORTS.find((s) => s.value === v)?.label}`}>
              {SORTS.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </Select>
            <FormControlLabel
              control={<Switch size="small" checked={groupByPrice} onChange={(e) => setGroupByPrice(e.target.checked)} />}
              label={<Typography variant="caption">Group by price</Typography>} sx={{ ml: 0.5 }}
            />
          </Stack>
          {prices.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              Showing {prices.map((p) => (p === UNKNOWN_PRICE ? 'unknown-price' : `$${p}`)).join(', ')} games, set by the Ticket price filter.
            </Typography>
          )}
        </Stack>
        <Divider />
        <List dense disablePadding sx={{ overflowY: 'auto', flex: 1, minHeight: 120 }}>
          {total === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No games match.</Typography>
          )}
          {groups.map((gr) => (
            <li key={gr.key}>
              <ul style={{ padding: 0 }}>
                {gr.label && (
                  <ListSubheader sx={{ lineHeight: '32px', fontSize: 12, fontWeight: 600, bgcolor: 'background.paper' }}>
                    {gr.label}
                  </ListSubheader>
                )}
                {gr.games.map((g) => (
                  <GameRow key={g.id} g={g} checked={selected.has(g.id)} claims={claimCounts.get(g.id) ?? 0} onToggle={() => toggle(g.id)} />
                ))}
              </ul>
            </li>
          ))}
        </List>
        <Divider />
        <Stack spacing={1} sx={{ p: 1.5 }}>
          <CaveatNote dense>
            {CAVEATS.unclaimedPrizes}{asOf ? ` Prize table as of ${fmtDate(asOf)}.` : ''} “—” means no prize table for that game.
          </CaveatNote>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              {value.length ? `${value.length} selected` : 'No game selected: the map shows all games'} · {total} shown
            </Typography>
            <Button size="small" disabled={!shownIds.length} onClick={() => onChange([...new Set([...value, ...shownIds])])}>
              Select shown
            </Button>
            <Button size="small" disabled={!value.length} onClick={() => onChange([])}>Clear</Button>
            <Button size="small" variant="contained" onClick={() => setAnchor(null)}>Done</Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}
