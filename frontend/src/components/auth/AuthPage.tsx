import './auth-experience.css';
import { googleAuthError } from './googleAuthErrors';
import { sanitizePlanCode } from '../../utils/planUtils';
import { maskBrazilianPhone, validateBrazilianPhone } from '../../utils/phone-mask';
import { GoogleAccountLinkDialog } from './GoogleAccountLinkDialog';
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { trackLoginStarted } from '../../utils/registrationAnalytics';
import { CreateClinicModal } from './CreateClinicModal';
import { RegisterUserModal } from './RegisterUserModal';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { GoogleAuthButton, GoogleIcon, GOOGLE_LOGIN_ERROR } from './GoogleAuthButton';
import {
  Lock,
  Mail,
  ArrowRight,
  Building2,
  UserPlus,
  AlertCircle,
  Clock,
  XCircle,
  CheckCircle2,
  RefreshCw,
  X,
  ArrowLeft,
  Sparkles,
  Phone
} from 'lucide-react';

interface AuthPageProps {
  onOpenPublicBooking?: () => void;
  onBackToLanding?: () => void;
  initialAction?: 'login' | 'create-clinic' | 'register-user';
  initialPlan?: string;
  isTrial?: boolean;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onBackToLanding,
  initialAction,
  initialPlan,
  isTrial
}) => {
  const { login, loginWithToken } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isCreateClinicOpen, setIsCreateClinicOpen] = useState<boolean>(initialAction === 'create-clinic');
  const [isRegisterUserOpen, setIsRegisterUserOpen] = useState<boolean>(initialAction === 'register-user');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<{ message: string; code?: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string }>({});

  // Estados de vinculação segura e novo cadastro via Google
  const [googleLinkingState, setGoogleLinkingState] = useState<{
    idToken: string;
    email: string;
    name: string;
  } | null>(null);

  const [googleSignupData, setGoogleSignupData] = useState<{
    idToken: string;
    name: string;
    email: string;
  } | null>(null);
  // Fluxo restrito de regularização de WhatsApp para usuários suspensos por esse motivo
  const [whatsappPendingState, setWhatsappPendingState] = useState<{
    restrictedToken: string;
    reason: string;
    previousPhone?: string | null;
    userName?: string;
    userEmail?: string;
  } | null>(null);

  const [whatsappNewPhone, setWhatsappNewPhone] = useState<string>('');
  const [whatsappPhoneError, setWhatsappPhoneError] = useState<string | null>(null);
  const [whatsappSubmitting, setWhatsappSubmitting] = useState<boolean>(false);
  const [whatsappSuccessResult, setWhatsappSuccessResult] = useState<{
    message: string;
    accessRestored: boolean;
    token?: string;
    user?: any;
    tenant?: any;
    phone?: string;
  } | null>(null);

  const hasTrackedLoginStarted = useRef<boolean>(false);
  const notifyLoginStarted = () => {
    if (!hasTrackedLoginStarted.current) {
      hasTrackedLoginStarted.current = true;
      trackLoginStarted({ method: 'email' });
    }
  };

  const handleWhatsAppSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsappPendingState) return;

    const validation = validateBrazilianPhone(whatsappNewPhone);
    if (!validation.valid) {
      setWhatsappPhoneError(validation.error || 'Informe um número com DDD válido (ex: (11) 98765-4321)');
      return;
    }
    setWhatsappPhoneError(null);

    try {
      setWhatsappSubmitting(true);
      const res = await ApiClient.post<any>('/v1/auth/update-whatsapp', {
        phone: whatsappNewPhone
      }, {
        headers: {
          Authorization: `Bearer ${whatsappPendingState.restrictedToken}`
        }
      });

      setWhatsappSuccessResult({
        message: res.message || 'Número atualizado — não verificado.',
        accessRestored: Boolean(res.accessRestored),
        token: res.token,
        user: res.user,
        tenant: res.tenant,
        phone: res.phone
      });
      showToast(res.message || 'Número atualizado com sucesso!', 'success');
    } catch (err: any) {
      setWhatsappPhoneError(err.message || 'Erro ao enviar novo número de WhatsApp. Tente novamente.');
      showToast(err.message || 'Falha ao atualizar WhatsApp', 'error');
    } finally {
      setWhatsappSubmitting(false);
    }
  };

  const handleAccessRestored = () => {
    if (whatsappSuccessResult?.token && whatsappSuccessResult?.user) {
      loginWithToken(whatsappSuccessResult.token, whatsappSuccessResult.user, whatsappSuccessResult.tenant);
      showToast('Acesso restabelecido com sucesso! Bem-vindo de volta.', 'success');
    } else {
      setWhatsappPendingState(null);
      setWhatsappSuccessResult(null);
      setWhatsappNewPhone('');
    }
  };

  const handleCancelWhatsAppUpdate = () => {
    setWhatsappPendingState(null);
    setWhatsappSuccessResult(null);
    setWhatsappNewPhone('');
    setWhatsappPhoneError(null);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    notifyLoginStarted();

    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errors.email = 'Informe o seu e-mail';
    }
    if (!password.trim()) {
      errors.password = 'Informe a sua senha';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      showToast('Preencha seu e-mail e senha', 'error');
      return;
    }

    setValidationErrors({});

    try {
      setLoading(true);
      setLoginError(null);
      await login(email.trim().toLowerCase(), password);
      showToast('Login realizado com sucesso!', 'success');
    } catch (err: any) {
      if ((err.code === 'WHATSAPP_UPDATE_REQUIRED' || err.data?.code === 'WHATSAPP_UPDATE_REQUIRED') && (err.data?.restrictedToken || err.restrictedToken)) {
        const rToken = err.data?.restrictedToken || err.restrictedToken;
        const rReason = err.data?.reason || err.reason || 'Atualização cadastral do WhatsApp solicitada pela administração.';
        const rPrevPhone = err.data?.previousPhone || err.previousPhone || null;
        const rUser = err.data?.user || err.user;
        setWhatsappPendingState({
          restrictedToken: rToken,
          reason: rReason,
          previousPhone: rPrevPhone,
          userName: rUser?.name,
          userEmail: rUser?.email || email.trim()
        });
        setWhatsappNewPhone('');
        setWhatsappPhoneError(null);
        setWhatsappSuccessResult(null);
        showToast('Atualização de WhatsApp necessária para regularizar seu acesso.', 'info');
        return;
      }
      setLoginError({ message: err.message, code: err.code });
      showToast(err.message || 'Falha na autenticação', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openRegistration = () => {
    const cleanPlan = sanitizePlanCode(initialPlan);
    const query = new URLSearchParams(window.location.search);
    if (cleanPlan) query.set('plan', cleanPlan);
    else query.delete('plan');
    if (isTrial !== undefined) query.set('isTrial', String(isTrial));
    if (window.location.pathname !== '/cadastro') {
      window.history.pushState({ registrationFrom: '/login' }, '', `/cadastro${query.size ? `?${query}` : ''}`);
    }
    setIsCreateClinicOpen(true);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  useEffect(() => {
    const sync = () => setIsCreateClinicOpen(window.location.pathname === '/cadastro');
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => {
    setIsCreateClinicOpen(window.location.pathname === '/cadastro' || initialAction === 'create-clinic');
  }, [initialAction]);

  const handleGoogleSuccess = async (idToken: string) => {
    try {
      setLoading(true);
      setLoginError(null);
      trackLoginStarted({ method: 'google' });

      const res = await ApiClient.post<any>('/v1/auth/google', {
        idToken,
        context: 'login'
      });

      if (res.token && res.user) {
        loginWithToken(res.token, res.user, res.tenant);
        showToast('Login realizado com sucesso via Google!', 'success');
        return;
      }

      if (res.requiresPasswordToLink) {
        setGoogleLinkingState({
          idToken,
          email: res.email || '',
          name: res.name || ''
        });
        showToast('Conta existente encontrada. Confirme sua senha para vincular sua conta Google.', 'info');
        return;
      }

      if (res.isNewUser) {
        showToast('Nenhuma conta encontrada com este Google. Preencha seus dados para criar sua conta.', 'info');
        setGoogleSignupData({
          idToken,
          name: res.googleUser?.name || '',
          email: res.googleUser?.email || ''
        });
        openRegistration();
        return;
      }
      throw new Error('Resposta inesperada ao entrar com Google. Tente novamente.');
    } catch (err: any) {
      if ((err.code === 'WHATSAPP_UPDATE_REQUIRED' || err.data?.code === 'WHATSAPP_UPDATE_REQUIRED') && (err.data?.restrictedToken || err.restrictedToken)) {
        const rToken = err.data?.restrictedToken || err.restrictedToken;
        const rReason = err.data?.reason || err.reason || 'Atualização cadastral do WhatsApp solicitada pela administração.';
        const rPrevPhone = err.data?.previousPhone || err.previousPhone || null;
        const rUser = err.data?.user || err.user;
        setWhatsappPendingState({
          restrictedToken: rToken,
          reason: rReason,
          previousPhone: rPrevPhone,
          userName: rUser?.name,
          userEmail: rUser?.email
        });
        setWhatsappNewPhone('');
        setWhatsappPhoneError(null);
        setWhatsappSuccessResult(null);
        showToast('Atualização de WhatsApp necessária para regularizar seu acesso.', 'info');
        return;
      }
      const msg = googleAuthError(err, 'login');
      setLoginError({ message: msg, code: err?.code });
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${isCreateClinicOpen ? 'signup-auth-host' : ''} auth-experience min-h-screen bg-[#fafbfc] text-slate-800 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans`}>
      {!isCreateClinicOpen && <>
      {/* Glow sutil de fundo característico do Zemda */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-teal-100/60 via-emerald-50/30 to-transparent blur-3xl -z-10 pointer-events-none" />

      <div className="auth-login-layout w-full max-w-md space-y-6">
        {/* Botão de Retorno ao Portal Zemda */}
        {onBackToLanding && (
          <div className="auth-back flex justify-start">
            <button
              type="button"
              onClick={onBackToLanding}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 hover:text-teal-700 text-xs font-semibold border border-slate-200/80 shadow-xs transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-teal-600" />
              <span>Voltar ao início</span>
            </button>
          </div>
        )}

        {/* Brand Header Institucional Zemda */}
        <div className="auth-login-brand text-center space-y-2 select-none">
          <div className="flex items-center justify-center mb-1">
            <img
              src="/brand/zemda-logo.png"
              alt="Zemda"
              className="h-12 sm:h-14 w-auto object-contain drop-shadow-xs"
            />
          </div>
          <p className="text-xs text-teal-700 font-bold uppercase tracking-widest">
            Saúde e Gestão em Harmonia
          </p>
          <div className="auth-brand-copy">
            <h1>Mais cuidado.<br />Mais organização.<br /><span>Seu Zemda.</span></h1>
            <p>Sua rotina clínica conectada, do primeiro agendamento à continuidade do cuidado.</p>
            <ul>
              <li><CheckCircle2 aria-hidden="true" />Agenda, prontuários e gestão em um só lugar</li>
              <li><CheckCircle2 aria-hidden="true" />Ferramentas para sua profissão</li>
              <li><CheckCircle2 aria-hidden="true" />Acesso organizado para você e sua equipe</li>
            </ul>
          </div>
        </div>

        {/* Caixa de Atualização Restrita de WhatsApp (Contas suspensas exclusivamente por WhatsApp) */}
        {whatsappPendingState ? (
          <div className="auth-login-card bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-teal-900/5 border border-slate-200/80 space-y-5 animate-in fade-in duration-200">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-amber-800 text-[11px] font-bold">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Atualização de WhatsApp necessária</span>
              </div>
              <h2 className="text-lg font-black text-slate-900">
                Regularização de Contato
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Seu acesso está temporariamente suspenso até a regularização do número de WhatsApp cadastrado.
              </p>
            </div>

            {whatsappSuccessResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>Número atualizado — não verificado</span>
                  </div>
                  <p className="text-xs text-emerald-900 leading-relaxed">
                    {whatsappSuccessResult.message}
                  </p>
                  {whatsappSuccessResult.phone && (
                    <p className="text-[11px] text-emerald-800 font-semibold pt-1 border-t border-emerald-200/60">
                      Novo número registrado: <span className="font-mono">{whatsappSuccessResult.phone}</span>
                    </p>
                  )}
                </div>

                {whatsappSuccessResult.accessRestored && whatsappSuccessResult.token ? (
                  <button
                    type="button"
                    onClick={handleAccessRestored}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <span>Acessar Plataforma</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600 text-center">
                      Sua regularização foi registrada com sucesso e aguarda análise da administração.
                    </p>
                    <button
                      type="button"
                      onClick={handleCancelWhatsAppUpdate}
                      className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      Voltar ao Início
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleWhatsAppSubmit} className="space-y-4">
                {(whatsappPendingState.userName || whatsappPendingState.userEmail) && (
                  <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-700 text-xs flex items-center justify-between">
                    <span className="font-semibold text-slate-900 truncate">
                      {whatsappPendingState.userName || whatsappPendingState.userEmail}
                    </span>
                    <span className="text-[10px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0">
                      Identificado
                    </span>
                  </div>
                )}

                <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/70 space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900 text-[11px] uppercase tracking-wider">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Motivo informado pelo administrador:</span>
                  </div>
                  <p className="text-amber-950 font-medium leading-relaxed pl-5">
                    {whatsappPendingState.reason}
                  </p>
                </div>

                {whatsappPendingState.previousPhone && (
                  <p className="text-[11px] text-slate-500 font-medium">
                    Número anterior cadastrado: <span className="font-mono text-slate-700">{whatsappPendingState.previousPhone}</span>
                  </p>
                )}

                <div>
                  <label htmlFor="zemda-update-whatsapp-phone" className="block text-xs font-bold text-slate-700 mb-1">
                    Novo número de WhatsApp (com DDD)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      id="zemda-update-whatsapp-phone"
                      autoFocus
                      value={whatsappNewPhone}
                      onChange={e => {
                        const masked = maskBrazilianPhone(e.target.value);
                        setWhatsappNewPhone(masked);
                        if (whatsappPhoneError) setWhatsappPhoneError(null);
                      }}
                      placeholder="(11) 98765-4321"
                      maxLength={15}
                      className={`w-full pl-10 pr-4 py-2.5 text-xs font-medium border rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 ${
                        whatsappPhoneError
                          ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
                          : 'border-slate-200 focus:ring-teal-500 focus:border-teal-500'
                      }`}
                    />
                  </div>
                  {whatsappPhoneError ? (
                    <p className="text-[11px] text-red-600 mt-1 font-semibold">{whatsappPhoneError}</p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Informe o código de área (DDD) e o número completo (10 ou 11 dígitos).
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={whatsappSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
                >
                  {whatsappSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Atualizando dados...</span>
                    </>
                  ) : (
                    <>
                      <span>Atualizar WhatsApp</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={handleCancelWhatsAppUpdate}
                    className="text-xs text-slate-500 hover:text-slate-700 font-semibold transition-colors cursor-pointer hover:underline"
                  >
                    Voltar para o login
                  </button>
                </div>
              </form>
            )}

            <div className="pt-1 text-center space-y-0.5 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 font-medium">
                Zemda • Sessão Restrita de Regularização • Dados Protegidos
              </p>
            </div>
          </div>
        ) : (
        <div className="auth-login-card bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-teal-900/5 border border-slate-200/80 space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-black text-slate-900">Acessar Plataforma</h2>
            <p className="text-xs text-slate-500">
              Entre com sua conta Google ou use seu e-mail e senha cadastrados.
            </p>
          </div>

          {/* Autenticação com Google */}
          <div className="space-y-3">
            <GoogleAuthButton
              className="auth-google-entry"
              text="continue_with"
              customLabel="Continuar com Google"
              onSuccess={handleGoogleSuccess}
              onError={(errStr) => showToast(googleAuthError(errStr, 'login'), 'error')}
              disabled={loading || isCreateClinicOpen || !!googleLinkingState}
            />

            <div className="flex items-center gap-3">
              <div className="h-px bg-slate-200/80 flex-1" />
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                ou com e-mail e senha
              </span>
              <div className="h-px bg-slate-200/80 flex-1" />
            </div>
          </div>

          {/* Alertas de Status de Conta (Aguardando Aprovação / Recusado) */}
          {loginError && (
            <div
              className={`p-3.5 rounded-2xl text-xs space-y-1 border ${
                loginError.code === 'USER_PENDING'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : loginError.code === 'USER_REJECTED'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                {loginError.code === 'USER_PENDING' ? (
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                ) : loginError.code === 'USER_REJECTED' ? (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>
                  {loginError.code === 'USER_PENDING'
                    ? 'Acesso Aguardando Aprovação'
                    : loginError.code === 'USER_REJECTED'
                    ? 'Solicitação Recusada'
                    : 'Aviso de Acesso'}
                </span>
              </div>
              <p>{loginError.message}</p>
              {loginError.code === 'USER_PENDING' && (
                <p className="text-[11px] text-amber-700 font-medium">
                  Entre em contato com o gestor da sua clínica para agilizar a liberação.
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} onFocusCapture={notifyLoginStarted} onChangeCapture={notifyLoginStarted} className="space-y-4">
            <div>
              <label htmlFor="zemda-login-email" className="block text-xs font-bold text-slate-700 mb-1">E-mail de Acesso</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  id="zemda-login-email"
                  autoComplete="username"
                  aria-invalid={!!validationErrors.email}
                  aria-describedby={validationErrors.email ? "login-email-error" : undefined}
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    if (validationErrors.email) setValidationErrors(prev => ({ ...prev, email: undefined }));
                  }}
                  placeholder="seuemail@exemplo.com"
                  className={`w-full pl-10 pr-4 py-2.5 text-xs font-medium border rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 ${
                    validationErrors.email
                      ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
                      : 'border-slate-200 focus:ring-teal-500 focus:border-teal-500'
                  }`}
                />
              </div>
              {validationErrors.email && (
                <p id="login-email-error" className="text-[11px] text-red-600 mt-1 font-semibold">{validationErrors.email}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="zemda-login-password" className="block text-xs font-bold text-slate-700">Senha</label>
                <button
                  type="button"
                  onClick={() => setIsForgotPasswordOpen(true)}
                  className="text-[11px] font-semibold text-teal-600 hover:text-teal-700 hover:underline cursor-pointer transition-colors"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  id="zemda-login-password"
                  autoComplete="current-password"
                  aria-invalid={!!validationErrors.password}
                  aria-describedby={validationErrors.password ? "login-password-error" : undefined}
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    if (validationErrors.password) setValidationErrors(prev => ({ ...prev, password: undefined }));
                  }}
                  placeholder="••••••••"
                  className={`w-full pl-10 pr-4 py-2.5 text-xs font-medium border rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 ${
                    validationErrors.password
                      ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
                      : 'border-slate-200 focus:ring-teal-500 focus:border-teal-500'
                  }`}
                />
              </div>
              {validationErrors.password && (
                <p id="login-password-error" className="text-[11px] text-red-600 mt-1 font-semibold">{validationErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              aria-busy={loading}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Autenticando...' : 'Entrar no Sistema'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Opções de Cadastro */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Botão de Acesso por Convite de Clínica */}
              <button
                type="button"
                onClick={() => setIsRegisterUserOpen(true)}
                className="w-full py-2.5 px-3 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200/80 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <UserPlus className="w-3.5 h-3.5 text-teal-600" />
                <span>Entrar com Convite</span>
              </button>

              {/* Botão de Criação de Conta */}
              <button
                type="button"
                onClick={openRegistration}
                className="w-full py-2.5 px-3 bg-teal-50 hover:bg-teal-100/80 text-teal-800 font-bold text-xs rounded-xl border border-teal-200/70 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Building2 className="w-3.5 h-3.5 text-teal-600" />
                <span>Criar Minha Conta</span>
              </button>
            </div>
          </div>

          {/* Versão e LGPD */}
          <div className="pt-1 text-center space-y-0.5">
            <p className="text-[10px] text-slate-400 font-medium">
              Zemda • Ambiente Seguro • Criptografia TLS • LGPD Compliant
            </p>
          </div>
        </div>
        )}
      </div>

      </>}

      {/* Modais de Autenticação e Cadastro */}
      <RegisterUserModal
        isOpen={isRegisterUserOpen}
        onClose={() => setIsRegisterUserOpen(false)}
      />

      {isCreateClinicOpen && <CreateClinicModal
        presentation="page"
        isOpen={isCreateClinicOpen}
        onClose={() => {
          setIsCreateClinicOpen(false);
          setGoogleSignupData(null);
          const destination = window.history.state?.registrationFrom === '/login' ? '/login' : '/';
          window.history.pushState(null, '', destination);
          window.dispatchEvent(new PopStateEvent('popstate'));
          if (destination === '/') onBackToLanding?.();
        }}
        onSuccess={() => {
          setIsCreateClinicOpen(false);
          setGoogleSignupData(null);
          sessionStorage.setItem('activeView', 'dashboard');
          window.history.pushState({ view: 'dashboard' }, '', '/dashboard');
          window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'dashboard' } }));
        }}
        initialPlan={sanitizePlanCode(initialPlan)}
        isTrial={isTrial}
        initialGoogleData={googleSignupData}
        onGoogleSuccess={handleGoogleSuccess}
      />}

      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        onSuccess={(userEmail) => {
          setIsForgotPasswordOpen(false);
          if (userEmail) setEmail(userEmail);
        }}
      />

      {googleLinkingState && <GoogleAccountLinkDialog idToken={googleLinkingState.idToken} email={googleLinkingState.email} onClose={()=>setGoogleLinkingState(null)} />}

    </div>
  );
};

