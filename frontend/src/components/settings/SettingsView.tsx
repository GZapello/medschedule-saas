import { BillingView } from '../billing/BillingView';
import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { openCookiePreferencesModal } from '../../utils/cookieConsent';
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
  Image as ImageIcon,
  Clock,
  Edit2,
  Scale,
  ExternalLink,
  Cookie,
  ShieldCheck,
  Search,
  Award,
  Briefcase,
  MapPin,
  Info
} from 'lucide-react';

export const COMMON_INSURANCE_PRESETS = [
  { name: 'Unimed', ansCode: '305146', phone: '0800 014 5555' },
  { name: 'Bradesco Saúde', ansCode: '005711', phone: '0800 701 2700' },
  { name: 'Amil', ansCode: '326305', phone: '0800 021 2545' },
  { name: 'SulAmérica Saúde', ansCode: '006246', phone: '0800 722 0504' },
  { name: 'NotreDame Intermédica (GNDI)', ansCode: '359017', phone: '0800 015 3855' },
  { name: 'Hapvida', ansCode: '368253', phone: '0800 280 9130' },
  { name: 'Cassi', ansCode: '346659', phone: '0800 729 0080' },
  { name: 'Geap Saúde', ansCode: '323080', phone: '0800 728 8300' },
  { name: 'Porto Seguro Saúde', ansCode: '000582', phone: '0800 727 9966' },
  { name: 'Allianz Saúde', ansCode: '000515', phone: '0800 013 0700' },
  { name: 'Omint', ansCode: '359645', phone: '0800 726 4000' },
  { name: 'Golden Cross', ansCode: '403911', phone: '0800 728 2001' },
  { name: 'Petrobras Saúde (AMS)', ansCode: '419168', phone: '0800 287 2267' },
  { name: 'Postal Saúde', ansCode: '419133', phone: '0800 888 8110' },
  { name: 'Assefaz', ansCode: '313840', phone: '0800 703 4000' },
  { name: 'Prevent Senior', ansCode: '302147', phone: '0800 770 0789' }
];

