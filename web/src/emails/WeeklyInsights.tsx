import { CAVEATS, LABELS } from '../lib/copy';
import { fmtDate, fmtInt, fmtRange, fmtShortDate, fmtUsd } from '../lib/format';
import { Block, Callout, DataTable, P, Shell, Stack, Tag, Tiles, t } from './parts';
import type { Alert, WeeklyInsightsData } from './types';

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

const change = (now: number, before: number) => {
  if (before === 0) return 'no listed claims the week before';
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct === 0 ? 'level with' : pct > 0 ? `up ${pct}% on` : `down ${Math.abs(pct)}% on`} the week before (${fmtInt(before)})`;
};

export const weeklySubject = (d: WeeklyInsightsData) =>
  `Weekly insights: ${fmtInt(d.totals.claims)} listed claims, ${fmtInt(d.trend.stores.length)} trending store${d.trend.stores.length === 1 ? '' : 's'}`;

/** Weekly trends and analysis for the reader's area. Descriptive only. */
export function WeeklyInsightsEmail(d: WeeklyInsightsData) {
  const { totals: n } = d;
  return (
    <Shell
      preview={`${fmtRange(d.weekFrom, d.weekTo)} · ${d.area}. ${d.alerts[0] ? alertLine(d.alerts[0]) : `${fmtUsd(n.prizeTotal)} in listed prizes.`}`}
      kicker="Weekly insights" title="Trends near your pin"
      lede={<>Listed dates {fmtRange(d.weekFrom, d.weekTo)} · {d.area}</>}
      appUrl={d.appUrl}
      caveats={[CAVEATS.listedOnly, CAVEATS.listedDate, CAVEATS.volumeNotLuck, CAVEATS.notAdvice]}
      reason="You get this every Monday. It is built on your computer from your saved Lottery data."
    >
      <Tiles items={[
        { label: LABELS.listedClaims, value: fmtInt(n.claims), sub: change(n.claims, n.priorClaims) },
        { label: 'Listed prizes', value: fmtUsd(n.prizeTotal), sub: 'sum of listed claims' },
        { label: 'Stores with listed claims', value: fmtInt(n.storesWithClaims), sub: `of ${fmtInt(n.licensedStores)} licensed` },
      ]} />

      {d.alerts.length > 0 && (
        <Block title="New this week">
          {d.alerts.map((a, i) => (
            <div key={i} style={{ padding: '8px 0', borderTop: i ? `1px solid ${t.line}` : undefined, fontSize: 14, lineHeight: 1.45, color: t.ink }}>
              <Tag>{ALERT_TAG[a.kind]}</Tag>
              <div style={{ marginTop: 4 }}>{alertLine(a)}</div>
            </div>
          ))}
        </Block>
      )}

      <Block title="Trending stores"
        note={<>{fmtRange(d.trend.recentFrom, d.trend.recentTo)} vs {fmtRange(d.trend.priorFrom, d.trend.priorTo)}: at least double the earlier half.</>}>
        <DataTable
          columns={[{ label: 'Store' }, { label: 'Later half', align: 'right' }, { label: 'Earlier half', align: 'right' }]}
          rows={d.trend.stores.map((s) => [
            <Stack main={s.name} sub={s.town} />, <b>{fmtInt(s.recent)}</b>, fmtInt(s.prior),
          ])}
          empty="No store met the trending rule this week."
        />
      </Block>

      <Block title="🔥 Hottest stores" note={`${fmtInt(d.hottest.min)} or more listed claims over ${d.hottest.period}: the top 3% in your area.`}>
        <DataTable
          columns={[{ label: 'Store' }, { label: 'Listed claims', align: 'right' }]}
          rows={d.hottest.stores.map((s) => [<Stack main={s.name} sub={s.town} />, <b>{fmtInt(s.claims)}</b>])}
          empty="Too few stores in your area to name a top 3%."
        />
      </Block>

      <Block title="Largest listed claims this week">
        <DataTable
          columns={[{ label: LABELS.listedDate }, { label: 'Game' }, { label: 'Prize', align: 'right' }]}
          rows={d.largest.map((c) => [
            <span style={{ whiteSpace: 'nowrap' }}>{fmtShortDate(c.listedDate)}</span>,
            <Stack main={`${c.game}${c.price != null ? ` · $${c.price}` : ''}`} sub={`${c.store}, ${c.town}`} />,
            <b>{fmtUsd(c.prize)}</b>,
          ])}
          empty="No listed claims in your area this week."
        />
      </Block>

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
