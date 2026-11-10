import { useMemo, useState } from 'react';
import { SearchLg } from '@untitledui/icons';
import { Tabs } from '@/components/application/tabs/tabs';
import { Table } from '@/components/application/table/table';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/buttons/../button-group/button-group';
import { Button } from '@/components/base/buttons/button';
import { CloseButton } from '@/components/base/buttons/close-button';
import { Input } from '@/components/base/input/input';
import { cx } from '@/utils/cx';
import type { Claim, Coverage, GameRef, Retailer, TractMetrics, TractProps } from '../domain/types';
import { CAVEATS, LABELS } from '../lib/copy';
import { addDays, fmtDate, fmtInt, fmtUsd } from '../lib/format';
import { CaveatNote, IncomeValue, Stat } from './Basics';
import { Chip } from './Chip';
import { RECENT_DAYS, type PanelTab } from './SelectionCard';

export type PanelContext =
  | { kind: 'tract'; tract: TractProps; metrics: TractMetrics; stores: Retailer[] }
  | { kind: 'store'; store: Retailer; tract?: TractProps };

export interface DetailPanelProps {
  context: PanelContext;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onClose: () => void;
  /** Listed claims for this tract or store, already under the map's filters. */
  claims: Claim[];
  games: GameRef[];
  retailers: Retailer[];
  coverage: Coverage;
  /** End of the listed-date filter; "recent" counts back from here. */
  anchor: string;
  onSelectStore?: (id: string) => void;
  /** Content for the Place tab (store only), e.g. Google details. */
  placeSlot?: React.ReactNode;
}

const HEAD = 'px-2 py-2 first:pl-0 last:pr-0';
const CELL = 'px-2 py-2 first:pl-0 last:pr-0 align-top';
const RIGHT = 'text-right [&>div]:justify-end';

