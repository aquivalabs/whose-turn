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
  },
});
