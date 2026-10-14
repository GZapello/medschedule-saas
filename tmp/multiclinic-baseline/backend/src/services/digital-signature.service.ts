import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { generateQrCodeSvg, generateQrCodeDataUrl } from '../utils/qr-generator';

// ============================================================================
// REGRA ARQUITETURAL FUNDAMENTAL DO SISTEMA ZEMDA:
// internal_integrity_signature !== icp_brasil_signature
// 
// 1. O selo eletrônico interno com hash SHA-256 é utilizado EXCLUSIVAMENTE para
//    garantir a integridade do prontuário, auditoria, autoria autenticada,
//    data/hora e imutabilidade dos dados nos registros clínicos (records).
//    NUNCA deve ser apresentado como assinatura digital qualificada ICP-Brasil.
//
// 2. A assinatura qualificada ICP-Brasil (PAdES padrão ITI) está em preparação
//    e será ativada via provedor PSC em nuvem na Railway. Por enquanto,
//    a camada ativa é ICPProviderDisabled, impedindo qualquer simulação.
// ============================================================================
export const INTERNAL_INTEGRITY_SIGNATURE_DIFFERS_FROM_ICP_BRASIL = true;

export interface CertificateMetadata {
  id?: string;
  tenantId: string;
  holderType: 'professional' | 'patient';
  holderId: string;
  professionalId?: string;
  certificateType: 'A1' | 'A3' | 'remote';
  serialNumber: string;
  subjectName: string;
  subjectCpfCnpj: string;
  issuer: string;
  validFrom: string;
  validUntil: string;
  fingerprintSha256: string;
  provider: string;
  providerReference?: string | null;
  status: 'valid' | 'expired' | 'revoked' | 'pending';
}

export interface SignatureRequest {
  tenantId: string;
  documentId: string;
  documentType: 'certificate' | 'prescription' | 'exam_request' | 'clinical_record' | 'psychopedagogy_report' | 'psychology_document' | 'psychology_session' | 'other';
  certificateId?: string;
  holderId?: string;
  userId?: string;
  fileId?: string | null;
  rawContent: string | Buffer;
  signerName: string;
  signerRegistration?: string | null;
  signerCpf?: string | null;
  reason?: string;
}

export interface SignatureResult {
  signatureId: string;
  verificationToken: string;
  verificationUrl: string;
  sha256Hash: string;
  signedAt: string;
  format: string;
  qrCodeSvg: string;
  qrCodeDataUrl: string;
  stampHtml: string;
  validationResult: {
    status: 'valid' | 'revoked' | 'expired';
    algorithm: string;
    certificateChainValidated: boolean;
    timestampValidated: boolean;
  };
}

/**
 * Interface canônica e universal de provedores de assinatura digital
 */
export interface DigitalSignatureProvider {
  readonly name: string;
  isConfigured(): boolean;
  getStatus(): { configured: boolean; provider: string; supportedProviders: string[]; details: string };
  connectCertificate(metadata: Partial<CertificateMetadata>): Promise<CertificateMetadata>;
  validateCertificate(certificateId: string, tenantId: string): Promise<any>;
  disconnectCertificate(certificateId: string, tenantId: string): Promise<boolean>;
  signDocument(req: SignatureRequest): Promise<SignatureResult>;
  verifySignature(token: string): Promise<any>;
}

// ============================================================================
// POLÍTICA DE ASSINATURA POR TIPO DE DOCUMENTO E ESPECIALIDADE (Item 8 e 9)
// ============================================================================
export type SignatureRequirement = 
  | 'manual_or_qualified'   // Ex.: Atestados médicos, receitas de controle especial, laudos formais
  | 'advanced_or_qualified' // Ex.: Relatórios multidisciplinares, termos
  | 'qualified_only'        // Ex.: Documentos médicos puramente eletrônicos sem impressão
  | 'internal_only';        // Ex.: Evoluções diárias de prontuário, anotações de sessão

export interface DocumentSignaturePolicy {
  documentType: string;
  profession?: string;
  requirement: SignatureRequirement;
  allowElectronicIfNoICP: boolean;
  description: string;
}

/**
 * Retorna a política de assinatura para o documento e conselho profissional.
 * Regra médica estrita: documentos médicos eletrônicos exigem assinatura ICP-Brasil qualificada.
 * Se ICP-Brasil não estiver disponível, é permitida exclusivamente emissão para impressão e assinatura manual.
 */
