import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';

/**
 * Validação de acesso exclusivo para Odontologia (ZemdaOdonto)
 * Bloqueio REAL no backend:
 * 1. O usuário deve pertencer à profissão / área de atuação de Odontologia (prof-dentista, prof-odontologia, etc.)
 * 2. O acesso deve ser explicitamente liberado pelo gestor da clínica (permissão access_zemda_odonto ou flag zemda_odonto_enabled)
 * 3. SuperAdmin, Recepção, Financeiro e outras profissões: BLOQUEADOS (403)
 * 4. Gerente que também é Cirurgião-Dentista: PERMITIDO desde que habilitado
 */
export function isDentistOrClinicManager(req: Request): boolean {
  if (!req.user || !req.tenantId) return false;

  // 1. Administrador Global / Sistema NUNCA pode acessar prontuários e fichas clínicas do ZemdaOdonto
  if (req.user.role === 'superadmin') return false;

  // 2. Cargos estritamente não-clínicos são bloqueados
  const roleStr = req.user.role as string;
  if (roleStr === 'receptionist' || roleStr === 'financial' || roleStr === 'secretary' || roleStr === 'assistant') {
    return false;
  }

  // 3. Busca vínculo do usuário na clínica
  const clinicUser = db.prepare(`
    SELECT cu.role, cu.status as cu_status, cu.is_manager, cu.permissions_json, cu.profession_custom,
           cu.practice_areas as cu_practice_areas, cu.zemda_odonto_enabled,
           u.status as u_status, u.profession_name, u.practice_areas as u_practice_areas, u.zemda_odonto_enabled as u_zemda_odonto_enabled
    FROM users u
    LEFT JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
    WHERE u.id = ?
  `).get(req.tenantId, req.user.userId) as any;

  if (clinicUser?.u_status === 'inactive' || clinicUser?.u_status === 'blocked' || clinicUser?.cu_status === 'inactive' || clinicUser?.cu_status === 'blocked') {
    return false;
  }

  // Busca dados de tenant para profissão do gestor
  const tenant = db.prepare('SELECT manager_profession, manager_practice_areas FROM tenants WHERE id = ?').get(req.tenantId) as any;

  // Busca dados de professional se houver
  const prof = db.prepare(`
    SELECT p.id, p.profession_id, p.practice_areas, p.specialty_custom, p.zemda_odonto_enabled,
           prof.slug as profession_slug, prof.name as profession_name
    FROM professionals p
    LEFT JOIN professions prof ON prof.id = p.profession_id
    WHERE p.user_id = ? AND p.tenant_id = ?
  `).get(req.user.userId, req.tenantId) as any;

  // 4. Critério 1: Profissão / Área clínica deve ser Odontologia / Dentista
  const combinedProfessionText = [
    prof?.profession_id,
    prof?.profession_slug,
    prof?.profession_name,
    prof?.practice_areas,
    prof?.specialty_custom,
    clinicUser?.profession_custom,
    clinicUser?.cu_practice_areas,
    clinicUser?.profession_name,
    clinicUser?.u_practice_areas,
    tenant?.manager_profession,
    tenant?.manager_practice_areas
  ].filter(Boolean).join(' ').toLowerCase();

  const isOdontoArea =
    prof?.profession_id === 'prof-dentista' ||
    prof?.profession_id === 'prof-odontologia' ||
    combinedProfessionText.includes('odonto') ||
    combinedProfessionText.includes('dentis') ||
    combinedProfessionText.includes('cro');

  if (!isOdontoArea) {
    return false; // Não é da área de Odontologia -> BLOQUEADO (403)
  }

  // 5. Critério 2: Liberação explícita pelo gestor da clínica (ou é o próprio gerente atuando em odontologia)
  let perms: string[] = [];
  try {
    if (clinicUser?.permissions_json) {
      perms = JSON.parse(clinicUser.permissions_json);
    }
  } catch {}

  const isManager = req.user.role === 'clinic_admin' || clinicUser?.is_manager === 1 || clinicUser?.role === 'clinic_admin';

  const isAuthorizedByManager =
    (isManager && isOdontoArea) ||
    perms.includes('access_zemda_odonto') ||
    Number(prof?.zemda_odonto_enabled) === 1 ||
    Number(clinicUser?.zemda_odonto_enabled) === 1 ||
    Number(clinicUser?.u_zemda_odonto_enabled) === 1;

  return isAuthorizedByManager;
}

