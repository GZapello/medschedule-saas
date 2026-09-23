import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { trackLoginStarted } from '../../utils/registrationAnalytics';
import { CreateClinicModal } from './CreateClinicModal';
import { RegisterUserModal } from './RegisterUserModal';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import {
  Lock,
  Mail,
  ArrowRight,
  Building2,
  UserPlus,
  AlertCircle,
  Clock,
  XCircle,
  Monitor,
  CheckCircle2,
  RefreshCw,
  X,
  ArrowLeft,
  Sparkles
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
  const { login } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isCreateClinicOpen, setIsCreateClinicOpen] = useState<boolean>(initialAction === 'create-clinic');
  const [isRegisterUserOpen, setIsRegisterUserOpen] = useState<boolean>(initialAction === 'register-user');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<{ message: string; code?: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string }>({});

  const hasTrackedLoginStarted = useRef<boolean>(false);
  const notifyLoginStarted = () => {
    if (!hasTrackedLoginStarted.current) {
      hasTrackedLoginStarted.current = true;
      trackLoginStarted({ method: 'email' });
    }
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
      setLoginError({ message: err.message, code: err.code });
      showToast(err.message || 'Falha na autenticação', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-800 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Glow sutil de fundo característico do Zemda */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-teal-100/60 via-emerald-50/30 to-transparent blur-3xl -z-10 pointer-events-none" />

      <div className="w-full max-w-md space-y-6">
        {/* Botão de Retorno ao Portal Zemda */}
        {onBackToLanding && (
          <div className="flex justify-start">
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
        <div className="text-center space-y-2 select-none">
          <div className="flex items-center justify-center gap-3 mb-1">
            <img
              src="/brand/zemda-icon.png"
              alt="Zemda"
              className="w-12 h-12 object-contain drop-shadow-sm"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-3xl font-black text-slate-950 tracking-tight">Zemda</span>
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
            </div>
          </div>
          <p className="text-xs text-teal-700 font-bold uppercase tracking-widest">
            Saúde e Gestão em Harmonia
          </p>
        </div>

        {/* Login Box */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-teal-900/5 border border-slate-200/80 space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-black text-slate-900">Acessar Plataforma</h2>
            <p className="text-xs text-slate-500">
              Digite seu e-mail e senha cadastrados para entrar na sua clínica.
            </p>
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
              <label className="block text-xs font-bold text-slate-700 mb-1">E-mail de Acesso</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
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
                <p className="text-[11px] text-red-600 mt-1 font-semibold">{validationErrors.email}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">Senha</label>
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
                <p className="text-[11px] text-red-600 mt-1 font-semibold">{validationErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
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
                onClick={() => setIsCreateClinicOpen(true)}
                className="w-full py-2.5 px-3 bg-teal-50 hover:bg-teal-100/80 text-teal-800 font-bold text-xs rounded-xl border border-teal-200/70 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Building2 className="w-3.5 h-3.5 text-teal-600" />
                <span>Criar Minha Conta</span>
              </button>
            </div>
          </div>

          {/* Download Versão Desktop Windows */}
          <div className="pt-2 border-t border-slate-100">
            <a
              href={`${ApiClient.getBaseUrl()}/v1/public/download-windows`}
              download="Zemda Setup 1.1.2.exe"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold text-slate-700 hover:text-teal-700 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 transition-all shadow-2xs text-center"
              title="Baixar instalador oficial do Zemda para Windows (64-bit)"
            >
              <Monitor className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Zemda Desktop para Windows (.exe)</span>
            </a>
          </div>

          {/* Versão e LGPD */}
          <div className="pt-1 text-center space-y-0.5">
            <p className="text-[10px] text-slate-400 font-medium">
              Zemda v1.1.2 • Ambiente Seguro • Criptografia TLS • LGPD Compliant
            </p>
          </div>
        </div>
      </div>

      {/* Modais de Autenticação e Cadastro */}
      <RegisterUserModal
        isOpen={isRegisterUserOpen}
        onClose={() => setIsRegisterUserOpen(false)}
      />

      <CreateClinicModal
        isOpen={isCreateClinicOpen}
        onClose={() => setIsCreateClinicOpen(false)}
        initialPlan={initialPlan}
        isTrial={isTrial}
      />

      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        onSuccess={(userEmail) => {
          setIsForgotPasswordOpen(false);
          if (userEmail) setEmail(userEmail);
        }}
      />
    </div>
  );
};
