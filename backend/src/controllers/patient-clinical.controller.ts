import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';

export class PatientClinicalController {
  // 1. LINHA DO TEMPO CRONOLÓGICA 360° DO PACIENTE
  static getTimeline(req: Request, res: Response): void {
    try {
      const patientId = req.params.id as string;
      const tenantId = req.tenantId;
      const { type, startDate, endDate, professionalId, search } = req.query;

      if (!tenantId) {
        res.status(400).json({ error: 'Tenant obrigatório' });
        return;
      }

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({
          error: 'Acesso clínico restrito: profissional não possui consulta agendada, histórico de atendimento ou encaminhamento ativo vinculado a este paciente (Sigilo LGPD).',
          code: 'CLINICAL_PRIVACY_RESTRICTION'
        });
        return;
      }

      const timeline: any[] = [];

      // A. Consultas / Agendamentos
      const apptsStmt = db.prepare(`
        SELECT 
          a.id, a.appointment_number, a.start_time as date, a.status, a.modality,
          a.patient_notes, a.internal_notes, a.cancellation_reason, a.cancellation_reason_category,
          p.name as professional_name, p.id as professional_id,
          s.name as service_name,
          ci.name as insurance_name
        FROM appointments a
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        LEFT JOIN clinic_insurances ci ON ci.id = a.insurance_id
        WHERE a.patient_id = ? AND a.tenant_id = ?
      `);
      const appts = apptsStmt.all(patientId, tenantId) as any[];
      for (const a of appts) {
        timeline.push({
          id: a.id,
          type: 'appointment',
          title: `Consulta: ${a.service_name}`,
          description: `Status: ${a.status} | Modalidade: ${a.modality || 'Presencial'} | Convênio: ${a.insurance_name || 'Particular'}`,
          details: {
            appointmentNumber: a.appointment_number,
            status: a.status,
            modality: a.modality,
            notes: a.internal_notes || a.patient_notes,
            cancellationReason: a.cancellation_reason,
            cancellationCategory: a.cancellation_reason_category,
            insuranceName: a.insurance_name
          },
          professionalName: a.professional_name,
          professionalId: a.professional_id,
          date: a.date
        });
      }

      // B. Prontuários e Evoluções Médicas
      const recordsStmt = db.prepare(`
        SELECT 
          r.id, r.session_date as date, r.title, r.clinical_evolution, r.technical_notes,
          r.is_sealed, r.created_at,
          p.name as professional_name, p.id as professional_id
        FROM records r
        JOIN professionals p ON p.id = r.professional_id
        WHERE r.patient_id = ? AND r.tenant_id = ?
      `);
      const records = recordsStmt.all(patientId, tenantId) as any[];
      for (const r of records) {
        timeline.push({
          id: r.id,
          type: 'medical_record',
          title: r.title || 'Evolução Clínica',
          description: r.clinical_evolution ? r.clinical_evolution.slice(0, 160) + (r.clinical_evolution.length > 160 ? '...' : '') : 'Registro clínico sem evolução textual',
          details: {
            title: r.title,
            clinicalEvolution: r.clinical_evolution,
            technicalNotes: r.technical_notes,
            isSealed: Boolean(r.is_sealed)
          },
          professionalName: r.professional_name,
          professionalId: r.professional_id,
          date: r.date || r.created_at
        });
      }

      // C. Anamneses Respondidas
      const anamnesisStmt = db.prepare(`
        SELECT 
          pa.id, pa.title, pa.version, pa.created_at as date,
          p.name as professional_name, p.id as professional_id
        FROM patient_anamnesis pa
        LEFT JOIN professionals p ON p.id = pa.professional_id
        WHERE pa.patient_id = ? AND pa.tenant_id = ?
      `);
      const anamneses = anamnesisStmt.all(patientId, tenantId) as any[];
      for (const an of anamneses) {
        timeline.push({
          id: an.id,
          type: 'anamnesis',
          title: `Anamnese v${an.version}: ${an.title}`,
          description: `Avaliação clínica preenchida (versão ${an.version})`,
          details: { version: an.version },
          professionalName: an.professional_name || 'Profissional da Clínica',
          professionalId: an.professional_id,
          date: an.date
        });
      }

      // D. Atestados Médicos
      const certsStmt = db.prepare(`
        SELECT 
          c.id, c.certificate_type, c.days_off, c.start_date, c.created_at as date,
          p.name as professional_name, p.id as professional_id
        FROM clinical_certificates c
        JOIN professionals p ON p.id = c.professional_id
        WHERE c.patient_id = ? AND c.tenant_id = ?
      `);
      const certs = certsStmt.all(patientId, tenantId) as any[];
      for (const c of certs) {
        timeline.push({
          id: c.id,
          type: 'certificate',
          title: `Atestado: ${c.certificate_type === 'rest' ? 'Afastamento' : c.certificate_type === 'attendance' ? 'Comparecimento' : 'Aptidão Física'}`,
          description: c.days_off ? `${c.days_off} dias de repouso a partir de ${c.start_date || 'hoje'}` : 'Comprovante de atendimento emitido',
          details: c,
          professionalName: c.professional_name,
          professionalId: c.professional_id,
          date: c.date
        });
      }

      // E. Receituários
      const prescStmt = db.prepare(`
        SELECT 
          pr.id, pr.prescription_type, pr.content, pr.created_at as date,
          p.name as professional_name, p.id as professional_id
        FROM clinical_prescriptions pr
        JOIN professionals p ON p.id = pr.professional_id
        WHERE pr.patient_id = ? AND pr.tenant_id = ?
      `);
      const prescriptions = prescStmt.all(patientId, tenantId) as any[];
      for (const pr of prescriptions) {
        timeline.push({
          id: pr.id,
          type: 'prescription',
          title: `Receituário (${pr.prescription_type === 'control' ? 'Controle Especial' : 'Simples'})`,
          description: pr.content ? pr.content.slice(0, 140) + '...' : 'Prescrição médica emitida',
          details: pr,
          professionalName: pr.professional_name,
          professionalId: pr.professional_id,
          date: pr.date
        });
      }

      // F. Solicitações de Exames
      const examReqStmt = db.prepare(`
        SELECT 
          er.id, er.exams_list, er.clinical_indication, er.created_at as date,
          p.name as professional_name, p.id as professional_id
        FROM clinical_exam_requests er
        JOIN professionals p ON p.id = er.professional_id
        WHERE er.patient_id = ? AND er.tenant_id = ?
      `);
      const examReqs = examReqStmt.all(patientId, tenantId) as any[];
      for (const er of examReqs) {
        timeline.push({
          id: er.id,
          type: 'exam_request',
          title: 'Solicitação de Exames',
          description: er.exams_list ? er.exams_list.slice(0, 140) : 'Pedido de exame laboratorial/imagem',
          details: er,
          professionalName: er.professional_name,
          professionalId: er.professional_id,
          date: er.date
        });
      }

      // G. Exames e Arquivos Anexados
      const examsStmt = db.prepare(`
        SELECT 
          pe.id, pe.title, pe.exam_date as date, pe.exam_type, pe.file_name, pe.file_url, pe.ai_extracted_text, pe.ai_reviewed,
          p.name as professional_name, p.id as professional_id
        FROM patient_exams pe
        LEFT JOIN professionals p ON p.id = pe.professional_id
        WHERE pe.patient_id = ? AND pe.tenant_id = ?
      `);
      const exams = examsStmt.all(patientId, tenantId) as any[];
      for (const ex of exams) {
        timeline.push({
          id: ex.id,
          type: 'exam_file',
          title: `Exame: ${ex.title}`,
          description: `Tipo: ${ex.exam_type || 'Geral'} | Arquivo: ${ex.file_name || 'Anexo'}`,
          details: ex,
          professionalName: ex.professional_name || 'Exame Externo / Laboratório',
          professionalId: ex.professional_id,
          date: ex.date || new Date().toISOString()
        });
      }

      // H. Termos de Consentimento
      const consentsStmt = db.prepare(`
        SELECT 
          cs.id, cs.title, cs.consent_type, cs.signed_at as date, cs.is_revoked,
          p.name as professional_name, p.id as professional_id
        FROM patient_consents cs
        LEFT JOIN professionals p ON p.id = cs.professional_id
        WHERE cs.patient_id = ? AND cs.tenant_id = ?
      `);
      const consents = consentsStmt.all(patientId, tenantId) as any[];
      for (const cs of consents) {
        timeline.push({
          id: cs.id,
          type: 'consent',
          title: `Consentimento: ${cs.title}`,
          description: `Assinado em ${cs.date ? new Date(cs.date).toLocaleDateString('pt-BR') : 'Data n/d'} ${cs.is_revoked ? '(Revogado)' : '(Vigente)'}`,
          details: cs,
          professionalName: cs.professional_name || 'Clínica',
          professionalId: cs.professional_id,
          date: cs.date
        });
      }

      // Filtros em memória
      let filtered = timeline;

      if (type && typeof type === 'string' && type !== 'all') {
        filtered = filtered.filter(item => item.type === type);
      }

      if (professionalId && typeof professionalId === 'string' && professionalId !== 'all') {
        filtered = filtered.filter(item => item.professionalId === professionalId);
      }

      if (startDate && typeof startDate === 'string') {
        filtered = filtered.filter(item => item.date && item.date >= startDate);
      }

      if (endDate && typeof endDate === 'string') {
        filtered = filtered.filter(item => item.date && item.date <= endDate);
      }

      if (search && typeof search === 'string' && search.trim().length > 0) {
        const term = search.toLowerCase().trim();
        filtered = filtered.filter(item => 
          (item.title && item.title.toLowerCase().includes(term)) ||
          (item.description && item.description.toLowerCase().includes(term)) ||
          (item.professionalName && item.professionalName.toLowerCase().includes(term))
        );
      }

      // Ordena por data decrescente
      filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      logAudit(req, 'VIEW_PATIENT_TIMELINE', 'patients', patientId, { totalEvents: filtered.length });
      res.json(filtered);
    } catch (err: any) {
      console.error('[PatientClinicalController.getTimeline] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar linha do tempo do paciente' });
    }
  }

  // 2. ALERGIAS
  static listAllergies(req: Request, res: Response): void {
    try {
      const { id: patientId } = req.params;
      const tenantId = req.tenantId;

      const patient = db.prepare('SELECT allergies_status FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as { allergies_status: string } | undefined;
      const allergies = db.prepare(`
        SELECT * FROM patient_allergies
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at DESC
      `).all(patientId, tenantId);

      res.json({
        allergiesStatus: patient?.allergies_status || 'not_informed',
        allergies
      });
    } catch (err: any) {
      console.error('[PatientClinicalController.listAllergies] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar alergias do paciente' });
    }
  }

  static updateAllergyStatus(req: Request, res: Response): void {
    try {
      const { id: patientId } = req.params;
      const tenantId = req.tenantId;
      const { status } = req.body; // 'not_informed', 'none_known', 'has_allergies'

      if (!['not_informed', 'none_known', 'has_allergies'].includes(status)) {
        res.status(400).json({ error: 'Status de alergia inválido' });
        return;
      }

      db.prepare(`
        UPDATE patients SET allergies_status = ?, updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(status, patientId, tenantId);

      logAudit(req, 'UPDATE_ALLERGY_STATUS', 'patients', patientId, { status });
      res.json({ message: 'Status de alergia atualizado com sucesso', status });
    } catch (err: any) {
      console.error('[PatientClinicalController.updateAllergyStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar status de alergia' });
    }
  }

  static addAllergy(req: Request, res: Response): void {
    try {
      const { id: patientId } = req.params;
      const tenantId = req.tenantId;
      const { substance, reactionType, severity, notes, identifiedAt } = req.body;

      if (!substance) {
        res.status(400).json({ error: 'Substância/Alergeno é obrigatório' });
        return;
      }

      const id = 'alg-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO patient_allergies (id, tenant_id, patient_id, substance, reaction_type, severity, notes, identified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, patientId, substance, reactionType || null, severity || 'moderate', notes || null, identifiedAt || null);

      // Marca paciente com has_allergies
      db.prepare(`
        UPDATE patients SET allergies_status = 'has_allergies', updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(patientId, tenantId);

      logAudit(req, 'ADD_ALLERGY', 'patient_allergies', id, { patientId, substance, severity });
      res.status(201).json({ id, message: 'Alergia registrada com sucesso' });
    } catch (err: any) {
      console.error('[PatientClinicalController.addAllergy] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar alergia' });
    }
  }

  static deleteAllergy(req: Request, res: Response): void {
    try {
      const { id: patientId, allergyId } = req.params;
      const tenantId = req.tenantId;

      db.prepare('DELETE FROM patient_allergies WHERE id = ? AND patient_id = ? AND tenant_id = ?').run(allergyId, patientId, tenantId);
      
      const count = (db.prepare('SELECT COUNT(*) as c FROM patient_allergies WHERE patient_id = ? AND tenant_id = ?').get(patientId, tenantId) as any)?.c || 0;
      if (count === 0) {
        db.prepare("UPDATE patients SET allergies_status = 'none_known' WHERE id = ? AND tenant_id = ?").run(patientId, tenantId);
      }

      logAudit(req, 'DELETE_ALLERGY', 'patient_allergies', allergyId, { patientId });
      res.json({ message: 'Alergia removida com sucesso' });
    } catch (err: any) {
      console.error('[PatientClinicalController.deleteAllergy] Erro:', err);
      res.status(500).json({ error: 'Erro ao remover alergia' });
    }
  }

  // 3. MEDICAMENTOS
  static listMedications(req: Request, res: Response): void {
    try {
      const { id: patientId } = req.params;
      const tenantId = req.tenantId;

      const medications = db.prepare(`
        SELECT * FROM patient_medications
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY status ASC, created_at DESC
      `).all(patientId, tenantId);

      res.json(medications);
    } catch (err: any) {
      console.error('[PatientClinicalController.listMedications] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar medicamentos' });
    }
  }

  static addMedication(req: Request, res: Response): void {
    try {
      const { id: patientId } = req.params;
      const tenantId = req.tenantId;
      const { medicationName, dosage, frequency, route, startDate, endDate, status, prescriberName, notes } = req.body;

      if (!medicationName) {
        res.status(400).json({ error: 'Nome do medicamento é obrigatório' });
        return;
      }

      const id = 'med-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO patient_medications (
          id, tenant_id, patient_id, medication_name, dosage, frequency,
          route, start_date, end_date, status, prescriber_name, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, medicationName, dosage || null, frequency || null,
        route || 'oral', startDate || null, endDate || null, status || 'active',
        prescriberName || null, notes || null
      );

      logAudit(req, 'ADD_MEDICATION', 'patient_medications', id, { patientId, medicationName });
      res.status(201).json({ id, message: 'Medicamento registrado com sucesso' });
    } catch (err: any) {
      console.error('[PatientClinicalController.addMedication] Erro:', err);
      res.status(500).json({ error: 'Erro ao adicionar medicamento' });
    }
  }

  static updateMedication(req: Request, res: Response): void {
    try {
      const { id: patientId, medicationId } = req.params;
      const tenantId = req.tenantId;
      const { dosage, frequency, route, startDate, endDate, status, prescriberName, notes } = req.body;

      db.prepare(`
        UPDATE patient_medications SET
          dosage = COALESCE(?, dosage),
          frequency = COALESCE(?, frequency),
          route = COALESCE(?, route),
          start_date = COALESCE(?, start_date),
          end_date = COALESCE(?, end_date),
          status = COALESCE(?, status),
          prescriber_name = COALESCE(?, prescriber_name),
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
        WHERE id = ? AND patient_id = ? AND tenant_id = ?
      `).run(dosage, frequency, route, startDate, endDate, status, prescriberName, notes, medicationId, patientId, tenantId);

      logAudit(req, 'UPDATE_MEDICATION', 'patient_medications', medicationId, { patientId, status });
      res.json({ message: 'Medicamento atualizado com sucesso' });
    } catch (err: any) {
      console.error('[PatientClinicalController.updateMedication] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar medicamento' });
    }
  }

  static deleteMedication(req: Request, res: Response): void {
    try {
      const { id: patientId, medicationId } = req.params;
      const tenantId = req.tenantId;

      db.prepare('DELETE FROM patient_medications WHERE id = ? AND patient_id = ? AND tenant_id = ?').run(medicationId, patientId, tenantId);
      logAudit(req, 'DELETE_MEDICATION', 'patient_medications', medicationId, { patientId });
      res.json({ message: 'Medicamento removido com sucesso' });
    } catch (err: any) {
      console.error('[PatientClinicalController.deleteMedication] Erro:', err);
      res.status(500).json({ error: 'Erro ao remover medicamento' });
    }
  }

  // 4. ANAMNESE VERSIONADA
  static listAnamnesis(req: Request, res: Response): void {
    try {
      const patientId = req.params.id as string;
      const tenantId = req.tenantId;

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({
          error: 'Acesso clínico restrito: sem vínculo assistencial ativo com o paciente (Sigilo LGPD).',
          code: 'CLINICAL_PRIVACY_RESTRICTION'
        });
        return;
      }

      const items = db.prepare(`
        SELECT pa.*, p.name as professional_name
        FROM patient_anamnesis pa
        LEFT JOIN professionals p ON p.id = pa.professional_id
        WHERE pa.patient_id = ? AND pa.tenant_id = ?
        ORDER BY pa.version DESC
      `).all(patientId, tenantId);

      res.json(items);
    } catch (err: any) {
      console.error('[PatientClinicalController.listAnamnesis] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar anamneses' });
    }
  }

  static getAnamnesisById(req: Request, res: Response): void {
    try {
      const patientId = req.params.id as string;
      const anamnesisId = req.params.anamnesisId as string;
      const tenantId = req.tenantId;

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito (Sigilo LGPD)' });
        return;
      }

      const item = db.prepare(`
        SELECT pa.*, p.name as professional_name
        FROM patient_anamnesis pa
        LEFT JOIN professionals p ON p.id = pa.professional_id
        WHERE pa.id = ? AND pa.patient_id = ? AND pa.tenant_id = ?
      `).get(anamnesisId, patientId, tenantId);

      if (!item) {
        res.status(404).json({ error: 'Anamnese não encontrada' });
        return;
      }

      res.json(item);
    } catch (err: any) {
      console.error('[PatientClinicalController.getAnamnesisById] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar anamnese' });
    }
  }

  static createAnamnesis(req: Request, res: Response): void {
    try {
      const patientId = req.params.id as string;
      const tenantId = req.tenantId;
      const { title, questionnaireAnswersJson, professionalId, notes } = req.body;

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito (Sigilo LGPD)' });
        return;
      }

      if (!title || !questionnaireAnswersJson) {
        res.status(400).json({ error: 'Título e questionário respondido são obrigatórios' });
        return;
      }

      // Calcula próxima versão
      const maxVersionRow = db.prepare(`
        SELECT MAX(version) as max_v FROM patient_anamnesis
        WHERE patient_id = ? AND tenant_id = ?
      `).get(patientId, tenantId) as { max_v: number | null };

      const nextVersion = (maxVersionRow?.max_v || 0) + 1;
      const id = 'anm-' + uuidv4().slice(0, 8);

      let resolvedProfId = professionalId;
      if (!resolvedProfId && req.user) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ?').get(req.user.userId) as { id: string } | undefined;
        if (prof) resolvedProfId = prof.id;
      }

      db.prepare(`
        INSERT INTO patient_anamnesis (
          id, tenant_id, patient_id, professional_id, version, title, questionnaire_answers_json, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        tenantId,
        patientId,
        resolvedProfId || null,
        nextVersion,
        title,
        typeof questionnaireAnswersJson === 'string' ? questionnaireAnswersJson : JSON.stringify(questionnaireAnswersJson),
        notes || null
      );

      logAudit(req, 'CREATE_ANAMNESIS', 'patient_anamnesis', id, { patientId, version: nextVersion });
      res.status(201).json({ id, version: nextVersion, message: `Anamnese versão ${nextVersion} salva com sucesso` });
    } catch (err: any) {
      console.error('[PatientClinicalController.createAnamnesis] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar anamnese' });
    }
  }

  // 5. EXAMES E IMAGENS COM EXTRAÇÃO IA EM DRAFT
  static listExams(req: Request, res: Response): void {
    try {
      const patientId = req.params.id as string;
      const tenantId = req.tenantId;

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito (Sigilo LGPD)' });
        return;
      }

      const exams = db.prepare(`
        SELECT pe.*, p.name as professional_name
        FROM patient_exams pe
        LEFT JOIN professionals p ON p.id = pe.professional_id
        WHERE pe.patient_id = ? AND pe.tenant_id = ?
        ORDER BY pe.exam_date DESC, pe.created_at DESC
      `).all(patientId, tenantId);

      res.json(exams);
    } catch (err: any) {
      console.error('[PatientClinicalController.listExams] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar exames' });
    }
  }

  static uploadExam(req: Request, res: Response): void {
    try {
      const patientId = req.params.id as string;
      const tenantId = req.tenantId;
      const { title, examDate, examType, fileName, fileUrl, fileType, rawText, professionalId, notes } = req.body;

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito (Sigilo LGPD)' });
        return;
      }

      if (!title || !fileUrl) {
        res.status(400).json({ error: 'Título do exame e arquivo são obrigatórios' });
        return;
      }

      const id = 'exm-' + uuidv4().slice(0, 8);

      // Simulação estruturada de IA para extração de dados clínicos (Draft para conferência médica)
      let aiDraftText = rawText || '';
      if (!aiDraftText && fileName) {
        aiDraftText = `[Rascunho de IA para revisão médica]: Documento identificado como "${fileName}". Parâmetros principais aguardando validação do profissional de saúde.`;
      }

      db.prepare(`
        INSERT INTO patient_exams (
          id, tenant_id, patient_id, appointment_id, professional_id,
          title, exam_date, exam_type, file_url, file_name, file_type,
          ai_extracted_text, ai_reviewed, notes
        )
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        id,
        tenantId,
        patientId,
        professionalId || null,
        title,
        examDate || new Date().toISOString().split('T')[0],
        examType || 'Laboratorial',
        fileUrl,
        fileName || 'arquivo_anexo',
        fileType || 'application/pdf',
        aiDraftText,
        notes || null
      );

      logAudit(req, 'UPLOAD_PATIENT_EXAM', 'patient_exams', id, { patientId, title, fileName });
      res.status(201).json({ id, aiExtractedText: aiDraftText, message: 'Exame anexado com sucesso' });
    } catch (err: any) {
      console.error('[PatientClinicalController.uploadExam] Erro:', err);
      res.status(500).json({ error: 'Erro ao anexar exame' });
    }
  }

  static reviewExam(req: Request, res: Response): void {
    try {
      const patientId = req.params.id as string;
      const examId = req.params.examId as string;
      const tenantId = req.tenantId;
      const { aiExtractedText, notes } = req.body;

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito (Sigilo LGPD)' });
        return;
      }

      db.prepare(`
        UPDATE patient_exams SET
          ai_extracted_text = COALESCE(?, ai_extracted_text),
          ai_reviewed = 1,
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
        WHERE id = ? AND patient_id = ? AND tenant_id = ?
      `).run(aiExtractedText || null, notes || null, examId, patientId, tenantId);

      logAudit(req, 'REVIEW_PATIENT_EXAM', 'patient_exams', examId, { patientId });
      res.json({ message: 'Extração de exame revisada e validada pelo profissional' });
    } catch (err: any) {
      console.error('[PatientClinicalController.reviewExam] Erro:', err);
      res.status(500).json({ error: 'Erro ao revisar laudo do exame' });
    }
  }

  static deleteExam(req: Request, res: Response): void {
    try {
      const { id: patientId, examId } = req.params;
      const tenantId = req.tenantId;

      db.prepare('DELETE FROM patient_exams WHERE id = ? AND patient_id = ? AND tenant_id = ?').run(examId, patientId, tenantId);
      logAudit(req, 'DELETE_PATIENT_EXAM', 'patient_exams', examId, { patientId });
      res.json({ message: 'Exame removido com sucesso' });
    } catch (err: any) {
      console.error('[PatientClinicalController.deleteExam] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir exame' });
    }
  }

  // 6. TERMOS DE CONSENTIMENTO
  static listConsents(req: Request, res: Response): void {
    try {
      const { id: patientId } = req.params;
      const tenantId = req.tenantId;

      const consents = db.prepare(`
        SELECT pc.*, p.name as professional_name
        FROM patient_consents pc
        LEFT JOIN professionals p ON p.id = pc.professional_id
        WHERE pc.patient_id = ? AND pc.tenant_id = ?
        ORDER BY pc.signed_at DESC
      `).all(patientId, tenantId);

      res.json(consents);
    } catch (err: any) {
      console.error('[PatientClinicalController.listConsents] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar termos de consentimento' });
    }
  }

  static createConsent(req: Request, res: Response): void {
    try {
      const { id: patientId } = req.params;
      const tenantId = req.tenantId;
      const { title, consentType, content, signatureDataUrl, signedByName, signedByCpf, professionalId } = req.body;

      if (!title || !content) {
        res.status(400).json({ error: 'Título e conteúdo do termo são obrigatórios' });
        return;
      }

      const id = 'cst-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO patient_consents (
          id, tenant_id, patient_id, professional_id, title, consent_type, content,
          signature_data_url, signed_by_name, signed_by_cpf, signed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        id, tenantId, patientId, professionalId || null, title, consentType || 'telemedicine',
        content, signatureDataUrl || null, signedByName || 'Paciente', signedByCpf || null
      );

      logAudit(req, 'CREATE_PATIENT_CONSENT', 'patient_consents', id, { patientId, title, consentType });
      res.status(201).json({ id, message: 'Termo de consentimento registrado com sucesso' });
    } catch (err: any) {
      console.error('[PatientClinicalController.createConsent] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar consentimento' });
    }
  }
}
