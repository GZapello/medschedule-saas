/**
 * Testes Automatizados para:
 * 1. Teste grátis: obrigatoriedade da área de atuação profissional
 * 2. Teste grátis: criação garantida no Plano Solo (zemda-SOLO)
 * 3. Vínculo de profissão ao usuário, tenant e criação de professional
 * 4. Acesso automático aos módulos clínicos especializados conforme área profissional
 * 5. Remoção de permissões de módulos de profissão na equipe e controle exclusivo do ZemdaBody
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_trial_modules.db');
process.env.JWT_SECRET = 'test-secret-trial-modules-123';
process.env.PORT = '3097';

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
      port: 3097,
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
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data });
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
  const server = app.listen(3097);
  console.log('\n====================================================');
  console.log('INICIANDO TESTES: TESTE GRÁTIS SOLO & MÓDULOS POR PROFISSÃO');
  console.log('====================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. TESTE GRÁTIS: OBRIGATORIEDADE DA ÁREA DE ATUAÇÃO E PLANO SOLO
    // -------------------------------------------------------------------------
    console.log('--- 1. ATIVAÇÃO DE TESTE GRÁTIS ---');

    const trialToken = 'trial-tok-' + uuidv4().slice(0, 8);
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    db.prepare(`
      INSERT INTO free_trials (id, token, target_name, target_email, duration_days, duration_label, link_expires_at, status, created_by, created_at, updated_at)
      VALUES (?, ?, 'Clínica FonoVida', 'fono@teste.com', 7, '7 dias', ?, 'pending', 'superadmin-test', ?, ?)
    `).run('ft-1', trialToken, expiresIso, nowIso, nowIso);

    // 1.1 Tentativa de ativação SEM professionId deve falhar (400)
    const resNoArea = await makeRequest('POST', `/api/v1/public/free-trials/activate/${trialToken}`, {}, {
      clinicName: 'Clínica FonoVida',
      managerName: 'Dra. Beatriz Fono',
      managerEmail: 'fono@teste.com',
      managerPassword: 'senhaForte123',
      termsAccepted: true,
      privacyAccepted: true
    });

    assert(resNoArea.status === 400, 'Tentativa de ativação sem área de atuação retorna HTTP 400');
    assert(resNoArea.data?.error?.includes('área de atuação'), 'Mensagem de erro informa obrigatoriedade da área de atuação');

    // 1.2 Ativação COM professionId (Fonoaudiologia)
    const resSuccess = await makeRequest('POST', `/api/v1/public/free-trials/activate/${trialToken}`, {}, {
      clinicName: 'Clínica FonoVida',
      managerName: 'Dra. Beatriz Fono',
      managerEmail: 'fono@teste.com',
      managerPassword: 'senhaForte123',
      professionId: 'prof-fonoaudiologia',
      termsAccepted: true,
      privacyAccepted: true
    });

    assert(resSuccess.status === 200, 'Ativação com área profissional válida retorna HTTP 200');
    assert(resSuccess.data?.success === true, 'Flag success é true na resposta');
    assert(resSuccess.data?.user?.profession_id === 'prof-fonoaudiologia', 'Usuário retornado possui profession_id preenchido');
    assert(resSuccess.data?.user?.profession_name === 'Fonoaudiologia', 'Usuário retornado possui profession_name Fonoaudiologia');

    const createdTenantId = resSuccess.data?.tenant?.id;
    const createdUserId = resSuccess.data?.user?.id;

    // 1.3 Verificar se a assinatura foi criada SEMPRE no Plano Solo
    const subRow = db.prepare('SELECT plan_id, status FROM subscriptions WHERE clinic_id = ?').get(createdTenantId);
    assert(subRow && subRow.status === 'trial', 'Assinatura criada com status trial');
    assert(subRow && subRow.plan_id === 'zemda-SOLO', 'Assinatura de teste foi criada estritamente no Plano Solo (zemda-SOLO)');

    // 1.4 Verificar persistência no tenant e user
    const tenantRow = db.prepare('SELECT manager_profession, manager_practice_areas FROM tenants WHERE id = ?').get(createdTenantId);
    assert(tenantRow?.manager_profession === 'Fonoaudiologia', 'Tenant persistiu manager_profession = Fonoaudiologia');

    const userRow = db.prepare('SELECT profession_id, profession_name FROM users WHERE id = ?').get(createdUserId);
    assert(userRow?.profession_id === 'prof-fonoaudiologia', 'User persistiu profession_id = prof-fonoaudiologia');

    // 1.5 Verificar que o registro de professional foi criado
    const profRow = db.prepare('SELECT id, name, profession_id, active FROM professionals WHERE user_id = ?').get(createdUserId);
    assert(!!profRow, 'Registro na tabela professionals foi criado automaticamente para o gestor');
    assert(profRow?.profession_id === 'prof-fonoaudiologia', 'Profissional criado com profession_id correto');
    assert(profRow?.active === 1, 'Profissional criado está ativo');

    // -------------------------------------------------------------------------
    // 2. ACESSO AUTOMÁTICO AOS MÓDULOS CONFORME A PROFISSÃO
    // -------------------------------------------------------------------------
    console.log('\n--- 2. ACESSO AUTOMÁTICO POR PROFISSÃO ---');

    // Cria agendamento para a fonoaudióloga
    const apptId = 'appt-' + uuidv4().slice(0, 8);
    const patId = 'pat-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, email, phone, active, created_at, updated_at)
      VALUES (?, ?, 'Paciente Fono Teste', 'paciente@teste.com', '11999999999', 1, ?, ?)
    `).run(patId, createdTenantId, nowIso, nowIso);

    const srvFonoId = 'srv-fono-' + uuidv4().slice(0, 6);
    db.prepare(`
      INSERT INTO services (id, tenant_id, name, price, duration_minutes, active)
      VALUES (?, ?, 'Consulta Fonoaudiologia', 160.00, 40, 1)
    `).run(srvFonoId, createdTenantId);

    db.prepare(`
      INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, created_at, updated_at)
      VALUES (?, ?, 'AG-2026-FONO', ?, ?, ?, '2026-09-17T10:00:00Z', '2026-09-17T10:40:00Z', 'scheduled', ?, ?)
    `).run(apptId, createdTenantId, patId, profRow.id, srvFonoId, nowIso, nowIso);

    const authToken = resSuccess.data?.token;

    // 2.1 Verifica o completion endpoint: deve retornar ZemdaFono automaticamente
    const completionRes = await makeRequest('GET', `/api/v1/appointments/${apptId}/completion`, {
      'Authorization': `Bearer ${authToken}`,
      'x-tenant-id': createdTenantId
    });

    assert(completionRes.status === 200, 'Endpoint de completion retorna HTTP 200');
    assert(completionRes.data?.moduleType === 'ZemdaFono', 'Módulo deduzido automaticamente para Fonoaudiologia é ZemdaFono');

    // 2.2 Teste com profissional de Fisioterapia
    const physioUserId = 'usr-physio-' + uuidv4().slice(0, 6);
    const physioProfId = 'pro-physio-' + uuidv4().slice(0, 6);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, profession_id, profession_name, status, created_at, updated_at)
      VALUES (?, ?, 'Dr. Carlos Fisio', 'carlos@fisio.com', 'hash', 'professional', 'prof-fisioterapia', 'Fisioterapia', 'active', ?, ?)
    `).run(physioUserId, createdTenantId, nowIso, nowIso);

    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, slug, profession_id, practice_areas, buffer_minutes, active, created_at, updated_at)
      VALUES (?, ?, ?, 'Dr. Carlos Fisio', 'carlos-fisio', 'prof-fisioterapia', 'Fisioterapia Traumato-Ortopédica', 10, 1, ?, ?)
    `).run(physioProfId, createdTenantId, physioUserId, nowIso, nowIso);

    const srvPhysioId = 'srv-physio-' + uuidv4().slice(0, 6);
    db.prepare(`
      INSERT INTO services (id, tenant_id, name, price, duration_minutes, active)
      VALUES (?, ?, 'Sessão Fisioterapia', 180.00, 50, 1)
    `).run(srvPhysioId, createdTenantId);

    const apptPhysioId = 'appt-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, created_at, updated_at)
      VALUES (?, ?, 'AG-2026-FISIO', ?, ?, ?, '2026-09-17T14:00:00Z', '2026-09-17T15:00:00Z', 'scheduled', ?, ?)
    `).run(apptPhysioId, createdTenantId, patId, physioProfId, srvPhysioId, nowIso, nowIso);

    const physioToken = generateToken({
      userId: physioUserId,
      tenantId: createdTenantId,
      role: 'professional',
      email: 'carlos@fisio.com',
      name: 'Dr. Carlos Fisio'
    });

    const completionPhysioRes = await makeRequest('GET', `/api/v1/appointments/${apptPhysioId}/completion`, {
      'Authorization': `Bearer ${physioToken}`,
      'x-tenant-id': createdTenantId
    });

    assert(completionPhysioRes.status === 200, 'Endpoint completion do fisioterapeuta retorna HTTP 200');
    assert(completionPhysioRes.data?.moduleType === 'ZemdaFisio', 'Módulo deduzido automaticamente para Fisioterapia é ZemdaFisio');

    // -------------------------------------------------------------------------
    // 3. EQUIPE E PERMISSÕES: SEM MÓDULOS DE PROFISSÃO, APENAS ZEMDABODY
    // -------------------------------------------------------------------------
    console.log('\n--- 3. PERMISSÕES DE EQUIPE & ZEMDABODY ---');

    // 3.1 Atualizar permissões de equipe com access_zemda_body
    const staffUserId = 'usr-staff-' + uuidv4().slice(0, 6);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'Secretária Ana', 'ana@sec.com', 'hash', 'receptionist', 'active', ?, ?)
    `).run(staffUserId, createdTenantId, nowIso, nowIso);

    const updatePermsRes = await makeRequest('PUT', `/api/v1/staff/${staffUserId}/permissions`, {
      'Authorization': `Bearer ${authToken}`,
      'x-tenant-id': createdTenantId
    }, {
      permissions: ['view_schedule', 'create_appointment', 'access_zemda_body']
    });

    assert(updatePermsRes.status === 200, 'Atualização de permissões com access_zemda_body retorna HTTP 200');

    const cuStaff = db.prepare('SELECT permissions_json, zemda_body_enabled FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(staffUserId, createdTenantId);
    assert(cuStaff && cuStaff.zemda_body_enabled === 1, 'Flag zemda_body_enabled foi ativada como 1 no banco');
    assert(cuStaff?.permissions_json?.includes('access_zemda_body'), 'permissions_json contém access_zemda_body');

    // 3.2 Validação estática nos fontes frontend
    const staffSource = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/staff/StaffManagementView.tsx'), 'utf8');
    assert(!staffSource.includes('access_zemda_fisio'), 'Frontend StaffManagementView NÃO contém mais access_zemda_fisio');
    assert(!staffSource.includes('access_zemda_odonto'), 'Frontend StaffManagementView NÃO contém mais access_zemda_odonto');
    assert(staffSource.includes('access_zemda_body'), 'Frontend StaffManagementView contém access_zemda_body');

    const authContextSource = fs.readFileSync(path.resolve(__dirname, '../frontend/src/context/AuthContext.tsx'), 'utf8');
    assert(!authContextSource.includes("userPermissions.includes('access_zemda_fisio')"), 'AuthContext não utiliza mais permissão manual para ZemdaFisio');
    assert(!authContextSource.includes("userPermissions.includes('access_zemda_odonto')"), 'AuthContext não utiliza mais permissão manual para ZemdaOdonto');
    assert(authContextSource.includes("isZemdaBody = isClinicAdmin || userPermissions.includes('access_zemda_body')"), 'AuthContext define isZemdaBody via permissão access_zemda_body');

    const freeTrialSource = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/auth/FreeTrialActivationView.tsx'), 'utf8');
    assert(freeTrialSource.includes('Área de Atuação do Profissional'), 'FreeTrialActivationView renderiza campo obrigatório de Área de Atuação');
    assert(freeTrialSource.includes('professionId: selectedProfessionId'), 'FreeTrialActivationView envia professionId no payload de ativação');

    const sidebarSource = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/common/Sidebar.tsx'), 'utf8');
    assert(sidebarSource.includes('visible: isClinicAdmin || isZemdaBody'), 'Sidebar controla ZemdaBody via isZemdaBody');

  } catch (err) {
    console.error('Erro durante execução dos testes:', err);
    failedTests++;
  } finally {
    server.close();
    console.log('\n====================================================');
    console.log(`RESULTADO DOS TESTES: ${passedTests} PASSOU, ${failedTests} FALHOU`);
    console.log('====================================================\n');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runTests();
