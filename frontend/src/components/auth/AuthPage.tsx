import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { CreateClinicModal } from './CreateClinicModal';
import { RegisterUserModal } from './RegisterUserModal';
import {
  Lock,
  Mail,
  ArrowRight,
  Building2,
  UserPlus,
  Globe,
  AlertCircle,
  Clock,
  XCircle,
  Monitor,
  Smartphone,
  Server,
  CheckCircle2,
  RefreshCw,
  X,
  ArrowLeft
} from 'lucide-react';

interface AuthPageProps {
  onOpenPublicBooking?: () => void;
  onBackToLanding?: () => void;
  initialAction?: 'login' | 'create-clinic' | 'register-user';
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onOpenPublicBooking,
  onBackToLanding,
  initialAction
}) => {
  const { login } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isCreateClinicOpen, setIsCreateClinicOpen] = useState<boolean>(initialAction === 'create-clinic');
  const [isRegisterUserOpen, setIsRegisterUserOpen] = useState<boolean>(initialAction === 'register-user');
  const [loginError, setLoginError] = useState<{ message: string; code?: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string }>({});

  // Configuração personalizada de Servidor (útil para dispositivos móveis ou rede local)
  const [isServerConfigOpen, setIsServerConfigOpen] = useState<boolean>(false);
  const [serverUrlInput, setServerUrlInput] = useState<string>(ApiClient.getBaseUrl());
  const [isTestingServer, setIsTestingServer] = useState<boolean>(false);
  const [testServerFeedback, setTestServerFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const testConnection = async (targetUrl: string) => {
    setIsTestingServer(true);
    setTestServerFeedback(null);
    try {
      const cleanUrl = targetUrl.trim().replace(/\/+$/, '');
      const healthUrl = cleanUrl.endsWith('/api') ? cleanUrl.replace(/\/api$/, '/health') : `${cleanUrl}/health`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(healthUrl, { method: 'GET', signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        setTestServerFeedback({ success: true, message: 'Conexão estabelecida com sucesso com o servidor Zemda!' });
      } else {
        setTestServerFeedback({ success: false, message: `Servidor alcançado, mas retornou status ${res.status}.` });
      }
    } catch {
      setTestServerFeedback({
        success: false,
        message: 'Não foi possível alcançar o servidor. Verifique o IP, porta (4000) e se o firewall permite conexões.'
      });
    } finally {
      setIsTestingServer(false);
    }
  };

  const handleSaveServerConfig = () => {
    if (serverUrlInput.trim()) {
      ApiClient.setCustomBaseUrl(serverUrlInput.trim());
      showToast('Configuração de servidor salva!', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  const handleResetServerConfig = () => {
    ApiClient.setCustomBaseUrl(null);
    setServerUrlInput(ApiClient.getBaseUrl());
    showToast('Configuração de servidor restaurada para o padrão', 'info');
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Botão de Retorno ao Portal Zemda */}
        {onBackToLanding && (
          <div className="flex justify-start">
            <button
              onClick={onBackToLanding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700/60 transition-all cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-teal-400" />
              <span>Voltar para o portal Zemda</span>
            </button>
          </div>
        )}

        {/* Brand Header Institucional Zemda */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3 mb-1">
            <img
              src="/brand/zemda-icon.png"
              alt="Zemda"
              className="w-12 h-12 object-contain drop-shadow-lg"
            />
            <span className="text-3xl font-black text-white tracking-tight">Zemda</span>
          </div>
          <p className="text-xs text-teal-200/90 max-w-xs mx-auto font-medium">
            Tecnologia que organiza o cuidado em saúde
          </p>
        </div>

        {/* Login Box */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-5">
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

          <form onSubmit={handleSubmit} className="space-y-4">
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
                  className={`w-full pl-10 pr-4 py-2.5 text-xs font-medium border rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 ${
                    validationErrors.email
                      ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
                      : 'border-slate-200 focus:ring-indigo-500'
                  }`}
                />
              </div>
              {validationErrors.email && (
                <p className="text-[11px] text-red-600 mt-1 font-semibold">{validationErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Senha</label>
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
                  className={`w-full pl-10 pr-4 py-2.5 text-xs font-medium border rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 ${
                    validationErrors.password
                      ? 'border-red-400 focus:ring-red-500 bg-red-50/20'
                      : 'border-slate-200 focus:ring-indigo-500'
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
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Autenticando...' : 'Entrar no Sistema'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Opções de Cadastro */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Botão de Solicitação de Acesso a Clínica */}
              <button
                type="button"
                onClick={() => setIsRegisterUserOpen(true)}
                className="w-full py-2.5 px-3 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                <span>Solicitar Acesso</span>
              </button>

              {/* Botão de Criação de Nova Clínica */}
              <button
                type="button"
                onClick={() => setIsCreateClinicOpen(true)}
                className="w-full py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs rounded-xl border border-indigo-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Criar Nova Clínica</span>
              </button>
            </div>
          </div>

          {/* Downloads das Versões Nativas (Windows .exe e Android .apk) */}
          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <a
              href={`${ApiClient.getBaseUrl()}/v1/public/download-windows`}
              download="Zemda Setup 1.1.2.exe"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all shadow-2xs text-center"
              title="Baixar instalador do Zemda para Windows 10/11 (64-bit)"
            >
              <Monitor className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="truncate">Zemda Windows (.exe)</span>
            </a>

            <a
              href={`${ApiClient.getBaseUrl()}/v1/public/download-android`}
              download="Zemda.apk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all shadow-2xs text-center"
              title="Baixar aplicativo do Zemda para celulares e tablets Android (.apk)"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">Zemda Android (.apk)</span>
            </a>
          </div>

          {/* Configuração de Servidor de Rede / IP */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-center">
            <button
              type="button"
              onClick={() => {
                setServerUrlInput(ApiClient.getBaseUrl());
                setTestServerFeedback(null);
                setIsServerConfigOpen(true);
              }}
              className="text-[11px] font-semibold text-slate-500 hover:text-teal-400 flex items-center gap-1.5 transition-colors cursor-pointer py-1"
              title="Configurar IP ou endereço do servidor Zemda"
            >
              <Server className="w-3.5 h-3.5 text-teal-500" />
              <span>Servidor: <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{ApiClient.getBaseUrl()}</span></span>
            </button>
          </div>

          {/* Versão e LGPD */}
          <div className="pt-1 text-center space-y-0.5">
            <p className="text-[10px] text-slate-400 font-medium">
              Zemda v1.1.2 • Ambiente Seguro • Criptografia TLS • LGPD Compliant
            </p>
          </div>
        </div>

      </div>

      {/* Modais de Cadastro */}
      <RegisterUserModal
        isOpen={isRegisterUserOpen}
        onClose={() => setIsRegisterUserOpen(false)}
      />

      <CreateClinicModal
        isOpen={isCreateClinicOpen}
        onClose={() => setIsCreateClinicOpen(false)}
      />

      {/* Modal de Configuração de Servidor Zemda (Ideal para rede local / APK Android) */}
      {isServerConfigOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Configuração do Servidor Zemda</h3>
                  <p className="text-[11px] text-slate-500">Defina o endereço da API para conectar este aplicativo</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsServerConfigOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-2xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Endereço da API do Servidor
                </label>
                <input
                  type="text"
                  value={serverUrlInput}
                  onChange={(e) => setServerUrlInput(e.target.value)}
                  placeholder="http://192.168.0.100:4000/api"
                  className="w-full text-xs font-mono border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-slate-50"
                />
              </div>

              {/* Atalhos Rápidos de Conexão */}
              <div>
                <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Atalhos rápidos para conexão:</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setServerUrlInput('https://medschedule-saas-production.up.railway.app/api');
                      testConnection('https://medschedule-saas-production.up.railway.app/api');
                    }}
                    className="text-[11px] py-1 px-2.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors font-mono cursor-pointer"
                  >
                    ☁️ Nuvem Railway (Oficial)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setServerUrlInput('http://192.168.0.100:4000/api');
                      testConnection('http://192.168.0.100:4000/api');
                    }}
                    className="text-[11px] py-1 px-2.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors font-mono cursor-pointer"
                  >
                    192.168.0.100:4000 (Wi-Fi Local)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setServerUrlInput('http://localhost:4000/api');
                      testConnection('http://localhost:4000/api');
                    }}
                    className="text-[11px] py-1 px-2.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors font-mono cursor-pointer"
                  >
                    localhost:4000
                  </button>
                </div>
              </div>

              {/* Resultado do Teste de Conexão */}
              {testServerFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
                    testServerFeedback.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {testServerFeedback.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <p className="text-[11px] leading-relaxed">{testServerFeedback.message}</p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => testConnection(serverUrlInput)}
                  disabled={isTestingServer || !serverUrlInput.trim()}
                  className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTestingServer ? 'animate-spin' : ''}`} />
                  <span>{isTestingServer ? 'Testando...' : 'Testar Conexão'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveServerConfig}
                  disabled={!serverUrlInput.trim()}
                  className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  Salvar e Conectar
                </button>
              </div>

              <div className="pt-2 text-center border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleResetServerConfig}
                  className="text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer underline"
                >
                  Restaurar endereço padrão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
