import { resolveClinicalModule } from '../utils/clinical-module';
import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';
import { isNutritionistOrClinicManager } from './nutrition.controller';
import { isOccupationalTherapistOrClinicManager } from './occupational-therapy.controller';
import { isSpeechTherapistOrClinicManager } from './speech-therapy.controller';
import { isDentistOrClinicManager } from './dentistry.controller';
import { isPhysiotherapistOrClinicManager } from './physiotherapy.controller';
import { hasPsychopedagogyAccess } from './psychopedagogy.controller';
import { hasPsychologyAccess } from './psychology.controller';

export class DocumentsController {
  static consultationStatus(req: Request, res: Response): void {
    const appt = db.prepare('SELECT * FROM appointments WHERE id=? AND tenant_id=?').get(req.params.id, req.tenantId) as any;
    if (!appt) { res.status(404).json({ error: 'Agendamento não encontrado.' }); return; }
    if (!req.user || !hasClinicalAccess(req, appt.patient_id) ||
        (req.user.role === 'professional' && !db.prepare('SELECT id FROM professionals WHERE id=? AND user_id=? AND tenant_id=? AND active=1').get(appt.professional_id, req.user.userId, req.tenantId))) {
      res.status(403).json({ error: 'Sem permissão para este atendimento.' }); return;
    }
    const saved = db.prepare('SELECT * FROM consultation_completions WHERE appointment_id=? AND tenant_id=?').get(appt.id, req.tenantId) as any;
    const payment = db.prepare("SELECT amount, payment_method, status, notes FROM payments WHERE appointment_id=? AND tenant_id=? AND status NOT IN ('cancelled','refunded') ORDER BY created_at LIMIT 1").get(appt.id, req.tenantId);

    const prof = db.prepare(`
      SELECT p.id, p.profession_id, p.practice_areas, pr.name as profession_name, pr.slug as profession_slug, s.name as service_name
      FROM professionals p
      LEFT JOIN professions pr ON pr.id = p.profession_id
      LEFT JOIN services s ON s.id = ?
      WHERE p.id = ? AND p.tenant_id = ?
    `).get(appt.service_id, appt.professional_id, req.tenantId) as any;

    let moduleType = resolveClinicalModule(appt, req.tenantId);
    if (!moduleType) {
      const existingRec = db.prepare("SELECT module_type FROM records WHERE appointment_id=? AND tenant_id=? AND module_type IS NOT NULL AND module_type != 'ZemdaBody' AND module_type != 'general' LIMIT 1").get(appt.id, req.tenantId) as { module_type?: string } | undefined;
      if (existingRec?.module_type) {
        moduleType = existingRec.module_type;
      }
    }
    if (!moduleType) {
      const text = [prof?.profession_id, prof?.profession_slug, prof?.profession_name, prof?.practice_areas, prof?.service_name].filter(Boolean).join(' ').toLowerCase();
      if (
        prof?.profession_id === 'prof-psicopedagogo' ||
        prof?.profession_id === 'prof-psicopedagogia' ||
        prof?.profession_slug === 'psicopedagogo' ||
        prof?.profession_slug === 'psicopedagogia' ||
        text.includes('psicopedag') ||
        text.includes('abpp')
      ) moduleType = 'ZemdaPP';
      else if (text.includes('fono') || text.includes('crfa')) moduleType = 'ZemdaFono';
      else if (text.includes('nutri') || text.includes('crn') || text.includes('diet')) moduleType = 'ZemdaNutri';
      else if (text.includes('ocupacional') || text.includes('terapia-ocupacional')) moduleType = 'ZemdaTO';
      else if (text.includes('odonto') || text.includes('dentis') || text.includes('cro')) moduleType = 'ZemdaOdonto';
      else if (text.includes('fisio') || text.includes('crefito') || text.includes('physio')) moduleType = 'ZemdaFisio';
      else if (text.includes('psicolog') || text.includes('psicólog') || text.includes('crp') || Number(prof?.zemda_psico_enabled) === 1) moduleType = 'ZemdaPsico';
      else moduleType = 'general';
    }

    res.json({ awaitingPayment: !!saved && !saved.completed_at && appt.status !== 'completed', alreadyCompleted: appt.status === 'completed', generatedDocs: saved ? JSON.parse(saved.generated_docs_json) : {}, payment, moduleType });
  }
  // 1. ATESTADOS
  static createCertificate(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { patientId, appointmentId, professionalId, certificateType, daysOff, startDate, cidCode, notes } = req.body;

      if (!patientId || !certificateType) {
        res.status(400).json({ error: 'Paciente e tipo de atestado são obrigatórios' });
        return;
      }

      let resolvedProfId = professionalId;
      if (!resolvedProfId && req.user) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ?').get(req.user.userId) as { id: string } | undefined;
        if (prof) resolvedProfId = prof.id;
      }
      if (!resolvedProfId) {
        const defaultProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as { id: string } | undefined;
        if (defaultProf) resolvedProfId = defaultProf.id;
      }

      if (!resolvedProfId) {
        res.status(400).json({ error: 'Profissional emissor não identificado' });
        return;
      }

      const year = new Date().getFullYear();
      const countRow = db.prepare('SELECT COUNT(*) as c FROM clinical_certificates WHERE tenant_id = ?').get(tenantId) as any;
      const certNumber = `AT-${year}-${String((countRow?.c || 0) + 1).padStart(4, '0')}`;
      const id = 'crt-' + uuidv4().slice(0, 8);
      const textSummary = notes || `Atestado de ${certificateType === 'rest' ? 'repouso' : 'comparecimento'} (${daysOff || 1} dias).`;

      const profRow = db.prepare('SELECT name, registration_type, registration_number FROM professionals WHERE id = ?').get(resolvedProfId) as any;
      const signedByName = profRow?.name || req.user?.name || req.user?.email || 'Profissional';
      const signedByRegistration = profRow?.registration_type && profRow?.registration_number
        ? `${profRow.registration_type} ${profRow.registration_number}`
        : (profRow?.registration_number || null);
      const signedAt = new Date().toISOString();

      const hashPayload = [
        id,
        tenantId,
        patientId,
        certNumber,
        certificateType,
        daysOff || 1,
        startDate || '',
        cidCode || '',
        textSummary,
        signedByName,
        signedByRegistration || '',
        signedAt
      ].join('|');
      const signatureHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

