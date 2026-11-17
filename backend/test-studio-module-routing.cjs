const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const PORT = 3109;
process.env.DATABASE_PATH = path.resolve(__dirname, 'test_studio_module_routing.db');
process.env.JWT_SECRET = 'test-studio-module-routing-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-module-routing-files-123456';
process.env.PORT = String(PORT);

for (const ext of ['', '-wal', '-shm']) {
  if (fs.existsSync(process.env.DATABASE_PATH + ext)) {
    fs.unlinkSync(process.env.DATABASE_PATH + ext);
  }
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const {
  resolveAppointmentWorkflowDomain,
  shouldUseStudioPersonalWorkflow
} = require('./dist/utils/establishment-context');
const {
  resolveProfessionalCanonicalModule,
  getAvailableModulesForProfessional
} = require('./dist/utils/clinical-module');

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
        port: PORT,
        path: reqPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
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

function getTodayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getNextWeekdayIso(targetDow, weekOffset = 1) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const diff = (targetDow - base.getUTCDay() + 7) % 7 || 7;
  base.setUTCDate(base.getUTCDate() + diff + (weekOffset - 1) * 7);
  return base.toISOString().slice(0, 10);
}

function seedProfAndUser({
  tenantId,
  profId,
  userId,
  name,
  email,
  professionId,
  regType,
  regNumber,
  role = 'professional',
  zemdaPersonalEnabled = 0,
  extraPermissions = []
}) {
  db.prepare(
    `INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, email_verified)
     VALUES (?, ?, ?, ?, 'hash', ?, 'active', 1)`
  ).run(userId, tenantId, name, email, role);

  db.prepare(
    `INSERT INTO clinic_users (id, tenant_id, user_id, role, status, permissions_json, zemda_personal_enabled)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`
  ).run(uuidv4(), tenantId, userId, role, JSON.stringify(extraPermissions), zemdaPersonalEnabled);

  db.prepare(
    `INSERT INTO professionals (
       id, tenant_id, user_id, name, profession_id, registration_type, registration_number,
       zemda_personal_enabled, active
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(profId, tenantId, userId, name, professionId, regType, regNumber, zemdaPersonalEnabled);

  for (let dow = 0; dow <= 6; dow++) {
    db.prepare(
      `INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
       VALUES (?, ?, ?, ?, '07:00', '21:00', 1)`
    ).run(uuidv4(), tenantId, profId, dow);
  }

  return generateToken({
    userId,
    tenantId,
    role,
    email,
    name,
    isSuperAdmin: false
  });
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));

  console.log('\n=====================================================================');
  console.log('TESTES: Direcionamento de Módulos Profissionais no Zemda Studio');
  console.log('=====================================================================\n');

  try {
    // -------------------------------------------------------------------
    // 1. Testes unitários da regra de domínio de execução de atendimento
    // -------------------------------------------------------------------
    console.log('1. Regras de domínio (resolveAppointmentWorkflowDomain / shouldUseStudioPersonalWorkflow):');
    assert(
      resolveAppointmentWorkflowDomain({
        establishmentProfile: 'studio',
        serviceDomain: 'studio',
        serviceKind: 'individual',
        clinical_module: null,
        professionalClinicalModule: 'ZemdaFono'
      }) === 'clinical',
      'Studio + Fonoaudiólogo individual sem clinical_module explícito resolve para "clinical"'
    );
    assert(
      resolveAppointmentWorkflowDomain({
        establishmentProfile: 'studio',
        serviceDomain: 'studio',
        serviceKind: 'individual',
        serviceClinicalModule: 'ZemdaFisio',
        professionalClinicalModule: 'ZemdaFisio'
      }) === 'clinical',
      'Studio + Fisioterapeuta individual com serviço ZemdaFisio resolve para "clinical"'
    );
    assert(
      resolveAppointmentWorkflowDomain({
        establishmentProfile: 'studio',
        serviceDomain: 'studio',
        serviceKind: 'individual',
        serviceClinicalModule: 'ZemdaPersonal',
        professionalClinicalModule: 'ZemdaFisio'
      }) === 'studio',
      'Multimódulo (Fisioterapeuta + ZemdaPersonal) com serviço ZemdaPersonal resolve para "studio"'
    );
    assert(
      resolveAppointmentWorkflowDomain({
        establishmentProfile: 'studio',
        serviceDomain: 'studio',
        serviceKind: 'group',
        occurrenceId: 'occ-123',
        serviceClinicalModule: 'ZemdaFisio',
        professionalClinicalModule: 'ZemdaFisio'
      }) === 'studio',
      'Aula coletiva em turma no Studio mantém fluxo "studio" / ZemdaPersonal'
    );
    assert(
      shouldUseStudioPersonalWorkflow({
        establishmentProfile: 'studio',
        serviceKind: 'individual',
        professionalClinicalModule: 'ZemdaPersonal'
      }) === true,
      'Personal Trainer / Instrutor em atendimento individual no Studio usa ZemdaPersonal ("studio")'
    );
    assert(
      shouldUseStudioPersonalWorkflow({
        establishmentProfile: 'clinic',
        serviceKind: 'individual',
        professionalClinicalModule: 'ZemdaPersonal',
        serviceClinicalModule: 'ZemdaPersonal'
      }) === false,
      'Clínica tradicional nunca ativa redirecionamento Studio/ZemdaPersonal automático'
    );

    // -------------------------------------------------------------------
    // 2. Setup do Studio e Clínica tradicional
    // -------------------------------------------------------------------
    const studioTenantId = 't-studio-routing';
    const clinicTenantId = 't-clinic-routing';

    db.prepare(
      `INSERT INTO tenants (id, slug, name, email, status, establishment_profile) VALUES (?, ?, ?, ?, 'active', 'studio')`
    ).run(studioTenantId, 'studio-routing', 'Studio Multiprofissional Teste', 'studio@routing.test');

    db.prepare(
      `INSERT INTO tenants (id, slug, name, email, status, establishment_profile) VALUES (?, ?, ?, ?, 'active', 'clinic')`
    ).run(clinicTenantId, 'clinic-routing', 'Clínica Tradicional Teste', 'clinic@routing.test');

    // Garante categoria base para profissões de instrutor caso o banco mínimo não tenha cat-esporte
    db.prepare(
      `INSERT OR IGNORE INTO categories (id, name, slug, default_terminology, is_clinical, active)
       VALUES ('cat-esporte', 'Esporte e Bem-Estar', 'esporte-bem-estar', 'student', 0, 1)`
    ).run();

    // Cria profissões customizadas para instrutores de Yoga e Dança no catálogo global
    db.prepare(
      `INSERT OR IGNORE INTO professions (id, tenant_id, category_id, name, slug, registration_board_label, registration_required, active)
       VALUES ('prof-yoga-custom', NULL, 'cat-esporte', 'Instrutora de Yoga', 'instrutora-yoga', 'Certificação', 0, 1)`
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO professions (id, tenant_id, category_id, name, slug, registration_board_label, registration_required, active)
       VALUES ('prof-danca-custom', NULL, 'cat-esporte', 'Instrutora de Dança', 'instrutora-danca', 'Certificação', 0, 1)`
    ).run();

    const patientStudioId = 'pat-studio-routing-1';
    const patientClinicId = 'pat-clinic-routing-1';
    db.prepare(
      `INSERT INTO patients (id, tenant_id, full_name, phone, active) VALUES (?, ?, 'Aluno Paciente Studio', '11999990001', 1)`
    ).run(patientStudioId, studioTenantId);
    db.prepare(
      `INSERT INTO patients (id, tenant_id, full_name, phone, active) VALUES (?, ?, 'Paciente Clínica', '11999990002', 1)`
    ).run(patientClinicId, clinicTenantId);

    // Profissionais no Studio
    const studioStaff = [
      { key: 'personal', profId: 'p-st-personal', userId: 'u-st-personal', name: 'Carlos Personal', email: 'personal@st.test', professionId: 'prof-personal-trainer', regType: 'CREF', regNumber: 'CREF-111', expectedModule: 'ZemdaPersonal', expectPersonal: true, zemdaPersonalEnabled: 1 },
      { key: 'pilates', profId: 'p-st-pilates', userId: 'u-st-pilates', name: 'Ana Pilates', email: 'pilates@st.test', professionId: 'prof-instrutor', regType: 'CERT', regNumber: 'PIL-222', expectedModule: 'ZemdaPersonal', expectPersonal: true, zemdaPersonalEnabled: 0 },
      { key: 'yoga', profId: 'p-st-yoga', userId: 'u-st-yoga', name: 'Marina Yoga', email: 'yoga@st.test', professionId: 'prof-yoga-custom', regType: 'CERT', regNumber: 'YOG-333', expectedModule: 'ZemdaPersonal', expectPersonal: true, zemdaPersonalEnabled: 0 },
      { key: 'danca', profId: 'p-st-danca', userId: 'u-st-danca', name: 'Bianca Dança', email: 'danca@st.test', professionId: 'prof-danca-custom', regType: 'CERT', regNumber: 'DAN-444', expectedModule: 'ZemdaPersonal', expectPersonal: true, zemdaPersonalEnabled: 0 },
      { key: 'fono', profId: 'p-st-fono', userId: 'u-st-fono', name: 'Dra. Helena Fono', email: 'fono@st.test', professionId: 'prof-fonoaudiologo', regType: 'CRFa', regNumber: 'CRFa-1001', expectedModule: 'ZemdaFono', expectPersonal: false, zemdaPersonalEnabled: 0 },
      { key: 'fisio', profId: 'p-st-fisio', userId: 'u-st-fisio', name: 'Dr. Bruno Fisio', email: 'fisio@st.test', professionId: 'prof-fisioterapeuta', regType: 'CREFITO', regNumber: 'CREFITO-2002', expectedModule: 'ZemdaFisio', expectPersonal: false, zemdaPersonalEnabled: 0 },
      { key: 'psico', profId: 'p-st-psico', userId: 'u-st-psico', name: 'Dra. Clara Psico', email: 'psico@st.test', professionId: 'prof-psicologo', regType: 'CRP', regNumber: 'CRP-3003', expectedModule: 'ZemdaPsico', expectPersonal: false, zemdaPersonalEnabled: 0 },
      { key: 'nutri', profId: 'p-st-nutri', userId: 'u-st-nutri', name: 'Dra. Julia Nutri', email: 'nutri@st.test', professionId: 'prof-nutricionista', regType: 'CRN', regNumber: 'CRN-4004', expectedModule: 'ZemdaNutri', expectPersonal: false, zemdaPersonalEnabled: 0 },
      { key: 'to', profId: 'p-st-to', userId: 'u-st-to', name: 'Dra. Livia TO', email: 'to@st.test', professionId: 'prof-terapeuta-ocupacional', regType: 'CREFITO', regNumber: 'CREFITO-5005', expectedModule: 'ZemdaTO', expectPersonal: false, zemdaPersonalEnabled: 0 },
      { key: 'med', profId: 'p-st-med', userId: 'u-st-med', name: 'Dr. Pedro Med', email: 'med@st.test', professionId: 'prof-medico', regType: 'CRM', regNumber: 'CRM-6006', expectedModule: 'ZemdaMed', expectPersonal: false, zemdaPersonalEnabled: 0 },
      { key: 'odonto', profId: 'p-st-odonto', userId: 'u-st-odonto', name: 'Dr. Rafael Odonto', email: 'odonto@st.test', professionId: 'prof-dentista', regType: 'CRO', regNumber: 'CRO-7007', expectedModule: 'ZemdaOdonto', expectPersonal: false, zemdaPersonalEnabled: 0 },
      { key: 'estetic', profId: 'p-st-estetic', userId: 'u-st-estetic', name: 'Camila Estetic', email: 'estetic@st.test', professionId: 'prof-esteticista', regType: 'REG', regNumber: 'EST-8008', expectedModule: 'ZemdaEstetic', expectPersonal: false, zemdaPersonalEnabled: 0 }
    ];

    const tokens = {};
    for (const s of studioStaff) {
      tokens[s.key] = seedProfAndUser({
        tenantId: studioTenantId,
        profId: s.profId,
        userId: s.userId,
        name: s.name,
        email: s.email,
        professionId: s.professionId,
        regType: s.regType,
        regNumber: s.regNumber,
        zemdaPersonalEnabled: s.zemdaPersonalEnabled
      });
    }

    // Profissional multimódulo (Fisioterapeuta + ZemdaPersonal habilitado explicitamente)
    tokens.multi = seedProfAndUser({
      tenantId: studioTenantId,
      profId: 'p-st-multi',
      userId: 'u-st-multi',
      name: 'Dr. Tiago Fisio Pilates',
      email: 'multi@st.test',
      professionId: 'prof-fisioterapeuta',
      regType: 'CREFITO',
      regNumber: 'CREFITO-9009',
      zemdaPersonalEnabled: 1
    });

    // Profissional em clínica tradicional
    tokens.clinicFono = seedProfAndUser({
      tenantId: clinicTenantId,
      profId: 'p-cl-fono',
      userId: 'u-cl-fono',
      name: 'Fono Clínica',
      email: 'fono@cl.test',
      professionId: 'prof-fonoaudiologo',
      regType: 'CRFa',
      regNumber: 'CRFa-9999',
      zemdaPersonalEnabled: 0
    });

    // -------------------------------------------------------------------
    // 3. Verificação /v1/auth/me e /v1/personal/exercises por profissão no Studio
    // -------------------------------------------------------------------
    console.log('\n2. Identificação de módulo (/v1/auth/me) e acesso ao ZemdaPersonal (/v1/personal/exercises) no Studio:');
    for (const s of studioStaff) {
      const meRes = await makeReq('GET', '/api/v1/auth/me', { Authorization: `Bearer ${tokens[s.key]}` });
      assert(
        meRes.status === 200 && meRes.data?.user?.commercialModule === s.expectedModule,
        `${s.name} (${s.professionId}) recebe commercialModule = ${s.expectedModule}`,
        { status: meRes.status, got: meRes.data?.user?.commercialModule }
      );
      assert(
        Boolean(meRes.data?.user?.zemdaPersonalEnabled) === s.expectPersonal,
        `${s.name} possui zemdaPersonalEnabled = ${s.expectPersonal}`,
        { got: meRes.data?.user?.zemdaPersonalEnabled }
      );

      const personalRes = await makeReq('GET', '/api/v1/personal/exercises', { Authorization: `Bearer ${tokens[s.key]}` });
      const expectedPersonalStatus = s.expectPersonal ? 200 : 403;
      assert(
        personalRes.status === expectedPersonalStatus,
        `${s.name} em GET /v1/personal/exercises retorna ${expectedPersonalStatus}`,
        { got: personalRes.status, error: personalRes.data?.error }
      );
    }

    // -------------------------------------------------------------------
    // 4. Fluxo clínico real dentro do Studio (Fonoaudiólogo e demais especialidades)
    // -------------------------------------------------------------------
    console.log('\n3. Fluxo clínico preservado dentro do Studio (sem forçar ZemdaPersonal):');
    const futureDate1 = getNextWeekdayIso(2, 2);
    const futureDate2 = getNextWeekdayIso(3, 2);

    const clinicalSpecs = [
      { key: 'fono', srvId: 'srv-st-fono', profId: 'p-st-fono', title: 'Consulta Fonoaudiológica Studio', module: 'ZemdaFono', srvModule: 'ZemdaFono', hour: '09:00', endHour: '09:50', date: futureDate1 },
      { key: 'fisio', srvId: 'srv-st-fisio', profId: 'p-st-fisio', title: 'Avaliação Fisioterapêutica Studio', module: 'ZemdaFisio', srvModule: null, hour: '10:00', endHour: '10:50', date: futureDate1 },
      { key: 'psico', srvId: 'srv-st-psico', profId: 'p-st-psico', title: 'Sessão de Psicologia Studio', module: 'ZemdaPsico', srvModule: 'ZemdaPsico', hour: '11:00', endHour: '11:50', date: futureDate1 },
      { key: 'nutri', srvId: 'srv-st-nutri', profId: 'p-st-nutri', title: 'Consulta Nutricional Studio', module: 'ZemdaNutri', srvModule: 'ZemdaNutri', hour: '14:00', endHour: '14:50', date: futureDate1 },
      { key: 'to', srvId: 'srv-st-to', profId: 'p-st-to', title: 'Atendimento TO Studio', module: 'ZemdaTO', srvModule: 'ZemdaTO', hour: '15:00', endHour: '15:50', date: futureDate1 },
      { key: 'med', srvId: 'srv-st-med', profId: 'p-st-med', title: 'Consulta Médica Studio', module: 'ZemdaMed', srvModule: 'ZemdaMed', hour: '16:00', endHour: '16:50', date: futureDate1 },
      { key: 'odonto', srvId: 'srv-st-odonto', profId: 'p-st-odonto', title: 'Avaliação Odontológica Studio', module: 'ZemdaOdonto', srvModule: 'ZemdaOdonto', hour: '17:00', endHour: '17:50', date: futureDate1 },
      { key: 'estetic', srvId: 'srv-st-estetic', profId: 'p-st-estetic', title: 'Avaliação Estética Studio', module: 'ZemdaEstetic', srvModule: 'ZemdaEstetic', hour: '18:00', endHour: '18:50', date: futureDate1 }
    ];

    for (const c of clinicalSpecs) {
      db.prepare(
        `INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, modality, service_domain, service_kind, clinical_module, active)
         VALUES (?, ?, ?, ?, 50, 220, 'presential', 'studio', 'individual', ?, 1)`
      ).run(c.srvId, studioTenantId, c.profId, c.title, c.srvModule);

      const createAppt = await makeReq(
        'POST',
        '/api/v1/appointments',
        { Authorization: `Bearer ${tokens[c.key]}` },
        {
          patientId: patientStudioId,
          professionalId: c.profId,
          serviceId: c.srvId,
          startTime: `${c.date}T${c.hour}:00`,
          endTime: `${c.date}T${c.endHour}:00`,
          modality: 'presential'
        }
      );
      assert(
        createAppt.status === 201 && createAppt.data?.professional_clinical_module === c.module,
        `${c.module}: agendamento no Studio retorna professional_clinical_module = ${c.module}`,
        { status: createAppt.status, data: createAppt.data }
      );
      const apptId = createAppt.data.id;

      const getById = await makeReq('GET', `/api/v1/appointments/${apptId}`, { Authorization: `Bearer ${tokens[c.key]}` });
      assert(
        getById.status === 200 && getById.data?.appointment?.professional_clinical_module === c.module,
        `${c.module}: GET /v1/appointments/:id expõe professional_clinical_module = ${c.module}`,
        { got: getById.data?.appointment?.professional_clinical_module }
      );

      // Inicia atendimento clínico
      const startRes = await makeReq(
        'PUT',
        `/api/v1/appointments/${apptId}/status`,
        { Authorization: `Bearer ${tokens[c.key]}` },
        { status: 'in_progress', clinicalModule: c.module }
      );
      assert(
        startRes.status === 200 && startRes.data?.status === 'in_progress',
        `${c.module}: atendimento iniciado com status in_progress`
      );

      // Tentativa de concluir diretamente sem prontuário deve ser bloqueada (409), como na Clínica
      const bareCompleteRes = await makeReq(
        'PUT',
        `/api/v1/appointments/${apptId}/status`,
        { Authorization: `Bearer ${tokens[c.key]}` },
        { status: 'completed' }
      );
      assert(
        bareCompleteRes.status === 409,
        `${c.module}: conclusão sem evolução clínica é bloqueada com HTTP 409 no Studio`,
        { status: bareCompleteRes.status, error: bareCompleteRes.data?.error }
      );

      // Tentativa de encerrar pelo endpoint de aula coletiva do Studio deve falhar
      const studioFinishRes = await makeReq(
        'POST',
        `/api/v1/classes/occurrences/apt:${apptId}/finish`,
        { Authorization: `Bearer ${tokens[c.key]}` },
        {}
      );
      assert(
        studioFinishRes.status === 409,
        `${c.module}: /classes/occurrences/apt:id/finish rejeitado com HTTP 409 para atendimento clínico`,
        { status: studioFinishRes.status, error: studioFinishRes.data?.error }
      );

      // Salva evolução clínica e finaliza pelo fluxo oficial de Clínica
      const recRes = await makeReq(
        'POST',
        '/api/v1/clinical-records',
        { Authorization: `Bearer ${tokens[c.key]}` },
        {
          patientId: patientStudioId,
          appointmentId: apptId,
          title: `Evolução ${c.module}`,
          clinicalEvolution: 'Paciente evoluiu bem durante o atendimento no Studio.',
          moduleType: c.module
        }
      );
      assert(
        recRes.status === 201,
        `${c.module}: evolução clínica gravada com sucesso no Studio`,
        { status: recRes.status, error: recRes.data?.error }
      );

      const finishRes = await makeReq(
        'POST',
        `/api/v1/appointments/${apptId}/finish`,
        { Authorization: `Bearer ${tokens[c.key]}` },
        {
          patientId: patientStudioId,
          evolution: {
            title: `Encerramento ${c.module}`,
            clinicalEvolution: 'Finalização clínica regular preservada.',
            moduleType: c.module
          }
        }
      );
      assert(
        finishRes.status === 200,
        `${c.module}: finalização oficial /v1/appointments/:id/finish concluída com HTTP 200`,
        { status: finishRes.status, error: finishRes.data?.error }
      );
    }

    // -------------------------------------------------------------------
    // 5. Profissional Multimódulo (Fisio + ZemdaPersonal) respeitando serviço
    // -------------------------------------------------------------------
    console.log('\n4. Profissional Multimódulo respeitando serviço individual vs ZemdaPersonal vs Turma:');
    const meMulti = await makeReq('GET', '/api/v1/auth/me', { Authorization: `Bearer ${tokens.multi}` });
    assert(
      meMulti.status === 200 &&
        meMulti.data?.user?.commercialModule === 'ZemdaFisio' &&
        Array.isArray(meMulti.data?.user?.authorizedModules) &&
        meMulti.data.user.authorizedModules.includes('ZemdaFisio') &&
        meMulti.data.user.authorizedModules.includes('ZemdaPersonal'),
      'Multimódulo (Fisioterapeuta + ZemdaPersonal) expõe ambos em authorizedModules sem sobrescrever ZemdaFisio',
      {
        commercialModule: meMulti.data?.user?.commercialModule,
        authorizedModules: meMulti.data?.user?.authorizedModules
      }
    );

    const multiModulesComputed = getAvailableModulesForProfessional('p-st-multi', studioTenantId).map((m) => m.code);
    assert(
      multiModulesComputed.includes('ZemdaFisio') && multiModulesComputed.includes('ZemdaPersonal'),
      'getAvailableModulesForProfessional retorna ZemdaFisio e ZemdaPersonal para profissional multimódulo',
      { multiModulesComputed }
    );

    db.prepare(
      `INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, modality, service_domain, service_kind, clinical_module, active)
       VALUES ('srv-multi-fisio', ?, 'p-st-multi', 'Fisioterapia Ortopédica', 50, 200, 'presential', 'studio', 'individual', 'ZemdaFisio', 1)`
    ).run(studioTenantId);
    db.prepare(
      `INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, modality, service_domain, service_kind, clinical_module, active)
       VALUES ('srv-multi-personal', ?, 'p-st-multi', 'Treinamento Funcional Individual', 50, 180, 'presential', 'studio', 'individual', 'ZemdaPersonal', 1)`
    ).run(studioTenantId);
    db.prepare(
      `INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, modality, service_domain, service_kind, clinical_module, default_capacity, active)
       VALUES ('srv-multi-group', ?, 'p-st-multi', 'Turma Pilates Aparelhos', 50, 120, 'presential', 'studio', 'group', 'ZemdaPersonal', 6, 1)`
    ).run(studioTenantId);

    const apptMultiFisio = await makeReq(
      'POST',
      '/api/v1/appointments',
      { Authorization: `Bearer ${tokens.multi}` },
      {
        patientId: patientStudioId,
        professionalId: 'p-st-multi',
        serviceId: 'srv-multi-fisio',
        startTime: `${futureDate2}T09:00:00`,
        endTime: `${futureDate2}T09:50:00`,
        modality: 'presential'
      }
    );
    const apptMultiPersonal = await makeReq(
      'POST',
      '/api/v1/appointments',
      { Authorization: `Bearer ${tokens.multi}` },
      {
        patientId: patientStudioId,
        professionalId: 'p-st-multi',
        serviceId: 'srv-multi-personal',
        startTime: `${futureDate2}T10:00:00`,
        endTime: `${futureDate2}T10:50:00`,
        modality: 'presential'
      }
    );
    const apptMultiGroup = await makeReq(
      'POST',
      '/api/v1/appointments',
      { Authorization: `Bearer ${tokens.multi}` },
      {
        patientId: patientStudioId,
        professionalId: 'p-st-multi',
        serviceId: 'srv-multi-group',
        startTime: `${futureDate2}T11:00:00`,
        endTime: `${futureDate2}T11:50:00`,
        modality: 'presential'
      }
    );

    // Serviço ZemdaFisio mantém bloqueio de conclusão sem prontuário (fluxo clínico)
    const multiFisioBare = await makeReq(
      'PUT',
      `/api/v1/appointments/${apptMultiFisio.data.id}/status`,
      { Authorization: `Bearer ${tokens.multi}` },
      { status: 'completed' }
    );
    assert(
      multiFisioBare.status === 409,
      'Multimódulo em serviço ZemdaFisio segue fluxo clínico (409 sem prontuário)'
    );

    // Serviço ZemdaPersonal conclui normalmente pelo fluxo ZemdaPersonal
    const multiPersonalDone = await makeReq(
      'PUT',
      `/api/v1/appointments/${apptMultiPersonal.data.id}/status`,
      { Authorization: `Bearer ${tokens.multi}` },
      { status: 'completed' }
    );
    assert(
      multiPersonalDone.status === 200 && multiPersonalDone.data?.status === 'completed',
      'Multimódulo em serviço ZemdaPersonal conclui diretamente pelo fluxo ZemdaPersonal',
      { status: multiPersonalDone.status }
    );

    // Aula em grupo mantém fluxo de turma (ZemdaPersonal)
    const multiGroupDone = await makeReq(
      'PUT',
      `/api/v1/appointments/${apptMultiGroup.data.id}/status`,
      { Authorization: `Bearer ${tokens.multi}` },
      { status: 'completed' }
    );
    assert(
      multiGroupDone.status === 200 && multiGroupDone.data?.status === 'completed',
      'Aula coletiva em turma continua concluindo normalmente pelo fluxo Studio',
      { status: multiGroupDone.status }
    );

    // -------------------------------------------------------------------
    // 6. Regressão Clínica Tradicional + Métricas do Dashboard
    // -------------------------------------------------------------------
    console.log('\n5. Regressão Clínica Tradicional e exposição em DashboardController:');
    const todayDate = getTodayIsoDate();
    db.prepare(
      `INSERT INTO services (id, tenant_id, professional_id, name, duration_minutes, price, modality, service_domain, service_kind, clinical_module, active)
       VALUES ('srv-cl-fono', ?, 'p-cl-fono', 'Fonoterapia Clínica', 50, 250, 'presential', 'clinical', 'individual', NULL, 1)`
    ).run(clinicTenantId);

    const clinicApptRes = await makeReq(
      'POST',
      '/api/v1/appointments',
      { Authorization: `Bearer ${tokens.clinicFono}` },
      {
        patientId: patientClinicId,
        professionalId: 'p-cl-fono',
        serviceId: 'srv-cl-fono',
        startTime: `${futureDate1}T13:00:00`,
        endTime: `${futureDate1}T13:50:00`,
        modality: 'presential'
      }
    );
    assert(
      clinicApptRes.status === 201 && clinicApptRes.data?.professional_clinical_module === 'ZemdaFono',
      'Clínica tradicional preserva módulo canônico ZemdaFono'
    );
    const clinicBare = await makeReq(
      'PUT',
      `/api/v1/appointments/${clinicApptRes.data.id}/status`,
      { Authorization: `Bearer ${tokens.clinicFono}` },
      { status: 'completed' }
    );
    assert(clinicBare.status === 409, 'Clínica tradicional preserva bloqueio 409 sem prontuário');

    // Insere agendamento de hoje para verificar DashboardController.getMetrics
    const dashApptId = uuidv4();
    db.prepare(
      `INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, modality, clinical_module)
       VALUES (?, ?, 'AGD-DASH-01', ?, 'p-st-fono', 'srv-st-fono', ?, ?, 'scheduled', 'presential', NULL)`
    ).run(dashApptId, studioTenantId, patientStudioId, `${todayDate}T22:10:00`, `${todayDate}T22:50:00`);

    const dashRes = await makeReq('GET', '/api/v1/dashboard/metrics', { Authorization: `Bearer ${tokens.fono}` });
    const dashAppt = (dashRes.data?.today?.appointments || []).find((a) => a.id === dashApptId);
    assert(
      dashRes.status === 200 && dashAppt && dashAppt.professional_clinical_module === 'ZemdaFono',
      'Dashboard /v1/dashboard/metrics expõe professional_clinical_module = ZemdaFono',
      { status: dashRes.status, dashAppt }
    );

    const listRes = await makeReq('GET', '/api/v1/appointments', { Authorization: `Bearer ${tokens.fono}` });
    const listArr = Array.isArray(listRes.data) ? listRes.data : (listRes.data?.appointments || []);
    const listAppt = listArr.find((a) => a.id === dashApptId);
    assert(
      listRes.status === 200 && listAppt && listAppt.professional_clinical_module === 'ZemdaFono',
      'Agenda /v1/appointments expõe professional_clinical_module = ZemdaFono',
      { status: listRes.status, profMod: listAppt?.professional_clinical_module }
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try {
      db.close();
    } catch (_) {}
    for (const ext of ['', '-wal', '-shm']) {
      if (fs.existsSync(process.env.DATABASE_PATH + ext)) {
        try {
          fs.unlinkSync(process.env.DATABASE_PATH + ext);
        } catch (_) {}
      }
    }
  }

  console.log('\n=====================================================================');
  console.log(`RESULTADO FINAL: ${passed} passed, ${failed} failed`);
  console.log('=====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro fatal na execução dos testes:', err);
  process.exit(1);
});
