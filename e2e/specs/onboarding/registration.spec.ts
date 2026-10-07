import { test, expect } from '@playwright/test';
import { apiLogin, password } from '../../helpers/session';
test('@critical cadastro → verificação → plano → perfil → acesso operacional', async ({ request }) => {
  const data = { email:'registration-e2e@test.invalid', responsibleName:'Pessoa sintética', clinicName:'Clínica E2E', managerProfession:'Fisioterapeuta', password, termsAccepted:true, privacyAccepted:true };
  const response = await request.post('/api/v1/public/tenants/register',{data});
  expect(response.status()).toBe(201);
  const result = await response.json();
  expect(result.onboardingStatus).toBe('pending_verification');
  const headers = {Authorization: 'Bearer '+result.token};
  const blocked = await request.get('/api/v1/patients',{headers});
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).code).toBe('ONBOARDING_INCOMPLETE');
  expect((await request.post('/api/v1/public/tenants/register',{data})).status()).toBe(409);
  expect((await request.post('/api/v1/onboarding/verify-email',{headers,data:{code:'000000'}})).status()).toBe(400);
  const verified = await request.post('/api/v1/onboarding/verify-email',{headers,data:{code:'123456'}});
  expect(verified.status()).toBe(200);
  expect((await verified.json()).onboardingStatus).toBe('pending_plan');
  expect((await request.post('/api/v1/onboarding/select-plan',{headers,data:{planCode:'SOLO',startTrial:true}})).status()).toBe(200);
  const profile = await request.post('/api/v1/onboarding/complete-profile',{headers,data:{registrationType:'CREFITO',registrationNumber:'E2E-SYNTHETIC',practiceAreaIds:[]}});
  expect(profile.status()).toBe(200);
  expect((await profile.json()).onboardingStatus).toBe('active');
  expect((await request.get('/api/v1/patients',{headers})).status()).toBe(200);
});

test('onboarding permite gestor e bloqueia edição por profissional', async ({ request }) => {
  const headers = await apiLogin(request, 'manager');
  expect((await request.post('/api/v1/onboarding/step', { headers, data: { step: 1, tradeName: 'Clínica E2E sintética' } })).status()).toBe(200);
  const professional = await apiLogin(request, 'fono');
  expect((await request.post('/api/v1/onboarding/step', { headers: professional, data: { step: 1 } })).status()).toBe(403);
});
