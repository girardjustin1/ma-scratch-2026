import { Fragment, useId, useMemo, useState } from 'react';
import { ChevronDown, FilterLines, SearchLg, SwitchVertical01, Ticket01 } from '@untitledui/icons';
import {
  Button as AriaButton, Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, Header as AriaHeader,
  ListBox as AriaListBox, ListBoxItem as AriaListBoxItem, ListBoxSection as AriaListBoxSection,
  Popover as AriaPopover, Text as AriaText,
} from 'react-aria-components';
import { Badge } from '@/components/base/badges/badges';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { Button } from '@/components/base/buttons/button';
import { CheckboxBase } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { Select } from '@/components/base/select/select';
import { Toggle } from '@/components/base/toggle/toggle';
import { cx } from '@/utils/cx';
import type { GameRef } from '../domain/types';
import { CAVEATS } from '../lib/copy';
import { fmtCompactUsd, fmtDate, fmtInt } from '../lib/format';
import { CaveatNote } from './Basics';
import { Chip } from './Chip';

export type GameSort = 'unclaimed' | 'payback' | 'top' | 'claims' | 'newest' | 'name';

// ---- Filter chips --------------------------------------------------------------------
// Chips narrow the list only; the map changes when games are selected. Within a facet the
// chips combine with OR, across facets with AND.

interface FacetCtx { claimCounts: Map<string, number>; anchor: string }
interface FacetOption { id: string; label: string; test: (g: GameRef, ctx: FacetCtx) => boolean }
interface Facet { key: string; label: string; options: FacetOption[] }
export type FacetSelection = Record<string, string[]>;

const daysBefore = (iso: string, anchor: string) =>
  Math.round((Date.parse(anchor) - Date.parse(iso)) / 86_400_000);

function buildFacets(games: GameRef[]): Facet[] {
  const prices = [...new Set(games.map((g) => g.price).filter((p): p is number => p !== null))].sort((a, b) => a - b);
  const top = (g: GameRef) => g.prizes?.topPrize;
  const facets: Facet[] = [
    {
      key: 'price', label: 'Price',
      options: [
        ...prices.map((p) => ({ id: String(p), label: `$${p}`, test: (g: GameRef) => g.price === p })),
        ...(games.some((g) => g.price === null)
          ? [{ id: String(UNKNOWN_PRICE), label: 'Price unknown', test: (g: GameRef) => g.price === null }] : []),
      ],
    },
    {
      key: 'left', label: 'Prizes left',
      options: [
        { id: 'topLeft', label: 'Top prize still out', test: (g) => (g.prizes?.topRemaining ?? 0) > 0 },
        { id: 'topGone', label: 'All top prizes claimed', test: (g) => g.prizes?.topRemaining === 0 },
        { id: 'over600', label: 'Unclaimed over $600', test: (g) => (g.prizes?.remainingOver600 ?? 0) > 0 },
      ],
    },
    {
      key: 'top', label: 'Top prize',
      options: [
        { id: 'lt100k', label: 'Under $100K', test: (g) => (top(g) ?? Infinity) < 100_000 },
        { id: '100k', label: '$100K – $999K', test: (g) => { const t = top(g); return t != null && t >= 100_000 && t < 1_000_000; } },
        { id: '1m', label: '$1M and up', test: (g) => (top(g) ?? 0) >= 1_000_000 },
      ],
    },
    {
      key: 'launch', label: 'Launched',
      options: [
        { id: '90d', label: 'Last 90 days', test: (g, c) => !!g.launchDate && daysBefore(g.launchDate, c.anchor) <= 90 },
        { id: '1y', label: '91 days – 1 year', test: (g, c) => { const d = g.launchDate ? daysBefore(g.launchDate, c.anchor) : -1; return d > 90 && d <= 365; } },
        { id: 'older', label: 'Over a year ago', test: (g, c) => !!g.launchDate && daysBefore(g.launchDate, c.anchor) > 365 },
      ],
    },
    {
      key: 'tags', label: 'Lottery tags',
      options: [
        { id: 'new', label: 'New', test: (g) => !!g.tags?.includes('new') },
        { id: 'ending', label: 'Ending soon', test: (g) => !!g.tags?.includes('ending') },
        { id: 'secondChance', label: 'Second chance', test: (g) => !!g.tags?.includes('secondChance') },
        { id: 'scan', label: 'Scan to enter', test: (g) => !!g.tags?.includes('scan') },
      ],
    },
    {
      key: 'radius', label: 'In your radius',
      options: [
        { id: 'has', label: 'Has listed claims', test: (g, c) => (c.claimCounts.get(g.id) ?? 0) > 0 },
        { id: 'none', label: 'None listed', test: (g, c) => (c.claimCounts.get(g.id) ?? 0) === 0 },
      ],
    },
  ];
  // A facet with nothing to choose from (e.g. no tags in sample data) is left out.
  return facets.filter((f) => f.options.some((o) => games.some((g) => o.test(g, { claimCounts: new Map(), anchor: '9999-12-31' })) || f.key === 'radius'));
}

