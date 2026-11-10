import type { Preview } from '@storybook/react-vite';
import { CssBaseline, ThemeProvider } from '@mui/material';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { createAppTheme } from '../src/theme/theme';

const preview: Preview = {
  globalTypes: {
    mode: {
      description: 'Color mode',
      toolbar: { title: 'Mode', icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { mode: 'light' },
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    options: {
      storySort: { order: ['Foundations', 'Components', 'Map', 'Pages', 'Prototype'] },
    },
  },
  decorators: [
    (Story, ctx) => (
      <ThemeProvider theme={createAppTheme(ctx.globals.mode === 'dark' ? 'dark' : 'light')}>
        <CssBaseline />
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default preview;
