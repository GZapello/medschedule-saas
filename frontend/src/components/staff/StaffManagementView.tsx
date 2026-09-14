import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Users,
  Check,
  X,
  Lock,
  Unlock,
  Mail,
  Phone,
  Briefcase,
  Search,
  Key,
  Edit3,
  Tag,
  AlertCircle,
  FileText,
  Link as LinkIcon,
  Copy,
  Plus,
  Trash2,
  ShieldCheck,
  Clock
} from 'lucide-react';
import { formatDoctorName } from '../../utils/formatters';

const AVAILABLE_PERMISSIONS = [
  { id: 'view_schedule', label: 'Visualizar agenda da clínica' },
  { id: 'create_appointment', label: 'Criar agendamentos' },
  { id: 'edit_appointment', label: 'Editar e remarcar agendamentos' },
  { id: 'cancel_appointment', label: 'Cancelar agendamentos' },
  { id: 'create_patient', label: 'Cadastrar novos pacientes/clientes' },
  { id: 'edit_patient', label: 'Editar ficha de pacientes' },
  { id: 'view_financial', label: 'Visualizar movimentações financeiras' },
  { id: 'issue_receipt', label: 'Emitir recibos oficiais' },
  { id: 'view_receipts', label: 'Visualizar recibos emitidos' },
  { id: 'manage_professionals', label: 'Gerenciar profissionais' },
  { id: 'manage_staff', label: 'Gerenciar equipe e funcionários' },
  { id: 'manage_services', label: 'Gerenciar catálogo de serviços e salas' },
  { id: 'view_reports', label: 'Acessar relatórios e exportar planilhas' },
  { id: 'manage_settings', label: 'Alterar configurações da clínica' },
  { id: 'access_zemda_fisio', label: 'ZemdaFisio: Acesso permitido' },
  { id: 'access_zemda_odonto', label: 'ZemdaOdonto: Acesso permitido' }
];

const PERMISSION_PRESETS = [
  {
    id: 'receptionist',
    label: 'Recepcionista',
    desc: 'Agenda, pacientes, pagamentos e recibos',
    perms: ['view_schedule', 'create_appointment', 'edit_appointment', 'cancel_appointment', 'create_patient', 'edit_patient', 'view_financial', 'issue_receipt', 'view_receipts']
  },
  {
    id: 'professional',
    label: 'Profissional de Saúde',
    desc: 'Agenda própria e gestão de pacientes',
    perms: ['view_schedule', 'create_appointment', 'edit_appointment', 'cancel_appointment', 'create_patient', 'edit_patient']
  },
  {
    id: 'dentist',
    label: 'Cirurgião-Dentista',
    desc: 'Agenda, pacientes e ZemdaOdonto completo',
    perms: ['view_schedule', 'create_appointment', 'edit_appointment', 'cancel_appointment', 'create_patient', 'edit_patient', 'access_zemda_odonto']
  },
  {
    id: 'clinic_admin',
    label: 'Administrador da Clínica',
    desc: 'Acesso completo a todas as funções',
    perms: AVAILABLE_PERMISSIONS.map(p => p.id)
  }
];

const PROFESSIONS_LIST = [
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
  'Recepcionista / Atendimento',
  'Secretária(o)',
  'Gestor / Administrador',
  'Outro'
];

