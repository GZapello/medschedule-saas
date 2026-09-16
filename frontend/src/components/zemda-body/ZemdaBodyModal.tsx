import React from 'react';
import { ZemdaBodyWorkspace } from './ZemdaBodyWorkspace';
import { X, Activity, User, ShieldCheck } from 'lucide-react';

interface ZemdaBodyModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
  appointmentId?: string;
  professionalId?: string;
  professionalName?: string;
  module?: string;
  initialBodyModel?: 'female' | 'male';
  readOnly?: boolean;
}

export const ZemdaBodyModal: React.FC<ZemdaBodyModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  appointmentId,
  professionalId,
  professionalName,
  module = 'general',
  initialBodyModel = 'female',
  readOnly = false
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-50 rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header do Modal */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  ZemdaBody • Mapa Corporal Clínico
                </h3>
                {readOnly ? (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-slate-500" /> Modo Histórico (Somente Leitura)
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Atendimento em Andamento
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {patientName ? `Paciente: ${patientName}` : ''}
                {professionalName ? ` • Profissional: ${professionalName}` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-2xl transition-colors cursor-pointer"
            aria-label="Fechar modal do ZemdaBody"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo do Workspace */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <ZemdaBodyWorkspace
            patientId={patientId}
            appointmentId={appointmentId}
            professionalId={professionalId}
            module={module}
            initialBodyModel={initialBodyModel}
            readOnly={readOnly}
            onClose={onClose}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>ZemdaBody • Registro Corporal Integrado</span>
          <button
            onClick={onClose}
            className="px-4 py-2 font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
