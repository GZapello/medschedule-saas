import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Filter,
  Star,
  Copy,
  Printer,
  Download,
  Plus,
  X,
  Check,
  Sparkles,
  BookOpen,
  School,
  Home,
  Clock,
  AlertCircle,
  Eye,
  Edit3,
  Trash2,
  FileText,
  ChevronRight,
  Layers,
  History,
  User,
  Tag,
  Share2,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { ApiClient, buildApiUrl, getApiBaseUrl } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { downloadBlob } from '../../utils/download';
import { isNativePrint, printNativeHtml, currentPrintHtml } from '../../utils/nativePrint';
import { ClinicDocumentHeader, ClinicDocumentFooter, useClinicDocumentData } from './ClinicDocumentHeader';
import {
  ProfessionKey,
  ActivitySetting,
  ActivityStatus,
  ActivityTemplateItem,
  PatientActivityAssignmentItem,
  ActivityFollowUpItem,
  getProfessionLibraryConfig,
  SETTING_LABELS,
  STATUS_LABELS,
  STATUS_BADGE_CLASSES
} from './professionalActivityLibrary.config';

export interface ProfessionalActivityLibraryProps {
  profession: ProfessionKey | string;
  patientId: string;
  patientName?: string;
  readOnly?: boolean;
  initialView?: 'patient' | 'library';
}

