/**
 * TEST SUITE: CORREÇÃO PONTUAL ZEMDAPersonal & SERVIÇO PADRÃO EM NOVOS CADASTROS
 * 
 * Validação rigorosa dos 20 testes obrigatórios:
 *  1. Upload da Foto Frontal
 *  2. Upload da Foto Posterior
 *  3. Upload da Lateral Direita
 *  4. Upload da Lateral Esquerda
 *  5. Salvar avaliação física
 *  6. Reabrir avaliação
 *  7. Confirmar que as fotos permanecem
 *  8. Substituir foto
 *  9. Remover foto
 * 10. Criar exercício com imagem
 * 11. Criar exercício sem imagem
 * 12. Editar imagem do exercício
 * 13. Visualizar imagem no card
 * 14. Atualizar a página e confirmar persistência
 * 15. Criar nova clínica/conta
 * 16. Confirmar criação automática de: Atendimento / Consulta — R$ 180,00
 * 17. Abrir a agenda (GET /v1/services)
 * 18. Criar o primeiro agendamento
 * 19. Confirmar que o serviço aparece imediatamente
 * 20. Repetir/recarregar fluxo e confirmar que NÃO é criado serviço duplicado (idempotência)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_targeted_personal.db');
process.env.JWT_SECRET = 'test-secret-targeted-personal-123';
process.env.PORT = '3105';
process.env.R2_MOCK_STORAGE = 'true';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  try { fs.unlinkSync(process.env.DATABASE_PATH); } catch (_) {}
}

const { initializeDatabase, db } = require('./dist/config/database');
initializeDatabase();

const { ensureDefaultClinicService } = require('./dist/services/default-service.service');
const { generateToken } = require('./dist/utils/jwt');

const app = express();
app.use(express.json());
app.use('/api', require('./dist/routes').default);

const PORT = 3105;
let server;
let passedTests = 0;
let failedTests = 0;

const tenantId = 'tenant-personal-test';
const personalTrainerId = 'user-personal-test';

// Seed tenant and personal trainer user
db.prepare(`
  INSERT OR IGNORE INTO tenants (id, name, slug, email, status, created_at, updated_at)
  VALUES ('${tenantId}', 'Academia Zemda Teste', 'academia-zemda', 'academia@zemda.com', 'active', datetime('now'), datetime('now'))
`).run();

db.prepare(`
  INSERT OR IGNORE INTO users (id, tenant_id, email, password_hash, role, status, name, created_at, updated_at)
  VALUES ('${personalTrainerId}', '${tenantId}', 'carlos@personal.com', 'hash', 'professional', 'active', 'Treinador Carlos', datetime('now'), datetime('now'))
`).run();

db.prepare(`
  INSERT OR IGNORE INTO professionals (id, user_id, tenant_id, name, profession_id, practice_areas, registration_type, registration_number, active, created_at, updated_at)
  VALUES ('prof-carlos-1', '${personalTrainerId}', '${tenantId}', 'Treinador Carlos', 'prof-personal-trainer', 'Musculação e Hipertrofia', 'CREF', '123456-G/SP', 1, datetime('now'), datetime('now'))
`).run();

db.prepare(`
  INSERT OR IGNORE INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_body_enabled, zemda_personal_enabled, profession_custom, practice_areas)
  VALUES ('cu-carlos-1', '${tenantId}', '${personalTrainerId}', 'professional', 'active', 0, '[]', 1, 1, 'Personal Trainer', 'Musculação')
`).run();

const personalToken = generateToken({
  userId: personalTrainerId,
  tenantId: tenantId,
  role: 'professional'
});

const authHeaders = { Authorization: `Bearer ${personalToken}` };

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failedTests++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (dataString) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(dataString);
    }
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: reqHeaders
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, data: json });
      });
    });
    req.on('error', reject);
    if (dataString) req.write(dataString);
    req.end();
  });
}

async function runTests() {
  server = app.listen(PORT);
  console.log(`\n================================================================`);
  console.log(`🧪 BATERIA DE TESTES: ZEMDAPersonal & SERVIÇO PADRÃO (20 TESTES)`);
  console.log(`================================================================\n`);

  try {
    assert(!!personalToken, 'Token do Personal Trainer gerado com sucesso');

    // Cria ou obtém aluno para os testes
    const studentRes = await makeRequest('POST', '/api/v1/personal/students', authHeaders, {
      name: 'Carla Testes Avaliacao',
      goal: 'Hipertrofia e Definição',
      level: 'intermediario',
      weight: 60.5,
      height: 165
    });
    assert(studentRes.status === 201, 'Aluno de teste criado com sucesso');
    const studentId = studentRes.data.student.id;

    // -------------------------------------------------------------
    // BLOCO 1: FOTOS CORPORAIS NA AVALIAÇÃO FÍSICA (TESTES 1 A 9)
    // -------------------------------------------------------------
    console.log('\n--- 1. UPLOAD DE FOTOS CORPORAIS (R2) ---');

    // Teste 1: Upload da Foto Frontal
    const frontUrlRes = await makeRequest('POST', '/api/v1/files/upload-url', authHeaders, {
      patientId: studentId,
      category: 'personal_assessment_front',
      filename: 'foto_frontal.webp',
      mimeType: 'image/webp',
      fileSize: 420000
    });
    assert(frontUrlRes.status === 200, '1. Upload URL Foto Frontal gerada com sucesso');
    const frontConfirmRes = await makeRequest('POST', '/api/v1/files/complete', authHeaders, {
      patientId: studentId,
      category: 'personal_assessment_front',
      objectKey: frontUrlRes.data.objectKey,
      filename: 'foto_frontal.webp',
      mimeType: 'image/webp',
      fileSize: 420000
    });
    assert(frontConfirmRes.status === 201, '1. Upload da Foto Frontal confirmado no R2');
    const photoFrontUrl = frontConfirmRes.data.file.url;

    // Teste 2: Upload da Foto Posterior (Costas)
    const backUrlRes = await makeRequest('POST', '/api/v1/files/upload-url', authHeaders, {
      patientId: studentId,
      category: 'personal_assessment_back',
      filename: 'foto_costas.webp',
      mimeType: 'image/webp',
      fileSize: 450000
    });
    const backConfirmRes = await makeRequest('POST', '/api/v1/files/complete', authHeaders, {
      patientId: studentId,
      category: 'personal_assessment_back',
      objectKey: backUrlRes.data.objectKey,
      filename: 'foto_costas.webp',
      mimeType: 'image/webp',
      fileSize: 450000
    });
    assert(backConfirmRes.status === 201, '2. Upload da Foto Posterior confirmado no R2');
    const photoBackUrl = backConfirmRes.data.file.url;

    // Teste 3: Upload da Lateral Direita
    const rightUrlRes = await makeRequest('POST', '/api/v1/files/upload-url', authHeaders, {
      patientId: studentId,
      category: 'personal_assessment_right',
      filename: 'foto_lateral_direita.webp',
      mimeType: 'image/webp',
      fileSize: 390000
    });
    const rightConfirmRes = await makeRequest('POST', '/api/v1/files/complete', authHeaders, {
      patientId: studentId,
      category: 'personal_assessment_right',
      objectKey: rightUrlRes.data.objectKey,
      filename: 'foto_lateral_direita.webp',
      mimeType: 'image/webp',
      fileSize: 390000
    });
    assert(rightConfirmRes.status === 201, '3. Upload da Lateral Direita confirmado no R2');
    const photoRightUrl = rightConfirmRes.data.file.url;

    // Teste 4: Upload da Lateral Esquerda
    const leftUrlRes = await makeRequest('POST', '/api/v1/files/upload-url', authHeaders, {
      patientId: studentId,
      category: 'personal_assessment_left',
      filename: 'foto_lateral_esquerda.webp',
      mimeType: 'image/webp',
      fileSize: 410000
    });
    const leftConfirmRes = await makeRequest('POST', '/api/v1/files/complete', authHeaders, {
      patientId: studentId,
      category: 'personal_assessment_left',
      objectKey: leftUrlRes.data.objectKey,
      filename: 'foto_lateral_esquerda.webp',
      mimeType: 'image/webp',
      fileSize: 410000
    });
    assert(leftConfirmRes.status === 201, '4. Upload da Lateral Esquerda confirmado no R2');
    const photoLeftUrl = leftConfirmRes.data.file.url;

    // Teste 5: Salvar avaliação com as 4 fotos
    console.log('\n--- 2. AVALIAÇÃO FÍSICA: SALVAMENTO E REABERTURA ---');
    const assessmentRes = await makeRequest('POST', '/api/v1/personal/assessments', authHeaders, {
      patient_id: studentId,
      assessment_date: '2026-09-17',
      protocol: 'pollock_7',
      weight: 60.5,
      height: 165,
      body_fat_percentage: 19.8,
      composition_method: 'skinfolds',
      notes: 'Avaliação inicial com 4 vistas corporais integradas ao R2',
      photos: [
        { photo_type: 'front', photo_url: photoFrontUrl },
        { photo_type: 'back', photo_url: photoBackUrl },
        { photo_type: 'right', photo_url: photoRightUrl },
        { photo_type: 'left', photo_url: photoLeftUrl }
      ]
    });
    assert(assessmentRes.status === 201, '5. Salvar avaliação física com 4 fotos retorna HTTP 201');
    const assessmentId = assessmentRes.data.id || assessmentRes.data.assessment?.id;

    // Teste 6: Reabrir avaliação
    const reopenRes = await makeRequest('GET', `/api/v1/personal/assessments/${assessmentId}`, authHeaders);
    assert(reopenRes.status === 200, '6. Reabrir avaliação física retorna HTTP 200');

    // Teste 7: Confirmar que as fotos permanecem
    assert(Array.isArray(reopenRes.data.photos), '7.1. Retorna array de fotos da avaliação');
    assert(reopenRes.data.photos.length === 4, '7.2. Todas as 4 fotos corporais foram salvas e permanecem na avaliação');
    const photoTypes = reopenRes.data.photos.map(p => p.photo_type);
    assert(photoTypes.includes('front') && photoTypes.includes('back') && photoTypes.includes('right') && photoTypes.includes('left'), '7.3. Fotos correspondem às vistas front, back, right e left');

    // Teste 8: Substituir foto (substitui a frontal por uma nova frontal)
    console.log('\n--- 3. SUBSTITUIÇÃO E REMOÇÃO DE FOTOS ---');
    const newFrontUrl = 'https://r2.zemda.com/assessments/new_front_substituted.webp';
    const updateRes = await makeRequest('PUT', `/api/v1/personal/assessments/${assessmentId}`, authHeaders, {
      photos: [
        { photo_type: 'front', photo_url: newFrontUrl }, // substituída
        { photo_type: 'back', photo_url: photoBackUrl },
        { photo_type: 'right', photo_url: photoRightUrl },
        { photo_type: 'left', photo_url: photoLeftUrl }
      ]
    });
    assert(updateRes.status === 200, '8.1. PUT /v1/personal/assessments/:id retorna HTTP 200');
    const checkSubstituted = await makeRequest('GET', `/api/v1/personal/assessments/${assessmentId}`, authHeaders);
    const subFront = checkSubstituted.data.photos.find(p => p.photo_type === 'front');
    assert(subFront && subFront.photo_url === newFrontUrl, '8.2. Substituir foto: nova foto frontal foi atualizada com sucesso');

    // Teste 9: Remover foto (remove a foto lateral esquerda)
    const removeLeftRes = await makeRequest('PUT', `/api/v1/personal/assessments/${assessmentId}`, authHeaders, {
      photos: [
        { photo_type: 'front', photo_url: newFrontUrl },
        { photo_type: 'back', photo_url: photoBackUrl },
        { photo_type: 'right', photo_url: photoRightUrl }
        // 'left' removida
      ]
    });
    assert(removeLeftRes.status === 200, '9.1. Atualização com foto removida retorna HTTP 200');
    const checkRemoved = await makeRequest('GET', `/api/v1/personal/assessments/${assessmentId}`, authHeaders);
    assert(checkRemoved.data.photos.length === 3, '9.2. Remover foto: avaliação agora possui exatamente 3 fotos');
    const remainingTypes = checkRemoved.data.photos.map(p => p.photo_type);
    assert(!remainingTypes.includes('left'), '9.3. Foto lateral esquerda não consta mais na avaliação');

    // -------------------------------------------------------------
    // BLOCO 2: GESTÃO DE EXERCÍCIOS E IMAGENS (TESTES 10 A 14)
    // -------------------------------------------------------------
    console.log('\n--- 4. EXERCÍCIOS DO ZEMDAPersonal (COM/SEM IMAGEM, EDIÇÃO E CARDS) ---');

    // Teste 10: Criar exercício com imagem
    const exWithPhotoRes = await makeRequest('POST', '/api/v1/personal/exercises', authHeaders, {
      name: 'Crucifixo Inclinado com Halteres R2',
      muscle_group: 'peitoral',
      equipment: 'halteres',
      category: 'hipertrofia',
      level: 'intermediario',
      photo_url: 'https://r2.zemda.com/exercises/crucifixo_inclinado.webp',
      technical_notes: 'Banco inclinado a 30 graus, cotovelos levemente flexionados.'
    });
    assert(exWithPhotoRes.status === 201, '10. Criar exercício com imagem no R2 retorna HTTP 201');
    const exWithPhotoId = exWithPhotoRes.data.id || exWithPhotoRes.data.exercise?.id;

    // Teste 11: Criar exercício sem imagem
    const exWithoutPhotoRes = await makeRequest('POST', '/api/v1/personal/exercises', authHeaders, {
      name: 'Prancha Lateral Isométrica Sem Foto',
      muscle_group: 'abdomen',
      equipment: 'peso_corporal',
      category: 'funcional',
      level: 'iniciante',
      photo_url: null,
      technical_notes: 'Alinhamento da coluna e contração isométrica do core.'
    });
    assert(exWithoutPhotoRes.status === 201, '11. Criar exercício sem imagem funciona normalmente (HTTP 201)');
    const exWithoutPhotoId = exWithoutPhotoRes.data.id || exWithoutPhotoRes.data.exercise?.id;

    // Teste 12: Editar imagem do exercício
    const newExPhotoUrl = 'https://r2.zemda.com/exercises/crucifixo_nova_foto.webp';
    const editExRes = await makeRequest('PUT', `/api/v1/personal/exercises/${exWithPhotoId}`, authHeaders, {
      name: 'Crucifixo Inclinado com Halteres R2 (Foto Editada)',
      photo_url: newExPhotoUrl
    });
    assert(editExRes.status === 200, '12.1. Editar exercício retorna HTTP 200');

    // Teste 13: Visualizar imagem no card
    const listCardsRes = await makeRequest('GET', '/api/v1/personal/exercises?is_active=all', authHeaders);
    assert(listCardsRes.status === 200, '13.1. Listagem de exercícios retorna HTTP 200');
    const exercisesList = listCardsRes.data.exercises || listCardsRes.data;
    const foundEdited = exercisesList.find(e => e.id === exWithPhotoId);
    assert(foundEdited && foundEdited.photo_url === newExPhotoUrl, '13.2. Card do exercício exibe a imagem atualizada');
    const foundNoPhoto = exercisesList.find(e => e.id === exWithoutPhotoId);
    assert(foundNoPhoto && (!foundNoPhoto.photo_url || foundNoPhoto.photo_url === ''), '13.3. Card do exercício sem foto continua sem imagem (Sem foto)');

    // Teste 14: Atualizar a página e confirmar persistência
    const rawDbCheck = db.prepare('SELECT id, name, photo_url FROM personal_exercises WHERE id = ?').get(exWithPhotoId);
    assert(rawDbCheck && rawDbCheck.photo_url === newExPhotoUrl, '14. Persistência no banco confirmada após consulta direta');

    // -------------------------------------------------------------
    // BLOCO 3: SERVIÇO PADRÃO EM NOVOS CADASTROS (TESTES 15 A 20)
    // -------------------------------------------------------------
    console.log('\n--- 5. SERVIÇO PADRÃO EM NOVOS CADASTROS & IDEMPOTÊNCIA ---');

    // Teste 15: Criar nova clínica/conta
    const uniqueClinicSuffix = Math.floor(Math.random() * 90000) + 10000;
    const newClinicRes = await makeRequest('POST', '/api/v1/public/tenants/register', {}, {
      responsibleName: 'Dr. Leonardo Nova Clinica',
      email: `leonardo_${uniqueClinicSuffix}@novaclinica.com`,
      phone: '(11) 98765-4321',
      password: 'password123',
      clinicName: `Clinica Bem Estar ${uniqueClinicSuffix}`,
      termsAccepted: true,
      privacyAccepted: true
    });
    assert(newClinicRes.status === 201, '15. Criar nova clínica/conta via cadastro público retorna HTTP 201');
    const newTenantId = newClinicRes.data.tenant.id;
    const newAdminToken = newClinicRes.data.token;
    const newClinicHeaders = { Authorization: `Bearer ${newAdminToken}` };

    // Teste 16: Confirmar criação automática de: Atendimento / Consulta — R$ 180,00
    const checkService = db.prepare(`
      SELECT id, name, price, active, duration_minutes
      FROM services
      WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM('Atendimento / Consulta'))
    `).get(newTenantId);
    assert(checkService !== undefined, '16.1. Serviço "Atendimento / Consulta" criado automaticamente para a nova clínica');
    assert(Number(checkService.price) === 180.0, '16.2. Valor do serviço padrão é rigorosamente R$ 180,00');
    assert(checkService.active === 1, '16.3. Status do serviço é Ativo (active = 1)');

    // Ativa a nova clínica para liberar o uso da agenda (simulando início do período ou aprovação)
    db.prepare("UPDATE tenants SET status = 'active', billing_required = 0 WHERE id = ?").run(newTenantId);
    db.prepare("UPDATE users SET status = 'active' WHERE tenant_id = ?").run(newTenantId);
    db.prepare("UPDATE clinic_users SET status = 'active' WHERE tenant_id = ?").run(newTenantId);

    // Teste 17: Abrir a agenda (GET /v1/services)
    const servicesListRes = await makeRequest('GET', '/api/v1/services', newClinicHeaders);
    if (servicesListRes.status !== 200) console.log('DEBUG servicesListRes:', servicesListRes);
    assert(servicesListRes.status === 200, '17.1. GET /v1/services na nova clínica retorna HTTP 200');
    assert(Array.isArray(servicesListRes.data), '17.2. Lista de serviços é um array');
    const defaultServiceFromApi = servicesListRes.data.find(s => s.name === 'Atendimento / Consulta');
    assert(defaultServiceFromApi !== undefined, '17.3. "Atendimento / Consulta" imediatamente disponível na listagem da agenda');
    assert(Number(defaultServiceFromApi.price) === 180.0, '17.4. Preço de R$ 180,00 disponível na API');

    // Teste 18: Criar o primeiro agendamento usando o serviço criado
    // Cria um paciente para a nova clínica
    const patientRes = await makeRequest('POST', '/api/v1/patients', newClinicHeaders, {
      fullName: 'Paciente Primeiro Agendamento',
      phone: '(11) 91111-2222',
      email: 'primeiro@paciente.com'
    });
    const newPatientId = patientRes.data.id || patientRes.data.patient?.id;

    // Busca o profissional da nova clínica
    const profsRes = await makeRequest('GET', '/api/v1/professionals', newClinicHeaders);
    let newProfId = profsRes.data?.[0]?.id;
    if (!newProfId) {
      // Se ainda não houver profissional, cria um para permitir o agendamento
      const newProfRow = db.prepare('SELECT id FROM professionals WHERE tenant_id = ?').get(newTenantId);
      if (newProfRow) {
        newProfId = newProfRow.id;
      } else {
        newProfId = 'pro-' + Math.random().toString(36).slice(2, 10);
        db.prepare(`
          INSERT INTO professionals (id, tenant_id, user_id, name, active, created_at, updated_at)
          VALUES (?, ?, ?, 'Dr. Leonardo Nova Clinica', 1, datetime('now'), datetime('now'))
        `).run(newProfId, newTenantId, newClinicRes.data.user.id);
      }
    }

    const apptRes = await makeRequest('POST', '/api/v1/appointments', newClinicHeaders, {
      patientId: newPatientId,
      professionalId: newProfId,
      serviceId: defaultServiceFromApi.id,
      date: '2026-09-18',
      startTime: '10:00',
      endTime: '10:50',
      status: 'scheduled'
    });
    assert(apptRes.status === 201, '18. Criar primeiro agendamento com serviço padrão retorna HTTP 201');

    // Teste 19: Confirmar que o serviço aparece imediatamente e gerou pagamento com valor R$ 180,00
    const paymentRow = db.prepare('SELECT amount, status FROM payments WHERE appointment_id = ?').get(apptRes.data.id || apptRes.data.appointment?.id);
    assert(paymentRow !== undefined, '19.1. Registro financeiro do agendamento provisionado');
    assert(Number(paymentRow.amount) === 180.0, '19.2. Valor faturado corresponde ao valor do serviço: R$ 180,00');

    // Teste 20: Repetir/recarregar fluxo e confirmar que NÃO é criado serviço duplicado (idempotência)
    const secondCall = ensureDefaultClinicService(newTenantId);
    assert(secondCall !== null && secondCall.created === false, '20.1. Execução subsequente de ensureDefaultClinicService detecta existência prévia (created = false)');

    const countServices = db.prepare(`
      SELECT COUNT(*) as total
      FROM services
      WHERE tenant_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM('Atendimento / Consulta'))
    `).get(newTenantId);
    assert(countServices.total === 1, '20.2. Idempotência estrita confirmada: existe EXATAMENTE 1 serviço "Atendimento / Consulta" na clínica, sem duplicatas');

    console.log('\n================================================================');
    console.log(`RESUMO DOS TESTES: ${passedTests} PASSOU | ${failedTests} FALHOU`);
    console.log('================================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Erro fatal no teste:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
