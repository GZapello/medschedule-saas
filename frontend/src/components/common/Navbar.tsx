import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AccountSettingsModal } from '../profile/AccountSettingsModal';
import { ApiClient } from '../../api/client';
import {
  Bot,
  ExternalLink,
  LogOut,
  Building2,
  UserCheck,
  Shield,
  Menu,
  Key,
  Monitor,
  Smartphone
} from 'lucide-react';

interface NavbarProps {
  onToggleSidebar: () => void;
  onOpenAI: () => void;
  onNavigate: (view: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, onOpenAI, onNavigate }) => {
  const { currentUser, currentTenant, isSuperAdmin, logout, clientTermLabel, isZemdaFisio, isZemdaOdonto } = useAuth();
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);

  const getRoleBadge = () => {
    switch (currentUser?.role) {
      case 'superadmin':
        return <span className="bg-rose-100 text-rose-800 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><Shield className="w-3 h-3" /> SuperAdmin</span>;
      case 'clinic_admin':
        return <span className="bg-indigo-100 text-indigo-800 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><Building2 className="w-3 h-3" /> Gestor da Clínica</span>;
      case 'professional':
        return <span className="bg-teal-100 text-teal-800 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><UserCheck className="w-3 h-3" /> Profissional</span>;
      case 'receptionist':
        return <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">Recepção</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 text-xs font-semibold px-2 py-0.5 rounded-full">{clientTermLabel}</span>;
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 h-16 flex items-center justify-between px-4 sm:px-6 shadow-xs">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg lg:hidden"
          title="Alternar menu lateral"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('dashboard')}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            {currentTenant?.name?.charAt(0) || 'Z'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-slate-900 text-base leading-tight">
                {isZemdaOdonto ? 'ZemdaOdonto' : isZemdaFisio ? 'ZemdaFisio' : (currentTenant?.trade_name || currentTenant?.name || 'Zemda')}
              </h1>
              {isZemdaOdonto && (
                <span className="bg-cyan-100 text-cyan-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-cyan-200">
                  Odontologia
                </span>
              )}
              {isZemdaFisio && !isZemdaOdonto && (
                <span className="bg-teal-100 text-teal-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-teal-200">
                  Fisioterapia
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium">
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

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Link para página pública da clínica */}
        {currentTenant && (
          <button
            onClick={() => onNavigate('public_preview')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
            title="Abrir página pública de agendamento online"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Página de Agendamento
          </button>
        )}

        {/* Link para download do instalador Windows */}
        <a
          href={`${ApiClient.getBaseUrl()}/v1/public/download-windows`}
          download="Zemda Setup 1.1.2.exe"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          title="Baixar Zemda para Windows Desktop (.exe)"
        >
          <Monitor className="w-3.5 h-3.5 text-indigo-500" />
          <span className="hidden lg:inline">Zemda Windows</span>
        </a>

        {/* Link para download do app Android */}
        <a
          href={`${ApiClient.getBaseUrl()}/v1/public/download-android`}
          download="Zemda.apk"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
          title="Baixar Zemda para Android (.apk)"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
          <span className="hidden lg:inline">Zemda Android</span>
        </a>

        {/* Botão do Assistente Zemda (acesso discreto e profissional) */}
        <button
          onClick={onOpenAI}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-xs font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer"
          title="Abrir Assistente Zemda"
        >
          <Bot className="w-4 h-4 text-teal-600" />
          <span className="hidden md:inline">Assistente Zemda</span>
        </button>

        {/* Perfil e Role */}
        <div className="flex items-center gap-2 sm:gap-3 border-l border-slate-200 pl-3 sm:pl-4">
          <button
            type="button"
            onClick={() => setIsAccountModalOpen(true)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 transition-colors text-left cursor-pointer group"
            title="Minha Conta (Alterar E-mail ou Senha)"
          >
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 group-hover:bg-indigo-100 flex items-center justify-center text-indigo-700 font-extrabold text-xs transition-colors">
              {currentUser?.name?.slice(0, 2).toUpperCase() || 'U'}
            </div>
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-bold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors">
                {currentUser?.name}
              </span>
              <div className="mt-0.5">{getRoleBadge()}</div>
            </div>
          </button>

          <button
            onClick={() => setIsAccountModalOpen(true)}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
            title="Minha Conta / Segurança (E-mail e Senha)"
          >
            <Key className="w-4 h-4" />
          </button>

          <button
            onClick={logout}
            className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            title="Sair do sistema"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Modal Pessoal de Alteração de E-mail e Senha */}
      <AccountSettingsModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
      />
    </header>
  );
};
