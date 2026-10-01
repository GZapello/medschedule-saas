import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node e2e/fixtures/server.cjs', url: 'http://127.0.0.1:4175/login', reuseExistingServer: false, timeout: 120_000 },
});
