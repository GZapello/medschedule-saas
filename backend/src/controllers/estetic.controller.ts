import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { CapabilityService } from '../services/capability.service';
import { ClinicalRecordService } from '../services/clinical-record.service';

/**
 * Validador Central de Acesso e Áreas do ZemdaEstetic
 */
export function getEsteticAccess(req: Request, targetArea?: string): { allowed: boolean; reason?: string; allowedAreas: string[]; isDentist: boolean } {
  if (!req.user || !req.tenantId) {
    return { allowed: false, reason: 'Não autenticado ou clínica não informada.', allowedAreas: [], isDentist: false };
  }

  // SuperAdmin tem acesso total irrestrito para auditoria e suporte
  if (req.user.role === 'superadmin') {
    return { allowed: true, allowedAreas: ['FACIAL', 'CORPORAL', 'CAPILAR', 'OUTRA'], isDentist: false };
  }

  // Clinic Admin tem acesso a todas as áreas contratadas pela clínica
  if (req.user.role === 'clinic_admin') {
    return { allowed: true, allowedAreas: ['FACIAL', 'CORPORAL', 'CAPILAR', 'OUTRA'], isDentist: false };
  }

  // Usuários de funções não-clínicas são bloqueados
  const roleStr = req.user.role as string;
  if (roleStr === 'receptionist' || roleStr === 'financial' || roleStr === 'secretary' || roleStr === 'assistant') {
    return { allowed: false, reason: 'Função sem permissão de acesso ao módulo clínico ZemdaEstetic.', allowedAreas: [], isDentist: false };
  }

  const computed = CapabilityService.computeUserCapabilities(req.user.userId, req.tenantId);
  const caps = computed.activeCapabilities;
  const userPracticeAreas = computed.practiceAreaIds;

  // Busca permissões explícitas da clínica
  const cuRow = db.prepare(`
    SELECT permissions_json, zemda_estetic_enabled, zemda_odonto_enabled
    FROM clinic_users
    WHERE user_id = ? AND tenant_id = ?
  `).get(req.user.userId, req.tenantId) as any;

  let permissions: string[] = [];
  if (cuRow?.permissions_json) {
    try { permissions = JSON.parse(cuRow.permissions_json); } catch {}
  }

  const hasExplicitAccess =
    cuRow?.zemda_estetic_enabled === 1 ||
    permissions.includes('access_zemda_estetic') ||
    computed.commercialModule === 'ZemdaEstetic';

  const isDentist = computed.professionId === 'prof-dentista' || Boolean(cuRow?.zemda_odonto_enabled);

  // Determina áreas permitidas com respeito estrito às áreas de atuação cadastradas
  const allowedAreas: string[] = [];
  const hasSpecificAreas = userPracticeAreas.length > 0;

  if (hasSpecificAreas) {
    if (
      userPracticeAreas.includes('pa-estet-facial') ||
      userPracticeAreas.includes('pa-odonto-estetica') ||
      userPracticeAreas.includes('pa-biomed-estetica') ||
      userPracticeAreas.includes('pa-farm-estetica')
    ) {
      allowedAreas.push('FACIAL');
    }

    if (
      !isDentist && (
        userPracticeAreas.includes('pa-estet-corporal') ||
        userPracticeAreas.includes('pa-biomed-estetica') ||
        userPracticeAreas.includes('pa-farm-estetica')
      )
    ) {
      allowedAreas.push('CORPORAL');
    }

    if (
      !isDentist && (
        userPracticeAreas.includes('pa-estet-capilar') ||
        userPracticeAreas.includes('pa-biomed-estetica') ||
        userPracticeAreas.includes('pa-farm-estetica')
      )
    ) {
      allowedAreas.push('CAPILAR');
    }
  } else if (hasExplicitAccess) {
    if (isDentist) {
      allowedAreas.push('FACIAL');
    } else {
      allowedAreas.push('FACIAL', 'CORPORAL', 'CAPILAR');
    }
  }

  if (allowedAreas.length === 0) {
    return {
      allowed: false,
      reason: isDentist
        ? 'Cirurgião-Dentista sem especialidade em Harmonização Orofacial ou permissão estética ativada.'
        : 'Profissional sem permissão para acessar o ZemdaEstetic.',
      allowedAreas: [],
      isDentist
    };
  }

  // Validação estrita por área alvo
  if (targetArea && targetArea !== 'OUTRA' && targetArea !== 'TODOS') {
    const normTarget = targetArea.toUpperCase();
    if (!allowedAreas.includes(normTarget)) {
      return {
        allowed: false,
        reason: `Área de atuação '${targetArea}' não está autorizada no seu perfil clínico.`,
        allowedAreas,
        isDentist
      };
    }
  }

  return { allowed: true, allowedAreas, isDentist };
}

