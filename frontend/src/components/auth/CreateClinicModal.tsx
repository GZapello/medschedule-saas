import React, { useState } from 'react';
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
  ExternalLink
} from 'lucide-react';

interface CreateClinicModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateClinicModal: React.FC<CreateClinicModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const { loginWithToken } = useAuth();

  const [loading, setLoading] = useState(false);
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
    managerRegistrationNumber: ''
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

  const handleManagerProfessionChange = (val: string) => {
    let regType = formData.managerRegistrationType;
    const low = val.toLowerCase();
    if (low.includes('fisio')) {
      regType = 'CREFITO';
    } else if (low.includes('psic')) {
      regType = 'CRP';
    } else if (low.includes('médic') || low.includes('medic') || low.includes('psiquiat') || low.includes('pediat')) {
      regType = 'CRM';
    } else if (low.includes('fono')) {
      regType = 'CRFa';
    } else if (low.includes('nutri')) {
      regType = 'CRN';
    } else if (low.includes('terapeuta ocupacional')) {
      regType = 'CREFITO';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.responsibleName || !formData.email || !formData.password || !formData.clinicName) {
      showToast('Preencha os campos obrigatórios marcados com *', 'error');
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
      const data = await ApiClient.post<any>('/v1/public/tenants/register', {
        responsibleName: formData.responsibleName,
        email: formData.email,
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
        managerRegistrationNumber: formData.managerProfession !== 'Apenas Gestão / Administrativo' ? formData.managerRegistrationNumber : undefined
      });

      if (data.token && data.user) {
        // Autenticação automática segura através do token de sessão retornado
        loginWithToken(data.token, data.user, data.tenant);
        showToast('Cadastro realizado com sucesso! Redirecionando para escolha do plano...', 'success');
        onClose();
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
      showToast(err.message || 'Erro ao cadastrar clínica', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100 my-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 p-6 text-white flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[11px] font-bold tracking-wider uppercase mb-1">
              <Building2 className="w-3.5 h-3.5 text-teal-400" />
              Plataforma Multi-Clínicas Zemda
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">Criar Minha Clínica</h2>
            <p className="text-xs text-indigo-200">
              Cadastre seu estabelecimento para ter seu próprio ambiente exclusivo na plataforma.
            </p>
          </div>
          <button
            onClick={onClose}
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
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition-all"
              >
                Entrar e escolher o plano
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Informação sobre aprovação */}
              <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-2xl text-xs text-indigo-900 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                <p>
                  Cada clínica possui ambiente 100% isolado. Após enviar seus dados, sua solicitação ficará com status <strong>"Pendente de aprovação"</strong> até validação pelo administrador da plataforma.
                </p>
              </div>

              {/* Seção 1: Dados do Responsável / Gestor */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-600" />
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
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
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
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
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
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
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
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
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
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Atuação Profissional do Gerenciador / Admin */}
                  <div className="sm:col-span-2 pt-2 border-t border-slate-100">
                    <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                      Área de Atuação Profissional do Responsável / Gerenciador *
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      O gerenciador possui duplo papel: gestão administrativa da clínica e atuação nos atendimentos conforme sua profissão.
                    </p>
                    <select
                      value={formData.managerProfession}
                      onChange={e => handleManagerProfessionChange(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Fisioterapia">Fisioterapia (Acesso ao ZemdaFisio e Prontuários Fisioterapêuticos)</option>
                      <option value="Psicologia">Psicologia (Prontuário Psicológico e Evolução)</option>
                      <option value="Medicina">Medicina / Médico (Prontuário Médico, Prescrições)</option>
                      <option value="Fonoaudiologia">Fonoaudiologia</option>
                      <option value="Nutrição">Nutrição</option>
                      <option value="Terapia Ocupacional">Terapia Ocupacional</option>
                      <option value="Odontologia">Odontologia</option>
                      <option value="Apenas Gestão / Administrativo">Apenas Gestão Administrativa (Sem atendimentos clínicos)</option>
                      <option value="Outro">Outro Profissional da Saúde</option>
                    </select>
                  </div>

                  {formData.managerProfession !== 'Apenas Gestão / Administrativo' && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Conselho / Registro Profissional
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: CREFITO, CRM, CRP"
                          value={formData.managerRegistrationType}
                          onChange={e => setFormData({ ...formData, managerRegistrationType: e.target.value })}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500 uppercase"
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
                            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
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

                        <input
                          type="text"
                          placeholder="Ex: Traumato-Ortopédica, Fisioterapia Esportiva, Reabilitação"
                          value={formData.managerPracticeAreas}
                          onChange={e => setFormData({ ...formData, managerPracticeAreas: e.target.value })}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </>
                  )}

                  {/* Informação sobre permissão ZemdaFisio */}
                  <div className="sm:col-span-2">
                    {formData.managerProfession.toLowerCase().includes('fisio') ? (
                      <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-[11px] flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
                        <span>
                          <strong>ZemdaFisio Habilitado:</strong> Você terá acesso à gestão administrativa e aos recursos clínicos exclusivos de Fisioterapia e Mapa de Dor Corporal.
                        </span>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          <strong>Acesso Administrativo Pleno:</strong> Você gerenciará toda a clínica. O módulo clínico ZemdaFisio permanece restrito aos profissionais fisioterapeutas da equipe.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Seção 2: Dados Básicos da Clínica */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
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
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
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
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
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
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
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
                        className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
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
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
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
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
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
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    Li e aceito os{' '}
                    <a
                      href="/termos-de-uso"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-indigo-600 underline hover:text-indigo-700 inline-flex items-center gap-0.5"
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
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    Li e estou ciente da{' '}
                    <a
                      href="/privacidade"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-indigo-600 underline hover:text-indigo-700 inline-flex items-center gap-0.5"
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
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
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
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Cadastrando...' : 'Finalizar Solicitação de Cadastro'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
