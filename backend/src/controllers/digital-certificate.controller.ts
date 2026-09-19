import { Request, Response } from 'express';
import { db } from '../config/database';
import { digitalSignatureService } from '../services/digital-signature.service';
import { logAudit } from '../middlewares/audit.middleware';

export class DigitalCertificateController {
  /**
   * GET /v1/digital-certificates/status
   * Retorna o status de configuração do PSC e provedores suportados
   */
  static async getProviderStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = digitalSignatureService.getStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao consultar provedor de certificado digital.' });
    }
  }

  /**
   * GET /v1/digital-certificates
   * Lista certificados vinculados ao profissional ou tenant autenticado
   */
  static async listCertificates(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada no contexto.' });
        return;
      }

      // Profissional vinculado ao usuário atual se houver
      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user?.userId, tenantId) as any;
      const professionalId = prof?.id || req.user?.userId;

      const certs = db.prepare(`
        SELECT id, holder_type, holder_id, certificate_type, serial_number,
               subject_name, subject_cpf_cnpj, issuer, valid_from, valid_until,
               fingerprint_sha256, provider, status, created_at, last_validated_at
        FROM digital_certificates
        WHERE tenant_id = ? AND (holder_id = ? OR holder_id = ?)
        ORDER BY created_at DESC
      `).all(tenantId, professionalId, req.user?.userId) as any[];

      res.json({
        configured: digitalSignatureService.isConfigured(),
        certificates: certs
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao listar certificados digitais.' });
    }
  }

  /**
   * POST /v1/digital-certificates/connect
   * Conecta ou registra um novo certificado digital (A1 importado ou PSC em nuvem)
   */
  static async connectCertificate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada no contexto.' });
        return;
      }

      const {
        holderType = 'professional',
        holderId,
        certificateType = 'remote',
        serialNumber,
        subjectName,
        subjectCpfCnpj,
        issuer,
        validFrom,
        validUntil,
        fingerprintSha256,
        provider,
        providerReference
      } = req.body;

      const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user?.userId, tenantId) as any;
      const effectiveHolderId = holderId || prof?.id || req.user?.userId;
      const effectiveName = subjectName || req.user?.name;

      if (!effectiveName) {
        res.status(400).json({ error: 'Nome do titular do certificado é obrigatório.' });
        return;
      }

      const cert = await digitalSignatureService.connectCertificate({
        tenantId,
        holderType,
        holderId: effectiveHolderId,
        certificateType,
        serialNumber,
        subjectName: effectiveName,
        subjectCpfCnpj,
        issuer,
        validFrom,
        validUntil,
        fingerprintSha256,
        provider,
        providerReference
      });

      logAudit(
        req,
        'CONNECT_DIGITAL_CERTIFICATE',
        'digital_certificates',
        cert.id || '',
        { serial: cert.serialNumber, issuer: cert.issuer, type: cert.certificateType }
      );

      res.status(201).json(cert);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Erro ao conectar certificado digital.' });
    }
  }

  /**
   * DELETE /v1/digital-certificates/:id
   * Desconecta / desativa um certificado digital
   */
  static async deleteCertificate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada.' });
        return;
      }

      const cert = db.prepare('SELECT id FROM digital_certificates WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!cert) {
        res.status(404).json({ error: 'Certificado não encontrado.' });
        return;
      }

      db.prepare('DELETE FROM digital_certificates WHERE id = ? AND tenant_id = ?').run(id, tenantId);

      logAudit(
        req,
        'DELETE_DIGITAL_CERTIFICATE',
        'digital_certificates',
        id as string,
        { removed: true }
      );

      res.json({ success: true, message: 'Certificado digital desvinculado com sucesso.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao remover certificado digital.' });
    }
  }

  /**
   * POST /v1/digital-signatures/sign
   * Assina um documento com padrão PAdES ICP-Brasil
   */
  static async signDocument(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada.' });
        return;
      }

      const {
        documentId,
        documentType = 'certificate',
        certificateId,
        rawContent,
        signerName,
        signerRegistration,
        signerCpf,
        fileId
      } = req.body;

      if (!documentId || !rawContent) {
        res.status(400).json({ error: 'documentId e rawContent são obrigatórios para assinatura digital.' });
        return;
      }

      const result = await digitalSignatureService.signDocument({
        tenantId,
        documentId,
        documentType,
        certificateId,
        fileId,
        rawContent,
        signerName: signerName || req.user?.name || 'Profissional',
        signerRegistration,
        signerCpf
      });

      logAudit(
        req,
        'SIGN_DOCUMENT_DIGITAL',
        'digital_signatures',
        result.signatureId,
        { documentType, documentId, format: result.format, token: result.verificationToken }
      );

      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Falha ao realizar assinatura digital ICP-Brasil.' });
    }
  }

  /**
   * POST /v1/digital-signatures/validate
   * Validação interna de assinatura
   */
  static async validateSignature(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;
      const result = await digitalSignatureService.verifySignature(token);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao validar assinatura digital.' });
    }
  }

  /**
   * GET /v1/digital-signatures/:id
   */
  static async getSignature(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;

      const sig = db.prepare(`
        SELECT s.*, c.subject_name, c.issuer, c.serial_number, c.certificate_type
        FROM digital_signatures s
        LEFT JOIN digital_certificates c ON c.id = s.certificate_id
        WHERE s.id = ? AND s.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!sig) {
        res.status(404).json({ error: 'Registro de assinatura digital não encontrado.' });
        return;
      }

      res.json(sig);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao consultar assinatura digital.' });
    }
  }

  /**
   * GET /v1/public/verify-document/:verificationToken
   * PÁGINA PÚBLICA DE VERIFICAÇÃO E AUDITORIA (SEM DADOS CLÍNICOS DO PACIENTE)
   */
  static async publicVerifyDocument(req: Request, res: Response): Promise<void> {
    try {
      const token = String(req.params.verificationToken || '').trim();
      const result = await digitalSignatureService.verifySignature(token);

      if (!result.valid) {
        res.status(404).json(result);
        return;
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ valid: false, error: err.message || 'Erro ao verificar autenticidade do documento.' });
    }
  }
}
