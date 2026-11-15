import { useState } from 'react';
import { Table } from '@/components/application/table/table';
import { Badge } from '@/components/base/badges/badges';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { cx } from '@/utils/cx';
import { BUCKETS, bucketCounts } from '../domain/prizeBuckets';
import type { Game, PrizeTier } from '../domain/types';
import type { GamePace, PaceData } from '../domain/pace';
import type { BucketId } from '../domain/prizeBuckets';
import { GamePaceBlock } from './GamePace';
import { CAVEATS } from '../lib/copy';
import { fmtDate, fmtInt, fmtUsd } from '../lib/format';
import { Card, CaveatNote } from './Basics';
import { TicketThumb } from './GamePicker';

const RIGHT_HEAD = '[&>div]:justify-end text-right';
const RIGHT = 'text-right tabular';

/** Gray bar for the share still left: monochrome, the number beside it carries the value. */
function LeftBar({ left, total }: { left: number; total: number }) {
  const share = total > 0 ? left / total : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-tertiary" aria-hidden>
        <span className="block h-full rounded-full bg-fg-secondary" style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
      <span className="w-10 text-right text-xs text-tertiary tabular">{Math.round(share * 100)}%</span>
    </div>
  );
}

/**
 * Every prize level of one game, statewide: printed, paid out, and still left, plus a
 * summary by prize bucket. "Left" = not yet paid out (unsold, or sold but not cashed).
 */
export function PrizeTierTable({ game, tiers, asOf, image, pace, paceData }: {
  game: Game; tiers: PrizeTier[]; asOf: string; image?: string | null;
  /** This game's pace and the typical ranges (local data only); no pace block without them. */
  pace?: GamePace | null; paceData?: PaceData;
}) {
  const [view, setView] = useState<'tiers' | 'buckets'>('buckets');
  const [paceBucket, setPaceBucket] = useState<BucketId>('b10k');
  const mine = tiers.filter((t) => t.gameId === game.id).sort((a, b) => b.value - a.value);
  const counts = bucketCounts(mine);
  const buckets = BUCKETS.filter((b) => counts[b.id].total > 0);
  const totalLeft = mine.reduce((s, t) => s + t.remaining, 0);
  const totalAll = mine.reduce((s, t) => s + t.total, 0);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-4">
        <TicketThumb src={image} className="h-14 w-28" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-primary">{game.name}: prizes left</h2>
          <p className="text-xs text-tertiary tabular">
            ${game.price} ticket · launched {fmtDate(game.launchDate)} · {fmtInt(totalLeft)} of {fmtInt(totalAll)} prizes still left ·
            prize table as of {fmtDate(asOf)}
          </p>
        </div>
        <ButtonGroup size="sm" aria-label="Prize view" disallowEmptySelection selectedKeys={[view]}
          onSelectionChange={(k) => { const v = [...k][0]; if (v) setView(v as 'tiers' | 'buckets'); }}>
          <ButtonGroupItem id="buckets" className="selected:bg-tertiary selected:text-primary">By prize size</ButtonGroupItem>
          <ButtonGroupItem id="tiers" className="selected:bg-tertiary selected:text-primary">Every prize level</ButtonGroupItem>
        </ButtonGroup>
      </div>

      <div className="mt-4">
        {view === 'buckets' ? (
          <Table aria-label={`${game.name} prizes left by size`} size="sm">
            <Table.Header className="bg-transparent">
              <Table.Head id="bucket" label="Prize size" isRowHeader />
              <Table.Head id="total" label="Printed" className={RIGHT_HEAD} />
              <Table.Head id="paid" label="Paid out" className={RIGHT_HEAD} />
              <Table.Head id="left" label="Left" className={RIGHT_HEAD} />
              <Table.Head id="share" label="Share left" className={RIGHT_HEAD} />
            </Table.Header>
            <Table.Body>
              {buckets.map((b) => {
                const c = counts[b.id];
                return (
                  <Table.Row key={b.id} id={b.id} className={cx(b.id === 'top' && 'bg-secondary')}>
                    <Table.Cell className="font-medium text-primary">{b.label}</Table.Cell>
                    <Table.Cell className={RIGHT}>{fmtInt(c.total)}</Table.Cell>
                    <Table.Cell className={RIGHT}>{fmtInt(c.total - c.left)}</Table.Cell>
                    <Table.Cell className={cx(RIGHT, 'font-semibold text-primary')}>{fmtInt(c.left)}</Table.Cell>
                    <Table.Cell><LeftBar left={c.left} total={c.total} /></Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table aria-label={`${game.name} prizes left by prize level`} size="sm">
              <Table.Header className="sticky top-0 z-10">
                <Table.Head id="prize" label="Prize" isRowHeader />
                <Table.Head id="total" label="Printed" className={RIGHT_HEAD} />
                <Table.Head id="paid" label="Paid out" className={RIGHT_HEAD} />
                <Table.Head id="left" label="Left" className={RIGHT_HEAD} />
                <Table.Head id="share" label="Share left" className={RIGHT_HEAD} />
              </Table.Header>
              <Table.Body>
                {mine.map((t, i) => (
                  <Table.Row key={`${t.value}-${i}`} id={`${t.value}-${i}`} className={cx(t.isLaunchTopPrize && 'bg-secondary')}>
                    <Table.Cell className="font-medium text-primary tabular">
                      <span className="flex items-center gap-2">
                        {fmtUsd(t.value)}
                        {t.isLaunchTopPrize && <Badge type="modern" size="sm" color="gray">Top prize</Badge>}
                      </span>
                    </Table.Cell>
                    <Table.Cell className={RIGHT}>{fmtInt(t.total)}</Table.Cell>
                    <Table.Cell className={RIGHT}>{fmtInt(t.total - t.remaining)}</Table.Cell>
                    <Table.Cell className={cx(RIGHT, 'font-semibold text-primary')}>{fmtInt(t.remaining)}</Table.Cell>
                    <Table.Cell><LeftBar left={t.remaining} total={t.total} /></Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </div>
      {pace && paceData && <GamePaceBlock pace={pace} data={paceData} bucket={paceBucket} onBucket={setPaceBucket} />}
      <CaveatNote className="mt-3">
        “Left” means not yet paid out: on tickets still for sale, or sold but not yet cashed. {CAVEATS.unclaimedPrizes.split('. ').slice(-1)[0]}
      </CaveatNote>
    </Card>
  );
}
