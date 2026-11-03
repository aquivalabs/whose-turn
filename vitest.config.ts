import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['web/src/test-setup.ts'],
    include: ['web/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
