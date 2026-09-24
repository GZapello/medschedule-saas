import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { trackCompletedRegistration } from '../../utils/registrationAnalytics';
import { RegistrationProfessionSelect } from './RegistrationProfessionSelect';
import { RegistrationProfessionOption, REGISTRATION_PROFESSIONS } from '../../types/professions';
import {
  Building2,
  User,
  Mail,
  Lock,
  Phone,
  Briefcase,
  Award,
  CheckCircle2,
  ShieldCheck,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  KeyRound,
  RefreshCw,
  Eye,
  EyeOff,
  ExternalLink
} from 'lucide-react';

interface InviteRegisterViewProps {
  clinicSlug?: string;
  token: string;
  onBackToLogin: () => void;
  onSuccess?: () => void;
}

interface ValidInviteData {
  valid: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string;
  };
  role: string;
  expiresAt: string;
}

interface PracticeArea {
  id: string;
  name: string;
  slug?: string;
  isInferredForAlias?: boolean;
}

type InviteStep = 'initial_data' | 'profession' | 'security' | 'verify_email';

function maskEmail(emailStr: string): string {
  if (!emailStr || !emailStr.includes('@')) return emailStr;
  const [user, domain] = emailStr.split('@');
  if (user.length <= 2) return `${user}***@${domain}`;
  return `${user.slice(0, 2)}***${user.slice(-1)}@${domain}`;
}

