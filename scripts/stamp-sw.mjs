// Runs after `next build`: names the service worker's caches after the app version (lib/version.ts), so every release
// installs a new worker, drops the caches of the previous build and reloads open copies of the app.
import fs from 'node:fs';
import path from 'node:path';
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const version = fs.readFileSync(path.join(root, 'lib', 'version.ts'), 'utf8').match(/APP_VERSION = '([^']+)'/)?.[1];
const sw = path.join(root, 'out', 'sw.js');
if (!version || !fs.existsSync(sw)) { console.warn('sw.js: versi tidak dicap (out/sw.js atau APP_VERSION tidak ada)'); process.exit(0); }
const text = fs.readFileSync(sw, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = 'app-${version}';`);
fs.writeFileSync(sw, text);
console.log(`sw.js: cache app-${version}`);
