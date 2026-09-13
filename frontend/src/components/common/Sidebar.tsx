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
  UploadCloud,
  X,
  Sparkles
} from 'lucide-react';
import { openZemdaAI } from '../../utils/aiHelper';

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
    { id: 'import', label: 'Importar Dados', icon: UploadCloud, visible: isClinicAdmin },
    { id: 'audit', label: 'Auditoria LGPD', icon: ShieldCheck, visible: isSuperAdmin },
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

        <div className="p-3 pb-1">
          <button
            onClick={() => {
              openZemdaAI();
              onClose();
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-teal-500/20 via-indigo-500/20 to-purple-500/20 text-teal-300 hover:text-white border border-teal-500/30 hover:border-teal-400 transition-all group cursor-pointer shadow-xs"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-teal-400 group-hover:scale-110 transition-transform animate-pulse" />
              <span>Assistente Zemda IA</span>
            </div>
            <span className="text-[10px] font-extrabold bg-teal-500/30 text-teal-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
              IA
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
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

        <div className="p-3 m-3 bg-slate-800/80 rounded-2xl border border-slate-700/60">
          <div className="flex items-center gap-2 text-teal-400 text-xs font-bold mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Precisa de Ajuda?</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Tire dúvidas, resuma prontuários e organize a clínica com a IA Zemda.
          </p>
          <button
            onClick={() => {
              openZemdaAI({ prompt: 'Olá Zemda! Como você pode me ajudar a gerenciar a clínica e os atendimentos hoje?' });
              onClose();
            }}
            className="mt-2.5 w-full py-1.5 px-2.5 bg-teal-600/30 hover:bg-teal-600 text-teal-200 hover:text-white rounded-xl text-[11px] font-semibold transition-all text-center block cursor-pointer"
          >
            Falar com a IA
          </button>
        </div>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
          Zemda v1.1.2 • LGPD Compliant
        </div>
      </aside>
    </>
  );
};
