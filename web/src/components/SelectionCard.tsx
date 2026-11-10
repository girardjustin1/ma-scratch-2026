import { BarChartSquare02, Building02, LinkExternal01, List, MarkerPin01, TrendUp01, ZoomIn } from '@untitledui/icons';
import { Badge, BadgeWithIcon } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { CloseButton } from '@/components/base/buttons/close-button';
import type { Claim, Coverage, GameRef, Retailer, TractMetrics, TractProps } from '../domain/types';
import { LABELS } from '../lib/copy';
import { addDays, fmtDate, fmtInt, fmtShortDate, fmtUsd } from '../lib/format';
import { Card, IncomeValue } from './Basics';

export type PanelTab = 'claims' | 'stores' | 'games' | 'place';

/** Days counted as "recent", back from the end of the listed-date filter. */
export const RECENT_DAYS = 30;

/** Trend window: the last TREND_DAYS vs the TREND_DAYS before, to the end of the date filter. */
export const TREND_DAYS = 90;
export interface StoreTrend { recent: number; prior: number; trending: boolean }

export function recentOf(claims: Claim[], anchor: string) {
  const from = addDays(anchor, -(RECENT_DAYS - 1));
  return claims.filter((c) => c.listedDate >= from && c.listedDate <= anchor).sort((a, b) => (a.listedDate < b.listedDate ? 1 : -1));
}

export const googleMapsSearchUrl = (s: Retailer) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name}, ${s.address}, ${s.town}, MA`)}`;

