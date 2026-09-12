import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class DocumentsController {
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
      const textSummary = notes || `Atestado médico de ${certificateType === 'rest' ? 'repouso' : 'comparecimento'} (${daysOff || 1} dias).`;

      db.prepare(`
        INSERT INTO clinical_certificates (
          id, tenant_id, patient_id, appointment_id, professional_id,
          certificate_number, days_rest, cid, content_text,
          certificate_type, days_off, start_date, cid_code, notes,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, appointmentId || null, resolvedProfId,
        certNumber, daysOff || 1, cidCode || null, textSummary,
        certificateType, daysOff || 1, startDate || null, cidCode || null, notes || null,
        req.user?.name || req.user?.email || 'Profissional'
      );

      logAudit(req, 'CREATE_CERTIFICATE', 'clinical_certificates', id, { patientId, certificateType });
      res.status(201).json({ id, message: 'Atestado emitido com sucesso' });
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

      db.prepare(`
        INSERT INTO clinical_prescriptions (
          id, tenant_id, patient_id, appointment_id, professional_id,
          prescription_number, items_json, instructions,
          prescription_type, content,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, appointmentId || null, resolvedProfId,
        prescNumber, JSON.stringify([{ text: content }]), content,
        prescriptionType || 'simple', content,
        req.user?.name || req.user?.email || 'Profissional'
      );

      logAudit(req, 'CREATE_PRESCRIPTION', 'clinical_prescriptions', id, { patientId, prescriptionType });
      res.status(201).json({ id, message: 'Receituário gerado com sucesso' });
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

      db.prepare(`
        INSERT INTO clinical_exam_requests (
          id, tenant_id, patient_id, appointment_id, professional_id,
          request_number, exams_list_json, clinical_justification, notes,
          exams_list, clinical_indication, cid_code,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, appointmentId || null, resolvedProfId,
        reqNumber, JSON.stringify([{ exam: examsList }]), clinicalIndication || null, clinicalIndication || null,
        examsList, clinicalIndication || null, cidCode || null,
        req.user?.name || req.user?.email || 'Profissional'
      );

      logAudit(req, 'CREATE_EXAM_REQUEST', 'clinical_exam_requests', id, { patientId, cidCode });
      res.status(201).json({ id, message: 'Pedido de exame emitido com sucesso' });
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

      // Proteção contra duplo clique e idempotência
      if (appt.status === 'completed') {
        res.json({
          message: 'Este atendimento já foi concluído anteriormente.',
          alreadyCompleted: true,
          generatedDocs: {}
        });
        return;
      }

      // Resolução segura de profissional responsável
      let resolvedProfId = appt.professional_id;
      if (!resolvedProfId && req.user) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ?').get(req.user.userId) as { id: string } | undefined;
        if (prof) resolvedProfId = prof.id;
      }
      if (!resolvedProfId) {
        const defaultProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as { id: string } | undefined;
        if (defaultProf) resolvedProfId = defaultProf.id;
      }
      if (!resolvedProfId) {
        res.status(400).json({ error: 'Não foi possível identificar o profissional de saúde responsável pelo atendimento.' });
        return;
      }

      const generatedDocs: any = {};
      const year = new Date().getFullYear();

      // Inicia transação atômica
      db.exec('BEGIN TRANSACTION');

      // 1. Grava evolução do prontuário, se preenchida
      if (evolution && evolution.clinicalEvolution && evolution.clinicalEvolution.trim()) {
        currentStage = 'SAVE_EVOLUTION';
        const recId = 'rec-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO records (
            id, tenant_id, patient_id, appointment_id, professional_id,
            session_date, title, clinical_evolution, technical_notes, is_sealed
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          recId, tenantId, appt.patient_id, appointmentId, resolvedProfId,
          appt.start_time ? appt.start_time.split('T')[0] : new Date().toISOString().split('T')[0],
          evolution.title || 'Evolução da Consulta',
          evolution.clinicalEvolution,
          evolution.technicalNotes || null,
          evolution.isSealed ? 1 : 0
        );
        generatedDocs.recordId = recId;
      }

      // 2. Emite Atestado, se preenchido
      if (certificate && certificate.certificateType) {
        currentStage = 'CREATE_CERTIFICATE';
        const certId = 'crt-' + uuidv4().slice(0, 8);
        const countRow = db.prepare('SELECT COUNT(*) as c FROM clinical_certificates WHERE tenant_id = ?').get(tenantId) as any;
        const certNum = `AT-${year}-${String((countRow?.c || 0) + 1).padStart(4, '0')}`;
        const certSummary = certificate.notes || `Atestado de ${certificate.certificateType === 'rest' ? 'repouso' : 'comparecimento'} (${certificate.daysOff || 1} dias).`;

        db.prepare(`
          INSERT INTO clinical_certificates (
            id, tenant_id, patient_id, appointment_id, professional_id,
            certificate_number, days_rest, cid, content_text,
            certificate_type, days_off, start_date, cid_code, notes,
            created_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          certId, tenantId, appt.patient_id, appointmentId, resolvedProfId,
          certNum, certificate.daysOff || 1, certificate.cidCode || null, certSummary,
          certificate.certificateType, certificate.daysOff || 1, certificate.startDate || null,
          certificate.cidCode || null, certificate.notes || null,
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

        db.prepare(`
          INSERT INTO clinical_prescriptions (
            id, tenant_id, patient_id, appointment_id, professional_id,
            prescription_number, items_json, instructions,
            prescription_type, content,
            created_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          prescId, tenantId, appt.patient_id, appointmentId, resolvedProfId,
          prescNum, JSON.stringify([{ text: prescription.content }]), prescription.content,
          prescription.prescriptionType || 'simple', prescription.content,
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

        db.prepare(`
          INSERT INTO clinical_exam_requests (
            id, tenant_id, patient_id, appointment_id, professional_id,
            request_number, exams_list_json, clinical_justification, notes,
            exams_list, clinical_indication,
            created_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          reqId, tenantId, appt.patient_id, appointmentId, resolvedProfId,
          reqNum, JSON.stringify([{ exam: examRequest.examsList }]), examRequest.clinicalIndication || null, examRequest.clinicalIndication || null,
          examRequest.examsList, examRequest.clinicalIndication || null,
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
      currentStage = 'UPDATE_APPOINTMENT_STATUS';
      db.prepare(`
        UPDATE appointments SET
          status = 'completed',
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(appointmentId, tenantId);

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

