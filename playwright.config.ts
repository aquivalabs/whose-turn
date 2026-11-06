// The browser layout check: the built window on the demo connector, in Chromium (RMA-362, docs/adr/0010).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8799', browserName: 'chromium' },
  webServer: { command: 'node test/fixtures/demo-server.mjs', url: 'http://127.0.0.1:8799/api/state', reuseExistingServer: false },
});
