import { test, expect } from '@playwright/test';
test('@critical credenciais inválidas e endpoints protegidos', async ({ request }) => {
  expect((await request.post('/api/v1/auth/login', { data: { email: 'fisio@test.invalid', password: 'incorrect' } })).status()).toBe(401);
  for (const path of ['/api/v1/dashboard/metrics', '/api/v1/clinical-records/patient/pat-fisio', '/api/v1/admin/integrity']) {
    expect((await request.get(path)).status()).toBe(401);
  }
});
