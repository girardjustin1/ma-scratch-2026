import { Img } from '@react-email/components';
import { CAVEATS } from '../lib/copy';
import { fmtCompactUsd, fmtDate, fmtInt } from '../lib/format';
import { A, Block, Callout, Shell, SmallLink, Tag, t } from './parts';
import { lotteryGameUrl } from './links';
import type { FeaturedTicket, FeaturedTicketsData } from './types';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const share = (left: number, total: number) => (total > 0 ? ` (${Math.round((left / total) * 100)}%)` : '');

function Cell({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <td width="50%" style={{ padding: '8px 12px 8px 0', verticalAlign: 'top' }}>
      <div style={{ fontSize: 12, color: t.muted }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: t.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: t.muted }}>{sub}</div>}
    </td>
  );
}

/** One featured ticket: art, why it was picked, prizes left, estimated payback, nearby claims. */
export function FeaturedCard({ k }: { k: FeaturedTicket }) {
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td width={132} style={{ verticalAlign: 'top', paddingRight: 14 }}>
              {k.image
                ? <Img src={k.image} alt={`${k.name} ticket`} width={132} height={66} style={{ borderRadius: 6, border: `1px solid ${t.line}`, display: 'block' }} />
                : <div style={{ width: 132, height: 66, borderRadius: 6, backgroundColor: t.panel, border: `1px solid ${t.line}`, textAlign: 'center', lineHeight: '66px', fontSize: 18, fontWeight: 600, color: t.muted }}>${k.price}</div>}
            </td>
            <td style={{ verticalAlign: 'top' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: t.ink, lineHeight: 1.3 }}><A href={k.gameId && lotteryGameUrl(k.gameId)}>{k.name}</A></div>
              <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>
                ${k.price} ticket · launched {fmtDate(k.launchDate)} · top prize {fmtCompactUsd(k.topPrize)}
              </div>
              {k.tags.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {k.tags.map((tag) => <span key={tag} style={{ marginRight: 4 }}><Tag>{tag}</Tag> </span>)}
                </div>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ margin: '12px 0 4px', fontSize: 14, lineHeight: 1.45, color: t.secondary }}><b style={{ color: t.ink }}>Why it’s here:</b> {k.why}</p>
      {k.gameId && (
        <div style={{ margin: '2px 0 4px' }}>
          <SmallLink href={lotteryGameUrl(k.gameId)}>Game page, prizes left and odds</SmallLink>
        </div>
      )}
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <Cell label="Top prizes left" value={`${fmtInt(k.topLeft)} of ${fmtInt(k.topTotal)}`} sub="statewide" />
            <Cell label="Prizes over $600 left" value={fmtInt(k.leftOver600)} sub={`of ${fmtInt(k.totalOver600)}${share(k.leftOver600, k.totalOver600)}`} />
          </tr>
          <tr>
            <Cell label="Est. payback per $1"
              value={k.payback === null ? '—' : <>{pct(k.payback)} {k.checkInputs && <Tag>Check inputs</Tag>}</>}
              sub={k.paybackExJackpot === null ? 'not enough data to estimate' : `${pct(k.paybackExJackpot)} excl. original jackpot`} />
            <Cell label="Listed claims near you" value={fmtInt(k.claimsNearby)} sub="last 30 listed days" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export const featuredSubject = (d: FeaturedTicketsData) =>
  `Featured tickets: ${d.tickets.slice(0, 2).map((k) => k.name).join(', ')}${d.tickets.length > 2 ? ` and ${d.tickets.length - 2} more` : ''}`;

/** A handful of games worth a look this week, each with why it was picked and its numbers. */
export function FeaturedTicketsEmail(d: FeaturedTicketsData) {
  return (
    <Shell
      preview={`${d.tickets.length} of ${d.gamesOnSale} games on sale, picked for prizes left, launch date and estimated payback.`}
      kicker="Featured tickets" title="Tickets worth a look this week"
      lede={<>Prize tables as of {fmtDate(d.asOf)} · {fmtInt(d.gamesOnSale)} games on sale · {d.area}</>}
      appUrl={d.appUrl} cta="Open the game list"
      caveats={[CAVEATS.unclaimedPrizes, CAVEATS.evBanner, 'An estimate above 100% is flagged “Check inputs”: it usually reflects the limits of the estimate, not a sure thing.', CAVEATS.notAdvice]}
      reason="You get this when the weekly prize tables are refreshed. It is built on your computer from your saved Lottery data."
    >
      <Block title={`${d.tickets.length} featured`} note="Picked by rule: most prizes left, newest, ending soon with top prizes out, and highest estimated payback.">
        {d.tickets.length === 0
          ? <Callout title="Nothing stood out this week">No game met a featuring rule. The full list is in the explorer.</Callout>
          : d.tickets.map((k) => <FeaturedCard key={k.name} k={k} />)}
      </Block>
    </Shell>
  );
}
