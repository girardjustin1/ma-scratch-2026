import type { Meta, StoryObj } from '@storybook/react-vite';
import { EvWatchEmail, evSubject } from '../emails/EvWatch';
import { FeaturedTicketsEmail, featuredSubject } from '../emails/FeaturedTickets';
import { WeeklyInsightsEmail, weeklySubject } from '../emails/WeeklyInsights';
import * as F from '../emails/fixtures';
import { EmailPreview } from './EmailPreview';

// Insights emails, built with React Email for sending through Resend. All data here is
// synthetic (emails/fixtures.ts). Use the buttons above each preview for phone and plain text.
const meta: Meta = { title: 'Emails', parameters: { layout: 'padded' } };
export default meta;
type Story = StoryObj;

export const Weekly: Story = {
  name: '1 · Weekly insights',
  render: () => <EmailPreview subject={weeklySubject(F.weekly)} email={<WeeklyInsightsEmail {...F.weekly} />} />,
};
export const WeeklyQuiet: Story = {
  name: '1 · Weekly insights · quiet week',
  render: () => <EmailPreview subject={weeklySubject(F.weeklyQuiet)} email={<WeeklyInsightsEmail {...F.weeklyQuiet} />} />,
};
export const Featured: Story = {
  name: '2 · Featured tickets',
  render: () => <EmailPreview subject={featuredSubject(F.featured)} email={<FeaturedTicketsEmail {...F.featured} />} />,
};
export const EvWatch: Story = {
  name: '3 · +EV watch',
  render: () => <EmailPreview subject={evSubject(F.evWatch)} email={<EvWatchEmail {...F.evWatch} />} />,
};
export const EvWatchNone: Story = {
  name: '3 · +EV watch · nothing above 100%',
  render: () => <EmailPreview subject={evSubject(F.evWatchNone)} email={<EvWatchEmail {...F.evWatchNone} />} />,
};
