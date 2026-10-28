const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const testDbPath = path.resolve(__dirname, 'test_consolidated_home_programs.db');
process.env.DATABASE_PATH = testDbPath;
process.env.JWT_SECRET = 'test-secret-consolidated-123';
process.env.PORT = '3205';

if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch (_) {}
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

const server = http.createServer(app);
const PDFDocument = require('pdfkit');
const originalText = PDFDocument.prototype.text;
let pdfText = [];
PDFDocument.prototype.text = function(value, ...args) { pdfText.push(String(value)); return originalText.call(this, value, ...args); };


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

function makeRequest(method, urlPath, headers = {}, body = null, isBinary = false) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3205,
      path: urlPath,
      method: method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      }
    };

    const req = http.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (isBinary) {
          resolve({ status: res.statusCode, headers: res.headers, body: buffer });
          return;
        }
        let data = buffer.toString('utf-8');
        try {
          data = JSON.parse(data);
        } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });

    req.on('error', err => reject(err));
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

server.listen(3205, async () => {
  try {
    console.log('================================================================');
    console.log('🧪 TEST SUITE: DOCUMENTO CONSOLIDADO DE ORIENTAÇÕES CASA/ESCOLA');
    console.log('================================================================\n');

    const tenantId = 'tenant-' + uuidv4();
    const profId = 'prof-' + uuidv4();
    const otherProfId = 'prof-' + uuidv4();
    const userId = 'user-' + uuidv4();
    const otherUserId = 'user-' + uuidv4();

    db.prepare(`
      INSERT INTO tenants (id, name, trade_name, slug, email, cnpj_cpf, address, city, state, phone, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(
      tenantId,
      'Centro Integrado de Reabilitação Zemda',
      'Clínica Zemda Reabilitação',
      'clinica-reab-' + Date.now(),
      'contato@zemdareab.test',
      '98.765.432/0001-10',
      'Av. Terapêutica, 500',
      'São Paulo',
      'SP',
      '(11) 3333-4444'
    );

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, role, status, name, created_at, updated_at)
      VALUES (?, ?, ?, 'hash', 'professional', 'active', 'Dra. Beatriz Terapeuta', datetime('now'), datetime('now'))
    `).run(userId, tenantId, 'beatriz@zemda.test');

    db.prepare(`
      INSERT INTO professionals (id, user_id, tenant_id, name, profession_id, registration_type, registration_number, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'prof-terapeuta-ocupacional', 'CREFITO', '99887-TO', 1, datetime('now'), datetime('now'))
    `).run(profId, userId, tenantId, 'Dra. Beatriz Terapeuta');

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, role, status, name, created_at, updated_at)
      VALUES (?, ?, ?, 'hash', 'professional', 'active', 'Dr. Roberto Fonoaudiólogo', datetime('now'), datetime('now'))
    `).run(otherUserId, tenantId, 'roberto@zemda.test');

    db.prepare(`
      INSERT INTO professionals (id, user_id, tenant_id, name, profession_id, registration_type, registration_number, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'prof-fonoaudiologo', 'CRFa', '54321-SP', 1, datetime('now'), datetime('now'))
    `).run(otherProfId, otherUserId, tenantId, 'Dr. Roberto Fonoaudiólogo');

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_to_enabled)
      VALUES (?, ?, ?, 'professional', 'active', 1, '[]', 1)
    `).run('cu-' + uuidv4(), tenantId, userId);

    const token = generateToken({
      userId,
      tenantId,
      clinicId: tenantId,
      professionalId: profId,
      role: 'professional',
      email: 'beatriz@zemda.test',
      name: 'Dra. Beatriz Terapeuta'
    });

    const authHeaders = { Authorization: `Bearer ${token}` };

    // Cadastra paciente de teste
    const patientId = 'pat-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, birth_date, active, created_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
    `).run(patientId, tenantId, 'Lucas Silva Oliveira', '2016-04-12');

    // --- TEST 1: Paciente sem orientações deve retornar HTTP 404 claro ---
    console.log('--- TEST 1: Exportação de PDF Consolidado de Paciente Sem Orientações ---');
    const resEmptyPdf = await makeRequest(
      'GET',
      `/api/v1/occupational-therapy/home-programs/consolidated-pdf/${patientId}`,
      authHeaders
    );
    assert(resEmptyPdf.status === 404, `Status 404 quando não há orientações cadastradas (recebido: ${resEmptyPdf.status})`);
    assert(
      resEmptyPdf.body?.error === 'Nenhuma orientação ativa para este paciente.',
      `Mensagem de erro clara retornada: "${resEmptyPdf.body?.error}"`
    );

    // --- TEST 2: Criar múltiplas orientações com diferentes status, datas e profissionais ---
    console.log('\n--- TEST 2: Inserção de 4 Orientações (Textos Curtos e Longos, Múltiplos Profissionais) ---');

    // 1. Mais antiga: sem profissional cadastrado no registro (para testar não atribuição indevida ao usuário atual)
    db.prepare(`
      INSERT INTO clinical_home_programs (
        id, tenant_id, patient_id, professional_id, module_type, specialty,
        setting, title, activity, instructions, instruction, materials_needed, frequency, status, created_at
      ) VALUES (?, ?, ?, NULL, 'to', 'to', 'school', ?, ?, ?, ?, ?, ?, 'completed', '2026-01-10 09:30:00')
    `).run(
      'prog-1-school',
      tenantId,
      patientId,
      'Adaptação de Material Escolar e Apoio em Sala',
      'Adaptação de Material Escolar e Apoio em Sala',
      'Fornecer apoio visual na mesa da criança e permitir pausas programadas de 3 minutos a cada 20 minutos de atividade focada.',
      'Fornecer apoio visual na mesa da criança e permitir pausas programadas de 3 minutos a cada 20 minutos de atividade focada.',
      'Placa inclinada de 20 graus e engrossador triangular',
      'Diário na rotina escolar'
    );

    // 2. Intermediária A: Profissional Beatriz, status ativo
    db.prepare(`
      INSERT INTO clinical_home_programs (
        id, tenant_id, patient_id, professional_id, module_type, specialty,
        setting, title, activity, instructions, instruction, materials_needed, frequency, status, created_at
      ) VALUES (?, ?, ?, ?, 'to', 'to', 'home', ?, ?, ?, ?, ?, ?, 'active', '2026-02-15 14:00:00')
    `).run(
      'prog-2-home',
      tenantId,
      patientId,
      profId,
      'Treino de Autonomia no Banho e Vestuário',
      'Treino de Autonomia no Banho e Vestuário',
      '1. Organizar roupas na sequência de uso.\n2. Estimular que a criança puxe a camiseta pelas mangas.\n3. Recompensar oralmente cada etapa concluída.',
      '1. Organizar roupas na sequência de uso.\n2. Estimular que a criança puxe a camiseta pelas mangas.\n3. Recompensar oralmente cada etapa concluída.',
      'Quadro de rotina visual plastificado com velcro',
      '2x ao dia'
    );

    // 3. Intermediária B: Profissional Roberto (outro profissional), status revisado
    db.prepare(`
      INSERT INTO clinical_home_programs (
        id, tenant_id, patient_id, professional_id, module_type, specialty,
        setting, title, activity, instructions, instruction, materials_needed, frequency, status, created_at
      ) VALUES (?, ?, ?, ?, 'to', 'to', 'community', ?, ?, ?, ?, NULL, ?, 'revised', '2026-03-01 10:15:00')
    `).run(
      'prog-3-community',
      tenantId,
      patientId,
      otherProfId,
      'Estímulo à Interação Social em Parques e Espaços Abertos',
      'Estímulo à Interação Social em Parques e Espaços Abertos',
      'Incentivar brincadeiras com regras simples de revezamento de turnos (ex: bola ou pega-pega adaptado). Manter supervisão atenta aos sinais de sobrecarga sensorial.',
      'Incentivar brincadeiras com regras simples de revezamento de turnos (ex: bola ou pega-pega adaptado). Manter supervisão atenta aos sinais de sobrecarga sensorial.',
      'Finais de semana'
    );

    // 4. Mais recente: Texto longo multilinha, status ativo
    const longInstructions = `PROGRAMA DETALHADO DE REGULAÇÃO SENSORIAL E COORDENAÇÃO BIMANUAL:
1. Preparação do Ambiente:
   - Escolher um cômodo calmo e bem iluminado, longe de telas de televisão ou ruídos excessivos.
   - Posicionar a criança com apoio firme nos pés e tronco alinhado na cadeira ergonômica.

2. Atividades Práticas de Coordenação Fina:
   - Utilizar a massinha terapêutica para amassar, rolar e pinçar pequenos grãos ou contas escondidas.
   - Estimular o uso da tesoura de mola adaptada para corte de linhas retas e curvas graduadas.
   - Treinar o encaixe de tampas de rosca e botões de diâmetros decrescentes.

3. Estratégias de Desaceleração e Volta à Calma:
   - Realizar compressões articulares suaves nos ombros e braços por 10 segundos ao término das atividades.
   - Convidar a criança a respirar profundamente (técnica do balão imaginário) três vezes consecutivas.

4. Recomendações aos Educadores e Familiares:
   - Jamais forçar além do limite de tolerância da criança; respeitar pausas quando surgirem sinais de fadiga.
   - Anotar no caderno terapêutico quaisquer episódios de resistência ou evolução perceptível.`;

    db.prepare(`
      INSERT INTO clinical_home_programs (
        id, tenant_id, patient_id, professional_id, module_type, specialty,
        setting, title, activity, instructions, instruction, materials_needed, frequency, status, created_at
      ) VALUES (?, ?, ?, ?, 'to', 'to', 'general', ?, ?, ?, ?, ?, ?, 'active', '2026-04-20 16:45:00')
    `).run(
      'prog-4-long',
      tenantId,
      patientId,
      profId,
      'Protocolo Amplo de Regulação Sensorial e Coordenação Bimanual',
      'Protocolo Amplo de Regulação Sensorial e Coordenação Bimanual',
      longInstructions,
      longInstructions,
      'Massinha terapêutica verde, tesoura adaptada com mola, contas coloridas de madeira e cadeira ergonômica',
      '1 vez ao dia (preferencialmente às 17h)'
    );

    const totalInDb = db.prepare(`SELECT COUNT(*) as count FROM clinical_home_programs WHERE patient_id = ?`).get(patientId);
    assert(totalInDb && totalInDb.count === 4, `4 orientações inseridas no banco de dados para o paciente`);

    // --- TEST 3: Endpoint Consolidado /consolidated-pdf/:patientId ---
    console.log('\n--- TEST 3: Requisição do PDF Consolidado via /consolidated-pdf/:patientId ---');
    const resConsolidatedPdf = await makeRequest(
      'GET',
      `/api/v1/occupational-therapy/home-programs/consolidated-pdf/${patientId}`,
      authHeaders,
      null,
      true
    );

    assert(resConsolidatedPdf.status === 200, `GET /consolidated-pdf/:patientId retornou HTTP 200 (recebido: ${resConsolidatedPdf.status})`);
    assert(
      resConsolidatedPdf.headers['content-type']?.includes('application/pdf'),
      `Content-Type é application/pdf (${resConsolidatedPdf.headers['content-type']})`
    );

    const disposition = resConsolidatedPdf.headers['content-disposition'] || '';
    assert(
      disposition.includes('orientacoes-casa-escola-lucas-silva-oliveira.pdf'),
      `Content-Disposition traz nome identificável com paciente: "${disposition}"`
    );

    assert(
      resConsolidatedPdf.body && resConsolidatedPdf.body.length > 3000,
      `Corpo binário consolidado possui tamanho condizente com múltiplas orientações (${resConsolidatedPdf.body?.length} bytes)`
    );

    const magicHeader = resConsolidatedPdf.body.slice(0, 4).toString('utf-8');
    assert(magicHeader === '%PDF', `Arquivo binário inicia com cabeçalho válido %PDF`);

    const exportedText = pdfText.join(' ');
    for (const row of db.prepare('SELECT title, status FROM clinical_home_programs WHERE patient_id = ?').all(patientId)) {
      assert(exportedText.includes(row.title.toUpperCase()) === (row.status === 'active'), 'PDF filtra status: ' + row.status + ' / ' + row.title);
    }
    for (const row of db.prepare('SELECT id FROM clinical_home_programs WHERE patient_id = ?').all(patientId)) {
      for (const status of ['paused', 'completed', 'active', 'paused']) {
        const update = await makeRequest('PUT', `/api/v1/occupational-therapy/home-programs/${row.id}/status`, authHeaders, {status});
        assert(update.status === 200, 'Status salvo: ' + status);
        const list = await makeRequest('GET', `/api/v1/occupational-therapy/home-programs/${patientId}?module_type=to`, authHeaders);
        assert(list.body.filter(p => p.id === row.id && p.status === status).length === 1, 'Releitura preserva status sem duplicação');
        const individual = await makeRequest('GET', `/api/v1/occupational-therapy/home-programs/${row.id}/pdf`, authHeaders, null, true);
        assert(individual.status === 200, 'PDF individual: ' + status);
        assert(db.prepare('SELECT status FROM clinical_home_programs WHERE id = ?').get(row.id).status === status, 'Exportar não altera status');
      }
    }
    const noActive = await makeRequest('GET', `/api/v1/occupational-therapy/home-programs/consolidated-pdf/${patientId}?module_type=to`, authHeaders);
    assert(noActive.status === 404 && noActive.body.error.includes('ativa'), 'Sem ativas não gera PDF vazio');
    const first = db.prepare('SELECT id FROM clinical_home_programs WHERE patient_id = ? LIMIT 1').get(patientId);
    await makeRequest('PUT', `/api/v1/occupational-therapy/home-programs/${first.id}/status`, authHeaders, {status:'active'});
    pdfText = [];
    const reactivated = await makeRequest('GET', `/api/v1/occupational-therapy/home-programs/consolidated-pdf/${patientId}?module_type=to`, authHeaders, null, true);
    assert(reactivated.status === 200, 'Reativação retorna ao consolidado filtrado');
    for (const row of db.prepare('SELECT title, status FROM clinical_home_programs WHERE patient_id = ?').all(patientId)) assert(pdfText.join(' ').includes(row.title.toUpperCase()) === (row.status === 'active'), 'Consolidado atualizado após reativação');

    // --- TEST 4: Rota alternativa /patient/:patientId/consolidated-pdf ---
    console.log('\n--- TEST 4: Requisição via Rota Alternativa /patient/:patientId/consolidated-pdf ---');
    const resAltRoute = await makeRequest(
      'GET',
      `/api/v1/occupational-therapy/home-programs/patient/${patientId}/consolidated-pdf`,
      authHeaders,
      null,
      true
    );
    assert(resAltRoute.status === 200, `Rota alternativa retornou HTTP 200`);
    assert(resAltRoute.body && resAltRoute.body.length > 3000, `PDF gerado com sucesso pela rota alternativa`);

    // --- TEST 5: Respeito a clínicas diferentes (Isolamento de Tenant) ---
    console.log('\n--- TEST 5: Isolamento Multiclínica (Tenant Isolation) ---');
    const otherTenantId = 'tenant-' + uuidv4();
    const otherToken = generateToken({
      userId: 'user-intruder',
      tenantId: otherTenantId,
      clinicId: otherTenantId,
      role: 'professional',
      email: 'outro@clinica.test'
    });
    const resTenantLeak = await makeRequest(
      'GET',
      `/api/v1/occupational-therapy/home-programs/consolidated-pdf/${patientId}`,
      { Authorization: `Bearer ${otherToken}` }
    );
    assert(
      resTenantLeak.status === 401 || resTenantLeak.status === 403 || resTenantLeak.status === 404,
      `Acesso a paciente de outro tenant bloqueado (status: ${resTenantLeak.status})`
    );

    console.log('\n================================================================');
    console.log(`TOTAL: ${passedTests} PASSOU | ${failedTests} FALHOU`);
    console.log('================================================================');

    server.close();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (_) {}
    }

    if (failedTests > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Erro na execução dos testes:', err);
    server.close();
    process.exit(1);
  }
});
