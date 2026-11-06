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
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['web/src/**'],
      exclude: ['web/src/**/*.test.ts'],
      thresholds: { lines: 68, branches: 56, functions: 68, statements: 68 },
    },
  },
});
