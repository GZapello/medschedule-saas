import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  X,
  Building2,
  User,
  Mail,
  Lock,
  Phone,
  Briefcase,
  Award,
  CheckCircle2,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';

interface RegisterUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PublicTenant {
  id: string;
  name: string;
  slug: string;
  city?: string;
  state?: string;
}

const PROFESSIONS_LIST = [
  // Saúde Mental e Comportamento
  'Psicólogo',
  'Psiquiatra',
  'Psicopedagogo',
  'Neuropsicólogo',
  'Terapeuta Ocupacional',
  'Psicanalista',
  'Terapeuta Cognitivo-Comportamental',
  'Terapeuta Comportamental',
  'Terapeuta Familiar',
  'Terapeuta de Casal',
  'Musicoterapeuta',
  'Nutricionista',
  'Fisioterapeuta',
  // Desenvolvimento Infantil
  'Psicólogo Infantil',
  'Psiquiatra Infantil',
  'Psicopedagogo Infantil',
  'Terapeuta Ocupacional Infantil',
  'Fonoaudiólogo Infantil',
  'Fonoaudiólogo',
  'Fisioterapeuta Pediátrico',
  'Pediatra',
  'Neuropsicólogo Infantil',
  'Especialista em Desenvolvimento Humano',
  'Especialista em Desenvolvimento Infantil',
  'Especialista em Aprendizagem',
  // Administrativo / Gestão
  'Recepcionista / Atendimento',
  'Secretária(o)',
  'Gestor / Administrador',
  'Outro'
];

