// Date helpers work on ISO calendar dates (YYYY-MM-DD) only. The data has no times of
// day, so nothing here formats hours or minutes.

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtUsd = (n: number) => usd0.format(n);
export const fmtUsdCents = (n: number) => usd2.format(n);
export const fmtSignedUsdCents = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + usd2.format(Math.abs(n));
export const fmtInt = (n: number) => int.format(n);
export const fmtCompactUsd = (n: number) => '$' + compact.format(n);
export const fmtPct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

function parse(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export const fmtDate = (iso: string) =>
  parse(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export const fmtShortDate = (iso: string) =>
  parse(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const fmtWeekday = (iso: string) =>
  parse(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

export const fmtRange = (from: string, to: string) => `${fmtShortDate(from)} – ${fmtDate(to)}`;

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}
