import { DatabaseSync } from 'node:sqlite';

/**
 * Migração Idempotente e Segura:
 * Remoção DEFINITIVA de Profissões e Categorias Fora do Escopo de Saúde Humana.
 * 
 * Regras:
 * 1. NUNCA excluir contas de usuários, clínicas (tenants), pacientes, prontuários, agendamentos ou financeiro.
 * 2. Usuários vinculados a profissões fora do escopo têm:
 *    - profession_id = NULL
 *    - profession_name = 'Profissão precisa ser atualizada'
 *    - flags comerciais zeradas
 *    - practice_areas desvinculadas
 * 3. As profissões, especialidades e categorias fora do escopo são removidas das tabelas de catálogo.
 * 4. As profissões removidas são registradas em deleted_global_professions para impedir recriação por seeds futuros.
 */
export function migrateRemoveOutOfScopeProfessions(rawDb: DatabaseSync): void {
  const OUT_OF_SCOPE_PROFESSION_IDS = [
    // Não-clínicas / Fora de saúde humana
    'prof-advogado',
    'prof-contador',
    'prof-consultor',
    'prof-coach',
    'prof-cabeleireiro',
    'prof-lash-designer',
    'prof-professor-particular',
    'prof-tutor-escolar',
    'prof-adestrador',
    // Veterinária (fora de saúde humana)
    'prof-veterinario',
    'prof-medicina-veterinaria'
  ];

  const OUT_OF_SCOPE_CATEGORY_IDS = [
    'cat-pets',
    'cat-juridico',
    'cat-tech',
    'cat-domestico',
    'cat-dev-pessoal',
    'cat-edu',
    'cat-criativo'
  ];

  try {
    // Assegura tabela de registro de profissões globais excluídas
    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS deleted_global_professions (
        id TEXT PRIMARY KEY,
        slug TEXT,
        name TEXT,
        deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_deleted_global_professions_slug ON deleted_global_professions(slug);
    `);

    const getCols = (tbl: string): string[] => {
      try {
        return (rawDb.prepare(`PRAGMA table_info(${tbl})`).all() as any[]).map(c => c.name);
      } catch {
        return [];
      }
    };

    const userCols = new Set(getCols('users'));
    const profCols = new Set(getCols('professionals'));
    const cuCols = new Set(getCols('clinic_users'));

    const modCols = [
      'zemda_fono_enabled', 'zemda_to_enabled', 'zemda_nutri_enabled',
      'zemda_psico_enabled', 'zemda_pp_enabled', 'zemda_fisio_enabled',
      'zemda_odonto_enabled', 'zemda_personal_enabled', 'zemda_med_enabled'
    ];

    const userSetClauses = ['profession_id = NULL', "profession_name = 'Profissão precisa ser atualizada'"];
    for (const c of modCols) {
      if (userCols.has(c)) userSetClauses.push(`${c} = 0`);
    }
    const userStmt = rawDb.prepare(`UPDATE users SET ${userSetClauses.join(', ')} WHERE profession_id = ?`);

    const profSetClauses = ['profession_id = NULL', 'practice_areas = NULL'];
    if (profCols.has('specialty_id')) profSetClauses.push('specialty_id = NULL');
    if (profCols.has('specialty_custom')) profSetClauses.push('specialty_custom = NULL');
    for (const c of modCols) {
      if (profCols.has(c)) profSetClauses.push(`${c} = 0`);
    }
    const profStmt = rawDb.prepare(`UPDATE professionals SET ${profSetClauses.join(', ')} WHERE profession_id = ?`);

    // 1. Localizar e neutralizar usuários e profissionais com profissões fora do escopo
    for (const profId of OUT_OF_SCOPE_PROFESSION_IDS) {
      // 1.1 Neutraliza usuários
      try {
        userStmt.run(profId);
      } catch (_) {}

      // 1.2 Neutraliza profissionais
      try {
        profStmt.run(profId);
      } catch (_) {}

      // 1.4 Neutraliza menções em tenants (manager_profession)
      try {
        rawDb.prepare(`
          UPDATE tenants
          SET manager_profession = 'Profissão precisa ser atualizada'
          WHERE manager_profession = ?
        `).run(profId);
      } catch (_) {}

      // 2. Remover mappings de capabilities da profissão
      try {
        rawDb.prepare('DELETE FROM profession_capabilities WHERE profession_id = ?').run(profId);
      } catch (_) {}

      // 3. Remover especialidades da profissão
      try {
        rawDb.prepare('DELETE FROM specialties WHERE profession_id = ?').run(profId);
      } catch (_) {}

      // 4. Remover áreas de atuação da profissão
      try {
        const areas = rawDb.prepare('SELECT id FROM practice_areas WHERE profession_id = ?').all(profId) as any[];
        for (const area of areas) {
          try {
            rawDb.prepare('DELETE FROM practice_area_capabilities WHERE practice_area_id = ?').run(area.id);
          } catch (_) {}
          try {
            rawDb.prepare('DELETE FROM user_practice_areas WHERE practice_area_id = ?').run(area.id);
          } catch (_) {}
        }
        rawDb.prepare('DELETE FROM practice_areas WHERE profession_id = ?').run(profId);
      } catch (_) {}

      // 5. Registrar em deleted_global_professions antes de remover
      try {
        const profRecord = rawDb.prepare('SELECT id, slug, name FROM professions WHERE id = ?').get(profId) as any;
        if (profRecord) {
          rawDb.prepare(`
            INSERT OR REPLACE INTO deleted_global_professions (id, slug, name, deleted_at, deleted_by)
            VALUES (?, ?, ?, datetime('now'), 'system_purge')
          `).run(profRecord.id, profRecord.slug, profRecord.name);
        } else {
          rawDb.prepare(`
            INSERT OR IGNORE INTO deleted_global_professions (id, slug, name, deleted_at, deleted_by)
            VALUES (?, ?, ?, datetime('now'), 'system_purge')
          `).run(profId, profId.replace(/^prof-/, ''), profId);
        }
      } catch (_) {}

      // 6. Remover da tabela professions
      try {
        rawDb.prepare('DELETE FROM professions WHERE id = ?').run(profId);
      } catch (_) {}
    }

    // 1.3 Neutraliza clinic_users
    try {
      const cuSetClauses: string[] = [];
      for (const c of modCols) {
        if (cuCols.has(c)) cuSetClauses.push(`${c} = 0`);
      }
      if (cuSetClauses.length > 0) {
        rawDb.prepare(`
          UPDATE clinic_users
          SET ${cuSetClauses.join(', ')}
          WHERE user_id IN (SELECT id FROM users WHERE profession_id IS NULL AND profession_name = 'Profissão precisa ser atualizada')
        `).run();
      }
    } catch (_) {}

    // 7. Remover categorias fora do escopo
    for (const catId of OUT_OF_SCOPE_CATEGORY_IDS) {
      try {
        rawDb.prepare('DELETE FROM categories WHERE id = ?').run(catId);
      } catch (_) {}
    }

    console.log('[Migration] migrateRemoveOutOfScopeProfessions executada com sucesso.');
  } catch (err) {
    console.error('[Migration] Erro em migrateRemoveOutOfScopeProfessions:', err);
  }
}
