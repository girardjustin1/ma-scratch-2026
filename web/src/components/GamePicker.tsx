import { useId, useMemo, useState } from 'react';
import { ChevronDown, SearchLg, SwitchVertical01 } from '@untitledui/icons';
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
    <div className="w-26 shrink-0 text-right whitespace-nowrap">
      <p className={cx('text-sm font-semibold tabular', muted ? 'text-quaternary' : 'text-primary')}>{value}</p>
      <p className="text-xs leading-tight text-tertiary">{label}</p>
    </div>
  );
}

function GameRow({ g, claims }: { g: GameRef; claims: number }) {
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <AriaText slot="label" className="truncate text-sm font-medium text-primary">{g.name}</AriaText>
              {g.onSale === false && <Badge type="modern" size="sm" color="gray">Not on sale</Badge>}
            </div>
            <AriaText slot="description" className="block truncate text-xs text-tertiary">{meta}</AriaText>
          </div>
          <Metric value={p ? fmtInt(p.remainingOver600) : '—'} label="unclaimed >$600" muted={!p} />
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
  const labelId = useId();
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
  const shownIds = groups.flatMap((gr) => gr.games.map((g) => g.id));

  const display =
    value.length === 0 ? 'All games' : value.length === 1 ? (games.find((g) => g.id === value[0])?.name ?? '1 game') : `${value.length} games`;

  const rows = (list: GameRef[]) => list.map((g) => <GameRow key={g.id} g={g} claims={claimCounts.get(g.id) ?? 0} />);

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
                  {prices.length > 0 && (
                    <p className="text-xs text-tertiary">
                      Showing {prices.map((p) => (p === UNKNOWN_PRICE ? 'unknown-price' : `$${p}`)).join(', ')} games, set by the Ticket price filter.
                    </p>
                  )}
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
                  <CaveatNote dense>
                    {CAVEATS.unclaimedPrizes}{asOf ? ` Prize table as of ${fmtDate(asOf)}.` : ''} “—” means no prize table for that game.
                  </CaveatNote>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-xs text-tertiary tabular">
                      {value.length ? `${value.length} selected` : 'No game selected: the map shows all games'} · {total} shown
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
