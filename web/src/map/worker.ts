import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// MapLibre 6 finds its module worker relative to its own file. Vite's dependency
// pre-bundling moves that file, so point MapLibre at the bundled worker explicitly.
setWorkerUrl(workerUrl);
