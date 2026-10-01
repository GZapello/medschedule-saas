import { test, expect } from '@playwright/test';
import { apiLogin } from '../../helpers/session';

test('@critical Integridade exige SuperAdmin e omite conteúdo sensível', async ({ request }) => {
  const professional = await apiLogin(request, 'fisio');
  expect((await request.get('/api/v1/admin/integrity', { headers: professional })).status()).toBe(403);
  expect((await request.get('/api/v1/admin/integrity')).status()).toBe(401);
  await request.post('/__e2e/failure/private-patient-id?token=private-token', { data: { diagnosis: 'CLINICAL_SECRET_MUST_NOT_APPEAR_IN_TELEMETRY' } });
  const root = await apiLogin(request, 'root');
  const response = await request.get('/api/v1/admin/integrity', { headers: root });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.recent.some((row: any) => row.endpoint === 'POST /__e2e/failure/:id')).toBe(true);
  const serialized = JSON.stringify(body);
  for (const secret of ['CLINICAL_SECRET', 'private-patient-id', 'private-token', 'password_hash', 'draft_data_json']) expect(serialized).not.toContain(secret);
  expect(body.pagination.pageSize).toBe(25);
  expect((await request.get('/api/v1/admin/integrity?page=-1', { headers: root })).status()).toBe(400);
  expect((await request.get('/api/v1/admin/integrity', { headers: { ...root, 'x-sandbox-session': 'synthetic' } })).status()).toBe(403);
});
