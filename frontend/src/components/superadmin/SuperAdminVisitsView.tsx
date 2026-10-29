import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Plus,
  ArrowRight,
  X,
  Phone,
  MessageSquare,
  Mail,
  Globe,
  MapPin,
  Eye,
  Edit3,
  Download,
  Printer,
  ChevronRight,
  ChevronLeft,
  Award,
  Sparkles,
  TrendingUp,
  RefreshCw,
  FileText,
  Check,
  AlertCircle,
  Link as LinkIcon,
  CalendarCheck,
  User,
  Users,
  Briefcase,
  History,
  Archive,
  ExternalLink
} from 'lucide-react';

interface Establishment {
  id: string;
  tenant_id?: string | null;
  name: string;
  trade_name?: string | null;
  corporate_name?: string | null;
  cnpj?: string | null;
  areas_of_activity: string[];
  establishment_type?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  website?: string | null;
  instagram?: string | null;
  estimated_professionals?: number | null;
  primary_contact_name?: string | null;
  primary_contact_role?: string | null;
  primary_contact_phone?: string | null;
  primary_contact_whatsapp?: string | null;
  primary_contact_email?: string | null;
  best_contact_time?: string | null;
  preferred_channel?: string | null;
  current_status: string;
  last_visit_date?: string | null;
  next_action?: string | null;
  next_return_date?: string | null;
  archived: number;
  visit_count?: number;
  pending_tasks_count?: number;
  linked_tenant_name?: string | null;
  linked_tenant_slug?: string | null;
  linked_tenant_status?: string | null;
  created_at: string;
  updated_at: string;
}

interface VisitRecord {
  id: string;
  establishment_id: string;
  visit_date: string;
  visit_time?: string | null;
  modality: 'presential' | 'online_meeting' | 'phone' | 'whatsapp';
  responsible_name: string;
  objective?: string | null;
  features_presented: string[];
  needs_identified?: string | null;
  main_doubts?: string | null;
  commercial_objections?: string | null;
  notes?: string | null;
  result?: string | null;
  status_after_visit: string;
  next_action?: string | null;
  next_return_date?: string | null;
  created_by?: string | null;
  created_at: string;
}

interface FollowUpTask {
  id: string;
  establishment_id: string;
  visit_id?: string | null;
  task_type: string;
  description: string;
  due_date: string;
  status: 'pending' | 'completed' | 'cancelled';
  completed_at?: string | null;
  assigned_to?: string | null;
  establishment_name?: string;
  establishment_city?: string;
  establishment_state?: string;
  primary_contact_name?: string;
  primary_contact_phone?: string;
  primary_contact_whatsapp?: string;
  created_at: string;
}

