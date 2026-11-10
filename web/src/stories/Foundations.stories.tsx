import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { AlertTriangle, CheckCircle, Hourglass01, Lock01, Map01, RefreshCw01, SearchLg, Wifi, WifiOff } from '@untitledui/icons';
import { Badge, BadgeWithIcon } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { ProgressBar } from '@/components/base/progress-indicators/progress-indicators';
import { Toggle } from '@/components/base/toggle/toggle';
import { bubbles, brand, chrome, noData, ramps, status } from '../theme/tokens';
import { useMode } from '../theme/mode';
import { CAVEATS, LABELS } from '../lib/copy';
import { Card, SampleTag } from '../components/Basics';

const meta: Meta = { title: 'Foundations/Tokens' };
export default meta;

function Swatch({ fill, label, value, pattern }: { fill: string; label: string; value?: string; pattern?: string }) {
  return (
    <div className="flex w-[104px] flex-col gap-1">
      <div className="h-11 rounded-md ring-1 ring-secondary ring-inset" style={{ background: pattern ?? fill }} />
      <p className="text-xs font-semibold text-primary">{label}</p>
      {(value ?? fill) && <p className="font-mono text-xs break-all text-tertiary">{value ?? fill}</p>}
    </div>
  );
}

function Row({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-md font-semibold text-primary">{title}</h3>
      {note && <p className="mb-2 max-w-[760px] text-xs text-tertiary">{note}</p>}
      <div className="flex flex-wrap gap-3">{children}</div>
    </section>
  );
}

/** Marks a block of colors that may appear on the map and nowhere else. */
function MapOnly() {
  return <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={Map01}>Map only</BadgeWithIcon>;
}

const NEUTRALS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;

const SEMANTIC: { group: string; items: { token: string; label: string }[] }[] = [
  {
    group: 'Surfaces',
    items: [
      { token: '--color-bg-primary', label: 'bg-primary' },
      { token: '--color-bg-secondary', label: 'bg-secondary' },
      { token: '--color-bg-tertiary', label: 'bg-tertiary' },
      { token: '--color-bg-quaternary', label: 'bg-quaternary' },
      { token: '--color-bg-brand-solid', label: 'bg-brand-solid' },
    ],
  },
  {
    group: 'Text and icons',
    items: [
      { token: '--color-text-primary', label: 'text-primary' },
      { token: '--color-text-secondary', label: 'text-secondary' },
      { token: '--color-text-tertiary', label: 'text-tertiary' },
      { token: '--color-text-quaternary', label: 'text-quaternary' },
      { token: '--color-fg-quaternary', label: 'fg-quaternary' },
    ],
  },
  {
    group: 'Borders',
    items: [
      { token: '--color-border-primary', label: 'border-primary' },
      { token: '--color-border-secondary', label: 'border-secondary' },
    ],
  },
];

/** The interface palette: black, white and grays only. */
export const Colors: StoryObj = {
  render: () => {
    const mode = useMode();
    const c = chrome[mode];
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-primary">Interface colors</h2>
          <p className="max-w-[760px] text-sm text-tertiary">
            The interface is black, white and grays only. Every Tailwind and Untitled UI palette, status colors included, is
            remapped to neutral, and brand is near-black (mid-gray in dark mode). Status is told by an icon plus words, never by
            color. The only color in the app is on the map.
          </p>
        </div>
        <Row title="Neutral scale" note="Tailwind neutral, the one gray ramp behind every interface color.">
          {NEUTRALS.map((n) => <Swatch key={n} fill={`var(--color-neutral-${n})`} label={`neutral-${n}`} value="" />)}
        </Row>
        {SEMANTIC.map((g) => (
          <Row key={g.group} title={g.group} note={`Untitled UI semantic tokens, ${mode} mode. They flip with the mode toggle.`}>
            {g.items.map((t) => <Swatch key={t.token} fill={`var(${t.token})`} label={t.label} value={t.token} />)}
          </Row>
        ))}
        <Row title="Chart chrome" note="Grays drawn on canvas and SVG charts (timeline, listing schedule), from theme/tokens.ts.">
          {Object.entries(c).map(([k, v]) => <Swatch key={k} fill={v} label={k} />)}
        </Row>
      </div>
    );
  },
};

export const Typography_: StoryObj = {
  name: 'Typography',
  render: () => (
    <div className="flex max-w-[640px] flex-col gap-3">
      <p className="text-display-xs font-semibold text-primary tabular">text-display-xs · $1,234,567 · 0.18</p>
      <p className="text-lg font-semibold text-primary">text-lg semibold · Statistical exploration</p>
      <p className="text-md font-semibold text-primary">text-md semibold · Income vs listed claims</p>
      <p className="text-md text-primary">text-md · The quick brown fox jumps over the lazy dog.</p>
      <p className="text-sm text-secondary">text-sm · Used in tables, tooltips and controls.</p>
      <p className="text-xs text-tertiary">text-xs · Secondary notes and caveats.</p>
      <p className="text-xs font-semibold text-quaternary">text-xs semibold quaternary · TABLE HEADINGS</p>
      <p className="font-mono text-xs text-tertiary">font-mono · 25017350100</p>
    </div>
  ),
};

