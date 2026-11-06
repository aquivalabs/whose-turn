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
      // ADR 0004: pure logic in web/src/lib is measured by the node:test run (package.json coverage:server);
      // backdrop.ts paints on a canvas, which happy-dom does not have. RMA-372.
      exclude: [
        'web/src/**/*.test.ts',
        'web/src/backdrop.ts',
        'web/src/lib/bem.ts',
        'web/src/lib/browser.ts',
        'web/src/lib/feed.ts',
        'web/src/lib/icons.ts',
        'web/src/lib/latest-wins.ts',
        'web/src/lib/layers.ts',
        'web/src/lib/live-status.ts',
        'web/src/lib/markdown-tokens.ts',
        'web/src/lib/moves.ts',
        'web/src/lib/problems.ts',
        'web/src/lib/random.ts',
        'web/src/lib/settings.ts',
        'web/src/lib/species.ts',
        'web/src/lib/silhouette.ts',
        'web/src/lib/time.ts',
        'web/src/lib/whats-new.ts',
        'web/src/lib/window-mode.ts',
      ],
      thresholds: { lines: 85, branches: 75, functions: 82, statements: 85 },
    },
  },
});
