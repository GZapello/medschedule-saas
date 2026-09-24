import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { resolveCanonicalProfession } from '../utils/profession-module';
import { comparePassword } from '../utils/password';
import { REGISTRATION_PROFESSION_ALIASES } from '../types/registration-professions';

export class TaxonomyController {
  // Categorias (Tipos de Serviço Macro)
  static listCategories(req: Request, res: Response): void {
    try {
      const showAll = req.query.all === 'true';
      const whereClause = showAll ? '' : 'WHERE active = 1';
      const stmt = db.prepare(`
        SELECT id, tenant_id, name, slug, icon, description, default_terminology, is_clinical, active
        FROM categories
        ${whereClause}
        ORDER BY name ASC
      `);
      const categories = stmt.all();
      res.json(categories);
    } catch (err: any) {
      console.error('[TaxonomyController.listCategories] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar categorias' });
    }
  }

  static createCategory(req: Request, res: Response): void {
    try {
      const { name, slug, icon, description, defaultTerminology, isClinical } = req.body;
      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Nome da categoria é obrigatório' });
        return;
      }

      const id = 'cat-' + uuidv4().slice(0, 8);
      const generatedSlug = slug || name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');

      db.prepare(`
        INSERT INTO categories (id, name, slug, icon, description, default_terminology, is_clinical, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        id,
        name.trim(),
        generatedSlug,
        icon || 'Activity',
        description || null,
        defaultTerminology || 'paciente',
        isClinical !== undefined ? (isClinical ? 1 : 0) : 1
      );

      const created = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
      res.status(201).json(created);
    } catch (err: any) {
      console.error('[TaxonomyController.createCategory] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar categoria' });
    }
  }

  static updateCategory(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const { name, slug, icon, description, defaultTerminology, isClinical } = req.body;

      const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
      if (!category) {
        res.status(404).json({ error: 'Categoria não encontrada' });
        return;
      }

      db.prepare(`
        UPDATE categories
        SET name = COALESCE(?, name),
            slug = COALESCE(?, slug),
            icon = COALESCE(?, icon),
            description = COALESCE(?, description),
            default_terminology = COALESCE(?, default_terminology),
            is_clinical = COALESCE(?, is_clinical),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        name ? name.trim() : null,
        slug || null,
        icon || null,
        description !== undefined ? description : null,
        defaultTerminology || null,
        isClinical !== undefined ? (isClinical ? 1 : 0) : null,
        id
      );

      const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
      res.json(updated);
    } catch (err: any) {
      console.error('[TaxonomyController.updateCategory] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar categoria' });
    }
  }

  static toggleCategoryStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;

      if (!category) {
        res.status(404).json({ error: 'Tipo de serviço não encontrado' });
        return;
      }

      const newStatus = category.active === 1 ? 0 : 1;
      db.prepare('UPDATE categories SET active = ? WHERE id = ?').run(newStatus, id);

      res.json({
        message: `Tipo de serviço "${category.name}" foi ${newStatus === 1 ? 'ativado' : 'desativado'} com sucesso`,
        active: newStatus
      });
    } catch (err: any) {
      console.error('[TaxonomyController.toggleCategoryStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao alterar status do tipo de serviço' });
    }
  }

  // Profissões
  static listProfessions(req: Request, res: Response): void {
    try {
      const { categoryId, all } = req.query;
      const showAll = all === 'true';

      let query = `
        SELECT p.id, p.category_id, c.name as category_name, c.is_clinical as category_is_clinical,
               p.name, p.slug, p.registration_board_label, p.registration_required, p.custom_fields_schema, p.active
        FROM professions p
        LEFT JOIN categories c ON c.id = p.category_id
      `;
      const conditions: string[] = [];
      const params: any[] = [];

      // Sempre ocultar profissões que foram explicitamente excluídas pelo SuperAdmin
      try {
        conditions.push('p.id NOT IN (SELECT id FROM deleted_global_professions)');
      } catch (_) {}

      if (!showAll) {
        conditions.push('p.active = 1');
      }

      if (categoryId) {
        conditions.push('p.category_id = ?');
        params.push(categoryId);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY p.name ASC';

      const stmt = db.prepare(query);
      const rows = stmt.all(...params);

      const professions = rows.map((p: any) => {
        const resolution = resolveCanonicalProfession({
          id: p.id,
          name: p.name,
          slug: p.slug,
          registrationType: p.registration_board_label
        });
        const primaryModule = resolution.commercialModule;
        const modules = primaryModule ? [primaryModule, 'ZemdaBody'] : ['Recursos gerais do Zemda', 'ZemdaBody'];
        const accessLabel = modules.join(' + ');
        const displayOption = `${p.name} — ${accessLabel}`;
        const isAdministrative = resolution.taxonomyCategory === 'ADMINISTRATIVE' || p.category_is_clinical === 0 || p.category_id === 'cat-admin';
        return {
          ...p,
          label: p.name,
          canonicalId: resolution.canonicalId,
          canonicalName: resolution.canonicalName,
          boardLabel: p.registration_board_label || resolution.boardLabel,
          module: primaryModule || undefined,
          modules,
          accessLabel,
          displayOption,
          administrative: isAdministrative,
          clinicalWorkspace: resolution.clinicalWorkspace,
          taxonomyCategory: resolution.taxonomyCategory,
          isSpecificAlias: resolution.isSpecificAlias
        };
      });

      res.json(professions);
    } catch (err: any) {
      console.error('[TaxonomyController.listProfessions] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar profissões' });
    }
  }

  static createProfession(req: Request, res: Response): void {
    try {
      const { categoryId, name, slug, registrationBoardLabel, registrationRequired, customFieldsSchema } = req.body;
      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Nome da profissão é obrigatório' });
        return;
      }

      // Se categoria não foi informada, vincula a uma categoria padrão
      let catId = categoryId;
      if (!catId) {
        const defaultCat = db.prepare("SELECT id FROM categories WHERE slug = 'outros' OR slug = 'saude-mental' LIMIT 1").get() as any;
        catId = defaultCat ? defaultCat.id : 'cat-outros';
      }

      const id = 'prof-' + uuidv4().slice(0, 8);
      const generatedSlug = slug || name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');

      const insertStmt = db.prepare(`
        INSERT INTO professions (id, tenant_id, category_id, name, slug, registration_board_label, registration_required, custom_fields_schema, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      insertStmt.run(
        id,
        null,
        catId,
        name.trim(),
        generatedSlug,
        registrationBoardLabel ? registrationBoardLabel.trim().toUpperCase() : null,
        registrationRequired ? 1 : 0,
        customFieldsSchema ? JSON.stringify(customFieldsSchema) : null
      );

      res.status(201).json({ id, categoryId: catId, name: name.trim(), slug: generatedSlug, message: 'Profissão cadastrada com sucesso' });
    } catch (err: any) {
      console.error('[TaxonomyController.createProfession] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar profissão' });
    }
  }

  static updateProfession(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const { name, categoryId, registrationBoardLabel, registrationRequired } = req.body;

      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Nome da profissão é obrigatório' });
        return;
      }

      const existing = db.prepare('SELECT id FROM professions WHERE id = ?').get(id);
      if (!existing) {
        res.status(404).json({ error: 'Profissão não encontrada' });
        return;
      }

      db.prepare(`
        UPDATE professions SET
          name = ?,
          category_id = COALESCE(?, category_id),
          registration_board_label = ?,
          registration_required = ?
        WHERE id = ?
      `).run(
        name.trim(),
        categoryId || null,
        registrationBoardLabel ? registrationBoardLabel.trim().toUpperCase() : null,
        registrationRequired ? 1 : 0,
        id
      );

      res.json({ message: 'Profissão atualizada com sucesso' });
    } catch (err: any) {
      console.error('[TaxonomyController.updateProfession] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar profissão' });
    }
  }

  static toggleProfessionStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const profession = db.prepare('SELECT id, name, active FROM professions WHERE id = ?').get(id) as any;

      if (!profession) {
        res.status(404).json({ error: 'Profissão não encontrada' });
        return;
      }

      const newStatus = profession.active === 1 ? 0 : 1;
      db.prepare('UPDATE professions SET active = ? WHERE id = ?').run(newStatus, id);

      res.json({
        message: `Profissão "${profession.name}" foi ${newStatus === 1 ? 'ativada' : 'desativada'} com sucesso`,
        active: newStatus
      });
    } catch (err: any) {
      console.error('[TaxonomyController.toggleProfessionStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao alterar status da profissão' });
    }
  }

  // Especialidades
  static listSpecialties(req: Request, res: Response): void {
    try {
      const { professionId, all } = req.query;
      const showAll = all === 'true';

      let query = `
        SELECT s.id, s.profession_id, p.name as profession_name, s.name, s.slug, s.description, s.color, s.active
        FROM specialties s
        LEFT JOIN professions p ON p.id = s.profession_id
      `;
      const conditions: string[] = [];
      const params: any[] = [];

      if (!showAll) {
        conditions.push('s.active = 1');
      }

      if (professionId) {
        conditions.push('s.profession_id = ?');
        params.push(professionId);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY s.name ASC';

      const stmt = db.prepare(query);
      const specialties = stmt.all(...params);
      res.json(specialties);
    } catch (err: any) {
      console.error('[TaxonomyController.listSpecialties] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar especialidades' });
    }
  }

  static createSpecialty(req: Request, res: Response): void {
    try {
      const { professionId, name, slug, description, color } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Nome da especialidade é obrigatório' });
        return;
      }

      const id = 'spec-' + uuidv4().slice(0, 8);
      const generatedSlug = slug || name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');

      const insertStmt = db.prepare(`
        INSERT INTO specialties (id, tenant_id, profession_id, name, slug, description, color, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);

      insertStmt.run(
        id,
        req.tenantId || null,
        professionId || null,
        name,
        generatedSlug,
        description || null,
        color || '#4f46e5'
      );

      res.status(201).json({ id, professionId, name, slug: generatedSlug });
    } catch (err: any) {
      console.error('[TaxonomyController.createSpecialty] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar especialidade' });
    }
  }

  // Consulta de Impacto antes da Exclusão de Profissão Global (Exclusivo SuperAdmin)
  static getProfessionImpact(req: Request, res: Response): void {
    try {
      const id = String(req.params.id);
      const prof = db.prepare('SELECT id, name, slug FROM professions WHERE id = ?').get(id) as any;
      if (!prof) {
        res.status(404).json({ error: 'Profissão não encontrada' });
        return;
      }

      // Aliases que apontam para esta profissão
      const aliases = Object.entries(REGISTRATION_PROFESSION_ALIASES)
        .filter(([_, target]) => target === id || target === prof.slug)
        .map(([alias]) => alias);

      // Áreas de atuação vinculadas
      const practiceAreas = db.prepare('SELECT id, name, slug FROM practice_areas WHERE profession_id = ?').all(id) as any[];

      // Usuários atualmente vinculados
      const affectedUsersCount = (db.prepare('SELECT COUNT(*) as c FROM users WHERE profession_id = ?').get(id) as any)?.c || 0;
      const affectedProfessionalsCount = (db.prepare('SELECT COUNT(*) as c FROM professionals WHERE profession_id = ?').get(id) as any)?.c || 0;

      // Capabilities mapeadas
      const capabilitiesCount = (db.prepare('SELECT COUNT(*) as c FROM profession_capabilities WHERE profession_id = ?').get(id) as any)?.c || 0;

      // Especialidades vinculadas
      const specialtiesCount = (db.prepare('SELECT COUNT(*) as c FROM specialties WHERE profession_id = ?').get(id) as any)?.c || 0;

      res.json({
        profession: prof,
        aliases,
        aliasesCount: aliases.length,
        practiceAreas,
        practiceAreasCount: practiceAreas.length,
        affectedUsersCount,
        affectedProfessionalsCount,
        capabilitiesCount,
        specialtiesCount
      });
    } catch (err: any) {
      console.error('[TaxonomyController.getProfessionImpact] Erro:', err);
      res.status(500).json({ error: 'Erro ao calcular impacto da profissão' });
    }
  }

  // Exclusão Definitiva de Profissão Global (Exclusivo SuperAdmin com validação de senha)
  static async deleteProfession(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const { password, confirmation, reason } = req.body;
      const currentUserId = (req as any).user?.userId;

      if (!currentUserId) {
        res.status(401).json({ error: 'Usuário não autenticado.' });
        return;
      }

      // Valida credenciais do SuperAdmin no banco de dados
      const adminUser = db.prepare('SELECT id, email, password_hash, role FROM users WHERE id = ?').get(currentUserId) as any;
      if (!adminUser || adminUser.role !== 'superadmin') {
        res.status(403).json({ error: 'Acesso negado. Apenas o Administrador do Sistema pode executar esta operação.' });
        return;
      }

      // Validação rigorosa da senha atual do administrador via bcrypt
      const isPasswordValid = await comparePassword(typeof password === 'string' ? password : '', adminUser.password_hash || '');
      if (!isPasswordValid) {
        res.status(403).json({ error: 'Senha do Administrador inválida. Nenhuma alteração foi realizada.' });
        return;
      }

      if (confirmation !== 'EXCLUIR') {
        res.status(400).json({ error: 'Confirmação inválida. Digite exatamente a palavra EXCLUIR para confirmar.' });
        return;
      }

      purgeGlobalProfession(id, adminUser.id, reason);

      res.json({ message: 'Profissão global excluída definitivamente', deleted_profession_id: id });
    } catch (err: any) {
      console.error('[TaxonomyController.deleteProfession] Erro:', err);
      res.status(500).json({ error: err?.message || 'Erro ao excluir profissão' });
    }
  }
}

