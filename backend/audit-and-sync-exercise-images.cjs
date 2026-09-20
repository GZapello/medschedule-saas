const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

async function main() {
  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, 'saas_schedule.db');
  console.log(`[Audit] Conectando ao banco de dados: ${dbPath}`);

  if (!fs.existsSync(dbPath)) {
    console.error(`[Audit] Banco de dados não encontrado em: ${dbPath}`);
    process.exit(1);
  }

  const rawDb = new DatabaseSync(dbPath);

  // Importa serviço compilado
  const { syncAllExerciseLibraryImages } = require('./dist/services/exercise-image-generator.service');
  const { DEFAULT_EXERCISE_LIBRARY } = require('./dist/config/exercise-library.seed');

  console.log(`[Audit] Total de exercícios no catálogo padrão: ${DEFAULT_EXERCISE_LIBRARY.length}`);

  // Executa sincronização e geração real de imagens WebP
  const syncResult = await syncAllExerciseLibraryImages(rawDb);
  console.log('[Audit] Resultado da sincronização:', syncResult);

  // Auditoria completa no banco de dados
  const totalExercises = rawDb.prepare('SELECT count(*) as count FROM personal_exercises').get().count;
  const withImage = rawDb.prepare(`
    SELECT count(*) as count
    FROM personal_exercises pe
    JOIN file_attachments fa ON fa.id = pe.exercise_file_id
    WHERE fa.storage_provider = 'cloudflare_r2' 
      AND fa.category = 'exercises'
      AND fa.mime_type = 'image/webp'
  `).get().count;

  const withoutImage = rawDb.prepare(`
    SELECT count(*) as count
    FROM personal_exercises
    WHERE exercise_file_id IS NULL OR trim(exercise_file_id) = ''
  `).get().count;

  const fakeIdExercises = rawDb.prepare(`
    SELECT count(*) as count
    FROM personal_exercises
    WHERE exercise_file_id LIKE 'att-ex-%'
  `).get().count;

  const fakeAttachments = rawDb.prepare(`
    SELECT count(*) as count
    FROM file_attachments
    WHERE id LIKE 'att-ex-%' OR object_key LIKE 'exercises/global/%'
  `).get().count;

  console.log('\n=============================================================');
  console.log('         AUDITORIA DEFINITIVA DA BIBLIOTECA DE EXERCÍCIOS    ');
  console.log('=============================================================');
  console.log(`Total de exercícios cadastrados:           ${totalExercises}`);
  console.log(`Exercícios com imagem real (WebP/R2):     ${withImage}`);
  console.log(`Exercícios sem imagem ("Sem foto"):        ${withoutImage}`);
  console.log(`Exercícios com ID fake (att-ex-%):         ${fakeIdExercises}`);
  console.log(`Anexos fake no banco (att-ex-% / fake path): ${fakeAttachments}`);
  console.log('-------------------------------------------------------------');

  if (totalExercises !== 119) {
    console.error(`❌ FALHA: Total de exercícios esperado é 119, mas encontrado ${totalExercises}`);
    process.exit(1);
  }

  if (withImage !== 119) {
    console.error(`❌ FALHA: Todos os 119 exercícios devem ter imagem real, mas apenas ${withImage} possuem!`);
    process.exit(1);
  }

  if (withoutImage !== 0) {
    console.error(`❌ FALHA: Nenhum exercício pode ficar sem foto, mas ${withoutImage} estão sem foto!`);
    process.exit(1);
  }

  if (fakeIdExercises !== 0 || fakeAttachments !== 0) {
    console.error(`❌ FALHA: Encontrados IDs ou anexos fake no banco!`);
    process.exit(1);
  }

  // Exemplos de exercícios com suas imagens auditadas
  console.log('\nAmostra de exercícios auditados com imagem real:');
  const sample = rawDb.prepare(`
    SELECT pe.id, pe.name, pe.muscle_group, pe.equipment, fa.id as file_id, fa.object_key, fa.file_size
    FROM personal_exercises pe
    JOIN file_attachments fa ON fa.id = pe.exercise_file_id
    LIMIT 5
  `).all();

  sample.forEach((row, i) => {
    console.log(`  ${i + 1}. [${row.id}] ${row.name}`);
    console.log(`     Grupo: ${row.muscle_group} | Equipamento: ${row.equipment}`);
    console.log(`     File Attachment ID: ${row.file_id}`);
    console.log(`     R2 Object Key:      ${row.object_key}`);
    console.log(`     Tamanho WebP:       ${row.file_size} bytes\n`);
  });

  console.log('✅ AUDITORIA 100% APROVADA: Todos os 119 exercícios possuem imagem real no R2!');
  console.log('=============================================================\n');
}

main().catch(err => {
  console.error('Erro na auditoria:', err);
  process.exit(1);
});
