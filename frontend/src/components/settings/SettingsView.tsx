import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Settings,
  Building2,
  Save,
  Sparkles,
  User,
  Key,
  Mail,
  Lock,
  Shield,
  AlertCircle
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { currentUser, currentTenant, isClinicAdmin, refreshTenant, reloadSession } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'clinic' | 'profile'>(isClinicAdmin ? 'clinic' : 'profile');

  // Configurações da Clínica
  const [name, setName] = useState<string>('');
  const [tradeName, setTradeName] = useState<string>('');
  const [cnpjCpf, setCnpjCpf] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [clientTermLabel, setClientTermLabel] = useState<string>('Paciente');
  const [primaryColor, setPrimaryColor] = useState<string>('#4f46e5');
  const [loadingClinic, setLoadingClinic] = useState<boolean>(false);

  // Configurações Pessoais (Minha Conta)
  const [profileEmail, setProfileEmail] = useState<string>(currentUser?.email || '');
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [loadingProfileEmail, setLoadingProfileEmail] = useState<boolean>(false);
  const [loadingProfilePassword, setLoadingProfilePassword] = useState<boolean>(false);

  useEffect(() => {
    if (currentTenant) {
      setName(currentTenant.name || '');
      setTradeName(currentTenant.trade_name || '');
      setCnpjCpf(currentTenant.cnpj_cpf || '');
      setEmail(currentTenant.email || '');
      setPhone(currentTenant.phone || '');
      setAddress(currentTenant.address || '');
      setCity(currentTenant.city || '');
      setState(currentTenant.state || '');
      setClientTermLabel(currentTenant.client_term_label || 'Paciente');
      setPrimaryColor(currentTenant.primary_color || '#4f46e5');
    }
    if (currentUser) {
      setProfileEmail(currentUser.email || '');
    }
  }, [currentTenant, currentUser]);

  const handleSaveClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoadingClinic(true);
      await ApiClient.put('/v1/tenants/current', {
        name,
        tradeName,
        cnpjCpf,
        email,
        phone,
        address,
        city,
        state,
        clientTermLabel,
        primaryColor
      });
      showToast('Configurações da clínica atualizadas com sucesso!', 'success');
      refreshTenant();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar configurações da clínica', 'error');
    } finally {
      setLoadingClinic(false);
    }
  };

  const handleUpdateProfileEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = profileEmail.trim().toLowerCase();
    if (!cleanEmail) {
      showToast('Informe o novo endereço de e-mail', 'error');
      return;
    }
    if (cleanEmail === currentUser?.email?.toLowerCase()) {
      showToast('O e-mail informado já é o seu e-mail atual', 'info');
      return;
    }

    try {
      setLoadingProfileEmail(true);
      const res = await ApiClient.put<{ message: string; email: string }>('/v1/auth/profile/email', {
        email: cleanEmail
      });
      showToast(res.message || 'E-mail pessoal atualizado com sucesso!', 'success');
      await reloadSession();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar e-mail pessoal', 'error');
    } finally {
      setLoadingProfileEmail(false);
    }
  };

  const handleUpdateProfilePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.trim().length < 6) {
      showToast('A nova senha deve possuir pelo menos 6 caracteres', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('A confirmação de senha não coincide com a nova senha', 'error');
      return;
    }

    try {
      setLoadingProfilePassword(true);
      const res = await ApiClient.put<{ message: string }>('/v1/auth/profile/password', {
        currentPassword: currentPassword || undefined,
        newPassword: newPassword.trim()
      });
      showToast(res.message || 'Senha alterada com sucesso!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showToast(err.message || 'Erro ao alterar senha', 'error');
    } finally {
      setLoadingProfilePassword(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            Configurações
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isClinicAdmin
              ? 'Gerencie os dados institucionais da clínica e as configurações pessoais da sua conta.'
              : 'Gerencie os dados de acesso e configurações pessoais da sua conta.'}
          </p>
        </div>

        {/* Abas se for gestor/admin */}
        {isClinicAdmin && (
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl text-xs font-bold w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('clinic')}
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'clinic' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Clínica
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'profile' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Minha Conta
            </button>
          </div>
        )}
      </div>

      {/* ABA 1: Configurações da Clínica (Apenas Gestores / Admins) */}
      {isClinicAdmin && activeTab === 'clinic' && (
        <form onSubmit={handleSaveClinic} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6">
          {/* Seção Vocabulário */}
          <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-2">
            <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-indigo-600" /> Terminologia Personalizada por Nicho
            </div>
            <p className="text-xs text-indigo-700">
              Como você prefere chamar os usuários que recebem atendimento na sua plataforma?
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {['Paciente', 'Cliente', 'Aluno', 'Tutor / Pet'].map(term => (
                <button
                  type="button"
                  key={term}
                  onClick={() => setClientTermLabel(term)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                    clientTermLabel === term
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-indigo-50'
                  }`}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          {/* Dados Gerais */}
          <div className="space-y-4 text-xs">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Identificação Cadastral</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Razão Social / Nome Oficial</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome Fantasia (Exibido aos Clientes)</label>
                <input
                  type="text"
                  value={tradeName}
                  onChange={e => setTradeName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">CNPJ ou CPF</label>
                <input
                  type="text"
                  value={cnpjCpf}
                  onChange={e => setCnpjCpf(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">E-mail Principal da Clínica</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Contato e Endereço */}
          <div className="space-y-4 text-xs pt-4 border-t border-slate-100">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Endereço & Atendimento</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Endereço Completo</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">WhatsApp / Telefone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cidade</label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Estado (UF)</label>
                <input
                  type="text"
                  value={state}
                  onChange={e => setState(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cor Primária da Marca</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                  />
                  <span className="text-slate-500 font-mono">{primaryColor}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={loadingClinic}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {loadingClinic ? 'Salvando...' : 'Salvar Alterações da Clínica'}
            </button>
          </div>
        </form>
      )}

      {/* ABA 2: Minha Conta & Segurança (Disponível para TODOS os usuários) */}
      {(!isClinicAdmin || activeTab === 'profile') && (
        <div className="space-y-6">
          {/* Card de Alteração de E-mail */}
          <form onSubmit={handleUpdateProfileEmail} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-sm">Alterar Endereço de E-mail</h3>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Acesso Pessoal</span>
            </div>

            <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl flex items-start gap-2.5 text-blue-900 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Ao alterar o seu e-mail, você passará a utilizá-lo no login. Seus vínculos à clínica, atendimentos e permissões continuam os mesmos.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">E-mail Atual</label>
                <input
                  type="email"
                  disabled
                  value={currentUser?.email || ''}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-medium cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Novo E-mail *</label>
                <input
                  type="email"
                  required
                  value={profileEmail}
                  onChange={e => setProfileEmail(e.target.value)}
                  placeholder="novo.email@exemplo.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loadingProfileEmail}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {loadingProfileEmail ? 'Salvando...' : 'Salvar Novo E-mail'}
              </button>
            </div>
          </form>

          {/* Card de Alteração de Senha */}
          <form onSubmit={handleUpdateProfilePassword} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-sm">Alterar Senha de Acesso</h3>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Segurança da Conta</span>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-2.5 text-slate-700 leading-relaxed">
              <Shield className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                A nova senha deve possuir no mínimo 6 caracteres. Você pode alterar sua senha a qualquer momento.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Senha Atual (se souber)</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Sua senha atual"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nova Senha *</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Confirmar Nova Senha *</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loadingProfilePassword}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {loadingProfilePassword ? 'Salvando...' : 'Salvar Nova Senha'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
