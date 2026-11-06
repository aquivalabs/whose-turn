import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'web/src') } },
  test: {
    environment: 'happy-dom',
    setupFiles: ['web/src/test-setup.ts'],
    include: ['web/**/*.test.ts'],
    restoreMocks: true,
    // motion-v cancels a running animation when its element unmounts, and the rejected promise is never caught
    // inside the library. Only that one error is ignored; any other unhandled error still fails the run. RMA-367.
    onUnhandledError: (error) =>
      !(error.name === 'AbortError' && error.message === 'The animation was canceled.'),
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['web/src/**'],
      exclude: ['web/src/**/*.test.ts'],
      thresholds: { lines: 66, branches: 56, functions: 68, statements: 66 },
    },
  },
});
