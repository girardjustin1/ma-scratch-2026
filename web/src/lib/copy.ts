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
  matchedOnly:
    'Counts are a floor: claims at stores that could not be matched by name and town, or whose location could not be verified, are left out.',
} as const;

export const LOCAL_NOTICE =
  'Map and listing schedule: real Lottery-listed claims, statewide, kept on this computer only. Open games, EV, the statistical tests and Model still show sample data.';

export const SAMPLE_NOTICE = 'Design preview: tract shapes and income are real Census data. Claims, games, retailers and estimates are sample data, not real Lottery activity.';
