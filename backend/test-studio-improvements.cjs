const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_studio_improvements.db');
process.env.JWT_SECRET = 'test-studio-secret-2026';
process.env.ZEMDA_FILES_SIGNING_SECRET = 'test-studio-files-signing-secret-123456';
process.env.PORT = '3099';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  fs.unlinkSync(process.env.DATABASE_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const { resolveCanonicalProfession } = require('./dist/utils/profession-module');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failedTests++;
  }
}

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3099,
      path: urlPath,
      method,
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
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body !== null) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const server = app.listen(3099);
  console.log('\n====================================================');
  console.log('TESTE DE ACEITAÇÃO: 7 MELHORIAS STUDIO / MULTIPROFISSIONAL');
  console.log('====================================================\n');

  try {
    // ----------------------------------------------------
    // SETUP DO TENANT PRINCIPAL (STUDIO ALPHA) E UNIDADE B
    // ----------------------------------------------------
    const tenantA = 'tenant-studio-' + uuidv4().slice(0, 8);
    const tenantB = 'tenant-clinic-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, status, billing_required, public_booking_enabled, establishment_profile, created_at, updated_at)
      VALUES (?, 'Studio Alpha', 'studio-alpha', 'contato@studioalpha.com', 'active', 0, 1, 'clinic', datetime('now'), datetime('now'))
    `).run(tenantA);
    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, status, billing_required, public_booking_enabled, establishment_profile, created_at, updated_at)
      VALUES (?, 'Clínica Beta', 'clinica-beta', 'contato@clinicabeta.com', 'active', 0, 1, 'clinic', datetime('now'), datetime('now'))
    `).run(tenantB);

    // Admin A
    const adminId = 'user-admin-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'Admin Studio', 'admin@studioalpha.com', 'hash', 'clinic_admin', 'active', datetime('now'), datetime('now'))
    `).run(adminId, tenantA);
    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json)
      VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["view_financial","manage_financial","view_schedule","manage_services","view_all_schedules"]')
    `).run('cu-' + uuidv4().slice(0, 8), tenantA, adminId);
    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json)
      VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["view_financial"]')
    `).run('cu-' + uuidv4().slice(0, 8), tenantB, adminId);

    const adminTokenA = generateToken({ userId: adminId, tenantId: tenantA, email: 'admin@studioalpha.com', role: 'clinic_admin' });
    const adminTokenB = generateToken({ userId: adminId, tenantId: tenantB, email: 'admin@studioalpha.com', role: 'clinic_admin' });

    // Instrutor legado (`prof-instrutor-pilates`)
    const instUserId = 'user-inst-' + uuidv4().slice(0, 8);
    const instProfId = 'pro-inst-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'Instrutora Ana', 'ana@studioalpha.com', 'hash', 'professional', 'active', datetime('now'), datetime('now'))
    `).run(instUserId, tenantA);
    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_personal_enabled)
      VALUES (?, ?, ?, 'professional', 'active', 0, '["view_schedule","create_appointment","edit_appointment","cancel_appointment"]', 0)
    `).run('cu-' + uuidv4().slice(0, 8), tenantA, instUserId);
    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, remuneration_type, commission_percentage, fixed_salary, payment_day, active, public_booking_enabled, created_at, updated_at)
      VALUES (?, ?, ?, 'Instrutora Ana', 'prof-instrutor-pilates', 'both', 50, 1200, 5, 1, 1, datetime('now'), datetime('now'))
    `).run(instProfId, tenantA, instUserId);

    // Colega Fisioterapeuta (não pode ver agenda da Ana sem view_all_schedules)
    const physioUserId = 'user-fisio-' + uuidv4().slice(0, 8);
    const physioProfId = 'pro-fisio-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'Dr. Bruno Fisio', 'bruno@studioalpha.com', 'hash', 'professional', 'active', datetime('now'), datetime('now'))
    `).run(physioUserId, tenantA);
    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json)
      VALUES (?, ?, ?, 'professional', 'active', 0, '["view_schedule","create_appointment","edit_appointment"]')
    `).run('cu-' + uuidv4().slice(0, 8), tenantA, physioUserId);
    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, remuneration_type, commission_percentage, practice_areas, active, created_at, updated_at)
      VALUES (?, ?, ?, 'Dr. Bruno Fisio', 'prof-fisioterapeuta', 'commission', 40, 'Pilates Clínico, Ortopedia', 1, datetime('now'), datetime('now'))
    `).run(physioProfId, tenantA, physioUserId);

    const instToken = generateToken({ userId: instUserId, tenantId: tenantA, email: 'ana@studioalpha.com', role: 'professional' });
    const physioToken = generateToken({ userId: physioUserId, tenantId: tenantA, email: 'bruno@studioalpha.com', role: 'professional' });

    // Schedules de segunda a sexta (07:00 - 20:00) para Ana
    for (let dow = 1; dow <= 5; dow++) {
      db.prepare(`
        INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
        VALUES (?, ?, ?, ?, '07:00', '20:00', 1)
      `).run('sch-' + uuidv4().slice(0, 8), tenantA, instProfId, dow);
    }

    // Alunos
    const student1Id = 'pat-1-' + uuidv4().slice(0, 8);
    const student2Id = 'pat-2-' + uuidv4().slice(0, 8);
    const student3Id = 'pat-3-' + uuidv4().slice(0, 8);
    for (const [sid, sname, phone] of [
      [student1Id, 'Maria Pilates', '11999990001'],
      [student2Id, 'João Zumba', '11999990002'],
      [student3Id, 'Carla Dança', '11999990003']
    ]) {
      db.prepare(`
        INSERT INTO patients (id, tenant_id, full_name, phone, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `).run(sid, tenantA, sname, phone);
    }

    // ====================================================
    // 1. PROFISSÃO INSTRUTOR + ALIASES + ZEMDAPERSONAL
    // ====================================================
    console.log('▶ 1. Testando Profissão Instrutor, Aliases e ZemdaPersonal...');
    const modCanonical = resolveCanonicalProfession('prof-instrutor');
    const modLegacy = resolveCanonicalProfession('prof-instrutor-pilates');
    const modSnake = resolveCanonicalProfession('pilates_instructor');
    const modPhysioWithPilatesText = resolveCanonicalProfession({ id: 'prof-fisioterapeuta', name: 'Fisioterapia / Pilates' });

    assert(modCanonical?.commercialModule === 'ZemdaPersonal', 'prof-instrutor resolve para ZemdaPersonal');
    assert(modLegacy?.canonicalId === 'prof-instrutor' && modLegacy?.commercialModule === 'ZemdaPersonal', 'Alias legado prof-instrutor-pilates normalizado para ZemdaPersonal');
    assert(modSnake?.canonicalId === 'prof-instrutor' && modSnake?.commercialModule === 'ZemdaPersonal', 'Alias pilates_instructor normalizado para ZemdaPersonal');
    assert(modPhysioWithPilatesText?.commercialModule === 'ZemdaFisio', 'Fisioterapeuta com texto Pilates NÃO é reclassificado para Instrutor/ZemdaPersonal');

    const resMultiMod = await makeRequest('PUT', `/api/v1/professionals/${instProfId}`, { Authorization: `Bearer ${adminTokenA}` }, {
      practiceAreas: 'Pilates, Dança, Zumba, Pole Contemporâneo'
    });
    assert(resMultiMod.status === 200, 'Salvar múltiplas modalidades + personalizada no Instrutor retorna 200');

    const resPersonalDash = await makeRequest('GET', '/api/v1/personal/dashboard', { Authorization: `Bearer ${instToken}` });
    assert(resPersonalDash.status === 200, 'Instrutor (mesmo com ID legado prof-instrutor-pilates) acessa /v1/personal/dashboard');

    const resExLib = await makeRequest('GET', '/api/v1/personal/exercises', { Authorization: `Bearer ${instToken}` });
    assert(resExLib.status === 200 && Array.isArray(resExLib.data?.exercises) && resExLib.data.exercises.length >= 187, `Biblioteca protegida intacta (${resExLib.data?.exercises?.length || 0} exercícios)`);

    // ====================================================
    // 2. PERSONALIZAÇÃO DA SIDEBAR POR USUÁRIO E UNIDADE
    // ====================================================
    console.log('\n▶ 2. Testando Sidebar Preferences por (user_id, tenant_id)...');
    const resPutSidebar = await makeRequest('PUT', '/api/v1/auth/sidebar-preferences', { Authorization: `Bearer ${adminTokenA}` }, {
      hiddenItems: ['budgets', 'inventory', 'settings', 'sidebar-customize', 'help', 'logout']
    });
    assert(
      resPutSidebar.status === 200 &&
      resPutSidebar.data.hiddenItems.includes('budgets') &&
      resPutSidebar.data.hiddenItems.includes('inventory') &&
      !resPutSidebar.data.hiddenItems.includes('settings') &&
      !resPutSidebar.data.hiddenItems.includes('sidebar-customize') &&
      !resPutSidebar.data.hiddenItems.includes('help') &&
      !resPutSidebar.data.hiddenItems.includes('logout'),
      'Itens protegidos (settings, personalize, help, logout) nunca são ocultados'
    );

    const resSidebarUnitB = await makeRequest('GET', '/api/v1/auth/sidebar-preferences', { Authorization: `Bearer ${adminTokenB}` });
    assert(resSidebarUnitB.status === 200 && Array.isArray(resSidebarUnitB.data.hiddenItems) && resSidebarUnitB.data.hiddenItems.length === 0, 'Trocar de unidade (Unit B) isola preferências da Unit A');

    const resSidebarOtherUser = await makeRequest('GET', '/api/v1/auth/sidebar-preferences', { Authorization: `Bearer ${instToken}` });
    assert(resSidebarOtherUser.status === 200 && resSidebarOtherUser.data.hiddenItems.length === 0, 'Outro usuário na mesma unidade mantém menu padrão');

    const resResetSidebar = await makeRequest('DELETE', '/api/v1/auth/sidebar-preferences', { Authorization: `Bearer ${adminTokenA}` });
    assert(resResetSidebar.status === 200 && resResetSidebar.data.hiddenItems.length === 0, 'Restaurar menu padrão limpa hiddenItems da Unit A');

    // ====================================================
    // 6a. PERFIL DO ESTABELECIMENTO
    // ====================================================
    console.log('\n▶ 3. Testando Tipo de Estabelecimento...');
    const resProfilePut = await makeRequest('PUT', '/api/v1/tenants/current', { Authorization: `Bearer ${adminTokenA}` }, {
      name: 'Studio Alpha',
      establishmentProfile: 'studio'
    });
    assert(resProfilePut.status === 200 && resProfilePut.data?.tenant?.establishment_profile === 'studio', 'Perfil do estabelecimento atualizado para studio');
    const resProfileGet = await makeRequest('GET', '/api/v1/tenants/current', { Authorization: `Bearer ${adminTokenA}` });
    assert(resProfileGet.status === 200 && resProfileGet.data?.establishment_profile === 'studio', 'GET /v1/tenants/current retorna establishment_profile = studio');

    // ====================================================
    // 4. SERVIÇOS, TURMAS COLETIVAS, CAPACIDADE E RECORRÊNCIA
    // ====================================================
    console.log('\n▶ 4. Testando Serviços Coletivos, Capacidade, Edição Rápida e Recorrência Finita...');
    const svcGroupRes = await makeRequest('POST', '/api/v1/services', { Authorization: `Bearer ${adminTokenA}` }, {
      name: 'Pilates Studio Turma',
      professionalId: instProfId,
      durationMinutes: 60,
      price: 100,
      serviceKind: 'group',
      defaultCapacity: 2,
      allowRecurrence: true,
      modalityCategory: 'Pilates'
    });
    assert(svcGroupRes.status === 201 && svcGroupRes.data?.service_kind === 'group', 'Serviço coletivo (capacidade 2) criado');
    const groupServiceId = svcGroupRes.data.id;

    const svcIndivBRes = await makeRequest('POST', '/api/v1/services', { Authorization: `Bearer ${adminTokenA}` }, {
      name: 'Personal Exclusivo Fixo',
      professionalId: instProfId,
      durationMinutes: 60,
      price: 120,
      serviceKind: 'individual',
      modalityCategory: 'Treinamento'
    });
    const svcFixedRuleId = svcIndivBRes.data.id;

    const svcIndivCRes = await makeRequest('POST', '/api/v1/services', { Authorization: `Bearer ${adminTokenA}` }, {
      name: 'Avaliação Geral Padrão',
      professionalId: instProfId,
      durationMinutes: 60,
      price: 100,
      serviceKind: 'individual'
    });
    const svcGeneralFallbackId = svcIndivCRes.data.id;

    // Edição rápida bloqueada para não-admin e liberada para admin
    const resQuickDeny = await makeRequest('PUT', `/api/v1/services/${groupServiceId}`, { Authorization: `Bearer ${instToken}` }, { price: 110 });
    assert(resQuickDeny.status === 403, 'Profissional não-admin é impedido de editar serviço (403)');
    const resQuickAllow = await makeRequest('PUT', `/api/v1/services/${groupServiceId}`, { Authorization: `Bearer ${adminTokenA}` }, { defaultCapacity: 2, price: 100 });
    assert(resQuickAllow.status === 200, 'Admin edita rapidamente serviço com sucesso');

    // Agendamentos em turma na segunda-feira próxima (2026-11-16 14:00)
    const targetDate = '2026-11-16';
    const b1 = await makeRequest('POST', '/api/v1/appointments', { Authorization: `Bearer ${adminTokenA}` }, {
      patientId: student1Id,
      professionalId: instProfId,
      serviceId: groupServiceId,
      startTime: `${targetDate}T14:00:00`,
      endTime: `${targetDate}T15:00:00`,
      internalNotes: 'Observação confidencial turma 1'
    });
    const b2 = await makeRequest('POST', '/api/v1/appointments', { Authorization: `Bearer ${adminTokenA}` }, {
      patientId: student2Id,
      professionalId: instProfId,
      serviceId: groupServiceId,
      startTime: `${targetDate}T14:00:00`,
      endTime: `${targetDate}T15:00:00`
    });
    const bDup = await makeRequest('POST', '/api/v1/appointments', { Authorization: `Bearer ${adminTokenA}` }, {
      patientId: student1Id,
      professionalId: instProfId,
      serviceId: groupServiceId,
      startTime: `${targetDate}T14:00:00`,
      endTime: `${targetDate}T15:00:00`
    });
    const b3Full = await makeRequest('POST', '/api/v1/appointments', { Authorization: `Bearer ${adminTokenA}` }, {
      patientId: student3Id,
      professionalId: instProfId,
      serviceId: groupServiceId,
      startTime: `${targetDate}T14:00:00`,
      endTime: `${targetDate}T15:00:00`
    });
    assert(b1.status === 201 && b2.status === 201, 'Dois alunos inscritos na mesma turma (capacidade 2)');
    assert(b1.data.occurrenceId && b1.data.occurrenceId === b2.data.occurrenceId, 'Mesma ocorrência (occurrenceId) compartilhada pela turma');
    assert(bDup.status === 409, 'Bloqueia inscrição duplicada do mesmo aluno na mesma ocorrência');
    assert(b3Full.status === 409, 'Bloqueia 3º aluno quando vagas estão esgotadas (409 CLASS_FULL)');
    const groupOccurrenceId = b1.data.occurrenceId;
    const apptStudent1GroupId = b1.data.id;
    const apptStudent2GroupId = b2.data.id;

    // Slots públicos mostram vagas restantes sem expor nomes de alunos
    const publicSlotsRes = await makeRequest('GET', `/api/v1/public/slots/available?tenantSlug=studio-alpha&professionalId=${instProfId}&serviceId=${groupServiceId}&date=${targetDate}`);
    const slot14 = (publicSlotsRes.data?.slots || []).find(s => s.time === '14:00');
    const anyFreeSlot = (publicSlotsRes.data?.slots || []).find(s => s.time !== '14:00');
    const rawSlotsStr = JSON.stringify(publicSlotsRes.data || {});
    assert(publicSlotsRes.status === 200 && !slot14 && anyFreeSlot?.remainingSpots === 2, 'Agenda pública omite horário lotado (14:00) e mostra remainingSpots = 2 no horário livre');
    assert(!rawSlotsStr.includes('Maria Pilates') && !rawSlotsStr.includes('João Zumba'), 'Agenda pública NUNCA expõe nomes de outros alunos');

    // Recorrência finita obrigatória + escopos single vs this_and_following
    const recUnbounded = await makeRequest('POST', '/api/v1/appointments/recurring', { Authorization: `Bearer ${adminTokenA}` }, {
      patientId: student3Id,
      professionalId: instProfId,
      serviceId: svcGeneralFallbackId,
      startTime: '2026-11-17T10:00:00',
      endTime: '2026-11-17T11:00:00',
      recurrence: { frequency: 'weekly' }
    });
    assert(recUnbounded.status === 400, 'Recorrência sem fim definido é rejeitada (400)');

    const recFinite = await makeRequest('POST', '/api/v1/appointments/recurring', { Authorization: `Bearer ${adminTokenA}` }, {
      patientId: student3Id,
      professionalId: instProfId,
      serviceId: svcGeneralFallbackId,
      startTime: '2026-11-17T10:00:00',
      endTime: '2026-11-17T11:00:00',
      recurrence: { frequency: 'weekly', maxOccurrences: 3 }
    });
    assert(recFinite.status === 201 && recFinite.data?.appointments?.length === 3, 'Recorrência semanal finita cria exatamente 3 ocorrências');
    const [rec1, rec2, rec3] = recFinite.data.appointments;
    // Marca ocorrência 1 como completed (histórico realizado não pode ser alterado pelo this_and_following a partir da #2)
    db.prepare(`UPDATE appointments SET status = 'completed' WHERE id = ?`).run(rec1.id);
    const cancelScopeRes = await makeRequest('PUT', `/api/v1/appointments/${rec2.id}/status`, { Authorization: `Bearer ${adminTokenA}` }, {
      status: 'cancelled',
      scope: 'this_and_following'
    });
    assert(cancelScopeRes.status === 200, 'Cancelamento com escopo this_and_following retorna 200');
    const rec1Row = db.prepare('SELECT status FROM appointments WHERE id = ?').get(rec1.id);
    const rec2Row = db.prepare('SELECT status FROM appointments WHERE id = ?').get(rec2.id);
    const rec3Row = db.prepare('SELECT status FROM appointments WHERE id = ?').get(rec3.id);
    assert(rec1Row.status === 'completed' && rec2Row.status === 'cancelled' && rec3Row.status === 'cancelled', 'Cancelamento this_and_following preserva atendimento passado completed e cancela os seguintes');

    // ====================================================
    // 7. PERMISSÃO OPCIONAL view_all_schedules
    // ====================================================
    console.log('\n▶ 5. Testando Permissão view_all_schedules...');
    const resAgendaDeny = await makeRequest('GET', `/api/v1/appointments/${apptStudent1GroupId}`, { Authorization: `Bearer ${physioToken}` });
    assert(resAgendaDeny.status === 403, 'Sem view_all_schedules, profissional NÃO vê atendimento de colega (403)');

    // Concede view_all_schedules ao Fisioterapeuta
    db.prepare(`UPDATE clinic_users SET permissions_json = ? WHERE tenant_id = ? AND user_id = ?`).run(
      JSON.stringify(['view_schedule', 'create_appointment', 'edit_appointment', 'view_all_schedules']),
      tenantA,
      physioUserId
    );
    const resAgendaAllow = await makeRequest('GET', `/api/v1/appointments/${apptStudent1GroupId}`, { Authorization: `Bearer ${physioToken}` });
    assert(
      resAgendaAllow.status === 200 &&
      resAgendaAllow.data?.appointment?.is_colleague_schedule === true &&
      resAgendaAllow.data?.appointment?.internal_notes === null,
      'Com view_all_schedules, colega vê em modo somente leitura e observações privadas vêm mascaradas'
    );
    const resEditColleague = await makeRequest('PUT', `/api/v1/appointments/${apptStudent1GroupId}`, { Authorization: `Bearer ${physioToken}` }, { internalNotes: 'hack' });
    assert(resEditColleague.status === 403, 'Mesmo com view_all_schedules, profissional não pode editar atendimento do colega (403)');

    // ====================================================
    // 6b. ABA FREQUÊNCIA & RELATÓRIOS NO ZEMDAPERSONAL
    // ====================================================
    console.log('\n▶ 6. Testando Chamada/Frequência e 7 Relatórios do ZemdaPersonal...');
    const rosterBefore = await makeRequest('GET', `/api/v1/classes/occurrences/${groupOccurrenceId}/roster`, { Authorization: `Bearer ${instToken}` });
    assert(
      rosterBefore.status === 200 &&
      rosterBefore.data?.roster?.length === 2 &&
      rosterBefore.data.roster.every(r => r.attendance_status === 'pending'),
      'Inscrição na turma NÃO marca aluno automaticamente como presente (inicia pending)'
    );

    const markAtt1Res = await makeRequest('PUT', `/api/v1/classes/occurrences/${groupOccurrenceId}/attendance/${apptStudent1GroupId}`, { Authorization: `Bearer ${instToken}` }, {
      attendanceStatus: 'present'
    });
    const markAtt2Res = await makeRequest('PUT', `/api/v1/classes/occurrences/${groupOccurrenceId}/attendance/${apptStudent2GroupId}`, { Authorization: `Bearer ${instToken}` }, {
      attendanceStatus: 'absent',
      notes: 'Atestado médico'
    });
    assert(markAtt1Res.status === 200 && markAtt2Res.status === 200, 'Registro explícito de frequência (present / absent) salvo com sucesso');

    const reportsRes = await makeRequest('GET', `/api/v1/personal/attendance-reports?startDate=2026-11-01&endDate=2026-11-30`, { Authorization: `Bearer ${instToken}` });
    assert(
      reportsRes.status === 200 &&
      reportsRes.data?.kpis?.presentCount === 1 &&
      reportsRes.data?.kpis?.absentCount === 1 &&
      Array.isArray(reportsRes.data?.studentRanking) &&
      Array.isArray(reportsRes.data?.topModalities) &&
      Array.isArray(reportsRes.data?.byStudent) &&
      Array.isArray(reportsRes.data?.byInstructor) &&
      Array.isArray(reportsRes.data?.classOccupancy) &&
      Array.isArray(reportsRes.data?.peakTimes) &&
      Array.isArray(reportsRes.data?.lowAttendanceAlerts),
      'KPIs e todos os 7 relatórios de frequência & ocupação retornados corretamente'
    );

    // ====================================================
    // 3. COMISSÕES POR SERVIÇO, SALÁRIO FIXO E FOLHA CONGELADA
    // ====================================================
    console.log('\n▶ 7. Testando Comissões por Serviço e Congelamento da Folha...');
    const commRuleRes = await makeRequest('PUT', `/api/v1/professionals/${instProfId}/service-commissions`, { Authorization: `Bearer ${adminTokenA}` }, {
      rules: [
        { serviceId: groupServiceId, active: true, commissionType: 'percentage', commissionValue: 60, groupPayoutBasis: 'per_present_student' },
        { serviceId: svcFixedRuleId, active: true, commissionType: 'fixed', commissionValue: 35, groupPayoutBasis: 'per_present_student' }
      ]
    });
    assert(commRuleRes.status === 200, 'Regras de comissão por serviço (% para turma e R$ fixo para individual) salvas');

    // Concluir + pagar b1 (turma aluno presente -> R$ 60); pagar b2 MAS b2 teve falta ('absent' -> R$ 0 na regra per_present_student!)
    db.prepare(`UPDATE appointments SET status = 'completed' WHERE id = ?`).run(apptStudent1GroupId);
    db.prepare(`INSERT INTO payments (id, tenant_id, appointment_id, patient_id, amount, payment_method, status, payment_date, created_at) VALUES (?, ?, ?, ?, 100, 'pix', 'paid', '2026-11-16T15:00:00', datetime('now'))`)
      .run('pay-g1-' + uuidv4().slice(0, 6), tenantA, apptStudent1GroupId, student1Id);
    db.prepare(`INSERT INTO payments (id, tenant_id, appointment_id, patient_id, amount, payment_method, status, payment_date, created_at) VALUES (?, ?, ?, ?, 100, 'pix', 'paid', '2026-11-16T15:00:00', datetime('now'))`)
      .run('pay-g2-' + uuidv4().slice(0, 6), tenantA, apptStudent2GroupId, student2Id);

    const slotsWed = await makeRequest('GET', `/api/v1/slots/available?professionalId=${instProfId}&serviceId=${svcFixedRuleId}&date=2026-11-18`, { Authorization: `Bearer ${adminTokenA}` });
    const slotB = (slotsWed.data?.slots || [])[0];
    // Atendimento individual serviço B (regra R$ 35 fixo) concluído e pago (R$ 120)
    const apptB = await makeRequest('POST', '/api/v1/appointments', { Authorization: `Bearer ${adminTokenA}` }, {
      patientId: student1Id, professionalId: instProfId, serviceId: svcFixedRuleId,
      startTime: slotB?.startTime || '2026-11-18T10:00:00', endTime: slotB?.endTime || '2026-11-18T11:00:00'
    });
    if (apptB.status !== 201) console.log('    [DEBUG apptB fail]', apptB.status, apptB.data);
    db.prepare(`UPDATE appointments SET status = 'completed' WHERE id = ?`).run(apptB.data.id);
    db.prepare(`UPDATE payments SET status = 'paid', amount = 120, payment_date = '2026-11-18T11:00:00' WHERE appointment_id = ? AND tenant_id = ?`)
      .run(apptB.data.id, tenantA);

    const slotsThu = await makeRequest('GET', `/api/v1/slots/available?professionalId=${instProfId}&serviceId=${svcGeneralFallbackId}&date=2026-11-19`, { Authorization: `Bearer ${adminTokenA}` });
    const slotC = (slotsThu.data?.slots || [])[0];
    // Atendimento individual serviço C (sem regra -> fallback 50% geral sobre R$ 100 = R$ 50)
    const apptC = await makeRequest('POST', '/api/v1/appointments', { Authorization: `Bearer ${adminTokenA}` }, {
      patientId: student2Id, professionalId: instProfId, serviceId: svcGeneralFallbackId,
      startTime: slotC?.startTime || '2026-11-19T10:00:00', endTime: slotC?.endTime || '2026-11-19T11:00:00'
    });
    if (apptC.status !== 201) console.log('    [DEBUG apptC fail]', apptC.status, apptC.data);
    db.prepare(`UPDATE appointments SET status = 'completed' WHERE id = ?`).run(apptC.data.id);
    db.prepare(`UPDATE payments SET status = 'paid', amount = 100, payment_date = '2026-11-19T11:00:00' WHERE appointment_id = ? AND tenant_id = ?`)
      .run(apptC.data.id, tenantA);

    const slotsFri = await makeRequest('GET', `/api/v1/slots/available?professionalId=${instProfId}&serviceId=${svcGeneralFallbackId}&date=2026-11-20`, { Authorization: `Bearer ${adminTokenA}` });
    const slotUnpaid = (slotsFri.data?.slots || [])[0];
    // Atendimento apenas 'confirmed' SEM pagamento (NÃO pode gerar comissão!)
    const apptConfirmedUnpaid = await makeRequest('POST', '/api/v1/appointments', { Authorization: `Bearer ${adminTokenA}` }, {
      patientId: student3Id, professionalId: instProfId, serviceId: svcGeneralFallbackId,
      startTime: slotUnpaid?.startTime || '2026-11-20T10:00:00', endTime: slotUnpaid?.endTime || '2026-11-20T11:00:00'
    });
    await makeRequest('PUT', `/api/v1/appointments/${apptConfirmedUnpaid.data.id}/status`, { Authorization: `Bearer ${adminTokenA}` }, { status: 'confirmed' });

    const calcRes = await makeRequest('POST', '/api/v1/payroll/calculate', { Authorization: `Bearer ${adminTokenA}` }, {
      periodMonth: '2026-11', professionalId: instProfId
    });
    const instCalc = (calcRes.data?.results || [])[0];
    // Esperado: 50 (rec1 completed em 2026-11) + 60 (b1 turma aluno presente; b2 faltoso excluded) + 35 (apptB fixo) + 50 (apptC fallback) = 195 (+ 1200 fixo = 1395)
    assert(
      calcRes.status === 200 &&
      apptB.status === 201 &&
      apptC.status === 201 &&
      apptConfirmedUnpaid.status === 201 &&
      Array.isArray(instCalc?.commissionBreakdown) &&
      !instCalc.commissionBreakdown.some(item => item.appointmentId === apptConfirmedUnpaid.data.id) &&
      !instCalc.commissionBreakdown.some(item => item.serviceKind === 'group' && item.eligibleStudentsCount !== 1) &&
      Math.abs((instCalc?.commissionAmount || 0) - 195) < 0.01 &&
      Math.abs((instCalc?.fixedSalary || 0) - 1200) < 0.01 &&
      Math.abs((instCalc?.totalPayable || 0) - 1395) < 0.01,
      `Cálculo da folha com breakdown auditável: comissão R$ ${instCalc?.commissionAmount} + fixo R$ ${instCalc?.fixedSalary} = R$ ${instCalc?.totalPayable} (confirmed não pago excluído, faltoso excluído)`
    );

    const savePayrollRes = await makeRequest('POST', '/api/v1/payroll', { Authorization: `Bearer ${adminTokenA}` }, instCalc);
    assert(savePayrollRes.status === 200 && savePayrollRes.data?.id, 'Folha salva com sucesso');
    const payrollId = savePayrollRes.data.id;

    // Marca folha como paga e valida congelamento contra novo save/recálculo destrutivo
    await makeRequest('PATCH', `/api/v1/payroll/${payrollId}/pay`, { Authorization: `Bearer ${adminTokenA}` }, {});
    const frozenPayrollRes = await makeRequest('POST', '/api/v1/payroll', { Authorization: `Bearer ${adminTokenA}` }, instCalc);
    assert(frozenPayrollRes.status === 409, 'Folha já paga fica congelada e rejeita recálculo destrutivo (409 PAYROLL_ALREADY_PAID)');

    // ====================================================
    // 5. CENTRAL DE COBRANÇAS & MENSALIDADES RECORRENTES
    // ====================================================
    console.log('\n▶ 8. Testando Central de Cobranças e Geração Idempotente de Mensalidades...');
    const planCreate = await makeRequest('POST', '/api/v1/financial/recurring-plans', { Authorization: `Bearer ${adminTokenA}` }, {
      patientId: student1Id,
      serviceId: groupServiceId,
      professionalId: instProfId,
      title: 'Mensalidade Pilates 2x',
      amount: 320,
      dueDay: 10,
      paymentMethod: 'pix',
      generateCurrentMonth: false
    });
    assert(planCreate.status === 201, 'Plano de mensalidade recorrente criado');

    const gen1 = await makeRequest('POST', '/api/v1/financial/recurring-plans/generate', { Authorization: `Bearer ${adminTokenA}` }, {
      competenceMonth: '2026-11'
    });
    const gen2 = await makeRequest('POST', '/api/v1/financial/recurring-plans/generate', { Authorization: `Bearer ${adminTokenA}` }, {
      competenceMonth: '2026-11'
    });
    assert(gen1.status === 200 && gen1.data?.generatedCount === 1, 'Primeira geração de 2026-11 cria 1 cobrança mensal');
    assert(gen2.status === 200 && gen2.data?.generatedCount === 0 && gen2.data?.skippedExistingCount === 1, 'Segunda geração na mesma competência é 100% idempotente (0 duplicatas)');

    const colsList = await makeRequest('GET', '/api/v1/financial/collections?status=all', { Authorization: `Bearer ${adminTokenA}` });
    const monthlyCharge = (colsList.data?.collections || []).find(c => c.competence_month === '2026-11');
    assert(Boolean(monthlyCharge), 'Cobrança mensal aparece na Central de Cobranças');

    const markPaidRes = await makeRequest('POST', `/api/v1/financial/collections/${monthlyCharge.id}/mark-paid`, { Authorization: `Bearer ${adminTokenA}` }, {
      paymentMethod: 'pix'
    });
    assert(markPaidRes.status === 200, 'Marcar mensalidade como paga na Central retorna 200');

    // Escopo de RBAC no billing summary para profissional não pode vazar faturamento da clínica inteira
    const profSummaryRes = await makeRequest('GET', '/api/v1/financial/collections/summary', { Authorization: `Bearer ${physioToken}` });
    assert(profSummaryRes.status === 200 && profSummaryRes.data?.scope === 'professional', 'Profissional recebe apenas seu próprio escopo financeiro na Central de Cobranças');

    console.log('\n====================================================');
    console.log(`RESULTADO: ${passedTests} PASSARAM | ${failedTests} FALHARAM`);
    console.log('====================================================\n');

    if (failedTests > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('❌ Erro durante execução dos testes:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    try { db.close(); } catch {}
    try {
      if (fs.existsSync(process.env.DATABASE_PATH)) {
        fs.unlinkSync(process.env.DATABASE_PATH);
      }
    } catch {}
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
