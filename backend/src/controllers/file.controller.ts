import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import path from 'path';
import { db } from '../config/database';
import { r2StorageService } from '../services/r2-storage.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export class FileController {
  /**
   * POST /api/files/upload-ticket ou /api/v1/files/upload-ticket
   * Valida autorização, clínica, paciente, tamanho e tipo.
   * Gera objectKey seguro no padrão Cloudflare R2 e token assinado HMAC-SHA256 para o Cloudflare Worker.
   */
  static async createUploadTicket(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada no contexto' });
        return;
      }

      const {
        patientId,
        appointmentId,
        assessmentId,
        exerciseId,
        position,
        category,
        filename,
        mimeType,
        fileSize
      } = req.body;

      const safeCategory = String(category || 'general').trim();
      const isExercise = safeCategory === 'exercises' || safeCategory.includes('exercise') || patientId === 'exercises';
      const isAssessment = safeCategory.startsWith('personal_assessment') || safeCategory === 'personal-assessments';
      const isClinicOrExerciseAsset = !patientId || patientId === 'exercises' || patientId === 'clinic' || isExercise;

      if ((!isClinicOrExerciseAsset && !patientId) || !filename || !mimeType || fileSize === undefined || fileSize === null) {
        res.status(400).json({
          error: 'filename, mimeType e fileSize são obrigatórios' + (!isClinicOrExerciseAsset ? ' (e patientId/aluno para arquivos de pacientes)' : '')
        });
        return;
      }

      // Validação estrita de tipo de arquivo
      const normalizedMime = String(mimeType).toLowerCase().trim();
      if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
        res.status(400).json({
          error: 'Tipo de arquivo não permitido. Apenas imagens JPEG, PNG ou WebP são aceitas.',
          allowedTypes: ALLOWED_MIME_TYPES
        });
        return;
      }

      // Validação de tamanho máximo (10 MB)
      const numericSize = Number(fileSize);
      if (isNaN(numericSize) || numericSize <= 0 || numericSize > MAX_FILE_SIZE_BYTES) {
        res.status(400).json({
          error: 'Tamanho de arquivo inválido ou excede o limite máximo permitido de 10 MB.',
          maxSize: MAX_FILE_SIZE_BYTES
        });
        return;
      }

      // Validação de acesso ao paciente pela clínica autenticada (se for anexo de paciente/aluno)
      if (!isClinicOrExerciseAsset && patientId) {
        const patient = db
          .prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?')
          .get(patientId, tenantId) as any;

        if (!patient) {
          res.status(404).json({
            error: 'Paciente não encontrado ou não pertence a esta clínica'
          });
          return;
        }
      }

      // Se fornecido appointmentId, valida também vínculo com a clínica
      if (appointmentId) {
        const appointment = db
          .prepare('SELECT id FROM appointments WHERE id = ? AND tenant_id = ?')
          .get(appointmentId, tenantId) as any;
        if (!appointment) {
          res.status(404).json({
            error: 'Agendamento não encontrado ou não pertence a esta clínica'
          });
          return;
        }
      }

      // Geração de chave de objeto anônima e segura
      const sanitizedClinicId = tenantId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
      let ext = path.extname(String(filename)).toLowerCase();
      if (!ext || ext === '.') ext = '.webp';
      if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) ext = '.webp';
      const uniqueId = uuidv4();

      let objectKey = '';

      if (isAssessment) {
        // Para fotos de avaliação física:
        // clinics/{clinicId}/patients/{patientId}/personal-assessments/{assessmentId}/{position}/{uuid}.{ext}
        const effectivePatientId = (patientId ? String(patientId).trim() : 'student').replace(/[^a-zA-Z0-9_-]/g, '');
        const effectiveAssessmentId = (assessmentId ? String(assessmentId).trim() : ('assessment-' + uuidv4().substring(0, 8))).replace(/[^a-zA-Z0-9_-]/g, '');

        let effectivePosition = position ? String(position).trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '') : '';
        if (!effectivePosition) {
          if (safeCategory.includes('front')) effectivePosition = 'front';
          else if (safeCategory.includes('back')) effectivePosition = 'back';
          else if (safeCategory.includes('right')) effectivePosition = 'right';
          else if (safeCategory.includes('left')) effectivePosition = 'left';
          else effectivePosition = 'general';
        }

        objectKey = `clinics/${sanitizedClinicId}/patients/${effectivePatientId}/personal-assessments/${effectiveAssessmentId}/${effectivePosition}/${uniqueId}${ext}`;
      } else if (isExercise) {
        // Para exercício:
        // clinics/{clinicId}/personal/exercises/{exerciseId-ou-tempId}/{uuid}.{ext}
        const effectiveExerciseId = (exerciseId ? String(exerciseId).trim() : ('temp-' + uuidv4().substring(0, 8))).replace(/[^a-zA-Z0-9_-]/g, '');
        objectKey = `clinics/${sanitizedClinicId}/personal/exercises/${effectiveExerciseId}/${uniqueId}${ext}`;
      } else if (patientId && !isClinicOrExerciseAsset) {
        const sanitizedPatientId = String(patientId).trim().replace(/[^a-zA-Z0-9_-]/g, '');
        const sanitizedCategory = safeCategory.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
        objectKey = `clinics/${sanitizedClinicId}/patients/${sanitizedPatientId}/${sanitizedCategory}/${uniqueId}${ext}`;
      } else {
        const sanitizedCategory = safeCategory.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '') || 'general';
        objectKey = `clinics/${sanitizedClinicId}/clinic/${sanitizedCategory}/${uniqueId}${ext}`;
      }

      // Token compatível com o Worker já publicado:
      // base64url(payload).base64url(HMAC_SHA256(payloadBase64, ZEMDA_FILES_SIGNING_SECRET))
      const signingSecret = process.env.ZEMDA_FILES_SIGNING_SECRET || 'zemda-files-signing-secret';
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const exp = nowInSeconds + 300; // max 300 segundos

      const payload: Record<string, any> = {
        action: 'upload',
        clinicId: sanitizedClinicId,
        objectKey,
        mimeType: normalizedMime,
        fileSize: numericSize,
        exp
      };
      if (patientId) {
        payload.patientId = String(patientId).trim();
      } else if (isExercise) {
        payload.patientId = 'exercises';
      }

      const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = crypto.createHmac('sha256', signingSecret).update(payloadBase64).digest('base64url');
      const uploadToken = `${payloadBase64}.${signature}`;

      const workerBaseUrl = (process.env.ZEMDA_FILES_WORKER_URL || 'https://zemda-files-worker.gabrielkz1510.workers.dev').replace(/\/+$/, '');
      const uploadUrl = `${workerBaseUrl}/upload`;

      // Helper para simular disponibilidade imediata no mock de testes locais
      r2StorageService.simulateMockUpload(objectKey);

      res.status(200).json({
        uploadUrl,
        uploadToken,
        objectKey
      });
    } catch (err: any) {
      console.error('[FileController.createUploadTicket] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar ticket de upload para o Cloudflare Worker' });
    }
  }

  /**
   * POST /api/files/upload-url ou /api/v1/files/upload-url
   * Valida autorização, clínica, paciente, tamanho e tipo.
   * Gera object_key seguro com UUID e URL assinada PUT para upload direto ao R2.
   */
  static async getUploadUrl(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada no contexto' });
        return;
      }

      const { patientId, appointmentId, category, filename, mimeType, fileSize } = req.body;
      const safeCategory = String(category || 'general').trim();
      const isClinicOrExerciseAsset = !patientId || patientId === 'exercises' || patientId === 'clinic' || safeCategory === 'exercises';

      if ((!isClinicOrExerciseAsset && !patientId) || !filename || !mimeType || fileSize === undefined || fileSize === null) {
        res.status(400).json({
          error: 'filename, mimeType e fileSize são obrigatórios' + (!isClinicOrExerciseAsset ? ' (e patientId para arquivos de pacientes)' : '')
        });
        return;
      }

      // Validação estrita de tipo de arquivo
      const normalizedMime = String(mimeType).toLowerCase().trim();
      if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
        res.status(400).json({
          error: 'Tipo de arquivo não permitido. Apenas imagens JPEG, PNG ou WebP são aceitas.',
          allowedTypes: ALLOWED_MIME_TYPES
        });
        return;
      }

      // Validação de tamanho máximo (10 MB)
      const numericSize = Number(fileSize);
      if (isNaN(numericSize) || numericSize <= 0 || numericSize > MAX_FILE_SIZE_BYTES) {
        res.status(400).json({
          error: 'Tamanho de arquivo inválido ou excede o limite máximo permitido de 10 MB.',
          maxSize: MAX_FILE_SIZE_BYTES
        });
        return;
      }

      // Validação de acesso ao paciente pela clínica autenticada (se for anexo de paciente)
      if (!isClinicOrExerciseAsset && patientId) {
        const patient = db
          .prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?')
          .get(patientId, tenantId) as any;

        if (!patient) {
          res.status(404).json({
            error: 'Paciente não encontrado ou não pertence a esta clínica'
          });
          return;
        }
      }

      // Se fornecido appointmentId, valida também vínculo com a clínica
      if (appointmentId) {
        const appointment = db
          .prepare('SELECT id FROM appointments WHERE id = ? AND tenant_id = ?')
          .get(appointmentId, tenantId) as any;
        if (!appointment) {
          res.status(404).json({
            error: 'Agendamento não encontrado ou não pertence a esta clínica'
          });
          return;
        }
      }

      // Geração de chave de objeto anônima e segura
      const objectKey = r2StorageService.generateObjectKey(
        tenantId,
        isClinicOrExerciseAsset ? null : patientId,
        safeCategory,
        String(filename)
      );

      // Geração de URL assinada PUT com expiração de 300 segundos (5 minutos)
      const uploadUrl = await r2StorageService.createUploadUrl(objectKey, normalizedMime, 300);

      res.status(200).json({
        uploadUrl,
        objectKey,
        expiresIn: 300,
        storageProvider: 'cloudflare_r2'
      });
    } catch (err: any) {
      console.error('[FileController.getUploadUrl] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar URL de upload para o Cloudflare R2' });
    }
  }

  /**
   * POST /api/files/complete ou /api/v1/files/complete
   * Confirmação pós-upload: valida se o objeto realmente existe no R2 e persiste metadados.
   */
  static async completeUpload(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId || (req.user as any)?.id;

      if (!tenantId || !userId) {
        res.status(403).json({ error: 'Usuário ou clínica não autenticados' });
        return;
      }

      const {
        objectKey,
        patientId,
        appointmentId,
        category,
        filename,
        mimeType,
        fileSize
      } = req.body;

      const safeCategory = String(category || 'general').trim();
      const isClinicOrExerciseAsset = !patientId || patientId === 'exercises' || patientId === 'clinic' || safeCategory === 'exercises' || safeCategory.includes('exercise') || String(objectKey).includes('/exercises/');

      if (!objectKey || (!isClinicOrExerciseAsset && !patientId) || !filename || !mimeType || !fileSize) {
        res.status(400).json({
          error: 'objectKey, filename, mimeType e fileSize são obrigatórios'
        });
        return;
      }

      // Validação estrita de isolamento multiclínica na chave do objeto
      // A chave DEVE iniciar com clinics/{tenantId}/
      if (!String(objectKey).startsWith(`clinics/${tenantId}/`)) {
        res.status(403).json({
          error: 'Chave de objeto incompatível com o contexto da clínica autenticada'
        });
        return;
      }

      if (!isClinicOrExerciseAsset && patientId) {
        const expectedPrefix = `clinics/${tenantId}/patients/${patientId}/`;
        if (!String(objectKey).startsWith(expectedPrefix)) {
          res.status(403).json({
            error: 'Chave de objeto incompatível com o contexto da clínica e paciente autenticados'
          });
          return;
        }

        // Validação de acesso ao paciente
        const patient = db
          .prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?')
          .get(patientId, tenantId) as any;

        if (!patient) {
          res.status(404).json({
            error: 'Paciente não encontrado ou não pertence a esta clínica'
          });
          return;
        }
      }

      // Verificação de existência real no Cloudflare R2 via HeadObject com tolerância para consistência eventual
      let exists = await r2StorageService.fileExists(objectKey);
      if (!exists) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        exists = await r2StorageService.fileExists(objectKey);
      }
      if (!exists) {
        res.status(400).json({
          error: 'O arquivo não foi localizado no Cloudflare R2. Conclua o upload direto antes de confirmar.'
        });
        return;
      }

      // Persistência exclusiva de metadados no banco de dados relacional
      const attachmentId = 'att-' + uuidv4();
      const targetPatientId = isClinicOrExerciseAsset ? null : patientId;

      try {
        db.prepare(`
          INSERT INTO file_attachments (
            id, clinic_id, patient_id, appointment_id, uploaded_by,
            storage_provider, object_key, original_filename, mime_type,
            file_size, category, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'cloudflare_r2', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          attachmentId,
          tenantId,
          targetPatientId,
          appointmentId || null,
          userId,
          objectKey,
          String(filename),
          String(mimeType),
          Number(fileSize),
          safeCategory
        );
      } catch (insertErr: any) {
        // Se banco legado exigir NOT NULL em patient_id, fallback seguro
        if (String(insertErr?.message || '').includes('NOT NULL constraint failed: file_attachments.patient_id')) {
          db.prepare(`
            INSERT INTO file_attachments (
              id, clinic_id, patient_id, appointment_id, uploaded_by,
              storage_provider, object_key, original_filename, mime_type,
              file_size, category, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'cloudflare_r2', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).run(
            attachmentId,
            tenantId,
            'clinic',
            appointmentId || null,
            userId,
            objectKey,
            String(filename),
            String(mimeType),
            Number(fileSize),
            safeCategory
          );
        } else {
          throw insertErr;
        }
      }

      let signedUrl = '';
      try {
        signedUrl = await r2StorageService.createDownloadUrl(objectKey, 300);
      } catch (_) {}

      res.status(201).json({
        success: true,
        message: 'Upload confirmado e registrado com sucesso',
        file: {
          id: attachmentId,
          clinic_id: tenantId,
          patient_id: patientId,
          appointment_id: appointmentId || null,
          uploaded_by: userId,
          storage_provider: 'cloudflare_r2',
          object_key: objectKey,
          original_filename: filename,
          mime_type: mimeType,
          file_size: Number(fileSize),
          category: safeCategory,
          url: signedUrl
        }
      });
    } catch (err: any) {
      console.error('[FileController.completeUpload] Erro:', err);
      res.status(500).json({ error: 'Erro ao confirmar upload do arquivo' });
    }
  }

  /**
   * GET /api/files/:id/url ou /api/v1/files/:id/url
   * Valida clínica e gera URL assinada GET temporária (expiração = 5 min).
   * Nunca gera URL pública permanente.
   */
  static async getFileUrl(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada no contexto' });
        return;
      }

      // Validação estrita por clínica: Clínica A NUNCA acessa arquivo da Clínica B
      const file = db
        .prepare('SELECT * FROM file_attachments WHERE id = ? AND clinic_id = ?')
        .get(id, tenantId) as any;

      if (!file) {
        res.status(404).json({
          error: 'Arquivo não encontrado ou acesso não autorizado para esta clínica'
        });
        return;
      }

      // Se armazenado no R2, gera URL assinada temporária (5 minutos)
      if (file.storage_provider === 'cloudflare_r2') {
        const signedUrl = await r2StorageService.createDownloadUrl(file.object_key, 300);
        res.status(200).json({
          url: signedUrl,
          expiresIn: 300,
          filename: file.original_filename,
          mimeType: file.mime_type,
          fileSize: file.file_size,
          category: file.category
        });
        return;
      }

      // Compatibilidade retroativa caso existam registros com URLs externas antigas
      res.status(200).json({
        url: file.object_key,
        expiresIn: null,
        filename: file.original_filename,
        mimeType: file.mime_type,
        fileSize: file.file_size,
        category: file.category
      });
    } catch (err: any) {
      console.error('[FileController.getFileUrl] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar URL de visualização do arquivo' });
    }
  }

  /**
   * DELETE /api/files/:id ou /api/v1/files/:id
   * Exclui objeto do Cloudflare R2 e remove registro do banco.
   * Isolamento multiclínica obrigatório.
   */
  static async deleteFile(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada no contexto' });
        return;
      }

      // Validação estrita: Clínica A NUNCA exclui arquivo da Clínica B
      const file = db
        .prepare('SELECT * FROM file_attachments WHERE id = ? AND clinic_id = ?')
        .get(id, tenantId) as any;

      if (!file) {
        res.status(404).json({
          error: 'Arquivo não encontrado ou você não tem permissão para excluí-lo'
        });
        return;
      }

      // Exclusão física do objeto no Cloudflare R2
      if (file.storage_provider === 'cloudflare_r2' && file.object_key) {
        await r2StorageService.deleteFile(file.object_key);
      }

      // Exclusão do registro de metadados no banco
      db.prepare('DELETE FROM file_attachments WHERE id = ? AND clinic_id = ?').run(id, tenantId);

      res.status(200).json({
        success: true,
        message: 'Arquivo excluído com sucesso do Cloudflare R2 e do banco de dados'
      });
    } catch (err: any) {
      console.error('[FileController.deleteFile] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir arquivo' });
    }
  }

  /**
   * GET /api/files/patient/:patientId ou /api/v1/files/patient/:patientId
   * Lista anexos de um paciente específico na clínica autenticada.
   */
  static async listPatientFiles(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { patientId } = req.params;
      const { category } = req.query;

      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada no contexto' });
        return;
      }

      let query = `
        SELECT id, clinic_id, patient_id, appointment_id, uploaded_by,
               storage_provider, object_key, original_filename, mime_type,
               file_size, category, created_at, updated_at
        FROM file_attachments
        WHERE clinic_id = ? AND patient_id = ?
      `;
      const params: any[] = [tenantId, patientId];

      if (category) {
        query += ' AND category = ?';
        params.push(String(category).trim());
      }

      query += ' ORDER BY created_at DESC';

      const files = db.prepare(query).all(...params) as any[];

      res.status(200).json({ files });
    } catch (err: any) {
      console.error('[FileController.listPatientFiles] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar anexos do paciente' });
    }
  }
}
