import { test, expect } from '@playwright/test';
import { apiLogin } from '../../helpers/session';
test('Zemda360 preserva mapa e notas registradas', async ({ request }) => {
  const headers = await apiLogin(request, 'fono');
  const notes = JSON.stringify({ selectedRegions: ['cabeca'], drawings: [], clinicalNotes: 'Observação sintética' });
  const save = await request.post('/api/v1/body-assessments', { headers, data: { patientId: 'pat-fono', appointmentId: 'apt-fono', module: 'ZemdaFono', notes } });
  expect(save.status()).toBe(200);
  const saved = await request.get('/api/v1/body-assessments/appointment/apt-fono', { headers });
  expect((await saved.json()).assessment.notes).toBe(notes);
});
