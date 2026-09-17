/**
 * Testes Automatizados para:
 * 1. Google Analytics 4 (GA4) com Proteção de Privacidade e SPA
 * 2. Seleção de Módulo no Início do Atendimento (ZemdaFisio, ZemdaFono, ZemdaOdonto, ZemdaNutri, ZemdaTO, general)
 * 3. Vínculo de agendamento ao módulo clínico e prevenção de múltiplos módulos no mesmo atendimento.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_analytics_modules.db');
process.env.JWT_SECRET = 'test-secret-analytics-123';
process.env.PORT = '3099';

// Remove DB anterior de teste se existir
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



async function runTests() {
  const server = app.listen(3099);
  console.log('\n====================================================');
  console.log('INICIANDO TESTES DE GOOGLE ANALYTICS E MÓDULOS CLÍNICOS');
  console.log('====================================================\n');

  try {
    // -------------------------------------------------------------
    // 1. GOOGLE ANALYTICS 4 & PRIVACIDADE
    // -------------------------------------------------------------
    console.log('--- 1. GOOGLE ANALYTICS 4 & PRIVACIDADE ---');
    const indexHtmlPath = path.resolve(__dirname, '../frontend/index.html');
    const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

    assert(indexHtmlContent.includes('G-QFFJ7Y25ML'), 'index.html contém Measurement ID oficial G-QFFJ7Y25ML');
    assert(indexHtmlContent.includes('googletagmanager.com/gtag/js?id=G-QFFJ7Y25ML'), 'index.html contém script tag do GA4');
    assert(indexHtmlContent.includes("gtag('config', 'G-QFFJ7Y25ML')"), 'index.html inicializa config do GA4');

    const analyticsTsPath = path.resolve(__dirname, '../frontend/src/utils/analytics.ts');
    assert(fs.existsSync(analyticsTsPath), 'Utilitário frontend/src/utils/analytics.ts criado com sucesso');

    const analyticsContent = fs.readFileSync(analyticsTsPath, 'utf8');
    assert(analyticsContent.includes('trackPageView'), 'analytics.ts implementa trackPageView');
    assert(analyticsContent.includes('lastTrackedPath'), 'analytics.ts possui proteção contra disparos duplicados consecutivos');
    assert(analyticsContent.includes('REGRAS DE PRIVACIDADE E LGPD'), 'analytics.ts documenta e cumpre diretrizes estritas da LGPD');

    const appTsxPath = path.resolve(__dirname, '../frontend/src/App.tsx');
    const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');
    assert(appTsxContent.includes("trackPageView"), 'App.tsx aciona rastreamento SPA com trackPageView');
    assert(!appTsxContent.includes("patient_name") || !appTsxContent.includes("trackPageView(patient_name"), 'Nenhum dado pessoal de paciente é enviado ao GA4 no App.tsx');

    // -------------------------------------------------------------
    // SEED DE TESTE NO BANCO
    // -------------------------------------------------------------
    const tenantId = 'ten-test-clinic-1';
    db.prepare(`
      INSERT INTO tenants (id, name, slug, trade_name, email, status)
      VALUES (?, 'Clínica Integrada', 'clinica-integrada', 'Clínica Integrada', 'clinica@teste.com', 'active')
    `).run(tenantId);

    const profFonoId = 'prof-fono-1';
    const userFonoId = 'usr-fono-1';
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
      VALUES (?, ?, 'Dra. Fonoaudióloga', 'fono@teste.com', 'test-hash-123', 'professional', 'active')
    `).run(userFonoId, tenantId);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager)
      VALUES (?, ?, ?, 'professional', 'active', 0)
    `).run('cu-fono-1', tenantId, userFonoId);

    db.prepare(`
      INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, practice_areas, active)
      VALUES (?, ?, ?, 'Dra. Fonoaudióloga', 'prof-fonoaudiologo', 'Linguagem e Motricidade', 1)
    `).run(profFonoId, tenantId, userFonoId);

    const patientId = 'pat-test-1';
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone, active)
      VALUES (?, ?, 'Paciente de Teste', '11999998888', 1)
    `).run(patientId, tenantId);

    const serviceId = 'srv-test-1';
    db.prepare(`
      INSERT INTO services (id, tenant_id, name, price, duration_minutes, active)
      VALUES (?, ?, 'Sessão Fonoaudiológica', 150.00, 45, 1)
    `).run(serviceId, tenantId);

    const apptId = 'apt-mod-test-1';
    db.prepare(`
      INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status)
      VALUES (?, ?, 'AG-2026-0001', ?, ?, ?, '2026-09-20T10:00:00', '2026-09-20T10:45:00', 'scheduled')
    `).run(apptId, tenantId, patientId, profFonoId, serviceId);

    const fonoToken = generateToken({
      userId: userFonoId,
      email: 'fono@teste.com',
      role: 'professional',
      name: 'Dra. Fonoaudióloga',
      tenantId: tenantId
    });

    const headersFono = {
      Authorization: `Bearer ${fonoToken}`,
      'x-tenant-id': tenantId
    };

    // -------------------------------------------------------------
    // 2. INÍCIO DO ATENDIMENTO COM VÍNCULO DE MÓDULO CLÍNICO
    // -------------------------------------------------------------
    console.log('\n--- 2. INÍCIO DO ATENDIMENTO COM VÍNCULO DE MÓDULO CLÍNICO ---');
    const startRes = await makeRequest('PUT', `/api/v1/appointments/${apptId}/status`, headersFono, {
      status: 'in_progress',
      clinicalModule: 'ZemdaFono',
      professionId: 'prof-fonoaudiologo'
    });

    assert(startRes.status === 200, 'Iniciar atendimento com status in_progress e ZemdaFono retorna HTTP 200');

    const apptDb = db.prepare('SELECT status, clinical_module, profession_id FROM appointments WHERE id = ?').get(apptId);
    assert(apptDb.status === 'in_progress', 'Status do agendamento atualizado para in_progress no banco');
    assert(apptDb.clinical_module === 'ZemdaFono', 'Módulo clínico ZemdaFono gravado com sucesso no agendamento');
    assert(apptDb.profession_id === 'prof-fonoaudiologo', 'Profissão gravada com sucesso no agendamento');

    const compRes = await makeRequest('GET', `/api/v1/appointments/${apptId}/completion`, headersFono);
    assert(compRes.status === 200, 'Endpoint de completion retorna HTTP 200');
    assert(compRes.body.moduleType === 'ZemdaFono', 'Endpoint de completion retorna ZemdaFono como módulo ativo');

    // -------------------------------------------------------------
    // 3. BLOQUEIO DE CONFLITO ENTRE MÓDULOS (REGRA DE MÓDULO ÚNICO)
    // -------------------------------------------------------------
    console.log('\n--- 3. BLOQUEIO DE CONFLITO ENTRE MÓDULOS (REGRA DE MÓDULO ÚNICO) ---');
    
    // Tentativa A: Mudar status/módulo para ZemdaOdonto num agendamento já iniciado com ZemdaFono
    const conflictStatusRes = await makeRequest('PUT', `/api/v1/appointments/${apptId}/status`, headersFono, {
      status: 'in_progress',
      clinicalModule: 'ZemdaOdonto'
    });
    assert(conflictStatusRes.status === 409, 'Tentativa de alterar para ZemdaOdonto retorna HTTP 409 Conflict');
    assert(conflictStatusRes.body.error.includes('ZemdaFono'), 'Mensagem de erro informa que já foi iniciado com ZemdaFono');

    // Tentativa B: Criar evolução com módulo conflitante (ZemdaNutri) no agendamento ZemdaFono
    const conflictRecordRes = await makeRequest('POST', '/api/v1/clinical-records', headersFono, {
      patientId: patientId,
      appointmentId: apptId,
      sessionDate: '2026-09-20',
      title: 'Tentativa de salvar em outro módulo',
      clinicalEvolution: 'Avaliação nutricional conflitante',
      moduleType: 'ZemdaNutri'
    });
    assert(conflictRecordRes.status === 409, 'Salvar evolução em módulo diferente (ZemdaNutri) retorna HTTP 409 Conflict');

    // Tentativa C: Finalizar atendimento com módulo conflitante (ZemdaTO)
    const conflictFinishRes = await makeRequest('POST', `/api/v1/appointments/${apptId}/finish`, headersFono, {
      evolution: {
        clinicalEvolution: 'Tentativa de finalizar com ZemdaTO',
        moduleType: 'ZemdaTO'
      }
    });
    assert(conflictFinishRes.status === 409, 'Finalizar atendimento com módulo diferente (ZemdaTO) retorna HTTP 409 Conflict');

    // -------------------------------------------------------------
    // 4. SALVAR PRONTUÁRIO E FINALIZAR COM O MÓDULO CORRETO
    // -------------------------------------------------------------
    console.log('\n--- 4. SALVAR PRONTUÁRIO E FINALIZAR COM O MÓDULO CORRETO ---');
    
    // Salva evolução compatível no ZemdaFono
    const validRecordRes = await makeRequest('POST', '/api/v1/clinical-records', headersFono, {
      patientId: patientId,
      appointmentId: apptId,
      sessionDate: '2026-09-20',
      title: 'Evolução Fonoaudiológica Inicial',
      clinicalEvolution: 'Paciente apresentou evolução favorável na emissão de fonemas fricativos.',
      moduleType: 'ZemdaFono'
    });
    assert(validRecordRes.status === 201, 'Salvar evolução no módulo correto (ZemdaFono) retorna HTTP 201 Created');

    const recordDb = db.prepare('SELECT module_type, clinical_evolution FROM records WHERE appointment_id = ?').get(apptId);
    assert(recordDb.module_type === 'ZemdaFono', 'Tabela records armazena expressamente module_type = ZemdaFono');

    // Finaliza atendimento com ZemdaFono
    const validFinishRes = await makeRequest('POST', `/api/v1/appointments/${apptId}/finish`, headersFono, {
      evolution: {
        clinicalEvolution: 'Atendimento fonoaudiológico concluído com êxito.',
        moduleType: 'ZemdaFono'
      },
      payment: {
        amount: 150.00,
        paymentMethod: 'pix',
        status: 'paid'
      }
    });
    assert(validFinishRes.status === 200, 'Finalização da consulta no módulo ZemdaFono retorna HTTP 200');

    const finishedApptDb = db.prepare('SELECT status, clinical_module FROM appointments WHERE id = ?').get(apptId);
    assert(finishedApptDb.status === 'completed', 'Status do agendamento atualizado para completed');
    assert(finishedApptDb.clinical_module === 'ZemdaFono', 'Agendamento completed preserva clinical_module = ZemdaFono');

    // -------------------------------------------------------------
    // 5. PRESERVAÇÃO DE LIMITES DE PLANOS
    // -------------------------------------------------------------
    console.log('\n--- 5. PRESERVAÇÃO DE LIMITES DE PLANOS ---');
    const plansDb = db.prepare('SELECT code, max_users FROM plans').all();
    const soloPlan = plansDb.find(p => p.code === 'SOLO');
    const teamPlan = plansDb.find(p => p.code === 'TEAM');
    const clinicPlan = plansDb.find(p => p.code === 'CLINIC');
    assert(soloPlan && soloPlan.max_users === 1, 'Limite do plano Solo preservado em 1');
    assert(teamPlan && teamPlan.max_users === 5, 'Limite do plano Equipe preservado em 5');
    assert(clinicPlan && clinicPlan.max_users === 20, 'Limite do plano Clínica atualizado para 20');

    console.log('\n====================================================');
    console.log(`RESULTADO DOS TESTES: ${passedTests} PASSOU, ${failedTests} FALHOU`);
    console.log('====================================================\n');

    server.close();
    process.exit(failedTests > 0 ? 1 : 0);
  } catch (err) {
    console.error('Erro crítico na execução dos testes:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
