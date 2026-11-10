import { CheckCircle, Hourglass01, Lock01 } from '@untitledui/icons';
import { BadgeWithIcon } from '@/components/base/badges/badges';
import { ProgressBarBase } from '@/components/base/progress-indicators/progress-indicators';
import { cx } from '@/utils/cx';
import type { StatResult } from '../domain/types';
import { CAVEATS } from '../lib/copy';
import { fmtInt } from '../lib/format';
import { Card, CaveatNote, SampleTag } from './Basics';

/** Progress toward one sample gate. Met or not is told by icon and words; the bar is gray either way. */
function GateBar({ label, required, have }: { label: string; required: number; have: number }) {
  const met = have >= required;
  const Icon = met ? CheckCircle : Hourglass01;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
          <Icon className="size-3.5 shrink-0 text-fg-quaternary" aria-hidden />
          {label}
          <span className="font-normal text-tertiary">· {met ? 'met' : 'not met'}</span>
        </span>
        <span className="text-xs text-tertiary tabular">{fmtInt(have)} of {fmtInt(required)} needed</span>
      </div>
      <ProgressBarBase
        value={Math.min(100, (have / required) * 100)}
        className="mt-1.5 h-1.5"
        progressClassName={met ? 'bg-fg-brand-primary' : 'bg-fg-quaternary'}
      />
    </div>
  );
}

const p = (x: number) => (x < 0.001 ? '< 0.001' : x.toFixed(3));

function Figure({ label, children, large }: { label: string; children: React.ReactNode; large?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-tertiary">{label}</p>
      <p className={cx('text-primary tabular', large ? 'text-display-xs font-semibold' : 'text-sm')}>{children}</p>
    </div>
  );
}

/** One statistical question: a result above its sample gate, otherwise why not. */
export function StatCard({ stat, sample }: { stat: StatResult; sample?: boolean }) {
  const met = stat.gate.have >= stat.gate.required && !!stat.result;
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-md font-semibold text-primary">{stat.question}</h3>
          <p className="text-xs text-tertiary">Unit: {stat.unit}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {sample && <SampleTag />}
          <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={met ? CheckCircle : Hourglass01}>
            {met ? 'Result' : 'Insufficient sample'}
          </BadgeWithIcon>
        </div>
      </div>
      {met && stat.result ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <Figure label={stat.result.effectLabel} large>{stat.result.effect.toFixed(2)}</Figure>
            <Figure label="95% interval">{stat.result.ciLow.toFixed(2)} to {stat.result.ciHigh.toFixed(2)}</Figure>
            <Figure label="n">{fmtInt(stat.result.n)}</Figure>
            <Figure label="p (raw · BH-adjusted)">{p(stat.result.pRaw)} · {p(stat.result.pAdjusted)}</Figure>
          </div>
          <p className="mt-3 text-sm text-secondary">{stat.result.summary}</p>
        </div>
      ) : (
        <div className="mt-4">
          <p className="mb-3 text-sm text-secondary">
            Needs at least {fmtInt(stat.gate.required)} {stat.gate.label}; the current data has {fmtInt(stat.gate.have)}. No number is shown until the sample can support one.
          </p>
          <GateBar label={stat.gate.label} required={stat.gate.required} have={stat.gate.have} />
        </div>
      )}
      <div className="mt-auto pt-4">
        <p className="mb-1 text-xs text-tertiary">Method: {stat.method}</p>
        <CaveatNote dense>{CAVEATS.association} {stat.id.startsWith('income') ? CAVEATS.ecological : ''}</CaveatNote>
      </div>
    </Card>
  );
}

export interface MlGate {
  weeks: { required: number; have: number };
  tracts: { required: number; have: number };
  claims: { required: number; have: number };
}

export function MlGatePanel({ gate }: { gate: MlGate }) {
  const met = Object.values(gate).every((g) => g.have >= g.required);
  return (
    <Card className="max-w-[720px] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary">Exploratory model</h2>
        <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={met ? CheckCircle : Lock01}>
          {met ? 'Gate met' : 'Below data gate'}
        </BadgeWithIcon>
      </div>
      <p className="mt-1 text-sm text-secondary">
        Asks whether place features (income, households, retailer count, town) explain tract-week listed claims better than
        simple baselines. It does not forecast winning stores.
      </p>
      <div className="my-4 flex flex-col gap-3">
        <GateBar label="weeks of listed claims" {...gate.weeks} />
        <GateBar label="covered tracts" {...gate.tracts} />
        <GateBar label="listed claims" {...gate.claims} />
      </div>
      {!met && (
        <CaveatNote>
          No model is shown. Three weeks leaves one holdout week, and one small area cannot form independent town groups for
          validation, so any score would mostly measure noise.
        </CaveatNote>
      )}
    </Card>
  );
}
