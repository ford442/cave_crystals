import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemblyscriptWatchPlugin } from './scripts/assemblyscript-watch-plugin.js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const ascWatch = process.env.ASC_WATCH === '1';

export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    assetsInlineLimit: 0, // Don't inline WASM files
  },
  server: {
    fs: {
      // Allow serving files from the build directory
      allow: ['..']
    }
  },
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es',
  },
  plugins: [
    ...(ascWatch ? [assemblyscriptWatchPlugin(rootDir)] : []),
    {
      name: 'pwa-postbuild',
      closeBundle() {
        execFileSync(process.execPath, [path.join(rootDir, 'scripts/pwa-build.mjs')], {
          stdio: 'inherit',
        });
      },
    },
  ],
});
