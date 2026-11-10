// Design tokens. Every color in the app comes from here so the look can be tuned in
// one place. Choropleth ramps were checked with the dataviz palette validator
// (ordinal mode, light and dark surfaces): one hue, monotone lightness, visible step
// gaps, and the class nearest the surface clears 2:1 so it never reads as "no data".

export type Mode = 'light' | 'dark';

export const chrome = {
  light: {
    page: '#f9f9f7',
    surface: '#fcfcfb',
    surfaceRaised: '#ffffff',
    ink: '#0b0b0b',
    inkSecondary: '#52514e',
    inkMuted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    border: 'rgba(11,11,11,0.10)',
    mapBackground: '#eef0ee',
    outline: '#9a9890',
  },
  dark: {
    page: '#0d0d0d',
    surface: '#1a1a19',
    surfaceRaised: '#222220',
    ink: '#f0efec',
    inkSecondary: '#c3c2b7',
    inkMuted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    border: 'rgba(255,255,255,0.10)',
    mapBackground: '#141413',
    outline: '#5d5c57',
  },
} as const;

/**
 * Five quantile classes per metric, indexed low → high. Claims run light → dark. Income is
 * flipped (owner's call, 2026-11-10): the lowest-income class is darkest, richest lightest.
 * Same validated steps, reversed order.
 */
export const ramps = {
  income: {
    light: ['#0d366b', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef'],
    dark: ['#184f95', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6'],
  },
  claims: {
    light: ['#f29f72', '#ec7f4c', '#d95f2b', '#a8441a', '#73300f'],
    dark: ['#f8c3a5', '#f29f72', '#e6743f', '#c4521f', '#9a3d16'],
  },
} as const;

/** Hatch used for tracts with no data. Never the lowest class color. */
export const noData = {
  light: { fill: '#f1f0ec', line: '#b9b7af' },
  dark: { fill: '#1f1f1d', line: '#4a4945' },
} as const;

/**
 * Retailer bubbles. `ramp` colors listed claims per store in five classes (low → high),
 * validated in ordinal mode against the map background (light #eef0ee, dark #141413):
 * one hue, monotone lightness, visible steps, light end clears 2:1. Groups of stores
 * (clusters, zoomed out) use the same ramp on their average per store, so a color always
 * means the same thing. `hollow` = a licensed store with no listed claims.
 */
export const bubbles = {
  light: { ramp: ['#a08fec', '#8169e2', '#6750d4', '#4c36ad', '#30207a'], stroke: '#ffffff', hollow: '#52514e' },
  dark: { ramp: ['#d4ccfa', '#b3a5f4', '#9180ea', '#7059dc', '#5541c4'], stroke: '#1a1a19', hollow: '#c3c2b7' },
} as const;

/**
 * The search pin: a location-style blue dot with a white ring and a pulse. The white ring
 * and shadow keep it readable on the blue income tracts and the purple bubbles.
 */
export const pin = { light: '#1a73e8', dark: '#4c8df6' } as const;

/** Bubble radius (px) per class: five sizes far enough apart to read without a key. */
export const bubbleRadii = [4, 6, 8.5, 11.5, 15] as const;

/** Reserved for state (never a data series); always shown with an icon + label. */
export const status = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

export const brand = {
  /** UI accent: violet, chosen so it never collides with either map ramp. */
  primary: { light: '#5b48d0', dark: '#9085e9' },
} as const;

export const fonts = {
  sans: '"Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export const radii = { sm: 6, md: 10, lg: 14 } as const;
