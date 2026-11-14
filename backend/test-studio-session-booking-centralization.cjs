const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_studio_session_booking.db');
process.env.JWT_SECRET = 'test-studio-session-booking-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-session-booking-files-secret';
process.env.PORT = '3112';

for (const ext of ['', '-wal', '-shm']) {
  const f = process.env.DATABASE_PATH + ext;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { hashPassword } = require('./dist/utils/password');
const { generateToken } = require('./dist/utils/jwt');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

let passed = 0;
let failed = 0;

function assert(cond, msg, extra) {
  if (cond) {
    console.log(`  ✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${msg}`, extra ? JSON.stringify(extra).slice(0, 350) : '');
    failed++;
  }
}

function makeReq(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3112,
        path: urlPath,
        method,
        headers: { 'Content-Type': 'application/json', ...headers }
      },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body !== null) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  const server = app.listen(3112);
  console.log('\n====================================================================');
  console.log('SUÍTE DE TESTES: SESSÃO PERFIL STUDIO, PACOTES, TURMAS & AJUDA');
  console.log('====================================================================\n');

  try {
    const pwdHash = await hashPassword('SenhaForte@2026');

    const tenStudio = 'ten-sess-st-' + uuidv4().slice(0, 6);
    const tenClinic = 'ten-sess-cl-' + uuidv4().slice(0, 6);

    db.prepare(`
      INSERT INTO tenants (id, name, trade_name, slug, email, status, billing_required, public_booking_enabled, public_booking_slug, establishment_profile, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, ?, datetime('now'), datetime('now'))
    `).run(tenStudio, 'Unidade Clinic Inicial', 'Unidade Studio', 'studio-sess-a', 'st@sess.test', 'studio-sess-a', 'clinic');

    db.prepare(`
      INSERT INTO tenants (id, name, trade_name, slug, email, status, billing_required, public_booking_enabled, public_booking_slug, establishment_profile, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, ?, datetime('now'), datetime('now'))
    `).run(tenClinic, 'Unidade Clínica Tradicional', 'Unidade Clínica', 'clinic-sess-b', 'cl@sess.test', 'clinic-sess-b', 'clinic');

    const admUser = 'usr-sess-adm-' + uuidv4().slice(0, 6);
    const profUser1 = 'usr-sess-pr1-' + uuidv4().slice(0, 6);
    const profUser2 = 'usr-sess-pr2-' + uuidv4().slice(0, 6);
    const recepUser = 'usr-sess-rcp-' + uuidv4().slice(0, 6);
    const otherAdmUser = 'usr-sess-oadm-' + uuidv4().slice(0, 6);

    const insUser = db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, email_verified, onboarding_status) VALUES (?, ?, ?, ?, ?, ?, 'active', 1, 'active')`);
    insUser.run(admUser, tenStudio, 'Admin Multi', 'admin-sess@test.com', pwdHash, 'clinic_admin');
    insUser.run(profUser1, tenStudio, 'Instrutora Lia', 'prof1-sess@test.com', pwdHash, 'professional');
    insUser.run(profUser2, tenStudio, 'Instrutor Caio', 'prof2-sess@test.com', pwdHash, 'professional');
    insUser.run(recepUser, tenStudio, 'Recepcao Nina', 'recep-sess@test.com', pwdHash, 'receptionist');
    insUser.run(otherAdmUser, tenClinic, 'Admin Outro Tenant', 'other-adm@test.com', pwdHash, 'clinic_admin');

    const insCu = db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, ?, 'active', ?, ?)`);
    insCu.run('cu-s-1', tenStudio, admUser, 'clinic_admin', 1, '["manage_services","manage_settings"]');
    // Mesmo admin pertence à segunda unidade (clinic tradicional)
    insCu.run('cu-s-1b', tenClinic, admUser, 'clinic_admin', 0, '["manage_services","manage_settings"]');
    insCu.run('cu-s-2', tenStudio, profUser1, 'professional', 0, '["view_schedule"]');
    insCu.run('cu-s-3', tenStudio, profUser2, 'professional', 0, '["view_schedule"]');
    insCu.run('cu-s-4', tenStudio, recepUser, 'receptionist', 0, '["view_schedule","view_all_schedules"]');
    insCu.run('cu-s-5', tenClinic, otherAdmUser, 'clinic_admin', 1, '["manage_services","manage_settings"]');

    const prof1 = 'prof-sess-1';
    const prof2 = 'prof-sess-2';
    const profClinic = 'prof-sess-cl';
    const insProf = db.prepare(`INSERT INTO professionals (id, tenant_id, user_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`);
    insProf.run(prof1, tenStudio, profUser1, 'Instrutora Lia', 'lia-pilates', 'prof-instrutor', 'Instrutor');
    insProf.run(prof2, tenStudio, profUser2, 'Instrutor Caio', 'caio-danca', 'prof-instrutor', 'Instrutor');
    insProf.run(profClinic, tenClinic, otherAdmUser, 'Dr. Clínica', 'dr-clinica', 'prof-medico', 'Médico');

    const insSched = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)`);
    for (let d = 1; d <= 5; d++) {
      insSched.run(uuidv4(), tenStudio, prof1, d, '07:00', '21:00');
      insSched.run(uuidv4(), tenStudio, prof2, d, '07:00', '21:00');
    }

    const hdrAdmStudio = { Authorization: `Bearer ${generateToken({ userId: admUser, tenantId: tenStudio, email: 'admin-sess@test.com', role: 'clinic_admin', name: 'Admin Multi' })}`, 'x-tenant-id': tenStudio };
    const hdrAdmClinic = { Authorization: `Bearer ${generateToken({ userId: admUser, tenantId: tenClinic, email: 'admin-sess@test.com', role: 'clinic_admin', name: 'Admin Multi' })}`, 'x-tenant-id': tenClinic };
    const hdrProf1 = { Authorization: `Bearer ${generateToken({ userId: profUser1, tenantId: tenStudio, email: 'prof1-sess@test.com', role: 'professional', name: 'Instrutora Lia' })}`, 'x-tenant-id': tenStudio };
    const hdrRecep = { Authorization: `Bearer ${generateToken({ userId: recepUser, tenantId: tenStudio, email: 'recep-sess@test.com', role: 'receptionist', name: 'Recepcao Nina' })}`, 'x-tenant-id': tenStudio };
    const hdrOtherAdm = { Authorization: `Bearer ${generateToken({ userId: otherAdmUser, tenantId: tenClinic, email: 'other-adm@test.com', role: 'clinic_admin', name: 'Admin Outro Tenant' })}`, 'x-tenant-id': tenClinic };

    // -----------------------------------------------------------------
    // 1. Persistência de establishment_profile no banco e na sessão (/me e /login)
    // -----------------------------------------------------------------
    console.log('--- TESTE 1: Persistência de establishment_profile no Banco, /login e /me ---');
    const updStudioRes = await makeReq('PUT', '/api/v1/tenants/current', hdrAdmStudio, {
      name: 'Estúdio Pilates & Dança',
      establishmentProfile: 'studio'
    });
    assert(updStudioRes.status === 200 && updStudioRes.data.tenant?.establishment_profile === 'studio', 'PUT /v1/tenants/current grava establishment_profile = "studio"', updStudioRes.data);

    const meStudioRes = await makeReq('GET', '/api/v1/auth/me', hdrAdmStudio);
    assert(
      meStudioRes.status === 200 &&
      meStudioRes.data.tenant?.establishment_profile === 'studio' &&
      meStudioRes.data.tenant?.public_booking_enabled === 1 &&
      meStudioRes.data.tenant?.public_booking_slug === 'studio-sess-a',
      'GET /v1/auth/me retorna establishment_profile = "studio" e campos de agendamento público após reloadSession',
      meStudioRes.data.tenant
    );

    const loginRes = await makeReq('POST', '/api/v1/auth/login', {}, {
      email: 'admin-sess@test.com',
      password: 'SenhaForte@2026'
    });
    assert(
      loginRes.status === 200 && loginRes.data.tenant?.establishment_profile === 'studio',
      'POST /v1/auth/login retorna establishment_profile = "studio" persistido em sessão nova',
      loginRes.data.tenant
    );

    // Multi-unidade: alternando x-tenant-id para tenClinic retorna 'clinic' e mantém isolamento
    const meClinicRes = await makeReq('GET', '/api/v1/auth/me', hdrAdmClinic);
    assert(
      meClinicRes.status === 200 && meClinicRes.data.tenant?.id === tenClinic && meClinicRes.data.tenant?.establishment_profile === 'clinic',
      'Troca de unidade via x-tenant-id mantém tenClinic como "clinic" isolado de tenStudio',
      meClinicRes.data.tenant
    );

    // Testa também mixed
    await makeReq('PUT', '/api/v1/tenants/current', hdrAdmStudio, { establishmentProfile: 'mixed' });
    const meMixedRes = await makeReq('GET', '/api/v1/auth/me', hdrAdmStudio);
    assert(meMixedRes.data.tenant?.establishment_profile === 'mixed', 'Perfil "mixed" persiste integralmente em /v1/auth/me');
    await makeReq('PUT', '/api/v1/tenants/current', hdrAdmStudio, { establishmentProfile: 'studio' });

    // -----------------------------------------------------------------
    // 2. Pacotes visíveis em Studio/Misto e bloqueados na Clínica tradicional
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 2: Catálogo de Pacotes em Studio vs Clínica ---');
    const srvSingle = await makeReq('POST', '/api/v1/services', hdrAdmStudio, {
      professionalId: prof1,
      name: 'Pilates Solo Base',
      durationMinutes: 50,
      price: 120,
      modality: 'presential',
      serviceKind: 'individual',
      serviceDomain: 'studio'
    });
    assert(srvSingle.status === 201, 'Serviço studio individual criado com sucesso');

    const createPkg = await makeReq('POST', '/api/v1/packages', hdrAdmStudio, {
      name: 'Pacote Studio 8 Aulas',
      billingType: 'one_time',
      creditMode: 'per_service',
      price: 490,
      validityDays: 30,
      active: true,
      items: [{ serviceId: srvSingle.data.id, includedCredits: 8 }]
    });
    assert(createPkg.status === 201 && createPkg.data.package?.id, 'Pacote criado com sucesso no Studio', createPkg.data);

    const listPkgStudio = await makeReq('GET', '/api/v1/packages?includeInactive=1', hdrAdmStudio);
    assert(
      listPkgStudio.status === 200 &&
      listPkgStudio.data.isStudioCompatible === true &&
      Array.isArray(listPkgStudio.data.packages) &&
      listPkgStudio.data.packages.some(p => p.name === 'Pacote Studio 8 Aulas'),
      'GET /v1/packages?includeInactive=1 lista pacote no Studio',
      listPkgStudio.data
    );

    const listPkgClinic = await makeReq('GET', '/api/v1/packages?includeInactive=1', hdrAdmClinic);
    assert(
      listPkgClinic.status === 403 && listPkgClinic.data.code === 'STUDIO_PROFILE_REQUIRED',
      'GET /v1/packages?includeInactive=1 bloqueia Clínica tradicional (403 STUDIO_PROFILE_REQUIRED)',
      listPkgClinic.data
    );

    // -----------------------------------------------------------------
    // 3. Conversão individual -> aula coletiva com grade semanal no PUT /v1/services/:id
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 3: Conversão Individual -> Aula Coletiva + Grade Semanal no PUT ---');
    const convertRes = await makeReq('PUT', `/api/v1/services/${srvSingle.data.id}`, hdrAdmStudio, {
      professionalId: prof1,
      linkedProfessionalIds: [prof1, prof2],
      serviceKind: 'group',
      defaultCapacity: 10,
      serviceDomain: 'studio',
      classSchedules: [
        {
          weekdays: [1, 3],
          startTime: '08:00',
          endTime: '08:50',
          professionalId: prof2,
          capacity: 10,
          modality: 'presential',
          effectiveStartDate: '2026-01-01'
        }
      ]
    });
    assert(
      convertRes.status === 200 &&
      convertRes.data.service_kind === 'group' &&
      Array.isArray(convertRes.data.class_schedules) &&
      convertRes.data.class_schedules.length === 2 &&
      convertRes.data.linked_professional_ids?.includes(prof2) &&
      convertRes.data.schedule_diagnostics?.publishableCount === 2,
      'PUT /v1/services/:id converte individual -> turma com 2 horários semanais publicáveis e instrutor vinculado',
      convertRes.data
    );

    const slotsRes = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-sess-a&serviceId=${srvSingle.data.id}&includeUpcoming=1&startDate=2026-11-14`);
    assert(
      slotsRes.status === 200 && Array.isArray(slotsRes.data.upcomingSlots) && slotsRes.data.upcomingSlots.length > 0,
      'Agendamento público (/v1/public/studio/slots) reflete imediatamente os horários configurados na turma',
      slotsRes.data
    );

    // -----------------------------------------------------------------
    // 4. Centralização & Permissões do Agendamento Online por Papel / Tenant
    // -----------------------------------------------------------------
    console.log('\n--- TESTE 4: Permissões de Agendamento Online (Admin / Profissional / Recepção / Cross-Tenant) ---');
    // Admin desativa e reativa página pública do estabelecimento
    const admOffClinic = await makeReq('PUT', '/api/v1/tenants/current', hdrAdmStudio, { publicBookingEnabled: false });
    const admOnClinic = await makeReq('PUT', '/api/v1/tenants/current', hdrAdmStudio, { publicBookingEnabled: true });
    assert(
      admOffClinic.status === 200 && admOnClinic.status === 200,
      'Admin pode ativar/desativar página pública do estabelecimento'
    );

    // Profissional NÃO pode alterar página da clínica, mas pode alterar a PRÓPRIA página (e não a de outro)
    const profTenantToggle = await makeReq('PUT', '/api/v1/tenants/current', hdrProf1, { publicBookingEnabled: false });
    const profSelfToggle = await makeReq('PUT', `/api/v1/professionals/${prof1}`, hdrProf1, { publicBookingEnabled: false });
    const profSelfRestore = await makeReq('PUT', `/api/v1/professionals/${prof1}`, hdrProf1, { publicBookingEnabled: true });
    const profOtherToggle = await makeReq('PUT', `/api/v1/professionals/${prof2}`, hdrProf1, { publicBookingEnabled: false });
    assert(
      profTenantToggle.status === 403 &&
      profSelfToggle.status === 200 &&
      profSelfRestore.status === 200 &&
      profOtherToggle.status === 403,
      'Profissional altera apenas seu próprio link individual e recebe 403 ao tentar alterar estabelecimento ou outro profissional',
      { profTenantToggle: profTenantToggle.status, profSelfToggle: profSelfToggle.status, profOtherToggle: profOtherToggle.status }
    );

    // Recepcionista tem acesso somente leitura aos links
    const recepListProfs = await makeReq('GET', '/api/v1/professionals', hdrRecep);
    const recepToggleTenant = await makeReq('PUT', '/api/v1/tenants/current', hdrRecep, { publicBookingEnabled: false });
    const recepToggleProf = await makeReq('PUT', `/api/v1/professionals/${prof1}`, hdrRecep, { publicBookingEnabled: false });
    assert(
      recepListProfs.status === 200 &&
      Array.isArray(recepListProfs.data) &&
      recepListProfs.data.some(p => p.slug === 'lia-pilates') &&
      recepToggleTenant.status === 403 &&
      recepToggleProf.status === 403,
      'Recepção lê links ativos via GET /v1/professionals e é bloqueada (403) ao tentar ativar/desativar links',
      { listStatus: recepListProfs.status, toggleTenant: recepToggleTenant.status, toggleProf: recepToggleProf.status }
    );

    // Isolamento cross-tenant: admin de outro tenant não altera profissional deste Studio
    const crossTenantProfToggle = await makeReq('PUT', `/api/v1/professionals/${prof1}`, hdrOtherAdm, { publicBookingEnabled: false });
    assert(
      crossTenantProfToggle.status === 403 || crossTenantProfToggle.status === 404,
      'Admin de outra unidade é bloqueado ao tentar alterar link público de profissional deste Studio',
      crossTenantProfToggle.status
    );
  } catch (err) {
    console.error('❌ EXCEÇÃO INESPERADA NA SUÍTE:', err);
    failed++;
  } finally {
    server.close();
    try { db.close(); } catch (_) {}
    for (const ext of ['', '-wal', '-shm']) {
      const f = process.env.DATABASE_PATH + ext;
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (_) {}
      }
    }
    console.log('\n====================================================================');
    console.log(`RESULTADO FINAL: ${passed} passed, ${failed} failed`);
    console.log('====================================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
