import React from 'react';
import {
  X,
  Printer,
  ShieldCheck,
  FileText,
  Clock,
  Info
} from 'lucide-react';

// ============================================================================
// REGRA ARQUITETURAL FUNDAMENTAL DO SISTEMA ZEMDA:
// internal_integrity_signature !== icp_brasil_signature
// 
// 1. Impressão Manual (AGORA): Gera o PDF oficial limpo com dados da clínica emissora,
//    do paciente, do profissional e espaço adequado para assinatura física.
//    NÃO contém carimbos digitais falsos ("assinado digitalmente", "ICP-Brasil", "PAdES").
//
// 2. Assinatura ICP-Brasil (FUTURO): Apresentada com badge "Em breve" e desabilitada
//    até a integração com provedores PSC em nuvem na Railway estar homologada.
// ============================================================================
export const INTERNAL_INTEGRITY_SIGNATURE_DIFFERS_FROM_ICP_BRASIL = true;

export interface SignatureChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  documentType?: string;
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
  patientName,
  onSelectManualPrint
}) => {
  if (!isOpen) return null;

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
              <h3 className="text-base font-black tracking-tight">Emissão & Assinatura de Documento</h3>
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

        {/* Modal Body: As DUAS opções claras */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed font-medium">
            Selecione a modalidade de emissão para o documento. Em cumprimento às normas legais e aos conselhos profissionais, a assinatura digital qualificada exige certificado ICP-Brasil real.
          </p>

          {/* OPÇÃO 1: Imprimir para Assinatura Manual (DISPONÍVEL) */}
          <div className="p-5 rounded-2xl border-2 border-teal-500 bg-teal-50/40 transition-all space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-700 text-white flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">Imprimir para Assinatura Manual</h4>
                  <span className="text-[11px] text-teal-700 font-semibold">Recomendado • Validade jurídica imediata física</span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                Disponível
              </span>
            </div>

            <p className="text-slate-600 text-xs leading-relaxed">
              Gera o documento formatado em padrão A4 oficial com a identidade institucional real da clínica emissora, identificação do paciente, do profissional (nome e conselho/registro) e espaço em branco com linha para assinatura manual à caneta.
            </p>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleManualPrintClick}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir para assinatura manual</span>
              </button>
            </div>
          </div>

          {/* OPÇÃO 2: Assinar Digitalmente com ICP-Brasil (EM BREVE / DESABILITADO) */}
          <div className="p-5 rounded-2xl border-2 border-slate-200 bg-slate-50/60 transition-all space-y-3 opacity-80">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                    <span>Assinar digitalmente com ICP-Brasil</span>
                    <ShieldCheck className="w-4 h-4 text-slate-400" />
                  </h4>
                  <span className="text-[11px] text-slate-500">Padrão PAdES com certificado qualificado (MP nº 2.200-2/2001)</span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Em breve
              </span>
            </div>

            <p className="text-slate-500 text-xs leading-relaxed">
              A assinatura digital com certificado ICP-Brasil em nuvem (PSC) está em preparação e será ativada com provedores credenciados. O Zemda não emite certificados simulados nem assinaturas sem validade jurídica real.
            </p>

            <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 flex items-center gap-2 text-slate-600 text-[11px]">
              <Info className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Para emitir este documento agora, utilize a opção <strong>Imprimir para assinatura manual</strong> acima.</span>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                disabled={true}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-200 text-slate-400 font-bold text-xs rounded-xl shadow-none cursor-not-allowed"
                title="A integração com ICP-Brasil está em preparação e será disponibilizada em breve"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Assinar digitalmente com ICP-Brasil (Em breve)</span>
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 shrink-0 text-xs">
          <span className="text-slate-400 text-[11px]">
            Plataforma Zemda • Conformidade MP nº 2.200-2/2001 e Lei 14.063/2020
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