/** True when a game passes every active facet (OR within a facet, AND across), optionally ignoring one. */
function passesFacets(g: GameRef, facets: Facet[], sel: FacetSelection, ctx: FacetCtx, skip?: string) {
  return facets.every((f) => {
    const on = sel[f.key];
    if (f.key === skip || !on?.length) return true;
    return f.options.some((o) => on.includes(o.id) && o.test(g, ctx));
  });
}

const SORTS: { value: GameSort; label: string }[] = [
  { value: 'unclaimed', label: 'Most unclaimed prizes over $600' },
  { value: 'payback', label: 'Highest estimated payback (statewide EV)' },
  { value: 'top', label: 'Most top prizes left' },
  { value: 'claims', label: 'Most listed claims in radius' },
  { value: 'newest', label: 'Newest launch' },
  { value: 'name', label: 'Name' },
];

/** Price filter value for games the catalog has no price for (matches filterClaims). */
export const UNKNOWN_PRICE = -1;
const nameKey = (n: string) => n.replace(/^[$\d,.\s]+/, '').trim() || n;

/** Search, on-sale and the Ticket price filter: the base every chip count starts from. */
function baseFilter(games: GameRef[], query: string, onSaleOnly: boolean, prices: number[]) {
  const q = query.trim().toLowerCase();
  return games.filter(
    (g) =>
      (!q || g.name.toLowerCase().includes(q)) &&
      (!onSaleOnly || g.onSale) &&
      (prices.length === 0 || prices.includes(g.price ?? UNKNOWN_PRICE)),
  );
}

