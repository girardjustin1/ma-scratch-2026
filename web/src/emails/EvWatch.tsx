import { CAVEATS } from '../lib/copy';
import { fmtDate, fmtInt, fmtSignedUsdCents } from '../lib/format';
import { A, Block, Callout, DataTable, P, Shell, Stack, Tag, Tiles, t } from './parts';
import { lotteryGameUrl } from './links';
import type { EvRow, EvWatchData } from './types';

const pct = (v: number) => `${Math.round(v * 100)}%`;

const game = (r: EvRow) => (
  <Stack main={<A href={r.gameId && lotteryGameUrl(r.gameId)}>{r.name}</A>} sub={`$${r.price} ticket · ${fmtSignedUsdCents(r.evAll)} per ticket`} />
);

export const evSubject = (d: EvWatchData) =>
  `+EV watch: ${d.positive.length} estimate${d.positive.length === 1 ? '' : 's'} above 100%, typical payback ${pct(d.medianPayback)}`;

/**
 * Statewide expected value: the highest estimated paybacks and every estimate above 100%.
 * A positive estimate is always flagged and explained; it is never presented as a sure thing.
 */
export function EvWatchEmail(d: EvWatchData) {
  // Holds up = still above 100% with the original jackpot left out: the sturdier estimates.
  const holdsUp = d.positive.filter((r) => r.paybackExJackpot >= 1);
  const jackpotOnly = d.positive.filter((r) => r.paybackExJackpot < 1);
  return (
    <Shell
      preview={`${d.positive.length} of ${d.gamesOnSale} games estimate above 100%. Typical payback is ${pct(d.medianPayback)} per $1.`}
      kicker="+EV watch" title="Biggest +EV estimates"
      lede={<>Prize tables as of {fmtDate(d.asOf)} · {fmtInt(d.gamesOnSale)} games on sale · statewide</>}
      appUrl={d.appUrl} cta="Open Statewide EV"
      caveats={[
        'Estimated payback = prizes still listed ÷ estimated tickets left. Claims lag sales, tickets printed is approximate, and annuity prizes use the advertised value.',
        'Taxes are not included. Games can close early.',
        CAVEATS.notAdvice,
      ]}
      reason="You get this when the weekly prize tables are refreshed. It is built on your computer from your saved Lottery data."
    >
      <div style={{ padding: `20px ${t.pad}px 0` }}>
        <Callout title={CAVEATS.evBanner}>
          The same estimate applies to every store in the state. It cannot tell you where a winning ticket is.
        </Callout>
      </div>

      <Tiles items={[
        { label: 'Typical payback per $1', value: pct(d.medianPayback), sub: 'median estimate' },
        { label: 'Estimates above 100%', value: fmtInt(d.positive.length), sub: 'all flagged below' },
        { label: 'Hold up without jackpot', value: fmtInt(holdsUp.length), sub: 'the sturdier ones' },
      ]} />

      <Block title="Hold up without the jackpot"
        note="Still above 100% when the original top prize is left out. These depend least on one big unclaimed prize.">
        <DataTable
          columns={[{ label: 'Game' }, { label: 'Payback', align: 'right' }, { label: 'Excl. jackpot', align: 'right' }]}
          rows={holdsUp.map((r) => [
            game(r),
            <><b>{pct(r.payback)}</b><div style={{ marginTop: 2 }}><Tag>Check inputs</Tag></div></>,
            <b>{pct(r.paybackExJackpot)}</b>,
          ])}
          empty="None this week. Every estimate above 100% depends on an unclaimed original jackpot."
        />
        {holdsUp.map((r) => <P key={r.name} muted><b>{r.name}:</b> {r.why}</P>)}
      </Block>

      <Block title="Above 100% only with the jackpot" note="These drop below 100% once the original top prize is left out. Treat them as artefacts until checked.">
        <DataTable
          columns={[{ label: 'Game' }, { label: 'Payback', align: 'right' }, { label: 'Excl. jackpot', align: 'right' }]}
          rows={jackpotOnly.map((r) => [
            <><Stack main={<A href={r.gameId && lotteryGameUrl(r.gameId)}>{r.name}</A>} sub={`$${r.price} ticket · ${r.why}`} /></>,
            <><b>{pct(r.payback)}</b><div style={{ marginTop: 2 }}><Tag>Check inputs</Tag></div></>,
            pct(r.paybackExJackpot),
          ])}
          empty="None this week."
        />
      </Block>

      <Block title="Highest estimated payback" note="Best first, across all games on sale.">
        <DataTable
          columns={[{ label: 'Game' }, { label: 'Payback', align: 'right' }, { label: 'Excl. jackpot', align: 'right' }]}
          rows={d.best.map((r) => [
            game(r),
            <><b>{pct(r.payback)}</b>{r.checkInputs && <div style={{ marginTop: 2 }}><Tag>Check inputs</Tag></div>}</>,
            pct(r.paybackExJackpot),
          ])}
          empty="No game could be estimated this week."
        />
      </Block>

      <Block title="Prizes paid out since last time" note={`Changes in prizes left between ${fmtDate(d.previousAsOf)} and ${fmtDate(d.asOf)}.`}>
        <DataTable
          columns={[{ label: 'Game' }, { label: 'Prize size' }, { label: 'Left', align: 'right' }]}
          rows={d.movers.map((m) => [
            <Stack main={m.name} sub={`$${m.price} ticket`} />,
            m.size,
            <><b>{fmtInt(m.after)}</b> <span style={{ color: t.muted }}>of {fmtInt(m.total)} (was {fmtInt(m.before)})</span></>,
          ])}
          empty="No change in the large prizes left."
        />
      </Block>
    </Shell>
  );
}
