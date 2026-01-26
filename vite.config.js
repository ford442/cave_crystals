import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    assetsInlineLimit: 0, // Don't inline WASM files
  },
  optimizeDeps: {
    exclude: ['@assemblyscript/loader']
  },
  server: {
    fs: {
      // Allow serving files from the build directory
      allow: ['..']
    }
  },
  assetsInclude: ['**/*.wasm']
});
