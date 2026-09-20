import React, { useState } from 'react';
import {
  X,
  Printer,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  ExternalLink,
  Award,
  CheckCircle2,
  FileText,
  User,
  Building2,
  Lock,
  ArrowRight
} from 'lucide-react';
import { useProfessionalCertificate } from '../../hooks/useProfessionalCertificate';
import { useToast } from '../../context/ToastContext';
import { ApiClient } from '../../api/client';

export interface SignatureChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  documentType?: 'certificate' | 'prescription' | 'exam_request' | 'clinical_record' | 'psychopedagogy_report' | 'psychology_document' | 'psychology_session' | 'other';
  documentId?: string;
  rawContent?: string;
  patientName?: string;
  professionalName?: string;
  professionalCouncil?: string;
  onSelectManualPrint: () => void;
  onSignSuccess?: (signatureResult: any) => void;
  onOpenAccountSettings?: () => void;
}

export const SignatureChoiceModal: React.FC<SignatureChoiceModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  documentType = 'certificate',
  documentId,
  rawContent = '',
  patientName,
  professionalName,
  professionalCouncil,
  onSelectManualPrint,
  onSignSuccess,
  onOpenAccountSettings
}) => {
  const { showToast } = useToast();
  const { certificate, status, hasValidCertificate, loading } = useProfessionalCertificate();
  const [signing, setSigning] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleOpenSettings = () => {
    onClose();
    if (onOpenAccountSettings) {
      onOpenAccountSettings();
    } else {
      window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'certificate' } }));
      window.dispatchEvent(new CustomEvent('open-certificate-settings'));
    }
  };

  const handleDigitalSign = async () => {
    if (!hasValidCertificate || !certificate) {
      showToast('Certificado ICP-Brasil não configurado ou inativo.', 'error');
      return;
    }

    try {
      setSigning(true);

      const effectiveDocId = documentId || `doc-${Date.now()}`;
      const effectiveContent = rawContent || `${documentTitle} - ${patientName || 'Paciente'} - ${new Date().toISOString()}`;

      const res = await ApiClient.post<any>('/v1/digital-signatures/sign', {
        documentId: effectiveDocId,
        documentType,
        certificateId: certificate.id,
        rawContent: effectiveContent,
        signerName: professionalName || certificate.subject_name,
        signerRegistration: professionalCouncil || null,
        signerCpf: certificate.subject_cpf_cnpj
      });

      showToast('Documento assinado digitalmente com Certificado ICP-Brasil!', 'success');
      if (onSignSuccess) {
        onSignSuccess(res);
      }
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Falha ao assinar digitalmente com ICP-Brasil.', 'error');
    } finally {
      setSigning(false);
    }
  };

  const handleManualPrintClick = () => {
    onSelectManualPrint();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header Modal */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">Emissão & Finalização de Documento</h3>
              <p className="text-xs text-teal-200">
                {documentTitle} {patientName ? `• ${patientName}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: As DUAS opções claras e estritas */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed font-medium">
            Escolha abaixo o método de emissão desejado. Em cumprimento às normas éticas e regulatórias da ICP-Brasil, o sistema distingue expressamente a impressão manual da assinatura digital certificada.
          </p>

          {/* OPÇÃO 1: Imprimir para Assinatura Manual */}
          <div className="p-5 rounded-2xl border-2 border-slate-200 hover:border-slate-300 bg-slate-50/70 transition-all space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">Imprimir para Assinatura Manual</h4>
                  <span className="text-[11px] text-slate-500">Impressão tradicional em papel ou salvamento PDF limpo</span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                Tradicional
              </span>
            </div>

            <p className="text-slate-600 text-xs leading-relaxed">
              Gera o documento formatado em padrão A4 oficial com cabeçalho institucional da clínica e linha de assinatura para o profissional (nome e conselho). Não adiciona carimbos digitais falsos.
            </p>

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={handleManualPrintClick}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir para assinatura manual</span>
              </button>
            </div>
          </div>

          {/* OPÇÃO 2: Assinar Digitalmente com ICP-Brasil (PAdES) */}
          <div className={`p-5 rounded-2xl border-2 transition-all space-y-3 ${
            hasValidCertificate
              ? 'border-teal-400 bg-teal-50/40 hover:border-teal-500'
              : 'border-slate-200 bg-slate-50/50'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                  hasValidCertificate ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-500'
                }`}>
                  2
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                    <span>Assinar digitalmente com ICP-Brasil</span>
                    <ShieldCheck className={`w-4 h-4 ${hasValidCertificate ? 'text-teal-600' : 'text-slate-400'}`} />
                  </h4>
                  <span className="text-[11px] text-slate-500">Padrão PAdES com validade jurídica plena (MP nº 2.200-2/2001)</span>
                </div>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                hasValidCertificate
                  ? 'bg-teal-100 text-teal-800 border border-teal-200'
                  : 'bg-slate-200 text-slate-600'
              }`}>
                ICP-Brasil PAdES
              </span>
            </div>

            <p className="text-slate-600 text-xs leading-relaxed">
              Realiza a assinatura criptográfica do documento. Anexa carimbo visual oficial com dados da AC emissora, número de série, hash SHA-256 e QR Code para validação pública online.
            </p>

            {/* Verificação do Status do Certificado */}
            {loading ? (
              <div className="p-3 bg-white rounded-xl border border-slate-200 text-slate-500 text-center text-xs">
                Verificando certificado ICP-Brasil do profissional...
              </div>
            ) : hasValidCertificate && certificate ? (
              <div className="p-3.5 bg-white rounded-xl border border-teal-200 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5 text-teal-900">
                    <Award className="w-3.5 h-3.5 text-teal-600" />
                    {certificate.subject_name}
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    Certificado Válido
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Emissor: <strong>{certificate.issuer}</strong> • Provedor: {certificate.provider}
                </p>
                <p className="text-[10px] text-slate-400">
                  Validade: até {new Date(certificate.valid_until).toLocaleDateString('pt-BR')}
                </p>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <strong className="block font-bold">Certificado ICP-Brasil não configurado ou inativo</strong>
                    <p className="text-amber-800 text-[11px] leading-relaxed">
                      Para assinar digitalmente com validade jurídica, configure seu certificado digital (PSC em nuvem como BirdID, VIDaaS, SafeID ou A1) em Minha Conta.
                    </p>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleOpenSettings}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Configurar em Minha Conta</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                disabled={!hasValidCertificate || signing}
                onClick={handleDigitalSign}
                className={`inline-flex items-center gap-2 px-5 py-2.5 font-bold text-xs rounded-xl shadow-md transition-all ${
                  hasValidCertificate && !signing
                    ? 'bg-teal-600 hover:bg-teal-700 text-white cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
                title={!hasValidCertificate ? 'Configure seu certificado ICP-Brasil em Minha Conta para ativar esta opção' : 'Assinar digitalmente com ICP-Brasil'}
              >
                {signing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Assinando PAdES...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Assinar digitalmente com ICP-Brasil</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0 text-xs">
          <span className="text-slate-400">
            Plataforma Zemda • Conformidade MP nº 2.200-2/2001 e LGPD
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
