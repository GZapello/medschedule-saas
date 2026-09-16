/**
 * Testes Automatizados para:
 * 1. Escala de Trabalho Automática ao Cadastrar Novo Profissional (Segunda a Sexta ativa, Sábado e Domingo inativa)
 * 2. Não-alteração de escalas de profissionais já existentes
 * 3. Alteração de Profissão Apenas Uma Vez com bloqueio em backend (403 após a 1ª alteração)
 * 4. Sincronização automática de módulos (ex: Fonoaudiologia ativa ZemdaFono)
 * 5. Edição de outros campos sem alteração de profissão não consome o uso único
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_schedule_prof.db');
process.env.JWT_SECRET = 'test-secret-sched-prof-123';
process.env.PORT = '3096';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  fs.unlinkSync(process.env.DATABASE_PATH);
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
      port: 3096,
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
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const server = app.listen(3096, async () => {
    console.log('\n🚀 Iniciando suite de testes: Escala Automática e Alteração Única de Profissão...\n');

    try {
      const nowIso = new Date().toISOString();
      const tenantId = 'ten-' + uuidv4().slice(0, 8);
      const adminUserId = 'usr-' + uuidv4().slice(0, 8);

      // Inserir profissões na base se não existirem
      db.prepare(`INSERT OR IGNORE INTO professions (id, name, slug, active) VALUES
        ('prof-fisioterapeuta', 'Fisioterapia', 'fisioterapia', 1),
        ('prof-fonoaudiologo', 'Fonoaudiologia', 'fonoaudiologia', 1),
        ('prof-nutricionista', 'Nutrição', 'nutricao', 1),
        ('prof-dentista', 'Odontologia', 'odontologia', 1),
        ('prof-psicologo', 'Psicologia', 'psicologia', 1)`
      ).run();

      // Inserir tenant e usuário admin
      db.prepare(`INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at) VALUES (?, ?, ?, 'contato@clinica.com', 'active', ?, ?)`).run(
        tenantId, 'Clínica Teste Escala', 'clinica-teste-escala', nowIso, nowIso
      );

      db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'hash', 'clinic_admin', 'active', ?, ?)`).run(
        adminUserId, tenantId, 'Admin Gestor', 'admin@clinica.com', nowIso, nowIso
      );

      db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, created_at) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, ?)`).run(
        uuidv4(), tenantId, adminUserId, nowIso
      );

      const adminToken = generateToken({
        userId: adminUserId,
        email: 'admin@clinica.com',
        role: 'clinic_admin',
        tenantId
      });

      const authHeaders = {
        'Authorization': `Bearer ${adminToken}`,
        'X-Tenant-Id': tenantId
      };

      // -------------------------------------------------------------
      // Cenário 0: Profissional legado pré-existente
      // -------------------------------------------------------------
      console.log('--- Cenário 0: Garantir que escalas de profissionais já existentes não sejam modificadas ---');
      const legacyProfId = 'pro-legacy-1';
      db.prepare(`
        INSERT INTO professionals (id, tenant_id, name, profession_id, active, created_at, updated_at)
        VALUES (?, ?, 'Dr. Legado', 'prof-psicologo', 1, ?, ?)
      `).run(legacyProfId, tenantId, nowIso, nowIso);

      // Inserir escala customizada para o legado (apenas sábado ativo, por exemplo)
      db.prepare(`
        INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, is_active)
        VALUES ('sch-leg-sat', ?, ?, 6, '09:00', '13:00', 1)
      `).run(tenantId, legacyProfId);

      const legacySchedBefore = db.prepare('SELECT * FROM schedules WHERE professional_id = ?').all(legacyProfId);
      assert(legacySchedBefore.length === 1 && legacySchedBefore[0].day_of_week === 6 && legacySchedBefore[0].is_active === 1, 'Profissional legado configurado com 1 turno exclusivo no sábado');

      // -------------------------------------------------------------
      // Cenário 1: Cadastro de Novo Profissional e Escala Automática
      // -------------------------------------------------------------
      console.log('\n--- Cenário 1: Escala Automática ao Cadastrar Novo Profissional ---');
      const createRes = await makeRequest('POST', '/api/v1/professionals', authHeaders, {
        name: 'Dr. Lucas Fisioterapeuta',
        email: 'lucas.fisio@clinica.com',
        gender: 'M',
        professionId: 'prof-fisioterapeuta',
        practiceAreas: 'Fisioterapia Esportiva e Ortopédica',
        bufferMinutes: 10
      });

      assert(createRes.status === 201, 'Profissional criado com status 201');
      const newProfId = createRes.body.id;
      assert(Boolean(newProfId), `ID retornado para o novo profissional: ${newProfId}`);

      // Consultar detalhes do profissional via GET
      const getRes = await makeRequest('GET', `/api/v1/professionals/${newProfId}`, authHeaders);
      assert(getRes.status === 200, 'GET /v1/professionals/:id retornou status 200');

      const schedules = getRes.body.schedules || [];
      assert(schedules.length === 7, `Grade retornou exatamente 7 dias configurados (retornou ${schedules.length})`);

      // Verificar que dias 1 a 5 (Segunda a Sexta) estão ativos
      const monday = schedules.find(s => s.day_of_week === 1);
      const tuesday = schedules.find(s => s.day_of_week === 2);
      const wednesday = schedules.find(s => s.day_of_week === 3);
      const thursday = schedules.find(s => s.day_of_week === 4);
      const friday = schedules.find(s => s.day_of_week === 5);
      const saturday = schedules.find(s => s.day_of_week === 6);
      const sunday = schedules.find(s => s.day_of_week === 0);

      assert(monday && monday.is_active === true, 'Segunda-feira (dia 1) está ATIVA');
      assert(tuesday && tuesday.is_active === true, 'Terça-feira (dia 2) está ATIVA');
      assert(wednesday && wednesday.is_active === true, 'Quarta-feira (dia 3) está ATIVA');
      assert(thursday && thursday.is_active === true, 'Quinta-feira (dia 4) está ATIVA');
      assert(friday && friday.is_active === true, 'Sexta-feira (dia 5) está ATIVA');

      // Verificar que sábado (6) e domingo (0) estão inativos
      assert(saturday && saturday.is_active === false, 'Sábado (dia 6) está INATIVO');
      assert(sunday && sunday.is_active === false, 'Domingo (dia 0) está INATIVO');

      // Verificar se a escala do legado continua intacta
      const legacySchedAfter = db.prepare('SELECT * FROM schedules WHERE professional_id = ?').all(legacyProfId);
      assert(legacySchedAfter.length === 1 && legacySchedAfter[0].day_of_week === 6 && legacySchedAfter[0].is_active === 1, 'Escala do profissional legado NÃO foi alterada pelo cadastro do novo profissional');

      // -------------------------------------------------------------
      // Cenário 2: Verificação do estado inicial de profession_change_used
      // -------------------------------------------------------------
      console.log('\n--- Cenário 2: Estado inicial de profession_change_used ---');
      const profData = getRes.body.professional;
      assert(profData.profession_change_used === 0 || profData.profession_change_used === false || !profData.profession_change_used, 'profession_change_used inicialmente é 0 (não utilizado)');

      // -------------------------------------------------------------
      // Cenário 3: Edição de outros campos sem alterar a profissão
      // -------------------------------------------------------------
      console.log('\n--- Cenário 3: Edição comum sem alterar a profissão não consome uso único ---');
      const editCommonRes = await makeRequest('PUT', `/api/v1/professionals/${newProfId}`, authHeaders, {
        name: 'Dr. Lucas Fisioterapeuta Atualizado',
        professionId: 'prof-fisioterapeuta', // mesma profissão
        bio: 'Fisioterapeuta especialista em reabilitação desportiva'
      });

      assert(editCommonRes.status === 200, 'Atualização de outros dados retornou status 200');

      const profAfterCommon = db.prepare('SELECT name, profession_id, profession_change_used FROM professionals WHERE id = ?').get(newProfId);
      assert(profAfterCommon.name === 'Dr. Lucas Fisioterapeuta Atualizado', 'Nome atualizado com sucesso');
      assert(Number(profAfterCommon.profession_change_used) === 0, 'profession_change_used continua 0 pois a profissão não mudou');

      // -------------------------------------------------------------
      // Cenário 4: Primeira alteração de profissão (Deve ter sucesso e marcar usado)
      // -------------------------------------------------------------
      console.log('\n--- Cenário 4: Primeira alteração de profissão (Sucesso e marcação de uso) ---');
      const changeProfRes = await makeRequest('PUT', `/api/v1/professionals/${newProfId}`, authHeaders, {
        professionId: 'prof-fonoaudiologo', // alterando para Fonoaudiologia
        practiceAreas: 'Fonoaudiologia Clínica e Voz'
      });

      assert(changeProfRes.status === 200, 'Primeira alteração de profissão retornou status 200');

      const profAfterChange = db.prepare('SELECT profession_id, profession_change_used, profession_changed_at, zemda_fono_enabled, zemda_fisio_enabled FROM professionals WHERE id = ?').get(newProfId);
      assert(profAfterChange.profession_id === 'prof-fonoaudiologo', 'Nova profissão gravada como prof-fonoaudiologo');
      assert(Number(profAfterChange.profession_change_used) === 1, 'profession_change_used agora é 1 (utilizado)');
      assert(Boolean(profAfterChange.profession_changed_at), `Data da alteração registrada: ${profAfterChange.profession_changed_at}`);
      assert(Number(profAfterChange.zemda_fono_enabled) === 1, 'Módulo zemda_fono_enabled automaticamente ATIVO (1)');
      assert(Number(profAfterChange.zemda_fisio_enabled) === 0, 'Módulo zemda_fisio_enabled automaticamente INATIVO (0)');

      // -------------------------------------------------------------
      // Cenário 5: Segunda tentativa de alteração de profissão (Deve ser bloqueada com 403)
      // -------------------------------------------------------------
      console.log('\n--- Cenário 5: Segunda tentativa de alteração de profissão (Bloqueio 403) ---');
      const secondChangeRes = await makeRequest('PUT', `/api/v1/professionals/${newProfId}`, authHeaders, {
        professionId: 'prof-nutricionista', // tentando mudar de novo para Nutrição
        practiceAreas: 'Nutrição Esportiva'
      });

      assert(secondChangeRes.status === 403, `Segunda alteração bloqueada com status 403 (recebido: ${secondChangeRes.status})`);
      assert(
        secondChangeRes.body.error && secondChangeRes.body.error.includes('já foi utilizada'),
        `Mensagem de erro clara recebida: "${secondChangeRes.body.error}"`
      );

      // Confirmar que no banco de dados a profissão continua sendo a da primeira alteração
      const profCheck = db.prepare('SELECT profession_id FROM professionals WHERE id = ?').get(newProfId);
      assert(profCheck.profession_id === 'prof-fonoaudiologo', 'Profissão permaneceu prof-fonoaudiologo, protegida contra novas alterações');

      // -------------------------------------------------------------
      // Cenário 6: Edição posterior mantendo a profissão atual continua funcionando
      // -------------------------------------------------------------
      console.log('\n--- Cenário 6: Edição posterior de dados cadastrais mantendo a profissão funciona ---');
      const editAfterRes = await makeRequest('PUT', `/api/v1/professionals/${newProfId}`, authHeaders, {
        professionId: 'prof-fonoaudiologo', // envia a mesma profissão atual
        registrationNumber: 'CRFa 12345',
        bio: 'Fonoaudióloga especialista em voz'
      });

      assert(editAfterRes.status === 200, 'Edição de outros dados após o bloqueio de profissão funciona normalmente (status 200)');
      const profFinal = db.prepare('SELECT registration_number FROM professionals WHERE id = ?').get(newProfId);
      assert(profFinal.registration_number === 'CRFa 12345', 'Número de registro atualizado com sucesso');

      console.log(`\n========================================`);
      console.log(`Testes Concluídos! Passaram: ${passedTests} | Falharam: ${failedTests}`);
      console.log(`========================================\n`);

      server.close();
      try {
        if (fs.existsSync(process.env.DATABASE_PATH)) {
          fs.unlinkSync(process.env.DATABASE_PATH);
        }
      } catch (e) {}
      process.exit(failedTests > 0 ? 1 : 0);
    } catch (err) {
      console.error('Erro inesperado durante os testes:', err);
      server.close();
      try {
        if (fs.existsSync(process.env.DATABASE_PATH)) {
          fs.unlinkSync(process.env.DATABASE_PATH);
        }
      } catch (e) {}
      process.exit(1);
    }
  });
}

runTests();
