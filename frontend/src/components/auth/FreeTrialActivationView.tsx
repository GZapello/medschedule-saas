import './CreateClinicModal.css';
import './FreeTrialActivationView.css';
import { trackCompletedRegistration } from '../../utils/registrationAnalytics';
import { GoogleAuthButton, GoogleIcon, GoogleJwtPayload } from './GoogleAuthButton';
import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Gift,
  Building2,
  User,
  Mail,
  Lock,
  Phone,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Ban,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Stethoscope
} from 'lucide-react';

interface FreeTrialActivationViewProps {
  token: string;
  onBackToHome: () => void;
  onSuccess: () => void;
}

interface ValidTrialData {
  id: string;
  targetName: string;
  targetEmail: string | null;
  durationDays: number;
  durationLabel: string;
  plan?: string;
  planLabel?: string;
  linkExpiresAt: string;
}

export const FreeTrialActivationView: React.FC<FreeTrialActivationViewProps> = ({
  token,
  onBackToHome,
  onSuccess
}) => {
  const { loginWithToken } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const [trialData, setTrialData] = useState<ValidTrialData | null>(null);

  // Lista de Profissões e Área de Atuação com respectivos módulos
  const DEFAULT_PROFESSIONS = [
    { id: 'prof-fonoaudiologo', name: 'Fonoaudiólogo(a) → ZemdaFono' },
    { id: 'prof-psicologo', name: 'Psicólogo(a) → ZemdaPsico' },
    { id: 'prof-psicanalista', name: 'Psicanalista → ZemdaPsico' },
    { id: 'prof-psicoterapeuta', name: 'Psicoterapeuta → ZemdaPsico' },
    { id: 'prof-terapeuta-ocupacional', name: 'Terapeuta Ocupacional → ZemdaTO' },
    { id: 'prof-psicopedagogo', name: 'Psicopedagogo(a) → ZemdaPP' },
    { id: 'prof-nutricionista', name: 'Nutricionista → ZemdaNutri' },
    { id: 'prof-fisioterapeuta', name: 'Fisioterapeuta → ZemdaFisio' },
    { id: 'prof-personal-trainer', name: 'Personal Trainer → ZemdaPersonal' },
    { id: 'prof-dentista', name: 'Cirurgião-Dentista → ZemdaOdonto' },
    { id: 'prof-medico', name: 'Médico(a) → ZemdaMed' },
    { id: 'prof-esteticista', name: 'Esteticista → ZemdaEstetic' },
    { id: 'prof-outro-saude', name: 'Outro profissional da saúde' }
  ];

  const [professions, setProfessions] = useState<Array<{ id: string; name: string }>>(DEFAULT_PROFESSIONS);
  const [selectedProfessionId, setSelectedProfessionId] = useState('');

  // Formulário
  const [clinicName, setClinicName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [privacyAccepted, setPrivacyAccepted] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState(false);

  // Autenticação com Google
  const [googleAuthData, setGoogleAuthData] = useState<{
    idToken: string;
    name: string;
    email: string;
  } | null>(null);

  useEffect(() => {
    validateTrialToken();
    loadProfessions();
  }, [token]);

  const loadProfessions = async () => {
    try {
      const data = await ApiClient.get<any[]>('/v1/taxonomy/professions');
      if (Array.isArray(data) && data.length > 0) {
        setProfessions(data.map(p => ({ id: p.id, name: p.label || p.name })));
      }
    } catch {
      // Fallback padrão já definido
    }
  };

  const validateTrialToken = async () => {
    try {
      setLoading(true);
      setErrorState(null);
      const res = await ApiClient.get<{ valid: boolean; trial: ValidTrialData }>(
        `/v1/public/free-trials/validate/${token}`
      );

      if (res && res.valid && res.trial) {
        setTrialData(res.trial);
        if (res.trial.targetName) {
          setClinicName(res.trial.targetName);
        }
        if (res.trial.targetEmail) {
          setManagerEmail(res.trial.targetEmail);
        }
      } else {
        setErrorState({
          code: 'INVALID',
          message: 'Link de teste grátis inválido ou não encontrado.'
        });
      }
    } catch (err: any) {
      setErrorState({
        code: err.code || 'ERROR',
        message: err.message || 'Erro ao validar link de teste grátis.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (val: string) => {
    // Máscara brasileira (XX) XXXXX-XXXX
    let cleaned = val.replace(/\D/g, '').slice(0, 11);
    if (cleaned.length > 10) {
      cleaned = cleaned.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    } else if (cleaned.length > 6) {
      cleaned = cleaned.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
    } else if (cleaned.length > 2) {
      cleaned = cleaned.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
    }
    setManagerPhone(cleaned);
  };

  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clinicName.trim()) {
      showToast('Por favor, informe o nome da clínica ou consultório.', 'error');
      return;
    }

    if (!managerName.trim()) {
      showToast('Por favor, informe seu nome completo.', 'error');
      return;
    }

    if (!selectedProfessionId) {
      showToast('Por favor, selecione sua área de atuação profissional.', 'error');
      return;
    }

    if (!managerEmail.trim() || !managerEmail.includes('@')) {
      showToast('Informe um e-mail válido para acesso.', 'error');
      return;
    }

    if (!googleAuthData) {
      if (!managerPassword || managerPassword.length < 6) {
        showToast('A senha deve conter no mínimo 6 caracteres.', 'error');
        return;
      }
    }

    if (!termsAccepted || !privacyAccepted) {
      showToast('Você deve aceitar os Termos de Uso e a Política de Privacidade.', 'error');
      return;
    }

    try {
      setSubmitting(true);

      // FLUXO GOOGLE: Ativação instantânea via Google Identity Services
      if (googleAuthData) {
        const res = await ApiClient.post<{
          success: boolean;
          message?: string;
          token: string;
          user: any;
          tenant: any;
          trialEndAt?: string;
          durationLabel?: string;
          durationDays?: number;
        }>('/v1/auth/google', {
          idToken: googleAuthData.idToken,
          context: 'trial',
          additionalData: {
            trialToken: token,
            clinicName: clinicName.trim(),
            managerName: managerName.trim(),
            managerPhone: managerPhone.trim() || undefined,
            professionId: selectedProfessionId,
            termsAccepted: true,
            privacyAccepted: true
          }
        });

        if (res.success === true && res.token && res.user?.id) {
          trackCompletedRegistration(res.user.id, res.durationDays || trialData?.durationDays || 14);
        }
        setActivationSuccess(true);
        showToast('Teste grátis ativado com sucesso via Google!', 'success');

        // Login automático imediato
        setTimeout(() => {
          loginWithToken(res.token, res.user, res.tenant);
          onSuccess();
        }, 1500);
        return;
      }

      // FLUXO PADRÃO: Cadastro local por e-mail e senha
      const res = await ApiClient.post<{
        success: boolean;
        message: string;
        token: string;
        user: any;
        tenant: any;
        trialEndAt: string;
        durationLabel: string;
        durationDays: number;
      }>(`/v1/public/free-trials/activate/${token}`, {
        clinicName: clinicName.trim(),
        managerName: managerName.trim(),
        managerEmail: managerEmail.trim().toLowerCase(),
        managerPassword,
        managerPhone: managerPhone.trim() || undefined,
        professionId: selectedProfessionId,
        termsAccepted: true,
        privacyAccepted: true
      });

      if (res.success === true && res.token && res.user?.id) {
        trackCompletedRegistration(res.user.id, res.durationDays);
      }
      setActivationSuccess(true);
      showToast('Teste grátis ativado com sucesso!', 'success');

      // Login automático imediato
      setTimeout(() => {
        loginWithToken(res.token, res.user, res.tenant);
        onSuccess();
      }, 1500);
    } catch (err: any) {
      showToast(err.message || 'Erro ao ativar teste grátis.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Estado de Carregamento
  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl border border-slate-100 text-center max-w-sm w-full text-slate-800 space-y-4 shadow-xl shadow-teal-900/5">
          <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <h3 className="text-lg font-extrabold text-slate-900">Validando Teste Grátis</h3>
          <p className="text-xs text-slate-500">Aguarde um instante enquanto verificamos seu link exclusivo...</p>
        </div>
      </div>
    );
  }

  // 2. Estado de Erro (Expirado, Revogado, Utilizado, Não Encontrado)
  if (errorState) {
    const isExpired = errorState.code === 'LINK_EXPIRED';
    const isRevoked = errorState.code === 'LINK_REVOKED';
    const isAlreadyUsed = errorState.code === 'LINK_ALREADY_USED';

    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-xl shadow-slate-900/5 border border-slate-100 space-y-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-inner bg-rose-50 text-rose-600">
            {isExpired && <Clock className="w-8 h-8 text-rose-600" />}
            {isRevoked && <Ban className="w-8 h-8 text-rose-600" />}
            {isAlreadyUsed && <CheckCircle2 className="w-8 h-8 text-amber-600" />}
            {!isExpired && !isRevoked && !isAlreadyUsed && <AlertTriangle className="w-8 h-8 text-rose-600" />}
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-900">
              {isExpired && 'Link de Teste Expirado'}
              {isRevoked && 'Link de Teste Cancelado'}
              {isAlreadyUsed && 'Link de Teste Já Utilizado'}
              {!isExpired && !isRevoked && !isAlreadyUsed && 'Link Inválido'}
            </h2>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              {errorState.message}
            </p>
          </div>

          <div className="pt-2">
            {isExpired || isRevoked || isAlreadyUsed ? (
              <button
                onClick={() => window.location.assign('/')}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Conhecer os Planos do Zemda
              </button>
            ) : (
              <button
                onClick={() => window.location.assign('/login')}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Ir para o Login
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. Estado de Sucesso na Ativação
  if (activationSuccess) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-xl shadow-teal-900/5 border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto text-emerald-600">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black uppercase tracking-wider mb-2">
              Ativação Concluída
            </span>
            <h2 className="text-2xl font-black text-slate-900">Bem-vindo ao Zemda!</h2>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Sua clínica foi criada com sucesso e seu teste grátis de <strong>{trialData?.durationLabel}</strong> está ativo a partir de agora.
            </p>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            Entrando no painel da sua clínica...
          </div>
        </div>
      </div>
    );
  }

  // 4. Formulário de Ativação
  return (
    <main className="signup-page trial-activation-page">
      <aside className="signup-intro">
        <button type="button" onClick={onBackToHome} className="trial-brand-link" aria-label="Voltar ao início do Zemda">
          <img src="/brand/zemda-logo.png" alt="Zemda" className="signup-logo" />
        </button>
        <div className="signup-pitch">
          <h1>Sua próxima fase de cuidado começa aqui.</h1>
          <p>Experimente o Zemda e reúna sua agenda, seus atendimentos e a gestão da sua clínica em um só lugar.</p>
          <ul>
            <li><Gift aria-hidden="true" />{trialData?.durationLabel} grátis</li>
            <li><ShieldCheck aria-hidden="true" />Sem cobrança imediata</li>
            <li><Sparkles aria-hidden="true" />Configuração rápida</li>
            <li><Stethoscope aria-hidden="true" />Módulos conforme seu perfil profissional</li>
          </ul>
        </div>
      </aside>
      <section className="signup-card trial-activation-card" aria-labelledby="trial-activation-title">
        <header className="signup-card-header trial-card-header">
          <div className="trial-card-brand"><img src="/brand/zemda-icon.png" alt="" width="28" height="28" /><span>Ativação do Zemda</span></div>
          <span className="trial-badge"><Gift size={13} aria-hidden="true" />Teste grátis</span>
        </header>
        <div className="signup-content trial-content">
          <div className="trial-heading">
            <div className="trial-plan">{trialData?.planLabel ? `Plano ${trialData.planLabel} · ` : ''}{trialData?.durationLabel} para experimentar</div>
            <h2 id="trial-activation-title">Ative seu teste grátis</h2>
            <p>Preencha os dados abaixo para configurar sua clínica e iniciar seu acesso ao Zemda.</p>
          </div>
          <div className="trial-notice p-3.5 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-center gap-3">
            <div className="p-2 bg-amber-500 rounded-xl text-slate-950 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="text-xs text-amber-950 leading-relaxed">
              Seu período de <strong>{trialData?.durationLabel}</strong> começará a contar no instante em que você concluir este cadastro.
            </div>
          </div>

          <form onSubmit={handleActivateSubmit} className="trial-form space-y-4">
            {/* Autenticação Google */}
            {!googleAuthData ? (
              <div className="space-y-2 pb-2">
                <GoogleAuthButton
                  text="continue_with"
                  customLabel="Continuar com Google"
                  onSuccess={(idToken, payload) => {
                    const email = (payload?.email || '').trim().toLowerCase();
                    const name = (payload?.name || '').trim();
                    if (trialData?.targetEmail && trialData.targetEmail.toLowerCase() !== email) {
                      showToast(`Este link de teste é exclusivo para ${trialData.targetEmail}.`, 'error');
                      return;
                    }
                    setGoogleAuthData({ idToken, name, email });
                    if (email) setManagerEmail(email);
                    if (name && !managerName) setManagerName(name);
                    showToast('Conta Google conectada! Verifique os dados abaixo para ativar o teste.', 'info');
                  }}
                  onError={(err) => showToast(err, 'error')}
                  disabled={submitting}
                />
                <div className="flex items-center gap-3">
                  <div className="h-px bg-slate-200/80 flex-1" />
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    ou preencha os dados
                  </span>
                  <div className="h-px bg-slate-200/80 flex-1" />
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-teal-50 border border-teal-200/80 flex items-center justify-between text-xs mb-3">
                <div className="flex items-center gap-2.5">
                  <GoogleIcon className="w-5 h-5 shrink-0" />
                  <div>
                    <p className="font-bold text-teal-900 leading-tight">Ativando via Google</p>
                    <p className="text-[11px] text-teal-700 leading-tight">{googleAuthData.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setGoogleAuthData(null)}
                  className="text-xs font-bold text-teal-800 hover:text-teal-900 hover:underline cursor-pointer"
                >
                  Trocar
                </button>
              </div>
            )}

            {/* Nome da Clínica */}
            <div>
              <label htmlFor="trial-clinicName" className="block text-xs font-bold text-slate-700 mb-1">
                Nome da Clínica ou Consultório <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="Ex: Clínica Bem Viver"
                  id="trial-clinicName"
                  value={clinicName}
                  onChange={e => setClinicName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all font-medium"
                />
              </div>
            </div>

            {/* Nome do Gestor */}
            <div>
              <label htmlFor="trial-managerName" className="block text-xs font-bold text-slate-700 mb-1">
                Nome Completo do Responsável <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="Ex: Dr. Roberto Guimarães"
                  id="trial-managerName"
                  value={managerName}
                  onChange={e => setManagerName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all font-medium"
                />
              </div>
            </div>

            {/* Área de Atuação do Profissional */}
            <div>
              <label htmlFor="trial-selectedProfessionId" className="block text-xs font-bold text-slate-700 mb-1">
                Área de Atuação do Profissional <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Stethoscope className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  required
                  aria-describedby="trial-profession-help"
                  id="trial-selectedProfessionId"
                  value={selectedProfessionId}
                  onChange={e => setSelectedProfessionId(e.target.value)}
                  className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all font-medium text-slate-800"
                >
                  <option value="">Selecione sua área de atuação...</option>
                  {professions.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <p id="trial-profession-help" className="trial-module-note">
                Seu módulo profissional + <strong>Zemda360 (Mapa Corporal)</strong>, disponível para todas as áreas.
              </p>
            </div>

            {/* Grid: E-mail e Telefone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="trial-managerEmail" className="block text-xs font-bold text-slate-700">
                    E-mail de Acesso <span className="text-rose-500">*</span>
                  </label>
                  {googleAuthData && (
                    <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Verificado pelo Google
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    readOnly={!!googleAuthData || !!trialData?.targetEmail}
                    placeholder="seuemail@clinica.com"
                    id="trial-managerEmail"
                    value={managerEmail}
                    onChange={e => setManagerEmail(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all font-medium ${(googleAuthData || trialData?.targetEmail) ? 'opacity-80 bg-slate-100 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="trial-managerPhone" className="block text-xs font-bold text-slate-700 mb-1">
                  WhatsApp / Telefone
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    placeholder="(11) 99999-8888"
                    id="trial-managerPhone"
                    value={managerPhone}
                    onChange={e => handlePhoneChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Senha */}
            {!googleAuthData ? (
              <div>
                <label htmlFor="trial-managerPassword" className="block text-xs font-bold text-slate-700 mb-1">
                  Criar Senha de Acesso <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    id="trial-managerPassword"
                    value={managerPassword}
                    onChange={e => setManagerPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all font-medium"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5 text-xs text-slate-600">
                <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
                <span>
                  <strong>Senha dispensada:</strong> O acesso ao Zemda será autenticado com segurança pela sua conta Google.
                </span>
              </div>
            )}

            {/* Aceite Legal */}
            <div className="pt-2 space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted && privacyAccepted}
                  onChange={e => {
                    setTermsAccepted(e.target.checked);
                    setPrivacyAccepted(e.target.checked);
                  }}
                  className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="leading-relaxed">
                  Declaro que li e concordo com os{' '}
                  <a href="/termos-de-uso" target="_blank" className="text-teal-600 font-bold hover:underline">
                    Termos de Uso
                  </a>{' '}
                  e a{' '}
                  <a href="/privacidade" target="_blank" className="text-teal-600 font-bold hover:underline">
                    Política de Privacidade (LGPD)
                  </a>{' '}
                  do Zemda.
                </span>
              </label>
            </div>

            {/* Botão de Ativação */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="trial-submit w-full py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Ativando seu teste...
                  </>
                ) : googleAuthData ? (
                  <>
                    <GoogleIcon className="w-4 h-4" />
                    Ativar Teste Grátis com Google
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Criar conta e iniciar teste
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Rodapé Seguro */}
        <div className="trial-security text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Seus dados estão protegidos por criptografia de ponta a ponta.
        </div>
      </section>
    </main>
  );
};
