import { CAVEATS, LABELS } from '../lib/copy';
import { fmtDate, fmtInt, fmtRange, fmtShortDate, fmtUsd } from '../lib/format';
import { FeaturedCard } from './FeaturedTickets';
import { A, Block, Callout, ClaimRow, DataTable, P, Shell, Stack, Tag, TicketArt, Tiles, t } from './parts';
import { lotteryGameUrl, mapsUrl } from './links';
import type { Alert, InsightsData } from './types';

const ALERT_TAG: Record<Alert['kind'], string> = {
  big_claim: 'Large listed claim', store_trending: 'Trending store', last_top_prize: 'Top prize', new_game: 'New game', ending_soon: 'Ending soon',
};

export function alertLine(a: Alert): string {
  switch (a.kind) {
    case 'big_claim': return `${fmtUsd(a.prize)} on ${a.game}, listed ${fmtDate(a.listedDate)} at ${a.store}, ${a.town}.`;
    case 'store_trending': return `${a.store}, ${a.town}: ${fmtInt(a.recent)} listed claims vs ${fmtInt(a.prior)} in the earlier half of the range.`;
    case 'last_top_prize': return a.left === 0
      ? `${a.game} ($${a.price}): all ${fmtInt(a.total)} top prizes of ${fmtUsd(a.topPrize)} have been paid out.`
      : `${a.game} ($${a.price}): ${fmtInt(a.left)} of ${fmtInt(a.total)} top prizes of ${fmtUsd(a.topPrize)} left statewide.`;
    case 'new_game': return `${a.game} ($${a.price}) launched ${fmtDate(a.launchDate)}. Top prize ${fmtUsd(a.topPrize)}.`;
    case 'ending_soon': return `${a.game} ($${a.price}) is tagged ending soon by the Lottery. Sales end ${fmtDate(a.endDate)}.`;
  }
}

/** Wording that changes between the weekly and monthly emails. */
const W = {
  week: { kicker: 'Weekly insights', title: 'Your week near the pin', unit: 'week', thisP: 'this week', prior: 'the week before', newTitle: 'New this week', when: 'every Monday' },
  month: { kicker: 'Monthly report', title: 'Your month near the pin', unit: 'month', thisP: 'this month', prior: 'the month before', newTitle: 'New this month', when: 'on the 1st of each month' },
} as const;

