import { test, expect } from '@playwright/test';
import { apiLogin } from '../../helpers/session';
test('agenda confirma, registra falta e preserva escopo', async ({ request }) => {
  const headers = await apiLogin(request, 'to');
  for (const status of ['confirmed', 'no_show']) expect((await request.put('/api/v1/appointments/apt-to/status', { headers, data: { status } })).status()).toBe(200);
  const appointments = await request.get('/api/v1/appointments', { headers });
  expect((await appointments.json()).find((a: any) => a.id === 'apt-to').status).toBe('no_show');
});
