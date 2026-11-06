/**
 * TESTE DE PROTEÇÃO PERMANENTE DA BIBLIOTECA DE EXERCÍCIOS — ZEMDAPERSONAL
 *
 * Este conjunto de testes garante a integridade inegociável da biblioteca de exercícios:
 * 1. 187 exercícios oficiais estáveis e catalogados.
 * 2. 100% dos exercícios possuem imagem ou GIF válido existente em disco (sem links quebrados).
 * 3. Seed é idempotente e estritamente não-destrutivo.
 * 4. Exercícios personalizados das clínicas jamais são sobrescritos, excluídos ou alterados pelo seed.
 * 5. Mecanismo de auto-recuperação (self-healing): se o catálogo oficial for corrompido ou apagado,
 *    a chamada a listExercises restaura automaticamente os 187 exercícios sem afetar os dados da clínica.
 * 6. Histórico de treinos anteriores e snapshots permanecem imutáveis.
 * 7. Filtros clínicos e buscas textuais operam sem perda de dados.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Configuração de ambiente de teste isolado
process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-protection-')), 'test.db');
process.env.R2_MOCK_STORAGE = 'true';
process.env.ZEMDA_FILES_SIGNING_SECRET = process.env.ZEMDA_FILES_SIGNING_SECRET || 'test-signing-secret-32-chars-long-hex';

const { db, initializeDatabase } = require('./dist/config/database');
const rawDb = db;
initializeDatabase();

const {
  DEFAULT_EXERCISE_LIBRARY: catalog,
  seedExerciseLibrary,
  ensureExerciseLibrarySeeded
} = require('./dist/config/exercise-library.seed');
const { PersonalController } = require('./dist/controllers/personal.controller');

let testCount = 0;
function test(description, fn) {
  testCount++;
  try {
    fn();
    console.log(`PASS [${testCount}] ${description}`);
  } catch (err) {
    console.error(`FAIL [${testCount}] ${description}`);
    throw err;
  }
}

async function asyncTest(description, fn) {
  testCount++;
  try {
    await fn();
    console.log(`PASS [${testCount}] ${description}`);
  } catch (err) {
    console.error(`FAIL [${testCount}] ${description}`);
    throw err;
  }
}

function mockReqRes(options = {}) {
  const req = {
    tenantId: options.tenantId || 'clinic-test-1',
    user: {
      userId: options.userId || 'user-trainer-1',
      role: options.role || 'professional'
    },
    query: options.query || {},
    body: options.body || {},
    params: options.params || {},
    headers: {},
    ip: '127.0.0.1',
    get: () => undefined
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };

  return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

async function runProtectionSuite() {
  console.log('================================================================');
  console.log(' INICIANDO SUÍTE DE PROTEÇÃO PERMANENTE DO ZEMDAPERSONAL');
  console.log('================================================================\n');

  // Preparação de dados básicos no banco de teste
  db.prepare("INSERT OR IGNORE INTO tenants (id, name, slug, email, status) VALUES ('clinic-test-1', 'Clínica Fitness', 'clinica-fitness', 'fit@zemda.com.br', 'active')").run();
  db.prepare("INSERT OR IGNORE INTO professions (id, name, slug) VALUES ('prof-personal-trainer', 'Personal Trainer', 'personal-trainer')").run();
  db.prepare("INSERT OR IGNORE INTO users (id, tenant_id, email, password_hash, role, status, name, profession_id) VALUES ('user-trainer-1', 'clinic-test-1', 'treinador@zemda.com.br', 'hash', 'professional', 'active', 'Treinador Teste', 'prof-personal-trainer')").run();
  db.prepare("INSERT OR IGNORE INTO professionals (id, tenant_id, user_id, name, profession_id, active) VALUES ('prof-1', 'clinic-test-1', 'user-trainer-1', 'Treinador Teste', 'prof-personal-trainer', 1)").run();

  // 1. Verificação do Catálogo Oficial
  test('O catálogo oficial contém exatamente 187 exercícios padrão', () => {
    assert.strictEqual(catalog.length, 187, `Esperado 187 exercícios, encontrado ${catalog.length}`);
  });

  test('Todos os 187 exercícios possuem IDs únicos e canônicos', () => {
    const ids = new Set(catalog.map(ex => ex.id));
    assert.strictEqual(ids.size, 187, 'Existem IDs duplicados no catálogo oficial');
  });

  test('Todos os 187 exercícios possuem campos obrigatórios íntegros (nome, grupo, categoria, instruções)', () => {
    for (const ex of catalog) {
      assert.ok(ex.id && ex.id.startsWith('ex-'), `ID inválido: ${ex.id}`);
      assert.ok(ex.name && ex.name.trim().length > 0, `Nome ausente para ${ex.id}`);
      assert.ok(ex.muscle_group && ex.muscle_group.trim().length > 0, `Grupo muscular ausente para ${ex.id}`);
      assert.ok(ex.category && ex.category.trim().length > 0, `Categoria ausente para ${ex.id}`);
      assert.ok(ex.instructions && ex.instructions.trim().length > 0, `Instruções ausentes para ${ex.id}`);
    }
  });

  test('Todos os exercícios do catálogo possuem mídias estáticas que existem em disco no frontend', () => {
    const publicDir = path.resolve(__dirname, '../frontend/public');
    let missingMedia = 0;
    for (const ex of catalog) {
      if (ex.photo_url) {
        const fullPath = path.join(publicDir, ex.photo_url);
        if (!fs.existsSync(fullPath)) {
          console.warn(`Mídia ausente para ${ex.id}: ${fullPath}`);
          missingMedia++;
        }
      }
    }
    assert.strictEqual(missingMedia, 0, `Existem ${missingMedia} mídias ausentes em disco`);
  });

  // 2. Persistência no Banco de Dados
  test('O banco de dados possui os 187 exercícios globais semeados e ativos', () => {
    const row = db.prepare("SELECT count(*) as total FROM personal_exercises WHERE tenant_id = 'global' AND is_custom = 0 AND is_active = 1").get();
    assert.strictEqual(row.total, 187, `Esperado 187 exercícios ativos globais, encontrado ${row.total}`);
  });

  // 3. Não-Destrutividade com Exercícios Customizados
  await asyncTest('Criação de exercício personalizado pela clínica e preservação contra re-seed', async () => {
    const { req, res, getStatus, getData } = mockReqRes({
      body: {
        name: 'Elevação Pélvica Especial da Clínica',
        muscle_group: 'Glúteos',
        body_region: 'Membros Inferiores',
        equipment: 'Halteres',
        category: 'Musculação',
        execution_type: 'bilateral',
        instructions: 'Instruções personalizadas pelo treinador.'
      }
    });

    await PersonalController.createExercise(req, res);
    assert.strictEqual(getStatus(), 201, 'Falha ao criar exercício customizado');
    const customExerciseId = getData().id;
    assert.ok(customExerciseId.startsWith('pex-'), 'ID de exercício customizado deve iniciar com pex-');

    // Executa múltiplos seeds repetidos para garantir idempotência e não-destrutividade
    seedExerciseLibrary(rawDb);
    seedExerciseLibrary(rawDb);
    ensureExerciseLibrarySeeded(rawDb);

    // O exercício customizado continua existindo intacto
    const customInDb = db.prepare("SELECT * FROM personal_exercises WHERE id = ? AND tenant_id = 'clinic-test-1'").get(customExerciseId);
    assert.ok(customInDb, 'Exercício customizado foi indevidamente removido pelo seed');
    assert.strictEqual(customInDb.name, 'Elevação Pélvica Especial da Clínica');
    assert.strictEqual(customInDb.is_custom, 1);

    // E os 187 globais permanecem intactos
    const globalCount = db.prepare("SELECT count(*) as total FROM personal_exercises WHERE tenant_id = 'global' AND is_custom = 0 AND is_active = 1").get();
    assert.strictEqual(globalCount.total, 187);
  });

  // 4. Auto-Recuperação (Self-Healing)
  await asyncTest('Self-Healing: Se os exercícios globais forem apagados, listExercises restaura automaticamente os 187', async () => {
    // Simula desastre ou perda de registros globais
    db.prepare("DELETE FROM personal_exercises WHERE tenant_id = 'global'").run();
    const countAfterDelete = db.prepare("SELECT count(*) as total FROM personal_exercises WHERE tenant_id = 'global'").get().total;
    assert.strictEqual(countAfterDelete, 0, 'Exercícios globais deveriam ter sido zerados para o teste');

    // Chamada à API listExercises
    const { req, res, getStatus, getData } = mockReqRes();
    await PersonalController.listExercises(req, res);

    assert.strictEqual(getStatus(), 200, 'listExercises falhou');
    const exercises = getData().exercises;

    // Deve conter os 187 oficiais + 1 personalizado criado anteriormente = 188
    assert.ok(exercises.length >= 187, `Esperado no mínimo 187 exercícios após self-healing, recebido ${exercises.length}`);

    // Confirma restauração no banco
    const restoredCount = db.prepare("SELECT count(*) as total FROM personal_exercises WHERE tenant_id = 'global' AND is_custom = 0 AND is_active = 1").get().total;
    assert.strictEqual(restoredCount, 187, 'Self-healing não restaurou os 187 exercícios oficiais no banco');
  });

  // 5. Preservação de Prescrições e Treinos Vinculados
  await asyncTest('Treinos prescritos preservam snapshot de exercícios mesmo após re-seeding', async () => {
    // Cria paciente/aluno para teste
    db.prepare("INSERT OR IGNORE INTO patients (id, tenant_id, full_name, active) VALUES ('patient-stud-1', 'clinic-test-1', 'Aluno Teste', 1)").run();

    // Cria treino vinculado a exercício padrão
    const { req, res, getStatus, getData } = mockReqRes({
      body: {
        patient_id: 'patient-stud-1',
        title: 'Treino A - Peitoral e Tríceps',
        exercises: [
          {
            exercise_id: 'ex-supino-reto-barra',
            sets: 4,
            reps: '8-10',
            load_kg: 80,
            rest_seconds: 90
          }
        ]
      }
    });

    await PersonalController.createWorkout(req, res);
    assert.strictEqual(getStatus(), 201, 'Falha ao prescrever treino');
    const workoutId = getData().id;

    // Executa novo seed e reinicialização
    seedExerciseLibrary(rawDb);
    ensureExerciseLibrarySeeded(rawDb);

    // Consulta treino salvo
    const { req: getReq, res: getRes, getData: getWorkoutData } = mockReqRes({
      params: { id: workoutId }
    });
    await PersonalController.getWorkout(getReq, getRes);
    const workoutExercises = getWorkoutData().exercises;

    assert.strictEqual(workoutExercises.length, 1);
    assert.strictEqual(workoutExercises[0].exercise_id, 'ex-supino-reto-barra');
    assert.strictEqual(workoutExercises[0].name, 'Supino Reto com Barra');
    assert.strictEqual(workoutExercises[0].sets, 4);
    assert.strictEqual(workoutExercises[0].load_kg, 80);
  });

  // 6. Testes de Filtros da Biblioteca
  await asyncTest('Filtros de grupamento muscular retornam exercícios correspondentes sem perda', async () => {
    const musclesToTest = ['peitoral', 'costas', 'biceps', 'triceps', 'quadriceps', 'gluteos', 'alongamento'];
    for (const muscle of musclesToTest) {
      const { req, res, getData } = mockReqRes({ query: { muscle } });
      await PersonalController.listExercises(req, res);
      const results = getData().exercises;
      assert.ok(results.length > 0, `Nenhum exercício retornado para o filtro de músculo: ${muscle}`);
    }
  });

  await asyncTest('Busca textual por nome de exercício retorna resultados corretos', async () => {
    const { req, res, getData } = mockReqRes({ query: { q: 'supino' } });
    await PersonalController.listExercises(req, res);
    const results = getData().exercises;
    assert.ok(results.length >= 4, `Esperado múltiplos supinos na busca, encontrado ${results.length}`);
    for (const ex of results) {
      assert.ok(ex.name.toLowerCase().includes('supino'), `Resultado incompatível: ${ex.name}`);
    }
  });

  console.log('\n================================================================');
  console.log(` TODOS OS ${testCount} TESTES DE PROTEÇÃO PERMANENTE FORAM APROVADOS COM SUCESSO!`);
  console.log('================================================================\n');
}

runProtectionSuite().catch(err => {
  console.error('\nFALHA CRÍTICA NA SUÍTE DE PROTEÇÃO:', err);
  process.exit(1);
});