export class EsteticController {
  /**
   * Configurações iniciais do profissional no ZemdaEstetic:
   * Retorna áreas permitidas, capacidades, catálogo filtrado e itens do estoque
   */
  static getConfig(req: Request, res: Response): void {
    try {
      const auth = getEsteticAccess(req);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;

      // Catálogo de procedimentos disponíveis para as áreas permitidas
      const catalog = db.prepare(`
        SELECT id, tenant_id, name, category, applicable_areas_json, applicable_regions_json, description, default_unit, active
        FROM estetic_procedure_catalog
        WHERE (tenant_id IS NULL OR tenant_id = ?) AND active = 1
        ORDER BY category ASC, name ASC
      `).all(tenantId) as any[];

      // Insumos e produtos do estoque da clínica compatíveis com procedimentos
      const inventory = db.prepare(`
        SELECT id, name, category, brand, quantity, unit, batch_number, expiration_date, unit_cost
        FROM inventory_items
        WHERE tenant_id = ? AND active = 1
        ORDER BY name ASC
      `).all(tenantId) as any[];

      res.json({
        allowedAreas: auth.allowedAreas,
        isDentist: auth.isDentist,
        catalog,
        inventory
      });
    } catch (err: any) {
      console.error('[EsteticController.getConfig]', err);
      res.status(500).json({ error: 'Erro ao carregar configurações do ZemdaEstetic.' });
    }
  }

  /**
   * Catálogo de Procedimentos
   */
  static getCatalog(req: Request, res: Response): void {
    try {
      const auth = getEsteticAccess(req);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const area = (req.query.area as string)?.toUpperCase();

      const items = db.prepare(`
        SELECT id, tenant_id, name, category, applicable_areas_json, applicable_regions_json, description, default_unit, active
        FROM estetic_procedure_catalog
        WHERE (tenant_id IS NULL OR tenant_id = ?) AND active = 1
        ORDER BY category ASC, name ASC
      `).all(tenantId) as any[];

      const filtered = items.filter(item => {
        if (!area || area === 'TODOS') return true;
        try {
          const areas: string[] = JSON.parse(item.applicable_areas_json || '[]');
          return areas.includes(area);
        } catch {
          return true;
        }
      });

      res.json(filtered);
    } catch (err: any) {
      console.error('[EsteticController.getCatalog]', err);
      res.status(500).json({ error: 'Erro ao obter catálogo de procedimentos.' });
    }
  }