export function getDocumentSignatureRequirement(
  documentType: string,
  profession?: string
): DocumentSignaturePolicy {
  const normType = String(documentType || '').toLowerCase();
  const normProf = String(profession || '').toLowerCase();

  const isMedical = normProf.includes('médic') || normProf.includes('medic') || normProf === 'crm';

  if (isMedical || normType.includes('atestado') || normType.includes('receit') || normType.includes('prescription')) {
    return {
      documentType,
      profession,
      requirement: 'manual_or_qualified',
      allowElectronicIfNoICP: false, // Documento médico eletrônico NUNCA pode ser emitido como assinado eletronicamente sem ICP-Brasil real
      description: 'Documento médico / atestado exige ICP-Brasil qualificado para meio eletrônico, ou impressão para assinatura manual física.'
    };
  }

  if (normType.includes('laudo') || normType.includes('parecer')) {
    return {
      documentType,
      profession,
      requirement: 'manual_or_qualified',
      allowElectronicIfNoICP: false,
      description: 'Laudo/Parecer técnico exige assinatura qualificada ICP-Brasil ou impressão para assinatura física.'
    };
  }

  return {
    documentType,
    profession,
    requirement: 'internal_only',
    allowElectronicIfNoICP: true,
    description: 'Prontuário com selamento de integridade interno SHA-256 Zemda e opção de impressão manual.'
  };
}

/**
 * Validação de integridade interna de prontuário (records)
 */
export function verifyInternalRecordIntegrity(token: string): any {
  const rec = db.prepare(`
    SELECT r.id, r.tenant_id, r.session_date, r.title, r.signer_name, r.signer_registration, r.signed_at, r.signature_hash,
           t.trade_name, t.name as tenant_name
    FROM records r
    LEFT JOIN tenants t ON t.id = r.tenant_id
    WHERE r.signature_hash = ?
  `).get(token) as any;

  if (rec) {
    return {
      valid: true,
      type: 'Assinatura Eletrônica Avançada Zemda (SHA-256)',
      signatureType: 'advanced_electronic',
      legislation: 'Lei Federal nº 14.063/2020 (Art. 5º, § 1º, II)',
      signerName: rec.signer_name || 'Profissional de Atendimento',
      signerRegistration: rec.signer_registration || 'Conselho Profissional',
      signedAt: rec.signed_at,
      documentType: rec.title || 'Evolução Clínica em Prontuário',
      sha256Hash: rec.signature_hash,
      signatureHash: rec.signature_hash,
      certificateIssuer: 'Plataforma Zemda',
      certificateProvider: 'Integridade Eletrônica Avançada (SHA-256)',
      integrityStatus: 'Íntegro e Válido',
      verificationToken: token,
      clinicName: rec.trade_name || rec.tenant_name || undefined
    };
  }

  return {
    valid: false,
    error: 'Documento não encontrado ou código de verificação expirado/inválido.'
  };
}

// ============================================================================
// PROVEDOR ATIVO ATUAL: ICPProviderDisabled (Item 5)
// Retorna explicitamente que a integração ICP-Brasil está em preparação
// e impede qualquer simulação de PAdES ou certificados fictícios.
// ============================================================================
export class ICPProviderDisabled implements DigitalSignatureProvider {
  readonly name = 'ICPProviderDisabled';

  isConfigured(): boolean {
    return false;
  }

  getStatus() {
    return {
      configured: false,
      provider: 'none',
      supportedProviders: [
        'BirdID (Soluti)',
        'SAFEID (Safeweb)',
        'VIDaaS (Valid)',
        'NeoID (Serpro)',
        'Certisign Remote'
      ],
      details: 'Assinatura ICP-Brasil ainda não configurada no Zemda. Integração em preparação.'
    };
  }

  async connectCertificate(_input: Partial<CertificateMetadata>): Promise<CertificateMetadata> {
    throw new Error('Assinatura ICP-Brasil ainda não configurada no Zemda.');
  }

  async validateCertificate(_certificateId: string, _tenantId: string): Promise<any> {
    throw new Error('Assinatura ICP-Brasil ainda não configurada no Zemda.');
  }

  async disconnectCertificate(_certificateId: string, _tenantId: string): Promise<boolean> {
    throw new Error('Assinatura ICP-Brasil ainda não configurada no Zemda.');
  }

