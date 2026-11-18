const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_studio_pkg_diagnostics.db');
process.env.JWT_SECRET = 'test-pkg-diag-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-pkg-diag-files-secret-123456';
process.env.NODE_ENV = 'test';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  fs.unlinkSync(process.env.DATABASE_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

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
    console.error(`  ❌ [FAIL] ${msg}`, extra !== undefined ? extra : '');
    failed++;
  }
}

function makeReq(port, method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: { 'Content-Type': 'application/json', ...headers }
      },
      res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
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

function getNextWeekdayIso(targetWeekday, offsetWeeks = 1) {
  const now = new Date(Date.now() - 3 * 3600 * 1000);
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const diff = (targetWeekday - base.getUTCDay() + 7) % 7 || 7;
  base.setUTCDate(base.getUTCDate() + diff + (offsetWeeks - 1) * 7);
  return base.toISOString().slice(0, 10);
}

async function runTests() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;

  console.log('\n==============================================================');
  console.log('TESTES: DIAGNÓSTICO E PUBLICAÇÃO PÚBLICA DE PACOTES & PLANOS STUDIO');
  console.log('==============================================================\n');

  try {
    const studioTenant = 'ten-studio-' + uuidv4().slice(0, 8);
    const mixedTenant = 'ten-mixed-' + uuidv4().slice(0, 8);
    const clinicTenant = 'ten-clinic-' + uuidv4().slice(0, 8);

    const insTenant = db.prepare(`
      INSERT INTO tenants (id, name, trade_name, slug, email, status, billing_required, public_booking_enabled, establishment_profile, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, datetime('now'), datetime('now'))
    `);
    insTenant.run(studioTenant, 'Studio Teste', 'Studio Teste', 'studio-teste', 'studio@zemda.test', 'studio');
    insTenant.run(mixedTenant, 'Espaço Misto Teste', 'Espaço Misto Teste', 'studio-misto', 'misto@zemda.test', 'mixed');
    insTenant.run(clinicTenant, 'Clínica Tradicional Teste', 'Clínica Tradicional', 'clinica-trad', 'clinica@zemda.test', 'clinic');

    const uStudio = 'usr-st-' + uuidv4().slice(0, 6);
    const uMixed = 'usr-mx-' + uuidv4().slice(0, 6);
    const uClinic = 'usr-cl-' + uuidv4().slice(0, 6);
    for (const [uid, tid, em] of [
      [uStudio, studioTenant, 'adm-st@test.invalid'],
      [uMixed, mixedTenant, 'adm-mx@test.invalid'],
      [uClinic, clinicTenant, 'adm-cl@test.invalid']
    ]) {
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, 'Gestor', ?, 'hash', 'clinic_admin', 'active')`).run(uid, tid, em);
      db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["manage_services","view_financial","manage_financial"]')`).run('cu-' + uuidv4().slice(0, 8), tid, uid);
    }

    const authStudio = { Authorization: `Bearer ${generateToken({ userId: uStudio, tenantId: studioTenant, role: 'clinic_admin', email: 'adm-st@test.invalid' })}`, 'x-tenant-id': studioTenant };
    const authMixed = { Authorization: `Bearer ${generateToken({ userId: uMixed, tenantId: mixedTenant, role: 'clinic_admin', email: 'adm-mx@test.invalid' })}`, 'x-tenant-id': mixedTenant };

    const profPub = 'prof-pub-' + uuidv4().slice(0, 6);
    const profPriv = 'prof-priv-' + uuidv4().slice(0, 6);
    const profInactive = 'prof-inact-' + uuidv4().slice(0, 6);
    const profMixedStudio = 'prof-mx-st-' + uuidv4().slice(0, 6);
    const profMixedClinic = 'prof-mx-cl-' + uuidv4().slice(0, 6);
    const profClinic = 'prof-cl-' + uuidv4().slice(0, 6);

    const insProf = db.prepare(`INSERT INTO professionals (id, tenant_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, ?, ?, 'prof-instrutor', 'Instrutor', ?, ?)`);
    insProf.run(profPub, studioTenant, 'Instrutora Clara', 'clara-danca', 1, 1);
    insProf.run(profPriv, studioTenant, 'Instrutor Privado', 'privado-danca', 1, 0);
    insProf.run(profInactive, studioTenant, 'Instrutor Inativo', 'inativo-danca', 0, 1);
    insProf.run(profMixedStudio, mixedTenant, 'Instrutor Studio Misto', 'mx-st', 1, 1);
    insProf.run(profMixedClinic, mixedTenant, 'Dra. Misto Clínica', 'mx-cl', 1, 1);
    db.prepare(`INSERT INTO professionals (id, tenant_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, 'Dr. Clínica', 'dr-cl', 'prof-medico', 'Médico', 1, 1)`).run(profClinic, clinicTenant);

    const insSched = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, '08:00', '20:00', 1)`);
    for (let dow = 1; dow <= 5; dow++) {
      insSched.run(uuidv4(), studioTenant, profPub, dow);
      insSched.run(uuidv4(), studioTenant, profPriv, dow);
      insSched.run(uuidv4(), mixedTenant, profMixedStudio, dow);
      insSched.run(uuidv4(), mixedTenant, profMixedClinic, dow);
      insSched.run(uuidv4(), clinicTenant, profClinic, dow);
    }

    // -----------------------------------------------------------------
    // CASO 1: Dança vinculada APENAS via class_schedules (sem s.professional_id / ps)
    // -----------------------------------------------------------------
    console.log('--- CASO 1: Serviço de Dança vinculado via grade (class_schedules) no Pacote "Aulas" ---');
    const srvDancaOnlyViaSchedule = 'srv-danca-' + uuidv4().slice(0, 6);
    db.prepare(`
      INSERT INTO services (
        id, tenant_id, professional_id, name, duration_minutes, buffer_minutes, price, modality,
        service_domain, service_kind, studio_service_type, requires_appointment, allow_public_booking,
        default_capacity, allow_recurrence, active
      ) VALUES (?, ?, NULL, 'Dança', 50, 10, 60, 'presential', 'studio', 'group', 'group', 1, 1, 10, 1, 1)
    `).run(srvDancaOnlyViaSchedule, studioTenant);

    const csDancaId = 'cs-danca-' + uuidv4().slice(0, 6);
    db.prepare(`
      INSERT INTO class_schedules (
        id, tenant_id, service_id, professional_id, day_of_week, start_time, end_time,
        capacity, modality, effective_start_date, active
      ) VALUES (?, ?, ?, ?, 2, '18:00', '18:50', 10, 'presential', '2026-01-01', 1)
    `).run(csDancaId, studioTenant, srvDancaOnlyViaSchedule, profPub);

    const createPkgRes = await makeReq(port, 'POST', '/api/v1/packages', authStudio, {
      name: 'Aulas',
      billingType: 'recurring_monthly',
      billingFrequency: 'monthly',
      price: 180,
      creditMode: 'per_service',
      validityDays: 30,
      allowPublicBooking: true,
      active: true,
      items: [{ serviceId: srvDancaOnlyViaSchedule, includedCredits: 4 }]
    });
    assert(createPkgRes.status === 201 && createPkgRes.data?.package?.id, 'Pacote Aulas (R$ 180, 4x Dança, 30 dias) criado');
    const pkgAulasId = createPkgRes.data.package.id;

    const pubProfile1 = await makeReq(port, 'GET', '/api/v1/public/tenants/studio-teste');
    assert(
      pubProfile1.status === 200 &&
      pubProfile1.data.packages?.some(p => p.id === pkgAulasId && p.name === 'Aulas') &&
      pubProfile1.data.services?.some(s => s.id === srvDancaOnlyViaSchedule) &&
      pubProfile1.data.professionals?.find(p => p.id === profPub)?.services?.some(s => s.id === srvDancaOnlyViaSchedule),
      'Pacote Aulas e serviço Dança aparecem no link público mesmo quando o instrutor está vinculado apenas pela grade semanal'
    );

    const adminList1 = await makeReq(port, 'GET', '/api/v1/packages?includeInactive=1', authStudio);
    const aulasDiag1 = (adminList1.data.packages || []).find(p => p.id === pkgAulasId)?.public_booking_diagnostics;
    assert(
      aulasDiag1?.isPublicReady === true && aulasDiag1?.blockers?.length === 0,
      'Diagnóstico administrativo indica Pacote Aulas pronto para publicação pública'
    );

    // Contrata pacote Aulas pelo link público sem reintroduzir controle de entrada/saída
    const tuesdayNext = getNextWeekdayIso(2, 2);
    const pubBookRes = await makeReq(port, 'POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-teste',
      mode: 'package',
      packageId: pkgAulasId,
      schedules: [{
        serviceId: srvDancaOnlyViaSchedule,
        classScheduleId: csDancaId,
        professionalId: profPub,
        modality: 'presential',
        startTime: `${tuesdayNext}T18:00:00`,
        endTime: `${tuesdayNext}T18:50:00`
      }],
      student: { fullName: 'Aluna Camila Dança', phone: '11988881122' }
    });
    assert(
      pubBookRes.status === 201 && pubBookRes.data.status === 'awaiting_confirmation',
      'Solicitação pública do pacote Aulas aceita corretamente',
      pubBookRes.data
    );

    // -----------------------------------------------------------------
    // CASO 2: Diagnósticos claros e filtros legítimos para cada bloqueio
    // -----------------------------------------------------------------
    console.log('\n--- CASO 2: Diagnósticos Claros no Cadastro do Pacote para Cada Pendência ---');

    // 2a: Instrutor com public_booking_enabled = 0
    db.prepare(`UPDATE class_schedules SET professional_id = ? WHERE id = ?`).run(profPriv, csDancaId);
    let pubCheck = await makeReq(port, 'GET', '/api/v1/public/tenants/studio-teste');
    let admCheck = await makeReq(port, 'GET', '/api/v1/packages?includeInactive=1', authStudio);
    let diag = admCheck.data.packages.find(p => p.id === pkgAulasId).public_booking_diagnostics;
    assert(
      !pubCheck.data.packages.some(p => p.id === pkgAulasId) &&
      diag.isPublicReady === false &&
      diag.blockers.some(b => b.includes('agendamento público desativado')),
      'Instrutor com public_booking_enabled=0 oculta no público e exibe diagnóstico claro no cadastro do pacote',
      diag.blockers
    );

    // Restaura profPub e desativa todas as grades de Dança (sem grade semanal)
    db.prepare(`UPDATE class_schedules SET professional_id = ?, active = 0 WHERE id = ?`).run(profPub, csDancaId);
    db.prepare(`UPDATE services SET professional_id = ? WHERE id = ?`).run(profPub, srvDancaOnlyViaSchedule);
    pubCheck = await makeReq(port, 'GET', '/api/v1/public/tenants/studio-teste');
    admCheck = await makeReq(port, 'GET', '/api/v1/packages?includeInactive=1', authStudio);
    diag = admCheck.data.packages.find(p => p.id === pkgAulasId).public_booking_diagnostics;
    assert(
      !pubCheck.data.packages.some(p => p.id === pkgAulasId) &&
      diag.isPublicReady === false &&
      diag.blockers.some(b => b.toLowerCase().includes('pausado') || b.toLowerCase().includes('grade semanal')),
      'Turma sem horário ativo na grade oculta no público e exibe diagnóstico claro da grade',
      diag.blockers
    );

    // Remove a grade completamente -> sem dias/horários cadastrados
    db.prepare(`DELETE FROM class_schedules WHERE id = ?`).run(csDancaId);
    pubCheck = await makeReq(port, 'GET', '/api/v1/public/tenants/studio-teste');
    admCheck = await makeReq(port, 'GET', '/api/v1/packages?includeInactive=1', authStudio);
    diag = admCheck.data.packages.find(p => p.id === pkgAulasId).public_booking_diagnostics;
    assert(
      !pubCheck.data.packages.some(p => p.id === pkgAulasId) &&
      diag.isPublicReady === false &&
      diag.blockers.some(b => b.includes('não possui dias e horários cadastrados')),
      'Turma sem nenhuma grade cadastrada exibe diagnóstico específico',
      diag.blockers
    );

    // Recria grade mas coloca Dança allow_public_booking = 0
    db.prepare(`
      INSERT INTO class_schedules (
        id, tenant_id, service_id, professional_id, day_of_week, start_time, end_time,
        capacity, modality, effective_start_date, active
      ) VALUES (?, ?, ?, ?, 2, '18:00', '18:50', 10, 'presential', '2026-01-01', 1)
    `).run(csDancaId, studioTenant, srvDancaOnlyViaSchedule, profPub);
    db.prepare(`UPDATE services SET allow_public_booking = 0 WHERE id = ?`).run(srvDancaOnlyViaSchedule);
    pubCheck = await makeReq(port, 'GET', '/api/v1/public/tenants/studio-teste');
    admCheck = await makeReq(port, 'GET', '/api/v1/packages?includeInactive=1', authStudio);
    diag = admCheck.data.packages.find(p => p.id === pkgAulasId).public_booking_diagnostics;
    assert(
      !pubCheck.data.packages.some(p => p.id === pkgAulasId) &&
      diag.isPublicReady === false &&
      diag.blockers.some(b => b.includes('Disponibilizar no agendamento público')),
      'Serviço Dança com allow_public_booking=0 oculta pacote com diagnóstico explícito',
      diag.blockers
    );

    // Restaura allow_public_booking = 1 na Dança, mas remove vínculo de profissional ativo (usa inativo)
    db.prepare(`UPDATE services SET allow_public_booking = 1, professional_id = ? WHERE id = ?`).run(profInactive, srvDancaOnlyViaSchedule);
    db.prepare(`DELETE FROM class_schedules WHERE id = ?`).run(csDancaId);
    admCheck = await makeReq(port, 'GET', '/api/v1/packages?includeInactive=1', authStudio);
    diag = admCheck.data.packages.find(p => p.id === pkgAulasId).public_booking_diagnostics;
    assert(
      diag.isPublicReady === false &&
      diag.blockers.some(b => b.includes('inativo')),
      'Instrutor inativo aparece no diagnóstico do pacote',
      diag.blockers
    );

    // Restaura Dança completamente válida -> pacote reaparece no link público
    db.prepare(`UPDATE services SET professional_id = ? WHERE id = ?`).run(profPub, srvDancaOnlyViaSchedule);
    db.prepare(`
      INSERT INTO class_schedules (
        id, tenant_id, service_id, professional_id, day_of_week, start_time, end_time,
        capacity, modality, effective_start_date, active
      ) VALUES (?, ?, ?, ?, 2, '18:00', '18:50', 10, 'presential', '2026-01-01', 1)
    `).run(csDancaId, studioTenant, srvDancaOnlyViaSchedule, profPub);
    pubCheck = await makeReq(port, 'GET', '/api/v1/public/tenants/studio-teste');
    admCheck = await makeReq(port, 'GET', '/api/v1/packages?includeInactive=1', authStudio);
    diag = admCheck.data.packages.find(p => p.id === pkgAulasId).public_booking_diagnostics;
    assert(
      pubCheck.data.packages.some(p => p.id === pkgAulasId) &&
      diag.isPublicReady === true &&
      diag.blockers.length === 0,
      'Após resolver pendências, pacote Aulas volta imediatamente ao catálogo público'
    );

    // -----------------------------------------------------------------
    // CASO 3: Plano de academia SEM horário, SEM instrutor e SEM agendamento
    // -----------------------------------------------------------------
    console.log('\n--- CASO 3: Planos/Pacotes de Academia sem Horário, sem Instrutor e sem Agendamento ---');
    const createMusc = await makeReq(port, 'POST', '/api/v1/services', authStudio, {
      name: 'Musculação Acesso Livre',
      studioServiceType: 'facility_access',
      requiresAppointment: false,
      allowPublicBooking: true,
      price: 119.9,
      serviceDomain: 'studio'
    });
    assert(createMusc.status === 201 && createMusc.data.requires_appointment === 0, 'Plano Musculação sem instrutor e sem horário criado');
    const srvMuscId = createMusc.data.id;

    const createAccessPkg = await makeReq(port, 'POST', '/api/v1/packages', authStudio, {
      name: 'Plano Academia Mensal',
      billingType: 'recurring_monthly',
      billingFrequency: 'monthly',
      price: 119.9,
      validityDays: 30,
      allowPublicBooking: true,
      items: [{ serviceId: srvMuscId, itemType: 'facility_access', accessMode: 'unlimited' }]
    });
    assert(createAccessPkg.status === 201, 'Pacote de Plano Academia sem horário/instrutor criado');
    const pkgAccessId = createAccessPkg.data.package.id;

    pubCheck = await makeReq(port, 'GET', '/api/v1/public/tenants/studio-teste');
    admCheck = await makeReq(port, 'GET', '/api/v1/packages?includeInactive=1', authStudio);
    const accessDiag = admCheck.data.packages.find(p => p.id === pkgAccessId).public_booking_diagnostics;
    assert(
      pubCheck.data.packages.some(p => p.id === pkgAccessId) &&
      pubCheck.data.services.some(s => s.id === srvMuscId && s.requires_appointment === 0) &&
      accessDiag.isPublicReady === true,
      'Plano e pacote de academia sem horário e sem instrutor aparecem normalmente no catálogo público'
    );

    const slotCheckNonSched = await makeReq(port, 'GET', `/api/v1/public/studio/slots?tenantSlug=studio-teste&serviceId=${srvMuscId}`);
    assert(
      slotCheckNonSched.status === 200 && slotCheckNonSched.data.requiresAppointment === false,
      'Consulta de slots identifica serviço não agendável com requiresAppointment=false'
    );

    // -----------------------------------------------------------------
    // CASO 4: Preservação de Clínica tradicional & Misto
    // -----------------------------------------------------------------
    console.log('\n--- CASO 4: Preservação de Clínica Tradicional & Misto ---');
    const srvClinic = 'srv-cl-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, modality, service_kind, active) VALUES (?, ?, ?, 'Consulta Médica', 50, 250, 'presential', 'individual', 1)`).run(srvClinic, clinicTenant, profClinic);
    const pubClinicRes = await makeReq(port, 'GET', '/api/v1/public/tenants/clinica-trad');
    assert(
      pubClinicRes.status === 200 &&
      pubClinicRes.data.tenant.establishment_profile === 'clinic' &&
      pubClinicRes.data.packages.length === 0 &&
      pubClinicRes.data.services.some(s => s.id === srvClinic),
      'Clínica tradicional preservada integralmente (sem pacotes Studio)'
    );

    // Misto com serviço Studio + pacote
    const srvMxCl = 'srv-mxcl-' + uuidv4().slice(0, 6);
    const srvMxSt = 'srv-mxst-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, modality, service_domain, service_kind, active) VALUES (?, ?, ?, 'Consulta Nutrição', 50, 200, 'presential', 'clinical', 'individual', 1)`).run(srvMxCl, mixedTenant, profMixedClinic);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, modality, service_domain, service_kind, studio_service_type, requires_appointment, active) VALUES (?, ?, ?, 'Treino Studio', 50, 90, 'presential', 'studio', 'individual', 'individual', 1, 1)`).run(srvMxSt, mixedTenant, profMixedStudio);
    const mxPkgRes = await makeReq(port, 'POST', '/api/v1/packages', authMixed, {
      name: 'Pacote Treino Misto',
      price: 300,
      validityDays: 30,
      allowPublicBooking: true,
      items: [{ serviceId: srvMxSt, includedCredits: 4 }]
    });
    assert(mxPkgRes.status === 201, 'Estabelecimento Misto cria pacote no domínio Studio');
    const pubMixedRes = await makeReq(port, 'GET', '/api/v1/public/tenants/studio-misto');
    assert(
      pubMixedRes.status === 200 &&
      pubMixedRes.data.tenant.establishment_profile === 'mixed' &&
      pubMixedRes.data.packages.some(p => p.id === mxPkgRes.data.package.id) &&
      pubMixedRes.data.services.some(s => s.id === srvMxCl),
      'Estabelecimento Misto publica pacote Studio e preserva serviços clínicos'
    );

    console.log('\n==============================================================');
    console.log(`RESULTADO: ${passed} PASSARAM, ${failed} FALHARAM.`);
    console.log('==============================================================\n');
    process.exitCode = failed > 0 ? 1 : 0;
  } catch (err) {
    console.error('Erro fatal nos testes:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests();
