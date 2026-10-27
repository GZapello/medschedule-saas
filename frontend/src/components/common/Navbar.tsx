import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ClinicSwitcher } from './ClinicSwitcher';
import {
  LogOut,
  Shield,
  Menu,
  Settings,
  HelpCircle
} from 'lucide-react';
import { useOnboarding } from '../onboarding/OnboardingContext';

interface NavbarProps {
  onToggleSidebar: () => void;
  onOpenAI?: () => void;
  onNavigate: (view: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, onNavigate }) => {
  const {
    isSuperAdmin,
    logout,
    isSandboxSession,
    exitSandboxSession
  } = useAuth();
  const { openHelp } = useOnboarding();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 h-11 sm:h-12 flex items-center justify-between px-3 sm:px-6 shadow-2xs">
      <div className="flex items-center">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg lg:hidden shrink-0 cursor-pointer"
          title="Alternar menu lateral"
          aria-label="Alternar menu lateral"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 ml-auto min-w-0 max-w-full">
        <ClinicSwitcher />
        {/* Botão de retorno ao Painel Global para SuperAdmin */}
        {isSuperAdmin && !isSandboxSession && (
          <button
            onClick={() => onNavigate('superadmin')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200 cursor-pointer shadow-2xs mr-1"
            title="Voltar ao Painel Global do Administrador"
          >
            <Shield className="w-3.5 h-3.5 text-rose-600" />
            <span className="hidden sm:inline">Painel Global</span>
          </button>
        )}

        {/* Central de Ajuda */}
        <button
          onClick={openHelp}
          data-tour="nav-help"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors text-xs font-medium cursor-pointer"
          title="Central de Ajuda (Alt + H)"
          aria-label="Ajuda"
        >
          <HelpCircle className="w-4 h-4 text-slate-500" />
          <span className="hidden sm:inline">Ajuda</span>
        </button>

        {/* Configurações */}
        <button
          onClick={() => onNavigate('settings')}
          data-tour="nav-settings"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors text-xs font-medium cursor-pointer"
          title="Configurações"
          aria-label="Configurações"
        >
          <Settings className="w-4 h-4 text-slate-500" />
          <span className="hidden sm:inline">Configurações</span>
        </button>

        {/* Sair */}
        <button
          onClick={isSandboxSession ? exitSandboxSession : logout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-xs font-medium cursor-pointer"
          title={isSandboxSession ? "Encerrar Simulação Sandbox (Voltar ao SuperAdmin)" : "Sair do sistema"}
          aria-label="Sair"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
};
