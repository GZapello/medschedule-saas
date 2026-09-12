import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Settings,
  Building2,
  Save,
  Sparkles,
  User,
  Key,
  Mail,
  Lock,
  Shield,
  AlertCircle,
  FileText,
  CreditCard,
  Plus,
  CheckCircle2,
  Trash2,
  Upload,
  Image as ImageIcon
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { currentUser, currentTenant, isClinicAdmin, refreshTenant, reloadSession } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'clinic' | 'document_templates' | 'insurances' | 'profile'>(
    isClinicAdmin ? 'clinic' : 'profile'
  );

  // Configurações da Clínica
  const [name, setName] = useState<string>('');
  const [corporateName, setCorporateName] = useState<string>('');
  const [tradeName, setTradeName] = useState<string>('');
  const [cnpjCpf, setCnpjCpf] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [street, setStreet] = useState<string>('');
  const [number, setNumber] = useState<string>('');
  const [complement, setComplement] = useState<string>('');
  const [neighborhood, setNeighborhood] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [zipCode, setZipCode] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [clientTermLabel, setClientTermLabel] = useState<string>('Paciente');
  const [primaryColor, setPrimaryColor] = useState<string>('#4f46e5');
  const [loadingClinic, setLoadingClinic] = useState<boolean>(false);

  // Modelos de Documentos (Item 11)
  const [selectedDocType, setSelectedDocType] = useState<string>('certificate');
  const [docTemplate, setDocTemplate] = useState<any>({
    title: 'Atestado Médico Oficial',
    headerHtml: '',
    footerHtml: '',
    showLogo: true,
    showClinicAddress: true,
    showProfessionalRegistration: true
  });

  // Convênios da Clínica (Item 15)
  const [clinicInsurances, setClinicInsurances] = useState<any[]>([]);
  const [showNewInsuranceModal, setShowNewInsuranceModal] = useState<boolean>(false);
  const [insuranceForm, setInsuranceForm] = useState({ name: '', ansCode: '', phone: '', email: '', notes: '' });

  // Configurações Pessoais (Minha Conta)
  const [profileEmail, setProfileEmail] = useState<string>(currentUser?.email || '');
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [loadingProfileEmail, setLoadingProfileEmail] = useState<boolean>(false);
  const [loadingProfilePassword, setLoadingProfilePassword] = useState<boolean>(false);

  const fetchClinicInsurances = async () => {
    try {
      const data = await ApiClient.get<any[]>('/v1/insurances/clinic');
      setClinicInsurances(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveDocTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.put(`/v1/clinics/document-templates/${selectedDocType}`, {
        documentType: selectedDocType,
        ...docTemplate
      });
      showToast('Modelo de documento salvo com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar modelo', 'error');
    }
  };

  const handleSaveInsurance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insuranceForm.name) return;
    try {
      await ApiClient.post('/v1/insurances/clinic', insuranceForm);
      showToast('Convênio cadastrado com sucesso!', 'success');
      setShowNewInsuranceModal(false);
      setInsuranceForm({ name: '', ansCode: '', phone: '', email: '', notes: '' });
      fetchClinicInsurances();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar convênio', 'error');
    }
  };

  const handleToggleInsuranceStatus = async (ins: any) => {
    try {
      await ApiClient.put(`/v1/insurances/clinic/${ins.id}`, {
        active: !ins.active
      });
      showToast(`Convênio ${!ins.active ? 'ativado' : 'desativado'} com sucesso`, 'info');
      fetchClinicInsurances();
    } catch (err: any) {
      showToast('Erro ao alterar status do convênio', 'error');
    }
  };

  // Validação oficial de CNPJ
  const validateCNPJ = (cnpj: string): boolean => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return false;
    if (/^(\d)\1+$/.test(clean)) return false;

    let size = clean.length - 2;
    let numbers = clean.substring(0, size);
    const digits = clean.substring(size);
    let sum = 0;
    let pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }
    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0), 10)) return false;

    size = size + 1;
    numbers = clean.substring(0, size);
    sum = 0;
    pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return result === parseInt(digits.charAt(1), 10);
  };

  const formatCNPJ = (val: string): string => {
    const digits = val.replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return digits.replace(/^(\d{2})(\d)/, '$1.$2');
    if (digits.length <= 8) return digits.replace(/^(\d{2})(\d{3})(\d)/, '$1.$2.$3');
    if (digits.length <= 12) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d)/, '$1.$2.$3/$4');
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d)/, '$1.$2.$3/$4-$5');
  };

  const formatCEP = (val: string): string => {
    const digits = val.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 5) return digits;
    return digits.replace(/^(\d{5})(\d)/, '$1-$2');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showToast('Formato inválido. Selecione uma imagem PNG, JPG ou WEBP.', 'error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast('A imagem deve ter no máximo 2MB para garantir performance.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setLogoPreview(base64);
      setLogoUrl(base64);
      showToast('Prévia do logotipo carregada! Clique em Salvar para fixar na clínica.', 'info');
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (currentTenant) {
      setName(currentTenant.name || '');
      setCorporateName((currentTenant as any).corporate_name || currentTenant.name || '');
      setTradeName(currentTenant.trade_name || '');
      setCnpjCpf(currentTenant.cnpj_cpf ? formatCNPJ(currentTenant.cnpj_cpf) : '');
      setEmail(currentTenant.email || '');
      setPhone(currentTenant.phone || '');
      setAddress(currentTenant.address || '');
      setStreet((currentTenant as any).street || '');
      setNumber((currentTenant as any).number || '');
      setComplement((currentTenant as any).complement || '');
      setNeighborhood((currentTenant as any).neighborhood || '');
      setCity(currentTenant.city || '');
      setState(currentTenant.state || '');
      setZipCode((currentTenant as any).zip_code ? formatCEP((currentTenant as any).zip_code) : '');
      setLogoUrl((currentTenant as any).logo_url || '');
      setLogoPreview((currentTenant as any).logo_url || null);
      setClientTermLabel(currentTenant.client_term_label || 'Paciente');
      setPrimaryColor(currentTenant.primary_color || '#4f46e5');
    }
    if (currentUser) {
      setProfileEmail(currentUser.email || '');
    }
  }, [currentTenant, currentUser]);

  const handleSaveClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cnpjCpf.trim() && cnpjCpf.replace(/\D/g, '').length === 14 && !validateCNPJ(cnpjCpf)) {
      showToast('O CNPJ informado possui dígitos verificadores inválidos', 'error');
      return;
    }

    try {
      setLoadingClinic(true);
      await ApiClient.put('/v1/tenants/current', {
        name,
        corporateName,
        tradeName,
        cnpjCpf,
        email,
        phone,
        address,
        street,
        number,
        complement,
        neighborhood,
        city,
        state,
        zipCode,
        logoUrl,
        clientTermLabel,
        primaryColor
      });
      showToast('Configurações da clínica e identidade visual atualizadas com sucesso!', 'success');
      refreshTenant();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar configurações da clínica', 'error');
    } finally {
      setLoadingClinic(false);
    }
  };

  const handleUpdateProfileEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = profileEmail.trim().toLowerCase();
    if (!cleanEmail) {
      showToast('Informe o novo endereço de e-mail', 'error');
      return;
    }
    if (cleanEmail === currentUser?.email?.toLowerCase()) {
      showToast('O e-mail informado já é o seu e-mail atual', 'info');
      return;
    }

    try {
      setLoadingProfileEmail(true);
      const res = await ApiClient.put<{ message: string; email: string }>('/v1/auth/profile/email', {
        email: cleanEmail
      });
      showToast(res.message || 'E-mail pessoal atualizado com sucesso!', 'success');
      await reloadSession();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar e-mail pessoal', 'error');
    } finally {
      setLoadingProfileEmail(false);
    }
  };

  const handleUpdateProfilePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.trim().length < 6) {
      showToast('A nova senha deve possuir pelo menos 6 caracteres', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('A confirmação de senha não coincide com a nova senha', 'error');
      return;
    }

    try {
      setLoadingProfilePassword(true);
      const res = await ApiClient.put<{ message: string }>('/v1/auth/profile/password', {
        currentPassword: currentPassword || undefined,
        newPassword: newPassword.trim()
      });
      showToast(res.message || 'Senha alterada com sucesso!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showToast(err.message || 'Erro ao alterar senha', 'error');
    } finally {
      setLoadingProfilePassword(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            Configurações
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isClinicAdmin
              ? 'Gerencie os dados institucionais da clínica e as configurações pessoais da sua conta.'
              : 'Gerencie os dados de acesso e configurações pessoais da sua conta.'}
          </p>
        </div>

        {/* Abas se for gestor/admin */}
        {isClinicAdmin && (
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl text-xs font-bold flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('clinic')}
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'clinic' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Clínica
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('document_templates')}
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'document_templates' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Modelos de Documentos
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('insurances');
                fetchClinicInsurances();
              }}
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'insurances' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              Convênios
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'profile' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Minha Conta
            </button>
          </div>
        )}
      </div>

      {/* ABA 1: Configurações da Clínica (Apenas Gestores / Admins) */}
      {isClinicAdmin && activeTab === 'clinic' && (
        <form onSubmit={handleSaveClinic} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6">
          {/* Seção Vocabulário */}
          <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-2">
            <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-indigo-600" /> Terminologia Personalizada por Nicho
            </div>
            <p className="text-xs text-indigo-700">
              Como você prefere chamar os usuários que recebem atendimento na sua plataforma?
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {['Paciente', 'Cliente', 'Aluno', 'Tutor / Pet'].map(term => (
                <button
                  type="button"
                  key={term}
                  onClick={() => setClientTermLabel(term)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                    clientTermLabel === term
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-indigo-50'
                  }`}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          {/* Seção Logotipo e Identidade da Clínica */}
          <div className="p-5 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-indigo-600" />
                  Logotipo Oficial da Clínica
                </h3>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Exibido automaticamente no cabeçalho de prontuários, atestados, receitas e recibos.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
              {logoPreview ? (
                <div className="relative group">
                  <img
                    src={logoPreview}
                    alt="Logo da Clínica"
                    className="w-24 h-24 object-contain rounded-2xl border border-slate-200 bg-white p-2 shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setLogoPreview(null);
                      setLogoUrl('');
                    }}
                    className="absolute -top-2 -right-2 p-1 bg-rose-600 text-white rounded-full hover:bg-rose-700 shadow-xs transition-colors"
                    title="Remover logotipo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                  <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                  <span className="text-[10px] leading-tight font-medium">Sem logo</span>
                </div>
              )}

              <div className="flex-1 space-y-2 w-full">
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-300 cursor-pointer shadow-xs transition-all text-xs">
                  <Upload className="w-4 h-4 text-indigo-600" />
                  <span>Selecionar Imagem (PNG, JPG, WEBP)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-[11px] text-slate-400">
                  Resolução recomendada: 400x400px ou horizontal. Tamanho máximo: 2MB. Pré-visualização instantânea no navegador.
                </p>
              </div>
            </div>
          </div>

          {/* Dados Gerais */}
          <div className="space-y-4 text-xs">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Identificação Cadastral</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Razão Social / Nome Oficial</label>
                <input
                  type="text"
                  value={corporateName || name}
                  onChange={e => {
                    setCorporateName(e.target.value);
                    setName(e.target.value);
                  }}
                  placeholder="Ex: Clínica Médica e Saúde Integrada LTDA"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome Fantasia (Exibido aos Pacientes)</label>
                <input
                  type="text"
                  value={tradeName}
                  onChange={e => setTradeName(e.target.value)}
                  placeholder="Ex: Clínica Bem-Estar"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700">CNPJ (com validação)</label>
                  {cnpjCpf.replace(/\D/g, '').length === 14 && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      validateCNPJ(cnpjCpf)
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {validateCNPJ(cnpjCpf) ? '✓ CNPJ Válido' : '✕ CNPJ Inválido'}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={cnpjCpf}
                  maxLength={18}
                  onChange={e => setCnpjCpf(formatCNPJ(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  className={`w-full border rounded-xl px-3 py-2 text-xs ${
                    cnpjCpf.replace(/\D/g, '').length === 14 && !validateCNPJ(cnpjCpf)
                      ? 'border-rose-300 focus:ring-rose-500'
                      : 'border-slate-200'
                  }`}
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">E-mail Principal da Clínica</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Contato e Endereço Completo */}
          <div className="space-y-4 text-xs pt-4 border-t border-slate-100">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Endereço Completo & Atendimento</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">CEP</label>
                <input
                  type="text"
                  value={zipCode}
                  maxLength={9}
                  onChange={e => setZipCode(formatCEP(e.target.value))}
                  placeholder="00000-000"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Logradouro / Rua</label>
                <input
                  type="text"
                  value={street || address}
                  onChange={e => {
                    setStreet(e.target.value);
                    setAddress(e.target.value);
                  }}
                  placeholder="Ex: Avenida Brasil"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Número</label>
                <input
                  type="text"
                  value={number}
                  onChange={e => setNumber(e.target.value)}
                  placeholder="123"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Complemento / Sala</label>
                <input
                  type="text"
                  value={complement}
                  onChange={e => setComplement(e.target.value)}
                  placeholder="Sala 402"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bairro</label>
                <input
                  type="text"
                  value={neighborhood}
                  onChange={e => setNeighborhood(e.target.value)}
                  placeholder="Centro"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cidade *</label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder="Ex: Erechim"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Estado (UF)</label>
                <input
                  type="text"
                  value={state}
                  maxLength={2}
                  onChange={e => setState(e.target.value.toUpperCase())}
                  placeholder="RS"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">WhatsApp / Telefone de Contato</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(54) 99999-9999"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cor Primária da Marca</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="w-9 h-9 rounded-xl border border-slate-200 cursor-pointer p-0.5"
                  />
                  <span className="text-slate-500 font-mono text-xs">{primaryColor}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={loadingClinic}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {loadingClinic ? 'Salvando...' : 'Salvar Alterações da Clínica'}
            </button>
          </div>
        </form>
      )}

      {/* ABA: MODELOS DE DOCUMENTOS (Item 11) */}
      {isClinicAdmin && activeTab === 'document_templates' && (
        <form onSubmit={handleSaveDocTemplate} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6 text-xs">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                Personalização de Modelos de Documentos A4
              </h3>
              <p className="text-slate-500 text-xs mt-0.5">
                Defina cabeçalhos, rodapés e visibilidade de dados institucionais nos documentos impressos.
              </p>
            </div>
            <select
              value={selectedDocType}
              onChange={e => setSelectedDocType(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-xl font-bold bg-slate-50"
            >
              <option value="certificate">Atestado Médico</option>
              <option value="prescription">Receituário</option>
              <option value="exam_request">Solicitação de Exames</option>
            </select>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Título do Documento</label>
              <input
                type="text"
                value={docTemplate.title}
                onChange={e => setDocTemplate({ ...docTemplate, title: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
              <span className="font-bold text-slate-700 block uppercase tracking-wider text-[11px]">
                Elementos Visíveis na Folha Impressa:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={docTemplate.showLogo}
                    onChange={e => setDocTemplate({ ...docTemplate, showLogo: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Exibir Logotipo da Clínica</span>
                </label>
                <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={docTemplate.showClinicAddress}
                    onChange={e => setDocTemplate({ ...docTemplate, showClinicAddress: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Exibir CNPJ e Endereço</span>
                </label>
                <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={docTemplate.showProfessionalRegistration}
                    onChange={e => setDocTemplate({ ...docTemplate, showProfessionalRegistration: e.target.checked })}
                    className="rounded text-indigo-600"
                  />
                  <span>Exibir Registro Profissional (CRM)</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Texto Institucional de Cabeçalho (Opcional)</label>
              <textarea
                rows={2}
                value={docTemplate.headerHtml || ''}
                onChange={e => setDocTemplate({ ...docTemplate, headerHtml: e.target.value })}
                placeholder="Ex: Unidade Especializada de Saúde e Atendimento Integrado"
                className="w-full border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Texto de Rodapé / Observações Legais (Opcional)</label>
              <textarea
                rows={2}
                value={docTemplate.footerHtml || ''}
                onChange={e => setDocTemplate({ ...docTemplate, footerHtml: e.target.value })}
                placeholder="Ex: Horário de funcionamento, telefone de emergência ou orientações pós-atendimento..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all"
            >
              <Save className="w-4 h-4" /> Salvar Modelo de Documento
            </button>
          </div>
        </form>
      )}

      {/* ABA: GESTÃO DE CONVÊNIOS (Item 15) */}
      {isClinicAdmin && activeTab === 'insurances' && (
        <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  Catálogo de Convênios Aceitos
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">
                  Cadastre as operadoras e planos de saúde aceitos pela clínica.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewInsuranceModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs"
              >
                <Plus className="w-4 h-4" /> Cadastrar Convênio
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-3.5">Nome do Convênio</th>
                    <th className="px-6 py-3.5">Registro ANS</th>
                    <th className="px-6 py-3.5">Contato / Autorização</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {clinicInsurances.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        Nenhum convênio cadastrado. Todos os atendimentos serão tratados como Particulares.
                      </td>
                    </tr>
                  ) : (
                    clinicInsurances.map(ins => (
                      <tr key={ins.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-4 font-bold text-slate-900">{ins.name}</td>
                        <td className="px-6 py-4 font-mono">{ins.ans_code || '—'}</td>
                        <td className="px-6 py-4">
                          <div>{ins.phone || '—'}</div>
                          <div className="text-slate-400 text-[10px]">{ins.email || ''}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ins.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {ins.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleInsuranceStatus(ins)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                            {ins.active ? 'Desativar' : 'Ativar'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal Cadastrar Convênio */}
          {showNewInsuranceModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
              <form onSubmit={handleSaveInsurance} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-base font-bold text-slate-900">Cadastrar Novo Convênio</h3>
                  <button type="button" onClick={() => setShowNewInsuranceModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                    ✕
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nome da Operadora / Convênio *</label>
                    <input
                      type="text"
                      required
                      value={insuranceForm.name}
                      onChange={e => setInsuranceForm({ ...insuranceForm, name: e.target.value })}
                      placeholder="Ex: Unimed, Bradesco Saúde, Amil"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Código de Registro ANS</label>
                    <input
                      type="text"
                      value={insuranceForm.ansCode}
                      onChange={e => setInsuranceForm({ ...insuranceForm, ansCode: e.target.value })}
                      placeholder="Ex: 305146"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Telefone Autorizações</label>
                      <input
                        type="text"
                        value={insuranceForm.phone}
                        onChange={e => setInsuranceForm({ ...insuranceForm, phone: e.target.value })}
                        placeholder="0800..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">E-mail</label>
                      <input
                        type="email"
                        value={insuranceForm.email}
                        onChange={e => setInsuranceForm({ ...insuranceForm, email: e.target.value })}
                        placeholder="autorizacoes@..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-2"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Observações Internas</label>
                    <textarea
                      rows={2}
                      value={insuranceForm.notes}
                      onChange={e => setInsuranceForm({ ...insuranceForm, notes: e.target.value })}
                      placeholder="Ex: Exige guia autorizada impressa..."
                      className="w-full border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setShowNewInsuranceModal(false)} className="px-3 py-1.5 border rounded-xl text-slate-600">
                    Cancelar
                  </button>
                  <button type="submit" className="px-5 py-1.5 bg-indigo-600 text-white font-bold rounded-xl shadow-xs">
                    Salvar Convênio
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ABA: Minha Conta & Segurança (Disponível para TODOS os usuários) */}
      {(!isClinicAdmin || activeTab === 'profile') && (
        <div className="space-y-6">
          {/* Card de Alteração de E-mail */}
          <form onSubmit={handleUpdateProfileEmail} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-sm">Alterar Endereço de E-mail</h3>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Acesso Pessoal</span>
            </div>

            <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl flex items-start gap-2.5 text-blue-900 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Ao alterar o seu e-mail, você passará a utilizá-lo no login. Seus vínculos à clínica, atendimentos e permissões continuam os mesmos.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">E-mail Atual</label>
                <input
                  type="email"
                  disabled
                  value={currentUser?.email || ''}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-medium cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Novo E-mail *</label>
                <input
                  type="email"
                  required
                  value={profileEmail}
                  onChange={e => setProfileEmail(e.target.value)}
                  placeholder="novo.email@exemplo.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loadingProfileEmail}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {loadingProfileEmail ? 'Salvando...' : 'Salvar Novo E-mail'}
              </button>
            </div>
          </form>

          {/* Card de Alteração de Senha */}
          <form onSubmit={handleUpdateProfilePassword} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-sm">Alterar Senha de Acesso</h3>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Segurança da Conta</span>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-2.5 text-slate-700 leading-relaxed">
              <Shield className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                A nova senha deve possuir no mínimo 6 caracteres. Você pode alterar sua senha a qualquer momento.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Senha Atual (se souber)</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Sua senha atual"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nova Senha *</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Confirmar Nova Senha *</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loadingProfilePassword}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {loadingProfilePassword ? 'Salvando...' : 'Salvar Nova Senha'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
