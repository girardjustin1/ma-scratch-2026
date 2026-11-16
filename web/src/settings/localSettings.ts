import { SETTINGS_URL, validSettings, type LocalSettings } from './settings';

/**
 * Read the saved settings from the local dev server. null when there is no such server
 * (Storybook, `vite preview`, the public demo): the Settings tab then cannot save.
 */
export async function loadSettings(): Promise<LocalSettings | null> {
  try {
    const res = await fetch(SETTINGS_URL, { cache: 'no-store' });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    return validSettings(await res.json());
  } catch {
    return null;
  }
}

/** Save the settings through the local dev server. True when written. */
export async function saveSettings(s: LocalSettings): Promise<boolean> {
  try {
    const res = await fetch(SETTINGS_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    return res.ok;
  } catch {
    return false;
  }
}
