/** Quantile class breaks over the non-null values. Returns k-1 upper bounds. */
export function quantileBreaks(values: number[], k = 5): number[] {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return [];
  const breaks: number[] = [];
  for (let i = 1; i < k; i++) {
    const pos = (v.length - 1) * (i / k);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    breaks.push(v[lo] + (v[hi] - v[lo]) * (pos - lo));
  }
  // Collapse duplicate breaks (common with small integer counts).
  return breaks.filter((b, i) => i === 0 || b > breaks[i - 1]);
}

/** Quantile breaks for whole-number counts: rounded, de-duplicated. */
export function countBreaks(values: number[], k = 5): number[] {
  return [...new Set(quantileBreaks(values, k).map(Math.round))].sort((a, b) => a - b);
}

/**
 * Breaks for listed-claim counts. Quantiles collapse when most tracts have 0 or 1 claims
 * (narrow filters), leaving only 3–4 classes; then fixed breaks give the full five:
 * 0 · 1 · 2–3 · 4–9 · 10+.
 */
export function claimCountBreaks(values: number[]): number[] {
  const q = countBreaks(values, 5);
  const max = values.length ? Math.max(...values) : 0;
  return q.length >= 4 || max < 10 ? q : [0, 1, 3, 9];
}

/**
 * Legend label per class. Counts read "3 – 7" with no overlap between classes; with
 * openTop the last class reads "10+" instead of running to the current maximum.
 */
export function classLabels(breaks: number[], min: number, max: number, integer: boolean, fmt: (v: number) => string, openTop = false) {
  const edges = [min, ...breaks, max];
  return edges.slice(0, -1).map((lo, i) => {
    const from = integer && i > 0 ? lo + 1 : lo;
    const to = edges[i + 1];
    if (openTop && i === edges.length - 2 && i > 0) return `${fmt(from)}+`;
    return integer && from >= to ? fmt(to) : `${fmt(from)} – ${fmt(to)}`;
  });
}

export function classOf(value: number, breaks: number[]): number {
  let i = 0;
  while (i < breaks.length && value > breaks[i]) i++;
  return i;
}
