import { defineConfig } from 'vite';

// Relative base so the built bundle works both when served by the Express
// server and when index.html is opened directly from disk (offline-first).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
    globals: true,
  },
});
