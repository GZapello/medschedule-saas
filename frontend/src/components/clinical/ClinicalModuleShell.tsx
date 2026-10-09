import React from 'react';
import { LucideIcon, User, RefreshCw, X } from 'lucide-react';
import { ProfessionalModuleHeader } from '../common/ProfessionalModuleHeader';
import { PatientSearchSelect } from '../common/PatientSearchSelect';
import { ClinicalQuickHeaderActions, ClinicalQuickToolItem } from './ClinicalQuickHeaderActions';
import { ClinicalModuleEmptyState } from './ClinicalModuleEmptyState';
import { AutosaveStatus } from '../../hooks/useClinicalAutosave';
import { HorizontalTabNav, useHorizontalTabScroll } from '../../hooks/useHorizontalTabScroll';

export interface ClinicalModuleTabItem {
  id: string;
  label: string;
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  count?: number;
  disabled?: boolean;
  dataTour?: string;
}

export interface ClinicalModuleShellPatientInfo {
  id: string;
  full_name?: string;
  name?: string;
  gender?: string;
  birth_date?: string;
  phone?: string;
  cpf?: string;
}

export interface ClinicalModuleShellProps {
  // 1. Identidade do Módulo
  title: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  iconGradient?: string;
  iconShadow?: string;
  badgeLabel: string;
  badgeVariant?: string;
  secondaryBadge?: React.ReactNode;
  description: string;

  // 2. Filtros e Ações Rápidas no Cabeçalho
  filterSlot?: React.ReactNode;
  headerActions?: React.ReactNode;

  // 3. Paciente
  selectedPatientId?: string | null;
  onSelectPatient: (patientId: string, patient?: any) => void;
  selectedPatient?: ClinicalModuleShellPatientInfo | null;
  isLockedContext?: boolean;
  patientSearchPlaceholder?: string;
  onClearPatient?: () => void;

  // 4. Barra de Ações Rápidas Clínicas
  autosaveStatus?: AutosaveStatus;
  lastSavedTime?: string | null;
  onViewPreviousRecords?: () => void;
  previousRecordsLabel?: string;
  onLoadSavedClinicalData?: () => void;
  onViewReports?: () => void;
  reportsLabel?: string;
  reportsIcon?: React.ComponentType<{ className?: string }>;
  tools?: ClinicalQuickToolItem[];
  toolsLabel?: string;
  toolsVariant?: 'sky' | 'teal' | 'indigo' | 'emerald' | 'cyan' | 'purple' | 'slate' | 'rose' | 'amber';
  onFinishConsultation?: () => void;
  showFinish?: boolean;
  finishLabel?: string;
  isSubmitting?: boolean;
  extraQuickActions?: React.ReactNode;