interface Metrics {
  totalEstablishments: number;
  monthVisits: number;
  interested: number;
  inNegotiation: number;
  freeTrial: number;
  converted: number;
  pendingReturns: number;
  overdueReturns: number;
  statusDistribution?: Record<string, number>;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  first_contact: { label: 'Primeiro contato', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  visit_scheduled: { label: 'Visita agendada', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  visit_completed: { label: 'Visita realizada', bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  interested: { label: 'Interessado', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  demo_requested: { label: 'Demo solicitada', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  in_negotiation: { label: 'Em negociação', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  free_trial: { label: 'Teste gratuito', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  converted: { label: 'Cliente convertido', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  not_interested: { label: 'Não interessado', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  closed: { label: 'Contato encerrado', bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-300' }
};

const SPECIALTIES_LIST = [
  'Clínica Médica',
  'Odontologia',
  'Fisioterapia',
  'Nutrição',
  'Psicologia',
  'Fonoaudiologia',
  'Terapia Ocupacional',
  'Educação Física / Personal',
  'Estética & Biomédica',
  'Psicopedagogia',
  'Clínica Multidisciplinar',
  'Outras Especialidades'
];

export const SuperAdminVisitsView: React.FC = () => {
  const { showToast } = useToast();

  // Abas principais
  const [activeTab, setActiveTab] = useState<'establishments' | 'tasks' | 'reports'>('establishments');

  // Estados de dados
  const [loading, setLoading] = useState(true);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [metrics, setMetrics] = useState<Metrics>({
    totalEstablishments: 0,
    monthVisits: 0,
    interested: 0,
    inNegotiation: 0,
    freeTrial: 0,
    converted: 0,
    pendingReturns: 0,
    overdueReturns: 0
  });

  // Filtros da tabela principal
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSpecialty, setFilterSpecialty] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Modais
  const [showNewModal, setShowNewModal] = useState(false);
  const [showAddVisitModal, setShowAddVisitModal] = useState(false);
  const [selectedEstablishmentForVisit, setSelectedEstablishmentForVisit] = useState<Establishment | null>(null);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [timelineEstablishment, setTimelineEstablishment] = useState<Establishment | null>(null);
  const [timelineVisits, setTimelineVisits] = useState<VisitRecord[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [showLinkTenantModal, setShowLinkTenantModal] = useState(false);
  const [establishmentToLink, setEstablishmentToLink] = useState<Establishment | null>(null);
  const [tenantSearchQuery, setTenantSearchQuery] = useState('');
  const [tenantSearchResults, setTenantSearchResults] = useState<any[]>([]);
  const [searchingTenants, setSearchingTenants] = useState(false);
  const [editingEstablishment, setEditingEstablishment] = useState<Establishment | null>(null);

  // Acompanhamentos / Tarefas
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [taskFilter, setTaskFilter] = useState<'today' | 'upcoming' | 'overdue' | 'completed' | 'all'>('all');
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [taskFormEstablishmentId, setTaskFormEstablishmentId] = useState('');
  const [taskFormDescription, setTaskFormDescription] = useState('');
  const [taskFormDueDate, setTaskFormDueDate] = useState('');
  const [taskFormAssignedTo, setTaskFormAssignedTo] = useState('');

  // Relatórios
  const [reportsData, setReportsData] = useState<any>(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Form states do Novo Estabelecimento
  const [estForm, setEstForm] = useState({
    name: '',
    tradeName: '',
    corporateName: '',
    cnpj: '',
    areasOfActivity: [] as string[],
    establishmentType: 'Clínica Privada',
    city: '',
    state: '',
    address: '',
    website: '',
    instagram: '',
    estimatedProfessionals: '' as number | '',
    primaryContactName: '',
    primaryContactRole: '',
    primaryContactPhone: '',
    primaryContactWhatsapp: '',
    primaryContactEmail: '',
    bestContactTime: '',
    preferredChannel: 'whatsapp',
    currentStatus: 'first_contact',
    // Visita inicial
    includeInitialVisit: false,
    visitDate: new Date().toISOString().split('T')[0],
    visitTime: '10:00',
    modality: 'presential' as 'presential' | 'online_meeting' | 'phone' | 'whatsapp',
    responsibleName: '',
    objective: '',
    featuresPresented: [] as string[],
    needsIdentified: '',
    mainDoubts: '',
    commercialObjections: '',
    notes: '',
    result: '',
    nextAction: '',
    nextReturnDate: ''
  });
  const [savingEst, setSavingEst] = useState(false);

  // Form states da Nova Visita para Estabelecimento Existente
  const [visitForm, setVisitForm] = useState({
    visitDate: new Date().toISOString().split('T')[0],
    visitTime: '14:00',
    modality: 'presential' as 'presential' | 'online_meeting' | 'phone' | 'whatsapp',
    responsibleName: '',
    objective: '',
    featuresPresented: [] as string[],
    needsIdentified: '',
    mainDoubts: '',
    commercialObjections: '',
    notes: '',
    result: '',
    statusAfterVisit: 'visit_completed',
    nextAction: '',
    nextReturnDate: ''
  });
  const [savingVisit, setSavingVisit] = useState(false);

  // Carrega métricas
  const fetchMetrics = useCallback(async () => {
    try {
      const data = await ApiClient.get<Metrics>('/v1/admin/visits/metrics');
      setMetrics(data);
    } catch (err) {
      console.warn('Erro ao carregar métricas de visitas:', err);
    }
  }, []);

  // Carrega lista de estabelecimentos
  const fetchEstablishments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', '15');
      if (searchTerm) params.append('search', searchTerm);
      if (filterStatus) params.append('status', filterStatus);
      if (filterSpecialty) params.append('specialty', filterSpecialty);
      if (filterCity) params.append('city', filterCity);
      if (filterState) params.append('state', filterState);
      if (filterStartDate) params.append('startDate', filterStartDate);
      if (filterEndDate) params.append('endDate', filterEndDate);

      const res = await ApiClient.get<{ items: Establishment[]; total: number; page: number; totalPages: number }>(
        `/v1/admin/visits/establishments?${params.toString()}`
      );
      setEstablishments(res.items || []);
      setTotalItems(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      showToast('Erro ao carregar estabelecimentos comerciais', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, filterStatus, filterSpecialty, filterCity, filterState, filterStartDate, filterEndDate, showToast]);

  // Carrega tarefas
  const fetchTasks = useCallback(async () => {
    try {
      const res = await ApiClient.get<FollowUpTask[]>(`/v1/admin/visits/tasks?filter=${taskFilter}`);
      setTasks(res || []);
    } catch (err) {
      console.warn('Erro ao carregar tarefas:', err);
    }
  }, [taskFilter]);

  // Carrega dados de relatório
  const fetchReports = useCallback(async () => {
    try {
      setReportsLoading(true);
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterSpecialty) params.append('specialty', filterSpecialty);
      if (filterCity) params.append('city', filterCity);
      if (filterState) params.append('state', filterState);
      if (filterStartDate) params.append('startDate', filterStartDate);
      if (filterEndDate) params.append('endDate', filterEndDate);

      const res = await ApiClient.get<any>(`/v1/admin/visits/reports?${params.toString()}`);
      setReportsData(res);
    } catch (err) {
      showToast('Erro ao gerar dados do relatório', 'error');
    } finally {
      setReportsLoading(false);
    }
  }, [filterStatus, filterSpecialty, filterCity, filterState, filterStartDate, filterEndDate, showToast]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (activeTab === 'establishments') {
      fetchEstablishments();
    } else if (activeTab === 'tasks') {
      fetchTasks();
    } else if (activeTab === 'reports') {
      fetchReports();
    }
  }, [activeTab, fetchEstablishments, fetchTasks, fetchReports]);

  // Busca timeline
  const handleOpenTimeline = async (est: Establishment) => {
    setTimelineEstablishment(est);
    setShowTimelineModal(true);
    try {
      setTimelineLoading(true);
      const details = await ApiClient.get<any>(`/v1/admin/visits/establishments/${est.id}`);
      setTimelineVisits(details.visits || []);
    } catch (err) {
      showToast('Erro ao carregar histórico da clínica', 'error');
    } finally {
      setTimelineLoading(false);
    }
  };

  // Salvar novo estabelecimento
  const handleCreateEstablishment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!estForm.name.trim()) {
      showToast('Informe o nome da clínica ou estabelecimento.', 'error');
      return;
    }

    try {
      setSavingEst(true);
      const payload: any = {
        name: estForm.name.trim(),
        tradeName: estForm.tradeName.trim() || null,
        corporateName: estForm.corporateName.trim() || null,
        cnpj: estForm.cnpj.trim() || null,
        areasOfActivity: estForm.areasOfActivity,
        establishmentType: estForm.establishmentType,
        city: estForm.city.trim() || null,
        state: estForm.state.trim() || null,
        address: estForm.address.trim() || null,
        website: estForm.website.trim() || null,
        instagram: estForm.instagram.trim() || null,
        estimatedProfessionals: estForm.estimatedProfessionals ? Number(estForm.estimatedProfessionals) : null,
        primaryContactName: estForm.primaryContactName.trim() || null,
        primaryContactRole: estForm.primaryContactRole.trim() || null,
        primaryContactPhone: estForm.primaryContactPhone.trim() || null,
        primaryContactWhatsapp: estForm.primaryContactWhatsapp.trim() || null,
        primaryContactEmail: estForm.primaryContactEmail.trim() || null,
        bestContactTime: estForm.bestContactTime.trim() || null,
        preferredChannel: estForm.preferredChannel,
        currentStatus: estForm.currentStatus
      };

      if (estForm.includeInitialVisit && estForm.visitDate) {
        payload.initialVisit = {
          visitDate: estForm.visitDate,
          visitTime: estForm.visitTime,
          modality: estForm.modality,
          responsibleName: estForm.responsibleName.trim() || 'SuperAdmin',
          objective: estForm.objective.trim() || null,
          featuresPresented: estForm.featuresPresented,
          needsIdentified: estForm.needsIdentified.trim() || null,
          mainDoubts: estForm.mainDoubts.trim() || null,
          commercialObjections: estForm.commercialObjections.trim() || null,
          notes: estForm.notes.trim() || null,
          result: estForm.result.trim() || null,
          statusAfterVisit: estForm.currentStatus,
          nextAction: estForm.nextAction.trim() || null,
          nextReturnDate: estForm.nextReturnDate || null
        };
      }

      await ApiClient.post('/v1/admin/visits/establishments', payload);
      showToast('Estabelecimento cadastrado com sucesso!', 'success');
      setShowNewModal(false);
      fetchEstablishments();
      fetchMetrics();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar estabelecimento', 'error');
    } finally {
      setSavingEst(false);
    }
  };

  // Salvar nova visita para estabelecimento existente
  const handleAddVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEstablishmentForVisit) return;
    if (!visitForm.visitDate) {
      showToast('Data da visita é obrigatória.', 'error');
      return;
    }

    try {
      setSavingVisit(true);
      await ApiClient.post(`/v1/admin/visits/establishments/${selectedEstablishmentForVisit.id}/visits`, {
        visitDate: visitForm.visitDate,
        visitTime: visitForm.visitTime,
        modality: visitForm.modality,
        responsibleName: visitForm.responsibleName.trim() || 'SuperAdmin',
        objective: visitForm.objective.trim() || null,
        featuresPresented: visitForm.featuresPresented,
        needsIdentified: visitForm.needsIdentified.trim() || null,
        mainDoubts: visitForm.mainDoubts.trim() || null,
        commercialObjections: visitForm.commercialObjections.trim() || null,
        notes: visitForm.notes.trim() || null,
        result: visitForm.result.trim() || null,
        statusAfterVisit: visitForm.statusAfterVisit,
        nextAction: visitForm.nextAction.trim() || null,
        nextReturnDate: visitForm.nextReturnDate || null
      });

      showToast('Visita registrada com sucesso!', 'success');
      setShowAddVisitModal(false);
      fetchEstablishments();
      fetchMetrics();
      if (showTimelineModal && timelineEstablishment?.id === selectedEstablishmentForVisit.id) {
        handleOpenTimeline(selectedEstablishmentForVisit);
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar visita', 'error');
    } finally {
      setSavingVisit(false);
    }
  };

  // Alternar tarefa (concluir / reabrir)
  const handleToggleTask = async (task: FollowUpTask) => {
    try {
      const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
      await ApiClient.patch(`/v1/admin/visits/tasks/${task.id}/toggle`, { status: nextStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
      fetchMetrics();
    } catch (err) {
      showToast('Erro ao atualizar tarefa', 'error');
    }
  };

  // Busca de tenants para vincular
  const handleSearchTenants = async (query: string) => {
    setTenantSearchQuery(query);
    if (query.trim().length < 2) {
      setTenantSearchResults([]);
      return;
    }
    try {
      setSearchingTenants(true);
      const res = await ApiClient.get<any[]>(`/v1/admin/visits/search-tenants?q=${encodeURIComponent(query)}`);
      setTenantSearchResults(res || []);
    } catch {
      setTenantSearchResults([]);
    } finally {
      setSearchingTenants(false);
    }
  };

  // Vincular tenant
  const handleLinkTenant = async (tenantId: string | null) => {
    if (!establishmentToLink) return;
    try {
      await ApiClient.post(`/v1/admin/visits/establishments/${establishmentToLink.id}/link-tenant`, { tenantId });
      showToast(tenantId ? 'Clínica vinculada com sucesso!' : 'Vínculo removido.', 'success');
      setShowLinkTenantModal(false);
      fetchEstablishments();
    } catch (err: any) {
      showToast(err.message || 'Erro ao vincular clínica', 'error');
    }
  };

  // Exportar CSV
  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (filterStatus) params.append('status', filterStatus);
    if (filterSpecialty) params.append('specialty', filterSpecialty);
    if (filterCity) params.append('city', filterCity);
    if (filterState) params.append('state', filterState);
    if (filterStartDate) params.append('startDate', filterStartDate);
    if (filterEndDate) params.append('endDate', filterEndDate);

    const url = `/v1/admin/visits/export-csv?${params.toString()}`;
    window.open(url, '_blank');
  };

  // Helpers de formatação
  const formatDateBr = (d?: string | null) => {
    if (!d) return '—';
    const parts = d.split('T')[0].split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* Header Executivo */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-gradient-to-br from-teal-50 to-indigo-50 text-teal-700 rounded-2xl border border-teal-100">
              <CalendarCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Registro de Visitas
                <span className="text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider bg-teal-100 text-teal-800">
                  SuperAdmin CRM
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Controle comercial, prospecção e acompanhamento de clínicas e estabelecimentos de saúde.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer text-xs min-h-[42px]"
          >
            <Plus className="w-4 h-4" />
            <span>+ Nova Visita / Clínica</span>
          </button>
        </div>
      </div>

      {/* 8 Cards de Indicadores (Dashboard Executivo com click-to-filter) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <button
          type="button"
          onClick={() => { setFilterStatus(''); setPage(1); }}
          className={`bg-white p-3.5 rounded-2xl border transition-all text-left shadow-2xs cursor-pointer ${
            filterStatus === '' ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total</span>
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="text-xl font-black text-slate-800">{metrics.totalEstablishments}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">clínicas</div>
        </button>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs text-left">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Mês Atual</span>
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-black text-indigo-600">{metrics.monthVisits}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">visitas feitas</div>
        </div>

        <button
          type="button"
          onClick={() => { setFilterStatus('interested'); setPage(1); }}
          className={`bg-white p-3.5 rounded-2xl border transition-all text-left shadow-2xs cursor-pointer ${
            filterStatus === 'interested' ? 'border-amber-500 ring-2 ring-amber-100' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Interessadas</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-black text-amber-600">{metrics.interested}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">em aquecimento</div>
        </button>

        <button
          type="button"
          onClick={() => { setFilterStatus('in_negotiation'); setPage(1); }}
          className={`bg-white p-3.5 rounded-2xl border transition-all text-left shadow-2xs cursor-pointer ${
            filterStatus === 'in_negotiation' ? 'border-purple-500 ring-2 ring-purple-100' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Negociação</span>
            <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
          </div>
          <div className="text-xl font-black text-purple-600">{metrics.inNegotiation}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">propostas</div>
        </button>

        <button
          type="button"
          onClick={() => { setFilterStatus('free_trial'); setPage(1); }}
          className={`bg-white p-3.5 rounded-2xl border transition-all text-left shadow-2xs cursor-pointer ${
            filterStatus === 'free_trial' ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Testes</span>
            <Clock className="w-3.5 h-3.5 text-teal-600" />
          </div>
          <div className="text-xl font-black text-teal-600">{metrics.freeTrial}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">degustação</div>
        </button>

        <button
          type="button"
          onClick={() => { setFilterStatus('converted'); setPage(1); }}
          className={`bg-white p-3.5 rounded-2xl border transition-all text-left shadow-2xs cursor-pointer ${
            filterStatus === 'converted' ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Convertidas</span>
            <Award className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-600">{metrics.converted}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">clientes ativos</div>
        </button>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs text-left">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Retornos</span>
            <CalendarCheck className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-black text-blue-600">{metrics.pendingReturns}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">agendados</div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-rose-200 bg-rose-50/30 shadow-2xs text-left">
          <div className="flex items-center justify-between text-rose-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Atrasados</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="text-xl font-black text-rose-600">{metrics.overdueReturns}</div>
          <div className="text-[10px] text-rose-500 mt-0.5">atenção</div>
        </div>
      </div>

      {/* Navegação entre Abas */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('establishments')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'establishments'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Visitas & Oportunidades
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
            activeTab === 'establishments' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {totalItems}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'tasks'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          Acompanhamentos & Lembretes
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'reports'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 bg-white border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Relatórios Comerciais
        </button>
      </div>

      {/* ABA 1: VISITAS E OPORTUNIDADES */}
      {activeTab === 'establishments' && (
        <div className="space-y-4">
          {/* Barra de Filtros */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row flex-wrap items-stretch md:items-center gap-3">
            <div className="flex-1 min-w-[240px] relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                placeholder="Buscar clínica, contato, cidade, WhatsApp ou CNPJ..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 font-medium min-h-[38px]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium text-slate-700 min-h-[38px]"
            >
              <option value="">Todos os Status</option>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>

            <select
              value={filterSpecialty}
              onChange={e => { setFilterSpecialty(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium text-slate-700 min-h-[38px]"
            >
              <option value="">Todas as Especialidades</option>
              {SPECIALTIES_LIST.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <input
              type="text"
              value={filterCity}
              onChange={e => { setFilterCity(e.target.value); setPage(1); }}
              placeholder="Filtrar cidade..."
              className="w-28 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium text-slate-700 min-h-[38px]"
            />

            <input
              type="text"
              maxLength={2}
              value={filterState}
              onChange={e => { setFilterState(e.target.value.toUpperCase()); setPage(1); }}
              placeholder="UF"
              className="w-14 uppercase border border-slate-200 rounded-xl px-2 py-2 text-xs text-center bg-slate-50 font-medium text-slate-700 min-h-[38px]"
            />

            {(filterStatus || filterSpecialty || filterCity || filterState || searchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('');
                  setFilterSpecialty('');
                  setFilterCity('');
                  setFilterState('');
                  setPage(1);
                }}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-1 flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Limpar filtros
              </button>
            )}
          </div>

          {/* Tabela de Estabelecimentos */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
                <p className="text-xs font-semibold">Carregando estabelecimentos e visitas...</p>
              </div>
            ) : establishments.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <Building2 className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-700">Nenhum estabelecimento encontrado</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchTerm || filterStatus || filterSpecialty
                    ? 'Tente alterar os termos da busca ou os filtros aplicados.'
                    : 'Cadastre a primeira clínica prospectada ou visitada utilizando o botão acima.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Clínica / Estabelecimento</th>
                      <th className="py-3 px-4">Cidade / UF</th>
                      <th className="py-3 px-4">Contato Principal</th>
                      <th className="py-3 px-4">Última Visita</th>
                      <th className="py-3 px-4">Status Comercial</th>
                      <th className="py-3 px-4">Próximo Retorno</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {establishments.map(est => {
                      const stCfg = STATUS_CONFIG[est.current_status] || STATUS_CONFIG.first_contact;
                      const isOverdue = est.next_return_date && est.next_return_date < todayStr && !['converted', 'not_interested', 'closed'].includes(est.current_status);

                      return (
                        <tr key={est.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {est.name}
                              {est.linked_tenant_name && (
                                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-50 text-teal-700 border border-teal-200" title={`Vinculada ao tenant: ${est.linked_tenant_name}`}>
                                  <LinkIcon className="w-2.5 h-2.5" />
                                  Zemda
                                </span>
                              )}
                            </div>
                            {est.trade_name && est.trade_name !== est.name && (
                              <div className="text-[11px] text-slate-500">{est.trade_name}</div>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {est.areas_of_activity.slice(0, 2).map((area, i) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                  {area}
                                </span>
                              ))}
                              {est.areas_of_activity.length > 2 && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-400">
                                  +{est.areas_of_activity.length - 2}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                            <div className="flex items-center gap-1 font-medium">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {est.city || '—'} {est.state ? `/ ${est.state}` : ''}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-800">{est.primary_contact_name || '—'}</div>
                            {est.primary_contact_role && (
                              <div className="text-[10px] text-slate-400">{est.primary_contact_role}</div>
                            )}
                            <div className="flex items-center gap-2 mt-0.5">
                              {est.primary_contact_whatsapp && (
                                <a
                                  href={`https://wa.me/55${est.primary_contact_whatsapp.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-emerald-600 hover:underline flex items-center gap-1"
                                >
                                  <MessageSquare className="w-3 h-3" /> WhatsApp
                                </a>
                              )}
                              {est.primary_contact_phone && !est.primary_contact_whatsapp && (
                                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                  <Phone className="w-3 h-3" /> {est.primary_contact_phone}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-800">{formatDateBr(est.last_visit_date)}</div>
                            <div className="text-[10px] text-slate-400">
                              {est.visit_count ? `${est.visit_count} contato(s)` : 'Sem visitas'}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${stCfg.bg} ${stCfg.text} ${stCfg.border}`}>
                              {stCfg.label}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            {est.next_return_date ? (
                              <div>
                                <div className={`font-bold flex items-center gap-1 ${isOverdue ? 'text-rose-600' : 'text-slate-800'}`}>
                                  {formatDateBr(est.next_return_date)}
                                  {isOverdue && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded font-extrabold bg-rose-100 text-rose-700">
                                      Atrasado
                                    </span>
                                  )}
                                </div>
                                {est.next_action && (
                                  <div className="text-[10px] text-slate-500 truncate max-w-[160px]" title={est.next_action}>
                                    {est.next_action}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Nenhum</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedEstablishmentForVisit(est);
                                  setVisitForm(prev => ({
                                    ...prev,
                                    statusAfterVisit: est.current_status
                                  }));
                                  setShowAddVisitModal(true);
                                }}
                                title="Adicionar Visita / Contato"
                                className="p-1.5 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded-lg cursor-pointer transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenTimeline(est)}
                                title="Ver Histórico & Linha do Tempo"
                                className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                              >
                                <History className="w-4 h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEstablishmentToLink(est);
                                  setShowLinkTenantModal(true);
                                }}
                                title={est.tenant_id ? 'Alterar vínculo Zemda' : 'Vincular à clínica do Zemda'}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                              >
                                <LinkIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
                <div>
                  Mostrando página <span className="font-bold text-slate-700">{page}</span> de <span className="font-bold text-slate-700">{totalPages}</span> ({totalItems} registros)
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 2: ACOMPANHAMENTOS E LEMBRETES */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['all', 'today', 'upcoming', 'overdue', 'completed'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTaskFilter(f)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    taskFilter === f
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 bg-slate-50'
                  }`}
                >
                  {f === 'all' && 'Todas as Tarefas'}
                  {f === 'today' && 'Retornos de Hoje'}
                  {f === 'upcoming' && 'Próximos Retornos'}
                  {f === 'overdue' && 'Retornos Atrasados'}
                  {f === 'completed' && 'Concluídas'}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setTaskFormEstablishmentId(establishments[0]?.id || '');
                setShowNewTaskModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Nova Tarefa
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tasks.length === 0 ? (
              <div className="col-span-full bg-white p-12 rounded-3xl border border-slate-200 text-center text-slate-400">
                <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-bold text-slate-600">Nenhuma tarefa pendente com este filtro</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Todas as ações e retornos comerciais estão em dia.</p>
              </div>
            ) : (
              tasks.map(t => {
                const isOverdue = t.status === 'pending' && t.due_date < todayStr;
                const isToday = t.status === 'pending' && t.due_date === todayStr;

                return (
                  <div
                    key={t.id}
                    className={`bg-white p-4 rounded-2xl border shadow-2xs space-y-3 transition-all ${
                      t.status === 'completed'
                        ? 'opacity-60 border-slate-200 bg-slate-50/50'
                        : isOverdue
                        ? 'border-rose-200 bg-rose-50/20'
                        : isToday
                        ? 'border-amber-200 bg-amber-50/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={t.status === 'completed'}
                          onChange={() => handleToggleTask(t)}
                          className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                        <span className={`text-xs font-bold ${t.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {t.description}
                        </span>
                      </div>

                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        isOverdue ? 'bg-rose-100 text-rose-700' : isToday ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {formatDateBr(t.due_date)}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 pl-6 space-y-1">
                      <div className="font-semibold text-slate-700 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        {t.establishment_name} {t.establishment_city ? `(${t.establishment_city})` : ''}
                      </div>
                      {t.primary_contact_name && (
                        <div className="flex items-center justify-between">
                          <span>Contato: {t.primary_contact_name}</span>
                          {t.primary_contact_whatsapp && (
                            <a
                              href={`https://wa.me/55${t.primary_contact_whatsapp.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:underline font-bold"
                            >
                              WhatsApp
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ABA 3: RELATÓRIOS COMERCIAIS */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Relatório Executivo de Prospecção</h2>
              <p className="text-xs text-slate-500">Métricas consolidadas, taxas de conversão e exportação compatível com Excel e PDF.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4" /> Exportar CSV
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
              >
                <Printer className="w-4 h-4" /> Imprimir Relatório
              </button>
            </div>
          </div>

          {reportsLoading ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
              <p className="text-xs font-semibold">Calculando dados de relatório...</p>
            </div>
          ) : reportsData && (
            <div className="space-y-6">
              {/* Cards de Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total de Clínicas</span>
                  <div className="text-2xl font-black text-slate-800 mt-1">{reportsData.totalEstablishments}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Visitas Realizadas</span>
                  <div className="text-2xl font-black text-indigo-600 mt-1">{reportsData.totalVisits}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Conversões</span>
                  <div className="text-2xl font-black text-emerald-600 mt-1">{reportsData.convertedCount}</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Taxa de Conversão</span>
                  <div className="text-2xl font-black text-teal-600 mt-1">{reportsData.conversionRate}%</div>
                </div>
              </div>

              {/* Tabela de Relatório */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Estabelecimentos e Resultados ({reportsData.rows?.length || 0})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/30 text-[10px] font-bold text-slate-500 uppercase">
                        <th className="py-2.5 px-4">Estabelecimento</th>
                        <th className="py-2.5 px-4">Cidade / UF</th>
                        <th className="py-2.5 px-4">Áreas</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4">Última Visita</th>
                        <th className="py-2.5 px-4">Total Visitas</th>
                        <th className="py-2.5 px-4">Próxima Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportsData.rows?.map((r: any) => (
                        <tr key={r.id}>
                          <td className="py-2.5 px-4 font-bold text-slate-900">{r.name}</td>
                          <td className="py-2.5 px-4 text-slate-600">{r.city} / {r.state}</td>
                          <td className="py-2.5 px-4 text-slate-500">{r.areas_of_activity?.join(', ') || '—'}</td>
                          <td className="py-2.5 px-4">
                            <span className="text-[10px] font-bold text-slate-700">
                              {STATUS_CONFIG[r.current_status]?.label || r.current_status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">{formatDateBr(r.last_visit_date)}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-800">{r.total_visits}</td>
                          <td className="py-2.5 px-4 text-slate-500">{r.next_action || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: NOVO ESTABELECIMENTO / VISITA */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xs z-10">
              <div>
                <h3 className="text-base font-bold text-slate-900">Novo Estabelecimento / Visita Comercial</h3>
                <p className="text-xs text-slate-500">Cadastre os dados da clínica e registre o primeiro contato ou visita realizada.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEstablishment} className="p-5 space-y-4">
              {/* Seção 1: Identificação */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-teal-800 tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> 1. Dados do Estabelecimento
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nome da Clínica / Estabelecimento <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={estForm.name}
                      onChange={e => setEstForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Clínica Saúde Integrada, Odonto Prime..."
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nome Fantasia (se houver)</label>
                    <input
                      type="text"
                      value={estForm.tradeName}
                      onChange={e => setEstForm(prev => ({ ...prev, tradeName: e.target.value }))}
                      placeholder="Nome de fachada"
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">CNPJ (opcional)</label>
                    <input
                      type="text"
                      value={estForm.cnpj}
                      onChange={e => setEstForm(prev => ({ ...prev, cnpj: e.target.value }))}
                      placeholder="00.000.000/0000-00"
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Cidade</label>
                    <input
                      type="text"
                      value={estForm.city}
                      onChange={e => setEstForm(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="Ex: São Paulo"
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Estado (UF)</label>
                      <input
                        type="text"
                        maxLength={2}
                        value={estForm.state}
                        onChange={e => setEstForm(prev => ({ ...prev, state: e.target.value.toUpperCase() }))}
                        placeholder="SP"
                        className="w-full uppercase text-center border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Profissionais</label>
                      <input
                        type="number"
                        min="1"
                        value={estForm.estimatedProfessionals}
                        onChange={e => setEstForm(prev => ({ ...prev, estimatedProfessionals: e.target.value ? Number(e.target.value) : '' }))}
                        placeholder="Ex: 5"
                        className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Áreas de Atuação / Especialidades
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {SPECIALTIES_LIST.map(spec => {
                      const isSelected = estForm.areasOfActivity.includes(spec);
                      return (
                        <button
                          key={spec}
                          type="button"
                          onClick={() => {
                            setEstForm(prev => ({
                              ...prev,
                              areasOfActivity: isSelected
                                ? prev.areasOfActivity.filter(s => s !== spec)
                                : [...prev.areasOfActivity, spec]
                            }));
                          }}
                          className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-teal-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {spec}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Seção 2: Contato */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-black uppercase text-teal-800 tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> 2. Pessoa de Contato
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nome do Responsável</label>
                    <input
                      type="text"
                      value={estForm.primaryContactName}
                      onChange={e => setEstForm(prev => ({ ...prev, primaryContactName: e.target.value }))}
                      placeholder="Ex: Dra. Mariana, Carlos..."
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Cargo / Função</label>
                    <input
                      type="text"
                      value={estForm.primaryContactRole}
                      onChange={e => setEstForm(prev => ({ ...prev, primaryContactRole: e.target.value }))}
                      placeholder="Ex: Sócia, Gestor, Recepção..."
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp</label>
                    <input
                      type="text"
                      value={estForm.primaryContactWhatsapp}
                      onChange={e => setEstForm(prev => ({ ...prev, primaryContactWhatsapp: e.target.value }))}
                      placeholder="(00) 00000-0000"
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Seção 3: Status & Visita Inicial */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-teal-800 tracking-wider flex items-center gap-1.5">
                    <CalendarCheck className="w-3.5 h-3.5" /> 3. Registro do Contato / Visita Inicial
                  </h4>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={estForm.includeInitialVisit}
                      onChange={e => setEstForm(prev => ({ ...prev, includeInitialVisit: e.target.checked }))}
                      className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                    />
                    Registrar visita ou interação agora
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Status Comercial Inicial</label>
                    <select
                      value={estForm.currentStatus}
                      onChange={e => setEstForm(prev => ({ ...prev, currentStatus: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium bg-slate-50"
                    >
                      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                        <option key={key} value={key}>{cfg.label}</option>
                      ))}
                    </select>
                  </div>

                  {estForm.includeInitialVisit && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Data da Visita</label>
                        <input
                          type="date"
                          value={estForm.visitDate}
                          onChange={e => setEstForm(prev => ({ ...prev, visitDate: e.target.value }))}
                          className="w-full border border-slate-200 rounded-xl p-2 text-xs font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Modalidade</label>
                        <select
                          value={estForm.modality}
                          onChange={e => setEstForm(prev => ({ ...prev, modality: e.target.value as any }))}
                          className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium bg-slate-50"
                        >
                          <option value="presential">Presencial na Clínica</option>
                          <option value="online_meeting">Reunião Online (Google Meet / Zoom)</option>
                          <option value="phone">Ligação Telefônica</option>
                          <option value="whatsapp">Contato via WhatsApp</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Responsável pela Visita</label>
                        <input
                          type="text"
                          value={estForm.responsibleName}
                          onChange={e => setEstForm(prev => ({ ...prev, responsibleName: e.target.value }))}
                          placeholder="Nome do consultor / SuperAdmin"
                          className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1">Resumo da Conversa & Necessidades</label>
                        <textarea
                          rows={2}
                          value={estForm.notes}
                          onChange={e => setEstForm(prev => ({ ...prev, notes: e.target.value }))}
                          placeholder="O que foi conversado, interesse demonstrado, módulos apresentados..."
                          className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Próxima Ação de Acompanhamento</label>
                        <input
                          type="text"
                          value={estForm.nextAction}
                          onChange={e => setEstForm(prev => ({ ...prev, nextAction: e.target.value }))}
                          placeholder="Ex: Enviar proposta, Ligar após teste..."
                          className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Data Prevista para Retorno</label>
                        <input
                          type="date"
                          value={estForm.nextReturnDate}
                          onChange={e => setEstForm(prev => ({ ...prev, nextReturnDate: e.target.value }))}
                          className="w-full border border-slate-200 rounded-xl p-2 text-xs font-medium"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEst}
                  className="px-6 py-2 bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {savingEst ? 'Salvando...' : 'Salvar Estabelecimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADICIONAR VISITA A ESTABELECIMENTO EXISTENTE */}
      {showAddVisitModal && selectedEstablishmentForVisit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xs z-10">
              <div>
                <h3 className="text-base font-bold text-slate-900">Registrar Nova Visita / Interação</h3>
                <p className="text-xs text-slate-500 font-semibold text-teal-700">
                  {selectedEstablishmentForVisit.name} ({selectedEstablishmentForVisit.city || 'Sem cidade'})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddVisitModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddVisit} className="p-5 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Data da Visita <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={visitForm.visitDate}
                    onChange={e => setVisitForm(prev => ({ ...prev, visitDate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Modalidade</label>
                  <select
                    value={visitForm.modality}
                    onChange={e => setVisitForm(prev => ({ ...prev, modality: e.target.value as any }))}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium bg-slate-50"
                  >
                    <option value="presential">Presencial na Clínica</option>
                    <option value="online_meeting">Reunião Online</option>
                    <option value="phone">Ligação Telefônica</option>
                    <option value="whatsapp">Contato via WhatsApp</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Responsável pela Visita</label>
                  <input
                    type="text"
                    value={visitForm.responsibleName}
                    onChange={e => setVisitForm(prev => ({ ...prev, responsibleName: e.target.value }))}
                    placeholder="Nome do consultor"
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Novo Status Comercial</label>
                  <select
                    value={visitForm.statusAfterVisit}
                    onChange={e => setVisitForm(prev => ({ ...prev, statusAfterVisit: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium bg-slate-50"
                  >
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Objetivo da Visita</label>
                <input
                  type="text"
                  value={visitForm.objective}
                  onChange={e => setVisitForm(prev => ({ ...prev, objective: e.target.value }))}
                  placeholder="Ex: Apresentar prontuário eletrônico e agendamento online..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Resumo da Conversa & Objeções</label>
                <textarea
                  rows={3}
                  value={visitForm.notes}
                  onChange={e => setVisitForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Pontos abordados, dúvidas levantadas, reação dos gestores, detalhes da negociação..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Próxima Ação</label>
                  <input
                    type="text"
                    value={visitForm.nextAction}
                    onChange={e => setVisitForm(prev => ({ ...prev, nextAction: e.target.value }))}
                    placeholder="Ex: Ligar para confirmar proposta..."
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Data Prevista de Retorno</label>
                  <input
                    type="date"
                    value={visitForm.nextReturnDate}
                    onChange={e => setVisitForm(prev => ({ ...prev, nextReturnDate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddVisitModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingVisit}
                  className="px-6 py-2 bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {savingVisit ? 'Salvando...' : 'Registrar Visita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: LINHA DO TEMPO & HISTÓRICO COMPLETO */}
      {showTimelineModal && timelineEstablishment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-xs z-10">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  Histórico de Visitas & Contatos
                </h3>
                <p className="text-xs text-slate-500 font-semibold text-teal-700">
                  {timelineEstablishment.name} {timelineEstablishment.city ? `• ${timelineEstablishment.city}/${timelineEstablishment.state}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTimelineModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="text-xs text-slate-600">
                  <span className="font-bold text-slate-800">Status atual:</span>{' '}
                  <span className="font-semibold text-teal-700">
                    {STATUS_CONFIG[timelineEstablishment.current_status]?.label || timelineEstablishment.current_status}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEstablishmentForVisit(timelineEstablishment);
                    setVisitForm(prev => ({ ...prev, statusAfterVisit: timelineEstablishment.current_status }));
                    setShowAddVisitModal(true);
                  }}
                  className="px-3 py-1.5 bg-teal-600 text-white rounded-xl text-xs font-bold hover:bg-teal-700 cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Visita
                </button>
              </div>

              {timelineLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-teal-600" />
                  <p className="text-xs font-semibold">Carregando histórico...</p>
                </div>
              ) : timelineVisits.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-bold text-slate-600">Nenhuma visita detalhada registrada</p>
                  <p className="text-[11px] text-slate-400">Clique em "Adicionar Visita" para registrar uma interação.</p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {timelineVisits.map(v => (
                    <div key={v.id} className="relative space-y-1.5">
                      <div className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full bg-teal-600 ring-4 ring-white" />
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black text-slate-900 flex items-center gap-1.5">
                          {formatDateBr(v.visit_date)} {v.visit_time ? `às ${v.visit_time}` : ''}
                          <span className="text-[10px] font-semibold text-slate-500 uppercase px-1.5 py-0.5 rounded bg-slate-100">
                            {v.modality}
                          </span>
                        </span>
                        <span className="text-[10px] font-bold text-slate-600 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                          {STATUS_CONFIG[v.status_after_visit]?.label || v.status_after_visit}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 font-medium">
                        <span className="font-semibold text-slate-700">Responsável:</span> {v.responsible_name}
                      </div>

                      {v.objective && (
                        <div className="text-xs text-slate-600">
                          <span className="font-semibold text-slate-700">Objetivo:</span> {v.objective}
                        </div>
                      )}

                      {v.notes && (
                        <div className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-slate-700">
                          {v.notes}
                        </div>
                      )}

                      {(v.next_action || v.next_return_date) && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 pt-0.5">
                          <span className="font-bold text-teal-700">Próxima Ação:</span> {v.next_action || 'Retorno agendado'}
                          {v.next_return_date && <span>({formatDateBr(v.next_return_date)})</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: VINCULAR À CLÍNICA EXISTENTE NO ZEMDA */}
      {showLinkTenantModal && establishmentToLink && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Vincular à Conta do Zemda</h3>
                <p className="text-xs text-slate-500">{establishmentToLink.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkTenantModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              O vínculo conecta este histórico comercial ao cadastro real da clínica no Zemda para fins de acompanhamento comercial, <strong>sem alterar planos, acessos, dados clínicos ou pacientes</strong>.
            </p>

            {establishmentToLink.tenant_id && (
              <div className="bg-teal-50 p-3 rounded-2xl border border-teal-100 flex items-center justify-between text-xs text-teal-800">
                <div>
                  <span className="font-bold">Atualmente vinculada a:</span> {establishmentToLink.linked_tenant_name || establishmentToLink.tenant_id}
                </div>
                <button
                  type="button"
                  onClick={() => handleLinkTenant(null)}
                  className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Desvincular
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pesquisar Clínica Ativa ou em Teste</label>
              <input
                type="text"
                value={tenantSearchQuery}
                onChange={e => handleSearchTenants(e.target.value)}
                placeholder="Digite o nome da clínica ou CNPJ..."
                className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
              />
            </div>

            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-2xl">
              {searchingTenants ? (
                <div className="p-4 text-center text-xs text-slate-400">Buscando clínicas no Zemda...</div>
              ) : tenantSearchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  {tenantSearchQuery.length >= 2 ? 'Nenhuma clínica correspondente encontrada' : 'Digite ao menos 2 caracteres para buscar'}
                </div>
              ) : (
                tenantSearchResults.map(t => (
                  <div key={t.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <div className="font-bold text-xs text-slate-900">{t.name}</div>
                      <div className="text-[10px] text-slate-400">{t.city} / {t.state} • {t.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLinkTenant(t.id)}
                      className="px-3 py-1.5 bg-teal-600 text-white rounded-xl text-xs font-bold hover:bg-teal-700 cursor-pointer"
                    >
                      Selecionar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SuperAdminVisitsView;