/**
 * Rotina Centralizada de Purge de Profissão Global
 */
export function purgeGlobalProfession(professionId: string, adminUserId: string, reason?: string): void {
  const prof = db.prepare('SELECT id, name, slug FROM professions WHERE id = ?').get(professionId) as any;
  if (!prof) throw new Error('Profissão não encontrada.');

  db.transaction(() => {
    // 1. Desvincular e neutralizar usuários e profissionais (NUNCA deletar contas de usuários!)
    db.prepare(`
      UPDATE users
      SET profession_id = NULL,
          profession_name = 'Profissão precisa ser atualizada'
      WHERE profession_id = ?
    `).run(professionId);

    db.prepare(`
      UPDATE professionals
      SET profession_id = NULL
      WHERE profession_id = ?
    `).run(professionId);

    db.prepare(`
      UPDATE tenants
      SET manager_profession = 'Profissão precisa ser atualizada'
      WHERE manager_profession = ? OR manager_profession = ?
    `).run(professionId, prof.name);

    // 2. Remover capabilities e especialidades da profissão
    db.prepare('DELETE FROM profession_capabilities WHERE profession_id = ?').run(professionId);
    db.prepare('DELETE FROM specialties WHERE profession_id = ?').run(professionId);

    // 3. Remover áreas de atuação exclusivas desta profissão
    const areas = db.prepare('SELECT id FROM practice_areas WHERE profession_id = ?').all(professionId) as any[];
    for (const area of areas) {
      db.prepare('DELETE FROM practice_area_capabilities WHERE practice_area_id = ?').run(area.id);
      db.prepare('DELETE FROM user_practice_areas WHERE practice_area_id = ?').run(area.id);
    }
    db.prepare('DELETE FROM practice_areas WHERE profession_id = ?').run(professionId);

    // 4. Remover da tabela professions
    db.prepare('DELETE FROM professions WHERE id = ?').run(professionId);

    // 5. Inserir em deleted_global_professions para impedir que seeds ou restarts a recriem
    db.prepare(`
      INSERT OR REPLACE INTO deleted_global_professions (id, slug, name, deleted_at, deleted_by)
      VALUES (?, ?, ?, datetime('now'), ?)
    `).run(prof.id, prof.slug, prof.name, adminUserId);

    // 6. Log de auditoria da remoção da profissão
    try {
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity, entity_id, old_values, new_values, created_at)
        VALUES (?, ?, 'DELETE_GLOBAL_PROFESSION', 'professions', ?, ?, ?, datetime('now'))
      `).run(
        uuidv4(),
        adminUserId,
        prof.id,
        JSON.stringify({ name: prof.name, slug: prof.slug, reason: reason || 'Exclusão administrativa definitiva' }),
        null
      );
    } catch (_) {}
  })();
}
