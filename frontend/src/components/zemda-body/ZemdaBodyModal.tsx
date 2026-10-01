import React, { useRef } from 'react';
import { ZemdaBodyWorkspace } from './ZemdaBodyWorkspace';
import { X, Activity, User, ShieldCheck } from 'lucide-react';

interface ZemdaBodyModalProps {
  onAssessmentSaved?: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
  assessmentId?: string;
  appointmentId?: string;
  professionalId?: string;
  professionalName?: string;
  module?: string;
  initialBodyModel?: 'female' | 'male';
  initialMapType?: 'BODY' | 'FACE';
  initialRegion?: string;
  readOnly?: boolean;
}

export const ZemdaBodyModal: React.FC<ZemdaBodyModalProps> = ({
  onAssessmentSaved,
  isOpen,
  onClose,
  patientId,
  patientName,
  assessmentId,
  appointmentId,
  professionalId,
  professionalName,
  module = 'general',
  initialBodyModel = 'female',
  initialMapType = 'BODY',
  initialRegion,
  readOnly = false
}) => {
  const saveRef=useRef<() => Promise<boolean>>(()=>Promise.resolve(true));
  const close=async()=>{if(await saveRef.current())onClose();};
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-50 rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header do Modal */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-500/20 shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight truncate">
                  Zemda360 • Mapeamento Visual & Anatômico
                </h3>
                {readOnly ? (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 shrink-0">
                    <ShieldCheck className="w-3 h-3 text-slate-500" /> Modo Histórico (Somente Leitura)
                  </span>
                ) : (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                    Atendimento em Andamento
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate">
                {patientName ? `Paciente: ${patientName}` : ''}
                {professionalName ? ` • Profissional: ${professionalName}` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={close}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-2xl transition-colors cursor-pointer shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label="Fechar modal do Zemda360"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo do Workspace */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <ZemdaBodyWorkspace onAssessmentSaved={onAssessmentSaved}
            key={`${patientId}:${assessmentId || appointmentId || 'new'}`}
            registerSave={save=>{saveRef.current=save;}}
            patientId={patientId}
            initialAssessmentId={assessmentId}
            appointmentId={appointmentId}
            professionalId={professionalId}
            module={module}
            initialBodyModel={initialBodyModel}
            initialMapType={initialMapType}
            initialRegion={initialRegion}
            readOnly={readOnly}
            onClose={onClose}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Zemda360 • Registro Anatômico Integrado</span>
          <button
            onClick={close}
            className="px-4 py-2 font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
