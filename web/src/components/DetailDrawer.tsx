import { Dialog, Modal, ModalOverlay } from '@/components/application/slideout-menus/slideout-menu';
import { Table } from '@/components/application/table/table';
import { CloseButton } from '@/components/base/buttons/close-button';
import type { Claim, Coverage, GameRef, Retailer, TractMetrics, TractProps } from '../domain/types';
import { CAVEATS, LABELS } from '../lib/copy';
import { fmtDate, fmtInt, fmtUsd } from '../lib/format';
import { CaveatNote, IncomeValue, Stat } from './Basics';

export interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  tract?: TractProps;
  metrics?: TractMetrics;
  claims: Claim[];
  games: GameRef[];
  retailers: Retailer[];
  coverage: Coverage;
  inline?: boolean;
}

// The drawer is narrow, so the claims table uses tighter padding than Untitled UI's default.
const HEAD = 'px-2 py-2 first:pl-0 last:pr-0';
const CELL = 'px-2 py-2 first:pl-0 last:pr-0 align-top';
const RIGHT = 'text-right [&>div]:justify-end';

export function DetailBody({ tract, metrics, claims, games, retailers, coverage, onClose }: Omit<DetailDrawerProps, 'open' | 'inline'>) {
  if (!tract || !metrics) return null;
  const game = new Map(games.map((g) => [g.id, g]));
  const store = new Map(retailers.map((r) => [r.id, r]));
  const rows = [...claims].sort((a, b) => (a.listedDate < b.listedDate ? 1 : -1));
  return (
    <div className="w-[460px] max-w-full bg-primary p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-primary">{tract.town}</h2>
          <p className="text-xs text-tertiary">{tract.name} · {tract.geoid} · {tract.county}</p>
        </div>
        {/* slot={null}: closes through onClose both standalone (Storybook) and inside the slideout. */}
        <CloseButton size="sm" slot={null} onPress={onClose} className="-mt-1 -mr-2 shrink-0" />
      </div>
      <div className="my-4 flex flex-wrap gap-6">
        <Stat label={LABELS.listedClaims} value={metrics.claims === null ? LABELS.noData : metrics.claims} />
        <Stat label="Licensed retailers" value={metrics.retailers} />
        <div>
          <p className="text-xs font-medium text-tertiary">{LABELS.medianIncome}</p>
          <div className="mt-1.5"><IncomeValue value={metrics.income} moe={metrics.incomeMoe} flag={metrics.incomeFlag} /></div>
        </div>
      </div>
      {metrics.claims === null ? (
        <CaveatNote>This tract is outside claims coverage ({coverage.label}). {CAVEATS.coverage}</CaveatNote>
      ) : (
        <>
          <Table aria-label={`Listed claims in ${tract.town}`} size="sm">
            <Table.Header className="h-auto bg-transparent">
              <Table.Head id="date" label={LABELS.listedDate} isRowHeader className={HEAD} />
              <Table.Head id="game" label="Game" className={HEAD} />
              <Table.Head id="price" label="Price" className={`${HEAD} ${RIGHT}`} />
              <Table.Head id="prize" label="Prize" className={`${HEAD} ${RIGHT}`} />
              <Table.Head id="retailer" label="Retailer" className={HEAD} />
            </Table.Header>
            <Table.Body
              renderEmptyState={() => <p className="py-3 text-sm text-tertiary">No listed claims in the current filters.</p>}
            >
              {rows.map((c) => {
                const g = game.get(c.gameId);
                return (
                  <Table.Row key={c.id} id={c.id} className="h-auto">
                    <Table.Cell className={`${CELL} whitespace-nowrap tabular`}>{fmtDate(c.listedDate)}</Table.Cell>
                    <Table.Cell className={`${CELL} text-secondary [overflow-wrap:anywhere]`}>{g?.name}</Table.Cell>
                    <Table.Cell className={`${CELL} text-right tabular`}>{g?.price != null ? `$${g.price}` : '—'}</Table.Cell>
                    <Table.Cell className={`${CELL} text-right font-medium text-primary tabular`}>{fmtUsd(c.prizeAmount)}</Table.Cell>
                    <Table.Cell className={`${CELL} [overflow-wrap:anywhere]`}>{store.get(c.retailerId)?.name}</Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
          <CaveatNote className="mt-3">{fmtInt(rows.length)} listed claims. {CAVEATS.listedDate}</CaveatNote>
        </>
      )}
    </div>
  );
}

/**
 * Right-hand slideout built from Untitled UI's SlideoutMenu parts. Modal, like the MUI
 * drawer it replaces: the backdrop or Escape closes it, and the map waits underneath.
 */
export function DetailDrawer(props: DetailDrawerProps) {
  return (
    <ModalOverlay isOpen={props.open} onOpenChange={(o) => !o && props.onClose()} isDismissable className="z-50">
      <Modal className="w-auto max-w-[min(460px,100vw)]">
        <Dialog aria-label={props.tract ? `${props.tract.town}: tract details` : 'Tract details'} className="gap-0">
          <DetailBody {...props} />
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
