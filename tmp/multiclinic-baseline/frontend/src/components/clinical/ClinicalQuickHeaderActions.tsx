import { ClinicalFinishButton } from './ClinicalFinishButton';
import React from 'react';
import { FileText, BarChart3 } from 'lucide-react';
import { ClinicalAutosaveIndicator } from './ClinicalAutosaveIndicator';
import { AutosaveStatus } from '../../hooks/useClinicalAutosave';
import { ClinicalQuickToolsMenu, ClinicalQuickToolItem } from './ClinicalQuickToolsMenu';

export type { ClinicalQuickToolItem };

interface ClinicalQuickHeaderActionsProps {
  onViewPreviousRecords?: () => void;
  previousRecordsLabel?: string;
  onLoadSavedClinicalData?: () => void;
  onViewReports?: () => void;
  reportsLabel?: string;
  reportsIcon?: React.ComponentType<{ className?: string }>;
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
  toolsVariant?: 'sky' | 'teal' | 'indigo' | 'emerald' | 'cyan' | 'purple' | 'slate' | 'rose' | 'amber';
}

export const ClinicalQuickHeaderActions: React.FC<ClinicalQuickHeaderActionsProps> = ({
  onViewPreviousRecords,
  previousRecordsLabel = 'Prontuários Anteriores',
  onLoadSavedClinicalData,
  onViewReports,
  reportsLabel = 'Relatórios',
  reportsIcon: ReportsIcon = BarChart3,
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
      {/* 1. Indicador Discreto de Autosave Universal */}
      {autosaveStatus && (
        <div data-tour="clinical-autosave" className="inline-flex">
          <ClinicalAutosaveIndicator status={autosaveStatus} lastSavedTime={lastSavedTime} />
        </div>
      )}

      {/* 2. Prontuários Anteriores (Histórico Longitudinal) */}
      {showPreviousRecords && onViewPreviousRecords && (
        <button
          type="button"
          data-tour="clinical-previous-records"
          onClick={onViewPreviousRecords}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-xs transition-all cursor-pointer whitespace-nowrap"
          title="Visualizar histórico completo de prontuários e atendimentos anteriores"
        >
          <FileText className="w-3.5 h-3.5 text-sky-600" />
          <span>{previousRecordsLabel}</span>
        </button>
      )}

      {/* 3. Carregar últimos dados salvos */}
      {onLoadSavedClinicalData && (
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onLoadSavedClinicalData}
          title="Carregar os últimos registros clínicos nos campos atuais para revisão e edição"
          className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-xs transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          Carregar últimos dados salvos
        </button>
      )}

      {/* 4. Relatórios Clínicos do Módulo */}
      {onViewReports && (
        <button
          type="button"
          data-tour="clinical-reports"
          onClick={onViewReports}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-xs transition-all cursor-pointer whitespace-nowrap"
          title="Visualizar relatórios clínicos, gráficos e histórico longitudinal do paciente"
        >
          <ReportsIcon className="w-3.5 h-3.5 text-indigo-600" />
          <span>{reportsLabel}</span>
        </button>
      )}

      {/* 5. Ferramentas Rápidas (Menu Dropdown Centralizado) */}
      {tools && tools.length > 0 && (
        <div data-tour="clinical-tools" className="inline-flex">
          <ClinicalQuickToolsMenu
            tools={tools}
            label={toolsLabel}
            variant={toolsVariant}
          />
        </div>
      )}

      {/* 6. Finalizar Atendimento */}
      {showFinish && onFinishConsultation && (
        <ClinicalFinishButton
          onClick={onFinishConsultation}
          disabled={isSubmitting}
          label={isSubmitting ? 'Finalizando...' : finishLabel}
        />
      )}
    </div>
  );
};