const change = (now: number, before: number, prior: string) => {
  if (before === 0) return `none listed ${prior}`;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct === 0 ? 'level with' : pct > 0 ? `up ${pct}% on` : `down ${Math.abs(pct)}% on`} ${prior} (${fmtInt(before)})`;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const insightsSubject = (d: InsightsData) => {
  const label = d.period === 'week' ? 'Weekly insights' : `Monthly report, ${new Date(`${d.from}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
  return `${label}: ${fmtInt(d.totals.claims)} listed claims, ${fmtInt(d.trend.stores.length)} trending store${d.trend.stores.length === 1 ? '' : 's'}`;
};

/**
 * Weekly digest or monthly report for the reader's area. Same sections; the monthly one adds
 * top games, more featured tickets and a +EV summary box. Descriptive only.
 */
export function InsightsEmail(d: InsightsData) {
  const w = W[d.period];
  const { totals: n } = d;
  const isMonth = d.period === 'month';
  return (
    <Shell
      preview={`${fmtRange(d.from, d.to)} · ${d.area}. ${d.alerts[0] ? alertLine(d.alerts[0]) : `${fmtUsd(n.prizeTotal)} in listed prizes.`}`}
      kicker={w.kicker} title={w.title}
      lede={<>Listed dates {fmtRange(d.from, d.to)} · {d.area}</>}
      appUrl={d.appUrl}
      caveats={[CAVEATS.listedOnly, CAVEATS.listedDate, CAVEATS.volumeNotLuck, ...(d.ev ? [CAVEATS.evBanner] : []), CAVEATS.notAdvice]}
      reason={`You get this ${w.when}. It is built on your computer from your saved Lottery data.`}
    >
      <Tiles items={[
        { label: LABELS.listedClaims, value: fmtInt(n.claims), sub: change(n.claims, n.priorClaims, w.prior) },
        { label: 'Listed prizes', value: fmtUsd(n.prizeTotal), sub: 'sum of listed claims' },
        { label: 'Stores with listed claims', value: fmtInt(n.storesWithClaims), sub: `of ${fmtInt(n.licensedStores)} licensed` },
      ]} />

      {d.alerts.length > 0 && (
        <Block title={w.newTitle}>
          {d.alerts.map((a, i) => (
            <div key={i} style={{ padding: '8px 0', borderTop: i ? `1px solid ${t.line}` : undefined, fontSize: 14, lineHeight: 1.45, color: t.ink }}>
              <Tag>{ALERT_TAG[a.kind]}</Tag>
              <div style={{ marginTop: 4 }}>{alertLine(a)}</div>
            </div>
          ))}
        </Block>
      )}

      <Block title={`Largest listed claims ${w.thisP}`}>
        {d.largest.length === 0
          ? <P muted>No listed claims in your area {w.thisP}.</P>
          : d.largest.map((c, i) => (
            <ClaimRow key={`${c.listedDate}-${c.game}-${i}`} first={i === 0}
              art={<TicketArt src={c.image} price={c.price} alt={`${c.game} ticket`} />}
              main={<><A href={c.gameId && lotteryGameUrl(c.gameId)}>{c.game}</A>{c.price != null ? ` · $${c.price}` : ''}</>}
              sub={<><A href={mapsUrl(c.store, c.address, c.town)}>{c.store}, {c.town}</A> · listed {fmtShortDate(c.listedDate)}</>}
              right={fmtUsd(c.prize)} />
          ))}
      </Block>

      {isMonth && d.topGames && d.topGames.length > 0 && (
        <Block title="Top games near you" note="Most listed claims in your area this month.">
          {d.topGames.map((g, i) => (
            <ClaimRow key={g.name} first={i === 0}
              art={<TicketArt src={g.image} price={g.price} alt={`${g.name} ticket`} />}
              main={<A href={g.gameId && lotteryGameUrl(g.gameId)}>{g.name}</A>} sub={g.price != null ? `$${g.price} ticket` : 'Price unknown'}
              right={fmtInt(g.claims)} rightSub={`${fmtUsd(g.prizeTotal)} listed`} />
          ))}
        </Block>
      )}

      <Block title="Trending stores"
        note={<>{fmtRange(d.trend.recentFrom, d.trend.recentTo)} vs {fmtRange(d.trend.priorFrom, d.trend.priorTo)}: at least double the earlier half.</>}>
        <DataTable
          columns={[{ label: 'Store' }, { label: 'Later half', align: 'right' }, { label: 'Earlier half', align: 'right' }]}
          rows={d.trend.stores.map((s) => [<Stack main={<A href={mapsUrl(s.name, s.address, s.town)}>{s.name}</A>} sub={s.town} />, <b>{fmtInt(s.recent)}</b>, fmtInt(s.prior)])}
          empty={`No store met the trending rule ${w.thisP}.`}
        />
      </Block>

      <Block title="🔥 Hottest stores" note={`${fmtInt(d.hottest.min)} or more listed claims over ${d.hottest.period}: the top 3% in your area.`}>
        <DataTable
          columns={[{ label: 'Store' }, { label: 'Listed claims', align: 'right' }]}
          rows={d.hottest.stores.map((s) => [<Stack main={<A href={mapsUrl(s.name, s.address, s.town)}>{s.name}</A>} sub={s.town} />, <b>{fmtInt(s.claims)}</b>])}
          empty="Too few stores in your area to name a top 3%."
        />
      </Block>

      {d.featured.length > 0 && (
        <Block title="Featured tickets" note="Picked by rule: most prizes left, newest, ending soon with top prizes out, highest estimated payback.">
          {d.featured.map((k) => <FeaturedCard key={k.name} k={k} />)}
        </Block>
      )}

      {d.ev && (isMonth ? (
        <Block title="+EV summary" note={`Statewide, prize tables as of ${fmtDate(d.ev.asOf)}.`}>
          <Callout title={`${fmtInt(d.ev.positive)} of ${fmtInt(d.ev.gamesOnSale)} games estimate above 100%; typical payback is ${pct(d.ev.medianPayback)} per $1.`}>
            {fmtInt(d.ev.holdsUp)} still clear 100% without the original jackpot. Every estimate above 100% is flagged “Check inputs”.
          </Callout>
          <div style={{ marginTop: 10 }}>
            <DataTable
              columns={[{ label: 'Game' }, { label: 'Payback', align: 'right' }, { label: 'Excl. jackpot', align: 'right' }]}
              rows={d.ev.best.map((r) => [
                <Stack main={<A href={r.gameId && lotteryGameUrl(r.gameId)}>{r.name}</A>} sub={`$${r.price} ticket`} />,
                <><b>{pct(r.payback)}</b>{r.checkInputs && <div style={{ marginTop: 2 }}><Tag>Check inputs</Tag></div>}</>,
                pct(r.paybackExJackpot),
              ])}
              empty="No game could be estimated."
            />
          </div>
        </Block>
      ) : (
        <Block title="+EV this week">
          <P>
            {fmtInt(d.ev.positive)} of {fmtInt(d.ev.gamesOnSale)} games estimate above 100% ({fmtInt(d.ev.holdsUp)} without the original
            jackpot); typical payback is {pct(d.ev.medianPayback)} per $1. All are flagged “Check inputs”. Details are in the +EV watch email.
          </P>
        </Block>
      ))}

      {d.analysis.length > 0 && (
        <Block title="Analysis">
          {d.analysis.map((a) => (
            <div key={a.title} style={{ marginBottom: 10 }}>
              <Callout title={a.title}>{a.body}</Callout>
            </div>
          ))}
          <P muted>{CAVEATS.association} {CAVEATS.ecological}</P>
        </Block>
      )}
    </Shell>
  );
}
