import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// All assets are bundled from node_modules; nothing loads from a CDN, so the app
// works with the network disabled. Only the optional Mapbox basemap goes online.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
  preview: { host: '127.0.0.1', port: 5181 },
});
