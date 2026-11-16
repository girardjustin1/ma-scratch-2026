import { AlertTriangle, Beaker02, Calendar, InfoCircle } from '@untitledui/icons';
import { Badge, BadgeWithIcon } from '@/components/base/badges/badges';
import { Tooltip, TooltipTrigger } from '@/components/base/tooltip/tooltip';
import { cx } from '@/utils/cx';
import type { Coverage, IncomeFlag } from '../domain/types';
import { fmtInt, fmtRange, fmtUsd } from '../lib/format';
import { SAMPLE_NOTICE } from '../lib/copy';

/** Inline caveat: icon + muted text. Used under every chart and panel it applies to. */
export function CaveatNote({ children, dense, className }: { children: React.ReactNode; dense?: boolean; className?: string }) {
  return (
    <div className={cx('flex items-start gap-1.5 text-tertiary', className)}>
      <InfoCircle className={cx('shrink-0 text-fg-quaternary', dense ? 'mt-px size-3.5' : 'mt-0.5 size-4')} aria-hidden />
      <p className="text-xs leading-[1.45]">{children}</p>
    </div>
  );
}

/** States the claims coverage area and listed-date window. */
const COVERAGE_TIP = 'Claims data exists only inside this area and date window. Everything else shows as no data.';

/** The data's area and date window. `plain` is one line of small text, for tight rows. */
export function CoverageChip({ coverage, plain = false }: { coverage: Coverage; plain?: boolean }) {
  const text = <>Coverage: {coverage.label} · {fmtRange(coverage.dateFrom, coverage.dateTo)}</>;
  return (
    <Tooltip title={COVERAGE_TIP}>
      <TooltipTrigger className={plain ? 'cursor-default text-xs text-tertiary tabular' : 'cursor-default'}>
        {plain ? text : <BadgeWithIcon type="modern" size="md" color="gray" iconLeading={Calendar}>{text}</BadgeWithIcon>}
      </TooltipTrigger>
    </Tooltip>
  );
}

/** Median household income with its margin of error, always together. */
export function IncomeValue({ value, moe, flag, compact }: { value: number | null; moe: number | null; flag: IncomeFlag; compact?: boolean }) {
  if (value === null || flag === 'suppressed') {
    return (
      <div className="flex items-center gap-1 text-sm text-tertiary">
        <AlertTriangle className="size-4 text-fg-secondary" aria-hidden />
        Estimate suppressed by Census
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-1.5">
      <span className="text-sm font-semibold text-primary tabular">{fmtUsd(value)}</span>
      <span className="text-xs text-tertiary tabular">± {fmtUsd(moe ?? 0)}</span>
      {flag === 'high_moe' && (
        <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={AlertTriangle}>
          {compact ? 'Uncertain' : 'Very uncertain estimate'}
        </BadgeWithIcon>
      )}
    </div>
  );
}

/** Full-width notice stating which data is real and which is sample. */
export function SampleBanner({ text = SAMPLE_NOTICE }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-secondary bg-secondary px-6 py-2 text-sm text-secondary">
      <Beaker02 className="size-4 shrink-0 text-fg-quaternary" aria-hidden />
      {text}
    </div>
  );
}

/** "Sample" tag for any number that is not real data. */
export function SampleTag() {
  return <Badge type="modern" size="sm" color="gray">Sample</Badge>;
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-tertiary">{label}</p>
      <p className="text-display-xs font-semibold text-primary tabular">{typeof value === 'number' ? fmtInt(value) : value}</p>
      {sub && <p className="text-xs text-tertiary">{sub}</p>}
    </div>
  );
}

/** White card with a border: the panel surface used across the app. */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset', className)}>{children}</div>;
}
