import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DigitalCertificateSection } from './DigitalCertificateSection';
import {
  X,
  User,
  Mail,
  Lock,
  CheckCircle2,
  Shield,
  Key,
  Building2,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'email' | 'password' | 'certificate';
}

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'email'
}) => {
  const { currentUser, currentTenant, reloadSession } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'email' | 'password' | 'certificate'>(initialTab);

  // Estado para alteração de e-mail
  const [newEmail, setNewEmail] = useState('');
  const [loadingEmail, setLoadingEmail] = useState(false);

  // Estado para alteração de senha
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loadingPassword, setLoadingPassword] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialTab) setActiveTab(initialTab);
      if (currentUser) {
        setNewEmail(currentUser.email || '');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    }
  }, [isOpen, initialTab, currentUser]);

  useEffect(() => {
    const handleOpenCert = () => {
      setActiveTab('certificate');
    };
    window.addEventListener('open-certificate-settings', handleOpenCert);
    return () => window.removeEventListener('open-certificate-settings', handleOpenCert);
  }, []);

  if (!isOpen || !currentUser) return null;

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newEmail.trim().toLowerCase();

    if (!cleanEmail) {
      showToast('Informe o novo endereço de e-mail', 'error');
      return;
    }

    if (cleanEmail === currentUser.email?.toLowerCase()) {
      showToast('O e-mail informado já é o seu e-mail atual', 'info');
      return;
    }

    try {
      setLoadingEmail(true);
      const res = await ApiClient.put<{ message: string; email: string }>('/v1/auth/profile/email', {
        email: cleanEmail
      });
      showToast(res.message || 'E-mail atualizado com sucesso!', 'success');
      await reloadSession();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar e-mail', 'error');
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.trim().length < 6) {
      showToast('A nova senha deve ter no mínimo 6 caracteres', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('A confirmação de senha não confere com a nova senha', 'error');
      return;
    }

    try {
      setLoadingPassword(true);
      const res = await ApiClient.put<{ message: string }>('/v1/auth/profile/password', {
        currentPassword: currentPassword || undefined,
        newPassword: newPassword.trim()
      });
      showToast(res.message || 'Senha alterada com sucesso!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Erro ao alterar senha', 'error');
    } finally {
      setLoadingPassword(false);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'superadmin': return 'Administrador da Plataforma';
      case 'clinic_admin': return 'Gestor da Clínica';
      case 'professional': return 'Profissional de Atendimento';
      case 'receptionist': return 'Recepção / Atendimento';
      case 'secretary': return 'Secretária(o)';
      case 'patient': return 'Cliente / Paciente';
      default: return role;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold tracking-tight">Minha Conta & Segurança</h3>
              <p className="text-xs text-slate-400">Configurações pessoais do seu perfil no sistema</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumo do Usuário */}
        <div className="p-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-4 text-xs">
          <div>
            <span className="font-bold text-slate-800 text-sm block">{currentUser.name}</span>
            <div className="flex items-center gap-2 text-slate-500 mt-0.5">
              <span className="font-medium">{getRoleLabel(currentUser.role)}</span>
              {currentTenant && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-medium text-indigo-600">
                    <Building2 className="w-3.5 h-3.5" />
                    {currentTenant.trade_name || currentTenant.name}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-extrabold text-sm shrink-0">
            {currentUser.name.slice(0, 2).toUpperCase()}
          </div>
        </div>

        {/* Abas de Navegação */}
        <div className="flex items-center gap-2 p-2 border-b border-slate-100 bg-white">
          <button
            type="button"
            onClick={() => setActiveTab('email')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'email'
                ? 'bg-indigo-50 text-indigo-700 shadow-2xs border border-indigo-100'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Mail className="w-4 h-4" />
            Alterar E-mail
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('password')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'password'
                ? 'bg-indigo-50 text-indigo-700 shadow-2xs border border-indigo-100'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Key className="w-4 h-4" />
            Alterar Senha
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('certificate')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'certificate'
                ? 'bg-teal-50 text-teal-800 shadow-2xs border border-teal-200'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            Certificado Digital
          </button>
        </div>

        {/* Conteúdo da Aba */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'email' && (
            <form onSubmit={handleUpdateEmail} className="space-y-4 text-xs">
              <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-2.5 text-blue-900 leading-relaxed">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Ao alterar o seu e-mail, ele passará a ser utilizado para acessar o sistema. Todos os seus dados, atendimentos e permissões continuam exatamente os mesmos.
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">E-mail Atual</label>
                <input
                  type="email"
                  disabled
                  value={currentUser.email}
                  className="w-full px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-medium cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Novo E-mail de Acesso *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="seu.novo.email@exemplo.com"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={loadingEmail}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  {loadingEmail ? 'Atualizando...' : 'Salvar Novo E-mail'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'password' && (
            <form onSubmit={handleUpdatePassword} className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-2.5 text-slate-700 leading-relaxed">
                <Shield className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  Escolha uma senha forte com no mínimo 6 caracteres. Você poderá utilizá-la em todos os seus futuros acessos.
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Senha Atual (se souber)</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Sua senha atual"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nova Senha *</label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Confirmar Nova Senha *</label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingPassword}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  {loadingPassword ? 'Alterando...' : 'Salvar Nova Senha'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'certificate' && (
            <DigitalCertificateSection />
          )}
        </div>
      </div>
    </div>
  );
};