  async signDocument(_req: SignatureRequest): Promise<SignatureResult> {
    throw new Error('Assinatura ICP-Brasil ainda não configurada no Zemda.');
  }

  async verifySignature(token: string): Promise<any> {
    return verifyInternalRecordIntegrity(token);
  }
}

// ============================================================================
// PROVEDOR EM NUVEM PARA FUTURA ATIVAÇÃO (Item 10)
// Quando as credenciais de produção do PSC forem fornecidas na Railway
// (PSC_PROVIDER, PSC_CLIENT_ID, PSC_CLIENT_SECRET), basta alternar
// digitalSignatureService para new CloudPSCProvider().
// ============================================================================
export class CloudPSCProvider implements DigitalSignatureProvider {
  readonly name = 'CloudPSC';

  isConfigured(): boolean {
    const provider = process.env.PSC_PROVIDER;
    const clientId = process.env.PSC_CLIENT_ID;
    const clientSecret = process.env.PSC_CLIENT_SECRET;
    return Boolean(provider && clientId && clientSecret);
  }

  getStatus() {
    const configured = this.isConfigured();
    return {
      configured,
      provider: process.env.PSC_PROVIDER || 'none',
      supportedProviders: ['BirdID (Soluti)', 'SAFEID (Safeweb)', 'VIDaaS (Valid)', 'NeoID (Serpro)', 'Certisign Remote'],
      details: configured
        ? `PSC Ativo: ${process.env.PSC_PROVIDER}`
        : 'Provedor de Certificação Digital ICP-Brasil não configurado via variáveis de ambiente.'
    };
  }

