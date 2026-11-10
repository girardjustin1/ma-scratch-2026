import type { Preview } from '@storybook/react-vite';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '../src/theme/app.css';
import { ModeProvider } from '../src/theme/mode';

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
      storySort: { order: ['Foundations', 'Components', 'Emails', 'Map', 'Pages', 'Prototype'] },
    },
  },
  decorators: [
    (Story, ctx) => (
      <ModeProvider mode={ctx.globals.mode === 'dark' ? 'dark' : 'light'}>
        <Story />
      </ModeProvider>
    ),
  ],
};

export default preview;
