import { trackCompletedRegistration } from '../../utils/registrationAnalytics';
import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
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
  ArrowRight
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

const PROFESSIONS_LIST = [
  'Fisioterapeuta',
  'Fisioterapeuta Pediátrico',
  'Psicólogo',
  'Psicólogo Infantil',
  'Psiquiatra',
  'Psiquiatra Infantil',
  'Fonoaudiólogo',
  'Fonoaudiólogo Infantil',
  'Nutricionista',
  'Terapeuta Ocupacional',
  'Terapeuta Ocupacional Infantil',
  'Personal Trainer',
  'Cirurgião-Dentista / Odontologista',
  'Médico Clínico Geral',
  'Pediatra',
  'Neuropsicólogo',
  'Psicopedagogo',
  'Psicanalista',
  'Recepcionista / Atendimento',
  'Secretária(o)',
  'Financeiro / Administrativo',
  'Outro profissional da saúde',
  'Outro'
];

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
    'Cardiologia'
  ],
  Fonoaudiologia: [
    'Linguagem e Fala',
    'Voz Clínica e Profissional',
    'Audiologia Clínica',
    'Motricidade Orofacial',
    'Disfagia',
    'Fonoaudiologia Infantil'
  ],
  Nutrição: [
    'Nutrição Clínica',
    'Nutrição Esportiva',
    'Nutrição Comportamental',
    'Saúde Materno-Infantil',
    'Emagrecimento Saudável'
  ],
  'Terapia Ocupacional': [
    'Integração Sensorial',
    'Desenvolvimento Infantil',
    'Reabilitação Física e Neurológica',
    'Saúde Mental'
  ],
  'Personal Trainer': [
    'Musculação e Hipertrofia',
    'Emagrecimento e Queima Calórica',
    'Treinamento Funcional',
    'Condicionamento Físico',
    'Reabilitação e Prevenção de Lesões',
    'Treinamento para Idosos',
    'Preparação Esportiva'
  ],
  Odontologia: [
    'Clínica Geral Odontológica',
    'Ortodontia',
    'Implantodontia',
    'Endodontia (Canal)',
    'Periodontia',
    'Prótese Dentária',
    'Harmonização Orofacial',
    'Odontopediatria'
  ]
};

