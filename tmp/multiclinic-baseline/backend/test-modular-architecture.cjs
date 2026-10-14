const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_modular_arch.db');
process.env.JWT_SECRET = 'test-secret-modular-arch-xyz';
process.env.PORT = '3101';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  try {
    fs.unlinkSync(process.env.DATABASE_PATH);
  } catch (e) {}
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { generateToken } = require('./dist/utils/jwt');
const { CapabilityService } = require('./dist/services/capability.service');
const { SandboxService } = require('./dist/services/sandbox.service');

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
      port: 3101,
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

async function runTestSuite() {
  const server = app.listen(3101, async () => {
    console.log('===============================================================');
    console.log('TESTES DE INTEGRAÇÃO: ARQUITETURA MODULAR, ZEMDAMED & SANDBOX');
    console.log('Servidor de teste ativo na porta 3101');
    console.log('===============================================================\n');

    try {
      const nowIso = new Date().toISOString();
      const realTenantId = 'ten-' + uuidv4().slice(0, 8);
      const superAdminUserId = 'usr-super-' + uuidv4().slice(0, 8);
      const doctorUserId = 'usr-doc-' + uuidv4().slice(0, 8);
      const doctorProfId = 'pro-doc-' + uuidv4().slice(0, 8);
      const patientId = 'pat-' + uuidv4().slice(0, 8);

      // 1. Criar dados reais de teste
      db.prepare(`INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at) VALUES (?, ?, ?, 'clinica@real.com', 'active', ?, ?)`).run(
        realTenantId, 'Clínica Médica Real', 'clinica-med-real', nowIso, nowIso
      );

      // SuperAdmin
      db.prepare(`INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at) VALUES (?, 'SuperAdmin Global', 'admin@zemda.global', 'hash', 'superadmin', 'active', ?, ?)`).run(
        superAdminUserId, nowIso, nowIso
      );

      // Médico Real
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, profession_id, profession_name, registration_type, created_at, updated_at) VALUES (?, ?, 'Dr. Carlos Médico', 'carlos@clinica.com', 'hash', 'professional', 'active', 'prof-medico', 'Medicina', 'CRM', ?, ?)`).run(
        doctorUserId, realTenantId, nowIso, nowIso
      );
      db.prepare(`INSERT INTO clinic_users (id, tenant_id, user_id, role, status, profession_id, profession_name, created_at) VALUES (?, ?, ?, 'professional', 'active', 'prof-medico', 'Medicina', ?)`).run(
        uuidv4(), realTenantId, doctorUserId, nowIso
      );
      db.prepare(`INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, registration_type, registration_number, practice_areas, active, created_at, updated_at) VALUES (?, ?, ?, 'Dr. Carlos Médico', 'prof-medico', 'Medicina', 'CRM', '12345/SP', 'Clínica Médica Geral', 1, ?, ?)`).run(
        doctorProfId, realTenantId, doctorUserId, nowIso, nowIso
      );

      // Paciente Real
      db.prepare(`INSERT INTO patients (id, tenant_id, full_name, email, phone, created_at, updated_at) VALUES (?, ?, 'Paciente de Teste', 'paciente@teste.com', '(11) 98888-7777', ?, ?)`).run(
        patientId, realTenantId, nowIso, nowIso
      );

      // Serviço para o agendamento
      const testServiceId = 'srv-' + uuidv4().slice(0, 8);
      db.prepare(`INSERT INTO services (id, tenant_id, name, duration_minutes, price, active, created_at, updated_at) VALUES (?, ?, 'Consulta Geral', 50, 250.0, 1, ?, ?)`).run(
        testServiceId, realTenantId, nowIso, nowIso
      );

      // Vínculo de assistência do médico com o paciente (para bypass do sigilo LGPD)
      db.prepare(`INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, start_time, end_time, status, created_at, updated_at) VALUES (?, ?, 'AG-TEST-001', ?, ?, ?, ?, ?, 'scheduled', ?, ?)`).run(
        'app-' + uuidv4().slice(0, 8), realTenantId, patientId, doctorProfId, testServiceId, nowIso, nowIso, nowIso, nowIso
      );

      const superAdminToken = generateToken({
        userId: superAdminUserId,
        name: 'SuperAdmin Global',
        email: 'admin@zemda.global',
        role: 'superadmin',
        tenantId: null
      });

      const doctorToken = generateToken({
        userId: doctorUserId,
        name: 'Dr. Carlos Médico',
        email: 'carlos@clinica.com',
        role: 'professional',
        tenantId: realTenantId
      });

      const superAdminHeaders = {
        'Authorization': `Bearer ${superAdminToken}`
      };

      const doctorHeaders = {
        'Authorization': `Bearer ${doctorToken}`,
        'X-Tenant-Id': realTenantId
      };

      // -------------------------------------------------------------
      // TESTE 1: Cálculo e União de Capabilities por Profissão
      // -------------------------------------------------------------
      console.log('TESTE 1: Validando Cálculo e Resolução de Capabilities (Union & Rules)...');

      // 1.1 Médico Geral
      const docCaps = CapabilityService.calculateCapabilities({
        professionId: 'prof-medico',
        commercialModule: 'ZemdaMed',
        practiceAreaIds: ['pa-med-clinica']
      });

      if (!docCaps.activeCapabilities.includes('MEDICAL_BASE')) {
        throw new Error('Médico deveria ter capability MEDICAL_BASE ativa.');
      }
      if (!docCaps.activeCapabilities.includes('CORE_PRESCRIPTIONS')) {
        throw new Error('Médico deveria ter capability CORE_PRESCRIPTIONS ativa.');
      }
      if (!docCaps.activeCapabilities.includes('MEDICAL_SOAP')) {
        throw new Error('Médico deveria ter capability MEDICAL_SOAP ativa.');
      }
      console.log('  ✅ [Médico] Capabilities médicas fundamentais ativas por padrão.');

      // 1.2 Psicólogo não deve ter acesso a consulta médica (regra HIDDEN estrita)
      const psicoCaps = CapabilityService.calculateCapabilities({
        professionId: 'prof-psicologo',
        commercialModule: 'ZemdaPsico',
        practiceAreaIds: [],
        selectedOptionalCapabilities: ['MEDICAL_BASE'] // tentativa de ativar
      });

      if (psicoCaps.activeCapabilities.includes('MEDICAL_BASE')) {
        throw new Error('Psicólogo NÃO pode ter MEDICAL_BASE ativa mesmo se solicitado!');
      }
      if (!psicoCaps.hiddenCapabilities.includes('MEDICAL_BASE')) {
        throw new Error('MEDICAL_BASE deve constar em hiddenCapabilities para Psicólogo.');
      }
      console.log('  ✅ [Psicologia] Incompatibilidade estrita (HIDDEN) respeitada para consultas médicas.');

      // 1.3 Personal Trainer não deve ter acesso a prescrição médica
      const ptCaps = CapabilityService.calculateCapabilities({
        professionId: 'prof-personal-trainer',
        commercialModule: 'ZemdaPersonal',
        practiceAreaIds: [],
        selectedOptionalCapabilities: ['CORE_PRESCRIPTIONS', 'MEDICAL_BASE']
      });

      if (ptCaps.activeCapabilities.includes('CORE_PRESCRIPTIONS')) {
        throw new Error('Personal Trainer NÃO pode ter CORE_PRESCRIPTIONS!');
      }
      console.log('  ✅ [Personal Trainer] Incompatibilidades estritas (HIDDEN) blindadas.');

      // -------------------------------------------------------------
      // TESTE 2: API de Meus Recursos Profissionais
      // -------------------------------------------------------------
      console.log('\nTESTE 2: Validando API de "Meus Recursos Profissionais"...');

      const myResourcesRes = await makeRequest('GET', '/v1/capabilities/my-resources', doctorHeaders);
      if (myResourcesRes.status !== 200) {
        throw new Error(`GET /v1/capabilities/my-resources falhou: ${myResourcesRes.status}`);
      }
      if (myResourcesRes.body.commercialModule !== 'ZemdaMed') {
        throw new Error(`Esperava commercialModule ZemdaMed, obteve ${myResourcesRes.body.commercialModule}`);
      }
      console.log('  ✅ [API] GET /v1/capabilities/my-resources retornou dados do médico com commercialModule ZemdaMed.');

      // Atualizar áreas de atuação do médico
      const updateAreasRes = await makeRequest('PUT', '/v1/capabilities/my-practice-areas', doctorHeaders, {
        practiceAreaIds: ['pa-med-clinica', 'pa-med-cardio']
      });
      if (updateAreasRes.status !== 200) {
        throw new Error(`PUT /v1/capabilities/my-practice-areas falhou: ${updateAreasRes.status}`);
      }
      console.log('  ✅ [API] PUT /v1/capabilities/my-practice-areas atualizou áreas com sucesso.');

      // -------------------------------------------------------------
      // TESTE 3: API do Módulo ZemdaMed (Consultas Médicas & Selagem)
      // -------------------------------------------------------------
      console.log('\nTESTE 3: Validando Módulo ZemdaMed (Criar e Finalizar Consulta)...');

      // 3.1 Criar Consulta
      const createConsRes = await makeRequest('POST', '/v1/medical/consultations', doctorHeaders, {
        patientId,
        specialtyPreset: 'cardiologia',
        chiefComplaint: 'Dor precordial atípica em esforço moderado há 2 semanas',
        hpi: 'Paciente relata episódios de desconforto torácico opressivo...',
        vitalSigns: {
          bloodPressureSystolic: 135,
          bloodPressureDiastolic: 85,
          heartRate: 78,
          respiratoryRate: 16,
          oxygenSaturation: 98,
          temperature: 36.4,
          weight: 78,
          height: 1.76,
          bmi: 25.2
        },
        cidCode: 'I20.9',
        cidDescription: 'Angina pectoris, não especificada',
        clinicalConduct: 'Solicito ECG de repouso e Teste Ergométrico. Prescrevo AAS 100mg/dia.'
      });

      if (createConsRes.status !== 201) {
        throw new Error(`POST /v1/medical/consultations falhou: ${createConsRes.status} - ${JSON.stringify(createConsRes.body)}`);
      }
      const consultationId = createConsRes.body.id;
      console.log(`  ✅ [ZemdaMed] Consulta médica criada com sucesso: ID ${consultationId}`);

      // 3.2 Buscar Consulta criada
      const getConsRes = await makeRequest('GET', `/v1/medical/consultations/${consultationId}`, doctorHeaders);
      if (getConsRes.status !== 200) {
        throw new Error(`GET /v1/medical/consultations/${consultationId} falhou: ${getConsRes.status}`);
      }
      if (getConsRes.body.cid_code !== 'I20.9') {
        throw new Error(`Esperava CID-10 I20.9, obteve ${getConsRes.body.cid_code}`);
      }
      if (getConsRes.body.vitalSigns.bloodPressureSystolic !== 135) {
        throw new Error(`Esperava PA 135, obteve ${getConsRes.body.vitalSigns.bloodPressureSystolic}`);
      }
      console.log('  ✅ [ZemdaMed] Consulta obtida e sinais vitais perfeitamente deserializados.');

      // 3.3 Finalizar Consulta e Registrar no Prontuário Geral Selado
      const finishConsRes = await makeRequest('POST', '/v1/medical/finish-consultation', doctorHeaders, {
        patientId,
        specialtyPreset: 'cardiologia',
        chiefComplaint: 'Dor precordial atípica em esforço moderado há 2 semanas',
        clinicalConduct: 'Solicito ECG de repouso e Teste Ergométrico. Prescrevo AAS 100mg/dia.',
        returnInDays: 30
      });

      if (finishConsRes.status !== 201) {
        throw new Error(`POST /v1/medical/finish-consultation falhou: ${finishConsRes.status} - ${JSON.stringify(finishConsRes.body)}`);
      }
      const recordId = finishConsRes.body.recordId;

      // Verificar registro no prontuário geral
      const recDb = db.prepare('SELECT * FROM records WHERE id = ?').get(recordId);
      if (!recDb) {
        throw new Error(`Registro ${recordId} não foi encontrado na tabela records!`);
      }
      if (recDb.is_sealed !== 1) {
        throw new Error(`Registro no prontuário geral deveria estar selado (is_sealed = 1).`);
      }
      const techNotes = JSON.parse(recDb.technical_notes || '{}');
      if (techNotes.moduleType !== 'ZemdaMed') {
        throw new Error(`Esperava moduleType ZemdaMed em technical_notes, obteve ${techNotes.moduleType}`);
      }
      console.log(`  ✅ [ZemdaMed] Consulta finalizada e gravada com selo inviolável no prontuário (ID: ${recordId}).`);

      // -------------------------------------------------------------
      // TESTE 4: SuperAdmin Zemda Laboratory & Isolamento de Sandbox
      // -------------------------------------------------------------
      console.log('\nTESTE 4: Validando Laboratório SuperAdmin Sandbox & Isolamento...');

      const sandboxSessionRes = await makeRequest('POST', '/v1/sandbox/create-session', superAdminHeaders, {
        professionId: 'prof-pediatra',
        practiceAreaIds: ['pa-med-pediatria'],
        planCode: 'CLINIC'
      });

      if (sandboxSessionRes.status !== 201) {
        throw new Error(`POST /v1/sandbox/create-session falhou: ${sandboxSessionRes.status} - ${JSON.stringify(sandboxSessionRes.body)}`);
      }

      const sessionId = sandboxSessionRes.body.sessionId;
      const sandboxTenantId = sandboxSessionRes.body.sandboxTenantId || sandboxSessionRes.body.tenant?.id;
      const sandboxToken = sandboxSessionRes.body.token;
      if (!sandboxTenantId.startsWith('sbx-tenant-')) {
        throw new Error(`Tenant de sandbox inválido: ${sandboxTenantId}`);
      }
      console.log(`  ✅ [Sandbox] Sessão criada com isolamento garantido: ${sandboxTenantId}`);

      // Verificar dados mockados criados no sandbox
      const mockPatients = db.prepare('SELECT count(*) as c FROM patients WHERE tenant_id = ?').get(sandboxTenantId);
      if (mockPatients.c < 1) {
        throw new Error('Sandbox deveria ter semeado pacientes simulados automaticamente.');
      }
      console.log(`  ✅ [Sandbox] ${mockPatients.c} pacientes simulados semeados no sandbox.`);

      // Resetar dados do Sandbox
      const sandboxHeaders = {
        'Authorization': `Bearer ${sandboxToken}`,
        'X-Tenant-Id': sandboxTenantId
      };
      const resetRes = await makeRequest('POST', '/v1/sandbox/reset', sandboxHeaders, {
        tenantId: sandboxTenantId
      });
      if (resetRes.status !== 200) {
        throw new Error(`POST /v1/sandbox/reset falhou: ${resetRes.status} - ${JSON.stringify(resetRes.body)}`);
      }
      console.log('  ✅ [Sandbox] Reset do ambiente isolado executado com sucesso.');

      // Verificar que o tenant REAL permaneceu completamente intocado
      const realPatientsCount = db.prepare('SELECT count(*) as c FROM patients WHERE tenant_id = ?').get(realTenantId);
      if (realPatientsCount.c !== 1) {
        throw new Error('O reset do sandbox afetou dados do tenant real! Quebra crítica de isolamento.');
      }
      console.log('  ✅ [Sandbox] Integridade confirmada: Tenant real permaneceu 100% intacto e isolado.');

      console.log('\n===============================================================');
      console.log('TODOS OS TESTES DA REMODELAGEM ESTRUTURAL FORAM APROVADOS! 🚀');
      console.log('===============================================================');

      server.close();
      process.exit(0);
    } catch (err) {
      console.error('\n❌ ERRO NA SUITE DE TESTES:', err);
      server.close();
      process.exit(1);
    }
  });
}

runTestSuite();
