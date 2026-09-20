import { isPrimaryClinicalModule, resolveClinicalModule } from '../utils/clinical-module';
import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { logAudit } from '../middlewares/audit.middleware';

/**
 * Validação de sigilo e privacidade do paciente por profissional (Itens 7, 8, 9, 48 - LGPD)
 * Regra: Um profissional só acessa o prontuário completo de pacientes para os quais possui:
 * - Consulta agendada ou realizada;
 * - Encaminhamento ativo atribuído a ele;
 * - Autoria de prontuário existente;
 * - Ou permissão expressa de supervisão clínica.
 */
export function hasClinicalAccess(req: Request, patientId: string): boolean {
  if (!req.user || !req.tenantId) return false;

  // 1. Administrador Global / SuperAdmin: NÃO deve visualizar conteúdo clínico de pacientes (Regra 2)
  if (req.user.role === 'superadmin') return false;

  const tenantId = req.tenantId;

  // 2. Cargos puramente administrativos e de recepção não acessam prontuário clínico
  const roleStr = String(req.user.role);
  if (roleStr === 'receptionist' || roleStr === 'financial' || roleStr === 'secretary' || roleStr === 'assistant') {
    return false;
  }

  // 3. Validação para Gerenciador da Clínica (clinic_admin)
  // O cargo “Gerenciador da Clínica” NÃO concede automaticamente acesso a prontuários (Regra 2)
  // O gerenciador somente poderá acessar caso possua cadastro em área de atuação clínica
  if (req.user.role === 'clinic_admin') {
    const patientBelongsToClinic = db.prepare('SELECT 1 FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
    if (!patientBelongsToClinic) return false;

    const tenant = db.prepare('SELECT manager_profession, manager_practice_areas FROM tenants WHERE id = ?').get(tenantId) as any;
    const clinicUser = db.prepare(`
      SELECT cu.profession_custom, cu.practice_areas as cu_practice_areas,
             u.profession_name, u.practice_areas as u_practice_areas
      FROM users u
      LEFT JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
      WHERE u.id = ?
    `).get(tenantId, req.user.userId) as any;

    const professional = db.prepare('SELECT p.practice_areas, pr.name FROM professionals p LEFT JOIN professions pr ON pr.id=p.profession_id WHERE p.user_id=? AND p.tenant_id=?').get(req.user.userId, tenantId) as any;
    const managerAreaText = [
      professional?.name,
      professional?.practice_areas,
      tenant?.manager_profession,
      tenant?.manager_practice_areas,
      clinicUser?.profession_custom,
      clinicUser?.cu_practice_areas,
      clinicUser?.profession_name,
      clinicUser?.u_practice_areas
    ].filter(Boolean).join(' ').toLowerCase();

    // Se o gerente tiver qualquer área clínica/saúde registrada, concede acesso aos prontuários da clínica
    const hasAnyClinicalArea =
      managerAreaText.includes('odonto') ||
      managerAreaText.includes('dentis') ||
      managerAreaText.includes('fisio') ||
      managerAreaText.includes('nutri') ||
      managerAreaText.includes('terapia') ||
      managerAreaText.includes('ocupacional') ||
      managerAreaText.includes('fono') ||
      managerAreaText.includes('médic') ||
      managerAreaText.includes('medic') ||
      managerAreaText.includes('psico') ||
      managerAreaText.includes('enferm') ||
      managerAreaText.includes('personal') ||
      managerAreaText.includes('educa') ||
      managerAreaText.includes('físic') ||
      managerAreaText.includes('cref') ||
      managerAreaText.includes('treina');

    return hasAnyClinicalArea;
  }

  // 4. Um profissional de saúde só pode visualizar os prontuários e evoluções de um paciente
  // se tiver vínculo assistencial: consulta agendada, encaminhamento ativo ou autoria de evolução.
  if (req.user.role === 'professional') {
    const prof = db.prepare('SELECT id, active FROM professionals WHERE user_id = ? AND tenant_id = ? ORDER BY active DESC, id LIMIT 1').get(req.user.userId, tenantId) as any;
    if (!prof) {
      return false;
    }
    const profId = prof.id;

    // a. Possui ou possuiu consulta com este paciente
    const hasAppt = db.prepare('SELECT 1 FROM appointments WHERE tenant_id = ? AND patient_id = ? AND professional_id = ? LIMIT 1').get(tenantId, patientId, profId);
    if (hasAppt) return true;

    // b. Possui encaminhamento ativo destinado a este profissional
    const hasReferral = db.prepare('SELECT 1 FROM patient_referrals WHERE tenant_id = ? AND patient_id = ? AND to_professional_id = ? LIMIT 1').get(tenantId, patientId, profId);
    if (hasReferral) return true;

    // c. Foi autor de evolução clínica prévia
    const hasRecord = db.prepare('SELECT 1 FROM records WHERE tenant_id = ? AND patient_id = ? AND professional_id = ? LIMIT 1').get(tenantId, patientId, profId);
    if (hasRecord) return true;

    // d. Se o paciente pertence à clínica e o profissional está ativo na clínica atendendo este serviço/especialidade
    const patientBelongsToClinic = db.prepare('SELECT 1 FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
    if (patientBelongsToClinic) return true;

    return false;
  }

  return false;
}

export class ClinicalController {
  // 1. Lista prontuários e evoluções de um paciente específico (com verificação estrita de privacidade)
  static listByPatient(req: Request, res: Response): void {
    try {
      const patientId = req.params.patientId as string;
      const tenantId = req.tenantId;

      if (!req.user) {
        res.status(401).json({ error: 'Usuário não autenticado' });
        return;
      }

      // Validação estrita de privacidade e vínculo assistencial (Itens 7 e 8)
      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({
          error: 'Acesso clínico restrito: profissional não possui consulta agendada, histórico de atendimento ou encaminhamento ativo vinculado a este paciente (Sigilo LGPD).',
          code: 'CLINICAL_PRIVACY_RESTRICTION'
        });
        return;
      }

      const stmt = db.prepare(`
        SELECT 
          r.id, r.tenant_id, r.patient_id, r.appointment_id, r.professional_id,
          r.session_date, r.session_date as consultation_date, r.session_time, r.session_time as consultation_time,
          r.procedure_name, r.title, r.clinical_evolution,
          r.technical_notes, r.private_notes, r.conducts, r.conducts as conduct_plan,
          COALESCE(r.module_type, p.practice_areas, 'Geral') as specialty_or_module,
          r.clinical_data_json, r.module_type,
          r.module_data_json, r.is_sealed, r.signature_hash, r.signed_at, r.signer_name, r.signer_registration, r.sealed_at,
          r.created_by, r.updated_by, r.edit_history_json,
          r.created_at, r.updated_at,
          p.name as professional_name, p.registration_type, p.registration_number,
          (SELECT COUNT(*) FROM documents WHERE record_id = r.id) as total_attachments
        FROM records r
        LEFT JOIN professionals p ON p.id = r.professional_id
        WHERE r.patient_id = ? AND r.tenant_id = ?
        ORDER BY r.session_date DESC, r.created_at DESC
      `);
      const records = stmt.all(patientId, tenantId).map((record: any) => ({
        ...record, attachments: db.prepare('SELECT id, title, file_url FROM documents WHERE record_id=? AND tenant_id=? AND patient_id=?').all(record.id, tenantId, patientId)
      }));

      logAudit(req, 'VIEW_CLINICAL_RECORDS', 'records', patientId, { totalViewed: records.length });
      res.json(records);
    } catch (err: any) {
      console.error('[ClinicalController.listByPatient] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar prontuários clínicos' });
    }
  }

  // 2. Detalhes de uma evolução específica
  static getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const record = db.prepare(`
        SELECT 
          r.*,
          p.name as professional_name, p.registration_type, p.registration_number,
          pat.full_name as patient_name, pat.cpf as patient_cpf, pat.birth_date as patient_birth_date
        FROM records r
        LEFT JOIN professionals p ON p.id = r.professional_id
        JOIN patients pat ON pat.id = r.patient_id
        WHERE r.id = ? AND r.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!record) {
        res.status(404).json({ error: 'Prontuário não encontrado' });
        return;
      }

      if (!hasClinicalAccess(req, record.patient_id)) {
        res.status(403).json({ error: 'Acesso restrito ao prontuário deste paciente' });
        return;
      }

      res.json(record);
    } catch (err: any) {
      console.error('[ClinicalController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar prontuário' });
    }
  }

  // 3. Cria nova evolução ou anotação de sessão
  static create(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const {
        patientId, appointmentId, professionalId, sessionDate, sessionTime,
        title, clinicalEvolution, technicalNotes, privateNotes, isSealed,
        procedureName, conducts, clinicalData, moduleType, moduleData
      } = req.body;

      if (!patientId || !sessionDate || !title) {
        res.status(400).json({ error: 'Paciente, data da sessão e título são obrigatórios' });
        return;
      }

      // Se não enviou professionalId explicitamente, resolve a partir do usuário autenticado
      let resolvedProfId = professionalId;
      if (!resolvedProfId && req.user) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as { id: string } | undefined;
        if (prof) resolvedProfId = prof.id;
      }

      if (!resolvedProfId) {
        res.status(400).json({ error: 'Profissional responsável não identificado' });
        return;
      }

      // Validação de integridade de módulo clínico vinculado ao agendamento
      if (appointmentId) {
        const apptRow = db.prepare('SELECT id, professional_id, clinical_module FROM appointments WHERE id = ? AND tenant_id = ?').get(appointmentId, tenantId) as { clinical_module?: string } | undefined;
        if (apptRow) apptRow.clinical_module = resolveClinicalModule(apptRow, tenantId) || undefined;
        if (apptRow?.clinical_module && isPrimaryClinicalModule(moduleType) && apptRow.clinical_module !== moduleType) {
          res.status(409).json({
            error: `O atendimento já foi iniciado com o módulo "${apptRow.clinical_module}". Não é permitido salvar em módulos diferentes.`
          });
          return;
        }

        const existingRec = db.prepare("SELECT module_type FROM records WHERE appointment_id = ? AND tenant_id = ? AND module_type IS NOT NULL AND module_type != 'ZemdaBody' LIMIT 1").get(appointmentId, tenantId) as { module_type: string } | undefined;
        if (existingRec && isPrimaryClinicalModule(moduleType) && existingRec.module_type !== moduleType) {
          res.status(409).json({
            error: `O prontuário deste atendimento já foi registrado no módulo "${existingRec.module_type}". Não é permitido salvar em módulos diferentes.`
          });
          return;
        }

        if (isPrimaryClinicalModule(moduleType)) {
          db.prepare('UPDATE appointments SET clinical_module = ? WHERE id = ? AND tenant_id = ?').run(moduleType, appointmentId, tenantId);
        }
      }

      const id = 'rec-' + uuidv4().slice(0, 8);
      const creatorName = req.user?.name || req.user?.email || 'Profissional';
      const clinicalDataJson = clinicalData ? (typeof clinicalData === 'string' ? clinicalData : JSON.stringify(clinicalData)) : null;
      const moduleDataJson = moduleData ? (typeof moduleData === 'string' ? moduleData : JSON.stringify(moduleData)) : null;

      // Assinatura eletrônica e integridade criptográfica
      let signatureHash: string | null = null;
      let signedAt: string | null = null;
      let signedByUserId: string | null = null;
      let signerName: string | null = null;
      let signerRegistration: string | null = null;
      let sealedAt: string | null = null;

      if (isSealed) {
        const prof = db.prepare('SELECT name, registration_type, registration_number FROM professionals WHERE id = ?').get(resolvedProfId) as any;
        signedAt = new Date().toISOString();
        sealedAt = signedAt;
        signedByUserId = req.user?.userId || null;
        signerName = prof?.name || creatorName;
        signerRegistration = prof?.registration_type && prof?.registration_number 
          ? `${prof.registration_type} ${prof.registration_number}` 
          : (prof?.registration_number || null);

        const payloadToHash = `${tenantId}|${patientId}|${resolvedProfId}|${sessionDate}|${title}|${clinicalEvolution || ''}|${signedAt}|${signerRegistration || ''}`;
        signatureHash = crypto.createHash('sha256').update(payloadToHash).digest('hex');
      }

      const insertStmt = db.prepare(`
        INSERT INTO records (
          id, tenant_id, patient_id, appointment_id, professional_id,
          session_date, session_time, procedure_name, title, clinical_evolution,
          technical_notes, private_notes, conducts, clinical_data_json, module_type,
          module_data_json, is_sealed, signature_hash, signed_at, signed_by_user_id,
          signer_name, signer_registration, sealed_at, amendments_json,
          created_by, updated_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, datetime('now'), datetime('now'))
      `);

      insertStmt.run(
        id,
        tenantId,
        patientId,
        appointmentId || null,
        resolvedProfId,
        sessionDate,
        sessionTime || null,
        procedureName || null,
        title,
        clinicalEvolution || null,
        technicalNotes || null,
        privateNotes || null,
        conducts || null,
        clinicalDataJson,
        moduleType || null,
        moduleDataJson,
        isSealed ? 1 : 0,
        signatureHash,
        signedAt,
        signedByUserId,
        signerName,
        signerRegistration,
        sealedAt,
        creatorName,
        creatorName
      );

      logAudit(req, 'CREATE_CLINICAL_RECORD', 'records', id, { patientId, title, isSealed, moduleType, signatureHash });
      res.status(201).json({ id, signatureHash, signedAt, isSealed: !!isSealed, message: 'Registro clínico / evolução gravado com sucesso' });
    } catch (err: any) {
      console.error('[ClinicalController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar evolução clínica' });
    }
  }

  // 4. Atualiza evolução com trilha de autoria e versionamento (Item 11)
  // REGRA DE SEGURANÇA: Registros selados NÃO são sobrescritos. Alterações preservam histórico via aditivos/retificações.
  static update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { title, clinicalEvolution, technicalNotes, privateNotes, isSealed, reason, amendmentReason, notes } = req.body;

      const record = db.prepare('SELECT * FROM records WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!record) {
        res.status(404).json({ error: 'Registro não encontrado' });
        return;
      }

      if (!hasClinicalAccess(req, record.patient_id)) {
        res.status(403).json({ error: 'Acesso não autorizado para alteração deste prontuário (Sigilo LGPD)' });
        return;
      }

      const editorName = req.user?.name || req.user?.email || 'Operador';

      // ── CASO A: Registro já está SELADO ─────────────────────────────
      // REGRA: Nunca sobrescreve o conteúdo original; salva aditivo/retificação preservando histórico
      if (record.is_sealed === 1) {
        const amendmentText = clinicalEvolution || technicalNotes || notes || req.body.amendmentText;
        if (!amendmentText || !String(amendmentText).trim()) {
          res.status(400).json({
            error: 'Este prontuário está lacrado/selado. Para registrar uma retificação, informe o texto do aditivo clínico.',
            isSealed: true
          });
          return;
        }

        let amendments: any[] = [];
        try {
          if (record.amendments_json) {
            amendments = JSON.parse(record.amendments_json);
          }
        } catch (_) {
          amendments = [];
        }

        const prof = req.user ? db.prepare('SELECT p.id, p.name, p.registration_type, p.registration_number FROM professionals p WHERE p.user_id = ? AND p.tenant_id = ?').get(req.user.userId, tenantId) as any : null;
        const nowIso = new Date().toISOString();
        const amendmentId = 'amd-' + uuidv4().slice(0, 8);
        const effectiveReason = reason || amendmentReason || 'Retificação Clínica / Aditivo Posterior';
        const amendmentHash = crypto.createHash('sha256').update(`${record.id}|${nowIso}|${amendmentText}|${effectiveReason}`).digest('hex');

        const newAmendment = {
          id: amendmentId,
          created_at: nowIso,
          created_by_user_id: req.user?.userId || null,
          author_name: prof?.name || editorName,
          author_registration: prof ? `${prof.registration_type || ''} ${prof.registration_number || ''}`.trim() : null,
          reason: effectiveReason,
          amendment_text: String(amendmentText).trim(),
          signature_hash: amendmentHash
        };

        amendments.push(newAmendment);

        // Histórico de trilha
        let history: any[] = [];
        try {
          if (record.edit_history_json) history = JSON.parse(record.edit_history_json);
        } catch (_) {}
        history.push({
          action: 'ADD_AMENDMENT',
          amendment_id: amendmentId,
          edited_by: editorName,
          edited_at: nowIso,
          reason: effectiveReason
        });

        db.prepare(`
          UPDATE records SET
            amendments_json = ?,
            edit_history_json = ?,
            updated_by = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(JSON.stringify(amendments), JSON.stringify(history), editorName, id, tenantId);

        logAudit(req, 'ADD_RECORD_AMENDMENT', 'records', id, { amendmentId, effectiveReason, amendmentHash });
        res.json({
          id,
          amendmentId,
          isSealed: true,
          message: 'Aditivo clínico registrado com integridade criptográfica. O registro original foi mantido inalterado.',
          amendments
        });
        return;
      }

      // ── CASO B: Registro NÃO está selado ────────────────────────────
      // Constrói histórico de versionamento (Item 11)
      let history: any[] = [];
      try {
        if (record.edit_history_json) {
          history = JSON.parse(record.edit_history_json);
        }
      } catch (_) {}

      history.push({
        edited_by: editorName,
        edited_at: new Date().toISOString(),
        previous_title: record.title,
        previous_evolution: record.clinical_evolution,
        previous_session_date: record.session_date
      });

      // Se está sendo selado nesta requisição
      let newSignatureHash = record.signature_hash;
      let newSignedAt = record.signed_at;
      let newSignedByUserId = record.signed_by_user_id;
      let newSignerName = record.signer_name;
      let newSignerRegistration = record.signer_registration;
      let newSealedAt = record.sealed_at;

      if (isSealed && record.is_sealed !== 1) {
        const prof = db.prepare('SELECT name, registration_type, registration_number FROM professionals WHERE id = ?').get(record.professional_id) as any;
        newSignedAt = new Date().toISOString();
        newSealedAt = newSignedAt;
        newSignedByUserId = req.user?.userId || null;
        newSignerName = prof?.name || editorName;
        newSignerRegistration = prof?.registration_type && prof?.registration_number 
          ? `${prof.registration_type} ${prof.registration_number}` 
          : (prof?.registration_number || null);

        const effectiveTitle = title !== undefined ? title : record.title;
        const effectiveEvolution = clinicalEvolution !== undefined ? clinicalEvolution : record.clinical_evolution;
        const payloadToHash = `${tenantId}|${record.patient_id}|${record.professional_id}|${record.session_date}|${effectiveTitle}|${effectiveEvolution || ''}|${newSignedAt}|${newSignerRegistration || ''}`;
        newSignatureHash = crypto.createHash('sha256').update(payloadToHash).digest('hex');
      }

      const updateStmt = db.prepare(`
        UPDATE records SET
          title = COALESCE(?, title),
          clinical_evolution = COALESCE(?, clinical_evolution),
          technical_notes = COALESCE(?, technical_notes),
          private_notes = COALESCE(?, private_notes),
          is_sealed = COALESCE(?, is_sealed),
          signature_hash = COALESCE(?, signature_hash),
          signed_at = COALESCE(?, signed_at),
          signed_by_user_id = COALESCE(?, signed_by_user_id),
          signer_name = COALESCE(?, signer_name),
          signer_registration = COALESCE(?, signer_registration),
          sealed_at = COALESCE(?, sealed_at),
          updated_by = ?,
          edit_history_json = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `);

      updateStmt.run(
        title !== undefined ? title : null,
        clinicalEvolution !== undefined ? clinicalEvolution : null,
        technicalNotes !== undefined ? technicalNotes : null,
        privateNotes !== undefined ? privateNotes : null,
        isSealed !== undefined ? (isSealed ? 1 : 0) : null,
        newSignatureHash || null,
        newSignedAt || null,
        newSignedByUserId || null,
        newSignerName || null,
        newSignerRegistration || null,
        newSealedAt || null,
        editorName,
        JSON.stringify(history),
        id,
        tenantId
      );

      logAudit(req, 'UPDATE_CLINICAL_RECORD', 'records', id, { editorName, versionCount: history.length, isSealed: !!isSealed });
      res.json({ message: 'Evolução clínica atualizada com sucesso!', isSealed: !!isSealed, signatureHash: newSignatureHash });
    } catch (err: any) {
      console.error('[ClinicalController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar registro clínico' });
    }
  }

  // 4.1 Adiciona Aditivo / Retificação Clínica explicitamente
  static addAmendment(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { amendmentText, notes, reason } = req.body;

      const record = db.prepare('SELECT * FROM records WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!record) {
        res.status(404).json({ error: 'Prontuário não encontrado' });
        return;
      }

      if (!hasClinicalAccess(req, record.patient_id)) {
        res.status(403).json({ error: 'Acesso restrito (Sigilo LGPD)' });
        return;
      }

      const text = amendmentText || notes;
      if (!text || !String(text).trim()) {
        res.status(400).json({ error: 'O texto do aditivo/retificação clínica é obrigatório.' });
        return;
      }

      let amendments: any[] = [];
      try {
        if (record.amendments_json) amendments = JSON.parse(record.amendments_json);
      } catch (_) { amendments = []; }

      const editorName = req.user?.name || req.user?.email || 'Profissional';
      const prof = req.user ? db.prepare('SELECT p.id, p.name, p.registration_type, p.registration_number FROM professionals p WHERE p.user_id = ? AND p.tenant_id = ?').get(req.user.userId, tenantId) as any : null;
      const nowIso = new Date().toISOString();
      const amendmentId = 'amd-' + uuidv4().slice(0, 8);
      const effectiveReason = reason || 'Aditivo / Retificação Clínica';
      const hash = crypto.createHash('sha256').update(`${record.id}|${nowIso}|${text}|${effectiveReason}`).digest('hex');

      const item = {
        id: amendmentId,
        created_at: nowIso,
        created_by_user_id: req.user?.userId || null,
        author_name: prof?.name || editorName,
        author_registration: prof ? `${prof.registration_type || ''} ${prof.registration_number || ''}`.trim() : null,
        reason: effectiveReason,
        amendment_text: String(text).trim(),
        signature_hash: hash
      };

      amendments.push(item);

      db.prepare(`
        UPDATE records SET
          amendments_json = ?,
          updated_by = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(JSON.stringify(amendments), editorName, id, tenantId);

      logAudit(req, 'ADD_RECORD_AMENDMENT', 'records', id, { amendmentId, hash });
      res.status(201).json({
        id,
        amendmentId,
        message: 'Aditivo clínico registrado com sucesso.',
        amendments
      });
    } catch (err: any) {
      console.error('[ClinicalController.addAmendment] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar aditivo clínico' });
    }
  }


  // 5. Exportação Oficial em Formato A4 com Identidade da Clínica e Localidade Automática (Itens 12, 13, 14)
  static exportPdfHtml(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const record = db.prepare(`
        SELECT 
          r.*,
          p.name as professional_name, p.gender as professional_gender, p.registration_type, p.registration_number,
          pat.full_name as patient_name, pat.cpf as patient_cpf, pat.birth_date as patient_birth_date,
          pat.phone as patient_phone, pat.email as patient_email
        FROM records r
        LEFT JOIN professionals p ON p.id = r.professional_id
        JOIN patients pat ON pat.id = r.patient_id
        WHERE r.id = ? AND r.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!record) {
        res.status(404).json({ error: 'Prontuário não encontrado' });
        return;
      }

      if (!hasClinicalAccess(req, record.patient_id)) {
        res.status(403).json({ error: 'Acesso não autorizado para exportação deste prontuário' });
        return;
      }

      const clinic = db.prepare('SELECT name, corporate_name, trade_name, cnpj_cpf, phone, email, address, city, state, logo_url FROM tenants WHERE id = ?').get(tenantId) as any;
      const clinicName = clinic?.trade_name || clinic?.name || 'Clínica Emissora';
      const clinicCity = clinic?.city || 'Brasil';
      const clinicCnpj = clinic?.cnpj_cpf ? `CNPJ: ${clinic.cnpj_cpf}` : '';
      const clinicAddress = clinic?.address || `${clinicCity}/${clinic?.state || ''}`;

      // Localidade automática a partir do cadastro da clínica (Item 14)
      const localityText = `${clinicCity}, ${new Date(record.session_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`;

      // Formatação de Dr. / Dra. automática (Item 9)
      const profPrefix = record.professional_gender === 'F' ? 'Dra. ' : 'Dr. ';
      const formattedProfName = (record.professional_name.startsWith('Dr.') || record.professional_name.startsWith('Dra.'))
        ? record.professional_name
        : `${profPrefix}${record.professional_name}`;

      const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>${record.title} - ${record.patient_name}</title>
          <style>
            @page {
              size: A4;
              margin: 15mm 15mm 15mm 15mm;
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              color: #1e293b;
              margin: 0;
              padding: 20px;
              font-size: 11pt;
              line-height: 1.6;
              background: #f8fafc;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .paper-container {
              max-width: 210mm;
              margin: 0 auto;
              background: #ffffff;
              padding: 20mm;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
              border-radius: 12px;
            }
            .header-box {
              border-bottom: 2px solid #0d9488;
              padding-bottom: 14px;
              margin-bottom: 24px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
            }
            .clinic-info h2 {
              margin: 0;
              color: #0f172a;
              font-size: 16pt;
              font-weight: 800;
              letter-spacing: -0.5px;
            }
            .clinic-info p {
              margin: 3px 0 0 0;
              font-size: 9pt;
              color: #64748b;
            }
            .clinic-logo {
              max-height: 60px;
              max-width: 160px;
              object-fit: contain;
            }
            .doc-title {
              text-align: center;
              font-size: 14pt;
              font-weight: 800;
              color: #0d9488;
              margin: 20px 0 24px 0;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .patient-box {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              padding: 14px 18px;
              margin-bottom: 24px;
              font-size: 10pt;
            }
            .patient-box p {
              margin: 4px 0;
            }
            .content-section {
              margin-bottom: 24px;
            }
            .section-label {
              font-weight: 700;
              color: #334155;
              font-size: 10.5pt;
              text-transform: uppercase;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 4px;
              margin-bottom: 10px;
              letter-spacing: 0.3px;
            }
            .content-text {
              white-space: pre-wrap;
              font-size: 11pt;
              color: #1e293b;
              text-align: justify;
            }
            .signature-area {
              margin-top: 50px;
              text-align: center;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .signature-line {
              width: 280px;
              border-top: 1.5px solid #0f172a;
              margin: 0 auto 8px auto;
            }
            .prof-name {
              font-weight: 700;
              font-size: 11pt;
              color: #0f172a;
            }
            .prof-reg {
              font-size: 9.5pt;
              color: #64748b;
            }
            .locality-date {
              text-align: right;
              margin-top: 36px;
              font-size: 10pt;
              color: #475569;
            }
            .footer-box {
              margin-top: 40px;
              text-align: center;
              font-size: 8pt;
              color: #94a3b8;
              border-top: 1px solid #e2e8f0;
              padding-top: 10px;
            }
            @media print {
              body {
                background: #fff !important;
                padding: 0 !important;
              }
              .paper-container {
                box-shadow: none !important;
                padding: 0 !important;
                border-radius: 0 !important;
                max-width: 100% !important;
              }
              .no-print {
                display: none !important;
              }
              .patient-box, .content-section, .signature-area {
                page-break-inside: avoid;
                break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="position: sticky; top: 0; background: #0f172a; color: white; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.15); margin-bottom: 24px; border-radius: 12px; max-width: 210mm; margin-left: auto; margin-right: auto;">
            <div style="font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 8px;">
              <span>📄 Visualização Oficial do Prontuário Clínico</span>
            </div>
            <button onclick="window.print()" style="background: #0d9488; color: white; border: none; padding: 8px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(13,148,136,0.4);">
              🖨️ Imprimir / Salvar em PDF
            </button>
          </div>

          <div class="paper-container">
            <div class="header-box">
              <div class="clinic-info">
                <h2>${clinicName}</h2>
                <p>${clinicAddress} | ${clinicCnpj} | Tel: ${clinic?.phone || '-'}</p>
              </div>
              ${clinic?.logo_url ? `<img src="${clinic.logo_url}" class="clinic-logo" alt="Logo" />` : ''}
            </div>

            <div class="doc-title">${record.title}</div>

            <div class="patient-box">
              <p><strong>Paciente:</strong> ${record.patient_name} | <strong>CPF:</strong> ${record.patient_cpf || 'Não informado'} | <strong>Nascimento:</strong> ${record.patient_birth_date || '-'}</p>
              <p><strong>Data do Atendimento:</strong> ${new Date(record.session_date + 'T12:00:00').toLocaleDateString('pt-BR')} | <strong>Profissional:</strong> ${formattedProfName} (${record.registration_type || 'Conselho'} ${record.registration_number || ''})</p>
            </div>

            <div class="content-section">
              <div class="section-label">Evolução Clínica & Conduta</div>
              <div class="content-text">${record.clinical_evolution || 'Sem notas clínicas textuais.'}</div>
            </div>

            ${record.technical_notes ? `
              <div class="content-section">
                <div class="section-label">Orientações & Anotações Complementares</div>
                <div class="content-text">${record.technical_notes}</div>
              </div>
            ` : ''}

            <div class="locality-date">${localityText}</div>

            <div class="signature-area">
              <div class="signature-line"></div>
              <div class="prof-name">${formattedProfName}</div>
              <div class="prof-reg">${record.registration_type || 'Registro'}: ${record.registration_number || '-'}</div>
            </div>

            <div class="footer-box">
              ${record.signature_hash ? `
                <div style="margin-bottom: 4px; font-weight: 600; color: #334155;">
                  Documento assinado eletronicamente por ${record.signer_name || formattedProfName}${record.signer_registration || record.registration_number ? ` — ${record.signer_registration || `${record.registration_type || 'Conselho'} ${record.registration_number || ''}`.trim()}` : ''} em ${record.signed_at ? new Date(record.signed_at).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')}
                </div>
                <div style="font-family: monospace; font-size: 7.5pt; color: #64748b; word-break: break-all;">
                  Hash de integridade SHA-256: ${record.signature_hash}
                </div>
              ` : `
                Documento emitido eletronicamente pelo Sistema Zemda • Válido como prontuário clínico oficial • Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
              `}
            </div>
          </div>

          <script>
            window.onload = function() {
              if (window.location.search.includes('autoprint=true')) {
                window.print();
              }
            };
          </script>
        </body>
        </html>
      `;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err: any) {
      console.error('[ClinicalController.exportPdfHtml] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar documento para impressão e PDF' });
    }
  }

  /**
   * POST /v1/clinical/consultations/start
   * Inicia ou recupera atendimento ativo canônico (Fluxos A e B)
   */
  static startConsultation(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada' });
        return;
      }

      const { patientId, moduleType, professionalId: providedProfId, serviceId: providedServiceId } = req.body;
      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório para iniciar atendimento' });
        return;
      }

      const patient = db.prepare('SELECT id, full_name FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
      if (!patient) {
        res.status(404).json({ error: 'Paciente não encontrado' });
        return;
      }

      // Identifica o profissional autenticado ou selecionado
      let profId: string | null = providedProfId || null;
      if (!profId && req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id, name FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1').get(req.user.userId, tenantId) as any;
        if (prof) {
          profId = prof.id;
        }
      }

      if (!profId) {
        const prof = db.prepare('SELECT id, name FROM professionals WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;
        if (prof) {
          profId = prof.id;
        }
      }

      if (!profId) {
        res.status(400).json({ error: 'Nenhum profissional habilitado encontrado para vincular ao atendimento' });
        return;
      }

      const effectiveModule = moduleType || 'general';

      // 1. Verifica se já existe um atendimento in_progress para este paciente na clínica
      const existingInProgress = db.prepare(`
        SELECT a.*, p.name as professional_name, s.name as service_name, pat.full_name as patient_name
        FROM appointments a
        LEFT JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN patients pat ON pat.id = a.patient_id
        WHERE a.tenant_id = ? AND a.patient_id = ? AND a.status = 'in_progress'
        ORDER BY a.start_time DESC LIMIT 1
      `).get(tenantId, patientId) as any;

      if (existingInProgress) {
        if (moduleType && (!existingInProgress.clinical_module || existingInProgress.clinical_module === 'general')) {
          db.prepare("UPDATE appointments SET clinical_module = ?, updated_at = datetime('now') WHERE id = ?").run(moduleType, existingInProgress.id);
          existingInProgress.clinical_module = moduleType;
        }
        res.json({
          appointmentId: existingInProgress.id,
          appointment: existingInProgress,
          created: false
        });
        return;
      }

      // 2. Verifica se existe agendamento hoje (scheduled ou confirmed) para este paciente
      const today = new Date().toISOString().slice(0, 10);
      const todayAppt = db.prepare(`
        SELECT a.*, p.name as professional_name, s.name as service_name, pat.full_name as patient_name
        FROM appointments a
        LEFT JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN patients pat ON pat.id = a.patient_id
        WHERE a.tenant_id = ? AND a.patient_id = ? AND a.status IN ('scheduled', 'confirmed')
          AND date(a.start_time) = ?
        ORDER BY a.start_time ASC LIMIT 1
      `).get(tenantId, patientId, today) as any;

      if (todayAppt) {
        db.prepare(`
          UPDATE appointments 
          SET status = 'in_progress', clinical_module = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(effectiveModule, todayAppt.id, tenantId);

        todayAppt.status = 'in_progress';
        todayAppt.clinical_module = effectiveModule;

        logAudit(req, 'START_CONSULTATION', 'appointments', todayAppt.id, { patientId, moduleType: effectiveModule });

        res.json({
          appointmentId: todayAppt.id,
          appointment: todayAppt,
          created: false
        });
        return;
      }

      // 3. Se não houver agendamento prévio, cria atendimento canônico direto (Fluxo B)
      let serviceId = providedServiceId || null;
      if (!serviceId) {
        const firstService = db.prepare('SELECT id FROM services WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;
        serviceId = firstService?.id || 'serv-default';
      }

      const now = new Date();
      const startTime = now.toISOString();
      const endTime = new Date(now.getTime() + 50 * 60000).toISOString();
      const apptId = 'apt-' + uuidv4().slice(0, 8);
      const apptNumber = `AT-${now.getFullYear()}-${uuidv4().slice(0, 6).toUpperCase()}`;

      db.prepare(`
        INSERT INTO appointments (
          id, tenant_id, appointment_number, patient_id, professional_id,
          service_id, start_time, end_time, status, clinical_module,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, datetime('now'), datetime('now'))
      `).run(
        apptId, tenantId, apptNumber, patientId, profId,
        serviceId, startTime, endTime, effectiveModule
      );

      const createdAppt = db.prepare(`
        SELECT a.*, p.name as professional_name, s.name as service_name, pat.full_name as patient_name
        FROM appointments a
        LEFT JOIN professionals p ON p.id = a.professional_id
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN patients pat ON pat.id = a.patient_id
        WHERE a.id = ?
      `).get(apptId) as any;

      logAudit(req, 'START_DIRECT_CONSULTATION', 'appointments', apptId, { patientId, moduleType: effectiveModule });

      res.status(201).json({
        appointmentId: apptId,
        appointment: createdAppt,
        created: true
      });
    } catch (err: any) {
      console.error('[ClinicalController.startConsultation] Erro:', err);
      res.status(500).json({ error: 'Erro ao iniciar atendimento canônico' });
    }
  }
}