/** Sort and group games. Exported for tests and stories. */
export function arrangeGames(args: {
  games: GameRef[]; sort: GameSort; query: string; onSaleOnly: boolean; prices: number[];
  claimCounts: Map<string, number>; groupByPrice: boolean;
  facets?: { list: Facet[]; selection: FacetSelection; ctx: FacetCtx };
}) {
  const { games, sort, query, onSaleOnly, prices, claimCounts, groupByPrice, facets } = args;
  const shown = baseFilter(games, query, onSaleOnly, prices).filter(
    (g) => !facets || passesFacets(g, facets.list, facets.selection, facets.ctx),
  );
  // Missing values sort last, never as zero.
  const desc = (a: number | null | undefined, b: number | null | undefined) => (b ?? -Infinity) - (a ?? -Infinity);
  const cmp: Record<GameSort, (a: GameRef, b: GameRef) => number> = {
    unclaimed: (a, b) => desc(a.prizes?.remainingOver600, b.prizes?.remainingOver600),
    payback: (a, b) => desc(a.ev?.payback, b.ev?.payback),
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

function FilterChips({ facets, selection, setSelection, counts }: {
  facets: Facet[]; selection: FacetSelection; setSelection: (s: FacetSelection) => void;
  counts: (facetKey: string, optionId: string) => number;
}) {
  const [open, setOpen] = useState(true);
  const active = Object.values(selection).reduce((n, v) => n + v.length, 0);
  const toggle = (key: string, id: string) => {
    const cur = selection[key] ?? [];
    setSelection({ ...selection, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <AriaButton onPress={() => setOpen(!open)} className="flex cursor-pointer items-center gap-1 text-sm font-semibold text-secondary outline-hidden">
          <FilterLines className="size-4 text-fg-quaternary" aria-hidden />
          Filters{active ? ` · ${active} on` : ''}
          <ChevronDown aria-hidden className={cx('size-4 text-fg-quaternary transition-transform', open && 'rotate-180')} />
        </AriaButton>
        <div className="flex-1" />
        {active > 0 && <Button size="sm" color="link-gray" onClick={() => setSelection({})}>Clear filters</Button>}
      </div>
      {open && (
        <p className="text-xs text-tertiary">Price chips also filter the map. The other chips narrow this list; use Select shown to map those games.</p>
      )}
      {open && (
        <div className="grid grid-cols-[96px_1fr] items-start gap-x-3 gap-y-2">
          {facets.map((f) => (
            <Fragment key={f.key}>
              <span className="pt-1 text-xs font-medium text-tertiary">{f.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {f.options.map((o) => (
                  <Chip key={o.id} label={o.label} count={counts(f.key, o.id)}
                    selected={!!selection[f.key]?.includes(o.id)} onToggle={() => toggle(f.key, o.id)} />
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ value, label, muted }: { value: string; label: string; muted?: boolean }) {
  return (
    <div className="w-26 shrink-0 text-right whitespace-nowrap">
      <p className={cx('text-sm font-semibold tabular', muted ? 'text-quaternary' : 'text-primary')}>{value}</p>
      <p className="text-xs leading-tight text-tertiary">{label}</p>
    </div>
  );
}

/** Ticket art at 2:1, or a gray placeholder with a ticket icon when there is none. */
function TicketThumb({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid h-9 w-[72px] shrink-0 place-items-center overflow-hidden rounded-md bg-secondary ring-1 ring-secondary ring-inset">
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailed(true)} />
        : <Ticket01 className="size-4 text-fg-quaternary" aria-hidden />}
    </span>
  );
}

function GameRow({ g, claims, sort }: { g: GameRef; claims: number; sort: GameSort }) {
  const p = g.prizes;
  const meta = [
    g.price != null ? `$${g.price}` : 'Price unknown',
    g.launchDate ? `Launched ${fmtDate(g.launchDate)}` : null,
    p ? `Top prize ${fmtCompactUsd(p.topPrize)}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <AriaListBoxItem
      id={g.id} textValue={g.name}
      className={({ isHovered, isFocused, isFocusVisible }) => cx(
        'flex cursor-pointer items-center gap-3 px-4 py-2 outline-hidden select-none',
        (isHovered || isFocused) && 'bg-primary_hover',
        isFocusVisible && 'ring-2 ring-focus-ring ring-inset',
      )}
    >
      {({ isSelected }) => (
        <>
          <CheckboxBase size="sm" isSelected={isSelected} />
          <TicketThumb src={g.image} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <AriaText slot="label" className="truncate text-sm font-medium text-primary">{g.name}</AriaText>
              {g.onSale === false && <Badge type="modern" size="sm" color="gray">Not on sale</Badge>}
            </div>
            <AriaText slot="description" className="block truncate text-xs text-tertiary">{meta}</AriaText>
          </div>
          {sort === 'payback'
            ? <Metric value={g.ev ? `${Math.round(g.ev.payback * 100)}%` : '—'}
                label={g.ev?.checkInputs ? 'check inputs' : 'est. payback / $1'} muted={!g.ev} />
            : <Metric value={p ? fmtInt(p.remainingOver600) : '—'} label="unclaimed >$600" muted={!p} />}
          <Metric value={p ? `${fmtInt(p.topRemaining)} of ${fmtInt(p.topTotal)}` : '—'} label="top prizes left" muted={!p} />
          <Metric value={fmtInt(claims)} label="listed in radius" muted={claims === 0} />
        </>
      )}
    </AriaListBoxItem>
  );
}

export interface GamePickerProps {
  games: GameRef[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** The map's ticket-price filter, shown and edited as the Price chips. */
  prices: number[];
  onPricesChange?: (prices: number[]) => void;
  /** Listed claims per game inside the radius, under the current date and prize filters. */
  claimCounts: Map<string, number>;
}

/**
 * Game filter for the map: search, on-sale toggle, sort, and grouping by ticket price.
 * Unclaimed-prize counts are statewide and never imply what any store holds.
 */
export function GamePicker({ games, value, onChange, prices, onPricesChange, claimCounts }: GamePickerProps) {
  const labelId = useId();
  const [query, setQuery] = useState('');
  const hasSaleInfo = games.some((g) => g.onSale !== undefined);
  const [onSaleOnly, setOnSaleOnly] = useState(hasSaleInfo);
  const [sort, setSort] = useState<GameSort>(games.some((g) => g.prizes) ? 'unclaimed' : 'claims');
  const [groupByPrice, setGroupByPrice] = useState(true);
  // Price chips are the map's ticket-price filter (they change the map); every other chip
  // only narrows this list. The local state holds the non-price chips.
  const [localSel, setLocalSel] = useState<FacetSelection>({});
  const selection: FacetSelection = useMemo(() => ({ ...localSel, price: prices.map(String) }), [localSel, prices]);
  const setSelection = (next: FacetSelection) => {
    const { price = [], ...rest } = next;
    setLocalSel(rest);
    if (onPricesChange && price.join() !== prices.map(String).join()) onPricesChange(price.map(Number));
  };

  const asOf = games.find((g) => g.prizes)?.prizes?.asOf;
  // Launch ages count back from the prize-table date (else the newest launch), never "today".
  const anchor = asOf ?? games.reduce((m, g) => (g.launchDate && g.launchDate > m ? g.launchDate : m), '0000-01-01');
  const facetList = useMemo(() => buildFacets(games), [games]);
  const ctx = useMemo(() => ({ claimCounts, anchor }), [claimCounts, anchor]);
  const base = useMemo(() => baseFilter(games, query, onSaleOnly, []), [games, query, onSaleOnly]);
  // A chip's count = games left if it were the only choice in its row, given every other row.
  const counts = (key: string, id: string) => {
    const opt = facetList.find((f) => f.key === key)?.options.find((o) => o.id === id);
    return opt ? base.filter((g) => opt.test(g, ctx) && passesFacets(g, facetList, selection, ctx, key)).length : 0;
  };

  const { total, groups } = useMemo(
    () => arrangeGames({
      games, sort, query, onSaleOnly, prices: [], claimCounts, groupByPrice,
      facets: { list: facetList, selection, ctx },
    }),
    [games, sort, query, onSaleOnly, claimCounts, groupByPrice, facetList, selection, ctx],
  );
  const onSaleCount = games.filter((g) => g.onSale).length;
  const shownIds = groups.flatMap((gr) => gr.games.map((g) => g.id));

  const priceText = prices.map((p) => (p === UNKNOWN_PRICE ? 'unknown-price' : `$${p}`)).join(', ');
  const display =
    value.length === 0 ? (prices.length ? `All ${priceText} games` : 'All games') : value.length === 1 ? (games.find((g) => g.id === value[0])?.name ?? '1 game') : `${value.length} games`;

  const rows = (list: GameRef[]) => list.map((g) => <GameRow key={g.id} g={g} claims={claimCounts.get(g.id) ?? 0} sort={sort} />);

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-sm font-medium text-secondary">Game</span>
      <AriaDialogTrigger>
        <AriaButton
          aria-labelledby={labelId} aria-haspopup="dialog"
          className={({ isFocusVisible, isPressed }) => cx(
            'relative flex w-[220px] cursor-pointer items-center gap-2 rounded-lg bg-primary py-2 pr-2.5 pl-3 text-left shadow-xs ring-1 ring-primary outline-hidden transition duration-100 ease-linear ring-inset',
            (isFocusVisible || isPressed) && 'ring-2 ring-brand',
          )}
        >
          <span className="flex-1 truncate text-sm font-medium text-primary">{display}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 stroke-[2.25px] text-fg-quaternary" />
        </AriaButton>
        <AriaPopover
          placement="bottom start" offset={4} containerPadding={8}
          className={({ isEntering, isExiting }) => cx(
            'flex max-h-[75vh] w-[640px] flex-col overflow-hidden rounded-xl bg-primary shadow-lg ring-1 ring-secondary_alt outline-hidden will-change-transform',
            isEntering && 'duration-150 ease-out animate-in fade-in placement-bottom:slide-in-from-top-0.5 placement-top:slide-in-from-bottom-0.5',
            isExiting && 'duration-100 ease-in animate-out fade-out placement-bottom:slide-out-to-top-0.5 placement-top:slide-out-to-bottom-0.5',
          )}
        >
          <AriaDialog aria-label="Choose games" className="flex min-h-0 flex-1 flex-col outline-hidden">
            {({ close }) => (
              <>
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex items-center gap-4">
                    <Input size="sm" icon={SearchLg} placeholder="Search games" autoFocus value={query} onChange={setQuery} className="flex-1" />
                    <Toggle size="sm" label="Group by price" isSelected={groupByPrice} onChange={setGroupByPrice} />
                  </div>
                  <div className="flex items-center gap-3">
                    {hasSaleInfo && (
                      <ButtonGroup
                        size="sm" aria-label="Sale status" disallowEmptySelection selectedKeys={[onSaleOnly ? 'sale' : 'all']}
                        onSelectionChange={(keys) => {
                          const k = [...keys][0];
                          if (k) setOnSaleOnly(k === 'sale');
                        }}
                      >
                        <ButtonGroupItem id="sale" className="selected:bg-tertiary selected:text-primary">
                          On sale now · <span className="tabular">{onSaleCount}</span>
                        </ButtonGroupItem>
                        <ButtonGroupItem id="all" className="selected:bg-tertiary selected:text-primary">
                          All games · <span className="tabular">{games.length}</span>
                        </ButtonGroupItem>
                      </ButtonGroup>
                    )}
                    <Select
                      size="sm" aria-label="Sort games" icon={SwitchVertical01} className="min-w-0 flex-1"
                      items={SORTS.map((s) => ({ id: s.value, label: s.label }))}
                      selectedKey={sort} onSelectionChange={(k) => k && setSort(k as GameSort)}
                    >
                      {(item) => <Select.Item id={item.id} label={item.label} />}
                    </Select>
                  </div>
                  <div className="border-t border-secondary pt-3">
                    <FilterChips facets={facetList} selection={selection} setSelection={setSelection} counts={counts} />
                  </div>
                </div>
                <AriaListBox
                  aria-label="Games" selectionMode="multiple" selectedKeys={new Set(value)}
                  onSelectionChange={(keys) =>
                    onChange(keys === 'all' ? [...new Set([...value, ...shownIds])] : [...keys].map(String))
                  }
                  renderEmptyState={() => <p className="p-4 text-sm text-tertiary">No games match.</p>}
                  className="min-h-30 flex-1 overflow-y-auto border-y border-secondary outline-hidden"
                >
                  {groups.map((gr) =>
                    gr.label ? (
                      <AriaListBoxSection key={gr.key} id={gr.key}>
                        <AriaHeader className="sticky top-0 z-10 border-b border-secondary bg-secondary px-4 py-1.5 text-xs font-semibold text-secondary">
                          {gr.label}
                        </AriaHeader>
                        {rows(gr.games)}
                      </AriaListBoxSection>
                    ) : (
                      rows(gr.games)
                    ),
                  )}
                </AriaListBox>
                <div className="flex flex-col gap-3 p-4">
                  {sort === 'payback' && (
                    <CaveatNote dense>
                      {CAVEATS.evBanner} Estimated from the prize table (PRD formula); anything over 100% is flagged “check
                      inputs” and usually reflects estimation limits. Full detail on the Statewide EV tab.
                    </CaveatNote>
                  )}
                  <CaveatNote dense>
                    {CAVEATS.unclaimedPrizes}{asOf ? ` Prize table as of ${fmtDate(asOf)}.` : ''} “—” means no prize table for that game.
                  </CaveatNote>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-xs text-tertiary tabular">
                      {value.length ? `${value.length} selected` : `No game selected: the map shows ${prices.length ? `all ${priceText} games` : 'all games'}`} · {total} shown
                      {total > 0 && value.length === 0 && Object.values(selection).some((v) => v.length) && ' · Select shown to map them'}
                    </p>
                    <Button size="sm" color="secondary" isDisabled={!shownIds.length}
                      onClick={() => onChange([...new Set([...value, ...shownIds])])}>
                      Select shown
                    </Button>
                    <Button size="sm" color="secondary" isDisabled={!value.length} onClick={() => onChange([])}>Clear</Button>
                    <Button size="sm" color="primary" onClick={close}>Done</Button>
                  </div>
                </div>
              </>
            )}
          </AriaDialog>
        </AriaPopover>
      </AriaDialogTrigger>
    </div>
  );
}
