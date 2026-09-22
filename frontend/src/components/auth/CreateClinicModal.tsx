import { trackCompletedRegistration } from '../../utils/registrationAnalytics';
import React, { useState, useRef, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  User,
  Mail,
  Phone,
  Lock,
  CheckCircle2,
  X,
  ShieldCheck,
  ExternalLink,
  ArrowLeft,
  RefreshCw,
  KeyRound,
  Sparkles,
  Briefcase
} from 'lucide-react';
import { REGISTRATION_PROFESSIONS } from '../../types/professions';

interface CreateClinicModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlan?: string;
  isTrial?: boolean;
}

export const CreateClinicModal: React.FC<CreateClinicModalProps> = ({ isOpen, onClose, initialPlan, isTrial }) => {
  const { showToast } = useToast();
  const { loginWithToken } = useAuth();
  const isSoloTrial = Boolean(isTrial || initialPlan === 'SOLO');

  const [step, setStep] = useState<'form' | 'verify_email'>('form');
  const [loading, setLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [successData, setSuccessData] = useState<{ clinicId: string; slug: string; message: string } | null>(null);
  const [marketingAccepted, setMarketingAccepted] = useState(false);

  const [formData, setFormData] = useState({
    responsibleName: '',
    email: '',
    phone: '',
    profession: '',
    customProfession: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
    privacyAccepted: false
  });

  const formatPhone = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 11);
    if (raw.length <= 2) return raw;
    if (raw.length <= 7) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
  };

  const maskEmail = (emailStr: string): string => {
    if (!emailStr || !emailStr.includes('@')) return emailStr;
    const [local, domain] = emailStr.split('@');
    if (local.length <= 2) {
      return `${local[0]}***@${domain}`;
    }
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  };

  const handleModalClose = () => {
    setStep('form');
    setOtpDigits(['', '', '', '', '', '']);
    setCooldownSeconds(0);
    setSuccessData(null);
    onClose();
  };

  useEffect(() => {
    if (step === 'verify_email' && cooldownSeconds > 0) {
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

  if (!isOpen) return null;

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

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.responsibleName.trim() || !formData.email.trim() || !formData.phone.trim() || !formData.password) {
      showToast('Preencha os campos obrigatórios marcados com *', 'error');
      return;
    }

    if (!formData.profession) {
      showToast('Selecione sua profissão para continuar', 'error');
      return;
    }

    if (formData.profession === 'other_health' && !formData.customProfession.trim()) {
      showToast('Por favor, especifique sua profissão da saúde', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      showToast('Informe um e-mail válido', 'error');
      return;
    }

    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      showToast('Informe um número de celular válido com DDD', 'error');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      showToast('As senhas digitadas não coincidem', 'error');
      return;
    }

    if (formData.password.length < 6) {
      showToast('A senha deve ter no mínimo 6 caracteres', 'error');
      return;
    }

    if (!formData.termsAccepted || !formData.privacyAccepted) {
      showToast('Você deve aceitar os Termos de Uso e a Política de Privacidade', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await ApiClient.post<{ success: boolean; message: string; cooldownSeconds?: number }>(
        '/v1/public/email/request-code',
        {
          email: formData.email.trim().toLowerCase(),
          purpose: 'clinic_registration'
        }
      );

      setStep('verify_email');
      setOtpDigits(['', '', '', '', '', '']);
      setCooldownSeconds(res.cooldownSeconds || 60);
      showToast('Código de 6 dígitos enviado para seu e-mail!', 'info');
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
    } catch (err: any) {
      showToast(err.message || 'Erro ao enviar código de verificação', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldownSeconds > 0 || isResending) return;
    try {
      setIsResending(true);
      const res = await ApiClient.post<{ success: boolean; message: string; cooldownSeconds?: number }>(
        '/v1/public/email/request-code',
        {
          email: formData.email.trim().toLowerCase(),
          purpose: 'clinic_registration'
        }
      );
      setOtpDigits(['', '', '', '', '', '']);
      setCooldownSeconds(res.cooldownSeconds || 60);
      showToast('Novo código enviado com sucesso!', 'success');
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      showToast(err.message || 'Erro ao reenviar código', 'error');
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyAndRegister = async () => {
    const code = otpDigits.join('').trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      showToast('Por favor, digite o código completo de 6 dígitos numéricos.', 'error');
      return;
    }

    try {
      setIsVerifying(true);

      // 1. Validar código de 6 dígitos
      const verifyRes = await ApiClient.post<{ success: boolean; emailVerificationToken: string; message: string }>(
        '/v1/public/email/verify-code',
        {
          email: formData.email.trim().toLowerCase(),
          code,
          purpose: 'clinic_registration'
        }
      );

      if (!verifyRes.emailVerificationToken) {
        throw new Error('Falha ao autenticar verificação de e-mail.');
      }

      // 2. Realizar cadastro definitivo da conta com nome padrão invisível
      const fallbackClinicName = formData.responsibleName.trim()
        ? `Consultório ${formData.responsibleName.trim()}`
        : 'Meu Consultório';

      const selectedOption = REGISTRATION_PROFESSIONS.find(p => p.id === formData.profession);
      const professionNameToSend = formData.profession === 'other_health' && formData.customProfession.trim()
        ? formData.customProfession.trim()
        : (selectedOption?.label || formData.profession);

      const data = await ApiClient.post<any>('/v1/public/tenants/register', {
        responsibleName: formData.responsibleName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        password: formData.password,
        profession: professionNameToSend,
        professionId: selectedOption?.id || undefined,
        professionName: professionNameToSend,
        registrationType: selectedOption?.boardLabel || undefined,
        clinicName: fallbackClinicName,
        tradeName: fallbackClinicName,
        termsAccepted: formData.termsAccepted,
        privacyAccepted: formData.privacyAccepted,
        marketingAccepted: marketingAccepted,
        emailVerificationToken: verifyRes.emailVerificationToken,
        startTrial: isSoloTrial,
        planCode: isSoloTrial ? 'SOLO' : (initialPlan || undefined)
      });

      if (data.token && data.user) {
        // The backend has committed account creation; never infer trial activation from the CTA.
        if (data.success !== false) {
          trackCompletedRegistration(data.user.id, data.isTrial === true ? 7 : undefined);
        }
        // Autenticação automática imediata através do token de sessão
        loginWithToken(data.token, data.user, data.tenant);
        if (isSoloTrial || data.trialStarted) {
          showToast('E-mail verificado! Seu teste grátis de 7 dias do Zemda Solo está ativo.', 'success');
          handleModalClose();
          window.history.pushState(null, '', '/');
          window.dispatchEvent(new PopStateEvent('popstate'));
          window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'dashboard' } }));
          return;
        }
        showToast('E-mail verificado e conta cadastrada com sucesso! Redirecionando para escolha do plano...', 'success');
        handleModalClose();
        window.history.pushState(null, '', '/assinatura');
        window.dispatchEvent(new PopStateEvent('popstate'));
        window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'subscription' } }));
        return;
      }

      // Fallback
      setSuccessData(data);
      showToast('Cadastro realizado com sucesso! Faça login para continuar.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Código incorreto ou erro ao validar e-mail.', 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100 my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-teal-900 p-6 text-white flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[11px] font-bold tracking-wider uppercase mb-1">
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              {step === 'verify_email' ? 'Etapa 2: Validação de Segurança' : 'Começar no Zemda'}
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">
              {step === 'verify_email' ? 'Confirmar E-mail de Acesso' : 'Criar Minha Conta'}
            </h2>
            <p className="text-xs text-teal-200/90">
              {step === 'verify_email'
                ? 'Insira o código de 6 dígitos enviado para validar seu e-mail.'
                : 'Cadastre-se rapidamente para ter acesso à plataforma Zemda.'}
            </p>
          </div>
          <button
            onClick={handleModalClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 max-h-[75vh] overflow-y-auto">
          {successData ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-800">
                Conta criada com sucesso!
              </h3>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left text-xs text-amber-900 space-y-2">
                <p className="font-bold flex items-center gap-1.5 text-amber-800">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  Próximo passo: escolher o plano
                </p>
                <p>
                  Entre com o e-mail e a senha cadastrados para escolher o plano e concluir o pagamento no checkout seguro do Asaas.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200 text-left space-y-1">
                <p><strong>Responsável:</strong> {formData.responsibleName}</p>
                <p><strong>E-mail de Acesso:</strong> {formData.email}</p>
              </div>

              <button
                onClick={() => window.location.assign('/assinatura')}
                className="px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-700/20 cursor-pointer transition-all"
              >
                Entrar e escolher o plano
              </button>
            </div>
          ) : step === 'verify_email' ? (
            <div className="py-2 space-y-6">
              {/* Stepper info */}
              <div className="flex items-center justify-between p-3.5 bg-teal-50/80 border border-teal-100 rounded-2xl">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-extrabold text-xs shadow-xs">
                    2/2
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Confirmação de Titularidade</h4>
                    <p className="text-[11px] text-slate-500">Validação obrigatória de segurança por e-mail</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900 bg-white border border-teal-200/80 hover:border-teal-300 px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-2xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Editar dados
                </button>
              </div>

              {/* Center visual card */}
              <div className="text-center space-y-3 py-2">
                <div className="w-14 h-14 bg-gradient-to-tr from-teal-500 to-emerald-400 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-teal-500/20">
                  <KeyRound className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Código de Verificação
                </h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                  Digite o código de 6 dígitos que enviamos para o e-mail:
                </p>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs">
                  <Mail className="w-3.5 h-3.5 text-teal-600" />
                  <span>{maskEmail(formData.email)}</span>
                  <button
                    type="button"
                    onClick={() => setStep('form')}
                    className="text-[11px] text-teal-600 hover:text-teal-800 underline font-semibold ml-1 cursor-pointer"
                  >
                    (Alterar)
                  </button>
                </div>
              </div>

              {/* 6-Digit Segmented Inputs */}
              <div className="space-y-3">
                <div className="flex justify-center items-center gap-2 sm:gap-3">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={el => { otpInputRefs.current[idx] = el; }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(idx, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(idx, e)}
                      onPaste={handleOtpPaste}
                      className={`w-11 h-14 sm:w-13 sm:h-16 text-center text-2xl font-extrabold rounded-2xl border-2 transition-all outline-none ${
                        digit
                          ? 'border-teal-500 bg-teal-50/40 text-teal-950 ring-2 ring-teal-500/20 shadow-xs'
                          : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10'
                      }`}
                      autoFocus={idx === 0}
                    />
                  ))}
                </div>

                <div className="text-center space-y-1">
                  <p className="text-[11px] text-slate-500">
                    O código é válido por <strong>10 minutos</strong>. Caso não o localize, verifique também sua caixa de spam ou lixo eletrônico.
                  </p>
                </div>
              </div>

              {/* Resend button / cooldown */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Não recebeu o código?</span>
                {cooldownSeconds > 0 ? (
                  <span className="font-semibold text-slate-400 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
                    Reenviar em {cooldownSeconds}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isResending}
                    className="font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
                    {isResending ? 'Enviando...' : 'Reenviar código'}
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Voltar
                </button>

                <button
                  type="button"
                  onClick={handleVerifyAndRegister}
                  disabled={isVerifying || otpDigits.join('').length !== 6}
                  className="px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-700/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isVerifying ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Validando e criando conta...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar e Começar
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              {/* Informação sobre plano e acesso */}
              {isSoloTrial ? (
                <div className="p-3.5 bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-50 border border-teal-200 rounded-2xl text-xs text-teal-950 flex items-start gap-3 shadow-xs">
                  <Sparkles className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold text-teal-900 block text-sm">
                      Teste Grátis de 7 Dias — Zemda Solo
                    </span>
                    <p className="text-teal-800/90 mt-0.5 leading-relaxed text-[11px]">
                      Acesso imediato a todas as funcionalidades: agenda, prontuário, documentos, financeiro, IA e ZemdaBody. Sem cobrança hoje.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-teal-50/80 border border-teal-100 rounded-2xl text-xs text-teal-950 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    Crie sua conta para começar. Dados fiscais e profissionais podem ser preenchidos tranquilamente mais tarde nas configurações.
                  </p>
                </div>
              )}

              {/* Formulário Simplificado */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nome Completo *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="Ex: Mariana Albuquerque"
                      value={formData.responsibleName}
                      onChange={e => setFormData({ ...formData, responsibleName: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Celular / WhatsApp *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="(11) 98765-4321"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    E-mail de Acesso *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      placeholder="mariana@exemplo.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Profissão *
                  </label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <select
                      required
                      value={formData.profession}
                      onChange={e => setFormData({ ...formData, profession: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 font-medium text-slate-800 truncate"
                    >
                      <option value="">Selecione sua profissão...</option>
                      {REGISTRATION_PROFESSIONS.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.displayOption || `${p.label} — ${p.modules.join(' + ')}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bloco informativo dinâmico dos módulos da área selecionada */}
                  {REGISTRATION_PROFESSIONS.find(p => p.id === formData.profession) && (
                    <div className="mt-2 p-2.5 rounded-xl bg-teal-50/70 border border-teal-200/80 text-xs text-teal-950 animate-in fade-in duration-200">
                      <div className="flex items-center gap-1.5 font-bold text-teal-900 mb-1">
                        <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span>Módulos da sua área:</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {REGISTRATION_PROFESSIONS.find(p => p.id === formData.profession)?.modules.map((m, idx) => (
                          <React.Fragment key={m}>
                            {idx > 0 && <span className="text-teal-400 font-bold">•</span>}
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-teal-200/90 text-teal-950 font-semibold shadow-2xs">
                              {m}
                            </span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}

                  {formData.profession === 'other_health' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        required
                        placeholder="Especifique sua profissão da saúde *"
                        value={formData.customProfession}
                        onChange={e => setFormData({ ...formData, customProfession: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Senha *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        required
                        placeholder="Mínimo 6 caracteres"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Confirmar Senha *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        required
                        placeholder="Repita a senha"
                        value={formData.confirmPassword}
                        onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Aceite Legal Obrigatório (Termos e LGPD) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <label className="flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={formData.termsAccepted}
                    onChange={e => setFormData({ ...formData, termsAccepted: e.target.checked })}
                    className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    Li e aceito os{' '}
                    <a
                      href="/termos-de-uso"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-teal-600 underline hover:text-teal-700 inline-flex items-center gap-0.5"
                    >
                      Termos de Uso
                      <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    *
                  </span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={formData.privacyAccepted}
                    onChange={e => setFormData({ ...formData, privacyAccepted: e.target.checked })}
                    className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    Li e estou ciente da{' '}
                    <a
                      href="/privacidade"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-teal-600 underline hover:text-teal-700 inline-flex items-center gap-0.5"
                    >
                      Política de Privacidade e Proteção de Dados
                      <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    *
                  </span>
                </label>

                <div className="pt-2 border-t border-slate-200">
                  <label className="flex items-start gap-2.5 text-[11px] text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marketingAccepted}
                      onChange={e => setMarketingAccepted(e.target.checked)}
                      className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>
                      (Opcional) Desejo receber comunicações sobre novidades e recursos da plataforma Zemda.
                    </span>
                  </label>
                </div>
              </div>

              {/* Botões */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-700/20 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Enviando código...
                    </>
                  ) : (
                    <>
                      <span>Continuar para Validação de E-mail</span>
                      <ShieldCheck className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
