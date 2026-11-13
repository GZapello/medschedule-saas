import React, { useState, useEffect, useMemo } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  LayoutDashboard,
  Calendar,
  CalendarCheck,
  Users,
  FileText,
  Activity,
  ClipboardList,
  DollarSign,
  BarChart3,
  ShieldCheck,
  Globe,
  Package,
  FileSpreadsheet,
  LifeBuoy,
  ChevronDown,
  ChevronRight,
  Smile,
  Apple,
  Hand,
  Mic,
  Brain,
  Dumbbell,
  GraduationCap,
  Stethoscope,
  Sparkles,
  SlidersHorizontal,
  RotateCcw,
  Eye,
  EyeOff,
  X
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  visible: boolean;
}

interface NavCategory {
  id: string;
  label: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  isOpen,
  onClose
}) => {
  const {
    currentUser,
    currentTenant,
    isSuperAdmin,
    isClinicAdmin,
    isProfessional,
    isReceptionist,
    isPhysiotherapist,
    isZemdaFisio,
    isDentist,
    isZemdaOdonto,
    isNutritionist,
    isZemdaNutri,
    isOccupationalTherapist,
    isZemdaTO,
    isSpeechTherapist,
    isZemdaFono,
    isPsychologist,
    isZemdaPsico,
    isPsychopedagogue,
    isZemdaPP,
    isPersonalTrainer,
    isZemdaPersonal,
    isDoctor,
    isZemdaMed,
    isEsthetician,
    isZemdaEstetic,
    hasCapability,
    hasPermission,
    isZemdaBody,
    commercialModule,
    clinicalWorkspace,
    clientTermLabel
  } = useAuth();

  const isEligibleClinical = isClinicAdmin || isProfessional;

  const hasSpecializedProfessionalModule = isEligibleClinical && Boolean(
    (isDoctor || isZemdaMed || commercialModule === 'ZemdaMed') ||
    (isPhysiotherapist || isZemdaFisio || commercialModule === 'ZemdaFisio') ||
    (isDentist || isZemdaOdonto || commercialModule === 'ZemdaOdonto') ||
    (isEsthetician || isZemdaEstetic || commercialModule === 'ZemdaEstetic') ||
    (isNutritionist || isZemdaNutri || commercialModule === 'ZemdaNutri') ||
    (isOccupationalTherapist || isZemdaTO || commercialModule === 'ZemdaTO') ||
    (isSpeechTherapist || isZemdaFono || commercialModule === 'ZemdaFono') ||
    (isPsychologist || isZemdaPsico || commercialModule === 'ZemdaPsico') ||
    (isPsychopedagogue || isZemdaPP || commercialModule === 'ZemdaPP') ||
    (isPersonalTrainer || isZemdaPersonal || commercialModule === 'ZemdaPersonal')
  );

  const hasZemda360Access = Boolean(isClinicAdmin || isZemdaBody);
  // Remove o Zemda360 da sidebar quando a conta possui módulo profissional especializado e Zemda360 habilitado
  const showZemda360InSidebar = hasZemda360Access && !hasSpecializedProfessionalModule;

  const categories: NavCategory[] = [
    {
      id: 'attendance',
      label: 'Atendimento & Agenda',
      items: [
        { id: 'dashboard', label: 'Painel', icon: LayoutDashboard, visible: true },
        {
          id: 'calendar',
          label: 'Agenda Interativa',
          icon: Calendar,
          visible: isClinicAdmin || isProfessional || isReceptionist || hasPermission('view_schedule')
        },
        {
          id: 'patients',
          label: `${clientTermLabel}s`,
          icon: Users,
          visible: isClinicAdmin || isProfessional || isReceptionist || hasPermission('create_patient') || hasPermission('edit_patient')
        },
        {
          id: 'clinical',
          label: (commercialModule === null && (clinicalWorkspace === 'general' || isProfessional))
            ? 'Atendimento Clínico'
            : 'Prontuário & Evolução',
          icon: FileText,
          visible: isEligibleClinical
        },
        {
          id: 'zemda-med',
          label: 'ZemdaMed (Medicina)',
          icon: Stethoscope,
          visible: isEligibleClinical && (isDoctor || isZemdaMed || commercialModule === 'ZemdaMed')
        },
        {
          id: 'zemda-body',
          label: 'Zemda360 (Mapeamento)',
          icon: Activity,
          visible: showZemda360InSidebar
        },
        {
          id: 'zemda-fisio',
          label: 'ZemdaFisio (Fisioterapia)',
          icon: Activity,
          visible: isEligibleClinical && (isPhysiotherapist || isZemdaFisio || commercialModule === 'ZemdaFisio')
        },
        {
          id: 'zemda-odonto',
          label: 'ZemdaOdonto (Odontologia)',
          icon: Smile,
          visible: isEligibleClinical && (isDentist || isZemdaOdonto || commercialModule === 'ZemdaOdonto')
        },
        {
          id: 'zemda-estetic',
          label: 'ZemdaEstetic (Estética)',
          icon: Sparkles,
          visible: isEligibleClinical && (isEsthetician || isZemdaEstetic || commercialModule === 'ZemdaEstetic')
        },
        {
          id: 'zemda-nutri',
          label: 'ZemdaNutri (Nutrição)',
          icon: Apple,
          visible: isEligibleClinical && (isNutritionist || isZemdaNutri || commercialModule === 'ZemdaNutri')
        },
        {
          id: 'zemda-to',
          label: 'ZemdaTO (Terapia Ocupacional)',
          icon: Hand,
          visible: isEligibleClinical && (isOccupationalTherapist || isZemdaTO || commercialModule === 'ZemdaTO')
        },
        {
          id: 'zemda-fono',
          label: 'ZemdaFono (Fonoaudiologia)',
          icon: Mic,
          visible: isEligibleClinical && (isSpeechTherapist || isZemdaFono || commercialModule === 'ZemdaFono')
        },
        {
          id: 'zemda-psico',
          label: 'ZemdaPsico (Psicologia)',
          icon: Brain,
          visible: isEligibleClinical && (isPsychologist || isZemdaPsico || commercialModule === 'ZemdaPsico')
        },
        {
          id: 'zemda-pp',
          label: 'ZemdaPP (Psicopedagogia)',
          icon: GraduationCap,
          visible: isEligibleClinical && (isPsychopedagogue || isZemdaPP || commercialModule === 'ZemdaPP')
        },
        {
          id: 'zemda-personal',
          label: 'ZemdaPersonal (Treinamento)',
          icon: Dumbbell,
          visible: isEligibleClinical && (isPersonalTrainer || isZemdaPersonal || commercialModule === 'ZemdaPersonal')
        },
        {
          id: 'pending-exams',
          label: 'Exames a Receber',
          icon: ClipboardList,
          visible: isClinicAdmin || hasCapability('CORE_EXAMS_RECEIVED') || hasCapability('CORE_EXAM_REQUEST') || hasPermission('view_exams')
        },
      ]
    },
    {
      id: 'management',
      label: 'Gestão',
      items: [
        {
          id: 'financial',
          label: 'Financeiro',
          icon: DollarSign,
          visible: isClinicAdmin || hasPermission('view_financial')
        },
        {
          id: 'inventory',
          label: 'Estoque de Insumos',
          icon: Package,
          visible: isClinicAdmin || isReceptionist || hasPermission('manage_inventory') || hasPermission('view_inventory')
        },
        {
          id: 'budgets',
          label: 'Orçamentos',
          icon: FileSpreadsheet,
          visible: isClinicAdmin || isProfessional || hasPermission('view_budgets') || hasPermission('manage_budgets')
        },
        {
          id: 'reports',
          label: 'Relatórios',
          icon: BarChart3,
          visible: isClinicAdmin || isProfessional || isReceptionist || hasPermission('view_reports')
        },
      ]
    }
  ];

  // Menu Simplificado do SuperAdmin
  const superAdminCategories: NavCategory[] = [
    {
      id: 'superadmin_main',
      label: 'Administração Global',
      items: [
        { id: 'superadmin', label: 'Painel Global', icon: Globe, visible: true },
        { id: 'superadmin-visits', label: 'Registro de Visitas', icon: CalendarCheck, visible: true },
        { id: 'support-tickets', label: 'Chamados', icon: LifeBuoy, visible: true },
        { id: 'audit', label: 'Auditoria LGPD', icon: ShieldCheck, visible: true }
      ]
    }
  ];

  const { showToast } = useToast();
  const [hiddenItemIds, setHiddenItemIds] = useState<string[]>([]);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState<boolean>(false);
  const [savingCustomize, setSavingCustomize] = useState<boolean>(false);

  const effectiveCategories = isSuperAdmin ? superAdminCategories : categories;

  useEffect(() => {
    setHiddenItemIds([]);
    setIsCustomizeOpen(false);
    if (!currentUser?.id || isSuperAdmin) return;
    let cancelled = false;
    ApiClient.get<{ hiddenItems?: string[] }>('/v1/auth/sidebar-preferences')
      .then(res => {
        if (!cancelled && Array.isArray(res?.hiddenItems)) {
          setHiddenItemIds(res.hiddenItems);
        }
      })
      .catch(() => {
        // Silencioso: mantém menu padrão caso falhe
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentTenant?.id, isSuperAdmin]);

  const authorizedItems = useMemo(
    () =>
      effectiveCategories.flatMap(cat =>
        cat.items.filter(
          item => item.visible && !['sidebar-customize', 'settings', 'help', 'logout'].includes(item.id)
        )
      ),
    [effectiveCategories]
  );

  const handleToggleSidebarItem = async (itemId: string) => {
    if (['sidebar-customize', 'settings', 'help', 'logout'].includes(itemId)) return;
    const nextHidden = hiddenItemIds.includes(itemId)
      ? hiddenItemIds.filter(id => id !== itemId)
      : [...hiddenItemIds, itemId];
    const previous = hiddenItemIds;
    setHiddenItemIds(nextHidden);
    setSavingCustomize(true);
    try {
      const res = await ApiClient.put<{ hiddenItems?: string[] }>('/v1/auth/sidebar-preferences', {
        hiddenItems: nextHidden
      });
      if (Array.isArray(res?.hiddenItems)) {
        setHiddenItemIds(res.hiddenItems);
      }
    } catch (err: any) {
      setHiddenItemIds(previous);
      showToast(err?.message || 'Erro ao salvar preferência do menu', 'error');
    } finally {
      setSavingCustomize(false);
    }
  };

  const handleResetSidebarPreferences = async () => {
    const previous = hiddenItemIds;
    setHiddenItemIds([]);
    setSavingCustomize(true);
    try {
      await ApiClient.delete('/v1/auth/sidebar-preferences');
      showToast('Menu padrão restaurado para esta unidade!', 'success');
    } catch (err: any) {
      setHiddenItemIds(previous);
      showToast(err?.message || 'Erro ao restaurar menu padrão', 'error');
    } finally {
      setSavingCustomize(false);
    }
  };

  // Identifica qual categoria contém a view ativa inicialmente
  const getInitialOpenCategories = () => {
    if (isSuperAdmin) {
      return { superadmin_main: true };
    }
    const initial: Record<string, boolean> = {
      attendance: true,
      management: true
    };
    for (const cat of categories) {
      if (cat.items.some(item => item.id === currentView)) {
        initial[cat.id] = true;
      }
    }
    return initial;
  };

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(getInitialOpenCategories);

  // Mantém categoria ativa aberta caso a visualização mude
  useEffect(() => {
    for (const cat of effectiveCategories) {
      if (cat.items.some(item => item.id === currentView)) {
        setOpenCategories(prev => ({ ...prev, [cat.id]: true }));
      }
    }
  }, [currentView, isSuperAdmin]);

  useEffect(() => {
    const prepare = (event: Event) => {
      const route = (event as CustomEvent).detail?.route;
      const category = effectiveCategories.find(cat => cat.items.some(item => item.id === route && item.visible));
      if (category) setOpenCategories(prev => ({ ...prev, [category.id]: true }));
    };
    window.addEventListener('zemda-tour-prepare', prepare);
    return () => window.removeEventListener('zemda-tour-prepare', prepare);
  });

  const toggleCategory = (categoryId: string) => {
    setOpenCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden backdrop-blur-xs transition-opacity mobile-modal"
          onClick={onClose}
        />
      )}

      <aside
        data-tour-routes={effectiveCategories.flatMap(category => category.items.filter(item => item.visible && !hiddenItemIds.includes(item.id)).map(item => item.id)).join(" ")}
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 max-w-[85vw] bg-white text-slate-700 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto border-r border-slate-200/80 ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-100 bg-white">
          <div className="flex items-center">
            <img
              src="/brand/zemda-logo.png"
              alt="Zemda"
              className="h-8 w-auto object-contain"
            />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg lg:hidden cursor-pointer"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Accordion Categories Container */}
        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-2 scrollbar-thin scrollbar-thumb-slate-200">
          {effectiveCategories.map(category => {
            const visibleItems = category.items.filter(item => item.visible && !hiddenItemIds.includes(item.id));
            if (visibleItems.length === 0) return null;

            const isExpanded = !!openCategories[category.id];
            const hasActiveChild = visibleItems.some(item => item.id === currentView);

            return (
              <div key={category.id} className="rounded-xl overflow-hidden">
                {/* Category Header Accordion Button */}
                <button
                  data-tour-group={category.id}
                  aria-expanded={isExpanded}
                  onClick={() => toggleCategory(category.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold tracking-wider uppercase transition-colors rounded-xl cursor-pointer ${
                    hasActiveChild
                      ? 'text-teal-800 bg-teal-50/70'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{category.label}</span>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {/* Subitems List */}
                {isExpanded && (
                  <div className="mt-1 pl-1 space-y-0.5 transition-all duration-200">
                    {visibleItems.map(item => {
                      const Icon = item.icon;
                      const isActive = currentView === item.id;
                      const isUserModule = (
                        (item.id === 'zemda-med' && isZemdaMed) ||
                        (item.id === 'zemda-fono' && isZemdaFono) ||
                        (item.id === 'zemda-psico' && isZemdaPsico) ||
                        (item.id === 'zemda-odonto' && isZemdaOdonto) ||
                        (item.id === 'zemda-nutri' && isZemdaNutri) ||
                        (item.id === 'zemda-fisio' && isZemdaFisio) ||
                        (item.id === 'zemda-to' && isZemdaTO) ||
                        (item.id === 'zemda-personal' && isZemdaPersonal) ||
                        (item.id === 'zemda-pp' && isZemdaPP) ||
                        (item.id === 'zemda-estetic' && isZemdaEstetic) ||
                        (item.id === 'clinical' && (isProfessional || isClinicAdmin))
                      );

                      return (
                        <button
                          key={item.id}
                          data-tour={`nav-${item.id}`}
                          data-nav-id={item.id}
                          data-clinical-module={isUserModule ? "true" : undefined}
                          onClick={() => {
                            onNavigate(item.id);
                            onClose();
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-xs shadow-teal-700/20'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                          <span className="truncate text-left">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer info & Personalizar menu */}
        <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-100 text-[11px] text-slate-400 bg-slate-50/40 flex items-center justify-between gap-2">
          <span className="truncate">Ambiente Seguro • LGPD</span>
          {!isSuperAdmin && (
            <button
              type="button"
              onClick={() => setIsCustomizeOpen(prev => !prev)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-teal-700 hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0"
              title="Exibir ou ocultar botões do menu nesta unidade"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Personalizar menu</span>
            </button>
          )}
        </div>
      </aside>

      {/* Painel compacto para personalização do menu por usuário/estabelecimento */}
      {isCustomizeOpen && !isSuperAdmin && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center lg:items-end lg:justify-start p-3 lg:p-5"
          onClick={() => setIsCustomizeOpen(false)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 shadow-2xl overflow-hidden lg:ml-64"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-teal-600" />
                  Personalizar menu lateral
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[260px]">
                  {currentTenant?.trade_name || currentTenant?.name || 'Esta unidade'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomizeOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 max-h-[60vh] overflow-y-auto space-y-1.5">
              {authorizedItems.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Nenhum item personalizável disponível.</p>
              ) : (
                authorizedItems.map(item => {
                  const isHidden = hiddenItemIds.includes(item.id);
                  const ItemIcon = item.icon;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs ${
                        isHidden ? 'bg-slate-50 border-slate-200/80 text-slate-400' : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ItemIcon className={`w-3.5 h-3.5 shrink-0 ${isHidden ? 'text-slate-300' : 'text-teal-600'}`} />
                        <span className={`truncate font-semibold ${isHidden ? 'line-through' : ''}`}>{item.label}</span>
                      </div>
                      <button
                        type="button"
                        disabled={savingCustomize}
                        onClick={() => handleToggleSidebarItem(item.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer shrink-0 ${
                          isHidden
                            ? 'bg-slate-200/80 text-slate-600 hover:bg-slate-300/70'
                            : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200'
                        }`}
                      >
                        {isHidden ? <><EyeOff className="w-3 h-3" /> Oculto</> : <><Eye className="w-3 h-3" /> Exibir</>}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={savingCustomize || hiddenItemIds.length === 0}
                onClick={handleResetSidebarPreferences}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-teal-700 disabled:opacity-40 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurar menu padrão
              </button>
              <button
                type="button"
                onClick={() => setIsCustomizeOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
