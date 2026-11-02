import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

const server = `http://127.0.0.1:${process.env.WHOSE_TURN_PORT || '8766'}`;

export default defineConfig({
  root: 'web',
  plugins: [vue()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(import.meta.dirname, 'web/index.html'), report: resolve(import.meta.dirname, 'web/report.html'), sheet: resolve(import.meta.dirname, 'web/sheet.html') } },
  },
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: server, changeOrigin: true, headers: { origin: server } } } },
});