export class DentistryController {
  // =========================================================================
  // 1. ODONTOGRAMA (INICIAL, ATUAL E HISTÓRICO)
  // =========================================================================

  static getOdontogram(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!req.user || !tenantId) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
      }

      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({
          error: 'Acesso restrito: este recurso é exclusivo para profissionais de Odontologia e administração da clínica.',
          code: 'DENTISTRY_RESTRICTED'
        });
        return;
      }

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({
          error: 'Acesso clínico restrito: profissional sem vínculo assistencial com o paciente (Sigilo LGPD).',
          code: 'CLINICAL_PRIVACY_RESTRICTION'
        });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM odontograms 
        WHERE patient_id = ? AND tenant_id = ? 
        ORDER BY created_at DESC
      `).all(patientId, tenantId) as any[];

      const initial = rows.find(r => r.type === 'initial') || null;
      const current = rows.find(r => r.type === 'current') || rows[0] || null;

      logAudit(req, 'GET_ODONTOGRAM', 'odontograms', patientId);
      res.json({
        initial: initial ? { ...initial, status_data: JSON.parse(initial.status_data_json || '{}') } : null,
        current: current ? { ...current, status_data: JSON.parse(current.status_data_json || '{}') } : null,
        all: rows.map(r => ({ ...r, status_data: JSON.parse(r.status_data_json || '{}') }))
      });
    } catch (err: any) {
      console.error('[DentistryController.getOdontogram] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar odontograma' });
    }
  }

  static saveOdontogram(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({
          error: 'Acesso restrito: somente cirurgiões-dentistas autorizados podem alterar o odontograma.',
          code: 'DENTISTRY_RESTRICTED'
        });
        return;
      }

      const { patientId, appointmentId, type = 'current', statusData, notes, toothChanges } = req.body;

      if (!patientId || !statusData) {
        res.status(400).json({ error: 'patientId e statusData são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      } else if (req.body.professionalId) {
        profId = req.body.professionalId;
      }

      const statusDataJson = typeof statusData === 'string' ? statusData : JSON.stringify(statusData);

      const existing = db.prepare(`
        SELECT id FROM odontograms 
        WHERE patient_id = ? AND tenant_id = ? AND type = ?
        LIMIT 1
      `).get(patientId, tenantId, type) as any;

      let odontoId = existing?.id;

      if (existing) {
        db.prepare(`
          UPDATE odontograms 
          SET status_data_json = ?, notes = COALESCE(?, notes), updated_at = datetime('now'), professional_id = COALESCE(?, professional_id)
          WHERE id = ? AND tenant_id = ?
        `).run(statusDataJson, notes || null, profId || null, existing.id, tenantId);
      } else {
        odontoId = 'odo-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO odontograms (id, tenant_id, patient_id, professional_id, appointment_id, type, status_data_json, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(odontoId, tenantId, patientId, profId, appointmentId || null, type, statusDataJson, notes || null);
      }

      if (Array.isArray(toothChanges) && toothChanges.length > 0) {
        const insertToothStmt = db.prepare(`
          INSERT INTO dental_tooth_records (
            id, tenant_id, patient_id, professional_id, appointment_id,
            tooth_number, face, condition, previous_condition, procedure_name, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const change of toothChanges) {
          const recId = 'dtr-' + uuidv4().slice(0, 8);
          insertToothStmt.run(
            recId, tenantId, patientId, profId, appointmentId || null,
            change.toothNumber, change.face || 'whole', change.condition,
            change.previousCondition || null, change.procedureName || null, change.notes || null
          );
        }
      }

      logAudit(req, 'SAVE_ODONTOGRAM', 'odontograms', odontoId, { patientId, type });
      res.json({ id: odontoId, message: 'Odontograma salvo com sucesso' });
    } catch (err: any) {
      console.error('[DentistryController.saveOdontogram] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar odontograma' });
    }
  }

  static getToothHistory(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const toothNumber = req.query.toothNumber ? Number(req.query.toothNumber) : null;
      const tenantId = req.tenantId;

      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      let query = `
        SELECT dtr.*, p.name as professional_name
        FROM dental_tooth_records dtr
        LEFT JOIN professionals p ON p.id = dtr.professional_id
        WHERE dtr.patient_id = ? AND dtr.tenant_id = ?
      `;
      const params: any[] = [patientId, tenantId];

      if (toothNumber) {
        query += ` AND dtr.tooth_number = ?`;
        params.push(toothNumber);
      }

      query += ` ORDER BY dtr.created_at DESC`;

      const rows = db.prepare(query).all(...params);
      res.json(rows);
    } catch (err: any) {
      console.error('[DentistryController.getToothHistory] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar histórico do dente' });
    }
  }

  // =========================================================================
  // 2. PERIODONTIA (PERIO)
  // =========================================================================

  static getPerioRecords(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const rows = db.prepare(`
        SELECT pr.*, p.name as professional_name
        FROM dental_periodontal_records pr
        LEFT JOIN professionals p ON p.id = pr.professional_id
        WHERE pr.patient_id = ? AND pr.tenant_id = ?
        ORDER BY pr.created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => ({
        ...r,
        periodontogram: JSON.parse(r.periodontogram_json || '{}')
      })));
    } catch (err: any) {
      console.error('[DentistryController.getPerioRecords] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar periodontograma' });
    }
  }

  static savePerioRecord(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const { patientId, appointmentId, periodontogram, notes } = req.body;
      if (!patientId || !periodontogram) {
        res.status(400).json({ error: 'patientId e periodontogram são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      } else if (req.body.professionalId) {
        profId = req.body.professionalId;
      }

      const id = 'perio-' + uuidv4().slice(0, 8);
      const perioJson = typeof periodontogram === 'string' ? periodontogram : JSON.stringify(periodontogram);

      db.prepare(`
        INSERT INTO dental_periodontal_records (id, tenant_id, patient_id, professional_id, appointment_id, periodontogram_json, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, patientId, profId, appointmentId || null, perioJson, notes || null);

      logAudit(req, 'SAVE_PERIO_RECORD', 'dental_periodontal_records', id, { patientId });
      res.status(201).json({ id, message: 'Ficha periodontal salva com sucesso' });
    } catch (err: any) {
      console.error('[DentistryController.savePerioRecord] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar ficha periodontal' });
    }
  }

  // =========================================================================
  // 3. ENDODONTIA (ENDO)
  // =========================================================================

  static getEndoRecords(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const rows = db.prepare(`
        SELECT er.*, p.name as professional_name
        FROM dental_endodontic_records er
        LEFT JOIN professionals p ON p.id = er.professional_id
        WHERE er.patient_id = ? AND er.tenant_id = ?
        ORDER BY er.created_at DESC
      `).all(patientId, tenantId);

      res.json(rows);
    } catch (err: any) {
      console.error('[DentistryController.getEndoRecords] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar registros endodônticos' });
    }
  }

  static saveEndoRecord(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const {
        patientId, appointmentId, toothNumber, pulparDiagnosis, periapicalDiagnosis,
        canalsCount, workingLength, instrumentation, irrigation, intracanalMedication,
        obturation, material, sessionsCount, notes
      } = req.body;

      if (!patientId || !toothNumber) {
        res.status(400).json({ error: 'patientId e toothNumber são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      } else if (req.body.professionalId) {
        profId = req.body.professionalId;
      }

      const id = 'endo-' + uuidv4().slice(0, 8);

      db.prepare(`
        INSERT INTO dental_endodontic_records (
          id, tenant_id, patient_id, professional_id, appointment_id,
          tooth_number, pulpar_diagnosis, periapical_diagnosis, canals_count,
          working_length, instrumentation, irrigation, intracanal_medication,
          obturation, material, sessions_count, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        Number(toothNumber), pulparDiagnosis || null, periapicalDiagnosis || null, Number(canalsCount || 1),
        workingLength || null, instrumentation || null, irrigation || null, intracanalMedication || null,
        obturation || null, material || null, Number(sessionsCount || 1), notes || null
      );

      logAudit(req, 'SAVE_ENDO_RECORD', 'dental_endodontic_records', id, { patientId, toothNumber });
      res.status(201).json({ id, message: 'Registro endodôntico salvo com sucesso' });
    } catch (err: any) {
      console.error('[DentistryController.saveEndoRecord] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar registro endodôntico' });
    }
  }

  // =========================================================================
  // 4. ANAMNESE ODONTOLÓGICA
  // =========================================================================

  static getAnamnesis(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const record = db.prepare(`
        SELECT * FROM dental_anamnesis 
        WHERE patient_id = ? AND tenant_id = ?
        LIMIT 1
      `).get(patientId, tenantId) as any;

      if (!record) {
        res.json(null);
        return;
      }

      res.json({
        ...record,
        systemic_diseases: JSON.parse(record.systemic_diseases_json || '[]'),
        habits: JSON.parse(record.habits_json || '[]'),
        allergies: JSON.parse(record.allergies_json || '[]'),
        custom_fields: JSON.parse(record.custom_fields_json || '{}')
      });
    } catch (err: any) {
      console.error('[DentistryController.getAnamnesis] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar anamnese odontológica' });
    }
  }

  static saveAnamnesis(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const {
        patientId, systemicDiseases, habits, allergies,
        currentMedications, previousSurgeries, anesthesiaHistory,
        customFields, notes
      } = req.body;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const existing = db.prepare(`SELECT id FROM dental_anamnesis WHERE patient_id = ? AND tenant_id = ?`).get(patientId, tenantId) as any;

      const sysJson = JSON.stringify(systemicDiseases || []);
      const habJson = JSON.stringify(habits || []);
      const allJson = JSON.stringify(allergies || []);
      const custJson = JSON.stringify(customFields || {});

      if (existing) {
        db.prepare(`
          UPDATE dental_anamnesis SET
            systemic_diseases_json = ?, habits_json = ?, allergies_json = ?,
            current_medications = ?, previous_surgeries = ?, anesthesia_history = ?,
            custom_fields_json = ?, notes = ?, professional_id = COALESCE(?, professional_id),
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          sysJson, habJson, allJson,
          currentMedications || null, previousSurgeries || null, anesthesiaHistory || null,
          custJson, notes || null, profId || null,
          existing.id, tenantId
        );
        logAudit(req, 'UPDATE_ANAMNESIS', 'dental_anamnesis', existing.id, { patientId });
        res.json({ id: existing.id, message: 'Anamnese atualizada com sucesso' });
      } else {
        const id = 'ana-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO dental_anamnesis (
            id, tenant_id, patient_id, professional_id,
            systemic_diseases_json, habits_json, allergies_json,
            current_medications, previous_surgeries, anesthesia_history,
            custom_fields_json, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, tenantId, patientId, profId,
          sysJson, habJson, allJson,
          currentMedications || null, previousSurgeries || null, anesthesiaHistory || null,
          custJson, notes || null
        );
        logAudit(req, 'CREATE_ANAMNESIS', 'dental_anamnesis', id, { patientId });
        res.status(201).json({ id, message: 'Anamnese registrada com sucesso' });
      }
    } catch (err: any) {
      console.error('[DentistryController.saveAnamnesis] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar anamnese' });
    }
  }

  // =========================================================================
  // 5. PLANO DE TRATAMENTO E ORÇAMENTO
  // =========================================================================

  static listTreatmentPlans(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const rows = db.prepare(`
        SELECT dtp.*, p.name as professional_name
        FROM dental_treatment_plans dtp
        LEFT JOIN professionals p ON p.id = dtp.professional_id
        WHERE dtp.patient_id = ? AND dtp.tenant_id = ?
        ORDER BY dtp.created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => ({
        ...r,
        items: JSON.parse(r.items_json || '[]')
      })));
    } catch (err: any) {
      console.error('[DentistryController.listTreatmentPlans] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar planos de tratamento' });
    }
  }

  static saveTreatmentPlan(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const {
        patientId, title, items, totalValue, discountValue,
        finalValue, paymentTerms, notes, status = 'planned'
      } = req.body;

      if (!patientId || !title || !Array.isArray(items)) {
        res.status(400).json({ error: 'patientId, title e items são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      } else if (req.body.professionalId) {
        profId = req.body.professionalId;
      }

      const id = 'dtp-' + uuidv4().slice(0, 8);
      const itemsJson = JSON.stringify(items);

      db.prepare(`
        INSERT INTO dental_treatment_plans (
          id, tenant_id, patient_id, professional_id, title,
          status, total_value, discount_value, final_value,
          items_json, payment_terms, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, title,
        status, Number(totalValue || 0), Number(discountValue || 0), Number(finalValue || 0),
        itemsJson, paymentTerms || null, notes || null
      );

      // Também sincroniza com o módulo geral de orçamentos se status for 'budget'
      try {
        const budId = 'bud-' + id;
        db.prepare(`
          INSERT INTO budgets (
            id, tenant_id, patient_id, title, total_value, discount_value, final_value,
            status, items_json, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          budId, tenantId, patientId, `[Odonto] ${title}`,
          Number(totalValue || 0), Number(discountValue || 0), Number(finalValue || 0),
          status === 'approved' ? 'approved' : 'pending',
          itemsJson, notes || null, req.user?.name || 'Cirurgião-Dentista'
        );
      } catch (budErr) {
        console.warn('Aviso ao sincronizar com orçamentos gerais:', budErr);
      }

      logAudit(req, 'CREATE_TREATMENT_PLAN', 'dental_treatment_plans', id, { patientId, title });
      res.status(201).json({ id, message: 'Plano de tratamento salvo com sucesso' });
    } catch (err: any) {
      console.error('[DentistryController.saveTreatmentPlan] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar plano de tratamento' });
    }
  }

  static updateTreatmentPlanStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const tenantId = req.tenantId;

      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      db.prepare(`
        UPDATE dental_treatment_plans 
        SET status = ?, updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(status, id, tenantId);

      // Se aprovado, pode registrar contas a receber
      if (status === 'approved' && req.body.generateFinancialRecord) {
        try {
          const plan = db.prepare('SELECT * FROM dental_treatment_plans WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
          if (plan) {
            const payId = 'pay-' + uuidv4().slice(0, 8);
            db.prepare(`
              INSERT INTO payments (
                id, tenant_id, patient_id, amount, method, status, due_date, notes
              ) VALUES (?, ?, ?, ?, 'credit_card', 'pending', date('now'), ?)
            `).run(payId, tenantId, plan.patient_id, plan.final_value, `Orçamento Odonto: ${plan.title}`);
          }
        } catch (payErr) {
          console.warn('Aviso ao gerar registro financeiro:', payErr);
        }
      }

      res.json({ message: 'Status do plano atualizado com sucesso' });
    } catch (err: any) {
      console.error('[DentistryController.updateTreatmentPlanStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar plano' });
    }
  }

  // =========================================================================
  // 6. LABORATÓRIO DE PRÓTESE
  // =========================================================================

  static listProsthetics(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const rows = db.prepare(`
        SELECT dpl.*, p.name as professional_name
        FROM dental_prosthetics_lab dpl
        LEFT JOIN professionals p ON p.id = dpl.professional_id
        WHERE dpl.patient_id = ? AND dpl.tenant_id = ?
        ORDER BY dpl.created_at DESC
      `).all(patientId, tenantId);

      res.json(rows);
    } catch (err: any) {
      console.error('[DentistryController.listProsthetics] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar próteses' });
    }
  }

  static saveProsthetic(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const {
        patientId, labName, workType, toothNumber, shadeColor,
        material, sentDate, expectedDate, receivedDate, costValue, status = 'requested', notes
      } = req.body;

      if (!patientId || !labName || !workType) {
        res.status(400).json({ error: 'patientId, labName e workType são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'lab-' + uuidv4().slice(0, 8);

      db.prepare(`
        INSERT INTO dental_prosthetics_lab (
          id, tenant_id, patient_id, professional_id, lab_name,
          work_type, tooth_number, shade_color, material, sent_date,
          expected_date, received_date, cost_value, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, labName,
        workType, toothNumber || null, shadeColor || null, material || null, sentDate || null,
        expectedDate || null, receivedDate || null, Number(costValue || 0), status, notes || null
      );

      res.status(201).json({ id, message: 'Trabalho de prótese registrado com sucesso' });
    } catch (err: any) {
      console.error('[DentistryController.saveProsthetic] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar trabalho de laboratório' });
    }
  }

  static updateProsthetic(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const { status, receivedDate, notes } = req.body;

      db.prepare(`
        UPDATE dental_prosthetics_lab SET
          status = COALESCE(?, status),
          received_date = COALESCE(?, received_date),
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(status || null, receivedDate || null, notes || null, id, tenantId);

      res.json({ message: 'Trabalho de prótese atualizado com sucesso' });
    } catch (err: any) {
      console.error('[DentistryController.updateProsthetic] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar prótese' });
    }
  }

  // =========================================================================
  // 7. ORTODONTIA & HOF
  // =========================================================================

  static getOrtho(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const row = db.prepare(`
        SELECT * FROM dental_orthodontics 
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(patientId, tenantId) as any;

      if (!row) {
        res.json(null);
        return;
      }

      res.json({
        ...row,
        monthly_evolutions: JSON.parse(row.monthly_evolutions_json || '[]')
      });
    } catch (err: any) {
      console.error('[DentistryController.getOrtho] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar dados ortodônticos' });
    }
  }

  static saveOrtho(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const { patientId, applianceType, installationDate, forecastMonths, monthlyEvolutions, status = 'active', notes } = req.body;
      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const existing = db.prepare(`SELECT id FROM dental_orthodontics WHERE patient_id = ? AND tenant_id = ?`).get(patientId, tenantId) as any;
      const evolutionsJson = JSON.stringify(monthlyEvolutions || []);

      if (existing) {
        db.prepare(`
          UPDATE dental_orthodontics SET
            appliance_type = COALESCE(?, appliance_type),
            installation_date = COALESCE(?, installation_date),
            forecast_months = COALESCE(?, forecast_months),
            monthly_evolutions_json = ?,
            status = COALESCE(?, status),
            notes = COALESCE(?, notes),
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(applianceType || null, installationDate || null, forecastMonths || null, evolutionsJson, status, notes || null, existing.id, tenantId);
        res.json({ id: existing.id, message: 'Dados ortodônticos atualizados' });
      } else {
        const id = 'ort-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO dental_orthodontics (
            id, tenant_id, patient_id, professional_id,
            appliance_type, installation_date, forecast_months,
            monthly_evolutions_json, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, tenantId, patientId, profId, applianceType || null, installationDate || null, forecastMonths || null, evolutionsJson, status, notes || null);
        res.status(201).json({ id, message: 'Plano ortodôntico cadastrado' });
      }
    } catch (err: any) {
      console.error('[DentistryController.saveOrtho] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar dados ortodônticos' });
    }
  }

  static listHof(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;

      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const rows = db.prepare(`
        SELECT dh.*, p.name as professional_name
        FROM dental_hof dh
        LEFT JOIN professionals p ON p.id = dh.professional_id
        WHERE dh.patient_id = ? AND dh.tenant_id = ?
        ORDER BY dh.created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => ({
        ...r,
        application_points: JSON.parse(r.application_points_json || '[]'),
        before_after_images: JSON.parse(r.before_after_images_json || '[]')
      })));
    } catch (err: any) {
      console.error('[DentistryController.listHof] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar procedimentos de harmonização facial' });
    }
  }

  static saveHof(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const {
        patientId, procedureName, facialRegion, productBrand, lotNumber,
        unitsQuantity, expiryDate, applicationPoints, beforeAfterImages, notes
      } = req.body;

      if (!patientId || !procedureName) {
        res.status(400).json({ error: 'patientId e procedureName são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'hof-' + uuidv4().slice(0, 8);
      const pointsJson = JSON.stringify(applicationPoints || []);
      const imagesJson = JSON.stringify(beforeAfterImages || []);

      db.prepare(`
        INSERT INTO dental_hof (
          id, tenant_id, patient_id, professional_id, procedure_name,
          facial_region, product_brand, lot_number, units_quantity,
          expiry_date, application_points_json, before_after_images_json, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, procedureName,
        facialRegion || null, productBrand || null, lotNumber || null, unitsQuantity || null,
        expiryDate || null, pointsJson, imagesJson, notes || null
      );

      res.status(201).json({ id, message: 'Procedimento HOF registrado com sucesso' });
    } catch (err: any) {
      console.error('[DentistryController.saveHof] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar HOF' });
    }
  }

  // =========================================================================
  // 8. FINALIZAR ATENDIMENTO ODONTOLÓGICO (INTEGRAÇÃO COM EVOLUÇÃO E PRONTUÁRIO)
  // =========================================================================

  static finishConsultation(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isDentistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito a cirurgiões-dentistas', code: 'DENTISTRY_RESTRICTED' });
        return;
      }

      const {
        patientId, appointmentId, clinicalEvolution, proceduresPerformed,
        odontogramData, toothChanges, isSealed
      } = req.body;

      if (!patientId || !clinicalEvolution) {
        res.status(400).json({ error: 'patientId e clinicalEvolution são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      } else if (req.body.professionalId) {
        profId = req.body.professionalId;
      }

      const creatorName = req.user?.name || req.user?.email || 'Cirurgião-Dentista';
      const recordId = 'rec-odo-' + uuidv4().slice(0, 8);

      const summaryText = `[ZemdaOdonto — Atendimento Odontológico]\n${clinicalEvolution}\nProcedimentos Realizados: ${proceduresPerformed || '-'}`;
      db.prepare(`
        INSERT INTO records (
          id, tenant_id, patient_id, appointment_id, professional_id,
          session_date, title, clinical_evolution, technical_notes, is_sealed, created_by
        ) VALUES (?, ?, ?, ?, ?, date('now'), 'Atendimento Odontológico', ?, ?, ?, ?)
      `).run(
        recordId, tenantId, patientId, appointmentId || null, profId,
        summaryText, proceduresPerformed ? `Procedimentos: ${proceduresPerformed}` : null,
        isSealed ? 1 : 0, creatorName
      );

      if (odontogramData) {
        const statusJson = typeof odontogramData === 'string' ? odontogramData : JSON.stringify(odontogramData);
        const existingOdo = db.prepare('SELECT id FROM odontograms WHERE patient_id = ? AND tenant_id = ? AND type = ?').get(patientId, tenantId, 'current') as any;
        if (existingOdo) {
          db.prepare(`UPDATE odontograms SET status_data_json = ?, updated_at = datetime('now') WHERE id = ?`).run(statusJson, existingOdo.id);
        } else {
          const newOdoId = 'odo-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO odontograms (id, tenant_id, patient_id, professional_id, appointment_id, type, status_data_json)
            VALUES (?, ?, ?, ?, ?, 'current', ?)
          `).run(newOdoId, tenantId, patientId, profId, appointmentId || null, statusJson);
        }
      }

      if (Array.isArray(toothChanges) && toothChanges.length > 0) {
        const insertToothStmt = db.prepare(`
          INSERT INTO dental_tooth_records (
            id, tenant_id, patient_id, professional_id, appointment_id,
            tooth_number, face, condition, previous_condition, procedure_name, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const change of toothChanges) {
          insertToothStmt.run(
            'dtr-' + uuidv4().slice(0, 8), tenantId, patientId, profId, appointmentId || null,
            change.toothNumber, change.face || 'whole', change.condition,
            change.previousCondition || null, change.procedureName || null, change.notes || null
          );
        }
      }

      if (appointmentId) {
        db.prepare(`UPDATE appointments SET status = 'completed', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`).run(appointmentId, tenantId);
      }

      logAudit(req, 'FINISH_DENTAL_CONSULTATION', 'records', recordId, { patientId, appointmentId });
      res.status(201).json({
        recordId,
        message: 'Atendimento Odontológico finalizado e registrado com sucesso no prontuário!'
      });
    } catch (err: any) {
      console.error('[DentistryController.finishConsultation] Erro:', err);
      res.status(500).json({ error: 'Erro ao finalizar atendimento odontológico' });
    }
  }
}
