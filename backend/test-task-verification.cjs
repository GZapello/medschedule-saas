const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const testDbPath = path.resolve(__dirname, 'test_task_verification.db');
process.env.DATABASE_PATH = testDbPath;
process.env.JWT_SECRET = 'test-secret-verification-123';
process.env.PORT = '3199';

if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

const server = http.createServer(app);

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
      port: 3199,
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

server.listen(3199, async () => {
  try {
    console.log('================================================================');
    console.log('🧪 TEST SUITE: VERIFICAÇÃO FUNCIONAL COMPLETA DA TAREFA');
    console.log('================================================================\n');

    const tenantId = 'tenant-' + uuidv4();
    const profId = 'prof-' + uuidv4();
    const userId = 'user-' + uuidv4();

    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(tenantId, 'Clínica de Reabilitação Zemda', 'clinica-zemda-' + Date.now(), 'contato@zemda.test');

    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, role, status, name, created_at, updated_at)
      VALUES (?, ?, ?, 'hash', 'professional', 'active', 'Dra. Terapeuta Silva', datetime('now'), datetime('now'))
    `).run(userId, tenantId, 'terapeuta@zemda.test');

    db.prepare(`
      INSERT INTO professionals (id, user_id, tenant_id, name, profession_id, registration_type, registration_number, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'prof-terapeuta-ocupacional', 'CREFITO', '12345-TO', 1, datetime('now'), datetime('now'))
    `).run(profId, userId, tenantId, 'Dra. Terapeuta Silva');

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
      email: 'terapeuta@zemda.test'
    });

    const authHeaders = { Authorization: `Bearer ${token}` };

    // --- 1. Cadastro de Paciente sem Telefone (Adulto) ---
    console.log('--- TEST 1: Cadastro de Paciente Adulto sem Telefone ---');
    const resAdultNoPhone = await makeRequest('POST', '/api/v1/patients', authHeaders, {
      name: 'Paciente Adulto Sem Telefone',
      email: 'adulto@teste.com',
      phone: '', // vazio
      birthDate: '1990-05-15'
    });

    assert(resAdultNoPhone.status === 201, `Status 201 ao cadastrar sem telefone (recebido: ${resAdultNoPhone.status})`);
    const adultId = resAdultNoPhone.body?.id || resAdultNoPhone.body?.data?.id;
    assert(!!adultId, 'Paciente adulto criado com ID');

    const adultInDb = db.prepare(`SELECT phone FROM patients WHERE id = ?`).get(adultId);
    assert(adultInDb && adultInDb.phone === null, `Telefone no banco é estritamente NULL (valor: ${JSON.stringify(adultInDb?.phone)})`);

    // --- 2. Cadastro de Paciente Menor de Idade sem Telefone do Paciente ---
    console.log('\n--- TEST 2: Cadastro de Menor de Idade (Sem telefone do menor, com responsável) ---');
    const resMinor = await makeRequest('POST', '/api/v1/patients', authHeaders, {
      name: 'Criança Sem Celular Próprio',
      isChild: true,
      birthDate: '2018-02-10',
      phone: null, // sem telefone próprio
      guardians: [
        {
          fullName: 'Mãe Responsável Legal',
          phone: '11988887777',
          relationship: 'mother'
        }
      ]
    });

    assert(resMinor.status === 201, `Status 201 para menor de idade sem telefone próprio (recebido: ${resMinor.status})`);
    const minorId = resMinor.body?.id || resMinor.body?.data?.id;
    const minorInDb = db.prepare(`SELECT phone FROM patients WHERE id = ?`).get(minorId);
    assert(minorInDb && minorInDb.phone === null, `Telefone do menor no banco é estritamente NULL`);

    const guardianInDb = db.prepare(`SELECT full_name, phone, relationship FROM guardians WHERE patient_id = ?`).get(minorId);
    assert(guardianInDb && guardianInDb.full_name === 'Mãe Responsável Legal', 'Responsável legal persistido');
    assert(guardianInDb && guardianInDb.phone === '11988887777', `Telefone do responsável legal salvo: ${guardianInDb?.phone}`);

    // --- 3. Validação e Normalização de Telefone quando preenchido ---
    console.log('\n--- TEST 3: Validação de Telefone Válido e Inválido ---');
    const resValidPhone = await makeRequest('POST', '/api/v1/patients', authHeaders, {
      name: 'Paciente Telefone Válido',
      phone: '11977776666',
      birthDate: '1985-01-01'
    });
    assert(resValidPhone.status === 201, `Telefone válido aceito (201)`);
    const validPhoneId = resValidPhone.body?.id || resValidPhone.body?.data?.id;
    const validPhoneInDb = db.prepare(`SELECT phone FROM patients WHERE id = ?`).get(validPhoneId);
    assert(validPhoneInDb && validPhoneInDb.phone === '(11) 97777-6666', `Telefone normalizado corretamente no banco: ${validPhoneInDb?.phone}`);

    const resInvalidPhone = await makeRequest('POST', '/api/v1/patients', authHeaders, {
      name: 'Paciente Telefone Inválido',
      phone: '12345',
      birthDate: '1985-01-01'
    });
    assert(resInvalidPhone.status === 400, `Telefone inválido rejeitado com status 400 (recebido: ${resInvalidPhone.status})`);

    // --- 4. Edição de Paciente: Limpar Telefone e Preservar Telefone ---
    console.log('\n--- TEST 4: Edição de Paciente (Limpar Telefone vs Preservar) ---');
    const resClearPhone = await makeRequest('PUT', `/api/v1/patients/${validPhoneId}`, authHeaders, {
      name: 'Paciente Telefone Removido',
      phone: '' // limpando telefone
    });
    assert(resClearPhone.status === 200, `Edição para remover telefone aceita (200)`);
    const clearedInDb = db.prepare(`SELECT phone FROM patients WHERE id = ?`).get(validPhoneId);
    assert(clearedInDb && clearedInDb.phone === null, `Telefone foi limpo para NULL com sucesso`);

    // Atualizar apenas nome sem enviar campo phone: deve preservar
    db.prepare(`UPDATE patients SET phone = ? WHERE id = ?`).run('(11) 91111-2222', validPhoneId);
    const resOmitPhone = await makeRequest('PUT', `/api/v1/patients/${validPhoneId}`, authHeaders, {
      name: 'Paciente Nome Alterado'
      // phone omitido
    });
    assert(resOmitPhone.status === 200, `Edição com phone omitido aceita (200)`);
    const preservedInDb = db.prepare(`SELECT phone FROM patients WHERE id = ?`).get(validPhoneId);
    assert(preservedInDb && preservedInDb.phone === '(11) 91111-2222', `Telefone pré-existente preservado quando campo phone é omitido`);

    // --- 5. Orientações Casa/Escola (ZemdaTO / Multidisciplinar) ---
    console.log('\n--- TEST 5: Salvamento, Persistência e Consulta de Orientações Casa/Escola ---');
    const programPayload = {
      patientId: adultId,
      specialty: 'to',
      setting: 'Casa e Escola',
      title: 'Treino de Coordenação e Escrita Adaptada',
      instructions: '1. Realizar aquecimento articular com massinha por 5 minutos.\n2. Utilizar o engrossador de lápis na atividade de recorte e colagem.\n3. Descanso de 2 minutos a cada 10 minutos de escrita.',
      materialsNeeded: 'Massinha terapêutica, engrossador de lápis de EVA, tesoura adaptada.',
      frequency: '2 vezes ao dia (manhã e tarde)'
    };

    const resSaveProgram = await makeRequest('POST', '/api/v1/occupational-therapy/home-programs', authHeaders, programPayload);

    assert(resSaveProgram.status === 201, `POST /v1/occupational-therapy/home-programs retornou HTTP 201 (recebido: ${resSaveProgram.status})`);
    const programId = resSaveProgram.body?.id || resSaveProgram.body?.data?.id;
    assert(!!programId, 'Programa de orientações criado com ID');

    // Verifica colunas persistidas no SQLite
    const progInDb = db.prepare(`SELECT * FROM clinical_home_programs WHERE id = ?`).get(programId);
    assert(progInDb && progInDb.title === 'Treino de Coordenação e Escrita Adaptada', 'Título persistido na coluna title');
    assert(progInDb && progInDb.setting === 'Casa e Escola', 'Ambiente persistido na coluna setting');
    assert(progInDb && progInDb.materials_needed === programPayload.materialsNeeded, 'Materiais persistidos na coluna materials_needed');
    assert(progInDb && progInDb.instructions === programPayload.instructions, 'Instruções completas com quebras de linha persistidas');
    assert(progInDb && progInDb.status === 'active', `Status inicial persistido como active (valor: ${progInDb?.status})`);

    // Teste de prevenção de cliques repetidos (anti-duplicate)
    const resDuplicate = await makeRequest('POST', '/api/v1/occupational-therapy/home-programs', authHeaders, programPayload);
    assert(resDuplicate.status === 200, `Submissão duplicada imediata tratada de forma idempotente (status: ${resDuplicate.status})`);
    const dupId = resDuplicate.body?.id || resDuplicate.body?.data?.id;
    assert(dupId === programId, `ID retornado é idêntico ao existente (${dupId} == ${programId})`);
    const countInDb = db.prepare(`SELECT COUNT(*) as count FROM clinical_home_programs WHERE patient_id = ?`).get(adultId);
    assert(countInDb && countInDb.count === 1, `Banco de dados mantém exatamente 1 registro (sem duplicação por cliques repetidos)`);

    // Listagem de orientações com dados do profissional
    const resList = await makeRequest('GET', `/api/v1/occupational-therapy/home-programs/${adultId}`, authHeaders);

    assert(resList.status === 200, `Listagem de orientações retornou HTTP 200`);
    const list = resList.body?.data || resList.body || [];
    const found = Array.isArray(list) ? list.find(p => p.id === programId) : null;
    assert(!!found, 'Orientação recém-salva encontrada na listagem');
    assert(found && found.title === programPayload.title, 'Título retornado na listagem');
    assert(found && found.professional_name === 'Dra. Terapeuta Silva', `Nome do profissional retornado no join: ${found?.professional_name}`);
    assert(found && found.registration_number === '12345-TO', `Registro profissional retornado: ${found?.registration_number}`);

    // --- 6. Geração de PDF da Orientação Casa/Escola ---
    console.log('\n--- TEST 6: Download de PDF da Orientação com Cabeçalho e Conteúdo Clínico ---');
    const resPdf = await makeRequest('GET', `/api/v1/occupational-therapy/home-programs/${programId}/pdf`, authHeaders, null, true);

    assert(resPdf.status === 200, `GET /v1/occupational-therapy/home-programs/:id/pdf retornou HTTP 200 (recebido: ${resPdf.status})`);
    assert(resPdf.headers['content-type']?.includes('application/pdf'), `Header Content-Type é application/pdf (${resPdf.headers['content-type']})`);
    assert(resPdf.body && resPdf.body.length > 500, `Corpo do PDF gerado com tamanho válido (${resPdf.body?.length} bytes)`);

    const pdfHeader = resPdf.body.slice(0, 4).toString('utf-8');
    assert(pdfHeader === '%PDF', `Header binário válido do arquivo PDF (%PDF)`);

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
