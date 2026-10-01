import React from 'react';
import { useAuth } from '../../context/AuthContext';
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
    currentTenant,
    isSuperAdmin,
    logout,
    isZemdaFisio,
    isZemdaOdonto,
    isSandboxSession,
    exitSandboxSession
  } = useAuth();
  const { openHelp } = useOnboarding();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 h-16 flex items-center justify-between px-3 sm:px-6 shadow-xs">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg lg:hidden shrink-0 cursor-pointer"
          title="Alternar menu lateral"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 sm:gap-3 cursor-pointer min-w-0" onClick={() => onNavigate('dashboard')}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0">
            {currentTenant?.name?.charAt(0) || 'Z'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">
                {isZemdaOdonto ? 'ZemdaOdonto' : isZemdaFisio ? 'ZemdaFisio' : (currentTenant?.trade_name || currentTenant?.name || 'Zemda')}
              </h1>
              {isZemdaOdonto && (
                <span className="bg-cyan-100 text-cyan-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-cyan-200 shrink-0">
                  Odontologia
                </span>
              )}
              {isZemdaFisio && !isZemdaOdonto && (
                <span className="bg-teal-100 text-teal-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-teal-200 shrink-0">
                  Fisioterapia
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium truncate hidden sm:block">
              {isZemdaOdonto
                ? 'Prontuário Odontológico & Odontograma'
                : isZemdaFisio
                ? 'Prontuário & Gestão Fisioterapêutica'
                : isSuperAdmin
                ? 'Plataforma Multi-Clínicas'
                : 'Ambiente Profissional'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Botão de retorno ao Painel Global para SuperAdmin */}
        {isSuperAdmin && !isSandboxSession && (
          <button
            onClick={() => onNavigate('superadmin')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200 cursor-pointer shadow-xs mr-1"
            title="Voltar ao Painel Global do Administrador"
          >
            <Shield className="w-3.5 h-3.5 text-rose-600" />
            <span className="hidden sm:inline">Painel Global</span>
          </button>
        )}

        {/* Botão de encerramento de simulação Sandbox para SuperAdmin */}
        {isSandboxSession && (
          <button
            onClick={exitSandboxSession}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors border border-purple-300 cursor-pointer shadow-xs mr-1"
            title="Encerrar Simulação Sandbox (Voltar ao SuperAdmin)"
          >
            <LogOut className="w-3.5 h-3.5 text-purple-600" />
            <span>Encerrar Sandbox</span>
          </button>
        )}

        {/* Central de Ajuda */}
        <button
          onClick={openHelp}
          data-tour="nav-help"
          className="flex items-center gap-1.5 px-2.5 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors text-xs font-medium cursor-pointer"
          title="Central de Ajuda (Alt + H)"
          aria-label="Ajuda"
        >
          <HelpCircle className="w-4 h-4 text-slate-500" />
          <span className="hidden sm:inline">Ajuda</span>
        </button>

        {/* Pequeno ícone de engrenagem (Configurações) */}
        <button
          onClick={() => onNavigate('settings')}
          data-tour="nav-settings"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          title="Configurações"
          aria-label="Configurações"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Ícone de Sair */}
        <button
          onClick={isSandboxSession ? exitSandboxSession : logout}
          className={`p-2 rounded-lg transition-colors cursor-pointer ${
            isSandboxSession
              ? 'text-purple-600 hover:text-purple-800 hover:bg-purple-100 bg-purple-50'
              : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
          }`}
          title={isSandboxSession ? "Encerrar Simulação Sandbox (Voltar ao SuperAdmin)" : "Sair do sistema"}
          aria-label="Sair"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
