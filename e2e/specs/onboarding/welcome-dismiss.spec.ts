import { test, expect } from '../../helpers/audit-test';
import { login, apiLogin } from '../../helpers/session';

test('@critical Boas-vindas: descarte permanente sobrevive à navegação e ao F5', async ({ page, request }) => {
  await login(page, 'manager');
  const headers = await apiLogin(request, 'manager');
  const preference = await request.get('/api/v1/user-onboarding', { headers });
  expect(preference.ok()).toBe(true);
  expect(await preference.json()).toMatchObject({ onboardingDismissed: true, onboardingStatus: 'dismissed' });
  await page.getByRole('button', { name: 'Agenda Interativa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Agendar', exact: true })).toBeVisible();
  const reloaded = page.waitForResponse(r => r.url().endsWith('/v1/user-onboarding') && r.request().method() === 'GET');
  await page.reload();
  expect((await reloaded).ok()).toBe(true);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Agenda de Hoje', exact: true })).toBeVisible();
  await expect(page.locator('[aria-labelledby=welcome-modal-title]')).toHaveCount(0);
});
