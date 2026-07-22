import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const SKIP_NAMES = new Set(['sw.js', 'precache-manifest.json']);

function walkFiles(dir, base = '') {
    const urls = [];
    for (const name of fs.readdirSync(dir)) {
        if (SKIP_NAMES.has(name)) continue;
        const rel = path.posix.join(base, name);
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            urls.push(...walkFiles(full, rel));
        } else if (!name.endsWith('.map')) {
            urls.push(`./${rel}`);
        }
    }
    return urls;
}

function main() {
    if (!fs.existsSync(distDir)) {
        console.error('dist/ not found — run vite build first');
        process.exit(1);
    }

    const urls = walkFiles(distDir).sort();
    const hash = crypto.createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 10);
    const cacheVersion = `${pkg.version}-${hash}`;

    const manifest = {
        version: cacheVersion,
        urls,
    };

    fs.writeFileSync(path.join(distDir, 'precache-manifest.json'), JSON.stringify(manifest, null, 2));

    const swTemplate = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
    const swOutput = swTemplate.replaceAll('__CACHE_VERSION__', cacheVersion);
    fs.writeFileSync(path.join(distDir, 'sw.js'), swOutput);

    console.log(`[pwa] cache version ${cacheVersion}`);
    console.log(`[pwa] precached ${urls.length} assets`);
}

main();
