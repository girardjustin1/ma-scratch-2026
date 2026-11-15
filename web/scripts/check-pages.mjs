/**
 * Guard for the public GitHub Pages build (npm run build:pages). Fails if the output holds
 * anything that must stay on the owner's computer: the local Lottery data or report archive
 * (public/local/), data files, or, when web/.env.local exists, any of its values (the pin,
 * the Mapbox token, the Google key). Values are compared, never printed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(web, process.argv[2] ?? 'dist-pages');
if (!existsSync(join(out, 'index.html'))) {
  console.error(`check-pages: no build at ${relative(web, out)}`);
  process.exit(1);
}

const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(out);

const problems = [];
for (const f of files) {
  const rel = relative(out, f);
  if (/(^|\/)local\//.test(rel)) problems.push(`${rel}: local data folder`);
  if (/\.(parquet|csv|duckdb|sqlite)$/i.test(rel)) problems.push(`${rel}: data file`);
}

// Secrets and the pin from .env.local: each value must not appear in any output file.
const envFile = join(web, '.env.local');
const secrets = [];
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, '');
    if (value.length < 8) continue;
    secrets.push({ name: m[1], needles: [value, ...value.split(',').map((s) => s.trim()).filter((s) => s.length >= 6)] });
  }
}
const textLike = /\.(html|js|mjs|css|json|map|txt|svg|md)$/i;
for (const f of files) {
  if (!textLike.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  for (const s of secrets) {
    if (s.needles.some((n) => text.includes(n))) problems.push(`${relative(out, f)}: contains the value of ${s.name}`);
  }
}

if (problems.length) {
  console.error(`check-pages: ${problems.length} problem(s); do not publish this build\n  ${[...new Set(problems)].join('\n  ')}`);
  process.exit(1);
}
console.log(`check-pages: ${files.length} files, no local data${secrets.length ? `, none of ${secrets.length} .env.local values` : ''}`);
