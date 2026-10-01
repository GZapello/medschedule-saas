import { test, expect } from '@playwright/test';
import { apiLogin } from '../../helpers/session';
test('@critical rascunho persiste sem misturar pacientes', async ({ request }) => {
  const headers = await apiLogin(request, 'fisio');
  const data = { moduleType: 'fisio', patientId: 'pat-fisio-second', draftData: { chiefComplaint: 'Dado sintético exclusivo do segundo paciente', painScore: 0 }, clientUpdatedAt: new Date().toISOString() };
  expect((await request.post('/api/v1/clinical/draft', { headers, data })).ok()).toBe(true);
  const restored = await request.get('/api/v1/clinical/draft/fisio/pat-fisio-second', { headers });
  expect(restored.status()).toBe(200);
  expect(JSON.stringify(await restored.json())).toContain(data.draftData.chiefComplaint);
  const other = await request.get('/api/v1/clinical/draft/fisio/pat-fisio', { headers });
  expect(await other.text()).not.toContain(data.draftData.chiefComplaint);
  const unauthorized = await apiLogin(request, 'root');
  expect((await request.get('/api/v1/clinical/draft/fisio/pat-fisio-second', { headers: unauthorized })).status()).toBe(403);
});
