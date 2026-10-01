import { test, expect } from '@playwright/test';
import { apiLogin } from '../../helpers/session';
test('@critical orçamento odontológico persiste e pode ser excluído', async ({ request }) => {
  const headers = await apiLogin(request, 'odonto');
  const response = await request.post('/api/v1/dentistry/treatment-plans', { headers, data: {
    patientId: 'pat-odonto', title: 'Orçamento sintético E2E',
    items: [{ tooth: '16', procedure: 'Procedimento sintético', value: 100 }], totalValue: 100, finalValue: 100
  } });
  expect(response.status()).toBe(201);
  const { budgetId } = await response.json();
  expect(budgetId).toBeTruthy();
  const found = await request.get(`/api/v1/budgets/${budgetId}`, { headers });
  expect(found.status()).toBe(200);
  const removed = await request.delete(`/api/v1/budgets/${budgetId}`, { headers });
  expect(removed.ok()).toBeTruthy();
  expect((await request.get(`/api/v1/budgets/${budgetId}`, { headers })).status()).toBe(404);
});
