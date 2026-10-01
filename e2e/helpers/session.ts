import { expect, type Page, type APIRequestContext } from '@playwright/test';
export const password = 'Local-Test-Only-2026';
export async function login(page: Page, account = 'fisio') {
  await page.addLocatorHandler(page.getByRole('button', { name: 'Rejeitar não necessários' }), async button => {
    await button.click();
  });
  await page.addLocatorHandler(page.locator('[aria-labelledby=welcome-modal-title]'), async modal => {
    await modal.getByRole('button', { name: 'Não mostrar novamente', exact: true }).click();
  });
  await page.goto('/login');
  await page.locator('input[type=email]').fill(`${account}@test.invalid`);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Entrar no Sistema', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'HOJE', exact: true })).toBeVisible();

  if (await page.getByRole('checkbox', { name: /Li e aceito os Termos/ }).count()) {
  await page.getByRole('checkbox', { name: /Li e aceito os Termos/ }).check();
  await page.getByRole('checkbox', { name: /Li e estou ciente/ }).check();
  await page.getByRole('button', { name: 'Confirmar Aceite e Continuar' }).click();
  }
}
export async function apiLogin(request: APIRequestContext, account: string) {
  const response = await request.post('/api/v1/auth/login', { data: { email: `${account}@test.invalid`, password } });
  expect(response.ok()).toBeTruthy();
  return { Authorization: `Bearer ${(await response.json()).token}` };
}
