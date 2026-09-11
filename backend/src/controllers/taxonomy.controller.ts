import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

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
        res.status(400).json({ error: 'Nome do tipo de serviço / categoria é obrigatório' });
        return;
      }

      const id = 'cat-' + uuidv4().slice(0, 8);
      const generatedSlug = slug || name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');

      const validTerms = ['patient', 'client', 'student', 'pet_owner'];
      let term = (defaultTerminology || 'client').toLowerCase();
      if (term === 'cliente') term = 'client';
      if (term === 'paciente') term = 'patient';
      if (term === 'aluno') term = 'student';
      if (!validTerms.includes(term)) term = 'client';

      const insertStmt = db.prepare(`
        INSERT INTO categories (id, tenant_id, name, slug, icon, description, default_terminology, is_clinical, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      insertStmt.run(
        id,
        null,
        name.trim(),
        generatedSlug,
        icon || 'Layers',
        description ? description.trim() : null,
        term,
        isClinical ? 1 : 0
      );

      res.status(201).json({ id, name: name.trim(), slug: generatedSlug, message: 'Tipo de serviço criado com sucesso' });
    } catch (err: any) {
      console.error('[TaxonomyController.createCategory] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar categoria' });
    }
  }

  static updateCategory(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const { name, description, defaultTerminology, isClinical } = req.body;

      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Nome do tipo de serviço / categoria é obrigatório' });
        return;
      }

      const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
      if (!existing) {
        res.status(404).json({ error: 'Tipo de serviço não encontrado' });
        return;
      }

      const validTerms = ['patient', 'client', 'student', 'pet_owner'];
      let term = (defaultTerminology || 'client').toLowerCase();
      if (term === 'cliente') term = 'client';
      if (term === 'paciente') term = 'patient';
      if (term === 'aluno') term = 'student';
      if (!validTerms.includes(term)) term = 'client';

      db.prepare(`
        UPDATE categories SET
          name = ?,
          description = ?,
          default_terminology = ?,
          is_clinical = ?
        WHERE id = ?
      `).run(
        name.trim(),
        description ? description.trim() : null,
        term,
        isClinical ? 1 : 0,
        id
      );

      res.json({ message: 'Tipo de serviço atualizado com sucesso' });
    } catch (err: any) {
      console.error('[TaxonomyController.updateCategory] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar tipo de serviço' });
    }
  }

  static toggleCategoryStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const category = db.prepare('SELECT id, name, active FROM categories WHERE id = ?').get(id) as any;

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
        SELECT p.id, p.category_id, c.name as category_name, p.name, p.slug, p.registration_board_label, p.registration_required, p.custom_fields_schema, p.active
        FROM professions p
        LEFT JOIN categories c ON c.id = p.category_id
      `;
      const conditions: string[] = [];
      const params: any[] = [];

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
      const professions = stmt.all(...params);
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
}
