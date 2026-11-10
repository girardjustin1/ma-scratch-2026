import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// All assets are bundled from node_modules; nothing loads from a CDN, so the app
// works with the network disabled. Only the optional Mapbox basemap goes online.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // "@/..." is Untitled UI's import root (src/uui), kept so its copied files stay unedited.
  resolve: { alias: { '@': fileURLToPath(new URL('./src/uui', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
  preview: { host: '127.0.0.1', port: 5181 },
});
