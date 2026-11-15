import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './theme/app.css';
import { App } from './app/App';

// VITE_DEMO=1 is the public GitHub Pages build (npm run build:pages): sample data only.
const demo = import.meta.env.VITE_DEMO === '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App useLocal={!demo} routed demo={demo} />
  </StrictMode>,
);
