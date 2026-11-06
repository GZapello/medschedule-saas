import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { downloadBlob } from '../../utils/download';
import { PatientSearchSelect } from '../common/PatientSearchSelect';
import {
  FileText,
  Download,
  X,
  Calendar,
  CheckSquare,
  Square,
  FileCode,
  Archive,
  Layers,
  Sparkles,
  ShieldCheck,
  Activity,
  FileSpreadsheet,
  Eye,
  Check,
  RotateCcw,
  Users,
  FileCheck
} from 'lucide-react';

export interface ClinicalExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPatientId?: string;
  patientName?: string;
}

export const ClinicalExportModal: React.FC<ClinicalExportModalProps> = ({
  isOpen,
  onClose,
  initialPatientId,
  patientName
}) => {
  const { showToast } = useToast();
  const { isClinicAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<'config' | 'preview' | 'batch'>('config');

  const [patientId, setPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatientName, setSelectedPatientName] = useState<string>(patientName || '');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [coverNotes, setCoverNotes] = useState<string>('');

  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [previewSummary, setPreviewSummary] = useState<any>(null);

  // Assistente de Formatação com IA
  const [isReviewingWithAi, setIsReviewingWithAi] = useState<boolean>(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  // Exportação em Lote da Clínica (Admin)
  const [batchDateFrom, setBatchDateFrom] = useState<string>('');
  const [batchDateTo, setBatchDateTo] = useState<string>('');
  const [batchFormat, setBatchFormat] = useState<'docx' | 'pdf' | 'all'>('docx');
  const [isDownloadingBatch, setIsDownloadingBatch] = useState<boolean>(false);

  // Módulos clínicos selecionados
  const [selectedModules, setSelectedModules] = useState<{ [key: string]: boolean }>({
    records: true,
    documents: true,
    allergies: true,
    exams: true,
    consents: true,
    dental: true,
    physio: true,
    fono: true,
    nutri: true,
    psico: true,
    to: true,
    pp: true,
    personal: true,
    estetic: true
  });

  useEffect(() => {
    if (initialPatientId) {
      setPatientId(initialPatientId);
    }
  }, [initialPatientId]);

  useEffect(() => {
    if (isOpen && patientId) {
      loadPreview(patientId);
    }
  }, [isOpen, patientId]);

  const loadPreview = async (pId: string) => {
    try {
      setLoadingPreview(true);
      const res = await ApiClient.get<any>(`/v1/clinical-export/preview?patientId=${pId}`);
      setPreviewSummary(res);
      if (res.patient?.name) setSelectedPatientName(res.patient.name);
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar prévia do prontuário', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const toggleModule = (key: string) => {
    setSelectedModules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAll = (enable: boolean) => {
    const updated: { [key: string]: boolean } = {};
    Object.keys(selectedModules).forEach(k => {
      updated[k] = enable;
    });
    setSelectedModules(updated);
  };

  const handleAiFormatReview = async () => {
    const textToReview = coverNotes.trim() || 'Prontuário clínico emitido para conferência assistencial, continuidade de cuidado e perícia médica.';
    try {
      setIsReviewingWithAi(true);
      const res = await ApiClient.post<{ originalText: string; reviewedText: string }>('/v1/clinical-export/ai-format-review', {
        text: textToReview
      });
      setAiSuggestion(res.reviewedText);
      showToast('Formatação revisada pelo assistente!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao revisar formatação com IA', 'error');
    } finally {
      setIsReviewingWithAi(false);
    }
  };

  const applyAiSuggestion = () => {
    if (aiSuggestion) {
      setCoverNotes(aiSuggestion);
      setAiSuggestion(null);
      showToast('Formatação formal aplicada ao prontuário!', 'success');
    }
  };

  const handleDownload = async (format: 'docx' | 'pdf' | 'json' | 'zip') => {
    if (!patientId) {
      showToast('Selecione um paciente para exportar.', 'error');
      return;
    }

    try {
      setIsDownloading(true);
      showToast(`Gerando arquivo ${format.toUpperCase()} com certificação e sigilo...`, 'info');

      const queryParams = new URLSearchParams({
        patientId,
        format,
        order,
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        ...(coverNotes ? { coverNotes } : {}),
        modules: JSON.stringify(selectedModules)
      });

      const response = await fetch(`/api/v1/clinical-export/download?${queryParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('auth_token') || ''}`,
          'X-Tenant-ID': localStorage.getItem('tenantId') || localStorage.getItem('active_tenant_id') || ''
        },
        cache: 'no-store'
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || `Erro ${response.status} ao gerar exportação.`);
      }

      const blob = await response.blob();
      const ext = format === 'docx' ? 'docx' : format === 'pdf' ? 'pdf' : format === 'json' ? 'json' : 'zip';
      const cleanName = (selectedPatientName || 'Paciente').replace(/[^a-zA-Z0-9_\-]/g, '_');
      const filename = `Prontuario_${cleanName}.${ext}`;

      await downloadBlob(blob, filename);
      showToast(`Prontuário baixado com sucesso (${format.toUpperCase()})!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Falha ao baixar exportação', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleBatchDownload = async () => {
    try {
      setIsDownloadingBatch(true);
      showToast('Gerando pacote ZIP da clínica em memória...', 'info');

      const queryParams = new URLSearchParams({
        format: batchFormat,
        ...(batchDateFrom ? { dateFrom: batchDateFrom } : {}),
        ...(batchDateTo ? { dateTo: batchDateTo } : {}),
        modules: JSON.stringify(selectedModules)
      });

      const response = await fetch(`/api/v1/clinical-export/batch-download?${queryParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('auth_token') || ''}`,
          'X-Tenant-ID': localStorage.getItem('tenantId') || localStorage.getItem('active_tenant_id') || ''
        },
        cache: 'no-store'
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || `Erro ${response.status} ao gerar pacote em lote.`);
      }

      const blob = await response.blob();
      const filename = `Lote_Prontuarios_Clinica_${new Date().toISOString().slice(0, 10)}.zip`;

      await downloadBlob(blob, filename);
      showToast('Pacote em lote da clínica baixado com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Falha ao baixar exportação em lote', 'error');
    } finally {
      setIsDownloadingBatch(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Exportação de Prontuário &amp; Documentos Clínicos
              </h3>
              <p className="text-xs text-slate-500">
                Geração em tempo real de documentos em Word (.docx OpenXML autêntico), PDF Oficial, JSON e ZIP.
              </p>
            </div>
          </div>
          <button
            aria-label="Fechar"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas Superiores */}
        <div className="flex items-center gap-2 border-b border-slate-100 pt-3 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'config'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Filtros &amp; Seções
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'preview'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Prévia Interativa do Prontuário
          </button>

          {isClinicAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('batch')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'batch'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Exportação em Lote da Clínica
            </button>
          )}
        </div>

        {/* Corpo do Modal com Scroll */}
        <div className="overflow-y-auto flex-1 py-4 space-y-5 pr-1">
          {/* TAB 1: CONFIGURAÇÕES & SEÇÕES */}
          {activeTab === 'config' && (
            <>
              {/* Seletor de Paciente (se não informado) */}
              {!initialPatientId && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
                  <label className="block font-bold text-slate-800">Selecione o Paciente *</label>
                  <PatientSearchSelect
                    value={patientId}
                    onChange={(id) => setPatientId(id)}
                    clientTermLabel="Paciente"
                    placeholder="Digite o nome ou CPF do paciente para exportar..."
                  />
                </div>
              )}

              {/* Cartão de Resumo do Paciente e Prévia */}
              {patientId && (
                <div className="bg-gradient-to-r from-indigo-50/70 via-slate-50 to-sky-50/60 p-4 rounded-2xl border border-indigo-100 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">
                      Paciente Selecionado
                    </span>
                    <h4 className="text-sm font-extrabold text-slate-900 mt-0.5">
                      {selectedPatientName || previewSummary?.patient?.name || 'Carregando...'}
                    </h4>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                      <span>CPF: <strong>{previewSummary?.patient?.cpf || 'Não informado'}</strong></span>
                      <span>•</span>
                      <span>Nascimento: <strong>{previewSummary?.patient?.birthDate ? new Date(previewSummary.patient.birthDate).toLocaleDateString('pt-BR') : '—'}</strong></span>
                    </div>
                  </div>

                  {previewSummary && (
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end text-[11px]">
                      <span className="px-2.5 py-1 bg-white rounded-lg border border-slate-200 font-bold text-slate-700 shadow-2xs">
                        {previewSummary.counts?.records || 0} Evoluções
                      </span>
                      <span className="px-2.5 py-1 bg-white rounded-lg border border-slate-200 font-bold text-slate-700 shadow-2xs">
                        {previewSummary.counts?.prescriptions || 0} Receitas
                      </span>
                      <span className="px-2.5 py-1 bg-white rounded-lg border border-slate-200 font-bold text-slate-700 shadow-2xs">
                        {previewSummary.counts?.consents || 0} Termos
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Configurações de Filtro e Ordem */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Período Inicial</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Período Final</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ordem Cronológica</label>
                  <select
                    value={order}
                    onChange={e => setOrder(e.target.value as any)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-semibold"
                  >
                    <option value="desc">Mais Recentes Primeiro (Padrão Clínico)</option>
                    <option value="asc">Mais Antigos Primeiro (Histórico Sequencial)</option>
                  </select>
                </div>
              </div>

              {/* Módulos Especializados e Seções Clínicas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    Seções Clínicas a Incluir no Prontuário
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => toggleAll(true)}
                      className="text-indigo-600 hover:underline font-semibold"
                    >
                      Marcar Todos
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => toggleAll(false)}
                      className="text-slate-500 hover:underline"
                    >
                      Desmarcar Todos
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'records', label: 'Evoluções & Consultas' },
                    { id: 'documents', label: 'Receitas & Atestados' },
                    { id: 'allergies', label: 'Alergias & Medicações' },
                    { id: 'exams', label: 'Exames Laborat. & Imagem' },
                    { id: 'consents', label: 'Termos de Consentimento' },
                    { id: 'dental', label: 'Odontologia & HOF' },
                    { id: 'physio', label: 'Fisioterapia' },
                    { id: 'fono', label: 'Fonoaudiologia & ABFW' },
                    { id: 'nutri', label: 'Nutrição & Dietas' },
                    { id: 'psico', label: 'Psicologia & Sessões' },
                    { id: 'to', label: 'Terapia Ocupacional' },
                    { id: 'pp', label: 'Psicopedagogia' },
                    { id: 'personal', label: 'ZemdaPersonal & Treinos' },
                    { id: 'estetic', label: 'ZemdaEstetic & Procedimentos' }
                  ].map(mod => {
                    const active = selectedModules[mod.id];
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => toggleModule(mod.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                          active
                            ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-bold'
                            : 'bg-slate-50/60 border-slate-200 text-slate-500'
                        }`}
                      >
                        {active ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{mod.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notas para a Capa / Folha de Rosto */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Observações de Capa / Folha de Rosto (Opcional)
                  </label>
                  <button
                    type="button"
                    onClick={handleAiFormatReview}
                    disabled={isReviewingWithAi}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isReviewingWithAi ? 'Revisando com IA...' : 'Revisar Formatação com IA'}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={coverNotes}
                  onChange={e => setCoverNotes(e.target.value)}
                  placeholder="Ex: Prontuário emitido a pedido do paciente para transferência de acompanhamento ou perícia..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />

                {aiSuggestion && (
                  <div className="mt-2 p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        Sugestão do Assistente (Sem alteração de dados clínicos)
                      </span>
                      <button
                        type="button"
                        onClick={() => setAiSuggestion(null)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-indigo-900 bg-white p-2.5 rounded-lg border border-indigo-100 whitespace-pre-wrap">
                      {aiSuggestion}
                    </p>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setAiSuggestion(null)}
                        className="px-2.5 py-1 text-slate-600 hover:bg-slate-200 rounded-lg text-[11px]"
                      >
                        Descartar
                      </button>
                      <button
                        type="button"
                        onClick={applyAiSuggestion}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        Aplicar ao Prontuário
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: PRÉVIA INTERATIVA DO PRONTUÁRIO */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Prévia de Estrutura do Documento</h4>
                  <p className="text-xs text-slate-500">Conferência dos elementos e seções ativas antes do download.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAiFormatReview}
                    disabled={isReviewingWithAi}
                    className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isReviewingWithAi ? 'Revisando...' : 'Revisar Folha de Rosto'}
                  </button>
                </div>
              </div>

              {/* Simulação Visual do Documento */}
              <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm space-y-4 text-xs font-sans text-slate-800">
                {/* Cabeçalho do Prontuário */}
                <div className="text-center border-b border-slate-200 pb-3">
                  <h3 className="text-base font-extrabold text-indigo-700 tracking-tight">PRONTUÁRIO CLÍNICO 360°</h3>
                  <p className="text-[11px] text-slate-400">Emissão em conformidade com resoluções CFM 1.821 e LGPD</p>
                  {coverNotes && (
                    <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 text-left">
                      <strong>Observações de Capa / Finalidade:</strong> {coverNotes}
                    </div>
                  )}
                </div>

                {/* Bloco de Identificação */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div><strong>Paciente:</strong> {selectedPatientName || 'Paciente'}</div>
                  <div><strong>CPF:</strong> {previewSummary?.patient?.cpf || 'Não informado'}</div>
                  <div><strong>Nascimento:</strong> {previewSummary?.patient?.birthDate ? new Date(previewSummary.patient.birthDate).toLocaleDateString('pt-BR') : '—'}</div>
                </div>

                {/* Seções Ativas na Prévia */}
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-900 border-b pb-1 text-xs uppercase tracking-wider text-indigo-800">
                    Seções Selecionadas para o Arquivo Final
                  </h4>

                  {selectedModules.records && (
                    <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100">
                      <div className="flex items-center justify-between font-bold text-indigo-900">
                        <span>1. Evoluções Clínicas &amp; Consultas</span>
                        <span className="text-[10px] px-2 py-0.5 bg-indigo-100 rounded-full font-bold">
                          {previewSummary?.counts?.records || 0} registros
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Ordenação: {order === 'desc' ? 'Mais recentes primeiro' : 'Mais antigos primeiro'}.
                        {previewSummary?.recentRecords?.length > 0 && ` Última: ${previewSummary.recentRecords[0].title || 'Consulta'} (${previewSummary.recentRecords[0].date || 'Data n/i'})`}
                      </p>
                    </div>
                  )}

                  {selectedModules.documents && (
                    <div className="p-3 bg-sky-50/40 rounded-xl border border-sky-100">
                      <div className="flex items-center justify-between font-bold text-sky-900">
                        <span>2. Prescrições, Receitas &amp; Atestados</span>
                        <span className="text-[10px] px-2 py-0.5 bg-sky-100 rounded-full font-bold">
                          {(previewSummary?.counts?.prescriptions || 0) + (previewSummary?.counts?.certificates || 0)} emitidos
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">Prescrições farmacológicas e atestados médicos emitidos.</p>
                    </div>
                  )}

                  {selectedModules.allergies && (
                    <div className="p-3 bg-rose-50/40 rounded-xl border border-rose-100">
                      <div className="flex items-center justify-between font-bold text-rose-900">
                        <span>3. Alergias &amp; Medicações Contínuas</span>
                        <span className="text-[10px] px-2 py-0.5 bg-rose-100 rounded-full font-bold">Segurança Clínica</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">Tabela de reações adversas e medicamentos de uso crônico.</p>
                    </div>
                  )}

                  {selectedModules.consents && (
                    <div className="p-3 bg-emerald-50/40 rounded-xl border border-emerald-100">
                      <div className="flex items-center justify-between font-bold text-emerald-900">
                        <span>4. Termos de Consentimento Livre e Esclarecido</span>
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-100 rounded-full font-bold">
                          {previewSummary?.counts?.consents || 0} assinados
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: EXPORTAÇÃO EM LOTE DA CLÍNICA */}
          {activeTab === 'batch' && isClinicAdmin && (
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl">
                <h4 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                  <Archive className="w-4 h-4 text-indigo-600" />
                  Exportação Completa da Clínica em Pacote ZIP
                </h4>
                <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                  Gere um arquivo ZIP com pastas individuais para cada paciente, contendo os prontuários completos nos formatos selecionados e um arquivo central <strong>manifest.json</strong> com integridade SHA-256 e conformidade com o CFM e a LGPD.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Período Inicial (Opcional)</label>
                  <input
                    type="date"
                    value={batchDateFrom}
                    onChange={e => setBatchDateFrom(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Período Final (Opcional)</label>
                  <input
                    type="date"
                    value={batchDateTo}
                    onChange={e => setBatchDateTo(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Formato dos Documentos</label>
                  <select
                    value={batchFormat}
                    onChange={e => setBatchFormat(e.target.value as any)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-semibold"
                  >
                    <option value="docx">Word Oficial (.docx)</option>
                    <option value="pdf">PDF Oficial (.pdf)</option>
                    <option value="all">Ambos (DOCX + PDF)</option>
                  </select>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-2">
                <div className="font-bold text-slate-800">Salvaguarda de Sigilo e Processamento em Memória</div>
                <p className="text-slate-500">
                  O pacote ZIP é compactado em streaming de memória no servidor e enviado diretamente ao seu navegador. Nenhum arquivo intermediário fica retido em disco ou banco de dados (Zero Retention Policy).
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleBatchDownload}
                  disabled={isDownloadingBatch}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isDownloadingBatch ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Archive className="w-4 h-4" />
                  )}
                  Baixar Pacote ZIP da Clínica
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé e Botões de Download */}
        {activeTab !== 'batch' && (
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Processamento em memória sob LGPD (Zero Retention no servidor)</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownload('docx')}
                disabled={isDownloading || !patientId}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                title="Baixar em formato Microsoft Word oficial (.docx) editável"
              >
                <FileText className="w-4 h-4" /> Word (.docx)
              </button>

              <button
                type="button"
                onClick={() => handleDownload('pdf')}
                disabled={isDownloading || !patientId}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                title="Baixar em formato PDF oficial pronto para impressão"
              >
                <Download className="w-4 h-4" /> PDF Oficial
              </button>

              <button
                type="button"
                onClick={() => handleDownload('json')}
                disabled={isDownloading || !patientId}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all disabled:opacity-50 cursor-pointer"
                title="Baixar em formato JSON interoperável estruturado"
              >
                <FileCode className="w-4 h-4" /> JSON
              </button>

              <button
                type="button"
                onClick={() => handleDownload('zip')}
                disabled={isDownloading || !patientId}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                title="Baixar pacote completo com DOCX, PDF, JSON e manifesto de integridade"
              >
                <Archive className="w-4 h-4" /> Pacote (.zip)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