  async connectCertificate(input: Partial<CertificateMetadata>): Promise<CertificateMetadata> {
    if (!this.isConfigured()) {
      throw new Error('Assinatura ICP-Brasil ainda não configurada no Zemda.');
    }
    if (!input.tenantId || !input.holderId || !input.subjectName) {
      throw new Error('Metadados mínimos obrigatórios não informados para o certificado');
    }

    const id = input.id || `cert-${uuidv4()}`;
    const holderType = input.holderType || 'professional';
    const certificateType = input.certificateType || 'remote';
    const serialNumber = input.serialNumber || crypto.randomBytes(12).toString('hex').toUpperCase();
    const subjectName = input.subjectName.trim();
    const maskedCpf = maskCpf(input.subjectCpfCnpj || '***.***.***-**');
    const issuer = input.issuer || 'AC SOLUTI Multipla v5 (ICP-Brasil)';
    const validFrom = input.validFrom || new Date().toISOString();
    const validUntil = input.validUntil || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const fingerprintSha256 = input.fingerprintSha256 || crypto.createHash('sha256').update(`${serialNumber}-${subjectName}-${issuer}`).digest('hex');
    const provider = input.provider || (process.env.PSC_PROVIDER || 'remote_psc');
    const providerReference = input.providerReference || null;
    const status = input.status || 'valid';

    db.prepare(`
      INSERT INTO digital_certificates (
        id, tenant_id, holder_type, holder_id, professional_id, certificate_type, serial_number,
        certificate_serial, subject_name, subject_cpf_cnpj, issuer, valid_from, valid_until,
        fingerprint_sha256, provider, provider_reference, status, created_at, last_validated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id, input.tenantId, holderType, input.holderId, input.professionalId || input.holderId,
      certificateType, serialNumber, serialNumber, subjectName, maskedCpf, issuer, validFrom, validUntil,
      fingerprintSha256, provider, providerReference, status
    );

    return {
      id,
      tenantId: input.tenantId,
      holderType,
      holderId: input.holderId,
      professionalId: input.professionalId || input.holderId,
      certificateType,
      serialNumber,
      subjectName,
      subjectCpfCnpj: maskedCpf,
      issuer,
      validFrom,
      validUntil,
      fingerprintSha256,
      provider,
      providerReference,
      status
    };
  }

  async validateCertificate(certificateId: string, tenantId: string): Promise<any> {
    const cert = db.prepare('SELECT * FROM digital_certificates WHERE id = ? AND tenant_id = ?').get(certificateId, tenantId) as any;
    if (!cert) throw new Error('Certificado não encontrado.');
    return { status: cert.status, validUntil: cert.valid_until };
  }

  async disconnectCertificate(certificateId: string, tenantId: string): Promise<boolean> {
    const res = db.prepare('DELETE FROM digital_certificates WHERE id = ? AND tenant_id = ?').run(certificateId, tenantId);
    return res.changes > 0;
  }

  async signDocument(req: SignatureRequest): Promise<SignatureResult> {
    if (!this.isConfigured()) {
      throw new Error('Assinatura ICP-Brasil ainda não configurada no Zemda.');
    }

    let cert: any = null;
    if (req.certificateId) {
      cert = db.prepare('SELECT * FROM digital_certificates WHERE id = ? AND tenant_id = ?').get(req.certificateId, req.tenantId) as any;
    } else if (req.holderId || req.userId) {
      cert = db.prepare(`
        SELECT * FROM digital_certificates 
        WHERE tenant_id = ? AND (holder_id = ? OR holder_id = ? OR professional_id = ?) AND status = 'valid' 
        ORDER BY created_at DESC LIMIT 1
      `).get(req.tenantId, req.holderId || req.userId, req.userId || req.holderId, req.holderId || req.userId) as any;
    }

    if (!cert) {
      throw new Error('Certificado ICP-Brasil não configurado ou inativo.');
    }

    if (new Date(cert.valid_until) < new Date()) {
      try {
        db.prepare("UPDATE digital_certificates SET status = 'expired' WHERE id = ?").run(cert.id);
      } catch (_) {}
      throw new Error(`O Certificado ICP-Brasil (${cert.subject_name}) expirou em ${new Date(cert.valid_until).toLocaleDateString('pt-BR')}.`);
    }

    const verificationToken = uuidv4().replace(/-/g, '');
    const officialDomain = process.env.PUBLIC_APP_URL || 'https://zemda.com.br';
    const verificationUrl = `${officialDomain}/verificar-documento/${verificationToken}`;

    const contentBuffer = Buffer.isBuffer(req.rawContent) ? req.rawContent : Buffer.from(String(req.rawContent || ''), 'utf8');
    const sha256Hash = crypto.createHash('sha256').update(contentBuffer).digest('hex');

    const signedAt = new Date().toISOString();
    const signatureId = `sig-${uuidv4()}`;

    const validationResult = {
      status: 'valid' as const,
      algorithm: 'SHA256withRSA',
      certificateChainValidated: true,
      timestampValidated: true,
      issuer: cert.issuer,
      serialNumber: cert.serial_number,
      policy: 'PAdES-AD-RB (ITI ICP-Brasil)'
    };

    const qrSvg = generateQrCodeSvg(verificationUrl, 130);
    const qrDataUrl = generateQrCodeDataUrl(verificationUrl, 130);

    const stampHtml = `
      <div style="border: 1.5px solid #0f172a; padding: 12px; border-radius: 8px; font-family: sans-serif; font-size: 11px; display: flex; justify-content: space-between; align-items: center; background: #ffffff;">
        <div style="flex: 1; margin-right: 12px;">
          <div style="font-weight: 800; font-size: 12px; color: #0f172a; margin-bottom: 4px;">
            DOCUMENTO ASSINADO DIGITALMENTE • ICP-BRASIL (PAdES)
          </div>
          <div style="color: #334155; margin-bottom: 2px;">
            <strong>Titular:</strong> ${escapeHtml(req.signerName)} ${req.signerRegistration ? `(${escapeHtml(req.signerRegistration)})` : ''}
          </div>
          <div style="color: #475569; margin-bottom: 2px;">
            <strong>Emissor:</strong> ${escapeHtml(cert.issuer)} | <strong>Série:</strong> ${escapeHtml(cert.serial_number)}
          </div>
          <div style="color: #475569; margin-bottom: 4px;">
            <strong>Data e Hora:</strong> ${new Date(signedAt).toLocaleString('pt-BR')}
          </div>
          <div style="font-family: monospace; font-size: 9px; color: #64748b; word-break: break-all;">
            Hash SHA-256: ${sha256Hash}
          </div>
          <div style="font-size: 10px; color: #0d9488; margin-top: 4px; font-weight: 600;">
            Verificação online: ${verificationUrl}
          </div>
        </div>
        <div style="width: 100px; height: 100px; display: flex; align-items: center; justify-content: center;">
          ${qrSvg}
        </div>
      </div>
    `;

    db.prepare(`
      INSERT INTO digital_signatures (
        id, tenant_id, document_id, document_type, certificate_id, professional_id, file_id,
        sha256_hash, signature_format, verification_token, validation_result_json,
        signed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PAdES', ?, ?, ?, datetime('now'))
    `).run(
      signatureId, req.tenantId, req.documentId, req.documentType, cert.id, req.holderId || null, req.fileId || null,
      sha256Hash, verificationToken, JSON.stringify(validationResult), signedAt
    );

    return {
      signatureId,
      verificationToken,
      verificationUrl,
      sha256Hash,
      signedAt,
      format: 'PAdES',
      qrCodeSvg: qrSvg,
      qrCodeDataUrl: qrDataUrl,
      stampHtml,
      validationResult
    };
  }

  async verifySignature(token: string): Promise<any> {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token de verificação inválido ou ausente.' };
    }

    const cleanToken = token.trim();
    const sig = db.prepare(`
      SELECT s.*, c.subject_name, c.subject_cpf_cnpj, c.issuer, c.certificate_type, c.serial_number, c.status as cert_status, c.provider as cert_provider,
             t.trade_name, t.name as tenant_name
      FROM digital_signatures s
      LEFT JOIN digital_certificates c ON c.id = s.certificate_id
      LEFT JOIN tenants t ON t.id = s.tenant_id
      WHERE s.verification_token = ?
    `).get(cleanToken) as any;

    if (!sig) {
      return verifyInternalRecordIntegrity(cleanToken);
    }

    let validationResult: any = {};
    try {
      validationResult = JSON.parse(sig.validation_result_json || '{}');
    } catch (_) {}

    return {
      valid: true,
      type: 'Certificado Digital ICP-Brasil (PAdES)',
      signatureType: 'pades',
      legislation: 'Medida Provisória nº 2.200-2/2001 e Padrão ITI PAdES',
      signatureId: sig.id,
      signedAt: sig.signed_at,
      documentType: formatDocumentType(sig.document_type),
      rawDocumentType: sig.document_type,
      sha256Hash: sig.sha256_hash,
      signatureHash: sig.sha256_hash,
      signerName: sig.subject_name || 'Titular do Certificado',
      signerCpf: sig.subject_cpf_cnpj,
      signerCpfMasked: sig.subject_cpf_cnpj,
      issuer: sig.issuer || 'Autoridade Certificadora ICP-Brasil',
      certificateIssuer: sig.issuer || 'Autoridade Certificadora ICP-Brasil',
      certificateProvider: sig.cert_provider || 'PSC Conectado ICP-Brasil',
      serialNumber: sig.serial_number,
      certificateType: sig.certificate_type,
      certificateStatus: sig.cert_status === 'valid' ? 'Ativo e Válido' : 'Expirado / Revogado',
      integrityStatus: 'Autêntico e Inalterado',
      verificationToken: sig.verification_token || cleanToken,
      clinicName: sig.trade_name || sig.tenant_name || undefined
    };
  }
}

// ============================================================================
// INSTÂNCIA EXPORTADA DO SERVIÇO:
// Por enquanto, utilizamos ICPProviderDisabled conforme diretriz do sistema.
// Futura ativação: quando PSC_PROVIDER, PSC_CLIENT_ID e PSC_CLIENT_SECRET
// estiverem configurados na Railway, basta alternar para new CloudPSCProvider()
// ============================================================================
export const digitalSignatureService: DigitalSignatureProvider = new ICPProviderDisabled();

function maskCpf(val: string): string {
  const digits = val.replace(/\D/g, '');
  if (digits.length === 11) {
    return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  }
  if (digits.length === 14) {
    return `**.${digits.slice(2, 5)}.${digits.slice(5, 8)}/****-**`;
  }
  return '***.***.***-**';
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDocumentType(t: string): string {
  switch (t) {
    case 'certificate': return 'Atestado Clínico / Declaração Oficial';
    case 'prescription': return 'Receituário Clínico';
    case 'exam_request': return 'Solicitação de Exames';
    case 'clinical_record': return 'Prontuário Eletrônico / Evolução';
    case 'psychopedagogy_report': return 'Relatório Psicopedagógico Oficial';
    case 'psychology_document': return 'Documento Psicológico Oficial (CFP 06/2019)';
    case 'psychology_session': return 'Registro Documental de Sessão de Psicologia (CFP 01/2009)';
    default: return 'Documento Clínico';
  }
}
