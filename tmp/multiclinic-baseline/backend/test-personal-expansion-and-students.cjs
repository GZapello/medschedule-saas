const fs = require('fs');
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

process.env.DATABASE_PATH = path.resolve(__dirname, 'test_personal_expansion.db');
process.env.JWT_SECRET = 'test-secret-personal-expansion-123';
process.env.PORT = '3101';
process.env.R2_MOCK_STORAGE = 'true';

if (fs.existsSync(process.env.DATABASE_PATH)) {
  fs.unlinkSync(process.env.DATABASE_PATH);
}

const { initializeDatabase, db, rawDb } = require('./dist/config/database');
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
  return new Promise((resolve) => {
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
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', err => {
      resolve({ status: 500, error: err.message });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

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

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TEST SUITE: ZEMDAPersonal EXPANSAO, R2 & GESTAO DE ALUNOS');
  console.log('================================================================\n');

  const server = app.listen(3101);

  try {
    // 1. Verificacao da Biblioteca de Exercicios (80+ exercicios)
    console.log('--- TEST GROUP 1: Biblioteca de Exercicios Expandida (80+ Cinesiologia) ---');
    const resExercises = await makeRequest('GET', '/api/v1/personal/exercises', authHeaders);
    assert(resExercises.status === 200, 'GET /v1/personal/exercises retorna HTTP 200');
    assert(Array.isArray(resExercises.data.exercises), 'exercises e um array');
    const totalExercises = resExercises.data.exercises.length;
    assert(totalExercises >= 80, `Biblioteca possui 80+ exercicios semeados (total: ${totalExercises})`);

    // 2. Filtros Multiplos de Exercicios
    console.log('\n--- TEST GROUP 2: Multi-filtros Cinesiologicos (Musculo, Equipamento, Categoria, Busca) ---');
    const resChest = await makeRequest('GET', '/api/v1/personal/exercises?muscle=peitoral', authHeaders);
    assert(resChest.status === 200 && resChest.data.exercises.length > 0, 'Filtro por musculo peitoral funciona');
    const allChest = resChest.data.exercises.every(e => e.muscle_group.toLowerCase() === 'peitoral');
    assert(allChest, 'Todos os exercicios retornados tem muscle_group == peitoral');

    const resBarbell = await makeRequest('GET', '/api/v1/personal/exercises?equipment=barra', authHeaders);
    assert(resBarbell.status === 200 && resBarbell.data.exercises.length > 0, 'Filtro por equipamento barra funciona');
    const allBarbell = resBarbell.data.exercises.every(e => e.equipment.toLowerCase().includes('barra'));
    assert(allBarbell, 'Todos os exercicios retornados tem equipment == barra');

    const resHypertrophy = await makeRequest('GET', '/api/v1/personal/exercises?category=hipertrofia', authHeaders);
    assert(resHypertrophy.status === 200 && resHypertrophy.data.exercises.length > 0, 'Filtro por categoria hipertrofia funciona');

    const resSearch = await makeRequest('GET', '/api/v1/personal/exercises?q=supino', authHeaders);
    assert(resSearch.status === 200 && resSearch.data.exercises.length >= 3, 'Busca textual por supino encontra variacoes');

    // 3. Criacao de Aluno - Caso Rapido (sem telefone fornecido - correcao do bug)
    console.log('\n--- TEST GROUP 3: Criacao de Alunos no ZemdaPersonal (Correcao Bug de Salvamento) ---');
    const resStudent1 = await makeRequest('POST', '/api/v1/personal/students', authHeaders, {
      name: 'Maria Clara Silva',
      email: 'mariaclara@teste.com',
      goal: 'Emagrecimento',
      weekly_frequency: 4,
      experience_level: 'iniciante'
    });
    assert(resStudent1.status === 201, 'POST /v1/personal/students com telefone vazio retorna HTTP 201 (Sucesso atomico)');
    assert(resStudent1.data.student && resStudent1.data.student.id, 'Aluno criado possui ID valido');
    assert(resStudent1.data.student.phone && resStudent1.data.student.phone.length > 0, 'Telefone de fallback gerado com sucesso para satisfazer restricoes do BD');
    assert(resStudent1.data.student.goal === 'Emagrecimento', 'Objetivo do aluno persistido no perfil de treino');
    const student1Id = resStudent1.data.student.id;

    // Criacao de Aluno Completo
    const resStudent2 = await makeRequest('POST', '/api/v1/personal/students', authHeaders, {
      name: 'Roberto de Souza',
      phone: '(11) 98765-4321',
      email: 'roberto@email.com',
      goal: 'Hipertrofia',
      weekly_frequency: 5,
      experience_level: 'intermediario',
      current_weight: 82.5,
      height: 180,
      restrictions: 'Hernia de disco L4-L5'
    });
    assert(resStudent2.status === 201, 'POST /v1/personal/students completo retorna HTTP 201');
    const student2Id = resStudent2.data.student.id;

    // 4. Edicao e Persistencia de Aluno
    console.log('\n--- TEST GROUP 4: Edicao Atomica de Aluno e Persistencia no Banco ---');
    const resUpdateStudent = await makeRequest('PUT', `/api/v1/personal/students/${student1Id}`, authHeaders, {
      name: 'Maria Clara Silva dos Santos',
      phone: '(21) 99887-7665',
      email: 'mariaclara.santos@teste.com',
      status: 'active',
      goal: 'Hipertrofia & Forca',
      experience_level: 'intermediario',
      weekly_frequency: 5,
      current_weight: 64.2,
      height: 168,
      restrictions: 'Tendinite patelar no joelho direito'
    });
    assert(resUpdateStudent.status === 200, 'PUT /v1/personal/students/:id retorna HTTP 200');

    // Recarregar do banco para verificar persistencia real
    const resGetUpdated = await makeRequest('GET', `/api/v1/personal/students/${student1Id}`, authHeaders);
    assert(resGetUpdated.status === 200, 'GET /v1/personal/students/:id retorna HTTP 200');
    assert(resGetUpdated.data.student.name === 'Maria Clara Silva dos Santos', 'Nome atualizado persistido no banco');
    assert(resGetUpdated.data.student.phone === '(21) 99887-7665', 'Telefone atualizado persistido no banco');
    assert(resGetUpdated.data.student.goal === 'Hipertrofia & Forca', 'Objetivo atualizado persistido no perfil');
    assert(resGetUpdated.data.student.restrictions === 'Tendinite patelar no joelho direito', 'Restricoes persistidas no perfil');
    assert(resGetUpdated.data.student.current_weight === 64.2, 'Peso atualizado persistido no banco');

    // 5. Criacao e Edicao de Exercicios Customizados com R2
    console.log('\n--- TEST GROUP 5: Gestao de Exercicios Customizados (R2, Edicao, Desativacao) ---');
    const resCreateEx = await makeRequest('POST', '/api/v1/personal/exercises', authHeaders, {
      name: 'Elevação Pélvica com Barra e Mini-Band',
      muscle_group: 'gluteos',
      body_region: 'membros_inferiores',
      equipment: 'barra',
      category: 'hipertrofia',
      execution_type: 'bilateral',
      mechanics: 'composto',
      level: 'intermediario',
      instructions: 'Apoiar escápulas no banco, posicionar barra na linha do quadril e estender o quadril até alinhamento neutro.',
      technical_notes: 'Manter tíbias perpendiculares ao solo no topo da contração.',
      photo_url: 'https://r2.zemda.com/exercises/gluteos/elevacao-pelvica.jpg',
      exercise_file_id: null
    });
    assert(resCreateEx.status === 201, 'POST /v1/personal/exercises customizado retorna HTTP 201');
    const customExId = resCreateEx.data.exercise.id;
    assert(resCreateEx.data.exercise.equipment === 'barra', 'Equipamento salvo corretamente');
    assert(resCreateEx.data.exercise.photo_url === null && resCreateEx.data.exercise.exercise_file_id === null, 'URL não verificada não é persistida como foto R2');

    // Edicao do exercicio
    const resEditEx = await makeRequest('PUT', `/api/v1/personal/exercises/${customExId}`, authHeaders, {
      name: 'Elevação Pélvica Avançada com Barra',
      level: 'avancado',
      technical_notes: 'Pausa de 2 segundos no ponto de máxima contração isométrica.'
    });
    assert(resEditEx.status === 200, 'PUT /v1/personal/exercises/:id retorna HTTP 200');
    assert(resEditEx.data.exercise.name === 'Elevação Pélvica Avançada com Barra', 'Nome do exercicio editado com sucesso');
    assert(resEditEx.data.exercise.level === 'avancado', 'Nivel do exercicio alterado para avancado');

    // 6. Prescricao de Treino com Preservacao de Parametros e Reordenacao
    console.log('\n--- TEST GROUP 6: Prescricao de Treino, Reordenacao e Substituicao de Exercicios ---');
    const resWorkout = await makeRequest('POST', '/api/v1/personal/workouts', authHeaders, {
      patient_id: student1Id,
      title: 'Treino A - Inferiores Foco Glúteo',
      division: 'A',
      structure_type: 'AB',
      notes: 'Aquecimento articular de 5 min antes da primeira serie',
      exercises: [
        {
          exercise_id: customExId,
          order_index: 1,
          name: 'Elevação Pélvica Avançada com Barra',
          muscle_group: 'gluteos',
          sets: 4,
          reps: '10-12',
          load_kg: 80,
          rest_seconds: 90,
          cadence: '3-0-1-2',
          rpe: 8.5,
          rir: 1,
          technique: 'Ponto Zero (Isometria 2s na contração máxima)',
          notes: 'Foco total na contração de pico do glúteo'
        },
        {
          order_index: 2,
          name: 'Agachamento Búlgaro',
          muscle_group: 'quadriceps',
          sets: 3,
          reps: '10',
          load_kg: 16,
          rest_seconds: 60,
          cadence: '2-0-2',
          rpe: 8,
          rir: 2,
          technique: 'Direta'
        }
      ]
    });
    assert(resWorkout.status === 201, 'POST /v1/personal/workouts retorna HTTP 201');
    const workoutId = resWorkout.data.workout?.id || resWorkout.data.id;

    // Verificar se exercicio customizado usado em treino e protegido contra exclusao destrutiva
    const resDelCustom = await makeRequest('DELETE', `/api/v1/personal/exercises/${customExId}`, authHeaders);
    assert(resDelCustom.status === 200, 'DELETE /v1/personal/exercises/:id em exercicio com historico retorna HTTP 200');
    assert(resDelCustom.data.deactivated === true, 'Exercicio foi soft-desativado (is_active = 0) preservando historico do treino');

    // Verificar se o treino continua com seus dados intactos
    const resWorkoutDetails = await makeRequest('GET', `/api/v1/personal/workouts/${workoutId}`, authHeaders);
    assert(resWorkoutDetails.status === 200, 'Treino do aluno continua integro');
    assert(resWorkoutDetails.data.exercises.length === 2, 'Todos os 2 exercicios do treino continuam disponiveis');
    assert(resWorkoutDetails.data.exercises[0].load_kg === 80, 'Carga alvo (80kg) preservada');
    assert(resWorkoutDetails.data.exercises[0].technique.includes('Ponto Zero'), 'Tecnica avancada preservada');

    // 7. Teste de Avaliacao Fisica com Fotos Cloudflare R2
    console.log('\n--- TEST GROUP 7: Avaliacao Fisica com Fotos R2 e Antropometria ---');
    // Metadata fixtures only: no assertion here claims an upload to a real R2 bucket.
    for (const side of ['front', 'back', 'right', 'left']) {
      db.prepare(`INSERT INTO file_attachments (id,clinic_id,uploaded_by,object_key,original_filename,mime_type,file_size,category) VALUES (?, ?, ?, ?, ?, 'image/webp', 100, 'personal_assessment')`).run(
        `test-assessment-${side}`, tenantId, personalTrainerId, `clinics/${tenantId}/test/${side}.webp`, `${side}.webp`
      );
    }
    const resAssessment = await makeRequest('POST', '/api/v1/personal/assessments', authHeaders, {
      patient_id: student1Id,
      assessment_date: '2026-09-17',
      protocol: 'pollock_7',
      weight: 64.2,
      height: 168,
      body_fat_percentage: 21.5,
      composition_method: 'bioimpedance',
      photos: [
        { photo_type: 'front', file_id: 'test-assessment-front' },
        { photo_type: 'back', file_id: 'test-assessment-back' },
        { photo_type: 'right', file_id: 'test-assessment-right' },
        { photo_type: 'left', file_id: 'test-assessment-left' }
      ]
    });
    assert(resAssessment.status === 201, 'POST /v1/personal/assessments com 4 fotos R2 retorna HTTP 201');
    const assessmentId = resAssessment.data.assessment?.id || resAssessment.data.id;

    // Verificar fotos salvas
    const resPhotos = await makeRequest('GET', `/api/v1/personal/students/${student1Id}/photos`, authHeaders);
    assert(resPhotos.status === 200, 'GET /v1/personal/students/:id/photos retorna HTTP 200');
    assert(resPhotos.data.photos.length === 4, 'As 4 fotos da avaliacao fisica foram persistidas com sucesso');

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
    server.close();
  }
}

runTests();
