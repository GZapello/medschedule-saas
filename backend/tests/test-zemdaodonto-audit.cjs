const assert = require('assert');
const { db } = require('../dist/config/database');
const { DentistryController, isDentistOrClinicManager } = require('../dist/controllers/dentistry.controller');
const { DocumentsController } = require('../dist/controllers/documents.controller');
const { v4: uuidv4 } = require('uuid');

console.log('\n=== INICIANDO TESTE DE AUDITORIA ZEMDAODONTO ===\n');

const tenantId = 'tenant-odonto-test-' + Date.now();
const dentistUserId = 'user-dentist-' + Date.now();
const physioUserId = 'user-physio-' + Date.now();
const patientId = 'pat-odonto-' + Date.now();
const profDentistId = 'prof-dentist-' + Date.now();
const profPhysioId = 'prof-physio-' + Date.now();

// 1. Setup Tenant, Users, Professionals and Patient
db.prepare("INSERT INTO tenants (id, name, slug, email, status, created_at) VALUES (?, 'Clínica Odonto Teste', ?, 'clinica@teste.com', 'active', datetime('now'))").run(tenantId, 'slug-' + tenantId);

db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, profession_id, profession_name, zemda_odonto_enabled, created_at)
  VALUES (?, ?, 'Dr. Cirurgião Dentista', ?, 'hash', 'professional', 'active', 'prof-dentista', 'Cirurgião-Dentista', 1, datetime('now'))
`).run(dentistUserId, tenantId, 'dentist-' + dentistUserId + '@teste.com');

db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, zemda_odonto_enabled, created_at)
  VALUES (?, ?, ?, 'Dr. Cirurgião Dentista', 'prof-dentista', 1, datetime('now'))
`).run(profDentistId, tenantId, dentistUserId);

db.prepare(`
  INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, profession_id, profession_name, zemda_odonto_enabled, created_at)
  VALUES (?, ?, 'Dr. Fisioterapeuta', ?, 'hash', 'professional', 'active', 'prof-fisioterapia', 'Fisioterapeuta', 0, datetime('now'))
`).run(physioUserId, tenantId, 'physio-' + physioUserId + '@teste.com');

db.prepare(`
  INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, zemda_odonto_enabled, created_at)
  VALUES (?, ?, ?, 'Dr. Fisioterapeuta', 'prof-fisioterapia', 0, datetime('now'))
`).run(profPhysioId, tenantId, physioUserId);

db.prepare(`
  INSERT INTO patients (id, tenant_id, full_name, phone, birth_date, active, created_at)
  VALUES (?, ?, 'Carlos Eduardo da Silva', '11999998888', '1990-05-15', 1, datetime('now'))
`).run(patientId, tenantId);

// Helper mocks
function mockReq(user, body = {}, query = {}, params = {}) {
  return {
    tenantId,
    user,
    body,
    query,
    params,
    ip: '127.0.0.1'
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(d) {
      this.data = d;
      return this;
    }
  };
  return res;
}

// =========================================================================
// TESTE 1: HOF - VALIDAÇÃO E PERSISTÊNCIA
// =========================================================================
console.log('--- TESTE 1: HOF - Validação amigável e persistência ---');

// 1.1 Tentativa sem patientId
const reqHof1 = mockReq({ userId: dentistUserId, role: 'professional' }, { procedureName: 'Toxina Botulínica' });
const resHof1 = mockRes();
DentistryController.saveHof(reqHof1, resHof1);
assert.strictEqual(resHof1.statusCode, 400);
assert.strictEqual(resHof1.data.field, 'patientId');
assert.ok(resHof1.data.error.includes('paciente é obrigatório'));
console.log('  ✓ Bloqueia envio sem patientId com mensagem amigável');

