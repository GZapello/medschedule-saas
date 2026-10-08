import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './specs', testMatch: '**/onboarding.spec.ts', workers: 1, timeout: 120000,
  expect: { timeout: 20000 }, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node fixtures/onboarding-server.cjs', url: 'http://127.0.0.1:4175/login', timeout: 120000 },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ]
});
