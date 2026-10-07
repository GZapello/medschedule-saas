import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { mockExternalIdentity } from './external-services';
export const password = 'Local-Test-Only-2026';
export async function login(page: Page, account = 'fisio') {
  await mockExternalIdentity(page);
  await page.addLocatorHandler(page.locator('[aria-labelledby=legal-reaccept-title]'), async modal => {
    await modal.getByRole('checkbox', { name: /Li e aceito os Termos/ }).check();
    await modal.getByRole('checkbox', { name: /Li e estou ciente/ }).check();
    await modal.getByRole('button', { name: 'Confirmar Aceite e Continuar' }).click();
  });
  await page.addLocatorHandler(page.getByRole('button', { name: 'Rejeitar não necessários' }), async button => {
    await button.click();
  });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').fill(`${account}@test.invalid`);
  await page.locator('input[type=password]').fill(password);
  const onboardingLoaded = page.waitForResponse(response => response.url().endsWith('/v1/user-onboarding') && response.request().method() === 'GET');
  await page.getByRole('button', { name: 'Entrar no Sistema', exact: true }).click();
  const onboarding = await (await onboardingLoaded).json();
  if (onboarding.onboardingStatus === 'pending' && !onboarding.onboardingDismissed) {
    const dismissed = page.waitForResponse(response => response.url().endsWith('/v1/user-onboarding') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Não mostrar novamente', exact: true }).click();
    expect((await dismissed).ok()).toBe(true);
    await expect(page.locator('[aria-labelledby=welcome-modal-title]')).toHaveCount(0);
  }
  if (account === 'estetic') await expect(page.getByRole('button', { name: 'ZemdaEstetic (Estética)', exact: true })).toBeVisible();
  else {
    // Professional login may land directly in the clinical workspace.
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Agenda de Hoje', exact: true })).toBeVisible();
  }
}
export async function apiLogin(request: APIRequestContext, account: string) {
  const response = await request.post('/api/v1/auth/login', { data: { email: `${account}@test.invalid`, password } });
  expect(response.ok()).toBeTruthy();
  return { Authorization: `Bearer ${(await response.json()).token}` };
}
