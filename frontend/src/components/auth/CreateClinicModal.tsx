import './CreateClinicModal.css';
import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  trackSignupError,
  trackSignupValidationError,
  trackSignupCompleted,
  trackEmailVerificationStarted,
  trackEmailVerified,
  trackPlanSelected,
  trackTrialStarted,
  trackProfessionalProfileCompleted,
  trackOnboardingCompleted
} from '../../utils/registrationAnalytics';
import { trackGoogleConversionSignup } from '../../utils/googleAds';
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
  Check,
  ChevronDown,
  ChevronRight,
  Stethoscope,
  AlertCircle
} from 'lucide-react';
import { RegistrationProfessionOption, REGISTRATION_PROFESSIONS } from '../../types/professions';
import { PracticeArea, MedicalSpecialtyItem } from '../../types/capabilities';

interface CreateClinicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialPlan?: string;
  isTrial?: boolean;
  presentation?: 'modal' | 'page';
}

type RegistrationStep = 'signup' | 'verify_email' | 'plans' | 'profile';

export const CreateClinicModal: React.FC<CreateClinicModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialPlan,
  isTrial,
  presentation = 'modal'
}) => {
  const { showToast } = useToast();
  const { currentUser, loginWithToken, reloadSession, logout } = useAuth();

  // 1. Estado da Etapa Atual (Cadastro em tela única e Onboarding em 3 etapas)
  const [step, setStep] = useState<RegistrationStep>('signup');
  const [selectedPlanCode, setSelectedPlanCode] = useState(initialPlan || (isTrial ? 'SOLO' : ''));
  const [plans, setPlans] = useState<RegistrationPlan[]>([]);
  const [planError, setPlanError] = useState('');
  const [verification, setVerification] = useState<{ email: string; token: string } | null>(null);

  // Senha visibilidade
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Registro profissional
  const [registrationType, setRegistrationType] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');

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

  // Retomada automática de onboarding se o usuário já estiver logado
  useEffect(() => {
    if (currentUser?.onboardingStatus && currentUser.onboardingStatus !== 'active') {
      if (currentUser.onboardingStatus === 'pending_verification') {
        setStep('verify_email');
      } else if (currentUser.onboardingStatus === 'pending_plan') {
        setStep('plans');
      } else if (currentUser.onboardingStatus === 'pending_profile') {
        setStep('profile');
      }
      setFormData(prev => ({
        ...prev,
        email: currentUser.email || prev.email,
        responsibleName: currentUser.name || prev.responsibleName,
        profession: currentUser.professionId || (currentUser as any).canonicalProfessionId || currentUser.professionName || prev.profession
      }));
      if (currentUser.registrationType) setRegistrationType(currentUser.registrationType);
      if (currentUser.registrationNumber) setRegistrationNumber(currentUser.registrationNumber);
    }
  }, [currentUser]);

  // OTP e Validações
  const [loading, setLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState<string | null>(null);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [successData, setSuccessData] = useState<{ clinicId: string; slug: string; message: string } | null>(null);

  // Catálogo de Profissões Dinâmico (Fonte da verdade: SuperAdmin /v1/taxonomy/professions)
  const [professionOptions, setProfessionOptions] = useState<RegistrationProfessionOption[]>(REGISTRATION_PROFESSIONS || []);
  const [loadingProfessions, setLoadingProfessions] = useState(false);

  // Áreas de Atuação e Abordagens Clínicas
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [selectedPracticeAreaIds, setSelectedPracticeAreaIds] = useState<string[]>([]);
  const [loadingPracticeAreas, setLoadingPracticeAreas] = useState(false);
  const lastLoadedProfessionRef = useRef<string>('');

  // Árvore Clínica Médica (ZemdaMed)
  const [medicalTree, setMedicalTree] = useState<MedicalSpecialtyItem[]>([]);
  const [selectedMedicalSpecialtyIds, setSelectedMedicalSpecialtyIds] = useState<string[]>(['med-spec-clinica']);
  const [selectedMedicalPracticeAreaIds, setSelectedMedicalPracticeAreaIds] = useState<string[]>([]);
  const [expandedSpecialtyIds, setExpandedSpecialtyIds] = useState<string[]>(['med-spec-clinica']);
  const [loadingMedicalTree, setLoadingMedicalTree] = useState(false);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Carregar planos
  const loadPlans = () => {
    setPlanError('');
    ApiClient.get<RegistrationPlan[]>('/v1/plans')
      .then(data => {
        if (isMountedRef.current) setPlans(data);
      })
      .catch(() => {
        if (isMountedRef.current) setPlanError('Não foi possível carregar os planos. Tente novamente.');
      });
  };

  useEffect(() => {
    if (isOpen) {
      loadPlans();
    }
  }, [isOpen]);

  // Carregar profissões ativas dinâmicas (administradas pelo SuperAdmin)
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
        // Preserva o fallback seguro de REGISTRATION_PROFESSIONS
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
      lastLoadedProfessionRef.current = '';
      return;
    }

    // Se já carregou para esta profissão exata, não limpa nem refaz para não resetar seleções ao navegar com Voltar
    if (lastLoadedProfessionRef.current === formData.profession && practiceAreas.length > 0) {
      return;
    }

    let isMounted = true;
    setLoadingPracticeAreas(true);

    const loadAreas = async () => {
      try {
        const queryParam = formData.profession;

        let resData: any = null;
        try {
          resData = await ApiClient.get<any>(`/v1/capabilities/practice-areas?professionId=${encodeURIComponent(queryParam)}`);
        } catch {
          // Fallback para rota de taxonomia pública
          resData = await ApiClient.get<any>(`/v1/taxonomy/practice-areas?professionId=${encodeURIComponent(queryParam)}`);
        }

        const items: PracticeArea[] = Array.isArray(resData)
          ? resData
          : (resData?.data || resData?.items || []);

        if (!isMounted) return;

        lastLoadedProfessionRef.current = formData.profession;
        setPracticeAreas(items);

        // Se for alias específico com área única inferida, auto-seleciona
        const inferred = items.find(a => (a as any).isInferredForAlias);
        if (inferred) {
          setSelectedPracticeAreaIds([inferred.id]);
        } else {
          // Para profissões canônicas genéricas (Médico, Fisioterapeuta, etc.):
          // Preserva seleções válidas prévias se o usuário já havia marcado,
          // caso contrário mantém vazio para escolha ativa do profissional.
          setSelectedPracticeAreaIds(prev => prev.filter(id => items.some(a => a.id === id)));
        }
      } catch (err) {
        if (isMounted) {
          lastLoadedProfessionRef.current = '';
          setPracticeAreas([]);
        }
      } finally {
        if (isMounted) {
          setLoadingPracticeAreas(false);
        }
      }
    };

    loadAreas();

    return () => {
      isMounted = false;
    };
  }, [formData.profession, professionOptions]);

  // Carregar Árvore Clínica Médica completa para Médico(a) genérico
  useEffect(() => {
    if (formData.profession !== 'prof-medico') return;
    if (medicalTree.length > 0) return;

    let isMounted = true;
    setLoadingMedicalTree(true);

    ApiClient.get<any>('/v1/taxonomy/medical-tree')
      .then(res => {
        if (!isMounted) return;
        const list: MedicalSpecialtyItem[] = Array.isArray(res) ? res : (res?.specialties || []);
        setMedicalTree(list);
        if (selectedMedicalSpecialtyIds.length === 0 && list.length > 0) {
          setSelectedMedicalSpecialtyIds(['med-spec-clinica']);
          setExpandedSpecialtyIds(['med-spec-clinica']);
        }
      })
      .catch(err => {
        console.warn('Erro ao carregar árvore médica:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingMedicalTree(false);
      });

    return () => {
      isMounted = false;
    };
  }, [formData.profession, medicalTree.length, selectedMedicalSpecialtyIds.length]);

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
  // CRIAÇÃO DA CONTA EM TELA ÚNICA
  // ==========================================

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    notifySignupStarted();

    if (!formData.responsibleName.trim()) {
      trackSignupValidationError({
        step: 'signup',
        field: 'name',
        errorCode: 'NAME_MISSING'
      });
      showToast('Por favor, informe seu nome completo.', 'error');
      return;
    }

    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      trackSignupValidationError({
        step: 'signup',
        field: 'phone',
        errorCode: 'INVALID_PHONE_FORMAT'
      });
      showToast('Informe um número de WhatsApp ou celular válido com DDD.', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      trackSignupValidationError({
        step: 'signup',
        field: 'email',
        errorCode: 'INVALID_EMAIL_FORMAT'
      });
      showToast('Informe um endereço de e-mail válido.', 'error');
      return;
    }

    if (!formData.profession) {
      trackSignupValidationError({
        step: 'signup',
        field: 'profession',
        errorCode: 'PROFESSION_MISSING'
      });
      showToast('Selecione sua profissão para continuar.', 'error');
      return;
    }

    if (formData.profession === 'prof-outro-saude' && !formData.customProfession.trim()) {
      trackSignupValidationError({
        step: 'signup',
        field: 'customProfession',
        errorCode: 'CUSTOM_PROFESSION_MISSING'
      });
      showToast('Por favor, especifique sua profissão da saúde.', 'error');
      return;
    }

    if (!formData.password || formData.password.length < 6) {
      trackSignupValidationError({
        step: 'signup',
        field: 'password',
        errorCode: 'PASSWORD_TOO_SHORT'
      });
      showToast('A senha deve ter no mínimo 6 caracteres.', 'error');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      trackSignupValidationError({
        step: 'signup',
        field: 'confirmPassword',
        errorCode: 'PASSWORD_MISMATCH'
      });
      showToast('As senhas digitadas não coincidem.', 'error');
      return;
    }

    if (!formData.termsAccepted || !formData.privacyAccepted) {
      trackSignupValidationError({
        step: 'signup',
        field: 'terms',
        errorCode: 'TERMS_NOT_ACCEPTED'
      });
      showToast('Você deve aceitar os Termos de Uso e a Política de Privacidade.', 'error');
      return;
    }

    // Cria a conta imediatamente com todos os dados mínimos
    try {
      setLoading(true);
      trackSignupSubmit({
        planCode: selectedPlanCode || initialPlan,
        professionCode: formData.profession || undefined
      });

      const fallbackClinicName = formData.responsibleName.trim()
        ? `Consultório ${formData.responsibleName.trim()}`
        : 'Meu Consultório';

      const selectedOption = professionOptions.find(p => p.id === formData.profession);
      const professionNameToSend =
        formData.profession === 'prof-outro-saude' && formData.customProfession.trim()
          ? formData.customProfession.trim()
          : (selectedOption?.label || (selectedOption as any)?.name || selectedOption?.canonicalName || formData.profession);

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
        marketingAccepted: marketingAccepted
      });

      if (data.token && data.user) {
        accountCreated.current = true;
        loginWithToken(data.token, data.user, data.tenant);
        trackSignupCompleted({
          professionCode: formData.profession || undefined,
          userId: data.user.id
        });
        trackGoogleConversionSignup({
          accountId: data.user.id,
          planCode: selectedPlanCode || initialPlan || 'SOLO',
          isTrial: true,
          value: 0
        });

        setCooldownSeconds(data.cooldownSeconds || 60);
        setStep('verify_email');
        trackEmailVerificationStarted({
          professionCode: formData.profession || undefined
        });
        showToast('Conta criada com sucesso! Digite o código de 6 dígitos enviado para seu e-mail.', 'info');
        setTimeout(() => {
          otpInputRefs.current[0]?.focus();
        }, 150);
      } else {
        throw new Error(data.message || 'Não foi possível criar a conta.');
      }
    } catch (err: any) {
      trackSignupError({
        step: 'signup',
        errorCode: err.code || 'REGISTRATION_FAILED',
        errorType: err.code ? 'api_error' : 'network_error',
        planCode: selectedPlanCode || initialPlan,
        professionCode: formData.profession || undefined
      });
      if (err.code === 'ACCOUNT_EXISTS_ONBOARDING_PENDING') {
        showToast('Já existe um cadastro em andamento com este e-mail. Faça login para continuar o onboarding.', 'info');
      } else if (err.code === 'EMAIL_ALREADY_EXISTS') {
        showToast('Este e-mail já está cadastrado. Faça login para acessar sua conta.', 'info');
      } else {
        showToast(err.message || 'Erro ao realizar cadastro.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Reenviar código OTP (via onboarding autenticado ou fallback público)
  const handleResendOtp = async () => {
    if (cooldownSeconds > 0 || isResending) return;
    try {
      setIsResending(true);
      let res: any;
      try {
        res = await ApiClient.post<any>('/v1/onboarding/resend-otp', {});
      } catch {
        res = await ApiClient.post<any>('/v1/public/email/request-code', {
          email: formData.email.trim().toLowerCase(),
          purpose: 'clinic_registration'
        });
      }
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

  // Validar código OTP e avançar para Etapa de Planos (onboarding)
  const handleVerifyOtpAndAdvance = async (providedCode?: string) => {
    const code = (typeof providedCode === 'string' ? providedCode : otpDigits.join('')).trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      trackSignupValidationError({
        step: 'verify_email',
        field: 'otp',
        errorCode: 'INVALID_OTP_FORMAT'
      });
      setOtpError('Código inválido ou expirado. Verifique e tente novamente.');
      showToast('Por favor, digite o código completo de 6 dígitos numéricos.', 'error');
      return;
    }

    try {
      setIsVerifying(true);
      setOtpError(null);
      const res = await ApiClient.post<any>('/v1/onboarding/verify-email', { code });

      trackEmailVerified({
        professionCode: formData.profession || undefined
      });
      showToast('E-mail verificado com sucesso!', 'success');

      // Se já houver plano/trial válido, pula etapa de planos e avança direto para o perfil
      if (res?.hasPlan || res?.onboardingStatus === 'pending_profile') {
        setStep('profile');
      } else {
        setStep('plans');
      }
    } catch (err: any) {
      trackSignupError({
        step: 'verify_email',
        errorCode: err.code || 'OTP_VERIFICATION_FAILED',
        errorType: err.code ? 'api_error' : 'network_error',
        planCode: selectedPlanCode || initialPlan,
        professionCode: formData.profession || undefined
      });
      setOtpError('Código inválido ou expirado. Verifique e tente novamente.');
      showToast('Código inválido ou expirado. Verifique e tente novamente.', 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  // Controles de input do OTP com submissão automática no 6º dígito
  const handleOtpChange = (index: number, val: string) => {
    if (otpError) setOtpError(null);
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

    const fullCode = updated.join('');
    if (fullCode.length === 6 && /^\d{6}$/.test(fullCode)) {
      // Submissão automática imediata ao preencher o 6º dígito
      void handleVerifyOtpAndAdvance(fullCode);
    } else if (index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (otpError) setOtpError(null);
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
    if (otpError) setOtpError(null);
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const updated = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      updated[i] = pasted[i] || '';
    }
    setOtpDigits(updated);

    if (pasted.length === 6 && /^\d{6}$/.test(pasted)) {
      // Submissão automática ao colar os 6 dígitos completos
      void handleVerifyOtpAndAdvance(pasted);
    } else {
      const nextIndex = Math.min(pasted.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
    }
  };

  // Seleção e Ativação do Plano no Onboarding
  const handleSelectPlan = (plan: RegistrationPlan) => {
    setSelectedPlanCode(plan.code);
    if (lastSelectedPlanCode.current !== plan.code) {
      lastSelectedPlanCode.current = plan.code;
      trackSignupPlanSelected(plan.code, {
        professionCode: formData.profession || undefined
      });
    }
  };

  const handleChoosePlan = async (plan: RegistrationPlan) => {
    if (registrationBusy.current) return;
    handleSelectPlan(plan);

    registrationBusy.current = true;
    setLoading(true);

    try {
      await ApiClient.post<any>('/v1/onboarding/select-plan', {
        planCode: plan.code,
        startTrial: plan.trial_days > 0
      });

      trackPlanSelected(plan.code, {
        isTrial: plan.trial_days > 0,
        professionCode: formData.profession || undefined
      });

      if (plan.trial_days > 0) {
        trackTrialStarted(plan.code, plan.trial_days);
      }

      showToast(plan.trial_days > 0 ? 'Teste grátis de 7 dias selecionado! Agora personalize sua área de atuação.' : 'Plano selecionado! Agora personalize sua área de atuação.', 'success');
      setStep('profile');
    } catch (err: any) {
      trackSignupError({
        step: 'plans',
        errorCode: err.code || 'PLAN_SELECTION_FAILED',
        errorType: err.code ? 'api_error' : 'network_error',
        planCode: plan.code,
        professionCode: formData.profession || undefined
      });
      showToast(err.message || 'Erro ao selecionar plano.', 'error');
    } finally {
      registrationBusy.current = false;
      setLoading(false);
    }
  };

  // Conclusão do Perfil Profissional (Especialidade, Áreas e Registro) -> Ativação Total
  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registrationBusy.current) return;

    registrationBusy.current = true;
    setLoading(true);

    try {
      const isSpecificMedical = practiceAreas.length > 0 && !!practiceAreas[0].medicalSpecialtyId;
      const isGenericDoc = formData.profession === 'prof-medico';

      let medSpecialtyIdsToSend: string[] | undefined = undefined;
      let medPracticeAreaIdsToSend: string[] | undefined = undefined;
      let allPracticeAreaIdsToSend = selectedPracticeAreaIds;

      if (isSpecificMedical) {
        const specId = practiceAreas[0].medicalSpecialtyId!;
        medSpecialtyIdsToSend = [specId];
        medPracticeAreaIdsToSend = selectedPracticeAreaIds;
        allPracticeAreaIdsToSend = [];
      } else if (isGenericDoc) {
        medSpecialtyIdsToSend = selectedMedicalSpecialtyIds;
        medPracticeAreaIdsToSend = selectedMedicalPracticeAreaIds;
        allPracticeAreaIdsToSend = [];
      }

      await ApiClient.post<any>('/v1/onboarding/complete-profile', {
        practiceAreaIds: allPracticeAreaIdsToSend,
        medicalSpecialtyIds: medSpecialtyIdsToSend,
        medicalPracticeAreaIds: medPracticeAreaIdsToSend,
        registrationNumber: registrationNumber.trim(),
        registrationType: registrationType.trim()
      });

      trackProfessionalProfileCompleted({
        professionCode: formData.profession || undefined
      });
      trackOnboardingCompleted({
        planCode: selectedPlanCode || undefined,
        professionCode: formData.profession || undefined
      });

      await reloadSession();
      window.dispatchEvent(new Event('zemda-billing-refresh'));

      // Transição direta para o Dashboard com a mesma sessão autenticada (sem logout nem redirect para login)
      sessionStorage.setItem('activeView', 'dashboard');
      window.history.pushState({ view: 'dashboard' }, '', '/dashboard');
      window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'dashboard' } }));
      window.dispatchEvent(new PopStateEvent('popstate'));

      onSuccess?.();
      showToast('Onboarding concluído com sucesso! Bem-vindo ao Zemda.', 'success');
    } catch (err: any) {
      trackSignupError({
        step: 'profile',
        errorCode: err.code || 'PROFILE_SAVE_FAILED',
        errorType: err.code ? 'api_error' : 'network_error',
        planCode: selectedPlanCode || undefined,
        professionCode: formData.profession || undefined
      });
      showToast(err.message || 'Erro ao concluir perfil profissional.', 'error');
    } finally {
      registrationBusy.current = false;
      setLoading(false);
    }
  };

  const isCadastro = step === 'signup';

  // Informações da etapa atual divididas rigorosamente entre Cadastro (tela única) e Onboarding (3 etapas)
  const stepInfo = useMemo(() => {
    if (isCadastro) {
      return {
        headerTitle: 'Criar Minha Conta',
        headerSubtitle: 'Plataforma integrada de gestão e atendimento clínico',
        current: 1,
        total: 1,
        title: 'Criar Minha Conta',
        progressText: '',
        percentage: '0%'
      };
    } else {
      switch (step) {
        case 'verify_email':
          return {
            current: 1,
            total: 3,
            title: 'Verifique seu e-mail',
            progressText: '1 de 3 — Verifique seu e-mail',
            percentage: '33%',
            headerTitle: 'Configure seu acesso ao Zemda',
            headerSubtitle: 'Conclua as etapas abaixo para liberar seu painel'
          };
        case 'plans':
          return {
            current: 2,
            total: 3,
            title: 'Escolha seu plano',
            progressText: '2 de 3 — Escolha seu plano',
            percentage: '66%',
            headerTitle: 'Configure seu acesso ao Zemda',
            headerSubtitle: 'Conclua as etapas abaixo para liberar seu painel'
          };
        case 'profile':
        default:
          return {
            current: 3,
            total: 3,
            title: 'Complete seu perfil',
            progressText: '3 de 3 — Complete seu perfil',
            percentage: '100%',
            headerTitle: 'Configure seu acesso ao Zemda',
            headerSubtitle: 'Conclua as etapas abaixo para liberar seu painel'
          };
      }
    }
  }, [isCadastro, step]);

  if (!isOpen) return null;

  return (
    <div ref={presentation === 'page' ? contentRef : undefined} className={presentation === 'page' ? 'signup-page' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 sm:p-4 backdrop-blur-xs overflow-y-auto'}>
      {presentation === 'page' && (
        <aside className="signup-intro">
          <img src="/brand/zemda-logo.png" alt="Zemda" className="signup-logo" />
          <div className="signup-pitch">
            <h1>Organize sua clínica em um só lugar</h1>
            <p>Agenda, prontuários, gestão e recursos para sua profissão.</p>
            <ul>
              <li><CheckCircle2 aria-hidden="true" />7 dias grátis <span>no plano Solo</span></li>
              <li><ShieldCheck aria-hidden="true" />Sem cartão de crédito</li>
              <li><Sparkles aria-hidden="true" />Configuração rápida</li>
            </ul>
          </div>
        </aside>
      )}
      <div
        className={`${presentation === 'page' ? 'signup-card' : ''} bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl flex flex-col ${
          step === 'plans' ? 'sm:max-w-4xl' : step === 'profile' ? 'sm:max-w-2xl sm:min-h-[680px]' : 'sm:max-w-xl'
        } overflow-hidden shadow-2xl border border-slate-100 transition-all duration-300`}
      >
        {/* Top Header com Marca e Fechar */}
        <div className="signup-card-header bg-gradient-to-r from-teal-950 via-slate-900 to-teal-900 px-5 py-4 sm:px-6 sm:py-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <img
              src="/brand/zemda-icon.png"
              alt="Zemda"
              className="w-8 h-8 sm:w-9 sm:h-9 object-contain drop-shadow-sm rounded-lg"
            />
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>{stepInfo.headerTitle}</span>
                {isTrial && isCadastro && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30">
                    <Sparkles className="w-2.5 h-2.5" />
                    Trial 7 dias
                  </span>
                )}
              </h2>
              <p className="text-[11px] sm:text-xs text-teal-200/80">
                {stepInfo.headerSubtitle}
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

        {/* Indicador de Progresso (Exibido apenas nas 3 etapas do Onboarding) */}
        {!isCadastro && !successData && (
          <div className="px-5 pt-4 pb-3 sm:px-6 border-b border-slate-100 bg-slate-50/70 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-black bg-teal-700 text-white shadow-xs">
                  {stepInfo.current} de {stepInfo.total}
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-800">
                  {stepInfo.title}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-500">
                {stepInfo.percentage}
              </div>
            </div>

            <p className="mb-3 text-[11px] sm:text-xs text-slate-600 leading-relaxed">
              {stepInfo.progressText}
            </p>
            {/* Barra Visual de Progresso */}
            <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300 rounded-full"
                style={{ width: stepInfo.percentage }}
              />
            </div>
          </div>
        )}

        {/* Corpo Scrollável do Cadastro */}
        <div ref={presentation === 'page' ? undefined : contentRef} className="signup-content p-5 sm:p-7 min-h-0 flex-1 overflow-y-auto">
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
          ) : step === 'signup' ? (
            /* ======================================================== */
            /* ETAPA ÚNICA: CRIAÇÃO DA CONTA                            */
            /* ======================================================== */
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200/60">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  Teste o Zemda grátis por 7 dias
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight pt-1">
                  Crie sua conta
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 font-medium">
                  Preencha os dados abaixo para começar imediatamente.
                </p>
              </div>

              <div className="space-y-3.5 pt-1">
                {/* 1. Nome completo */}
                <div>
                  <label htmlFor="signup-name" className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nome completo *
                  </label>
                  <div className="relative">
                    <User className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="signup-name"
                      type="text"
                      required
                      placeholder="Nome completo"
                      value={formData.responsibleName}
                      onChange={e => {
                        notifySignupStarted();
                        setFormData({ ...formData, responsibleName: e.target.value });
                      }}
                      className="w-full pl-11 pr-4 py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* 2. WhatsApp */}
                <div>
                  <label htmlFor="signup-phone" className="block text-xs font-bold text-slate-700 mb-1.5">
                    WhatsApp *
                  </label>
                  <div className="relative">
                    <Phone className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="signup-phone"
                      type="tel"
                      required
                      placeholder="(54) 99999-9999"
                      value={formData.phone}
                      onChange={e => {
                        notifySignupStarted();
                        setFormData({ ...formData, phone: formatPhone(e.target.value) });
                      }}
                      className="w-full pl-11 pr-4 py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* 3. E-mail */}
                <div>
                  <label htmlFor="signup-email" className="block text-xs font-bold text-slate-700 mb-1.5">
                    E-mail *
                  </label>
                  <div className="relative">
                    <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="signup-email"
                      type="email"
                      required
                      placeholder="seuemail@exemplo.com"
                      value={formData.email}
                      onChange={e => {
                        notifySignupStarted();
                        setFormData({ ...formData, email: e.target.value });
                      }}
                      className="w-full pl-11 pr-4 py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* 4. Profissão */}
                <div>
                  <label htmlFor="registration-profession" className="block text-xs font-bold text-slate-700 mb-1.5">
                    Profissão *
                  </label>
                  <div className="relative">
                    <Briefcase className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <RegistrationProfessionSelect
                      value={formData.profession}
                      onChange={profession => {
                        notifySignupStarted();
                        setFormData({ ...formData, profession });
                      }}
                      options={professionOptions}
                      loading={loadingProfessions}
                    />
                  </div>

                  {/* Bloco informativo dinâmico dos módulos inclusos */}
                  {(() => {
                    const selected = professionOptions.find(p => p.id === formData.profession);
                    if (!selected) return null;
                    const mods = selected.modules && selected.modules.length > 0
                      ? selected.modules
                      : (selected.module ? [selected.module, 'Zemda360'] : ['Recursos gerais do Zemda', 'Zemda360']);
                    return (
                      <div className="mt-2.5 p-3 rounded-2xl bg-teal-50/90 border border-teal-200/90 text-xs text-teal-950 animate-in fade-in duration-200 shadow-2xs">
                        <div className="flex items-center gap-1.5 font-extrabold text-teal-900 mb-1 text-[11px]">
                          <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span>Módulos inclusos para sua área:</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          {mods.map((m, idx) => (
                            <React.Fragment key={m}>
                              {idx > 0 && <span className="text-teal-400 font-bold">•</span>}
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-white border border-teal-200 text-teal-950 font-bold text-[11px] shadow-2xs">
                                {m}
                              </span>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {formData.profession === 'prof-outro-saude' && (
                    <div className="mt-2.5">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Especifique sua profissão da saúde *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Biomédico(a), Quiropraxista..."
                        value={formData.customProfession}
                        onChange={e => setFormData({ ...formData, customProfession: e.target.value })}
                        className="w-full px-4 py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* 5. Senha e Confirmar senha */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Senha *
                    </label>
                    <div className="relative">
                      <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="Mínimo 6 caracteres"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        className="w-full pl-11 pr-10 py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                        aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Confirmar senha *
                    </label>
                    <div className="relative">
                      <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        placeholder="Repita a senha"
                        value={formData.confirmPassword}
                        onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                        className="w-full pl-11 pr-10 py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                        aria-label={showConfirmPassword ? 'Ocultar confirmação de senha' : 'Exibir confirmação de senha'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 6. Checkboxes: Termos e Privacidade */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
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
                      Li e aceito a{' '}
                      <a
                        href="/privacidade"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-teal-600 underline hover:text-teal-700 inline-flex items-center gap-0.5"
                      >
                        Política de Privacidade
                        <ExternalLink className="w-3 h-3" />
                      </a>{' '}
                      *
                    </span>
                  </label>

                  <div className="pt-2 border-t border-slate-200/80">
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

              {/* 7. Botão: CRIAR MINHA CONTA */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[50px] px-6 py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.99] text-white font-extrabold text-sm sm:text-base rounded-2xl shadow-lg shadow-teal-700/25 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Criando sua conta...</span>
                    </>
                  ) : (
                    <>
                      <span>CRIAR MINHA CONTA</span>
                      <ArrowRight className="w-5 h-5" />
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
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Sua conta já foi criada com sucesso!</span>
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Confirme seu E-mail
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                  Para validar seu acesso e proteger seus dados, digite o código de 6 dígitos que enviamos para o e-mail:
                </p>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs sm:text-sm">
                  <Mail className="w-4 h-4 text-teal-600" />
                  <span>{maskEmail(formData.email || currentUser?.email || '')}</span>
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
                        otpError
                          ? 'border-rose-400 bg-rose-50/50 text-rose-950 ring-2 ring-rose-400/20'
                          : digit
                          ? 'border-teal-500 bg-teal-50/40 text-teal-950 ring-2 ring-teal-500/20 shadow-xs'
                          : 'border-slate-200 bg-slate-50 text-slate-800 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10'
                      } ${isVerifying ? 'opacity-70 cursor-wait' : ''}`}
                      disabled={isVerifying}
                      autoFocus={idx === 0}
                    />
                  ))}
                </div>

                {otpError && (
                  <div role="alert" className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-center gap-1.5 animate-in fade-in-50">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{otpError}</span>
                  </div>
                )}

                {isVerifying && !otpError && (
                  <div className="flex items-center justify-center gap-2 text-xs font-semibold text-teal-700 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600" />
                    <span>Validando código automaticamente...</span>
                  </div>
                )}

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

              {/* Action */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleVerifyOtpAndAdvance()}
                  disabled={isVerifying || otpDigits.join('').length !== 6}
                  className="w-full min-h-[48px] px-6 py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.99] text-white font-bold text-sm sm:text-base rounded-2xl shadow-lg shadow-teal-700/25 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
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
          ) : step === 'plans' ? (
            /* ======================================================== */
            /* ETAPA 4: ESCOLHA DO PLANO OU TESTE GRÁTIS                 */
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
                onChoose={handleChoosePlan}
                onBack={() => setStep('verify_email')}
                onSelectPlan={handleSelectPlan}
              />
            </div>
          ) : (
            /* ======================================================== */
            /* ETAPA 5 / ONBOARDING: ESPECIALIDADE E ÁREA DE ATUAÇÃO     */
            /* ======================================================== */
            <form onSubmit={handleCompleteProfile} className="space-y-5">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-200/60">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  Etapa Final do Onboarding
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Especialidade & Áreas de Atuação
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 font-medium">
                  Personalizamos seus prontuários, prescrições e modelos clínicos para o seu dia a dia.
                </p>
              </div>

              {/* Seleção Interativa de Áreas de Atuação e Abordagens */}
              <div className="space-y-4 pt-1">
                {/* CASO A: MÉDICO GENÉRICO (prof-medico) - Árvore Clínica Médica Dinâmica */}
                {formData.profession === 'prof-medico' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs sm:text-sm font-extrabold text-slate-800 flex items-center gap-2">
                        <Stethoscope className="w-4 h-4 text-teal-600" />
                        <span>Especialidades Médicas & Subáreas (ZemdaMed)</span>
                      </label>
                      <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200/60">
                        {selectedMedicalSpecialtyIds.length} especialidade(s)
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">
                      Selecione uma ou mais especialidades em que você atua. Expanda para detalhar suas áreas de atuação / subáreas clínicas.
                    </p>

                    {loadingMedicalTree ? (
                      <div className="flex items-center justify-center p-6 text-xs text-slate-500 gap-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                        <span className="font-medium">Carregando catálogo de especialidades médicas...</span>
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                        {medicalTree.map(spec => {
                          const isSpecSelected = selectedMedicalSpecialtyIds.includes(spec.id);
                          const isExpanded = expandedSpecialtyIds.includes(spec.id);
                          const specSubareas = spec.practiceAreas || [];
                          const selectedSubareaCount = specSubareas.filter(pa => selectedMedicalPracticeAreaIds.includes(pa.id)).length;

                          return (
                            <div
                              key={spec.id}
                              className={`rounded-2xl border transition-all overflow-hidden ${
                                isSpecSelected
                                  ? 'border-teal-500 bg-teal-50/50 shadow-xs'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              {/* Specialty Header Row */}
                              <div className="p-3 sm:p-3.5 flex items-center justify-between gap-3">
                                <div
                                  onClick={() => {
                                    if (isSpecSelected) {
                                      setSelectedMedicalSpecialtyIds(prev => prev.filter(id => id !== spec.id));
                                      const childIds = new Set(specSubareas.map(pa => pa.id));
                                      setSelectedMedicalPracticeAreaIds(prev => prev.filter(id => !childIds.has(id)));
                                    } else {
                                      setSelectedMedicalSpecialtyIds(prev => [...prev, spec.id]);
                                      if (!isExpanded) {
                                        setExpandedSpecialtyIds(prev => [...prev, spec.id]);
                                      }
                                    }
                                  }}
                                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer select-none"
                                >
                                  <div
                                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                                      isSpecSelected
                                        ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                                        : 'border-slate-300 bg-white'
                                    }`}
                                  >
                                    {isSpecSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs sm:text-sm font-black ${isSpecSelected ? 'text-teal-950' : 'text-slate-800'}`}>
                                        {spec.name}
                                      </span>
                                      {selectedSubareaCount > 0 && (
                                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-teal-600 text-white">
                                          {selectedSubareaCount} subárea(s)
                                        </span>
                                      )}
                                    </div>
                                    {spec.description && (
                                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                        {spec.description}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {specSubareas.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedSpecialtyIds(prev =>
                                        isExpanded ? prev.filter(id => id !== spec.id) : [...prev, spec.id]
                                      );
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors shrink-0 cursor-pointer"
                                    title={isExpanded ? 'Recolher subáreas' : 'Expandir subáreas'}
                                  >
                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                  </button>
                                )}
                              </div>

                              {/* Child Practice Areas (Subareas) */}
                              {isExpanded && specSubareas.length > 0 && (
                                <div className="px-3 pb-3 pt-1 border-t border-teal-100/70 bg-white/70">
                                  <p className="text-[11px] font-extrabold text-slate-600 mb-2">
                                    Subáreas & Focos Clínicos de {spec.name}:
                                  </p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {specSubareas.map(sub => {
                                      const isSubSelected = selectedMedicalPracticeAreaIds.includes(sub.id);
                                      return (
                                        <div
                                          key={sub.id}
                                          onClick={() => {
                                            if (isSubSelected) {
                                              setSelectedMedicalPracticeAreaIds(prev => prev.filter(id => id !== sub.id));
                                            } else {
                                              setSelectedMedicalPracticeAreaIds(prev => [...prev, sub.id]);
                                              if (!isSpecSelected) {
                                                setSelectedMedicalSpecialtyIds(prev => [...prev, spec.id]);
                                              }
                                            }
                                          }}
                                          className={`p-2 rounded-xl border text-left cursor-pointer transition-all flex items-center gap-2 select-none ${
                                            isSubSelected
                                              ? 'border-teal-500 bg-teal-50 text-teal-950 font-bold'
                                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs'
                                          }`}
                                        >
                                          <div
                                            className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                              isSubSelected ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-300'
                                            }`}
                                          >
                                            {isSubSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                          </div>
                                          <span className="text-[11px] truncate">{sub.name}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : practiceAreas.length > 0 && practiceAreas[0].medicalSpecialtyId ? (
                  /* CASO B: ALIAS MÉDICO ESPECÍFICO (Neurologista, Cardiologista, Psiquiatra, etc.) */
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs sm:text-sm font-extrabold text-slate-800">
                        Especialidade Médica Vinculada
                      </label>
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        Definida Automaticamente
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-teal-50/80 border border-teal-200/90 text-teal-950 flex items-start gap-3 shadow-2xs mb-4">
                      <div className="w-7 h-7 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-teal-950">
                            {practiceAreas[0].medicalSpecialtyName || 'Especialidade Médica'}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-200/60">
                            ZemdaMed
                          </span>
                        </div>
                        <p className="text-xs text-teal-800 mt-1">
                          Prescrições, anamnese estruturada e recursos clínicos pré-configurados para <strong>{practiceAreas[0].medicalSpecialtyName}</strong>.
                        </p>
                      </div>
                    </div>

                    {/* Subáreas / Áreas de Atuação daquela Especialidade Médica */}
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs sm:text-sm font-extrabold text-slate-800">
                        Áreas de Atuação / Subáreas de {practiceAreas[0].medicalSpecialtyName} (Opcional)
                      </label>
                      <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200/60">
                        {selectedPracticeAreaIds.length === 0
                          ? 'Nenhuma subárea • Geral'
                          : `${selectedPracticeAreaIds.length} selecionada(s)`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">
                      Selecione as subáreas em que você atua para enriquecer escalas e modelos especializados.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
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
                            className={`p-3 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer select-none ${
                              isSelected
                                ? 'border-teal-500 bg-teal-50/90 shadow-xs ring-1 ring-teal-500'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                            }`}
                          >
                            <div
                              className={`w-4.5 h-4.5 mt-0.5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                                isSelected
                                  ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className={`text-xs font-bold block truncate ${isSelected ? 'text-teal-950 font-black' : 'text-slate-800'}`}>
                                {area.name}
                              </span>
                              {area.description && (
                                <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                                  {area.description}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : practiceAreas.length === 1 && practiceAreas[0].isInferredForAlias ? (
                  /* CASO C: ALIAS DE OUTRAS PROFISSÕES (Neuropsicólogo, Psicanalista, etc.) */
                  <div>
                    {(() => {
                      const isApproach = String(practiceAreas[0].type || '').toUpperCase().includes('APPROACH');
                      return (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs sm:text-sm font-extrabold text-slate-800">
                              {isApproach ? 'Abordagem Clínica Vinculada' : 'Especialidade Vinculada'}
                            </label>
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                              Definida Automaticamente
                            </span>
                          </div>
                          <div className="p-3.5 rounded-2xl bg-teal-50/80 border border-teal-200/90 text-teal-950 flex items-start gap-3 shadow-2xs">
                            <div className="w-7 h-7 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                              <Check className="w-4 h-4 stroke-[3]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-black text-teal-950">
                                  {practiceAreas[0].name}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-200/60">
                                  {isApproach ? 'Abordagem' : 'Especialidade'}
                                </span>
                              </div>
                              <p className="text-xs text-teal-800 mt-1">
                                Recursos e diretrizes clínicas pré-configurados para <strong>{practiceAreas[0].name}</strong>.
                              </p>
                              <p className="text-[11px] text-slate-500 mt-2 border-t border-teal-200/60 pt-1.5">
                                💡 Caso atue em <strong>múltiplas especialidades</strong>, selecione a profissão genérica correspondente (ex: Odontologia ou Fisioterapia) para selecionar mais de uma.
                              </p>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  /* CASO D: PROFISSÕES CANÔNICAS GENÉRICAS (Fisioterapia, Odonto, Nutrição, etc.) */
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs sm:text-sm font-extrabold text-slate-800">
                        Áreas de Atuação & Abordagens Clínicas
                      </label>
                      <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200/60">
                        {selectedPracticeAreaIds.length === 0
                          ? 'Opcional • Selecione'
                          : `${selectedPracticeAreaIds.length} selecionada${selectedPracticeAreaIds.length > 1 ? 's' : ''}`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">
                      Escolha uma ou mais áreas para pré-configurar recursos clínicos, escalas e prescrições ideais.
                    </p>

                    {loadingPracticeAreas ? (
                      <div className="flex items-center justify-center p-6 text-xs text-slate-500 gap-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                        <span className="font-medium">Carregando áreas de atuação recomendadas...</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 sm:max-h-72 overflow-y-auto pr-1">
                        {practiceAreas.map(area => {
                          const isSelected = selectedPracticeAreaIds.includes(area.id);
                          const isApproach = (area.type || '').toUpperCase().includes('APPROACH');
                          return (
                            <button
                              type="button"
                              key={area.id}
                              onClick={() => {
                                setSelectedPracticeAreaIds(prev =>
                                  isSelected ? prev.filter(id => id !== area.id) : [...prev, area.id]
                                );
                              }}
                              className={`p-3 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer select-none ${
                                isSelected
                                  ? 'border-teal-500 bg-teal-50/90 shadow-xs ring-1 ring-teal-500'
                                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                              }`}
                            >
                              <div
                                className={`w-4.5 h-4.5 mt-0.5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                                  isSelected
                                    ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className={`text-xs font-bold truncate ${isSelected ? 'text-teal-950 font-black' : 'text-slate-800'}`}>
                                    {area.name}
                                  </span>
                                  <span
                                    className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wide shrink-0 ${
                                      isApproach
                                        ? 'bg-purple-100 text-purple-700 border border-purple-200/60'
                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200/60'
                                    }`}
                                  >
                                    {isApproach ? 'Abordagem' : 'Especialidade'}
                                  </span>
                                </div>
                                {area.description && (
                                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                                    {area.description}
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Campos de Registro Profissional */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Conselho Profissional (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: CRM, CREFITO, CRO, CRP..."
                      value={registrationType}
                      onChange={e => setRegistrationType(e.target.value)}
                      className="w-full px-4 py-3 sm:py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Número do Registro (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 12345/SP"
                      value={registrationNumber}
                      onChange={e => setRegistrationNumber(e.target.value)}
                      className="w-full px-4 py-3 sm:py-2.5 text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStep('plans');
                  }}
                  className="min-h-[48px] px-4 py-3 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs sm:text-sm rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar</span>
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 min-h-[48px] px-6 py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.99] text-white font-bold text-sm sm:text-base rounded-2xl shadow-lg shadow-teal-700/25 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Concluindo ativação...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span>Concluir e Acessar o Sistema</span>
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
