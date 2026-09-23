import React, { useState, useRef, useEffect } from 'react';
import { RegistrationPlans, RegistrationPlan } from './RegistrationPlans';
import { RegistrationProfessionSelect } from './RegistrationProfessionSelect';
import {
  trackCompletedRegistration,
  trackSignupOpen,
  trackSignupStarted,
  trackSignupEmailValidation,
  trackSignupEmailVerified,
  trackSignupPlanSelected,
  trackSignupSubmit,
  trackSignupError
} from '../../utils/registrationAnalytics';
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
  ArrowRight,
  RefreshCw,
  KeyRound,
  Sparkles,
  Briefcase,
  Eye,
  EyeOff,
  Check
} from 'lucide-react';
import { REGISTRATION_PROFESSIONS, RegistrationProfessionOption } from '../../types/professions';
import { PracticeArea } from '../../types/capabilities';

interface CreateClinicModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlan?: string;
  isTrial?: boolean;
}

type RegistrationStep = 'initial_data' | 'profession' | 'security' | 'verify_email' | 'plans';

export const CreateClinicModal: React.FC<CreateClinicModalProps> = ({
  isOpen,
  onClose,
  initialPlan,
  isTrial
}) => {
  const { showToast } = useToast();
  const { loginWithToken } = useAuth();

  // 1. Estado da Etapa Atual
  const [step, setStep] = useState<RegistrationStep>('initial_data');
  const [selectedPlanCode, setSelectedPlanCode] = useState(initialPlan || (isTrial ? 'SOLO' : ''));
  const [plans, setPlans] = useState<RegistrationPlan[]>([]);
  const [planError, setPlanError] = useState('');
  const [verification, setVerification] = useState<{ email: string; token: string } | null>(null);

  // Senha visibilidade
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Flags e Bloqueios
  const registrationBusy = useRef(false);
  const accountCreated = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Telemetria GA4 - Refs de Desduplicação
  const hasTrackedOpen = useRef(false);
  const hasTrackedStarted = useRef(false);
  const lastSelectedPlanCode = useRef<string | null>(null);

  // Estados de formulário
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
  const [marketingAccepted, setMarketingAccepted] = useState(false);

  // OTP e Validações
  const [loading, setLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [successData, setSuccessData] = useState<{ clinicId: string; slug: string; message: string } | null>(null);

  // Catálogo de Profissões Dinâmico
  const [professionOptions, setProfessionOptions] = useState<RegistrationProfessionOption[]>(() => REGISTRATION_PROFESSIONS || []);
  const [loadingProfessions, setLoadingProfessions] = useState(false);

  // Áreas de Atuação e Abordagens Clínicas
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [selectedPracticeAreaIds, setSelectedPracticeAreaIds] = useState<string[]>([]);
  const [loadingPracticeAreas, setLoadingPracticeAreas] = useState(false);

  // Carregar planos
  const loadPlans = () => {
    setPlanError('');
    ApiClient.get<RegistrationPlan[]>('/v1/plans')
      .then(setPlans)
      .catch(() => setPlanError('Não foi possível carregar os planos. Tente novamente.'));
  };

  useEffect(() => {
    if (isOpen) {
      loadPlans();
    }
  }, [isOpen]);

  // Carregar profissões dinâmicas
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoadingProfessions(true);
    ApiClient.get<RegistrationProfessionOption[]>('/v1/taxonomy/professions')
      .then(data => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setProfessionOptions(data);
        }
      })
      .catch(() => {
        // Fallback permanece com REGISTRATION_PROFESSIONS
      })
      .finally(() => {
        if (isMounted) setLoadingProfessions(false);
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Carregar áreas de atuação para a profissão selecionada
  useEffect(() => {
    if (!formData.profession) {
      setPracticeAreas([]);
      setSelectedPracticeAreaIds([]);
      return;
    }
    let isMounted = true;
    setLoadingPracticeAreas(true);
    ApiClient.get<PracticeArea[]>(`/v1/capabilities/practice-areas?professionId=${encodeURIComponent(formData.profession)}`)
      .then(data => {
        if (isMounted && Array.isArray(data)) {
          setPracticeAreas(data);
          // Pré-seleciona a área especializada padrão se for especialista médico
          if (formData.profession === 'prof-pediatra') setSelectedPracticeAreaIds(['pa-med-pediatria']);
          else if (formData.profession === 'prof-cardiologista') setSelectedPracticeAreaIds(['pa-med-cardio']);
          else if (formData.profession === 'prof-dermatologista') setSelectedPracticeAreaIds(['pa-med-dermato']);
          else if (formData.profession === 'prof-psiquiatra') setSelectedPracticeAreaIds(['pa-med-psiquiatria']);
          else if (formData.profession === 'prof-medico') setSelectedPracticeAreaIds(['pa-med-clinica']);
          else setSelectedPracticeAreaIds([]);
        }
      })
      .catch(() => {
        if (isMounted) setPracticeAreas([]);
      })
      .finally(() => {
        if (isMounted) setLoadingPracticeAreas(false);
      });

    return () => {
      isMounted = false;
    };
  }, [formData.profession]);

  // Scroll to top ao trocar de etapa
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [step, isOpen]);

  // Telemetria signup_open
  useEffect(() => {
    if (isOpen) {
      if (!hasTrackedOpen.current) {
        hasTrackedOpen.current = true;
        trackSignupOpen({
          planCode: selectedPlanCode || initialPlan,
          professionCode: formData.profession || undefined
        });
      }
    } else {
      hasTrackedOpen.current = false;
      hasTrackedStarted.current = false;
      lastSelectedPlanCode.current = null;
    }
  }, [isOpen, selectedPlanCode, initialPlan, formData.profession]);

  // Telemetria signup_started (apenas 1x no início do preenchimento)
  const notifySignupStarted = () => {
    if (!hasTrackedStarted.current) {
      hasTrackedStarted.current = true;
      trackSignupStarted({
        planCode: selectedPlanCode || initialPlan,
        professionCode: formData.profession || undefined
      });
    }
  };

  // Cooldown de reenvio de OTP
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

  // Formatador de Celular / WhatsApp
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
    if (registrationBusy.current || isVerifying || loading) return;
    onClose();
  };

  // ==========================================
  // NAVEGAÇÃO E VALIDAÇÕES DAS 4 ETAPAS
  // ==========================================

  // Avançar da Etapa 1 (Dados Iniciais) para Etapa 2 (Profissão)
  const handleProceedFromInitialData = (e: React.FormEvent) => {
    e.preventDefault();
    notifySignupStarted();

    if (!formData.responsibleName.trim()) {
      trackSignupError({
        step: 'initial_data',
        errorCode: 'NAME_MISSING',
        errorType: 'validation',
        planCode: selectedPlanCode || initialPlan
      });
      showToast('Por favor, informe seu nome completo.', 'error');
      return;
    }

    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      trackSignupError({
        step: 'initial_data',
        errorCode: 'INVALID_PHONE_FORMAT',
        errorType: 'validation',
        planCode: selectedPlanCode || initialPlan
      });
      showToast('Informe um número de WhatsApp ou celular válido com DDD.', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      trackSignupError({
        step: 'initial_data',
        errorCode: 'INVALID_EMAIL_FORMAT',
        errorType: 'validation',
        planCode: selectedPlanCode || initialPlan
      });
      showToast('Informe um endereço de e-mail válido.', 'error');
      return;
    }

    // Avança para etapa 2
    setStep('profession');
  };

  // Avançar da Etapa 2 (Profissão) para Etapa 3 (Segurança)
  const handleProceedFromProfession = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.profession) {
      trackSignupError({
        step: 'profession',
        errorCode: 'PROFESSION_MISSING',
        errorType: 'validation',
        planCode: selectedPlanCode || initialPlan
      });
      showToast('Selecione sua profissão para continuar.', 'error');
      return;
    }

    if (formData.profession === 'prof-outro-saude' && !formData.customProfession.trim()) {
      trackSignupError({
        step: 'profession',
        errorCode: 'CUSTOM_PROFESSION_MISSING',
        errorType: 'validation',
        planCode: selectedPlanCode || initialPlan,
        professionCode: 'prof-outro-saude'
      });
      showToast('Por favor, especifique sua profissão da saúde.', 'error');
      return;
    }

    setStep('security');
  };

  // Avançar da Etapa 3 (Segurança) para Validação de E-mail / Etapa 4
  const handleProceedFromSecurity = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.password || formData.password.length < 6) {
      trackSignupError({
        step: 'security',
        errorCode: 'PASSWORD_TOO_SHORT',
        errorType: 'validation',
        planCode: selectedPlanCode || initialPlan,
        professionCode: formData.profession || undefined
      });
      showToast('A senha deve ter no mínimo 6 caracteres.', 'error');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      trackSignupError({
        step: 'security',
        errorCode: 'PASSWORD_MISMATCH',
        errorType: 'validation',
        planCode: selectedPlanCode || initialPlan,
        professionCode: formData.profession || undefined
      });
      showToast('As senhas digitadas não coincidem.', 'error');
      return;
    }

    if (!formData.termsAccepted || !formData.privacyAccepted) {
      trackSignupError({
        step: 'security',
        errorCode: 'TERMS_NOT_ACCEPTED',
        errorType: 'validation',
        planCode: selectedPlanCode || initialPlan,
        professionCode: formData.profession || undefined
      });
      showToast('Você deve aceitar os Termos de Uso e a Política de Privacidade.', 'error');
      return;
    }

    // Se o e-mail já foi verificado para este endereço exato, segue direto para planos
    if (verification?.email === formData.email.trim().toLowerCase()) {
      setStep('plans');
      return;
    }

    // Solicita código OTP por e-mail antes do passo 4
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
      trackSignupEmailValidation({
        planCode: selectedPlanCode || initialPlan,
        professionCode: formData.profession || undefined
      });
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
    } catch (err: any) {
      trackSignupError({
        step: 'security',
        errorCode: err.code || 'REQUEST_CODE_FAILED',
        errorType: err.code ? 'api_error' : 'network_error',
        planCode: selectedPlanCode || initialPlan,
        professionCode: formData.profession || undefined
      });
      showToast(err.message || 'Erro ao enviar código de verificação.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Reenviar código OTP
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
      showToast(err.message || 'Erro ao reenviar código.', 'error');
    } finally {
      setIsResending(false);
    }
  };

  // Validar código OTP e avançar para Etapa 4 (Planos)
  const handleVerifyOtpAndAdvance = async () => {
    const code = otpDigits.join('').trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      trackSignupError({
        step: 'verify_email',
        errorCode: 'INVALID_OTP_FORMAT',
        errorType: 'validation',
        planCode: selectedPlanCode || initialPlan,
        professionCode: formData.profession || undefined
      });
      showToast('Por favor, digite o código completo de 6 dígitos numéricos.', 'error');
      return;
    }

    try {
      setIsVerifying(true);
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

      setVerification({ email: formData.email.trim().toLowerCase(), token: verifyRes.emailVerificationToken });
      trackSignupEmailVerified({
        planCode: selectedPlanCode || initialPlan,
        professionCode: formData.profession || undefined
      });
      setStep('plans');
    } catch (err: any) {
      trackSignupError({
        step: 'verify_email',
        errorCode: err.code || 'OTP_VERIFICATION_FAILED',
        errorType: err.code ? 'api_error' : 'network_error',
        planCode: selectedPlanCode || initialPlan,
        professionCode: formData.profession || undefined
      });
      showToast(err.message || 'Código incorreto ou expirado.', 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  // Controles de input do OTP
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

  // Seleção e Registro na Etapa 4
  const handleSelectPlan = (plan: RegistrationPlan) => {
    setSelectedPlanCode(plan.code);
    if (lastSelectedPlanCode.current !== plan.code) {
      lastSelectedPlanCode.current = plan.code;
      trackSignupPlanSelected(plan.code, {
        professionCode: formData.profession || undefined
      });
    }
  };

  const handleRegister = async (plan: RegistrationPlan) => {
    if (registrationBusy.current || accountCreated.current) return;
    if (!verification || verification.email !== formData.email.trim().toLowerCase()) {
      setStep('security');
      return;
    }

    handleSelectPlan(plan);
    trackSignupSubmit({
      planCode: plan.code,
      professionCode: formData.profession || undefined
    });

    registrationBusy.current = true;
    setLoading(true);
    setSelectedPlanCode(plan.code);

    try {
      const fallbackClinicName = formData.responsibleName.trim()
        ? `Consultório ${formData.responsibleName.trim()}`
        : 'Meu Consultório';

      const currentProfessionOptions = professionOptions.length > 0 ? professionOptions : REGISTRATION_PROFESSIONS;
      const selectedOption = currentProfessionOptions.find(p => p.id === formData.profession);
      const professionNameToSend =
        formData.profession === 'prof-outro-saude' && formData.customProfession.trim()
          ? formData.customProfession.trim()
          : (selectedOption?.canonicalName || selectedOption?.label || (selectedOption as any)?.name || formData.profession);

      const selectedAreaNames = practiceAreas
        .filter(pa => selectedPracticeAreaIds.includes(pa.id))
        .map(pa => pa.name);

      const data = await ApiClient.post<any>('/v1/public/tenants/register', {
        responsibleName: formData.responsibleName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        password: formData.password,
        profession: professionNameToSend,
        professionId: selectedOption?.id || undefined,
        professionName: professionNameToSend,
        registrationType: selectedOption?.boardLabel || undefined,
        practiceAreaIds: selectedPracticeAreaIds,
        practiceAreas: selectedAreaNames.length > 0 ? selectedAreaNames.join(', ') : undefined,
        clinicName: fallbackClinicName,
        tradeName: fallbackClinicName,
        termsAccepted: formData.termsAccepted,
        privacyAccepted: formData.privacyAccepted,
        marketingAccepted: marketingAccepted,
        emailVerificationToken: verification.token,
        startTrial: plan.trial_days > 0,
        planCode: plan.code
      });

      if (data.success === false) {
        trackSignupError({
          step: 'plans',
          errorCode: data.code || 'REGISTRATION_REJECTED',
          errorType: 'api_error',
          planCode: plan.code,
          professionCode: formData.profession || undefined
        });
        throw new Error(data.message || 'Não foi possível criar a conta.');
      }

      if (data.token && data.user) {
        accountCreated.current = true;
        if (data.success !== false) {
          trackCompletedRegistration(data.user.id, data.isTrial === true ? plan.trial_days : undefined, {
            planCode: plan.code,
            professionCode: formData.profession || undefined
          });
        }
        loginWithToken(data.token, data.user, data.tenant);

        if (data.isTrial === true) {
          showToast('E-mail verificado! Seu teste grátis de 7 dias do Zemda Solo está ativo.', 'success');
          onClose();
          window.history.pushState(null, '', '/');
          window.dispatchEvent(new PopStateEvent('popstate'));
          window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'dashboard' } }));
          return;
        }

        showToast('Conta criada! Complete os dados do pagador para continuar ao checkout.', 'success');
        onClose();
        window.history.pushState(null, '', '/assinatura?checkout=1');
        window.dispatchEvent(new PopStateEvent('popstate'));
        window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'subscription' } }));
        return;
      }

      if (data.success === true || data.clinicId) {
        accountCreated.current = true;
        trackCompletedRegistration(data.clinicId, undefined, {
          planCode: plan.code,
          professionCode: formData.profession || undefined
        });
        setSuccessData(data);
      } else {
        throw new Error('Resposta de cadastro inválida. Verifique seu acesso antes de tentar novamente.');
      }
      showToast('Cadastro realizado com sucesso! Faça login para continuar.', 'info');
    } catch (err: any) {
      trackSignupError({
        step: 'plans',
        errorCode: err.code || 'REGISTRATION_FAILED',
        errorType: err.code ? 'api_error' : 'server_error',
        planCode: plan.code,
        professionCode: formData.profession || undefined
      });
      if (err.code === 'EMAIL_VERIFICATION_EXPIRED') {
        setVerification(null);
        setStep('security');
      }
      showToast(err.message || 'Erro ao realizar cadastro.', 'error');
    } finally {
      registrationBusy.current = false;
      setLoading(false);
    }
  };

  // Cálculo do indicador numérico e progresso
  const getStepNumber = () => {
    switch (step) {
      case 'initial_data':
        return 1;
      case 'profession':
        return 2;
      case 'security':
        return 3;
      case 'verify_email':
        return 3; // Etapa de validação associada à segurança/titularidade
      case 'plans':
        return 4;
      default:
        return 1;
    }
  };

  const stepNumber = getStepNumber();
  const stepTitles = [
    'Dados iniciais',
    'Sua profissão',
    'Segurança e acesso',
    'Escolha do plano'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div
        className={`bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl flex flex-col ${
          step === 'plans' ? 'sm:max-w-4xl' : 'sm:max-w-xl'
        } overflow-hidden shadow-2xl border border-slate-100 transition-all duration-300`}
      >
        {/* Top Header com Marca e Fechar */}
        <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-teal-900 px-5 py-4 sm:px-6 sm:py-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <img
              src="/brand/zemda-icon.png"
              alt="Zemda"
              className="w-8 h-8 sm:w-9 sm:h-9 object-contain drop-shadow-sm rounded-lg"
            />
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>Criar Minha Conta</span>
                {isTrial && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30">
                    <Sparkles className="w-2.5 h-2.5" />
                    Trial 7 dias
                  </span>
                )}
              </h2>
              <p className="text-[11px] sm:text-xs text-teal-200/80">
                Plataforma integrada de gestão e atendimento clínico
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleModalClose}
            className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador de Progresso (1 de 4 / 2 de 4 / 3 de 4 / 4 de 4) */}
        {!successData && (
          <div className="px-5 pt-4 pb-3 sm:px-6 border-b border-slate-100 bg-slate-50/70 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-black bg-teal-700 text-white shadow-xs">
                  {stepNumber} de 4
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-800">
                  {step === 'verify_email' ? 'Confirmação de E-mail' : stepTitles[stepNumber - 1]}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-500">
                {stepNumber === 1 && '25%'}
                {stepNumber === 2 && '50%'}
                {stepNumber === 3 && '75%'}
                {stepNumber === 4 && '100%'}
              </div>
            </div>

            {/* Barra Visual de Progresso */}
            <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300 rounded-full"
                style={{
                  width:
                    stepNumber === 1
                      ? '25%'
                      : stepNumber === 2
                      ? '50%'
                      : stepNumber === 3
                      ? '75%'
                      : '100%'
                }}
              />
            </div>
          </div>
        )}

        {/* Corpo Scrollável do Cadastro */}
        <div ref={contentRef} className="p-5 sm:p-7 min-h-0 flex-1 overflow-y-auto">
          {successData ? (
            /* Sucesso ao Criar Conta */
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
                  Entre com o e-mail e a senha cadastrados para escolher o plano e concluir a ativação.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200 text-left space-y-1">
                <p><strong>Responsável:</strong> {formData.responsibleName}</p>
                <p><strong>E-mail de Acesso:</strong> {formData.email}</p>
              </div>

              <button
                onClick={() => window.location.assign('/assinatura')}
                className="w-full min-h-[48px] px-6 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-sm rounded-2xl shadow-md shadow-teal-700/20 cursor-pointer transition-all"
              >
                Entrar e escolher o plano
              </button>
            </div>
          ) : step === 'initial_data' ? (
            /* ======================================================== */
            /* ETAPA 1: DADOS INICIAIS                                    */
            /* ======================================================== */
            <form onSubmit={handleProceedFromInitialData} className="space-y-5">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200/60">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  Teste o Zemda grátis por 7 dias
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight pt-1">
                  Vamos começar seus atendimentos
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 font-medium">
                  Leva menos de 1 minuto para criar sua conta.
                </p>
              </div>

              <div className="space-y-4 pt-1">
                {/* Nome Completo */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nome Completo *
                  </label>
                  <div className="relative">
                    <User className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="Ex: Dra. Mariana Albuquerque"
                      value={formData.responsibleName}
                      onChange={e => {
                        notifySignupStarted();
                        setFormData({ ...formData, responsibleName: e.target.value });
                      }}
                      className="w-full pl-11 pr-4 py-3 sm:py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* WhatsApp / Celular */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Celular / WhatsApp *
                  </label>
                  <div className="relative">
                    <Phone className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      required
                      placeholder="(11) 98765-4321"
                      value={formData.phone}
                      onChange={e => {
                        notifySignupStarted();
                        setFormData({ ...formData, phone: formatPhone(e.target.value) });
                      }}
                      className="w-full pl-11 pr-4 py-3 sm:py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Usado para notificações e suporte da sua conta.
                  </p>
                </div>

                {/* E-mail de Acesso */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    E-mail de Acesso *
                  </label>
                  <div className="relative">
                    <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      placeholder="mariana@clinica.com.br"
                      value={formData.email}
                      onChange={e => {
                        notifySignupStarted();
                        setFormData({ ...formData, email: e.target.value });
                      }}
                      className="w-full pl-11 pr-4 py-3 sm:py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Seu endereço principal para login e segurança.
                  </p>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full min-h-[48px] px-6 py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.99] text-white font-bold text-sm sm:text-base rounded-2xl shadow-lg shadow-teal-700/25 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Continuar</span>
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </form>
          ) : step === 'profession' ? (
            /* ======================================================== */
            /* ETAPA 2: PROFISSÃO                                        */
            /* ======================================================== */
            <form onSubmit={handleProceedFromProfession} className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Qual é a sua profissão?
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 font-medium">
                  Personalizamos os módulos clínicos e de gestão para o seu dia a dia.
                </p>
              </div>

              <div className="space-y-4 pt-1">
                <div>
                  <label htmlFor="registration-profession" className="block text-xs font-bold text-slate-700 mb-1.5">
                    Profissão ou Especialidade *
                  </label>
                  <div className="relative">
                    <Briefcase className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <RegistrationProfessionSelect
                      value={formData.profession}
                      onChange={profession => setFormData({ ...formData, profession })}
                      options={professionOptions}
                      loading={loadingProfessions}
                    />
                  </div>

                  {/* Bloco informativo dinâmico dos módulos */}
                  {(() => {
                    const currentList = professionOptions.length > 0 ? professionOptions : REGISTRATION_PROFESSIONS;
                    const selected = currentList.find(p => p.id === formData.profession);
                    if (!selected) return null;
                    return (
                      <div className="mt-3 p-3.5 rounded-2xl bg-teal-50/90 border border-teal-200/90 text-xs text-teal-950 animate-in fade-in duration-200 shadow-xs">
                        <div className="flex items-center gap-2 font-extrabold text-teal-900 mb-1.5">
                          <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
                          <span>Módulos inclusos para sua área:</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          {selected.modules.map((m, idx) => (
                            <React.Fragment key={m}>
                              {idx > 0 && <span className="text-teal-400 font-bold">•</span>}
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white border border-teal-200 text-teal-950 font-bold shadow-2xs">
                                {m}
                              </span>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {formData.profession === 'prof-outro-saude' && (
                    <div className="mt-3">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Especifique sua profissão da saúde *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Biomédico(a), Quiropraxista..."
                        value={formData.customProfession}
                        onChange={e => setFormData({ ...formData, customProfession: e.target.value })}
                        className="w-full px-4 py-3 sm:py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                  )}

                  {/* Seleção Interativa de Áreas de Atuação e Abordagens (Multiselect Cards) */}
                  {formData.profession && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-extrabold text-slate-800">
                          Áreas de Atuação & Abordagens Clínicas
                        </label>
                        <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200/60">
                          {selectedPracticeAreaIds.length === 0
                            ? 'Opcional • Selecione'
                            : `${selectedPracticeAreaIds.length} selecionada${selectedPracticeAreaIds.length > 1 ? 's' : ''}`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-2.5">
                        Escolha suas áreas para pré-configurar recursos clínicos, escalas e prescrições ideais.
                      </p>

                      {loadingPracticeAreas ? (
                        <div className="flex items-center justify-center p-6 text-xs text-slate-500 gap-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                          <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                          <span>Carregando áreas de atuação recomendadas...</span>
                        </div>
                      ) : practiceAreas.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                          {practiceAreas.map(area => {
                            const isSelected = selectedPracticeAreaIds.includes(area.id);
                            return (
                              <button
                                type="button"
                                key={area.id}
                                onClick={() => {
                                  setSelectedPracticeAreaIds(prev =>
                                    isSelected ? prev.filter(id => id !== area.id) : [...prev, area.id]
                                  );
                                }}
                                className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer select-none ${
                                  isSelected
                                    ? 'border-teal-500 bg-teal-50/90 shadow-xs ring-1 ring-teal-500'
                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 mt-0.5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                                    isSelected
                                      ? 'bg-teal-600 border-teal-600 text-white'
                                      : 'border-slate-300 bg-white'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className={`text-xs font-bold truncate ${isSelected ? 'text-teal-950' : 'text-slate-800'}`}>
                                      {area.name}
                                    </span>
                                    <span
                                      className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase shrink-0 ${
                                        area.type === 'approach'
                                          ? 'bg-purple-100 text-purple-700'
                                          : 'bg-emerald-100 text-emerald-800'
                                      }`}
                                    >
                                      {area.type === 'approach' ? 'Abordagem' : 'Especialidade'}
                                    </span>
                                  </div>
                                  {area.description && (
                                    <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                                      {area.description}
                                    </p>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic py-2">
                          Nenhuma área específica configurada para esta especialidade. Módulos padrão serão ativados.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setStep('initial_data')}
                  className="min-h-[48px] px-4 py-3 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs sm:text-sm rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar</span>
                </button>

                <button
                  type="submit"
                  className="flex-1 min-h-[48px] px-6 py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.99] text-white font-bold text-sm sm:text-base rounded-2xl shadow-lg shadow-teal-700/25 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Continuar</span>
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </form>
          ) : step === 'security' ? (
            /* ======================================================== */
            /* ETAPA 3: SEGURANÇA                                        */
            /* ======================================================== */
            <form onSubmit={handleProceedFromSecurity} className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Crie sua senha de acesso
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 font-medium">
                  Sua senha protegerá o acesso ao consultório e dados dos pacientes.
                </p>
              </div>

              <div className="space-y-4 pt-1">
                {/* Senha */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Senha de Acesso *
                  </label>
                  <div className="relative">
                    <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Mínimo de 6 caracteres"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      className="w-full pl-11 pr-11 py-3 sm:py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                      aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirmar Senha */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Confirmar Senha *
                  </label>
                  <div className="relative">
                    <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="Repita a senha digitada"
                      value={formData.confirmPassword}
                      onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className="w-full pl-11 pr-11 py-3 sm:py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                      aria-label={showConfirmPassword ? 'Ocultar confirmação de senha' : 'Exibir confirmação de senha'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Aceites Legais Obrigatórios */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <label className="flex items-start gap-3 text-xs text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={formData.termsAccepted}
                      onChange={e => setFormData({ ...formData, termsAccepted: e.target.checked })}
                      className="w-4 h-4 mt-0.5 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                    />
                    <span className="leading-relaxed">
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

                  <label className="flex items-start gap-3 text-xs text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={formData.privacyAccepted}
                      onChange={e => setFormData({ ...formData, privacyAccepted: e.target.checked })}
                      className="w-4 h-4 mt-0.5 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                    />
                    <span className="leading-relaxed">
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
                    <label className="flex items-start gap-3 text-[11px] text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={marketingAccepted}
                        onChange={e => setMarketingAccepted(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                      <span>
                        (Opcional) Desejo receber comunicações sobre novidades e recursos da plataforma.
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setStep('profession')}
                  className="min-h-[48px] px-4 py-3 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs sm:text-sm rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar</span>
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 min-h-[48px] px-6 py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.99] text-white font-bold text-sm sm:text-base rounded-2xl shadow-lg shadow-teal-700/25 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Enviando código...</span>
                    </>
                  ) : (
                    <>
                      <span>Continuar</span>
                      <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : step === 'verify_email' ? (
            /* ======================================================== */
            /* TRANSIÇÃO DE SEGURANÇA: CONFIRMAÇÃO DO E-MAIL (OTP)        */
            /* ======================================================== */
            <div className="py-2 space-y-6">
              {/* Card visual */}
              <div className="text-center space-y-3 py-2">
                <div className="w-14 h-14 bg-gradient-to-tr from-teal-500 to-emerald-400 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-teal-500/20">
                  <KeyRound className="w-7 h-7" />
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Código de Verificação
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                  Digite o código de 6 dígitos que enviamos para o e-mail:
                </p>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs sm:text-sm">
                  <Mail className="w-4 h-4 text-teal-600" />
                  <span>{maskEmail(formData.email)}</span>
                  <button
                    type="button"
                    onClick={() => setStep('initial_data')}
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
                      ref={el => {
                        otpInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(idx, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(idx, e)}
                      onPaste={handleOtpPaste}
                      className={`w-11 h-14 sm:w-13 sm:h-16 text-center text-2xl font-black rounded-2xl border-2 transition-all outline-none ${
                        digit
                          ? 'border-teal-500 bg-teal-50/40 text-teal-950 ring-2 ring-teal-500/20 shadow-xs'
                          : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10'
                      }`}
                      autoFocus={idx === 0}
                    />
                  ))}
                </div>

                <div className="text-center">
                  <p className="text-[11px] sm:text-xs text-slate-500">
                    O código é válido por <strong>10 minutos</strong>. Verifique também sua caixa de spam ou promoções.
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
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('security')}
                  className="min-h-[48px] px-4 py-3 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs sm:text-sm rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar</span>
                </button>

                <button
                  type="button"
                  onClick={handleVerifyOtpAndAdvance}
                  disabled={isVerifying || otpDigits.join('').length !== 6}
                  className="flex-1 min-h-[48px] px-6 py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.99] text-white font-bold text-sm sm:text-base rounded-2xl shadow-lg shadow-teal-700/25 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Validando código...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span>Confirmar e ver planos</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* ======================================================== */
            /* ETAPA 4: ESCOLHA DO PLANO                                 */
            /* ======================================================== */
            <div>
              {planError && (
                <p role="alert" className="text-sm text-red-700 mb-4 p-3 bg-red-50 rounded-xl border border-red-200">
                  {planError}{' '}
                  <button onClick={loadPlans} className="underline font-bold ml-1 cursor-pointer">
                    Tentar novamente
                  </button>
                </p>
              )}
              {!plans.length && !planError && (
                <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-teal-600" />
                  <p className="text-xs font-semibold">Carregando planos disponíveis...</p>
                </div>
              )}
              <RegistrationPlans
                plans={plans}
                selectedCode={selectedPlanCode}
                busy={loading}
                onChoose={handleRegister}
                onBack={() => setStep('security')}
                onSelectPlan={handleSelectPlan}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