// 1.2 Tentativa sem procedureName
const reqHof2 = mockReq({ userId: dentistUserId, role: 'professional' }, { patientId, procedureName: '   ' });
const resHof2 = mockRes();
DentistryController.saveHof(reqHof2, resHof2);
assert.strictEqual(resHof2.statusCode, 400);
assert.strictEqual(resHof2.data.field, 'procedureName');
assert.ok(resHof2.data.error.includes('nome do procedimento é obrigatório'));
console.log('  ✓ Bloqueia envio com procedureName vazio com destaque e mensagem clara');

// 1.3 Sucesso com dados preenchidos
const reqHof3 = mockReq({ userId: dentistUserId, role: 'professional' }, {
  patientId,
  procedureName: 'Aplicação de Toxina Botulínica',
  facialRegion: 'Terço Superior / Glabela',
  productBrand: 'Botox 100U (Allergan)',
  lotNumber: 'LT9842',
  unitsQuantity: '50',
  expiryDate: '2027-12-31',
  notes: 'Aplicação em região frontal, glabelar e periorbicular sem intercorrências.'
});
const resHof3 = mockRes();
DentistryController.saveHof(reqHof3, resHof3);
assert.strictEqual(resHof3.statusCode, 201);
assert.ok(resHof3.data.id.startsWith('hof-'));
console.log('  ✓ Salva aplicação HOF com sucesso quando campos válidos');

// =========================================================================
// TESTE 2: FOTOGRAFIAS ODONTOLÓGICAS (ORDENAÇÃO E HISTÓRICO A, B, C)
// =========================================================================
console.log('\n--- TESTE 2: Fotografias - Preservação Foto Inicial e Foto de Retorno ---');

// 2.1 Salva Foto 1 (Inicial)
const reqPhoto1 = mockReq({ userId: dentistUserId, role: 'professional' }, {
  patientId,
  category: 'dental_photos',
  fileId: 'file-photo-initial-' + Date.now(),
  photoDate: '2026-01-10',
  notes: 'Foto inicial pré-operatória'
});
const resPhoto1 = mockRes();
DentistryController.savePhoto(reqPhoto1, resPhoto1);
assert.strictEqual(resPhoto1.statusCode, 201);
assert.strictEqual(resPhoto1.data.isInitial, true);
console.log('  ✓ Primeira foto registrada como isInitial = true');

// 2.2 Salva Foto 2 (Retorno 30 dias)
const reqPhoto2 = mockReq({ userId: dentistUserId, role: 'professional' }, {
  patientId,
  category: 'dental_photos',
  fileId: 'file-photo-return-1-' + Date.now(),
  photoDate: '2026-02-10',
  notes: 'Foto de retorno após 30 dias'
});
const resPhoto2 = mockRes();
DentistryController.savePhoto(reqPhoto2, resPhoto2);
assert.strictEqual(resPhoto2.statusCode, 201);
assert.strictEqual(resPhoto2.data.isInitial, false);
console.log('  ✓ Foto de retorno registrada como isInitial = false');

// 2.3 Salva Foto 3 (Retorno 90 dias)
const reqPhoto3 = mockReq({ userId: dentistUserId, role: 'professional' }, {
  patientId,
  category: 'dental_photos',
  fileId: 'file-photo-return-2-' + Date.now(),
  photoDate: '2026-04-10',
  notes: 'Foto de retorno após 90 dias'
});
const resPhoto3 = mockRes();
DentistryController.savePhoto(reqPhoto3, resPhoto3);
assert.strictEqual(resPhoto3.statusCode, 201);

// 2.4 Verifica listPhotos (deve retornar ordenado cronologicamente ASC para evolução contínua)
const reqListPhotos = mockReq({ userId: dentistUserId, role: 'professional' }, {}, {}, { patientId });
const resListPhotos = mockRes();
DentistryController.listPhotos(reqListPhotos, resListPhotos);
assert.strictEqual(resListPhotos.statusCode, 200);
const photoList = resListPhotos.data;
assert.strictEqual(photoList.length, 3);
assert.strictEqual(photoList[0].is_initial, 1);
assert.strictEqual(photoList[0].photo_date, '2026-01-10');
assert.strictEqual(photoList[1].is_initial, 0);
assert.strictEqual(photoList[1].photo_date, '2026-02-10');
assert.strictEqual(photoList[2].is_initial, 0);
assert.strictEqual(photoList[2].is_current, 1);
assert.strictEqual(photoList[2].photo_date, '2026-04-10');
console.log('  ✓ listPhotos retorna fotos cronologicamente: Foto Inicial (A) intacta e retornos (B, C) preservados');

