import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../api/client';
import { Building2, AlertCircle, Loader2 } from 'lucide-react';

export interface ClinicData {
  id?: string;
  name: string;
  trade_name?: string;
  corporate_name?: string;
  cnpj_cpf?: string;
  phone?: string;
  mobile?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  logo_url?: string;
  client_term_label?: string;
}

export interface UseClinicDocumentDataResult {
  clinic: ClinicData | null;
  loading: boolean;
  error: string | null;
  canIssue: boolean;
}

/**
 * Hook canônico para obter os dados reais da clínica emissora de documentos.
 * Consulta `/v1/clinics/current` e sincroniza com `currentTenant`.
 * Nunca utiliza "Zemda" como nome de clínica.
 */
export function useClinicDocumentData(initialData?: Partial<ClinicData> | null): UseClinicDocumentDataResult {
  const { currentTenant } = useAuth();
  const [clinic, setClinic] = useState<ClinicData | null>(() => {
    if (initialData && initialData.name) return initialData as ClinicData;
    if (currentTenant && currentTenant.name) {
      return {
        id: currentTenant.id,
        name: currentTenant.name,
        trade_name: currentTenant.trade_name,
        corporate_name: currentTenant.corporate_name,
        cnpj_cpf: currentTenant.cnpj_cpf,
        email: currentTenant.email,
        phone: currentTenant.phone,
        mobile: currentTenant.mobile,
        whatsapp: currentTenant.whatsapp,
        address: currentTenant.address,
        city: currentTenant.city,
        state: currentTenant.state,
        zip_code: currentTenant.zip_code,
        logo_url: currentTenant.logo_url,
        client_term_label: currentTenant.client_term_label
      };
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(!clinic || !clinic.name);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchClinicCurrent() {
      try {
        setLoading(true);
        setError(null);
        const data = await ApiClient.get<any>('/v1/clinics/current');
        if (!isMounted) return;

        if (data && data.name) {
          setClinic({
            id: data.id,
            name: data.name,
            trade_name: data.trade_name,
            corporate_name: data.corporate_name,
            cnpj_cpf: data.cnpj_cpf,
            email: data.email,
            phone: data.phone,
            mobile: data.mobile,
            whatsapp: data.whatsapp,
            address: data.address,
            street: data.street,
            number: data.number,
            complement: data.complement,
            neighborhood: data.neighborhood,
            city: data.city,
            state: data.state,
            zip_code: data.zip_code,
            logo_url: data.logo_url,
            client_term_label: data.client_term_label
          });
          setError(null);
        } else {
          // Fallback exclusivamente para currentTenant da sessão ativa
          if (currentTenant && currentTenant.name) {
            setClinic(currentTenant as ClinicData);
          } else {
            setError('Não foi possível carregar os dados da clínica emissora.');
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('[useClinicDocumentData] Erro ao carregar clínica:', err);
        if (currentTenant && currentTenant.name) {
          setClinic(currentTenant as ClinicData);
          setError(null);
        } else {
          setError('Não foi possível carregar os dados da clínica emissora.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchClinicCurrent();

    return () => {
      isMounted = false;
    };
  }, [currentTenant]);

  const canIssue = !loading && !error && Boolean(clinic && clinic.name && clinic.name.trim().length > 0);

  return { clinic, loading, error, canIssue };
}

/** Formata endereço completo e limpo para cabeçalho */
export function formatClinicAddress(clinic: Partial<ClinicData> | null | undefined): string {
  if (!clinic) return '';
  if (clinic.address && clinic.address.trim()) return clinic.address.trim();

  const parts: string[] = [];
  const streetPart = [clinic.street, clinic.number].filter(Boolean).join(', ');
  if (streetPart) parts.push(streetPart);
  if (clinic.complement) parts.push(clinic.complement);
  if (clinic.neighborhood) parts.push(clinic.neighborhood);
  return parts.join(' - ');
}

/** Formata Cidade e UF */
export function formatClinicCityState(clinic: Partial<ClinicData> | null | undefined): string {
  if (!clinic) return '';
  if (clinic.city && clinic.state) return `${clinic.city} - ${clinic.state}`;
  return clinic.city || clinic.state || '';
}

/** Formata contatos (Telefone / E-mail) */
export function formatClinicContact(clinic: Partial<ClinicData> | null | undefined): string {
  if (!clinic) return '';
  const contacts: string[] = [];
  const phone = clinic.phone || clinic.mobile || clinic.whatsapp;
  if (phone) contacts.push(`Tel: ${phone}`);
  if (clinic.email) contacts.push(`E-mail: ${clinic.email}`);
  return contacts.join(' • ');
}

export interface ClinicDocumentHeaderProps {
  clinic?: Partial<ClinicData> | null;
  loading?: boolean;
  error?: string | null;
  documentTitle?: string;
  documentSubtitle?: string;
  documentDate?: string;
  documentNumber?: string;
  accentColor?: string; // e.g. 'teal', 'sky', 'indigo'
  className?: string;
}

/**
 * Componente canônico de cabeçalho de documentos clínicos.
 * Exibe obrigatoriamente a identidade da clínica real emissora.
 * Nunca utiliza Zemda como nome de clínica.
 */
export const ClinicDocumentHeader: React.FC<ClinicDocumentHeaderProps> = ({
  clinic,
  loading = false,
  error = null,
  documentTitle = 'GUIA DO PACIENTE',
  documentSubtitle,
  documentDate,
  documentNumber,
  accentColor = 'teal',
  className = ''
}) => {
  const todayStr = documentDate || new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  if (loading) {
    return (
      <div className={`border-b-2 border-slate-200 pb-4 p-4 rounded-xl bg-slate-50 flex items-center justify-center gap-3 text-slate-500 text-xs ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
        <span>Carregando dados institucionais da clínica emissora...</span>
      </div>
    );
  }

  if (error || !clinic?.name) {
    return (
      <div className={`border-2 border-rose-200 bg-rose-50 text-rose-800 p-4 rounded-xl flex items-center gap-3 text-xs ${className}`}>
        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
        <div>
          <strong className="block font-bold">Não foi possível carregar os dados da clínica emissora.</strong>
          <span className="text-[11px] text-rose-700">Por segurança e conformidade ética, a emissão do documento está suspensa até a validação da instituição.</span>
        </div>
      </div>
    );
  }

  const realClinicName = clinic.trade_name || clinic.name;
  const addressStr = formatClinicAddress(clinic);
  const cityStateStr = formatClinicCityState(clinic);
  const contactStr = formatClinicContact(clinic);

  return (
    <div className={`border-b-2 border-slate-800 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${className}`}>
      <div className="flex items-start gap-4">
        {clinic.logo_url ? (
          <img
            src={clinic.logo_url}
            alt={realClinicName}
            className="w-16 h-16 object-contain rounded-xl border border-slate-100 p-1 bg-white shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
            <Building2 className="w-7 h-7" />
          </div>
        )}

        <div className="space-y-0.5">
          <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
            {realClinicName}
          </h1>

          {clinic.corporate_name && clinic.corporate_name !== realClinicName && (
            <p className="text-[11px] text-slate-500 font-medium">{clinic.corporate_name}</p>
          )}

          {clinic.cnpj_cpf && (
            <p className="text-[11px] text-slate-600 font-semibold">
              CNPJ/CPF: {clinic.cnpj_cpf}
            </p>
          )}

          {addressStr && (
            <p className="text-xs text-slate-600">{addressStr}</p>
          )}

          {cityStateStr && (
            <p className="text-xs text-slate-600">{cityStateStr}</p>
          )}

          {contactStr && (
            <p className="text-[11px] text-slate-500">{contactStr}</p>
          )}
        </div>
      </div>

      <div className="text-left sm:text-right shrink-0">
        <span className="inline-block px-3 py-1 bg-slate-100 text-slate-800 border border-slate-300 rounded-lg font-black text-xs uppercase tracking-wider">
          {documentTitle}
        </span>
        {documentNumber && (
          <p className="text-xs font-mono font-bold text-slate-700 mt-1">{documentNumber}</p>
        )}
        {documentSubtitle && (
          <p className="text-[11px] text-slate-500 mt-0.5">{documentSubtitle}</p>
        )}
        <p className="text-[11px] text-slate-500 mt-1">{todayStr}</p>
      </div>
    </div>
  );
};
export interface DigitalStampInfo {
  format?: 'PAdES' | 'electronic';
  isIcpBrasil?: boolean;
  signerName?: string;
  signerRegistration?: string;
  signerCpfMasked?: string;
  issuer?: string;
  serialNumber?: string;
  signedAt?: string;
  sha256Hash?: string;
  verificationUrl?: string;
  qrCodeSvg?: string;
  qrCodeDataUrl?: string;
}

export interface ClinicDocumentFooterProps {
  signatureHash?: string;
  signedByName?: string;
  signedByRegistration?: string;
  signedAt?: string;
  digitalStamp?: DigitalStampInfo | null;
  className?: string;
}

/**
 * Componente canônico de rodapé.
 * Distingue com precisão estrita:
 * 1. Carimbo Digital ICP-Brasil (PAdES) com QR Code e link oficial de validação
 * 2. Selo Eletrônico Interno Avançado do Zemda (SHA-256)
 * 3. Rodapé limpo para assinatura manual (sem selos falsos)
 */
export const ClinicDocumentFooter: React.FC<ClinicDocumentFooterProps> = ({
  signatureHash,
  signedByName,
  signedByRegistration,
  signedAt,
  digitalStamp,
  className = ''
}) => {
  const todayStr = new Date().toLocaleDateString('pt-BR');

  // Caso 1: Documento assinado digitalmente com Certificado ICP-Brasil (PAdES)
  if (digitalStamp && (digitalStamp.isIcpBrasil || digitalStamp.format === 'PAdES')) {
    return (
      <div className={`mt-8 pt-4 space-y-2 ${className}`}>
        <div className="border-2 border-slate-900 p-3.5 rounded-xl bg-white flex flex-col sm:flex-row items-center justify-between gap-4 text-left font-sans text-xs">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-1.5 font-extrabold text-slate-900 text-xs uppercase tracking-wide">
              <span>DOCUMENTO ASSINADO DIGITALMENTE • ICP-BRASIL (PAdES)</span>
            </div>
            <div className="text-slate-800">
              <strong>Titular:</strong> {digitalStamp.signerName || signedByName || 'Profissional Titular'}
              {(digitalStamp.signerRegistration || signedByRegistration) && (
                <span> ({digitalStamp.signerRegistration || signedByRegistration})</span>
              )}
            </div>
            {digitalStamp.issuer && (
              <div className="text-slate-600 text-[11px]">
                <strong>Emissor:</strong> {digitalStamp.issuer}
                {digitalStamp.serialNumber && <span> | <strong>Série:</strong> {digitalStamp.serialNumber}</span>}
              </div>
            )}
            <div className="text-slate-600 text-[11px]">
              <strong>Data e Hora:</strong> {digitalStamp.signedAt ? new Date(digitalStamp.signedAt).toLocaleString('pt-BR') : todayStr}
            </div>
            {(digitalStamp.sha256Hash || signatureHash) && (
              <div className="font-mono text-[9px] text-slate-500 break-all">
                Hash SHA-256: {digitalStamp.sha256Hash || signatureHash}
              </div>
            )}
            {digitalStamp.verificationUrl && (
              <div className="text-[10px] text-teal-800 font-bold mt-1">
                Verificação online: <a href={digitalStamp.verificationUrl} target="_blank" rel="noopener noreferrer" className="underline">{digitalStamp.verificationUrl}</a>
              </div>
            )}
          </div>

          {(digitalStamp.qrCodeSvg || digitalStamp.qrCodeDataUrl) && (
            <div className="w-24 h-24 shrink-0 flex items-center justify-center border border-slate-200 p-1 rounded-lg bg-white">
              {digitalStamp.qrCodeDataUrl ? (
                <img src={digitalStamp.qrCodeDataUrl} alt="QR Code de Verificação" className="w-full h-full object-contain" />
              ) : digitalStamp.qrCodeSvg ? (
                <div dangerouslySetInnerHTML={{ __html: digitalStamp.qrCodeSvg }} className="w-full h-full flex items-center justify-center" />
              ) : null}
            </div>
          )}
        </div>
        <p className="text-[10px] text-slate-400 text-center">
          Conformidade com a Medida Provisória nº 2.200-2/2001 e Padrão ITI PAdES • Sistema Zemda
        </p>
      </div>
    );
  }

  // Caso 2: Documento finalizado eletronicamente no sistema (Selo interno SHA-256 sem ICP-Brasil)
  if (signedByName || signatureHash) {
    const formattedDate = signedAt ? new Date(signedAt).toLocaleDateString('pt-BR') : todayStr;
    const formattedTime = signedAt ? new Date(signedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

    return (
      <div className={`mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-500 space-y-1 ${className}`}>
        <p className="font-medium text-slate-700">
          Documento finalizado eletronicamente no sistema Zemda em {formattedDate} {formattedTime ? `às ${formattedTime}` : ''} por{' '}
          <strong>{signedByName || 'Profissional Responsável'}</strong>
          {signedByRegistration ? ` (${signedByRegistration})` : ''}.
        </p>
        {signatureHash && (
          <p className="font-mono text-[9px] text-slate-500 break-all">
            Hash de integridade: {signatureHash}
          </p>
        )}
        <p className="text-[9.5px] text-slate-400">
          Assinatura Eletrônica Avançada conforme Lei Federal nº 14.063/2020 (Art. 5º, § 1º, II)
        </p>
      </div>
    );
  }

  // Caso 3: Impressão limpa para assinatura física manual (sem carimbos digitais falsos)
  return (
    <div className={`mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400 space-y-1 ${className}`}>
      <p>
        Documento emitido eletronicamente através do Sistema Zemda • Válido mediante assinatura física do profissional responsável.
      </p>
    </div>
  );
};

/**
 * Gera string HTML com o cabeçalho oficial para impressão em nova aba / popups.
 */
export function generateClinicHeaderHtml(options: {
  clinic: Partial<ClinicData> | null | undefined;
  documentTitle: string;
  documentSubtitle?: string;
  documentDate?: string;
  documentNumber?: string;
}): string {
  const { clinic, documentTitle, documentSubtitle, documentDate, documentNumber } = options;
  if (!clinic || !clinic.name) {
    return `
      <div style="border: 2px solid #fecaca; background: #fff1f2; color: #991b1b; padding: 16px; border-radius: 8px; margin-bottom: 20px; font-family: sans-serif; font-size: 13px;">
        <strong>Não foi possível carregar os dados da clínica emissora.</strong>
        <p style="margin: 4px 0 0 0; font-size: 11px;">Por conformidade ética e regulatória, o documento não pode ser impresso sem identificação da clínica emissora.</p>
      </div>
    `;
  }

  const realName = clinic.trade_name || clinic.name;
  const addressStr = formatClinicAddress(clinic);
  const cityStateStr = formatClinicCityState(clinic);
  const contactStr = formatClinicContact(clinic);
  const todayStr = documentDate || new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const logoHtml = clinic.logo_url
    ? `<img src="${clinic.logo_url}" alt="${realName}" style="max-height: 65px; max-width: 140px; object-fit: contain; margin-right: 16px; border-radius: 8px;" />`
    : '';

  return `
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div style="display: flex; align-items: flex-start;">
        ${logoHtml}
        <div>
          <h1 style="font-size: 18px; font-weight: 900; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: -0.3px;">${realName}</h1>
          ${clinic.corporate_name && clinic.corporate_name !== realName ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${clinic.corporate_name}</div>` : ''}
          ${clinic.cnpj_cpf ? `<div style="font-size: 11px; color: #475569; font-weight: 600; margin-top: 2px;">CNPJ/CPF: ${clinic.cnpj_cpf}</div>` : ''}
          ${addressStr ? `<div style="font-size: 11px; color: #475569; margin-top: 2px;">${addressStr}</div>` : ''}
          ${cityStateStr ? `<div style="font-size: 11px; color: #475569; margin-top: 2px;">${cityStateStr}</div>` : ''}
          ${contactStr ? `<div style="font-size: 10.5px; color: #64748b; margin-top: 2px;">${contactStr}</div>` : ''}
        </div>
      </div>
      <div style="text-align: right;">
        <div style="display: inline-block; padding: 4px 10px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 900; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">${documentTitle}</div>
        ${documentNumber ? `<div style="font-family: monospace; font-size: 11px; font-weight: bold; color: #334155; margin-top: 4px;">${documentNumber}</div>` : ''}
        ${documentSubtitle ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${documentSubtitle}</div>` : ''}
        <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${todayStr}</div>
      </div>
    </div>
  `;
}

/**
 * Gera string HTML com o rodapé oficial para impressão.
 */
export function generateClinicFooterHtml(options?: {
  signatureHash?: string;
  signedByName?: string;
  signedByRegistration?: string;
  signedAt?: string;
  digitalStamp?: DigitalStampInfo | null;
}): string {
  const todayStr = new Date().toLocaleDateString('pt-BR');

  // Caso ICP-Brasil
  if (options?.digitalStamp && (options.digitalStamp.isIcpBrasil || options.digitalStamp.format === 'PAdES')) {
    const s = options.digitalStamp;
    const qrPart = s.qrCodeSvg
      ? `<div style="width: 90px; height: 90px; margin-left: 12px; display: flex; align-items: center; justify-content: center;">${s.qrCodeSvg}</div>`
      : s.qrCodeDataUrl
      ? `<div style="width: 90px; height: 90px; margin-left: 12px;"><img src="${s.qrCodeDataUrl}" style="width: 100%; height: 100%; object-fit: contain;" /></div>`
      : '';

    return `
      <div style="margin-top: 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="border: 2px solid #0f172a; border-radius: 8px; padding: 12px; display: flex; justify-content: space-between; align-items: center; background: #ffffff;">
          <div style="flex: 1; font-size: 11px; color: #1e293b; line-height: 1.4;">
            <div style="font-weight: 900; font-size: 11.5px; color: #0f172a; margin-bottom: 3px;">DOCUMENTO ASSINADO DIGITALMENTE • ICP-BRASIL (PAdES)</div>
            <div><strong>Titular:</strong> ${s.signerName || options.signedByName || ''} ${s.signerRegistration || options.signedByRegistration ? `(${s.signerRegistration || options.signedByRegistration})` : ''}</div>
            ${s.issuer ? `<div style="font-size: 10.5px; color: #475569;"><strong>Emissor:</strong> ${s.issuer} ${s.serialNumber ? `| <strong>Série:</strong> ${s.serialNumber}` : ''}</div>` : ''}
            <div style="font-size: 10.5px; color: #475569;"><strong>Data e Hora:</strong> ${s.signedAt ? new Date(s.signedAt).toLocaleString('pt-BR') : todayStr}</div>
            ${s.sha256Hash || options.signatureHash ? `<div style="font-family: monospace; font-size: 9px; color: #64748b; word-break: break-all; margin-top: 2px;">Hash SHA-256: ${s.sha256Hash || options.signatureHash}</div>` : ''}
            ${s.verificationUrl ? `<div style="font-size: 9.5px; color: #0f766e; font-weight: bold; margin-top: 3px;">Validação online: ${s.verificationUrl}</div>` : ''}
          </div>
          ${qrPart}
        </div>
        <div style="font-size: 9.5px; color: #94a3b8; text-align: center; margin-top: 6px;">Conformidade com a MP nº 2.200-2/2001 e Padrão ITI PAdES • Sistema Zemda</div>
      </div>
    `;
  }

  // Caso Selo Eletrônico Interno
  if (options?.signedByName || options?.signatureHash) {
    const formattedDate = options.signedAt ? new Date(options.signedAt).toLocaleDateString('pt-BR') : todayStr;
    const formattedTime = options.signedAt ? new Date(options.signedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

    return `
      <div style="margin-top: 28px; padding-top: 14px; border-top: 1px solid #cbd5e1; text-align: center; font-size: 10px; color: #475569; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5;">
        <div>Documento finalizado eletronicamente no sistema Zemda em ${formattedDate} ${formattedTime ? `às ${formattedTime}` : ''} por <strong>${options.signedByName || 'Profissional'}</strong>${options.signedByRegistration ? ` (${options.signedByRegistration})` : ''}.</div>
        ${options.signatureHash ? `<div style="font-family: monospace; font-size: 9px; color: #64748b; word-break: break-all;">Hash de integridade: ${options.signatureHash}</div>` : ''}
        <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">Assinatura Eletrônica Avançada conforme Lei Federal nº 14.063/2020</div>
      </div>
    `;
  }

  // Impressão limpa manual
  return `
    <div style="margin-top: 28px; padding-top: 14px; border-top: 1px solid #cbd5e1; text-align: center; font-size: 10px; color: #94a3b8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div>Documento emitido eletronicamente através do Sistema Zemda • Válido com assinatura física ou assinatura eletrônica.</div>
    </div>
  `;
}
