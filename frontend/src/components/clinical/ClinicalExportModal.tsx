import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
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
  FileSpreadsheet
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
  const [patientId, setPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatientName, setSelectedPatientName] = useState<string>(patientName || '');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [coverNotes, setCoverNotes] = useState<string>('');

  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [previewSummary, setPreviewSummary] = useState<any>(null);

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
        ...(coverNotes ? { coverNotes } : {})
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
                Exportação de Prontuário &amp; Histórico 360°
              </h3>
              <p className="text-xs text-slate-500">
                Geração em tempo real de documentos clínicos oficiais e interoperáveis em Word (.docx), PDF, JSON ou ZIP.
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

        {/* Corpo do Modal com Scroll */}
        <div className="overflow-y-auto flex-1 py-4 space-y-5 pr-1">
          {/* Seletor de Paciente (se não informado) */}
          {!initialPatientId && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
              <label className="block font-bold text-slate-800">Selecione o Paciente *</label>
              <PatientSearchSelect
                value={patientId}
                onChange={(id) => {
                  setPatientId(id);
                }}
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
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Observações Especiais ou Justificativa da Emissão (Opcional)
            </label>
            <textarea
              rows={2}
              value={coverNotes}
              onChange={e => setCoverNotes(e.target.value)}
              placeholder="Ex: Prontuário emitido a pedido do paciente para transferência de acompanhamento ou perícia..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
          </div>
        </div>

        {/* Rodapé e Botões de Download */}
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
              className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50"
              title="Baixar em formato Microsoft Word oficial (.docx) editável"
            >
              <FileText className="w-4 h-4" /> Word (.docx)
            </button>

            <button
              type="button"
              onClick={() => handleDownload('pdf')}
              disabled={isDownloading || !patientId}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50"
              title="Baixar em formato PDF oficial pronto para impressão"
            >
              <Download className="w-4 h-4" /> PDF Oficial
            </button>

            <button
              type="button"
              onClick={() => handleDownload('json')}
              disabled={isDownloading || !patientId}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all disabled:opacity-50"
              title="Baixar em formato JSON interoperável estruturado"
            >
              <FileCode className="w-4 h-4" /> JSON
            </button>

            <button
              type="button"
              onClick={() => handleDownload('zip')}
              disabled={isDownloading || !patientId}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:opacity-50"
              title="Baixar pacote completo com DOCX, PDF, JSON e manifesto de integridade"
            >
              <Archive className="w-4 h-4" /> Pacote (.zip)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
