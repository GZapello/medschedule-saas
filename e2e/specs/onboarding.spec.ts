import { test, expect, Page } from '@playwright/test';
import { login } from '../helpers/session';

const card = (page: Page) => page.locator('[data-tour-card]');
async function help(page: Page) {
  await page.getByRole('button', { name: 'Ajuda', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Central de Ajuda Zemda' })).toBeVisible();
}
async function start(page: Page, module = false) {
  await help(page);
  await page.getByRole('button', { name: module ? /Conhecer meu módulo/ : /Reiniciar tour/ }).click();
  await expect(card(page)).toBeVisible();
}
async function verifyStep(page: Page) {
  await expect(card(page)).toBeVisible();
  const selector = await card(page).getAttribute('data-tour-target');
  const route = await card(page).getAttribute('data-tour-route');
  await expect(page.locator(`[data-tour-page="${route}"]`)).toBeVisible();
  await expect(page.locator(selector!)).toHaveCount(1);
  // Read both rectangles in the same browser frame. Separate protocol calls can straddle
  // a resize event, comparing a stale target rectangle with a newly hidden card.
  await expect.poll(() => card(page).evaluate((element, targetSelector) => {
    if (getComputedStyle(element).visibility !== 'visible') return 'settling';
    const target = document.querySelector(targetSelector!)?.getBoundingClientRect();
    if (!target) return 'missing target';
    const box = element.getBoundingClientRect();
    if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) return 'outside viewport';
    if (box.left < target.right && box.right > target.left && box.top < target.bottom && box.bottom > target.top) return 'overlap';
    return 'ready';
  }, selector), { message: `geometry for ${selector}` }).toBe('ready');
  return (await card(page).getAttribute('data-tour-step'))!;
}
async function complete(page: Page, testInfo: any) {
  const ids: string[] = [];
  for (let i = 0; i < 30; i++) {
    const id = await verifyStep(page); expect(ids).not.toContain(id); ids.push(id);
    await page.screenshot({ path: testInfo.outputPath(`${i}-${id}.png`) });
    const final = card(page).getByRole('button', { name: 'Finalizar', exact: true });
    if (await final.count()) { await final.click(); break; }
    await card(page).getByRole('button', { name: 'Próximo', exact: true }).click();
    await expect(card(page)).not.toHaveAttribute('data-tour-step', id);
  }
  await expect(card(page)).toHaveCount(0);
  return ids;
}

for (const account of ['manager', 'fisio', 'tour-reception', 'tour-finance']) {
  test(`tour completo ${account}`, async ({ page }, testInfo) => {
    // Shared helper's post-login Dashboard click is desktop-only; start there before resizing.
    const viewport = page.viewportSize()!; await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page, account); await page.setViewportSize(viewport);
    await start(page);
    const ids = await complete(page, testInfo);
    if (account === 'manager') expect(ids).toEqual(['admin_dashboard','admin_calendar','admin_patients','admin_staff','admin_services','admin_financial','admin_inventory','admin_reports','admin_settings']);
    if (account === 'fisio') expect(ids).toContain('solo_module');
    if (account === 'tour-reception') expect(ids.every(id => id.startsWith('rec_'))).toBe(true);
    // Financial/Reports are currently rejected by backend role gates for role=financial.
    if (account === 'tour-finance') expect(ids).toEqual(['fin_budgets']);
  });
}
for (const account of ['fono','odonto','fisio','nutri','to','med-audit','psico-audit','pp-audit','personal-audit','estetic']) {
  test(`módulo completo ${account}`, async ({ page }, testInfo) => {
    const viewport = page.viewportSize()!; await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page, account); await page.setViewportSize(viewport);
    await start(page, true); await complete(page, testInfo);
  });
}
test('Zemda360', async ({ page }, testInfo) => {
  const viewport = page.viewportSize()!; await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page); await page.setViewportSize(viewport); await help(page);
  await page.getByRole('button', { name: /Conhecer o Zemda360/ }).click();
  await complete(page, testInfo);
});

