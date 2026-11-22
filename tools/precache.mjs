// Lists every file the app needs offline in site/precache.json and stamps a
// content hash into sw.js, so the service worker caches the whole app on
// install and every deploy that changes a file ships a new cache.
// Run before deploying: npm run precache
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const SKIP = new Set(['sw.js', 'precache.json']);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = join(dir, d.name);
    return d.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(site)
  .map((f) => relative(site, f).split(sep).join('/'))
  .filter((f) => !SKIP.has(f) && !f.endsWith('LICENSE.txt') && !f.endsWith('LICENSE-fonts.txt'))
  .sort();

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(site, f)));
const version = hash.digest('hex').slice(0, 12);

writeFileSync(join(site, 'precache.json'), `${JSON.stringify({ version, files }, null, 1)}\n`);
const swPath = join(site, 'sw.js');
writeFileSync(swPath, readFileSync(swPath, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`));
console.log(`precache: ${files.length} files, version ${version}`);
