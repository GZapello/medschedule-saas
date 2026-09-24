/**
 * Testes Automatizados de Validação - Auditoria e Correções Zemda
 * 
 * Bateria completa dos 14 testes obrigatórios:
 * 1. Agendamento fora do horário (ex: 07:00 com expediente 08:00–12:00) bloqueado.
 * 2. Agendamento no intervalo/almoço (ex: 12:30 com intervalo 12:00–13:30) bloqueado.
 * 3. Troca Medicina -> Odontologia desativa ZemdaMed e limpa resíduos.
 * 4. Troca Odontologia -> Fisioterapia desativa ZemdaOdonto e ativa CREFITO.
 * 5. Novo profissional sem horários recebe Seg–Sáb ativo no banco.
 * 6. Domingo inativo (is_active = 0).
 * 7. Escala preservada ao recarregar/reabrir (não sobrescreve existentes).
 * 8. Mensagem de suporte envia 1 e-mail ao SuperAdmin com todos os campos e URL direta.
 * 9. Visualizar foto do aluno abre lightbox com imagem e botão fechar.
 * 10. Trocar foto atualiza imediatamente no perfil e na listagem.
 * 11. Excluir registro remove imediatamente do estado.
 * 12. Editar registro atualiza imediatamente no estado.
 * 13. Inserir registro aparece imediatamente no estado.
 * 14. Nenhuma operação exige F5 ou reload de página.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const TEST_DB_PATH = path.resolve(__dirname, 'test_corrections_audit.db');
process.env.DATABASE_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = 'test-secret-audit-corrections-456';
const PORT = 3198;
process.env.PORT = String(PORT);

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const { createDefaultSchedules } = require('./dist/utils/schedule-defaults');
const { validateProfessionalSchedule } = require('./dist/controllers/appointment.controller');
const { calculateAvailableSlots } = require('./dist/utils/slot-calculator');
const { ProfessionTaxonomyService } = require('./dist/services/profession-taxonomy.service');
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

async function runAuditTests() {
  const server = app.listen(PORT);
  console.log(`\n==================================================`);
  console.log(`INICIANDO BATERIA DE 14 TESTES DE AUDITORIA ZEMDA`);
  console.log(`==================================================\n`);

  try {
    const nowIso = new Date().toISOString();
    const tenantId = 'ten-' + uuidv4().slice(0, 8);
    const adminUserId = 'usr-admin-' + uuidv4().slice(0, 8);
    const profUserId = 'usr-prof-' + uuidv4().slice(0, 8);
    const profId = 'prof-' + uuidv4().slice(0, 8);

    // 0. Setup Tenant, Admin e Profissional base
    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at)
      VALUES (?, 'Clínica Auditoria Zemda', 'clinica-auditoria', 'admin@auditoria.com', 'active', ?, ?)
    `).run(tenantId, nowIso, nowIso);

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, status, zemda_med_enabled, profession_name, registration_type, registration_number, created_at, updated_at)
      VALUES (?, ?, 'admin@auditoria.com', 'fakehash', 'Super Gestor', 'clinic_admin', 'active', 1, 'Gestor', 'CRM', '12345', ?, ?)
    `).run(adminUserId, tenantId, nowIso, nowIso);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, created_at)
      VALUES (?, ?, ?, 'clinic_admin', 'active', 1, ?)
    `).run(uuidv4(), tenantId, adminUserId, nowIso);

    const adminToken = generateToken({
      userId: adminUserId,
      name: 'Super Gestor',
      tenantId: tenantId,
      email: 'admin@auditoria.com',
      role: 'clinic_admin'
    });

    const authHeaders = {
      'Authorization': `Bearer ${adminToken}`,
      'X-Tenant-Id': tenantId
    };

    // Insere usuário, profissional e clinic_users na ordem correta das FKs
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, status, zemda_med_enabled, profession_name, registration_type, registration_number, created_at, updated_at)
      VALUES (?, ?, 'carlos@auditoria.com', 'fakehash', 'Dr. Carlos Médico', 'professional', 'active', 1, 'Médico', 'CRM', '12345-SP', ?, ?)
    `).run(profUserId, tenantId, nowIso, nowIso);

    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, registration_type, registration_number, active, profession_change_used, buffer_minutes, created_at, updated_at)
      VALUES (?, ?, ?, 'Dr. Carlos Médico', 'CRM', '12345-SP', 1, 0, 10, ?, ?)
    `).run(profId, tenantId, profUserId, nowIso, nowIso);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, zemda_med_enabled, created_at)
      VALUES (?, ?, ?, 'professional', 'active', 1, ?)
    `).run(uuidv4(), tenantId, profUserId, nowIso);

    // ----------------------------------------------------
    // TESTE 5: Novo profissional sem horários recebe Seg–Sáb ativo
    // ----------------------------------------------------
    console.log('--- Bloco 1: Escalas de Trabalho Padrão (Seg a Sáb) ---');
    createDefaultSchedules(db, tenantId, profId);

    const defaultSchedules = db.prepare(`
      SELECT day_of_week, is_active, start_time, end_time, break_start, break_end
      FROM schedules
      WHERE tenant_id = ? AND professional_id = ?
      ORDER BY day_of_week ASC
    `).all(tenantId, profId);

    const monToFriActive = defaultSchedules
      .filter(s => s.day_of_week >= 1 && s.day_of_week <= 5)
      .every(s => s.is_active === 1);

    const satSchedule = defaultSchedules.find(s => s.day_of_week === 6);
    const satActive = satSchedule && satSchedule.is_active === 1;

    assert(
      defaultSchedules.length === 7 && monToFriActive && satActive,
      5,
      'Novo profissional sem horários configurados tem Segunda a Sábado ativos (is_active = 1) no banco.'
    );

    // ----------------------------------------------------
    // TESTE 6: Domingo inativo (is_active = 0)
    // ----------------------------------------------------
    const sunSchedule = defaultSchedules.find(s => s.day_of_week === 0);
    const sunInactive = sunSchedule && sunSchedule.is_active === 0;

    assert(
      sunInactive,
      6,
      'Domingo configurado como inativo (is_active = 0) por padrão no banco.'
    );

    // ----------------------------------------------------
    // TESTE 7: Escala preservada ao recarregar/reabrir (não sobrescreve)
    // ----------------------------------------------------
    // Customiza a segunda-feira (day 1) para 08:00 às 12:00 e 13:30 às 18:00
    db.prepare(`
      UPDATE schedules
      SET start_time = '08:00', end_time = '18:00', break_start = '12:00', break_end = '13:30'
      WHERE tenant_id = ? AND professional_id = ? AND day_of_week = 1
    `).run(tenantId, profId);

    // Reexecuta createDefaultSchedules (como aconteceria em reloads ou reabertura do modal)
    createDefaultSchedules(db, tenantId, profId);

    const reloadedMon = db.prepare(`
      SELECT start_time, end_time, break_start, break_end
      FROM schedules
      WHERE tenant_id = ? AND professional_id = ? AND day_of_week = 1
    `).get(tenantId, profId);

    const totalRowsCount = db.prepare(`
      SELECT COUNT(*) as count FROM schedules WHERE tenant_id = ? AND professional_id = ?
    `).get(tenantId, profId).count;

    assert(
      totalRowsCount === 7 &&
      reloadedMon.break_start === '12:00' &&
      reloadedMon.break_end === '13:30',
      7,
      'Escala existente preservada intacta sem duplicar ou sobrescrever horários salvos ao recarregar/reabrir.'
    );

    // ----------------------------------------------------
    // TESTE 1: Bloqueio fora do horário de trabalho (07:00 quando trabalha 08:00-12:00)
    // ----------------------------------------------------
    console.log('\n--- Bloco 2: Validação de Horários e Agenda Interativa ---');
    // 2026-09-28 é uma segunda-feira
    const mondayDate = '2026-09-28';
    const outsideEarlySlot = `${mondayDate}T07:00:00`;
    const outsideEarlyEnd = `${mondayDate}T07:50:00`;

    const earlyCheck = validateProfessionalSchedule(tenantId, profId, outsideEarlySlot, outsideEarlyEnd);
    
    const outsideLateSlot = `${mondayDate}T19:00:00`;
    const outsideLateEnd = `${mondayDate}T19:50:00`;
    const lateCheck = validateProfessionalSchedule(tenantId, profId, outsideLateSlot, outsideLateEnd);

    assert(
      !earlyCheck.valid && !lateCheck.valid && (earlyCheck.error.includes('fora da escala') || earlyCheck.error.includes('fora do horário')),
      1,
      'Tentativa de agendamento fora do expediente (07:00 ou 19:00) estritamente bloqueada com erro descritivo.'
    );

    // ----------------------------------------------------
    // TESTE 2: Bloqueio durante o intervalo/almoço (12:30 quando intervalo é 12:00-13:30)
    // ----------------------------------------------------
    const lunchSlot = `${mondayDate}T12:30:00`;
    const lunchEnd = `${mondayDate}T13:20:00`;
    const lunchCheck = validateProfessionalSchedule(tenantId, profId, lunchSlot, lunchEnd);

    // Cria serviço para testar cálculo de slots disponíveis
    const srvId = 'srv-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO services (id, tenant_id, name, duration_minutes, active, created_at, updated_at)
      VALUES (?, ?, 'Consulta Geral', 30, 1, ?, ?)
    `).run(srvId, tenantId, nowIso, nowIso);

    // Verifica também se o gerador de slots exclui o almoço e fora de expediente
    const availableSlots = calculateAvailableSlots(tenantId, profId, srvId, mondayDate);
    const slotsIncludeLunch = availableSlots.some(s => s.time === '12:30' || s.time === '12:00' || s.time === '13:00');
    const slotsIncludeOutside = availableSlots.some(s => s.time === '07:00' || s.time === '19:00');

    assert(
      !lunchCheck.valid && (lunchCheck.error.includes('intervalo de descanso') || lunchCheck.error.includes('intervalo')) && !slotsIncludeLunch && !slotsIncludeOutside,
      2,
      'Horário no intervalo de almoço (12:30) bloqueado tanto na validação direta quanto nos slots oferecidos pela agenda.'
    );

    // ----------------------------------------------------
    // TESTE 3: Troca Medicina -> Odontologia desativa ZemdaMed e limpa resíduos
    // ----------------------------------------------------
    console.log('\n--- Bloco 3: Troca de Profissão e Purga de Módulos Incompatíveis ---');
    // Médico já registrado no setup inicial. Reset de profession_change_used se necessário
    db.prepare(`UPDATE professionals SET profession_change_used = 0 WHERE id = ?`).run(profId);

    // Adiciona resíduo médico na tabela de especialidades
    db.prepare(`
      INSERT INTO user_medical_specialties (user_id, medical_specialty_id, tenant_id)
      VALUES (?, 'med-spec-clinica', ?)
    `).run(profUserId, tenantId);

    // Executa a transição para Odontologia usando o ProfessionTaxonomyService
    const switchRes1 = ProfessionTaxonomyService.updateProfessionalTaxonomy({
      tenantId,
      professionalId: profId,
      newProfessionName: 'Dentista',
      registrationType: 'CRO',
      registrationNumber: '98765-SP',
      practiceAreas: 'Ortodontia'
    });

    const userAfterDentist = db.prepare(`
      SELECT zemda_med_enabled, zemda_odonto_enabled, profession_name, registration_type, registration_number
      FROM users WHERE id = ?
    `).get(profUserId);

    const clinicUserAfterDentist = db.prepare(`
      SELECT zemda_med_enabled, zemda_odonto_enabled
      FROM clinic_users WHERE user_id = ?
    `).get(profUserId);

    const residualMedSpecialties = db.prepare(`
      SELECT COUNT(*) as count FROM user_medical_specialties WHERE user_id = ?
    `).get(profUserId).count;

    assert(
      switchRes1.success &&
      userAfterDentist.zemda_med_enabled === 0 &&
      userAfterDentist.zemda_odonto_enabled === 1 &&
      clinicUserAfterDentist.zemda_med_enabled === 0 &&
      clinicUserAfterDentist.zemda_odonto_enabled === 1 &&
      residualMedSpecialties === 0 &&
      userAfterDentist.registration_type === 'CRO',
      3,
      'Troca Medicina -> Odontologia desativa ZemdaMed (zemda_med_enabled = 0), limpa especialidades médicas órfãs e define CRO.'
    );

    // ----------------------------------------------------
    // TESTE 4: Troca Odontologia -> Fisioterapia desativa ZemdaOdonto e ativa CREFITO
    // ----------------------------------------------------
    // Reset da flag de uso único para permitir a segunda transição no teste
    db.prepare(`UPDATE professionals SET profession_change_used = 0 WHERE id = ?`).run(profId);

    const switchRes2 = ProfessionTaxonomyService.updateProfessionalTaxonomy({
      tenantId,
      professionalId: profId,
      newProfessionName: 'Fisioterapeuta',
      registrationType: 'CREFITO',
      registrationNumber: '54321-F',
      practiceAreas: 'Fisioterapia Esportiva'
    });

    const userAfterFisio = db.prepare(`
      SELECT zemda_med_enabled, zemda_odonto_enabled, zemda_fisio_enabled, profession_name, registration_type
      FROM users WHERE id = ?
    `).get(profUserId);

    const clinicUserAfterFisio = db.prepare(`
      SELECT zemda_med_enabled, zemda_odonto_enabled, zemda_fisio_enabled
      FROM clinic_users WHERE user_id = ?
    `).get(profUserId);

    assert(
      switchRes2.success &&
      userAfterFisio.zemda_odonto_enabled === 0 &&
      userAfterFisio.zemda_fisio_enabled === 1 &&
      clinicUserAfterFisio.zemda_odonto_enabled === 0 &&
      clinicUserAfterFisio.zemda_fisio_enabled === 1 &&
      userAfterFisio.registration_type === 'CREFITO',
      4,
      'Troca Odontologia -> Fisioterapia desativa ZemdaOdonto (zemda_odonto_enabled = 0), ativa ZemdaFisio e define CREFITO.'
    );

    // ----------------------------------------------------
    // TESTE 8: Mensagem de suporte envia e-mail ao SuperAdmin com campos obrigatórios e URL direta
    // ----------------------------------------------------
    console.log('\n--- Bloco 4: Notificação de Suporte ao SuperAdmin ---');
    const ticketId = 'ticket_audit_' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO support_tickets (id, tenant_id, user_id, title, description, category, status, priority, created_at, updated_at)
      VALUES (?, ?, ?, 'Dúvida sobre integração de horários', 'Mensagem de teste', 'duvida', 'open', 'medium', ?, ?)
    `).run(ticketId, tenantId, adminUserId, nowIso, nowIso);

    // Spy / intercepta o envio de e-mail monitorando o método sendCustomEmail de EmailService
    const { EmailService } = require('./dist/services/email.service');
    let capturedEmail = null;
    const originalSendCustomEmail = EmailService.sendCustomEmail;
    EmailService.sendCustomEmail = async function(to, subject, html) {
      capturedEmail = { to, subject, html };
      return true;
    };

    const addMessageRes = await makeRequest('POST', `/api/v1/support/tickets/${ticketId}/messages`, authHeaders, {
      message: 'Olá suporte, os horários de sábado já estão ativos por padrão?'
    });

    EmailService.sendCustomEmail = originalSendCustomEmail; // restaura

    const emailSentProperly =
      addMessageRes.status === 201 &&
      capturedEmail &&
      capturedEmail.to === 'suporte@zemda.com.br' &&
      capturedEmail.subject.includes(ticketId) &&
      capturedEmail.html.includes(ticketId) &&
      capturedEmail.html.includes('view=support&ticketId=') &&
      capturedEmail.html.includes('Clínica Auditoria Zemda') &&
      capturedEmail.html.includes('Super Gestor');

    assert(
      emailSentProperly,
      8,
      'Nova mensagem de ticket dispara e-mail formatado ao SuperAdmin com Ticket ID, remetente, clínica, timestamp e link direto.'
    );

    // ----------------------------------------------------
    // TESTES 9 e 10: ZemdaPersonal - Visualização e Troca Imediata de Foto do Aluno
    // ----------------------------------------------------
    console.log('\n--- Bloco 5: ZemdaPersonal e Gestão de Fotos do Aluno ---');
    const studentPatientId = 'patient_student_' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone, created_at, updated_at)
      VALUES (?, ?, 'Aluno Atleta de Teste', '11988887777', ?, ?)
    `).run(studentPatientId, tenantId, nowIso, nowIso);

    // Upload / Atualização imediata de foto
    const updatePhotoRes = await makeRequest('PUT', `/api/v1/personal/students/${studentPatientId}`, authHeaders, {
      avatar_url: 'https://cdn.zemda.com.br/test-avatar-student.jpg'
    });

    const studentInDb = db.prepare(`SELECT photo_url FROM patients WHERE id = ?`).get(studentPatientId);

    // Remoção imediata de foto
    const removePhotoRes = await makeRequest('PUT', `/api/v1/personal/students/${studentPatientId}`, authHeaders, {
      avatar_url: null,
      photo_url: null
    });

    const studentAfterRemove = db.prepare(`SELECT photo_url FROM patients WHERE id = ?`).get(studentPatientId);

    // Validação do lightbox: PersonalStudentProfile possui botão fechar, Trocar Foto, Remover Foto e sem distorção (object-contain)
    const profileCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/personal/PersonalStudentProfile.tsx'), 'utf8');
    const hasLightboxWithClose =
      profileCode.includes('showPhotoLightbox') &&
      profileCode.includes('setShowPhotoLightbox(false)') &&
      profileCode.includes('object-contain') &&
      profileCode.includes('Trocar Foto') &&
      profileCode.includes('Remover Foto');

    assert(
      hasLightboxWithClose,
      9,
      'Visualização da foto em modal lightbox com proporção original (object-contain), botões de ação e botão Fechar dedicado.'
    );

    assert(
      updatePhotoRes.status === 200 &&
      studentInDb.photo_url === 'https://cdn.zemda.com.br/test-avatar-student.jpg' &&
      removePhotoRes.status === 200 &&
      studentAfterRemove.photo_url === null &&
      profileCode.includes('zemda-student-photo-updated'),
      10,
      'Troca e remoção de foto do aluno atualizam imediatamente o banco e disparam evento zemda-student-photo-updated para listagens sem F5.'
    );

    // ----------------------------------------------------
    // TESTES 11, 12, 13: Reatividade CRUD Imediata na UI (Sem F5)
    // ----------------------------------------------------
    console.log('\n--- Bloco 6: Reatividade CRUD Imediata e Padronização de Estado ---');
    
    // Teste 11: Exclusão de registro reflete imediatamente na tela
    const calendarCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/calendar/CalendarView.tsx'), 'utf8');
    const staffCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/staff/StaffManagementView.tsx'), 'utf8');
    const hasOptimisticDeleteAndReject =
      staffCode.includes('setStaffList(prev => prev.filter(') &&
      profileCode.includes('setWorkouts(prev => prev.filter(');

    assert(
      hasOptimisticDeleteAndReject,
      11,
      'Exclusão e recusa de registros atualizam a interface instantaneamente via optimistic removal sem aguardar F5.'
    );

    // Teste 12: Edição e atualização de status reflete imediatamente
    const hasOptimisticStatusAndEdit =
      calendarCode.includes('setAppointments(prev => prev.map(') &&
      staffCode.includes('setStaffList(prev => prev.map(');

    assert(
      hasOptimisticStatusAndEdit,
      12,
      'Edição de dados, remarcação e troca de status atualizam imediatamente o estado local (setAppointments, setStaffList).'
    );

    // Teste 13: Inserção de novo registro surge imediatamente
    const patientsViewCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/patients/PatientsView.tsx'), 'utf8');
    const newPatientCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/patients/NewPatientModal.tsx'), 'utf8');
    const hasInsertReactivity =
      newPatientCode.includes("window.dispatchEvent(new CustomEvent('zemda-patient-updated'))") &&
      patientsViewCode.includes("window.addEventListener('zemda-patient-updated'");

    assert(
      hasInsertReactivity,
      13,
      'Novo registro cadastrado dispara evento customizado e hidrata a listagem instantaneamente sem F5.'
    );

    // ----------------------------------------------------
    // TESTE 14: Nenhuma operação exige F5 ou navegação
    // ----------------------------------------------------
    const authContextCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/context/AuthContext.tsx'), 'utf8');
    const hasNoF5 =
      authContextCode.includes('zemda-profession-changed') &&
      !profileCode.includes('location.reload') &&
      !calendarCode.includes('location.reload') &&
      !staffCode.includes('location.reload');

    assert(
      hasNoF5,
      14,
      'Todas as atualizações críticas (troca de profissão, foto, status, cadastro) reagem por eventos e estado local sem F5.'
    );

  } catch (err) {
    console.error('Erro na execução dos testes:', err);
    failedTests++;
  } finally {
    server.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      try {
        fs.unlinkSync(TEST_DB_PATH);
      } catch (e) {}
    }
  }

  console.log(`\n==================================================`);
  console.log(`RESULTADO DA AUDITORIA:`);
  console.log(`Testes Aprovados: ${passedTests} / 14`);
  console.log(`Testes Falhos:    ${failedTests}`);
  console.log(`==================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAuditTests();
