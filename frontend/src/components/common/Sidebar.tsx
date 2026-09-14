import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  Activity,
  ClipboardList,
  UserCog,
  CalendarClock,
  Scissors,
  DollarSign,
  Layers,
  BarChart3,
  ShieldCheck,
  Settings,
  Globe,
  Receipt,
  UserPlus,
  UploadCloud,
  X,
  Bot,
  Package,
  FileSpreadsheet,
  Wallet,
  LifeBuoy,
  ChevronDown,
  ChevronRight,
  Smile
} from 'lucide-react';
import { openZemdaAI } from '../../utils/aiHelper';

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
  const { isSuperAdmin, isClinicAdmin, isProfessional, isPhysiotherapist, isDentist, clientTermLabel } = useAuth();

  const categories: NavCategory[] = [
    {
      id: 'attendance',
      label: 'Atendimento & Agenda',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
        { id: 'calendar', label: 'Agenda Interativa', icon: Calendar, visible: true },
        { id: 'patients', label: `${clientTermLabel}s`, icon: Users, visible: true },
        {
          id: 'clinical',
          label: 'Prontuário & Evolução',
          icon: FileText,
          visible: isClinicAdmin || isProfessional
        },
        {
          id: 'zemda-fisio',
          label: 'ZemdaFisio (Fisioterapia)',
          icon: Activity,
          visible: isPhysiotherapist
        },
        {
          id: 'zemda-odonto',
          label: 'ZemdaOdonto (Odontologia)',
          icon: Smile,
          visible: isDentist
        },
        { id: 'pending-exams', label: 'Exames a Receber', icon: ClipboardList, visible: true },
      ]
    },
    {
      id: 'team',
      label: 'Cadastros & Equipe',
      items: [
        { id: 'professionals', label: 'Profissionais & Horários', icon: UserCog, visible: isClinicAdmin },
        { id: 'work-schedules', label: 'Escala de Trabalho', icon: CalendarClock, visible: isClinicAdmin || isProfessional },
        { id: 'services', label: 'Serviços & Salas', icon: Scissors, visible: isClinicAdmin },
        { id: 'staff', label: 'Equipe & Acessos', icon: UserPlus, visible: isClinicAdmin },
        { id: 'taxonomy', label: 'Profissões & Categorias', icon: Layers, visible: isClinicAdmin },
      ]
    },
    {
      id: 'operations',
      label: 'Operação & Estoque',
      items: [
        { id: 'inventory', label: 'Estoque de Insumos', icon: Package, visible: isClinicAdmin },
        { id: 'budgets', label: 'Orçamentos', icon: FileSpreadsheet, visible: isClinicAdmin || isProfessional },
      ]
    },
    {
      id: 'financial',
      label: 'Financeiro & Gestão',
      items: [
        { id: 'financial', label: 'Financeiro', icon: DollarSign, visible: isClinicAdmin },
        { id: 'payroll', label: 'Pagamentos & Comissões', icon: Wallet, visible: isClinicAdmin },
        { id: 'receipts', label: 'Recibos Oficiais', icon: Receipt, visible: isClinicAdmin },
        { id: 'reports', label: 'Relatórios & Exportação', icon: BarChart3, visible: isClinicAdmin },
      ]
    },
    {
      id: 'system',
      label: 'Suporte & Sistema',
      items: [
        { id: 'ai-assistant', label: 'Assistente Zemda', icon: Bot, visible: true },
        { id: 'support-tickets', label: 'Central de Chamados', icon: LifeBuoy, visible: isSuperAdmin },
        { id: 'import', label: 'Importar Dados', icon: UploadCloud, visible: isClinicAdmin },
        { id: 'audit', label: 'Auditoria LGPD', icon: ShieldCheck, visible: isSuperAdmin },
        { id: 'settings', label: isClinicAdmin ? 'Configurações' : 'Minha Conta', icon: Settings, visible: true },
        { id: 'superadmin', label: 'Painel Global', icon: Globe, visible: isSuperAdmin },
      ]
    }
  ];

  // Identifica qual categoria contém a view ativa inicialmente
  const getInitialOpenCategories = () => {
    const initial: Record<string, boolean> = {
      attendance: true,
      team: false,
      operations: false,
      financial: false,
      system: false
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
    for (const cat of categories) {
      if (cat.items.some(item => item.id === currentView)) {
        setOpenCategories(prev => ({ ...prev, [cat.id]: true }));
      }
    }
  }, [currentView]);

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
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto border-r border-slate-800 ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <img
              src="/brand/zemda-icon.png"
              alt="Zemda"
              className="w-7 h-7 object-contain rounded-lg shadow-xs"
            />
            <div className="flex flex-col">
              <span className="font-bold text-white text-base tracking-tight leading-tight">Zemda</span>
              <span className="text-[10px] text-teal-400 font-medium">Saúde & Gestão</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Accordion Categories Container */}
        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
          {categories.map(category => {
            const visibleItems = category.items.filter(item => item.visible);
            if (visibleItems.length === 0) return null;

            const isExpanded = !!openCategories[category.id];
            const hasActiveChild = visibleItems.some(item => item.id === currentView);

            return (
              <div key={category.id} className="rounded-xl overflow-hidden">
                {/* Category Header Accordion Button */}
                <button
                  onClick={() => toggleCategory(category.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold tracking-wider uppercase transition-colors rounded-lg ${
                    hasActiveChild
                      ? 'text-teal-400 bg-slate-800/60'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <span className="truncate">{category.label}</span>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </button>

                {/* Subitems List */}
                {isExpanded && (
                  <div className="mt-1 pl-1 space-y-1 transition-all duration-200">
                    {visibleItems.map(item => {
                      const Icon = item.icon;
                      const isActive = currentView === item.id;

                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (item.id === 'ai-assistant') {
                              openZemdaAI();
                              onClose();
                            } else {
                              onNavigate(item.id);
                              onClose();
                            }
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-teal-600 text-white shadow-xs font-semibold'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
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

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span>v1.1.2 • LGPD</span>
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Online
          </span>
        </div>
      </aside>
    </>
  );
};
