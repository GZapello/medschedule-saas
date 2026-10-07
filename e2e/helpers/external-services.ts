import type { Page } from '@playwright/test';

// OAuth itself is outside the local audit; prevent its remote SDK from delaying navigation.
export async function mockExternalIdentity(page: Page) {
  await page.route('https://www.googletagmanager.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route('https://*.google-analytics.com/**', route => route.fulfill({ status: 204, body: '' }));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://accounts.google.com/gsi/client*', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.google = { accounts: { id: { initialize() {}, renderButton() {}, prompt() {} } } };',
  }));
}
