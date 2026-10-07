import { test as base, expect } from '@playwright/test';
import { mockExternalIdentity } from './external-services';

type ExpectedFailure = { method: string; path: RegExp; status: number };
export const test = base.extend<{ audit: { expectHttpError: (failure: ExpectedFailure) => void } }>({
  audit: [async ({ page, baseURL }, use, info) => {
    await mockExternalIdentity(page);
    const failures: string[] = [];
    const expected: ExpectedFailure[] = [];
    const origin = new URL(baseURL!).origin;
    page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const url = message.location().url;
      if (url && new URL(url, origin).origin !== origin) return;
      failures.push(`console.error: ${message.text()}`);
    });
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin !== origin || response.status() < 400) return;
      if (expected.some(item => item.status === response.status() && item.method === response.request().method() && item.path.test(url.pathname))) return;
      failures.push(`${response.status()} ${response.request().method()} ${url.pathname}`);
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      const error = request.failure()?.errorText || 'unknown';
      if (url.origin === origin && !error.includes('ERR_ABORTED')) failures.push(`requestfailed: ${url.pathname}: ${error}`);
    });
    await use({ expectHttpError: failure => expected.push(failure) });
    await info.attach('browser-audit', { body: JSON.stringify({ failures, expected: expected.map(item => ({ ...item, path: item.path.source })) }, null, 2), contentType: 'application/json' });
    expect(failures, 'Erros de navegador ou HTTP inesperados').toEqual([]);
  }, { auto: true }],
});
export { expect };
