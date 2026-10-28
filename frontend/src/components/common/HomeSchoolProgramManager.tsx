import React, { useState, useEffect } from 'react';
import { Home, School, BookOpen, Plus, X, Copy, Printer, Download, AlertCircle, FileText } from 'lucide-react';
import { ApiClient, buildApiUrl, getApiBaseUrl } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { resolveClinicalCopyProfile } from '../clinical/clinicalModuleCopy';
import { ClinicDocumentHeader, ClinicDocumentFooter, useClinicDocumentData } from './ClinicDocumentHeader';
import { downloadBlob } from '../../utils/download';
import { isNativePrint, printNativeHtml, currentPrintHtml } from '../../utils/nativePrint';

export interface HomeProgramItem {
  id: string;
  patient_id?: string;
  patient_name?: string | null;
  professional_id?: string | null;
  professional_name?: string | null;
  registration_type?: string | null;
  registration_number?: string | null;
  specialty?: string;
  setting: 'home' | 'school' | 'community' | 'other' | 'general';
  title: string;
  instructions: string;
  materials_needed?: string | null;
  frequency?: string | null;
  status: 'active' | 'completed' | 'paused' | 'revised';
  created_at?: string;
}

export interface HomeSchoolProgramManagerProps {
  patientId: string;
  specialty: 'to' | 'fono';
  readOnly?: boolean;
}

const SETTING_LABELS: Record<string, string> = {
  home: 'Casa / Família',
  school: 'Escola / Educadores',
  community: 'Comunidade / Lazer',
  other: 'Outro Ambiente',
  general: 'Geral (Todos os Ambientes)'
};

