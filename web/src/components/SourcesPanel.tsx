import { RefreshCw01, Wifi, WifiOff } from '@untitledui/icons';
import { BadgeWithIcon } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Toggle } from '@/components/base/toggle/toggle';
import { Table, TableCard } from '@/components/application/table/table';
import { fmtDate, fmtInt } from '../lib/format';

export interface SourceRow {
  id: string;
  label: string;
  origin: string;
  lastFetched: string;
  rows: number;
}

/** Network state for the header: told apart by icon and word, never by color. */
export function OnlineChip({ online }: { online: boolean }) {
  return (
    <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={online ? Wifi : WifiOff}>
      {online ? 'Online' : 'Offline'}
    </BadgeWithIcon>
  );
}

/** Per-source refresh. Nothing fetches unless the user presses a button while online. */
export function SourcesPanel({ sources, online, onToggleOnline, onRefresh }: {
  sources: readonly SourceRow[];
  online: boolean;
  onToggleOnline: (v: boolean) => void;
  onRefresh?: (id: string) => void;
}) {
  return (
    <TableCard.Root size="sm" className="max-w-[860px]">
      <TableCard.Header
        title="Data sources"
        description="The app starts offline. Official sources only: Mass Lottery and the Census Bureau."
        contentTrailing={
          <div className="flex items-center gap-3 md:self-center">
            <OnlineChip online={online} />
            <Toggle size="sm" label="Allow network" isSelected={online} onChange={onToggleOnline} />
          </div>
        }
      />
      <Table aria-label="Data sources">
        <Table.Header>
          <Table.Head id="dataset" label="Dataset" isRowHeader className="px-5" />
          <Table.Head id="origin" label="Source" className="px-5" />
          <Table.Head id="rows" label="Rows" className="px-5 [&>div]:justify-end" />
          <Table.Head id="lastFetched" label="Last fetched" className="px-5" />
          <Table.Head id="refresh" className="px-5"><span className="sr-only">Refresh</span></Table.Head>
        </Table.Header>
        <Table.Body items={sources} dependencies={[online, onRefresh]}>
          {(s) => (
            <Table.Row id={s.id}>
              <Table.Cell className="font-medium text-primary">{s.label}</Table.Cell>
              <Table.Cell>{s.origin}</Table.Cell>
              <Table.Cell className="text-right tabular">{fmtInt(s.rows)}</Table.Cell>
              <Table.Cell className="tabular">{fmtDate(s.lastFetched)}</Table.Cell>
              <Table.Cell className="text-right">
                <Button size="sm" color="tertiary" iconLeading={RefreshCw01} isDisabled={!online} onPress={() => onRefresh?.(s.id)}>
                  Refresh
                </Button>
              </Table.Cell>
            </Table.Row>
          )}
        </Table.Body>
      </Table>
    </TableCard.Root>
  );
}
