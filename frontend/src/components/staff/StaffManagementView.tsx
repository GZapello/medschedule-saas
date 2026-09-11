import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Users,
  UserPlus,
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
  FileText
} from 'lucide-react';

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
  { id: 'manage_settings', label: 'Alterar configurações da clínica' }
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

export const StaffManagementView: React.FC = () => {
  const { isClinicAdmin } = useAuth();
  const { showToast } = useToast();

  const [staffList, setStaffList] = useState<any[]>([]);
  const [, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');

  // Modais
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<any>(null);
  const [editingRoleUser, setEditingRoleUser] = useState<any>(null);

  // Form de edição de Cargo / Profissão / Áreas
  const [editRoleForm, setEditRoleForm] = useState({
    role: 'professional',
    professionName: '',
    practiceAreas: ''
  });

  // Formulário de novo funcionário
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'receptionist',
    professionName: 'Recepcionista / Atendimento',
    practiceAreas: '',
    registrationType: 'CRP',
    registrationNumber: '',
    selectedPermissions: ['view_schedule', 'create_appointment', 'edit_appointment', 'create_patient', 'edit_patient']
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

  useEffect(() => {
    loadStaff();
  }, []);

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
      showToast(err.message || 'Erro ao recusar funcionário', 'error');
    }
  };

  const handleToggleStatus = async (userId: string) => {
    try {
      const res = await ApiClient.put<any>(`/v1/staff/${userId}/toggle-status`, {});
      showToast(res.message || 'Status alterado com sucesso', 'success');
      loadStaff();
    } catch (err: any) {
      showToast(err.message || 'Erro ao alterar status', 'error');
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email) {
      showToast('Nome e e-mail são obrigatórios', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/staff/invite', {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password || '123456',
        role: formData.role,
        professionName: formData.professionName,
        practiceAreas: formData.practiceAreas,
        registrationType: formData.registrationType,
        registrationNumber: formData.registrationNumber || null,
        permissions: formData.selectedPermissions
      });

      showToast('Funcionário cadastrado com sucesso!', 'success');
      setIsAddModalOpen(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        password: '',
        role: 'receptionist',
        professionName: 'Recepcionista / Atendimento',
        practiceAreas: '',
        registrationType: 'CRP',
        registrationNumber: '',
        selectedPermissions: ['view_schedule', 'create_appointment', 'edit_appointment', 'create_patient', 'edit_patient']
      });
      loadStaff();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar funcionário', 'error');
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
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            + Adicionar Membro
          </button>
        )}
      </div>

      {/* Abas e Busca */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-2xl w-fit text-xs font-bold">
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
                    <h3 className="font-bold text-slate-800 text-sm leading-snug">{member.name}</h3>
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
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  {member.status === 'active'
                    ? 'Ativo'
                    : member.status === 'pending'
                    ? 'Aguardando Aprovação'
                    : member.status === 'rejected'
                    ? 'Recusado'
                    : 'Desativado / Bloqueado'}
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
                    onClick={() => handleToggleStatus(member.id)}
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

        {filteredStaff.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100">
            {loading ? 'Carregando equipe...' : 'Nenhum membro encontrado nesta categoria.'}
          </div>
        )}
      </div>

      {/* ========================================================== */}
      {/* MODAL 1: Cadastrar Novo Membro */}
      {/* ========================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold">Adicionar Membro à Equipe</h3>
                <p className="text-xs text-slate-400">
                  Cadastre um colaborador ou profissional e atribua suas permissões no ambiente da clínica.
                </p>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Ana Paula Ribeiro"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">E-mail de Acesso *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="anapaula@clinica.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(11) 98888-0000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Perfil no Sistema *</label>
                  <select
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  >
                    <option value="professional">Profissional de Atendimento / Saúde</option>
                    <option value="receptionist">Recepcionista / Atendimento</option>
                    <option value="secretary">Secretária(o)</option>
                    <option value="financial">Financeiro</option>
                    <option value="assistant">Auxiliar Administrativo</option>
                    <option value="clinic_admin">Administrador da Clínica</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Profissão / Função</label>
                  <select
                    value={formData.professionName}
                    onChange={e => setFormData({ ...formData, professionName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  >
                    {PROFESSIONS_LIST.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {formData.role === 'professional' && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Registro Profissional</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.registrationType}
                        onChange={e => setFormData({ ...formData, registrationType: e.target.value.toUpperCase() })}
                        placeholder="CRM/CRP"
                        className="w-20 px-2 py-2 border border-slate-200 rounded-xl bg-slate-50 text-center"
                      />
                      <input
                        type="text"
                        value={formData.registrationNumber}
                        onChange={e => setFormData({ ...formData, registrationNumber: e.target.value })}
                        placeholder="12345"
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Campo aberto: Atendimentos e áreas de atuação */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Atendimentos e áreas de atuação</label>
                  <span className="text-[10px] text-slate-400">Texto livre</span>
                </div>
                <textarea
                  value={formData.practiceAreas}
                  onChange={e => setFormData({ ...formData, practiceAreas: e.target.value })}
                  placeholder="Ex: TEA, TDAH, Ansiedade, Depressão, Orientação de Pais, Avaliação Neuropsicológica..."
                  rows={2}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-xl bg-slate-50 resize-none"
                />
              </div>

              {/* Permissões Granulares e Perfis Pré-Programados (Item 18) */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 block">Permissões do Membro</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Modelos Prontos:</span>
                    {PERMISSION_PRESETS.map(preset => (
                      <button
                        type="button"
                        key={preset.id}
                        onClick={() => setFormData({ ...formData, selectedPermissions: preset.perms })}
                        className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg cursor-pointer transition-all"
                        title={preset.desc}
                      >
                        ⚡ {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  {AVAILABLE_PERMISSIONS.map(p => {
                    const isChecked = formData.selectedPermissions.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                selectedPermissions: [...formData.selectedPermissions, p.id]
                              });
                            } else {
                              setFormData({
                                ...formData,
                                selectedPermissions: formData.selectedPermissions.filter(id => id !== p.id)
                              });
                            }
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-[11px] text-slate-700">{p.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:text-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Confirmar Cadastro
                </button>
              </div>
            </form>
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
