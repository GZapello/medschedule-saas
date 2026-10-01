import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDoctorName } from '../../utils/formatters';
import { Professional, Profession, Specialty } from '../../types';
import {
  Users,
  Search,
  Plus,
  Link as LinkIcon,
  Copy,
  Check,
  X,
  ShieldCheck,
  Clock,
  Calendar,
  DollarSign,
  AlertCircle,
  Trash2,
  Edit3,
  CheckCircle2,
  Mail,
  Phone,
  Briefcase,
  Ban,
  ArrowLeft,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Lock,
  Unlock,
  Key,
  Palmtree,
  Coffee,
  AlertTriangle
} from 'lucide-react';

interface Shift {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  break_start?: string | null;
  break_end?: string | null;
  is_active: boolean | number;
}

interface BlockedTime {
  id: string;
  title: string;
  start_datetime: string;
  end_datetime: string;
  reason?: string;
  type?: string;
}

const AVAILABLE_PERMISSIONS = [
  { id: 'manage_subscription', label: 'Gerenciar assinatura e plano da clínica', group: 'admin' },
  { id: 'view_schedule', label: 'Visualizar agenda da clínica', group: 'agenda' },
  { id: 'create_appointment', label: 'Criar agendamentos', group: 'agenda' },
  { id: 'edit_appointment', label: 'Editar e remarcar agendamentos', group: 'agenda' },
  { id: 'cancel_appointment', label: 'Cancelar agendamentos', group: 'agenda' },
  { id: 'create_patient', label: 'Cadastrar novos pacientes/clientes', group: 'patients' },
  { id: 'edit_patient', label: 'Editar ficha de pacientes', group: 'patients' },
  { id: 'view_exams', label: 'Visualizar e registrar exames a receber', group: 'exams' },
  { id: 'view_financial', label: 'Visualizar movimentações financeiras', group: 'financial' },
  { id: 'issue_receipt', label: 'Emitir recibos oficiais', group: 'financial' },
  { id: 'view_receipts', label: 'Visualizar recibos emitidos', group: 'financial' },
  { id: 'manage_professionals', label: 'Gerenciar profissionais', group: 'admin' },
  { id: 'manage_staff', label: 'Gerenciar equipe e funcionários', group: 'admin' },
  { id: 'manage_services', label: 'Gerenciar catálogo de serviços e salas', group: 'admin' },
  { id: 'view_reports', label: 'Acessar relatórios e exportar planilhas', group: 'admin' },
  { id: 'manage_settings', label: 'Alterar configurações da clínica', group: 'admin' }
];

const PERMISSION_PRESETS = [
  {
    id: 'receptionist',
    label: 'Recepcionista',
    desc: 'Agenda completa, cadastro de pacientes, pagamentos e emissão de recibos',
    perms: ['view_schedule', 'create_appointment', 'edit_appointment', 'cancel_appointment', 'create_patient', 'edit_patient', 'view_exams', 'view_financial', 'issue_receipt', 'view_receipts']
  },
  {
    id: 'professional',
    label: 'Profissional de Saúde',
    desc: 'Agenda própria e gestão direta de pacientes',
    perms: ['view_schedule', 'create_appointment', 'edit_appointment', 'cancel_appointment', 'create_patient', 'edit_patient', 'view_exams']
  },
  {
    id: 'dentist',
    label: 'Cirurgião-Dentista',
    desc: 'Agenda própria, prontuário e gestão de pacientes',
    perms: ['view_schedule', 'create_appointment', 'edit_appointment', 'cancel_appointment', 'create_patient', 'edit_patient', 'view_exams']
  },
  {
    id: 'clinic_admin',
    label: 'Administrador da Clínica',
    desc: 'Acesso total e irrestrito a todas as funções da clínica',
    perms: AVAILABLE_PERMISSIONS.map(p => p.id)
  }
];

const DAYS_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];

const getCouncilForProfession = (profNameOrId?: string): string => {
  const target = (profNameOrId || '').toLowerCase();
  if (target.includes('dentist') || target.includes('odonto')) return 'CRO';
  if (target.includes('médic') || target.includes('medic')) return 'CRM';
  if (target.includes('fisioterap') || target.includes('fisio')) return 'CREFITO';
  if (target.includes('psicanal')) return 'Registro Associação';
  if (target.includes('psicólog') || target.includes('psicolog')) return 'CRP';
  if (target.includes('nutri')) return 'CRN';
  if (target.includes('fono')) return 'CRFa';
  if (target.includes('ocupacional')) return 'CREFITO';
  if (target.includes('psicopedag')) return 'ABPp';
  if (target.includes('personal') || target.includes('educa')) return 'CREF';
  if (target.includes('enferm')) return 'COREN';
  if (target.includes('farmac')) return 'CRF';
  if (target.includes('biomedic')) return 'CRBM';
  if (target.includes('social')) return 'CRESS';
  if (target.includes('administra') || target.includes('gestor')) return 'CRA';
  return 'Conselho';
};

