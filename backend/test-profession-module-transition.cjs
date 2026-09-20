const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_transition_audit.db');
process.env.JWT_SECRET = 'test-secret-transition-audit-123';
process.env.PORT = '3099';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  try {
    fs.unlinkSync(process.env.DATABASE_PATH);
  } catch (e) {}
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');

const app = express();
app.use(express.json());
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

async function runSuite() {
  const server = app.listen(3099, async () => {
    console.log('===============================================================');
    console.log('AUDITORIA COMPLETA DE TRANSIÇÕES DE PROFISSÃO -> MÓDULOS ZEMDA');
    console.log('Servidor de teste ativo na porta 3099');
    console.log('===============================================================\n');

    try {
      const nowIso = new Date().toISOString();
      const tenantId = 'ten-' + uuidv4().slice(0, 8);
      const adminUserId = 'usr-admin-' + uuidv4().slice(0, 8);
      const testUserId = 'usr-prof-' + uuidv4().slice(0, 8);
      const profId = 'prof-' + uuidv4().slice(0, 8);

      // Inserir clínica / tenant
      db.prepare(`INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at) VALUES (?, ?, ?, 'contato@clinica.com', 'active', ?, ?)`).run(
        tenantId, 'Clínica Multidisciplinar Zemda', 'clinica-multi-zemda', nowIso, nowIso
      );

      // Inserir Admin da Clínica
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at) VALUES (?, ?, 'Admin Gestor', 'admin@clinica.com', 'hash', 'clinic_admin', 'active', ?, ?)`).run(
        adminUserId, tenantId, nowIso, nowIso
      );
      db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, created_at) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, ?)`).run(
        uuidv4(), tenantId, adminUserId, nowIso
      );

      // Inserir Profissional inicialmente como Personal Trainer (prof-educacao-fisica)
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, profession_id, profession_name, registration_type, zemda_personal_enabled, created_at, updated_at) VALUES (?, ?, 'Dr. Auditor Multi-Módulos', 'auditor@clinica.com', 'hash', 'professional', 'active', 'prof-educacao-fisica', 'Educação Física', 'CREF', 1, ?, ?)`).run(
        testUserId, tenantId, nowIso, nowIso
      );

      db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, profession_id, profession_name, permissions_json, created_at) VALUES (?, ?, ?, 'professional', 'active', 'prof-educacao-fisica', 'Educação Física', ?, ?)`).run(
        uuidv4(), tenantId, testUserId, JSON.stringify(['access_zemda_personal', 'access_zemda_body']), nowIso
      );

      db.prepare(`INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, registration_type, registration_number, practice_areas, profession_change_used, zemda_personal_enabled, created_at, updated_at) VALUES (?, ?, ?, 'Dr. Auditor Multi-Módulos', 'prof-educacao-fisica', 'Educação Física', 'CREF', '123456-G/SP', 'Personal Trainer, Musculação, Treinamento Funcional', 0, 1, ?, ?)`).run(
        profId, tenantId, testUserId, nowIso, nowIso
      );

      console.log('✅ Estrutura de teste inicializada: Profissional inicial = Personal Trainer (CREF)\n');

      const adminToken = generateToken({
        userId: adminUserId,
        email: 'admin@clinica.com',
        name: 'Admin Gestor',
        role: 'clinic_admin',
        tenantId
      });

      const userToken = generateToken({
        userId: testUserId,
        email: 'auditor@clinica.com',
        name: 'Dr. Auditor Multi-Módulos',
        role: 'professional',
        tenantId
      });

      const adminHeaders = {
        'Authorization': `Bearer ${adminToken}`,
        'X-Tenant-Id': tenantId
      };

      const userHeaders = {
        'Authorization': `Bearer ${userToken}`,
        'X-Tenant-Id': tenantId
      };

      // Definição rigorosa das 7 transições sequenciais solicitadas
      const transitions = [
        {
          step: 1,
          name: 'Personal Trainer -> Psicólogo (CRP)',
          professionId: 'prof-psicologia',
          professionName: 'Psicologia',
          registrationType: 'CRP',
          registrationNumber: '06/123456',
          practiceAreas: 'Psicoterapia Cognitivo-Comportamental, Ansiedade, TCC',
          expectedModule: 'ZemdaPsico',
          expectedKey: 'zemdaPsicoEnabled',
          expectedDbColumn: 'zemda_psico_enabled'
        },
        {
          step: 2,
          name: 'Psicólogo -> Fonoaudiólogo (CRFA)',
          professionId: 'prof-fonoaudiologia',
          professionName: 'Fonoaudiologia',
          registrationType: 'CRFA',
          registrationNumber: '2-98765',
          practiceAreas: 'Audiologia Clínica, Motricidade Orofacial, Voz',
          expectedModule: 'ZemdaFono',
          expectedKey: 'zemdaFonoEnabled',
          expectedDbColumn: 'zemda_fono_enabled'
        },
        {
          step: 3,
          name: 'Fonoaudiólogo -> Nutricionista (CRN)',
          professionId: 'prof-nutricao',
          professionName: 'Nutrição',
          registrationType: 'CRN',
          registrationNumber: 'CRN-3/4455',
          practiceAreas: 'Nutrição Clínica, Emagrecimento, Dietoterapia',
          expectedModule: 'ZemdaNutri',
          expectedKey: 'zemdaNutriEnabled',
          expectedDbColumn: 'zemda_nutri_enabled'
        },
        {
          step: 4,
          name: 'Nutricionista -> Terapeuta Ocupacional (CREFITO)',
          professionId: 'prof-terapia-ocupacional',
          professionName: 'Terapia Ocupacional',
          registrationType: 'CREFITO',
          registrationNumber: 'CREFITO-3/8899',
          practiceAreas: 'Integração Sensorial, Reabilitação Física, AVDs',
          expectedModule: 'ZemdaTO',
          expectedKey: 'zemdaToEnabled',
          expectedDbColumn: 'zemda_to_enabled'
        },
        {
          step: 5,
          name: 'Terapeuta Ocupacional -> Fisioterapeuta (CREFITO)',
          professionId: 'prof-fisioterapia',
          professionName: 'Fisioterapia',
          registrationType: 'CREFITO',
          registrationNumber: 'CREFITO-3/1122',
          practiceAreas: 'Fisioterapia Traumato-Ortopédica, Reabilitação',
          expectedModule: 'ZemdaFisio',
          expectedKey: 'zemdaFisioEnabled',
          expectedDbColumn: 'zemda_fisio_enabled'
        },
        {
          step: 6,
          name: 'Fisioterapeuta -> Cirurgião-Dentista (CRO)',
          professionId: 'prof-odontologia',
          professionName: 'Odontologia',
          registrationType: 'CRO',
          registrationNumber: 'CRO-SP/5544',
          practiceAreas: 'Ortodontia, Implantodontia, Clínica Geral',
          expectedModule: 'ZemdaOdonto',
          expectedKey: 'zemdaOdontoEnabled',
          expectedDbColumn: 'zemda_odonto_enabled'
        },
        {
          step: 7,
          name: 'Cirurgião-Dentista -> Psicopedagogo (ABPP)',
          professionId: 'prof-psicopedagogia',
          professionName: 'Psicopedagogia',
          registrationType: 'ABPP',
          registrationNumber: 'ABPP-SP/9988',
          practiceAreas: 'Dificuldades de Aprendizagem, Dislexia, TDAH',
          expectedModule: 'ZemdaPP',
          expectedKey: 'zemdaPPEnabled',
          expectedDbColumn: 'zemda_pp_enabled'
        }
      ];

      const all8Modules = [
        { key: 'zemdaFonoEnabled', col: 'zemda_fono_enabled', name: 'ZemdaFono' },
        { key: 'zemdaToEnabled', col: 'zemda_to_enabled', name: 'ZemdaTO' },
        { key: 'zemdaNutriEnabled', col: 'zemda_nutri_enabled', name: 'ZemdaNutri' },
        { key: 'zemdaPsicoEnabled', col: 'zemda_psico_enabled', name: 'ZemdaPsico' },
        { key: 'zemdaPPEnabled', col: 'zemda_pp_enabled', name: 'ZemdaPP' },
        { key: 'zemdaFisioEnabled', col: 'zemda_fisio_enabled', name: 'ZemdaFisio' },
        { key: 'zemdaOdontoEnabled', col: 'zemda_odonto_enabled', name: 'ZemdaOdonto' },
        { key: 'zemdaPersonalEnabled', col: 'zemda_personal_enabled', name: 'ZemdaPersonal' }
      ];

      for (const t of transitions) {
        console.log(`---------------------------------------------------------------`);
        console.log(`PASSO ${t.step}/7: ${t.name}`);
        console.log(`---------------------------------------------------------------`);

        // Reset do profession_change_used para validar cada salto sequencial neste teste
        db.prepare('UPDATE professionals SET profession_change_used = 0 WHERE id = ?').run(profId);

        // Executa PUT /v1/professionals/:id alterando para a nova profissão
        const updateRes = await makeRequest('PUT', `/v1/professionals/${profId}`, adminHeaders, {
          name: 'Dr. Auditor Multi-Módulos',
          professionId: t.professionId,
          registrationType: t.registrationType,
          registrationNumber: t.registrationNumber,
          practiceAreas: t.practiceAreas
        });

        if (updateRes.status !== 200) {
          throw new Error(`Falha no PUT /v1/professionals/${profId}: status ${updateRes.status} - ${JSON.stringify(updateRes.body)}`);
        }

        // 1. Verificar sincronização em professionals, users e clinic_users
        const pDb = db.prepare('SELECT * FROM professionals WHERE id = ?').get(profId);
        const uDb = db.prepare('SELECT * FROM users WHERE id = ?').get(testUserId);
        const cuDb = db.prepare('SELECT * FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(testUserId, tenantId);

        if (pDb.profession_id !== t.professionId || pDb.profession_name !== t.professionName) {
          throw new Error(`[DB professionals] Esperava ${t.professionId} (${t.professionName}), obteve ${pDb.profession_id} (${pDb.profession_name})`);
        }
        if (uDb.profession_id !== t.professionId || uDb.profession_name !== t.professionName) {
          throw new Error(`[DB users] Esperava ${t.professionId} (${t.professionName}), obteve ${uDb.profession_id} (${uDb.profession_name})`);
        }
        if (cuDb.profession_id !== t.professionId || cuDb.profession_name !== t.professionName) {
          throw new Error(`[DB clinic_users] Esperava ${t.professionId} (${t.professionName}), obteve ${cuDb.profession_id} (${cuDb.profession_name})`);
        }
        console.log(`  ✅ [DB] profession_id e profession_name perfeitamente sincronizados nas 3 tabelas`);

        // 2. Verificar exclusividade mútua no banco (apenas a coluna esperada = 1, as outras 7 = 0)
        for (const m of all8Modules) {
          const expectedVal = m.key === t.expectedKey ? 1 : 0;
          if (pDb[m.col] !== expectedVal) {
            throw new Error(`[DB professionals.${m.col}] Esperava ${expectedVal}, obteve ${pDb[m.col]}`);
          }
        }
        console.log(`  ✅ [DB] Exclusividade mútua confirmada no banco: apenas ${t.expectedDbColumn} = 1, demais 7 = 0`);

        // 3. Verificar se a permissão access_zemda_personal foi devidamente removida de clinic_users quando não for Personal
        if (t.expectedModule !== 'ZemdaPersonal') {
          const perms = JSON.parse(cuDb.permissions_json || '[]');
          if (perms.includes('access_zemda_personal')) {
            throw new Error(`[DB clinic_users] access_zemda_personal residual encontrada em permissions_json`);
          }
        }

        // 4. Testar chamada GET /v1/auth/me do usuário profissional para validar reloadSession
        const meRes = await makeRequest('GET', '/v1/auth/me', userHeaders);
        if (meRes.status !== 200) {
          throw new Error(`Falha no GET /v1/auth/me: status ${meRes.status} - ${JSON.stringify(meRes.body)}`);
        }

        const meUser = meRes.body.user;
        if (meUser.professionId !== t.professionId) {
          throw new Error(`[/auth/me] user.professionId esperava ${t.professionId}, obteve ${meUser.professionId}`);
        }

        for (const m of all8Modules) {
          const isExpected = m.key === t.expectedKey;
          const actualVal = Boolean(meUser[m.key]);
          if (actualVal !== isExpected) {
            throw new Error(`[/auth/me] Conflito em ${m.key}: esperava ${isExpected}, obteve ${actualVal}`);
          }
        }
        console.log(`  ✅ [/auth/me] Resolução atômica: apenas ${t.expectedKey} = true, demais 7 módulos = false`);

        // 5. Verificar que ZemdaBody Universal permanece ativo para todos os profissionais clínicos
        if (meUser.zemdaBodyEnabled !== true) {
          throw new Error(`[/auth/me] zemdaBodyEnabled deveria ser true para profissional clínico! Obteve: ${meUser.zemdaBodyEnabled}`);
        }
        console.log(`  ✅ [/auth/me] ZemdaBody Universal: zemdaBodyEnabled = true garantido`);
        console.log(`  🎉 Transição ${t.step} (${t.name}) APROVADA com 100% de conformidade!\n`);
      }

      console.log('===============================================================');
      console.log('TODAS AS 7 TRANSIÇÕES SEQUENCIAIS PASSARAM COM SUCESSO ABSOLUTO!');
      console.log('===============================================================');
      server.close();
      process.exit(0);
    } catch (err) {
      console.error('\n❌ FALHA NA AUDITORIA DE TRANSIÇÕES:', err.message);
      if (err.stack) console.error(err.stack);
      server.close();
      process.exit(1);
    }
  });
}

runSuite();
