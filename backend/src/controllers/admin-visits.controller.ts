import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class AdminVisitsController {
  /**
   * 1. Lista estabelecimentos com paginação, busca e filtros
   */
  static listEstablishments(req: Request, res: Response): void {
    try {
      const {
        search,
        status,
        specialty,
        city,
        state,
        startDate,
        endDate,
        archived,
        page = '1',
        limit = '20',
        sortBy = 'recent'
      } = req.query;

      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      let whereClause = 'WHERE 1=1';
      const params: any[] = [];

      // Filtro de arquivado (padrão: 0)
      if (archived === 'true' || archived === '1') {
        whereClause += ' AND e.archived = 1';
      } else {
        whereClause += ' AND e.archived = 0';
      }

      if (status && String(status).trim()) {
        whereClause += ' AND e.current_status = ?';
        params.push(String(status).trim());
      }

      if (city && String(city).trim()) {
        whereClause += ' AND LOWER(e.city) = LOWER(?)';
        params.push(String(city).trim());
      }

      if (state && String(state).trim()) {
        whereClause += ' AND UPPER(e.state) = UPPER(?)';
        params.push(String(state).trim());
      }

      if (specialty && String(specialty).trim()) {
        whereClause += ' AND e.areas_of_activity_json LIKE ?';
        params.push(`%${String(specialty).trim()}%`);
      }

      if (startDate && String(startDate).trim()) {
        whereClause += ' AND (e.last_visit_date >= ? OR (e.last_visit_date IS NULL AND e.created_at >= ?))';
        params.push(String(startDate).trim(), String(startDate).trim());
      }

      if (endDate && String(endDate).trim()) {
        whereClause += ' AND (e.last_visit_date <= ? OR (e.last_visit_date IS NULL AND e.created_at <= ?))';
        params.push(String(endDate).trim(), String(endDate).trim() + ' 23:59:59');
      }

      if (search && String(search).trim()) {
        const term = `%${String(search).trim().toLowerCase()}%`;
        whereClause += ` AND (
          LOWER(e.name) LIKE ? OR
          LOWER(COALESCE(e.trade_name, '')) LIKE ? OR
          LOWER(COALESCE(e.corporate_name, '')) LIKE ? OR
          LOWER(COALESCE(e.primary_contact_name, '')) LIKE ? OR
          COALESCE(e.primary_contact_phone, '') LIKE ? OR
          COALESCE(e.primary_contact_whatsapp, '') LIKE ? OR
          COALESCE(e.cnpj, '') LIKE ? OR
          LOWER(COALESCE(e.city, '')) LIKE ?
        )`;
        params.push(term, term, term, term, term, term, term, term);
      }

      // Ordenação
      let orderClause = 'ORDER BY CASE WHEN e.next_return_date IS NOT NULL THEN 0 ELSE 1 END, e.next_return_date ASC, e.updated_at DESC';
      if (sortBy === 'name') {
        orderClause = 'ORDER BY e.name ASC';
      } else if (sortBy === 'created') {
        orderClause = 'ORDER BY e.created_at DESC';
      } else if (sortBy === 'last_visit') {
        orderClause = 'ORDER BY e.last_visit_date DESC, e.created_at DESC';
      }

      const totalCountRow = db.prepare(`
        SELECT COUNT(*) as count
        FROM superadmin_visit_establishments e
        ${whereClause}
      `).get(...params) as any;

      const total = totalCountRow?.count || 0;

      const sql = `
        SELECT
          e.*,
          (SELECT COUNT(*) FROM superadmin_visits v WHERE v.establishment_id = e.id) as visit_count,
          (SELECT COUNT(*) FROM superadmin_visit_tasks t WHERE t.establishment_id = e.id AND t.status = 'pending') as pending_tasks_count,
          t.name as linked_tenant_name,
          t.slug as linked_tenant_slug,
          t.status as linked_tenant_status
        FROM superadmin_visit_establishments e
        LEFT JOIN tenants t ON t.id = e.tenant_id
        ${whereClause}
        ${orderClause}
        LIMIT ? OFFSET ?
      `;

      const rows = db.prepare(sql).all(...params, limitNum, offset) as any[];

      const items = rows.map(r => ({
        ...r,
        areas_of_activity: JSON.parse(r.areas_of_activity_json || '[]')
      }));

      res.json({
        items,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      });
    } catch (err: any) {
      console.error('[AdminVisitsController.listEstablishments] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar estabelecimentos' });
    }
  }

  /**
   * 2. Detalhes completos do estabelecimento com timeline e tarefas
   */
  static getEstablishmentDetails(req: Request, res: Response): void {
    try {
      const { id } = req.params;

      const est = db.prepare(`
        SELECT
          e.*,
          t.name as linked_tenant_name,
          t.slug as linked_tenant_slug,
          t.status as linked_tenant_status,
          t.email as linked_tenant_email
        FROM superadmin_visit_establishments e
        LEFT JOIN tenants t ON t.id = e.tenant_id
        WHERE e.id = ?
      `).get(id) as any;

      if (!est) {
        res.status(404).json({ error: 'Estabelecimento não encontrado' });
        return;
      }

      est.areas_of_activity = JSON.parse(est.areas_of_activity_json || '[]');

      const visits = db.prepare(`
        SELECT *
        FROM superadmin_visits
        WHERE establishment_id = ?
        ORDER BY visit_date DESC, visit_time DESC, created_at DESC
      `).all(id) as any[];

      const formattedVisits = visits.map(v => ({
        ...v,
        features_presented: JSON.parse(v.features_presented_json || '[]')
      }));

      const tasks = db.prepare(`
        SELECT *
        FROM superadmin_visit_tasks
        WHERE establishment_id = ?
        ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, due_date ASC
      `).all(id) as any[];

      res.json({
        establishment: est,
        visits: formattedVisits,
        tasks
      });
    } catch (err: any) {
      console.error('[AdminVisitsController.getEstablishmentDetails] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar detalhes do estabelecimento' });
    }
  }

  /**
   * 3. Criação de estabelecimento (+ visita inicial opcional)
   */
  static createEstablishment(req: Request, res: Response): void {
    try {
      const {
        name,
        tradeName,
        corporateName,
        cnpj,
        areasOfActivity,
        establishmentType,
        city,
        state,
        address,
        website,
        instagram,
        estimatedProfessionals,
        primaryContactName,
        primaryContactRole,
        primaryContactPhone,
        primaryContactWhatsapp,
        primaryContactEmail,
        bestContactTime,
        preferredChannel,
        currentStatus = 'first_contact',
        tenantId,
        initialVisit
      } = req.body;

      if (!name || !String(name).trim()) {
        res.status(400).json({ error: 'O nome da clínica ou estabelecimento é obrigatório' });
        return;
      }

      const id = 'est-' + uuidv4().slice(0, 8);
      const cleanCnpj = cnpj ? String(cnpj).replace(/\D/g, '') : null;
      const areasJson = JSON.stringify(Array.isArray(areasOfActivity) ? areasOfActivity : []);
      const createdBy = req.user?.name || 'SuperAdmin';

      let lastVisitDate: string | null = null;
      let nextAction: string | null = null;
      let nextReturnDate: string | null = null;
      let finalStatus = currentStatus;

      if (initialVisit && initialVisit.visitDate) {
        lastVisitDate = String(initialVisit.visitDate).trim();
        nextAction = initialVisit.nextAction ? String(initialVisit.nextAction).trim() : null;
        nextReturnDate = initialVisit.nextReturnDate ? String(initialVisit.nextReturnDate).trim() : null;
        if (initialVisit.statusAfterVisit) {
          finalStatus = String(initialVisit.statusAfterVisit).trim();
        }
      }

      db.transaction(() => {
        db.prepare(`
          INSERT INTO superadmin_visit_establishments (
            id, tenant_id, name, trade_name, corporate_name, cnpj,
            areas_of_activity_json, establishment_type, city, state, address,
            website, instagram, estimated_professionals,
            primary_contact_name, primary_contact_role, primary_contact_phone,
            primary_contact_whatsapp, primary_contact_email, best_contact_time,
            preferred_channel, current_status, last_visit_date, next_action,
            next_return_date, archived, created_by, created_at, updated_at
          )
          VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, 0, ?, datetime('now'), datetime('now')
          )
        `).run(
          id,
          tenantId || null,
          String(name).trim(),
          tradeName ? String(tradeName).trim() : null,
          corporateName ? String(corporateName).trim() : null,
          cleanCnpj,
          areasJson,
          establishmentType ? String(establishmentType).trim() : null,
          city ? String(city).trim() : null,
          state ? String(state).trim().toUpperCase() : null,
          address ? String(address).trim() : null,
          website ? String(website).trim() : null,
          instagram ? String(instagram).trim() : null,
          estimatedProfessionals ? Number(estimatedProfessionals) : null,
          primaryContactName ? String(primaryContactName).trim() : null,
          primaryContactRole ? String(primaryContactRole).trim() : null,
          primaryContactPhone ? String(primaryContactPhone).trim() : null,
          primaryContactWhatsapp ? String(primaryContactWhatsapp).trim() : null,
          primaryContactEmail ? String(primaryContactEmail).trim() : null,
          bestContactTime ? String(bestContactTime).trim() : null,
          preferredChannel ? String(preferredChannel).trim() : null,
          finalStatus,
          lastVisitDate,
          nextAction,
          nextReturnDate,
          createdBy
        );

        // Se houver visita inicial, insere registro
        if (initialVisit && initialVisit.visitDate) {
          const visitId = 'vis-' + uuidv4().slice(0, 8);
          const featuresJson = JSON.stringify(Array.isArray(initialVisit.featuresPresented) ? initialVisit.featuresPresented : []);

          db.prepare(`
            INSERT INTO superadmin_visits (
              id, establishment_id, visit_date, visit_time, modality,
              responsible_name, objective, features_presented_json,
              needs_identified, main_doubts, commercial_objections,
              notes, result, status_after_visit, next_action, next_return_date,
              created_by, created_at, updated_at
            )
            VALUES (
              ?, ?, ?, ?, ?,
              ?, ?, ?,
              ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, datetime('now'), datetime('now')
            )
          `).run(
            visitId,
            id,
            String(initialVisit.visitDate).trim(),
            initialVisit.visitTime ? String(initialVisit.visitTime).trim() : null,
            initialVisit.modality || 'presential',
            initialVisit.responsibleName ? String(initialVisit.responsibleName).trim() : createdBy,
            initialVisit.objective || null,
            featuresJson,
            initialVisit.needsIdentified || null,
            initialVisit.mainDoubts || null,
            initialVisit.commercialObjections || null,
            initialVisit.notes || null,
            initialVisit.result || null,
            finalStatus,
            nextAction,
            nextReturnDate,
            createdBy
          );

          // Se definiu próximo retorno e ação, cria tarefa correspondente
          if (nextReturnDate && nextAction) {
            db.prepare(`
              INSERT INTO superadmin_visit_tasks (
                id, establishment_id, visit_id, task_type, description,
                due_date, status, assigned_to, created_by, created_at, updated_at
              )
              VALUES (?, ?, ?, 'contact', ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))
            `).run(
              'tsk-' + uuidv4().slice(0, 8),
              id,
              visitId,
              nextAction,
              nextReturnDate,
              createdBy,
              createdBy
            );
          }
        }
      })();

      logAudit(req, 'CREATE_CRM_ESTABLISHMENT', 'superadmin_visit_establishments', id, { name, city, state, finalStatus });

      const created = db.prepare('SELECT * FROM superadmin_visit_establishments WHERE id = ?').get(id) as any;
      if (created) {
        created.areas_of_activity = JSON.parse(created.areas_of_activity_json || '[]');
      }

      res.status(201).json({
        message: 'Estabelecimento cadastrado com sucesso',
        establishment: created
      });
    } catch (err: any) {
      console.error('[AdminVisitsController.createEstablishment] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar estabelecimento' });
    }
  }

  /**
   * 4. Atualização de dados cadastrais do estabelecimento
   */
  static updateEstablishment(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const {
        name,
        tradeName,
        corporateName,
        cnpj,
        areasOfActivity,
        establishmentType,
        city,
        state,
        address,
        website,
        instagram,
        estimatedProfessionals,
        primaryContactName,
        primaryContactRole,
        primaryContactPhone,
        primaryContactWhatsapp,
        primaryContactEmail,
        bestContactTime,
        preferredChannel,
        currentStatus,
        tenantId,
        nextAction,
        nextReturnDate
      } = req.body;

      const existing = db.prepare('SELECT * FROM superadmin_visit_establishments WHERE id = ?').get(id);
      if (!existing) {
        res.status(404).json({ error: 'Estabelecimento não encontrado' });
        return;
      }

      const cleanCnpj = cnpj ? String(cnpj).replace(/\D/g, '') : null;
      const areasJson = areasOfActivity !== undefined ? JSON.stringify(Array.isArray(areasOfActivity) ? areasOfActivity : []) : undefined;

      db.prepare(`
        UPDATE superadmin_visit_establishments
        SET
          name = COALESCE(?, name),
          trade_name = ?,
          corporate_name = ?,
          cnpj = ?,
          areas_of_activity_json = COALESCE(?, areas_of_activity_json),
          establishment_type = ?,
          city = ?,
          state = ?,
          address = ?,
          website = ?,
          instagram = ?,
          estimated_professionals = ?,
          primary_contact_name = ?,
          primary_contact_role = ?,
          primary_contact_phone = ?,
          primary_contact_whatsapp = ?,
          primary_contact_email = ?,
          best_contact_time = ?,
          preferred_channel = ?,
          current_status = COALESCE(?, current_status),
          tenant_id = COALESCE(?, tenant_id),
          next_action = COALESCE(?, next_action),
          next_return_date = COALESCE(?, next_return_date),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        name ? String(name).trim() : null,
        tradeName !== undefined ? (tradeName ? String(tradeName).trim() : null) : null,
        corporateName !== undefined ? (corporateName ? String(corporateName).trim() : null) : null,
        cleanCnpj,
        areasJson,
        establishmentType !== undefined ? (establishmentType ? String(establishmentType).trim() : null) : null,
        city !== undefined ? (city ? String(city).trim() : null) : null,
        state !== undefined ? (state ? String(state).trim().toUpperCase() : null) : null,
        address !== undefined ? (address ? String(address).trim() : null) : null,
        website !== undefined ? (website ? String(website).trim() : null) : null,
        instagram !== undefined ? (instagram ? String(instagram).trim() : null) : null,
        estimatedProfessionals !== undefined ? (estimatedProfessionals ? Number(estimatedProfessionals) : null) : null,
        primaryContactName !== undefined ? (primaryContactName ? String(primaryContactName).trim() : null) : null,
        primaryContactRole !== undefined ? (primaryContactRole ? String(primaryContactRole).trim() : null) : null,
        primaryContactPhone !== undefined ? (primaryContactPhone ? String(primaryContactPhone).trim() : null) : null,
        primaryContactWhatsapp !== undefined ? (primaryContactWhatsapp ? String(primaryContactWhatsapp).trim() : null) : null,
        primaryContactEmail !== undefined ? (primaryContactEmail ? String(primaryContactEmail).trim() : null) : null,
        bestContactTime !== undefined ? (bestContactTime ? String(bestContactTime).trim() : null) : null,
        preferredChannel !== undefined ? (preferredChannel ? String(preferredChannel).trim() : null) : null,
        currentStatus ? String(currentStatus).trim() : null,
        tenantId !== undefined ? tenantId : null,
        nextAction !== undefined ? nextAction : null,
        nextReturnDate !== undefined ? nextReturnDate : null,
        id
      );

      logAudit(req, 'UPDATE_CRM_ESTABLISHMENT', 'superadmin_visit_establishments', id, { updatedFields: Object.keys(req.body) });

      const updated = db.prepare('SELECT * FROM superadmin_visit_establishments WHERE id = ?').get(id) as any;
      if (updated) {
        updated.areas_of_activity = JSON.parse(updated.areas_of_activity_json || '[]');
      }

      res.json({ message: 'Estabelecimento atualizado com sucesso', establishment: updated });
    } catch (err: any) {
      console.error('[AdminVisitsController.updateEstablishment] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar estabelecimento' });
    }
  }

  /**
   * 5. Adicionar nova visita/interação ao estabelecimento
   */
  static addVisit(req: Request, res: Response): void {
    try {
      const { id } = req.params; // establishment_id
      const {
        visitDate,
        visitTime,
        modality = 'presential',
        responsibleName,
        objective,
        featuresPresented,
        needsIdentified,
        mainDoubts,
        commercialObjections,
        notes,
        result,
        statusAfterVisit,
        nextAction,
        nextReturnDate
      } = req.body;

      if (!visitDate) {
        res.status(400).json({ error: 'A data da visita é obrigatória' });
        return;
      }

      const est = db.prepare('SELECT id, current_status FROM superadmin_visit_establishments WHERE id = ?').get(id) as any;
      if (!est) {
        res.status(404).json({ error: 'Estabelecimento não encontrado' });
        return;
      }

      const visitId = 'vis-' + uuidv4().slice(0, 8);
      const createdBy = req.user?.name || 'SuperAdmin';
      const featuresJson = JSON.stringify(Array.isArray(featuresPresented) ? featuresPresented : []);
      const finalStatus = statusAfterVisit ? String(statusAfterVisit).trim() : est.current_status;

      db.transaction(() => {
        db.prepare(`
          INSERT INTO superadmin_visits (
            id, establishment_id, visit_date, visit_time, modality,
            responsible_name, objective, features_presented_json,
            needs_identified, main_doubts, commercial_objections,
            notes, result, status_after_visit, next_action, next_return_date,
            created_by, created_at, updated_at
          )
          VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, datetime('now'), datetime('now')
          )
        `).run(
          visitId,
          id,
          String(visitDate).trim(),
          visitTime ? String(visitTime).trim() : null,
          modality,
          responsibleName ? String(responsibleName).trim() : createdBy,
          objective || null,
          featuresJson,
          needsIdentified || null,
          mainDoubts || null,
          commercialObjections || null,
          notes || null,
          result || null,
          finalStatus,
          nextAction ? String(nextAction).trim() : null,
          nextReturnDate ? String(nextReturnDate).trim() : null,
          createdBy
        );

        // Atualiza cabeçalho do estabelecimento
        db.prepare(`
          UPDATE superadmin_visit_establishments
          SET
            last_visit_date = ?,
            current_status = ?,
            next_action = ?,
            next_return_date = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(
          String(visitDate).trim(),
          finalStatus,
          nextAction ? String(nextAction).trim() : null,
          nextReturnDate ? String(nextReturnDate).trim() : null,
          id
        );

        // Se houver próximo retorno definido, cria tarefa automaticamente
        if (nextReturnDate && nextAction) {
          db.prepare(`
            INSERT INTO superadmin_visit_tasks (
              id, establishment_id, visit_id, task_type, description,
              due_date, status, assigned_to, created_by, created_at, updated_at
            )
            VALUES (?, ?, ?, 'contact', ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))
          `).run(
            'tsk-' + uuidv4().slice(0, 8),
            id,
            visitId,
            String(nextAction).trim(),
            String(nextReturnDate).trim(),
            responsibleName || createdBy,
            createdBy
          );
        }
      })();

      logAudit(req, 'CREATE_CRM_VISIT', 'superadmin_visits', visitId, { establishmentId: id, visitDate, finalStatus });

      const createdVisit = db.prepare('SELECT * FROM superadmin_visits WHERE id = ?').get(visitId) as any;
      if (createdVisit) {
        createdVisit.features_presented = JSON.parse(createdVisit.features_presented_json || '[]');
      }

      res.status(201).json({
        message: 'Visita registrada com sucesso',
        visit: createdVisit
      });
    } catch (err: any) {
      console.error('[AdminVisitsController.addVisit] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar visita' });
    }
  }

  /**
   * 6. Atualização rápida de status comercial
   */
  static updateStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        res.status(400).json({ error: 'Status é obrigatório' });
        return;
      }

      db.prepare(`
        UPDATE superadmin_visit_establishments
        SET current_status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(String(status).trim(), id);

      logAudit(req, 'UPDATE_CRM_STATUS', 'superadmin_visit_establishments', id, { status });

      res.json({ success: true, message: 'Status atualizado com sucesso' });
    } catch (err: any) {
      console.error('[AdminVisitsController.updateStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar status' });
    }
  }

  /**
   * 7. Vínculo seguro com clínica (tenant) existente no Zemda
   */
  static linkTenant(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const { tenantId } = req.body;

      if (tenantId) {
        const tenant = db.prepare('SELECT id, name FROM tenants WHERE id = ?').get(tenantId);
        if (!tenant) {
          res.status(404).json({ error: 'Clínica não encontrada no Zemda' });
          return;
        }
      }

      db.prepare(`
        UPDATE superadmin_visit_establishments
        SET tenant_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(tenantId || null, id);

      logAudit(req, 'LINK_CRM_ESTABLISHMENT_TENANT', 'superadmin_visit_establishments', id, { tenantId });

      res.json({ success: true, message: tenantId ? 'Vínculo com a clínica estabelecido com sucesso' : 'Vínculo removido com sucesso' });
    } catch (err: any) {
      console.error('[AdminVisitsController.linkTenant] Erro:', err);
      res.status(500).json({ error: 'Erro ao vincular clínica' });
    }
  }

  /**
   * 8. Busca de clínicas cadastradas no Zemda para vinculação
   */
  static searchTenantsForLink(req: Request, res: Response): void {
    try {
      const { q } = req.query;
      if (!q || String(q).trim().length < 2) {
        res.json([]);
        return;
      }

      const pattern = `%${String(q).trim().toLowerCase()}%`;
      const cleanDigits = String(q).replace(/\D/g, '');
      const cnpjPattern = cleanDigits ? `%${cleanDigits}%` : null;

      let sql = `
        SELECT id, name, corporate_name, trade_name, cnpj_cpf, email, city, state, status, created_at
        FROM tenants
        WHERE LOWER(name) LIKE ? OR LOWER(COALESCE(trade_name, '')) LIKE ? OR LOWER(COALESCE(corporate_name, '')) LIKE ? OR LOWER(email) LIKE ?
      `;
      const params = [pattern, pattern, pattern, pattern];

      if (cnpjPattern) {
        sql += ' OR cnpj_cpf LIKE ?';
        params.push(cnpjPattern);
      }

      sql += ' ORDER BY name ASC LIMIT 10';

      const results = db.prepare(sql).all(...params);
      res.json(results);
    } catch (err: any) {
      console.error('[AdminVisitsController.searchTenantsForLink] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar clínicas' });
    }
  }

  /**
   * 9. Indicadores e Dashboard Executivo do CRM
   */
  static getMetrics(req: Request, res: Response): void {
    try {
      const today = new Date().toISOString().split('T')[0];
      const startOfMonth = today.slice(0, 7) + '-01';

      // Totais por status
      const statusCounts = db.prepare(`
        SELECT current_status, COUNT(*) as count
        FROM superadmin_visit_establishments
        WHERE archived = 0
        GROUP BY current_status
      `).all() as { current_status: string; count: number }[];

      const statusMap: Record<string, number> = {};
      let totalEstablishments = 0;
      for (const s of statusCounts) {
        statusMap[s.current_status] = s.count;
        totalEstablishments += s.count;
      }

      // Visitas realizadas no mês atual
      const monthVisitsRow = db.prepare(`
        SELECT COUNT(*) as count
        FROM superadmin_visits
        WHERE visit_date >= ?
      `).get(startOfMonth) as any;
      const monthVisits = monthVisitsRow?.count || 0;

      // Retornos pendentes (data de retorno >= hoje)
      const pendingReturnsRow = db.prepare(`
        SELECT COUNT(*) as count
        FROM superadmin_visit_establishments
        WHERE archived = 0 AND next_return_date >= ? AND current_status NOT IN ('converted', 'not_interested', 'closed')
      `).get(today) as any;
      const pendingReturns = pendingReturnsRow?.count || 0;

      // Retornos atrasados (data de retorno < hoje)
      const overdueReturnsRow = db.prepare(`
        SELECT COUNT(*) as count
        FROM superadmin_visit_establishments
        WHERE archived = 0 AND next_return_date < ? AND current_status NOT IN ('converted', 'not_interested', 'closed')
      `).get(today) as any;
      const overdueReturns = overdueReturnsRow?.count || 0;

      // Evolução de visitas dos últimos 6 meses
      const monthlyEvolution = db.prepare(`
        SELECT substr(visit_date, 1, 7) as month, COUNT(*) as visits_count
        FROM superadmin_visits
        WHERE visit_date >= date('now', '-6 months')
        GROUP BY substr(visit_date, 1, 7)
        ORDER BY month ASC
      `).all();

      res.json({
        totalEstablishments,
        monthVisits,
        interested: statusMap['interested'] || 0,
        inNegotiation: statusMap['in_negotiation'] || 0,
        freeTrial: statusMap['free_trial'] || 0,
        converted: statusMap['converted'] || 0,
        pendingReturns,
        overdueReturns,
        statusDistribution: statusMap,
        monthlyEvolution
      });
    } catch (err: any) {
      console.error('[AdminVisitsController.getMetrics] Erro:', err);
      res.status(500).json({ error: 'Erro ao calcular métricas' });
    }
  }

  /**
   * 10. Acompanhamentos e Lembretes (Tarefas)
   */
  static listTasks(req: Request, res: Response): void {
    try {
      const { filter = 'all' } = req.query;
      const today = new Date().toISOString().split('T')[0];

      let sql = `
        SELECT
          t.*,
          e.name as establishment_name,
          e.city as establishment_city,
          e.state as establishment_state,
          e.primary_contact_name,
          e.primary_contact_phone,
          e.primary_contact_whatsapp,
          e.current_status as establishment_status
        FROM superadmin_visit_tasks t
        JOIN superadmin_visit_establishments e ON e.id = t.establishment_id
        WHERE e.archived = 0
      `;
      const params: any[] = [];

      if (filter === 'today') {
        sql += ' AND t.due_date = ? AND t.status = "pending"';
        params.push(today);
      } else if (filter === 'upcoming') {
        sql += ' AND t.due_date > ? AND t.status = "pending"';
        params.push(today);
      } else if (filter === 'overdue') {
        sql += ' AND t.due_date < ? AND t.status = "pending"';
        params.push(today);
      } else if (filter === 'completed') {
        sql += ' AND t.status = "completed"';
      } else if (filter === 'pending') {
        sql += ' AND t.status = "pending"';
      }

      sql += ' ORDER BY CASE WHEN t.status = "pending" THEN 0 ELSE 1 END, t.due_date ASC, t.created_at DESC LIMIT 100';

      const tasks = db.prepare(sql).all(...params);
      res.json(tasks);
    } catch (err: any) {
      console.error('[AdminVisitsController.listTasks] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar acompanhamentos' });
    }
  }

  /**
   * 11. Criar tarefa de acompanhamento
   */
  static createTask(req: Request, res: Response): void {
    try {
      const { establishmentId, taskType = 'contact', description, dueDate, assignedTo } = req.body;

      if (!establishmentId || !description || !dueDate) {
        res.status(400).json({ error: 'Estabelecimento, descrição e data prevista são obrigatórios' });
        return;
      }

      const id = 'tsk-' + uuidv4().slice(0, 8);
      const createdBy = req.user?.name || 'SuperAdmin';

      db.prepare(`
        INSERT INTO superadmin_visit_tasks (
          id, establishment_id, task_type, description, due_date, status, assigned_to, created_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))
      `).run(id, establishmentId, taskType, String(description).trim(), String(dueDate).trim(), assignedTo || createdBy, createdBy);

      // Também sincroniza next_return_date e next_action no estabelecimento se mais próximo
      db.prepare(`
        UPDATE superadmin_visit_establishments
        SET
          next_action = COALESCE(next_action, ?),
          next_return_date = CASE WHEN next_return_date IS NULL OR next_return_date > ? THEN ? ELSE next_return_date END,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(String(description).trim(), String(dueDate).trim(), String(dueDate).trim(), establishmentId);

      const created = db.prepare('SELECT * FROM superadmin_visit_tasks WHERE id = ?').get(id);
      res.status(201).json({ message: 'Acompanhamento registrado com sucesso', task: created });
    } catch (err: any) {
      console.error('[AdminVisitsController.createTask] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar tarefa' });
    }
  }

  /**
   * 12. Concluir ou reabrir tarefa
   */
  static toggleTask(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const bodyStatus = req.body?.status;

      let newStatus: string;
      if (bodyStatus) {
        newStatus = bodyStatus === 'completed' ? 'completed' : 'pending';
      } else {
        const currentTask = db.prepare('SELECT status FROM superadmin_visit_tasks WHERE id = ?').get(id) as any;
        newStatus = currentTask?.status === 'completed' ? 'pending' : 'completed';
      }

      const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;

      db.prepare(`
        UPDATE superadmin_visit_tasks
        SET status = ?, completed_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newStatus, completedAt, id);

      res.json({ success: true, status: newStatus });
    } catch (err: any) {
      console.error('[AdminVisitsController.toggleTask] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar status da tarefa' });
    }
  }

  /**
   * 13. Relatórios Comerciais
   */
  static getReports(req: Request, res: Response): void {
    try {
      const { startDate, endDate, status, specialty, city, state, responsible } = req.query;

      let whereClause = 'WHERE e.archived = 0';
      const params: any[] = [];

      if (status) {
        whereClause += ' AND e.current_status = ?';
        params.push(String(status).trim());
      }
      if (specialty) {
        whereClause += ' AND e.areas_of_activity_json LIKE ?';
        params.push(`%${String(specialty).trim()}%`);
      }
      if (city) {
        whereClause += ' AND LOWER(e.city) = LOWER(?)';
        params.push(String(city).trim());
      }
      if (state) {
        whereClause += ' AND UPPER(e.state) = UPPER(?)';
        params.push(String(state).trim());
      }
      if (startDate) {
        whereClause += ' AND (e.last_visit_date >= ? OR (e.last_visit_date IS NULL AND e.created_at >= ?))';
        params.push(String(startDate).trim(), String(startDate).trim());
      }
      if (endDate) {
        whereClause += ' AND (e.last_visit_date <= ? OR (e.last_visit_date IS NULL AND e.created_at <= ?))';
        params.push(String(endDate).trim(), String(endDate).trim() + ' 23:59:59');
      }

      const rows = db.prepare(`
        SELECT
          e.id, e.name, e.trade_name, e.city, e.state, e.areas_of_activity_json,
          e.current_status, e.last_visit_date, e.next_action, e.next_return_date,
          e.primary_contact_name, e.primary_contact_phone, e.primary_contact_whatsapp,
          e.created_at,
          (SELECT COUNT(*) FROM superadmin_visits v WHERE v.establishment_id = e.id) as total_visits
        FROM superadmin_visit_establishments e
        ${whereClause}
        ORDER BY e.last_visit_date DESC, e.name ASC
      `).all(...params) as any[];

      const statusMap: Record<string, number> = {};
      let totalVisitsCount = 0;
      let convertedCount = 0;
      let pendingReturnsCount = 0;
      const today = new Date().toISOString().split('T')[0];

      const formattedRows = rows.map(r => {
        statusMap[r.current_status] = (statusMap[r.current_status] || 0) + 1;
        totalVisitsCount += (r.total_visits || 0);
        if (r.current_status === 'converted') convertedCount++;
        if (r.next_return_date && r.next_return_date >= today) pendingReturnsCount++;

        return {
          ...r,
          areas_of_activity: JSON.parse(r.areas_of_activity_json || '[]')
        };
      });

      const conversionRate = rows.length > 0 ? Number(((convertedCount / rows.length) * 100).toFixed(1)) : 0;

      res.json({
        totalEstablishments: rows.length,
        totalVisits: totalVisitsCount,
        convertedCount,
        conversionRate,
        pendingReturnsCount,
        statusDistribution: statusMap,
        rows: formattedRows
      });
    } catch (err: any) {
      console.error('[AdminVisitsController.getReports] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
  }

  /**
   * 14. Exportação CSV com BOM UTF-8 (compatível com Excel)
   */
  static exportCsv(req: Request, res: Response): void {
    try {
      const { startDate, endDate, status, specialty, city, state } = req.query;

      let whereClause = 'WHERE e.archived = 0';
      const params: any[] = [];

      if (status) {
        whereClause += ' AND e.current_status = ?';
        params.push(String(status).trim());
      }
      if (specialty) {
        whereClause += ' AND e.areas_of_activity_json LIKE ?';
        params.push(`%${String(specialty).trim()}%`);
      }
      if (city) {
        whereClause += ' AND LOWER(e.city) = LOWER(?)';
        params.push(String(city).trim());
      }
      if (state) {
        whereClause += ' AND UPPER(e.state) = UPPER(?)';
        params.push(String(state).trim());
      }
      if (startDate) {
        whereClause += ' AND (e.last_visit_date >= ? OR (e.last_visit_date IS NULL AND e.created_at >= ?))';
        params.push(String(startDate).trim(), String(startDate).trim());
      }
      if (endDate) {
        whereClause += ' AND (e.last_visit_date <= ? OR (e.last_visit_date IS NULL AND e.created_at <= ?))';
        params.push(String(endDate).trim(), String(endDate).trim() + ' 23:59:59');
      }

      const rows = db.prepare(`
        SELECT
          e.name,
          COALESCE(e.trade_name, '') as trade_name,
          COALESCE(e.city, '') as city,
          COALESCE(e.state, '') as state,
          e.areas_of_activity_json,
          e.current_status,
          COALESCE(e.primary_contact_name, '') as contact_name,
          COALESCE(e.primary_contact_phone, e.primary_contact_whatsapp, '') as contact_phone,
          COALESCE(e.primary_contact_email, '') as contact_email,
          COALESCE(e.last_visit_date, '') as last_visit_date,
          COALESCE(e.next_action, '') as next_action,
          COALESCE(e.next_return_date, '') as next_return_date,
          (SELECT COUNT(*) FROM superadmin_visits v WHERE v.establishment_id = e.id) as total_visits
        FROM superadmin_visit_establishments e
        ${whereClause}
        ORDER BY e.last_visit_date DESC, e.name ASC
      `).all(...params) as any[];

      const statusLabels: Record<string, string> = {
        first_contact: 'Primeiro contato',
        visit_scheduled: 'Visita agendada',
        visit_completed: 'Visita realizada',
        interested: 'Interessado',
        demo_requested: 'Demonstração solicitada',
        in_negotiation: 'Em negociação',
        free_trial: 'Teste gratuito',
        converted: 'Cliente convertido',
        not_interested: 'Não interessado',
        closed: 'Contato encerrado'
      };

      const escapeCsv = (val: any) => {
        const str = String(val ?? '').replace(/"/g, '""');
        return `"${str}"`;
      };

      const headers = [
        'Clínica / Estabelecimento',
        'Nome Fantasia',
        'Cidade',
        'UF',
        'Áreas de Atuação',
        'Status Comercial',
        'Contato Responsável',
        'Telefone / WhatsApp',
        'E-mail',
        'Última Visita',
        'Total de Visitas',
        'Próxima Ação',
        'Próximo Retorno'
      ];

      const csvLines = [headers.join(';')];

      for (const r of rows) {
        let areas = '';
        try {
          areas = JSON.parse(r.areas_of_activity_json || '[]').join(', ');
        } catch (_) {}

        csvLines.push([
          escapeCsv(r.name),
          escapeCsv(r.trade_name),
          escapeCsv(r.city),
          escapeCsv(r.state),
          escapeCsv(areas),
          escapeCsv(statusLabels[r.current_status] || r.current_status),
          escapeCsv(r.contact_name),
          escapeCsv(r.contact_phone),
          escapeCsv(r.contact_email),
          escapeCsv(r.last_visit_date),
          escapeCsv(r.total_visits),
          escapeCsv(r.next_action),
          escapeCsv(r.next_return_date)
        ].join(';'));
      }

      const csvContent = '\uFEFF' + csvLines.join('\r\n');
      const filename = `relatorio-visitas-zemda-${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (err: any) {
      console.error('[AdminVisitsController.exportCsv] Erro:', err);
      res.status(500).json({ error: 'Erro ao exportar CSV' });
    }
  }

  /**
   * 15. Arquivar / Desativar estabelecimento (sem exclusão destrutiva)
   */
  static archiveEstablishment(req: Request, res: Response): void {
    try {
      const { id } = req.params;

      db.prepare(`
        UPDATE superadmin_visit_establishments
        SET archived = 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(id);

      logAudit(req, 'ARCHIVE_CRM_ESTABLISHMENT', 'superadmin_visit_establishments', id);

      res.json({ success: true, message: 'Estabelecimento arquivado com sucesso' });
    } catch (err: any) {
      console.error('[AdminVisitsController.archiveEstablishment] Erro:', err);
      res.status(500).json({ error: 'Erro ao arquivar estabelecimento' });
    }
  }
}
