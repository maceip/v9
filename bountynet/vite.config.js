import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      // xterm loaded from CDN, not bundled
      external: ['xterm', 'xterm-addon-fit', 'xterm-addon-web-links'],
    },
  },
});
