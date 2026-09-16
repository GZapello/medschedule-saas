const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_zemda_personal_body.db');
process.env.JWT_SECRET = 'test-secret-personal-body-123';
process.env.PORT = '3098';

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
      port: 3098,
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
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data });
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
  const server = app.listen(3098);
  console.log('\n====================================================');
  console.log('INICIANDO TESTES: ZEMDABODY & ZEMDAPERSONAL (E2E)');
  console.log('====================================================\n');

  try {
    // ----------------------------------------------------
    // SETUP: Tenant A, Gestor A, Profissional A, Aluno A
    // ----------------------------------------------------
    const tenantAId = 'tenant-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at)
      VALUES (?, 'Clínica A Alpha', 'clinica-a', 'alpha@clinica.com', 'active', datetime('now'), datetime('now'))
    `).run(tenantAId);

    // Gestor A (clinic_admin)
    const managerAId = 'user-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'Gestor Alpha', 'gestor@alpha.com', 'hash', 'clinic_admin', 'active', datetime('now'), datetime('now'))
    `).run(managerAId, tenantAId);

    const managerTokenA = generateToken({
      userId: managerAId,
      tenantId: tenantAId,
      email: 'gestor@alpha.com',
      role: 'clinic_admin'
    });

    // Profissional A (sem permissão inicial)
    const staffAId = 'user-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'Profissional Beto', 'beto@alpha.com', 'hash', 'professional', 'active', datetime('now'), datetime('now'))
    `).run(staffAId, tenantAId);

    db.prepare(`
      INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_body_enabled, zemda_personal_enabled)
      VALUES (?, ?, ?, 'professional', 'active', 0, '[]', 0, 0)
    `).run('cu-' + uuidv4().slice(0, 8), tenantAId, staffAId);

    const staffTokenA = generateToken({
      userId: staffAId,
      tenantId: tenantAId,
      email: 'beto@alpha.com',
      role: 'professional'
    });

    // Aluno A (Paciente no tenant A)
    const studentAId = 'pat-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, email, phone, birth_date, gender, active, created_at, updated_at)
      VALUES (?, ?, 'Carlos Atleta', 'carlos@aluno.com', '11988887777', '1996-05-15', 'm', 1, datetime('now'), datetime('now'))
    `).run(studentAId, tenantAId);

    // ====================================================
    // 1. ZEMDABODY — LIBERAÇÃO TOTAL & GESTÃO DE ACESSO
    // ====================================================
    console.log('--- 1. ZEMDABODY: LIBERAÇÃO TOTAL PELO GERENCIADOR ---');

    // 1.1 Gestor da clínica acessa ZemdaBody diretamente
    const mgrBodyRes = await makeRequest('GET', `/api/v1/body-assessments/patient/${studentAId}`, {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    });
    assert(mgrBodyRes.status === 200, 'Gerenciador da clínica possui acesso total imediato ao ZemdaBody (HTTP 200)');
    assert(Array.isArray(mgrBodyRes.data), 'Retorna lista de avaliações do ZemdaBody sem barreira funcional');

    // 1.2 Profissional sem permissão tenta acessar ZemdaBody -> 403
    const staffNoPermBodyRes = await makeRequest('GET', `/api/v1/body-assessments/patient/${studentAId}`, {
      Authorization: `Bearer ${staffTokenA}`,
      'x-tenant-id': tenantAId
    });
    assert(staffNoPermBodyRes.status === 403, 'Profissional sem permissão do gestor recebe HTTP 403 no ZemdaBody');

    // 1.3 Gestor concede permissão access_zemda_body
    const grantBodyPermRes = await makeRequest('PUT', `/api/v1/staff/${staffAId}/permissions`, {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    }, {
      permissions: ['view_schedule', 'access_zemda_body']
    });
    assert(grantBodyPermRes.status === 200, 'Gestor atualiza permissões concedendo access_zemda_body (HTTP 200)');

    // 1.4 Profissional agora acessa ZemdaBody liberado
    const staffWithPermBodyRes = await makeRequest('GET', `/api/v1/body-assessments/patient/${studentAId}`, {
      Authorization: `Bearer ${staffTokenA}`,
      'x-tenant-id': tenantAId
    });
    assert(staffWithPermBodyRes.status === 200, 'Após autorização do Gestor, profissional acessa ZemdaBody livremente (HTTP 200)');

    // ====================================================
    // 2. ZEMDAPERSONAL — CONTROLE DE PERMISSÕES
    // ====================================================
    console.log('\n--- 2. ZEMDAPERSONAL: CONTROLE DE PERMISSÕES ---');

    // 2.1 Gestor da clínica acessa ZemdaPersonal
    const mgrPersonalRes = await makeRequest('GET', '/api/v1/personal/dashboard', {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    });
    assert(mgrPersonalRes.status === 200, 'Gerenciador da clínica possui acesso ao ZemdaPersonal Dashboard (HTTP 200)');
    assert(mgrPersonalRes.data.metrics !== undefined, 'Métricas do painel do ZemdaPersonal retornadas com sucesso');

    // 2.2 Profissional sem access_zemda_personal tenta acessar ZemdaPersonal -> 403
    const staffNoPersonalRes = await makeRequest('GET', '/api/v1/personal/dashboard', {
      Authorization: `Bearer ${staffTokenA}`,
      'x-tenant-id': tenantAId
    });
    assert(staffNoPersonalRes.status === 403, 'Profissional sem permissão do gestor recebe HTTP 403 no ZemdaPersonal');

    // 2.3 Gestor concede access_zemda_personal
    const grantPersonalPermRes = await makeRequest('PUT', `/api/v1/staff/${staffAId}/permissions`, {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    }, {
      permissions: ['view_schedule', 'access_zemda_body', 'access_zemda_personal']
    });
    assert(grantPersonalPermRes.status === 200, 'Gestor concede permissão access_zemda_personal (HTTP 200)');

    // 2.4 Profissional agora acessa ZemdaPersonal
    const staffWithPersonalRes = await makeRequest('GET', '/api/v1/personal/dashboard', {
      Authorization: `Bearer ${staffTokenA}`,
      'x-tenant-id': tenantAId
    });
    assert(staffWithPersonalRes.status === 200, 'Após autorização, profissional acessa ZemdaPersonal Dashboard (HTTP 200)');

    // ====================================================
    // 3. ZEMDAPERSONAL — CADASTRO DE ALUNO & AVALIAÇÃO FÍSICA (POLLOCK)
    // ====================================================
    console.log('\n--- 3. ZEMDAPERSONAL: PERFIL DO ALUNO & AVALIAÇÃO FÍSICA ---');

    // 3.1 Salva perfil de treinamento do aluno
    const profileRes = await makeRequest('POST', `/api/v1/personal/students/${studentAId}/profile`, {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    }, {
      goal: 'Hipertrofia e Definição',
      experience_level: 'intermediario',
      weekly_frequency: 4,
      restrictions: 'Leve desconforto no manguito rotador direito em abdução extrema',
      height: 180,
      current_weight: 82.5
    });
    assert(profileRes.status === 200, 'Perfil de treinamento do aluno salvo com sucesso (HTTP 200)');

    // 3.2 Cria avaliação física com Pollock 7 Dobras
    // Homem, 30 anos, 82.5 kg, 180 cm.
    // Dobras: sub=12, tri=10, che=8, axi=10, sup=12, abd=16, thi=14 (soma = 82)
    const assessRes = await makeRequest('POST', '/api/v1/personal/assessments', {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    }, {
      patient_id: studentAId,
      assessment_date: '2026-09-10',
      protocol: 'pollock_7',
      weight: 82.5,
      height: 180,
      fold_subscapular: 12,
      fold_triceps: 10,
      fold_chest: 8,
      fold_axillary: 10,
      fold_suprailiac: 12,
      fold_abdominal: 16,
      fold_thigh: 14,
      waist_cm: 82,
      hip_cm: 98,
      arm_right_flexed: 38.5,
      notes: 'Excelente tônus muscular. Iniciar progressão de volume.'
    });

    assert(assessRes.status === 201, 'Avaliação física com Pollock criada com sucesso (HTTP 201)');
    assert(assessRes.data.bmi > 25 && assessRes.data.bmi < 26, `IMC calculado corretamente: ${assessRes.data.bmi} kg/m²`);
    assert(assessRes.data.whr > 0.8 && assessRes.data.whr < 0.9, `RCQ (WHR) calculada corretamente: ${assessRes.data.whr}`);
    assert(assessRes.data.body_fat_percentage > 10 && assessRes.data.body_fat_percentage < 20, `% de Gordura calculado via equação Pollock 7: ${assessRes.data.body_fat_percentage}%`);
    assert(assessRes.data.lean_mass_kg > 65, `Massa magra computada: ${assessRes.data.lean_mass_kg} kg`);
    assert(assessRes.data.fat_mass_kg > 5, `Massa gorda computada: ${assessRes.data.fat_mass_kg} kg`);

    const assessmentId = assessRes.data.id;

    // 3.3 Consulta histórico de evolução para gráficos
    const evoRes = await makeRequest('GET', `/api/v1/personal/students/${studentAId}/evolution`, {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    });
    assert(evoRes.status === 200, 'Consulta de dados de evolução para gráficos retorna HTTP 200');
    assert(evoRes.data.history.length === 1, 'Histórico contém a avaliação cadastrada');

    // 3.4 Registra foto antes/depois
    const photoRes = await makeRequest('POST', '/api/v1/personal/photos', {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    }, {
      patient_id: studentAId,
      assessment_id: assessmentId,
      photo_type: 'front',
      photo_url: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=500',
      photo_date: '2026-09-10'
    });
    assert(photoRes.status === 201, 'Foto de avaliação física registrada com sucesso (HTTP 201)');

    const listPhotosRes = await makeRequest('GET', `/api/v1/personal/students/${studentAId}/photos`, {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    });
    assert(listPhotosRes.data.photos.length === 1, 'Lista de fotos do aluno retorna 1 foto registrada');

    // ====================================================
    // 4. ZEMDAPERSONAL — BIBLIOTECA DE EXERCÍCIOS & PRESCRIÇÃO
    // ====================================================
    console.log('\n--- 4. ZEMDAPERSONAL: EXERCÍCIOS & PRESCRIÇÃO DE TREINOS ---');

    // 4.1 Lista catálogo padrão de exercícios
    const exListRes = await makeRequest('GET', '/api/v1/personal/exercises', {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    });
    assert(exListRes.status === 200, 'Listagem da biblioteca de exercícios retorna HTTP 200');
    assert(exListRes.data.exercises.length >= 10, `Biblioteca possui ${exListRes.data.exercises.length} exercícios pré-carregados com fotos`);

    // 4.2 Cria exercício customizado
    const newExRes = await makeRequest('POST', '/api/v1/personal/exercises', {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    }, {
      name: 'Supino Reto com Halteres',
      muscle_group: 'peito',
      instructions: 'Adução escapular no banco, cotovelos em ângulo de 45 a 70 graus.',
      photo_url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=500'
    });
    assert(newExRes.status === 201, 'Exercício customizado criado com sucesso (HTTP 201)');

    // 4.3 Prescreve treino Divisão A (Peito, Ombros e Tríceps)
    const workoutRes = await makeRequest('POST', '/api/v1/personal/workouts', {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    }, {
      patient_id: studentAId,
      title: 'Peito, Deltóide Anterior e Tríceps',
      division: 'A',
      structure_type: 'ABCDE',
      notes: 'Descanso rigoroso de 60s entre séries. Cadência 2-0-2.',
      exercises: [
        {
          name: 'Supino Reto com Barra',
          muscle_group: 'peito',
          sets: 4,
          reps: '8-10',
          load_kg: 80,
          rest_seconds: 90,
          technique: 'Direta',
          rpe: 8
        },
        {
          name: 'Crucifixo Inclinado',
          muscle_group: 'peito',
          sets: 3,
          reps: '10-12',
          load_kg: 22,
          rest_seconds: 60,
          technique: 'Drop-set',
          rpe: 9
        },
        {
          name: 'Desenvolvimento com Halteres',
          muscle_group: 'ombros',
          sets: 4,
          reps: '10-12',
          load_kg: 24,
          rest_seconds: 60,
          technique: 'Direta',
          rpe: 8
        }
      ]
    });
    assert(workoutRes.status === 201, 'Treino prescrito com exercícios e divisões com sucesso (HTTP 201)');
    const workoutId = workoutRes.data.id;

    // 4.4 Carrega detalhes do treino
    const getWkRes = await makeRequest('GET', `/api/v1/personal/workouts/${workoutId}`, {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    });
    assert(getWkRes.status === 200, 'Consulta de detalhes do treino retorna HTTP 200');
    assert(getWkRes.data.exercises.length === 3, 'Treino possui os 3 exercícios salvos');
    assert(getWkRes.data.muscleVolume.peito === 7, 'Cálculo de volume semanal por grupo muscular: 7 séries de peito');
    assert(getWkRes.data.muscleVolume.ombros === 4, 'Cálculo de volume semanal por grupo muscular: 4 séries de ombros');

    // ====================================================
    // 5. ZEMDAPERSONAL — EXECUÇÃO DE TREINO & RECORDES PESSOAIS (PRS)
    // ====================================================
    console.log('\n--- 5. ZEMDAPERSONAL: EXECUÇÃO, LOGS & DETECÇÃO DE RECORDES (PRS) ---');

    // 5.1 Executa treino pela primeira vez -> Novo PR detectado (80kg no Supino)
    const log1Res = await makeRequest('POST', '/api/v1/personal/logs', {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    }, {
      workout_id: workoutId,
      patient_id: studentAId,
      completed_at: '2026-09-12T10:30:00Z',
      duration_minutes: 50,
      rpe: 8,
      feedback_notes: 'Primeira sessão concluída com boa forma.',
      exercises_performed: [
        { name: 'Supino Reto com Barra', load_kg: 80, reps: '10' },
        { name: 'Desenvolvimento com Halteres', load_kg: 24, reps: '12' }
      ]
    });
    assert(log1Res.status === 201, 'Registro de execução de treino salvo (HTTP 201)');
    assert(log1Res.data.newPRs.length === 2, '2 novos recordes pessoais (PRs) identificados na primeira sessão');

    // 5.2 Executa segunda sessão com incremento de carga -> PR superado (85kg no Supino)
    const log2Res = await makeRequest('POST', '/api/v1/personal/logs', {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    }, {
      workout_id: workoutId,
      patient_id: studentAId,
      completed_at: '2026-09-15T10:30:00Z',
      duration_minutes: 52,
      rpe: 9,
      feedback_notes: 'Progrediu carga no supino mantendo controle excêntrico!',
      exercises_performed: [
        { name: 'Supino Reto com Barra', load_kg: 85, reps: '8' },
        { name: 'Desenvolvimento com Halteres', load_kg: 24, reps: '12' }
      ]
    });
    assert(log2Res.status === 201, 'Segunda execução de treino salva com sucesso');
    assert(log2Res.data.newPRs.length === 1, 'Exatamente 1 novo PR detectado (apenas Supino aumentou)');
    assert(log2Res.data.newPRs[0].exercise_name === 'Supino Reto com Barra', 'Exercício do PR superado é o Supino');
    assert(log2Res.data.newPRs[0].previous_max === 80, 'Carga máxima anterior era 80kg');
    assert(log2Res.data.newPRs[0].new_pr === 85, 'Novo recorde pessoal registrado é 85kg');

    // 5.3 Consulta recordes consolidados do aluno
    const recordsRes = await makeRequest('GET', `/api/v1/personal/students/${studentAId}/records`, {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    });
    assert(recordsRes.status === 200, 'Consulta de quadro de recordes pessoais retorna HTTP 200');
    const supinoRecord = recordsRes.data.records.find(r => r.exercise_name === 'Supino Reto com Barra');
    assert(supinoRecord && supinoRecord.max_load === 85, 'Carga recorde consolidada do Supino é 85kg');

    // 5.4 Consulta assiduidade e frequência
    const attendRes = await makeRequest('GET', `/api/v1/personal/students/${studentAId}/attendance`, {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    });
    assert(attendRes.status === 200, 'Estatísticas de frequência e assiduidade retornam HTTP 200');
    assert(attendRes.data.totalWorkoutsCompleted === 2, 'Total de treinos concluídos contabiliza 2 sessões');
    assert(attendRes.data.targetWeeklyFrequency === 4, 'Frequência semanal alvo é 4x');

    // ====================================================
    // 6. ZEMDAPERSONAL — ASSISTENTE DE IA DE TREINAMENTO
    // ====================================================
    console.log('\n--- 6. ZEMDAPERSONAL: ASSISTENTE IA DE TREINAMENTO ---');

    const aiRes = await makeRequest('POST', '/api/v1/personal/ai/assistant', {
      Authorization: `Bearer ${managerTokenA}`,
      'x-tenant-id': tenantAId
    }, {
      studentId: studentAId,
      message: 'Com base no histórico e na carga atual de 85kg no supino, como você sugere a próxima progressão de carga?'
    });
    assert(aiRes.status === 200, 'Consulta ao Assistente IA ZemdaPersonal retorna HTTP 200');
    assert(aiRes.data.response && aiRes.data.response.length > 50, 'Resposta inteligente gerada com fundamentação de treinamento');
    assert(aiRes.data.modelUsed !== undefined, `Modelo utilizado: ${aiRes.data.modelUsed}`);

    // ====================================================
    // 7. ISOLAMENTO MULTI-TENANT
    // ====================================================
    console.log('\n--- 7. ISOLAMENTO MULTI-TENANT ---');

    // Cria Tenant B e Gestor B
    const tenantBId = 'tenant-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO tenants (id, name, slug, email, status, created_at, updated_at)
      VALUES (?, 'Clínica B Beta', 'clinica-b', 'beta@clinica.com', 'active', datetime('now'), datetime('now'))
    `).run(tenantBId);

    const managerBId = 'user-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at, updated_at)
      VALUES (?, ?, 'Gestor Beta', 'gestor@beta.com', 'hash', 'clinic_admin', 'active', datetime('now'), datetime('now'))
    `).run(managerBId, tenantBId);

    const managerTokenB = generateToken({
      userId: managerBId,
      tenantId: tenantBId,
      email: 'gestor@beta.com',
      role: 'clinic_admin'
    });

    // Gestor B tenta acessar aluno da Clínica A
    const tenantBAccessRes = await makeRequest('GET', `/api/v1/personal/students/${studentAId}`, {
      Authorization: `Bearer ${managerTokenB}`,
      'x-tenant-id': tenantBId
    });
    assert(tenantBAccessRes.status === 404, 'Tenant B não consegue acessar dados do aluno do Tenant A (HTTP 404)');

    // Gestor B tenta acessar treino da Clínica A
    const tenantBWorkoutRes = await makeRequest('GET', `/api/v1/personal/workouts/${workoutId}`, {
      Authorization: `Bearer ${managerTokenB}`,
      'x-tenant-id': tenantBId
    });
    assert(tenantBWorkoutRes.status === 404, 'Tenant B não consegue visualizar treinos do Tenant A (HTTP 404)');

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
