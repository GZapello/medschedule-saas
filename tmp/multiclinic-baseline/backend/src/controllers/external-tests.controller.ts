import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { db } from '../config/database';
import { getSigningSecret, canonicalizeClinicId } from './file.controller';

export class ExternalTestsController {
  /**
   * GET /v1/external-tests
   * Query params:
   * - patientId (required)
   * - moduleType (optional: ZemdaPsico, ZemdaFono, ZemdaTO, etc.)
   */
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const patientId = String(req.query.patientId || req.params.patientId || '').trim();
      const moduleType = req.query.moduleType ? String(req.query.moduleType).trim() : null;

      if (!tenantId || !patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

      // Valida vínculo do paciente com o tenant
      const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
      if (!patient) {
        res.status(404).json({ error: 'Paciente não encontrado para esta clínica' });
        return;
      }

      let query = `
        SELECT 
          t.*,
          p.name as prof_joined_name,
          fa.original_filename as att_filename,
          fa.mime_type as att_mimetype,
          fa.file_size as att_size,
          fa.object_key as att_object_key,
          fa.storage_provider as att_storage_provider
        FROM clinical_external_tests t
        LEFT JOIN professionals p ON p.id = t.professional_id
        LEFT JOIN file_attachments fa ON fa.id = t.file_id
        WHERE t.patient_id = ? AND t.tenant_id = ?
      `;
      const queryParams: any[] = [patientId, tenantId];

      if (moduleType) {
        query += ' AND t.module_type = ?';
        queryParams.push(moduleType);
      }

      query += ' ORDER BY t.test_date DESC, t.created_at DESC';

      const rows = db.prepare(query).all(...queryParams) as any[];

      const signingSecret = getSigningSecret();
      const workerBaseUrl = (process.env.ZEMDA_FILES_WORKER_URL || 'https://zemda-files-worker.gabrielkz1510.workers.dev').replace(/\/+$/, '');
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const sanitizedClinicId = canonicalizeClinicId(tenantId);

      const tests = rows.map(r => {
        let freshFileUrl = r.file_url || null;

        // Se tem anexo registrado no R2 com object_key, gera URL assinada temporária (5 min) do Worker
        if (r.att_object_key) {
          const readPayload = {
            action: 'read',
            clinicId: sanitizedClinicId,
            objectKey: r.att_object_key,
            exp: nowInSeconds + 300
          };
          const payloadBase64 = Buffer.from(JSON.stringify(readPayload)).toString('base64url');
          const signature = crypto.createHmac('sha256', signingSecret).update(payloadBase64).digest('base64url');
          const readToken = `${payloadBase64}.${signature}`;
          freshFileUrl = `${workerBaseUrl}/file?token=${encodeURIComponent(readToken)}&expiresIn=300`;
        }

        return {
          id: r.id,
          tenantId: r.tenant_id,
          patientId: r.patient_id,
          professionalId: r.professional_id,
          professionalName: r.professional_name || r.prof_joined_name || '',
          appointmentId: r.appointment_id || null,
          moduleType: r.module_type,
          category: r.category || 'Teste/Instrumento Externo',
          testName: r.test_name,
          testDate: r.test_date,
          referredBy: r.referred_by || '',
          resultSummary: r.result_summary || '',
          notes: r.notes || '',
          fileId: r.file_id || null,
          fileName: r.att_filename || r.file_name || '',
          fileType: r.att_mimetype || r.file_type || '',
          fileSize: r.att_size || r.file_size || 0,
          fileUrl: freshFileUrl,
          isSealed: Boolean(r.is_sealed),
          createdBy: r.created_by || '',
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });

      // Compatibilidade: Se moduleType for ZemdaFono ou omitido, traz também registros de fono_complementary_tests não duplicados
      if (!moduleType || moduleType === 'ZemdaFono') {
        try {
          const fonoRows = db.prepare(`
            SELECT 
              c.*,
              p.name as prof_name
            FROM fono_complementary_tests c
            LEFT JOIN professionals p ON p.id = c.professional_id
            WHERE c.patient_id = ? AND c.tenant_id = ?
            ORDER BY c.test_date DESC, c.created_at DESC
          `).all(patientId, tenantId) as any[];

          const existingIds = new Set(tests.map(t => t.id));
          for (const fr of fonoRows) {
            if (!existingIds.has(fr.id)) {
              tests.push({
                id: fr.id,
                tenantId: fr.tenant_id,
                patientId: fr.patient_id,
                professionalId: fr.professional_id,
                professionalName: fr.prof_name || '',
                appointmentId: fr.appointment_id || null,
                moduleType: 'ZemdaFono',
                category: 'Protocolo Fonoaudiológico',
                testName: fr.test_name,
                testDate: fr.test_date,
                referredBy: fr.referred_by || '',
                resultSummary: fr.result_score || '',
                notes: fr.findings_notes || fr.notes || '',
                fileId: null,
                fileName: fr.attachment_name || '',
                fileType: 'application/octet-stream',
                fileSize: 0,
                fileUrl: fr.attachment_url || null,
                isSealed: false,
                createdBy: '',
                createdAt: fr.created_at,
                updatedAt: fr.updated_at
              });
            }
          }
        } catch (_) {}
      }

      res.status(200).json(tests);
    } catch (err: any) {
      console.error('[ExternalTestsController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar testes externos' });
    }
  }

  /**
   * POST /v1/external-tests
   * Cria ou atualiza teste externo
   */
  static save(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId || (req.user as any)?.id;
      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não autenticada' });
        return;
      }

      const {
        id: providedId,
        patientId,
        appointmentId,
        moduleType,
        category,
        testName,
        testDate,
        professionalName,
        referredBy,
        resultSummary,
        notes,
        fileId,
        fileName,
        fileType,
        fileSize,
        isSealed
      } = req.body;

      if (!patientId || !testName || !moduleType) {
        res.status(400).json({ error: 'patientId, testName e moduleType são obrigatórios' });
        return;
      }

      // Valida vínculo com o paciente
      const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
      if (!patient) {
        res.status(404).json({ error: 'Paciente não encontrado para esta clínica' });
        return;
      }

      // Resolve profissional
      let profId: string | null = null;
      let profName = professionalName || '';
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id, name FROM professionals WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId) as any;
        if (prof) {
          profId = prof.id;
          if (!profName) profName = prof.name;
        }
      } else if (req.user?.name && !profName) {
        profName = req.user.name;
      }

      const dateStr = testDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const safeCategory = String(category || 'Teste/Instrumento Externo').trim();

      let targetId = providedId;

      if (providedId) {
        const existing = db.prepare('SELECT id, is_sealed, file_id FROM clinical_external_tests WHERE id = ? AND tenant_id = ?').get(providedId, tenantId) as any;
        if (existing) {
          if (existing.is_sealed === 1) {
            res.status(403).json({
              error: 'Este teste está selado e faz parte do prontuário imutável. Alterações devem ser registradas como adendo.'
            });
            return;
          }

          db.prepare(`
            UPDATE clinical_external_tests SET
              appointment_id = COALESCE(?, appointment_id),
              module_type = ?,
              category = ?,
              test_name = ?,
              test_date = ?,
              professional_id = COALESCE(?, professional_id),
              professional_name = COALESCE(?, professional_name),
              referred_by = ?,
              result_summary = ?,
              notes = ?,
              file_id = COALESCE(?, file_id),
              file_name = COALESCE(?, file_name),
              file_type = COALESCE(?, file_type),
              file_size = COALESCE(?, file_size),
              is_sealed = COALESCE(?, is_sealed),
              updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(
            appointmentId || null,
            moduleType,
            safeCategory,
            testName,
            dateStr,
            profId,
            profName || null,
            referredBy || null,
            resultSummary || null,
            notes || null,
            fileId || null,
            fileName || null,
            fileType || null,
            fileSize || null,
            isSealed ? 1 : 0,
            providedId,
            tenantId
          );
        } else {
          // Se não encontrado em clinical_external_tests, cria com esse id
          targetId = providedId;
        }
      }

      if (!providedId || !db.prepare('SELECT id FROM clinical_external_tests WHERE id = ?').get(targetId)) {
        targetId = 'ext-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO clinical_external_tests (
            id, tenant_id, patient_id, professional_id, appointment_id,
            module_type, category, test_name, test_date, professional_name,
            referred_by, result_summary, notes, file_id, file_name, file_type, file_size,
            is_sealed, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          targetId,
          tenantId,
          patientId,
          profId,
          appointmentId || null,
          moduleType,
          safeCategory,
          testName,
          dateStr,
          profName || null,
          referredBy || null,
          resultSummary || null,
          notes || null,
          fileId || null,
          fileName || null,
          fileType || null,
          fileSize || null,
          isSealed ? 1 : 0,
          userId || null
        );
      }

      // Se há fileId informado, atualiza o registro em file_attachments para vincular com test_id e module_type
      if (fileId) {
        try {
          db.prepare(`
            UPDATE file_attachments SET
              test_id = ?,
              module_type = ?,
              professional_id = COALESCE(?, professional_id),
              patient_id = COALESCE(?, patient_id)
            WHERE id = ? AND (clinic_id = ? OR clinic_id = ?)
          `).run(targetId, moduleType, profId, patientId, fileId, tenantId, canonicalizeClinicId(tenantId));
        } catch (linkErr) {
          console.warn('[ExternalTestsController.save] Aviso ao vincular file_attachments:', linkErr);
        }
      }

      // Compatibilidade com ZemdaFono caso exista fono_complementary_tests
      if (moduleType === 'ZemdaFono') {
        try {
          const fonoExist = db.prepare('SELECT id FROM fono_complementary_tests WHERE id = ? AND tenant_id = ?').get(targetId, tenantId) as any;
          if (fonoExist) {
            db.prepare(`
              UPDATE fono_complementary_tests SET
                test_name = ?,
                test_date = ?,
                referred_by = ?,
                result_score = ?,
                notes = ?,
                attachment_name = COALESCE(?, attachment_name),
                updated_at = datetime('now')
              WHERE id = ? AND tenant_id = ?
            `).run(testName, dateStr, referredBy || null, resultSummary || null, notes || null, fileName || null, targetId, tenantId);
          } else {
            db.prepare(`
              INSERT INTO fono_complementary_tests (
                id, tenant_id, patient_id, professional_id, appointment_id,
                test_name, test_date, referred_by, result_score, notes, attachment_name
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(targetId, tenantId, patientId, profId, appointmentId || null, testName, dateStr, referredBy || null, resultSummary || null, notes || null, fileName || null);
          }
        } catch (_) {}
      }

      res.status(201).json({
        id: targetId,
        message: 'Teste externo registrado com sucesso',
        test: {
          id: targetId,
          patientId,
          moduleType,
          testName,
          category: safeCategory,
          testDate: dateStr,
          fileId: fileId || null
        }
      });
    } catch (err: any) {
      console.error('[ExternalTestsController.save] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar teste externo' });
    }
  }

  /**
   * DELETE /v1/external-tests/:id
   * Exclusão segura respeitando registros selados
   */
  static delete(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const id = String(req.params.id);

      if (!tenantId || !id) {
        res.status(400).json({ error: 'ID inválido' });
        return;
      }

      const existing = db.prepare(`
        SELECT id, is_sealed, file_id, module_type, appointment_id
        FROM clinical_external_tests
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!existing) {
        // Se não achou em clinical_external_tests, verifica fono_complementary_tests para retrocompatibilidade
        const fono = db.prepare('SELECT id FROM fono_complementary_tests WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
        if (fono) {
          db.prepare('DELETE FROM fono_complementary_tests WHERE id = ? AND tenant_id = ?').run(id, tenantId);
          res.status(200).json({ message: 'Teste complementar removido com sucesso' });
          return;
        }
        res.status(404).json({ error: 'Teste externo não encontrado' });
        return;
      }

      // REGRA CRÍTICA: Se o teste já estiver selado, NÃO apagar definitivamente o registro histórico nem o arquivo
      if (existing.is_sealed === 1) {
        res.status(403).json({
          error: 'Este teste externo está selado no prontuário eletrônico e não pode ser excluído definitivamente. O histórico foi preservado.'
        });
        return;
      }

      // Se vinculado a um atendimento com status finalizado/selado
      if (existing.appointment_id) {
        const appt = db.prepare('SELECT status, is_sealed FROM appointments WHERE id = ? AND tenant_id = ?').get(existing.appointment_id, tenantId) as any;
        if (appt && (appt.status === 'completed' || appt.is_sealed === 1)) {
          res.status(403).json({
            error: 'O atendimento vinculado a este teste já foi finalizado/selado. O registro não pode ser apagado.'
          });
          return;
        }
      }

      // Exclusão permitida (teste rascunho / não selado):
      db.prepare('DELETE FROM clinical_external_tests WHERE id = ? AND tenant_id = ?').run(id, tenantId);

      // Também remove da tabela de fono se existir
      try {
        db.prepare('DELETE FROM fono_complementary_tests WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      } catch (_) {}

      res.status(200).json({ message: 'Teste externo removido com sucesso' });
    } catch (err: any) {
      console.error('[ExternalTestsController.delete] Erro:', err);
      res.status(500).json({ error: 'Erro ao remover teste externo' });
    }
  }
}
