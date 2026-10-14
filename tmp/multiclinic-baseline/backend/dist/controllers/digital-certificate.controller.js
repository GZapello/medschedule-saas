"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DigitalCertificateController = void 0;
const database_1 = require("../config/database");
const digital_signature_service_1 = require("../services/digital-signature.service");
const audit_middleware_1 = require("../middlewares/audit.middleware");
class DigitalCertificateController {
    /**
     * GET /v1/digital-certificates/status
     * Retorna o status de configuração do PSC e provedores suportados
     */
    static async getProviderStatus(req, res) {
        try {
            const status = digital_signature_service_1.digitalSignatureService.getStatus();
            res.json(status);
        }
        catch (err) {
            res.status(500).json({ error: err.message || 'Erro ao consultar provedor de certificado digital.' });
        }
    }
    /**
     * GET /v1/digital-certificates/my-certificate
     * Retorna o certificado ativo e status atual para o profissional autenticado
     */
    static async getMyCertificate(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(403).json({ error: 'Clínica não identificada no contexto.' });
                return;
            }
            const prof = database_1.db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user?.userId, tenantId);
            const professionalId = prof?.id || req.user?.userId;
            const cert = database_1.db.prepare(`
        SELECT id, holder_type, holder_id, certificate_type, serial_number,
               subject_name, subject_cpf_cnpj, issuer, valid_from, valid_until,
               fingerprint_sha256, provider, status, created_at, last_validated_at
        FROM digital_certificates
        WHERE tenant_id = ? AND (holder_id = ? OR holder_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `).get(tenantId, professionalId, req.user?.userId);
            if (!cert) {
                res.json({
                    status: 'not_configured',
                    certificate: null,
                    hasValidCertificate: false
                });
                return;
            }
            // Checa se expirou
            if (new Date(cert.valid_until) < new Date() && cert.status !== 'expired') {
                try {
                    database_1.db.prepare("UPDATE digital_certificates SET status = 'expired' WHERE id = ?").run(cert.id);
                    cert.status = 'expired';
                }
                catch (_) { }
            }
            res.json({
                status: cert.status,
                certificate: cert,
                hasValidCertificate: cert.status === 'valid'
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message || 'Erro ao consultar certificado do profissional.' });
        }
    }
    /**
     * POST /v1/digital-certificates/:id/validate
     * Valida novamente a cadeia do certificado e atualiza status / data de verificação
     */
    static async validateCertificate(req, res) {
        try {
            const tenantId = req.tenantId;
            const { id } = req.params;
            if (!tenantId) {
                res.status(403).json({ error: 'Clínica não identificada.' });
                return;
            }
            const cert = database_1.db.prepare('SELECT * FROM digital_certificates WHERE id = ? AND tenant_id = ?').get(id, tenantId);
            if (!cert) {
                res.status(404).json({ error: 'Certificado não encontrado.' });
                return;
            }
            let newStatus = cert.status;
            if (new Date(cert.valid_until) < new Date()) {
                newStatus = 'expired';
            }
            else if (cert.status === 'expired') {
                newStatus = 'valid';
            }
            database_1.db.prepare(`
        UPDATE digital_certificates 
        SET status = ?, last_validated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(newStatus, id, tenantId);
            const updated = database_1.db.prepare('SELECT * FROM digital_certificates WHERE id = ?').get(id);
            (0, audit_middleware_1.logAudit)(req, 'VALIDATE_DIGITAL_CERTIFICATE', 'digital_certificates', id, { status: newStatus, issuer: cert.issuer });
            res.json({
                success: true,
                message: newStatus === 'valid' ? 'Certificado validado com sucesso!' : 'Certificado analisado (expirado).',
                certificate: updated
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message || 'Erro ao validar certificado digital.' });
        }
    }
    /**
     * GET /v1/digital-certificates
     * Lista certificados vinculados ao profissional ou tenant autenticado
     */
    static async listCertificates(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(403).json({ error: 'Clínica não identificada no contexto.' });
                return;
            }
            // Profissional vinculado ao usuário atual se houver
            const prof = database_1.db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user?.userId, tenantId);
            const professionalId = prof?.id || req.user?.userId;
            const certs = database_1.db.prepare(`
        SELECT id, holder_type, holder_id, certificate_type, serial_number,
               subject_name, subject_cpf_cnpj, issuer, valid_from, valid_until,
               fingerprint_sha256, provider, status, created_at, last_validated_at
        FROM digital_certificates
        WHERE tenant_id = ? AND (holder_id = ? OR holder_id = ?)
        ORDER BY created_at DESC
      `).all(tenantId, professionalId, req.user?.userId);
            // Atualiza automaticamente os que expiraram
            const now = new Date();
            for (const c of certs) {
                if (new Date(c.valid_until) < now && c.status === 'valid') {
                    try {
                        database_1.db.prepare("UPDATE digital_certificates SET status = 'expired' WHERE id = ?").run(c.id);
                        c.status = 'expired';
                    }
                    catch (_) { }
                }
            }
            res.json({
                configured: digital_signature_service_1.digitalSignatureService.isConfigured(),
                certificates: certs
            });
        }
        catch (err) {
            res.status(500).json({ error: err.message || 'Erro ao listar certificados digitais.' });
        }
    }
    /**
     * POST /v1/digital-certificates/connect
     * Conecta ou registra um novo certificado digital (A1 importado ou PSC em nuvem)
     */
    static async connectCertificate(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(403).json({ error: 'Clínica não identificada no contexto.' });
                return;
            }
            const { holderType = 'professional', holderId, certificateType = 'remote', serialNumber, subjectName, subjectCpfCnpj, issuer, validFrom, validUntil, fingerprintSha256, provider, providerReference } = req.body;
            const prof = database_1.db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user?.userId, tenantId);
            const effectiveHolderId = holderId || prof?.id || req.user?.userId;
            const effectiveName = subjectName || req.user?.name;
            if (!effectiveName) {
                res.status(400).json({ error: 'Nome do titular do certificado é obrigatório.' });
                return;
            }
            const cert = await digital_signature_service_1.digitalSignatureService.connectCertificate({
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
            (0, audit_middleware_1.logAudit)(req, 'CONNECT_DIGITAL_CERTIFICATE', 'digital_certificates', cert.id || '', { serial: cert.serialNumber, issuer: cert.issuer, type: cert.certificateType });
            res.status(201).json(cert);
        }
        catch (err) {
            res.status(400).json({ error: err.message || 'Erro ao conectar certificado digital.' });
        }
    }
    /**
     * DELETE /v1/digital-certificates/:id
     * Desconecta / desativa um certificado digital
     */
    static async deleteCertificate(req, res) {
        try {
            const tenantId = req.tenantId;
            const { id } = req.params;
            if (!tenantId) {
                res.status(403).json({ error: 'Clínica não identificada.' });
                return;
            }
            const cert = database_1.db.prepare('SELECT id FROM digital_certificates WHERE id = ? AND tenant_id = ?').get(id, tenantId);
            if (!cert) {
                res.status(404).json({ error: 'Certificado não encontrado.' });
                return;
            }
            database_1.db.prepare('DELETE FROM digital_certificates WHERE id = ? AND tenant_id = ?').run(id, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'DELETE_DIGITAL_CERTIFICATE', 'digital_certificates', id, { removed: true });
            res.json({ success: true, message: 'Certificado digital desvinculado com sucesso.' });
        }
        catch (err) {
            res.status(500).json({ error: err.message || 'Erro ao remover certificado digital.' });
        }
    }
    /**
     * POST /v1/digital-signatures/sign
     * Assina um documento com padrão PAdES ICP-Brasil
     */
    static async signDocument(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(403).json({ error: 'Clínica não identificada.' });
                return;
            }
            const { documentId, documentType = 'certificate', certificateId, rawContent, signerName, signerRegistration, signerCpf, fileId } = req.body;
            if (!documentId || !rawContent) {
                res.status(400).json({ error: 'documentId e rawContent são obrigatórios para assinatura digital.' });
                return;
            }
            const prof = database_1.db.prepare('SELECT id, registration_type, registration_number, name FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user?.userId, tenantId);
            const effectiveHolderId = prof?.id || req.user?.userId;
            const effectiveSignerName = signerName || prof?.name || req.user?.name || 'Profissional';
            const effectiveSignerReg = signerRegistration || (prof?.registration_number ? `${prof.registration_type || 'Conselho'} ${prof.registration_number}` : null);
            const result = await digital_signature_service_1.digitalSignatureService.signDocument({
                tenantId,
                documentId,
                documentType,
                certificateId,
                holderId: effectiveHolderId,
                userId: req.user?.userId,
                fileId,
                rawContent,
                signerName: effectiveSignerName,
                signerRegistration: effectiveSignerReg,
                signerCpf
            });
            (0, audit_middleware_1.logAudit)(req, 'SIGN_DOCUMENT_DIGITAL', 'digital_signatures', result.signatureId, { documentType, documentId, format: result.format, token: result.verificationToken });
            res.status(200).json(result);
        }
        catch (err) {
            res.status(400).json({ error: err.message || 'Falha ao realizar assinatura digital ICP-Brasil.' });
        }
    }
    /**
     * POST /v1/digital-signatures/validate
     * Validação interna de assinatura
     */
    static async validateSignature(req, res) {
        try {
            const { token } = req.body;
            const result = await digital_signature_service_1.digitalSignatureService.verifySignature(token);
            res.json(result);
        }
        catch (err) {
            res.status(500).json({ error: err.message || 'Erro ao validar assinatura digital.' });
        }
    }
    /**
     * GET /v1/digital-signatures/:id
     */
    static async getSignature(req, res) {
        try {
            const tenantId = req.tenantId;
            const { id } = req.params;
            const sig = database_1.db.prepare(`
        SELECT s.*, c.subject_name, c.issuer, c.serial_number, c.certificate_type
        FROM digital_signatures s
        LEFT JOIN digital_certificates c ON c.id = s.certificate_id
        WHERE s.id = ? AND s.tenant_id = ?
      `).get(id, tenantId);
            if (!sig) {
                res.status(404).json({ error: 'Registro de assinatura digital não encontrado.' });
                return;
            }
            res.json(sig);
        }
        catch (err) {
            res.status(500).json({ error: err.message || 'Erro ao consultar assinatura digital.' });
        }
    }
    /**
     * GET /v1/public/verify-document/:verificationToken
     * PÁGINA PÚBLICA DE VERIFICAÇÃO E AUDITORIA (SEM DADOS CLÍNICOS DO PACIENTE)
     */
    static async publicVerifyDocument(req, res) {
        try {
            const token = String(req.params.verificationToken || '').trim();
            const result = await digital_signature_service_1.digitalSignatureService.verifySignature(token);
            if (!result.valid) {
                res.status(404).json(result);
                return;
            }
            res.json(result);
        }
        catch (err) {
            res.status(500).json({ valid: false, error: err.message || 'Erro ao verificar autenticidade do documento.' });
        }
    }
}
exports.DigitalCertificateController = DigitalCertificateController;