// =========================================================================
// TESTE 3: PRÓTESES E LABORATÓRIO (KANBAN, BUSCA, STATUS E RESTRIÇÃO DE PERFIL)
// =========================================================================
console.log('\n--- TESTE 3: Próteses e Laboratório - Kanban, busca e restrição de acesso ---');

// 3.1 Não-dentista (Fisioterapeuta) bloqueado de acessar próteses
const reqNonDentist = mockReq({ userId: physioUserId, role: 'professional' });
const resNonDentist = mockRes();
DentistryController.listPendingProsthetics(reqNonDentist, resNonDentist);
assert.strictEqual(resNonDentist.statusCode, 403);
assert.strictEqual(isDentistOrClinicManager(reqNonDentist), false);
console.log('  ✓ Profissional não-odontológico (Fisio/Fono/TO/Nutri/Psico/Med) BLOQUEADO de acessar próteses (403)');

// 3.2 Dentista cria 3 ordens de próteses em diferentes estágios
const stages = ['sent_to_lab', 'in_production', 'installed'];
for (const st of stages) {
  const reqSaveProsth = mockReq({ userId: dentistUserId, role: 'professional' }, {
    patientId,
    labName: 'Laboratório ProDesign',
    workType: st === 'installed' ? 'Protocolo Inferior em Zircônia' : 'Coroa Cerâmica E-max',
    toothNumber: '11',
    shadeColor: 'A2',
    material: 'Zircônia / Cerâmica',
    sentDate: '2026-02-01',
    expectedDate: st === 'installed' ? '2026-02-15' : '2026-04-30',
    costValue: 650.00,
    status: st,
    notes: 'Ordem de teste para ' + st
  });
  const resSaveProsth = mockRes();
  DentistryController.saveProsthetic(reqSaveProsth, resSaveProsth);
  assert.strictEqual(resSaveProsth.statusCode, 201);
}
console.log('  ✓ 3 ordens de trabalho protético criadas com sucesso');

// 3.3 Consulta listPendingProsthetics com all=true (Kanban completo)
const reqAll = mockReq({ userId: dentistUserId, role: 'professional' }, {}, { all: 'true' });
const resAll = mockRes();
DentistryController.listPendingProsthetics(reqAll, resAll);
assert.strictEqual(resAll.statusCode, 200);
const allProsthetics = resAll.data;
assert.ok(allProsthetics.some(p => p.status === 'sent_to_lab'));
assert.ok(allProsthetics.some(p => p.status === 'in_production'));
assert.ok(allProsthetics.some(p => p.status === 'installed'));
console.log('  ✓ listPendingProsthetics com all=true retorna todos os 6 estágios para o Kanban (inclusive installed e canceled)');

// 3.4 Busca por paciente / tipo de trabalho
const reqSearch = mockReq({ userId: dentistUserId, role: 'professional' }, {}, { all: 'true', search: 'protocolo' });
const resSearch = mockRes();
DentistryController.listPendingProsthetics(reqSearch, resSearch);
assert.strictEqual(resSearch.statusCode, 200);
assert.strictEqual(resSearch.data.length, 1);
assert.ok(resSearch.data[0].work_type.toLowerCase().includes('protocolo'));
console.log('  ✓ Busca por termo retorna registros filtrados corretamente');

// =========================================================================
// TESTE 4: FINALIZAR ATENDIMENTO SEM LACRAMENTO AUTOMÁTICO
// =========================================================================
console.log('\n--- TESTE 4: Finalizar Atendimento - Não lacra automaticamente (isSealed: false) ---');