export const UnifiedTeamManagement: React.FC = () => {
  const { isClinicAdmin, reloadSession, currentTenant } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'inactive' | 'invites'>('active');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Dados carregados
  const [staffList, setStaffList] = useState<any[]>([]);
  const [professionalsList, setProfessionalsList] = useState<Professional[]>([]);
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [clinicInvites, setClinicInvites] = useState<any[]>([]);

  // Ficha Única do Membro (Modal de Edição Consolidada)
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [memberSheetTab, setMemberSheetTab] = useState<'profile' | 'schedules' | 'permissions' | 'financial'>('profile');

  // Estado da Ficha - Perfil
  const [sheetName, setSheetName] = useState<string>('');
  const [sheetGender, setSheetGender] = useState<'M' | 'F'>('M');
  const [sheetEmail, setSheetEmail] = useState<string>('');
  const [sheetPhone, setSheetPhone] = useState<string>('');
  const [sheetProfessionId, setSheetProfessionId] = useState<string>('');
  const [sheetSpecialtyId, setSheetSpecialtyId] = useState<string>('');
  const [sheetRegistrationType, setSheetRegistrationType] = useState<string>('CRP');
  const [sheetRegistrationNumber, setSheetRegistrationNumber] = useState<string>('');
  const [sheetBio, setSheetBio] = useState<string>('');
  const [sheetPracticeAreas, setSheetPracticeAreas] = useState<string>('');
  const [sheetBufferMinutes, setSheetBufferMinutes] = useState<number>(10);
  const [sheetSlug, setSheetSlug] = useState<string>('');
  const [sheetPublicBookingEnabled, setSheetPublicBookingEnabled] = useState<boolean>(true);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  // Estado da Ficha - Escala
  const [sheetShifts, setSheetShifts] = useState<Shift[]>([]);
  const [sheetBlockedTimes, setSheetBlockedTimes] = useState<BlockedTime[]>([]);
  const [savingSchedules, setSavingSchedules] = useState<boolean>(false);
  const [showBlockModal, setShowBlockModal] = useState<boolean>(false);
  const [blockTitle, setBlockTitle] = useState<string>('');
  const [blockStart, setBlockStart] = useState<string>('');
  const [blockEnd, setBlockEnd] = useState<string>('');
  const [blockType, setBlockType] = useState<string>('absence');

  // Estado da Ficha - Permissões
  const [sheetPermissions, setSheetPermissions] = useState<string[]>([]);
  const [savingPermissions, setSavingPermissions] = useState<boolean>(false);

  // Estado da Ficha - Financeiro
  const [sheetRemunerationType, setSheetRemunerationType] = useState<'commission' | 'salary' | 'both'>('commission');
  const [sheetCommissionPercentage, setSheetCommissionPercentage] = useState<number>(50);
  const [sheetFixedSalary, setSheetFixedSalary] = useState<number>(0);
  const [sheetPaymentDay, setSheetPaymentDay] = useState<number>(5);
  const [savingFinancial, setSavingFinancial] = useState<boolean>(false);

  // Modal de Convite
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteRole, setInviteRole] = useState<string>('professional');
  const [inviteDays, setInviteDays] = useState<number>(7);
  const [generatingInvite, setGeneratingInvite] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [staffData, profsData, taxonomyProfs, taxonomySpecs, invitesData] = await Promise.all([
        ApiClient.get<any>('/v1/staff').catch(() => ({ staff: [], invites: [] })),
        ApiClient.get<Professional[]>('/v1/professionals').catch(() => []),
        ApiClient.get<Profession[]>('/v1/taxonomy/professions').catch(() => []),
        ApiClient.get<Specialty[]>('/v1/taxonomy/specialties').catch(() => []),
        ApiClient.get<any>('/v1/staff/invites').catch(() => ({ invites: [] }))
      ]);

      const staffArray = Array.isArray(staffData)
        ? staffData
        : (Array.isArray(staffData?.staff) ? staffData.staff : []);
      const profsArray = Array.isArray(profsData) ? profsData : [];
      const taxonomyProfsArray = Array.isArray(taxonomyProfs) ? taxonomyProfs : [];
      const taxonomySpecsArray = Array.isArray(taxonomySpecs) ? taxonomySpecs : [];
      const invitesArray = Array.isArray(invitesData)
        ? invitesData
        : (Array.isArray(invitesData?.invites)
            ? invitesData.invites
            : (Array.isArray(staffData?.invites) ? staffData.invites : []));

      setStaffList(staffArray);
      setProfessionalsList(profsArray);
      setProfessions(taxonomyProfsArray);
      setSpecialties(taxonomySpecsArray);
      setClinicInvites(invitesArray);
    } catch (err: any) {
      showToast('Erro ao carregar dados da equipe', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Consolidação de Staff e Professional
  const combinedMembers = React.useMemo(() => {
    const profMap = new Map<string, Professional>();
    const safeProfs = Array.isArray(professionalsList) ? professionalsList : [];
    for (const p of safeProfs) {
      if (!p) continue;
      if (p.user_id) profMap.set(p.user_id, p);
      if (p.id) profMap.set(p.id, p);
    }

    const processedUserIds = new Set<string>();
    const list: any[] = [];

    // 1. Itera por staffList
    const safeStaff = Array.isArray(staffList) ? staffList : [];
    for (const s of safeStaff) {
      if (!s) continue;
      processedUserIds.add(s.id);
      const matchedProf = profMap.get(s.id) || (s.professional_id ? profMap.get(s.professional_id) : null);
      list.push({
        ...s,
        userId: s.id,
        professionalId: matchedProf?.id || s.professional_id || null,
        professionalRecord: matchedProf,
        effectiveProfession: matchedProf?.profession_name || s.profession_name || (s.role === 'clinic_admin' ? 'Gestor' : s.role),
        effectiveRegistration: matchedProf?.registration_number
          ? `${matchedProf.registration_type || 'Registro'}: ${matchedProf.registration_number}`
          : (s.registration_number ? `${s.registration_type || 'Registro'}: ${s.registration_number}` : null),
        schedules: (matchedProf as any)?.schedules || [],
        blockedTimes: (matchedProf as any)?.blockedTimes || []
      });
    }

    // 2. Itera por profissionais que eventualmente não estejam em staffList
    for (const p of safeProfs) {
      if (!p) continue;
      if (p.user_id && processedUserIds.has(p.user_id)) continue;
      list.push({
        id: p.user_id || p.id,
        userId: p.user_id || null,
        professionalId: p.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        role: 'professional',
        status: p.active ? 'active' : 'inactive',
        professionalRecord: p,
        effectiveProfession: p.profession_name || 'Profissional',
        effectiveRegistration: p.registration_number ? `${p.registration_type || 'Registro'}: ${p.registration_number}` : null,
        permissions: ['view_schedule', 'create_appointment', 'edit_appointment', 'cancel_appointment', 'create_patient', 'edit_patient'],
        schedules: (p as any).schedules || [],
        blockedTimes: (p as any).blockedTimes || []
      });
    }

    return list;
  }, [staffList, professionalsList]);

  // Filtros de busca e tabs
  const filteredMembers = React.useMemo(() => {
    return combinedMembers.filter(m => {
      // Filtro de aba
      if (activeTab === 'active' && m.status !== 'active') return false;
      if (activeTab === 'pending' && m.status !== 'pending') return false;
      if (activeTab === 'inactive' && (m.status !== 'inactive' && m.status !== 'blocked')) return false;

      // Filtro de busca textual
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const matchName = m.name?.toLowerCase().includes(term);
      const matchEmail = m.email?.toLowerCase().includes(term);
      const matchProf = m.effectiveProfession?.toLowerCase().includes(term);
      const matchReg = m.effectiveRegistration?.toLowerCase().includes(term);
      return matchName || matchEmail || matchProf || matchReg;
    });
  }, [combinedMembers, activeTab, searchTerm]);

  // Contadores para badges das abas
  const activeCount = combinedMembers.filter(m => m.status === 'active').length;
  const pendingCount = combinedMembers.filter(m => m.status === 'pending').length;
  const inactiveCount = combinedMembers.filter(m => m.status === 'inactive' || m.status === 'blocked').length;

  // Abertura da Ficha Única do Membro
  const handleOpenMemberSheet = async (member: any, defaultTab: 'profile' | 'schedules' | 'permissions' | 'financial' = 'profile') => {
    setSelectedMember(member);
    setMemberSheetTab(defaultTab);

    // Preenche dados do Perfil
    const prof = member.professionalRecord;
    setSheetName(member.name || '');
    setSheetEmail(member.email || '');
    setSheetPhone(member.phone || '');
    setSheetGender(prof?.gender || 'M');
    setSheetProfessionId(prof?.profession_id || '');
    setSheetSpecialtyId(prof?.specialty_id || '');
    setSheetRegistrationType(prof?.registration_type || (prof?.profession_name ? getCouncilForProfession(prof.profession_name) : 'CRM'));
    setSheetRegistrationNumber(prof?.registration_number || member.registration_number || '');
    setSheetBio(prof?.bio || '');
    setSheetPracticeAreas(prof?.practice_areas || member.practice_areas || '');
    setSheetBufferMinutes(prof?.buffer_minutes || 10);
    setSheetSlug(prof?.slug || '');
    setSheetPublicBookingEnabled(prof ? prof.public_booking_enabled !== false : true);

    // Preenche Permissões
    setSheetPermissions(member.permissions || []);

    // Preenche Financeiro
    setSheetRemunerationType(prof?.remuneration_type || 'commission');
    setSheetCommissionPercentage(prof?.commission_percentage ?? 50);
    setSheetFixedSalary(prof?.fixed_salary ?? 0);
    setSheetPaymentDay(prof?.payment_day ?? 5);

    // Carrega dados detalhados da escala se possuir registro de profissional
    if (member.professionalId) {
      try {
        const details = await ApiClient.get<any>(`/v1/professionals/${member.professionalId}`);
        if (details.schedules) {
          setSheetShifts(details.schedules.map((s: any) => ({
            ...s,
            day_of_week: Number(s.day_of_week),
            is_active: Boolean(s.is_active)
          })));
        } else {
          setSheetShifts([]);
        }
        setSheetBlockedTimes(details.blockedTimes || []);
      } catch (e) {
        setSheetShifts(member.schedules || []);
        setSheetBlockedTimes(member.blockedTimes || []);
      }
    } else {
      setSheetShifts([]);
      setSheetBlockedTimes([]);
    }
  };

  // Salvar Aba 1: Perfil Profissional
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;
    try {
      setSavingProfile(true);
      if (selectedMember.professionalId) {
        await ApiClient.put(`/v1/professionals/${selectedMember.professionalId}`, {
          name: sheetName,
          gender: sheetGender,
          email: sheetEmail,
          phone: sheetPhone,
          professionId: sheetProfessionId,
          specialtyId: sheetSpecialtyId,
          registrationType: sheetRegistrationType,
          registrationNumber: sheetRegistrationNumber,
          bio: sheetBio,
          practiceAreas: sheetPracticeAreas,
          bufferMinutes: sheetBufferMinutes,
          slug: sheetSlug,
          publicBookingEnabled: sheetPublicBookingEnabled
        });
      }
      showToast('Perfil do membro salvo com sucesso!', 'success');
      await fetchData();
      await reloadSession();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar perfil', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // Salvar Aba 2: Escala & Horários
  const handleSaveSchedules = async () => {
    if (!selectedMember || !selectedMember.professionalId) {
      showToast('Este colaborador ainda não possui registro de profissional clínico', 'error');
      return;
    }
    try {
      setSavingSchedules(true);
      await ApiClient.put(`/v1/professionals/${selectedMember.professionalId}/schedules`, {
        schedules: sheetShifts
      });
      showToast('Escala semanal atualizada com sucesso!', 'success');
      await fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar escala', 'error');
    } finally {
      setSavingSchedules(false);
    }
  };

  // Salvar Novo Bloqueio de Horário / Férias
  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember?.professionalId || !blockTitle || !blockStart || !blockEnd) {
      showToast('Preencha todos os campos do bloqueio', 'error');
      return;
    }
    try {
      await ApiClient.post(`/v1/professionals/${selectedMember.professionalId}/blocked-times`, {
        title: blockTitle,
        start_datetime: blockStart,
        end_datetime: blockEnd,
        type: blockType,
        reason: blockTitle
      });
      showToast('Bloqueio registrado com sucesso!', 'success');
      setShowBlockModal(false);
      setBlockTitle('');
      setBlockStart('');
      setBlockEnd('');
      // Recarrega bloqueios
      const details = await ApiClient.get<any>(`/v1/professionals/${selectedMember.professionalId}`);
      setSheetBlockedTimes(details.blockedTimes || []);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar bloqueio', 'error');
    }
  };

  // Excluir Bloqueio
  const handleDeleteBlock = async (blockId: string) => {
    if (!selectedMember?.professionalId) return;
    try {
      await ApiClient.delete(`/v1/professionals/${selectedMember.professionalId}/blocked-times/${blockId}`);
      showToast('Bloqueio removido com sucesso', 'info');
      setSheetBlockedTimes(prev => prev.filter(b => b.id !== blockId));
      fetchData();
    } catch (err: any) {
      showToast('Erro ao remover bloqueio', 'error');
    }
  };

  // Salvar Aba 3: Permissões Granulares
  const handleSavePermissions = async () => {
    if (!selectedMember?.userId) {
      showToast('Usuário sem identificador de acesso', 'error');
      return;
    }
    try {
      setSavingPermissions(true);
      await ApiClient.put(`/v1/staff/${selectedMember.userId}/permissions`, {
        permissions: sheetPermissions
      });
      showToast('Permissões de acesso atualizadas com sucesso!', 'success');
      await fetchData();
      await reloadSession();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar permissões', 'error');
    } finally {
      setSavingPermissions(false);
    }
  };

  // Salvar Aba 4: Financeiro do Profissional
  const handleSaveFinancial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember?.professionalId) {
      showToast('Colaborador sem registro de profissional clínico', 'error');
      return;
    }
    try {
      setSavingFinancial(true);
      await ApiClient.put(`/v1/professionals/${selectedMember.professionalId}`, {
        remunerationType: sheetRemunerationType,
        commissionPercentage: sheetCommissionPercentage,
        fixedSalary: sheetFixedSalary,
        paymentDay: sheetPaymentDay
      });
      showToast('Configurações financeiras do profissional salvas com sucesso!', 'success');
      await fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar financeiro', 'error');
    } finally {
      setSavingFinancial(false);
    }
  };

  // Ações de Membro: Ativar/Desativar
  const handleToggleStatus = async (member: any) => {
    if (!member.userId) return;
    try {
      await ApiClient.put(`/v1/staff/${member.userId}/toggle-status`, {});
      showToast(`Status de ${member.name} alterado com sucesso!`, 'info');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao alternar status do membro', 'error');
    }
  };

  // Ações de Membro: Aprovar Solicitação Pendente
  const handleApprovePending = async (member: any) => {
    if (!member.userId) return;
    try {
      await ApiClient.post(`/v1/staff/${member.userId}/approve`, {
        role: member.role || 'professional'
      });
      showToast(`Solicitação de ${member.name} aprovada!`, 'success');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao aprovar solicitação', 'error');
    }
  };

  // Gerar Link de Convite
  const handleGenerateInvite = async () => {
    try {
      setGeneratingInvite(true);
      const res = await ApiClient.post<{ token: string; inviteUrl: string }>('/v1/staff/invites', {
        role: inviteRole,
        expiresInDays: inviteDays
      });
      showToast('Link de convite gerado com sucesso!', 'success');
      setCopiedLink(res.inviteUrl);
      navigator.clipboard.writeText(res.inviteUrl);
      setShowInviteModal(false);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao gerar link de convite', 'error');
    } finally {
      setGeneratingInvite(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Seção de Equipe */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Equipe, Profissionais & Escalas
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerencie profissionais clínicos, equipe administrativa, escalas de atendimento, permissões e convites em um único lugar.
          </p>
        </div>

        {isClinicAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Gerar Convite</span>
            </button>
          </div>
        )}
      </div>

      {/* Alerta de link recém-gerado */}
      {copiedLink && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-emerald-800 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Link de convite gerado e copiado para a área de transferência: <strong>{copiedLink}</strong></span>
          </div>
          <button
            type="button"
            onClick={() => setCopiedLink(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Barra de Busca e Navegação por Abas */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Abas */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl text-xs font-bold overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'active' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Equipe Ativa</span>
            <span className="ml-1 px-1.5 py-0.2 bg-slate-200/80 text-slate-700 rounded-full text-[10px] font-extrabold">
              {activeCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'pending' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Solicitações</span>
            {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-extrabold animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inactive')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'inactive' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Inativos</span>
            <span className="ml-1 px-1.5 py-0.2 bg-slate-200/80 text-slate-700 rounded-full text-[10px] font-extrabold">
              {inactiveCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('invites')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'invites' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Links de Convite</span>
            <span className="ml-1 px-1.5 py-0.2 bg-slate-200/80 text-slate-700 rounded-full text-[10px] font-extrabold">
              {Array.isArray(clinicInvites) ? clinicInvites.length : 0}
            </span>
          </button>
        </div>

        {/* Input de Busca */}
        {activeTab !== 'invites' && (
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, e-mail ou conselho..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 shadow-2xs"
            />
          </div>
        )}
      </div>

      {/* TAB: Links de Convite */}
      {activeTab === 'invites' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Links de Convite Ativos da Clínica</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Compartilhe o link de convite com novos membros para que se cadastrem e ingressem diretamente na clínica.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Criar Novo Link</span>
            </button>
          </div>

          {(!Array.isArray(clinicInvites) || clinicInvites.length === 0) ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500">
              Nenhum link de convite ativo no momento. Clique no botão acima para gerar um novo link.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {clinicInvites.map((inv) => {
                const url = `${window.location.origin}/convite/${inv.token}`;
                return (
                  <div key={inv.id || inv.token} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 font-mono">{url}</span>
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-[10px]">
                          Função: {inv.role === 'clinic_admin' ? 'Administrador' : inv.role === 'receptionist' ? 'Recepção' : 'Profissional'}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px]">
                        Criado em: {new Date(inv.created_at).toLocaleDateString()} • Expira em: {new Date(inv.expires_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(url);
                          showToast('Link copiado com sucesso!', 'success');
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copiar Link</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: Lista de Membros (Ativos, Pendentes, Inativos) */}
      {activeTab !== 'invites' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMembers.length === 0 ? (
            <div className="col-span-full p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 space-y-2">
              <Users className="w-8 h-8 mx-auto opacity-40 text-slate-500" />
              <p className="text-sm font-semibold text-slate-700">Nenhum membro encontrado</p>
              <p className="text-xs text-slate-400">Tente ajustar o termo da busca ou selecione outra aba acima.</p>
            </div>
          ) : (
            filteredMembers.map((member) => {
              const displayName = formatDoctorName(member.name, member.professionalRecord?.gender || 'M');
              const isPending = member.status === 'pending';
              const isInactive = member.status === 'inactive' || member.status === 'blocked';

              return (
                <div
                  key={member.id}
                  className={`bg-white rounded-3xl border p-5 shadow-xs transition-all hover:shadow-md flex flex-col justify-between gap-4 ${
                    isPending ? 'border-amber-300 bg-amber-50/20' : isInactive ? 'border-slate-200 opacity-75' : 'border-slate-200'
                  }`}
                >
                  {/* Topo do Card */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-500 to-teal-500 text-white font-bold text-base flex items-center justify-center shadow-xs">
                          {member.name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm leading-tight hover:text-indigo-600 transition-colors">
                            {displayName}
                          </h4>
                          <p className="text-xs text-indigo-600 font-medium mt-0.5">
                            {member.effectiveProfession || 'Profissional'}
                          </p>
                        </div>
                      </div>

                      {/* Badge de Status */}
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                        isPending
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : isInactive
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {isPending ? 'Pendente' : isInactive ? 'Inativo' : 'Ativo'}
                      </span>
                    </div>

                    {/* Detalhes de Registro e Contato */}
                    <div className="space-y-1.5 text-xs text-slate-500 pt-1">
                      {member.effectiveRegistration && (
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                          <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                          <span>{member.effectiveRegistration}</span>
                        </div>
                      )}
                      {member.email && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{member.email}</span>
                        </div>
                      )}
                      {member.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{member.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ações do Card */}
                  <div className="border-t border-slate-100 pt-3 flex items-center justify-between gap-2">
                    {isPending ? (
                      <div className="flex items-center gap-2 w-full">
                        <button
                          type="button"
                          onClick={() => handleApprovePending(member)}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Aprovar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(member)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                          Recusar
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenMemberSheet(member, 'profile')}
                          className="flex-1 py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Ver Ficha Completa</span>
                        </button>

                        {isClinicAdmin && (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(member)}
                            className={`p-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                              isInactive
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                                : 'bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-700 border-slate-200'
                            }`}
                            title={isInactive ? 'Reativar membro' : 'Desativar membro'}
                          >
                            {isInactive ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Ban className="w-4 h-4" />}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FICHA ÚNICA DO MEMBRO (Consolidação em 4 Abas) */}
      {/* ========================================================================= */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header da Ficha Única */}
            <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-bold text-lg flex items-center justify-center shadow-xs">
                  {selectedMember.name?.charAt(0) || 'U'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base">
                      {formatDoctorName(selectedMember.name, sheetGender)}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                      {selectedMember.effectiveProfession || 'Profissional'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedMember.email} • {selectedMember.phone || 'Sem telefone'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setSelectedMember(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                  title="Fechar ficha"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Abas da Ficha Única */}
            <div className="px-6 pt-3 bg-white border-b border-slate-200 flex items-center gap-2 overflow-x-auto text-xs font-bold">
              <button
                type="button"
                onClick={() => setMemberSheetTab('profile')}
                className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  memberSheetTab === 'profile'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                <span>Perfil Profissional</span>
              </button>

              <button
                type="button"
                onClick={() => setMemberSheetTab('schedules')}
                className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  memberSheetTab === 'schedules'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span>Agenda & Escala</span>
              </button>

              <button
                type="button"
                onClick={() => setMemberSheetTab('permissions')}
                className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  memberSheetTab === 'permissions'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Acessos & Permissões</span>
              </button>

              <button
                type="button"
                onClick={() => setMemberSheetTab('financial')}
                className={`pb-3 px-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  memberSheetTab === 'financial'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span>Financeiro</span>
              </button>
            </div>

            {/* Conteúdo das Abas com Rolagem Suave */}
            <div className="flex-1 overflow-y-auto p-6 text-xs text-slate-700 space-y-6">
              {/* ============================================================== */}
              {/* ABA 1: PERFIL PROFISSIONAL */}
              {/* ============================================================== */}
              {memberSheetTab === 'profile' && (
                <form onSubmit={handleSaveProfile} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">Nome Completo *</label>
                      <input
                        type="text"
                        required
                        value={sheetName}
                        onChange={e => setSheetName(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tratamento / Gênero</label>
                      <select
                        value={sheetGender}
                        onChange={e => setSheetGender(e.target.value as 'M' | 'F')}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                      >
                        <option value="M">Dr. (Masculino)</option>
                        <option value="F">Dra. (Feminino)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">E-mail de Acesso *</label>
                      <input
                        type="email"
                        required
                        value={sheetEmail}
                        onChange={e => setSheetEmail(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Telefone / WhatsApp</label>
                      <input
                        type="text"
                        value={sheetPhone}
                        onChange={e => setSheetPhone(e.target.value)}
                        placeholder="(00) 00000-0000"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Intervalo entre Consultas</label>
                      <select
                        value={sheetBufferMinutes}
                        onChange={e => setSheetBufferMinutes(Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                      >
                        <option value={0}>Sem intervalo (0 min)</option>
                        <option value={5}>5 minutos</option>
                        <option value={10}>10 minutos (Recomendado)</option>
                        <option value={15}>15 minutos</option>
                        <option value={20}>20 minutos</option>
                        <option value={30}>30 minutos</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Profissão</label>
                      <select
                        value={sheetProfessionId}
                        onChange={e => {
                          setSheetProfessionId(e.target.value);
                          const sel = professions.find(p => p.id === e.target.value);
                          if (sel) {
                            setSheetRegistrationType(getCouncilForProfession(sel.name));
                          }
                        }}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                      >
                        <option value="">Selecione a profissão...</option>
                        {professions.map(p => (
                          <option key={p.id} value={p.id}>{p.label || p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Conselho Profissional</label>
                      <input
                        type="text"
                        value={sheetRegistrationType}
                        onChange={e => setSheetRegistrationType(e.target.value)}
                        placeholder="Ex: CRM, CRO, CRP, CREFITO"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Número de Registro</label>
                      <input
                        type="text"
                        value={sheetRegistrationNumber}
                        onChange={e => setSheetRegistrationNumber(e.target.value)}
                        placeholder="Ex: 12345/SP"
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                      />
                    </div>
                  </div>

                  {/* Agendamento Online Público */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-800 text-xs">Página Pública de Agendamento Online</h4>
                        <p className="text-slate-500 text-[11px]">
                          Permite que os pacientes agendem horários diretamente pelo link exclusivo do profissional.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sheetPublicBookingEnabled}
                          onChange={e => setSheetPublicBookingEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>

                    {sheetPublicBookingEnabled && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] font-mono text-slate-500 bg-white px-3 py-2 rounded-xl border border-slate-200 flex-1 truncate select-all">
                          {window.location.origin}/agendar/{currentTenant?.slug || 'clinica'}/{sheetSlug || 'profissional'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}/agendar/${currentTenant?.slug || 'clinica'}/${sheetSlug || 'profissional'}`;
                            navigator.clipboard.writeText(url);
                            showToast('Link de agendamento copiado!', 'success');
                          }}
                          className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Biografia */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Biografia / Apresentação Profissional</label>
                    <textarea
                      rows={3}
                      value={sheetBio}
                      onChange={e => setSheetBio(e.target.value)}
                      placeholder="Breve resumo da formação, especialidades e abordagem clínica..."
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      {savingProfile ? 'Salvando...' : 'Salvar Perfil Profissional'}
                    </button>
                  </div>
                </form>
              )}

              {/* ============================================================== */}
              {/* ABA 2: AGENDA & ESCALA */}
              {/* ============================================================== */}
              {memberSheetTab === 'schedules' && (
                <div className="space-y-6">
                  {!selectedMember.professionalId ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
                      <AlertCircle className="w-6 h-6 text-amber-500 mx-auto" />
                      <p className="font-bold text-slate-800 text-xs">Colaborador Administrativo sem Escala Clínica</p>
                      <p className="text-slate-500 text-[11px]">
                        Para cadastrar escala de trabalho e atendimentos, este colaborador deve ser vinculado a um perfil profissional com profissão clínica ativa.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Grade Semanal */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                              <Clock className="w-4 h-4 text-indigo-600" />
                              Grade de Atendimento Semanal
                            </h4>
                            <p className="text-slate-500 text-[11px] mt-0.5">
                              Configure os dias e turnos em que o profissional atende na clínica.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={handleSaveSchedules}
                            disabled={savingSchedules}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                          >
                            {savingSchedules ? 'Salvando...' : 'Salvar Escala Semanal'}
                          </button>
                        </div>

                        {/* Tabela de Dias da Semana (Segunda a Sexta, Sábado, Domingo) */}
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                          {[1, 2, 3, 4, 5, 6, 0].map(day => {
                            const dayName = DAYS_NAMES[day];
                            const existingShift = sheetShifts.find(s => Number(s.day_of_week) === day);
                            const isActive = Boolean(existingShift?.is_active);

                            return (
                              <div key={day} className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                                isActive ? 'bg-white' : 'bg-slate-50/60 opacity-70'
                              }`}>
                                <div className="flex items-center gap-3 w-40">
                                  <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={e => {
                                      const checked = e.target.checked;
                                      setSheetShifts(prev => {
                                        const exists = prev.find(s => Number(s.day_of_week) === day);
                                        if (exists) {
                                          return prev.map(s => Number(s.day_of_week) === day ? { ...s, is_active: checked } : s);
                                        }
                                        return [...prev, {
                                          day_of_week: day,
                                          start_time: '08:00',
                                          end_time: '18:00',
                                          break_start: '12:00',
                                          break_end: '13:00',
                                          is_active: true
                                        }];
                                      });
                                    }}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  />
                                  <span className={`font-bold ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                                    {dayName}
                                  </span>
                                </div>

                                {isActive ? (
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-400 text-[11px]">Turno:</span>
                                      <input
                                        type="time"
                                        value={existingShift?.start_time || '08:00'}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setSheetShifts(prev => prev.map(s => Number(s.day_of_week) === day ? { ...s, start_time: val } : s));
                                        }}
                                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-slate-50 font-mono"
                                      />
                                      <span className="text-slate-400">às</span>
                                      <input
                                        type="time"
                                        value={existingShift?.end_time || '18:00'}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setSheetShifts(prev => prev.map(s => Number(s.day_of_week) === day ? { ...s, end_time: val } : s));
                                        }}
                                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-slate-50 font-mono"
                                      />
                                    </div>

                                    <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                                      <span className="text-slate-400 text-[11px]">Intervalo:</span>
                                      <input
                                        type="time"
                                        value={existingShift?.break_start || ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setSheetShifts(prev => prev.map(s => Number(s.day_of_week) === day ? { ...s, break_start: val } : s));
                                        }}
                                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-slate-50 font-mono"
                                      />
                                      <span className="text-slate-400">às</span>
                                      <input
                                        type="time"
                                        value={existingShift?.break_end || ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setSheetShifts(prev => prev.map(s => Number(s.day_of_week) === day ? { ...s, break_end: val } : s));
                                        }}
                                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-slate-50 font-mono"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-xs italic">Não atende neste dia</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Bloqueios e Férias */}
                      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                              <Palmtree className="w-4 h-4 text-emerald-600" />
                              Bloqueios de Horário & Férias
                            </h4>
                            <p className="text-slate-500 text-[11px] mt-0.5">
                              Impeça agendamentos em períodos de recesso, congressos ou ausências programadas.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setShowBlockModal(true)}
                            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200 text-xs transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Novo Bloqueio</span>
                          </button>
                        </div>

                        {sheetBlockedTimes.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Nenhum bloqueio ou período de férias registrado.</p>
                        ) : (
                          <div className="space-y-2">
                            {sheetBlockedTimes.map(b => (
                              <div key={b.id} className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
                                <div>
                                  <div className="font-bold text-slate-800 flex items-center gap-2">
                                    <span>{b.title}</span>
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">
                                      {b.type === 'vacation' ? 'Férias' : 'Ausência'}
                                    </span>
                                  </div>
                                  <p className="text-slate-500 text-[11px] mt-0.5">
                                    {new Date(b.start_datetime).toLocaleString()} até {new Date(b.end_datetime).toLocaleString()}
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteBlock(b.id)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Remover bloqueio"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ============================================================== */}
              {/* ABA 3: ACESSOS & PERMISSÕES GRANULARES */}
              {/* ============================================================== */}
              {memberSheetTab === 'permissions' && (
                <div className="space-y-6">
                  {/* Presets de 1 Clique */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      Modelos Pré-definidos (Presets Rápidos)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {PERMISSION_PRESETS.map(preset => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setSheetPermissions(preset.perms);
                            showToast(`Preset "${preset.label}" aplicado!`, 'info');
                          }}
                          className="p-3 bg-white hover:bg-indigo-50/50 rounded-xl border border-slate-200 hover:border-indigo-200 text-left transition-all cursor-pointer shadow-2xs group"
                        >
                          <div className="font-bold text-slate-800 text-xs group-hover:text-indigo-600">
                            {preset.label}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1 leading-tight">
                            {preset.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Matriz Granular por Grupos */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">Permissões Efetivas do Colaborador</h4>
                        <p className="text-slate-500 text-[11px] mt-0.5">
                          Ative ou desative permissões individuais para definir o que o usuário pode visualizar e operar no sistema.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleSavePermissions}
                        disabled={savingPermissions}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        {savingPermissions ? 'Salvando...' : 'Salvar Permissões'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Grupo Agenda */}
                      <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2.5">
                        <h5 className="font-bold text-slate-800 text-xs border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                          Agenda & Atendimentos
                        </h5>
                        {AVAILABLE_PERMISSIONS.filter(p => p.group === 'agenda').map(perm => (
                          <label key={perm.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded-lg">
                            <input
                              type="checkbox"
                              checked={sheetPermissions.includes(perm.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSheetPermissions(prev => [...prev, perm.id]);
                                } else {
                                  setSheetPermissions(prev => prev.filter(p => p !== perm.id));
                                }
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-slate-700 text-xs">{perm.label}</span>
                          </label>
                        ))}
                      </div>

                      {/* Grupo Pacientes & Exames */}
                      <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2.5">
                        <h5 className="font-bold text-slate-800 text-xs border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-indigo-600" />
                          Pacientes & Exames
                        </h5>
                        {AVAILABLE_PERMISSIONS.filter(p => p.group === 'patients' || p.group === 'exams').map(perm => (
                          <label key={perm.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded-lg">
                            <input
                              type="checkbox"
                              checked={sheetPermissions.includes(perm.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSheetPermissions(prev => [...prev, perm.id]);
                                } else {
                                  setSheetPermissions(prev => prev.filter(p => p !== perm.id));
                                }
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-slate-700 text-xs">{perm.label}</span>
                          </label>
                        ))}
                      </div>

                      {/* Grupo Financeiro */}
                      <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2.5">
                        <h5 className="font-bold text-slate-800 text-xs border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                          <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                          Financeiro & Recibos
                        </h5>
                        {AVAILABLE_PERMISSIONS.filter(p => p.group === 'financial').map(perm => (
                          <label key={perm.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded-lg">
                            <input
                              type="checkbox"
                              checked={sheetPermissions.includes(perm.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSheetPermissions(prev => [...prev, perm.id]);
                                } else {
                                  setSheetPermissions(prev => prev.filter(p => p !== perm.id));
                                }
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-slate-700 text-xs">{perm.label}</span>
                          </label>
                        ))}
                      </div>

                      {/* Grupo Administração & Gestão */}
                      <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2.5">
                        <h5 className="font-bold text-slate-800 text-xs border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                          Administração & Configurações
                        </h5>
                        {AVAILABLE_PERMISSIONS.filter(p => p.group === 'admin').map(perm => (
                          <label key={perm.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded-lg">
                            <input
                              type="checkbox"
                              checked={sheetPermissions.includes(perm.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSheetPermissions(prev => [...prev, perm.id]);
                                } else {
                                  setSheetPermissions(prev => prev.filter(p => p !== perm.id));
                                }
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-slate-700 text-xs">{perm.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* ABA 4: FINANCEIRO DO PROFISSIONAL */}
              {/* ============================================================== */}
              {memberSheetTab === 'financial' && (
                <form onSubmit={handleSaveFinancial} className="space-y-5">
                  {!selectedMember.professionalId ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
                      <AlertCircle className="w-6 h-6 text-amber-500 mx-auto" />
                      <p className="font-bold text-slate-800 text-xs">Sem Registro de Repasse Clínico</p>
                      <p className="text-slate-500 text-[11px]">
                        As regras de repasse e comissão aplicam-se a profissionais clínicos com atendimentos agendados.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                        <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                          <DollarSign className="w-4 h-4 text-indigo-600" />
                          Modalidade de Remuneração e Repasse
                        </h4>
                        <p className="text-slate-500 text-[11px]">
                          Defina como o profissional é remunerado pelas consultas e procedimentos executados na clínica.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Tipo de Remuneração</label>
                          <select
                            value={sheetRemunerationType}
                            onChange={e => setSheetRemunerationType(e.target.value as any)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                          >
                            <option value="commission">Somente Comissão (%)</option>
                            <option value="salary">Somente Salário Fixo (R$)</option>
                            <option value="both">Salário Fixo + Comissão (%)</option>
                          </select>
                        </div>

                        {(sheetRemunerationType === 'commission' || sheetRemunerationType === 'both') && (
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Percentual de Comissão (%)</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={sheetCommissionPercentage}
                              onChange={e => setSheetCommissionPercentage(Number(e.target.value))}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                            />
                          </div>
                        )}

                        {(sheetRemunerationType === 'salary' || sheetRemunerationType === 'both') && (
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Salário Fixo Mensal (R$)</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={sheetFixedSalary}
                              onChange={e => setSheetFixedSalary(Number(e.target.value))}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Dia do Mês para Fechamento/Pagamento</label>
                          <select
                            value={sheetPaymentDay}
                            onChange={e => setSheetPaymentDay(Number(e.target.value))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                          >
                            {[1, 5, 10, 15, 20, 25, 28, 30].map(d => (
                              <option key={d} value={d}>Dia {d} de cada mês</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="submit"
                          disabled={savingFinancial}
                          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                        >
                          {savingFinancial ? 'Salvando...' : 'Salvar Regras Financeiras'}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      )}



      {/* ========================================================================= */}
      {/* MODAL: NOVO BLOQUEIO / FÉRIAS */}
      {/* ========================================================================= */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Palmtree className="w-4 h-4 text-emerald-600" />
                Registrar Bloqueio ou Férias
              </h3>
              <button
                type="button"
                onClick={() => setShowBlockModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBlock} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Título / Motivo *</label>
                <input
                  type="text"
                  required
                  value={blockTitle}
                  onChange={e => setBlockTitle(e.target.value)}
                  placeholder="Ex: Férias de Verão, Congresso em SP..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tipo de Ausência</label>
                <select
                  value={blockType}
                  onChange={e => setBlockType(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                >
                  <option value="vacation">Férias</option>
                  <option value="absence">Ausência Programada</option>
                  <option value="conference">Congresso / Curso</option>
                  <option value="other">Outro</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Início *</label>
                  <input
                    type="datetime-local"
                    required
                    value={blockStart}
                    onChange={e => setBlockStart(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Término *</label>
                  <input
                    type="datetime-local"
                    required
                    value={blockEnd}
                    onChange={e => setBlockEnd(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-xs cursor-pointer"
                >
                  Confirmar Bloqueio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: GERAR LINK DE CONVITE */}
      {/* ========================================================================= */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-indigo-600" />
                Gerar Link de Convite
              </h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Função Pretendida do Membro</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                >
                  <option value="professional">Profissional de Saúde</option>
                  <option value="receptionist">Recepcionista / Atendimento</option>
                  <option value="clinic_admin">Administrador da Clínica</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Validade do Link</label>
                <select
                  value={inviteDays}
                  onChange={e => setInviteDays(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 focus:bg-white"
                >
                  <option value={1}>24 horas (1 dia)</option>
                  <option value={3}>3 dias</option>
                  <option value={7}>7 dias (Recomendado)</option>
                  <option value={15}>15 dias</option>
                  <option value={30}>30 dias</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleGenerateInvite}
                  disabled={generatingInvite}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {generatingInvite ? 'Gerando...' : 'Gerar e Copiar Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
