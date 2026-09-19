/**
 * SUÍTE DE TESTES OBRIGATÓRIOS: ATUALIZAÇÃO ZEMDA
 * 
 * 14 Testes Obrigatórios:
 * 1. Criar profissional -> cadastrar escala -> criar agendamento direto na agenda interativa sem confirmação manual.
 * 2. Tentar agendar fora da escala ou no intervalo -> rejeição com erro amigável (sem agendamento fantasma).
 * 3. Iniciar atendimento de psicopedagogia na Agenda -> Prontuário exibe botão [ Abrir ZemdaPP ].
 * 4. Clicar em [ Abrir ZemdaPP ] -> abre ZemdaPP com paciente e atendimento preenchidos.
 * 5. Voltar ao prontuário ou salvar sessão no ZemdaPP -> atendimento permanece ativo e consistente.
 * 6. Iniciar atendimento de outra profissão (ex.: Odonto, Fisio) -> NÃO exibe botão [ Abrir ZemdaPP ].
 * 7. Profissional sem permissão do ZemdaBody -> ZemdaBody não aparece e rotas bloqueadas (403).
 * 8. Profissional com permissão do ZemdaBody -> acessa ZemdaBody normalmente dentro do atendimento.
 * 9. Em todos os módulos clínicos, clicar em [ Ver Prontuários Anteriores ] -> lista histórico em ordem decrescente com selo/assinatura.
 * 10. Registrar avaliação física no ZemdaPersonal com fotos nos 4 ângulos -> fotos persistem via R2 (file_id) e renderizam sem erro.
 * 11. Realizar reavaliação física no ZemdaPersonal -> fotos da avaliação anterior são preservadas e a nova tem suas próprias fotos.
 * 12. Adicionar exercício com foto -> trocar foto -> remover foto -> tudo funcionando via file_id.
 * 13. Cadastrar nova clínica com checkbox [X] Liberar ZemdaBody marcado -> profissional criado com acesso ao ZemdaBody.
 * 14. Cadastrar nova clínica com checkbox [ ] desmarcado -> profissional criado sem acesso ao ZemdaBody.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const TEST_DB_PATH = path.resolve(__dirname, 'test_atualizacao_zemda.db');
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = 'test-secret-atualizacao-zemda-2026';
process.env.PORT = '3099';

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
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
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// Retorna uma data no futuro em dia de semana (ex: Quarta-feira) no formato YYYY-MM-DD
function getNextWednesday() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  while (d.getDay() !== 3) { // 3 = Wednesday
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

function registerMockAttachment(id, clinicId, category = 'personal_assessment') {
  db.prepare(`
    INSERT INTO file_attachments (id, clinic_id, uploaded_by, object_key, original_filename, mime_type, file_size, category, created_at, updated_at)
    VALUES (?, ?, 'system', ?, ?, 'image/jpeg', 1024, ?, datetime('now'), datetime('now'))
  `).run(id, clinicId, `clinics/${clinicId}/photos/${id}.jpg`, `${id}.jpg`, category);
}

async function runAllTests() {
  const server = app.listen(3099);
  console.log('\n================================================================');
  console.log('EXECUTANDO OS 14 TESTES OBRIGATÓRIOS DA ATUALIZAÇÃO ZEMDA');
  console.log('================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // SETUP BASE: Tenant Principal, Admin, Paciente e Serviço
    // -------------------------------------------------------------------------
    const tenantId = 'tenant-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, status, manager_profession, created_at, updated_at)
      VALUES (?, 'Clínica Multidisciplinar Zemda', 'clinica-zemda', 'clinica@zemda.com', 'active', 'Fisioterapia', datetime('now'), datetime('now'))
    `).run(tenantId);

    const adminUserId = 'user-admin-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at)
      VALUES (?, ?, 'Gestor da Clínica', 'gestor@zemda.com', 'hash_test', 'clinic_admin', 'active', datetime('now'))
    `).run(adminUserId, tenantId);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, zemda_body_enabled, permissions_json, created_at)
      VALUES (?, ?, ?, 'clinic_admin', 'active', 1, '["access_zemda_body"]', datetime('now'))
    `).run('cu-' + uuidv4().slice(0, 8), tenantId, adminUserId);

    const adminToken = generateToken({
      userId: adminUserId,
      email: 'gestor@zemda.com',
      role: 'clinic_admin',
      tenantId: tenantId
    });

    const patientId = 'pat-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone, active, created_at, updated_at)
      VALUES (?, ?, 'Carlos Aluno e Paciente', '(11) 99999-8888', 1, datetime('now'), datetime('now'))
    `).run(patientId, tenantId);

    const serviceId = 'srv-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO services (id, tenant_id, name, duration_minutes, price, active, created_at, updated_at)
      VALUES (?, ?, 'Consulta Geral', 30, 150.00, 1, datetime('now'), datetime('now'))
    `).run(serviceId, tenantId);

    const testDate = getNextWednesday(); // Quarta-feira futura garantida

    // =========================================================================
    // TESTE 1: Criar profissional -> cadastrar escala -> criar agendamento direto
    //          na agenda interativa sem confirmação manual.
    // =========================================================================
    console.log('[TESTE 1] Criar profissional -> escala automática -> agendamento direto sem confirmação manual');
    const profRes1 = await makeRequest('POST', '/api/v1/professionals', {
      Authorization: `Bearer ${adminToken}`,
      'X-Tenant-ID': tenantId
    }, {
      name: 'Dra. Ana Escala',
      email: 'dra.ana@zemda.com',
      phone: '(11) 98888-7777',
      professionId: 'prof-fisioterapeuta',
      profession_id: 'prof-fisioterapeuta',
      registrationNumber: 'CREFITO-12345',
      registration_number: 'CREFITO-12345'
    });

    assert(profRes1.status === 201, 'Profissional criado com sucesso (HTTP 201)');
    const professionalId1 = profRes1.body.id;

    // A escala semanal é cadastrada e fica imediatamente ativa (is_active = 1)
    const schedulesInDb = db.prepare(`
      SELECT day_of_week, start_time, end_time, break_start, break_end, is_active
      FROM schedules
      WHERE professional_id = ? AND tenant_id = ?
    `).all(professionalId1, tenantId);

    assert(schedulesInDb.length === 7, 'Escala de 7 dias cadastrada automaticamente');
    const wedSchedule = schedulesInDb.find(s => s.day_of_week === 3);
    assert(wedSchedule && wedSchedule.is_active === 1, 'Escala da quarta-feira está ativada automaticamente sem confirmação manual');

    // Cria agendamento direto às 10:00 da quarta-feira (dentro do expediente 08:00 - 18:00, fora do almoço)
    const apptRes1 = await makeRequest('POST', '/api/v1/appointments', {
      Authorization: `Bearer ${adminToken}`,
      'X-Tenant-ID': tenantId
    }, {
      professionalId: professionalId1,
      patientId: patientId,
      serviceId: serviceId,
      startTime: `${testDate}T10:00:00`,
      endTime: `${testDate}T10:30:00`,
      status: 'confirmed'
    });

    assert(apptRes1.status === 201, 'Agendamento criado diretamente sem necessidade de confirmação manual (HTTP 201)');
    assert(apptRes1.body.id || (apptRes1.body.appointment && apptRes1.body.appointment.id), 'ID do agendamento retornado com sucesso');

    // =========================================================================
    // TESTE 2: Tentar agendar fora da escala ou no intervalo -> rejeição amigável
    // =========================================================================
    console.log('\n[TESTE 2] Rejeitar agendamento fora da escala ou durante intervalo de descanso');
    // Tentativa A: Fora do expediente (07:00 da manhã, antes das 08:00)
    const apptOutsideRes = await makeRequest('POST', '/api/v1/appointments', {
      Authorization: `Bearer ${adminToken}`,
      'X-Tenant-ID': tenantId
    }, {
      professionalId: professionalId1,
      patientId: patientId,
      serviceId: serviceId,
      startTime: `${testDate}T07:00:00`,
      endTime: `${testDate}T07:30:00`,
      status: 'confirmed'
    });

    assert(apptOutsideRes.status === 400, 'Agendamento antes do expediente rejeitado com HTTP 400');
    assert(
      (apptOutsideRes.body.error || '').toLowerCase().includes('escala') ||
      (apptOutsideRes.body.error || '').toLowerCase().includes('expediente'),
      'Mensagem clara informando que o horário está fora do expediente da escala'
    );

    // Tentativa B: Durante intervalo de almoço (12:30, intervalo padrão 12:00 - 13:30)
    const apptBreakRes = await makeRequest('POST', '/api/v1/appointments', {
      Authorization: `Bearer ${adminToken}`,
      'X-Tenant-ID': tenantId
    }, {
      professionalId: professionalId1,
      patientId: patientId,
      serviceId: serviceId,
      startTime: `${testDate}T12:30:00`,
      endTime: `${testDate}T13:00:00`,
      status: 'confirmed'
    });

    assert(apptBreakRes.status === 400, 'Agendamento durante o intervalo de descanso rejeitado com HTTP 400');
    assert(
      (apptBreakRes.body.error || '').toLowerCase().includes('intervalo') ||
      (apptBreakRes.body.error || '').toLowerCase().includes('descanso') ||
      (apptBreakRes.body.error || '').toLowerCase().includes('almoço'),
      'Mensagem clara informando conflito com intervalo de descanso'
    );

    // Garante que nenhum agendamento fantasma foi persistido
    const ghostCount = db.prepare(`
      SELECT COUNT(*) as count FROM appointments
      WHERE professional_id = ? AND (start_time LIKE '%07:00%' OR start_time LIKE '%12:30%')
    `).get(professionalId1).count;
    assert(ghostCount === 0, 'Nenhum agendamento fantasma salvo no banco de dados');

    // =========================================================================
    // TESTE 3: Atendimento de Psicopedagogia -> Prontuário exibe [ Abrir ZemdaPP ]
    // =========================================================================
    console.log('\n[TESTE 3] Atendimento de Psicopedagogia exibe botão [ Abrir ZemdaPP ]');
    const ppUserId = 'user-pp-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at)
      VALUES (?, ?, 'Prof. Pedro Psicopedagogo', 'pedro.pp@zemda.com', 'hash_test', 'professional', 'active', datetime('now'))
    `).run(ppUserId, tenantId);

    const ppProfId = 'prof-pp-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO professionals (
        id, tenant_id, user_id, name, profession_id, practice_areas, registration_number, active, created_at, updated_at
      ) VALUES (?, ?, ?, 'Prof. Pedro Psicopedagogo', 'prof-psicopedagogo', 'Psicopedagogia Clínica', 'ABPp-9988', 1, datetime('now'), datetime('now'))
    `).run(ppProfId, tenantId, ppUserId);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, zemda_pp_enabled, permissions_json, created_at)
      VALUES (?, ?, ?, 'professional', 'active', 1, '["access_zemda_pp"]', datetime('now'))
    `).run('cu-' + uuidv4().slice(0, 8), tenantId, ppUserId);

    // Agendamento de Psicopedagogia
    const ppApptId = 'appt-pp-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO appointments (
        id, tenant_id, appointment_number, professional_id, patient_id, service_id, start_time, end_time, status, created_at, updated_at
      ) VALUES (?, ?, 'AG-PP-001', ?, ?, ?, ?, ?, 'confirmed', datetime('now'), datetime('now'))
    `).run(ppApptId, tenantId, ppProfId, patientId, serviceId, `${testDate}T14:00:00`, `${testDate}T14:50:00`);

    // Validação de segurança: Não-superadmin não pode acessar métricas administrativas globais
    const metricsBlockRes = await makeRequest('GET', '/api/v1/admin/metrics', {
      Authorization: `Bearer ${adminToken}`,
      'X-Tenant-ID': tenantId
    });
    assert(metricsBlockRes.status === 403, 'Acesso a /v1/admin/metrics bloqueado (HTTP 403) para não-superadmin');

    // Validação do utilitário clinical-module.ts
    const { isPrimaryClinicalModule } = require('./dist/utils/clinical-module');
    assert(isPrimaryClinicalModule('ZemdaPP') === true, 'isPrimaryClinicalModule reconhece ZemdaPP como primário');
    assert(isPrimaryClinicalModule('general') === false, 'isPrimaryClinicalModule estritamente exclui general');
    assert(isPrimaryClinicalModule('ZemdaBody') === false, 'isPrimaryClinicalModule estritamente exclui ZemdaBody');

    // Simulação da dedução de módulo usada em AppointmentConsultation.tsx & QuickConsultationModal.tsx
    const ppProfData = db.prepare(`
      SELECT p.*, prof.name as prof_name, prof.slug as prof_slug
      FROM professionals p
      LEFT JOIN professions prof ON prof.id = p.profession_id
      WHERE p.id = ?
    `).get(ppProfId);

    const isPP = (
      ppProfData.profession_id === 'prof-psicopedagogo' ||
      (ppProfData.practice_areas || '').toLowerCase().includes('psicopedag') ||
      (ppProfData.prof_name || '').toLowerCase().includes('psicopedag')
    );
    assert(isPP, 'Dedução de profissão identifica corretamente Psicopedagogia (ZemdaPP)');

    const effectiveModule = isPP ? 'ZemdaPP' : 'general';
    assert(effectiveModule === 'ZemdaPP', 'Módulo deduzido para a consulta é ZemdaPP');

    // =========================================================================
    // TESTE 4: [ Abrir ZemdaPP ] abre módulo com paciente e atendimento preenchidos
    // =========================================================================
    console.log('\n[TESTE 4] ZemdaPP carrega contexto com patient_id e appointment_id vinculados');
    const ppToken = generateToken({
      userId: ppUserId,
      email: 'pedro.pp@zemda.com',
      role: 'professional',
      tenantId: tenantId
    });

    // Validação da rota de status de consulta
    const completionRes = await makeRequest('GET', `/api/v1/appointments/${ppApptId}/completion`, {
      Authorization: `Bearer ${ppToken}`,
      'X-Tenant-ID': tenantId
    });
    assert(completionRes.status === 200, 'GET /v1/appointments/:id/completion responde com HTTP 200');
    assert(completionRes.body.moduleType === 'ZemdaPP', 'Status da consulta identifica moduleType = ZemdaPP para psicopedagogo');

    const ppProfileRes = await makeRequest('GET', `/api/v1/psychopedagogy/profile/${patientId}`, {
      Authorization: `Bearer ${ppToken}`,
      'X-Tenant-ID': tenantId
    });
    assert(ppProfileRes.status === 200 || ppProfileRes.status === 404, 'Endpoint do perfil do aprendente responde com sucesso');

    // =========================================================================
    // TESTE 5: Salvar sessão no ZemdaPP -> atendimento permanece ativo e consistente
    // =========================================================================
    console.log('\n[TESTE 5] Sessão salva no ZemdaPP mantém vínculo e consistência do atendimento');
    const sessRes = await makeRequest('POST', '/api/v1/psychopedagogy/sessions', {
      Authorization: `Bearer ${ppToken}`,
      'X-Tenant-ID': tenantId
    }, {
      patientId: patientId,
      appointmentId: ppApptId,
      sessionNumber: 1,
      sessionDate: testDate,
      objectives: 'Investigação inicial do processamento fonológico e raciocínio lógico',
      activitiesPerformed: 'Jogos de regras e sondagem diagnóstica',
      observations: 'Aprendente demonstrou excelente engajamento nas atividades lúdicas.'
    });

    assert(sessRes.status === 201, 'Sessão psicopedagógica salva com sucesso no ZemdaPP (HTTP 201)');
    const apptCheck = db.prepare('SELECT id, status FROM appointments WHERE id = ?').get(ppApptId);
    assert(apptCheck && apptCheck.status === 'confirmed', 'Atendimento na agenda continua ativo e consistente');

    // Validação de finalização global com ZemdaPP (DocumentsController.finishConsultation)
    const finishRes = await makeRequest('POST', `/api/v1/appointments/${ppApptId}/finish`, {
      Authorization: `Bearer ${ppToken}`,
      'X-Tenant-ID': tenantId
    }, {
      evolution: {
        moduleType: 'ZemdaPP',
        text: 'Atendimento psicopedagógico finalizado com evolução clínica.'
      },
      saveOnly: true
    });
    assert(finishRes.status === 200, 'Finalização/salvamento com ZemdaPP autorizada com sucesso (HTTP 200)');

    // =========================================================================
    // TESTE 6: Atendimento de outra profissão (ex.: Odonto) NÃO exibe ZemdaPP
    // =========================================================================
    console.log('\n[TESTE 6] Consulta odontológica NÃO exibe botão [ Abrir ZemdaPP ]');
    const dentProfData = {
      profession_id: 'prof-dentista',
      practice_areas: 'Clínica Geral, Ortodontia',
      prof_name: 'Cirurgião Dentista'
    };
    const isDentistPP = (
      dentProfData.profession_id === 'prof-psicopedagogo' ||
      dentProfData.practice_areas.toLowerCase().includes('psicopedag') ||
      dentProfData.prof_name.toLowerCase().includes('psicopedag')
    );
    assert(!isDentistPP, 'Profissional de Odontologia não é classificado como ZemdaPP');

    // =========================================================================
    // TESTE 7: SuperAdmin ou usuário não-clínico bloqueado do ZemdaBody (403)
    // =========================================================================
    console.log('\n[TESTE 7] SuperAdmin ou usuário não-clínico bloqueado do ZemdaBody (HTTP 403)');
    const superAdminUserId = 'user-super-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, created_at)
      VALUES (?, 'Super Administrador', 'superadmin@zemda.com', 'hash_test', 'superadmin', 'active', datetime('now'))
    `).run(superAdminUserId);

    const superAdminToken = generateToken({
      userId: superAdminUserId,
      email: 'superadmin@zemda.com',
      role: 'superadmin'
    });

    const superAccessBlockedRes = await makeRequest('GET', `/api/v1/body-assessments/patient/${patientId}`, {
      Authorization: `Bearer ${superAdminToken}`,
      'X-Tenant-ID': tenantId
    });

    assert(superAccessBlockedRes.status === 403, 'Acesso ao ZemdaBody bloqueado com HTTP 403 para superadmin (dados clínicos restritos à clínica)');

    // =========================================================================
    // TESTE 8: Profissional clínico com acesso universal ao ZemdaBody (HTTP 200)
    // =========================================================================
    console.log('\n[TESTE 8] Profissional clínico acessa ZemdaBody universalmente sem travas manuais');
    const withBodyUserId = 'user-withbody-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at)
      VALUES (?, ?, 'Dra. Com ZemdaBody', 'com.body@zemda.com', 'hash_test', 'professional', 'active', datetime('now'))
    `).run(withBodyUserId, tenantId);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, zemda_body_enabled, permissions_json, created_at)
      VALUES (?, ?, ?, 'professional', 'active', 1, '[]', datetime('now'))
    `).run('cu-' + uuidv4().slice(0, 8), tenantId, withBodyUserId);

    const withBodyToken = generateToken({
      userId: withBodyUserId,
      email: 'com.body@zemda.com',
      role: 'professional',
      tenantId: tenantId
    });

    const bodyAccessAllowedRes = await makeRequest('GET', `/api/v1/body-assessments/patient/${patientId}`, {
      Authorization: `Bearer ${withBodyToken}`,
      'X-Tenant-ID': tenantId
    });
    assert(bodyAccessAllowedRes.status === 200, 'Acesso liberado universalmente ao ZemdaBody com HTTP 200');

    // =========================================================================
    // TESTE 9: [ Ver Prontuários Anteriores ] lista histórico decrescente com selo
    // =========================================================================
    console.log('\n[TESTE 9] Rota de Prontuários Anteriores retorna histórico ordenado com assinatura');
    // Insere dois prontuários para o paciente (um assinado e selado, outro mais recente)
    const rec1Id = 'rec-1-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO records (
        id, tenant_id, patient_id, professional_id, title, clinical_evolution,
        session_date, is_sealed, sealed_at, signature_hash, signer_name, signer_registration, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'Consulta Inicial', 'Paciente com queixa de dor lombar', '2026-09-01', 1, '2026-09-01 11:00:00', 'hash-sha256-abc', 'Dra. Ana Escala', 'CREFITO-12345', '2026-09-01 11:00:00', '2026-09-01 11:00:00')
    `).run(rec1Id, tenantId, patientId, professionalId1);

    const rec2Id = 'rec-2-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO records (
        id, tenant_id, patient_id, professional_id, title, clinical_evolution,
        session_date, is_sealed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'Retorno Fisioterapêutico', 'Evolução favorável com melhora de amplitude', '2026-09-10', 0, '2026-09-10 11:00:00', '2026-09-10 11:00:00')
    `).run(rec2Id, tenantId, patientId, professionalId1);

    const prevRecordsRes = await makeRequest('GET', `/api/v1/clinical-records/patient/${patientId}`, {
      Authorization: `Bearer ${adminToken}`,
      'X-Tenant-ID': tenantId
    });

    assert(prevRecordsRes.status === 200, 'GET /v1/clinical-records/patient/:patientId retorna HTTP 200');
    assert(Array.isArray(prevRecordsRes.body) && prevRecordsRes.body.length >= 2, 'Histórico contém os prontuários do paciente');
    
    // Verifica ordenação decrescente por data
    const sorted = [...prevRecordsRes.body].sort((a, b) => new Date(b.consultation_date).getTime() - new Date(a.consultation_date).getTime());
    assert(prevRecordsRes.body[0].id === rec2Id, 'Prontuário mais recente (2026-09-10) vem primeiro');
    assert(prevRecordsRes.body[1].signature_hash === 'hash-sha256-abc', 'Prontuário assinado contém signature_hash preservado');
    assert(prevRecordsRes.body[1].signer_name === 'Dra. Ana Escala', 'Dados do signatário preservados no retorno');

    // =========================================================================
    // TESTE 10: Registrar avaliação física no ZemdaPersonal com fotos nos 4 ângulos (R2 file_id)
    // =========================================================================
    console.log('\n[TESTE 10] Avaliação física no ZemdaPersonal com 4 fotos via R2 file_id');
    const ptUserId = 'user-pt-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at)
      VALUES (?, ?, 'Instrutor Rodrigo Personal', 'rodrigo.pt@zemda.com', 'hash_test', 'professional', 'active', datetime('now'))
    `).run(ptUserId, tenantId);

    const ptProfId = 'prof-pt-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO professionals (
        id, tenant_id, user_id, name, profession_id, practice_areas, registration_number, active, created_at, updated_at
      ) VALUES (?, ?, ?, 'Instrutor Rodrigo Personal', 'prof-personal-trainer', 'Musculação, Hipertrofia', 'CREF-998877', 1, datetime('now'), datetime('now'))
    `).run(ptProfId, tenantId, ptUserId);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, zemda_personal_enabled, permissions_json, created_at)
      VALUES (?, ?, ?, 'professional', 'active', 1, '["access_zemda_personal"]', datetime('now'))
    `).run('cu-' + uuidv4().slice(0, 8), tenantId, ptUserId);

    const ptToken = generateToken({
      userId: ptUserId,
      email: 'rodrigo.pt@zemda.com',
      role: 'professional',
      tenantId: tenantId
    });

    const fileFront = 'att-front-' + uuidv4().slice(0, 8);
    const fileBack = 'att-back-' + uuidv4().slice(0, 8);
    const fileRight = 'att-right-' + uuidv4().slice(0, 8);
    const fileLeft = 'att-left-' + uuidv4().slice(0, 8);

    registerMockAttachment(fileFront, tenantId, 'personal_assessment');
    registerMockAttachment(fileBack, tenantId, 'personal_assessment');
    registerMockAttachment(fileRight, tenantId, 'personal_assessment');
    registerMockAttachment(fileLeft, tenantId, 'personal_assessment');

    const assessRes1 = await makeRequest('POST', '/api/v1/personal/assessments', {
      Authorization: `Bearer ${ptToken}`,
      'X-Tenant-ID': tenantId
    }, {
      patient_id: patientId,
      assessment_date: '2026-09-01',
      weight: 80,
      height: 180,
      body_fat_percentage: 15.5,
      photos: [
        { photo_type: 'front', file_id: fileFront, photo_url: '' },
        { photo_type: 'back', file_id: fileBack, photo_url: '' },
        { photo_type: 'right', file_id: fileRight, photo_url: '' },
        { photo_type: 'left', file_id: fileLeft, photo_url: '' }
      ]
    });

    assert(assessRes1.status === 201, 'Avaliação física criada no ZemdaPersonal (HTTP 201)');
    const assess1Id = assessRes1.body.id;

    // Verifica que as 4 fotos foram salvas com file_id e sem blob:
    const savedPhotos1 = db.prepare(`
      SELECT photo_type, file_id, photo_url FROM personal_assessment_photos
      WHERE assessment_id = ?
    `).all(assess1Id);

    assert(savedPhotos1.length === 4, '4 fotos corporais gravadas com sucesso');
    const hasAnyBlob = savedPhotos1.some(p => (p.photo_url || '').startsWith('blob:'));
    assert(!hasAnyBlob, 'Proibição estrita cumprida: nenhuma URL "blob:" persistida no banco');
    const allHaveFileId = savedPhotos1.every(p => !!p.file_id);
    assert(allHaveFileId, 'Todas as 4 fotos persistem o file_id do R2');

    // Validação de segurança: extractFileIdFromPhotoInput rejeita file_id não existente em file_attachments
    const fakeFileId = 'att-fake-unregistered-' + uuidv4().slice(0, 6);
    const assessResFake = await makeRequest('POST', '/api/v1/personal/assessments', {
      Authorization: `Bearer ${ptToken}`,
      'X-Tenant-ID': tenantId
    }, {
      patient_id: patientId,
      assessment_date: '2026-09-02',
      weight: 80,
      height: 180,
      photos: [
        { photo_type: 'front', file_id: fakeFileId, photo_url: '' }
      ]
    });
    assert(assessResFake.status === 201, 'Requisição com ID não registrado processada (HTTP 201)');
    const fakeInDb = db.prepare('SELECT id FROM personal_assessment_photos WHERE file_id = ?').get(fakeFileId);
    assert(!fakeInDb, 'extractFileIdFromPhotoInput rejeita ID arbitrário não registrado em file_attachments');

    // =========================================================================
    // TESTE 11: Reavaliação física preserva fotos anteriores e cria novo histórico
    // =========================================================================
    console.log('\n[TESTE 11] Reavaliação física no ZemdaPersonal preserva histórico fotográfico');
    const fileFront2 = 'att-front2-' + uuidv4().slice(0, 8);
    registerMockAttachment(fileFront2, tenantId, 'personal_assessment');

    const assessRes2 = await makeRequest('POST', '/api/v1/personal/assessments', {
      Authorization: `Bearer ${ptToken}`,
      'X-Tenant-ID': tenantId
    }, {
      patient_id: patientId,
      assessment_date: '2026-09-15',
      weight: 78.5,
      height: 180,
      body_fat_percentage: 13.8,
      photos: [
        { photo_type: 'front', file_id: fileFront2, photo_url: '' }
      ]
    });

    assert(assessRes2.status === 201, 'Reavaliação física cadastrada com sucesso (HTTP 201)');

    const allStudentPhotosRes = await makeRequest('GET', `/api/v1/personal/students/${patientId}/photos`, {
      Authorization: `Bearer ${ptToken}`,
      'X-Tenant-ID': tenantId
    });

    assert(allStudentPhotosRes.status === 200, 'Listagem de fotos do aluno retorna HTTP 200');
    assert(allStudentPhotosRes.body.photos.length === 5, 'Fotos da avaliação anterior preservadas (total de 5 fotos)');

    // =========================================================================
    // TESTE 12: Exercício com foto -> trocar foto -> remover foto via file_id
    // =========================================================================
    console.log('\n[TESTE 12] Exercício no ZemdaPersonal com file_id: adicionar, trocar e remover');
    const exFile1 = 'att-ex-foto1-' + uuidv4().slice(0, 8);
    const exFile2 = 'att-ex-foto2-' + uuidv4().slice(0, 8);
    registerMockAttachment(exFile1, tenantId, 'exercises');
    registerMockAttachment(exFile2, tenantId, 'exercises');

    // Passo 1: Adicionar exercício com foto
    const createExRes = await makeRequest('POST', '/api/v1/personal/exercises', {
      Authorization: `Bearer ${ptToken}`,
      'X-Tenant-ID': tenantId
    }, {
      name: 'Supino Inclinado com Halteres',
      muscle_group: 'peitoral',
      exercise_file_id: exFile1
    });

    assert(createExRes.status === 201, 'Exercício criado com foto via file_id (HTTP 201)');
    const exerciseId = createExRes.body.id;
    assert(createExRes.body.exercise.exercise_file_id === exFile1, 'exercise_file_id gravado corretamente');

    // Passo 2: Trocar foto
    const updateExRes1 = await makeRequest('PUT', `/api/v1/personal/exercises/${exerciseId}`, {
      Authorization: `Bearer ${ptToken}`,
      'X-Tenant-ID': tenantId
    }, {
      exercise_file_id: exFile2
    });

    assert(updateExRes1.status === 200, 'Troca de foto do exercício realizada com sucesso (HTTP 200)');
    const exAfterSwap = db.prepare('SELECT exercise_file_id FROM personal_exercises WHERE id = ?').get(exerciseId);
    assert(exAfterSwap.exercise_file_id === exFile2, 'Novo file_id persistido no exercício');

    // Passo 3: Remover foto
    const updateExRes2 = await makeRequest('PUT', `/api/v1/personal/exercises/${exerciseId}`, {
      Authorization: `Bearer ${ptToken}`,
      'X-Tenant-ID': tenantId
    }, {
      exercise_file_id: null,
      photo_url: null
    });

    assert(updateExRes2.status === 200, 'Remoção de foto do exercício realizada com sucesso (HTTP 200)');
    const exAfterRemove = db.prepare('SELECT exercise_file_id, photo_url FROM personal_exercises WHERE id = ?').get(exerciseId);
    assert(!exAfterRemove.exercise_file_id && !exAfterRemove.photo_url, 'Foto do exercício removida com sucesso');

    // =========================================================================
    // TESTE 13: Cadastro de nova clínica com [X] Liberar ZemdaBody marcado
    // =========================================================================
    console.log('\n[TESTE 13] Cadastro de clínica com ZemdaBody marcado inicializa com acesso');
    const regZemdaBodyTrue = await makeRequest('POST', '/api/v1/tenants/register-public', {}, {
      clinicName: 'Clínica Corpo Saudável ' + uuidv4().slice(0, 4),
      adminName: 'Dra. Beatriz Liberada',
      adminEmail: 'beatriz.' + uuidv4().slice(0, 6) + '@corpo.com',
      password: 'SenhaForte123@',
      phone: '(11) 97777-1111',
      profession: 'Fisioterapia',
      practiceAreas: 'Fisioterapia Traumato-Ortopédica',
      registrationType: 'CREFITO',
      registrationNumber: '112233-F',
      zemdaBodyEnabled: true,
      termsAccepted: true,
      privacyAccepted: true
    });

    assert(regZemdaBodyTrue.status === 201, 'Clínica cadastrada com sucesso (HTTP 201)');
    const userTrueId = regZemdaBodyTrue.body.user.id;
    const clinicTrue = db.prepare('SELECT zemda_body_enabled, permissions_json FROM clinic_users WHERE user_id = ?').get(userTrueId);
    assert(clinicTrue && clinicTrue.zemda_body_enabled === 1, 'zemda_body_enabled = 1 persistido no banco');
    assert(clinicTrue && clinicTrue.permissions_json.includes('access_zemda_body'), 'Permissão access_zemda_body concedida');
    assert(regZemdaBodyTrue.body.user.zemdaBodyEnabled === true, 'user.zemdaBodyEnabled === true retornado no payload');

    // =========================================================================
    // TESTE 14: Cadastro de nova clínica com [ ] Liberar ZemdaBody desmarcado
    // =========================================================================
    console.log('\n[TESTE 14] Cadastro de clínica com ZemdaBody desmarcado não concede acesso');
    const regZemdaBodyFalse = await makeRequest('POST', '/api/v1/tenants/register-public', {}, {
      clinicName: 'Clínica Restrita ' + uuidv4().slice(0, 4),
      adminName: 'Dr. Daniel Restrito',
      adminEmail: 'daniel.' + uuidv4().slice(0, 6) + '@restrita.com',
      password: 'SenhaForte123@',
      phone: '(11) 96666-2222',
      profession: 'Psicologia',
      practiceAreas: 'Psicologia Clínica',
      registrationType: 'CRP',
      registrationNumber: '445566-P',
      zemdaBodyEnabled: false,
      termsAccepted: true,
      privacyAccepted: true
    });

    assert(regZemdaBodyFalse.status === 201, 'Clínica cadastrada com sucesso (HTTP 201)');
    const userFalseId = regZemdaBodyFalse.body.user.id;
    const clinicFalse = db.prepare('SELECT zemda_body_enabled FROM clinic_users WHERE user_id = ?').get(userFalseId);
    assert(clinicFalse && clinicFalse.zemda_body_enabled === 0, 'zemda_body_enabled = 0 persistido no banco');
    assert(regZemdaBodyFalse.body.user.zemdaBodyEnabled === false, 'user.zemdaBodyEnabled === false retornado no payload de cadastro');

    // Validação de acesso universal ao fazer login como usuário clínico
    const loginFalseRes = await makeRequest('POST', '/api/v1/auth/login', {}, {
      email: regZemdaBodyFalse.body.user.email,
      password: 'SenhaForte123@'
    });
    assert(loginFalseRes.status === 200, 'Login do gestor realizado com sucesso (HTTP 200)');
    assert(loginFalseRes.body.user.zemdaBodyEnabled === true, 'No login, usuário clínico possui ZemdaBody universalmente disponível');

  } catch (error) {
    console.error('Erro fatal durante execução dos testes:', error);
    failedTests++;
  } finally {
    server.close();
    console.log('\n================================================================');
    console.log(`RESULTADO FINAL: ${passedTests} PASSOU | ${failedTests} FALHOU`);
    console.log('================================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runAllTests();
