import { AlertTriangle } from '@untitledui/icons';
import type { Coverage, TractMetrics, TractProps } from '../domain/types';
import { LABELS } from '../lib/copy';
import { fmtInt, fmtPct, fmtRange } from '../lib/format';
import { Card, IncomeValue } from './Basics';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-xs text-tertiary">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

const muted = (s: string) => <span className="text-sm text-quaternary">{s}</span>;
const val = (s: string, strong?: boolean) => (
  <span className={strong ? 'text-sm font-semibold text-primary tabular' : 'text-sm text-primary tabular'}>{s}</span>
);

/** Hover/tap card for one tract. Never shows EV. Missing coverage reads "No data". */
export function TractTooltip({ tract, metrics, coverage }: { tract: TractProps; metrics: TractMetrics; coverage: Coverage }) {
  return (
    <Card className="w-[270px] p-4 shadow-lg">
      <p className="text-sm font-semibold text-primary">{tract.town}</p>
      <p className="text-xs text-tertiary tabular">{tract.name} · {tract.geoid}</p>
      <div className="my-3 border-t border-secondary" />
      <div className="flex flex-col gap-1.5">
        <Row label={LABELS.listedClaims}>
          {metrics.claims === null ? muted(LABELS.noData) : val(fmtInt(metrics.claims), true)}
        </Row>
        <Row label="Listed dates">
          {metrics.firstListed && metrics.lastListed
            ? val(fmtRange(metrics.firstListed, metrics.lastListed))
            : muted('—')}
        </Row>
        <Row label="Licensed retailers">{val(fmtInt(metrics.retailers))}</Row>
        <Row label={LABELS.claimsPerRetailer}>
          {metrics.perRetailer === null
            ? muted(metrics.claims === null ? LABELS.noData : LABELS.notDefined)
            : val(metrics.perRetailer.toFixed(2))}
        </Row>
        <Row label={LABELS.medianIncome}>
          <IncomeValue value={metrics.income} moe={metrics.incomeMoe} flag={metrics.incomeFlag} compact />
        </Row>
      </div>
      {metrics.lowMatch && metrics.townMatchRate !== null && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-secondary p-2">
          <AlertTriangle className="mt-px size-4 shrink-0 text-fg-secondary" aria-hidden />
          <p className="text-xs leading-[1.45] text-secondary">
            Low match rate: only {fmtPct(metrics.townMatchRate)} of {tract.town}’s listed claims matched a store, so this count is low.
          </p>
        </div>
      )}
      <div className="my-3 border-t border-secondary" />
      <p className="text-xs text-tertiary">
        {metrics.covered ? `Inside claims coverage (${coverage.label})` : 'Outside claims coverage: no claims data'}
      </p>
    </Card>
  );
}