export const SettingsView: React.FC = () => {
  const { currentUser, currentTenant, isClinicAdmin, refreshTenant, reloadSession } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'clinic' | 'document_templates' | 'insurances' | 'profile' | 'billing' | 'legal'>(
    isClinicAdmin ? 'clinic' : 'profile'
  );

  // Configurações da Clínica
  const [name, setName] = useState<string>('');
  const [corporateName, setCorporateName] = useState<string>('');
  const [tradeName, setTradeName] = useState<string>('');
  const [cnpjCpf, setCnpjCpf] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [personType, setPersonType] = useState<'pj' | 'pf'>('pj');
  const [municipalRegistration, setMunicipalRegistration] = useState<string>('');
  const [stateRegistration, setStateRegistration] = useState<string>('');
  const [professionalBoard, setProfessionalBoard] = useState<string>('');
  const [professionalRegistry, setProfessionalRegistry] = useState<string>('');
  const [managerProfession, setManagerProfession] = useState<string>('');
  const [managerPracticeAreas, setManagerPracticeAreas] = useState<string>('');
  const [searchingCep, setSearchingCep] = useState<boolean>(false);
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

  // Horários de Funcionamento da Clínica (Item 3)
  const [businessHours, setBusinessHours] = useState<any[]>([
    { dayOfWeek: 1, dayName: 'Segunda-feira', isOpen: true, startTime: '08:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00' },
    { dayOfWeek: 2, dayName: 'Terça-feira', isOpen: true, startTime: '08:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00' },
    { dayOfWeek: 3, dayName: 'Quarta-feira', isOpen: true, startTime: '08:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00' },
    { dayOfWeek: 4, dayName: 'Quinta-feira', isOpen: true, startTime: '08:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00' },
    { dayOfWeek: 5, dayName: 'Sexta-feira', isOpen: true, startTime: '08:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00' },
    { dayOfWeek: 6, dayName: 'Sábado', isOpen: true, startTime: '08:00', endTime: '12:00', breakStart: '', breakEnd: '' },
    { dayOfWeek: 0, dayName: 'Domingo', isOpen: false, startTime: '08:00', endTime: '12:00', breakStart: '', breakEnd: '' }
  ]);

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

  // Convênios da Clínica (Item 5)
  const [clinicInsurances, setClinicInsurances] = useState<any[]>([]);
  const [showNewInsuranceModal, setShowNewInsuranceModal] = useState<boolean>(false);
  const [insuranceForm, setInsuranceForm] = useState({
    id: '',
    name: '',
    ansCode: '',
    planName: '',
    cardNumber: '',
    validityDate: '',
    phone: '',
    email: '',
    notes: '',
    active: true
  });

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
      if (insuranceForm.id) {
        await ApiClient.put(`/v1/insurances/clinic/${insuranceForm.id}`, insuranceForm);
        showToast('Convênio atualizado com sucesso!', 'success');
      } else {
        await ApiClient.post('/v1/insurances/clinic', insuranceForm);
        showToast('Convênio cadastrado com sucesso!', 'success');
      }
      setShowNewInsuranceModal(false);
      setInsuranceForm({ id: '', name: '', ansCode: '', planName: '', cardNumber: '', validityDate: '', phone: '', email: '', notes: '', active: true });
      fetchClinicInsurances();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar convênio', 'error');
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

  const validateCPF = (cpf: string): boolean => {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11 || /^(\d)\1+$/.test(clean)) return false;
    let sum = 0;
    let rest;
    for (let i = 1; i <= 9; i++) sum += parseInt(clean.substring(i - 1, i), 10) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(clean.substring(9, 10), 10)) return false;
    sum = 0;
    for (let i = 1; i <= 10; i++) sum += parseInt(clean.substring(i - 1, i), 10) * (12 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    return rest === parseInt(clean.substring(10, 11), 10);
  };

  const formatCNPJ = (val: string): string => {
    const digits = val.replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return digits.replace(/^(\d{2})(\d)/, '$1.$2');
    if (digits.length <= 8) return digits.replace(/^(\d{2})(\d{3})(\d)/, '$1.$2.$3');
    if (digits.length <= 12) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d)/, '$1.$2.$3/$4');
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d)/, '$1.$2.$3/$4-$5');
  };

  const formatDocument = (val: string): string => {
    const digits = val.replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 11) {
      if (digits.length <= 3) return digits;
      if (digits.length <= 6) return digits.replace(/^(\d{3})(\d)/, '$1.$2');
      if (digits.length <= 9) return digits.replace(/^(\d{3})(\d{3})(\d)/, '$1.$2.$3');
      return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d)/, '$1.$2.$3-$4');
    }
    return formatCNPJ(digits);
  };

  const formatCEP = (val: string): string => {
    const digits = val.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 5) return digits;
    return digits.replace(/^(\d{5})(\d)/, '$1-$2');
  };

  const handleCepSearch = async () => {
    const cleanCep = zipCode.replace(/\D/g, '');
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
      if (data.logradouro) setStreet(data.logradouro);
      if (data.bairro) setNeighborhood(data.bairro);
      if (data.localidade) setCity(data.localidade);
      if (data.uf) setState(data.uf);
      showToast(`Localizado: ${data.localidade}/${data.uf}`, 'success');
    } catch {
      showToast('Erro ao consultar CEP. Preencha manualmente.', 'error');
    } finally {
      setSearchingCep(false);
    }
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

    if (file.size < 3 * 1024) {
      showToast('A imagem selecionada é muito pequena (mínimo: 3KB). Envie uma imagem nítida.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Validação estrita de dimensões mínimas para evitar logos borrados/ilegíveis (Item 2)
        if (img.width < 180 || img.height < 180) {
          showToast(`A resolução da imagem é muito baixa (${img.width}x${img.height}px). O tamanho mínimo permitido é 180x180 pixels para garantir nitidez nos documentos e impressões.`, 'error');
          return;
        }
        setLogoPreview(base64);
        setLogoUrl(base64);
        showToast('Prévia do logotipo carregada em alta resolução! Clique em Salvar para fixar na clínica.', 'info');
      };
      img.onerror = () => {
        showToast('Não foi possível verificar as dimensões do arquivo.', 'error');
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (currentTenant) {
      setName(currentTenant.name || '');
      setCorporateName((currentTenant as any).corporate_name || currentTenant.name || '');
      setTradeName(currentTenant.trade_name || '');
      setCnpjCpf(currentTenant.cnpj_cpf ? formatDocument(currentTenant.cnpj_cpf) : '');
      setEmail(currentTenant.email || '');
      setPhone(currentTenant.phone || '');
      setWhatsapp((currentTenant as any).whatsapp || currentTenant.phone || '');
      setPersonType((currentTenant as any).person_type || 'pj');
      setMunicipalRegistration((currentTenant as any).municipal_registration || '');
      setStateRegistration((currentTenant as any).state_registration || '');
      setProfessionalBoard((currentTenant as any).professional_board || (currentUser as any)?.registrationType || '');
      setProfessionalRegistry((currentTenant as any).professional_registry || (currentUser as any)?.registrationNumber || '');
      setManagerProfession((currentTenant as any).manager_profession || (currentUser as any)?.professionName || '');
      setManagerPracticeAreas((currentTenant as any).manager_practice_areas || (currentUser as any)?.practiceAreas || '');
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

      if ((currentTenant as any).business_hours_json) {
        try {
          const parsed = JSON.parse((currentTenant as any).business_hours_json);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setBusinessHours(parsed);
          }
        } catch (e) {}
      }
    }
    if (currentUser) {
      setProfileEmail(currentUser.email || '');
    }
  }, [currentTenant, currentUser]);

  const handleSaveClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDoc = cnpjCpf.replace(/\D/g, '');
    if (cleanDoc.length === 11 && !validateCPF(cnpjCpf)) {
      showToast('O CPF informado possui dígitos verificadores inválidos', 'error');
      return;
    }
    if (cleanDoc.length === 14 && !validateCNPJ(cnpjCpf)) {
      showToast('O CNPJ informado possui dígitos verificadores inválidos', 'error');
      return;
    }

    try {
      setLoadingClinic(true);
      await ApiClient.put('/v1/tenants/current', {
        name,
        corporateName,
        tradeName,
        personType,
        cnpjCpf: cleanDoc ? cnpjCpf : null,
        municipalRegistration: municipalRegistration.trim() || null,
        stateRegistration: stateRegistration.trim() || null,
        professionalBoard: professionalBoard.trim() || null,
        professionalRegistry: professionalRegistry.trim() || null,
        managerProfession: managerProfession.trim() || null,
        managerPracticeAreas: managerPracticeAreas.trim() || null,
        email,
        phone,
        whatsapp,
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
        primaryColor,
        businessHoursJson: JSON.stringify(businessHours)
      });
      showToast('Dados da conta e estabelecimento salvos com sucesso!', 'success');
      refreshTenant();
      await reloadSession();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar dados da conta', 'error');
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
      const res = await ApiClient.put<{ message: string; token?: string }>('/v1/auth/profile/password', {
        currentPassword: currentPassword || undefined,
        newPassword: newPassword.trim()
      });
      // A troca de senha invalida o token anterior; o backend já devolve um novo válido,
      // sem isso a própria sessão atual seria derrubada na próxima requisição.
      if (res.token) {
        localStorage.setItem('auth_token', res.token);
      }
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

        <button type="button" onClick={()=>setActiveTab(activeTab==='billing'?'profile':'billing')} className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-700 font-bold text-sm">{activeTab==='billing'?'Minha conta':'Assinatura e Plano'}</button>
        {/* Abas de navegação */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl text-xs font-bold flex-wrap">
          {isClinicAdmin && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('clinic')}
                className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'clinic' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Dados da Conta / Estabelecimento
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
            </>
          )}
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
          <button
            type="button"
            onClick={() => setActiveTab('legal')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'legal' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            Privacidade e Documentos Legais
          </button>
        </div>
      </div>

      {/* ABA 1: Configurações da Clínica (Apenas Gestores / Admins) */}
      {activeTab === 'billing' && <BillingView />}
      {isClinicAdmin && activeTab === 'clinic' && (
        <form onSubmit={handleSaveClinic} className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6">
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

          {/* BLOCO 1 - DADOS BÁSICOS */}
          <div className="space-y-4 text-xs">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                Bloco 1 — Dados Básicos
              </h3>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Identificação do estabelecimento ou profissional e canais de contato com clientes.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Razão Social / Nome da Conta *</label>
                <input
                  type="text"
                  required
                  value={corporateName || name}
                  onChange={e => {
                    setCorporateName(e.target.value);
                    setName(e.target.value);
                  }}
                  placeholder="Ex: Consultório Dra. Mariana ou Clínica Prime LTDA"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  value={tradeName}
                  onChange={e => setTradeName(e.target.value)}
                  placeholder="Ex: Espaço Bem-Estar"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700">CPF ou CNPJ</label>
                  {cnpjCpf.replace(/\D/g, '').length === 11 && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      validateCPF(cnpjCpf)
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {validateCPF(cnpjCpf) ? '✓ CPF Válido' : '✕ CPF Inválido'}
                    </span>
                  )}
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
                  onChange={e => setCnpjCpf(formatDocument(e.target.value))}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">E-mail Principal</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="contato@clinica.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Telefone Fixo / Comercial</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(11) 3333-4444"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">WhatsApp / Celular de Atendimento</label>
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={e => setWhatsapp(e.target.value)}
                  placeholder="(11) 99999-8888"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* BLOCO 2 - ENDEREÇO */}
          <div className="space-y-4 text-xs pt-4 border-t border-slate-100">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-600" />
                Bloco 2 — Endereço
              </h3>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Localização do estabelecimento para agendamento online, receitas e recibos.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">CEP</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={zipCode}
                    maxLength={9}
                    onChange={e => setZipCode(formatCEP(e.target.value))}
                    placeholder="00000-000"
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleCepSearch}
                    disabled={searchingCep}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  >
                    <Search className="w-3.5 h-3.5" />
                    {searchingCep ? '...' : 'Buscar'}
                  </button>
                </div>
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
                  placeholder="Ex: Avenida Paulista"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Número</label>
                <input
                  type="text"
                  value={number}
                  onChange={e => setNumber(e.target.value)}
                  placeholder="1200"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Complemento / Sala</label>
                <input
                  type="text"
                  value={complement}
                  onChange={e => setComplement(e.target.value)}
                  placeholder="Conjunto 42"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bairro</label>
                <input
                  type="text"
                  value={neighborhood}
                  onChange={e => setNeighborhood(e.target.value)}
                  placeholder="Bela Vista"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cidade</label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder="São Paulo"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Estado (UF)</label>
                <input
                  type="text"
                  value={state}
                  maxLength={2}
                  onChange={e => setState(e.target.value.toUpperCase())}
                  placeholder="SP"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* BLOCO 3 - DADOS PROFISSIONAIS */}
          <div className="space-y-4 text-xs pt-4 border-t border-slate-100">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-indigo-600" />
                Bloco 3 — Dados Profissionais
              </h3>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Utilizado para assinatura de laudos, emissão de atestados, receituários e prontuários clínicos.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Profissão Principal
                </label>
                <input
                  type="text"
                  value={managerProfession}
                  onChange={e => setManagerProfession(e.target.value)}
                  placeholder="Ex: Fisioterapia, Psicologia, Odontologia, Medicina, Nutrição..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Conselho / Associação de Classe
                </label>
                <input
                  type="text"
                  value={professionalBoard}
                  onChange={e => setProfessionalBoard(e.target.value)}
                  placeholder="Ex: CREFITO, CRP, CRO, CRM, CRN, CRFa, CREF, ABPp"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Número de Registro no Conselho
                </label>
                <div className="relative">
                  <Award className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={professionalRegistry}
                    onChange={e => setProfessionalRegistry(e.target.value)}
                    placeholder="Ex: 12345-F / SP"
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Especialidades / Áreas de Atuação
                </label>
                <input
                  type="text"
                  value={managerPracticeAreas}
                  onChange={e => setManagerPracticeAreas(e.target.value)}
                  placeholder="Ex: Traumato-Ortopedia, TCC, Neurofuncional..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>
            </div>

            <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                <strong>Assinatura de Documentos:</strong> O número do registro profissional e o conselho são inseridos automaticamente no carimbo de atestados, declarações e receitas.
              </p>
            </div>
          </div>

          {/* BLOCO 4 - DADOS FISCAIS */}
          <div className="space-y-4 text-xs pt-4 border-t border-slate-100">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                Bloco 4 — Dados Fiscais (para Emissão & Faturamento)
              </h3>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Dados necessários para faturamento, emissão de notas fiscais e recebimento via gateway de pagamentos.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tipo de Pessoa
                </label>
                <select
                  value={personType}
                  onChange={e => setPersonType(e.target.value as 'pj' | 'pf')}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white font-semibold"
                >
                  <option value="pj">Pessoa Jurídica (PJ)</option>
                  <option value="pf">Pessoa Física / Autônomo (PF)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Inscrição Municipal (IM)
                </label>
                <input
                  type="text"
                  value={municipalRegistration}
                  onChange={e => setMunicipalRegistration(e.target.value)}
                  placeholder="Ex: 12345678"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Inscrição Estadual (IE)
                </label>
                <input
                  type="text"
                  value={stateRegistration}
                  onChange={e => setStateRegistration(e.target.value)}
                  placeholder="Ex: Isento ou 123.456.789.000"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>
            </div>

            <div className="p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-2xl text-xs text-blue-950 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong className="block text-blue-900 mb-0.5">Aviso sobre Emissão de NFS-e e Faturamento Asaas:</strong>
                A Inscrição Municipal e o CNPJ/CPF são necessários para emissão automática de Notas Fiscais de Serviço (NFS-e) e para ativação do faturamento com emissão de cobranças automáticas no Asaas. Você pode preenchê-los agora ou quando for ativar o faturamento da clínica.
              </div>
            </div>
          </div>

          {/* Personalização Visual */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
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

            {/* Horários de Funcionamento da Clínica (Item 3) */}
            <div className="pt-4 border-t border-slate-100">
              <div className="mb-4">
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  Dias e Horários de Funcionamento da Clínica
                </h4>
                <p className="text-slate-500 text-xs mt-0.5">
                  Configure os dias da semana e horários em que a clínica está aberta para atendimentos. Agendamentos serão restritos exclusivamente a estes períodos.
                </p>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                    <tr>
                      <th className="px-4 py-3">Dia da Semana</th>
                      <th className="px-4 py-3 text-center">Aberto</th>
                      <th className="px-4 py-3">Horário de Atendimento</th>
                      <th className="px-4 py-3">Intervalo de Almoço (Opcional)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {businessHours.map((slot, index) => (
                      <tr key={slot.dayOfWeek} className={!slot.isOpen ? 'bg-slate-50/50 opacity-60' : 'hover:bg-slate-50/70'}>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {slot.dayName}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={slot.isOpen}
                              onChange={e => {
                                const updated = [...businessHours];
                                updated[index].isOpen = e.target.checked;
                                setBusinessHours(updated);
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                          </label>
                        </td>
                        <td className="px-4 py-3">
                          {slot.isOpen ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="time"
                                value={slot.startTime}
                                onChange={e => {
                                  const updated = [...businessHours];
                                  updated[index].startTime = e.target.value;
                                  setBusinessHours(updated);
                                }}
                                className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono"
                              />
                              <span className="text-slate-400 font-medium">às</span>
                              <input
                                type="time"
                                value={slot.endTime}
                                onChange={e => {
                                  const updated = [...businessHours];
                                  updated[index].endTime = e.target.value;
                                  setBusinessHours(updated);
                                }}
                                className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono"
                              />
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-xs">Fechado</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {slot.isOpen ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="time"
                                value={slot.breakStart || ''}
                                onChange={e => {
                                  const updated = [...businessHours];
                                  updated[index].breakStart = e.target.value;
                                  setBusinessHours(updated);
                                }}
                                placeholder="Início"
                                className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono"
                              />
                              <span className="text-slate-400 font-medium">às</span>
                              <input
                                type="time"
                                value={slot.breakEnd || ''}
                                onChange={e => {
                                  const updated = [...businessHours];
                                  updated[index].breakEnd = e.target.value;
                                  setBusinessHours(updated);
                                }}
                                placeholder="Fim"
                                className="border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono"
                              />
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                onClick={() => {
                  setInsuranceForm({ id: '', name: '', ansCode: '', planName: '', cardNumber: '', validityDate: '', phone: '', email: '', notes: '', active: true });
                  setShowNewInsuranceModal(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs"
              >
                <Plus className="w-4 h-4" /> Cadastrar Convênio
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-3.5">Nome do Convênio</th>
                    <th className="px-4 py-3.5">Plano / Categoria</th>
                    <th className="px-4 py-3.5">Carteirinha</th>
                    <th className="px-4 py-3.5">Validade</th>
                    <th className="px-4 py-3.5">Registro ANS</th>
                    <th className="px-4 py-3.5">Contato</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {clinicInsurances.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Nenhum convênio cadastrado. Todos os atendimentos serão tratados como Particulares.
                      </td>
                    </tr>
                  ) : (
                    clinicInsurances.map(ins => (
                      <tr key={ins.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-4 font-bold text-slate-900">{ins.name}</td>
                        <td className="px-4 py-4 text-slate-700">{ins.plan_name || '—'}</td>
                        <td className="px-4 py-4 font-mono text-slate-700">{ins.card_number || '—'}</td>
                        <td className="px-4 py-4 text-slate-700">
                          {ins.validity_date ? new Date(ins.validity_date).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="px-4 py-4 font-mono text-slate-500">{ins.ans_code || '—'}</td>
                        <td className="px-4 py-4">
                          <div>{ins.phone || '—'}</div>
                          <div className="text-slate-400 text-[10px]">{ins.email || ''}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ins.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {ins.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setInsuranceForm({
                                  id: ins.id,
                                  name: ins.name,
                                  ansCode: ins.ans_code || '',
                                  planName: ins.plan_name || '',
                                  cardNumber: ins.card_number || '',
                                  validityDate: ins.validity_date ? ins.validity_date.substring(0, 10) : '',
                                  phone: ins.phone || '',
                                  email: ins.email || '',
                                  notes: ins.notes || '',
                                  active: ins.active !== 0
                                });
                                setShowNewInsuranceModal(true);
                              }}
                              className="text-xs font-semibold text-slate-600 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleInsuranceStatus(ins)}
                              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                            >
                              {ins.active ? 'Desativar' : 'Ativar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal Cadastrar / Editar Convênio */}
          {showNewInsuranceModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
              <form onSubmit={handleSaveInsurance} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-base font-bold text-slate-900">
                    {insuranceForm.id ? 'Editar Convênio' : 'Cadastrar Novo Convênio'}
                  </h3>
                  <button type="button" onClick={() => setShowNewInsuranceModal(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                    ✕
                  </button>
                </div>
                <div className="space-y-3">
                  {/* Modelos Pré-definidos */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Modelo Pré-definido (Opcional)
                    </label>
                    <select
                      className="w-full border border-indigo-200 bg-indigo-50/50 text-indigo-950 font-medium rounded-xl px-3 py-2 text-xs"
                      defaultValue=""
                      onChange={e => {
                        const selected = COMMON_INSURANCE_PRESETS.find(p => p.name === e.target.value);
                        if (selected) {
                          setInsuranceForm(prev => ({
                            ...prev,
                            name: selected.name,
                            ansCode: selected.ansCode,
                            phone: prev.phone || selected.phone
                          }));
                        }
                      }}
                    >
                      <option value="">Selecione um modelo para preenchimento rápido...</option>
                      {COMMON_INSURANCE_PRESETS.map(p => (
                        <option key={p.name} value={p.name}>
                          {p.name} (ANS: {p.ansCode})
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Ao selecionar, nome e código ANS são preenchidos automaticamente e continuam totalmente editáveis.
                    </span>
                  </div>

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
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Plano / Categoria (Opcional)</label>
                      <input
                        type="text"
                        value={insuranceForm.planName}
                        onChange={e => setInsuranceForm({ ...insuranceForm, planName: e.target.value })}
                        placeholder="Ex: Especial, Básico"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Código ANS</label>
                      <input
                        type="text"
                        value={insuranceForm.ansCode}
                        onChange={e => setInsuranceForm({ ...insuranceForm, ansCode: e.target.value })}
                        placeholder="Ex: 305146"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Nº Carteirinha (Opcional)</label>
                      <input
                        type="text"
                        value={insuranceForm.cardNumber}
                        onChange={e => setInsuranceForm({ ...insuranceForm, cardNumber: e.target.value })}
                        placeholder="Ex: 0023.9981..."
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Validade (Opcional)</label>
                      <input
                        type="date"
                        value={insuranceForm.validityDate}
                        onChange={e => setInsuranceForm({ ...insuranceForm, validityDate: e.target.value })}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2"
                      />
                    </div>
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

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="insuranceActiveToggle"
                      checked={insuranceForm.active}
                      onChange={e => setInsuranceForm({ ...insuranceForm, active: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="insuranceActiveToggle" className="font-bold text-slate-700 select-none cursor-pointer">
                      Convênio Ativo para Agendamentos
                    </label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setShowNewInsuranceModal(false)} className="px-3 py-1.5 border rounded-xl text-slate-600 cursor-pointer">
                    Cancelar
                  </button>
                  <button type="submit" className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs cursor-pointer">
                    {insuranceForm.id ? 'Atualizar Convênio' : 'Salvar Convênio'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ABA: Minha Conta & Segurança (Disponível para TODOS os usuários) */}
      {((!isClinicAdmin && activeTab !== 'billing') || activeTab === 'profile') && (
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

      {/* ABA: Privacidade e Documentos Legais */}
      {activeTab === 'legal' && (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-600" />
              Privacidade e Documentos Legais
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Consulte os termos aceitos pela sua clínica e gerencie a conformidade com a Lei Geral de Proteção de Dados (LGPD).
            </p>
          </div>

          {/* Documentos Legais Vigentes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <h4 className="font-bold text-slate-800 text-sm">Termos de Uso</h4>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                  {currentUser?.termsVersionAccepted ? `v${currentUser.termsVersionAccepted} • Aceito` : 'Vigente'}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Regras de utilização, responsabilidade da clínica pelos colaboradores, limites do plano e cláusula de isenção médica da plataforma.
              </p>
              <a
                href="/termos-de-uso"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700"
              >
                <span>Ler Termos de Uso</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-bold text-slate-800 text-sm">Política de Privacidade</h4>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                  {currentUser?.privacyVersionAccepted ? `v${currentUser.privacyVersionAccepted} • Ciente` : 'Vigente'}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tratamento de dados pessoais, salvaguardas de sigilo para prontuários de saúde e divisão de papéis da LGPD.
              </p>
              <a
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700"
              >
                <span>Ler Política de Privacidade</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Papéis de Controlador e Operador */}
          <div className="p-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 space-y-2">
            <h4 className="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-indigo-600" />
              Papéis da sua Clínica e da Plataforma na LGPD
            </h4>
            <p className="text-xs text-indigo-800 leading-relaxed">
              Sua clínica atua como <strong>Controladora</strong> dos dados de pacientes e registros médicos, cabendo aos seus profissionais garantir o sigilo técnico e a legitimidade das anotações. O Zemda opera como <strong>Operador</strong> de infraestrutura tecnológica, garantindo isolamento lógico de banco de dados, criptografia e auditabilidade.
            </p>
          </div>

          {/* Cookies e Preferências */}
          <div className="p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Cookie className="w-4 h-4 text-amber-600" />
                <h4 className="font-bold text-slate-800 text-xs">Preferências de Cookies e Rastreamento</h4>
              </div>
              <button
                type="button"
                onClick={openCookiePreferencesModal}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer self-start sm:self-auto"
              >
                Gerenciar Preferências de Cookies
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Revise o consentimento de cookies a qualquer momento. Lembramos que o Zemda não comercializa dados nem envia dados clínicos de pacientes para serviços de terceiros.
            </p>
          </div>

          {/* Canal do DPO */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-slate-600" />
              Canal de Atendimento ao Titular e Encarregado de Dados (DPO)
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Para exercer direitos como titular ou solicitar esclarecimentos adicionais sobre a proteção de dados na plataforma:
            </p>
            <p className="font-mono text-xs font-bold text-indigo-600">
              privacidade@zemda.com.br • dpo@zemda.com.br
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
