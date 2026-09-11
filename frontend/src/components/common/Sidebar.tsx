import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  UserCog,
  Scissors,
  DollarSign,
  Layers,
  BarChart3,
  ShieldCheck,
  Settings,
  Globe,
  Receipt,
  UserPlus,
  X
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  isOpen,
  onClose
}) => {
  const { isSuperAdmin, isClinicAdmin, isProfessional, clientTermLabel } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    { id: 'calendar', label: 'Agenda Interativa', icon: Calendar, visible: true },
    { id: 'patients', label: `${clientTermLabel}s`, icon: Users, visible: true },
    {
      id: 'clinical',
      label: 'Prontuário & Evolução',
      icon: FileText,
      visible: isClinicAdmin || isProfessional
    },
    { id: 'professionals', label: 'Profissionais & Horários', icon: UserCog, visible: isClinicAdmin },
    { id: 'services', label: 'Serviços & Salas', icon: Scissors, visible: isClinicAdmin },
    { id: 'financial', label: 'Financeiro', icon: DollarSign, visible: isClinicAdmin },
    { id: 'receipts', label: 'Recibos Oficiais', icon: Receipt, visible: isClinicAdmin },
    { id: 'staff', label: 'Equipe & Acessos', icon: UserPlus, visible: isClinicAdmin },
    { id: 'taxonomy', label: 'Profissões & Categorias', icon: Layers, visible: isClinicAdmin },
    { id: 'reports', label: 'Relatórios & Exportação', icon: BarChart3, visible: isClinicAdmin },
    { id: 'audit', label: 'Auditoria LGPD', icon: ShieldCheck, visible: isClinicAdmin },
    { id: 'settings', label: isClinicAdmin ? 'Configurações' : 'Minha Conta', icon: Settings, visible: true },
    { id: 'superadmin', label: 'Painel Global', icon: Globe, visible: isSuperAdmin },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-xs"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <img
              src="/brand/zemda-icon.png"
              alt="Zemda"
              className="w-7 h-7 object-contain rounded-lg shadow-xs"
            />
            <span className="font-bold text-white text-base tracking-tight">Zemda</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems
            .filter(item => item.visible)
            .map(item => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
        </div>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
          Zemda • LGPD Compliant
        </div>
      </aside>
    </>
  );
};
