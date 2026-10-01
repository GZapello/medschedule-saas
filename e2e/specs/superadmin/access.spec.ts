import { test, expect } from '@playwright/test';
import { apiLogin } from '../../helpers/session';
test('SuperAdmin acessa governança e não acessa prontuário clínico', async ({ request }) => {
  const headers = await apiLogin(request, 'root');
  expect((await request.get('/api/v1/admin/metrics', { headers })).status()).toBe(200);
  expect((await request.get('/api/v1/clinical-records/patient/pat-fisio', { headers })).status()).toBe(403);
});
