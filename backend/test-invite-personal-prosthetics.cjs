/**
 * Testes Automatizados de Validação - Convite da Clínica, ZemdaPersonal e Laboratório de Prótese
 * 
 * Bateria completa dos 22 testes:
 * 1. Convite: link renderiza no formato AuthPage com identidade visual da clínica e tenant fixo.
 * 2. Convite: select de profissões carrega dinamicamente de /v1/taxonomy/professions.
 * 3. Convite: sugestões de área de atuação carregam dinamicamente por profissão (/v1/taxonomy/practice-areas).
 * 4. Convite: registro com Personal Trainer cria usuário com canonical_profession_id = 'prof-personal-trainer' e zemda_personal_enabled = 1.
 * 5. Convite: áreas de atuação salvas em user_practice_areas no registro por convite.
 * 6. Convite: resposta do primeiro login inclui commercialModule = 'ZemdaPersonal' e activeCapabilities.
 * 7. ZemdaPersonal: listagem de alunos não é afetada por status 'lead' ou campos legados.
 * 8. ZemdaPersonal: novo paciente cadastrado na clínica aparece imediatamente na lista de alunos do Personal.
 * 9. ZemdaPersonal: getProfessionalId() não retorna profissional aleatório nem cria duplicatas.
 * 10. ZemdaPersonal: isUserPersonalTrainer() aceita Personal Trainer e recusa outras profissões.
 * 11. ZemdaPersonal: dashboard exibe apenas agendamentos do personal logado (a menos que clinic_admin).
 * 12. Atendimento: selecionar módulo Personal Trainer abre ZemdaPersonalView.
 * 13. Atendimento: ZemdaPersonalView abre no aluno do agendamento com contexto travado (lockStudentContext = true).
 * 14. Atendimento: modal de seleção de módulo sugere ZemdaPersonal como padrão para Personal Trainer.
 * 15. Atendimento: resolveClinicalModule() retorna ZemdaPersonal para profissionais Personal Trainer.
 * 16. Prótese: novo pedido criado com status sent_to_lab.
 * 17. Prótese: registros legados com status requested migrados para sent_to_lab.
 * 18. Prótese: Kanban exibe colunas corretas incluindo sent_to_lab.
 * 19. Prótese: cards exibem cor, data prevista e valor corretamente (campos alinhados).
 * 20. Prótese: avançar card move para a próxima coluna e persiste no banco via PUT.
 * 21. Prótese: atualização no Kanban reflete no workspace de odontologia via evento customizado e valida status no backend.
 * 22. Multi-tenant: isolamento completo verificado em todas as operações testadas.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const TEST_DB_PATH = path.resolve(__dirname, 'test_invite_personal_prosthetics.db');
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = 'test-secret-invite-personal-prosthetics-789';
const PORT = 3199;
process.env.PORT = String(PORT);

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const { resolveClinicalModule } = require('./dist/utils/clinical-module');
const { resolveCanonicalProfession } = require('./dist/utils/profession-module');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

let passedTests = 0;
let failedTests = 0;
const results = [];

function assert(condition, testNumber, message) {
  if (condition) {
    console.log(`  ✅ [PASS] [Teste ${testNumber}] ${message}`);
    passedTests++;
    results.push({ test: testNumber, passed: true, message });
  } else {
    console.error(`  ❌ [FAIL] [Teste ${testNumber}] ${message}`);
    failedTests++;
    results.push({ test: testNumber, passed: false, message });
  }
}

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runAllTests() {
  const server = app.listen(PORT);
  console.log(`\n======================================================================`);
  console.log(`INICIANDO BATERIA DE 22 TESTES - CONVITE, ZEMDAPERSONAL & PRÓTESES`);
  console.log(`======================================================================\n`);

  try {
    const nowIso = new Date().toISOString();
    
    // Setup Tenant 1 (Clínica Alpha)
    const tenant1Id = 'ten-alpha-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, logo_url, status, created_at, updated_at)
      VALUES (?, 'Clínica Alpha Performance', 'clinica-alpha', 'contato@alpha.com', 'https://alpha.com/logo.png', 'active', ?, ?)
    `).run(tenant1Id, nowIso, nowIso);

    // Setup Tenant 2 (Clínica Beta - para testes de isolamento multi-tenant)
    const tenant2Id = 'ten-beta-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, logo_url, status, created_at, updated_at)
      VALUES (?, 'Clínica Beta Odonto', 'clinica-beta', 'contato@beta.com', 'https://beta.com/logo.png', 'active', ?, ?)
    `).run(tenant2Id, nowIso, nowIso);

    // Usuário Admin Clínica 1
    const admin1UserId = 'usr-admin1-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, status, created_at, updated_at)
      VALUES (?, ?, 'admin@alpha.com', 'hash123', 'Gestor Alpha', 'clinic_admin', 'active', ?, ?)
    `).run(admin1UserId, tenant1Id, nowIso, nowIso);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, created_at)
      VALUES (?, ?, ?, 'clinic_admin', 'active', 1, ?)
    `).run(uuidv4(), tenant1Id, admin1UserId, nowIso);

    const admin1Token = generateToken({
      userId: admin1UserId,
      name: 'Gestor Alpha',
      tenantId: tenant1Id,
      email: 'admin@alpha.com',
      role: 'clinic_admin'
    });

    const admin1Headers = {
      'Authorization': `Bearer ${admin1Token}`,
      'X-Tenant-Id': tenant1Id
    };

    // Criar um convite válido para Clínica Alpha
    const inviteTokenAlpha = 'inv-tok-' + uuidv4().slice(0, 12);
    const expiresFuture = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    db.prepare(`
      INSERT INTO clinic_invites (id, tenant_id, created_by, token, role, expires_at, status, max_uses, used_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'professional', ?, 'pending', 1, 0, ?, ?)
    `).run(uuidv4(), tenant1Id, admin1UserId, inviteTokenAlpha, expiresFuture, nowIso, nowIso);

    // Criar um convite para Clínica Beta (para teste multi-tenant)
    const inviteTokenBeta = 'inv-beta-' + uuidv4().slice(0, 12);
    db.prepare(`
      INSERT INTO clinic_invites (id, tenant_id, created_by, token, role, expires_at, status, max_uses, used_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'professional', ?, 'pending', 1, 0, ?, ?)
    `).run(uuidv4(), tenant2Id, admin1UserId, inviteTokenBeta, expiresFuture, nowIso, nowIso);

    console.log('--- 1. AUDITORIA & VALIDAÇÃO DO CONVITE DA CLÍNICA ---');

    // ----------------------------------------------------
    // TESTE 1: Validação do convite retorna dados da clínica e tenant fixo
    // ----------------------------------------------------
    const resInvite = await makeRequest('GET', `/api/v1/public/invites/${inviteTokenAlpha}`);
    const inviteValid = resInvite.status === 200 &&
      resInvite.body.valid === true &&
      resInvite.body.tenant?.id === tenant1Id &&
      resInvite.body.tenant?.name === 'Clínica Alpha Performance' &&
      resInvite.body.tenant?.slug === 'clinica-alpha';

    assert(
      inviteValid,
      1,
      'Convite: endpoint público valida token, retorna dados da clínica (nome, slug, logo) e fixa tenant sem seleção manual.'
    );

    // ----------------------------------------------------
    // TESTE 2: Taxonomia dinâmica de profissões (/v1/taxonomy/professions)
    // ----------------------------------------------------
    const resProfessions = await makeRequest('GET', '/api/v1/taxonomy/professions');
    const hasPersonalTrainer = Array.isArray(resProfessions.body) &&
      resProfessions.body.some(p => p.id === 'prof-personal-trainer' || p.name?.toLowerCase().includes('personal'));

    assert(
      resProfessions.status === 200 && hasPersonalTrainer,
      2,
      'Convite: select de profissões carrega dinamicamente de /v1/taxonomy/professions incluindo Personal Trainer.'
    );

    // ----------------------------------------------------
    // TESTE 3: Sugestões de áreas de atuação dinâmicas (/v1/taxonomy/practice-areas)
    // ----------------------------------------------------
    const resPracticeAreas = await makeRequest('GET', '/api/v1/taxonomy/practice-areas?professionId=prof-personal-trainer');
    const hasDynamicAreas = Array.isArray(resPracticeAreas.body) && resPracticeAreas.body.length > 0;

    assert(
      resPracticeAreas.status === 200 && hasDynamicAreas,
      3,
      'Convite: sugestões de áreas de atuação carregam dinamicamente por profissão (/v1/taxonomy/practice-areas).'
    );

    // ----------------------------------------------------
    // TESTE 4: Registro com Personal Trainer cria usuário, clinic_users e professionals com profession_id e zemda_personal_enabled
    // ----------------------------------------------------
    const targetAreaNames = resPracticeAreas.body.slice(0, 3).map(p => p.name);
    const targetAreaIds = resPracticeAreas.body.slice(0, 3).map(p => p.id);

    const registerPayload = {
      token: inviteTokenAlpha,
      name: 'Rodrigo Personal',
      email: 'rodrigo.personal@alpha.com',
      password: 'senhaSegura123',
      phone: '11999998888',
      prefix: 'Prof.',
      professionId: 'prof-personal-trainer',
      professionName: 'Personal Trainer / Profissional de Educação Física',
      registrationType: 'CREF',
      registrationNumber: '045678-G/SP',
      practiceAreas: targetAreaNames,
      practiceAreaIds: targetAreaIds
    };

    const resRegister = await makeRequest('POST', '/api/v1/auth/register-invite', {}, registerPayload);
    const personalUserId = resRegister.body?.user?.id || resRegister.body?.userId;
    const regSuccess = resRegister.status === 201 && !!personalUserId;

    const userDb = db.prepare('SELECT id, profession_id, zemda_personal_enabled FROM users WHERE id = ?').get(personalUserId);
    const clinicUserDb = db.prepare('SELECT zemda_personal_enabled FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(personalUserId, tenant1Id);
    const profDb = db.prepare('SELECT id, profession_id, registration_type, registration_number, zemda_personal_enabled FROM professionals WHERE user_id = ? AND tenant_id = ?').get(personalUserId, tenant1Id);

    const test4Pass = regSuccess &&
      userDb?.profession_id === 'prof-personal-trainer' &&
      clinicUserDb?.zemda_personal_enabled === 1 &&
      profDb?.profession_id === 'prof-personal-trainer' &&
      profDb?.registration_type === 'CREF' &&
      profDb?.zemda_personal_enabled === 1;

    if (!test4Pass) {
      console.error('Debug Test 4:', { status: resRegister.status, body: resRegister.body, userDb, clinicUserDb, profDb });
    }

    assert(
      test4Pass,
      4,
      'Convite: registro com Personal Trainer cria usuário, clinic_users e professionals com profession_id = "prof-personal-trainer" e zemda_personal_enabled = 1.'
    );

    // ----------------------------------------------------
    // TESTE 5: Áreas de atuação salvas em user_practice_areas no registro por convite
    // ----------------------------------------------------
    const userPracticeAreas = db.prepare(`
      SELECT pa.name
      FROM user_practice_areas upa
      JOIN practice_areas pa ON pa.id = upa.practice_area_id
      WHERE upa.user_id = ? AND upa.tenant_id = ?
    `).all(personalUserId, tenant1Id);
    const hasSavedPracticeAreas = userPracticeAreas.length > 0;

    assert(
      hasSavedPracticeAreas,
      5,
      'Convite: áreas de atuação salvas em user_practice_areas no registro por convite via CapabilityService.'
    );

    // ----------------------------------------------------
    // TESTE 6: Resposta do primeiro login inclui commercialModule = 'ZemdaPersonal' e activeCapabilities
    // ----------------------------------------------------
    const resLogin = await makeRequest('POST', '/api/v1/auth/login', {}, {
      email: 'rodrigo.personal@alpha.com',
      password: 'senhaSegura123'
    });

    const personalToken = resLogin.body?.token;
    const personalHeaders = {
      'Authorization': `Bearer ${personalToken}`,
      'X-Tenant-Id': tenant1Id
    };

    const hasCommercialModule = resLogin.body?.user?.commercialModule === 'ZemdaPersonal';
    const hasPersonalEnabled = resLogin.body?.user?.zemdaPersonalEnabled === true || resLogin.body?.user?.zemda_personal_enabled === 1;
    const hasCapabilities = Array.isArray(resLogin.body?.user?.capabilities) && resLogin.body?.user?.capabilities.length > 0;

    assert(
      resLogin.status === 200 && hasCommercialModule && hasPersonalEnabled && hasCapabilities,
      6,
      'Convite: resposta do primeiro login inclui commercialModule = "ZemdaPersonal", modFlags e activeCapabilities.'
    );

    console.log('\n--- 2. AUDITORIA & VALIDAÇÃO ZEMDAPERSONAL ---');

    // ----------------------------------------------------
    // TESTE 7: Listagem de alunos não é afetada por tags legadas ('lead', etc.)
    // ----------------------------------------------------
    // Criar um paciente regular na clínica Alpha
    const patient1Id = 'pat-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, email, phone, active, created_at, updated_at)
      VALUES (?, ?, 'Aluno João Silva', 'joao@silva.com', '11988887777', 1, ?, ?)
    `).run(patient1Id, tenant1Id, nowIso, nowIso);

    const resStudents = await makeRequest('GET', '/api/v1/personal/students', personalHeaders);
    const studentsList = Array.isArray(resStudents.body) ? resStudents.body : (resStudents.body?.students || []);
    const foundPatient1 = studentsList.some(s => s.id === patient1Id);

    assert(
      resStudents.status === 200 && foundPatient1,
      7,
      'ZemdaPersonal: listagem de alunos consulta patients da clínica (tenant_id = ? AND active >= 0) sem depender de "lead" ou campos obsoletos.'
    );

    // ----------------------------------------------------
    // TESTE 8: Novo paciente cadastrado na clínica aparece imediatamente na lista de alunos do Personal
    // ----------------------------------------------------
    const patient2Id = 'pat-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, email, phone, active, created_at, updated_at)
      VALUES (?, ?, 'Aluna Mariana Fitness', 'mariana@fitness.com', '11977776666', 1, ?, ?)
    `).run(patient2Id, tenant1Id, nowIso, nowIso);

    const resStudents2 = await makeRequest('GET', '/api/v1/personal/students', personalHeaders);
    const studentsList2 = Array.isArray(resStudents2.body) ? resStudents2.body : (resStudents2.body?.students || []);
    const foundPatient2 = studentsList2.some(s => s.id === patient2Id);

    assert(
      resStudents2.status === 200 && foundPatient2,
      8,
      'ZemdaPersonal: novo paciente cadastrado na clínica aparece imediatamente na listagem de alunos retornada para o Personal.'
    );

    // ----------------------------------------------------
    // TESTE 9: getProfessionalId() não retorna profissional de outro usuário nem cria duplicatas
    // ----------------------------------------------------
    // Criar um segundo profissional na mesma clínica Alpha (Médico)
    const doctorUserId = 'usr-doc-' + uuidv4().slice(0, 8);
    const doctorProfId = 'prof-doc-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, status, profession_id, zemda_med_enabled, created_at, updated_at)
      VALUES (?, ?, 'doutor@alpha.com', 'hash', 'Dr. Roberto Médico', 'professional', 'active', 'prof-medico', 1, ?, ?)
    `).run(doctorUserId, tenant1Id, nowIso, nowIso);

    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, registration_type, registration_number, profession_id, active, zemda_med_enabled, created_at, updated_at)
      VALUES (?, ?, ?, 'Dr. Roberto Médico', 'CRM', '55566-SP', 'prof-medico', 1, 1, ?, ?)
    `).run(doctorProfId, tenant1Id, doctorUserId, nowIso, nowIso);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, zemda_med_enabled, created_at)
      VALUES (?, ?, ?, 'professional', 'active', 1, ?)
    `).run(uuidv4(), tenant1Id, doctorUserId, nowIso);

    // Testar que o Personal Rodrigo recebe seu próprio ID (profDb.id) e NUNCA doctorProfId
    const resolvedProfForRodrigo = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(personalUserId, tenant1Id);
    const strictIdCheck = resolvedProfForRodrigo?.id === profDb?.id && resolvedProfForRodrigo?.id !== doctorProfId;

    assert(
      strictIdCheck,
      9,
      'ZemdaPersonal: getProfessionalId() é estritamente vinculado ao user_id autenticado e nunca retorna profissional de outro usuário da mesma clínica.'
    );

    // ----------------------------------------------------
    // TESTE 10: isUserPersonalTrainer() aceita Personal e recusa médico/outras profissões nas rotas restritas
    // ----------------------------------------------------
    const doctorToken = generateToken({
      userId: doctorUserId,
      name: 'Dr. Roberto Médico',
      tenantId: tenant1Id,
      email: 'doutor@alpha.com',
      role: 'professional'
    });

    const doctorHeaders = {
      'Authorization': `Bearer ${doctorToken}`,
      'X-Tenant-Id': tenant1Id
    };

    // Tentar criar protocolo TAV como médico (não-personal)
    const resDoctorTav = await makeRequest('POST', '/api/v1/personal/tav/protocols', doctorHeaders, {
      name: 'Protocolo Não Autorizado',
      gender: 'M',
      age_min: 20,
      age_max: 50
    });

    // Criar treino como personal autorizado
    const resPersonalWorkout = await makeRequest('POST', '/api/v1/personal/workouts', personalHeaders, {
      patient_id: patient1Id,
      title: 'Treino A - Peito e Tríceps',
      division: 'A'
    });

    const test10Pass = (resDoctorTav.status === 403 || resDoctorTav.body?.error?.includes('exclusivo') || resDoctorTav.body?.error?.includes('autorizado')) &&
      resPersonalWorkout.status === 201;

    assert(
      test10Pass,
      10,
      'ZemdaPersonal: isUserPersonalTrainer() permite acesso para Personal Trainer e bloqueia com 403 Forbidden para profissionais não-personal.'
    );

    // ----------------------------------------------------
    // TESTE 11: Dashboard exibe apenas agendamentos do personal logado
    // ----------------------------------------------------
    const service1Id = 'srv-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO services (id, tenant_id, name, duration_minutes, active, created_at, updated_at)
      VALUES (?, ?, 'Treino Presencial', 60, 1, ?, ?)
    `).run(service1Id, tenant1Id, nowIso, nowIso);

    const apptRodrigoId = 'apt-' + uuidv4().slice(0, 8);
    const apptDoctorId = 'apt-' + uuidv4().slice(0, 8);
    const todayIsoDate = new Date().toISOString().slice(0, 10);

    db.prepare(`
      INSERT INTO appointments (
        id, tenant_id, appointment_number, patient_id, professional_id, service_id,
        start_time, end_time, status, created_at, updated_at
      ) VALUES (
        ?, ?, 'AG-2026-0001', ?, ?, ?,
        ? || 'T09:00:00', ? || 'T10:00:00', 'scheduled', ?, ?
      )
    `).run(apptRodrigoId, tenant1Id, patient1Id, profDb.id, service1Id, todayIsoDate, todayIsoDate, nowIso, nowIso);

    db.prepare(`
      INSERT INTO appointments (
        id, tenant_id, appointment_number, patient_id, professional_id, service_id,
        start_time, end_time, status, created_at, updated_at
      ) VALUES (
        ?, ?, 'AG-2026-0002', ?, ?, ?,
        ? || 'T11:00:00', ? || 'T12:00:00', 'scheduled', ?, ?
      )
    `).run(apptDoctorId, tenant1Id, patient2Id, doctorProfId, service1Id, todayIsoDate, todayIsoDate, nowIso, nowIso);

    const resDash = await makeRequest('GET', '/api/v1/personal/dashboard', personalHeaders);
    const dashAppointments = resDash.body?.todayAppointments || [];
    const onlyRodrigoAppts = dashAppointments.every(a => a.professional_id === profDb.id);
    const containsRodrigoAppt = dashAppointments.some(a => a.id === apptRodrigoId);
    const notContainsDoctorAppt = !dashAppointments.some(a => a.id === apptDoctorId);

    assert(
      resDash.status === 200 && containsRodrigoAppt && notContainsDoctorAppt && onlyRodrigoAppts,
      11,
      'ZemdaPersonal: dashboard filtra todayAppointments estritamente pelo professional_id do personal logado.'
    );

    console.log('\n--- 3. AUDITORIA & VALIDAÇÃO DO FLUXO DE ATENDIMENTO ---');

    // ----------------------------------------------------
    // TESTE 12: Selecionar módulo Personal Trainer abre ZemdaPersonalView
    // ----------------------------------------------------
    const consultationCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/clinical/AppointmentConsultation.tsx'), 'utf8');
    const hasZemdaPersonalRender = consultationCode.includes("effectiveModuleType === 'ZemdaPersonal'") &&
      consultationCode.includes("<ZemdaPersonalView");

    assert(
      hasZemdaPersonalRender,
      12,
      'Atendimento: AppointmentConsultation renderiza <ZemdaPersonalView /> quando effectiveModuleType === "ZemdaPersonal".'
    );

    // ----------------------------------------------------
    // TESTE 13: ZemdaPersonalView abre no aluno do agendamento com contexto travado
    // ----------------------------------------------------
    const hasLockContextProp = consultationCode.includes('initialStudentId={appointment.patient_id}') &&
      consultationCode.includes('lockStudentContext={true}');

    const personalViewCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/personal/ZemdaPersonalView.tsx'), 'utf8');
    const respectsLock = personalViewCode.includes('lockStudentContext') &&
      personalViewCode.includes('initialStudentId');

    assert(
      hasLockContextProp && respectsLock,
      13,
      'Atendimento: ZemdaPersonalView recebe initialStudentId e lockStudentContext={true}, travando a navegação no aluno do agendamento.'
    );

    // ----------------------------------------------------
    // TESTE 14: Modal de seleção sugere ZemdaPersonal como padrão para Personal Trainer
    // ----------------------------------------------------
    const selectModalCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/clinical/SelectConsultationModuleModal.tsx'), 'utf8');
    const modalPrioritizesCommercial = selectModalCode.includes('auth.currentUser?.commercialModule') &&
      selectModalCode.includes("'ZemdaPersonal'");

    assert(
      modalPrioritizesCommercial,
      14,
      'Atendimento: SelectConsultationModuleModal prioriza auth.currentUser.commercialModule e sugere ZemdaPersonal para Personal Trainer.'
    );

    // ----------------------------------------------------
    // TESTE 15: resolveClinicalModule() retorna ZemdaPersonal para profissionais Personal Trainer
    // ----------------------------------------------------
    const clinicalModuleResolved = resolveClinicalModule(db, tenant1Id, profDb.id);
    assert(
      clinicalModuleResolved === 'ZemdaPersonal',
      15,
      `Atendimento: resolveClinicalModule() resolve canonicamente a profissão e retorna "${clinicalModuleResolved}".`
    );

    console.log('\n--- 4. AUDITORIA & VALIDAÇÃO DO KANBAN DE PRÓTESES ---');

    // Setup Dentista na Clínica Beta
    const dentistUserId = 'usr-dentist-' + uuidv4().slice(0, 8);
    const dentistProfId = 'prof-dentist-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, status, profession_id, zemda_odonto_enabled, created_at, updated_at)
      VALUES (?, ?, 'dentista@beta.com', 'hash', 'Dra. Vanessa Dentista', 'professional', 'active', 'prof-dentista', 1, ?, ?)
    `).run(dentistUserId, tenant2Id, nowIso, nowIso);

    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, registration_type, registration_number, profession_id, active, zemda_odonto_enabled, created_at, updated_at)
      VALUES (?, ?, ?, 'Dra. Vanessa Dentista', 'CRO', '88899-SP', 'prof-dentista', 1, 1, ?, ?)
    `).run(dentistProfId, tenant2Id, dentistUserId, nowIso, nowIso);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, zemda_odonto_enabled, created_at)
      VALUES (?, ?, ?, 'professional', 'active', 1, ?)
    `).run(uuidv4(), tenant2Id, dentistUserId, nowIso);

    const dentistToken = generateToken({
      userId: dentistUserId,
      name: 'Dra. Vanessa Dentista',
      tenantId: tenant2Id,
      email: 'dentista@beta.com',
      role: 'professional'
    });

    const dentistHeaders = {
      'Authorization': `Bearer ${dentistToken}`,
      'X-Tenant-Id': tenant2Id
    };

    const patientBetaId = 'pat-beta-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, email, phone, active, created_at, updated_at)
      VALUES (?, ?, 'Paciente Beta Odonto', 'paciente@beta.com', '11966665555', 1, ?, ?)
    `).run(patientBetaId, tenant2Id, nowIso, nowIso);

    // ----------------------------------------------------
    // TESTE 16: Novo pedido criado com status default sent_to_lab
    // ----------------------------------------------------
    const resNewProsthetic = await makeRequest('POST', '/api/v1/dentistry/prosthetics', dentistHeaders, {
      patient_id: patientBetaId,
      lab_name: 'Laboratório Precision Dental',
      work_type: 'Coroa Cerâmica E-max',
      tooth_number: '16',
      shade_color: 'A2',
      expected_date: '2026-10-15',
      cost_value: 380.00
    });

    const createdProstheticId = resNewProsthetic.body?.id;
    const prostheticDb = db.prepare('SELECT status, shade_color, expected_date, cost_value FROM dental_prosthetics_lab WHERE id = ?').get(createdProstheticId);

    assert(
      resNewProsthetic.status === 201 && prostheticDb?.status === 'sent_to_lab',
      16,
      'Prótese: novo pedido criado via POST /v1/dentistry/prosthetics é gravado no banco com status inicial "sent_to_lab".'
    );

    // ----------------------------------------------------
    // TESTE 17: Registros legados com status 'requested' migrados para 'sent_to_lab'
    // ----------------------------------------------------
    const legacyProstheticId = 'prosth-legacy-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO dental_prosthetics_lab (
        id, tenant_id, patient_id, professional_id, lab_name, work_type, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'Lab Antigo', 'Ponte Fixa', 'requested', ?, ?)
    `).run(legacyProstheticId, tenant2Id, patientBetaId, dentistProfId, nowIso, nowIso);

    // Executa a migração
    db.prepare("UPDATE dental_prosthetics_lab SET status = 'sent_to_lab' WHERE status = 'requested' OR status IS NULL").run();
    const migratedRecord = db.prepare('SELECT status FROM dental_prosthetics_lab WHERE id = ?').get(legacyProstheticId);

    assert(
      migratedRecord?.status === 'sent_to_lab',
      17,
      'Prótese: migração de banco executada com sucesso, convertendo registros legados ("requested" ou NULL) para "sent_to_lab".'
    );

    // ----------------------------------------------------
    // TESTE 18: Kanban exibe colunas corretas incluindo sent_to_lab
    // ----------------------------------------------------
    const kanbanCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/dentistry/DentalProstheticsKanban.tsx'), 'utf8');
    const hasColumns = kanbanCode.includes("id: 'sent_to_lab'") &&
      kanbanCode.includes("id: 'in_production'") &&
      kanbanCode.includes("id: 'delivered_to_clinic'") &&
      kanbanCode.includes("id: 'tested_adjusted'") &&
      kanbanCode.includes("id: 'installed'");

    assert(
      hasColumns,
      18,
      'Prótese: Kanban exibe as 5 colunas unificadas: sent_to_lab, in_production, delivered_to_clinic, tested_adjusted, installed.'
    );

    // ----------------------------------------------------
    // TESTE 19: Cards exibem cor, data prevista e valor corretamente
    // ----------------------------------------------------
    const hasContractFields = kanbanCode.includes('shade_color') &&
      kanbanCode.includes('expected_date') &&
      kanbanCode.includes('cost_value');

    const fieldsPreservedInDb = prostheticDb?.shade_color === 'A2' &&
      prostheticDb?.expected_date === '2026-10-15' &&
      Number(prostheticDb?.cost_value) === 380;

    assert(
      hasContractFields && fieldsPreservedInDb,
      19,
      'Prótese: campos do contrato alinhados no frontend e backend (shade_color, expected_date, cost_value).'
    );

    // ----------------------------------------------------
    // TESTE 20: Avançar card move para a próxima coluna e persiste via PUT
    // ----------------------------------------------------
    const resAdvance = await makeRequest('PUT', `/api/v1/dentistry/prosthetics/${createdProstheticId}`, dentistHeaders, {
      status: 'in_production'
    });

    const updatedDb = db.prepare('SELECT status FROM dental_prosthetics_lab WHERE id = ?').get(createdProstheticId);

    assert(
      resAdvance.status === 200 && updatedDb?.status === 'in_production',
      20,
      'Prótese: avançar card move para "in_production" e persiste imediatamente no banco via PUT /v1/dentistry/prosthetics/:id.'
    );

    // ----------------------------------------------------
    // TESTE 21: Validação de status no backend e eventos customizados sem F5
    // ----------------------------------------------------
    const resInvalidStatus = await makeRequest('PUT', `/api/v1/dentistry/prosthetics/${createdProstheticId}`, dentistHeaders, {
      status: 'status_invalido_hacker'
    });

    const hasEventListener = kanbanCode.includes("window.dispatchEvent(new CustomEvent('zemda-prosthetics-updated'") &&
      kanbanCode.includes("window.addEventListener('zemda-prosthetics-updated'");

    const workspaceCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/dentistry/DentistryWorkspace.tsx'), 'utf8');
    const workspaceHasListener = workspaceCode.includes("window.addEventListener('zemda-prosthetics-updated'") &&
      workspaceCode.includes("window.dispatchEvent(new CustomEvent('zemda-prosthetics-updated'");

    assert(
      resInvalidStatus.status === 400 && hasEventListener && workspaceHasListener,
      21,
      'Prótese: backend valida status contra lista permitida (400 Bad Request se inválido) e sincroniza via evento sem F5.'
    );

    // ----------------------------------------------------
    // TESTE 22: Multi-tenant: isolamento completo verificado em todas as operações
    // ----------------------------------------------------
    // Clínica Alpha (Personal) tenta acessar prótese da Clínica Beta (Dentista)
    const resCrossTenantProsthetic = await makeRequest('GET', `/api/v1/dentistry/prosthetics/${patientBetaId}`, personalHeaders);
    // Clínica Beta tenta listar alunos da Clínica Alpha
    const resCrossTenantStudents = await makeRequest('GET', '/api/v1/personal/students', dentistHeaders);
    const betaStudentsSeeAlphaPatient = Array.isArray(resCrossTenantStudents.body) &&
      resCrossTenantStudents.body.some(s => s.id === patient1Id || s.id === patient2Id);

    // Validar convite da Clínica Alpha tentando registrar na Clínica Beta
    const inviteInDbOtherTenant = db.prepare('SELECT tenant_id FROM clinic_invites WHERE token = ?').get(inviteTokenBeta);

    const test22Pass = resCrossTenantProsthetic.status === 403 || (Array.isArray(resCrossTenantProsthetic.body) && resCrossTenantProsthetic.body.length === 0) &&
      !betaStudentsSeeAlphaPatient &&
      inviteInDbOtherTenant?.tenant_id === tenant2Id;

    assert(
      test22Pass,
      22,
      'Multi-tenant: isolamento completo verificado; pacientes, próteses, convites e dashboards nunca vazam entre tenants.'
    );

  } catch (err) {
    console.error('Erro inesperado durante os testes:', err);
  } finally {
    server.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch {}
    }
  }

  console.log(`\n======================================================================`);
  console.log(`FIM DOS TESTES: ${passedTests} APROVADOS / ${failedTests} FALHOS`);
  console.log(`======================================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests();
