import React, { useState, useRef, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  X,
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (email: string) => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { showToast } = useToast();

  const [step, setStep] = useState<'email' | 'otp' | 'new_password'>('email');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // OTP state
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Token recebido na validação do OTP
  const [emailVerificationToken, setEmailVerificationToken] = useState('');

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Cooldown timer
  useEffect(() => {
    if (step === 'otp' && cooldownSeconds > 0) {
      const timer = setInterval(() => {
        setCooldownSeconds(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [step, cooldownSeconds]);

  // Reset internal state when closing modal
  const handleModalClose = () => {
    setStep('email');
    setEmail('');
    setOtpDigits(['', '', '', '', '', '']);
    setCooldownSeconds(0);
    setEmailVerificationToken('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setLoading(false);
    setIsVerifying(false);
    setIsResending(false);
    setIsResetting(false);
    onClose();
  };

  if (!isOpen) return null;

  const maskEmail = (emailStr: string): string => {
    if (!emailStr || !emailStr.includes('@')) return emailStr;
    const [local, domain] = emailStr.split('@');
    if (local.length <= 2) {
      return `${local[0]}***@${domain}`;
    }
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  };

  // 1. Passo 1: Enviar código OTP para o e-mail
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      showToast('Por favor, informe um endereço de e-mail válido.', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await ApiClient.post<{ success: boolean; message?: string; cooldownSeconds?: number }>(
        '/v1/public/email/request-code',
        {
          email: cleanEmail,
          purpose: 'password_reset'
        }
      );

      setStep('otp');
      setOtpDigits(['', '', '', '', '', '']);
      setCooldownSeconds(res.cooldownSeconds || 60);
      showToast('Se houver uma conta cadastrada, o código de recuperação foi enviado.', 'info');
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
    } catch (err: any) {
      showToast(err.message || 'Erro ao solicitar código de recuperação.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Reenviar código OTP
  const handleResendOtp = async () => {
    if (cooldownSeconds > 0 || isResending) return;
    const cleanEmail = email.trim().toLowerCase();

    try {
      setIsResending(true);
      const res = await ApiClient.post<{ success: boolean; message?: string; cooldownSeconds?: number }>(
        '/v1/public/email/request-code',
        {
          email: cleanEmail,
          purpose: 'password_reset'
        }
      );
      setOtpDigits(['', '', '', '', '', '']);
      setCooldownSeconds(res.cooldownSeconds || 60);
      showToast('Novo código enviado com sucesso!', 'success');
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      showToast(err.message || 'Erro ao reenviar código.', 'error');
    } finally {
      setIsResending(false);
    }
  };

  // OTP inputs handling
  const handleOtpChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      const updated = [...otpDigits];
      updated[index] = '';
      setOtpDigits(updated);
      return;
    }

    const char = clean.slice(-1);
    const updated = [...otpDigits];
    updated[index] = char;
    setOtpDigits(updated);

    if (index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        otpInputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const updated = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      updated[i] = pasted[i] || '';
    }
    setOtpDigits(updated);

    const nextIndex = Math.min(pasted.length, 5);
    otpInputRefs.current[nextIndex]?.focus();
  };

  // 2. Passo 2: Validar código de 6 dígitos
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = otpDigits.join('').trim();

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      showToast('Digite o código completo de 6 dígitos numéricos.', 'error');
      return;
    }

    try {
      setIsVerifying(true);
      const res = await ApiClient.post<{ success: boolean; emailVerificationToken: string; message?: string }>(
        '/v1/public/email/verify-code',
        {
          email: email.trim().toLowerCase(),
          code,
          purpose: 'password_reset'
        }
      );

      if (!res.emailVerificationToken) {
        showToast('Código inválido ou token não recebido.', 'error');
        return;
      }

      setEmailVerificationToken(res.emailVerificationToken);
      setStep('new_password');
      showToast('Código confirmado com sucesso! Defina sua nova senha.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Código incorreto ou expirado. Tente novamente.', 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  // 3. Passo 3: Definir nova senha
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 6) {
      showToast('A nova senha deve ter no mínimo 6 caracteres.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('A confirmação de senha não coincide.', 'error');
      return;
    }

    if (!emailVerificationToken) {
      showToast('Sessão de verificação expirada. Solicite um novo código.', 'error');
      setStep('email');
      return;
    }

    try {
      setIsResetting(true);
      const res = await ApiClient.post<{ success: boolean; message: string }>(
        '/v1/public/auth/reset-password',
        {
          email: email.trim().toLowerCase(),
          emailVerificationToken,
          newPassword
        }
      );

      showToast(res.message || 'Senha alterada com sucesso. Faça login com sua nova senha.', 'success');
      onSuccess?.(email.trim().toLowerCase());
      handleModalClose();
    } catch (err: any) {
      showToast(err.message || 'Erro ao redefinir senha. Tente novamente.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl border border-teal-100">
              <KeyRound className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Recuperação de Senha</h2>
              <p className="text-xs text-slate-500">
                {step === 'email' && 'Passo 1 de 3: Identificação da conta'}
                {step === 'otp' && 'Passo 2 de 3: Código de verificação'}
                {step === 'new_password' && 'Passo 3 de 3: Nova senha de acesso'}
              </p>
            </div>
          </div>
          <button
            onClick={handleModalClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PASSO 1: E-MAIL */}
        {step === 'email' && (
          <form onSubmit={handleRequestOtp} className="space-y-4 pt-4 text-left">
            <div className="p-3.5 bg-teal-50/80 border border-teal-100 rounded-2xl text-xs text-teal-950 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Digite o e-mail cadastrado na sua conta Zemda. Se existir uma conta correspondente, enviaremos um código de 6 dígitos para verificação.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                E-mail da sua conta *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  autoFocus
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full pl-10 pr-4 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleModalClose}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando código...</span>
                  </>
                ) : (
                  <>
                    <span>Enviar código</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* PASSO 2: CÓDIGO OTP */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4 pt-4 text-left">
            <div className="p-3.5 bg-teal-50/80 border border-teal-100 rounded-2xl text-xs text-teal-950 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="leading-relaxed">
                  Enviamos um código de segurança de 6 dígitos para o e-mail:
                </p>
                <p className="font-bold text-teal-900 font-mono text-xs">
                  {maskEmail(email)}
                </p>
                <p className="text-[11px] text-teal-700">
                  Verifique também sua pasta de spam ou lixo eletrônico.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 text-center">
                Insira o código de 6 dígitos
              </label>
              <div className="flex items-center justify-center gap-2 sm:gap-2.5" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => { otpInputRefs.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(idx, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(idx, e)}
                    className="w-10 h-12 text-center text-lg font-bold font-mono border-2 border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden transition-all text-slate-800"
                  />
                ))}
              </div>
            </div>

            {/* Temporizador de Reenvio */}
            <div className="flex items-center justify-center gap-2 pt-1 text-xs">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={cooldownSeconds > 0 || isResending}
                className={`flex items-center gap-1.5 font-semibold transition-colors ${
                  cooldownSeconds > 0 || isResending
                    ? 'text-slate-400 cursor-not-allowed'
                    : 'text-teal-600 hover:text-teal-700 cursor-pointer hover:underline'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
                <span>
                  {cooldownSeconds > 0
                    ? `Reenviar código em ${cooldownSeconds}s`
                    : 'Reenviar código'}
                </span>
              </button>
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setOtpDigits(['', '', '', '', '', '']);
                }}
                className="px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Alterar e-mail</span>
              </button>

              <button
                type="submit"
                disabled={isVerifying || otpDigits.join('').length !== 6}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Validando código...</span>
                  </>
                ) : (
                  <>
                    <span>Continuar</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* PASSO 3: NOVA SENHA */}
        {step === 'new_password' && (
          <form onSubmit={handleResetPassword} className="space-y-4 pt-4 text-left">
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-100 rounded-2xl text-xs text-emerald-950 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Identidade confirmada! Digite e confirme sua nova senha de acesso abaixo (mínimo de 6 caracteres).
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nova senha *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-10 pr-10 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Confirmar nova senha *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full pl-10 pr-10 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-[11px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  As senhas digitadas não coincidem.
                </p>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleModalClose}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isResetting || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando senha...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Alterar senha</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
