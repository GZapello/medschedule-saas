import { ClinicalFinishButton } from './ClinicalFinishButton';
import React from 'react';
import { FileText } from 'lucide-react';
import { ClinicalAutosaveIndicator } from './ClinicalAutosaveIndicator';
import { AutosaveStatus } from '../../hooks/useClinicalAutosave';
import { ClinicalQuickToolsMenu, ClinicalQuickToolItem } from './ClinicalQuickToolsMenu';

export type { ClinicalQuickToolItem };

interface ClinicalQuickHeaderActionsProps {
  onViewPreviousRecords?: () => void;
  onLoadSavedClinicalData?: () => void;
  onFinishConsultation?: () => void;
  autosaveStatus?: AutosaveStatus;
  lastSavedTime?: string | null;
  finishLabel?: string;
  showFinish?: boolean;
  showPreviousRecords?: boolean;
  isSubmitting?: boolean;
  className?: string;
  tools?: ClinicalQuickToolItem[];
  toolsLabel?: string;
  toolsVariant?: 'sky' | 'teal' | 'indigo' | 'emerald' | 'cyan' | 'purple' | 'slate';
}

export const ClinicalQuickHeaderActions: React.FC<ClinicalQuickHeaderActionsProps> = ({
  onViewPreviousRecords,
  onLoadSavedClinicalData,
  onFinishConsultation,
  autosaveStatus,
  lastSavedTime,
  finishLabel = 'Finalizar atendimento',
  showFinish = true,
  showPreviousRecords = true,
  isSubmitting = false,
  className = '',
  tools,
  toolsLabel = 'Ferramentas',
  toolsVariant = 'slate'
}) => {
  return (
    <div className={`flex items-center gap-2.5 flex-wrap ${className}`}>
      {/* Indicador Discreto de Autosave Universal */}
      {autosaveStatus && (
        <div data-tour="clinical-autosave" className="inline-flex">
          <ClinicalAutosaveIndicator status={autosaveStatus} lastSavedTime={lastSavedTime} />
        </div>
      )}

      {/* Acesso 1: Prontuários Anteriores (Histórico Longitudinal) */}
      {showPreviousRecords && onViewPreviousRecords && (
        <button
          type="button"
          data-tour="clinical-previous-records"
          onClick={onViewPreviousRecords}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-xs transition-all cursor-pointer whitespace-nowrap"
          title="Visualizar histórico completo de prontuários e atendimentos anteriores"
        >
          <FileText className="w-3.5 h-3.5 text-sky-600" />
          <span>Prontuários Anteriores</span>
        </button>
      )}

      {/* Acesso: Ferramentas Rápidas (Menu Dropdown Centralizado) */}
      {onLoadSavedClinicalData && <button type="button" disabled={isSubmitting}
        onClick={onLoadSavedClinicalData}
        title="Carregar os últimos registros clínicos nos campos atuais para revisão e edição"
        className="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200">
        Carregar últimos dados salvos
      </button>}
      {tools && tools.length > 0 && (
        <div data-tour="clinical-tools" className="inline-flex">
          <ClinicalQuickToolsMenu
            tools={tools}
            label={toolsLabel}
            variant={toolsVariant}
          />
        </div>
      )}

      {/* Acesso 2: Finalizar Atendimento Rápido */}
      {showFinish && onFinishConsultation && (
        <ClinicalFinishButton onClick={onFinishConsultation} disabled={isSubmitting} label={isSubmitting ? 'Finalizando...' : finishLabel} />
      )}
    </div>
  );
};
