import { test, expect } from '@playwright/test';
import { login, apiLogin } from '../../helpers/session';
test('@critical Dashboard Hoje respeita profissional e financeiro', async ({ page, request }) => {
  await login(page);
  await expect(page.getByText('Agenda de Hoje', { exact: true })).toBeVisible();
  await expect(page.getByText('Paciente teste fisio', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Paciente teste nutri', { exact: true })).toHaveCount(0);
  const headers = await apiLogin(request, 'fisio');
  const response = await request.get('/api/v1/dashboard/metrics', { headers });
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.permissions.finance).toBe(false);
  expect(data.monthly).not.toHaveProperty('revenue');
  expect(data.worklist).not.toHaveProperty('finance');
  expect(data.chart.every((row: any) => !('revenue' in row))).toBeTruthy();
  expect(data.today.appointments.every((row: any) => row.professional_id === 'pro-fisio')).toBeTruthy();
});
