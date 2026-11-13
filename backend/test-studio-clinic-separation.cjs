const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_studio_clinic_separation.db');
process.env.JWT_SECRET = 'test-studio-clinic-separation-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-clinic-files-secret-123456';
process.env.PORT = '3106';

for (const ext of ['', '-wal', '-shm']) {
  if (fs.existsSync(process.env.DATABASE_PATH + ext)) {
    fs.unlinkSync(process.env.DATABASE_PATH + ext);
  }
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

function assert(cond, msg, detail) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
    failed++;
  }
}

function makeReq(method, reqPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3106,
        path: reqPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data), raw: data });
          } catch {
            resolve({ status: res.statusCode, data, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function getNextWeekdayIso(targetDow, weekOffset = 1) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const diff = (targetDow - base.getUTCDay() + 7) % 7 || 7;
  base.setUTCDate(base.getUTCDate() + diff + (weekOffset - 1) * 7);
  return base.toISOString().slice(0, 10);
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(3106, resolve));
  console.log('\n=====================================================================');
  console.log('TESTES: Separação Definitiva Clínica Tradicional vs Studio vs Misto');
  console.log('=====================================================================\n');

  try {
    // -----------------------------------------------------------------
    // SETUP: Clínicas Tradicionais (Nutrição e Fisioterapia), Studio, Misto
    // -----------------------------------------------------------------
    const clinicNutriId = 'ten-nutri-' + uuidv4().slice(0, 6);
    const clinicFisioId = 'ten-fisio-' + uuidv4().slice(0, 6);
    const studioId = 'ten-studio-' + uuidv4().slice(0, 6);
    const mixedId = 'ten-mixed-' + uuidv4().slice(0, 6);

    const ensureProfession = (preferredId, name) => {
      const existingByName = db.prepare(`SELECT id FROM professions WHERE lower(name) = lower(?)`).get(name);
      if (existingByName?.id) return existingByName.id;
      db.prepare(`INSERT OR IGNORE INTO professions (id, name) VALUES (?, ?)`).run(preferredId, name);
      return preferredId;
    };
    const profIdNutri = ensureProfession('prof-sep-nutri', 'Nutrição');
    const profIdFisio = ensureProfession('prof-sep-fisio', 'Fisioterapia');
    const profIdInstrutor = ensureProfession('prof-sep-instrutor', 'Educação Física');

    const insTenant = db.prepare(`
      INSERT INTO tenants (
        id, name, trade_name, slug, email, status, billing_required,
        public_booking_enabled, establishment_profile, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', 0, 1, ?, datetime('now'), datetime('now'))
    `);
    insTenant.run(clinicNutriId, 'Clínica Nutri', 'Clínica Nutri', 'clinica-nutri-sep', 'nutri@sep.test', 'clinic');
    insTenant.run(clinicFisioId, 'Clínica Fisio', 'Clínica Fisio', 'clinica-fisio-sep', 'fisio@sep.test', 'clinic');
    insTenant.run(studioId, 'Studio Pilates Prime', 'Studio Pilates Prime', 'studio-prime-sep', 'studio@sep.test', 'studio');
    insTenant.run(mixedId, 'Espaço Misto Health', 'Espaço Misto Health', 'misto-health-sep', 'misto@sep.test', 'mixed');

    // Usuários e Admins (incluindo usuário multi-clínica)
    const multiAdminUser = 'usr-multi-' + uuidv4().slice(0, 6);
    const nutriProfUser = 'usr-nut-' + uuidv4().slice(0, 6);
    const fisioProfUser = 'usr-fis-' + uuidv4().slice(0, 6);
    const studioProfUser = 'usr-stu-' + uuidv4().slice(0, 6);
    const mixedFisioUser = 'usr-mfis-' + uuidv4().slice(0, 6);
    const mixedInstrUser = 'usr-mins-' + uuidv4().slice(0, 6);

    const insUser = db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'h', ?, 'active')`);
    insUser.run(multiAdminUser, clinicNutriId, 'Gestor Multi', 'multi@sep.test', 'clinic_admin');
    insUser.run(nutriProfUser, clinicNutriId, 'Dra. Nutri', 'dranutri@sep.test', 'professional');
    insUser.run(fisioProfUser, clinicFisioId, 'Dr. Fisio', 'drfisio@sep.test', 'professional');
    insUser.run(studioProfUser, studioId, 'Instrutor Lucas', 'lucas@sep.test', 'professional');
    insUser.run(mixedFisioUser, mixedId, 'Dra. Fisio Mista', 'fisio.mista@sep.test', 'professional');
    insUser.run(mixedInstrUser, mixedId, 'Instrutora Carla Mista', 'carla.mista@sep.test', 'professional');

    const insCU = db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json) VALUES (?, ?, ?, ?, 'active', ?, ?)`);
    for (const tid of [clinicNutriId, clinicFisioId, studioId, mixedId]) {
      insCU.run('cu-' + uuidv4().slice(0, 8), tid, multiAdminUser, 'clinic_admin', 1, '["manage_services","view_financial","view_schedule","manage_patients"]');
    }
    insCU.run('cu-' + uuidv4().slice(0, 8), clinicNutriId, nutriProfUser, 'professional', 0, '["view_schedule"]');
    insCU.run('cu-' + uuidv4().slice(0, 8), clinicFisioId, fisioProfUser, 'professional', 0, '["view_schedule"]');
    insCU.run('cu-' + uuidv4().slice(0, 8), studioId, studioProfUser, 'professional', 0, '["view_schedule"]');
    insCU.run('cu-' + uuidv4().slice(0, 8), mixedId, mixedFisioUser, 'professional', 0, '["view_schedule"]');
    insCU.run('cu-' + uuidv4().slice(0, 8), mixedId, mixedInstrUser, 'professional', 0, '["view_schedule"]');

    const makeAuth = (userId, tenantId, email, role) => ({
      Authorization: `Bearer ${generateToken({ userId, tenantId, email, role })}`,
      'x-tenant-id': tenantId
    });

    const authNutriAdm = makeAuth(multiAdminUser, clinicNutriId, 'multi@sep.test', 'clinic_admin');
    const authNutriProf = makeAuth(nutriProfUser, clinicNutriId, 'dranutri@sep.test', 'professional');
    const authFisioAdm = makeAuth(multiAdminUser, clinicFisioId, 'multi@sep.test', 'clinic_admin');
    const authFisioProf = makeAuth(fisioProfUser, clinicFisioId, 'drfisio@sep.test', 'professional');
    const authStudioAdm = makeAuth(multiAdminUser, studioId, 'multi@sep.test', 'clinic_admin');
    const authStudioProf = makeAuth(studioProfUser, studioId, 'lucas@sep.test', 'professional');
    const authMixedAdm = makeAuth(multiAdminUser, mixedId, 'multi@sep.test', 'clinic_admin');
    const authMixedFisio = makeAuth(mixedFisioUser, mixedId, 'fisio.mista@sep.test', 'professional');
    const authMixedInstr = makeAuth(mixedInstrUser, mixedId, 'carla.mista@sep.test', 'professional');

    // Profissionais
    const profNutri = 'prof-nut-' + uuidv4().slice(0, 6);
    const profFisio = 'prof-fis-' + uuidv4().slice(0, 6);
    const profStudio = 'prof-stu-' + uuidv4().slice(0, 6);
    const profMixedFisio = 'prof-mfis-' + uuidv4().slice(0, 6);
    const profMixedInstr = 'prof-mins-' + uuidv4().slice(0, 6);

    const insProf = db.prepare(`INSERT INTO professionals (id, tenant_id, user_id, name, slug, profession_id, profession_name, active, public_booking_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`);
    insProf.run(profNutri, clinicNutriId, nutriProfUser, 'Dra. Nutri', 'dra-nutri-sep', profIdNutri, 'Nutricionista');
    insProf.run(profFisio, clinicFisioId, fisioProfUser, 'Dr. Fisio', 'dr-fisio-sep', profIdFisio, 'Fisioterapeuta');
    insProf.run(profStudio, studioId, studioProfUser, 'Instrutor Lucas', 'instrutor-lucas-sep', profIdInstrutor, 'Educação Física / Instrutor');
    insProf.run(profMixedFisio, mixedId, mixedFisioUser, 'Dra. Fisio Mista', 'fisio-mista-sep', profIdFisio, 'Fisioterapeuta');
    insProf.run(profMixedInstr, mixedId, mixedInstrUser, 'Instrutora Carla Mista', 'carla-mista-sep', profIdInstrutor, 'Educação Física / Instrutor');

    const insSched = db.prepare(`INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES (?, ?, ?, ?, '07:00', '21:00', 1)`);
    for (let dow = 1; dow <= 6; dow++) {
      for (const [tid, pid] of [
        [clinicNutriId, profNutri],
        [clinicFisioId, profFisio],
        [studioId, profStudio],
        [mixedId, profMixedFisio],
        [mixedId, profMixedInstr]
      ]) {
        insSched.run(uuidv4(), tid, pid, dow);
      }
    }

    // Pacientes / Alunos
    const patNutri = 'pat-nut-' + uuidv4().slice(0, 6);
    const patFisio = 'pat-fis-' + uuidv4().slice(0, 6);
    const patMixedFisio = 'pat-mfis-' + uuidv4().slice(0, 6);
    const patMixedStu = 'pat-mstu-' + uuidv4().slice(0, 6);
    const studioStudents = Array.from({ length: 8 }, (_, idx) => ({
      id: `pat-stu-${idx + 1}-${uuidv4().slice(0, 4)}`,
      name: `Aluno Turma ${idx + 1}`,
      phone: `119999900${idx + 1}0`
    }));

    const insPat = db.prepare(`INSERT INTO patients (id, tenant_id, full_name, phone) VALUES (?, ?, ?, ?)`);
    insPat.run(patNutri, clinicNutriId, 'Paciente Nutri', '11911110001');
    insPat.run(patFisio, clinicFisioId, 'Paciente Fisio', '11911110002');
    insPat.run(patMixedFisio, mixedId, 'Paciente Misto Fisio', '11911110003');
    insPat.run(patMixedStu, mixedId, 'Aluno Misto Studio', '11911110004');
    for (const s of studioStudents) {
      insPat.run(s.id, studioId, s.name, s.phone);
    }

    // =================================================================
    // CENÁRIO 1: CLÍNICA TRADICIONAL DE NUTRIÇÃO E FISIOTERAPIA
    // =================================================================
    console.log('1) Clínica Tradicional (Nutrição e Fisioterapia): bloqueio de Studio e manutenção do fluxo clínico...');

    // 1.1 Criar serviço normal na Nutrição
    const resNutriSrv = await makeReq('POST', '/api/v1/services', authNutriAdm, {
      name: 'Consulta Nutricional',
      professionalId: profNutri,
      durationMinutes: 50,
      bufferMinutes: 10,
      price: 220,
      modality: 'presential',
      clinicalModule: 'ZemdaNutri',
      allowRecurrence: false
    });
    assert(resNutriSrv.status === 201 || resNutriSrv.status === 200, 'Clínica Nutrição cria serviço individual normalmente', resNutriSrv.data);
    assert(resNutriSrv.data?.service_kind === 'individual', 'Serviço de clínica vem como individual');
    assert(resNutriSrv.data?.service_domain === 'clinical', 'Serviço de clínica vem com service_domain = clinical');

    // 1.2 Bloquear criação de aula coletiva / capacidade > 1 / domínio studio em clínica tradicional
    const resClinicRejectGroup = await makeReq('POST', '/api/v1/services', authFisioAdm, {
      name: 'Turma Invasora em Clínica',
      professionalId: profFisio,
      durationMinutes: 60,
      price: 90,
      serviceKind: 'group',
      defaultCapacity: 8
    });
    assert(resClinicRejectGroup.status === 400, 'Clínica tradicional rejeita serviço serviceKind=group com HTTP 400', resClinicRejectGroup.data);

    const resClinicRejectRecurrenceArr = await makeReq('POST', '/api/v1/services', authNutriAdm, {
      name: 'Nutri com Array Recorrência Studio',
      professionalId: profNutri,
      durationMinutes: 50,
      price: 200,
      serviceDomain: 'studio',
      allowedRecurrenceFrequencies: ['weekly']
    });
    assert(resClinicRejectRecurrenceArr.status === 400, 'Clínica tradicional rejeita payload Studio (serviceDomain=studio / recurrence arrays)', resClinicRejectRecurrenceArr.data);

    // 1.3 Registro legado no DB com service_kind='group' em clínica tradicional deve ser normalizado na API sem apagar DB
    const legacyGroupClinicSrv = 'srv-leg-' + uuidv4().slice(0, 6);
    db.prepare(`INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, modality, service_kind, default_capacity, active) VALUES (?, ?, ?, 'Grupo Legado Clínica', 50, 100, 'presential', 'group', 6, 1)`)
      .run(legacyGroupClinicSrv, clinicFisioId, profFisio);
    const resClinicList = await makeReq('GET', '/api/v1/services', authFisioAdm);
    const listedLegacy = (resClinicList.data || []).find(s => s.id === legacyGroupClinicSrv);
    assert(listedLegacy && listedLegacy.service_kind === 'individual' && (listedLegacy.default_capacity === null || Number(listedLegacy.default_capacity) === 1), 'API de clínica normaliza serviço legado para individual sem apagar registro no DB', listedLegacy);
    const rawDbLegacy = db.prepare(`SELECT service_kind, default_capacity FROM services WHERE id = ?`).get(legacyGroupClinicSrv);
    assert(rawDbLegacy.service_kind === 'group' && Number(rawDbLegacy.default_capacity) === 6, 'Registro legado permanece intacto no DB');

    // 1.4 Rotas de Studio (collections, packages, occurrences) bloqueadas com 403 em clínica tradicional
    const resClinicCollections = await makeReq('GET', '/api/v1/financial/collections/summary', authNutriAdm);
    assert(resClinicCollections.status === 403 && resClinicCollections.data?.code === 'STUDIO_PROFILE_REQUIRED', 'Clínica tradicional recebe 403 em /v1/financial/collections/summary', resClinicCollections.data);
    const resClinicPackages = await makeReq('GET', '/api/v1/packages', authFisioAdm);
    assert(resClinicPackages.status === 403, 'Clínica tradicional recebe 403 em /v1/packages', resClinicPackages.data);
    const resClinicOccurrences = await makeReq('GET', '/api/v1/classes/occurrences', authNutriAdm);
    assert(resClinicOccurrences.status === 403, 'Clínica tradicional recebe 403 em /api/v1/classes/occurrences', resClinicOccurrences.data);

    // 1.5 Financeiro tradicional continua acessível em clínica tradicional
    const resClinicTx = await makeReq('GET', '/api/v1/payments', authNutriAdm);
    assert(resClinicTx.status === 200, 'Financeiro tradicional (/v1/payments) preservado na clínica', resClinicTx.data);

    // 1.6 Clínica Fisioterapia cria atendimento e exige evolução clínica ao tentar finalizar sem prontuário (409)
    const resFisioSrv = await makeReq('POST', '/api/v1/services', authFisioAdm, {
      name: 'Sessão Fisioterapia Ortopédica',
      professionalId: profFisio,
      durationMinutes: 50,
      price: 180,
      modality: 'presential',
      clinicalModule: 'ZemdaFisio',
      allowRecurrence: false
    });
    const fisioServiceId = resFisioSrv.data.id;
    const clinicDate = getNextWeekdayIso(2, 2);
    const resClinicAppt = await makeReq('POST', '/api/v1/appointments', authFisioAdm, {
      patientId: patFisio,
      professionalId: profFisio,
      serviceId: fisioServiceId,
      startTime: `${clinicDate}T10:00:00`,
      endTime: `${clinicDate}T10:50:00`,
      modality: 'presential'
    });
    assert(resClinicAppt.status === 201 || resClinicAppt.status === 200, 'Clínica Fisioterapia cria agendamento', resClinicAppt.data);
    const clinicApptId = resClinicAppt.data.id || resClinicAppt.data.appointment?.id;
    await makeReq('PUT', `/api/v1/appointments/${clinicApptId}/status`, authFisioProf, { status: 'in_progress' });
    const resClinicBareComplete = await makeReq('PUT', `/api/v1/appointments/${clinicApptId}/status`, authFisioProf, { status: 'completed' });
    assert(resClinicBareComplete.status === 409, 'Clínica tradicional continua exigindo evolução clínica (HTTP 409) ao finalizar sem prontuário', resClinicBareComplete.data);

    // =================================================================
    // CENÁRIO 2: STUDIO PURO — RECORRÊNCIA CONFIGURÁVEL POR SERVIÇO
    // =================================================================
    console.log('\n2) Studio Puro: Recorrência por serviço (Semanal, Quinzenal, Sem recorrência) & Validação Backend...');

    const resStudioSrvWeeklyOnly = await makeReq('POST', '/api/v1/services', authStudioAdm, {
      name: 'Pilates Studio Turma Semanal',
      durationMinutes: 60,
      price: 110,
      modality: 'presential',
      serviceKind: 'group',
      serviceDomain: 'studio',
      defaultCapacity: 8,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly'],
      defaultRecurrenceFrequency: 'weekly',
      professionalId: profStudio,
      classSchedules: [
        { dayOfWeek: 3, startTime: '09:00', endTime: '10:00', professionalId: profStudio, modality: 'presential', capacity: 8, isActive: true }
      ]
    });
    assert(resStudioSrvWeeklyOnly.status === 201 || resStudioSrvWeeklyOnly.status === 200, 'Studio cria aula coletiva com recorrência apenas Semanal', resStudioSrvWeeklyOnly.data);
    const studioGroupSrvId = resStudioSrvWeeklyOnly.data.id;

    const resStudioSrvDance = await makeReq('POST', '/api/v1/services', authStudioAdm, {
      name: 'Dança Contemporânea Duo',
      durationMinutes: 60,
      price: 130,
      modality: 'presential',
      serviceKind: 'individual',
      serviceDomain: 'studio',
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly', 'biweekly'],
      defaultRecurrenceFrequency: 'weekly',
      professionalId: profStudio
    });
    assert(resStudioSrvDance.status === 201 || resStudioSrvDance.status === 200, 'Studio cria Dança com recorrências Semanal + Quinzenal');
    const studioDanceSrvId = resStudioSrvDance.data.id;

    const resStudioSrvNoRec = await makeReq('POST', '/api/v1/services', authStudioAdm, {
      name: 'Avaliação Física Avulsa Studio',
      durationMinutes: 45,
      price: 150,
      modality: 'presential',
      serviceKind: 'individual',
      serviceDomain: 'studio',
      allowRecurrence: false,
      professionalId: profStudio
    });
    assert(resStudioSrvNoRec.status === 201 || resStudioSrvNoRec.status === 200, 'Studio cria serviço Sem Recorrência');
    const studioNoRecSrvId = resStudioSrvNoRec.data.id;

    // 2.1 Validação createRecurring
    const recBaseDate = getNextWeekdayIso(4, 2);
    const resRecRejectMonthly = await makeReq('POST', '/api/v1/appointments/recurring', authStudioAdm, {
      patientId: studioStudents[0].id,
      professionalId: profStudio,
      serviceId: studioDanceSrvId,
      startTime: `${recBaseDate}T14:00:00`,
      endTime: `${recBaseDate}T15:00:00`,
      modality: 'presential',
      recurrence: { frequency: 'monthly', maxOccurrences: 2 }
    });
    assert(resRecRejectMonthly.status === 400 && resRecRejectMonthly.data?.code === 'RECURRENCE_FREQUENCY_NOT_ALLOWED', 'createRecurring bloqueia frequência Mensal não autorizada no serviço Dança', resRecRejectMonthly.data);

    const resRecRejectNoRec = await makeReq('POST', '/api/v1/appointments/recurring', authStudioAdm, {
      patientId: studioStudents[0].id,
      professionalId: profStudio,
      serviceId: studioNoRecSrvId,
      startTime: `${recBaseDate}T16:00:00`,
      endTime: `${recBaseDate}T16:45:00`,
      modality: 'presential',
      recurrence: { frequency: 'weekly', maxOccurrences: 2 }
    });
    assert(resRecRejectNoRec.status === 400 && resRecRejectNoRec.data?.code === 'RECURRENCE_NOT_ALLOWED', 'createRecurring bloqueia serviço com recorrência desativada', resRecRejectNoRec.data);

    const resRecAllowBiweekly = await makeReq('POST', '/api/v1/appointments/recurring', authStudioAdm, {
      patientId: studioStudents[0].id,
      professionalId: profStudio,
      serviceId: studioDanceSrvId,
      startTime: `${recBaseDate}T11:00:00`,
      endTime: `${recBaseDate}T12:00:00`,
      modality: 'presential',
      recurrence: { frequency: 'biweekly', maxOccurrences: 2 }
    });
    assert(resRecAllowBiweekly.status === 201 || resRecAllowBiweekly.status === 200, 'createRecurring aceita frequência Quinzenal autorizada no serviço Dança', resRecAllowBiweekly.data);

    // 2.2 Public Studio Booking respeita configuração de recorrência do serviço
    const studioClassDate = getNextWeekdayIso(3, 2);
    const resPubSlots = await makeReq('GET', `/api/v1/public/studio/slots?tenantSlug=studio-prime-sep&serviceId=${studioGroupSrvId}&date=${studioClassDate}&professionalId=${profStudio}`);
    assert(
      resPubSlots.status === 200 &&
      Array.isArray(resPubSlots.data?.allowedRecurrenceFrequencies) &&
      resPubSlots.data.allowedRecurrenceFrequencies.length === 1 &&
      resPubSlots.data.allowedRecurrenceFrequencies[0] === 'weekly',
      'Endpoint público Studio retorna apenas recorrências permitidas (weekly) para Pilates Turma',
      resPubSlots.data
    );

    const resPubRejectBiweekly = await makeReq('POST', '/api/v1/public/studio/bookings', {}, {
      tenantSlug: 'studio-prime-sep',
      mode: 'service',
      serviceId: studioGroupSrvId,
      professionalId: profStudio,
      startTime: `${studioClassDate}T09:00:00`,
      modality: 'presential',
      recurrence: { frequency: 'biweekly', maxOccurrences: 2 },
      student: { fullName: 'Visitante Bloqueado', phone: '11988887777', email: 'visit@sep.test' }
    });
    assert(resPubRejectBiweekly.status === 400, 'Public Studio Booking rejeita frequência biweekly não permitida para Pilates Turma', resPubRejectBiweekly.data);

    // =================================================================
    // CENÁRIO 3: CONCLUSÃO NO STUDIO SEM EVOLUÇÃO CLÍNICA + TURMA 8 ALUNOS
    // =================================================================
    console.log('\n3) Studio Puro: Conclusão Individual e Coletiva (8 alunos) sem evolução clínica obrigatória...');

    // 3.1 Studio individual sem prontuário
    const studioIndDate = getNextWeekdayIso(5, 2);
    const resStudioInd = await makeReq('POST', '/api/v1/appointments', authStudioAdm, {
      patientId: studioStudents[0].id,
      professionalId: profStudio,
      serviceId: studioNoRecSrvId,
      startTime: `${studioIndDate}T07:00:00`,
      endTime: `${studioIndDate}T07:45:00`,
      modality: 'presential'
    });
    assert(resStudioInd.status === 201 || resStudioInd.status === 200, 'Sessão individual Studio agendada', resStudioInd.data);
    const studioIndApptId = resStudioInd.data.id || resStudioInd.data.appointment?.id;
    const payCountBefore = db.prepare(`SELECT COUNT(*) as c FROM payments WHERE appointment_id = ?`).get(studioIndApptId).c;
    await makeReq('PUT', `/api/v1/appointments/${studioIndApptId}/status`, authStudioProf, { status: 'in_progress' });
    const resStudioIndDone = await makeReq('POST', `/api/v1/classes/occurrences/apt:${studioIndApptId}/finish`, authStudioProf, {});
    assert(resStudioIndDone.status === 200, 'Sessão individual de Studio finaliza sem evolução clínica obrigatória', resStudioIndDone.data);
    const indRowAfter = db.prepare(`SELECT status, attendance_end_at FROM appointments WHERE id = ?`).get(studioIndApptId);
    const payCountAfter = db.prepare(`SELECT COUNT(*) as c FROM payments WHERE appointment_id = ?`).get(studioIndApptId).c;
    assert(indRowAfter.status === 'completed' && Boolean(indRowAfter.attendance_end_at), 'Sessão individual ficou completed com attendance_end_at');
    assert(payCountAfter === payCountBefore, 'Finalização no Studio não duplica lançamentos financeiros');

    // 3.2 Aula coletiva com 8 alunos no Studio
    const groupApptIds = [];
    for (let idx = 0; idx < 8; idx++) {
      const resGrp = await makeReq('POST', '/api/v1/appointments', authStudioAdm, {
        patientId: studioStudents[idx].id,
        professionalId: profStudio,
        serviceId: studioGroupSrvId,
        startTime: `${studioClassDate}T09:00:00`,
        endTime: `${studioClassDate}T10:00:00`,
        modality: 'presential'
      });
      assert(resGrp.status === 201 || resGrp.status === 200, `Aluno ${idx + 1}/8 inscrito na turma coletiva`, resGrp.data);
      groupApptIds.push(resGrp.data.id || resGrp.data.appointment?.id);
    }

    const occRow = db.prepare(`SELECT occurrence_id FROM appointments WHERE id = ?`).get(groupApptIds[0]);
    const occId = occRow?.occurrence_id;
    assert(Boolean(occId), 'Todos os 8 agendamentos compartilham occurrence_id', occRow);

    // Instrutor marca falta explícita no aluno 8, e deixa os outros 7 pendentes -> finalizar aula deve marcar os pendentes presentes!
    await makeReq('PUT', `/api/v1/classes/occurrences/${encodeURIComponent(occId)}/attendance/${groupApptIds[7]}`, authStudioProf, {
      attendanceStatus: 'absent'
    });
    const resFinishGroup = await makeReq('POST', `/api/v1/classes/occurrences/${encodeURIComponent(occId)}/finish`, authStudioProf, {});
    assert(resFinishGroup.status === 200, 'Aula coletiva com 8 alunos finalizada via /v1/classes/occurrences/:id/finish sem prontuário', resFinishGroup.data);

    const groupStatuses = db.prepare(`SELECT id, status, attendance_status FROM appointments WHERE occurrence_id = ?`).all(occId);
    const completedCount = groupStatuses.filter(r => r.status === 'completed').length;
    const absentCount = groupStatuses.filter(r => r.attendance_status === 'absent').length;
    const presentCount = groupStatuses.filter(r => r.attendance_status === 'present').length;
    assert(completedCount === 8, `Todos os 8 agendamentos da turma ficaram completed (obtido=${completedCount})`, groupStatuses);
    assert(absentCount === 1 && presentCount === 7, `Presença preservada: 7 presentes + 1 falta explícita (present=${presentCount}, absent=${absentCount})`);

    const occFinishedRow = db.prepare(`SELECT status FROM class_occurrences WHERE id = ?`).get(occId);
    assert(occFinishedRow?.status === 'completed', 'class_occurrences atualizada para completed', occFinishedRow);

    // Collections summary permitido em Studio
    const resStudioColl = await makeReq('GET', '/api/v1/financial/collections/summary', authStudioAdm);
    assert(resStudioColl.status === 200, 'Central de Cobranças funciona normalmente em Studio');

    // =================================================================
    // CENÁRIO 4: ESTABELECIMENTO MISTO — SEPARAÇÃO CLÍNICA vs STUDIO
    // =================================================================
    console.log('\n4) Estabelecimento Misto: Separação por service_domain (Clínica exige evolução vs Studio finaliza direto)...');

    const resMixedClinicalSrv = await makeReq('POST', '/api/v1/services', authMixedAdm, {
      name: 'Fisioterapia Pélvica Mista',
      professionalId: profMixedFisio,
      durationMinutes: 50,
      bufferMinutes: 10,
      price: 200,
      modality: 'presential',
      serviceDomain: 'clinical',
      clinicalModule: 'ZemdaFisio',
      allowRecurrence: false
    });
    assert(resMixedClinicalSrv.status === 201 || resMixedClinicalSrv.status === 200, 'Misto cria serviço do segmento Clínico', resMixedClinicalSrv.data);
    const mixedClinicalSrvId = resMixedClinicalSrv.data.id;

    // Bloquear criação de turma no segmento clínico mesmo em estabelecimento misto
    const resMixedRejectClinicalGroup = await makeReq('POST', '/api/v1/services', authMixedAdm, {
      name: 'Tentativa Turma no Segmento Clínico',
      professionalId: profMixedFisio,
      durationMinutes: 50,
      price: 100,
      serviceDomain: 'clinical',
      serviceKind: 'group',
      defaultCapacity: 5
    });
    assert(resMixedRejectClinicalGroup.status === 400, 'Estabelecimento Misto rejeita turma no segmento Clínico');

    const resMixedStudioSrv = await makeReq('POST', '/api/v1/services', authMixedAdm, {
      name: 'Mat Pilates Misto',
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 95,
      modality: 'presential',
      serviceDomain: 'studio',
      serviceKind: 'group',
      defaultCapacity: 6,
      allowRecurrence: true,
      allowedRecurrenceFrequencies: ['weekly'],
      defaultRecurrenceFrequency: 'weekly',
      professionalId: profMixedInstr,
      classSchedules: [
        { dayOfWeek: 2, startTime: '11:00', endTime: '12:00', professionalId: profMixedInstr, modality: 'presential', capacity: 6, isActive: true }
      ]
    });
    assert(resMixedStudioSrv.status === 201 || resMixedStudioSrv.status === 200, 'Misto cria aula de Studio no segmento Studio', resMixedStudioSrv.data);
    const mixedStudioSrvId = resMixedStudioSrv.data.id;

    const mixedDate = getNextWeekdayIso(2, 2);
    const resMixedClinAppt = await makeReq('POST', '/api/v1/appointments', authMixedAdm, {
      patientId: patMixedFisio,
      professionalId: profMixedFisio,
      serviceId: mixedClinicalSrvId,
      startTime: `${mixedDate}T10:00:00`,
      endTime: `${mixedDate}T10:50:00`,
      modality: 'presential'
    });
    assert(resMixedClinAppt.status === 201 || resMixedClinAppt.status === 200, 'Agendamento clínico em Misto criado', resMixedClinAppt.data);
    const mixedClinApptId = resMixedClinAppt.data.id || resMixedClinAppt.data.appointment?.id;
    await makeReq('PUT', `/api/v1/appointments/${mixedClinApptId}/status`, authMixedFisio, { status: 'in_progress' });
    const resMixedClinBareFinish = await makeReq('PUT', `/api/v1/appointments/${mixedClinApptId}/status`, authMixedFisio, { status: 'completed' });
    assert(resMixedClinBareFinish.status === 409, 'Serviço clínico dentro de Estabelecimento Misto continua exigindo evolução clínica (HTTP 409)', resMixedClinBareFinish.data);

    const resMixedStuAppt = await makeReq('POST', '/api/v1/appointments', authMixedAdm, {
      patientId: patMixedStu,
      professionalId: profMixedInstr,
      serviceId: mixedStudioSrvId,
      startTime: `${mixedDate}T11:00:00`,
      endTime: `${mixedDate}T12:00:00`,
      modality: 'presential'
    });
    assert(resMixedStuAppt.status === 201 || resMixedStuAppt.status === 200, 'Agendamento Studio em Misto criado', resMixedStuAppt.data);
    const mixedStuApptId = resMixedStuAppt.data.id || resMixedStuAppt.data.appointment?.id;
    await makeReq('PUT', `/api/v1/appointments/${mixedStuApptId}/status`, authMixedInstr, { status: 'in_progress' });
    const resMixedStuFinish = await makeReq('PUT', `/api/v1/appointments/${mixedStuApptId}/status`, authMixedInstr, { status: 'completed' });
    assert(resMixedStuFinish.status === 200, 'Serviço Studio dentro de Estabelecimento Misto finaliza sem evolução clínica obrigatória (HTTP 200)', resMixedStuFinish.data);

    const resMixedColl = await makeReq('GET', '/api/v1/financial/collections/summary', authMixedAdm);
    assert(resMixedColl.status === 200, 'Central de Cobranças continua disponível em Estabelecimento Misto');

    // Dashboard métricas incluem service_kind e service_domain para decisão direta no frontend
    const resDashMetrics = await makeReq('GET', `/api/v1/dashboard/metrics?date=${mixedDate}`, authMixedAdm);
    assert(resDashMetrics.status === 200 && resDashMetrics.data?.today?.appointments?.length >= 2, 'Dashboard retorna agendamentos do dia');
    const mixedApptInDash = resDashMetrics.data.today.appointments.find(a => a.id === mixedStuApptId);
    assert(mixedApptInDash?.service_domain === 'studio' && mixedApptInDash?.establishment_profile === 'mixed', 'Dashboard expõe service_domain e establishment_profile', mixedApptInDash);

    console.log('\n---------------------------------------------------------------------');
    console.log(`Resumo: ${passed} passou, ${failed} falhou.`);
    console.log('---------------------------------------------------------------------\n');
  } finally {
    server.close();
    try {
      db.close();
    } catch {}
    for (const ext of ['', '-wal', '-shm']) {
      if (fs.existsSync(process.env.DATABASE_PATH + ext)) {
        try {
          fs.unlinkSync(process.env.DATABASE_PATH + ext);
        } catch {}
      }
    }
  }
}

runTests()
  .then(() => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