/** Buttons, badges, inputs and toggles in their gray treatment. */
export const Controls: StoryObj = {
  render: function ControlsStory() {
    const [on, setOn] = useState(false);
    return (
      <div className="flex max-w-[860px] flex-col gap-6">
        <Row title="Buttons" note="Primary is near-black (mid-gray in dark mode). No colored or destructive variants.">
          <Button size="sm" color="primary">Primary</Button>
          <Button size="sm" color="secondary">Secondary</Button>
          <Button size="sm" color="tertiary" iconLeading={RefreshCw01}>Tertiary</Button>
          <Button size="sm" color="secondary" isDisabled>Disabled</Button>
        </Row>
        <Row title="Badges" note="Every status badge carries an icon and a word. Pairs differ by icon and wording, not color.">
          <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={Wifi}>Online</BadgeWithIcon>
          <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={WifiOff}>Offline</BadgeWithIcon>
          <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={CheckCircle}>Result</BadgeWithIcon>
          <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={Hourglass01}>Insufficient sample</BadgeWithIcon>
          <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={Lock01}>Below data gate</BadgeWithIcon>
          <BadgeWithIcon type="modern" size="sm" color="gray" iconLeading={AlertTriangle}>Very uncertain estimate</BadgeWithIcon>
          <SampleTag />
          <Badge type="pill-color" size="sm" color="gray">Pill</Badge>
        </Row>
        <Row title="Inputs and toggles">
          <div className="w-64"><Input size="sm" label="Search" placeholder="Town or retailer" icon={SearchLg} /></div>
          <div className="w-64"><Input size="sm" label="Disabled" placeholder="Not editable" isDisabled /></div>
          <div className="self-end pb-2"><Toggle size="sm" label="Allow network" isSelected={on} onChange={setOn} /></div>
          <div className="self-end pb-2"><Toggle size="sm" label="Selected" defaultSelected /></div>
        </Row>
        <Row title="Progress" note="Sample gates. The bar stays gray; met or not met is written beside it.">
          <div className="w-80"><ProgressBar value={43} labelPosition="right" /></div>
        </Row>
      </div>
    );
  },
};

/** The only colors in the app. They are painted on the map and its legend, never on interface chrome. */
export const MapColors: StoryObj = {
  name: 'Map colors',
  render: () => {
    const mode = useMode();
    const nd = noData[mode];
    return (
      <div className="flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-primary">Map colors</h2>
            <MapOnly />
          </div>
          <p className="max-w-[760px] text-sm text-tertiary">
            The only colors in the app. They appear on the map (tract fills, retailer bubbles, the pin, low-match outlines) and in
            the map legend's swatches, and nowhere else. Shown for {mode} mode.
          </p>
        </div>
        <Row
          title="Income ramp (5 quantile classes)"
          note="Flipped: the lowest-income class is darkest and the highest-income class lightest. Single blue hue. The class nearest the surface clears 2:1 so it never reads as no data."
        >
          {ramps.income[mode].map((x, i) => (
            <Swatch key={x} fill={x} label={i === 0 ? 'Class 1 · lowest' : i === 4 ? 'Class 5 · highest' : `Class ${i + 1}`} />
          ))}
        </Row>
        <Row
          title="Claims ramp (listed claims, claims per retailer)"
          note="Single orange hue, fewest lightest. Used on the second map in side-by-side, so the two metrics never share a color."
        >
          {ramps.claims[mode].map((x, i) => (
            <Swatch key={x} fill={x} label={i === 0 ? 'Class 1 · fewest' : i === 4 ? 'Class 5 · most' : `Class ${i + 1}`} />
          ))}
        </Row>
        <Row title="No data, bubbles and pin">
          <Swatch fill={nd.fill} label={`${LABELS.noData} (hatched)`} pattern={`repeating-linear-gradient(135deg, ${nd.line} 0 1.5px, ${nd.fill} 1.5px 5px)`} />
          <Swatch fill={bubbles[mode].fill} label="Retailer bubble" />
          <Swatch fill={bubbles[mode].hollow} label="No listed claims (hollow)" />
          <Swatch fill={brand.primary[mode]} label="Pin" />
        </Row>
        <Row title="Low match rate outline" note="Dashed tract outline where under 80% of claims matched a store. Legend pairs it with a warning icon and words.">
          <div className="flex w-[220px] flex-col gap-1">
            <div className="flex h-11 items-center gap-2">
              <div className="h-3 w-[22px] rounded-sm" style={{ border: `2px dashed ${status.warning}` }} />
              <AlertTriangle className="size-3.5 text-fg-quaternary" aria-hidden />
              <span className="text-xs text-secondary">Low match rate (under 80%)</span>
            </div>
            <p className="text-xs font-semibold text-primary">status.warning</p>
            <p className="font-mono text-xs text-tertiary">{status.warning}</p>
          </div>
        </Row>
      </div>
    );
  },
};

export const Wording: StoryObj = {
  render: () => (
    <Card className="max-w-[760px] p-4">
      <h3 className="mb-2 text-md font-semibold text-primary">Canonical labels and caveats (src/lib/copy.ts)</h3>
      <div className="flex flex-col gap-2">
        {Object.entries({ ...LABELS, ...CAVEATS }).map(([k, v]) => (
          <div key={k} className="flex gap-4">
            <span className="w-[150px] shrink-0 font-mono text-xs text-tertiary">{k}</span>
            <span className="text-sm text-secondary">{v}</span>
          </div>
        ))}
      </div>
    </Card>
  ),
};
