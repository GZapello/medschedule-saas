import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Building2,
  UserCheck,
  MapPin,
  FileCheck,
  Receipt,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Search,
  Sparkles,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

interface OnboardingWizardViewProps {
  onComplete: () => void;
}

export const OnboardingWizardView: React.FC<OnboardingWizardViewProps> = ({ onComplete }) => {
  const { currentTenant, refreshTenant } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchingCep, setSearchingCep] = useState<boolean>(false);
  const [managerConfirmed, setManagerConfirmed] = useState<boolean>(false);
  const [percentage, setPercentage] = useState<number>(20);

  // Formulário das etapas
  const [formData, setFormData] = useState({
    // Etapa 2: Dados da Clínica
    corporateName: currentTenant?.name || '',
    tradeName: currentTenant?.trade_name || currentTenant?.name || '',
    personType: 'pj',
    cnpjCpf: currentTenant?.cnpj_cpf || '',
    municipalRegistration: '',
    stateRegistration: '',
    professionalBoard: 'CRM',
    professionalRegistry: '',
    phone: currentTenant?.phone || '',
    mobile: '',
    whatsapp: '',
    website: '',
    description: '',

    // Etapa 3: Endereço
    zipCode: currentTenant?.zip_code || '',
    street: currentTenant?.address || '',
    number: '',
    complement: '',
    neighborhood: '',
    city: currentTenant?.city || '',
    state: currentTenant?.state || '',
    country: 'Brasil',

    // Etapa 4: Responsável
    responsibleName: '',
    responsibleCpf: '',
    responsibleEmail: currentTenant?.email || '',
    responsiblePhone: currentTenant?.phone || '',
    responsibleRole: 'Diretor / Gestor Clínico',

    // Etapa 5: Dados para Recibos
    emitterType: 'pj',
    emitterName: currentTenant?.name || '',
    emitterTradeName: currentTenant?.trade_name || currentTenant?.name || '',
    emitterDocument: currentTenant?.cnpj_cpf || '',
    emitterMunicipalReg: '',
    emitterBoardName: 'CRM',
    emitterRegistryNumber: '',
    emitterRegistryState: currentTenant?.state || 'SP',
    emitterPhone: currentTenant?.phone || '',
    emitterEmail: currentTenant?.email || '',
    receiptPrefix: 'REC-',
    defaultTemplateText: 'Recebemos de [CLIENTE] a importância de R$ [VALOR], referente à prestação do serviço [SERVIÇO], realizado em [DATA], pelo profissional [PROFISSIONAL].'
  });

  // Carrega status de onboarding da clínica
  useEffect(() => {
    async function loadStatus() {
      try {
        const data = await ApiClient.get<any>('/v1/onboarding/status');
        if (data.tenant) {
          setManagerConfirmed(data.tenant.manager_confirmed === 1);
          setPercentage(data.percentage || 20);
          setFormData(prev => ({
            ...prev,
            corporateName: data.tenant.corporate_name || data.tenant.name || prev.corporateName,
            tradeName: data.tenant.trade_name || data.tenant.name || prev.tradeName,
            personType: data.tenant.person_type || prev.personType,
            cnpjCpf: data.tenant.cnpj_cpf || prev.cnpjCpf,
            municipalRegistration: data.tenant.municipal_registration || prev.municipalRegistration,
            stateRegistration: data.tenant.state_registration || prev.stateRegistration,
            professionalBoard: data.tenant.professional_board || prev.professionalBoard,
            professionalRegistry: data.tenant.professional_registry || prev.professionalRegistry,
            phone: data.tenant.phone || prev.phone,
            mobile: data.tenant.mobile || prev.mobile,
            whatsapp: data.tenant.whatsapp || prev.whatsapp,
            website: data.tenant.website || prev.website,
            description: data.tenant.description || prev.description,
            street: data.tenant.street || data.tenant.address || prev.street,
            number: data.tenant.number || prev.number,
            complement: data.tenant.complement || prev.complement,
            neighborhood: data.tenant.neighborhood || prev.neighborhood,
            city: data.tenant.city || prev.city,
            state: data.tenant.state || prev.state,
            zipCode: data.tenant.zip_code || prev.zipCode,
            responsibleName: data.tenant.responsible_name || prev.responsibleName,
            responsibleCpf: data.tenant.responsible_cpf || prev.responsibleCpf,
            responsibleEmail: data.tenant.responsible_email || prev.responsibleEmail,
            responsiblePhone: data.tenant.responsible_phone || prev.responsiblePhone,
            responsibleRole: data.tenant.responsible_role || prev.responsibleRole
          }));

          // Se já confirmou o gestor, avança para o próximo passo
          if (data.tenant.manager_confirmed === 1 && step === 1) {
            setStep(data.tenant.onboarding_step > 1 ? data.tenant.onboarding_step : 2);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar status do onboarding:', err);
      }
    }
    loadStatus();
  }, []);

  // Busca de CEP automática pelo ViaCEP
  const handleCepSearch = async () => {
    const cleanCep = formData.zipCode.replace(/\D/g, '');
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
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state
      }));
      showToast(`Endereço localizado: ${data.logradouro}, ${data.localidade}/${data.uf}`, 'success');
    } catch {
      showToast('Erro ao consultar CEP. Preencha manualmente.', 'error');
    } finally {
      setSearchingCep(false);
    }
  };

  // Etapa 1: Confirmação do papel de Gestor
  const handleConfirmManager = async (isManager: boolean) => {
    if (!isManager) {
      showToast('Apenas o gestor responsável pode concluir a configuração inicial.', 'error');
      return;
    }

    try {
      setLoading(true);
      await ApiClient.post('/v1/onboarding/confirm-manager', { isManager: true });
      setManagerConfirmed(true);
      setPercentage(35);
      setStep(2);
      showToast('Identificação confirmada com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao validar gestor', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Salvar etapas intermediárias
  const handleSaveStep = async (nextStep: number) => {
    try {
      setLoading(true);

      // Salva dados no backend
      await ApiClient.post('/v1/onboarding/step', {
        step: nextStep,
        corporateName: formData.corporateName,
        tradeName: formData.tradeName,
        personType: formData.personType,
        cnpjCpf: formData.cnpjCpf,
        municipalRegistration: formData.municipalRegistration,
        stateRegistration: formData.stateRegistration,
        professionalBoard: formData.professionalBoard,
        professionalRegistry: formData.professionalRegistry,
        phone: formData.phone,
        mobile: formData.mobile,
        whatsapp: formData.whatsapp,
        website: formData.website,
        description: formData.description,
        street: formData.street,
        number: formData.number,
        complement: formData.complement,
        neighborhood: formData.neighborhood,
        city: formData.city,
        state: formData.state,
        zipCode: formData.zipCode,
        country: formData.country,
        responsibleName: formData.responsibleName,
        responsibleCpf: formData.responsibleCpf,
        responsibleEmail: formData.responsibleEmail,
        responsiblePhone: formData.responsiblePhone,
        responsibleRole: formData.responsibleRole
      });

      // Se for a etapa de recibos (etapa 5), salva também em receipt_settings
      if (step === 5) {
        await ApiClient.put('/v1/receipts/settings', {
          emitterType: formData.emitterType,
          emitterName: formData.emitterName || formData.corporateName,
          emitterTradeName: formData.emitterTradeName || formData.tradeName,
          emitterDocument: formData.emitterDocument || formData.cnpjCpf,
          emitterMunicipalReg: formData.emitterMunicipalReg,
          emitterBoardName: formData.emitterBoardName,
          emitterRegistryNumber: formData.emitterRegistryNumber,
          emitterRegistryState: formData.emitterRegistryState,
          emitterStreet: formData.street,
          emitterNumber: formData.number,
          emitterComplement: formData.complement,
          emitterNeighborhood: formData.neighborhood,
          emitterCity: formData.city,
          emitterState: formData.state,
          emitterZipCode: formData.zipCode,
          emitterPhone: formData.phone,
          emitterEmail: formData.responsibleEmail,
          receiptPrefix: formData.receiptPrefix,
          defaultTemplateText: formData.defaultTemplateText
        });
      }

      setStep(nextStep);
      const newPct = Math.min(100, 20 + nextStep * 15);
      setPercentage(newPct);
      showToast('Dados salvos com sucesso', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar etapa', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Concluir Onboarding
  const handleCompleteOnboarding = async () => {
    try {
      setLoading(true);

      // Salva os dados de recibo antes de concluir
      await ApiClient.put('/v1/receipts/settings', {
        emitterType: formData.emitterType,
        emitterName: formData.emitterName || formData.corporateName,
        emitterTradeName: formData.emitterTradeName || formData.tradeName,
        emitterDocument: formData.emitterDocument || formData.cnpjCpf,
        emitterMunicipalReg: formData.emitterMunicipalReg,
        emitterBoardName: formData.emitterBoardName,
        emitterRegistryNumber: formData.emitterRegistryNumber,
        emitterRegistryState: formData.emitterRegistryState,
        emitterStreet: formData.street,
        emitterNumber: formData.number,
        emitterComplement: formData.complement,
        emitterNeighborhood: formData.neighborhood,
        emitterCity: formData.city,
        emitterState: formData.state,
        emitterZipCode: formData.zipCode,
        emitterPhone: formData.phone,
        emitterEmail: formData.responsibleEmail,
        receiptPrefix: formData.receiptPrefix,
        defaultTemplateText: formData.defaultTemplateText
      });

      // Conclui o onboarding
      await ApiClient.post('/v1/onboarding/complete', {});
      await refreshTenant();
      showToast('Configuração concluída com sucesso! Bem-vindo à sua clínica.', 'success');
      onComplete();
    } catch (err: any) {
      showToast(err.message || 'Erro ao concluir onboarding', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-3xl space-y-6">
        {/* Top Branding & Greeting */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider border border-indigo-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            Configuração Inicial Obrigatória
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Vamos configurar sua clínica!
          </h1>
          <p className="text-xs text-slate-400 max-w-lg mx-auto">
            Complete as informações institucionais e os dados fiscais de recibos para liberar o painel operacional da sua clínica.
          </p>
        </div>

        {/* Barra de Progresso com Percentual */}
        <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/60 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-200">
              Progresso da Configuração: <span className="text-indigo-400">{percentage}% concluída</span>
            </span>
            <span className="text-slate-400">Etapa {step} de 5</span>
          </div>
          <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-400 to-indigo-500 transition-all duration-500 rounded-full"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Card do Formulário */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-800 space-y-6 border border-slate-100">
          {/* ========================================================== */}
          {/* ETAPA 1: Confirmação do Gestor Responsável */}
          {/* ========================================================== */}
          {step === 1 && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <UserCheck className="w-9 h-9" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-slate-800">
                  Você é o gestor responsável por esta clínica?
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  A confirmação de titularidade é validada diretamente no servidor e concede permissões de administração total do ambiente desta clínica.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleConfirmManager(true)}
                  disabled={loading}
                  className="w-full sm:w-auto px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  SIM, SOU O GESTOR RESPONSÁVEL
                </button>

                <button
                  type="button"
                  onClick={() => handleConfirmManager(false)}
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  NÃO, NÃO SOU O GESTOR
                </button>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* ETAPA 2: Dados Institucionais da Clínica */}
          {/* ========================================================== */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-800 text-sm">
                  Etapa 2 — Dados Institucionais do Estabelecimento
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Razão Social *</label>
                  <input
                    type="text"
                    required
                    value={formData.corporateName}
                    onChange={e => setFormData({ ...formData, corporateName: e.target.value })}
                    placeholder="Clínica Exemplo Serviços Médicos Ltda"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nome Fantasia (Comercial)</label>
                  <input
                    type="text"
                    value={formData.tradeName}
                    onChange={e => setFormData({ ...formData, tradeName: e.target.value })}
                    placeholder="Espaço Viver Bem"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Pessoa</label>
                  <select
                    value={formData.personType}
                    onChange={e => setFormData({ ...formData, personType: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="pj">Pessoa Jurídica (CNPJ)</option>
                    <option value="pf">Pessoa Física (CPF - Profissional Liberal)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {formData.personType === 'pj' ? 'CNPJ *' : 'CPF *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.cnpjCpf}
                    onChange={e => setFormData({ ...formData, cnpjCpf: e.target.value })}
                    placeholder={formData.personType === 'pj' ? '00.000.000/0001-00' : '000.000.000-00'}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Inscrição Municipal</label>
                  <input
                    type="text"
                    value={formData.municipalRegistration}
                    onChange={e => setFormData({ ...formData, municipalRegistration: e.target.value })}
                    placeholder="Ex: 12345678"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Inscrição Estadual (se aplicável)</label>
                  <input
                    type="text"
                    value={formData.stateRegistration}
                    onChange={e => setFormData({ ...formData, stateRegistration: e.target.value })}
                    placeholder="Isento ou número"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telefone Principal</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(11) 3344-5566"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">WhatsApp para Atendimento</label>
                  <input
                    type="text"
                    value={formData.whatsapp}
                    onChange={e => setFormData({ ...formData, whatsapp: e.target.value })}
                    placeholder="(11) 98888-7777"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => handleSaveStep(3)}
                  disabled={loading}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  Continuar para Endereço
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* ETAPA 3: Endereço da Clínica com ViaCEP */}
          {/* ========================================================== */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <MapPin className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-800 text-sm">
                  Etapa 3 — Endereço Físico do Estabelecimento
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">CEP *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="00000-000"
                      value={formData.zipCode}
                      onChange={e => setFormData({ ...formData, zipCode: e.target.value })}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleCepSearch}
                      disabled={searchingCep}
                      className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5" />
                      {searchingCep ? '...' : 'Buscar'}
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Logradouro / Rua *</label>
                  <input
                    type="text"
                    required
                    value={formData.street}
                    onChange={e => setFormData({ ...formData, street: e.target.value })}
                    placeholder="Av. Paulista"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Número *</label>
                  <input
                    type="text"
                    required
                    value={formData.number}
                    onChange={e => setFormData({ ...formData, number: e.target.value })}
                    placeholder="1000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Complemento / Sala</label>
                  <input
                    type="text"
                    value={formData.complement}
                    onChange={e => setFormData({ ...formData, complement: e.target.value })}
                    placeholder="Conjunto 501"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Bairro *</label>
                  <input
                    type="text"
                    required
                    value={formData.neighborhood}
                    onChange={e => setFormData({ ...formData, neighborhood: e.target.value })}
                    placeholder="Bela Vista"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cidade *</label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                    placeholder="São Paulo"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Estado (UF) *</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={formData.state}
                    onChange={e => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    placeholder="SP"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">País</label>
                  <input
                    type="text"
                    value={formData.country}
                    disabled
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-100 text-slate-500"
                  />
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveStep(4)}
                  disabled={loading}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  Continuar para Gestor
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* ETAPA 4: Dados do Responsável / Gestor */}
          {/* ========================================================== */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <FileCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-800 text-sm">
                  Etapa 4 — Dados do Responsável Legal da Clínica
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nome Completo do Responsável *</label>
                  <input
                    type="text"
                    required
                    value={formData.responsibleName}
                    onChange={e => setFormData({ ...formData, responsibleName: e.target.value })}
                    placeholder="Dra. Camila Santos"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">CPF do Responsável *</label>
                  <input
                    type="text"
                    required
                    value={formData.responsibleCpf}
                    onChange={e => setFormData({ ...formData, responsibleCpf: e.target.value })}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">E-mail Profissional</label>
                  <input
                    type="email"
                    value={formData.responsibleEmail}
                    onChange={e => setFormData({ ...formData, responsibleEmail: e.target.value })}
                    placeholder="diretoria@viverbem.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Celular / Contato Direto</label>
                  <input
                    type="text"
                    value={formData.responsiblePhone}
                    onChange={e => setFormData({ ...formData, responsiblePhone: e.target.value })}
                    placeholder="(11) 98888-0000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cargo / Função na Clínica</label>
                  <input
                    type="text"
                    value={formData.responsibleRole}
                    onChange={e => setFormData({ ...formData, responsibleRole: e.target.value })}
                    placeholder="Diretor Geral / Responsável Técnico"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Conselho e Registro (se aplicável)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="CRM/CRP"
                      value={formData.professionalBoard}
                      onChange={e => setFormData({ ...formData, professionalBoard: e.target.value })}
                      className="w-1/3 px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                    />
                    <input
                      type="text"
                      placeholder="Número"
                      value={formData.professionalRegistry}
                      onChange={e => setFormData({ ...formData, professionalRegistry: e.target.value })}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveStep(5)}
                  disabled={loading}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  Configurar Dados para Recibos
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* ETAPA 5: Dados Obrigatórios para Emissão de Recibos */}
          {/* ========================================================== */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Receipt className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm">
                    Etapa 5 — Dados para Emissão de Recibos da Clínica
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Obrigatório antes de iniciar a emissão de recibos fiscais e administrativos.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p>
                  Essas informações constarão nos cabeçalhos de todos os recibos gerados pela sua clínica. A numeração de recibos (ex: <code>REC-000001</code>) é gerada automaticamente de forma independente por clínica.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nome do Emitente Oficial *</label>
                  <input
                    type="text"
                    required
                    value={formData.emitterName}
                    onChange={e => setFormData({ ...formData, emitterName: e.target.value })}
                    placeholder="Nome da clínica ou do profissional emissor"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">CNPJ ou CPF do Emitente *</label>
                  <input
                    type="text"
                    required
                    value={formData.emitterDocument}
                    onChange={e => setFormData({ ...formData, emitterDocument: e.target.value })}
                    placeholder="00.000.000/0001-00"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Conselho Profissional (se saúde)</label>
                  <input
                    type="text"
                    value={formData.emitterBoardName}
                    onChange={e => setFormData({ ...formData, emitterBoardName: e.target.value })}
                    placeholder="CRM, CRP, CRFa, OAB..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Número de Registro no Conselho</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.emitterRegistryNumber}
                      onChange={e => setFormData({ ...formData, emitterRegistryNumber: e.target.value })}
                      placeholder="123456"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                    />
                    <input
                      type="text"
                      maxLength={2}
                      value={formData.emitterRegistryState}
                      onChange={e => setFormData({ ...formData, emitterRegistryState: e.target.value.toUpperCase() })}
                      placeholder="UF"
                      className="w-14 px-2 py-2 border border-slate-200 rounded-xl bg-slate-50 text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Inscrição Municipal</label>
                  <input
                    type="text"
                    value={formData.emitterMunicipalReg}
                    onChange={e => setFormData({ ...formData, emitterMunicipalReg: e.target.value })}
                    placeholder="Número municipal"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prefixo dos Recibos</label>
                  <input
                    type="text"
                    value={formData.receiptPrefix}
                    onChange={e => setFormData({ ...formData, receiptPrefix: e.target.value.toUpperCase() })}
                    placeholder="REC-"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    Texto Padrão do Recibo (Personalizável)
                  </label>
                  <textarea
                    rows={3}
                    value={formData.defaultTemplateText}
                    onChange={e => setFormData({ ...formData, defaultTemplateText: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Tags dinâmicas automáticas: <code>[CLIENTE]</code>, <code>[VALOR]</code>, <code>[SERVIÇO]</code>, <code>[DATA]</code>, <code>[PROFISSIONAL]</code>.
                  </p>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </button>

                <button
                  type="button"
                  onClick={handleCompleteOnboarding}
                  disabled={loading}
                  className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xl transition-all cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {loading ? 'Finalizando...' : 'Concluir Configuração e Acessar Clínica'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
