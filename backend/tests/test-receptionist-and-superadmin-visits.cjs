const assert = require('assert');
const { db } = require('../dist/config/database');
const { AdminVisitsController } = require('../dist/controllers/admin-visits.controller');
const { InventoryController } = require('../dist/controllers/inventory.controller');
const { GoogleCalendarService } = require('../dist/services/google-calendar.service');
const { v4: uuidv4 } = require('uuid');

console.log('\n=== TESTE DE VALIDAÇÃO: RECEPCIONISTA & SUPERADMIN REGISTRO DE VISITAS ===\n');

function mockRes() {
  const res = {
    statusCode: 200,
    data: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(name, val) {
      this.headers[name.toLowerCase()] = val;
      return this;
    },
    send(content) {
      this.data = content;
      return this;
    }
  };
  return res;
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function runTest(name, fn) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Erro: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  async function runTestAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Erro: ${err.message}`);
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  // --- SEÇÃO 1: RECEPCIONISTA & ESTOQUE ---
  console.log('\n--- 1. Validação de Acesso do Recepcionista ao Estoque ---');
  
  const testTenantId = 'tenant-test-' + Date.now();
  const receptionistUserId = 'user-rec-' + Date.now();
  const professionalUserId = 'user-prof-' + Date.now();
  const superAdminUserId = 'user-super-' + Date.now();

  db.prepare("INSERT INTO tenants (id, name, slug, email, status, created_at) VALUES (?, 'Clínica Multi Teste', ?, 'clinica-multi@teste.com', 'active', datetime('now'))")
    .run(testTenantId, 'slug-' + testTenantId);

  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at)
    VALUES (?, ?, 'Recepcionista Maria', ?, 'hash', 'receptionist', 'active', datetime('now'))
  `).run(receptionistUserId, testTenantId, 'rec-' + receptionistUserId + '@teste.com');

  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at)
    VALUES (?, ?, 'Dr. Carlos Médico', ?, 'hash', 'professional', 'active', datetime('now'))
  `).run(professionalUserId, testTenantId, 'prof-' + professionalUserId + '@teste.com');

  db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at)
    VALUES (?, NULL, 'Super Administrador', ?, 'hash', 'superadmin', 'active', datetime('now'))
  `).run(superAdminUserId, 'super-' + superAdminUserId + '@teste.com');

  let testItemId = null;

  runTest('Recepcionista pode criar item de estoque', () => {
    const req = {
      tenantId: testTenantId,
      user: { id: receptionistUserId, role: 'receptionist', tenant_id: testTenantId },
      body: {
        name: 'Luvas descartáveis M',
        category: 'Descartáveis',
        unit: 'cx',
        minStock: 5,
        quantity: 20
      }
    };
    const res = mockRes();
    InventoryController.createItem(req, res);
    assert.strictEqual(res.statusCode, 201, `Status esperado 201, recebido ${res.statusCode}`);
    assert.ok(res.data && res.data.id, 'Item deve possuir ID');
    testItemId = res.data.id;
  });

  runTest('Recepcionista pode listar itens de estoque', () => {
    const req = {
      tenantId: testTenantId,
      user: { id: receptionistUserId, role: 'receptionist', tenant_id: testTenantId },
      query: {}
    };
    const res = mockRes();
    InventoryController.list(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data && Array.isArray(res.data.items), 'Resposta deve conter items array');
    const item = res.data.items.find(i => i.id === testItemId);
    assert.ok(item, 'Item criado deve constar na listagem');
    assert.strictEqual(item.name, 'Luvas descartáveis M');
  });

  runTest('Recepcionista pode registrar movimentação (saída de estoque)', () => {
    const req = {
      tenantId: testTenantId,
      user: { id: receptionistUserId, role: 'receptionist', tenant_id: testTenantId },
      body: {
        itemId: testItemId,
        movementType: 'out',
        quantity: 3,
        reason: 'Uso no consultório 1'
      }
    };
    const res = mockRes();
    InventoryController.recordMovement(req, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.data.newQuantity, 17, `Estoque esperado 17, obtido ${res.data.newQuantity}`);
  });

  // --- SEÇÃO 2: GOOGLE CALENDAR ISOLATION ---
  console.log('\n--- 2. Validação do Isolamento de Sincronização Google Calendar ---');

  await runTestAsync('Profissional sem integração conectada retorna null (não sincroniza na conta de outro)', async () => {
    const conn = await GoogleCalendarService.getConnectionForProfessional(testTenantId, professionalUserId);
    assert.strictEqual(conn, null, 'Profissional sem conta Google conectada deve retornar null');
  });

  await runTestAsync('Conexão Google pertence exclusivamente ao seu proprietário', async () => {
    // Registra conexão Google para o profissional 1
    const connId = 'gconn-' + Date.now();
    db.prepare(`
      INSERT INTO google_calendar_connections (
        id, tenant_id, user_id, professional_id, google_account_email, encrypted_refresh_token,
        calendar_id, sync_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'prof-google@gmail.com', 'refresh-token-encrypted', 'primary', 1, datetime('now'), datetime('now'))
    `).run(connId, testTenantId, professionalUserId, professionalUserId);

    // Consulta para o profissional que possui a conexão
    const foundConn = await GoogleCalendarService.getConnectionForProfessional(testTenantId, professionalUserId);
    assert.ok(foundConn, 'Deveria encontrar a conexão para o profissional configurado');
    assert.strictEqual(foundConn.user_id, professionalUserId);

    // Outro profissional na mesma clínica NÃO pode receber a conexão do primeiro
    const otherProfId = 'user-prof-2-' + Date.now();
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at)
      VALUES (?, ?, 'Dra. Ana Médica', ?, 'hash', 'professional', 'active', datetime('now'))
    `).run(otherProfId, testTenantId, 'prof2-' + otherProfId + '@teste.com');

    const otherConn = await GoogleCalendarService.getConnectionForProfessional(testTenantId, otherProfId);
    assert.strictEqual(otherConn, null, 'Outro profissional NÃO deve receber conexão alheia');
  });

  // --- SEÇÃO 3: SUPERADMIN CRM - REGISTRO DE VISITAS ---
  console.log('\n--- 3. Validação do Módulo CRM SuperAdmin (Registro de Visitas) ---');

  let testEstablishmentId = null;
  let testVisitId = null;
  let testTaskId = null;

  runTest('Criação de Estabelecimento Comercial pelo SuperAdmin', () => {
    const req = {
      user: { id: superAdminUserId, role: 'superadmin', name: 'SuperAdmin Master' },
      body: {
        name: 'Hospital e Maternidade São Lucas',
        tradeName: 'Hospital São Lucas',
        areasOfActivity: ['Medicina Geral', 'Obstetrícia', 'Pediatria'],
        establishmentType: 'Hospital',
        city: 'Campinas',
        state: 'SP',
        address: 'Av. Barão de Itapura, 1500',
        primaryContactName: 'Dra. Regina Vasconcellos',
        primaryContactRole: 'Diretora Clínica',
        primaryContactPhone: '(19) 98877-6655',
        primaryContactEmail: 'regina@saolucascampinas.med.br',
        currentStatus: 'first_contact'
      }
    };
    const res = mockRes();
    AdminVisitsController.createEstablishment(req, res);
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.data && res.data.establishment, 'Deve conter o objeto establishment');
    assert.strictEqual(res.data.establishment.name, 'Hospital e Maternidade São Lucas');
    assert.strictEqual(res.data.establishment.current_status, 'first_contact');
    testEstablishmentId = res.data.establishment.id;
  });

  runTest('Listagem e busca com filtros no SuperAdmin', () => {
    const req = {
      user: { id: superAdminUserId, role: 'superadmin' },
      query: { search: 'São Lucas' }
    };
    const res = mockRes();
    AdminVisitsController.listEstablishments(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data && Array.isArray(res.data.items), 'Deveria conter array de items');
    const found = res.data.items.find(e => e.id === testEstablishmentId);
    assert.ok(found, 'Estabelecimento deve constar na listagem');
  });

  runTest('Adição de registro de visita com desfecho e próximos passos', () => {
    const req = {
      user: { id: superAdminUserId, role: 'superadmin', name: 'SuperAdmin Master' },
      params: { id: testEstablishmentId },
      body: {
        visitDate: '2026-10-30',
        visitTime: '14:00',
        modality: 'presential',
        responsibleName: 'Dra. Regina Vasconcellos',
        objective: 'Apresentação Comercial e Demonstração do Prontuário Eletrônico',
        featuresPresented: ['ZemdaMed', 'Prontuário Eletrônico', 'Faturamento TISS'],
        needsIdentified: 'Necessidade de prontuário integrado com agendamento online',
        notes: 'Reunião durou 1h30 com participação do TI e faturamento.',
        result: 'Diretoria clínica gostou muito da facilidade e solicitou proposta formal',
        statusAfterVisit: 'visited',
        nextAction: 'Enviar proposta comercial até segunda-feira e agendar reunião técnica.',
        nextReturnDate: '2026-11-05'
      }
    };
    const res = mockRes();
    AdminVisitsController.addVisit(req, res);
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.data && res.data.visit);
    assert.strictEqual(res.data.visit.establishment_id, testEstablishmentId);
    testVisitId = res.data.visit.id;

    // Verifica se atualizou o status do estabelecimento para 'visited'
    const est = db.prepare('SELECT current_status, last_visit_date, next_return_date FROM superadmin_visit_establishments WHERE id = ?').get(testEstablishmentId);
    assert.strictEqual(est.current_status, 'visited', 'Status deve avançar para visited');
    assert.ok(est.last_visit_date, 'Deve registrar data da última visita');
    assert.strictEqual(est.next_return_date, '2026-11-05');
  });

  runTest('Criação de tarefa de follow-up vinculada ao estabelecimento', () => {
    const req = {
      user: { id: superAdminUserId, role: 'superadmin', name: 'SuperAdmin Master' },
      body: {
        establishmentId: testEstablishmentId,
        visitId: testVisitId,
        taskType: 'proposal',
        description: 'Elaborar e enviar proposta comercial personalizada com 25 licenças',
        dueDate: '2026-11-02',
        assignedTo: 'SuperAdmin Master'
      }
    };
    const res = mockRes();
    AdminVisitsController.createTask(req, res);
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.data && res.data.task);
    assert.strictEqual(res.data.task.status, 'pending');
    testTaskId = res.data.task.id;
  });

  runTest('Alternância de status da tarefa (conclusão/reabertura)', () => {
    const req = {
      user: { id: superAdminUserId, role: 'superadmin' },
      params: { id: testTaskId }
    };
    const res = mockRes();
    AdminVisitsController.toggleTask(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.status, 'completed');

    // Reabertura
    const res2 = mockRes();
    AdminVisitsController.toggleTask(req, res2);
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.data.status, 'pending');
  });

  runTest('Atualização de estágio no funil comercial (status)', () => {
    const req = {
      user: { id: superAdminUserId, role: 'superadmin' },
      params: { id: testEstablishmentId },
      body: { status: 'in_negotiation' }
    };
    const res = mockRes();
    AdminVisitsController.updateStatus(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);

    const est = db.prepare('SELECT current_status FROM superadmin_visit_establishments WHERE id = ?').get(testEstablishmentId);
    assert.strictEqual(est.current_status, 'in_negotiation');
  });

  runTest('Vínculo com tenant de clínica no Zemda', () => {
    const req = {
      user: { id: superAdminUserId, role: 'superadmin' },
      params: { id: testEstablishmentId },
      body: { tenantId: testTenantId }
    };
    const res = mockRes();
    AdminVisitsController.linkTenant(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);

    const est = db.prepare('SELECT tenant_id FROM superadmin_visit_establishments WHERE id = ?').get(testEstablishmentId);
    assert.strictEqual(est.tenant_id, testTenantId, 'Estabelecimento deve estar associado ao tenant da clínica');
  });

  runTest('Cálculo dos KPIs no Dashboard Executivo de Visitas', () => {
    const req = {
      user: { id: superAdminUserId, role: 'superadmin' },
      query: {}
    };
    const res = mockRes();
    AdminVisitsController.getMetrics(req, res);
    assert.strictEqual(res.statusCode, 200);
    const m = res.data;
    assert.ok(typeof m.totalEstablishments === 'number' && m.totalEstablishments >= 1, 'totalEstablishments');
    assert.ok(typeof m.monthVisits === 'number', 'monthVisits');
    assert.ok(typeof m.inNegotiation === 'number', 'inNegotiation');
    assert.ok(typeof m.pendingReturns === 'number', 'pendingReturns');
    assert.ok(m.statusDistribution && typeof m.statusDistribution === 'object', 'statusDistribution');
    assert.ok(Array.isArray(m.monthlyEvolution), 'monthlyEvolution');
  });

  runTest('Geração de relatórios analíticos de visitas e pipeline', () => {
    const req = {
      user: { id: superAdminUserId, role: 'superadmin' },
      query: { period: 'all' }
    };
    const res = mockRes();
    AdminVisitsController.getReports(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.totalEstablishments >= 1);
    assert.ok(typeof res.data.totalVisits === 'number');
    assert.ok(typeof res.data.statusDistribution === 'object');
    assert.ok(Array.isArray(res.data.rows));
  });

  runTest('Exportação de dados em CSV com BOM UTF-8 compatível com Excel', () => {
    const req = {
      user: { id: superAdminUserId, role: 'superadmin' },
      query: {}
    };
    const res = mockRes();
    AdminVisitsController.exportCsv(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'text/csv; charset=utf-8');
    assert.ok(res.headers['content-disposition'].includes('.csv'));
    assert.ok(typeof res.data === 'string');
    assert.ok(res.data.startsWith('\uFEFF'), 'CSV DEVE iniciar com BOM UTF-8 (\\uFEFF) para Excel');
    assert.ok(res.data.includes('Clínica / Estabelecimento'), 'CSV deve conter cabeçalho');
    assert.ok(res.data.includes('Hospital e Maternidade São Lucas'), 'CSV deve conter os dados criados');
  });

  console.log(`\n=== RESULTADO FINAL: ${passed} PASSOU, ${failed} FALHOU ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
