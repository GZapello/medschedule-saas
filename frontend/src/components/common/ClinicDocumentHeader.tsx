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

export interface ClinicDocumentFooterProps {
  signatureHash?: string;
  signedByName?: string;
  signedByRegistration?: string;
  signedAt?: string;
  className?: string;
}

/**
 * Componente canônico de rodapé.
 * O nome "Zemda" aparece estritamente como sistema/software de emissão tecnológica, nunca como clínica emissora.
 */
export const ClinicDocumentFooter: React.FC<ClinicDocumentFooterProps> = ({
  signatureHash,
  signedByName,
  signedByRegistration,
  signedAt,
  className = ''
}) => {
  const todayStr = new Date().toLocaleDateString('pt-BR');

  return (
    <div className={`mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400 space-y-1 ${className}`}>
      {signedByName && (
        <p className="text-slate-600 font-medium">
          Assinado eletronicamente por <strong>{signedByName}</strong>
          {signedByRegistration ? ` (${signedByRegistration})` : ''}
          {signedAt ? ` em ${new Date(signedAt).toLocaleString('pt-BR')}` : ''}
        </p>
      )}

      {signatureHash && (
        <p className="font-mono text-[9px] text-slate-500 break-all">
          Hash de integridade: {signatureHash}
        </p>
      )}

      <p className="text-[10px] text-slate-400">
        Documento emitido eletronicamente pelo Sistema Zemda • {todayStr}
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
}): string {
  const todayStr = new Date().toLocaleDateString('pt-BR');
  const sigHtml = options?.signedByName
    ? `<div style="color: #334155; font-weight: 600; margin-bottom: 4px;">Assinado eletronicamente por ${options.signedByName}${options.signedByRegistration ? ` (${options.signedByRegistration})` : ''}${options.signedAt ? ` em ${new Date(options.signedAt).toLocaleString('pt-BR')}` : ''}</div>`
    : '';
  const hashHtml = options?.signatureHash
    ? `<div style="font-family: monospace; font-size: 9px; color: #64748b; word-break: break-all; margin-bottom: 4px;">Hash de integridade: ${options.signatureHash}</div>`
    : '';

  return `
    <div style="margin-top: 32px; padding-top: 14px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      ${sigHtml}
      ${hashHtml}
      <div>Documento emitido eletronicamente pelo Sistema Zemda • ${todayStr}</div>
    </div>
  `;
}
