import { test, expect } from '../../helpers/audit-test';
import { login, apiLogin } from '../../helpers/session';

test('Relatórios: dados reais das APIs e exportação CSV pelo navegador', async ({ page, request }) => {
  await login(page, 'manager');
  const headers = await apiLogin(request, 'manager');
  const attendanceLoaded = page.waitForResponse(r => r.url().endsWith('/v1/reports/attendance'));
  const financialLoaded = page.waitForResponse(r => r.url().endsWith('/v1/reports/financial'));
  await page.goto('/relatorios');
  expect((await attendanceLoaded).ok()).toBe(true);
  expect((await financialLoaded).ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Relatórios & Métricas Analíticas' })).toBeVisible();
  for (const [kind, label] of [['appointments', 'Exportar Atendimentos (CSV)'], ['payments', 'Exportar Financeiro (CSV)']]) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    expect((await download).suggestedFilename()).toBe(`relatorio-${kind}.csv`);
    const response = await request.get(`/api/v1/reports/export-csv?type=${kind}`, { headers });
    expect(response.ok()).toBe(true);
    expect((await response.text()).trim().length).toBeGreaterThan(5);
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Desempenho por Profissional' })).toBeVisible();
});
