import { test, expect } from '@playwright/test';
test('Personal protege avaliações e treinos sem autenticação', async ({ request }) => {
  for (const path of ['/api/v1/personal/assessments', '/api/v1/personal/workouts', '/api/v1/personal/students']) expect((await request.get(path)).status()).toBe(401);
});
