import React from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import { ClinicalAutosaveIndicator } from './ClinicalAutosaveIndicator';
import { AutosaveStatus } from '../../hooks/useClinicalAutosave';

interface ClinicalQuickHeaderActionsProps {
  onViewPreviousRecords?: () => void;
  onFinishConsultation?: () => void;
  autosaveStatus?: AutosaveStatus;
  lastSavedTime?: string | null;
  finishLabel?: string;
  showFinish?: boolean;
  showPreviousRecords?: boolean;
  isSubmitting?: boolean;
  className?: string;
}

export const ClinicalQuickHeaderActions: React.FC<ClinicalQuickHeaderActionsProps> = ({
  onViewPreviousRecords,
  onFinishConsultation,
  autosaveStatus,
  lastSavedTime,
  finishLabel = 'Finalizar Atendimento',
  showFinish = true,
  showPreviousRecords = true,
  isSubmitting = false,
  className = ''
}) => {
  return (
    <div className={`flex items-center gap-2.5 flex-wrap ${className}`}>
      {/* Indicador Discreto de Autosave Universal */}
      {autosaveStatus && (
        <ClinicalAutosaveIndicator status={autosaveStatus} lastSavedTime={lastSavedTime} />
      )}

      {/* Acesso 1: Prontuários Anteriores (Histórico Longitudinal) */}
      {showPreviousRecords && onViewPreviousRecords && (
        <button
          type="button"
          onClick={onViewPreviousRecords}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-xs transition-all cursor-pointer whitespace-nowrap"
          title="Visualizar histórico completo de prontuários e atendimentos anteriores"
        >
          <FileText className="w-3.5 h-3.5 text-sky-600" />
          <span>Prontuários Anteriores</span>
        </button>
      )}

      {/* Acesso 2: Finalizar Atendimento Rápido */}
      {showFinish && onFinishConsultation && (
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onFinishConsultation}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-500/20 transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
          title="Finalizar atendimento, gravar evolução oficial e arquivar prontuário"
        >
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{isSubmitting ? 'Finalizando...' : finishLabel}</span>
        </button>
      )}
    </div>
  );
};
