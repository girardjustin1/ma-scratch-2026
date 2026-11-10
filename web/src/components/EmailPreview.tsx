import { useEffect, useRef, useState, type ReactElement } from 'react';
import { render } from '@react-email/render';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';

type View = 'desktop' | 'mobile' | 'text';

const SAMPLE_EMAIL_NOTE = 'Sample data. Rendered with React Email, exactly as Resend would send it.';

/**
 * Preview of an email (Storybook and the prototype's Emails tab): renders it to the HTML
 * that would be sent, shows it in a frame at desktop or phone width, and offers the
 * plain-text version. `note` says where the data comes from.
 */
export function EmailPreview({ subject, email, note = SAMPLE_EMAIL_NOTE }: { subject: string; email: ReactElement; note?: string }) {
  const [view, setView] = useState<View>('desktop');
  const [html, setHtml] = useState('');
  const [plain, setPlain] = useState('');
  const [height, setHeight] = useState(600);
  const frame = useRef<HTMLIFrameElement>(null);
  const key = JSON.stringify(email.props);

  useEffect(() => {
    let on = true;
    render(email).then((h) => on && setHtml(h));
    render(email, { plainText: true }).then((p) => on && setPlain(p));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const fit = () => {
    const doc = frame.current?.contentDocument;
    if (doc) setHeight(doc.documentElement.scrollHeight);
  };
  // Switching between desktop and phone width reflows the email without reloading the frame,
  // so onLoad does not fire: measure again once the new width has applied.
  useEffect(() => {
    if (view === 'text') return;
    const id = window.setTimeout(fit, 60);
    return () => window.clearTimeout(id);
  }, [view]);
  const preview = html.match(/data-skip-in-text="true">([^<]*)/)?.[1]?.replace(/[‌​ ﻿͏­\s]+$/u, '').trim();

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <ButtonGroup size="sm" aria-label="Preview" disallowEmptySelection selectedKeys={[view]}
          onSelectionChange={(k) => { const v = [...k][0]; if (v) setView(v as View); }}>
          <ButtonGroupItem id="desktop" className="selected:bg-tertiary selected:text-primary">Desktop</ButtonGroupItem>
          <ButtonGroupItem id="mobile" className="selected:bg-tertiary selected:text-primary">Phone</ButtonGroupItem>
          <ButtonGroupItem id="text" className="selected:bg-tertiary selected:text-primary">Plain text</ButtonGroupItem>
        </ButtonGroup>
        <p className="text-xs text-tertiary">{note}</p>
      </div>
      <div className="rounded-xl bg-primary px-4 py-3 ring-1 ring-secondary ring-inset">
        <p className="text-xs text-tertiary">From <span className="font-medium text-secondary">MA Scratch Claims</span></p>
        <p className="text-sm font-semibold text-primary">{subject}</p>
        {preview && <p className="truncate text-sm text-tertiary">{preview}</p>}
      </div>
      {view === 'text' ? (
        <pre className="overflow-x-auto rounded-xl bg-primary p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-secondary ring-1 ring-secondary ring-inset">{plain}</pre>
      ) : (
        <iframe
          ref={frame} title={subject} srcDoc={html} onLoad={fit}
          className="mx-auto rounded-xl ring-1 ring-secondary"
          style={{ width: view === 'mobile' ? 390 : '100%', height, border: 0, background: '#f2f2f2' }}
        />
      )}
    </div>
  );
}