  // 5. Abas Horizontais
  tabs?: ClinicalModuleTabItem[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  tabActiveVariant?: string; // Classe tailwind p/ aba ativa (ex: 'bg-sky-600 text-white shadow-xs')

  // 6. Estado Vazio (Sem paciente)
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  emptyStateColorVariant?: 'teal' | 'cyan' | 'purple' | 'sky' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'slate';
  emptyStateAction?: React.ReactNode;

  // 7. Modais / Extras
  children?: React.ReactNode;
  modalsSlot?: React.ReactNode;
  className?: string;
  contentMaxWidth?: string; // default 'max-w-7xl mx-auto'
}

/**
 * Shell Canônico e Padronizado para Todos os Módulos Profissionais do Zemda.
 * Garante hierarquia visual unificada, navegação por abas com scroll suave,
 * barra de identificação de paciente, barra de ações clínicas e estados vazios padronizados.
 */
export const ClinicalModuleShell: React.FC<ClinicalModuleShellProps> = ({
  title,
  icon: ModuleIcon,
  iconGradient = 'from-sky-600 to-blue-700',
  iconShadow = 'shadow-sky-600/20',
  badgeLabel,
  badgeVariant = 'bg-sky-100 text-sky-800 border-sky-200',
  secondaryBadge,
  description,
  filterSlot,
  headerActions,
  selectedPatientId,
  onSelectPatient,
  selectedPatient,
  isLockedContext = false,
  patientSearchPlaceholder = 'Buscar paciente por nome, CPF ou prontuário...',
  onClearPatient,
  autosaveStatus,
  lastSavedTime,
  onViewPreviousRecords,
  previousRecordsLabel = 'Prontuários Anteriores',
  onLoadSavedClinicalData,
  onViewReports,
  reportsLabel = 'Relatórios',
  reportsIcon,
  tools,
  toolsLabel = 'Ferramentas',
  toolsVariant = 'slate',
  onFinishConsultation,
  showFinish = true,
  finishLabel = 'Finalizar Atendimento',
  isSubmitting = false,
  extraQuickActions,
  tabs = [],
  activeTab,
  onTabChange,
  tabActiveVariant = 'bg-slate-900 text-white shadow-xs',
  emptyStateTitle,
  emptyStateDescription = 'Escolha um paciente no menu superior para iniciar o atendimento.',
  emptyStateColorVariant = 'sky',
  emptyStateAction,
  children,
  modalsSlot,
  className = '',
  contentMaxWidth = 'max-w-7xl mx-auto'
}) => {
  const tabScroll = useHorizontalTabScroll(activeTab);
  const { tabScrollProps } = tabScroll;

  const patientDisplayName = selectedPatient?.full_name || selectedPatient?.name;

  return (
    <div className={`flex flex-col min-h-screen bg-slate-50 text-slate-800 ${className}`}>
      {/* Modais Globais / Slots */}
      {modalsSlot}

      {/* 1. CABEÇALHO PROFISSIONAL PADRÃO */}
      <ProfessionalModuleHeader
        icon={ModuleIcon}
        iconGradient={iconGradient}
        iconShadow={iconShadow}
        title={title}
        badgeLabel={badgeLabel}
        badgeVariant={badgeVariant}
        secondaryBadge={secondaryBadge}
        description={description}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {filterSlot}
          {headerActions}
        </div>
      </ProfessionalModuleHeader>

      {/* 2. BARRA DE PACIENTE & AÇÕES RÁPIDAS */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 shrink-0 shadow-2xs">
        <div className={`${contentMaxWidth} flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3`}>
          {/* Seletor / Identificação do Paciente */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {!selectedPatientId ? (
              <div className="w-full max-w-md">
                <PatientSearchSelect
                  value={selectedPatientId || ''}
                  onChange={onSelectPatient}
                  placeholder={patientSearchPlaceholder}
                  compact
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/90 rounded-xl px-3 py-1.5 shadow-2xs">
                  <div className="w-7 h-7 rounded-lg bg-slate-200/80 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {patientDisplayName || 'Paciente Selecionado'}
                      </span>
                      {selectedPatient?.gender && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-200/60 text-slate-600 uppercase">
                          {selectedPatient.gender}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      {selectedPatient?.birth_date && (
                        <span>
                          Nasc: {new Date(selectedPatient.birth_date).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      {selectedPatient?.phone && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{selectedPatient.phone}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {!isLockedContext && onClearPatient && (
                    <button
                      type="button"
                      onClick={onClearPatient}
                      className="ml-1 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      title="Trocar paciente"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {!isLockedContext && !onClearPatient && (
                  <div className="w-64">
                    <PatientSearchSelect
                      value={selectedPatientId}
                      onChange={onSelectPatient}
                      placeholder="Trocar paciente..."
                      compact
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Barra de Ações Clínicas Rápidas (quando há paciente) */}
          {selectedPatientId && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {extraQuickActions}
              <ClinicalQuickHeaderActions
                autosaveStatus={autosaveStatus}
                lastSavedTime={lastSavedTime}
                onViewPreviousRecords={onViewPreviousRecords}
                previousRecordsLabel={previousRecordsLabel}
                onLoadSavedClinicalData={onLoadSavedClinicalData}
                onViewReports={onViewReports}
                reportsLabel={reportsLabel}
                reportsIcon={reportsIcon}
                tools={tools}
                toolsLabel={toolsLabel}
                toolsVariant={toolsVariant}
                onFinishConsultation={onFinishConsultation}
                showFinish={showFinish}
                finishLabel={finishLabel}
                isSubmitting={isSubmitting}
              />
            </div>
          )}
        </div>
      </div>

      {/* 3. MENU HORIZONTAL DE ABAS CLÍNICAS (quando há paciente e abas) */}
      {selectedPatientId && tabs.length > 0 && onTabChange && (
        <div className="bg-white border-b border-slate-200 shrink-0">
          <HorizontalTabNav scroll={tabScroll}>
            <div
              {...tabScrollProps}
              className={`${tabScrollProps.className} ${contentMaxWidth} px-4 sm:px-6 flex items-center gap-1.5 py-2`}
            >
              {tabs.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    disabled={tab.disabled}
                    data-active={isActive ? 'true' : 'false'}
                    data-tour={tab.dataTour || `tab-${tab.id}`}
                    onClick={() => onTabChange(tab.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      isActive
                        ? tabActiveVariant
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {TabIcon && <TabIcon className="w-4 h-4 shrink-0" />}
                    <span>{tab.label}</span>
                    {typeof tab.count === 'number' && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </HorizontalTabNav>
        </div>
      )}

      {/* 4. CONTEÚDO PRINCIPAL DO WORKSPACE */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
        <div className={contentMaxWidth}>
          {!selectedPatientId ? (
            <ClinicalModuleEmptyState
              icon={ModuleIcon}
              title={emptyStateTitle || `Selecione um Paciente para Iniciar o ${title}`}
              description={emptyStateDescription}
              colorVariant={emptyStateColorVariant}
              action={emptyStateAction}
            />
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
};
