import { test, expect } from '@playwright/test';
import { apiLogin, password } from '../../helpers/session';

test('convite cria funcionário na clínica correta e impede reutilização', async ({request}) => {
  const headers=await apiLogin(request,'manager');
  const created=await request.post('/api/v1/staff/invites',{headers,data:{role:'professional',maxUses:1}});
  expect(created.status()).toBe(201);
  const {invite}=await created.json();
  const publicInvite=await request.get(`/api/v1/public/invites/${invite.token}`);
  expect((await publicInvite.json()).tenant.id).toBe('test-clinic');
  const email='invited-e2e@test.invalid';
  const verification=await request.post('/__e2e/verified-email',{data:{email,purpose:'invite_registration'}});
  const data={token:invite.token,email,password,name:'Profissional sintético convidado',professionId:'prof-fisioterapeuta',termsAccepted:true,privacyAccepted:true,emailVerificationToken:(await verification.json()).token};
  const registered=await request.post('/api/v1/auth/register-invite',{data});
  expect(registered.status()).toBe(201);
  expect((await request.post('/api/v1/auth/register-invite',{data:{...data,email:'reused@test.invalid'}})).status()).not.toBe(201);
  const staff=await request.get('/api/v1/staff',{headers});
  expect(staff.status()).toBe(200);
  expect(await staff.text()).toContain(email);
  const professional=await apiLogin(request,'fono');
  expect((await request.post('/api/v1/staff/invites',{headers:professional,data:{role:'professional'}})).status()).toBe(403);
});
