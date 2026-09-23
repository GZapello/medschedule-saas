import { GlobalBillingView } from '../billing/GlobalBillingView';
import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Shield,
  Building2,
  Users,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Eye,
  ArrowRight,
  Search,
  Check,
  X,
  Plus,
  Edit3,
  Layers,
  Briefcase,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Gift,
  MessageSquare,
  FlaskConical
} from 'lucide-react';
import { FreeTrialsAdminView } from './FreeTrialsAdminView';
import { WhatsAppEmbeddedSignup } from '../settings/WhatsAppEmbeddedSignup';
import { SuperAdminLaboratoryView } from './SuperAdminLaboratoryView';

export const SuperAdminView: React.FC = () => {
  const { switchTenant, currentUser: user } = useAuth();
  const { showToast } = useToast();

  // Navegação Principal do SuperAdmin
  const [mainSection, setMainSection] = useState<'tenants' | 'professions' | 'categories' | 'subscriptions' | 'integrations' | 'free_trials' | 'whatsapp' | 'laboratory'>('tenants');

  // Clínicas
  const [metrics, setMetrics] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'active' | 'blocked'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modais de Clínicas
  const [selectedClinic, setSelectedClinic] = useState<any>(null);
  const [rejectingClinic, setRejectingClinic] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [control, setControl] = useState<{ clinic: any; action: 'ban' | 'delete' } | null>(null);
  const [controlReason, setControlReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [controlBusy, setControlBusy] = useState(false);
  const [controlError, setControlError] = useState('');
  const closeControl = () => { setControl(null); setControlReason(''); setConfirmation(''); setAdminPassword(''); setControlError(''); };
  const submitControl = async (event: React.FormEvent) => {
    event.preventDefault(); if (!control || controlBusy) return;
    setControlBusy(true); setControlError('');
    try {
      if (control.action === 'delete') await ApiClient.post(`/v1/admin/tenants/${control.clinic.id}/delete-permanently`, { reason: controlReason, confirmation, password: adminPassword });
      else await ApiClient.put(`/v1/admin/tenants/${control.clinic.id}/ban`, { reason: controlReason });
      showToast(control.action === 'delete' ? 'Clínica excluída definitivamente' : 'Clínica banida', 'success');
      closeControl(); setSelectedClinic(null); await loadAll();
    } catch (error: any) { setControlError(error.message || 'Operação não concluída.'); }
    finally { setControlBusy(false); setAdminPassword(''); }
  };
  const updateControl = async (clinic: any, action: 'unban' | 'toggle-registrations') => {
    if (controlBusy) return; setControlBusy(true);
    try {
      const result = await ApiClient.put<{ message: string }>(`/v1/admin/tenants/${clinic.id}/${action}`, { blocked: !clinic.registrations_blocked });
      showToast(result.message, 'success'); await loadAll();
    } catch (error: any) { showToast(error.message, 'error'); }
    finally { setControlBusy(false); }
  };

  // Profissões Globais
  const [professions, setProfessions] = useState<any[]>([]);
  const [searchProf, setSearchProf] = useState('');
  const [isProfModalOpen, setIsProfModalOpen] = useState(false);
  const [editingProf, setEditingProf] = useState<any>(null);
  const [profForm, setProfForm] = useState({
    name: '',
    categoryId: '',
    registrationBoardLabel: '',
    registrationRequired: false
  });

  // Tipos de Serviço / Categorias
  const [categories, setCategories] = useState<any[]>([]);
  const [searchCat, setSearchCat] = useState('');
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [catForm, setCatForm] = useState({
    name: '',
    description: '',
    defaultTerminology: 'client',
    isClinical: false
  });

  const loadAll = async () => {
    try {
      setLoading(true);
      const [metData, tenData, profData, catData] = await Promise.all([
        ApiClient.get<any>('/v1/admin/metrics'),
        ApiClient.get<any[]>('/v1/tenants'),
        ApiClient.get<any[]>('/v1/taxonomy/professions?all=true'),
        ApiClient.get<any[]>('/v1/taxonomy/categories?all=true')
      ]);
      setMetrics(metData);
      setTenants(tenData || []);
      setProfessions(profData || []);
      setCategories(catData || []);
      if (catData && catData.length > 0 && !profForm.categoryId) {
        setProfForm(prev => ({ ...prev, categoryId: catData[0].id }));
      }
    } catch (err: any) {
      showToast('Erro ao carregar dados administrativos globais', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Handlers de Clínicas
  const handleApprove = async (id: string, name: string) => {
    try {
      await ApiClient.put(`/v1/admin/tenants/${id}/approve`, {});
      showToast(`Clínica "${name}" aprovada com sucesso!`, 'success');
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erro ao aprovar clínica', 'error');
    }
  };

  const handleRejectConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingClinic) return;

    try {
      await ApiClient.put(`/v1/admin/tenants/${rejectingClinic.id}/reject`, { reason: rejectionReason });
      showToast(`Cadastro da clínica "${rejectingClinic.name}" recusado.`, 'success');
      setRejectingClinic(null);
      setRejectionReason('');
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erro ao recusar clínica', 'error');
    }
  };

  const handleBlock = async (id: string, name: string) => {
    if (!window.confirm(`Deseja realmente bloquear a clínica "${name}" e todos os seus acessos?`)) return;
    try {
      await ApiClient.put(`/v1/admin/tenants/${id}/block`, {});
      showToast(`Clínica "${name}" bloqueada.`, 'success');
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erro ao bloquear clínica', 'error');
    }
  };

  const handleUnblock = async (id: string, name: string) => {
    try {
      await ApiClient.put(`/v1/admin/tenants/${id}/unblock`, {});
      showToast(`Clínica "${name}" desbloqueada com sucesso!`, 'success');
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erro ao desbloquear clínica', 'error');
    }
  };

  const handleSwitch = async (tenantId: string, tenantName: string) => {
    try {
      await switchTenant(tenantId);
      showToast(`Contexto administrativo alternado para: ${tenantName}`, 'success');
      window.dispatchEvent(
        new CustomEvent('zemda-navigate', {
          detail: { view: 'dashboard' }
        })
      );
    } catch (err: any) {
      showToast(err.message || 'Erro ao alternar clínica', 'error');
    }
  };

  // Handlers de Profissões Globais
  const handleOpenProfModal = (prof?: any) => {
    if (prof) {
      setEditingProf(prof);
      setProfForm({
        name: prof.name,
        categoryId: prof.category_id || (categories[0]?.id || ''),
        registrationBoardLabel: prof.registration_board_label || '',
        registrationRequired: prof.registration_required === 1
      });
    } else {
      setEditingProf(null);
      setProfForm({
        name: '',
        categoryId: categories[0]?.id || '',
        registrationBoardLabel: '',
        registrationRequired: false
      });
    }
    setIsProfModalOpen(true);
  };

  const handleSaveProfession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profForm.name.trim()) {
      showToast('Nome da profissão é obrigatório', 'error');
      return;
    }

    try {
      if (editingProf) {
        await ApiClient.put(`/v1/taxonomy/professions/${editingProf.id}`, profForm);
        showToast(`Profissão "${profForm.name}" atualizada com sucesso!`, 'success');
      } else {
        await ApiClient.post('/v1/taxonomy/professions', profForm);
        showToast(`Nova profissão "${profForm.name}" cadastrada no sistema!`, 'success');
      }
      setIsProfModalOpen(false);
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar profissão', 'error');
    }
  };

  const handleToggleProfStatus = async (prof: any) => {
    try {
      const res = await ApiClient.put<{ message: string; active: number }>(`/v1/taxonomy/professions/${prof.id}/toggle-status`, {});
      showToast(res.message || 'Status alterado com sucesso', 'success');
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erro ao alterar status da profissão', 'error');
    }
  };

  // Handlers de Tipos de Serviço / Categorias
  const handleOpenCatModal = (cat?: any) => {
    if (cat) {
      setEditingCat(cat);
      setCatForm({
        name: cat.name,
        description: cat.description || '',
        defaultTerminology: cat.default_terminology || 'client',
        isClinical: cat.is_clinical === 1
      });
    } else {
      setEditingCat(null);
      setCatForm({
        name: '',
        description: '',
        defaultTerminology: 'client',
        isClinical: false
      });
    }
    setIsCatModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catForm.name.trim()) {
      showToast('Nome do tipo de serviço é obrigatório', 'error');
      return;
    }

    try {
      if (editingCat) {
        await ApiClient.put(`/v1/taxonomy/categories/${editingCat.id}`, catForm);
        showToast(`Tipo de serviço "${catForm.name}" atualizado com sucesso!`, 'success');
      } else {
        await ApiClient.post('/v1/taxonomy/categories', catForm);
        showToast(`Novo tipo de serviço "${catForm.name}" cadastrado!`, 'success');
      }
      setIsCatModalOpen(false);
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar tipo de serviço', 'error');
    }
  };

  const handleToggleCatStatus = async (cat: any) => {
    try {
      const res = await ApiClient.put<{ message: string; active: number }>(`/v1/taxonomy/categories/${cat.id}/toggle-status`, {});
      showToast(res.message || 'Status alterado com sucesso', 'success');
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erro ao alterar status do tipo de serviço', 'error');
    }
  };

  // Filtros
  const filteredTenants = tenants.filter(t => {
    if (activeTab === 'pending') return t.status === 'pending';
    if (activeTab === 'active') return t.status === 'active';
    if (activeTab === 'blocked') return t.status === 'blocked' || t.status === 'suspended' || t.status === 'banned';
    return true;
  }).filter(t => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      t.name?.toLowerCase().includes(term) ||
      t.trade_name?.toLowerCase().includes(term) ||
      t.email?.toLowerCase().includes(term) ||
      t.city?.toLowerCase().includes(term)
    );
  });

  const filteredProfessions = professions.filter(p => {
    if (!searchProf) return true;
    const term = searchProf.toLowerCase();
    return (
      p.name?.toLowerCase().includes(term) ||
      p.category_name?.toLowerCase().includes(term) ||
      p.registration_board_label?.toLowerCase().includes(term)
    );
  });

  const filteredCategories = categories.filter(c => {
    if (!searchCat) return true;
    const term = searchCat.toLowerCase();
    return (
      c.name?.toLowerCase().includes(term) ||
      c.description?.toLowerCase().includes(term) ||
      c.default_terminology?.toLowerCase().includes(term)
    );
  });

  if (user?.role !== 'superadmin') return null;
  return (
    <div className="space-y-6">
      {control && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={submitControl} role="dialog" aria-modal="true" aria-labelledby="clinic-control-title" className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-4">
            <h3 id="clinic-control-title" className="font-bold text-lg">{control.action === 'delete' ? 'Excluir clínica definitivamente' : 'Banir clínica'}</h3>
            <p>Clínica: <strong>{control.clinic.name}</strong></p>
            <p className="text-red-700">{control.action === 'delete' ? 'Esta ação apagará permanentemente a clínica e todos os dados vinculados. Esta operação não poderá ser desfeita.' : 'O acesso será bloqueado imediatamente. Os dados serão preservados.'}</p>
            <label className="block">{control.action === 'delete' ? 'Motivo da exclusão:' : 'Motivo do banimento:'}
              <textarea autoFocus required maxLength={2000} value={controlReason} onChange={e => setControlReason(e.target.value)} className="border rounded-lg p-2 w-full" disabled={controlBusy} />
            </label>
            {control.action === 'delete' && <>
              <label className="block">Digite EXCLUIR
                <input required value={confirmation} onChange={e => setConfirmation(e.target.value)} className="border rounded-lg p-2 w-full" disabled={controlBusy} autoComplete="off" />
              </label>
              <label className="block">Senha atual do Administrador do Sistema:
                <input type="password" required autoComplete="current-password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="border rounded-lg p-2 w-full" disabled={controlBusy} />
              </label>
            </>}
            {controlError && <p role="alert" className="text-red-700">{controlError}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" disabled={controlBusy} onClick={closeControl} className="border rounded-lg px-4 py-2">CANCELAR</button>
              <button type="submit" disabled={controlBusy || !controlReason.trim() || (control.action === 'delete' && (confirmation !== 'EXCLUIR' || !adminPassword))} className="bg-red-700 text-white rounded-lg px-4 py-2 disabled:opacity-50">{controlBusy ? 'Processando…' : control.action === 'delete' ? 'EXCLUIR DEFINITIVAMENTE' : 'BANIR CLÍNICA'}</button>
            </div>
          </form>
        </div>
      )}
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border border-white/10">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-rose-500/20 rounded-2xl border border-rose-500/30 text-rose-400">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 text-[10px] font-black uppercase tracking-wider mb-1">
              Painel de Governança Global
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">Administrador da Plataforma</h2>
            <p className="text-xs text-slate-400 mt-0.5 max-w-xl">
              Gestão multi-clínicas, moderação de estabelecimentos e controle global de profissões e tipos de serviço.
            </p>
          </div>
        </div>

        {/* Menu Superior de Módulos Globais */}
        <div className="flex items-center gap-1.5 p-1.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 text-xs font-bold">
          <button onClick={()=>setMainSection('subscriptions')} className="px-3 py-2 rounded-xl hover:bg-white/10">Assinaturas</button>
          <button onClick={()=>setMainSection('integrations')} className="px-3 py-2 rounded-xl hover:bg-white/10">Integrações</button>
          <button
            onClick={() => setMainSection('tenants')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              mainSection === 'tenants'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Clínicas {loading ? '(…)' : `(${tenants.length})`}
          </button>

          <button
            onClick={() => setMainSection('professions')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              mainSection === 'professions'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            Profissões Globais {loading ? '(…)' : `(${professions.length})`}
          </button>

          <button
            onClick={() => setMainSection('categories')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              mainSection === 'categories'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Tipos de Serviço {loading ? '(…)' : `(${categories.length})`}
          </button>

          <button
            onClick={() => setMainSection('free_trials')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              mainSection === 'free_trials'
                ? 'bg-amber-400 text-slate-950 font-black shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            Testes Grátis
          </button>

          <button
            onClick={() => setMainSection('whatsapp')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              mainSection === 'whatsapp'
                ? 'bg-emerald-500 text-white font-black shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            WhatsApp Central
          </button>

          <button
            onClick={() => setMainSection('laboratory')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              mainSection === 'laboratory'
                ? 'bg-purple-600 text-white font-black shadow-md'
                : 'text-purple-300 hover:text-white'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Laboratório Sandbox
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SEÇÕES GLOBAIS DE GOVERNANÇA DO SAAS */}
      {/* ========================================================================= */}
      {mainSection === 'subscriptions' && <GlobalBillingView />}
      {mainSection === 'integrations' && <GlobalBillingView integration />}
      {mainSection === 'free_trials' && <FreeTrialsAdminView />}
      {mainSection === 'whatsapp' && <WhatsAppEmbeddedSignup />}
      {mainSection === 'laboratory' && <SuperAdminLaboratoryView />}
      {mainSection === 'tenants' && (
        <div className="space-y-6">
          {/* Alertas do Sistema */}
          {metrics?.pendingClinics > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-3 text-xs text-amber-900 shadow-xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <p className="font-bold">
                  Existem {metrics.pendingClinics} clínica(s) aguardando sua aprovação para iniciar o uso da plataforma.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('pending')}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs whitespace-nowrap"
              >
                Ver Solicitações Pendentes
              </button>
            </div>
          )}

          {/* Grid de Estatísticas Globais */}
          {metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-3xl border border-slate-100 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Total de Clínicas</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics.totalClinics}</p>
                <span className="text-[11px] text-slate-400 font-medium">{metrics.activeClinics} ativas • {metrics.pendingClinics} pendentes</span>
              </div>

              <div className="p-4 bg-white rounded-3xl border border-slate-100 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Usuários Cadastrados</span>
                <p className="text-2xl font-black text-indigo-600 mt-1">{metrics.totalUsers}</p>
                <span className="text-[11px] text-slate-400 font-medium">{metrics.totalProfessionals} profissionais</span>
              </div>

              <div className="p-4 bg-white rounded-3xl border border-slate-100 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Agendamentos na Plataforma</span>
                <p className="text-2xl font-black text-teal-600 mt-1">{metrics.totalAppointments}</p>
                <span className="text-[11px] text-slate-400 font-medium">Em todas as clínicas</span>
              </div>

              <div className="p-4 bg-white rounded-3xl border border-slate-100 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Faturamento Global</span>
                <p className="text-2xl font-black text-emerald-600 mt-1">
                  {Number(metrics.totalRevenueEstimate).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <span className="text-[11px] text-slate-400 font-medium">Volume transacionado</span>
              </div>
            </div>
          )}

          {/* Tabela de Clínicas */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl w-fit text-xs font-bold">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'all' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas {loading ? '(…)' : `(${tenants.length})`}
                </button>
                <button
                  onClick={() => setActiveTab('pending')}
                  className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                    activeTab === 'pending' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pendentes
                  {loading ? (
                    <span className="text-slate-400 font-normal text-[10px]">(…)</span>
                  ) : metrics?.pendingClinics > 0 ? (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black">
                      {metrics.pendingClinics}
                    </span>
                  ) : null}
                </button>
                <button
                  onClick={() => setActiveTab('active')}
                  className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'active' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ativas {loading ? '(…)' : `(${tenants.filter(t => t.status === 'active').length})`}
                </button>
                <button
                  onClick={() => setActiveTab('blocked')}
                  className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'blocked' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bloqueadas {loading ? '(…)' : `(${tenants.filter(t => t.status === 'blocked' || t.status === 'suspended').length})`}
                </button>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar clínica, e-mail ou cidade..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3">Clínica / Estabelecimento</th>
                    <th className="py-3 px-3">Responsável</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Onboarding</th>
                    <th className="py-3 px-3 text-center">Profissionais</th>
                    <th className="py-3 px-3 text-center">Atendimentos</th>
                    <th className="py-3 px-3 text-right">Ações de Moderação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs font-medium">Carregando estabelecimentos cadastrados...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400 text-xs font-medium">
                        Nenhum estabelecimento encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3">
                          <p className="font-bold text-slate-800 text-sm">{t.trade_name || t.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">
                            /c/{t.slug} • {t.city || 'São Paulo'}/{t.state || 'SP'}
                        </p>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-700">{t.responsible_name || 'Gestor'}</p>
                        <p className="text-[10px] text-slate-400">{t.responsible_email || t.email}</p>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                            t.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : t.status === 'pending'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : t.status === 'rejected'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {t.status === 'active' ? 'Ativa' : t.status === 'pending' ? 'Pendente' : t.status === 'rejected' ? 'Recusada' : t.status === 'banned' ? 'Banida' : t.status === 'cleanup_pending' ? 'Limpeza pendente — repetir exclusão' : 'Bloqueada'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {t.onboarding_completed === 1 ? (
                          <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Concluído
                          </span>
                        ) : (
                          <span className="text-amber-600 font-bold text-[11px]">Pendente</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-700">
                        {t.total_professionals || 0}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-teal-600">
                        {t.total_appointments || 0}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {t.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(t.id, t.name)}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-xs cursor-pointer"
                                title="Aprovar Clínica"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Aprovar
                              </button>
                              <button
                                onClick={() => setRejectingClinic(t)}
                                className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-xs cursor-pointer"
                                title="Recusar Cadastro"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {t.status === 'active' && (
                            <>
                              <button
                                onClick={() => handleSwitch(t.id, t.name)}
                                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                                title="Acessar ambiente como Administrador"
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                                Acessar
                              </button>
                              <button
                                onClick={() => handleBlock(t.id, t.name)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                                title="Bloquear Clínica"
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {(t.status === 'blocked' || t.status === 'suspended') && (
                            <button
                              onClick={() => handleUnblock(t.id, t.name)}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                              title="Desbloquear Clínica"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              Desbloquear
                            </button>
                          )}

                          {t.status === 'banned' ? (
                            <button disabled={controlBusy} onClick={() => updateControl(t, 'unban')} className="p-2 text-green-700">Remover banimento</button>
                          ) : <button disabled={controlBusy} onClick={() => { closeControl(); setControl({ clinic: t, action: 'ban' }); }} className="p-2 text-red-700">Banir clínica</button>}
                          <button disabled={controlBusy} onClick={() => updateControl(t, 'toggle-registrations')} className="p-2 text-amber-800">{t.registrations_blocked ? 'Liberar novos cadastros' : 'Bloquear novos cadastros'}</button>
                          <button disabled={controlBusy} onClick={() => { closeControl(); setControl({ clinic: t, action: 'delete' }); }} className="p-2 text-red-700 font-bold">Excluir clínica definitivamente</button>
                          <button
                            onClick={() => setSelectedClinic(t)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                            title="Ver Dados Administrativos"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SEÇÃO 2: PROFISSÕES GLOBAIS (Exclusivo SuperAdmin SaaS) */}
      {/* ========================================================================= */}
      {mainSection === 'professions' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                Catálogo Global de Profissões
              </h3>
              <p className="text-xs text-slate-500">
                Profissões estruturadas que ficam disponíveis para cadastro de equipes em todas as clínicas da plataforma.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar por nome ou conselho..."
                  value={searchProf}
                  onChange={e => setSearchProf(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={() => handleOpenProfModal()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                Adicionar Profissão
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Profissão</th>
                  <th className="py-3 px-4">Categoria Macro</th>
                  <th className="py-3 px-4">Conselho de Classe</th>
                  <th className="py-3 px-4">Exige Registro?</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-medium">Carregando catálogo de profissões...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredProfessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400 text-xs font-medium">
                      Nenhuma profissão encontrada.
                    </td>
                  </tr>
                ) : (
                  filteredProfessions.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                      {p.name}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 font-medium text-[11px]">
                        {p.category_name || 'Geral'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {p.registration_board_label ? (
                        <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md text-[11px]">
                          {p.registration_board_label}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {p.registration_required === 1 ? (
                        <span className="text-emerald-700 font-bold text-[11px]">Sim (Obrigatório)</span>
                      ) : (
                        <span className="text-slate-500 font-medium text-[11px]">Opcional</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          p.active === 1
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {p.active === 1 ? 'Ativa' : 'Desativada'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenProfModal(p)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleProfStatus(p)}
                          className={`px-2.5 py-1.5 font-bold text-[11px] rounded-lg flex items-center gap-1 cursor-pointer ${
                            p.active === 1
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {p.active === 1 ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SEÇÃO 3: TIPOS DE SERVIÇO / CATEGORIAS (Exclusivo SuperAdmin SaaS) */}
      {/* ========================================================================= */}
      {mainSection === 'categories' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                Tipos de Serviço & Categorias Macro
              </h3>
              <p className="text-xs text-slate-500">
                Segmentos e ramos de atuação suportados pelo sistema para agendamento, atendimento e prontuário.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar tipo de serviço..."
                  value={searchCat}
                  onChange={e => setSearchCat(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={() => handleOpenCatModal()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                Adicionar Tipo de Serviço
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-medium">Carregando tipos de serviço...</span>
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs font-medium">
              Nenhum tipo de serviço encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCategories.map(c => (
                <div
                  key={c.id}
                  className={`p-5 rounded-3xl border flex flex-col justify-between space-y-3 transition-shadow hover:shadow-md ${
                    c.active === 1 ? 'bg-white border-slate-100' : 'bg-slate-50/80 border-slate-200 opacity-80'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-slate-900 text-sm">{c.name}</h4>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          c.active === 1
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {c.active === 1 ? 'Ativo' : 'Desativado'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2">
                      {c.description || 'Sem descrição cadastrada.'}
                    </p>

                    <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-600">
                      <p>
                        <strong>Área:</strong>{' '}
                        {c.is_clinical === 1 ? (
                          <span className="text-purple-700 font-bold">Saúde / Clínica (com prontuário)</span>
                        ) : (
                          <span className="text-slate-600 font-medium">Serviços Gerais</span>
                        )}
                      </p>
                      <p>
                        <strong>Terminologia padrão:</strong>{' '}
                        <span className="capitalize font-semibold text-slate-800">{c.default_terminology}</span>
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenCatModal(c)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCatStatus(c)}
                      className={`px-3 py-1.5 font-bold text-xs rounded-xl cursor-pointer ${
                        c.active === 1
                          ? 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {c.active === 1 ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Nova / Editar Profissão Global */}
      {/* ========================================================================= */}
      {isProfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingProf ? `Editar Profissão: ${editingProf.name}` : 'Cadastrar Nova Profissão Global'}
              </h3>
              <button onClick={() => setIsProfModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfession} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome da Profissão *</label>
                <input
                  type="text"
                  required
                  value={profForm.name}
                  onChange={e => setProfForm({ ...profForm, name: e.target.value })}
                  placeholder="Ex: Fisioterapia, Fonoaudiologia, Nutrição..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Categoria Macro *</label>
                <select
                  value={profForm.categoryId}
                  onChange={e => setProfForm({ ...profForm, categoryId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Sigla do Conselho / Registro (Opcional)</label>
                <input
                  type="text"
                  value={profForm.registrationBoardLabel}
                  onChange={e => setProfForm({ ...profForm, registrationBoardLabel: e.target.value.toUpperCase() })}
                  placeholder="Ex: CRP, CRM, CREFITO, CRFa, CRN, OAB"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium uppercase"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="regRequired"
                  checked={profForm.registrationRequired}
                  onChange={e => setProfForm({ ...profForm, registrationRequired: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="regRequired" className="font-semibold text-slate-700 cursor-pointer">
                  Exigir número de registro no cadastro do profissional
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsProfModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Salvar Profissão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Novo / Editar Tipo de Serviço */}
      {/* ========================================================================= */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingCat ? `Editar Tipo de Serviço: ${editingCat.name}` : 'Cadastrar Novo Tipo de Serviço'}
              </h3>
              <button onClick={() => setIsCatModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nome do Tipo de Serviço *</label>
                <input
                  type="text"
                  required
                  value={catForm.name}
                  onChange={e => setCatForm({ ...catForm, name: e.target.value })}
                  placeholder="Ex: Terapias Integrativas, Odontologia Estética..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={catForm.description}
                  onChange={e => setCatForm({ ...catForm, description: e.target.value })}
                  placeholder="Breve resumo sobre o segmento de atendimento..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-slate-50 font-medium resize-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Terminologia Padrão</label>
                <select
                  value={catForm.defaultTerminology}
                  onChange={e => setCatForm({ ...catForm, defaultTerminology: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-medium"
                >
                  <option value="client">Cliente</option>
                  <option value="patient">Paciente</option>
                  <option value="student">Aluno / Aluna</option>
                  <option value="pet_owner">Tutor / Pet</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="catIsClin"
                  checked={catForm.isClinical}
                  onChange={e => setCatForm({ ...catForm, isClinical: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="catIsClin" className="font-semibold text-slate-700 cursor-pointer">
                  Área da Saúde (Habilita prontuário clínico sigiloso com LGPD)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Salvar Tipo de Serviço
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Recusar Cadastro */}
      {rejectingClinic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">
              Recusar Cadastro de "{rejectingClinic.name}"
            </h3>
            <p className="text-xs text-slate-500">
              Informe a justificativa que ficará registrada no log e para o responsável.
            </p>
            <form onSubmit={handleRejectConfirm} className="space-y-4 text-xs">
              <textarea
                required
                rows={3}
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Motivo da recusa (ex: dados cadastrais inconsistentes)..."
                className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectingClinic(null)}
                  className="px-4 py-2 font-bold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Confirmar Recusa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Detalhes Administrativos da Clínica */}
      {selectedClinic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900">
                Ficha da Clínica — {selectedClinic.name}
              </h3>
              <button onClick={() => setSelectedClinic(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-slate-700">
              <p><strong>Razão Social:</strong> {selectedClinic.corporate_name || selectedClinic.name}</p>
              <p><strong>Nome Fantasia:</strong> {selectedClinic.trade_name || selectedClinic.name}</p>
              <p><strong>CNPJ/CPF:</strong> {selectedClinic.cnpj_cpf || 'Não informado'}</p>
              <p><strong>Responsável:</strong> {selectedClinic.responsible_name || 'Gestor'}</p>
              <p><strong>E-mail:</strong> {selectedClinic.responsible_email || selectedClinic.email}</p>
              <p><strong>Telefone:</strong> {selectedClinic.phone || 'Não informado'}</p>
              <p><strong>Cidade/UF:</strong> {selectedClinic.city || 'São Paulo'}/{selectedClinic.state || 'SP'}</p>
              <p><strong>Status:</strong> <span className="uppercase font-bold text-indigo-600">{selectedClinic.status}</span></p>
              <p><strong>Data de Cadastro:</strong> {new Date(selectedClinic.created_at).toLocaleDateString('pt-BR')}</p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedClinic(null)}
                className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