test('anterior, X, ESC, continuar, reload, reiniciar e pular', async ({ page }) => {
  const viewport = page.viewportSize()!; await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page,'manager'); await page.setViewportSize(viewport); await start(page);
  await card(page).getByRole('button', { name: 'Próximo', exact: true }).click(); await verifyStep(page);
  await card(page).getByRole('button', { name: 'Anterior', exact: true }).click();
  await expect(card(page)).toHaveAttribute('data-tour-step','admin_dashboard'); await verifyStep(page);
  await card(page).getByRole('button', { name: 'Próximo', exact: true }).click(); await verifyStep(page);
  await card(page).getByRole('button', { name: 'Fechar guia', exact: true }).click();
  await help(page); await page.getByRole('button', { name: 'Continuar tour', exact: true }).click();
  await expect(card(page)).toHaveAttribute('data-tour-step','admin_calendar'); await verifyStep(page);
  await page.keyboard.press('Escape'); await expect(card(page)).toHaveCount(0);
  // Wait for the serialized write to reach the backend before testing reload.
  await expect.poll(() => page.evaluate(async () => {
    const response = await fetch('/api/v1/user-onboarding', { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}`, 'X-Tenant-ID':'test-clinic' } });
    return (await response.json()).onboardingStepId;
  })).toBe('admin_calendar');
  await page.reload(); await help(page); await page.getByRole('button', { name: 'Continuar tour', exact: true }).click();
  await expect(card(page)).toHaveAttribute('data-tour-step','admin_calendar'); await verifyStep(page);
  await page.keyboard.press('Escape'); await start(page);
  await expect(card(page)).toHaveAttribute('data-tour-step','admin_dashboard');
  await card(page).getByRole('button', { name: 'Pular tour', exact: true }).click(); await help(page);
  await expect(page.getByRole('button', { name: 'Continuar tour', exact: true })).toHaveCount(0);
});

test('alvo ausente nunca destaca outro botão nem avança sozinho', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await login(page,'manager');
  await page.locator('[data-tour="nav-dashboard"]').evaluate(el => el.removeAttribute('data-tour'));
  await help(page); await page.getByRole('button', { name: /Reiniciar tour/ }).click();
  await expect(page.getByText('Não foi possível localizar esta etapa.')).toBeVisible();
  await expect(page.locator('[data-tour-highlight]')).toHaveCount(0);
  await expect(card(page)).toHaveAttribute('data-tour-step','admin_dashboard');
  await page.locator('[data-nav-id="dashboard"]').evaluate(el => el.setAttribute('data-tour','nav-dashboard'));
  await page.getByRole('button', { name: 'Tentar novamente' }).click(); await verifyStep(page);
});

test('sidebar recolhida e renderização lenta', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await login(page,'manager');
  await page.locator('[data-tour-group="management"]').click();
  await page.route('**/assets/InventoryView-*.js', async route => {
    await new Promise(resolve => setTimeout(resolve, 2500)); await route.continue();
  });
  await start(page);
  for (let i=0;i<6;i++) { await verifyStep(page); await card(page).getByRole('button', {name:'Próximo',exact:true}).click(); }
  await expect(card(page)).toHaveAttribute('data-tour-step','admin_inventory'); await verifyStep(page);
  await expect(page.locator('[data-tour-group="management"]')).toHaveAttribute('aria-expanded','true');
});

test('aguarda dados da página lenta antes de mostrar o destaque', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await login(page,'manager');
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/inventory**', async route => { await delayed; await route.continue(); });
  await start(page);
  for (let i=0;i<6;i++) { await verifyStep(page); await card(page).getByRole('button', {name:'Próximo',exact:true}).click(); }
  await expect(page.locator('[data-tour-page="inventory"] [data-tour-loading="true"]')).toBeVisible();
  await expect(page.locator('[data-tour-highlight]')).toHaveCount(0);
  await expect(card(page)).toBeHidden();
  release(); await verifyStep(page);
});

test('cache separado ao trocar usuário no mesmo navegador', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'manager'); await start(page);
  await card(page).getByRole('button', { name: 'Próximo', exact: true }).click(); await verifyStep(page);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('zemda_onboarding_test-clinic_manager') || '{}').onboardingStepId)).toBe('admin_calendar');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await login(page, 'fisio'); await start(page);
  await expect(card(page)).toHaveAttribute('data-tour-step','solo_dashboard');
  const values = await page.evaluate(() => ['manager','fisio'].map(id => JSON.parse(localStorage.getItem(`zemda_onboarding_test-clinic_${id}`) || '{}')));
  expect(values[0].onboardingStepId).toBe('admin_calendar');
  expect(values[1].onboardingStepId).toBe('solo_dashboard');
});

test('boas-vindas: X e ESC temporários, recusa permanente somente explícita', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await login(page, 'manager');
  await page.evaluate(async () => {
    await fetch('/api/v1/user-onboarding/reset', {method:'POST', headers:{ Authorization:`Bearer ${localStorage.getItem('auth_token')}`, 'Content-Type':'application/json' }, body:'{}'});
    sessionStorage.removeItem('zemda_onboarding_test-clinic_manager_closed');
  });
  await page.reload();
  await page.getByRole('button', {name:'Fechar modal de boas-vindas'}).click();
  await expect(page.locator('[aria-labelledby="welcome-modal-title"]')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('zemda_onboarding_test-clinic_manager')!).onboardingStatus)).toBe('pending');
  await page.reload(); await expect(page.locator('[aria-labelledby="welcome-modal-title"]')).toHaveCount(0);
  await page.evaluate(() => sessionStorage.removeItem('zemda_onboarding_test-clinic_manager_closed')); await page.reload();
  await expect(page.locator('[aria-labelledby="welcome-modal-title"]')).toBeVisible(); await page.keyboard.press('Escape');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('zemda_onboarding_test-clinic_manager')!).onboardingDismissed)).toBe(false);
  await page.evaluate(() => sessionStorage.removeItem('zemda_onboarding_test-clinic_manager_closed')); await page.reload();
  await page.getByRole('button', {name:'Não mostrar novamente',exact:true}).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('zemda_onboarding_test-clinic_manager')!).onboardingDismissed)).toBe(true);
});

test('redimensionamento e teclado preservam alvo e etapa', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await login(page,'manager'); await start(page);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport); await verifyStep(page);
  }
  await card(page).focus(); await page.keyboard.press('ArrowRight');
  await expect(card(page)).toHaveAttribute('data-tour-step','admin_calendar'); await verifyStep(page);
  await card(page).focus(); await page.keyboard.press('ArrowLeft');
  await expect(card(page)).toHaveAttribute('data-tour-step','admin_dashboard'); await verifyStep(page);
});

test('continuar preserva o módulo e a última etapa após reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await login(page,'fisio'); await start(page,true);
  await card(page).getByRole('button',{name:'Próximo',exact:true}).click(); await verifyStep(page);
  await expect.poll(() => page.evaluate(async () => {
    const response = await fetch('/api/v1/user-onboarding', { headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } });
    return (await response.json()).onboardingStepId;
  })).toBe('fisio_kinetic');
  await page.reload(); await help(page); await page.getByRole('button',{name:'Continuar tour',exact:true}).click();
  await expect(card(page)).toHaveAttribute('data-tour-step','fisio_kinetic'); await verifyStep(page);
});

test('permite interação com o alvo e suspende o guia enquanto há modal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await login(page,'personal-audit'); await start(page,true);
  for (let i=0;i<2;i++) { await verifyStep(page); await card(page).getByRole('button',{name:'Próximo',exact:true}).click(); }
  await verifyStep(page);
  await page.locator('[data-tour="personal-exercises-tab"]').click();
  await expect(card(page)).toBeHidden();
  await expect(page.locator('[data-tour-highlight]')).toHaveCount(0);
});