type Recency = '30' | '90' | 'all';
type Band = 'low' | 'mid' | 'high';
const BANDS: { id: Band; label: string; test: (v: number) => boolean }[] = [
  { id: 'low', label: '$601 – $999', test: (v) => v < 1000 },
  { id: 'mid', label: '$1K – $9,999', test: (v) => v >= 1000 && v < 10_000 },
  { id: 'high', label: '$10K and up', test: (v) => v >= 10_000 },
];
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Claims tab: filters for this place, then the table. Recent rows carry a left bar. */
function ClaimsTab({ claims, games, retailers, anchor, showStore, gameFilter, setGameFilter }: {
  claims: Claim[]; games: Map<string, GameRef>; retailers: Map<string, Retailer>; anchor: string; showStore: boolean;
  gameFilter: string[]; setGameFilter: (g: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [recency, setRecency] = useState<Recency>('all');
  const [stores, setStores] = useState<string[]>([]);
  const [prices, setPrices] = useState<number[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [sort, setSort] = useState<'newest' | 'largest'>('newest');
  const recentFrom = addDays(anchor, -(RECENT_DAYS - 1));

  const pass = (c: Claim, skip?: string) => {
    const g = games.get(c.gameId);
    const q = query.trim().toLowerCase();
    return (
      (!q || `${g?.name ?? ''} ${retailers.get(c.retailerId)?.name ?? ''}`.toLowerCase().includes(q)) &&
      (recency === 'all' || c.listedDate >= addDays(anchor, -(Number(recency) - 1))) &&
      (skip === 'store' || !stores.length || stores.includes(c.retailerId)) &&
      (skip === 'price' || !prices.length || (g?.price != null && prices.includes(g.price))) &&
      (skip === 'band' || !bands.length || BANDS.some((b) => bands.includes(b.id) && b.test(c.prizeAmount))) &&
      (!gameFilter.length || gameFilter.includes(c.gameId))
    );
  };
  const rows = claims.filter((c) => pass(c)).sort((a, b) =>
    sort === 'largest' ? b.prizeAmount - a.prizeAmount || (a.listedDate < b.listedDate ? 1 : -1) : a.listedDate < b.listedDate ? 1 : -1,
  );
  const count = (skip: string, test: (c: Claim) => boolean) => claims.filter((c) => pass(c, skip) && test(c)).length;
  const storeIds = [...new Set(claims.map((c) => c.retailerId))].sort((a, b) =>
    claims.filter((c) => c.retailerId === b).length - claims.filter((c) => c.retailerId === a).length);
  const priceList = [...new Set(claims.map((c) => games.get(c.gameId)?.price).filter((p): p is number => p != null))].sort((a, b) => a - b);
  const active = (query ? 1 : 0) + (recency !== 'all' ? 1 : 0) + stores.length + prices.length + bands.length + gameFilter.length;
  const total = rows.reduce((s, c) => s + c.prizeAmount, 0);

  return (
    <div className="flex flex-col gap-3">
      <Input size="sm" icon={SearchLg} placeholder={showStore ? 'Search games or stores' : 'Search games'} value={query} onChange={setQuery} />
      <div className="flex flex-wrap items-center gap-2">
        <ButtonGroup size="sm" aria-label="Recency" disallowEmptySelection selectedKeys={[recency]}
          onSelectionChange={(k) => { const v = [...k][0]; if (v) setRecency(v as Recency); }}>
          <ButtonGroupItem id="30" className="selected:bg-tertiary selected:text-primary">Last 30 days</ButtonGroupItem>
          <ButtonGroupItem id="90" className="selected:bg-tertiary selected:text-primary">Last 90 days</ButtonGroupItem>
          <ButtonGroupItem id="all" className="selected:bg-tertiary selected:text-primary">All in range</ButtonGroupItem>
        </ButtonGroup>
        <ButtonGroup size="sm" aria-label="Sort" disallowEmptySelection selectedKeys={[sort]}
          onSelectionChange={(k) => { const v = [...k][0]; if (v) setSort(v as 'newest' | 'largest'); }}>
          <ButtonGroupItem id="newest" className="selected:bg-tertiary selected:text-primary">Newest</ButtonGroupItem>
          <ButtonGroupItem id="largest" className="selected:bg-tertiary selected:text-primary">Largest</ButtonGroupItem>
        </ButtonGroup>
      </div>
      <div className="grid grid-cols-[64px_1fr] items-start gap-x-3 gap-y-2">
        {showStore && storeIds.length > 1 && (
          <>
            <span className="pt-1 text-xs font-medium text-tertiary">Store</span>
            <div className="flex flex-wrap gap-1.5">
              {storeIds.map((id) => (
                <Chip key={id} label={retailers.get(id)?.name ?? id} selected={stores.includes(id)}
                  count={count('store', (c) => c.retailerId === id)} onToggle={() => setStores(toggle(stores, id))} />
              ))}
            </div>
          </>
        )}
        <span className="pt-1 text-xs font-medium text-tertiary">Price</span>
        <div className="flex flex-wrap gap-1.5">
          {priceList.map((p) => (
            <Chip key={p} label={`$${p}`} selected={prices.includes(p)}
              count={count('price', (c) => games.get(c.gameId)?.price === p)} onToggle={() => setPrices(toggle(prices, p))} />
          ))}
        </div>
        <span className="pt-1 text-xs font-medium text-tertiary">Prize</span>
        <div className="flex flex-wrap gap-1.5">
          {BANDS.map((b) => (
            <Chip key={b.id} label={b.label} selected={bands.includes(b.id)}
              count={count('band', (c) => b.test(c.prizeAmount))} onToggle={() => setBands(toggle(bands, b.id))} />
          ))}
        </div>
        {gameFilter.length > 0 && (
          <>
            <span className="pt-1 text-xs font-medium text-tertiary">Game</span>
            <div className="flex flex-wrap gap-1.5">
              {gameFilter.map((id) => (
                <Chip key={id} label={games.get(id)?.name ?? id} selected count={claims.filter((c) => c.gameId === id).length}
                  onToggle={() => setGameFilter(gameFilter.filter((g) => g !== id))} />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-secondary pt-3">
        <p className="flex-1 text-xs text-tertiary tabular">
          {fmtInt(rows.length)} of {fmtInt(claims.length)} listed claims · {fmtUsd(total)} in listed prizes
        </p>
        {active > 0 && (
          <Button size="sm" color="link-gray" onClick={() => {
            setQuery(''); setRecency('all'); setStores([]); setPrices([]); setBands([]); setGameFilter([]);
          }}>Clear filters</Button>
        )}
      </div>
      <Table aria-label="Listed claims" size="sm">
        <Table.Header className="h-auto bg-transparent">
          <Table.Head id="date" label={LABELS.listedDate} isRowHeader className={HEAD} />
          <Table.Head id="game" label="Game" className={HEAD} />
          <Table.Head id="price" label="Price" className={`${HEAD} ${RIGHT}`} />
          <Table.Head id="prize" label="Prize" className={`${HEAD} ${RIGHT}`} />
          {showStore ? <Table.Head id="retailer" label="Retailer" className={HEAD} /> : <Table.Head id="pad" className="w-0 p-0" />}
        </Table.Header>
        <Table.Body renderEmptyState={() => <p className="py-3 text-sm text-tertiary">No listed claims match these filters.</p>}>
          {rows.map((c) => {
            const g = games.get(c.gameId);
            const recent = c.listedDate >= recentFrom && c.listedDate <= anchor;
            return (
              <Table.Row key={c.id} id={c.id} className={cx('h-auto', recent && 'bg-secondary [&>td:first-child]:shadow-[inset_3px_0_0_0_var(--color-fg-secondary)]')}>
                <Table.Cell className={cx(CELL, 'whitespace-nowrap tabular', recent && 'font-medium text-primary first:pl-2.5')}>{fmtDate(c.listedDate)}</Table.Cell>
                <Table.Cell className={`${CELL} text-secondary [overflow-wrap:anywhere]`}>{g?.name}</Table.Cell>
                <Table.Cell className={`${CELL} text-right tabular`}>{g?.price != null ? `$${g.price}` : '—'}</Table.Cell>
                <Table.Cell className={`${CELL} text-right font-medium text-primary tabular`}>{fmtUsd(c.prizeAmount)}</Table.Cell>
                {showStore
                  ? <Table.Cell className={`${CELL} [overflow-wrap:anywhere]`}>{retailers.get(c.retailerId)?.name}</Table.Cell>
                  : <Table.Cell className="w-0 p-0" />}
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table>
      <CaveatNote>Shaded rows were listed in the {RECENT_DAYS} days to {fmtDate(anchor)}. {CAVEATS.listedDate}</CaveatNote>
    </div>
  );
}

/** Games tab: one row per game here. Clicking a game filters the Claims tab to it. */
function GamesTab({ claims, games, onPick }: { claims: Claim[]; games: Map<string, GameRef>; onPick: (id: string) => void }) {
  const rows = [...claims.reduce((m, c) => {
    const r = m.get(c.gameId) ?? { id: c.gameId, n: 0, max: 0, latest: '' };
    r.n += 1; r.max = Math.max(r.max, c.prizeAmount); if (c.listedDate > r.latest) r.latest = c.listedDate;
    return m.set(c.gameId, r);
  }, new Map<string, { id: string; n: number; max: number; latest: string }>()).values()].sort((a, b) => b.n - a.n || (a.latest < b.latest ? 1 : -1));
  return (
    <div className="flex flex-col gap-3">
      <Table aria-label="Games with listed claims here" size="sm" onRowAction={(k) => onPick(String(k))}>
        <Table.Header className="h-auto bg-transparent">
          <Table.Head id="game" label="Game" isRowHeader className={HEAD} />
          <Table.Head id="n" label="Listed" className={`${HEAD} ${RIGHT}`} />
          <Table.Head id="max" label="Largest" className={`${HEAD} ${RIGHT}`} />
          <Table.Head id="latest" label="Latest listed" className={HEAD} />
        </Table.Header>
        <Table.Body renderEmptyState={() => <p className="py-3 text-sm text-tertiary">No listed claims here in the current filters.</p>}>
          {rows.map((r) => {
            const g = games.get(r.id);
            return (
              <Table.Row key={r.id} id={r.id} className="h-auto cursor-pointer">
                <Table.Cell className={`${CELL} [overflow-wrap:anywhere]`}>
                  <span className="text-primary">{g?.name}</span>
                  <span className="block text-xs text-tertiary">{g?.price != null ? `$${g.price}` : 'Price unknown'}</span>
                </Table.Cell>
                <Table.Cell className={`${CELL} text-right font-medium text-primary tabular`}>{fmtInt(r.n)}</Table.Cell>
                <Table.Cell className={`${CELL} text-right tabular`}>{fmtUsd(r.max)}</Table.Cell>
                <Table.Cell className={`${CELL} whitespace-nowrap tabular`}>{fmtDate(r.latest)}</Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table>
      <CaveatNote>Click a game to see its listed claims here.</CaveatNote>
    </div>
  );
}

/** Stores tab (tract only): every licensed store here, busiest first. */
function StoresTab({ stores, claims, onSelect }: { stores: Retailer[]; claims: Claim[]; onSelect?: (id: string) => void }) {
  const stat = (id: string) => {
    const mine = claims.filter((c) => c.retailerId === id);
    return { n: mine.length, latest: mine.reduce((m, c) => (c.listedDate > m ? c.listedDate : m), '') };
  };
  const rows = stores.map((s) => ({ s, ...stat(s.id) })).sort((a, b) => b.n - a.n);
  return (
    <ul className="flex flex-col divide-y divide-secondary">
      {rows.map(({ s, n, latest }) => (
        <li key={s.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-primary">{s.name}</p>
            <p className="truncate text-xs text-tertiary">{s.address} · {latest ? `latest ${fmtDate(latest)}` : 'no listed claims'}</p>
          </div>
          <span className="w-12 text-right text-sm font-semibold text-primary tabular">{fmtInt(n)}</span>
          {onSelect && <Button size="xs" color="secondary" onClick={() => onSelect(s.id)}>View</Button>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Right-hand tool panel for the selected tract or store. Not modal: the map stays usable
 * while it is open. Tabs: Claims (with filters), Stores (tract), Games, Place (store).
 */
export function DetailPanel(props: DetailPanelProps) {
  const { context, tab, onTab, onClose, claims, games, retailers, coverage, anchor, onSelectStore, placeSlot } = props;
  const g = useMemo(() => new Map(games.map((x) => [x.id, x])), [games]);
  const r = useMemo(() => new Map(retailers.map((x) => [x.id, x])), [retailers]);
  const [gameFilter, setGameFilter] = useState<string[]>([]);
  const isTract = context.kind === 'tract';
  const outside = isTract && context.metrics.claims === null;
  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'claims', label: 'Claims' },
    ...(isTract ? [{ id: 'stores' as const, label: `Stores · ${context.stores.length}` }] : []),
    { id: 'games', label: 'Games' },
    ...(!isTract ? [{ id: 'place' as const, label: 'Place' }] : []),
  ];

  return (
    <aside className="flex h-full w-[480px] max-w-full flex-col border-l border-secondary bg-primary shadow-xl" aria-label="Details">
      <div className="flex items-start gap-3 px-5 pt-5">
        <div className="min-w-0 flex-1">
          {isTract ? (
            <>
              <h2 className="text-lg font-semibold text-primary">{context.tract.town}</h2>
              <p className="text-xs text-tertiary">{context.tract.name} · {context.tract.geoid} · {context.tract.county}</p>
            </>
          ) : (
            <>
              <h2 className="truncate text-lg font-semibold text-primary">{context.store.name}</h2>
              <p className="truncate text-xs text-tertiary">{context.store.address}, {context.store.town}{context.tract ? ` · ${context.tract.name}` : ''}</p>
            </>
          )}
        </div>
        <CloseButton size="sm" slot={null} onPress={onClose} className="-mt-1 -mr-2 shrink-0" />
      </div>
      {isTract && (
        <div className="flex flex-wrap gap-6 px-5 pt-4">
          <Stat label={LABELS.listedClaims} value={context.metrics.claims === null ? LABELS.noData : context.metrics.claims} />
          <Stat label="Licensed retailers" value={context.metrics.retailers} />
          <div>
            <p className="text-xs font-medium text-tertiary">{LABELS.medianIncome}</p>
            <div className="mt-1.5"><IncomeValue value={context.metrics.income} moe={context.metrics.incomeMoe} flag={context.metrics.incomeFlag} /></div>
          </div>
        </div>
      )}
      <Tabs selectedKey={tab} onSelectionChange={(k) => onTab(k as PanelTab)} className="mt-4 min-h-0 flex-1">
        <Tabs.List type="underline" size="sm" className="px-5" items={tabs}>
          {(t) => <Tabs.Item id={t.id} label={t.label} />}
        </Tabs.List>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-secondary px-5 py-4">
          <Tabs.Panel id="claims">
            {outside ? (
              <CaveatNote>This tract is outside claims coverage ({coverage.label}). {CAVEATS.coverage}</CaveatNote>
            ) : (
              <ClaimsTab claims={claims} games={g} retailers={r} anchor={anchor} showStore={isTract}
                gameFilter={gameFilter} setGameFilter={setGameFilter} />
            )}
          </Tabs.Panel>
          {isTract && (
            <Tabs.Panel id="stores">
              <StoresTab stores={context.stores} claims={claims} onSelect={onSelectStore} />
            </Tabs.Panel>
          )}
          <Tabs.Panel id="games">
            <GamesTab claims={claims} games={g} onPick={(id) => { setGameFilter([id]); onTab('claims'); }} />
          </Tabs.Panel>
          {!isTract && <Tabs.Panel id="place">{placeSlot}</Tabs.Panel>}
        </div>
      </Tabs>
    </aside>
  );
}
