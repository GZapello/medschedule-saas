import React, { useState, useRef, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Building2,
  User,
  Mail,
  Phone,
  Lock,
  MapPin,
  CheckCircle2,
  X,
  Search,
  ShieldCheck,
  FileText,
  Award,
  Briefcase,
  ExternalLink,
  Activity,
  ArrowLeft,
  RefreshCw,
  KeyRound,
  AlertCircle,
  Sparkles
} from 'lucide-react';

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

  const [searchingCep, setSearchingCep] = useState(false);
  const [successData, setSuccessData] = useState<{ clinicId: string; slug: string; message: string } | null>(null);
  const [marketingAccepted, setMarketingAccepted] = useState(false);

  const [formData, setFormData] = useState({
    responsibleName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    clinicName: '',
    tradeName: '',
    cnpjCpf: '',
    cep: '',
    city: '',
    state: '',
    termsAccepted: false,
    privacyAccepted: false,
    managerProfession: 'Fisioterapia',
    managerPracticeAreas: '',
    managerRegistrationType: 'CREFITO',
    managerRegistrationNumber: '',
    zemdaBodyEnabled: true
  });

  const PRACTICE_AREAS_SUGGESTIONS: Record<string, string[]> = {
    Fisioterapia: [
      'Traumato-Ortopédica',
      'Neurológica / Neurofuncional',
      'Respiratória / Cardiovascular',
      'Pélvica / Saúde da Mulher',
      'Fisioterapia Pediátrica',
      'Fisioterapia Esportiva',
      'Dermatofuncional',
      'Gerontologia',
      'Fisioterapia Geral',
      'Pilates Clínico',
      'Reabilitação Vestibular'
    ],
    Psicologia: [
      'Psicologia Clínica',
      'Terapia Cognitivo-Comportamental (TCC)',
      'Psicanálise',
      'Psicologia Infantil / Escolar',
      'Neuropsicologia / Avaliação',
      'Terapia Familiar e de Casal',
      'Transtornos de Ansiedade e Humor',
      'TEA / TDAH'
    ],
    Medicina: [
      'Clínica Geral',
      'Pediatria',
      'Psiquiatria',
      'Ortopedia e Traumatologia',
      'Neurologia',
      'Medicina da Família e Comunidade',
      'Cardiologia',
      'Geriatria'
    ],
    Fonoaudiologia: [
      'Linguagem e Fala',
      'Voz Clínica e Profissional',
      'Audiologia Clínica',
      'Motricidade Orofacial',
      'Disfagia',
      'Fonoaudiologia Pediátrica e Escolar',
      'Neurofonoaudiologia'
    ],
    Nutrição: [
      'Nutrição Clínica',
      'Nutrição Esportiva',
      'Nutrição Comportamental',
      'Saúde Materno-Infantil',
      'Doenças Crônicas e Emagrecimento',
      'Reeducação Alimentar'
    ],
    'Terapia Ocupacional': [
      'Integração Sensorial',
      'Desenvolvimento Infantil',
      'Reabilitação Física e Neurológica',
      'Saúde Mental',
      'Gerontologia / Autonomia'
    ],
    'Personal Trainer': [
      'Musculação e Hipertrofia',
      'Emagrecimento e Queima Calórica',
      'Treinamento Funcional',
      'Condicionamento Físico e Corrida',
      'Reabilitação e Prevenção de Lesões',
      'Treinamento para Terceira Idade',
      'Preparação Esportiva e Performance',
      'Consultoria Online e Presencial'
    ],
    Odontologia: [
      'Clínica Geral Odontológica',
      'Ortodontia',
      'Implantodontia',
      'Endodontia (Canal)',
      'Periodontia',
      'Prótese Dentária',
      'Harmonização Orofacial',
      'Odontopediatria',
      'Cirurgia Bucomaxilofacial'
    ],
    Psicopedagogia: [
      'Psicopedagogia Clínica',
      'Psicopedagogia Institucional / Escolar',
      'Dificuldades e Transtornos de Aprendizagem',
      'Dislexia e Disortografia',
      'Discalculia e Raciocínio Lógico',
      'Estimulação de Funções Executivas e TDAH',
      'Intervenção Precoce e Neuroaprendizagem',
      'Orientação Familiar e Escolar',
      'Adaptação Curricular e Inclusão'
    ]
  };

  const getSuggestionsForProfession = (prof: string): string[] => {
    const low = prof.toLowerCase();
    if (low.includes('psicopedag') || low.includes('abpp')) return PRACTICE_AREAS_SUGGESTIONS['Psicopedagogia'];
    if (low.includes('fono')) return PRACTICE_AREAS_SUGGESTIONS['Fonoaudiologia'];
    if (low.includes('psic') || low.includes('terapeuta cognitivo') || low.includes('psicanalista')) return PRACTICE_AREAS_SUGGESTIONS['Psicologia'];
    if (low.includes('terapeuta ocupacional') || low.includes('terapia ocupacional') || low.includes('ocupacional')) return PRACTICE_AREAS_SUGGESTIONS['Terapia Ocupacional'];
    if (low.includes('nutri')) return PRACTICE_AREAS_SUGGESTIONS['Nutrição'];
    if (low.includes('fisio')) return PRACTICE_AREAS_SUGGESTIONS['Fisioterapia'];
    if (low.includes('personal') || low.includes('educad') || low.includes('educação')) return PRACTICE_AREAS_SUGGESTIONS['Personal Trainer'];
    if (low.includes('odonto') || low.includes('dentis')) return PRACTICE_AREAS_SUGGESTIONS['Odontologia'];
    if (low.includes('médic') || low.includes('medic') || low.includes('psiquiat') || low.includes('pediat')) return PRACTICE_AREAS_SUGGESTIONS['Medicina'];
    return [];
  };

  const handleManagerProfessionChange = (val: string) => {
    let regType = formData.managerRegistrationType;
    const low = val.toLowerCase();
    if (low.includes('psicopedag') || low.includes('abpp')) {
      regType = 'ABPp';
    } else if (low.includes('fono')) {
      regType = 'CRFa';
    } else if (low.includes('psic')) {
      regType = 'CRP';
    } else if (low.includes('terapeuta ocupacional') || low.includes('terapia ocupacional') || low.includes('ocupacional')) {
      regType = 'CREFITO';
    } else if (low.includes('nutri')) {
      regType = 'CRN';
    } else if (low.includes('fisio')) {
      regType = 'CREFITO';
    } else if (low.includes('personal') || low.includes('educad') || low.includes('educação')) {
      regType = 'CREF';
    } else if (low.includes('odonto') || low.includes('dentis')) {
      regType = 'CRO';
    } else if (low.includes('médic') || low.includes('medic') || low.includes('psiquiat') || low.includes('pediat')) {
      regType = 'CRM';
    } else if (low.includes('gestão') || low.includes('administrativ')) {
      regType = '';
    } else {
      regType = 'Registro';
    }
    setFormData(prev => ({
      ...prev,
      managerProfession: val,
      managerRegistrationType: regType
    }));
  };

  const toggleManagerPracticeArea = (area: string) => {
    const currentAreas = formData.managerPracticeAreas
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    let updated: string[];
    if (currentAreas.includes(area)) {
      updated = currentAreas.filter(a => a !== area);
    } else {
      updated = [...currentAreas, area];
    }
    setFormData(prev => ({
      ...prev,
      managerPracticeAreas: updated.join(', ')
    }));
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

  const handleCepSearch = async () => {
    const cleanCep = formData.cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      showToast('Digite um CEP válido com 8 dígitos', 'error');
      return;
    }

    try {
      setSearchingCep(true);
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();

      if (data.erro) {
        showToast('CEP não encontrado na base dos Correios', 'error');
        return;
      }

      setFormData(prev => ({
        ...prev,
        city: data.localidade || prev.city,
        state: data.uf || prev.state
      }));
      showToast(`Localizado: ${data.localidade}/${data.uf}`, 'success');
    } catch {
      showToast('Erro ao consultar CEP. Preencha manualmente.', 'error');
    } finally {
      setSearchingCep(false);
    }
  };

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

    if (!formData.responsibleName || !formData.email || !formData.password || !formData.clinicName) {
      showToast('Preencha os campos obrigatórios marcados com *', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      showToast('Informe um e-mail válido', 'error');
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

      // 2. Realizar cadastro definitivo da clínica com o emailVerificationToken
      const data = await ApiClient.post<any>('/v1/public/tenants/register', {
        responsibleName: formData.responsibleName,
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone,
        password: formData.password,
        clinicName: formData.clinicName,
        tradeName: formData.tradeName || formData.clinicName,
        cnpjCpf: formData.cnpjCpf,
        city: formData.city,
        state: formData.state,
        termsAccepted: formData.termsAccepted,
        privacyAccepted: formData.privacyAccepted,
        marketingAccepted: marketingAccepted,
        managerProfession: formData.managerProfession,
        managerPracticeAreas: formData.managerPracticeAreas || undefined,
        managerRegistrationType: formData.managerProfession !== 'Apenas Gestão / Administrativo' ? formData.managerRegistrationType : undefined,
        managerRegistrationNumber: formData.managerProfession !== 'Apenas Gestão / Administrativo' ? formData.managerRegistrationNumber : undefined,
        zemdaBodyEnabled: formData.zemdaBodyEnabled,
        emailVerificationToken: verifyRes.emailVerificationToken,
        startTrial: isSoloTrial,
        planCode: isSoloTrial ? 'SOLO' : (initialPlan || undefined)
      });

      if (data.token && data.user) {
        // Autenticação automática segura através do token de sessão retornado
        loginWithToken(data.token, data.user, data.tenant);
        if (isSoloTrial || data.trialStarted) {
          showToast('E-mail verificado! Seu teste grátis de 7 dias do Zemda Solo está ativo.', 'success');
          handleModalClose();
          window.history.pushState(null, '', '/');
          window.dispatchEvent(new PopStateEvent('popstate'));
          window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'dashboard' } }));
          return;
        }
        showToast('E-mail verificado e clínica cadastrada com sucesso! Redirecionando para escolha do plano...', 'success');
        handleModalClose();
        // Redireciona diretamente para /assinatura
        window.history.pushState(null, '', '/assinatura');
        window.dispatchEvent(new PopStateEvent('popstate'));
        window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'subscription' } }));
        return;
      }

      // Fallback gracioso se a sessão não puder ser gerada automaticamente
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
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100 my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-teal-900 p-6 text-white flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[11px] font-bold tracking-wider uppercase mb-1">
              <Building2 className="w-3.5 h-3.5 text-teal-400" />
              {step === 'verify_email' ? 'Etapa 2: Validação de Segurança' : 'Plataforma Multi-Clínicas Zemda'}
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">
              {step === 'verify_email' ? 'Confirmar E-mail do Gestor' : 'Criar Minha Clínica'}
            </h2>
            <p className="text-xs text-teal-200/90">
              {step === 'verify_email'
                ? 'Insira o código de 6 dígitos enviado para validar seu e-mail antes de criar a clínica.'
                : 'Cadastre seu estabelecimento para ter seu próprio ambiente exclusivo na plataforma.'}
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
                Clínica cadastrada!
              </h3>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left text-xs text-amber-900 space-y-2">
                <p className="font-bold flex items-center gap-1.5 text-amber-800">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  Próximo passo: escolher o plano
                </p>
                <p>
                  Entre com o e-mail e a senha cadastrados para escolher o plano e concluir o pagamento no checkout seguro do Asaas.
                </p>
                <p className="font-semibold text-slate-700">
                  Após a confirmação do pagamento, seu acesso será liberado e você poderá concluir a configuração inicial da clínica.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200 text-left space-y-1">
                <p><strong>Clínica:</strong> {formData.clinicName}</p>
                <p><strong>Responsável:</strong> {formData.responsibleName}</p>
                <p><strong>E-mail de Acesso:</strong> {formData.email}</p>
              </div>

              <button
                onClick={()=>window.location.assign('/assinatura')}
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
                    O código é válido por <strong>10 minutos</strong>. Caso não o localize, verifique também sua caixa de spam ou promoções.
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
                      Confirmar e Criar Conta
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRequestOtp} className="space-y-6">
              {/* Informação sobre ambiente exclusivo e configuração inicial */}
              {isSoloTrial ? (
                <div className="p-4 bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-50 border border-teal-200 rounded-2xl text-xs text-teal-950 flex items-start gap-3 shadow-xs">
                  <Sparkles className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold text-teal-900 block text-sm">
                      Teste Grátis de 7 Dias — Exclusivo Zemda Solo
                    </span>
                    <p className="text-teal-800/90 mt-0.5 leading-relaxed">
                      Acesso imediato a todas as funcionalidades do Zemda (agenda, prontuário, documentos, financeiro, IA e ZemdaBody) para 1 usuário. Sem cobrança hoje e sem compromisso.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-teal-50/80 border border-teal-100 rounded-2xl text-xs text-teal-950 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                  <p>
                    Cada clínica possui um ambiente exclusivo e protegido. Após confirmar seu e-mail, você poderá escolher o plano e concluir a configuração inicial da sua clínica.
                  </p>
                </div>
              )}

              {/* Seção 1: Dados do Responsável / Gestor */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-teal-600" />
                  1. Dados do Gestor Responsável
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nome do Responsável *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Dra. Mariana Albuquerque"
                      value={formData.responsibleName}
                      onChange={e => setFormData({ ...formData, responsibleName: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      E-mail de Acesso *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="mariana@clinicaprime.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Telefone / Celular
                    </label>
                    <input
                      type="text"
                      placeholder="(11) 98765-4321"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Senha de Acesso (Mínimo 6 caracteres) *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Confirme sua Senha *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  {/* Atuação Profissional do Gerenciador / Admin */}
                  <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                    <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-teal-600" />
                      Área de Atuação Profissional do Responsável / Gerenciador *
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      O gerenciador possui duplo papel: gestão administrativa da clínica e atuação nos atendimentos conforme sua profissão.
                    </p>
                    <select
                      value={formData.managerProfession}
                      onChange={e => handleManagerProfessionChange(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="Psicopedagogia">Psicopedagogia → ZemdaPP (CBO 2394-25)</option>
                      <option value="Fonoaudiologia">Fonoaudiologia → ZemdaFono</option>
                      <option value="Psicologia">Psicologia → ZemdaPsico</option>
                      <option value="Terapia Ocupacional">Terapia Ocupacional → ZemdaTO</option>
                      <option value="Nutrição">Nutrição → ZemdaNutri</option>
                      <option value="Fisioterapia">Fisioterapia → ZemdaFisio</option>
                      <option value="Personal Trainer">Personal Trainer → ZemdaPersonal</option>
                      <option value="Odontologia">Odontologia/Dentista → ZemdaOdonto</option>
                      <option value="Medicina">Medicina / Médico</option>
                      <option value="Apenas Gestão / Administrativo">Gestão Administrativa</option>
                      <option value="Outro">Outro profissional da saúde</option>
                    </select>

                    <div className="mt-2.5 p-3 rounded-xl bg-teal-50/70 border border-teal-200/80 flex items-center gap-2.5">
                      <Activity className="w-4 h-4 text-teal-700 shrink-0" />
                      <p className="text-[11px] text-teal-900 font-medium leading-relaxed">
                        <strong className="font-bold">ZemdaBody Incluso:</strong> O Mapa Corporal e Avaliação Física são ativados automaticamente para todos os profissionais clínicos da sua clínica.
                      </p>
                    </div>
                  </div>

                  {formData.managerProfession !== 'Apenas Gestão / Administrativo' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Conselho / Associação / Registro Profissional
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: ABPp, CRFa, CRP, CREFITO, CRN, CREF, CRO, CRM"
                          value={formData.managerRegistrationType}
                          onChange={e => setFormData({ ...formData, managerRegistrationType: e.target.value })}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500 uppercase"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Número do Registro
                        </label>
                        <div className="relative">
                          <Award className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Ex: 12345-F / SP"
                            value={formData.managerRegistrationNumber}
                            onChange={e => setFormData({ ...formData, managerRegistrationNumber: e.target.value })}
                            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-bold text-slate-700">
                            Especialidades / Áreas de Atuação
                          </label>
                          <span className="text-[10px] text-slate-400 font-medium">Definido no cadastro</span>
                        </div>

                        {getSuggestionsForProfession(formData.managerProfession).length > 0 && (
                          <div className="mb-2">
                            <span className="text-[10px] text-slate-500 font-semibold block mb-1">
                              Sugestões de especialidades (clique para selecionar):
                            </span>
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-100">
                              {getSuggestionsForProfession(formData.managerProfession).map(sug => {
                                const isSelected = formData.managerPracticeAreas
                                  .split(',')
                                  .map(s => s.trim().toLowerCase())
                                  .includes(sug.toLowerCase());
                                return (
                                  <button
                                    key={sug}
                                    type="button"
                                    onClick={() => toggleManagerPracticeArea(sug)}
                                    className={`text-[10px] px-2 py-0.5 rounded-lg font-medium transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-teal-600 text-white shadow-xs font-bold'
                                        : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                                    }`}
                                  >
                                    {isSelected ? '✓ ' : '+ '}{sug}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <input
                          type="text"
                          placeholder="Ex: Especialidade clínica, foco de atendimento..."
                          value={formData.managerPracticeAreas}
                          onChange={e => setFormData({ ...formData, managerPracticeAreas: e.target.value })}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </>
                  )}

                  {/* Informação sobre o módulo específico ativado + ZemdaBody para todas as áreas */}
                  <div className="sm:col-span-2 space-y-2">
                    {(() => {
                      const prof = formData.managerProfession.toLowerCase();
                      let moduleName = '';
                      let moduleDesc = '';

                      if (prof.includes('fono')) {
                        moduleName = 'ZemdaFono Habilitado';
                        moduleDesc = 'Audiologia clínica, audiograma interativo, avaliação de voz, linguagem e fonoaudiologia.';
                      } else if (prof.includes('psic')) {
                        moduleName = 'ZemdaPsico Habilitado';
                        moduleDesc = 'Prontuário psicológico especializado, evolução confidencial de sessões e anamnese clínica.';
                      } else if (prof.includes('terapia ocupacional') || prof.includes('terapeuta ocupacional') || prof.includes('ocupacional')) {
                        moduleName = 'ZemdaTO Habilitado';
                        moduleDesc = 'Planos terapêuticos individuais, avaliação sensorial e desenvolvimento da autonomia ocupacional.';
                      } else if (prof.includes('nutri')) {
                        moduleName = 'ZemdaNutri Habilitado';
                        moduleDesc = 'Planos alimentares, recordatório 24h, cálculo calórico e acompanhamento nutricional.';
                      } else if (prof.includes('fisio')) {
                        moduleName = 'ZemdaFisio Habilitado';
                        moduleDesc = 'Avaliação cinético-funcional, evolução fisioterapêutica completa e testes ortopédicos.';
                      } else if (prof.includes('personal') || prof.includes('educad')) {
                        moduleName = 'ZemdaPersonal Habilitado';
                        moduleDesc = 'Prescrição e periodização de treinos, montagem de rotinas de exercícios, séries e cargas.';
                      } else if (prof.includes('odonto') || prof.includes('dentis')) {
                        moduleName = 'ZemdaOdonto Habilitado';
                        moduleDesc = 'Odontograma interativo, procedimentos odontológicos e planos de tratamento clínico.';
                      } else if (prof.includes('médic') || prof.includes('medic')) {
                        moduleName = 'Prontuário Médico Habilitado';
                        moduleDesc = 'Prescrições digitais, solicitações de exames, atestados e prontuário médico completo.';
                      } else if (prof.includes('gestão') || prof.includes('administrativ')) {
                        moduleName = 'Gestão Administrativa Plena';
                        moduleDesc = 'Acesso integral à gestão de agenda, finanças, faturamento, estoque e equipe da clínica.';
                      } else {
                        moduleName = 'Prontuário Multidisciplinar Habilitado';
                        moduleDesc = 'Prontuário eletrônico completo, agenda e gestão de pacientes para profissionais da saúde.';
                      }

                      return (
                        <div className="p-3 rounded-2xl bg-teal-50/70 border border-teal-200/80 text-teal-900 text-[11px] space-y-1.5 shadow-2xs">
                          <div className="flex items-center gap-2 font-bold text-teal-800">
                            <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
                            <span>{moduleName}</span>
                          </div>
                          <p className="text-teal-700 leading-relaxed">
                            {moduleDesc}
                          </p>
                          <div className="pt-1.5 mt-1 border-t border-teal-200/50 flex items-center gap-1.5 text-[10px] text-teal-800 font-semibold">
                            <Activity className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span><strong>ZemdaBody (Mapa Corporal Interativo):</strong> incluído e liberado para todas as áreas profissionais.</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Seção 2: Dados Básicos da Clínica */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-teal-600" />
                  2. Dados do Estabelecimento / Clínica
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Razão Social ou Nome da Clínica *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Clínica Prime Saúde & Bem-Estar"
                      value={formData.clinicName}
                      onChange={e => setFormData({ ...formData, clinicName: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nome Fantasia (Como clientes a conhecem)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Espaço Prime"
                      value={formData.tradeName}
                      onChange={e => setFormData({ ...formData, tradeName: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      CNPJ ou CPF (caso profissional liberal)
                    </label>
                    <input
                      type="text"
                      placeholder="00.000.000/0001-00 ou 000.000.000-00"
                      value={formData.cnpjCpf}
                      onChange={e => setFormData({ ...formData, cnpjCpf: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      CEP (com busca automática)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="00000-000"
                        value={formData.cep}
                        onChange={e => setFormData({ ...formData, cep: e.target.value })}
                        className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                      />
                      <button
                        type="button"
                        onClick={handleCepSearch}
                        disabled={searchingCep}
                        className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5" />
                        {searchingCep ? '...' : 'Buscar'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Cidade
                    </label>
                    <input
                      type="text"
                      placeholder="São Paulo"
                      value={formData.city}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Estado (UF)
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      placeholder="SP"
                      value={formData.state}
                      onChange={e => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Seção 3: Aceite Legal Obrigatório (Termos e LGPD) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
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
                  <label className="flex items-start gap-2.5 text-xs text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marketingAccepted}
                      onChange={e => setMarketingAccepted(e.target.checked)}
                      className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>
                      (Opcional) Desejo receber comunicações sobre novidades, recursos de IA e atualizações da plataforma Zemda.
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
