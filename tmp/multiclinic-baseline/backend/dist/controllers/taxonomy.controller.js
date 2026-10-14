"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaxonomyController = void 0;
exports.purgeGlobalProfession = purgeGlobalProfession;
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
const profession_module_1 = require("../utils/profession-module");
const password_1 = require("../utils/password");
const registration_professions_1 = require("../types/registration-professions");
class TaxonomyController {
    // Categorias (Tipos de Serviço Macro)
    static listCategories(req, res) {
        try {
            const showAll = req.query.all === 'true';
            const whereClause = showAll ? '' : 'WHERE active = 1';
            const stmt = database_1.db.prepare(`
        SELECT id, tenant_id, name, slug, icon, description, default_terminology, is_clinical, active
        FROM categories
        ${whereClause}
        ORDER BY name ASC
      `);
            const categories = stmt.all();
            res.json(categories);
        }
        catch (err) {
            console.error('[TaxonomyController.listCategories] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar categorias' });
        }
    }
    static createCategory(req, res) {
        try {
            const { name, slug, icon, description, defaultTerminology, isClinical } = req.body;
            if (!name || !name.trim()) {
                res.status(400).json({ error: 'Nome da categoria é obrigatório' });
                return;
            }
            const id = 'cat-' + (0, uuid_1.v4)().slice(0, 8);
            const generatedSlug = slug || name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
            database_1.db.prepare(`
        INSERT INTO categories (id, name, slug, icon, description, default_terminology, is_clinical, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(id, name.trim(), generatedSlug, icon || 'Activity', description || null, defaultTerminology || 'paciente', isClinical !== undefined ? (isClinical ? 1 : 0) : 1);
            const created = database_1.db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
            res.status(201).json(created);
        }
        catch (err) {
            console.error('[TaxonomyController.createCategory] Erro:', err);
            res.status(500).json({ error: 'Erro ao criar categoria' });
        }
    }
    static updateCategory(req, res) {
        try {
            const { id } = req.params;
            const { name, slug, icon, description, defaultTerminology, isClinical } = req.body;
            const category = database_1.db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
            if (!category) {
                res.status(404).json({ error: 'Categoria não encontrada' });
                return;
            }
            database_1.db.prepare(`
        UPDATE categories
        SET name = COALESCE(?, name),
            slug = COALESCE(?, slug),
            icon = COALESCE(?, icon),
            description = COALESCE(?, description),
            default_terminology = COALESCE(?, default_terminology),
            is_clinical = COALESCE(?, is_clinical),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(name ? name.trim() : null, slug || null, icon || null, description !== undefined ? description : null, defaultTerminology || null, isClinical !== undefined ? (isClinical ? 1 : 0) : null, id);
            const updated = database_1.db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
            res.json(updated);
        }
        catch (err) {
            console.error('[TaxonomyController.updateCategory] Erro:', err);
            res.status(500).json({ error: 'Erro ao atualizar categoria' });
        }
    }
    static toggleCategoryStatus(req, res) {
        try {
            const { id } = req.params;
            const category = database_1.db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
            if (!category) {
                res.status(404).json({ error: 'Tipo de serviço não encontrado' });
                return;
            }
            const newStatus = category.active === 1 ? 0 : 1;
            database_1.db.prepare('UPDATE categories SET active = ? WHERE id = ?').run(newStatus, id);
            res.json({
                message: `Tipo de serviço "${category.name}" foi ${newStatus === 1 ? 'ativado' : 'desativado'} com sucesso`,
                active: newStatus
            });
        }
        catch (err) {
            console.error('[TaxonomyController.toggleCategoryStatus] Erro:', err);
            res.status(500).json({ error: 'Erro ao alterar status do tipo de serviço' });
        }
    }
    // Profissões
    static listProfessions(req, res) {
        try {
            const { categoryId, all } = req.query;
            const showAll = all === 'true';
            let query = `
        SELECT p.id, p.category_id, c.name as category_name, c.is_clinical as category_is_clinical,
               p.name, p.slug, p.registration_board_label, p.registration_required, p.custom_fields_schema, p.active, p.is_canonical
        FROM professions p
        LEFT JOIN categories c ON c.id = p.category_id
      `;
            const conditions = [];
            const params = [];
            // Sempre ocultar profissões que foram explicitamente excluídas pelo SuperAdmin
            try {
                conditions.push('p.id NOT IN (SELECT id FROM deleted_global_professions)');
            }
            catch (_) { }
            if (!showAll) {
                conditions.push('p.active = 1');
                // Apenas profissões canônicas e abordagens visíveis (exclui especialidades médicas no nível base e cargos administrativos)
                conditions.push('(p.is_canonical = 1 OR p.is_canonical IS NULL OR p.id IN (\'prof-psicanalista\', \'prof-psicoterapeuta\'))');
                conditions.push("(p.category_id != 'cat-admin' OR p.category_id IS NULL)");
            }
            if (categoryId) {
                conditions.push('p.category_id = ?');
                params.push(categoryId);
            }
            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }
            query += ' ORDER BY p.name ASC';
            const stmt = database_1.db.prepare(query);
            const rows = stmt.all(...params);
            const professions = rows.map((p) => {
                const resolution = (0, profession_module_1.resolveCanonicalProfession)({
                    id: p.id,
                    name: p.name,
                    slug: p.slug,
                    registrationType: p.registration_board_label
                });
                const primaryModule = resolution.commercialModule;
                const modules = primaryModule ? [primaryModule, 'Zemda360'] : ['Recursos gerais do Zemda', 'Zemda360'];
                const accessLabel = modules.join(' + ');
                const regOption = registration_professions_1.REGISTRATION_PROFESSIONS.find(opt => opt.id === p.id);
                const label = regOption?.label || p.name;
                const displayOption = `${label} — ${accessLabel}`;
                const isAdministrative = resolution.taxonomyCategory === 'ADMINISTRATIVE' || p.category_is_clinical === 0 || p.category_id === 'cat-admin';
                return {
                    ...p,
                    label,
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
        }
        catch (err) {
            console.error('[TaxonomyController.listProfessions] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar profissões' });
        }
    }
    static createProfession(req, res) {
        try {
            const { categoryId, name, slug, registrationBoardLabel, registrationRequired, customFieldsSchema } = req.body;
            if (!name || !name.trim()) {
                res.status(400).json({ error: 'Nome da profissão é obrigatório' });
                return;
            }
            // Se categoria não foi informada, vincula a uma categoria padrão
            let catId = categoryId;
            if (!catId) {
                const defaultCat = database_1.db.prepare("SELECT id FROM categories WHERE slug = 'outros' OR slug = 'saude-mental' LIMIT 1").get();
                catId = defaultCat ? defaultCat.id : 'cat-outros';
            }
            const id = 'prof-' + (0, uuid_1.v4)().slice(0, 8);
            const generatedSlug = slug || name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
            const insertStmt = database_1.db.prepare(`
        INSERT INTO professions (id, tenant_id, category_id, name, slug, registration_board_label, registration_required, custom_fields_schema, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
            insertStmt.run(id, null, catId, name.trim(), generatedSlug, registrationBoardLabel ? registrationBoardLabel.trim().toUpperCase() : null, registrationRequired ? 1 : 0, customFieldsSchema ? JSON.stringify(customFieldsSchema) : null);
            res.status(201).json({ id, categoryId: catId, name: name.trim(), slug: generatedSlug, message: 'Profissão cadastrada com sucesso' });
        }
        catch (err) {
            console.error('[TaxonomyController.createProfession] Erro:', err);
            res.status(500).json({ error: 'Erro ao criar profissão' });
        }
    }
    static updateProfession(req, res) {
        try {
            const { id } = req.params;
            const { name, categoryId, registrationBoardLabel, registrationRequired } = req.body;
            if (!name || !name.trim()) {
                res.status(400).json({ error: 'Nome da profissão é obrigatório' });
                return;
            }
            const existing = database_1.db.prepare('SELECT id FROM professions WHERE id = ?').get(id);
            if (!existing) {
                res.status(404).json({ error: 'Profissão não encontrada' });
                return;
            }
            database_1.db.prepare(`
        UPDATE professions SET
          name = ?,
          category_id = COALESCE(?, category_id),
          registration_board_label = ?,
          registration_required = ?
        WHERE id = ?
      `).run(name.trim(), categoryId || null, registrationBoardLabel ? registrationBoardLabel.trim().toUpperCase() : null, registrationRequired ? 1 : 0, id);
            res.json({ message: 'Profissão atualizada com sucesso' });
        }
        catch (err) {
            console.error('[TaxonomyController.updateProfession] Erro:', err);
            res.status(500).json({ error: 'Erro ao atualizar profissão' });
        }
    }
    static toggleProfessionStatus(req, res) {
        try {
            const { id } = req.params;
            const profession = database_1.db.prepare('SELECT id, name, active FROM professions WHERE id = ?').get(id);
            if (!profession) {
                res.status(404).json({ error: 'Profissão não encontrada' });
                return;
            }
            const newStatus = profession.active === 1 ? 0 : 1;
            database_1.db.prepare('UPDATE professions SET active = ? WHERE id = ?').run(newStatus, id);
            res.json({
                message: `Profissão "${profession.name}" foi ${newStatus === 1 ? 'ativada' : 'desativada'} com sucesso`,
                active: newStatus
            });
        }
        catch (err) {
            console.error('[TaxonomyController.toggleProfessionStatus] Erro:', err);
            res.status(500).json({ error: 'Erro ao alterar status da profissão' });
        }
    }
    // Especialidades
    static listSpecialties(req, res) {
        try {
            const { professionId, all } = req.query;
            const showAll = all === 'true';
            let query = `
        SELECT s.id, s.profession_id, p.name as profession_name, s.name, s.slug, s.description, s.color, s.active
        FROM specialties s
        LEFT JOIN professions p ON p.id = s.profession_id
      `;
            const conditions = [];
            const params = [];
            if (!showAll) {
                conditions.push('s.active = 1');
            }
            if (professionId) {
                const profStr = String(professionId);
                const canonicalId = registration_professions_1.REGISTRATION_PROFESSION_ALIASES[profStr] || profStr;
                conditions.push('(s.profession_id = ? OR s.profession_id = ?)');
                params.push(profStr, canonicalId);
            }
            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }
            query += ' ORDER BY s.name ASC';
            const stmt = database_1.db.prepare(query);
            const specialties = stmt.all(...params);
            res.json(specialties);
        }
        catch (err) {
            console.error('[TaxonomyController.listSpecialties] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar especialidades' });
        }
    }
    // Áreas de Atuação
    static listPracticeAreas(req, res) {
        try {
            const { professionId, all } = req.query;
            const showAll = all === 'true';
            let query = `
        SELECT pa.id, pa.profession_id, p.name as profession_name, pa.name, pa.slug, pa.description, pa.active
        FROM practice_areas pa
        LEFT JOIN professions p ON p.id = pa.profession_id
      `;
            const conditions = [];
            const params = [];
            if (!showAll) {
                conditions.push('pa.active = 1');
            }
            if (professionId) {
                const profStr = String(professionId);
                const canonicalId = registration_professions_1.REGISTRATION_PROFESSION_ALIASES[profStr] || profStr;
                conditions.push('(pa.profession_id = ? OR pa.profession_id = ?)');
                params.push(profStr, canonicalId);
            }
            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }
            query += ' ORDER BY pa.name ASC';
            const stmt = database_1.db.prepare(query);
            const practiceAreas = stmt.all(...params);
            res.json(practiceAreas);
        }
        catch (err) {
            console.error('[TaxonomyController.listPracticeAreas] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar áreas de atuação' });
        }
    }
    static createSpecialty(req, res) {
        try {
            const { professionId, name, slug, description, color } = req.body;
            if (!name) {
                res.status(400).json({ error: 'Nome da especialidade é obrigatório' });
                return;
            }
            const id = 'spec-' + (0, uuid_1.v4)().slice(0, 8);
            const generatedSlug = slug || name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
            const insertStmt = database_1.db.prepare(`
        INSERT INTO specialties (id, tenant_id, profession_id, name, slug, description, color, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);
            insertStmt.run(id, req.tenantId || null, professionId || null, name, generatedSlug, description || null, color || '#4f46e5');
            res.status(201).json({ id, professionId, name, slug: generatedSlug });
        }
        catch (err) {
            console.error('[TaxonomyController.createSpecialty] Erro:', err);
            res.status(500).json({ error: 'Erro ao criar especialidade' });
        }
    }
    // Consulta de Impacto antes da Exclusão de Profissão Global (Exclusivo SuperAdmin)
    static getProfessionImpact(req, res) {
        try {
            const id = String(req.params.id);
            const prof = database_1.db.prepare('SELECT id, name, slug FROM professions WHERE id = ?').get(id);
            if (!prof) {
                res.status(404).json({ error: 'Profissão não encontrada' });
                return;
            }
            // Aliases que apontam para esta profissão
            const aliases = Object.entries(registration_professions_1.REGISTRATION_PROFESSION_ALIASES)
                .filter(([_, target]) => target === id || target === prof.slug)
                .map(([alias]) => alias);
            // Áreas de atuação vinculadas
            const practiceAreas = database_1.db.prepare('SELECT id, name, slug FROM practice_areas WHERE profession_id = ?').all(id);
            // Usuários atualmente vinculados
            const affectedUsersCount = database_1.db.prepare('SELECT COUNT(*) as c FROM users WHERE profession_id = ?').get(id)?.c || 0;
            const affectedProfessionalsCount = database_1.db.prepare('SELECT COUNT(*) as c FROM professionals WHERE profession_id = ?').get(id)?.c || 0;
            // Capabilities mapeadas
            const capabilitiesCount = database_1.db.prepare('SELECT COUNT(*) as c FROM profession_capabilities WHERE profession_id = ?').get(id)?.c || 0;
            // Especialidades vinculadas
            const specialtiesCount = database_1.db.prepare('SELECT COUNT(*) as c FROM specialties WHERE profession_id = ?').get(id)?.c || 0;
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
        }
        catch (err) {
            console.error('[TaxonomyController.getProfessionImpact] Erro:', err);
            res.status(500).json({ error: 'Erro ao calcular impacto da profissão' });
        }
    }
    // Exclusão Definitiva de Profissão Global (Exclusivo SuperAdmin com validação de senha)
    static async deleteProfession(req, res) {
        try {
            const id = String(req.params.id);
            const { password, confirmation, reason } = req.body;
            const currentUserId = req.user?.userId;
            if (!currentUserId) {
                res.status(401).json({ error: 'Usuário não autenticado.' });
                return;
            }
            // Valida credenciais do SuperAdmin no banco de dados
            const adminUser = database_1.db.prepare('SELECT id, email, password_hash, role FROM users WHERE id = ?').get(currentUserId);
            if (!adminUser || adminUser.role !== 'superadmin') {
                res.status(403).json({ error: 'Acesso negado. Apenas o Administrador do Sistema pode executar esta operação.' });
                return;
            }
            // Validação rigorosa da senha atual do administrador via bcrypt
            const isPasswordValid = await (0, password_1.comparePassword)(typeof password === 'string' ? password : '', adminUser.password_hash || '');
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
        }
        catch (err) {
            console.error('[TaxonomyController.deleteProfession] Erro:', err);
            res.status(500).json({ error: err?.message || 'Erro ao excluir profissão' });
        }
    }
}
exports.TaxonomyController = TaxonomyController;
/**
 * Rotina Centralizada de Purge de Profissão Global
 */
function purgeGlobalProfession(professionId, adminUserId, reason) {
    const prof = database_1.db.prepare('SELECT id, name, slug FROM professions WHERE id = ?').get(professionId);
    if (!prof)
        throw new Error('Profissão não encontrada.');
    database_1.db.transaction(() => {
        // 1. Desvincular e neutralizar usuários e profissionais (NUNCA deletar contas de usuários!)
        database_1.db.prepare(`
      UPDATE users
      SET profession_id = NULL,
          profession_name = 'Profissão precisa ser atualizada'
      WHERE profession_id = ?
    `).run(professionId);
        database_1.db.prepare(`
      UPDATE professionals
      SET profession_id = NULL
      WHERE profession_id = ?
    `).run(professionId);
        database_1.db.prepare(`
      UPDATE tenants
      SET manager_profession = 'Profissão precisa ser atualizada'
      WHERE manager_profession = ? OR manager_profession = ?
    `).run(professionId, prof.name);
        // 2. Remover capabilities e especialidades da profissão
        database_1.db.prepare('DELETE FROM profession_capabilities WHERE profession_id = ?').run(professionId);
        database_1.db.prepare('DELETE FROM specialties WHERE profession_id = ?').run(professionId);
        // 3. Remover áreas de atuação exclusivas desta profissão
        const areas = database_1.db.prepare('SELECT id FROM practice_areas WHERE profession_id = ?').all(professionId);
        for (const area of areas) {
            database_1.db.prepare('DELETE FROM practice_area_capabilities WHERE practice_area_id = ?').run(area.id);
            database_1.db.prepare('DELETE FROM user_practice_areas WHERE practice_area_id = ?').run(area.id);
        }
        database_1.db.prepare('DELETE FROM practice_areas WHERE profession_id = ?').run(professionId);
        // 4. Remover da tabela professions
        database_1.db.prepare('DELETE FROM professions WHERE id = ?').run(professionId);
        // 5. Inserir em deleted_global_professions para impedir que seeds ou restarts a recriem
        database_1.db.prepare(`
      INSERT OR REPLACE INTO deleted_global_professions (id, slug, name, deleted_at, deleted_by)
      VALUES (?, ?, ?, datetime('now'), ?)
    `).run(prof.id, prof.slug, prof.name, adminUserId);
        // 6. Log de auditoria da remoção da profissão
        try {
            database_1.db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity, entity_id, old_values, new_values, created_at)
        VALUES (?, ?, 'DELETE_GLOBAL_PROFESSION', 'professions', ?, ?, ?, datetime('now'))
      `).run((0, uuid_1.v4)(), adminUserId, prof.id, JSON.stringify({ name: prof.name, slug: prof.slug, reason: reason || 'Exclusão administrativa definitiva' }), null);
        }
        catch (_) { }
    })();
}