export const InviteRegisterView: React.FC<InviteRegisterViewProps> = ({
  token,
  onBackToLogin,
  onSuccess
}) => {
  const { loginWithToken } = useAuth();
  const { showToast } = useToast();

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<{ message: string; code?: string } | null>(null);
  const [inviteData, setInviteData] = useState<ValidInviteData | null>(null);

  // Etapa atual (mesmo padrão de 4 etapas do Zemda)
  const [step, setStep] = useState<InviteStep>('initial_data');

  // Catálogo de profissões dinâmico
  const [professionOptions, setProfessionOptions] = useState<RegistrationProfessionOption[]>(REGISTRATION_PROFESSIONS || []);
  const [loadingProfessions, setLoadingProfessions] = useState(false);

  // Áreas de atuação dinâmicas da profissão selecionada
  const [availablePracticeAreas, setAvailablePracticeAreas] = useState<PracticeArea[]>([]);
  const [selectedPracticeAreaIds, setSelectedPracticeAreaIds] = useState<string[]>([]);
  const [loadingPracticeAreas, setLoadingPracticeAreas] = useState(false);

  // Formulário - Etapa 1: Dados Pessoais
  const [prefix, setPrefix] = useState<'Dr.' | 'Dra.' | ''>('Dr.');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Formulário - Etapa 2: Profissão & Registro
  const [selectedProfessionId, setSelectedProfessionId] = useState<string>('prof-fisioterapeuta');
  const [customProfession, setCustomProfession] = useState('');
  const [practiceAreasText, setPracticeAreasText] = useState('');
  const [registrationType, setRegistrationType] = useState('CREFITO');
  const [registrationNumber, setRegistrationNumber] = useState('');

  // Formulário - Etapa 3: Segurança
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(true);

  // Formulário - Etapa 4: Validação OTP por E-mail
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);

  // Submissão final
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Carrega catálogo de profissões dinâmico
  useEffect(() => {
    let isMounted = true;
    setLoadingProfessions(true);
    ApiClient.get<RegistrationProfessionOption[]>('/v1/taxonomy/professions')
      .then(data => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setProfessionOptions(data);
        }
      })
      .catch(() => {
        // Fallback para REGISTRATION_PROFESSIONS já carregado no estado inicial
      })
      .finally(() => {
        if (isMounted) setLoadingProfessions(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Timer para contagem regressiva de reenvio do código de verificação
  useEffect(() => {
    if (step === 'verify_email' && cooldownSeconds > 0) {
      const timer = setInterval(() => {
        setCooldownSeconds(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [step, cooldownSeconds]);

  // Valida o link do convite
  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      setLoadingInvite(true);
      setInviteError(null);
      const res = await ApiClient.get<ValidInviteData>('/v1/public/invites/' + token);
      if (res && res.valid) {
        setInviteData(res);
        if (res.role === 'receptionist' || res.role === 'secretary') {
          setSelectedProfessionId('prof-recepcionista');
          setPrefix('');
        }
      } else {
        setInviteError({
          message: 'Convite inválido ou não encontrado.',
          code: 'INVALID'
        });
      }
    } catch (err: any) {
      const errMsg = err.message || 'Erro ao validar link de convite';
      setInviteError({
        message: errMsg,
        code: err.code
      });
    } finally {
      setLoadingInvite(false);
    }
  };

  // Carrega áreas de atuação quando a profissão selecionada muda
  useEffect(() => {
    if (!selectedProfessionId) {
      setAvailablePracticeAreas([]);
      setSelectedPracticeAreaIds([]);
      return;
    }

    let isMounted = true;
    setLoadingPracticeAreas(true);

    const loadAreas = async () => {
      try {
        let resData: any = null;
        try {
          resData = await ApiClient.get<any>(`/v1/taxonomy/practice-areas?professionId=${encodeURIComponent(selectedProfessionId)}`);
        } catch {
          resData = await ApiClient.get<any>(`/v1/capabilities/practice-areas?professionId=${encodeURIComponent(selectedProfessionId)}`);
        }

        const items: PracticeArea[] = Array.isArray(resData)
          ? resData
          : (resData?.data || resData?.items || []);

        if (!isMounted) return;
        setAvailablePracticeAreas(items);

        // Se for alias com área única inferida, auto-seleciona
        const inferred = items.find(a => a.isInferredForAlias);
        if (inferred) {
          setSelectedPracticeAreaIds([inferred.id]);
        } else {
          setSelectedPracticeAreaIds([]);
        }
      } catch {
        if (isMounted) {
          setAvailablePracticeAreas([]);
          setSelectedPracticeAreaIds([]);
        }
      } finally {
        if (isMounted) setLoadingPracticeAreas(false);
      }
    };

    loadAreas();

    return () => {
      isMounted = false;
    };
  }, [selectedProfessionId]);

  // Atualiza conselho e prefixo quando a profissão muda
  const handleProfessionChange = (profId: string) => {
    setSelectedProfessionId(profId);
    const opt = professionOptions.find(p => p.id === profId);
    if (!opt) return;

    if (opt.boardLabel) {
      setRegistrationType(opt.boardLabel);
    } else {
      const low = opt.label.toLowerCase();
      if (low.includes('fisio')) setRegistrationType('CREFITO');
      else if (low.includes('psic') || low.includes('psicanal')) setRegistrationType('CRP');
      else if (low.includes('médic') || low.includes('medic')) setRegistrationType('CRM');
      else if (low.includes('fono')) setRegistrationType('CRFa');
      else if (low.includes('nutri')) setRegistrationType('CRN');
      else if (low.includes('terapeuta ocupacional')) setRegistrationType('CREFITO');
      else if (low.includes('personal') || low.includes('educad')) setRegistrationType('CREF');
      else if (low.includes('odonto') || low.includes('dentis')) setRegistrationType('CRO');
      else setRegistrationType('Registro');
    }

    const low = opt.label.toLowerCase();
    if (low.includes('personal') || low.includes('educa') || opt.administrative) {
      setPrefix('');
    } else if (!prefix) {
      setPrefix('Dr.');
    }
  };

  const selectedOption = professionOptions.find(p => p.id === selectedProfessionId);
  const isAdministrative = selectedOption?.administrative ||
    selectedProfessionId.includes('recepcionista') ||
    selectedProfessionId.includes('secretaria') ||
    selectedProfessionId.includes('administrativo');

  const finalProfessionName = selectedProfessionId === 'prof-outro'
    ? (customProfession.trim() || 'Outro')
    : (selectedOption?.canonicalName || selectedOption?.label || selectedProfessionId);

  const togglePracticeArea = (areaId: string) => {
    setSelectedPracticeAreaIds(prev =>
      prev.includes(areaId) ? prev.filter(id => id !== areaId) : [...prev, areaId]
    );
  };

  // Máscara de telefone/celular
  const handlePhoneChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 11);
    let formatted = raw;
    if (raw.length > 2) {
      formatted = `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
    }
    if (raw.length > 7) {
      formatted = `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
    }
    setPhone(formatted);
  };

  // Navegação: Etapa 1 -> Etapa 2
  const handleNextFromInitialData = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Informe seu nome completo', 'error');
      return;
    }
    if (!email.trim() || !email.includes('@') || !email.includes('.')) {
      showToast('Informe um e-mail válido para receber o código de confirmação', 'error');
      return;
    }
    setStep('profession');
  };

  // Navegação: Etapa 2 -> Etapa 3
  const handleNextFromProfession = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProfessionId === 'prof-outro' && !customProfession.trim()) {
      showToast('Informe o nome da sua profissão', 'error');
      return;
    }
    setStep('security');
  };

  // Navegação: Etapa 3 -> Envio do código e avanço para Etapa 4
  const handleSendCodeAndAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 6) {
      showToast('A senha deve possuir pelo menos 6 caracteres', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('As senhas digitadas não coincidem', 'error');
      return;
    }
    if (!acceptTerms) {
      showToast('É necessário aceitar os Termos de Uso e a Política de Privacidade', 'error');
      return;
    }

    try {
      setIsSendingCode(true);
      const res = await ApiClient.post<{ success: boolean; message: string; cooldownSeconds?: number }>(
        '/v1/public/email/request-code',
        {
          email: email.trim().toLowerCase(),
          purpose: 'invite_registration'
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
      showToast(err.message || 'Erro ao enviar código de verificação. Tente novamente.', 'error');
    } finally {
      setIsSendingCode(false);
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
          email: email.trim().toLowerCase(),
          purpose: 'invite_registration'
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

  // Controle dos campos segmentados OTP de 6 dígitos
  const handleOtpChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    const newDigits = [...otpDigits];

    if (!clean) {
      newDigits[index] = '';
      setOtpDigits(newDigits);
      return;
    }

    if (clean.length === 1) {
      newDigits[index] = clean;
      setOtpDigits(newDigits);
      if (index < 5) {
        otpInputRefs.current[index + 1]?.focus();
      }
      return;
    }

    // Colagem de múltiplos dígitos
    const chars = clean.slice(0, 6).split('');
    chars.forEach((c, i) => {
      if (i < 6) newDigits[i] = c;
    });
    setOtpDigits(newDigits);
    const nextEmpty = newDigits.findIndex(d => !d);
    if (nextEmpty !== -1) {
      otpInputRefs.current[nextEmpty]?.focus();
    } else {
      otpInputRefs.current[5]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...otpDigits];
    pasted.split('').forEach((ch, idx) => {
      newDigits[idx] = ch;
    });
    setOtpDigits(newDigits);
    const targetIdx = Math.min(pasted.length, 5);
    otpInputRefs.current[targetIdx]?.focus();
  };

  // Concluir cadastro com código validado
  const handleVerifyOtpAndComplete = async (e: React.FormEvent) => {
    e.preventDefault();

    const code = otpDigits.join('').trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      showToast('Por favor, digite o código completo de 6 dígitos numéricos.', 'error');
      return;
    }

    try {
      setSubmitting(true);

      // 1. Valida o código OTP e obtém o emailVerificationToken
      const verifyRes = await ApiClient.post<{ success: boolean; emailVerificationToken: string; message: string }>(
        '/v1/public/email/verify-code',
        {
          email: email.trim().toLowerCase(),
          code,
          purpose: 'invite_registration'
        }
      );

      if (!verifyRes.emailVerificationToken) {
        throw new Error('Falha ao autenticar verificação de e-mail.');
      }

      // 2. Consolida áreas de atuação
      const selectedNames = availablePracticeAreas
        .filter(a => selectedPracticeAreaIds.includes(a.id))
        .map(a => a.name);
      const combinedAreasText = [
        ...selectedNames,
        ...(practiceAreasText ? practiceAreasText.split(',').map(s => s.trim()).filter(Boolean) : [])
      ].filter((v, i, a) => a.indexOf(v) === i).join(', ');

      // 3. Submete o registro pelo convite com o emailVerificationToken
      const res = await ApiClient.post<{ message: string; token: string; user: any; clinic: any }>(
        '/v1/auth/register-invite',
        {
          token,
          emailVerificationToken: verifyRes.emailVerificationToken,
          name: name.trim(),
          prefix: !isAdministrative && prefix ? prefix : undefined,
          email: email.trim().toLowerCase(),
          password,
          phone: phone.trim() || undefined,
          professionId: selectedOption?.id || selectedProfessionId,
          professionName: finalProfessionName,
          practiceAreas: combinedAreasText || undefined,
          practiceAreaIds: selectedPracticeAreaIds,
          registrationType: !isAdministrative ? registrationType || selectedOption?.boardLabel || undefined : undefined,
          registrationNumber: !isAdministrative ? registrationNumber.trim() || undefined : undefined
        }
      );

      if (res.token && res.user?.id) {
        trackCompletedRegistration(res.user.id);
      }

      setIsSuccess(true);
      showToast(res.message || 'Cadastro concluído com sucesso!', 'success');

      if (res.token && res.user) {
        loginWithToken(res.token, res.user);
      }

      // Transição direta para o Dashboard do novo profissional
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          try {
            sessionStorage.setItem('activeView', 'dashboard');
          } catch (_) {}
          window.history.replaceState({}, '', '/dashboard');
          window.location.assign('/dashboard');
        }
      }, 700);
    } catch (err: any) {
      const errMsg = err.message || 'Erro ao concluir cadastro por convite';
      showToast(errMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Estado de Carregamento
  if (loadingInvite) {
    return (
      <div className="min-h-screen bg-[#fafbfc] text-slate-800 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-teal-100/60 via-emerald-50/30 to-transparent blur-3xl -z-10 pointer-events-none" />
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2 select-none">
            <div className="flex items-center justify-center gap-3 mb-1">
              <img src="/brand/zemda-icon.png" alt="Zemda" className="w-12 h-12 object-contain drop-shadow-sm" />
              <div className="flex items-center gap-1.5">
                <span className="text-3xl font-black text-slate-950 tracking-tight">Zemda</span>
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              </div>
            </div>
            <p className="text-xs text-teal-700 font-bold uppercase tracking-widest">Saúde e Gestão em Harmonia</p>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-teal-900/5 border border-slate-200/80 text-center space-y-4">
            <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-600 text-xs font-semibold">Validando convite da clínica...</p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Estado de Erro / Convite Inválido / Expirado
  if (inviteError || !inviteData) {
    return (
      <div className="min-h-screen bg-[#fafbfc] text-slate-800 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-teal-100/60 via-emerald-50/30 to-transparent blur-3xl -z-10 pointer-events-none" />
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2 select-none">
            <div className="flex items-center justify-center gap-3 mb-1">
              <img src="/brand/zemda-icon.png" alt="Zemda" className="w-12 h-12 object-contain drop-shadow-sm" />
              <div className="flex items-center gap-1.5">
                <span className="text-3xl font-black text-slate-950 tracking-tight">Zemda</span>
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              </div>
            </div>
            <p className="text-xs text-teal-700 font-bold uppercase tracking-widest">Saúde e Gestão em Harmonia</p>
          </div>

          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-teal-900/5 border border-slate-200/80 text-center space-y-4">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-200 shadow-inner">
              <XCircle className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">Link de Convite Indisponível</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {inviteError?.message || 'Este convite não é mais válido, foi cancelado ou já foi utilizado.'}
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 text-left space-y-1">
              <p className="font-semibold text-slate-800">O que fazer agora?</p>
              <p>• Solicite ao gestor da clínica a emissão de um novo link de convite.</p>
              <p>• Caso já possua uma conta cadastrada, você pode fazer login diretamente.</p>
            </div>

            <button
              type="button"
              onClick={onBackToLogin}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              Ir para tela de login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Estado de Sucesso Imediato
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#fafbfc] text-slate-800 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-teal-100/60 via-emerald-50/30 to-transparent blur-3xl -z-10 pointer-events-none" />
        <div className="w-full max-w-md space-y-6">
          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-teal-900/5 border border-slate-200/80 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200 shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-slate-900">Cadastro Concluído!</h3>
              <p className="text-xs text-slate-600">
                Você foi vinculado com sucesso à clínica <strong>{inviteData.tenant.name}</strong>.
              </p>
            </div>
            <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-teal-600 font-semibold">Redirecionando para o seu Dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  // Determina número e título da etapa atual
  const stepNumber = step === 'initial_data' ? 1 : step === 'profession' ? 2 : step === 'security' ? 3 : 4;
  const stepPercentage = stepNumber === 1 ? '25%' : stepNumber === 2 ? '50%' : stepNumber === 3 ? '75%' : '100%';
  const stepTitles = [
    'Dados Pessoais',
    'Profissão & Atuação',
    'Segurança da Conta',
    'Confirmação de E-mail'
  ];

  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-800 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Glow de fundo característico do Zemda */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-teal-100/60 via-emerald-50/30 to-transparent blur-3xl -z-10 pointer-events-none" />

      <div className="w-full max-w-2xl space-y-5">
        {/* Barra superior de retorno */}
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={onBackToLogin}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 hover:text-teal-700 text-xs font-semibold border border-slate-200/80 shadow-xs transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-teal-600" />
            <span>Voltar ao login</span>
          </button>

          <span className="text-[11px] font-bold text-slate-400">
            Zemda • Cadastro de Colaborador
          </span>
        </div>

        {/* Brand Header */}
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

        {/* Card Principal Unificado com o Cadastro Padrão */}
        <div className="bg-white rounded-3xl shadow-xl shadow-teal-900/5 border border-slate-200/80 overflow-hidden text-left">
          {/* Banner de Apresentação da Clínica Convidante */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-teal-50 to-emerald-50 border-b border-teal-100/80 flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-teal-600/20">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="space-y-0.5 flex-1 min-w-0">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-teal-700 block">
                Você está entrando em:
              </span>
              <h3 className="text-sm sm:text-base font-black text-slate-900 truncate">
                {inviteData.tenant.name}
              </h3>
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                <span>
                  Função:{' '}
                  <strong className="text-slate-800 capitalize font-bold">
                    {inviteData.role === 'professional' ? 'Profissional de Saúde' : inviteData.role}
                  </strong>
                </span>
                <span>•</span>
                <span className="text-teal-700 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                  Vínculo automático configurado
                </span>
              </div>
            </div>
          </div>

          {/* Barra de Progresso das 4 Etapas */}
          <div className="px-5 pt-4 pb-3 sm:px-6 border-b border-slate-100 bg-slate-50/70">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-black bg-teal-700 text-white shadow-xs">
                  {stepNumber} de 4
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-800">
                  {stepTitles[stepNumber - 1]}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-500">
                {stepPercentage}
              </div>
            </div>

            <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300 rounded-full"
                style={{ width: stepPercentage }}
              />
            </div>
          </div>

          {/* Conteúdo da Etapa */}
          <div className="p-5 sm:p-7">
            {/* ETAPA 1: DADOS PESSOAIS */}
            {step === 'initial_data' && (
              <form onSubmit={handleNextFromInitialData} className="space-y-5">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-slate-900">Identificação do Profissional</h4>
                  <p className="text-xs text-slate-500">
                    Preencha suas informações de contato para receber comunicações e notificações da clínica.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Nome Completo & Prefixo */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nome Completo <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      {!isAdministrative && (
                        <select
                          value={prefix}
                          onChange={e => setPrefix(e.target.value as any)}
                          className="w-24 px-2 py-2.5 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                        >
                          <option value="Dr.">Dr.</option>
                          <option value="Dra.">Dra.</option>
                          <option value="">Sem título</option>
                        </select>
                      )}
                      <div className="relative flex-1">
                        <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          required
                          placeholder="Seu nome completo"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* E-mail */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      E-mail de Acesso <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        required
                        placeholder="seuemail@exemplo.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Um código de 6 dígitos será enviado a este endereço para confirmação.
                    </p>
                  </div>

                  {/* Celular / WhatsApp */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Celular / WhatsApp
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel"
                        placeholder="(11) 99999-9999"
                        value={phone}
                        onChange={e => handlePhoneChange(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3 flex justify-end">
                  <button
                    type="submit"
                    className="min-h-[46px] px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-teal-700/20 cursor-pointer flex items-center gap-2 transition-all"
                  >
                    <span>Próximo: Profissão & Registro</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}

            {/* ETAPA 2: PROFISSÃO & REGISTRO */}
            {step === 'profession' && (
              <form onSubmit={handleNextFromProfession} className="space-y-5">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-slate-900">Profissão & Áreas de Atuação</h4>
                  <p className="text-xs text-slate-500">
                    Selecione sua formação clínica oficial para liberação dos módulos específicos e prontuários correspondentes.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Seletor Oficial de Profissão */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Profissão <span className="text-rose-500">*</span>
                    </label>
                    <RegistrationProfessionSelect
                      value={selectedProfessionId}
                      onChange={handleProfessionChange}
                      options={professionOptions}
                      loading={loadingProfessions}
                    />
                  </div>

                  {/* Campo aberto se selecionado "Outro" */}
                  {selectedProfessionId === 'prof-outro' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Especifique sua profissão <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Musicoterapeuta, Quiropraxista..."
                        value={customProfession}
                        onChange={e => setCustomProfession(e.target.value)}
                        className="w-full px-3 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  )}

                  {/* Áreas de Atuação Dinâmicas */}
                  {!isAdministrative && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700">
                        Áreas de Atuação / Subespecialidades
                      </label>
                      {loadingPracticeAreas ? (
                        <div className="p-3 bg-slate-50 rounded-xl text-center text-xs text-slate-400">
                          Carregando especialidades da profissão...
                        </div>
                      ) : availablePracticeAreas.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1 bg-slate-50/50 rounded-xl border border-slate-100">
                          {availablePracticeAreas.map(area => {
                            const isSelected = selectedPracticeAreaIds.includes(area.id);
                            return (
                              <button
                                key={area.id}
                                type="button"
                                onClick={() => togglePracticeArea(area.id)}
                                className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'
                                }`}
                              >
                                {area.name}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <input
                          type="text"
                          placeholder="Ex: Traumato-Ortopedia, Esportiva, Pilates (opcional)"
                          value={practiceAreasText}
                          onChange={e => setPracticeAreasText(e.target.value)}
                          className="w-full px-3 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                        />
                      )}
                    </div>
                  )}

                  {/* Conselho e Registro Profissional */}
                  {!isAdministrative && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Conselho Profissional
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: CREFITO, CRP, CRM..."
                          value={registrationType}
                          onChange={e => setRegistrationType(e.target.value)}
                          className="w-full px-3 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Número do Registro
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: 123456-F"
                          value={registrationNumber}
                          onChange={e => setRegistrationNumber(e.target.value)}
                          className="w-full px-3 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep('initial_data')}
                    className="min-h-[46px] px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs sm:text-sm rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Voltar</span>
                  </button>

                  <button
                    type="submit"
                    className="min-h-[46px] px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-teal-700/20 cursor-pointer flex items-center gap-2 transition-all"
                  >
                    <span>Próximo: Segurança</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}

            {/* ETAPA 3: SEGURANÇA */}
            {step === 'security' && (
              <form onSubmit={handleSendCodeAndAdvance} className="space-y-5">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-slate-900">Segurança da Conta</h4>
                  <p className="text-xs text-slate-500">
                    Crie sua senha de acesso e confirme a aceitação dos termos de uso da plataforma.
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Senha */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Criar Senha de Acesso <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        placeholder="Mínimo de 6 caracteres"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full pl-9 pr-10 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirmação de Senha */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Confirmar Senha <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        placeholder="Repita a senha criada"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="w-full pl-9 pr-10 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Aceite de Termos de Uso e LGPD */}
                  <div className="pt-2">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={acceptTerms}
                        onChange={e => setAcceptTerms(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500"
                      />
                      <span className="text-[11px] text-slate-600 leading-relaxed">
                        Declaro que li e concordo com os{' '}
                        <a
                          href="/termos"
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold text-teal-700 hover:underline"
                        >
                          Termos de Uso
                        </a>{' '}
                        e a{' '}
                        <a
                          href="/privacidade"
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold text-teal-700 hover:underline"
                        >
                          Política de Privacidade
                        </a>{' '}
                        do Zemda.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep('profession')}
                    className="min-h-[46px] px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs sm:text-sm rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Voltar</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isSendingCode}
                    className="min-h-[46px] px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-teal-700/20 cursor-pointer flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isSendingCode ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Enviando código...</span>
                      </>
                    ) : (
                      <>
                        <span>Avançar para Confirmação de E-mail</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* ETAPA 4: CONFIRMAÇÃO DE E-MAIL (OTP) */}
            {step === 'verify_email' && (
              <form onSubmit={handleVerifyOtpAndComplete} className="space-y-6">
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
                    <span>{maskEmail(email)}</span>
                    <button
                      type="button"
                      onClick={() => setStep('initial_data')}
                      className="text-[11px] text-teal-600 hover:text-teal-800 underline font-semibold ml-1 cursor-pointer"
                    >
                      (Alterar)
                    </button>
                  </div>
                </div>

                {/* 6 Inputs Segmentados */}
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
                      O código é válido por <strong>10 minutos</strong>. Verifique também sua caixa de spam ou lixo eletrônico.
                    </p>
                  </div>
                </div>

                {/* Reenvio com Cooldown */}
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

                {/* Ações */}
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
                    type="submit"
                    disabled={submitting || otpDigits.join('').length !== 6}
                    className="flex-1 min-h-[48px] px-6 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-md shadow-teal-700/20 cursor-pointer flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Concluindo Cadastro...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirmar e Entrar na Clínica</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
