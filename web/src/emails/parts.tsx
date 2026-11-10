import type { CSSProperties, ReactNode } from 'react';
import { Body, Container, Head, Html, Link, Preview, Section, Text } from '@react-email/components';

/**
 * Shared parts for the insights emails (React Email, sent with Resend). Email clients
 * need inline styles and table layout, so these do not use the app's Tailwind classes.
 * Same look as the app: black, white and grays only; status is words, never color.
 */
export const t = {
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  ink: '#0a0a0a',
  secondary: '#404040',
  muted: '#737373',
  line: '#e5e5e5',
  panel: '#f7f7f7',
  page: '#f2f2f2',
  white: '#ffffff',
  pad: 28,
} as const;

const text = (size: number, color: string, extra?: CSSProperties): CSSProperties => ({
  margin: 0, fontSize: size, lineHeight: 1.45, color, ...extra,
});

/** The app's mark: a black rounded square with a white ring. */
function Mark() {
  return (
    <span style={{ display: 'inline-block', width: 28, height: 28, borderRadius: 8, backgroundColor: t.ink, textAlign: 'center', lineHeight: '28px', verticalAlign: 'middle' }}>
      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, border: `2px solid ${t.white}`, verticalAlign: 'middle' }} />
    </span>
  );
}

export interface ShellProps {
  /** Inbox preview line, shown after the subject. */
  preview: string;
  kicker: string;
  title: string;
  lede?: ReactNode;
  appUrl: string;
  cta?: string;
  /** Honesty notes shown in every email's footer. */
  caveats: string[];
  /** Why the reader got this email. */
  reason: string;
  children: ReactNode;
}

export function Shell({ preview, kicker, title, lede, appUrl, cta = 'Open the explorer', caveats, reason, children }: ShellProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: '24px 12px', backgroundColor: t.page, fontFamily: t.font, color: t.ink }}>
        <Container style={{ maxWidth: 600, backgroundColor: t.white, border: `1px solid ${t.line}`, borderRadius: 12 }}>
          <Section style={{ padding: `24px ${t.pad}px 0` }}>
            <table role="presentation" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td style={{ paddingRight: 10 }}><Mark /></td>
                  <td>
                    <Text style={text(14, t.ink, { fontWeight: 600, lineHeight: 1.2 })}>MA Scratch Claims</Text>
                    <Text style={text(12, t.muted, { lineHeight: 1.2 })}>{kicker}</Text>
                  </td>
                </tr>
              </tbody>
            </table>
            <Text style={text(22, t.ink, { fontWeight: 600, lineHeight: 1.25, marginTop: 20, letterSpacing: '-0.01em' })}>{title}</Text>
            {lede && <Text style={text(14, t.secondary, { marginTop: 6 })}>{lede}</Text>}
          </Section>
          {children}
          <Section style={{ padding: `24px ${t.pad}px 0` }}>
            <Link href={appUrl} style={{ display: 'inline-block', backgroundColor: t.ink, color: t.white, fontSize: 14, fontWeight: 600, textDecoration: 'none', padding: '10px 16px', borderRadius: 8 }}>
              {cta}
            </Link>
          </Section>
          <Section style={{ padding: `20px ${t.pad}px 24px` }}>
            <div style={{ borderTop: `1px solid ${t.line}`, paddingTop: 16 }}>
              <Text style={text(12, t.secondary, { fontWeight: 600, marginBottom: 6 })}>How to read this</Text>
              {caveats.map((c) => (
                <Text key={c} style={text(12, t.muted, { marginBottom: 6 })}>{c}</Text>
              ))}
              <Text style={text(12, t.muted, { marginTop: 12 })}>{reason}</Text>
            </div>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** A titled section of the email. */
export function Block({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <Section style={{ padding: `24px ${t.pad}px 0` }}>
      <Text style={text(16, t.ink, { fontWeight: 600 })}>{title}</Text>
      {note && <Text style={text(12, t.muted, { marginTop: 2 })}>{note}</Text>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </Section>
  );
}

/** A row of headline numbers. */
export function Tiles({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode }[] }) {
  return (
    <Section style={{ padding: `20px ${t.pad}px 0` }}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ border: `1px solid ${t.line}`, borderRadius: 10 }}>
        <tbody>
          <tr>
            {items.map((it, i) => (
              <td key={it.label} width={`${Math.round(100 / items.length)}%`}
                style={{ padding: '14px 14px', verticalAlign: 'top', borderLeft: i ? `1px solid ${t.line}` : undefined }}>
                <Text style={text(12, t.muted)}>{it.label}</Text>
                <Text style={text(22, t.ink, { fontWeight: 600, lineHeight: 1.3 })}>{it.value}</Text>
                {it.sub && <Text style={text(12, t.muted)}>{it.sub}</Text>}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

export interface Column { label: string; align?: 'left' | 'right'; width?: number | string }

/** A plain data table. Keep it to four columns or fewer so it fits a phone. */
export function DataTable({ columns, rows, empty }: { columns: Column[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <Text style={text(13, t.muted)}>{empty}</Text>;
  const last = columns.length - 1;
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={c.label} align={c.align ?? 'left'}
              style={{ width: c.width, fontSize: 12, fontWeight: 500, color: t.muted, padding: `0 ${i === last ? 0 : 12}px 6px 0`, borderBottom: `1px solid ${t.line}`, whiteSpace: 'nowrap' }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((cell, i) => (
              <td key={i} align={columns[i].align ?? 'left'}
                style={{ fontSize: 14, lineHeight: 1.4, color: t.ink, padding: `9px ${i === last ? 0 : 12}px 9px 0`, borderBottom: `1px solid ${t.line}`, verticalAlign: 'top' }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Two-line cell: a main line with a muted line under it. */
export function Stack({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <div style={{ fontWeight: 500 }}>{main}</div>
      {sub && <div style={{ fontSize: 12, color: t.muted }}>{sub}</div>}
    </>
  );
}

/** Small bordered label, e.g. "Check inputs" or "New". Words carry the meaning, not color. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: t.secondary, border: `1px solid ${t.line}`, borderRadius: 6, padding: '1px 6px', whiteSpace: 'nowrap', lineHeight: 1.5 }}>
      {children}
    </span>
  );
}

/** Gray panel for the one thing the reader must not miss. */
export function Callout({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ backgroundColor: t.panel, border: `1px solid ${t.line}`, borderRadius: 10, padding: '14px 16px' }}>
      {title && <Text style={text(14, t.ink, { fontWeight: 600 })}>{title}</Text>}
      {children && <div style={{ marginTop: title ? 6 : 0, fontSize: 13, lineHeight: 1.45, color: t.secondary }}>{children}</div>}
    </div>
  );
}

/** Label and value pairs, one per line. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse' }}>
      <tbody>
        {items.map(([k, v]) => (
          <tr key={k}>
            <td style={{ fontSize: 13, color: t.muted, padding: '5px 12px 5px 0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td>
            <td align="right" style={{ fontSize: 14, color: t.ink, fontWeight: 500, padding: '5px 0' }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const P = ({ children, muted }: { children: ReactNode; muted?: boolean }) => (
  <Text style={text(muted ? 12 : 14, muted ? t.muted : t.secondary, { marginBottom: 8 })}>{children}</Text>
);