  static createCatalogItem(req: Request, res: Response): void {
    try {
      const auth = getEsteticAccess(req);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const { name, category, applicableAreas, applicableRegions, description, defaultUnit } = req.body;

      if (!name || !category) {
        res.status(400).json({ error: 'Nome e categoria são obrigatórios.' });
        return;
      }

      const id = 'proc-cust-' + uuidv4().slice(0, 8);
      const areasJson = JSON.stringify(Array.isArray(applicableAreas) && applicableAreas.length > 0 ? applicableAreas : ['FACIAL']);
      const regionsJson = JSON.stringify(Array.isArray(applicableRegions) ? applicableRegions : []);

      db.prepare(`
        INSERT INTO estetic_procedure_catalog (
          id, tenant_id, name, category, applicable_areas_json, applicable_regions_json, description, default_unit, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(id, tenantId, name.trim(), category.trim(), areasJson, regionsJson, description || null, defaultUnit || 'un');

      res.status(201).json({ success: true, id, message: 'Procedimento cadastrado no catálogo da clínica!' });
    } catch (err: any) {
      console.error('[EsteticController.createCatalogItem]', err);
      res.status(500).json({ error: 'Erro ao cadastrar procedimento no catálogo.' });
    }
  }

  /**
   * Visão Geral do Paciente (Overview)
   */
  static getPatientOverview(req: Request, res: Response): void {
    try {
      const auth = getEsteticAccess(req);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const patientId = req.params.patientId;

      if (!patientId) {
        res.status(400).json({ error: 'Paciente obrigatório.' });
        return;
      }

      // Última Avaliação
      const lastAssessment = db.prepare(`
        SELECT a.*, p.name as professional_name
        FROM estetic_assessments a
        LEFT JOIN professionals p ON p.id = a.professional_id
        WHERE a.tenant_id = ? AND a.patient_id = ?
        ORDER BY a.assessment_date DESC, a.created_at DESC
        LIMIT 1
      `).get(tenantId, patientId) as any;

      // Último Procedimento
      const lastProcedure = db.prepare(`
        SELECT pr.*, p.name as professional_name
        FROM estetic_procedures pr
        LEFT JOIN professionals p ON p.id = pr.professional_id
        WHERE pr.tenant_id = ? AND pr.patient_id = ?
        ORDER BY pr.created_at DESC
        LIMIT 1
      `).get(tenantId, patientId) as any;

      // Planos de tratamento em aberto
      const pendingPlans = db.prepare(`
        SELECT pl.*, p.name as professional_name
        FROM estetic_plans pl
        LEFT JOIN professionals p ON p.id = pl.professional_id
        WHERE pl.tenant_id = ? AND pl.patient_id = ? AND pl.status IN ('PLANEJADO', 'EM_ANDAMENTO')
        ORDER BY pl.created_at DESC
      `).all(tenantId, patientId) as any[];

      // Próximos retornos previstos
      const upcomingReturns = db.prepare(`
        SELECT pr.id, pr.procedure_name, pr.region, pr.area, pr.return_date, pr.product_name, pr.batch_lot
        FROM estetic_procedures pr
        WHERE pr.tenant_id = ? AND pr.patient_id = ? AND pr.return_date IS NOT NULL
        ORDER BY pr.return_date ASC
        LIMIT 5
      `).all(tenantId, patientId) as any[];

      // Fotografias recentes
      const recentPhotos = db.prepare(`
        SELECT *
        FROM estetic_photos
        WHERE tenant_id = ? AND patient_id = ?
        ORDER BY photo_date DESC, created_at DESC
        LIMIT 8
      `).all(tenantId, patientId) as any[];

      // Áreas já utilizadas para este paciente
      const usedAreasRows = db.prepare(`
        SELECT DISTINCT area FROM estetic_assessments WHERE tenant_id = ? AND patient_id = ?
        UNION
        SELECT DISTINCT area FROM estetic_procedures WHERE tenant_id = ? AND patient_id = ?
        UNION
        SELECT DISTINCT area FROM estetic_plans WHERE tenant_id = ? AND patient_id = ?
      `).all(tenantId, patientId) as any[];

      const usedAreas = usedAreasRows.map(r => r.area).filter(Boolean);

      res.json({
        lastAssessment,
        lastProcedure,
        pendingPlans,
        upcomingReturns,
        recentPhotos,
        usedAreas: usedAreas.length > 0 ? usedAreas : ['FACIAL']
      });
    } catch (err: any) {
      console.error('[EsteticController.getPatientOverview]', err);
      res.status(500).json({ error: 'Erro ao carregar visão geral do paciente.' });
    }
  }

  /**
   * Avaliações Estéticas
   */
  static getAssessments(req: Request, res: Response): void {
    try {
      const targetArea = (req.query.area as string)?.toUpperCase();
      const auth = getEsteticAccess(req, targetArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const patientId = req.query.patientId as string;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório.' });
        return;
      }

      let query = `
        SELECT a.*, p.name as professional_name
        FROM estetic_assessments a
        LEFT JOIN professionals p ON p.id = a.professional_id
        WHERE a.tenant_id = ? AND a.patient_id = ?
      `;
      const params: any[] = [tenantId, patientId];

      if (targetArea && targetArea !== 'TODOS') {
        query += ' AND a.area = ?';
        params.push(targetArea);
      }

      query += ' ORDER BY a.assessment_date DESC, a.created_at DESC';

      const rows = db.prepare(query).all(...params) as any[];
      res.json(rows);
    } catch (err: any) {
      console.error('[EsteticController.getAssessments]', err);
      res.status(500).json({ error: 'Erro ao listar avaliações estéticas.' });
    }
  }

  static createAssessment(req: Request, res: Response): void {
    try {
      const {
        patientId,
        area = 'FACIAL',
        assessmentDate,
        chiefComplaint,
        objectives,
        clinicalHistory,
        specificData,
        observations,
        appointmentId
      } = req.body;

      const normArea = (area || 'FACIAL').toUpperCase();
      const auth = getEsteticAccess(req, normArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const userId = req.user!.userId;

      if (!patientId) {
        res.status(400).json({ error: 'Paciente é obrigatório.' });
        return;
      }

      // Profissional vinculado
      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
      const professionalId = prof?.id || req.body.professionalId || 'pro-clinico';

      const id = 'ast-' + uuidv4().slice(0, 10);
      const now = new Date().toISOString();
      const dateStr = assessmentDate || now.slice(0, 10);
      const specJson = JSON.stringify(specificData || {});

      db.prepare(`
        INSERT INTO estetic_assessments (
          id, tenant_id, patient_id, professional_id, appointment_id,
          area, assessment_date, chief_complaint, objectives, clinical_history,
          specific_data_json, observations, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id, tenantId, patientId, professionalId, appointmentId || null,
        normArea, dateStr, chiefComplaint || null, objectives || null, clinicalHistory || null,
        specJson, observations || null
      );

      try {
        const evoLines = [
          `Avaliação Estética (${normArea}):`,
          chiefComplaint ? `Queixa Principal: ${chiefComplaint}` : '',
          objectives ? `Objetivos: ${objectives}` : '',
          clinicalHistory ? `Histórico Clínico: ${clinicalHistory}` : '',
          observations ? `Observações: ${observations}` : ''
        ].filter(Boolean);

        ClinicalRecordService.recordClinicalEvent({
          tenantId,
          patientId,
          professionalId: professionalId || null,
          appointmentId: appointmentId || null,
          moduleType: 'ZemdaEstetic',
          sourceId: id,
          sourceType: 'estetic_assessment',
          title: `Avaliação Estética: ${normArea}`,
          procedureName: 'Avaliação Estética Especializada',
          sessionDate: dateStr,
          clinicalEvolution: evoLines.join('\n'),
          technicalNotes: observations || null,
          moduleData: {
            assessmentId: id,
            area: normArea,
            chiefComplaint,
            objectives,
            clinicalHistory,
            observations,
            specificData
          },
          createdBy: req.user?.name || 'Profissional de Estética'
        });
      } catch (recErr) {
        console.warn('Aviso ao registrar avaliação estética no prontuário:', recErr);
      }

      res.status(201).json({ success: true, id, message: 'Avaliação estética salva com sucesso!' });
    } catch (err: any) {
      console.error('[EsteticController.createAssessment]', err);
      res.status(500).json({ error: 'Erro ao salvar avaliação estética.' });
    }
  }

  static deleteAssessment(req: Request, res: Response): void {
    try {
      const auth = getEsteticAccess(req);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const id = req.params.id;

      db.prepare('DELETE FROM estetic_assessments WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      res.json({ success: true, message: 'Avaliação excluída com sucesso.' });
    } catch (err: any) {
      console.error('[EsteticController.deleteAssessment]', err);
      res.status(500).json({ error: 'Erro ao excluir avaliação.' });
    }
  }

  /**
   * Planejamento Estético
   */
  static getPlans(req: Request, res: Response): void {
    try {
      const targetArea = (req.query.area as string)?.toUpperCase();
      const auth = getEsteticAccess(req, targetArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const patientId = req.query.patientId as string;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório.' });
        return;
      }

      let query = `
        SELECT pl.*, p.name as professional_name
        FROM estetic_plans pl
        LEFT JOIN professionals p ON p.id = pl.professional_id
        WHERE pl.tenant_id = ? AND pl.patient_id = ?
      `;
      const params: any[] = [tenantId, patientId];

      if (targetArea && targetArea !== 'TODOS') {
        query += ' AND pl.area = ?';
        params.push(targetArea);
      }

      query += ' ORDER BY pl.created_at DESC';

      const rows = db.prepare(query).all(...params) as any[];
      res.json(rows);
    } catch (err: any) {
      console.error('[EsteticController.getPlans]', err);
      res.status(500).json({ error: 'Erro ao listar planejamentos estéticos.' });
    }
  }

  static createPlan(req: Request, res: Response): void {
    try {
      const { patientId, area = 'FACIAL', title, items = [], notes, status = 'PLANEJADO' } = req.body;
      const normArea = (area || 'FACIAL').toUpperCase();
      const auth = getEsteticAccess(req, normArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const userId = req.user!.userId;

      if (!patientId) {
        res.status(400).json({ error: 'Paciente é obrigatório.' });
        return;
      }

      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
      const professionalId = prof?.id || req.body.professionalId || 'pro-clinico';

      const id = 'pln-' + uuidv4().slice(0, 10);
      const itemsJson = JSON.stringify(Array.isArray(items) ? items : []);

      db.prepare(`
        INSERT INTO estetic_plans (
          id, tenant_id, patient_id, professional_id, area, title, items_json, notes, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id, tenantId, patientId, professionalId, normArea,
        title || `Planejamento ${normArea}`, itemsJson, notes || null, status
      );

      res.status(201).json({ success: true, id, message: 'Planejamento estético salvo com sucesso!' });
    } catch (err: any) {
      console.error('[EsteticController.createPlan]', err);
      res.status(500).json({ error: 'Erro ao criar planejamento estético.' });
    }
  }

  static updatePlan(req: Request, res: Response): void {
    try {
      const auth = getEsteticAccess(req);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const id = req.params.id;
      const { title, items, notes, status } = req.body;

      db.prepare(`
        UPDATE estetic_plans SET
          title = COALESCE(?, title),
          items_json = COALESCE(?, items_json),
          notes = COALESCE(?, notes),
          status = COALESCE(?, status),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        title || null,
        items ? JSON.stringify(items) : null,
        notes || null,
        status || null,
        id,
        tenantId
      );

      res.json({ success: true, message: 'Planejamento atualizado com sucesso.' });
    } catch (err: any) {
      console.error('[EsteticController.updatePlan]', err);
      res.status(500).json({ error: 'Erro ao atualizar planejamento.' });
    }
  }

  static deletePlan(req: Request, res: Response): void {
    try {
      const auth = getEsteticAccess(req);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const id = req.params.id;

      db.prepare('DELETE FROM estetic_plans WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      res.json({ success: true, message: 'Planejamento excluído com sucesso.' });
    } catch (err: any) {
      console.error('[EsteticController.deletePlan]', err);
      res.status(500).json({ error: 'Erro ao excluir planejamento.' });
    }
  }

  /**
   * Procedimentos Realizados com rastreabilidade e baixa opcional de estoque
   */
  static getProcedures(req: Request, res: Response): void {
    try {
      const targetArea = (req.query.area as string)?.toUpperCase();
      const auth = getEsteticAccess(req, targetArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const patientId = req.query.patientId as string;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório.' });
        return;
      }

      let query = `
        SELECT pr.*, p.name as professional_name
        FROM estetic_procedures pr
        LEFT JOIN professionals p ON p.id = pr.professional_id
        WHERE pr.tenant_id = ? AND pr.patient_id = ?
      `;
      const params: any[] = [tenantId, patientId];

      if (targetArea && targetArea !== 'TODOS') {
        query += ' AND pr.area = ?';
        params.push(targetArea);
      }

      query += ' ORDER BY pr.created_at DESC';

      const rows = db.prepare(query).all(...params) as any[];
      res.json(rows);
    } catch (err: any) {
      console.error('[EsteticController.getProcedures]', err);
      res.status(500).json({ error: 'Erro ao listar procedimentos estéticos.' });
    }
  }

  static createProcedure(req: Request, res: Response): void {
    try {
      const {
        patientId,
        area = 'FACIAL',
        region,
        procedureId,
        procedureName,
        productId,
        productName,
        manufacturer,
        batchLot,
        expiryDate,
        quantity,
        unit = 'ml',
        observation,
        techniqueNotes,
        adverseEvents,
        returnDate,
        anatomicalMapId,
        planId,
        planItemId,
        deductInventory = false
      } = req.body;

      const normArea = (area || 'FACIAL').toUpperCase();
      const auth = getEsteticAccess(req, normArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const userId = req.user!.userId;

      if (!patientId || !procedureName || !region) {
        res.status(400).json({ error: 'Paciente, procedimento e região anatômica são obrigatórios.' });
        return;
      }

      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
      const professionalId = prof?.id || req.body.professionalId || 'pro-clinico';

      const procRecordId = 'eproc-' + uuidv4().slice(0, 10);

      // Baixa no estoque da clínica se produto for do inventário
      if (deductInventory && productId && Number(quantity) > 0) {
        try {
          const invItem = db.prepare('SELECT id, quantity, name FROM inventory_items WHERE id = ? AND tenant_id = ?').get(productId, tenantId) as any;
          if (invItem) {
            const prevQty = Number(invItem.quantity) || 0;
            const deduction = Number(quantity);
            const newQty = Math.max(0, prevQty - deduction);

            db.prepare('UPDATE inventory_items SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?')
              .run(newQty, productId, tenantId);

            db.prepare(`
              INSERT INTO inventory_movements (
                id, tenant_id, item_id, movement_type, quantity, previous_quantity, new_quantity,
                reason, document_reference, user_id, created_at
              ) VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, datetime('now'))
            `).run(
              'mov-' + uuidv4().slice(0, 8),
              tenantId,
              productId,
              deduction,
              prevQty,
              newQty,
              `Procedimento estético: ${procedureName}`,
              procRecordId,
              userId
            );
          }
        } catch (invErr) {
          console.warn('[EsteticController] Aviso ao deduzir estoque:', invErr);
        }
      }

      // Registro do Procedimento
      db.prepare(`
        INSERT INTO estetic_procedures (
          id, tenant_id, patient_id, professional_id, appointment_id,
          plan_id, plan_item_id, area, region,
          procedure_id, procedure_name, product_id, product_name, manufacturer,
          batch_lot, expiry_date, quantity, unit, observation, technique_notes,
          adverse_events, return_date, anatomical_map_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        procRecordId, tenantId, patientId, professionalId, req.body.appointmentId || null,
        planId || null, planItemId || null, normArea, region,
        procedureId || null, procedureName, productId || null, productName || null, manufacturer || null,
        batchLot || null, expiryDate || null, quantity !== undefined ? Number(quantity) : null, unit,
        observation || null, techniqueNotes || null, adverseEvents || null, returnDate || null,
        anatomicalMapId || null
      );

      // Se vinculado a um item do plano, marca status como REALIZADO
      if (planId && planItemId) {
        try {
          const planRow = db.prepare('SELECT items_json FROM estetic_plans WHERE id = ? AND tenant_id = ?').get(planId, tenantId) as any;
          if (planRow?.items_json) {
            const items = JSON.parse(planRow.items_json);
            const updatedItems = items.map((it: any) => it.id === planItemId ? { ...it, status: 'REALIZADO' } : it);
            db.prepare('UPDATE estetic_plans SET items_json = ?, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?')
              .run(JSON.stringify(updatedItems), planId, tenantId);
          }
        } catch {}
      }

      // Sincroniza com o prontuário universal (records)
      try {
        const evoLines = [
          `Procedimento Estético Realizado: ${procedureName}`,
          region ? `Região: ${region}` : '',
          productName ? `Produto: ${productName}${batchLot ? ` (Lote: ${batchLot})` : ''}` : '',
          quantity ? `Dose / Quantidade: ${quantity} ${unit || ''}` : '',
          observation ? `Observações: ${observation}` : '',
          techniqueNotes ? `Técnica / Conduta: ${techniqueNotes}` : '',
          adverseEvents ? `Intercorrências / Eventos Adversos: ${adverseEvents}` : '',
          returnDate ? `Retorno Previsto: ${returnDate}` : ''
        ].filter(Boolean);

        ClinicalRecordService.recordClinicalEvent({
          tenantId,
          patientId,
          professionalId: professionalId || null,
          appointmentId: req.body.appointmentId || null,
          moduleType: 'ZemdaEstetic',
          sourceId: procRecordId,
          sourceType: 'estetic_procedure',
          title: `Procedimento Estético: ${procedureName}`,
          procedureName,
          clinicalEvolution: evoLines.join('\n'),
          technicalNotes: observation || null,
          conducts: techniqueNotes || null,
          moduleData: {
            procedureRecordId: procRecordId,
            procedureName,
            region,
            productName,
            batchLot,
            quantity,
            unit,
            observation,
            techniqueNotes,
            adverseEvents,
            returnDate
          },
          createdBy: req.user?.name || 'Profissional de Estética'
        });
      } catch (recErr) {
        console.warn('Aviso ao registrar procedimento estético no prontuário:', recErr);
      }

      res.status(201).json({
        success: true,
        id: procRecordId,
        message: 'Procedimento estético registrado com rastreabilidade!'
      });
    } catch (err: any) {
      console.error('[EsteticController.createProcedure]', err);
      res.status(500).json({ error: 'Erro ao registrar procedimento.' });
    }
  }

  static deleteProcedure(req: Request, res: Response): void {
    try {
      const auth = getEsteticAccess(req);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const id = req.params.id;

      db.prepare('DELETE FROM estetic_procedures WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      res.json({ success: true, message: 'Procedimento excluído com sucesso.' });
    } catch (err: any) {
      console.error('[EsteticController.deleteProcedure]', err);
      res.status(500).json({ error: 'Erro ao excluir procedimento.' });
    }
  }

  /**
   * Evolução Estética
   */
  static getEvolutions(req: Request, res: Response): void {
    try {
      const targetArea = (req.query.area as string)?.toUpperCase();
      const auth = getEsteticAccess(req, targetArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const patientId = req.query.patientId as string;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório.' });
        return;
      }

      let query = `
        SELECT ev.*, p.name as professional_name
        FROM estetic_evolutions ev
        LEFT JOIN professionals p ON p.id = ev.professional_id
        WHERE ev.tenant_id = ? AND ev.patient_id = ?
      `;
      const params: any[] = [tenantId, patientId];

      if (targetArea && targetArea !== 'TODOS') {
        query += ' AND ev.area = ?';
        params.push(targetArea);
      }

      query += ' ORDER BY ev.created_at DESC';

      const rows = db.prepare(query).all(...params) as any[];
      res.json(rows);
    } catch (err: any) {
      console.error('[EsteticController.getEvolutions]', err);
      res.status(500).json({ error: 'Erro ao listar evoluções estéticas.' });
    }
  }

  static createEvolution(req: Request, res: Response): void {
    try {
      const {
        patientId,
        area = 'FACIAL',
        procedureId,
        evolutionText,
        observedResponse,
        adverseEvents,
        conduct,
        returnDate,
        appointmentId
      } = req.body;

      const normArea = (area || 'FACIAL').toUpperCase();
      const auth = getEsteticAccess(req, normArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const userId = req.user!.userId;

      if (!patientId || !evolutionText) {
        res.status(400).json({ error: 'Paciente e texto da evolução são obrigatórios.' });
        return;
      }

      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
      const professionalId = prof?.id || req.body.professionalId || 'pro-clinico';

      const id = 'evl-' + uuidv4().slice(0, 10);

      db.prepare(`
        INSERT INTO estetic_evolutions (
          id, tenant_id, patient_id, professional_id, appointment_id,
          procedure_id, area, evolution_text, observed_response, adverse_events,
          conduct, return_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id, tenantId, patientId, professionalId, appointmentId || null,
        procedureId || null, normArea, evolutionText, observedResponse || null, adverseEvents || null,
        conduct || null, returnDate || null
      );

      res.status(201).json({ success: true, id, message: 'Evolução registrada com sucesso!' });
    } catch (err: any) {
      console.error('[EsteticController.createEvolution]', err);
      res.status(500).json({ error: 'Erro ao registrar evolução.' });
    }
  }

  /**
   * Retorno Estético pós-procedimento
   */
  static getReturns(req: Request, res: Response): void {
    try {
      const targetArea = (req.query.area as string)?.toUpperCase();
      const auth = getEsteticAccess(req, targetArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const patientId = req.query.patientId as string;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório.' });
        return;
      }

      let query = `
        SELECT ret.*, p.name as professional_name, pr.procedure_name, pr.region, pr.created_at as procedure_date, pr.product_name, pr.batch_lot
        FROM estetic_returns ret
        LEFT JOIN professionals p ON p.id = ret.professional_id
        LEFT JOIN estetic_procedures pr ON pr.id = ret.procedure_record_id
        WHERE ret.tenant_id = ? AND ret.patient_id = ?
      `;
      const params: any[] = [tenantId, patientId];

      if (targetArea && targetArea !== 'TODOS') {
        query += ' AND ret.area = ?';
        params.push(targetArea);
      }

      query += ' ORDER BY ret.created_at DESC';

      const rows = db.prepare(query).all(...params) as any[];
      res.json(rows);
    } catch (err: any) {
      console.error('[EsteticController.getReturns]', err);
      res.status(500).json({ error: 'Erro ao listar retornos estéticos.' });
    }
  }

  static createReturn(req: Request, res: Response): void {
    try {
      const {
        patientId,
        area = 'FACIAL',
        procedureRecordId,
        returnAssessment,
        adverseEvents,
        conduct,
        nextReturnDate
      } = req.body;

      const normArea = (area || 'FACIAL').toUpperCase();
      const auth = getEsteticAccess(req, normArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const userId = req.user!.userId;

      if (!patientId || !returnAssessment) {
        res.status(400).json({ error: 'Paciente e avaliação do retorno são obrigatórios.' });
        return;
      }

      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
      const professionalId = prof?.id || req.body.professionalId || 'pro-clinico';

      const id = 'ret-' + uuidv4().slice(0, 10);

      db.prepare(`
        INSERT INTO estetic_returns (
          id, tenant_id, patient_id, professional_id, procedure_record_id,
          area, return_assessment, adverse_events, conduct, next_return_date,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id, tenantId, patientId, professionalId, procedureRecordId || null,
        normArea, returnAssessment, adverseEvents || null, conduct || null, nextReturnDate || null
      );

      res.status(201).json({ success: true, id, message: 'Retorno estético registrado com sucesso!' });
    } catch (err: any) {
      console.error('[EsteticController.createReturn]', err);
      res.status(500).json({ error: 'Erro ao registrar retorno.' });
    }
  }

  /**
   * Fotografias Clínicas Estéticas
   */
  static getPhotos(req: Request, res: Response): void {
    try {
      const targetArea = (req.query.area as string)?.toUpperCase();
      const auth = getEsteticAccess(req, targetArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const patientId = req.query.patientId as string;
      const viewType = req.query.viewType as string;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório.' });
        return;
      }

      let query = `
        SELECT ph.*, p.name as professional_name
        FROM estetic_photos ph
        LEFT JOIN professionals p ON p.id = ph.professional_id
        WHERE ph.tenant_id = ? AND ph.patient_id = ?
      `;
      const params: any[] = [tenantId, patientId];

      if (targetArea && targetArea !== 'TODOS') {
        query += ' AND ph.area = ?';
        params.push(targetArea);
      }

      if (viewType && viewType !== 'TODAS') {
        query += ' AND ph.view_type = ?';
        params.push(viewType);
      }

      query += ' ORDER BY ph.photo_date DESC, ph.created_at DESC';

      const rows = db.prepare(query).all(...params) as any[];
      res.json(rows);
    } catch (err: any) {
      console.error('[EsteticController.getPhotos]', err);
      res.status(500).json({ error: 'Erro ao listar fotografias estéticas.' });
    }
  }

  static createPhoto(req: Request, res: Response): void {
    try {
      const {
        patientId,
        area = 'FACIAL',
        viewType = 'FRONTAL',
        fileUrl,
        fileKey,
        observation,
        photoDate,
        appointmentId,
        procedureId
      } = req.body;

      const normArea = (area || 'FACIAL').toUpperCase();
      const auth = getEsteticAccess(req, normArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const userId = req.user!.userId;

      if (!patientId || !fileUrl) {
        res.status(400).json({ error: 'Paciente e arquivo da fotografia são obrigatórios.' });
        return;
      }

      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
      const professionalId = prof?.id || req.body.professionalId || 'pro-clinico';

      const id = 'pht-' + uuidv4().slice(0, 10);
      const dateStr = photoDate || new Date().toISOString().slice(0, 10);

      db.prepare(`
        INSERT INTO estetic_photos (
          id, tenant_id, patient_id, professional_id, appointment_id, procedure_id,
          area, view_type, file_url, file_key, observation, photo_date,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        id, tenantId, patientId, professionalId, appointmentId || null, procedureId || null,
        normArea, viewType, fileUrl, fileKey || null, observation || null, dateStr
      );

      res.status(201).json({ success: true, id, message: 'Fotografia registrada na galeria com sucesso!' });
    } catch (err: any) {
      console.error('[EsteticController.createPhoto]', err);
      res.status(500).json({ error: 'Erro ao registrar fotografia.' });
    }
  }

  static deletePhoto(req: Request, res: Response): void {
    try {
      const auth = getEsteticAccess(req);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const id = req.params.id;

      db.prepare('DELETE FROM estetic_photos WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      res.json({ success: true, message: 'Fotografia excluída com sucesso.' });
    } catch (err: any) {
      console.error('[EsteticController.deletePhoto]', err);
      res.status(500).json({ error: 'Erro ao excluir fotografia.' });
    }
  }

  /**
   * Comparador Antes × Depois
   * Retorna agrupamentos de fotos do paciente alinhados por área e tipo de vista
   */
  static getBeforeAfter(req: Request, res: Response): void {
    try {
      const targetArea = (req.query.area as string)?.toUpperCase();
      const auth = getEsteticAccess(req, targetArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const patientId = req.query.patientId as string;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório.' });
        return;
      }

      let query = `
        SELECT *
        FROM estetic_photos
        WHERE tenant_id = ? AND patient_id = ?
      `;
      const params: any[] = [tenantId, patientId];

      if (targetArea && targetArea !== 'TODOS') {
        query += ' AND area = ?';
        params.push(targetArea);
      }

      query += ' ORDER BY photo_date ASC, created_at ASC';

      const photos = db.prepare(query).all(...params) as any[];

      // Agrupa por vista para facilitar comparações diretas
      const groupsByView: Record<string, any[]> = {};
      for (const ph of photos) {
        const key = `${ph.area} • ${ph.view_type}`;
        if (!groupsByView[key]) groupsByView[key] = [];
        groupsByView[key].push(ph);
      }

      res.json({
        photos,
        groupsByView
      });
    } catch (err: any) {
      console.error('[EsteticController.getBeforeAfter]', err);
      res.status(500).json({ error: 'Erro ao carregar dados de antes e depois.' });
    }
  }

  /**
   * Histórico Longitudinal Unificado do Paciente
   * Consolida avaliações, fotos, planos, procedimentos, evoluções e retornos em timeline cronológica
   */
  static getHistory(req: Request, res: Response): void {
    try {
      const targetArea = (req.query.area as string)?.toUpperCase();
      const auth = getEsteticAccess(req, targetArea);
      if (!auth.allowed) {
        res.status(403).json({ error: auth.reason });
        return;
      }

      const tenantId = req.tenantId!;
      const patientId = req.query.patientId as string;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório.' });
        return;
      }

      const events: any[] = [];

      // 1. Avaliações
      let astQuery = 'SELECT a.*, p.name as professional_name FROM estetic_assessments a LEFT JOIN professionals p ON p.id = a.professional_id WHERE a.tenant_id = ? AND a.patient_id = ?';
      const astParams: any[] = [tenantId, patientId];
      if (targetArea && targetArea !== 'TODOS') { astQuery += ' AND a.area = ?'; astParams.push(targetArea); }
      const assessments = db.prepare(astQuery).all(...astParams) as any[];
      for (const a of assessments) {
        events.push({
          id: a.id,
          type: 'ASSESSMENT',
          typeLabel: 'Avaliação Estética',
          date: a.assessment_date,
          createdAt: a.created_at,
          area: a.area,
          title: `Avaliação ${a.area}`,
          subtitle: a.chief_complaint || 'Sem queixa registrada',
          professionalName: a.professional_name,
          details: a.objectives || a.observations,
          raw: a
        });
      }

      // 2. Procedimentos
      let procQuery = 'SELECT pr.*, p.name as professional_name FROM estetic_procedures pr LEFT JOIN professionals p ON p.id = pr.professional_id WHERE pr.tenant_id = ? AND pr.patient_id = ?';
      const procParams: any[] = [tenantId, patientId];
      if (targetArea && targetArea !== 'TODOS') { procQuery += ' AND pr.area = ?'; procParams.push(targetArea); }
      const procedures = db.prepare(procQuery).all(...procParams) as any[];
      for (const pr of procedures) {
        events.push({
          id: pr.id,
          type: 'PROCEDURE',
          typeLabel: 'Procedimento Realizado',
          date: pr.created_at?.slice(0, 10),
          createdAt: pr.created_at,
          area: pr.area,
          title: pr.procedure_name,
          subtitle: `Região: ${pr.region}${pr.product_name ? ` • Insumo: ${pr.product_name}` : ''}${pr.batch_lot ? ` (Lote: ${pr.batch_lot})` : ''}`,
          professionalName: pr.professional_name,
          details: pr.observation || pr.technique_notes,
          returnDate: pr.return_date,
          raw: pr
        });
      }

      // 3. Planos
      let planQuery = 'SELECT pl.*, p.name as professional_name FROM estetic_plans pl LEFT JOIN professionals p ON p.id = pl.professional_id WHERE pl.tenant_id = ? AND pl.patient_id = ?';
      const planParams: any[] = [tenantId, patientId];
      if (targetArea && targetArea !== 'TODOS') { planQuery += ' AND pl.area = ?'; planParams.push(targetArea); }
      const plans = db.prepare(planQuery).all(...planParams) as any[];
      for (const pl of plans) {
        events.push({
          id: pl.id,
          type: 'PLAN',
          typeLabel: 'Planejamento Estético',
          date: pl.created_at?.slice(0, 10),
          createdAt: pl.created_at,
          area: pl.area,
          title: pl.title || `Planejamento ${pl.area}`,
          subtitle: `Status: ${pl.status}`,
          professionalName: pl.professional_name,
          details: pl.notes,
          raw: pl
        });
      }

      // 4. Evoluções
      let evoQuery = 'SELECT ev.*, p.name as professional_name FROM estetic_evolutions ev LEFT JOIN professionals p ON p.id = ev.professional_id WHERE ev.tenant_id = ? AND ev.patient_id = ?';
      const evoParams: any[] = [tenantId, patientId];
      if (targetArea && targetArea !== 'TODOS') { evoQuery += ' AND ev.area = ?'; evoParams.push(targetArea); }
      const evolutions = db.prepare(evoQuery).all(...evoParams) as any[];
      for (const ev of evolutions) {
        events.push({
          id: ev.id,
          type: 'EVOLUTION',
          typeLabel: 'Evolução Clínica',
          date: ev.created_at?.slice(0, 10),
          createdAt: ev.created_at,
          area: ev.area,
          title: `Evolução • ${ev.area}`,
          subtitle: ev.evolution_text,
          professionalName: ev.professional_name,
          details: ev.conduct || ev.observed_response,
          raw: ev
        });
      }

      // 5. Retornos
      let retQuery = 'SELECT rt.*, p.name as professional_name FROM estetic_returns rt LEFT JOIN professionals p ON p.id = rt.professional_id WHERE rt.tenant_id = ? AND rt.patient_id = ?';
      const retParams: any[] = [tenantId, patientId];
      if (targetArea && targetArea !== 'TODOS') { retQuery += ' AND rt.area = ?'; retParams.push(targetArea); }
      const returns = db.prepare(retQuery).all(...retParams) as any[];
      for (const rt of returns) {
        events.push({
          id: rt.id,
          type: 'RETURN',
          typeLabel: 'Retorno Pós-Procedimento',
          date: rt.created_at?.slice(0, 10),
          createdAt: rt.created_at,
          area: rt.area,
          title: `Retorno • ${rt.area}`,
          subtitle: rt.return_assessment,
          professionalName: rt.professional_name,
          details: rt.conduct,
          raw: rt
        });
      }

      // 6. Fotografias
      let phtQuery = 'SELECT ph.*, p.name as professional_name FROM estetic_photos ph LEFT JOIN professionals p ON p.id = ph.professional_id WHERE ph.tenant_id = ? AND ph.patient_id = ?';
      const phtParams: any[] = [tenantId, patientId];
      if (targetArea && targetArea !== 'TODOS') { phtQuery += ' AND ph.area = ?'; phtParams.push(targetArea); }
      const photos = db.prepare(phtQuery).all(...phtParams) as any[];
      for (const ph of photos) {
        events.push({
          id: ph.id,
          type: 'PHOTO',
          typeLabel: 'Registro Fotográfico',
          date: ph.photo_date,
          createdAt: ph.created_at,
          area: ph.area,
          title: `Foto ${ph.area} (${ph.view_type})`,
          subtitle: ph.observation || 'Foto clínica',
          professionalName: ph.professional_name,
          photoUrl: ph.file_url,
          raw: ph
        });
      }

      // Ordenação cronológica decrescente (mais recente primeiro)
      events.sort((a, b) => {
        const dateA = a.date || a.createdAt || '';
        const dateB = b.date || b.createdAt || '';
        return dateB.localeCompare(dateA);
      });

      res.json(events);
    } catch (err: any) {
      console.error('[EsteticController.getHistory]', err);
      res.status(500).json({ error: 'Erro ao gerar histórico estético.' });
    }
  }
}
