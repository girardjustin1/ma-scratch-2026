// Canonical wording for the data-honesty rules (docs/PRD.md). Components import these
// instead of writing their own, so a label can't drift into "sale date" or "wins".

export const LABELS = {
  listedDate: 'Listed date',
  listedClaims: 'Listed claims (over $600)',
  claimsPerRetailer: 'Claims per licensed retailer',
  medianIncome: 'Median household income',
  noData: 'No data',
  notDefined: 'Not defined',
} as const;

export const CAVEATS = {
  listedOnly:
    'Counts only prizes over $600, which the Lottery lists publicly by the selling retailer’s town. Prizes of $600 or less are paid at retailers and never appear here.',
  listedDate:
    'Dates are the dates the Lottery listed each claim. They are not when the ticket was sold or scratched.',
  coverage:
    'Areas outside the coverage boundary or date window show as no data, not zero.',
  perRetailer:
    'Divides listed claims by the number of licensed retailers. Retailer count is not sales volume, so this is not a per-ticket or per-dollar rate.',
  ecological:
    'Tract income describes places, not the people who bought or claimed tickets.',
  radiusRule: 'A tract is included when its center point falls inside the circle.',
  evBanner: 'Statewide averages. This says nothing about which tickets any store holds.',
  association: 'Results describe association, not cause.',
  unclaimedPrizes:
    'Unclaimed prizes are statewide counts from the Lottery’s prize table: prizes not yet paid out, including tickets not yet sold. They say nothing about which store holds them.',
  volumeNotLuck:
    'A store with more listed claims has usually sold more tickets. That is volume, not luck.',
  notAdvice: 'This describes public Lottery records. It is not advice to buy tickets.',
  matchedOnly:
    'Counts are a floor: claims at stores that could not be matched by name and town, or whose location could not be verified, are left out.',
} as const;

export const LOCAL_NOTICE =
  'Map, open games, listing schedule and Statewide EV: real Lottery data, statewide, kept on this computer only. The statistical tests and Model still show sample data.';

export const SAMPLE_NOTICE = 'Design preview: tract shapes and income are real Census data. Claims, games, retailers and estimates are sample data, not real Lottery activity.';