export const InviteRegisterView: React.FC<InviteRegisterViewProps> = ({
  token,
  onBackToLogin
}) => {
  const { loginWithToken } = useAuth();
  const { showToast } = useToast();

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<{ message: string; code?: string } | null>(null);
  const [inviteData, setInviteData] = useState<ValidInviteData | null>(null);

  // Formulário de Cadastro
  const [prefix, setPrefix] = useState<'Dr.' | 'Dra.' | ''>('Dr.');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedProfession, setSelectedProfession] = useState('Fisioterapeuta');
  const [customProfession, setCustomProfession] = useState('');
  const [practiceAreas, setPracticeAreas] = useState('');
  const [registrationType, setRegistrationType] = useState('CREFITO');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

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
          setSelectedProfession('Recepcionista / Atendimento');
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

  const handleProfessionChange = (val: string) => {
    setSelectedProfession(val);
    const low = val.toLowerCase();
    if (low.includes('fisio')) {
      setRegistrationType('CREFITO');
      if (!prefix) setPrefix('Dr.');
    } else if (low.includes('psic') || low.includes('psicanal')) {
      setRegistrationType('CRP');
      if (!prefix) setPrefix('Dr.');
    } else if (low.includes('médic') || low.includes('medic') || low.includes('psiquiat') || low.includes('pediat')) {
      setRegistrationType('CRM');
      if (!prefix) setPrefix('Dr.');
    } else if (low.includes('fono')) {
      setRegistrationType('CRFa');
      if (!prefix) setPrefix('Dr.');
    } else if (low.includes('nutri')) {
      setRegistrationType('CRN');
      if (!prefix) setPrefix('Dr.');
    } else if (low.includes('terapeuta ocupacional')) {
      setRegistrationType('CREFITO');
      if (!prefix) setPrefix('Dr.');
    } else if (low.includes('personal') || low.includes('educad')) {
      setRegistrationType('CREF');
      setPrefix('');
    } else if (low.includes('odonto') || low.includes('dentis')) {
      setRegistrationType('CRO');
      if (!prefix) setPrefix('Dr.');
    } else {
      setRegistrationType('Registro');
      setPrefix('');
    }
  };

  const isAdministrative =
    selectedProfession === 'Recepcionista / Atendimento' ||
    selectedProfession === 'Secretária(o)' ||
    selectedProfession === 'Financeiro / Administrativo';

  const finalProfessionName =
    selectedProfession === 'Outro' ? customProfession : selectedProfession;

  const getSuggestions = (): string[] => {
    const low = selectedProfession.toLowerCase();
    if (low.includes('fisio')) return PRACTICE_AREAS_SUGGESTIONS['Fisioterapia'];
    if (low.includes('psic') || low.includes('psicanalista')) return PRACTICE_AREAS_SUGGESTIONS['Psicologia'];
    if (low.includes('médic') || low.includes('psiquiat') || low.includes('pediat')) return PRACTICE_AREAS_SUGGESTIONS['Medicina'];
    if (low.includes('fono')) return PRACTICE_AREAS_SUGGESTIONS['Fonoaudiologia'];
    if (low.includes('nutri')) return PRACTICE_AREAS_SUGGESTIONS['Nutrição'];
    if (low.includes('terapeuta ocupacional')) return PRACTICE_AREAS_SUGGESTIONS['Terapia Ocupacional'];
    if (low.includes('personal') || low.includes('educad')) return PRACTICE_AREAS_SUGGESTIONS['Personal Trainer'];
    if (low.includes('odonto') || low.includes('dentis')) return PRACTICE_AREAS_SUGGESTIONS['Odontologia'];
    return [];
  };

  const handleAddArea = (area: string) => {
    if (!practiceAreas) {
      setPracticeAreas(area);
      return;
    }
    const current = practiceAreas.split(',').map(s => s.trim());
    if (!current.includes(area)) {
      setPracticeAreas([...current, area].join(', '));
    }
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
    if (selectedProfession === 'Outro' && !customProfession.trim()) {
      showToast('Informe o nome da sua profissão', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const res = await ApiClient.post<{ message: string; token: string; user: any; clinic: any }>(
        '/v1/auth/register-invite',
        {
          token,
          name: name.trim(),
          prefix: !isAdministrative ? prefix : undefined,
          email: email.trim().toLowerCase(),
          password,
          phone: phone.trim() || undefined,
          professionName: finalProfessionName,
          practiceAreas: practiceAreas.trim() || undefined,
          registrationType: !isAdministrative ? registrationType : undefined,
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

  // 1. Estado de Carregamento
  if (loadingInvite) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-600 text-sm font-semibold">Validando convite da clínica...</p>
        </div>
      </div>
    );
  }

  // 2. Estado de Erro / Convite Inválido / Expirado
  if (inviteError || !inviteData) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 text-center shadow-xl shadow-slate-900/5 space-y-5 border border-slate-100">
          <div className="w-16 h-16 rounded-3xl bg-red-50 text-red-500 flex items-center justify-center mx-auto shadow-inner">
            <XCircle className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900">Link de Convite Indisponível</h2>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              {inviteError?.message || 'Este convite não é válido ou não pôde ser encontrado.'}
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-left text-xs text-slate-600 space-y-1.5">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              Por que isso acontece?
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              Os links de convite são exclusivos, criptografados e expiram por segurança ou após o uso único. Caso precise de acesso, solicite um novo link ao gestor da clínica.
            </p>
          </div>

          <button
            onClick={onBackToLogin}
            className="w-full py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-700/20 transition-all cursor-pointer"
          >
            Ir para a Tela de Login
          </button>
        </div>
      </div>
    );
  }

  // 3. Sucesso após cadastro
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 text-center shadow-xl shadow-teal-900/5 space-y-4 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">Bem-vindo(a) à equipe!</h2>
            <p className="text-xs text-slate-600 font-medium">
              Seu cadastro foi vinculado com sucesso à <strong>{inviteData.tenant.name}</strong>.
            </p>
          </div>
          <p className="text-xs text-slate-400">Entrando no sistema automaticamente...</p>
        </div>
      </div>
    );
  }

  // 4. Formulário de Cadastro por Convite
  return (
    <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center p-4 py-8">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-xl shadow-teal-900/5 border border-slate-100 space-y-6">
        {/* Cabeçalho com identificação fixa e inalterável da Clínica */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-50 border border-teal-200/70 rounded-full text-teal-700 text-xs font-bold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Convite Oficial da Clínica</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Cadastro de Colaborador
          </h1>

          {/* Banner de vínculo fixo inalterável */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-600 text-white flex items-center justify-center font-bold text-base shrink-0 shadow-xs">
              {inviteData.tenant.logoUrl ? (
                <img
                  src={inviteData.tenant.logoUrl}
                  alt={inviteData.tenant.name}
                  className="w-full h-full object-cover rounded-xl"
                />
              ) : (
                <Building2 className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Você está se cadastrando na clínica
              </span>
              <p className="text-xs sm:text-sm font-extrabold text-slate-800 truncate">
                {inviteData.tenant.name}
              </p>
            </div>
            <span className="text-[10px] font-black px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg">
              Vínculo Fixo
            </span>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {/* Sexo / Tratamento & Nome */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nome Completo *
            </label>
            <div className="flex gap-2">
              {!isAdministrative && (
                <select
                  value={prefix}
                  onChange={e => setPrefix(e.target.value as any)}
                  className="w-24 px-2 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
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
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* E-mail e Telefone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                E-mail Profissional *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Telefone / WhatsApp
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Senha e Confirmação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Senha de Acesso *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  required
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
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
                  placeholder="Repita sua senha"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Profissão e Cargo */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Profissão / Função na Clínica *
            </label>
            <div className="relative">
              <Briefcase className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={selectedProfession}
                onChange={e => handleProfessionChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              >
                {PROFESSIONS_LIST.map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            {selectedProfession === 'Outro' && (
              <input
                type="text"
                required
                placeholder="Especifique sua profissão ou especialidade"
                value={customProfession}
                onChange={e => setCustomProfession(e.target.value)}
                className="w-full mt-2 px-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            )}
          </div>

          {/* Registro Profissional (se não for administrativo) */}
          {!isAdministrative && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Conselho / Sigla
                </label>
                <div className="relative">
                  <Award className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="CREFITO, CRP, CRM, etc."
                    value={registrationType}
                    onChange={e => setRegistrationType(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Número de Registro
                </label>
                <input
                  type="text"
                  placeholder="Ex: 12345/SP"
                  value={registrationNumber}
                  onChange={e => setRegistrationNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          )}

          {/* Áreas de Atuação */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Áreas de Atuação / Especialidades
            </label>
            <input
              type="text"
              placeholder="Ex: Traumato-Ortopédica, Fisioterapia Esportiva..."
              value={practiceAreas}
              onChange={e => setPracticeAreas(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
            {getSuggestions().length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-slate-400 font-semibold">Sugestões:</span>
                {getSuggestions().map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleAddArea(s)}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200/50 transition-colors cursor-pointer"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBackToLogin}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-teal-700/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Criando Conta...' : 'Concluir Cadastro na Clínica'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
