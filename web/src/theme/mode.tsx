import { createContext, useContext, useLayoutEffect } from 'react';
import type { Mode } from './tokens';

const ModeContext = createContext<Mode>('light');

/**
 * Light/dark mode. Untitled UI switches on the `dark-mode` class on <html>; the map and
 * charts read the same mode through useMode() to pick their own color steps.
 */
export function ModeProvider({ mode, children }: { mode: Mode; children: React.ReactNode }) {
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark-mode', mode === 'dark');
    document.documentElement.style.colorScheme = mode;
  }, [mode]);
  return <ModeContext.Provider value={mode}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);
