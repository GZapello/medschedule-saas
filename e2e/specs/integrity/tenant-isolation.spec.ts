import { test, expect } from '@playwright/test';
import { apiLogin, password } from '../../helpers/session';

test('@critical Clínicas A/B: IDs manipulados não expõem nem alteram dados clínicos ou financeiros', async ({ request }) => {
  const a = await apiLogin(request, 'manager');
  const registered = await request.post('/api/v1/public/tenants/register', { data: {
    email:'e2e-tenant-isolation@test.invalid', responsibleName:'e2e-user-isolation', clinicName:'e2e-tenant-isolation',
    managerProfession:'Fisioterapeuta', password, termsAccepted:true, privacyAccepted:true
  } });
  expect(registered.status()).toBe(201);
  const b = { Authorization:`Bearer ${(await registered.json()).token}` };
  expect((await request.post('/api/v1/onboarding/verify-email', { headers:b, data:{code:'123456'} })).ok()).toBe(true);
  expect((await request.post('/api/v1/onboarding/select-plan', { headers:b, data:{planCode:'SOLO',startTrial:true} })).ok()).toBe(true);
  expect((await request.post('/api/v1/onboarding/complete-profile', { headers:b, data:{registrationType:'CREFITO',registrationNumber:'E2E',practiceAreaIds:[]} })).ok()).toBe(true);
  const patients = await request.get('/api/v1/patients', { headers:b });
  expect(patients.ok()).toBe(true);
  expect(JSON.stringify(await patients.json())).not.toContain('pat-fisio');
  const foreignBudget = await request.post('/api/v1/budgets', { headers:b, data:{budgetType:'patient',patientId:'pat-fisio',items:[{description:'Sintético',quantity:1,unitPrice:100}]} });
  expect(foreignBudget.status()).toBe(404);
  for (const path of ['/api/v1/patients/pat-fisio', '/api/v1/appointments/apt-fisio', '/api/v1/appointments/apt-fisio/completion', '/api/v1/clinical-records/patient/pat-fisio', '/api/v1/clinical-assessments/patients/pat-fisio/evolution', '/api/v1/patients/pat-fisio/consents']) {
    const response = await request.get(path, { headers:b });
    expect([403,404], `${path}: ${await response.text()}`).toContain(response.status());
  }
  const changed = await request.put('/api/v1/inventory/estetic-stock', { headers:b, data:{name:'FOREIGN-WRITE',quantity:999} });
  expect([403,404]).toContain(changed.status());
  const stock = await request.get('/api/v1/inventory', { headers:a });
  expect((await stock.json()).items.find((item:any)=>item.id==='estetic-stock').name).toBe('Produto sintético');
  const budget = await request.post('/api/v1/budgets', { headers:a, data:{budgetType:'patient',patientId:'pat-fisio',items:[{description:'Sintético',quantity:1,unitPrice:100}]} });
  expect(budget.status()).toBe(201);
  const id = (await budget.json()).id;
  expect((await request.get(`/api/v1/budgets/${id}`, { headers:b })).status()).toBe(404);
  expect([403,404]).toContain((await request.put(`/api/v1/budgets/${id}/status`, { headers:b,data:{status:'approved'} })).status());
  const original = await request.get(`/api/v1/budgets/${id}`, { headers:a });
  expect(original.ok()).toBe(true);
  expect(JSON.stringify(await original.json())).toContain('draft');
});