export const HomeSchoolProgramManager: React.FC<HomeSchoolProgramManagerProps> = ({
  patientId,
  specialty,
  readOnly = false
}) => {
  const { currentTenant, currentUser } = useAuth();
  const { showToast } = useToast();
  const clinicDocData = useClinicDocumentData();

  const copyProfile = resolveClinicalCopyProfile(undefined, specialty);
  const hsCopy = copyProfile.homeSchool || {
    sectionTitle: 'Programa de Atividades e Orientações (Casa / Escola)',
    sectionSubtitle: 'Orientações estruturadas para continuidade do tratamento na rotina diária',
    titlePlaceholder: 'Ex: Treino de abotoamento na rotina matinal',
    frequencyPlaceholder: 'Ex: Diário ao acordar, 2x por semana',
    defaultFrequency: 'Diário (15 minutos)',
    materialsPlaceholder: 'Ex: Quadro de rotina visual, adaptador de lápis',
    instructionsPlaceholder: 'Descreva passo a passo como realizar o estímulo, quando intervir e como incentivar a autonomia...'
  };

  const [programs, setPrograms] = useState<HomeProgramItem[]>([]);
  const [patientName, setPatientName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);
  const [printPreviewProgram, setPrintPreviewProgram] = useState<HomeProgramItem | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [setting, setSetting] = useState<HomeProgramItem['setting']>('home');
  const [instructions, setInstructions] = useState('');
  const [materialsNeeded, setMaterialsNeeded] = useState('');
  const [frequency, setFrequency] = useState(hsCopy.defaultFrequency);

  const loadPrograms = async () => {
    if (!patientId) return;
    try {
      setIsLoading(true);
      const res = await ApiClient.get<HomeProgramItem[]>(
        `/v1/occupational-therapy/home-programs/${patientId}?module_type=${encodeURIComponent(specialty)}`
      );
      if (Array.isArray(res)) {
        setPrograms(res);
        const foundName = res.find(p => p.patient_name)?.patient_name;
        if (foundName) setPatientName(foundName);
      }
    } catch (err) {
      console.error('[HomeSchoolProgramManager] Erro ao carregar programas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrograms();
    if (patientId) {
      ApiClient.get<any>(`/v1/patients/${patientId}`)
        .then(res => {
          const p = res?.patient || res;
          if (p?.full_name) setPatientName(p.full_name);
        })
        .catch(() => {});
    }
  }, [patientId, specialty]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const trimmedTitle = title.trim();
    const trimmedInstructions = instructions.trim();

    if (!patientId) {
      const msg = 'Selecione um paciente válido antes de salvar a orientação.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    if (!trimmedTitle || !trimmedInstructions) {
      const msg = 'Preencha o título da orientação e as instruções detalhadas.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    try {
      setIsSaving(true);
      setFormError(null);

      await ApiClient.post('/v1/occupational-therapy/home-programs', {
        patientId,
        specialty,
        moduleType: specialty,
        setting,
        title: trimmedTitle,
        instructions: trimmedInstructions,
        materialsNeeded: materialsNeeded.trim() || null,
        frequency: frequency.trim() || null
      });

      setTitle('');
      setInstructions('');
      setMaterialsNeeded('');
      setFrequency(hsCopy.defaultFrequency);
      setSetting('home');
      setFormError(null);
      setIsAdding(false);
      showToast('Orientação cadastrada com sucesso!', 'success');
      await loadPrograms();
    } catch (err: any) {
      console.error('[HomeSchoolProgramManager] Erro ao salvar programa:', err);
      const message = err?.message || 'Erro ao cadastrar programa de orientações. Verifique os dados e tente novamente.';
      setFormError(message);
      showToast(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await ApiClient.put(`/v1/occupational-therapy/home-programs/${id}/status`, { status: newStatus });
      setPrograms(prev => prev.map(p => (p.id === id ? { ...p, status: newStatus as any } : p)));
      showToast('Status da orientação atualizado.', 'success');
    } catch (err: any) {
      console.error('[HomeSchoolProgramManager] Erro ao atualizar status:', err);
      showToast(err?.message || 'Erro ao atualizar status da orientação.', 'error');
    }
  };

  const copyToClipboard = (prog: HomeProgramItem) => {
    const clinicName = currentTenant?.trade_name || currentTenant?.name;
    const lines: string[] = [
      `*PROGRAMA DE ORIENTAÇÕES (${(SETTING_LABELS[prog.setting] || 'CASA / ESCOLA').toUpperCase()})*`
    ];
    if (clinicName) lines.push(`Clínica: ${clinicName}`);
    if (prog.patient_name || patientName) lines.push(`Paciente: ${prog.patient_name || patientName}`);
    lines.push(`Título: ${prog.title}`);
    if (prog.frequency) lines.push(`Frequência sugerida: ${prog.frequency}`);
    if (prog.materials_needed) lines.push(`Materiais / adaptações: ${prog.materials_needed}`);
    lines.push('', 'Orientações:', prog.instructions, '', '(Documento emitido pelo Sistema Zemda)');

    navigator.clipboard.writeText(lines.join('\n'));
    showToast('Orientações copiadas para a área de transferência!', 'success');
  };

  const triggerPrintDocument = (docTitle?: string) => {
    if (isNativePrint()) {
      void printNativeHtml(currentPrintHtml(), docTitle || 'Orientação Terapêutica');
    } else {
      window.print();
    }
  };

  const handleDownloadPdf = async (prog: HomeProgramItem) => {
    if (downloadingPdfId === prog.id) return;
    try {
      setDownloadingPdfId(prog.id);
      const token = localStorage.getItem('auth_token');
      const tenantId = localStorage.getItem('active_tenant_id');
      const url = buildApiUrl(getApiBaseUrl(), `/v1/occupational-therapy/home-programs/${prog.id}/pdf`);
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (tenantId) headers['X-Tenant-ID'] = tenantId;

      const response = await fetch(url, { method: 'GET', headers });
      if (!response.ok) {
        let errMsg = 'Não foi possível gerar o PDF da orientação.';
        try {
          const errData = await response.json();
          if (errData?.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const blob = await response.blob();
      const safeTitle = (prog.title || 'orientacao')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
        .slice(0, 40);
      await downloadBlob(blob, `orientacao-${safeTitle || prog.id}.pdf`);
      showToast('PDF da orientação salvo com sucesso!', 'success');
    } catch (err: any) {
      console.error('[HomeSchoolProgramManager] Erro ao baixar PDF:', err);
      showToast(err?.message || 'Não foi possível gerar o PDF da orientação.', 'error');
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const handleOpenPrintModal = (prog: HomeProgramItem, autoPrint = false) => {
    setPrintPreviewProgram(prog);
    if (autoPrint) {
      setTimeout(() => {
        triggerPrintDocument(prog.title);
      }, 180);
    }
  };

  const formatOrientationDate = (raw?: string) => {
    if (!raw) return new Date().toLocaleDateString('pt-BR');
    const parsed = new Date(String(raw).replace(' ', 'T'));
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('pt-BR');
    }
    return raw;
  };

  const resolveProfessionalInfo = (prog: HomeProgramItem) => {
    const name = prog.professional_name || currentUser?.name || '';
    const reg = prog.registration_type && prog.registration_number
      ? `${prog.registration_type} ${prog.registration_number}`
      : (prog.registration_number || '');
    return { name, reg };
  };

  const getSettingIcon = (st: HomeProgramItem['setting']) => {
    switch (st) {
      case 'school':
        return <School className="w-4 h-4 text-emerald-600" />;
      case 'community':
        return <BookOpen className="w-4 h-4 text-amber-600" />;
      case 'home':
      default:
        return <Home className="w-4 h-4 text-teal-600" />;
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-600" />
            {hsCopy.sectionTitle}
          </h3>
          <p className="text-xs text-slate-500">
            {hsCopy.sectionSubtitle}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setIsAdding(!isAdding);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {isAdding ? 'Cancelar' : '+ Nova Orientação'}
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleCreate} className="p-4 bg-teal-50/50 border border-teal-100 rounded-2xl space-y-3">
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Título da Orientação / Atividade *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={hsCopy.titlePlaceholder}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ambiente de Aplicação
              </label>
              <select
                value={setting}
                onChange={(e) => setSetting(e.target.value as any)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs cursor-pointer"
              >
                <option value="home">Casa / Família</option>
                <option value="school">Escola / Educadores</option>
                <option value="community">Comunidade</option>
                <option value="other">Outro Ambiente</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Frequência Sugerida
              </label>
              <input
                type="text"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder={hsCopy.frequencyPlaceholder}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Materiais ou Adaptações Necessárias
              </label>
              <input
                type="text"
                value={materialsNeeded}
                onChange={(e) => setMaterialsNeeded(e.target.value)}
                placeholder={hsCopy.materialsPlaceholder}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Instruções Detalhadas para Pais ou Educadores *
            </label>
            <textarea
              rows={4}
              required
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={hsCopy.instructionsPlaceholder}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs resize-y"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                setFormError(null);
                setIsAdding(false);
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {isSaving ? 'Salvando...' : 'Salvar Orientação'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-6 text-xs text-slate-400">Carregando orientações...</div>
        ) : programs.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
            Nenhuma orientação para casa ou escola registrada ainda.
          </div>
        ) : (
          programs.map(prog => (
            <div
              key={prog.id}
              className="p-3.5 bg-white border border-slate-200/80 rounded-2xl space-y-2.5 hover:border-slate-300 transition-colors shadow-xs"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-slate-50 rounded-lg border border-slate-200">
                    {getSettingIcon(prog.setting)}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      {prog.title}
                    </h4>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Ambiente: {SETTING_LABELS[prog.setting] || 'Geral'}
                      {prog.frequency ? ` • ${prog.frequency}` : ''}
                      {prog.created_at ? ` • ${formatOrientationDate(prog.created_at)}` : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleOpenPrintModal(prog, false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    title="Visualizar e imprimir orientação em formato A4"
                  >
                    <Printer className="w-3.5 h-3.5 text-teal-600" />
                    Imprimir
                  </button>
                  <button
                    type="button"
                    disabled={downloadingPdfId === prog.id}
                    onClick={() => handleDownloadPdf(prog)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    title="Salvar orientação em PDF para encaminhar ao paciente"
                  >
                    <Download className="w-3.5 h-3.5 text-teal-600" />
                    {downloadingPdfId === prog.id ? 'Gerando PDF...' : 'Salvar em PDF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(prog)}
                    className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                    title="Copiar texto formatado"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <select
                    value={prog.status}
                    onChange={(e) => handleStatusChange(prog.id, e.target.value)}
                    disabled={readOnly}
                    aria-label="Status da orientação"
                    className="text-[11px] font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none cursor-pointer focus:border-teal-500"
                  >
                    <option value="active">Ativo</option>
                    <option value="completed">Concluído</option>
                    <option value="paused">Pausado</option>
                    <option value="revised">Revisado</option>
                  </select>
                </div>
              </div>

              <div className="text-xs text-slate-700 whitespace-pre-line bg-slate-50/70 p-3 rounded-xl border border-slate-100 leading-relaxed">
                {prog.instructions}
              </div>

              {prog.materials_needed && (
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  <strong>Materiais sugeridos:</strong> {prog.materials_needed}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal de Visualização, Impressão A4 e Download em PDF da Orientação */}
      {printPreviewProgram && (() => {
        const profInfo = resolveProfessionalInfo(printPreviewProgram);
        const displayPatientName = printPreviewProgram.patient_name || patientName || 'Paciente';
        const displayDate = formatOrientationDate(printPreviewProgram.created_at);
        const displaySetting = SETTING_LABELS[printPreviewProgram.setting] || printPreviewProgram.setting;

        return (
          <div className="fixed inset-0 z-[100] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:static print:inset-auto print:bg-white print:p-0 print:block">
            <style>{`
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 15mm;
                }
                body * {
                  visibility: hidden !important;
                }
                #zemda-home-program-print-root,
                #zemda-home-program-print-root * {
                  visibility: visible !important;
                }
                #zemda-home-program-print-root {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  max-width: 100% !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  box-shadow: none !important;
                  border: none !important;
                  background: #ffffff !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>

            <div className="bg-slate-100 rounded-2xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden print:max-h-none print:shadow-none print:border-0 print:bg-white">
              {/* Barra Superior de Ações (Oculta na Impressão) */}
              <div className="no-print bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-teal-500/20 text-teal-300">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">Documento de Orientação (Casa / Escola)</h4>
                    <p className="text-[11px] text-slate-400">Formato A4 pronto para impressão ou encaminhamento em PDF</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => triggerPrintDocument(printPreviewProgram.title)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-teal-300" />
                    Imprimir
                  </button>
                  <button
                    type="button"
                    disabled={downloadingPdfId === printPreviewProgram.id}
                    onClick={() => handleDownloadPdf(printPreviewProgram)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {downloadingPdfId === printPreviewProgram.id ? 'Gerando PDF...' : 'Salvar em PDF'}
                  </button>
                  <button
                    type="button"
                    aria-label="Fechar visualização"
                    onClick={() => setPrintPreviewProgram(null)}
                    className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Folha A4 */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center print:p-0 print:overflow-visible">
                <div
                  id="zemda-home-program-print-root"
                  className="bg-white w-full max-w-[210mm] min-h-[297mm] p-8 sm:p-12 shadow-lg border border-slate-200 rounded-sm text-slate-900 flex flex-col justify-between print:shadow-none print:border-0 print:p-0 print:min-h-0"
                >
                  <div className="space-y-6">
                    <ClinicDocumentHeader
                      clinic={clinicDocData.clinic}
                      loading={clinicDocData.loading}
                      error={clinicDocData.error}
                      documentTitle="Programa de Atividades e Orientações (Casa / Escola)"
                      documentDate={displayDate}
                    />

                    {/* Identificação do Paciente e Contexto da Orientação */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Paciente</span>
                        <span className="font-bold text-slate-900 text-sm">{displayPatientName}</span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Data da Orientação</span>
                        <span className="font-semibold text-slate-800">{displayDate}</span>
                      </div>

                      {profInfo.name && (
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Profissional Responsável</span>
                          <span className="font-semibold text-slate-800">
                            {profInfo.name}
                            {profInfo.reg ? ` (${profInfo.reg})` : ''}
                          </span>
                        </div>
                      )}

                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Ambiente de Aplicação</span>
                        <span className="font-semibold text-slate-800">{displaySetting}</span>
                      </div>

                      {printPreviewProgram.frequency && printPreviewProgram.frequency.trim() !== '' && (
                        <div className="sm:col-span-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Frequência Sugerida</span>
                          <span className="font-semibold text-slate-800">{printPreviewProgram.frequency}</span>
                        </div>
                      )}
                    </div>

                    {/* Título da Orientação / Atividade */}
                    <div className="space-y-1.5">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                        Título da Orientação / Atividade
                      </h4>
                      <div className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
                        {printPreviewProgram.title}
                      </div>
                    </div>

                    {/* Materiais ou Adaptações Necessárias (somente se preenchido) */}
                    {printPreviewProgram.materials_needed && printPreviewProgram.materials_needed.trim() !== '' && (
                      <div className="space-y-1.5">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                          Materiais ou Adaptações Necessárias
                        </h4>
                        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                          {printPreviewProgram.materials_needed}
                        </div>
                      </div>
                    )}

                    {/* Instruções Completas */}
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                        Instruções e Orientações para o Paciente, Familiares ou Educadores
                      </h4>
                      <div className="p-4 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {printPreviewProgram.instructions}
                      </div>
                    </div>
                  </div>

                  {/* Assinatura e Rodapé Institucional Zemda */}
                  <div className="pt-8 mt-8 space-y-6 break-inside-avoid">
                    {profInfo.name && (
                      <div className="flex flex-col items-center justify-center pt-4">
                        <div className="w-56 border-b border-slate-400 mb-1.5" />
                        <p className="text-xs font-bold text-slate-900">{profInfo.name}</p>
                        {profInfo.reg && (
                          <p className="text-[11px] text-slate-600">{profInfo.reg}</p>
                        )}
                      </div>
                    )}

                    <ClinicDocumentFooter manualOnly />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
