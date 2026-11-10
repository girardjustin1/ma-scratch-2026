import type { Meta, StoryObj } from '@storybook/react-vite';
import { EvWatchEmail, evSubject } from '../emails/EvWatch';
import { FeaturedTicketsEmail, featuredSubject } from '../emails/FeaturedTickets';
import { InsightsEmail, insightsSubject } from '../emails/Insights';
import { NearbyAlertEmail, nearbySubject } from '../emails/NearbyAlert';
import * as F from '../emails/fixtures';
import { EmailPreview } from '../components/EmailPreview';

// Insights emails, built with React Email for sending through Resend. All data here is
// synthetic (emails/fixtures.ts). Use the buttons above each preview for phone and plain text.
const meta: Meta = { title: 'Emails', parameters: { layout: 'padded' } };
export default meta;
type Story = StoryObj;

export const Weekly: Story = {
  name: '1 · Weekly insights',
  render: () => <EmailPreview subject={insightsSubject(F.weekly)} email={<InsightsEmail {...F.weekly} />} />,
};
export const WeeklyQuiet: Story = {
  name: '1 · Weekly insights · quiet week',
  render: () => <EmailPreview subject={insightsSubject(F.weeklyQuiet)} email={<InsightsEmail {...F.weeklyQuiet} />} />,
};
export const Monthly: Story = {
  name: '2 · Monthly report',
  render: () => <EmailPreview subject={insightsSubject(F.monthly)} email={<InsightsEmail {...F.monthly} />} />,
};
export const Nearby: Story = {
  name: '3 · Nearby alert · 3 mi',
  render: () => <EmailPreview subject={nearbySubject(F.nearby)} email={<NearbyAlertEmail {...F.nearby} />} />,
};
export const NearbyOne: Story = {
  name: '3 · Nearby alert · one claim, 1 mi',
  render: () => <EmailPreview subject={nearbySubject(F.nearbyOne)} email={<NearbyAlertEmail {...F.nearbyOne} />} />,
};
export const NearbyNone: Story = {
  name: '3 · Nearby alert · nothing new, 2 mi',
  render: () => <EmailPreview subject={nearbySubject(F.nearbyNone)} email={<NearbyAlertEmail {...F.nearbyNone} />} />,
};
export const Featured: Story = {
  name: '4 · Featured tickets',
  render: () => <EmailPreview subject={featuredSubject(F.featured)} email={<FeaturedTicketsEmail {...F.featured} />} />,
};
export const EvWatch: Story = {
  name: '5 · +EV watch',
  render: () => <EmailPreview subject={evSubject(F.evWatch)} email={<EvWatchEmail {...F.evWatch} />} />,
};
export const EvWatchNone: Story = {
  name: '5 · +EV watch · nothing above 100%',
  render: () => <EmailPreview subject={evSubject(F.evWatchNone)} email={<EvWatchEmail {...F.evWatchNone} />} />,
};