const formatDeletionDate = (scheduledAt?: string, deactivatedAt?: string) => {
  let targetDate: Date;
  if (scheduledAt) {
    targetDate = new Date(scheduledAt);
  } else if (deactivatedAt) {
    targetDate = new Date(new Date(deactivatedAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  } else {
    targetDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  if (isNaN(targetDate.getTime())) {
    targetDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  const day = String(targetDate.getDate()).padStart(2, '0');
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const year = targetDate.getFullYear();
  return `${day}/${month}/${year}`;
};

export const StaffManagementView: React.FC = () => {
  const { isClinicAdmin, reloadSession } = useAuth();
  const { showToast } = useToast();

  const [staffList, setStaffList] = useState<any[]>([]);
  const [, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'inactive' | 'invites'>('active');
  const [searchTerm, setSearchTerm] = useState('');

  // Convites por link único da clínica (Itens 14 a 23)
  const [clinicInvites, setClinicInvites] = useState<any[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteFormRole, setInviteFormRole] = useState('professional');
  const [inviteFormDays, setInviteFormDays] = useState(7);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [recentlyCreatedLink, setRecentlyCreatedLink] = useState<string | null>(null);

  // Modais
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<any>(null);
  const [editingRoleUser, setEditingRoleUser] = useState<any>(null);

  // Form de edição de Cargo / Profissão / Áreas
  const [editRoleForm, setEditRoleForm] = useState({
    role: 'professional',
    professionName: '',
    practiceAreas: ''
  });

  const loadStaff = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<{ staff: any[]; invites: any[] }>('/v1/staff');
      setStaffList(res.staff || []);
      setInvites(res.invites || []);
    } catch (err) {
      console.error('Erro ao carregar funcionários:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadClinicInvites = async () => {
    try {
      setLoadingInvites(true);
      const res = await ApiClient.get<{ invites: any[] }>('/v1/staff/invites');
      setClinicInvites(res.invites || []);
    } catch (err) {
      console.error('Erro ao carregar convites da clínica:', err);
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    loadStaff();
    if (isClinicAdmin) {
      loadClinicInvites();
    }
  }, [isClinicAdmin]);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGeneratingInvite(true);
      const res = await ApiClient.post<{ message: string; invite: any }>('/v1/staff/invites', {
        role: inviteFormRole,
        validityDays: inviteFormDays,
        maxUses: 1
      });
      showToast(res.message || 'Link gerado com sucesso!', 'success');
      const origin = window.location.origin;
      const fullUrl = `${origin}${res.invite.inviteUrl}`;
      setRecentlyCreatedLink(fullUrl);
      loadClinicInvites();
    } catch (err: any) {
      showToast(err.message || 'Erro ao gerar link de convite', 'error');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!window.confirm('Deseja realmente cancelar este link de convite?')) return;
    try {
      await ApiClient.delete(`/v1/staff/invites/${inviteId}`);
      showToast('Convite cancelado com sucesso', 'success');
      loadClinicInvites();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cancelar convite', 'error');
    }
  };

  const handleCopyLink = (url: string) => {
    const origin = window.location.origin;
    const fullUrl = url.startsWith('http') ? url : `${origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    showToast('Link copiado para a área de transferência!', 'success');
  };

  const handleApprove = async (userId: string, name: string) => {
    try {
      await ApiClient.put(`/v1/staff/${userId}/approve`, {});
      showToast(`Acesso de ${name} aprovado com sucesso!`, 'success');
      loadStaff();
    } catch (err: any) {
      showToast(err.message || 'Erro ao aprovar funcionário', 'error');
    }
  };

  const handleReject = async (userId: string, name: string) => {
    if (!window.confirm(`Deseja realmente recusar o acesso de ${name}?`)) return;
    try {
      await ApiClient.put(`/v1/staff/${userId}/reject`, {});
      showToast(`Solicitação de ${name} recusada.`, 'success');
      loadStaff();
    } catch (err: any) {
      showToast(err.message || 'Erro ao recusar solicitação', 'error');
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string = 'active') => {
    const action = currentStatus === 'active' ? 'block' : 'unblock';
    const actionLabel = currentStatus === 'active' ? 'bloquear' : 'desbloquear';
    if (!window.confirm(`Deseja realmente ${actionLabel} este usuário?`)) return;

    try {
      const res = await ApiClient.put<{ message: string }>(`/v1/staff/${userId}/status`, { action });
      showToast(res.message || 'Status alterado com sucesso', 'success');
      loadStaff();
    } catch (err: any) {
      showToast(err.message || 'Erro ao alterar status', 'error');
    }
  };

  const handleOpenEditRole = (member: any) => {
    setEditingRoleUser(member);
    setEditRoleForm({
      role: member.role || 'professional',
      professionName: member.profession_name || '',
      practiceAreas: member.practice_areas || ''
    });
  };

  const handleSaveRoleProfession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoleUser) return;

    try {
      await ApiClient.put(`/v1/staff/${editingRoleUser.id}/role-profession`, {
        role: editRoleForm.role,
        professionName: editRoleForm.professionName,
        practiceAreas: editRoleForm.practiceAreas
      });
      showToast('Cargo, profissão e áreas de atuação atualizados!', 'success');
      setEditingRoleUser(null);
      loadStaff();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar dados do funcionário', 'error');
    }
  };

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPermissionsUser) return;

    try {
      await ApiClient.put(`/v1/staff/${editingPermissionsUser.id}/permissions`, {
        permissions: editingPermissionsUser.permissions || []
      });
      showToast('Permissões atualizadas com sucesso!', 'success');
      setEditingPermissionsUser(null);
      loadStaff();
      if (reloadSession) {
        await reloadSession();
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar permissões', 'error');
    }
  };

  const pendingCount = staffList.filter(s => s.status === 'pending').length;
  const activeCount = staffList.filter(s => s.status === 'active').length;
  const inactiveCount = staffList.filter(s => s.status === 'blocked' || s.status === 'rejected').length;

  const filteredStaff = staffList.filter(s => {
    if (activeTab === 'pending') return s.status === 'pending';
    if (activeTab === 'active') return s.status === 'active';
    if (activeTab === 'inactive') return s.status === 'blocked' || s.status === 'rejected';
    return true;
  }).filter(s => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      s.email.toLowerCase().includes(term) ||
      (s.profession_name && s.profession_name.toLowerCase().includes(term)) ||
      (s.practice_areas && s.practice_areas.toLowerCase().includes(term))
    );
  });

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'clinic_admin': return 'Gestor / Admin da Clínica';
      case 'professional': return 'Profissional de Atendimento';
      case 'receptionist': return 'Recepção / Atendimento';
      case 'secretary': return 'Secretária(o)';
      case 'financial': return 'Financeiro';
      case 'assistant': return 'Auxiliar Administrativo';
      default: return role;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            Equipe e Controle de Acessos
          </h1>
          <p className="text-xs text-slate-500">
            Aprove solicitações de novos membros, gerencie funções, áreas de atuação e permissões individuais.
          </p>
        </div>

        {isClinicAdmin && (
          <button
            type="button"
            onClick={() => {
              setRecentlyCreatedLink(null);
              setIsInviteModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer shrink-0"
          >
            <LinkIcon className="w-4 h-4" />
            <span>Gerar Link de Convite</span>
          </button>
        )}
      </div>

      {/* Abas e Busca */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-2xl w-fit text-xs font-bold flex-wrap">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'active'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Equipe Ativa ({activeCount})
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'pending'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Solicitações Pendentes
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('inactive')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'inactive'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Recusados / Inativos ({inactiveCount})
          </button>

          {isClinicAdmin && (
            <button
              onClick={() => setActiveTab('invites')}
              className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'invites'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              Links de Convite ({clinicInvites.filter(i => i.status === 'pending').length})
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail, especialidade..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Banner de destaque caso haja solicitações pendentes */}
      {activeTab !== 'pending' && pendingCount > 0 && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Existem <strong>{pendingCount} solicitação(ões) pendente(s)</strong> de profissionais ou funcionários aguardando sua aprovação.
            </span>
          </div>
          <button
            onClick={() => setActiveTab('pending')}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shrink-0 cursor-pointer"
          >
            Ver Solicitações
          </button>
        </div>
      )}

      {/* Lista de Membros da Equipe */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStaff.map(member => (
          <div
            key={member.id}
            className={`bg-white rounded-3xl p-5 border shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow ${
              member.status === 'pending'
                ? 'border-amber-300 ring-2 ring-amber-100'
                : member.status === 'blocked' || member.status === 'rejected'
                ? 'border-slate-200 bg-slate-50/50 opacity-90'
                : 'border-slate-100'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-extrabold text-sm border ${
                      member.status === 'pending'
                        ? 'bg-amber-100 text-amber-800 border-amber-200'
                        : member.status === 'active'
                        ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {member.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm leading-snug">
                      {member.role === 'professional' ? formatDoctorName(member.name, member.gender) : member.name}
                    </h3>
                    <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {getRoleLabel(member.role)}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    member.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : member.status === 'pending'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                      : member.status === 'rejected'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {member.status === 'active'
                    ? 'Ativo'
                    : member.status === 'pending'
                    ? 'Aguardando Aprovação'
                    : member.status === 'rejected'
                    ? 'Recusado'
                    : 'Desativada'}
                </span>
              </div>

              <div className="text-xs text-slate-600 space-y-1.5 pt-1">
                <p className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{member.email}</span>
                </p>
                {member.phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{member.phone}</span>
                  </p>
                )}
                {member.profession_name && (
                  <p className="flex items-center gap-1.5 font-medium text-slate-700">
                    <Briefcase className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>
                      {member.profession_name}{' '}
                      {member.registration_number
                        ? `(${member.registration_type || 'Conselho'} ${member.registration_number})`
                        : ''}
                    </span>
                  </p>
                )}

                {/* Campo Aberto: Atendimentos e áreas de atuação */}
                {member.practice_areas ? (
                  <div className="mt-2 p-2.5 bg-indigo-50/50 rounded-xl border border-indigo-100/80">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 mb-0.5">
                      <Tag className="w-3 h-3" />
                      <span>Atendimentos e áreas de atuação:</span>
                    </div>
                    <p className="text-[11px] text-slate-700 font-medium leading-relaxed">
                      {member.practice_areas}
                    </p>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 italic flex items-center gap-1 pt-1">
                    <FileText className="w-3 h-3" />
                    <span>Nenhuma área de atuação preenchida</span>
                  </div>
                )}

                {/* Alerta de Desativação e Exclusão Programada (Item 3) */}
                {(member.status === 'blocked' || member.scheduled_deletion_at) && (
                  <div className="mt-2.5 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold text-rose-900 leading-snug">
                        Conta desativada. Exclusão programada para {formatDeletionDate(member.scheduled_deletion_at, member.deactivated_at)}.
                      </p>
                      <p className="text-[10px] text-rose-700">
                        O acesso está bloqueado. Reative a qualquer momento para cancelar a exclusão mantendo todos os prontuários e históricos preservados.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Ações da Linha */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              {member.status === 'pending' ? (
                <div className="flex items-center gap-2 w-full">
                  <button
                    onClick={() => handleApprove(member.id, member.name)}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1 cursor-pointer transition-all"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Aprovar Acesso
                  </button>
                  <button
                    onClick={() => handleReject(member.id, member.name)}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl cursor-pointer transition-all border border-rose-200"
                  >
                    <X className="w-3.5 h-3.5" />
                    Recusar
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {/* Botão de Permissões */}
                    <button
                      onClick={() => setEditingPermissionsUser(member)}
                      title="Gerenciar 14 permissões"
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Key className="w-3 h-3 text-slate-500" />
                      Permissões
                    </button>

                    {/* Botão de Alterar Cargo/Profissão/Áreas */}
                    <button
                      onClick={() => handleOpenEditRole(member)}
                      title="Editar cargo, profissão e áreas de atuação"
                      className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] rounded-xl flex items-center gap-1 cursor-pointer transition-colors border border-indigo-100"
                    >
                      <Edit3 className="w-3 h-3 text-indigo-600" />
                      Função & Áreas
                    </button>
                  </div>

                  {/* Bloquear / Desbloquear / Reativar */}
                  <button
                    onClick={() => handleToggleStatus(member.id, member.status)}
                    className={`px-2.5 py-1.5 font-bold text-[11px] rounded-xl flex items-center gap-1 cursor-pointer transition-colors ${
                      member.status === 'active'
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {member.status === 'active' ? (
                      <>
                        <Lock className="w-3 h-3" />
                        Desativar
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3 h-3" />
                        Reativar
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {activeTab !== 'invites' && filteredStaff.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100">
            {loading ? 'Carregando equipe...' : 'Nenhum membro encontrado nesta categoria.'}
          </div>
        )}
      </div>

      {/* ========================================================== */}
      {/* ABA: Links de Convite da Clínica (Itens 14 a 23) */}
      {/* ========================================================== */}
      {activeTab === 'invites' && (
        <div className="space-y-4">
          <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5 text-indigo-950">
              <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Fluxo Seguro de Convites</strong>
                <p className="text-indigo-800 text-[11px] leading-relaxed">
                  Novos funcionários não escolhem mais a clínica manualmente na tela aberta de registro. O vínculo acontece através do link único e criptografado gerado abaixo.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setRecentlyCreatedLink(null);
                setIsInviteModalOpen(true);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Link
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3.5">Cargo / Papel</th>
                    <th className="p-3.5">Link de Acesso</th>
                    <th className="p-3.5">Validade</th>
                    <th className="p-3.5">Usos</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Criado em</th>
                    <th className="p-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {clinicInvites.map(inv => {
                    const isExpired = inv.status === 'expired';
                    const isUsed = inv.status === 'used';
                    const isCancelled = inv.status === 'cancelled';
                    const isPending = inv.status === 'pending';

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3.5 font-bold text-slate-800">
                          {getRoleLabel(inv.role)}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-2 max-w-xs">
                            <span className="truncate font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                              {inv.inviteUrl}
                            </span>
                            {isPending && (
                              <button
                                type="button"
                                onClick={() => handleCopyLink(inv.inviteUrl)}
                                title="Copiar Link"
                                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-slate-500 text-[11px]">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>
                              {new Date(inv.expires_at.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-[11px]">
                          <span className="font-semibold">{inv.used_count}</span> de {inv.max_uses}
                          {inv.used_by_name && (
                            <span className="block text-[10px] text-slate-400 truncate">
                              Por: {inv.used_by_name}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          {isPending && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                              Pendente
                            </span>
                          )}
                          {isUsed && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Utilizado
                            </span>
                          )}
                          {isExpired && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200">
                              Expirado
                            </span>
                          )}
                          {isCancelled && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                              Cancelado
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-slate-400 text-[11px]">
                          {new Date(inv.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap">
                          {isPending && (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleCopyLink(inv.inviteUrl)}
                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors cursor-pointer text-[11px]"
                              >
                                Copiar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelInvite(inv.id)}
                                title="Cancelar link de convite"
                                className="p-1 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {clinicInvites.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-xs">
                {loadingInvites ? 'Carregando links...' : 'Nenhum link de convite gerado até o momento.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 1: Gerar Link de Convite Único da Clínica */}
      {/* ========================================================== */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl my-8 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold flex items-center gap-2">
                  <LinkIcon className="w-5 h-5 text-indigo-400" />
                  Convidar Novo Funcionário
                </h3>
                <p className="text-xs text-slate-400">
                  Gere um link exclusivo e seguro com vínculo inalterável a esta clínica.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs text-left">
              {recentlyCreatedLink ? (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold text-emerald-900">Link de Convite Criado!</strong>
                      <p className="text-emerald-800 text-[11px] mt-0.5">
                        Envie o link abaixo para o novo colaborador. Ao acessar, ele completará o cadastro e será vinculado diretamente a esta clínica.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Link Único de Cadastro:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={recentlyCreatedLink}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-[11px] font-mono text-slate-800 select-all"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyLink(recentlyCreatedLink)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setRecentlyCreatedLink(null)}
                      className="px-4 py-2 font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
                    >
                      Gerar Outro Link
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInviteModalOpen(false)}
                      className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                    >
                      Concluído
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreateInvite} className="space-y-4">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Função Pretendida do Membro *
                    </label>
                    <select
                      value={inviteFormRole}
                      onChange={e => setInviteFormRole(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium text-xs focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="professional">Profissional de Atendimento / Saúde</option>
                      <option value="receptionist">Recepcionista / Atendimento</option>
                      <option value="secretary">Secretária(o)</option>
                      <option value="financial">Financeiro</option>
                      <option value="assistant">Auxiliar Administrativo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Prazo de Validade do Link *
                    </label>
                    <select
                      value={inviteFormDays}
                      onChange={e => setInviteFormDays(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium text-xs focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value={3}>3 dias</option>
                      <option value={7}>7 dias (Padrão recomendado)</option>
                      <option value={15}>15 dias</option>
                      <option value={30}>30 dias</option>
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Após o prazo de validade, o link expirará automaticamente e não poderá ser mais utilizado.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                      Uso Único e Seguro
                    </span>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Cada link gerado é criptográfico e exclusivo. Assim que o colaborador concluir seu cadastro, o link é invalidado para evitar múltiplos cadastros não autorizados.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsInviteModalOpen(false)}
                      className="px-4 py-2 font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={generatingInvite}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                    >
                      {generatingInvite ? 'Gerando Link...' : 'Gerar Link Seguro'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 2: Editar Cargo, Profissão e Áreas de Atuação */}
      {/* ========================================================== */}
      {editingRoleUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl my-8">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold">Editar Função & Áreas de Atuação</h3>
                <p className="text-xs text-slate-400">{editingRoleUser.name}</p>
              </div>
              <button onClick={() => setEditingRoleUser(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRoleProfession} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Perfil / Cargo no Sistema</label>
                <select
                  value={editRoleForm.role}
                  onChange={e => setEditRoleForm({ ...editRoleForm, role: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium"
                >
                  <option value="professional">Profissional de Atendimento / Saúde</option>
                  <option value="receptionist">Recepcionista / Atendimento</option>
                  <option value="secretary">Secretária(o)</option>
                  <option value="financial">Financeiro</option>
                  <option value="assistant">Auxiliar Administrativo</option>
                  <option value="clinic_admin">Administrador / Gestor da Clínica</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Profissão / Título</label>
                <input
                  type="text"
                  value={editRoleForm.professionName}
                  onChange={e => setEditRoleForm({ ...editRoleForm, professionName: e.target.value })}
                  placeholder="Ex: Psicopedagogo Infantil, Psiquiatra, Secretária..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Atendimentos e áreas de atuação</label>
                  <span className="text-[10px] text-slate-400">Texto livre</span>
                </div>
                <textarea
                  value={editRoleForm.practiceAreas}
                  onChange={e => setEditRoleForm({ ...editRoleForm, practiceAreas: e.target.value })}
                  placeholder="Ex: TEA, TDAH, Ansiedade, Depressão, Terapia de Casal, Dificuldades de Aprendizagem, Avaliação Neuropsicológica..."
                  rows={4}
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 resize-none leading-relaxed font-medium"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Descreva abertamente especialidades, focos de atendimento e públicos atendidos.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingRoleUser(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:text-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 3: Editar Permissões do Funcionário */}
      {/* ========================================================== */}
      {editingPermissionsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl my-8">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold">Permissões de {editingPermissionsUser.name}</h3>
                <p className="text-xs text-slate-400">
                  {getRoleLabel(editingPermissionsUser.role)}
                </p>
              </div>
              <button onClick={() => setEditingPermissionsUser(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePermissions} className="p-6 space-y-4 text-xs">
              {/* Perfis Pré-Programados (Item 18) */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
                <span className="text-[11px] font-bold text-slate-500 block uppercase">
                  Modelos Prontos de Permissão (1 clique):
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PERMISSION_PRESETS.map(preset => (
                    <button
                      type="button"
                      key={preset.id}
                      onClick={() => setEditingPermissionsUser({
                        ...editingPermissionsUser,
                        permissions: preset.perms
                      })}
                      className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl cursor-pointer transition-all shadow-2xs"
                      title={preset.desc}
                    >
                      ⚡ {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {AVAILABLE_PERMISSIONS.map(p => {
                  const currentPerms = editingPermissionsUser.permissions || [];
                  const isChecked = currentPerms.includes(p.id);

                  if (p.id === 'access_zemda_fisio') {
                    return (
                      <div
                        key={p.id}
                        className="p-3 bg-teal-50 border border-teal-200 rounded-2xl space-y-1.5 my-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold uppercase tracking-wide text-teal-900">
                            Módulo Fisioterapia (ZemdaFisio)
                          </span>
                        </div>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              const updated = e.target.checked
                                ? [...currentPerms, p.id]
                                : currentPerms.filter((id: string) => id !== p.id);
                              setEditingPermissionsUser({
                                ...editingPermissionsUser,
                                permissions: updated
                              });
                            }}
                            className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-teal-950">
                            ZemdaFisio: Acesso permitido
                          </span>
                        </label>
                        <p className="text-[11px] text-teal-700 pl-6.5 leading-relaxed">
                          Habilita prontuário de fisioterapia, escalas de dor, goniometria, testes ortopédicos e evoluções clínicas exclusivas (exige profissão Fisioterapia).
                        </p>
                      </div>
                    );
                  }

                  if (p.id === 'access_zemda_odonto') {
                    return (
                      <div
                        key={p.id}
                        className="p-3 bg-cyan-50 border border-cyan-200 rounded-2xl space-y-1.5 my-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold uppercase tracking-wide text-cyan-900">
                            Módulo Odontologia (ZemdaOdonto)
                          </span>
                        </div>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              const updated = e.target.checked
                                ? [...currentPerms, p.id]
                                : currentPerms.filter((id: string) => id !== p.id);
                              setEditingPermissionsUser({
                                ...editingPermissionsUser,
                                permissions: updated
                              });
                            }}
                            className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-cyan-950">
                            ZemdaOdonto: Acesso permitido
                          </span>
                        </label>
                        <p className="text-[11px] text-cyan-700 pl-6.5 leading-relaxed">
                          Habilita odontograma interativo (32 dentes e faces), periodontograma, endodontia, planos de tratamento, prótese e HOF (exige profissão Odontologia).
                        </p>
                      </div>
                    );
                  }

                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          const updated = e.target.checked
                            ? [...currentPerms, p.id]
                            : currentPerms.filter((id: string) => id !== p.id);
                          setEditingPermissionsUser({
                            ...editingPermissionsUser,
                            permissions: updated
                          });
                        }}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-slate-800 font-medium">{p.label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPermissionsUser(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:text-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Salvar Permissões
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
