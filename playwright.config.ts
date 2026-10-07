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
  webServer: [
    { command: 'node e2e/fixtures/server.cjs', url: 'http://127.0.0.1:4175/login', reuseExistingServer: false, timeout: 120_000 },
    { command: 'node backend/test-public-booking.cjs --serve', url: 'http://127.0.0.1:4177/api/__test/fixture', reuseExistingServer: false, timeout: 120_000 },
  ],
  projects: [
    { name: 'clinical', testIgnore: '**/public-booking.spec.ts' },
    ...[
      ['desktop', 1440, 1000], ['tablet', 768, 1024], ['mobile', 390, 844],
    ].map(([name, width, height]) => ({
      name: `public-booking-${name}`, testMatch: '**/public-booking.spec.ts',
      use: { baseURL: 'http://127.0.0.1:4177', viewport: { width: Number(width), height: Number(height) } },
    })),
  ],
});
