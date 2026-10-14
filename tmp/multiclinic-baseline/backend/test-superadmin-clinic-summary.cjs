/**
 * Test suite for SuperAdmin Clinic Summary & Taxonomy Isolation
 * Validates:
 * 1. Resumo da clínica via endpoint sem trocar tenant da sessão
 * 2. Métricas com base real: 100 pacientes cadastrados, 60 atendidos únicos, 150 consultas concluídas
 * 3. Total ausência de PII no payload do resumo (zero nomes, telefones, emails, CPFs, diagnósticos)
 * 4. Preservação de sessão e estado na abertura/fechamento do resumo
 * 5. Proteção de acesso: Apenas SuperAdmin (403 para clinic_admin, professional, receptionist; 401 para anônimo)
 * 6. Desativação da aba "Tipos de Serviço" e rota ?section=categories no frontend
 * 7. Criação e edição de Profissões Globais continuam operando normalmente
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-summary-test-'));
process.env.DATABASE_PATH = path.join(temp, 'test.db');
process.env.JWT_SECRET = 'test-secret-clinic-summary';

const { db, initializeDatabase } = require('./dist/config/database');
initializeDatabase();

const bcrypt = require('bcryptjs');
const { generateToken } = require('./dist/utils/jwt');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

// Setup Usuários e Perfis
const superAdminUser = {
  id: 'sa-root',
  name: 'Super Admin Governança',
  email: 'superadmin@zemda.cloud',
  role: 'superadmin',
  status: 'active'
};
db.prepare("INSERT INTO users (id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)")
  .run(superAdminUser.id, superAdminUser.name, superAdminUser.email, bcrypt.hashSync('pass123', 4), superAdminUser.role, superAdminUser.status);
const superAdminToken = generateToken({ userId: superAdminUser.id, tenantId: null, role: 'superadmin', email: superAdminUser.email, name: superAdminUser.name });

// Clínica de teste
const clinicId = 'clinic-metrics-alpha';
db.prepare("INSERT INTO tenants (id, slug, name, trade_name, email, status) VALUES (?, ?, ?, ?, ?, ?)")
  .run(clinicId, 'clinic-metrics-alpha', 'Clínica de Teste Métricas Agregadas', 'Clínica Alpha', 'alpha@clinica.com.br', 'active');

// Usuários da clínica (para testar agregação de usuários e RBAC)
const clinicAdmin = { id: 'usr-admin-1', tenant_id: clinicId, name: 'Dra. Gestora', email: 'gestora@alpha.com.br', role: 'clinic_admin', status: 'active' };
const clinicProf1 = { id: 'usr-prof-1', tenant_id: clinicId, name: 'Dr. Profissional 1', email: 'prof1@alpha.com.br', role: 'professional', status: 'active' };
const clinicProf2 = { id: 'usr-prof-2', tenant_id: clinicId, name: 'Dr. Profissional 2', email: 'prof2@alpha.com.br', role: 'professional', status: 'active' };
const clinicRecep = { id: 'usr-recep-1', tenant_id: clinicId, name: 'Recepção Alpha', email: 'recep@alpha.com.br', role: 'receptionist', status: 'active' };
const clinicInactive = { id: 'usr-inact-1', tenant_id: clinicId, name: 'Ex-Colaborador', email: 'inativo@alpha.com.br', role: 'professional', status: 'inactive' };

for (const u of [clinicAdmin, clinicProf1, clinicProf2, clinicRecep, clinicInactive]) {
  db.prepare("INSERT INTO users (id, tenant_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(u.id, u.tenant_id, u.name, u.email, bcrypt.hashSync('pass123', 4), u.role, u.status);
}

const clinicAdminToken = generateToken({ userId: clinicAdmin.id, tenantId: clinicId, role: clinicAdmin.role, email: clinicAdmin.email, name: clinicAdmin.name });
const professionalToken = generateToken({ userId: clinicProf1.id, tenantId: clinicId, role: clinicProf1.role, email: clinicProf1.email, name: clinicProf1.name });
const receptionistToken = generateToken({ userId: clinicRecep.id, tenantId: clinicId, role: clinicRecep.role, email: clinicRecep.email, name: clinicRecep.name });

// Serviços, Salas e Estoque
db.prepare("INSERT INTO services (id, tenant_id, name, duration_minutes, price, active) VALUES ('srv-1', ?, 'Consulta Geral', 30, 200, 1)").run(clinicId);
db.prepare("INSERT INTO services (id, tenant_id, name, duration_minutes, price, active) VALUES ('srv-2', ?, 'Procedimento Avançado', 60, 500, 1)").run(clinicId);
db.prepare("INSERT INTO rooms (id, tenant_id, name) VALUES ('room-1', ?, 'Consultório 1')").run(clinicId);
db.prepare("INSERT INTO rooms (id, tenant_id, name) VALUES ('room-2', ?, 'Consultório 2')").run(clinicId);

// Inserir profissionais na tabela professionals
db.prepare("INSERT INTO professionals (id, tenant_id, user_id, name) VALUES ('pro-1', ?, 'usr-prof-1', 'Dr. Profissional 1')").run(clinicId);
db.prepare("INSERT INTO professionals (id, tenant_id, user_id, name) VALUES ('pro-2', ?, 'usr-prof-2', 'Dr. Profissional 2')").run(clinicId);

// Profissionais com agenda ativa (schedules)
db.prepare("INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES ('sch-1', ?, 'pro-1', 1, '08:00', '18:00', 1)").run(clinicId);
db.prepare("INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active) VALUES ('sch-2', ?, 'pro-2', 2, '08:00', '18:00', 1)").run(clinicId);

// Estoque
db.prepare("INSERT INTO inventory_items (id, tenant_id, name, quantity, min_stock) VALUES ('item-1', ?, 'Gaze Estéril', 5, 20)").run(clinicId); // abaixo do mínimo
db.prepare("INSERT INTO inventory_items (id, tenant_id, name, quantity, min_stock) VALUES ('item-2', ?, 'Soro Fisiológico', 50, 10)").run(clinicId);



// ==============================================================================
// TESTE 2 SETUP: Cadastrar 100 pacientes para a clínica
// ==============================================================================
console.log('--- Configurando 100 pacientes para clinicId:', clinicId);
const patientIds = [];
for (let i = 1; i <= 100; i++) {
  const pId = `pat-${clinicId}-${String(i).padStart(3, '0')}`;
  patientIds.push(pId);
  db.prepare(`
    INSERT INTO patients (id, tenant_id, full_name, email, phone, cpf, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    pId,
    clinicId,
    `Paciente Confidencial Número ${i}`,
    `paciente${i}@privado.com.br`,
    `1199999${String(i).padStart(4, '0')}`,
    `000000000${String(i).padStart(2, '0')}`,
    new Date().toISOString()
  );
}
assert.equal(patientIds.length, 100, 'Devem existir 100 pacientes cadastrados');

// Realizar 150 atendimentos concluídos ('completed') distribuídos entre 60 desses pacientes
// Pacientes nos índices 0 a 59 (60 pacientes únicos) recebem os 150 atendimentos
console.log('--- Inserindo 150 atendimentos concluídos para 60 pacientes únicos...');
let totalCompletedInserted = 0;
for (let a = 1; a <= 150; a++) {
  const targetPatientIndex = (a - 1) % 60; // 0 a 59
  const targetPatientId = patientIds[targetPatientIndex];
  db.prepare(`
    INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, status, start_time, end_time, created_at)
    VALUES (?, ?, ?, ?, ?, 'srv-1', 'completed', ?, ?, ?)
  `).run(
    `apt-comp-${a}`,
    clinicId,
    `AG-2026-${String(a).padStart(4, '0')}`,
    targetPatientId,
    'pro-1',
    new Date(Date.now() - a * 86400000).toISOString(),
    new Date(Date.now() - a * 86400000 + 1800000).toISOString(),
    new Date(Date.now() - a * 86400000).toISOString()
  );
  totalCompletedInserted++;
}
assert.equal(totalCompletedInserted, 150, 'Devem ser 150 atendimentos concluídos');

// Inserir agendamentos em outros estados (scheduled, cancelled, no_show)
db.prepare("INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, status, start_time, end_time) VALUES ('apt-sched-1', ?, 'AG-2026-9001', ?, 'pro-1', 'srv-1', 'scheduled', ?, ?)").run(clinicId, patientIds[65], new Date().toISOString(), new Date().toISOString());
db.prepare("INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, status, start_time, end_time) VALUES ('apt-canc-1', ?, 'AG-2026-9002', ?, 'pro-1', 'srv-1', 'cancelled', ?, ?)").run(clinicId, patientIds[66], new Date().toISOString(), new Date().toISOString());
db.prepare("INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, status, start_time, end_time) VALUES ('apt-noshow-1', ?, 'AG-2026-9003', ?, 'pro-1', 'srv-1', 'no_show', ?, ?)").run(clinicId, patientIds[67], new Date().toISOString(), new Date().toISOString());

// Financeiro (tabela payments)
const todayIso = new Date().toISOString().substring(0, 10);
db.prepare("INSERT INTO payments (id, tenant_id, patient_id, amount, status, payment_date, created_at) VALUES ('pay-1', ?, ?, 1000.00, 'paid', ?, ?)").run(clinicId, patientIds[0], todayIso, new Date().toISOString());
db.prepare("INSERT INTO payments (id, tenant_id, patient_id, amount, status, payment_date, created_at) VALUES ('pay-2', ?, ?, 500.00, 'paid', '2026-01-15', '2026-01-15T12:00:00Z')").run(clinicId, patientIds[1]);
db.prepare("INSERT INTO payments (id, tenant_id, patient_id, amount, status, payment_date, created_at) VALUES ('pay-3', ?, ?, 300.00, 'pending', ?, ?)").run(clinicId, patientIds[2], todayIso, new Date().toISOString());

// Documentos e Anexos (tabela documents)
db.prepare("INSERT INTO documents (id, tenant_id, patient_id, title, file_url) VALUES ('doc-1', ?, ?, 'Prontuário Confidencial', 'https://r2.storage/doc1.pdf')").run(clinicId, patientIds[0]);
db.prepare("INSERT INTO documents (id, tenant_id, patient_id, title, file_url) VALUES ('doc-2', ?, ?, 'Atestado Médico', 'https://r2.storage/doc2.pdf')").run(clinicId, patientIds[1]);

// ==============================================================================
// TESTES COM SERVIDOR HTTP EXPRESS
// ==============================================================================
async function runTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  try {
    // --------------------------------------------------------------------------
    // TESTE 1: Acesso ao endpoint de resumo com SuperAdmin
    // --------------------------------------------------------------------------
    console.log('TESTE 1: Requisição do resumo pelo SuperAdmin (sem trocar de tenant)...');
    const resSummary = await fetch(`${baseUrl}/v1/admin/tenants/${clinicId}/summary`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    assert.equal(resSummary.status, 200, 'SuperAdmin deve receber HTTP 200 no resumo');
    const summary = await resSummary.json();
    console.log('✓ Resumo retornado com sucesso:', JSON.stringify(summary, null, 2));

    // --------------------------------------------------------------------------
    // TESTE 2: Validação exata das métricas com base real
    // - 100 pacientes cadastrados
    // - 60 pacientes atendidos (DISTINCT com completed)
    // - 150 atendimentos realizados
    // --------------------------------------------------------------------------
    console.log('TESTE 2: Validando contagens agregadas exatas...');
    assert.equal(summary.patients.total, 100, 'Deveria ter exatamente 100 pacientes cadastrados');
    assert.equal(summary.patients.attendedUnique, 60, 'Deveria ter exatamente 60 pacientes atendidos únicos');
    assert.equal(summary.appointments.completed, 150, 'Deveria ter exatamente 150 atendimentos concluídos');
    assert.equal(summary.appointments.scheduled, 1, 'Agendados deve ser 1');
    assert.equal(summary.appointments.canceled, 1, 'Cancelados deve ser 1');
    assert.equal(summary.appointments.noShow, 1, 'Faltas deve ser 1');
    assert.equal(summary.appointments.total, 153, 'Total de agendamentos deve ser 153');

    // Usuários
    assert.equal(summary.users.total, 5, 'Total de usuários da clínica deve ser 5');
    assert.equal(summary.users.active, 4, 'Usuários ativos deve ser 4');
    assert.equal(summary.users.inactive, 1, 'Usuários inativos deve ser 1');
    assert.equal(summary.users.professionals, 3, 'Profissionais deve ser 3');
    assert.equal(summary.users.receptionists, 1, 'Recepcionistas deve ser 1');
    assert.equal(summary.users.admins, 1, 'Administradores deve ser 1');

    // Serviços / Operação
    assert.equal(summary.services.total, 2, 'Serviços cadastrados deve ser 2');
    assert.equal(summary.rooms.total, 2, 'Salas cadastradas deve ser 2');
    assert.equal(summary.schedules.activeProfessionals, 2, 'Profissionais com agenda ativa deve ser 2');

    // Estoque
    assert.equal(summary.inventory.totalItems, 2, 'Total de produtos deve ser 2');
    assert.equal(summary.inventory.lowStock, 1, 'Produtos abaixo do estoque mínimo deve ser 1');

    // Documentos
    assert.equal(summary.documents.total, 2, 'Documentos emitidos deve ser 2');

    // Financeiro
    assert.equal(summary.financial.totalRevenue, 1500, 'Receita total processada deve ser 1500');
    assert.equal(summary.financial.currentMonthRevenue, 1000, 'Receita no mês deve ser 1000');
    assert.equal(summary.financial.pendingAmount, 300, 'Valores pendentes deve ser 300');
    console.log('✓ TESTE 2 PASSOU: 100 cadastrados, 60 atendidos únicos, 150 concluídos, estoque e financeiro validados!');

    // --------------------------------------------------------------------------
    // TESTE 3: Verificação rigorosa de AUSÊNCIA TOTAL de PII
    // --------------------------------------------------------------------------
    console.log('TESTE 3: Inspecionando payload para garantia de ZERO PII...');
    const rawPayload = JSON.stringify(summary);

    const forbiddenStrings = [
      'Paciente Confidencial',
      'privado.com.br',
      '1199999',
      '000000000',
      'Dra. Gestora',
      'Dr. Profissional',
      'Ex-Colaborador',
      'Prontuário Confidencial',
      'Conteúdo Sigiloso',
      'gestora@alpha',
      'prof1@alpha'
    ];

    for (const forbidden of forbiddenStrings) {
      assert.ok(!rawPayload.includes(forbidden), `Payload NÃO deve conter dado identificável: "${forbidden}"`);
    }

    // Verificar se todas as propriedades de primeiro nível são objetos de números (exceto clinic que é o cabeçalho)
    for (const [sectionKey, sectionObj] of Object.entries(summary)) {
      if (sectionKey === 'clinic') continue;
      assert.equal(typeof sectionObj, 'object', `Seção ${sectionKey} deve ser um objeto`);
      for (const [metricKey, metricValue] of Object.entries(sectionObj)) {
        assert.equal(typeof metricValue, 'number', `Métrica ${sectionKey}.${metricKey} deve ser estritamente numérica`);
      }
    }
    console.log('✓ TESTE 3 PASSOU: Zero PII no payload. Todos os valores são contagens e somas estritamente numéricas.');

    // --------------------------------------------------------------------------
    // TESTE 4: Preservação de sessão / isolamento SuperAdmin
    // --------------------------------------------------------------------------
    console.log('TESTE 4: Validando que o resumo não altera o tenant do token/sessão...');
    // Chamada subsequente a métricas gerais de admin
    const resMetrics = await fetch(`${baseUrl}/v1/admin/metrics`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    assert.equal(resMetrics.status, 200, 'SuperAdmin continua operando sem tenant vinculado');
    console.log('✓ TESTE 4 PASSOU: Sessão do SuperAdmin totalmente preservada.');

    // --------------------------------------------------------------------------
    // TESTE 5: Proteção RBAC (Apenas SuperAdmin pode acessar o resumo)
    // --------------------------------------------------------------------------
    console.log('TESTE 5: Validando restrições de RBAC no endpoint de resumo...');
    
    // Clinic Admin
    const resClinicAdmin = await fetch(`${baseUrl}/v1/admin/tenants/${clinicId}/summary`, {
      headers: { 'Authorization': `Bearer ${clinicAdminToken}` }
    });
    assert.equal(resClinicAdmin.status, 403, 'clinic_admin deve receber 403 Forbidden');

    // Professional
    const resProfessional = await fetch(`${baseUrl}/v1/admin/tenants/${clinicId}/summary`, {
      headers: { 'Authorization': `Bearer ${professionalToken}` }
    });
    assert.equal(resProfessional.status, 403, 'professional deve receber 403 Forbidden');

    // Receptionist
    const resReceptionist = await fetch(`${baseUrl}/v1/admin/tenants/${clinicId}/summary`, {
      headers: { 'Authorization': `Bearer ${receptionistToken}` }
    });
    assert.equal(resReceptionist.status, 403, 'receptionist deve receber 403 Forbidden');

    // Sem token
    const resAnon = await fetch(`${baseUrl}/v1/admin/tenants/${clinicId}/summary`);
    assert.equal(resAnon.status, 401, 'Requisição anônima deve receber 401 Unauthorized');
    console.log('✓ TESTE 5 PASSOU: RBAC validado com sucesso (403 para não-superadmins, 401 para anônimos).');

    // --------------------------------------------------------------------------
    // TESTE 6: Verificação da remoção da aba "Tipos de Serviço" no frontend
    // --------------------------------------------------------------------------
    console.log('TESTE 6: Inspecionando código fonte do frontend para ausência da aba "Tipos de Serviço"...');
    const superAdminViewCode = fs.readFileSync(path.join(__dirname, '../frontend/src/components/superadmin/SuperAdminView.tsx'), 'utf-8');

    // Não deve conter botão de Tipos de Serviço no menu
    assert.ok(!superAdminViewCode.includes("Tipos de Serviço ("), 'Menu não deve conter botão Tipos de Serviço');
    assert.ok(!superAdminViewCode.includes("Adicionar Tipo de Serviço"), 'Não deve existir botão Adicionar Tipo de Serviço');
    assert.ok(!superAdminViewCode.includes("handleOpenCatModal"), 'Não deve existir handleOpenCatModal');
    assert.ok(!superAdminViewCode.includes("handleSaveCategory"), 'Não deve existir handleSaveCategory');
    assert.ok(!superAdminViewCode.includes("handleToggleCatStatus"), 'Não deve existir handleToggleCatStatus');
    assert.ok(!superAdminViewCode.includes("isCatModalOpen"), 'Não deve existir isCatModalOpen');

    // Redirecionamento da query section=categories
    assert.ok(superAdminViewCode.includes("setMainSection('tenants')"), 'Redirecionamento para tenants implementado');
    console.log('✓ TESTE 6 PASSOU: Aba e recursos de tipos de serviço removidos da interface do SuperAdmin.');

    // --------------------------------------------------------------------------
    // TESTE 7: Criação e edição de Profissões Globais continuam funcionando
    // --------------------------------------------------------------------------
    console.log('TESTE 7: Testando criação e edição de Profissões Globais...');
    
    // Obter categoria padrão do banco
    const cat = db.prepare("SELECT id FROM categories LIMIT 1").get();
    assert.ok(cat, 'Deve existir pelo menos uma categoria macro no banco');

    // Criar profissão global via API
    const resCreateProf = await fetch(`${baseUrl}/v1/taxonomy/professions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        name: 'Quiropraxia Avançada',
        categoryId: cat.id,
        registrationBoardLabel: 'ABQ',
        registrationRequired: true
      })
    });
    assert.equal(resCreateProf.status, 201, 'SuperAdmin deve poder criar nova profissão global');
    const createdProf = await resCreateProf.json();
    assert.equal(createdProf.name, 'Quiropraxia Avançada');

    // Toggle status da profissão
    const resToggleProf = await fetch(`${baseUrl}/v1/taxonomy/professions/${createdProf.id}/toggle-status`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    assert.equal(resToggleProf.status, 200, 'SuperAdmin deve poder alternar status da profissão');

    console.log('✓ TESTE 7 PASSOU: Criação e edição de Profissões Globais 100% operacionais.');

    console.log('\n=======================================================');
    console.log('TODOS OS 7 TESTES PASSARAM COM SUCESSO ABSOLUTO!');
    console.log('=======================================================');

  } finally {
    server.close();
    try {
      fs.rmSync(temp, { recursive: true, force: true });
    } catch {}
  }
}

runTests().catch(err => {
  console.error('FALHA NOS TESTES:', err);
  process.exit(1);
});
