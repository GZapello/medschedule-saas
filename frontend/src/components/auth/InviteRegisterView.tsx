import React, { useState, useEffect } from 'react';
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
  AlertCircle
} from 'lucide-react';

interface InviteRegisterViewProps {
  clinicSlug?: string;
  token: string;
  onBackToLogin: () => void;
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

export const InviteRegisterView: React.FC<InviteRegisterViewProps> = ({
  token,
  onBackToLogin
}) => {
  const { loginWithToken } = useAuth();
  const { showToast } = useToast();

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<{ message: string; code?: string } | null>(null);
  const [inviteData, setInviteData] = useState<ValidInviteData | null>(null);

  // Catálogo de profissões dinâmico
  const [professionOptions, setProfessionOptions] = useState<RegistrationProfessionOption[]>(REGISTRATION_PROFESSIONS || []);
  const [loadingProfessions, setLoadingProfessions] = useState(false);

  // Áreas de atuação dinâmicas da profissão selecionada
  const [availablePracticeAreas, setAvailablePracticeAreas] = useState<PracticeArea[]>([]);
  const [selectedPracticeAreaIds, setSelectedPracticeAreaIds] = useState<string[]>([]);
  const [loadingPracticeAreas, setLoadingPracticeAreas] = useState(false);

  // Formulário de Cadastro
  const [prefix, setPrefix] = useState<'Dr.' | 'Dra.' | ''>('Dr.');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedProfessionId, setSelectedProfessionId] = useState<string>('prof-fisioterapeuta');
  const [customProfession, setCustomProfession] = useState('');
  const [practiceAreasText, setPracticeAreasText] = useState('');
  const [registrationType, setRegistrationType] = useState('CREFITO');
  const [registrationNumber, setRegistrationNumber] = useState('');
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

