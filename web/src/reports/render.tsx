import type { ReactElement } from 'react';
import { EvWatchEmail, evSubject } from '../emails/EvWatch';
import { FeaturedTicketsEmail, featuredSubject } from '../emails/FeaturedTickets';
import { InsightsEmail, insightsSubject } from '../emails/Insights';
import { NearbyAlertEmail, nearbySubject } from '../emails/NearbyAlert';
import type { IssueData } from './reports';

/** The report's headline, as the archive lists it. */
export function issueSubject(c: IssueData): string {
  switch (c.type) {
    case 'weekly': case 'monthly': return insightsSubject(c.data);
    case 'featured': return featuredSubject(c.data);
    case 'ev': return evSubject(c.data);
    case 'nearby': return nearbySubject(c.data);
  }
}

/** The report drawn with its design (the React Email templates). */
export function issueElement(c: IssueData): ReactElement {
  switch (c.type) {
    case 'weekly': case 'monthly': return <InsightsEmail {...c.data} />;
    case 'featured': return <FeaturedTicketsEmail {...c.data} />;
    case 'ev': return <EvWatchEmail {...c.data} />;
    case 'nearby': return <NearbyAlertEmail {...c.data} />;
  }
}