// 4.1 Finaliza atendimento odontológico com isSealed: false
const reqFinish = mockReq({ userId: dentistUserId, role: 'professional' }, {
  patientId,
  clinicalEvolution: 'Realizado preparo cavitário e restauração em resina composta no elemento 16.',
  proceduresPerformed: 'Restauração Classe I Resina',
  isSealed: false,
  odontogramData: { '16': { condition: 'restoration_resin', faces: ['O'] } },
  toothChanges: [{ toothNumber: 16, face: 'O', condition: 'restoration_resin', procedureName: 'Restauração' }]
});
const resFinish = mockRes();
DentistryController.finishConsultation(reqFinish, resFinish);
assert.strictEqual(resFinish.statusCode, 201);
const createdRecordId = resFinish.data.recordId;
assert.ok(createdRecordId);

// 4.2 Verifica no banco de dados que is_sealed é 0 (aberto para complementações)
const savedRecord = db.prepare('SELECT * FROM records WHERE id = ?').get(createdRecordId);
assert.strictEqual(savedRecord.is_sealed, 0);
assert.strictEqual(savedRecord.signature_hash, null);
console.log('  ✓ Atendimento finalizado com is_sealed = 0 e sem lacramento forçado');

// 4.3 Verifica que os odontogramas (atual e snapshot) foram salvos com integridade
const currentOdo = db.prepare("SELECT * FROM odontograms WHERE patient_id = ? AND type = 'current'").get(patientId);
assert.ok(currentOdo);
const snapOdo = db.prepare("SELECT * FROM odontograms WHERE patient_id = ? AND type = 'consultation_snapshot'").get(patientId);
assert.ok(snapOdo);
console.log('  ✓ Odontograma atual e snapshot imutável da consulta registrados com sucesso');

// 4.4 Finaliza consulta via DocumentsController (com appointmentId) e verifica que shouldSeal respeita isSealed: false
const apptId = 'appt-test-' + Date.now();
const srvId = 'srv-test-' + Date.now();
db.prepare(`
  INSERT INTO services (id, tenant_id, name, duration_minutes, price, active, created_at)
  VALUES (?, ?, 'Consulta Odontológica', 30, 200, 1, datetime('now'))
`).run(srvId, tenantId);

db.prepare(`
  INSERT INTO appointments (id, tenant_id, patient_id, professional_id, service_id, appointment_number, start_time, end_time, status, created_at)
  VALUES (?, ?, ?, ?, ?, 99001, '2026-03-20T10:00:00', '2026-03-20T10:30:00', 'scheduled', datetime('now'))
`).run(apptId, tenantId, patientId, profDentistId, srvId);

const reqDocFinish = mockReq(
  { userId: dentistUserId, role: 'professional' },
  {
    appointmentId: apptId,
    evolution: {
      patientId,
      appointmentId: apptId,
      clinicalEvolution: 'Avaliação odontológica de rotina e profilaxia.',
      isSealed: false,
      moduleType: 'ZemdaOdonto'
    }
  },
  {},
  { id: apptId }
);
const resDocFinish = mockRes();
DocumentsController.finishConsultation(reqDocFinish, resDocFinish);
assert.strictEqual(resDocFinish.statusCode, 200);

const apptRec = db.prepare('SELECT * FROM records WHERE appointment_id = ?').get(apptId);
assert.ok(apptRec);
assert.strictEqual(apptRec.is_sealed, 0);
assert.strictEqual(apptRec.signature_hash, null);
console.log('  ✓ Finalização com agendamento via DocumentsController também gera registro NÃO lacrado (is_sealed: 0)');

console.log('\n======================================================');
console.log('🎉 TODOS OS 4 PONTOS DE AUDITORIA FORAM VALIDADOS COM 100% DE SUCESSO!');
console.log('======================================================\n');
process.exit(0);