/** The highlighted "Recent" block: count in the last 30 days and the latest three. */
function Recent({ claims, anchor, games, stores }: { claims: Claim[]; anchor: string; games: Map<string, GameRef>; stores?: Map<string, Retailer> }) {
  const recent = recentOf(claims, anchor);
  return (
    <div className="mt-3 rounded-lg bg-secondary p-3 ring-1 ring-secondary ring-inset">
      <div className="flex items-center gap-2">
        <Badge type="modern" size="sm" color="gray">Recent</Badge>
        <p className="text-xs text-tertiary tabular">
          {fmtInt(recent.length)} listed in the {RECENT_DAYS} days to {fmtShortDate(anchor)}
        </p>
      </div>
      {recent.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {recent.slice(0, 3).map((c) => (
            <li key={c.id} className="flex items-baseline gap-2 text-xs">
              <span className="w-12 shrink-0 text-tertiary tabular">{fmtShortDate(c.listedDate)}</span>
              <span className="min-w-0 flex-1 truncate text-secondary">
                {games.get(c.gameId)?.name}
                {stores && <span className="text-tertiary"> · {stores.get(c.retailerId)?.name}</span>}
              </span>
              <span className="shrink-0 font-semibold text-primary tabular">{fmtUsd(c.prizeAmount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-xs text-tertiary">No listed claims in these {RECENT_DAYS} days.</p>
      )}
    </div>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-1.5 border-t border-secondary pt-3">{children}</div>;
}

interface CommonProps {
  claims: Claim[];
  games: GameRef[];
  /** End of the listed-date filter: "recent" counts back from here, never from today. */
  anchor: string;
  onOpen: (tab: PanelTab) => void;
  onZoom: () => void;
  onClose: () => void;
}

/** Pinned card for a clicked store: identity, counts, recent claims, and actions. */
export function StoreCard({ store, claims, games, anchor, onOpen, onZoom, onClose, trend }: CommonProps & { store: Retailer; trend?: StoreTrend }) {
  const g = new Map(games.map((x) => [x.id, x]));
  const latest = claims.reduce<string | null>((m, c) => (!m || c.listedDate > m ? c.listedDate : m), null);
  return (
    <Card className="w-[320px] p-4 shadow-xl">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-primary">{store.name}</p>
          <p className="truncate text-xs text-tertiary">{store.address}, {store.town}</p>
        </div>
        <CloseButton size="sm" slot={null} onPress={onClose} className="-mt-1.5 -mr-2" />
      </div>
      <div className="mt-3 flex gap-6">
        <div>
          <p className="text-xs text-tertiary">{LABELS.listedClaims}</p>
          <p className="text-lg font-semibold text-primary tabular">{fmtInt(claims.length)}</p>
        </div>
        <div>
          <p className="text-xs text-tertiary">Latest listed</p>
          <p className="text-sm font-medium text-primary tabular">{latest ? fmtDate(latest) : '—'}</p>
        </div>
      </div>
      {trend && (trend.recent > 0 || trend.prior > 0) && (
        <div className="mt-3 flex items-center gap-2 text-xs text-secondary tabular">
          {trend.trending
            ? <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={TrendUp01}>Trending</BadgeWithIcon>
            : <TrendUp01 className="size-3.5 text-fg-quaternary" aria-hidden />}
          {fmtInt(trend.recent)} listed in the last {TREND_DAYS} days vs {fmtInt(trend.prior)} in the {TREND_DAYS} before
        </div>
      )}
      <Recent claims={claims} anchor={anchor} games={g} />
      <Actions>
        <Button size="xs" color="secondary" iconLeading={List} onClick={() => onOpen('claims')}>All claims</Button>
        <Button size="xs" color="secondary" iconLeading={BarChartSquare02} onClick={() => onOpen('games')}>Games</Button>
        <Button size="xs" color="secondary" iconLeading={Building02} onClick={() => onOpen('place')}>Place details</Button>
        <Button size="xs" color="tertiary" iconLeading={ZoomIn} onClick={onZoom}>Zoom</Button>
        <Button size="xs" color="tertiary" iconLeading={LinkExternal01} href={googleMapsSearchUrl(store)} target="_blank" rel="noreferrer">
          Google Maps
        </Button>
      </Actions>
    </Card>
  );
}

/** Pinned card for a clicked tract: the hover facts plus recent claims and actions. */
export function TractCard({
  tract, metrics, coverage, stores, claims, games, anchor, onOpen, onZoom, onClose,
}: CommonProps & { tract: TractProps; metrics: TractMetrics; coverage: Coverage; stores: Retailer[] }) {
  const g = new Map(games.map((x) => [x.id, x]));
  const s = new Map(stores.map((x) => [x.id, x]));
  return (
    <Card className="w-[320px] p-4 shadow-xl">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary">{tract.town}</p>
          <p className="text-xs text-tertiary tabular">{tract.name} · {tract.geoid}</p>
        </div>
        <CloseButton size="sm" slot={null} onPress={onClose} className="-mt-1.5 -mr-2" />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-tertiary">{LABELS.listedClaims}</p>
          <p className="text-lg font-semibold text-primary tabular">{metrics.claims === null ? LABELS.noData : fmtInt(metrics.claims)}</p>
        </div>
        <div>
          <p className="text-xs text-tertiary">Licensed retailers</p>
          <p className="text-lg font-semibold text-primary tabular">{fmtInt(metrics.retailers)}</p>
        </div>
        <div>
          <p className="text-xs text-tertiary">{LABELS.medianIncome}</p>
          <IncomeValue value={metrics.income} moe={metrics.incomeMoe} flag={metrics.incomeFlag} compact />
        </div>
      </div>
      {metrics.claims === null ? (
        <p className="mt-3 text-xs text-tertiary">Outside claims coverage ({coverage.label}): no claims data.</p>
      ) : (
        <Recent claims={claims} anchor={anchor} games={g} stores={s} />
      )}
      <Actions>
        <Button size="xs" color="secondary" iconLeading={List} onClick={() => onOpen('claims')}>All claims</Button>
        <Button size="xs" color="secondary" iconLeading={MarkerPin01} onClick={() => onOpen('stores')}>Stores · {fmtInt(stores.length)}</Button>
        <Button size="xs" color="secondary" iconLeading={BarChartSquare02} onClick={() => onOpen('games')}>Games</Button>
        <Button size="xs" color="tertiary" iconLeading={ZoomIn} onClick={onZoom}>Zoom</Button>
      </Actions>
    </Card>
  );
}
