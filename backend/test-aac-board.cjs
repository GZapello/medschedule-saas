const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_aac_board.db');
process.env.JWT_SECRET = 'test-secret-aac-board-xyz-2026';
process.env.PORT = '3198';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  try {
    fs.unlinkSync(process.env.DATABASE_PATH);
  } catch (e) {}
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const { CapabilityService } = require('./dist/services/capability.service');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  if (req.url.startsWith('/v1/')) {
    req.url = `/api${req.url}`;
  }
  next();
});
app.use('/api', require('./dist/routes').default);

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3198,
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
        } catch (e) {
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

async function runTests() {
  console.log('====================================================');
  console.log('TESTE AUTOMATIZADO: PRANCHA CAA & ÁRVORE DE CAPABILITIES');
  console.log('====================================================\n');

  // --- PARTE 1: VERIFICAÇÃO DE TAXONOMIA E RESOLUÇÃO DE CAPABILITIES ---
  console.log('1. Testando Resolução de Capabilities por Taxonomia:');

  // A. Fonoaudiologia: DEFAULT em USE e MANAGE
  const fono = CapabilityService.calculateCapabilities({
    professionId: 'prof-fonoaudiologo',
    commercialModule: 'ZemdaFono',
    practiceAreaIds: []
  });
  console.log(' - Fonoaudiologia:', {
    use: fono.activeCapabilities.includes('AAC_BOARD_USE'),
    manage: fono.activeCapabilities.includes('AAC_BOARD_MANAGE'),
    module: fono.commercialModule
  });
  if (!fono.activeCapabilities.includes('AAC_BOARD_USE') || !fono.activeCapabilities.includes('AAC_BOARD_MANAGE')) {
    throw new Error('Fonoaudiologia deve possuir AAC_BOARD_USE e AAC_BOARD_MANAGE ativos por padrão.');
  }
  if (fono.commercialModule !== 'ZemdaFono') {
    throw new Error('Fonoaudiologia deve permanecer ZemdaFono.');
  }

  // B. Neurologia Médica: AAC_BOARD_USE ativo, AAC_BOARD_MANAGE inativo, módulo ZemdaMed
  const neuro = CapabilityService.calculateCapabilities({
    professionId: 'prof-medico',
    commercialModule: 'ZemdaMed',
    practiceAreaIds: [],
    medicalSpecialtyIds: ['med-spec-neuro']
  });
  console.log(' - Neurologista:', {
    use: neuro.activeCapabilities.includes('AAC_BOARD_USE'),
    manage: neuro.activeCapabilities.includes('AAC_BOARD_MANAGE'),
    module: neuro.commercialModule
  });
  if (!neuro.activeCapabilities.includes('AAC_BOARD_USE')) {
    throw new Error('Neurologia médica deve ter AAC_BOARD_USE ativo.');
  }
  if (neuro.activeCapabilities.includes('AAC_BOARD_MANAGE')) {
    throw new Error('Neurologia médica não deve ter AAC_BOARD_MANAGE ativo por padrão.');
  }
  if (neuro.commercialModule !== 'ZemdaMed') {
    throw new Error('Neurologista deve permanecer ZemdaMed.');
  }

  // C. Terapia Ocupacional com Neuro/Pediatria: USE e MANAGE ativos, módulo ZemdaTO
  const to = CapabilityService.calculateCapabilities({
    professionId: 'prof-terapeuta-ocupacional',
    commercialModule: 'ZemdaTO',
    practiceAreaIds: ['pa-to-neuro', 'pa-to-pediatria']
  });
  console.log(' - TO Neuro/Pediatria:', {
    use: to.activeCapabilities.includes('AAC_BOARD_USE'),
    manage: to.activeCapabilities.includes('AAC_BOARD_MANAGE'),
    module: to.commercialModule
  });
  if (!to.activeCapabilities.includes('AAC_BOARD_USE') || !to.activeCapabilities.includes('AAC_BOARD_MANAGE')) {
    throw new Error('TO com área compatível deve ter USE e MANAGE ativos.');
  }
  if (to.commercialModule !== 'ZemdaTO') {
    throw new Error('TO deve permanecer ZemdaTO.');
  }

  // D. Odontologia: AAC estritamente oculto / inativo
  const odonto = CapabilityService.calculateCapabilities({
    professionId: 'prof-dentista',
    commercialModule: 'ZemdaOdonto',
    practiceAreaIds: ['pa-odonto-geral']
  });
  console.log(' - Dentista:', {
    use: odonto.activeCapabilities.includes('AAC_BOARD_USE'),
    manage: odonto.activeCapabilities.includes('AAC_BOARD_MANAGE'),
    hidden: odonto.hiddenCapabilities.includes('AAC_BOARD_USE')
  });
  if (odonto.activeCapabilities.includes('AAC_BOARD_USE') || odonto.activeCapabilities.includes('AAC_BOARD_MANAGE')) {
    throw new Error('Odontologia não deve ter capabilities de AAC ativas.');
  }

  // Inicia o servidor HTTP para testes de API
  const server = app.listen(3198);

  try {
    // --- PARTE 2: TESTE DE API REST, PERMISSÕES E PERSISTÊNCIA REAL ---
    console.log('\n2. Testando Endpoints HTTP e Barreiras de Permissão:');

    const tenantA = `tenant-caa-a-${uuidv4()}`;
    const tenantB = `tenant-caa-b-${uuidv4()}`;
    const userFono = `user-fono-${uuidv4()}`;
    const userNeuro = `user-neuro-${uuidv4()}`;
    const userOdonto = `user-odonto-${uuidv4()}`;
    const patientId = `patient-caa-${uuidv4()}`;

    // Cria tenants
    db.prepare("INSERT INTO tenants (id, name, slug, email, status) VALUES (?, 'Clínica Multidisciplinar', 'clinica-multi', 'multi@example.com', 'active')").run(tenantA);
    db.prepare("INSERT INTO tenants (id, name, slug, email, status) VALUES (?, 'Outra Clínica', 'outra-clinica', 'outra@example.com', 'active')").run(tenantB);

    // Cria usuários
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, profession_id, status)
      VALUES (?, 'Dra. Fonoaudióloga', 'fono@multi.com', 'hash', 'professional', 'prof-fonoaudiologo', 'active')
    `).run(userFono);

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, profession_id, status)
      VALUES (?, 'Dr. Neurologista', 'neuro@multi.com', 'hash', 'professional', 'prof-medico', 'active')
    `).run(userNeuro);

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, profession_id, status)
      VALUES (?, 'Dr. Dentista', 'odonto@multi.com', 'hash', 'professional', 'prof-dentista', 'active')
    `).run(userOdonto);

    // Vínculo com tenants
    db.prepare("INSERT INTO clinic_users (user_id, tenant_id, role, status) VALUES (?, ?, 'professional', 'active')").run(userFono, tenantA);
    db.prepare("INSERT INTO clinic_users (user_id, tenant_id, role, status) VALUES (?, ?, 'professional', 'active')").run(userNeuro, tenantA);
    db.prepare("INSERT INTO clinic_users (user_id, tenant_id, role, status) VALUES (?, ?, 'professional', 'active')").run(userOdonto, tenantA);

    // Configura hierarquia médica para o neurologista
    db.prepare("INSERT INTO user_medical_specialties (user_id, tenant_id, medical_specialty_id) VALUES (?, ?, 'med-spec-neuro')").run(userNeuro, tenantA);

    // Cria paciente no Tenant A
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone, is_child, active, created_at, updated_at)
      VALUES (?, ?, 'Lucas Silva (Paciente CAA)', '11999999999', 0, 1, datetime('now'), datetime('now'))
    `).run(patientId, tenantA);

    // Gera tokens de autenticação
    const tokenFono = generateToken({ userId: userFono, tenantId: tenantA, role: 'professional', permissions: [] });
    const tokenNeuro = generateToken({ userId: userNeuro, tenantId: tenantA, role: 'professional', permissions: [] });
    const tokenOdonto = generateToken({ userId: userOdonto, tenantId: tenantA, role: 'professional', permissions: [] });

    const headersFono = { Authorization: `Bearer ${tokenFono}`, 'X-Tenant-ID': tenantA };
    const headersNeuro = { Authorization: `Bearer ${tokenNeuro}`, 'X-Tenant-ID': tenantA };
    const headersOdonto = { Authorization: `Bearer ${tokenOdonto}`, 'X-Tenant-ID': tenantA };

    // TESTE 1: Dentista (sem AAC_BOARD_USE) tenta listar pranchas -> deve receber 403 CAPABILITY_RESTRICTED
    const resOdonto = await makeRequest('GET', `/api/v1/aac/boards?patientId=${patientId}`, headersOdonto);
    console.log(' - Teste Barreira Dentista (sem capability): Status', resOdonto.status);
    if (resOdonto.status !== 403 || resOdonto.body?.code !== 'CAPABILITY_RESTRICTED') {
      throw new Error(`Esperava 403 CAPABILITY_RESTRICTED para usuário sem capability, obteve ${resOdonto.status}`);
    }

    // TESTE 2: Neurologista (tem AAC_BOARD_USE, mas NÃO AAC_BOARD_MANAGE) tenta criar prancha -> deve receber 403
    const resNeuroCreate = await makeRequest('POST', '/api/v1/aac/boards', headersNeuro, {
      patientId,
      name: 'Prancha Tentativa Neuro',
      useStarterTemplate: true
    });
    console.log(' - Teste Barreira Neurologista criar (tem USE, não MANAGE): Status', resNeuroCreate.status);
    if (resNeuroCreate.status !== 403 || resNeuroCreate.body?.code !== 'CAPABILITY_RESTRICTED') {
      throw new Error(`Esperava 403 para criação por usuário sem AAC_BOARD_MANAGE, obteve ${resNeuroCreate.status}`);
    }

    // TESTE 3: Fonoaudióloga (tem AAC_BOARD_MANAGE) cria prancha completa com starter template
    const resFonoCreate = await makeRequest('POST', '/api/v1/aac/boards', headersFono, {
      patientId,
      name: 'Prancha de Comunicação do Lucas',
      description: 'Prancha inicial com vocabulário nuclear e necessidades',
      context: 'Geral & Consultório',
      columns: 4,
      useStarterTemplate: true
    });
    console.log(' - Fonoaudióloga cria prancha com template: Status', resFonoCreate.status);
    if (resFonoCreate.status !== 200 && resFonoCreate.status !== 201) {
      throw new Error(`Falha ao criar prancha: ${JSON.stringify(resFonoCreate.body)}`);
    }

    const board = resFonoCreate.body.board;
    if (!board || !board.id || board.pages.length < 5) {
      throw new Error('A prancha deveria conter 5 páginas do vocabulário nuclear.');
    }
    const totalCards = board.pages.reduce((acc, p) => acc + (p.cards ? p.cards.length : 0), 0);
    console.log(`   -> Prancha ID: ${board.id} | Páginas: ${board.pages.length} | Total de Cartões: ${totalCards}`);
    if (totalCards < 40) {
      throw new Error(`Esperava vocabulário robusto com mais de 40 cartões, encontrou ${totalCards}`);
    }

    // TESTE 4: Neurologista (tem AAC_BOARD_USE) abre e visualiza a prancha criada
    const resNeuroView = await makeRequest('GET', `/api/v1/aac/boards/${board.id}`, headersNeuro);
    console.log(' - Neurologista visualiza prancha criada: Status', resNeuroView.status);
    if (resNeuroView.status !== 200 || !resNeuroView.body.board) {
      throw new Error('Neurologista com AAC_BOARD_USE deveria conseguir visualizar a prancha.');
    }

    // TESTE 5: Edição de prancha e adição de novo cartão personalizado
    const firstPageId = board.pages[0].id;
    const resAddCard = await makeRequest('POST', `/api/v1/aac/boards/${board.id}/cards`, headersFono, {
      page_id: firstPageId,
      label: 'Novo Brinquedo',
      spoken_text: 'Eu quero o novo brinquedo',
      symbol_type: 'emoji',
      image_url: '🧸',
      category: 'noun',
      color: '#fed7aa'
    });
    console.log(' - Adicionar novo cartão personalizado: Status', resAddCard.status);
    if (resAddCard.status !== 201 || !resAddCard.body.card?.id) {
      throw new Error('Falha ao adicionar cartão personalizado.');
    }

    // TESTE 6: Duplicação de prancha
    const resDup = await makeRequest('POST', `/api/v1/aac/boards/${board.id}/duplicate`, headersFono);
    console.log(' - Duplicação de prancha completa: Status', resDup.status);
    if (resDup.status !== 200 || !resDup.body.board?.name.includes('(Cópia)')) {
      throw new Error('Falha ao duplicar prancha de CAA.');
    }
    const dupBoardId = resDup.body.board.id;

    // TESTE 7: Exclusão da cópia
    const resDel = await makeRequest('DELETE', `/api/v1/aac/boards/${dupBoardId}`, headersFono);
    console.log(' - Exclusão de prancha: Status', resDel.status);
    if (resDel.status !== 200 || !resDel.body.success) {
      throw new Error('Falha ao excluir prancha de CAA.');
    }

    // TESTE 8: Isolamento Multi-tenant (usuário do Tenant B não vê o paciente do Tenant A)
    const tokenTenantB = generateToken({ userId: userFono, tenantId: tenantB, role: 'professional', permissions: [] });
    const headersTenantB = { Authorization: `Bearer ${tokenTenantB}`, 'X-Tenant-ID': tenantB };
    const resIsolation = await makeRequest('GET', `/api/v1/aac/boards?patientId=${patientId}`, headersTenantB);
    console.log(' - Isolamento Multi-tenant: Status', resIsolation.status);
    if (resIsolation.status !== 404 && resIsolation.status !== 403) {
      throw new Error(`Usuário de outro tenant não pode ter acesso a paciente de outro tenant. Obteve: ${resIsolation.status}`);
    }

    console.log('\n====================================================');
    console.log('TODOS OS TESTES DE PRANCHA CAA FORAM CONCLUÍDOS COM SUCESSO!');
    console.log('====================================================\n');
  } finally {
    server.close();
    if (fs.existsSync(process.env.DATABASE_PATH)) {
      try {
        fs.unlinkSync(process.env.DATABASE_PATH);
      } catch (e) {}
    }
  }
}

runTests().catch(err => {
  console.error('\n❌ ERRO NO TESTE:', err);
  process.exit(1);
});
