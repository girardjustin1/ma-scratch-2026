import type { StorybookConfig } from '@storybook/react-vite';

// The public GitHub Pages build (VITE_DEMO=1, npm run build:pages) must not carry values from
// web/.env.local (the owner's pin, the Mapbox token). Storybook loads .env files itself, into
// process.env, so vite.config's envDir: false does not reach it: drop every VITE_ value but
// the demo flag from Storybook's env and from process.env, and define each as undefined.
// scripts/check-pages.mjs verifies the result.
const demo = process.env.VITE_DEMO === '1';
const isPrivateKey = (k: string) => k.startsWith('VITE_') && k !== 'VITE_DEMO';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  env: (config) => (demo ? Object.fromEntries(Object.entries(config ?? {}).filter(([k]) => !isPrivateKey(k))) : config ?? {}),
  viteFinal: (config) => {
    if (!demo) return config;
    const keys = Object.keys(process.env).filter(isPrivateKey);
    for (const k of keys) delete process.env[k];
    const hidden = Object.fromEntries(keys.map((k) => [`import.meta.env.${k}`, 'undefined']));
    return { ...config, envDir: false, define: { ...config.define, ...hidden } };
  },
};
export default config;
