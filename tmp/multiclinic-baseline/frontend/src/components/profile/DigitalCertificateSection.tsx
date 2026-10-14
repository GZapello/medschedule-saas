import React from 'react';
import {
  ShieldCheck,
  AlertCircle,
  KeyRound,
  Clock,
  Info
} from 'lucide-react';

export const DigitalCertificateSection: React.FC = () => {
  return (
    <div className="space-y-5 text-xs">
      {/* Banner Principal Informativo */}
      <div className="p-4 bg-gradient-to-r from-teal-50 to-slate-50 border border-teal-200 rounded-2xl flex items-start gap-3 text-slate-700 leading-relaxed">
        <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="font-extrabold text-slate-900 text-sm">Certificado Digital ICP-Brasil</h4>
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
              <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
              Não configurado
            </span>
          </div>
          <p className="text-slate-600 text-xs">
            A infraestrutura para emissão de documentos com assinatura digital qualificada ICP-Brasil (padrão PAdES ITI) está em preparação para conexão direta com provedores PSC em nuvem credenciados.
          </p>
        </div>
      </div>

      {/* Card Central de Status */}
      <div className="p-8 text-center bg-slate-50/80 rounded-2xl border border-dashed border-slate-300 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center mx-auto shadow-2xs">
          <KeyRound className="w-7 h-7 text-teal-600" />
        </div>

        <div className="max-w-md mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-800 text-[11px] font-bold">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Integração ICP-Brasil em preparação.</span>
          </div>
          <h5 className="font-bold text-slate-800 text-sm">
            Vínculo Profissional Exclusivo
          </h5>
          <p className="text-slate-500 text-xs leading-relaxed">
            Quando disponível, seu certificado ficará vinculado exclusivamente ao seu perfil profissional.
          </p>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            A integração funcionará diretamente com os principais provedores em nuvem (BirdID Soluti, VIDaaS Valid, SafeID Safeweb, NeoID Serpro e Certisign), sem necessidade de upload inseguro de chaves privadas locais.
          </p>
        </div>

        {/* Botão Desabilitado até existir provider REAL */}
        <div className="pt-2 flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={true}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-200 text-slate-400 font-bold text-xs rounded-xl shadow-none cursor-not-allowed"
            title="Aguardando ativação do provedor PSC na infraestrutura do sistema"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Conectar certificado (Em breve)</span>
          </button>
          <span className="text-[10.5px] text-slate-400">
            A emissão de documentos atual é realizada através da opção <strong>Imprimir para assinatura manual</strong>.
          </span>
        </div>
      </div>

      {/* Aviso Regulatório */}
      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <strong className="text-slate-700 block">Validade Jurídica & Transparência Ética</strong>
          <span>
            O Sistema Zemda não emite certificados simulados nem apresenta o hash de integridade interno do prontuário como se fosse uma assinatura qualificada ICP-Brasil.
          </span>
        </div>
      </div>
    </div>
  );
};
