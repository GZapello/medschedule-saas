import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { CapabilityService } from '../services/capability.service';
import { esteticRecords, esteticOverview } from './estetic-records';

/**
 * Validador Central de Acesso e Áreas do ZemdaEstetic
 */
export function getEsteticAccess(req: Request, targetArea?: string): { allowed: boolean; reason?: string; allowedAreas: string[]; isDentist: boolean } {
  if (!req.user || !req.tenantId) {
    return { allowed: false, reason: 'Não autenticado ou clínica não informada.', allowedAreas: [], isDentist: false };
  }

  if (req.user.role === 'superadmin') {
    const sandbox = req.tenantId.startsWith('sbx-tenant-') && db.prepare('SELECT id FROM sandbox_test_sessions WHERE sandbox_tenant_id = ? AND admin_user_id = ?').get(req.tenantId, req.user.userId);
    return sandbox ? { allowed: true, allowedAreas: ['FACIAL', 'CORPORAL', 'CAPILAR', 'OUTRA'], isDentist: false } : { allowed: false, reason: 'Dados clínicos protegidos: utilize o sandbox de testes.', allowedAreas: [], isDentist: false };
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
    SELECT role, status, permissions_json, zemda_estetic_enabled, zemda_odonto_enabled
    FROM clinic_users
    WHERE user_id = ? AND tenant_id = ?
  `).get(req.user.userId, req.tenantId) as any;

  const professional = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1').get(req.user.userId, req.tenantId);
  if (!['professional', 'clinic_admin'].includes(roleStr) || !professional || (cuRow && (cuRow.status !== 'active' || !['professional', 'clinic_admin'].includes(cuRow.role)))) {
    return { allowed: false, reason: 'Vínculo clínico inativo ou não autorizado nesta clínica.', allowedAreas: [], isDentist: false };
  }
  let permissions: string[] = [];
  if (cuRow?.permissions_json) {
    try { const parsed = JSON.parse(cuRow.permissions_json); if (Array.isArray(parsed)) permissions = parsed; } catch {}
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
  if (targetArea && String(targetArea).toUpperCase() !== 'TODOS') {
    const normTarget = String(targetArea).toUpperCase();
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
      const auth = getEsteticAccess(req, req.query?.area as string);
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
        catalog: catalog.filter(row => { try { return JSON.parse(row.applicable_areas_json).some((area: string) => auth.allowedAreas.includes(area)); } catch { return false; } }),
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
      const auth = getEsteticAccess(req, req.query?.area as string);
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
        if (!area || area === 'TODOS') { try { return JSON.parse(item.applicable_areas_json).some((entry: string) => auth.allowedAreas.includes(entry)); } catch { return false; } }
        try {
          const areas: string[] = JSON.parse(item.applicable_areas_json || '[]');
          return auth.allowedAreas.includes(area) && areas.includes(area);
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
      const auth = getEsteticAccess(req, req.query?.area as string);
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
  static getPatientOverview(req: Request, res: Response): void { esteticOverview(req, res, getEsteticAccess); }

  /**
   * Avaliações Estéticas
   */
  static getAssessments(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'assessments', 'list'); }

  static createAssessment(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'assessments', 'create'); }

  static deleteAssessment(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'assessments', 'delete'); }

  /**
   * Planejamento Estético
   */
  static getPlans(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'plans', 'list'); }

  static createPlan(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'plans', 'create'); }

  static updatePlan(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'plans', 'update'); }

  static deletePlan(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'plans', 'delete'); }

  /**
   * Procedimentos Realizados com rastreabilidade e baixa opcional de estoque
   */
  static getProcedures(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'procedures', 'list'); }

  static createProcedure(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'procedures', 'create'); }

  static deleteProcedure(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'procedures', 'delete'); }

  /**
   * Evolução Estética
   */
  static getEvolutions(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'evolutions', 'list'); }

  static createEvolution(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'evolutions', 'create'); }

  /**
   * Retorno Estético pós-procedimento
   */
  static getReturns(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'returns', 'list'); }

  static createReturn(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'returns', 'create'); }

  /**
   * Fotografias Clínicas Estéticas
   */
  static getPhotos(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'photos', 'list'); }

  static createPhoto(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'photos', 'create'); }

  static deletePhoto(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'photos', 'delete'); }

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

      const photos = (db.prepare(query).all(...params) as any[]).filter(row => auth.allowedAreas.includes(row.area));

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
          date: pr.date_performed || pr.created_at?.slice(0, 10),
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
          date: ev.evolution_date || ev.created_at?.slice(0, 10),
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
          date: rt.actual_date || rt.scheduled_date || rt.created_at?.slice(0, 10),
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

      res.json(events.filter(row => auth.allowedAreas.includes(row.area)));
    } catch (err: any) {
      console.error('[EsteticController.getHistory]', err);
      res.status(500).json({ error: 'Erro ao gerar histórico estético.' });
    }
  }
  static updateAssessment(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'assessments', 'update'); }
  static updateProcedure(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'procedures', 'update'); }
  static updateEvolution(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'evolutions', 'update'); }
  static deleteEvolution(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'evolutions', 'delete'); }
  static updateReturn(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'returns', 'update'); }
  static deleteReturn(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'returns', 'delete'); }
  static updatePhoto(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'photos', 'update'); }
  static updatePlanItem(req: Request, res: Response): void { esteticRecords(req, res, getEsteticAccess, 'plans', 'item'); }

}
