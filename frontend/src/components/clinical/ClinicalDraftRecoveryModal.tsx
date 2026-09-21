import React from 'react';
import { AlertCircle, History, CloudCheck, HardDrive, ArrowRight, X } from 'lucide-react';

interface ClinicalDraftRecoveryModalProps {
  isOpen: boolean;
  moduleName?: string;
  onSelectVersion: (choice: 'server' | 'local') => void;
  onClose: () => void;
}

export const ClinicalDraftRecoveryModal: React.FC<ClinicalDraftRecoveryModalProps> = ({
  isOpen,
  moduleName = 'este atendimento',
  onSelectVersion,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5 text-amber-600">
            <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Rascunho Encontrado com Diferença de Versão</h3>
              <p className="text-xs text-slate-500">Identificamos duas cópias salvas para {moduleName}.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Para garantir total segurança e evitar sobreposição indevida de anotações clínicas, escolha qual versão deseja carregar para prosseguir:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Opção Servidor (Mais Recente na Nuvem) */}
          <button
            type="button"
            onClick={() => onSelectVersion('server')}
            className="text-left p-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50 transition-all cursor-pointer group space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                <CloudCheck className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 uppercase">
                Recomendado
              </span>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Versão da Nuvem / Servidor</div>
              <p className="text-[11px] text-slate-500 mt-0.5">Sincronizada no banco de dados central da clínica.</p>
            </div>
            <div className="text-xs font-bold text-emerald-700 pt-1 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
              <span>Recuperar versão mais recente</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </button>

          {/* Opção Memória Local (Fallback Deste Navegador) */}
          <button
            type="button"
            onClick={() => onSelectVersion('local')}
            className="text-left p-4 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 transition-all cursor-pointer group space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-slate-200 text-slate-700">
                <HardDrive className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-slate-500">Local</span>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Versão Deste Navegador</div>
              <p className="text-[11px] text-slate-500 mt-0.5">Salva localmente neste computador durante a última digitação.</p>
            </div>
            <div className="text-xs font-bold text-slate-700 pt-1 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
              <span>Manter versão atual local</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
