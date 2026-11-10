import { useMemo, useState, type ReactElement } from 'react';
import { Mail01 } from '@untitledui/icons';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { cx } from '@/utils/cx';
import { Card, CaveatNote } from '../components/Basics';
import { EmailPreview } from '../components/EmailPreview';
import { absoluteImages, buildEvWatch, buildFeatured, buildInsights, buildNearbyAlert } from '../emails/build';
import { EvWatchEmail, evSubject } from '../emails/EvWatch';
import { FeaturedTicketsEmail, featuredSubject } from '../emails/FeaturedTickets';
import { InsightsEmail, insightsSubject } from '../emails/Insights';
import { NearbyAlertEmail, nearbySubject } from '../emails/NearbyAlert';
import type { AlertRadius } from '../emails/types';
import type { ExploreData } from './ExplorePage';

type EmailKey = 'weekly' | 'monthly' | 'featured' | 'ev' | 'nearby';

const EMAILS: { key: EmailKey; label: string; sub: string }[] = [
  { key: 'weekly', label: 'Weekly insights', sub: 'Last full week, 5 mi around your pin' },
  { key: 'monthly', label: 'Monthly report', sub: 'Last full month, 5 mi around your pin' },
  { key: 'featured', label: 'Featured tickets', sub: 'Picked by rule from games on sale' },
  { key: 'ev', label: '+EV watch', sub: 'Statewide estimated payback' },
  { key: 'nearby', label: 'Nearby alert', sub: 'Last 7 listed dates within 1–3 mi' },
];

const REAL_NOTE = 'Real data, on this computer only. Not sent.';

/**
 * Prototype only: previews every insights email built from the local data (emails/build.ts),
 * with the real ticket art served by the dev server. Nothing is sent and nothing is saved.
 */
export function EmailsPage({ data }: { data: ExploreData | null }) {
  const [key, setKey] = useState<EmailKey>('weekly');
  const [radius, setRadius] = useState<AlertRadius>(1);
  const email = useMemo(() => (data ? buildEmail(data, key, radius) : null), [data, key, radius]);

  if (!data) {
    return (
      <div className="grid h-full place-items-center p-6">
        <Card className="max-w-[460px] p-5">
          <div className="flex items-start gap-3">
            <Mail01 className="mt-0.5 size-5 shrink-0 text-fg-quaternary" aria-hidden />
            <div>
              <h1 className="text-md font-semibold text-primary">Emails need the local data</h1>
              <p className="mt-1 text-sm text-tertiary">
                The email previews are built from the real Lottery data kept on this computer. It is not loaded here, and
                the emails are never built from sample data. The designs are in Storybook under Emails.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-secondary bg-primary p-4">
        <div>
          <h1 className="text-md font-semibold text-primary">Emails</h1>
          <p className="text-xs text-tertiary">Previews built from your local data. Nothing is sent.</p>
        </div>
        <nav aria-label="Emails" className="flex flex-col gap-1">
          {EMAILS.map((e) => (
            <button key={e.key} type="button" onClick={() => setKey(e.key)} aria-current={key === e.key ? 'page' : undefined}
              className={cx('rounded-lg px-3 py-2 text-left outline-focus-ring transition focus-visible:outline-2',
                key === e.key ? 'bg-tertiary' : 'hover:bg-primary_hover')}>
              <p className={cx('text-sm font-semibold', key === e.key ? 'text-primary' : 'text-secondary')}>{e.label}</p>
              <p className="text-xs text-tertiary">{e.sub}</p>
            </button>
          ))}
        </nav>
        {key === 'nearby' && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-secondary">Alert radius</p>
            <ButtonGroup size="sm" aria-label="Alert radius" disallowEmptySelection selectedKeys={[String(radius)]}
              onSelectionChange={(k) => { const v = Number([...k][0]); if (v === 1 || v === 2 || v === 3) setRadius(v); }}>
              {[1, 2, 3].map((r) => (
                <ButtonGroupItem key={r} id={String(r)} className="selected:bg-tertiary selected:text-primary">{r} mi</ButtonGroupItem>
              ))}
            </ButtonGroup>
          </div>
        )}
        <div className="flex-1" />
        <CaveatNote dense>
          Built on this computer from your saved Lottery data, with ticket art from the local dev server. Real emails are never
          committed, and nothing sends until Resend is set up.
        </CaveatNote>
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto bg-secondary p-6">
        {email && 'error' in email
          ? <Card className="mx-auto max-w-[720px] p-4"><p className="text-sm text-secondary">{email.error}</p></Card>
          : email && <EmailPreview key={`${key}-${radius}`} subject={email.subject} email={email.element} note={REAL_NOTE} />}
      </div>
    </div>
  );
}

function buildEmail(data: ExploreData, key: EmailKey, radius: AlertRadius): { subject: string; element: ReactElement } | { error: string } {
  // Absolute ticket-art URLs so the preview iframe loads them from this dev server.
  const origin = window.location.origin;
  const appUrl = origin;
  switch (key) {
    case 'weekly':
    case 'monthly': {
      const d = absoluteImages(buildInsights(data, { period: key === 'weekly' ? 'week' : 'month', appUrl }), origin);
      return { subject: insightsSubject(d), element: <InsightsEmail {...d} /> };
    }
    case 'featured': {
      const d = absoluteImages(buildFeatured(data, { appUrl }), origin);
      return { subject: featuredSubject(d), element: <FeaturedTicketsEmail {...d} /> };
    }
    case 'ev': {
      if (!data.ev) return { error: 'The local data has no prize tables, so there is no +EV watch to preview.' };
      const d = absoluteImages(buildEvWatch(data, { appUrl }), origin);
      return { subject: evSubject(d), element: <EvWatchEmail {...d} /> };
    }
    case 'nearby': {
      const d = absoluteImages(buildNearbyAlert(data, { radiusMiles: radius, appUrl }), origin);
      return { subject: nearbySubject(d), element: <NearbyAlertEmail {...d} /> };
    }
  }
}
