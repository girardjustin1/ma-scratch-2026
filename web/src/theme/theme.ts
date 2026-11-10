import { createTheme, type Theme } from '@mui/material/styles';
import { brand, chrome, fonts, radii, status, type Mode } from './tokens';

export function createAppTheme(mode: Mode): Theme {
  const c = chrome[mode];
  return createTheme({
    palette: {
      mode,
      primary: { main: brand.primary[mode] },
      success: { main: status.good },
      warning: { main: status.warning },
      error: { main: status.critical },
      background: { default: c.page, paper: c.surfaceRaised },
      text: { primary: c.ink, secondary: c.inkSecondary, disabled: c.inkMuted },
      divider: c.border,
    },
    shape: { borderRadius: radii.md },
    typography: {
      fontFamily: fonts.sans,
      fontSize: 14,
      h1: { fontSize: 22, fontWeight: 650, letterSpacing: '-0.01em' },
      h2: { fontSize: 18, fontWeight: 650, letterSpacing: '-0.01em' },
      h3: { fontSize: 15, fontWeight: 650 },
      subtitle2: { fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' },
      body2: { fontSize: 13 },
      caption: { fontSize: 12, color: c.inkSecondary },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: c.page },
          '.tabular': { fontVariantNumeric: 'tabular-nums' },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { border: `1px solid ${c.border}`, backgroundImage: 'none' } },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'inherit' },
        styleOverrides: { root: { borderWidth: '0 0 1px 0' } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: c.grid, fontVariantNumeric: 'tabular-nums' },
          head: { fontWeight: 600, color: c.inkSecondary, fontSize: 12 },
        },
      },
      MuiTooltip: { defaultProps: { arrow: true } },
      MuiToggleButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
      MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    },
  });
}
