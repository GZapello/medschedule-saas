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
        res.status(400).json({ error: 'Profissional emissor não identificado' });
        return;
      }

      const id = 'crt-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO clinical_certificates (
          id, tenant_id, patient_id, appointment_id, professional_id,
          certificate_type, days_off, start_date, cid_code, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, appointmentId || null, resolvedProfId,
        certificateType, daysOff || null, startDate || null, cidCode || null, notes || null
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
          pr.name as professional_name, pr.registration_type, pr.registration_number, pr.specialty,
          t.name as clinic_name, t.document as clinic_cnpj, t.phone as clinic_phone, t.email as clinic_email,
          t.address_street, t.address_number, t.address_neighborhood, t.address_city, t.address_state, t.logo_url
        FROM clinical_certificates c
        JOIN patients p ON p.id = c.patient_id
        JOIN professionals pr ON pr.id = c.professional_id
        JOIN tenants t ON t.id = c.tenant_id
        WHERE c.id = ? AND c.tenant_id = ?
      `).get(id, tenantId);

      if (!cert) {
        res.status(404).json({ error: 'Atestado não encontrado' });
        return;
      }

      // Template da clínica
      const template = db.prepare(`
        SELECT * FROM clinic_document_templates WHERE tenant_id = ? AND document_type = 'certificate'
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
        res.status(400).json({ error: 'Profissional emissor não identificado' });
        return;
      }

      const id = 'prc-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO clinical_prescriptions (
          id, tenant_id, patient_id, appointment_id, professional_id,
          prescription_type, content
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, appointmentId || null, resolvedProfId,
        prescriptionType || 'simple', content
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
          prof.name as professional_name, prof.registration_type, prof.registration_number, prof.specialty,
          t.name as clinic_name, t.document as clinic_cnpj, t.phone as clinic_phone, t.email as clinic_email,
          t.address_street, t.address_number, t.address_neighborhood, t.address_city, t.address_state, t.logo_url
        FROM clinical_prescriptions pr
        JOIN patients p ON p.id = pr.patient_id
        JOIN professionals prof ON prof.id = pr.professional_id
        JOIN tenants t ON t.id = pr.tenant_id
        WHERE pr.id = ? AND pr.tenant_id = ?
      `).get(id, tenantId);

      if (!presc) {
        res.status(404).json({ error: 'Receituário não encontrado' });
        return;
      }

      const template = db.prepare(`
        SELECT * FROM clinic_document_templates WHERE tenant_id = ? AND document_type = 'prescription'
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
      const { patientId, appointmentId, professionalId, examsList, clinicalIndication } = req.body;

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
        res.status(400).json({ error: 'Profissional solicitante não identificado' });
        return;
      }

      const id = 'erq-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO clinical_exam_requests (
          id, tenant_id, patient_id, appointment_id, professional_id,
          exams_list, clinical_indication
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, appointmentId || null, resolvedProfId,
        examsList, clinicalIndication || null
      );

      logAudit(req, 'CREATE_EXAM_REQUEST', 'clinical_exam_requests', id, { patientId });
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
          prof.name as professional_name, prof.registration_type, prof.registration_number, prof.specialty,
          t.name as clinic_name, t.document as clinic_cnpj, t.phone as clinic_phone, t.email as clinic_email,
          t.address_street, t.address_number, t.address_neighborhood, t.address_city, t.address_state, t.logo_url
        FROM clinical_exam_requests er
        JOIN patients p ON p.id = er.patient_id
        JOIN professionals prof ON prof.id = er.professional_id
        JOIN tenants t ON t.id = er.tenant_id
        WHERE er.id = ? AND er.tenant_id = ?
      `).get(id, tenantId);

      if (!doc) {
        res.status(404).json({ error: 'Pedido de exame não encontrado' });
        return;
      }

      const template = db.prepare(`
        SELECT * FROM clinic_document_templates WHERE tenant_id = ? AND document_type = 'exam_request'
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
      const { documentType, title, headerHtml, footerHtml, showLogo, showClinicAddress, showProfessionalRegistration, customCss } = req.body;

      if (!documentType || !title) {
        res.status(400).json({ error: 'Tipo e título do modelo são obrigatórios' });
        return;
      }

      const existing = db.prepare('SELECT id FROM clinic_document_templates WHERE tenant_id = ? AND document_type = ?').get(tenantId, documentType) as { id: string } | undefined;

      if (existing) {
        db.prepare(`
          UPDATE clinic_document_templates SET
            title = ?,
            header_html = ?,
            footer_html = ?,
            show_logo = ?,
            show_clinic_address = ?,
            show_professional_registration = ?,
            custom_css = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(
          title, headerHtml || null, footerHtml || null,
          showLogo ? 1 : 0, showClinicAddress !== false ? 1 : 0, showProfessionalRegistration !== false ? 1 : 0,
          customCss || null, existing.id, tenantId
        );
        res.json({ id: existing.id, message: 'Modelo de documento atualizado com sucesso' });
      } else {
        const id = 'tmpl-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO clinic_document_templates (
            id, tenant_id, document_type, title, header_html, footer_html,
            show_logo, show_clinic_address, show_professional_registration, custom_css
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, tenantId, documentType, title, headerHtml || null, footerHtml || null,
          showLogo ? 1 : 0, showClinicAddress !== false ? 1 : 0, showProfessionalRegistration !== false ? 1 : 0,
          customCss || null
        );
        res.status(201).json({ id, message: 'Modelo de documento cadastrado com sucesso' });
      }
    } catch (err: any) {
      console.error('[DocumentsController.upsertTemplate] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar modelo de documento' });
    }
  }

  // 5. FLUXO COMPLETO DE FINALIZAÇÃO DE CONSULTA
  static finishConsultation(req: Request, res: Response): void {
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

      const appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?').get(appointmentId, tenantId) as any;
      if (!appt) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      let resolvedProfId = appt.professional_id;
      if (!resolvedProfId && req.user) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ?').get(req.user.userId) as { id: string } | undefined;
        if (prof) resolvedProfId = prof.id;
      }

      const generatedDocs: any = {};

      // 1. Grava evolução do prontuário, se preenchida
      if (evolution && evolution.clinicalEvolution) {
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
        const certId = 'crt-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO clinical_certificates (
            id, tenant_id, patient_id, appointment_id, professional_id,
            certificate_type, days_off, start_date, cid_code, notes
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          certId, tenantId, appt.patient_id, appointmentId, resolvedProfId,
          certificate.certificateType, certificate.daysOff || null, certificate.startDate || null,
          certificate.cidCode || null, certificate.notes || null
        );
        generatedDocs.certificateId = certId;
      }

      // 3. Emite Receituário, se preenchido
      if (prescription && prescription.content) {
        const prescId = 'prc-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO clinical_prescriptions (
            id, tenant_id, patient_id, appointment_id, professional_id,
            prescription_type, content
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          prescId, tenantId, appt.patient_id, appointmentId, resolvedProfId,
          prescription.prescriptionType || 'simple', prescription.content
        );
        generatedDocs.prescriptionId = prescId;
      }

      // 4. Emite Pedido de Exames, se preenchido
      if (examRequest && examRequest.examsList) {
        const reqId = 'erq-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO clinical_exam_requests (
            id, tenant_id, patient_id, appointment_id, professional_id,
            exams_list, clinical_indication
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          reqId, tenantId, appt.patient_id, appointmentId, resolvedProfId,
          examRequest.examsList, examRequest.clinicalIndication || null
        );
        generatedDocs.examRequestId = reqId;
      }

      // 5. Agenda Retorno, se informado
      if (returnAppointment && returnAppointment.startTime && returnAppointment.endTime) {
        const retApptId = 'apt-' + uuidv4().slice(0, 8);
        const year = new Date().getFullYear();
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
        db.prepare(`
          UPDATE appointments SET
            referred_by_professional_id = ?,
            referral_reason = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(referral.referredByProfessionalId || null, referral.referralReason || null, appointmentId, tenantId);
      }

      // 7. Marca o agendamento como finalizado / completed
      db.prepare(`
        UPDATE appointments SET
          status = 'completed',
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(appointmentId, tenantId);

      db.prepare(`
        INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
        VALUES (?, ?, ?, 'completed', ?, 'Consulta finalizada com sucesso')
      `).run(uuidv4(), appointmentId, appt.status, req.user ? req.user.name : 'Profissional');

      logAudit(req, 'FINISH_CONSULTATION', 'appointments', appointmentId, { generatedDocs });
      res.json({
        message: 'Consulta finalizada com sucesso!',
        generatedDocs
      });
    } catch (err: any) {
      console.error('[DocumentsController.finishConsultation] Erro:', err);
      res.status(500).json({ error: 'Erro ao finalizar consulta' });
    }
  }
}
