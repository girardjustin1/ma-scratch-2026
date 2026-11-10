// SYNTHETIC sample data for the email stories. Store names, games and every number here
// are made up; none of it describes real Lottery activity. Real emails are built from the
// local data on the owner's computer and are never committed.

import type { EvWatchData, FeaturedTicketsData, WeeklyInsightsData } from './types';

const base = { appUrl: 'http://127.0.0.1:5180', area: '5 mi around your pin' };

/** Gray placeholder "ticket art" so the stories show the image layout without real art. */
const art = (label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="264" height="132"><rect width="264" height="132" fill="#e5e5e5"/><rect x="8" y="8" width="248" height="116" fill="none" stroke="#a3a3a3" stroke-dasharray="6 5"/><text x="132" y="74" font-family="Helvetica,Arial,sans-serif" font-size="22" font-weight="700" fill="#525252" text-anchor="middle">${label}</text></svg>`,
  )}`;

export const weekly: WeeklyInsightsData = {
  ...base,
  weekFrom: '2026-11-02', weekTo: '2026-11-08',
  alerts: [
    { kind: 'big_claim', prize: 100000, game: 'Maple Millions', store: 'Sample Variety 12', town: 'Everett', listedDate: '2026-11-05' },
    { kind: 'last_top_prize', game: 'Lighthouse Loot', price: 10, topPrize: 1000000, left: 1, total: 4 },
    { kind: 'new_game', game: 'Winter Wonders', price: 5, topPrize: 100000, launchDate: '2026-11-03' },
  ],
  totals: { claims: 187, priorClaims: 164, prizeTotal: 412500, storesWithClaims: 96, licensedStores: 512 },
  trend: {
    recentFrom: '2026-05-11', recentTo: '2026-11-08', priorFrom: '2025-11-09', priorTo: '2026-05-10',
    stores: [
      { name: 'Demo Market 7', town: 'Revere', recent: 17, prior: 4 },
      { name: 'Sample Convenience 31', town: 'Malden', recent: 13, prior: 5 },
      { name: 'Test Liquors 4', town: 'Chelsea', recent: 12, prior: 4 },
      { name: 'Demo News 18', town: 'Medford', recent: 9, prior: 1 },
    ],
  },
  hottest: {
    min: 64, period: 'the last 12 months',
    stores: [
      { name: 'Sample Smoke Shop 2', town: 'Everett', claims: 107 },
      { name: 'Demo Variety 9', town: 'Somerville', claims: 88 },
      { name: 'Test Market 22', town: 'Malden', claims: 71 },
    ],
  },
  largest: [
    { listedDate: '2026-11-05', game: 'Maple Millions', price: 30, prize: 100000, store: 'Sample Variety 12', town: 'Everett' },
    { listedDate: '2026-11-06', game: 'Granite Gold', price: 10, prize: 20000, store: 'Demo Market 7', town: 'Revere' },
    { listedDate: '2026-11-03', game: 'Cash Orchard', price: 5, prize: 10000, store: 'Test Liquors 4', town: 'Chelsea' },
    { listedDate: '2026-11-04', game: 'Harbor Riches', price: 20, prize: 5000, store: 'Sample Smoke Shop 2', town: 'Everett' },
  ],
  analysis: [
    { title: 'Listed claims are up 14% on the week before', body: '187 this week against 164. The four weeks before averaged 171, so this is within the usual range.' },
    { title: '$30 and $50 tickets made up 41% of listed claims', body: 'Up from 33% over the last 12 months. Higher-priced tickets have more prizes over $600, so they show up more often on the public list.' },
    { title: 'Lower-income tracts listed more claims per store', body: 'Tracts in the lowest income class averaged 9.4 listed claims per licensed store; the highest class averaged 5.1.' },
  ],
};

export const weeklyQuiet: WeeklyInsightsData = {
  ...base,
  weekFrom: '2026-11-02', weekTo: '2026-11-08',
  alerts: [],
  totals: { claims: 3, priorClaims: 0, prizeTotal: 3000, storesWithClaims: 3, licensedStores: 18 },
  trend: { ...weekly.trend, stores: [] },
  hottest: { min: 0, period: 'the last 12 months', stores: [] },
  largest: [
    { listedDate: '2026-11-06', game: 'Cash Orchard', price: null, prize: 1000, store: 'Demo Market 7', town: 'Revere' },
  ],
  analysis: [],
};

export const featured: FeaturedTicketsData = {
  ...base,
  asOf: '2026-11-10', gamesOnSale: 134,
  tickets: [
    {
      name: 'Maple Millions', price: 30, image: art('MAPLE MILLIONS'), launchDate: '2026-03-31', tags: [],
      why: 'Most prizes over $600 still left of any game on sale.',
      topPrize: 15000000, topLeft: 2, topTotal: 3, leftOver600: 11262, totalOver600: 13901,
      payback: 0.81, paybackExJackpot: 0.74, checkInputs: false, claimsNearby: 14,
    },
    {
      name: 'Winter Wonders', price: 5, image: art('WINTER WONDERS'), launchDate: '2026-11-03', tags: ['New'],
      why: 'Launched this week, so nearly every prize is still out.',
      topPrize: 100000, topLeft: 10, topTotal: 10, leftOver600: 4980, totalOver600: 5000,
      payback: 0.72, paybackExJackpot: 0.7, checkInputs: false, claimsNearby: 0,
    },
    {
      name: 'Lighthouse Loot', price: 10, launchDate: '2024-08-06', tags: ['Ending soon', 'Second chance'],
      why: 'Ending soon with a top prize still unclaimed.',
      topPrize: 1000000, topLeft: 1, topTotal: 4, leftOver600: 212, totalOver600: 6400,
      payback: 1.34, paybackExJackpot: 0.62, checkInputs: true, claimsNearby: 2,
    },
  ],
};

export const evWatch: EvWatchData = {
  ...base,
  asOf: '2026-11-10', previousAsOf: '2026-11-03', gamesOnSale: 134, medianPayback: 0.76,
  best: [
    { name: 'Lighthouse Loot', price: 10, payback: 1.34, paybackExJackpot: 0.62, evAll: 3.4, checkInputs: true },
    { name: 'Emerald 7s', price: 10, payback: 1.21, paybackExJackpot: 1.21, evAll: 2.1, checkInputs: true },
    { name: 'Golden Gull', price: 20, payback: 1.06, paybackExJackpot: 0.72, evAll: 1.2, checkInputs: true },
    { name: 'Maple Millions', price: 30, payback: 0.81, paybackExJackpot: 0.74, evAll: -5.7, checkInputs: false },
    { name: 'Granite Gold', price: 10, payback: 0.8, paybackExJackpot: 0.77, evAll: -2.0, checkInputs: false },
    { name: 'Harbor Riches', price: 20, payback: 0.79, paybackExJackpot: 0.75, evAll: -4.2, checkInputs: false },
  ],
  positive: [
    { name: 'Emerald 7s', price: 10, payback: 1.21, paybackExJackpot: 1.21, evAll: 2.1, checkInputs: true,
      why: 'Nearly sold out (about 4% of tickets left) with mid-size prizes still listed. Prizes on sold but uncashed tickets may be inflating this.' },
    { name: 'Lighthouse Loot', price: 10, payback: 1.34, paybackExJackpot: 0.62, evAll: 3.4, checkInputs: true,
      why: 'one unclaimed $1,000,000 top prize, about 3% of tickets left' },
    { name: 'Golden Gull', price: 20, payback: 1.06, paybackExJackpot: 0.72, evAll: 1.2, checkInputs: true,
      why: 'two unclaimed $10,000,000 top prizes' },
  ],
  movers: [
    { name: 'Maple Millions', price: 30, size: 'Top prize', before: 3, after: 2, total: 3 },
    { name: 'Harbor Riches', price: 20, size: '$100,000 and up', before: 12, after: 9, total: 40 },
    { name: 'Cash Orchard', price: 5, size: '$10,000 – $99,999', before: 31, after: 27, total: 120 },
  ],
};

export const evWatchNone: EvWatchData = {
  ...evWatch,
  positive: [],
  best: evWatch.best.filter((r) => !r.checkInputs),
  movers: [],
};
