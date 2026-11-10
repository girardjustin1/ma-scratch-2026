import { CAVEATS } from '../lib/copy';
import { fmtInt, fmtRange, fmtShortDate, fmtUsd } from '../lib/format';
import { A, Block, ClaimRow, P, Shell, SmallLink, TicketArt, Tiles } from './parts';
import { lotteryGameUrl, mapsUrl } from './links';
import type { NearbyAlertData, NearbyClaim } from './types';

const BANDS = [
  { max: 1, label: 'Within 1 mile' },
  { max: 2, label: '1 to 2 miles' },
  { max: 3, label: '2 to 3 miles' },
] as const;

const bandOf = (miles: number) => BANDS.findIndex((b) => miles <= b.max);
const mi = (m: number) => `${m.toFixed(1)} mi`;

export const nearbySubject = (d: NearbyAlertData) => {
  const top = [...d.claims].sort((a, b) => b.prize - a.prize)[0];
  return d.claims.length === 1 && top
    ? `Nearby: ${fmtUsd(top.prize)} on ${top.game}, ${mi(top.miles)} from your pin`
    : `Nearby: ${fmtInt(d.claims.length)} listed claims within ${d.radiusMiles} mi${top ? `, largest ${fmtUsd(top.prize)}` : ''}`;
};

function Row({ c, first }: { c: NearbyClaim; first: boolean }) {
  return (
    <ClaimRow first={first}
      art={<TicketArt src={c.image} price={c.price} alt={`${c.game} ticket`} />}
      main={<><A href={c.gameId && lotteryGameUrl(c.gameId)}>{c.game}</A>{c.price != null ? ` · $${c.price}` : ''}</>}
      sub={<>
        <A href={mapsUrl(c.store, c.address, c.town)}>{c.store} · {c.address}, {c.town}</A><br />Listed {fmtShortDate(c.listedDate)}
        <div style={{ marginTop: 4 }}>
          <SmallLink href={mapsUrl(c.store, c.address, c.town)}>Map</SmallLink>
          {c.gameId && <SmallLink href={lotteryGameUrl(c.gameId)}>Game page</SmallLink>}
        </div>
      </>}
      right={fmtUsd(c.prize)} rightSub={mi(c.miles)} />
  );
}

/**
 * Sent when the Lottery lists claims at stores within the reader's alert radius (1, 2 or 3
 * miles from their pin), nearest band first. The store is where the ticket was sold.
 */
export function NearbyAlertEmail(d: NearbyAlertData) {
  const bands = BANDS.filter((b) => b.max <= d.radiusMiles)
    .map((b, i) => ({ ...b, claims: d.claims.filter((c) => bandOf(c.miles) === i).sort((x, y) => x.miles - y.miles) }));
  const total = d.claims.reduce((s, c) => s + c.prize, 0);
  return (
    <Shell
      preview={d.claims.length
        ? `${fmtInt(d.claims.length)} listed within ${d.radiusMiles} mi, nearest ${mi(Math.min(...d.claims.map((c) => c.miles)))} away. ${fmtUsd(total)} in listed prizes.`
        : `No listed claims within ${d.radiusMiles} mi.`}
      kicker="Nearby alert"
      title={d.claims.length === 1 ? `A claim was listed ${mi(d.claims[0].miles)} from your pin` : `${fmtInt(d.claims.length)} claims listed within ${d.radiusMiles} mi of your pin`}
      lede={<>Listed dates {fmtRange(d.from, d.to)} · alert radius {d.radiusMiles} mi</>}
      appUrl={d.appUrl} cta="See them on the map"
      caveats={[
        'Each claim is placed at the store that sold the ticket. Distance is a straight line from your pin to that store.',
        CAVEATS.listedDate,
        'A listed claim means a prize was paid. It does not mean more winning tickets are at that store.',
        CAVEATS.notAdvice,
      ]}
      reason={`You get this when a claim over $600 is listed within ${d.radiusMiles} mi of your pin. Change the radius (1, 2 or 3 mi) in the explorer.`}
    >
      <Tiles items={bands.map((b) => ({ label: b.label, value: fmtInt(b.claims.length), sub: b.claims.length ? `${fmtUsd(b.claims.reduce((s, c) => s + c.prize, 0))} listed` : 'none' }))} />
      {bands.filter((b) => b.claims.length > 0).map((b) => (
        <Block key={b.label} title={b.label}>
          {b.claims.map((c, i) => <Row key={`${c.store}-${c.listedDate}-${c.game}-${i}`} c={c} first={i === 0} />)}
        </Block>
      ))}
      {d.claims.length === 0 && (
        <Block title="Nothing new nearby">
          <P>No claims over $600 were listed within {d.radiusMiles} mi of your pin for these dates.</P>
        </Block>
      )}
    </Shell>
  );
}