      db.prepare(`
        INSERT INTO clinical_certificates (
          id, tenant_id, patient_id, appointment_id, professional_id,
          certificate_number, days_rest, cid, content_text,
          certificate_type, days_off, start_date, cid_code, notes,
          signature_hash, signed_at, signed_by_name, signed_by_registration, is_sealed,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        id, tenantId, patientId, appointmentId || null, resolvedProfId,
        certNumber, daysOff || 1, cidCode || null, textSummary,
        certificateType, daysOff || 1, startDate || null, cidCode || null, notes || null,
        signatureHash, signedAt, signedByName, signedByRegistration,
        req.user?.name || req.user?.email || 'Profissional'
      );

      logAudit(req, 'CREATE_CERTIFICATE', 'clinical_certificates', id, { patientId, certificateType, signatureHash });
      res.status(201).json({
        id,
        certNumber,
        signatureHash,
        signedAt,
        signedByName,
        signedByRegistration,
        isSealed: true,
        message: 'Atestado emitido com sucesso'
      });
    } catch (err: any) {
      console.error('[DocumentsController.createCertificate] Erro:', err);
      res.status(500).json({ error: 'Erro ao emitir atestado' });
    }
  }

  static getCertificate(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const cert = db.prepare(`
        SELECT 
          c.*,
          p.full_name as patient_name, p.cpf as patient_cpf, p.birth_date as patient_birth,
          pr.name as professional_name, pr.registration_type, pr.registration_number, pr.gender as professional_gender,
          COALESCE(spec.name, pr.practice_areas, 'Profissional de Saúde') as specialty,
          t.name as clinic_name, t.cnpj_cpf as clinic_cnpj, t.phone as clinic_phone, t.email as clinic_email,
          t.street, t.number, t.neighborhood, t.city, t.city as clinic_city, t.state, t.state as clinic_state, t.address, t.logo_url
        FROM clinical_certificates c
        JOIN patients p ON p.id = c.patient_id
        JOIN professionals pr ON pr.id = c.professional_id
        LEFT JOIN specialties spec ON spec.id = pr.specialty_id
        JOIN tenants t ON t.id = c.tenant_id
        WHERE c.id = ? AND c.tenant_id = ?
      `).get(id, tenantId);

      if (!cert) {
        res.status(404).json({ error: 'Atestado não encontrado' });
        return;
      }

      // Template da clínica
      const template = db.prepare(`
        SELECT * FROM clinic_document_templates WHERE tenant_id = ? AND template_type = 'certificate'
      `).get(tenantId);

      res.json({ document: cert, template });
    } catch (err: any) {
      console.error('[DocumentsController.getCertificate] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar atestado' });
    }
  }

  // 2. RECEITUÁRIOS
  static createPrescription(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { patientId, appointmentId, professionalId, prescriptionType, content } = req.body;

      if (!patientId || !content) {
        res.status(400).json({ error: 'Paciente e medicamentos da receita são obrigatórios' });
        return;
      }

      let resolvedProfId = professionalId;
      if (!resolvedProfId && req.user) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ?').get(req.user.userId) as { id: string } | undefined;
        if (prof) resolvedProfId = prof.id;
      }
      if (!resolvedProfId) {
        const defaultProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as { id: string } | undefined;
        if (defaultProf) resolvedProfId = defaultProf.id;
      }

      if (!resolvedProfId) {
        res.status(400).json({ error: 'Profissional emissor não identificado' });
        return;
      }

      const year = new Date().getFullYear();
      const countRow = db.prepare('SELECT COUNT(*) as c FROM clinical_prescriptions WHERE tenant_id = ?').get(tenantId) as any;
      const prescNumber = `RC-${year}-${String((countRow?.c || 0) + 1).padStart(4, '0')}`;
      const id = 'prc-' + uuidv4().slice(0, 8);

      const profRow = db.prepare('SELECT name, registration_type, registration_number FROM professionals WHERE id = ?').get(resolvedProfId) as any;
      const signedByName = profRow?.name || req.user?.name || req.user?.email || 'Profissional';
      const signedByRegistration = profRow?.registration_type && profRow?.registration_number
        ? `${profRow.registration_type} ${profRow.registration_number}`
        : (profRow?.registration_number || null);
      const signedAt = new Date().toISOString();

      const hashPayload = [
        id,
        tenantId,
        patientId,
        prescNumber,
        prescriptionType || 'simple',
        content,
        signedByName,
        signedByRegistration || '',
        signedAt
      ].join('|');
      const signatureHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

      db.prepare(`
        INSERT INTO clinical_prescriptions (
          id, tenant_id, patient_id, appointment_id, professional_id,
          prescription_number, items_json, instructions,
          prescription_type, content,
          signature_hash, signed_at, signed_by_name, signed_by_registration, is_sealed,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        id, tenantId, patientId, appointmentId || null, resolvedProfId,
        prescNumber, JSON.stringify([{ text: content }]), content,
        prescriptionType || 'simple', content,
        signatureHash, signedAt, signedByName, signedByRegistration,
        req.user?.name || req.user?.email || 'Profissional'
      );

      logAudit(req, 'CREATE_PRESCRIPTION', 'clinical_prescriptions', id, { patientId, prescriptionType, signatureHash });
      res.status(201).json({
        id,
        prescNumber,
        signatureHash,
        signedAt,
        signedByName,
        signedByRegistration,
        isSealed: true,
        message: 'Receituário gerado com sucesso'
      });
    } catch (err: any) {
      console.error('[DocumentsController.createPrescription] Erro:', err);
      res.status(500).json({ error: 'Erro ao emitir receituário' });
    }
  }

  static getPrescription(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const presc = db.prepare(`
        SELECT 
          pr.*,
          p.full_name as patient_name, p.cpf as patient_cpf, p.birth_date as patient_birth,
          prof.name as professional_name, prof.registration_type, prof.registration_number, prof.gender as professional_gender,
          COALESCE(spec.name, prof.practice_areas, 'Profissional de Saúde') as specialty,
          t.name as clinic_name, t.cnpj_cpf as clinic_cnpj, t.phone as clinic_phone, t.email as clinic_email,
          t.street, t.number, t.neighborhood, t.city, t.city as clinic_city, t.state, t.state as clinic_state, t.address, t.logo_url
        FROM clinical_prescriptions pr
        JOIN patients p ON p.id = pr.patient_id
        JOIN professionals prof ON prof.id = pr.professional_id
        LEFT JOIN specialties spec ON spec.id = prof.specialty_id
        JOIN tenants t ON t.id = pr.tenant_id
        WHERE pr.id = ? AND pr.tenant_id = ?
      `).get(id, tenantId);

      if (!presc) {
        res.status(404).json({ error: 'Receituário não encontrado' });
        return;
      }

      const template = db.prepare(`
        SELECT * FROM clinic_document_templates WHERE tenant_id = ? AND template_type = 'prescription'
      `).get(tenantId);

      res.json({ document: presc, template });
    } catch (err: any) {
      console.error('[DocumentsController.getPrescription] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar receituário' });
    }
  }

  // 3. SOLICITAÇÃO DE EXAMES
  static createExamRequest(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { patientId, appointmentId, professionalId, examsList, clinicalIndication, cidCode } = req.body;

      if (!patientId || !examsList) {
        res.status(400).json({ error: 'Paciente e exames solicitados são obrigatórios' });
        return;
      }

      let resolvedProfId = professionalId;
      if (!resolvedProfId && req.user) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ?').get(req.user.userId) as { id: string } | undefined;
        if (prof) resolvedProfId = prof.id;
      }
      if (!resolvedProfId) {
        const defaultProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as { id: string } | undefined;
        if (defaultProf) resolvedProfId = defaultProf.id;
      }

      if (!resolvedProfId) {
        res.status(400).json({ error: 'Profissional solicitante não identificado' });
        return;
      }

      const year = new Date().getFullYear();
      const countRow = db.prepare('SELECT COUNT(*) as c FROM clinical_exam_requests WHERE tenant_id = ?').get(tenantId) as any;
      const reqNumber = `EX-${year}-${String((countRow?.c || 0) + 1).padStart(4, '0')}`;
      const id = 'erq-' + uuidv4().slice(0, 8);

      const profRow = db.prepare('SELECT name, registration_type, registration_number FROM professionals WHERE id = ?').get(resolvedProfId) as any;
      const signedByName = profRow?.name || req.user?.name || req.user?.email || 'Profissional';
      const signedByRegistration = profRow?.registration_type && profRow?.registration_number
        ? `${profRow.registration_type} ${profRow.registration_number}`
        : (profRow?.registration_number || null);
      const signedAt = new Date().toISOString();

      const hashPayload = [
        id,
        tenantId,
        patientId,
        reqNumber,
        examsList,
        clinicalIndication || '',
        cidCode || '',
        signedByName,
        signedByRegistration || '',
        signedAt
      ].join('|');
      const signatureHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

      db.prepare(`
        INSERT INTO clinical_exam_requests (
          id, tenant_id, patient_id, appointment_id, professional_id,
          request_number, exams_list_json, clinical_justification, notes,
          exams_list, clinical_indication, cid_code,
          signature_hash, signed_at, signed_by_name, signed_by_registration, is_sealed,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        id, tenantId, patientId, appointmentId || null, resolvedProfId,
        reqNumber, JSON.stringify([{ exam: examsList }]), clinicalIndication || null, clinicalIndication || null,
        examsList, clinicalIndication || null, cidCode || null,
        signatureHash, signedAt, signedByName, signedByRegistration,
        req.user?.name || req.user?.email || 'Profissional'
      );

      logAudit(req, 'CREATE_EXAM_REQUEST', 'clinical_exam_requests', id, { patientId, cidCode, signatureHash });
      res.status(201).json({
        id,
        reqNumber,
        signatureHash,
        signedAt,
        signedByName,
        signedByRegistration,
        isSealed: true,
        message: 'Pedido de exame emitido com sucesso'
      });
    } catch (err: any) {
      console.error('[DocumentsController.createExamRequest] Erro:', err);
      res.status(500).json({ error: 'Erro ao emitir pedido de exame' });
    }
  }

  static getExamRequest(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const doc = db.prepare(`
        SELECT 
          er.*,
          p.full_name as patient_name, p.cpf as patient_cpf, p.birth_date as patient_birth,
          prof.name as professional_name, prof.registration_type, prof.registration_number, prof.gender as professional_gender,
          COALESCE(spec.name, prof.practice_areas, 'Profissional de Saúde') as specialty,
          t.name as clinic_name, t.cnpj_cpf as clinic_cnpj, t.phone as clinic_phone, t.email as clinic_email,
          t.street, t.number, t.neighborhood, t.city, t.city as clinic_city, t.state, t.state as clinic_state, t.address, t.logo_url
        FROM clinical_exam_requests er
        JOIN patients p ON p.id = er.patient_id
        JOIN professionals prof ON prof.id = er.professional_id
        LEFT JOIN specialties spec ON spec.id = prof.specialty_id
        JOIN tenants t ON t.id = er.tenant_id
        WHERE er.id = ? AND er.tenant_id = ?
      `).get(id, tenantId);

      if (!doc) {
        res.status(404).json({ error: 'Pedido de exame não encontrado' });
        return;
      }

      const template = db.prepare(`
        SELECT * FROM clinic_document_templates WHERE tenant_id = ? AND template_type = 'exam_request'
      `).get(tenantId);

      res.json({ document: doc, template });
    } catch (err: any) {
      console.error('[DocumentsController.getExamRequest] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar pedido de exame' });
    }
  }

  // 4. MODELOS DE DOCUMENTOS DA CLÍNICA
  static listTemplates(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const templates = db.prepare('SELECT * FROM clinic_document_templates WHERE tenant_id = ?').all(tenantId);
      res.json(templates);
    } catch (err: any) {
      console.error('[DocumentsController.listTemplates] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar modelos de documentos' });
    }
  }

  static upsertTemplate(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { templateType, headerText, footerText, showLogo, showClinicAddress, showRegistry, customNotes } = req.body;

      if (!templateType) {
        res.status(400).json({ error: 'Tipo do modelo é obrigatório' });
        return;
      }

      const existing = db.prepare('SELECT id FROM clinic_document_templates WHERE tenant_id = ? AND template_type = ?').get(tenantId, templateType) as { id: string } | undefined;

      if (existing) {
        db.prepare(`
          UPDATE clinic_document_templates SET
            header_text = ?,
            footer_text = ?,
            show_logo = ?,
            show_clinic_address = ?,
            show_registry = ?,
            custom_notes = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          headerText || null, footerText || null,
          showLogo ? 1 : 0, showClinicAddress !== false ? 1 : 0, showRegistry !== false ? 1 : 0,
          customNotes || null, existing.id, tenantId
        );
        res.json({ id: existing.id, message: 'Modelo de documento atualizado com sucesso' });
      } else {
        const id = 'tmpl-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO clinic_document_templates (
            id, tenant_id, template_type, header_text, footer_text,
            show_logo, show_clinic_address, show_registry, custom_notes
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, tenantId, templateType, headerText || null, footerText || null,
          showLogo ? 1 : 0, showClinicAddress !== false ? 1 : 0, showRegistry !== false ? 1 : 0,
          customNotes || null
        );
        res.status(201).json({ id, message: 'Modelo de documento cadastrado com sucesso' });
      }
    } catch (err: any) {
      console.error('[DocumentsController.upsertTemplate] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar modelo de documento' });
    }
  }

  // 5. FLUXO COMPLETO E SEGURO DE FINALIZAÇÃO DE CONSULTA (TRANSACTIONAL)
  static finishConsultation(req: Request, res: Response): void {
    let currentStage = 'INIT';
    try {
      const { id: appointmentId } = req.params;
      const tenantId = req.tenantId;
      const {
        evolution,
        certificate,
        prescription,
        examRequest,
        returnAppointment,
        referral
      } = req.body;

      currentStage = 'FETCH_APPOINTMENT';
      const appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?').get(appointmentId, tenantId) as any;
      if (!appt) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      if (!req.user || !hasClinicalAccess(req, appt.patient_id) ||
          (req.body.patientId && req.body.patientId !== appt.patient_id) ||
          (req.user.role === 'professional' && !db.prepare('SELECT id FROM professionals WHERE id=? AND user_id=? AND tenant_id=? AND active=1').get(appt.professional_id, req.user.userId, tenantId))) {
        res.status(403).json({ error: 'Sem permissão para finalizar este atendimento.' });
        return;
      }
      if (['cancelled', 'no_show'].includes(appt.status)) {
        res.status(409).json({ error: 'Este atendimento não pode ser finalizado.' });
        return;
      }
      const saved = db.prepare('SELECT * FROM consultation_completions WHERE appointment_id=? AND tenant_id=?').get(appointmentId, tenantId) as any;

      appt.clinical_module = resolveClinicalModule(appt, tenantId);

      // Validação anti-conflito de módulos clínicos no mesmo atendimento
      if (evolution?.moduleType) {
        if (appt.clinical_module && appt.clinical_module !== evolution.moduleType) {
          res.status(409).json({
            error: `Este atendimento foi iniciado no módulo "${appt.clinical_module}". Não é permitido salvar ou finalizar em módulo diferente ("${evolution.moduleType}").`
          });
          return;
        }
        const existingRec = db.prepare("SELECT module_type FROM records WHERE appointment_id=? AND tenant_id=? AND module_type IS NOT NULL AND module_type != 'ZemdaBody' LIMIT 1").get(appointmentId, tenantId) as { module_type?: string } | undefined;
        if (existingRec?.module_type && existingRec.module_type !== evolution.moduleType) {
          res.status(409).json({
            error: `O prontuário deste atendimento já foi registrado no módulo "${existingRec.module_type}". Não é permitido salvar em módulos diferentes.`
          });
          return;
        }
      }

      const moduleAccess: Record<string, (request: Request) => boolean> = {
        ZemdaNutri: isNutritionistOrClinicManager, ZemdaTO: isOccupationalTherapistOrClinicManager,
        ZemdaFono: isSpeechTherapistOrClinicManager, ZemdaOdonto: isDentistOrClinicManager, ZemdaFisio: isPhysiotherapistOrClinicManager,
        ZemdaPP: (request: Request) => hasPsychopedagogyAccess(request, appt.patient_id),
        ZemdaPsico: (request: Request) => hasPsychologyAccess(request, appt.patient_id)
      };
      if (evolution?.moduleType && evolution.moduleType !== 'general' && (!moduleAccess[evolution.moduleType] || !moduleAccess[evolution.moduleType](req))) {
        res.status(403).json({ error: 'Sem permissão para este módulo clínico.' }); return;
      }

      const saveOnly = req.body.saveOnly === true;
      const clinicalPayload = JSON.stringify({ evolution, certificate, prescription, examRequest, returnAppointment, referral });
      if (saveOnly && saved?.payload_json && saved.payload_json !== clinicalPayload) {
        res.status(409).json({ error: 'O prontuário desta consulta já foi salvo. Retome o recebimento pela agenda. Alterações clínicas devem ser registradas no prontuário.' });
        return;
      }
      const payment = req.body.payment;
      if (!saveOnly && appt.status !== 'completed' && (!payment ||
          !['paid', 'pending', 'exempt'].includes(payment.status) ||
          !['cash', 'pix', 'credit_card', 'debit_card', 'insurance', 'other'].includes(payment.paymentMethod) ||
          typeof payment.amount !== 'number' || !Number.isFinite(payment.amount) || payment.amount < 0 ||
          (payment.status !== 'exempt' && payment.amount <= 0))) {
        res.status(400).json({ error: 'Informe valor, forma e status do recebimento.' });
        return;
      }

      // Proteção contra duplo clique e idempotência
      if (appt.status === 'completed') {
        res.json({
          message: 'Este atendimento já foi concluído anteriormente.',
          alreadyCompleted: true,
          generatedDocs: saved ? JSON.parse(saved.generated_docs_json) : {}
        });
        return;
      }

      // Resolução segura de profissional responsável
      const resolvedProfId = appt.professional_id;
      if (!resolvedProfId || !db.prepare('SELECT id FROM professionals WHERE id=? AND tenant_id=?').get(resolvedProfId, tenantId)) {
        res.status(400).json({ error: 'Não foi possível identificar o profissional de saúde responsável pelo atendimento.' });
        return;
      }

      const generatedDocs: any = saved ? JSON.parse(saved.generated_docs_json) : {};
      const year = new Date().getFullYear();

      // Inicia transação atômica
      db.exec('BEGIN IMMEDIATE');

      db.prepare("UPDATE appointments SET clinical_module = COALESCE(NULLIF(clinical_module, 'ZemdaBody'), ?) WHERE id=? AND tenant_id=?")
        .run(appt.clinical_module || evolution?.moduleType || null, appointmentId, tenantId);

      if (!saved) {

      // 1. Grava evolução do prontuário, se preenchida
      if (evolution && evolution.clinicalEvolution && evolution.clinicalEvolution.trim()) {
        currentStage = 'SAVE_EVOLUTION';
        const recId = 'rec-' + uuidv4().slice(0, 8);
        const srvName = (db.prepare('SELECT name FROM services WHERE id = ?').get(appt.service_id) as any)?.name || 'Atendimento Geral';
        const spDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
        const sessionDate = appt.start_time ? appt.start_time.split('T')[0] : spDateStr;
        const sessionTime = appt.start_time?.includes('T') ? appt.start_time.split('T')[1].slice(0, 5) : null;
        const clinicalDataJson = evolution.clinicalData ? (typeof evolution.clinicalData === 'string' ? evolution.clinicalData : JSON.stringify(evolution.clinicalData)) : null;
        const snapshot = typeof evolution.moduleData === 'string' ? JSON.parse(evolution.moduleData) : { ...evolution.moduleData };
        if (evolution.assessmentData && !snapshot.assessmentData && !snapshot.assessment) snapshot.assessment = evolution.assessmentData;
        if (evolution.odontogramData) snapshot.odontogramData = evolution.odontogramData;
        if (evolution.toothChanges) snapshot.toothChanges = evolution.toothChanges;
        if (evolution.moduleType === 'ZemdaFisio') {
          const assessment = db.prepare('SELECT * FROM physiotherapy_assessments WHERE appointment_id=? AND tenant_id=? AND patient_id=? ORDER BY created_at DESC LIMIT 1').get(appointmentId, tenantId, appt.patient_id) as any;
          if (assessment) snapshot.functionalAssessment = assessment;
          const values = [snapshot.painScore ?? 0, snapshot.painLocation || null, snapshot.painCharacteristics || null,
            snapshot.conductsExercises || null, typeof snapshot.bodyMapJson === 'object' ? JSON.stringify(snapshot.bodyMapJson) : snapshot.bodyMapJson || null, snapshot.bodyMapImage || null];
          if (assessment) {
            db.prepare("UPDATE physiotherapy_assessments SET pain_score=?, pain_location=?, pain_characteristics=?, conducts_exercises=?, body_map_json=?, body_map_image=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?")
              .run(...values, assessment.id, tenantId);
          } else {
            db.prepare('INSERT INTO physiotherapy_assessments (id, tenant_id, patient_id, professional_id, appointment_id, chief_complaint, pain_score, pain_location, pain_characteristics, conducts_exercises, body_map_json, body_map_image, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .run('pfa-' + uuidv4(), tenantId, appt.patient_id, resolvedProfId, appointmentId, evolution.title || srvName, ...values, req.user?.name);
          }
        }
        const moduleDataJson = JSON.stringify(snapshot);

        const shouldSeal = evolution.isSealed !== false;
        let signatureHash: string | null = null;
        let signedAt: string | null = null;
        let signedByUserId: string | null = null;
        let signerName: string | null = null;
        let signerRegistration: string | null = null;
        let sealedAt: string | null = null;

        const profRow = db.prepare('SELECT name, registration_type, registration_number FROM professionals WHERE id = ?').get(resolvedProfId) as any;

        if (shouldSeal) {
          signedAt = new Date().toISOString();
          sealedAt = signedAt;
          signedByUserId = req.user?.userId || null;
          signerName = profRow?.name || req.user?.name || req.user?.email || 'Profissional';
          signerRegistration = profRow?.registration_type && profRow?.registration_number
            ? `${profRow.registration_type} ${profRow.registration_number}`
            : (profRow?.registration_number || null);

          const hashPayload = [
            recId,
            tenantId,
            appt.patient_id,
            appointmentId,
            sessionDate,
            sessionTime || '',
            evolution.title || `Consulta de ${srvName}`,
            evolution.clinicalEvolution,
            evolution.conducts || '',
            signerName,
            signerRegistration || '',
            signedAt
          ].join('|');
          signatureHash = crypto.createHash('sha256').update(hashPayload).digest('hex');
        }

        db.prepare(`
          INSERT INTO records (
            id, tenant_id, patient_id, appointment_id, professional_id,
            session_date, session_time, procedure_name, title, clinical_evolution,
            technical_notes, conducts, clinical_data_json, module_type, module_data_json,
            is_sealed, signature_hash, signed_at, signed_by_user_id, signer_name,
            signer_registration, sealed_at, amendments_json,
            created_by, updated_by, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, datetime('now'), datetime('now'))
        `).run(
          recId, tenantId, appt.patient_id, appointmentId, resolvedProfId,
          sessionDate, sessionTime, evolution.procedureName || srvName,
          evolution.title || `Consulta de ${srvName}`,
          evolution.clinicalEvolution,
          evolution.technicalNotes || null,
          evolution.conducts || null,
          clinicalDataJson,
          evolution.moduleType || null,
          moduleDataJson,
          shouldSeal ? 1 : 0,
          signatureHash, signedAt, signedByUserId, signerName, signerRegistration, sealedAt,
          req.user?.name || 'Profissional',
          req.user?.name || 'Profissional'
        );
        generatedDocs.recordId = recId;
        if (signatureHash) generatedDocs.signatureHash = signatureHash;

        for (const attachmentId of (Array.isArray(evolution.attachmentIds) ? evolution.attachmentIds : [])) {
          const attachment = db.prepare('SELECT id, record_id FROM documents WHERE id=? AND patient_id=? AND tenant_id=?').get(attachmentId, appt.patient_id, tenantId) as any;
          if (!attachment || (attachment.record_id && attachment.record_id !== recId)) throw new Error('Anexo não pertence a este atendimento');
          db.prepare('UPDATE documents SET record_id=? WHERE id=? AND tenant_id=?').run(recId, attachmentId, tenantId);
        }

        // Persistência especializada por módulo clínico (Garantia de que nada é perdido)
        const parsedModuleData = snapshot;

        // A. ZEMDAODONTO: Salva Odontograma inicial, atual, snapshot e alterações de dentes
        if (evolution.moduleType === 'ZemdaOdonto' || parsedModuleData.odontogramData || evolution.odontogramData) {
          const odoData = evolution.odontogramData || parsedModuleData.odontogramData;
          if (odoData) {
            const statusJson = typeof odoData === 'string' ? odoData : JSON.stringify(odoData);
            
            // 1. Initial se ainda não existir
            const hasInitial = db.prepare("SELECT id FROM odontograms WHERE patient_id = ? AND tenant_id = ? AND type = 'initial'").get(appt.patient_id, tenantId);
            if (!hasInitial) {
              db.prepare(`
                INSERT INTO odontograms (id, tenant_id, patient_id, professional_id, appointment_id, record_id, type, status_data_json, notes)
                VALUES (?, ?, ?, ?, ?, ?, 'initial', ?, 'Odontograma Inicial do Paciente')
              `).run('odo-init-' + uuidv4().slice(0, 8), tenantId, appt.patient_id, resolvedProfId, appointmentId, recId, statusJson);
            }

            // 2. Atualiza ou cria odontograma atual
            const existingCurrent = db.prepare("SELECT id FROM odontograms WHERE patient_id = ? AND tenant_id = ? AND type = 'current'").get(appt.patient_id, tenantId) as any;
            if (existingCurrent) {
              db.prepare("UPDATE odontograms SET status_data_json = ?, record_id = ?, updated_at = datetime('now') WHERE id = ?").run(statusJson, recId, existingCurrent.id);
            } else {
              db.prepare(`
                INSERT INTO odontograms (id, tenant_id, patient_id, professional_id, appointment_id, record_id, type, status_data_json)
                VALUES (?, ?, ?, ?, ?, ?, 'current', ?)
              `).run('odo-' + uuidv4().slice(0, 8), tenantId, appt.patient_id, resolvedProfId, appointmentId, recId, statusJson);
            }

            // 3. Snapshot imutável do atendimento
            db.prepare(`
              INSERT INTO odontograms (id, tenant_id, patient_id, professional_id, appointment_id, record_id, type, status_data_json, notes)
              VALUES (?, ?, ?, ?, ?, ?, 'consultation_snapshot', ?, ?)
            `).run('odo-snap-' + uuidv4().slice(0, 8), tenantId, appt.patient_id, resolvedProfId, appointmentId, recId, statusJson, `Snapshot do atendimento em ${sessionDate}`);
          }

          const toothChanges = evolution.toothChanges || parsedModuleData.toothChanges;
          if (Array.isArray(toothChanges) && toothChanges.length > 0) {
            const insertToothStmt = db.prepare(`
              INSERT INTO dental_tooth_records (
                id, tenant_id, patient_id, professional_id, appointment_id,
                tooth_number, face, condition, previous_condition, procedure_name, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const change of toothChanges) {
              insertToothStmt.run(
                'dtr-' + uuidv4().slice(0, 8), tenantId, appt.patient_id, resolvedProfId, appointmentId,
                change.toothNumber, change.face || 'whole', change.condition,
                change.previousCondition || null, change.procedureName || srvName, change.notes || null
              );
            }
          }
        }

        // B. ZEMDANUTRI: Salva avaliação antropométrica se presente
        if (evolution.moduleType === 'ZemdaNutri' || parsedModuleData.assessment) {
          const ass = parsedModuleData.assessment || evolution.assessmentData;
          if (ass && ass.weight) {
            db.prepare(`
              INSERT INTO nutrition_assessments (
                id, tenant_id, patient_id, professional_id, appointment_id, record_id,
                assessment_date, weight, height, bmi, waist_circ, abdominal_circ, hip_circ,
                arm_circ, calf_circ, neck_circ, thigh_circ, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              'n-ass-' + uuidv4().slice(0, 8), tenantId, appt.patient_id, resolvedProfId, appointmentId, recId,
              sessionDate, ass.weight, ass.height || null, ass.bmi || null,
              ass.waistCirc || null, ass.abdominalCirc || null, ass.hipCirc || null,
              ass.armCirc || null, ass.calfCirc || null, ass.neckCirc || null, ass.thighCirc || null, ass.notes || null
            );
          }
        }

        // C. ZEMDATO: Salva avaliação de AVDs e sensorial se presentes
        if (evolution.moduleType === 'ZemdaTO' || parsedModuleData.adlData || parsedModuleData.avd) {
          const avd = parsedModuleData.adlData || parsedModuleData.avd;
          if (avd) {
            const scoresJson = typeof avd === 'string' ? avd : JSON.stringify(avd);
            const overallLevel = avd.level !== undefined ? String(avd.level) : (avd.overallLevel || null);
            try {
              db.prepare(`
                INSERT INTO to_avd_assessments (
                  id, tenant_id, patient_id, professional_id, appointment_id,
                  assessment_type, scores_json, overall_level, notes
                ) VALUES (?, ?, ?, ?, ?, 'avd', ?, ?, ?)
              `).run(
                'to-avd-' + uuidv4().slice(0, 8), tenantId, appt.patient_id, resolvedProfId, appointmentId,
                scoresJson, overallLevel, parsedModuleData.notes || null
              );
            } catch (toErr) {
              console.warn('[finishConsultation] Aviso ao gravar to_avd_assessments:', toErr);
            }
          }
          if (parsedModuleData.sensoryData) {
            const sensory = parsedModuleData.sensoryData;
            try {
              db.prepare(`
                INSERT INTO to_sensory_assessments (
                  id, tenant_id, patient_id, professional_id, appointment_id,
                  tactile, auditory, visual, vestibular, proprioceptive, gustatory, olfactory, interoceptive, notes_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                'to-sns-' + uuidv4().slice(0, 8), tenantId, appt.patient_id, resolvedProfId, appointmentId,
                sensory.tactile || null, sensory.auditory || null, sensory.visual || null,
                sensory.vestibular || null, sensory.proprioceptive || null, sensory.gustatory || null,
                sensory.olfactory || null, sensory.interoceptive || null, JSON.stringify(sensory)
              );
            } catch (snsErr) {
              console.warn('[finishConsultation] Aviso ao gravar to_sensory_assessments:', snsErr);
            }
          }
        }

        // D. ZEMDAFONO: Salva fonemas e avaliação vocal se presentes
        if (evolution.moduleType === 'ZemdaFono' || parsedModuleData.phonemesData || parsedModuleData.voiceData) {
          const phon = parsedModuleData.phonemesData || parsedModuleData.phonemes;
          if (phon) {
            const phonJson = typeof phon === 'string' ? phon : JSON.stringify(phon);
            try {
              db.prepare(`
                INSERT INTO fono_speech_phonology (
                  id, tenant_id, patient_id, professional_id, appointment_id,
                  phonemes_json, intelligibility, articulation_notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                'fon-sph-' + uuidv4().slice(0, 8), tenantId, appt.patient_id, resolvedProfId, appointmentId,
                phonJson, phon.intelligibility || null, parsedModuleData.notes || null
              );
            } catch (fonErr) {
              console.warn('[finishConsultation] Aviso ao gravar fono_speech_phonology:', fonErr);
            }
          }
          const voice = parsedModuleData.voiceData || parsedModuleData.voice;
          if (voice) {
            try {
              db.prepare(`
                INSERT INTO fono_voice_assessments (
                  id, tenant_id, patient_id, professional_id, appointment_id,
                  vocal_quality, audio_url, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                'fon-voc-' + uuidv4().slice(0, 8), tenantId, appt.patient_id, resolvedProfId, appointmentId,
                voice.vocalQuality || 'normal', voice.audioUrl || parsedModuleData.audioData || null, voice.notes || null
              );
            } catch (vocErr) {
              console.warn('[finishConsultation] Aviso ao gravar fono_voice_assessments:', vocErr);
            }
          }
        }
      }

      const docProf = db.prepare('SELECT name, registration_type, registration_number FROM professionals WHERE id = ?').get(resolvedProfId) as any;
      const docSignerName = docProf?.name || req.user?.name || req.user?.email || 'Profissional';
      const docSignerReg = docProf?.registration_type && docProf?.registration_number
        ? `${docProf.registration_type} ${docProf.registration_number}`
        : (docProf?.registration_number || null);
      const docSignedAt = new Date().toISOString();

      // 2. Emite Atestado, se preenchido
      if (certificate && certificate.certificateType) {
        currentStage = 'CREATE_CERTIFICATE';
        const certId = 'crt-' + uuidv4().slice(0, 8);
        const countRow = db.prepare('SELECT COUNT(*) as c FROM clinical_certificates WHERE tenant_id = ?').get(tenantId) as any;
        const certNum = `AT-${year}-${String((countRow?.c || 0) + 1).padStart(4, '0')}`;
        const certSummary = certificate.notes || `Atestado de ${certificate.certificateType === 'rest' ? 'repouso' : 'comparecimento'} (${certificate.daysOff || 1} dias).`;

        const certHash = crypto.createHash('sha256').update([
          certId, tenantId, appt.patient_id, certNum, certificate.certificateType,
          certificate.daysOff || 1, certificate.startDate || '', certificate.cidCode || '',
          certSummary, docSignerName, docSignerReg || '', docSignedAt
        ].join('|')).digest('hex');

        db.prepare(`
          INSERT INTO clinical_certificates (
            id, tenant_id, patient_id, appointment_id, professional_id,
            certificate_number, days_rest, cid, content_text,
            certificate_type, days_off, start_date, cid_code, notes,
            signature_hash, signed_at, signed_by_name, signed_by_registration, is_sealed,
            created_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).run(
          certId, tenantId, appt.patient_id, appointmentId, resolvedProfId,
          certNum, certificate.daysOff || 1, certificate.cidCode || null, certSummary,
          certificate.certificateType, certificate.daysOff || 1, certificate.startDate || null,
          certificate.cidCode || null, certificate.notes || null,
          certHash, docSignedAt, docSignerName, docSignerReg,
          req.user?.name || 'Profissional'
        );
        generatedDocs.certificateId = certId;
      }

      // 3. Emite Receituário, se preenchido
      if (prescription && prescription.content && prescription.content.trim()) {
        currentStage = 'CREATE_PRESCRIPTION';
        const prescId = 'prc-' + uuidv4().slice(0, 8);
        const countRow = db.prepare('SELECT COUNT(*) as c FROM clinical_prescriptions WHERE tenant_id = ?').get(tenantId) as any;
        const prescNum = `RC-${year}-${String((countRow?.c || 0) + 1).padStart(4, '0')}`;

        const prescHash = crypto.createHash('sha256').update([
          prescId, tenantId, appt.patient_id, prescNum, prescription.prescriptionType || 'simple',
          prescription.content, docSignerName, docSignerReg || '', docSignedAt
        ].join('|')).digest('hex');

        db.prepare(`
          INSERT INTO clinical_prescriptions (
            id, tenant_id, patient_id, appointment_id, professional_id,
            prescription_number, items_json, instructions,
            prescription_type, content,
            signature_hash, signed_at, signed_by_name, signed_by_registration, is_sealed,
            created_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).run(
          prescId, tenantId, appt.patient_id, appointmentId, resolvedProfId,
          prescNum, JSON.stringify([{ text: prescription.content }]), prescription.content,
          prescription.prescriptionType || 'simple', prescription.content,
          prescHash, docSignedAt, docSignerName, docSignerReg,
          req.user?.name || 'Profissional'
        );
        generatedDocs.prescriptionId = prescId;
      }

      // 4. Emite Pedido de Exames, se preenchido
      if (examRequest && examRequest.examsList && examRequest.examsList.trim()) {
        currentStage = 'CREATE_EXAM_REQUEST';
        const reqId = 'erq-' + uuidv4().slice(0, 8);
        const countRow = db.prepare('SELECT COUNT(*) as c FROM clinical_exam_requests WHERE tenant_id = ?').get(tenantId) as any;
        const reqNum = `EX-${year}-${String((countRow?.c || 0) + 1).padStart(4, '0')}`;

        const examHash = crypto.createHash('sha256').update([
          reqId, tenantId, appt.patient_id, reqNum, examRequest.examsList,
          examRequest.clinicalIndication || '', docSignerName, docSignerReg || '', docSignedAt
        ].join('|')).digest('hex');

        db.prepare(`
          INSERT INTO clinical_exam_requests (
            id, tenant_id, patient_id, appointment_id, professional_id,
            request_number, exams_list_json, clinical_justification, notes,
            exams_list, clinical_indication,
            signature_hash, signed_at, signed_by_name, signed_by_registration, is_sealed,
            created_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).run(
          reqId, tenantId, appt.patient_id, appointmentId, resolvedProfId,
          reqNum, JSON.stringify([{ exam: examRequest.examsList }]), examRequest.clinicalIndication || null, examRequest.clinicalIndication || null,
          examRequest.examsList, examRequest.clinicalIndication || null,
          examHash, docSignedAt, docSignerName, docSignerReg,
          req.user?.name || 'Profissional'
        );
        generatedDocs.examRequestId = reqId;
      }

      // 5. Agenda Retorno, se informado
      if (returnAppointment && returnAppointment.startTime && returnAppointment.endTime) {
        currentStage = 'SCHEDULE_RETURN';
        const retApptId = 'apt-' + uuidv4().slice(0, 8);
        const count = ((db.prepare('SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ?').get(tenantId) as any)?.c || 0) + 1;
        const apptNum = `AG-${year}-${count.toString().padStart(4, '0')}`;

        db.prepare(`
          INSERT INTO appointments (
            id, tenant_id, appointment_number, patient_id, professional_id, service_id,
            start_time, end_time, status, modality, patient_notes, created_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)
        `).run(
          retApptId, tenantId, apptNum, appt.patient_id, resolvedProfId,
          returnAppointment.serviceId || appt.service_id,
          returnAppointment.startTime, returnAppointment.endTime,
          returnAppointment.modality || appt.modality || 'presential',
          'Consulta de Retorno', req.user ? req.user.userId : 'system'
        );
        generatedDocs.returnAppointmentId = retApptId;
      }

      // 6. Atualiza dados de Encaminhamento no agendamento, se informado
      if (referral && (referral.referredByProfessionalId || referral.referralReason)) {
        currentStage = 'RECORD_REFERRAL';
        db.prepare(`
          UPDATE appointments SET
            referred_by_professional_id = ?,
            referral_reason = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(referral.referredByProfessionalId || null, referral.referralReason || null, appointmentId, tenantId);
      }

      // 7. Marca o agendamento como finalizado / completed
      db.prepare('INSERT INTO consultation_completions (appointment_id, tenant_id, generated_docs_json, payload_json, saved_by) VALUES (?, ?, ?, ?, ?)')
        .run(appointmentId, tenantId, JSON.stringify(generatedDocs), clinicalPayload, req.user!.userId);
      }

      if (saveOnly) {
        db.exec('COMMIT');
        const existingPayment = db.prepare("SELECT id, amount, payment_method, status, notes FROM payments WHERE appointment_id=? AND tenant_id=? AND status NOT IN ('cancelled','refunded') ORDER BY created_at LIMIT 1").get(appointmentId, tenantId) as any;
        const price = db.prepare('SELECT price FROM services WHERE id=? AND tenant_id=?').get(appt.service_id, tenantId) as any;
        logAudit(req, 'SAVE_CONSULTATION', 'appointments', appointmentId, { generatedDocs });
        res.json({ generatedDocs, awaitingPayment: true, payment: existingPayment || { amount: price?.price || 0, payment_method: 'pix', status: 'pending' } });
        return;
      }

      currentStage = 'SAVE_INTERNAL_PAYMENT';
      const existingPayments = db.prepare("SELECT * FROM payments WHERE appointment_id=? AND tenant_id=? AND status NOT IN ('cancelled','refunded') ORDER BY created_at").all(appointmentId, tenantId) as any[];
      if (existingPayments.length > 1) {
        db.exec('ROLLBACK');
        res.status(409).json({ error: 'Existem múltiplos lançamentos para esta consulta. Confira-os no Financeiro antes de finalizar.' });
        return;
      }
      const amount = payment.status === 'exempt' ? 0 : Math.round(payment.amount * 100) / 100;
      const existingPayment = existingPayments[0];
      if (existingPayment && ['paid', 'partial'].includes(existingPayment.status) &&
          (existingPayment.status !== payment.status || Number(existingPayment.amount) !== amount || existingPayment.payment_method !== payment.paymentMethod)) {
        db.exec('ROLLBACK');
        res.status(409).json({ error: 'O recebimento já registrado deve ser conferido no Financeiro.' });
        return;
      }
      const paymentId = existingPayment?.id || 'pay-' + uuidv4();
      if (existingPayment) {
        db.prepare('UPDATE payments SET amount=?, payment_method=?, status=?, payment_date=?, notes=? WHERE id=? AND tenant_id=?')
          .run(amount, payment.paymentMethod, payment.status, payment.status === 'paid' ? (existingPayment.payment_date || new Date().toISOString()) : null, payment.notes || null, paymentId, tenantId);
      } else {
        db.prepare('INSERT INTO payments (id, tenant_id, appointment_id, patient_id, amount, payment_method, status, payment_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(paymentId, tenantId, appointmentId, appt.patient_id, amount, payment.paymentMethod, payment.status, payment.status === 'paid' ? new Date().toISOString() : null, payment.notes || null);
      }
      db.prepare("UPDATE consultation_completions SET payment_id=?, completed_at=datetime('now') WHERE appointment_id=? AND tenant_id=?").run(paymentId, appointmentId, tenantId);
      currentStage = 'UPDATE_APPOINTMENT_STATUS';
      db.prepare(`
        UPDATE appointments SET
          status = 'completed',
          clinical_module = COALESCE(clinical_module, ?),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(evolution?.moduleType || null, appointmentId, tenantId);

      // 8. Grava no histórico de status
      try {
        db.prepare(`
          INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
          VALUES (?, ?, ?, 'completed', ?, 'Consulta finalizada com sucesso')
        `).run(uuidv4(), appointmentId, appt.status, req.user ? (req.user.name || req.user.email) : 'Profissional');
      } catch (historyErr) {
        console.warn('[finishConsultation] Aviso ao gravar historico de status:', historyErr);
      }

      // Comita a transação com êxito total
      db.exec('COMMIT');

      logAudit(req, 'FINISH_CONSULTATION', 'appointments', appointmentId, { generatedDocs });
      res.json({
        message: 'Consulta finalizada com sucesso!',
        generatedDocs
      });
    } catch (err: any) {
      try {
        db.exec('ROLLBACK');
      } catch (rollbackErr) {
        // Ignora erro de rollback se não havia transação aberta
      }

      // Registro interno detalhado para suporte técnico
      console.error('[DocumentsController.finishConsultation] FALHA CRÍTICA:', {
        stage: currentStage,
        error: err.message,
        stack: err.stack,
        appointmentId: req.params.id,
        tenantId: req.tenantId,
        user: req.user?.email,
        timestamp: new Date().toISOString()
      });

      // Resposta clara, segura e amigável ao profissional
      res.status(500).json({
        error: 'Não foi possível finalizar o atendimento. Nenhuma informação foi perdida. Tente novamente ou entre em contato com o suporte.',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
        stage: currentStage
      });
    }
  }
}