export const ProfessionalActivityLibrary: React.FC<ProfessionalActivityLibraryProps> = ({
  profession,
  patientId,
  patientName: propPatientName,
  readOnly = false,
  initialView = 'patient'
}) => {
  const config = useMemo(() => getProfessionLibraryConfig(profession), [profession]);
  const { currentTenant, currentUser } = useAuth();
  const { showToast } = useToast();
  const clinicDocData = useClinicDocumentData();

  // Navegação principal: Atividades do Paciente vs Biblioteca de Modelos
  const [activeMainView, setActiveMainView] = useState<'patient' | 'library'>(initialView);

  // Estados do Paciente
  const [patientActivities, setPatientActivities] = useState<PatientActivityAssignmentItem[]>([]);
  const [patientName, setPatientName] = useState<string>(propPatientName || '');
  const [isLoadingPatientActivities, setIsLoadingPatientActivities] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'paused'>('all');
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<Set<string>>(new Set());

  // Estados da Biblioteca
  const [templates, setTemplates] = useState<ActivityTemplateItem[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [libraryScope, setLibraryScope] = useState<'all' | 'system' | 'custom' | 'favorites'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all');
  const [selectedSetting, setSelectedSetting] = useState<string>('all');

  // Modais
  const [previewTemplate, setPreviewTemplate] = useState<ActivityTemplateItem | null>(null);
  const [assigningTemplate, setAssigningTemplate] = useState<ActivityTemplateItem | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ActivityTemplateItem | null>(null);
  const [isCreatingCustomTemplate, setIsCreatingCustomTemplate] = useState(false);
  const [followUpModalItem, setFollowUpModalItem] = useState<PatientActivityAssignmentItem | null>(null);
  const [followUpHistory, setFollowUpHistory] = useState<ActivityFollowUpItem[]>([]);
  const [isLoadingFollowUpHistory, setIsLoadingFollowUpHistory] = useState(false);
  const [printPreviewItem, setPrintPreviewItem] = useState<PatientActivityAssignmentItem | null>(null);

  // Estados do Formulário de Atribuição / Personalização
  const [assignTitle, setAssignTitle] = useState('');
  const [assignObjective, setAssignObjective] = useState('');
  const [assignInstructions, setAssignInstructions] = useState('');
  const [assignSetting, setAssignSetting] = useState<ActivitySetting>('home');
  const [assignFrequency, setAssignFrequency] = useState('');
  const [assignMaterials, setAssignMaterials] = useState('');
  const [assignResponsible, setAssignResponsible] = useState('');
  const [assignCaregiverGuidance, setAssignCaregiverGuidance] = useState('');
  const [assignAdaptations, setAssignAdaptations] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [assignSaveToLibrary, setAssignSaveToLibrary] = useState(false);
  const [isSubmittingAssignment, setIsSubmittingAssignment] = useState(false);

  // Estados do Formulário de Acompanhamento (Status + Observações)
  const [newStatus, setNewStatus] = useState<ActivityStatus>('active');
  const [followUpNotesInput, setFollowUpNotesInput] = useState('');
  const [isSavingFollowUp, setIsSavingFollowUp] = useState(false);

  // Estados de Exportação PDF
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [isExportingConsolidated, setIsExportingConsolidated] = useState(false);

  // ==========================================
  // CARREGAMENTO DE DADOS
  // ==========================================

  const loadPatientActivities = async () => {
    if (!patientId) return;
    try {
      setIsLoadingPatientActivities(true);
      const res = await ApiClient.get<PatientActivityAssignmentItem[]>(
        `/v1/clinical-activities/patient/${patientId}?module_type=${config.key}`
      );
      if (Array.isArray(res)) {
        setPatientActivities(res);
        const nameFromItem = res.find(i => i.patient_name)?.patient_name;
        if (nameFromItem && !patientName) {
          setPatientName(nameFromItem);
        }
      }
    } catch (err) {
      console.error('[ProfessionalActivityLibrary] Erro ao carregar atividades do paciente:', err);
    } finally {
      setIsLoadingPatientActivities(false);
    }
  };

  const loadTemplates = async () => {
    try {
      setIsLoadingTemplates(true);
      const queryParams = new URLSearchParams({
        module_type: config.key,
        scope: libraryScope
      });
      if (selectedCategory !== 'all') queryParams.set('category', selectedCategory);
      if (selectedSubcategory !== 'all') queryParams.set('subcategory', selectedSubcategory);
      if (selectedSetting !== 'all') queryParams.set('setting', selectedSetting);
      if (searchQuery.trim()) queryParams.set('search', searchQuery.trim());

      const res = await ApiClient.get<ActivityTemplateItem[]>(
        `/v1/clinical-activities/templates?${queryParams.toString()}`
      );
      if (Array.isArray(res)) {
        setTemplates(res);
      }
    } catch (err) {
      console.error('[ProfessionalActivityLibrary] Erro ao carregar modelos:', err);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  useEffect(() => {
    loadPatientActivities();
    if (patientId && !patientName) {
      ApiClient.get<any>(`/v1/patients/${patientId}`)
        .then(res => {
          const p = res?.patient || res;
          if (p?.full_name) setPatientName(p.full_name);
        })
        .catch(() => {});
    }
  }, [patientId, config.key]);

  useEffect(() => {
    loadTemplates();
  }, [config.key, libraryScope, selectedCategory, selectedSubcategory, selectedSetting]);

  // Busca rápida com debounce no campo de busca
  useEffect(() => {
    const timer = setTimeout(() => {
      loadTemplates();
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ==========================================
  // FILTRAGEM DAS ATIVIDADES DO PACIENTE
  // ==========================================

  const filteredPatientActivities = useMemo(() => {
    return patientActivities.filter(item => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'active') return item.status === 'active' || item.status === 'pending';
      if (statusFilter === 'completed') return item.status === 'completed' || item.status === 'partially_completed';
      if (statusFilter === 'paused') return item.status === 'paused' || item.status === 'revised';
      return true;
    });
  }, [patientActivities, statusFilter]);

  // Categorias disponíveis na biblioteca atual
  const availableSubcategories = useMemo(() => {
    if (selectedCategory === 'all') return [];
    const cat = config.categories.find(c => c.name === selectedCategory);
    return cat ? cat.subcategories : [];
  }, [selectedCategory, config.categories]);

  // ==========================================
  // AÇÕES: ATRIBUIR ATIVIDADE AO PACIENTE
  // ==========================================

  const handleOpenAssignModal = (template: ActivityTemplateItem) => {
    setAssigningTemplate(template);
    setAssignTitle(template.title);
    setAssignObjective(template.objective);
    setAssignInstructions(template.instructions);
    setAssignSetting(template.setting || 'home');
    setAssignFrequency(template.frequency || config.defaultFrequency);
    setAssignMaterials(template.materials_needed || '');
    setAssignCaregiverGuidance(template.caregiver_guidance || '');
    setAssignAdaptations(template.adaptations || '');
    setAssignNotes(template.notes || '');
    setAssignResponsible(template.setting === 'school' ? 'Professor / Mediador' : 'Responsável legal');
    setAssignSaveToLibrary(false);
  };

  const handleOpenNewBlankActivityModal = () => {
    setAssigningTemplate(null);
    setAssignTitle('');
    setAssignObjective('');
    setAssignInstructions('');
    setAssignSetting('home');
    setAssignFrequency(config.defaultFrequency);
    setAssignMaterials('');
    setAssignCaregiverGuidance('');
    setAssignAdaptations('');
    setAssignNotes('');
    setAssignResponsible('Família / Responsável');
    setAssignSaveToLibrary(false);
    setIsCreatingCustomTemplate(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingAssignment) return;

    if (!patientId) {
      showToast('Selecione um paciente antes de atribuir a atividade.', 'info');
      return;
    }

    const trimmedTitle = assignTitle.trim();
    const trimmedInstructions = assignInstructions.trim();

    if (!trimmedTitle || !trimmedInstructions) {
      showToast('Preencha pelo menos o título e as orientações da atividade.', 'error');
      return;
    }

    try {
      setIsSubmittingAssignment(true);
      await ApiClient.post(`/v1/clinical-activities/patient/${patientId}/assign`, {
        profession_id: config.key,
        module_type: config.key,
        template_id: assigningTemplate?.id || null,
        title: trimmedTitle,
        objective: assignObjective.trim() || trimmedTitle,
        instructions: trimmedInstructions,
        materials_needed: assignMaterials.trim() || null,
        frequency: assignFrequency.trim() || null,
        setting: assignSetting,
        responsible_person: assignResponsible.trim() || null,
        category: assigningTemplate?.category || 'Geral',
        subcategory: assigningTemplate?.subcategory || null,
        target_skill: assigningTemplate?.target_skill || null,
        caregiver_guidance: assignCaregiverGuidance.trim() || null,
        adaptations: assignAdaptations.trim() || null,
        notes: assignNotes.trim() || null,
        saveToMyLibrary: assignSaveToLibrary
      });

      showToast('Atividade atribuída ao paciente com sucesso!', 'success');
      setAssigningTemplate(null);
      setIsCreatingCustomTemplate(false);
      setActiveMainView('patient');
      await loadPatientActivities();
      if (assignSaveToLibrary) {
        await loadTemplates();
      }
    } catch (err: any) {
      console.error('[ProfessionalActivityLibrary] Erro ao atribuir atividade:', err);
      showToast(err?.message || 'Erro ao atribuir atividade. Verifique os dados.', 'error');
    } finally {
      setIsSubmittingAssignment(false);
    }
  };

  // ==========================================
  // AÇÕES: ACOMPANHAMENTO E STATUS
  // ==========================================

  const handleOpenFollowUpModal = async (item: PatientActivityAssignmentItem) => {
    setFollowUpModalItem(item);
    setNewStatus(item.status);
    setFollowUpNotesInput('');
    try {
      setIsLoadingFollowUpHistory(true);
      const res = await ApiClient.get<ActivityFollowUpItem[]>(
        `/v1/clinical-activities/assignments/${item.id}/follow-ups`
      );
      if (Array.isArray(res)) {
        setFollowUpHistory(res);
      }
    } catch {
      setFollowUpHistory([]);
    } finally {
      setIsLoadingFollowUpHistory(false);
    }
  };

  const handleSaveFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpModalItem || isSavingFollowUp) return;

    try {
      setIsSavingFollowUp(true);
      await ApiClient.patch(`/v1/clinical-activities/assignments/${followUpModalItem.id}/status`, {
        status: newStatus,
        followUpNotes: followUpNotesInput.trim() || undefined
      });

      showToast('Acompanhamento registrado com sucesso!', 'success');
      setFollowUpModalItem(null);
      await loadPatientActivities();
    } catch (err: any) {
      console.error('[ProfessionalActivityLibrary] Erro ao salvar acompanhamento:', err);
      showToast(err?.message || 'Erro ao atualizar acompanhamento.', 'error');
    } finally {
      setIsSavingFollowUp(false);
    }
  };

  // ==========================================
  // AÇÕES: MODELOS DA BIBLIOTECA (FAVORITAR, DUPLICAR, EXCLUIR)
  // ==========================================

  const handleToggleFavorite = async (templateId: string) => {
    try {
      const res = await ApiClient.post<{ is_favorite: boolean; message: string }>(
        `/v1/clinical-activities/templates/${templateId}/favorite`,
        {}
      );
      setTemplates(prev =>
        prev.map(t => (t.id === templateId ? { ...t, is_favorite: res.is_favorite } : t))
      );
      showToast(res.message || 'Favorito atualizado.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao favoritar modelo.', 'error');
    }
  };

  const handleDuplicateTemplate = async (templateId: string) => {
    try {
      const res = await ApiClient.post<{ id: string; message: string }>(
        `/v1/clinical-activities/templates/${templateId}/duplicate`,
        {}
      );
      showToast(res.message || 'Modelo duplicado na sua biblioteca!', 'success');
      setLibraryScope('custom');
      await loadTemplates();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao duplicar modelo.', 'error');
    }
  };

  const handleDeleteCustomTemplate = async (templateId: string) => {
    if (!window.confirm('Tem certeza que deseja remover este modelo da sua biblioteca?')) return;
    try {
      await ApiClient.delete(`/v1/clinical-activities/templates/${templateId}`);
      showToast('Modelo excluído da sua biblioteca.', 'success');
      setTemplates(prev => prev.filter(t => t.id !== templateId));
    } catch (err: any) {
      showToast(err?.message || 'Erro ao excluir modelo.', 'error');
    }
  };

  // ==========================================
  // AÇÕES: COMPARTILHAMENTO E DOCUMENTOS
  // ==========================================

  const copyToClipboard = (activity: PatientActivityAssignmentItem) => {
    const clinicName = currentTenant?.trade_name || currentTenant?.name;
    const lines: string[] = [
      `*${config.libraryTitle.toUpperCase()}*`,
      `*DESTINO: ${(SETTING_LABELS[activity.setting] || 'CASA / ESCOLA').toUpperCase()}*`
    ];
    if (clinicName) lines.push(`Clínica: ${clinicName}`);
    if (activity.patient_name || patientName) lines.push(`${config.patientNameLabel}: ${activity.patient_name || patientName}`);
    lines.push(`Título: ${activity.title}`);
    if (activity.objective) lines.push(`Objetivo: ${activity.objective}`);
    if (activity.frequency) lines.push(`Frequência sugerida: ${activity.frequency}`);
    if (activity.materials_needed) lines.push(`Materiais / adaptações: ${activity.materials_needed}`);
    lines.push('', 'Instruções e Orientações:', activity.instructions);
    if (activity.caregiver_guidance) {
      lines.push('', 'Dica ao cuidador / educador:', activity.caregiver_guidance);
    }
    lines.push('', `(Documento oficial emitido via ${config.moduleName} — Sistema Zemda)`);

    navigator.clipboard.writeText(lines.join('\n'));
    showToast('Orientações copiadas para a área de transferência!', 'success');
  };

  const handleDownloadSinglePdf = async (activity: PatientActivityAssignmentItem) => {
    if (downloadingPdfId === activity.id) return;
    try {
      setDownloadingPdfId(activity.id);
      const token = localStorage.getItem('auth_token');
      const tenantId = localStorage.getItem('active_tenant_id');
      const url = buildApiUrl(
        getApiBaseUrl(),
        `/v1/clinical-activities/assignments/${activity.id}/pdf`
      );
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (tenantId) headers['X-Tenant-ID'] = tenantId;

      const res = await fetch(url, { method: 'GET', headers });
      if (!res.ok) {
        throw new Error('Não foi possível gerar o PDF da atividade.');
      }
      const blob = await res.blob();
      const safeTitle = (activity.title || 'orientacao')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 36);
      await downloadBlob(blob, `orientacao-${config.key}-${safeTitle || activity.id}.pdf`);
      showToast('PDF individual salvo com sucesso!', 'success');
    } catch (err: any) {
      console.error('[ProfessionalActivityLibrary] Erro ao baixar PDF:', err);
      showToast(err?.message || 'Erro ao gerar PDF individual.', 'error');
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const handleExportConsolidatedPdf = async (selectedOnly = false) => {
    if (!patientId) {
      showToast('Selecione um paciente para exportar.', 'error');
      return;
    }
    if (isExportingConsolidated) return;

    const assignmentIds = selectedOnly
      ? Array.from(selectedAssignmentIds)
      : undefined;

    if (selectedOnly && (!assignmentIds || assignmentIds.length === 0)) {
      showToast('Selecione ao menos uma atividade na lista para exportar.', 'info');
      return;
    }

    try {
      setIsExportingConsolidated(true);
      const token = localStorage.getItem('auth_token');
      const tenantId = localStorage.getItem('active_tenant_id');
      const url = buildApiUrl(
        getApiBaseUrl(),
        `/v1/clinical-activities/patient/${patientId}/export-pdf?module_type=${config.key}`
      );
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (tenantId) headers['X-Tenant-ID'] = tenantId;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ assignmentIds })
      });

      if (!res.ok) {
        let errMsg = 'Não foi possível gerar o PDF consolidado.';
        try {
          const errData = await res.json();
          if (errData?.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const blob = await res.blob();
      const safePatientName = (patientName || 'paciente')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
      await downloadBlob(blob, `orientacoes-${config.key}-${safePatientName}.pdf`);
      showToast('PDF consolidado salvo com sucesso!', 'success');
    } catch (err: any) {
      console.error('[ProfessionalActivityLibrary] Erro ao exportar PDF consolidado:', err);
      showToast(err?.message || 'Erro ao gerar PDF consolidado.', 'error');
    } finally {
      setIsExportingConsolidated(false);
    }
  };

  const triggerPrintDocument = (docTitle?: string) => {
    if (isNativePrint()) {
      void printNativeHtml(currentPrintHtml(), docTitle || 'Orientação Terapêutica');
    } else {
      window.print();
    }
  };

  const toggleSelectAssignment = (id: string) => {
    setSelectedAssignmentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedAssignmentIds.size === filteredPatientActivities.length) {
      setSelectedAssignmentIds(new Set());
    } else {
      setSelectedAssignmentIds(new Set(filteredPatientActivities.map(a => a.id)));
    }
  };

  return (
    <div className="space-y-6">
      {/* CABEÇALHO DO MÓDULO */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className={`rounded-xl p-3 bg-${config.brandColor}-500/10 text-${config.brandColor}-600`}>
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-800">
                  {config.libraryTitle}
                </h2>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.badgeClass}`}>
                  {config.moduleName}
                </span>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-slate-500">
                {config.librarySubtitle}
              </p>
            </div>
          </div>

          {/* Seletor de Visão Principal: Atividades do Paciente vs Biblioteca */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveMainView('patient')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                activeMainView === 'patient'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>{config.patientNameLabel} ({patientActivities.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMainView('library')}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                activeMainView === 'library'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Biblioteca de Modelos</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VISÃO 1: ATIVIDADES ATRIBUÍDAS AO PACIENTE ATUAL */}
      {/* ========================================================================= */}
      {activeMainView === 'patient' && (
        <div className="space-y-4">
          {/* Barra de Ferramentas do Paciente */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Filtrar status:</span>
              {[
                { id: 'all', label: 'Todas' },
                { id: 'active', label: 'Em Andamento' },
                { id: 'completed', label: 'Concluídas' },
                { id: 'paused', label: 'Pausadas' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id as any)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                    statusFilter === f.id
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedAssignmentIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => handleExportConsolidatedPdf(true)}
                  disabled={isExportingConsolidated}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                  title="Exportar apenas as atividades marcadas com caixa de seleção"
                >
                  <Download className="h-3.5 w-3.5 text-teal-600" />
                  <span>PDF Selecionadas ({selectedAssignmentIds.size})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleExportConsolidatedPdf(false)}
                disabled={isExportingConsolidated || patientActivities.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                title="Exportar todas as atividades ativas consolidadas"
              >
                <Download className="h-3.5 w-3.5 text-slate-600" />
                <span>PDF Consolidado</span>
              </button>

              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveMainView('library')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-xs hover:bg-teal-700 transition cursor-pointer"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Escolher da Biblioteca</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenNewBlankActivityModal}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Criar Atividade Livre</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Lista de Atividades do Paciente */}
          {isLoadingPatientActivities ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="h-6 w-6 animate-spin text-teal-600 mb-2" />
              <p className="text-xs text-slate-500">Carregando atividades de {patientName || 'paciente'}...</p>
            </div>
          ) : filteredPatientActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-dashed border-slate-300 text-center">
              <div className="rounded-full bg-slate-100 p-3 mb-3 text-slate-400">
                <FolderOpen className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-700">Nenhuma atividade registrada neste módulo</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                Explore a biblioteca para selecionar modelos profissionais estruturados ou cadastre uma nova orientação individualizada para este {config.patientNameLabel.toLowerCase()}.
              </p>
              {!readOnly && (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveMainView('library')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 cursor-pointer"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Explorar Biblioteca de Modelos
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1 text-xs text-slate-500">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={
                      selectedAssignmentIds.size === filteredPatientActivities.length &&
                      filteredPatientActivities.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded accent-teal-600"
                  />
                  <span>Selecionar todas ({filteredPatientActivities.length})</span>
                </label>
                <span>{filteredPatientActivities.length} atividade(s) encontrada(s)</span>
              </div>

              {filteredPatientActivities.map(item => {
                const isSelected = selectedAssignmentIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border bg-white p-5 shadow-xs transition ${
                      isSelected ? 'border-teal-400 bg-teal-50/20' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectAssignment(item.id)}
                          className="mt-1 h-4 w-4 rounded accent-teal-600 cursor-pointer"
                        />
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm sm:text-base font-extrabold text-slate-800">
                              {item.title}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                STATUS_BADGE_CLASSES[item.status] || 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {STATUS_LABELS[item.status] || item.status}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                              {SETTING_LABELS[item.setting] || item.setting}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            {item.category && <span>Área: <strong className="text-slate-700">{item.category}</strong></span>}
                            {item.frequency && <span>Freq: <strong className="text-slate-700">{item.frequency}</strong></span>}
                            {item.professional_name && (
                              <span>Profissional: <strong className="text-slate-700">{item.professional_name}</strong></span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Botões de Ação na Atividade */}
                      <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-start">
                        <button
                          type="button"
                          onClick={() => handleOpenFollowUpModal(item)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="Registrar acompanhamento, evolução e alterar status"
                        >
                          <History className="h-3.5 w-3.5 text-slate-500" />
                          <span>Acompanhar ({item.follow_ups_count || 1})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => copyToClipboard(item)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="Copiar texto formatado para WhatsApp ou e-mail"
                        >
                          <Copy className="h-3.5 w-3.5 text-slate-500" />
                          <span className="hidden sm:inline">Copiar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadSinglePdf(item)}
                          disabled={downloadingPdfId === item.id}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                          title="Baixar PDF individual com identificação da clínica"
                        >
                          <Download className="h-3.5 w-3.5 text-slate-500" />
                          <span className="hidden sm:inline">PDF</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setPrintPreviewItem(item);
                            setTimeout(() => triggerPrintDocument(item.title), 150);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="Imprimir documento"
                        >
                          <Printer className="h-3.5 w-3.5 text-slate-500" />
                        </button>
                      </div>
                    </div>

                    {/* Detalhes da Atividade */}
                    <div className="mt-3.5 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-700 sm:grid-cols-2">
                      <div>
                        <span className="font-bold text-slate-800 block mb-0.5">Objetivo Terapêutico:</span>
                        <p className="text-slate-600 line-clamp-2">{item.objective || 'Não especificado.'}</p>
                      </div>
                      <div>
                        <span className="font-bold text-slate-800 block mb-0.5">Orientações Resumidas:</span>
                        <p className="text-slate-600 line-clamp-2">{item.instructions}</p>
                      </div>
                    </div>

                    {/* Último Registro de Acompanhamento */}
                    {item.last_follow_up_note && (
                      <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-teal-50/60 border border-teal-100 p-2.5 text-xs text-teal-900">
                        <History className="h-3.5 w-3.5 mt-0.5 text-teal-600 shrink-0" />
                        <div>
                          <span className="font-bold">Último Acompanhamento: </span>
                          <span>{item.last_follow_up_note}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISÃO 2: BIBLIOTECA DE MODELOS DA PROFISSÃO */}
      {/* ========================================================================= */}
      {activeMainView === 'library' && (
        <div className="space-y-5">
          {/* Subabas da Biblioteca: Biblioteca Zemda vs Minha Biblioteca vs Favoritos */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'Todos os Modelos' },
                { id: 'system', label: `Biblioteca Zemda (${config.professionName})` },
                { id: 'custom', label: 'Minha Biblioteca (Criados na Clínica)' },
                { id: 'favorites', label: 'Favoritos' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLibraryScope(tab.id as any)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    libraryScope === tab.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {!readOnly && (
              <button
                type="button"
                onClick={handleOpenNewBlankActivityModal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-xs hover:bg-teal-700 transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Cadastrar Novo Modelo</span>
              </button>
            )}
          </div>

          {/* Barra de Pesquisa e Filtros */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs md:grid-cols-12">
            <div className="relative md:col-span-6">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Pesquisar por título, objetivo, habilidade ou instruções..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="md:col-span-3">
              <select
                value={selectedCategory}
                onChange={e => {
                  setSelectedCategory(e.target.value);
                  setSelectedSubcategory('all');
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-teal-500 focus:bg-white focus:outline-none cursor-pointer"
              >
                <option value="all">Todas as Categorias</option>
                {config.categories.map(c => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <select
                value={selectedSetting}
                onChange={e => setSelectedSetting(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-teal-500 focus:bg-white focus:outline-none cursor-pointer"
              >
                <option value="all">Todos os Ambientes</option>
                <option value="home">Casa / Família</option>
                <option value="school">Escola / Educadores</option>
                <option value="community">Comunidade / Lazer</option>
                <option value="other">Outro Ambiente</option>
                <option value="general">Geral</option>
              </select>
            </div>
          </div>

          {/* Subcategorias quando categoria específica está selecionada */}
          {availableSubcategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-1">
              <span className="text-[11px] font-bold text-slate-500 mr-1">Subcategoria:</span>
              <button
                type="button"
                onClick={() => setSelectedSubcategory('all')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                  selectedSubcategory === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Todas
              </button>
              {availableSubcategories.map(sub => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSelectedSubcategory(sub)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                    selectedSubcategory === sub
                      ? 'bg-teal-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}

          {/* Grade de Modelos */}
          {isLoadingTemplates ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="h-6 w-6 animate-spin text-teal-600 mb-2" />
              <p className="text-xs text-slate-500">Carregando modelos da biblioteca...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-dashed border-slate-300 text-center">
              <div className="rounded-full bg-slate-100 p-3 mb-3 text-slate-400">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-700">Nenhum modelo encontrado</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                Tente ajustar os filtros de busca ou cadastre uma nova atividade na sua biblioteca.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map(tmpl => (
                <div
                  key={tmpl.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {tmpl.category}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleFavorite(tmpl.id)}
                          className={`p-1 rounded-lg transition cursor-pointer ${
                            tmpl.is_favorite
                              ? 'text-amber-500 hover:text-amber-600'
                              : 'text-slate-300 hover:text-slate-500'
                          }`}
                          title={tmpl.is_favorite ? 'Remover dos favoritos' : 'Favoritar este modelo'}
                        >
                          <Star className="h-4 w-4 fill-current" />
                        </button>
                      </div>
                    </div>

                    <h3 className="text-sm font-extrabold text-slate-800 leading-snug line-clamp-2">
                      {tmpl.title}
                    </h3>

                    <p className="text-xs text-slate-600 line-clamp-3">
                      {tmpl.objective}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {tmpl.setting === 'school' ? (
                          <School className="h-3 w-3 text-slate-500" />
                        ) : (
                          <Home className="h-3 w-3 text-slate-500" />
                        )}
                        <span>{SETTING_LABELS[tmpl.setting] || tmpl.setting}</span>
                      </span>

                      {tmpl.is_system ? (
                        <span className="inline-flex items-center rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">
                          Zemda Oficial
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
                          Minha Clínica
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações do Card */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewTemplate(tmpl)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Detalhes</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDuplicateTemplate(tmpl.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                        title="Duplicar como modelo próprio na minha clínica"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>

                      {tmpl.is_custom && !readOnly && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomTemplate(tmpl.id)}
                          className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                          title="Excluir este modelo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => handleOpenAssignModal(tmpl)}
                          className="inline-flex items-center gap-1 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 transition cursor-pointer"
                        >
                          <span>Usar atividade</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: VISUALIZAÇÃO COMPLETA DE DETALHES DO MODELO */}
      {/* ========================================================================= */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-600 mb-1.5">
                  {previewTemplate.category} {previewTemplate.subcategory ? `• ${previewTemplate.subcategory}` : ''}
                </span>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {previewTemplate.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div>
                <strong className="text-slate-900 block mb-0.5">Objetivo Terapêutico:</strong>
                <p className="text-slate-600">{previewTemplate.objective}</p>
              </div>

              {previewTemplate.target_skill && (
                <div>
                  <strong className="text-slate-900 block mb-0.5">Habilidade Trabalhada:</strong>
                  <p className="text-slate-600">{previewTemplate.target_skill}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                <div>
                  <span className="text-slate-500 font-semibold block">Ambiente Sugerido:</span>
                  <span className="font-bold text-slate-800">{SETTING_LABELS[previewTemplate.setting] || previewTemplate.setting}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block">Frequência Sugerida:</span>
                  <span className="font-bold text-slate-800">{previewTemplate.frequency || config.defaultFrequency}</span>
                </div>
              </div>

              {previewTemplate.materials_needed && (
                <div>
                  <strong className="text-slate-900 block mb-0.5">Materiais Necessários:</strong>
                  <p className="text-slate-600">{previewTemplate.materials_needed}</p>
                </div>
              )}

              <div>
                <strong className="text-slate-900 block mb-1">Instruções Passo a Passo:</strong>
                <div className="whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 leading-relaxed text-slate-800">
                  {previewTemplate.instructions}
                </div>
              </div>

              {previewTemplate.caregiver_guidance && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-amber-900">
                  <strong className="block mb-0.5 text-amber-950 font-bold">Orientações ao Responsável / Educador:</strong>
                  <p>{previewTemplate.caregiver_guidance}</p>
                </div>
              )}

              {previewTemplate.adaptations && (
                <div>
                  <strong className="text-slate-900 block mb-0.5">Possibilidades de Adaptação:</strong>
                  <p className="text-slate-600">{previewTemplate.adaptations}</p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleDuplicateTemplate(previewTemplate.id)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Copy className="h-4 w-4" />
                <span>Duplicar como meu modelo</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewTemplate(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Fechar
                </button>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      const t = previewTemplate;
                      setPreviewTemplate(null);
                      handleOpenAssignModal(t);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 cursor-pointer"
                  >
                    <span>Personalizar e Atribuir</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: PERSONALIZAR E ATRIBUIR ATIVIDADE AO PACIENTE */}
      {/* ========================================================================= */}
      {(assigningTemplate || isCreatingCustomTemplate) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                  {assigningTemplate ? 'Personalizar e Atribuir Atividade' : 'Criar Nova Atividade e Prescrever'}
                </h3>
                <p className="text-xs text-slate-500">
                  {config.patientNameLabel}: <strong className="text-slate-800">{patientName || 'Não identificado'}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAssigningTemplate(null);
                  setIsCreatingCustomTemplate(false);
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">Título da Atividade *</label>
                <input
                  type="text"
                  required
                  value={assignTitle}
                  onChange={e => setAssignTitle(e.target.value)}
                  placeholder="Ex: Treino de abotoamento na rotina matinal"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Ambiente de Execução *</label>
                  <select
                    value={assignSetting}
                    onChange={e => setAssignSetting(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-teal-500 focus:outline-none cursor-pointer"
                  >
                    <option value="home">Casa / Família</option>
                    <option value="school">Escola / Educadores</option>
                    <option value="community">Comunidade / Lazer</option>
                    <option value="other">Outro Ambiente</option>
                    <option value="general">Geral (Todos os Ambientes)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Frequência Sugerida</label>
                  <input
                    type="text"
                    value={assignFrequency}
                    onChange={e => setAssignFrequency(e.target.value)}
                    placeholder="Ex: Diário ao acordar (15 minutos)"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Objetivo Terapêutico</label>
                <input
                  type="text"
                  value={assignObjective}
                  onChange={e => setAssignObjective(e.target.value)}
                  placeholder="Objetivo clínico claro para o paciente e família..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Materiais ou Recursos Necessários</label>
                <input
                  type="text"
                  value={assignMaterials}
                  onChange={e => setAssignMaterials(e.target.value)}
                  placeholder="Ex: Livro ilustrado, massinha macia, quadro de rotina..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Instruções Passo a Passo para Execução *</label>
                <textarea
                  required
                  rows={4}
                  value={assignInstructions}
                  onChange={e => setAssignInstructions(e.target.value)}
                  placeholder="Descreva detalhadamente como a família ou professor deve aplicar o estímulo..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-800 leading-relaxed focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Orientações ao Cuidador ou Educador (Dicas práticas)</label>
                <textarea
                  rows={2}
                  value={assignCaregiverGuidance}
                  onChange={e => setAssignCaregiverGuidance(e.target.value)}
                  placeholder="Dicas sobre como intervir, quando dar tempo de resposta e como elogiar..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-800 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={assignSaveToLibrary}
                    onChange={e => setAssignSaveToLibrary(e.target.checked)}
                    className="h-4 w-4 rounded accent-teal-600"
                  />
                  <span>Salvar também na Minha Biblioteca para reutilizar depois</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAssigningTemplate(null);
                      setIsCreatingCustomTemplate(false);
                    }}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingAssignment}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-teal-700 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    <span>{isSubmittingAssignment ? 'Salvando...' : 'Salvar e Atribuir'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: REGISTRO DE ACOMPANHAMENTO E EVOLUÇÃO */}
      {/* ========================================================================= */}
      {followUpModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Acompanhamento da Atividade
                </h3>
                <p className="text-xs text-slate-600 font-semibold">{followUpModalItem.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setFollowUpModalItem(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFollowUp} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">Status Atual da Atividade</label>
                <select
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-teal-500 focus:outline-none cursor-pointer"
                >
                  <option value="active">Em Andamento</option>
                  <option value="completed">Realizada / Concluída com Sucesso</option>
                  <option value="partially_completed">Parcialmente Realizada</option>
                  <option value="paused">Suspensa / Pausada Temporariamente</option>
                  <option value="revised">Revisada / Em Adaptação</option>
                  <option value="not_completed">Não Realizada pela Família / Escola</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Observações do Acompanhamento (Evolução, dificuldades, adaptações)
                </label>
                <textarea
                  rows={3}
                  value={followUpNotesInput}
                  onChange={e => setFollowUpNotesInput(e.target.value)}
                  placeholder="Ex: Família relata melhora na cooperação; houve dificuldade inicial que foi superada com pistas visuais..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-800 focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setFollowUpModalItem(null)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingFollowUp}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-teal-700 cursor-pointer disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  <span>{isSavingFollowUp ? 'Gravando...' : 'Salvar Acompanhamento'}</span>
                </button>
              </div>
            </form>

            {/* Histórico Anterior de Registros */}
            <div className="border-t border-slate-100 pt-3">
              <span className="font-extrabold text-slate-800 text-xs block mb-2">Histórico de Registros:</span>
              {isLoadingFollowUpHistory ? (
                <p className="text-xs text-slate-400">Carregando histórico...</p>
              ) : followUpHistory.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhum registro anterior de acompanhamento.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {followUpHistory.map((fu, idx) => (
                    <div key={fu.id || idx} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-bold text-slate-800">
                          {STATUS_LABELS[fu.status] || fu.status}
                        </span>
                        <span className="text-slate-400">
                          {new Date(fu.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-slate-600">{fu.notes || 'Sem observações registradas.'}</p>
                      {fu.professional_name && (
                        <span className="text-[10px] text-slate-400 block mt-1">
                          Registrado por: {fu.professional_name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ÁREA DE IMPRESSÃO NATIVA OCULTA (SE ACIONADA) */}
      {printPreviewItem && (
        <div className="hidden print:block fixed inset-0 bg-white p-8 z-50 text-slate-900">
          <ClinicDocumentHeader clinic={clinicDocData.clinic} loading={clinicDocData.loading} />
          <div className="my-6 space-y-4 text-sm">
            <div>
              <strong>Paciente:</strong> {printPreviewItem.patient_name || patientName}
            </div>
            <div>
              <strong>Título da Atividade:</strong> {printPreviewItem.title}
            </div>
            {printPreviewItem.objective && (
              <div>
                <strong>Objetivo:</strong> {printPreviewItem.objective}
              </div>
            )}
            <div>
              <strong>Ambiente de Aplicação:</strong> {SETTING_LABELS[printPreviewItem.setting] || printPreviewItem.setting}
            </div>
            {printPreviewItem.materials_needed && (
              <div>
                <strong>Materiais:</strong> {printPreviewItem.materials_needed}
              </div>
            )}
            <div>
              <strong>Instruções:</strong>
              <p className="mt-1 whitespace-pre-line leading-relaxed">{printPreviewItem.instructions}</p>
            </div>
            {printPreviewItem.caregiver_guidance && (
              <div>
                <strong>Dica ao responsável:</strong> {printPreviewItem.caregiver_guidance}
              </div>
            )}
          </div>
          <ClinicDocumentFooter manualOnly />
        </div>
      )}
    </div>
  );
};