export const RegisterUserModal: React.FC<RegisterUserModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();

  const [tenants, setTenants] = useState<PublicTenant[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Form state
  const [tenantId, setTenantId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedProfession, setSelectedProfession] = useState('Psicólogo');
  const [customProfession, setCustomProfession] = useState('');
  const [practiceAreas, setPracticeAreas] = useState('');
  const [registrationType, setRegistrationType] = useState('CRP');
  const [registrationNumber, setRegistrationNumber] = useState('');

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
    ]
  };

  const getSuggestionsForProfession = (prof: string): string[] => {
    const low = prof.toLowerCase();
    if (low.includes('fisio')) return PRACTICE_AREAS_SUGGESTIONS['Fisioterapia'];
    if (low.includes('psic') || low.includes('terapeuta cognitivo') || low.includes('psicanalista')) return PRACTICE_AREAS_SUGGESTIONS['Psicologia'];
    if (low.includes('médic') || low.includes('medic') || low.includes('psiquiat') || low.includes('pediat')) return PRACTICE_AREAS_SUGGESTIONS['Medicina'];
    if (low.includes('fono')) return PRACTICE_AREAS_SUGGESTIONS['Fonoaudiologia'];
    if (low.includes('nutri')) return PRACTICE_AREAS_SUGGESTIONS['Nutrição'];
    if (low.includes('terapeuta ocupacional')) return PRACTICE_AREAS_SUGGESTIONS['Terapia Ocupacional'];
    return [];
  };

  const togglePracticeArea = (area: string) => {
    const currentAreas = practiceAreas
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (currentAreas.includes(area)) {
      setPracticeAreas(currentAreas.filter(a => a !== area).join(', '));
    } else {
      setPracticeAreas([...currentAreas, area].join(', '));
    }
  };

  const handleProfessionChange = (val: string) => {
    setSelectedProfession(val);
    const low = val.toLowerCase();
    if (low.includes('fisio')) {
      setRegistrationType('CREFITO');
    } else if (low.includes('psic')) {
      setRegistrationType('CRP');
    } else if (low.includes('médic') || low.includes('medic') || low.includes('psiquiat') || low.includes('pediat')) {
      setRegistrationType('CRM');
    } else if (low.includes('fono')) {
      setRegistrationType('CRFa');
    } else if (low.includes('nutri')) {
      setRegistrationType('CRN');
    } else if (low.includes('terapeuta ocupacional')) {
      setRegistrationType('CREFITO');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsSuccess(false);
      loadTenants();
    }
  }, [isOpen]);

  const loadTenants = async () => {
    try {
      setLoadingTenants(true);
      const data = await ApiClient.get<PublicTenant[]>('/v1/public/tenants');
      setTenants(data || []);
      if (data && data.length > 0) {
        setTenantId(data[0].id);
      }
    } catch (err) {
      console.error('Erro ao carregar clínicas:', err);
    } finally {
      setLoadingTenants(false);
    }
  };

  if (!isOpen) return null;

  const isAdministrative =
    selectedProfession === 'Recepcionista / Atendimento' ||
    selectedProfession === 'Secretária(o)' ||
    selectedProfession === 'Gestor / Administrador';

  const finalProfessionName =
    selectedProfession === 'Outro' ? customProfession : selectedProfession;

  const resolvedRole =
    selectedProfession === 'Gestor / Administrador'
      ? 'clinic_admin'
      : selectedProfession === 'Recepcionista / Atendimento' || selectedProfession === 'Secretária(o)'
      ? 'receptionist'
      : 'professional';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tenantId) {
      showToast('Selecione a clínica que deseja integrar', 'error');
      return;
    }
    if (!name.trim() || !email.trim() || !password.trim()) {
      showToast('Preencha nome, e-mail e senha', 'error');
      return;
    }
    if (selectedProfession === 'Outro' && !customProfession.trim()) {
      showToast('Informe o nome da sua profissão ou cargo', 'error');
      return;
    }

    try {
      setSubmitting(true);
      await ApiClient.post('/v1/auth/register', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
        role: resolvedRole,
        tenantId,
        professionName: finalProfessionName,
        practiceAreas: practiceAreas.trim() || undefined,
        registrationType: !isAdministrative ? registrationType : undefined,
        registrationNumber: !isAdministrative ? registrationNumber.trim() || undefined : undefined
      });

      setIsSuccess(true);
    } catch (err: any) {
      showToast(err.message || 'Erro ao enviar solicitação de cadastro', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Solicitar Acesso à Clínica</h2>
            <p className="text-xs text-slate-500">Cadastre seu perfil profissional ou administrativo</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-800">Solicitação Enviada!</h3>
              <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                Seu cadastro foi realizado com sucesso e está <strong>Aguardando Aprovação</strong> da gestão da clínica.
              </p>
            </div>
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 text-left flex items-start gap-2 max-w-sm mx-auto">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Assim que o gestor da clínica analisar e aprovar sua solicitação, você poderá acessar o sistema normalmente com seu e-mail e senha cadastrados.
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
            >
              Voltar para o Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            {/* Clínica que deseja integrar */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Clínica que deseja integrar *
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={tenantId}
                  onChange={e => setTenantId(e.target.value)}
                  disabled={loadingTenants}
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  {loadingTenants ? (
                    <option value="">Carregando clínicas...</option>
                  ) : tenants.length === 0 ? (
                    <option value="">Nenhuma clínica disponível</option>
                  ) : (
                    tenants.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.city ? `(${t.city}/${t.state || ''})` : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                O gestor desta clínica receberá sua solicitação para aprovação.
              </p>
            </div>

            {/* Dados Pessoais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo *</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">E-mail *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seuemail@exemplo.com"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Senha de Acesso *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Profissão ou Cargo */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Profissão ou Função *</label>
              <div className="relative">
                <Briefcase className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedProfession}
                  onChange={e => handleProfessionChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                >
                  {PROFESSIONS_LIST.map(p => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedProfession === 'Outro' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Especifique sua Profissão *</label>
                <input
                  type="text"
                  value={customProfession}
                  onChange={e => setCustomProfession(e.target.value)}
                  placeholder="Ex: Terapeuta Floral, Psicometrista..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            )}

            {/* Conselho de Classe (caso seja da saúde/atendimento) */}
            {!isAdministrative && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Registro</label>
                  <input
                    type="text"
                    value={registrationType}
                    onChange={e => setRegistrationType(e.target.value)}
                    placeholder="Ex: CRP, CRM, CREFITO"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Número do Registro</label>
                  <div className="relative">
                    <Award className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={registrationNumber}
                      onChange={e => setRegistrationNumber(e.target.value)}
                      placeholder="Ex: 06/12345"
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Áreas de Atuação Especializadas */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Áreas de Atuação / Especialidades
                </label>
                <span className="text-[10px] text-slate-400 font-medium">Definido no cadastro</span>
              </div>

              {/* Sugestões dinâmicas baseadas na profissão */}
              {getSuggestionsForProfession(finalProfessionName).length > 0 && (
                <div className="mb-2">
                  <span className="text-[10px] text-slate-500 font-semibold block mb-1.5">
                    Sugestões para {finalProfessionName} (clique para selecionar):
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-100">
                    {getSuggestionsForProfession(finalProfessionName).map(sug => {
                      const isSelected = practiceAreas
                        .split(',')
                        .map(s => s.trim().toLowerCase())
                        .includes(sug.toLowerCase());
                      return (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => togglePracticeArea(sug)}
                          className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-xs font-bold'
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

              <textarea
                value={practiceAreas}
                onChange={e => setPracticeAreas(e.target.value)}
                placeholder="Ex: Traumato-Ortopédica, Neurológica, Desportiva..."
                rows={2}
                className="w-full p-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed"
              />
              <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-slate-500" />
                Sua área de atuação é fixada no cadastro para segurança ética e conformidade de acesso.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Enviando Solicitação...' : 'Enviar Solicitação de Acesso'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
