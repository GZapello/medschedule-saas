import { Request, Response } from 'express';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';
import { ClinicalExportService } from '../services/clinical-export.service';

export class ClinicalExportController {
  /**
   * Pré-visualização estruturada para a conferência clínica antes da exportação
   */
  static preview(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant obrigatório' });
        return;
      }

      const patientId = (req.query.patientId || req.body.patientId) as string;
      if (!patientId) {
        res.status(400).json({ error: 'ID do paciente é obrigatório para visualização do prontuário.' });
        return;
      }

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({
          error: 'Acesso clínico restrito: você não possui vínculo assistencial com este paciente (Sigilo LGPD).',
          code: 'CLINICAL_PRIVACY_RESTRICTION'
        });
        return;
      }

      const data = ClinicalExportService.fetchFullClinicalData(tenantId, patientId);
      if (!data) {
        res.status(404).json({ error: 'Paciente não encontrado.' });
        return;
      }

      // Monta sumário dos dados disponíveis para a interface de conferência
      const summary = {
        patient: {
          id: data.patient.id,
          name: data.patient.full_name || data.patient.name,
          cpf: data.patient.cpf,
          birthDate: data.patient.birth_date,
          gender: data.patient.gender
        },
        counts: {
          records: data.records?.length || 0,
          prescriptions: data.prescriptions?.length || 0,
          certificates: data.certificates?.length || 0,
          examRequests: data.examRequests?.length || 0,
          exams: data.exams?.length || 0,
          consents: data.consents?.length || 0,
          appointments: data.appointments?.length || 0,
          dentalPlans: data.specialtyModules?.dental?.treatmentPlans?.length || 0,
          physioEvolutions: data.specialtyModules?.physio?.evolutions?.length || 0,
          nutriPlans: data.specialtyModules?.nutri?.mealPlans?.length || 0,
          psicoSessions: data.specialtyModules?.psico?.sessions?.length || 0,
          toProfiles: data.specialtyModules?.to?.profiles?.length || 0,
          ppSessions: data.specialtyModules?.pp?.sessions?.length || 0,
          personalWorkouts: data.specialtyModules?.personal?.workouts?.length || 0,
          esteticProcedures: data.specialtyModules?.estetic?.procedures?.length || 0
        },
        recentRecords: (data.records || []).slice(0, 10).map((r: any) => ({
          id: r.id,
          date: r.session_date,
          title: r.title,
          professionalName: r.professional_name
        }))
      };

      res.json(summary);
    } catch (err: any) {
      console.error('[ClinicalExportController.preview] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar prévia do prontuário: ' + (err?.message || 'Falha interna') });
    }
  }

  /**
   * Download on-demand em múltiplos formatos (DOCX autêntico, PDF oficial, JSON estruturado ou ZIP completo)
   * REGRA CRÍTICA: Geração efêmera em fluxo contínuo. NENHUM arquivo exportado é mantido em disco ou banco.
   */
  static async download(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant obrigatório' });
        return;
      }

      const patientId = (req.query.patientId || req.body.patientId) as string;
      const format = ((req.query.format || req.body.format || 'docx') as string).toLowerCase();
      const order = ((req.query.order || req.body.order || 'desc') as string).toLowerCase() as 'asc' | 'desc';
      const coverNotes = (req.query.coverNotes || req.body.coverNotes) as string;
      const modules = req.query.modules || req.body.modules;
      const dateFrom = (req.query.dateFrom || req.body.dateFrom) as string;
      const dateTo = (req.query.dateTo || req.body.dateTo) as string;

      if (!patientId) {
        res.status(400).json({ error: 'ID do paciente é obrigatório para exportação de prontuário.' });
        return;
      }

      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({
          error: 'Acesso clínico restrito: você não possui vínculo assistencial com este paciente (Sigilo LGPD).',
          code: 'CLINICAL_PRIVACY_RESTRICTION'
        });
        return;
      }

      const data = ClinicalExportService.fetchFullClinicalData(tenantId, patientId);
      if (!data) {
        res.status(404).json({ error: 'Paciente não encontrado.' });
        return;
      }

      const patientNameClean = (data.patient.full_name || data.patient.name || 'Paciente')
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .slice(0, 40);

      const options = { order, coverNotes, modules, dateFrom, dateTo };

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');

      if (format === 'pdf') {
        const pdfBuf = await ClinicalExportService.generatePdfBuffer(data, options);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Prontuario_${patientNameClean}.pdf"`);
        res.send(pdfBuf);
      } else if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="Prontuario_${patientNameClean}.json"`);
        res.send(JSON.stringify(data, null, 2));
      } else if (format === 'zip') {
        const zipBuf = await ClinicalExportService.generateBundleZip(data, options);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="Pacote_Prontuario_${patientNameClean}.zip"`);
        res.send(zipBuf);
      } else {
        // Padrão: DOCX OpenXML Oficial
        const docxBuf = ClinicalExportService.generateDocxBuffer(data, options);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="Prontuario_${patientNameClean}.docx"`);
        res.send(docxBuf);
      }

      logAudit(req, 'EXPORT_CLINICAL_RECORDS', 'patients', patientId, { format, order });
    } catch (err: any) {
      console.error('[ClinicalExportController.download] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar exportação: ' + (err?.message || 'Falha interna') });
    }
  }

  /**
   * Revisão de formatação formal de folha de rosto e anotações com IA
   * REGRA INEGOCIÁVEL: Não inventa dados clínicos, diagnósticos ou condutas.
   */
  static async aiFormatReview(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant obrigatório' });
        return;
      }

      const { text } = req.body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Texto para revisão é obrigatório.' });
        return;
      }

      const reviewed = await ClinicalExportService.reviewClinicalFormattingWithAi(text);
      res.json({
        originalText: text,
        reviewedText: reviewed
      });
    } catch (err: any) {
      console.error('[ClinicalExportController.aiFormatReview] Erro:', err);
      res.status(500).json({ error: 'Erro ao revisar formatação com IA: ' + (err?.message || 'Falha interna') });
    }
  }

  /**
   * Exportação em lote para administradores da clínica (Pacote ZIP com manifest.json)
   */
  static async batchDownload(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant obrigatório' });
        return;
      }

      const { patientIds, dateFrom, dateTo, format, coverNotes, modules } = req.body || req.query;
      const parsedPatientIds = Array.isArray(patientIds)
        ? patientIds
        : (typeof patientIds === 'string' && patientIds.trim() ? patientIds.split(',') : undefined);

      const zipBuf = await ClinicalExportService.generateBatchZip(tenantId, {
        patientIds: parsedPatientIds,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        format: (format as any) || 'docx',
        coverNotes: coverNotes as string,
        modules
      });

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="Lote_Prontuarios_Clinica_${new Date().toISOString().slice(0, 10)}.zip"`);
      res.send(zipBuf);

      logAudit(req, 'EXPORT_BATCH_CLINICAL_RECORDS', 'tenants', tenantId, { count: parsedPatientIds?.length || 'all' });
    } catch (err: any) {
      console.error('[ClinicalExportController.batchDownload] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar exportação em lote: ' + (err?.message || 'Falha interna') });
    }
  }
}