  const handleProfessionChange = (profId: string) => {
    setSelectedProfessionId(profId);
    const opt = professionOptions.find(p => p.id === profId);
    if (!opt) return;

    if (opt.administrative) {
      setPrefix('');
      setRegistrationType('');
      setRegistrationNumber('');
      return;
    }

    // Auto preenchimento de Conselho com base na taxonomia
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

    // Prefixo Dr. / Dra.
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showToast('Informe seu nome completo', 'error');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      showToast('Informe um e-mail válido', 'error');
      return;
    }
    if (!password || password.length < 6) {
      showToast('A senha deve possuir pelo menos 6 caracteres', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('As senhas digitadas não coincidem', 'error');
      return;
    }
    if (selectedProfessionId === 'prof-outro' && !customProfession.trim()) {
      showToast('Informe o nome da sua profissão', 'error');
      return;
    }

    // Consolida texto de áreas de atuação
    const selectedNames = availablePracticeAreas
      .filter(a => selectedPracticeAreaIds.includes(a.id))
      .map(a => a.name);
    const combinedAreasText = [
      ...selectedNames,
      ...(practiceAreasText ? practiceAreasText.split(',').map(s => s.trim()).filter(Boolean) : [])
    ].filter((v, i, a) => a.indexOf(v) === i).join(', ');

    try {
      setSubmitting(true);
      const res = await ApiClient.post<{ message: string; token: string; user: any; clinic: any }>(
        '/v1/auth/register-invite',
        {
          token,
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
      showToast(res.message || 'Cadastro realizado com sucesso!', 'success');

      if (res.token) {
        setTimeout(() => {
          loginWithToken(res.token, res.user);
        }, 1200);
      }
    } catch (err: any) {
      const errMsg = err.message || 'Erro ao realizar cadastro pelo convite';
      showToast(errMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Estado de Carregamento (mesma identidade visual padrão AuthPage)
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

          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-teal-900/5 border border-slate-200/80 text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto shadow-inner">
              <XCircle className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-black text-slate-900">Link de Convite Indisponível</h2>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {inviteError?.message || 'Este convite não é válido ou já expirou.'}
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-left text-xs text-slate-600 space-y-1">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
                <span>Por que isso acontece?</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                Os links de convite do Zemda são criptografados e exclusivos. Caso precise de acesso, solicite um novo link ao gestor da clínica.
              </p>
            </div>

            <button
              type="button"
              onClick={onBackToLogin}
              className="w-full py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-700/20 transition-all cursor-pointer"
            >
              Ir para a Tela de Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Sucesso após cadastro
  if (isSuccess) {
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

          <div className="bg-white rounded-3xl p-8 text-center shadow-xl shadow-teal-900/5 space-y-4 border border-slate-200/80 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-black text-slate-900">Bem-vindo(a) à equipe!</h2>
              <p className="text-xs text-slate-600 font-medium">
                Seu cadastro foi vinculado com sucesso à <strong>{inviteData.tenant.name}</strong>.
              </p>
            </div>
            <p className="text-xs text-teal-600 font-semibold">Entrando na plataforma automaticamente...</p>
          </div>
        </div>
      </div>
    );
  }

  // 4. Formulário Oficial de Cadastro por Convite
  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-800 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Glow sutil de fundo característico do Zemda */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-teal-100/60 via-emerald-50/30 to-transparent blur-3xl -z-10 pointer-events-none" />

      <div className="w-full max-w-xl space-y-5">
        {/* Botão de Retorno ao Login */}
        <div className="flex justify-start">
          <button
            type="button"
            onClick={onBackToLogin}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 hover:text-teal-700 text-xs font-semibold border border-slate-200/80 shadow-xs transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-teal-600" />
            <span>Voltar ao login</span>
          </button>
        </div>

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

        {/* Card Principal de Cadastro */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-teal-900/5 border border-slate-200/80 space-y-5 text-left">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[10px] font-bold border border-teal-200/60">
              <ShieldCheck className="w-3 h-3" />
              <span>Convite Oficial da Clínica</span>
            </div>
            <h2 className="text-lg font-black text-slate-900">Cadastro de Colaborador</h2>
            <p className="text-xs text-slate-500">
              Preencha seus dados profissionais para ativar seu acesso à plataforma.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nome Completo & Tratamento */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo *</label>
              <div className="flex gap-2">
                {!isAdministrative && (
                  <select
                    value={prefix}
                    onChange={e => setPrefix(e.target.value as any)}
                    className="w-24 px-2 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
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
                    className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* E-mail e Telefone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">E-mail de Acesso *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="seuemail@exemplo.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* Senha e Confirmação */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Senha de Acesso *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Confirmar Senha *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    placeholder="Repita sua senha"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* Seleção de Profissão (Dinâmica via Catálogo Canônico Único) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Profissão / Especialidade *</label>
              <RegistrationProfessionSelect
                value={selectedProfessionId}
                onChange={handleProfessionChange}
                options={professionOptions}
                loading={loadingProfessions}
              />
              {selectedProfessionId === 'prof-outro' && (
                <input
                  type="text"
                  required
                  placeholder="Especifique sua profissão ou especialidade"
                  value={customProfession}
                  onChange={e => setCustomProfession(e.target.value)}
                  className="w-full mt-2 px-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              )}
            </div>

            {/* Registro Profissional (se não for administrativo) */}
            {!isAdministrative && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Conselho / Sigla</label>
                  <div className="relative">
                    <Award className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="CREFITO, CRP, CRM, CREF..."
                      value={registrationType}
                      onChange={e => setRegistrationType(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Número de Registro</label>
                  <input
                    type="text"
                    placeholder="Ex: 12345/SP"
                    value={registrationNumber}
                    onChange={e => setRegistrationNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            )}

            {/* Áreas de Atuação Dinâmicas */}
            {!isAdministrative && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Áreas de Atuação / Especialidades
                </label>
                {loadingPracticeAreas ? (
                  <p className="text-[11px] text-slate-400">Carregando áreas de atuação...</p>
                ) : availablePracticeAreas.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {availablePracticeAreas.map(area => {
                        const isSelected = selectedPracticeAreaIds.includes(area.id);
                        return (
                          <button
                            key={area.id}
                            type="button"
                            onClick={() => togglePracticeArea(area.id)}
                            className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                                : 'bg-slate-50 hover:bg-teal-50 text-slate-600 border-slate-200 hover:border-teal-300'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}
                            {area.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <input
                  type="text"
                  placeholder="Outras especialidades ou áreas de atuação (separadas por vírgula)"
                  value={practiceAreasText}
                  onChange={e => setPracticeAreasText(e.target.value)}
                  className="w-full mt-2 px-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}

            {/* Botão de Conclusão */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-700/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Criando Conta...' : 'Concluir Cadastro'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Rodapé Discreto Obrigatório: Indicação da Clínica */}
          <div className="pt-4 border-t border-slate-100 flex items-center gap-3 text-left">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 border border-teal-200/60 flex items-center justify-center font-bold text-sm shrink-0">
              {inviteData.tenant.logoUrl ? (
                <img
                  src={inviteData.tenant.logoUrl}
                  alt={inviteData.tenant.name}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <Building2 className="w-4 h-4 text-teal-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Você está ingressando na clínica
              </span>
              <p className="text-xs font-extrabold text-slate-800 truncate">
                {inviteData.tenant.name}
              </p>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md shrink-0">
              Vínculo Fixo
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
