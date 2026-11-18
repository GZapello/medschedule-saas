import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import type {
  CatalogImportBatchStatus,
  CatalogImportErrorCategory,
  CatalogImportStage,
  ImportDraft,
  ImportReceipt,
  ImportSource
} from '../../types/studioCatalogImport';
import { StudioCatalogImportReview } from './StudioCatalogImportReview';

const endpoint = '/v1/studio/catalog-imports';
const formats = /\.(jpe?g|png|webp|pdf|docx|xlsx|csv)$/i;
const MB = 1024 * 1024;
const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer';

type DraftListItem = {
  id: string;
  status?: CatalogImportBatchStatus;
  errorCategory?: CatalogImportErrorCategory | null;
  errorStage?: CatalogImportStage | null;
  hasExtractedData?: boolean;
  requestId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryable?: boolean;
  retryAfterSeconds?: number | null;
  attempts?: number;
  maxAttempts?: number;
  diagnostic?: ImportDraft['diagnostic'];
  tempExpiresAt?: string | null;
  tempPurgedAt?: string | null;
  revision?: number;
  sources: ImportSource[];
  result?: ImportReceipt | null;
  updatedAt?: string;
};

const stageLabels: Record<CatalogImportStage, string> = {
  upload_validation: 'Validação dos arquivos',
  temp_storage: 'Armazenamento temporário',
  queue_enqueue: 'Enfileiramento',
  worker_load_temp: 'Leitura dos arquivos temporários',
  ai_provider: 'Comunicação com a IA',
  ai_response_parse: 'Interpretação da resposta',
  proposal_normalization: 'Normalização do catálogo',
  completed: 'Concluído',
  cancelled: 'Cancelado'
};

function stageLabel(stage?: CatalogImportStage | null): string | null {
  return stage ? stageLabels[stage] || stage : null;
}

function canRetryBatch(item: Pick<DraftListItem, 'status' | 'retryable' | 'attempts' | 'maxAttempts' | 'errorCode'>): boolean {
  if (item.status !== 'failed' || !item.retryable) return false;
  if (item.errorCode === 'MAX_RETRIES_EXCEEDED' || item.errorCode === 'AI_AUTH_ERROR' || item.errorCode === 'AI_NOT_CONFIGURED') {
    return false;
  }
  const attempts = Number(item.attempts || 0);
  const maxAttempts = Number(item.maxAttempts || 3);
  return attempts < maxAttempts;
}

async function postJsonWithTimeout<T>(path: string, body: unknown, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await ApiClient.post<T>(path, body, { signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError' || controller.signal.aborted) {
      throw Object.assign(
        new Error('Tempo limite excedido no navegador ao enviar os arquivos para análise. Verifique a conexão e tente novamente.'),
        { code: 'CLIENT_REQUEST_TIMEOUT', retryable: true }
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timerId);
  }
}

type ApiErrorLike = Error & {
  status?: number;
  code?: string;
  requestId?: string | null;
  retryable?: boolean;
  retryAfterSeconds?: number | null;
  isHtmlResponse?: boolean;
  batchId?: string;
};

type Activity =
  | 'reading'
  | 'analyzing'
  | 'retrying'
  | 'cancelling'
  | 'opening'
  | 'opening_history'
  | 'saving'
  | 'confirming'
  | 'deleting';

type ImportWizardStage = 'files' | 'review' | 'completed' | 'history_view';

const activityLabels: Record<Activity, string> = {
  reading: 'Preparando e otimizando os arquivos…',
  analyzing: 'Enviando arquivos para análise em segundo plano…',
  retrying: 'Reenfileirando análise com os arquivos temporários…',
  cancelling: 'Cancelando análise e removendo arquivos temporários…',
  opening: 'Abrindo rascunho…',
  opening_history: 'Carregando registro histórico…',
  saving: 'Salvando progresso do rascunho…',
  confirming: 'Validando e cadastrando no catálogo oficial…',
  deleting: 'Descartando lote e removendo arquivos temporários…'
};

function hasProposal(payload: unknown): payload is ImportDraft {
  return Boolean(
    payload
    && typeof payload === 'object'
    && 'proposal' in payload
    && (payload as ImportDraft).proposal
    && Array.isArray((payload as ImportDraft).proposal.services)
  );
}

function encode(file: File) {
  return new Promise<{ fileName: string; base64: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler ' + file.name + '.'));
    reader.onload = () => resolve({ fileName: file.name, base64: String(reader.result).split(',')[1] });
    reader.readAsDataURL(file);
  });
}

function FileThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url
    ? <img alt="" className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 object-cover" src={url} />
    : <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-indigo-600" />;
}

function resolveErrorCategory(item: Pick<DraftListItem, 'errorCategory' | 'errorCode'>): CatalogImportErrorCategory {
  if (item.errorCategory) return item.errorCategory;
  if (item.errorCode === 'TEMP_FILES_EXPIRED' || item.errorCode === 'BACKEND_RESTARTED_TEMP_UNAVAILABLE') {
    return 'expired';
  }
  if (item.errorCode === 'AI_AUTH_ERROR' || item.errorCode === 'AI_NOT_CONFIGURED') {
    return 'auth_error';
  }
  if (item.errorCode === 'AI_INVALID_OR_BLOCKED' || item.errorCode === 'AI_UNREADABLE_CONTENT') {
    return 'validation_error';
  }
  if (
    item.errorCode === 'AI_RATE_LIMITED'
    || item.errorCode === 'AI_PROVIDER_UNAVAILABLE'
    || item.errorCode === 'AI_TIMEOUT'
    || item.errorCode === 'CLIENT_REQUEST_TIMEOUT'
    || item.errorCode === 'MAX_RETRIES_EXCEEDED'
    || item.errorCode === 'TEMP_STAGE_ERROR'
    || item.errorCode === 'ASYNC_JOB_ERROR'
    || item.errorCode === 'BACKEND_RESTARTED'
  ) {
    return 'communication_error';
  }
  return 'analysis_error';
}

function failureHeading(item: Pick<DraftListItem, 'errorCategory' | 'errorCode' | 'status' | 'retryable' | 'attempts' | 'maxAttempts'>): string {
  const cat = resolveErrorCategory(item);
  if (cat === 'expired') return 'Arquivos temporários expirados';
  if (cat === 'auth_error') return 'Falha de autenticação ou configuração do provedor de IA';
  if (cat === 'validation_error') return 'Falha de validação dos arquivos';
  if (item.errorCode === 'MAX_RETRIES_EXCEEDED' || (!canRetryBatch(item) && Number(item.attempts || 0) >= Number(item.maxAttempts || 3))) {
    return 'Falha definitiva (limite de tentativas atingido)';
  }
  if (cat === 'communication_error') {
    return canRetryBatch(item) ? 'Falha temporária de comunicação com a IA' : 'Falha definitiva de comunicação';
  }
  return canRetryBatch(item) ? 'Falha temporária na análise do catálogo' : 'Falha definitiva na análise do catálogo';
}

function statusBadge(item: DraftListItem): { label: string; className: string } {
  if (item.result || item.status === 'completed') {
    return { label: 'Importação concluída', className: 'bg-emerald-100 text-emerald-800' };
  }
  if (item.status === 'queued' || item.status === 'processing') {
    return { label: 'Em análise', className: 'bg-indigo-100 text-indigo-800' };
  }
  if (item.status === 'cancelled') {
    return { label: 'Importação descartada', className: 'bg-slate-200 text-slate-700' };
  }
  if (item.status === 'failed') {
    const cat = resolveErrorCategory(item);
    if (cat === 'expired') {
      return { label: 'Arquivos expirados', className: 'bg-rose-100 text-rose-800' };
    }
    if (cat === 'auth_error') {
      return { label: 'Falha de autenticação · IA', className: 'bg-rose-100 text-rose-800' };
    }
    if (cat === 'validation_error') {
      return { label: 'Falha de validação', className: 'bg-amber-100 text-amber-800' };
    }
    if (canRetryBatch(item)) {
      return {
        label: cat === 'communication_error' ? 'Falha temporária · comunicação' : 'Falha temporária · análise',
        className: 'bg-amber-100 text-amber-800'
      };
    }
    return { label: 'Falha definitiva', className: 'bg-rose-100 text-rose-800' };
  }
  return { label: 'Pronto para revisão', className: 'bg-emerald-100 text-emerald-800' };
}

export function StudioCatalogImportView() {
  const inputId = useId();
  const submitLockRef = useRef(false);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [allRecords, setAllRecords] = useState<DraftListItem[]>([]);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [wizardStage, setWizardStage] = useState<ImportWizardStage>('files');
  const [catalogVerifiedCount, setCatalogVerifiedCount] = useState<number | null>(null);
  const [activeJob, setActiveJob] = useState<DraftListItem | null>(null);
  const [pollFailureCount, setPollFailureCount] = useState(0);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState<{
    requestId?: string | null;
    retryable?: boolean;
    isHtmlResponse?: boolean;
  } | null>(null);
  const [draftError, setDraftError] = useState('');
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);

  const setErrorFromException = useCallback((err: unknown, fallback: string) => {
    const e = err as ApiErrorLike | undefined;
    setError(e?.message || fallback);
    setErrorDetails(
      e?.requestId || e?.retryable || e?.isHtmlResponse
        ? {
            requestId: e?.requestId || null,
            retryable: Boolean(e?.retryable),
            isHtmlResponse: Boolean(e?.isHtmlResponse)
          }
        : null
    );
  }, []);

  const refreshDrafts = useCallback(async (signal?: AbortSignal) => {
    try {
      const list = await ApiClient.get<DraftListItem[]>(endpoint + '?includeCompleted=1', { signal });
      setAllRecords(list);
      setDraftError('');
      setActiveJob((prev) => {
        if (prev) return prev;
        const running = list.find((item) => item.status === 'queued' || item.status === 'processing');
        return running || null;
      });
    } catch {
      if (!signal?.aborted) setDraftError('Não foi possível carregar os rascunhos e histórico.');
    }
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    void refreshDrafts(abort.signal);
    return () => abort.abort();
  }, [refreshDrafts]);

  const activeJobId = activeJob?.id || null;
  const activeJobStatus = activeJob?.status || null;
  const isJobRunning = activeJobStatus === 'queued' || activeJobStatus === 'processing';

  const checkJobStatusNow = useCallback(async (jobId: string, signal?: AbortSignal) => {
    const res = await ApiClient.get<ImportDraft | DraftListItem>(endpoint + '/' + jobId, { signal });
    setPollFailureCount(0);
    if (hasProposal(res)) {
      if (res.result || res.status === 'completed') {
        // Nunca pular a etapa de revisão automaticamente durante uma análise ativa
        setActiveJob(null);
        setDraft(null);
        setWizardStage('files');
        setConfirming(false);
        setError('A análise retornou um lote já concluído anteriormente. Reenvie os arquivos para iniciar uma nova revisão.');
        void refreshDrafts();
        return 'stopped';
      }
      const extractedTotal = (res.proposal.services?.length || 0) + (res.proposal.packages?.length || 0);
      if (extractedTotal === 0) {
        setActiveJob(null);
        setDraft(null);
        setWizardStage('files');
        setConfirming(false);
        setError('Análise concluída sem serviços ou pacotes identificados nos arquivos enviados. Revise o material e tente novamente.');
        void refreshDrafts();
        return 'stopped';
      }
      if (res.status === 'ready' || !res.status) {
        setActiveJob(null);
        setDraft(res);
        setConfirming(false);
        setWizardStage('review');
        setError('');
        setErrorDetails(null);
        setMessage('Análise concluída. Revise os serviços e planos abaixo e clique em Confirmar para cadastrar no catálogo.');
        void refreshDrafts();
        return 'done';
      }
    }
    const statusRes = res as DraftListItem;
    setActiveJob(statusRes);
    if (statusRes.status === 'failed' || statusRes.status === 'cancelled') {
      void refreshDrafts();
      return 'stopped';
    }
    return 'running';
  }, [refreshDrafts]);

  useEffect(() => {
    if (!activeJobId || !isJobRunning) return;
    let disposed = false;
    const abort = new AbortController();
    let timer: number | undefined;

    const poll = async () => {
      try {
        const outcome = await checkJobStatusNow(activeJobId, abort.signal);
        if (disposed || outcome !== 'running') return;
        timer = window.setTimeout(() => void poll(), 2000);
      } catch (err) {
        if (disposed || abort.signal.aborted) return;
        setPollFailureCount((count) => {
          const next = count + 1;
          if (next < 5) {
            timer = window.setTimeout(() => void poll(), Math.min(8000, 2000 * next));
          } else {
            setErrorFromException(err, 'Não foi possível acompanhar o progresso da análise no momento.');
          }
          return next;
        });
      }
    };

    timer = window.setTimeout(() => void poll(), 1500);
    return () => {
      disposed = true;
      abort.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [activeJobId, isJobRunning, checkJobStatusNow, setErrorFromException]);

  function selectFiles(next: File[]) {
    setError('');
    setErrorDetails(null);
    const all = [...files, ...next];
    if (all.some(file => !formats.test(file.name) || file.size === 0 || file.size > 5 * MB)) {
      setError('Use arquivos compatíveis (JPG, PNG, WebP, PDF, DOCX, XLSX ou CSV UTF-8) de até 5 MB cada.');
      return;
    }
    if (all.length > 8 || all.reduce((bytes, file) => bytes + file.size, 0) > 12 * MB) {
      setError('Envie até 8 arquivos simultaneamente, com limite de 12 MB no total.');
      return;
    }
    setFiles(all);
  }

  async function run(task: Activity, operation: () => Promise<ImportDraft | DraftListItem | null>, success = '') {
    if (submitLockRef.current || activity) return;
    submitLockRef.current = true;
    setActivity(task);
    setError('');
    setErrorDetails(null);
    setMessage('');
    try {
      const next = await operation();
      if (!next) {
        setDraft(null);
        setWizardStage('files');
      } else if (hasProposal(next)) {
        setActiveJob(null);
        if (task === 'confirming') {
          const totalPersisted = (next.result?.services?.length || 0) + (next.result?.packages?.length || 0);
          if (!next.result || totalPersisted === 0) {
            throw new Error('A confirmação não retornou itens gravados no catálogo oficial. Sua revisão foi preservada para nova tentativa.');
          }
          window.dispatchEvent(new CustomEvent('zemda-catalog-updated', { detail: { source: 'studio_catalog_import', receipt: next.result } }));
          let liveCount: number | null = null;
          try {
            const officialServices = await ApiClient.get<Array<{ id: string }>>('/v1/services');
            if (Array.isArray(officialServices)) {
              const idSet = new Set(officialServices.map(s => s.id));
              liveCount = next.result.services.filter(s => idSet.has(s.id)).length;
            }
          } catch {
            liveCount = next.result.verifiedCatalogCount ?? null;
          }
          setCatalogVerifiedCount(liveCount);
          setDraft(next);
          setConfirming(false);
          setWizardStage('completed');
          setMessage(success || 'Importação gravada e verificada no catálogo oficial.');
        } else if (task === 'opening_history' && next.result) {
          setCatalogVerifiedCount(next.result.verifiedCatalogCount ?? null);
          setDraft(next);
          setConfirming(false);
          setWizardStage('history_view');
        } else if (next.result || next.status === 'completed') {
          // Proteção rigorosa: análise ou reabertura de rascunho nunca avança automaticamente para "Concluído"
          setDraft(null);
          setConfirming(false);
          setWizardStage('files');
          setError('Este lote já constava como concluído anteriormente e não pôde ir direto para revisão. Reenvie os arquivos para iniciar uma nova análise.');
        } else {
          const extractedCount = (next.proposal.services?.length || 0) + (next.proposal.packages?.length || 0);
          if (extractedCount === 0) {
            setDraft(null);
            setConfirming(false);
            setWizardStage('files');
            setError('Análise concluída sem serviços ou pacotes identificados nos arquivos enviados.');
          } else {
            setCatalogVerifiedCount(null);
            setDraft(next);
            setConfirming(false);
            setWizardStage('review');
            if (success) setMessage(success);
            else if (task === 'reading' || task === 'analyzing') {
              setMessage('Análise concluída! Revise todos os registros abaixo antes de confirmar a importação.');
            }
          }
        }
      } else {
        setDraft(null);
        setWizardStage('files');
        setConfirming(false);
        setActiveJob(next);
        setPollFailureCount(0);
      }
      if (task !== 'confirming') setConfirming(false);
      void refreshDrafts();
    } catch (err) {
      setErrorFromException(err, 'Falha ao processar a importação.');
      if (task === 'confirming') {
        setConfirming(false);
      }
      void refreshDrafts();
    } finally {
      submitLockRef.current = false;
      setActivity(null);
    }
  }

  async function retryBatch(id: string) {
    if (submitLockRef.current || activity || isJobRunning) return;
    submitLockRef.current = true;
    setActivity('retrying');
    setError('');
    setErrorDetails(null);
    setMessage('');
    try {
      const res = await postJsonWithTimeout<ImportDraft | DraftListItem>(endpoint + '/' + id + '/retry', {}, 30_000);
      if (hasProposal(res)) {
        setActiveJob(null);
        if (res.result || res.status === 'completed') {
          setDraft(null);
          setWizardStage('files');
          setError('Este lote já foi finalizado anteriormente. Envie os arquivos novamente para uma nova análise.');
        } else {
          setDraft(res);
          setConfirming(false);
          setWizardStage('review');
        }
      } else {
        setDraft(null);
        setWizardStage('files');
        setActiveJob(res);
        setPollFailureCount(0);
      }
      void refreshDrafts();
    } catch (err) {
      setErrorFromException(err, 'Não foi possível reiniciar a análise deste lote.');
      void refreshDrafts();
    } finally {
      submitLockRef.current = false;
      setActivity(null);
    }
  }

  async function cancelBatch(id: string) {
    if (submitLockRef.current || activity) return;
    submitLockRef.current = true;
    setActivity('cancelling');
    setError('');
    setErrorDetails(null);
    try {
      const res = await ApiClient.post<DraftListItem>(endpoint + '/' + id + '/cancel', {});
      setActiveJob(res);
      setMessage('Análise cancelada e arquivos originais temporários excluídos.');
      await refreshDrafts();
    } catch (err) {
      setErrorFromException(err, 'Erro ao cancelar análise.');
    } finally {
      submitLockRef.current = false;
      setActivity(null);
    }
  }

  async function discardDraft(id: string, confirmFirst = true) {
    if (submitLockRef.current || activity) return;
    if (confirmFirst && !window.confirm('Descartar este lote permanentemente e remover eventuais arquivos temporários?')) return;
    submitLockRef.current = true;
    setActivity('deleting');
    setError('');
    setErrorDetails(null);
    try {
      await ApiClient.delete(endpoint + '/' + id);
      if (draft?.id === id) {
        setDraft(null);
        setWizardStage('files');
        setConfirming(false);
      }
      if (activeJob?.id === id) setActiveJob(null);
      await refreshDrafts();
    } catch (err) {
      setErrorFromException(err, 'Erro ao descartar rascunho.');
    } finally {
      submitLockRef.current = false;
      setActivity(null);
    }
  }

  async function reuploadForBatch(item: DraftListItem) {
    if (submitLockRef.current || activity) return;
    submitLockRef.current = true;
    setActivity('deleting');
    setError('');
    setErrorDetails(null);
    try {
      if (!item.hasExtractedData) {
        await ApiClient.delete(endpoint + '/' + item.id);
      }
      if (activeJob?.id === item.id) setActiveJob(null);
      setMessage('Lote anterior limpo. Selecione os arquivos novamente abaixo para iniciar uma nova análise.');
      await refreshDrafts();
      dropzoneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      setErrorFromException(err, 'Não foi possível preparar o reenvio dos arquivos.');
    } finally {
      submitLockRef.current = false;
      setActivity(null);
    }
  }

  const openDrafts = allRecords.filter(r => !r.result);
  const completedHistory = allRecords.filter(r => Boolean(r.result));

  const selected = draft ? [...draft.proposal.services, ...draft.proposal.packages].filter(row => row.action !== 'ignore') : [];
  const ready = selected.length > 0 && selected.every(row => row.reviewed);
  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  const previewCounts = draft ? {
    createServices: draft.proposal.services.filter(s => s.action === 'create').length,
    updateServices: draft.proposal.services.filter(s => s.action === 'update').length,
    linkServices: draft.proposal.services.filter(s => s.action === 'link').length,
    ignoreServices: draft.proposal.services.filter(s => s.action === 'ignore').length,
    createPackages: draft.proposal.packages.filter(p => p.action === 'create').length,
    linkPackages: draft.proposal.packages.filter(p => p.action === 'link').length,
    ignorePackages: draft.proposal.packages.filter(p => p.action === 'ignore').length,
    prices: draft.proposal.services.filter(s => s.action === 'create' || (s.action === 'update' && s.apply.includes('prices'))).reduce((sum, s) => sum + s.prices.length, 0),
    schedules: draft.proposal.services.filter(s => !s.deferSchedules && (s.action === 'create' || (s.action === 'update' && s.apply.includes('schedules')))).reduce((sum, s) => sum + s.schedules.length, 0)
  } : null;

  return <section className="min-w-0 space-y-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6" aria-labelledby={inputId + '-heading'}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><Sparkles aria-hidden="true" className="h-5 w-5" /></div>
        <div className="min-w-0">
          <h2 id={inputId + '-heading'} className="text-lg font-bold text-slate-900">Importação Inteligente de Serviços com IA</h2>
          <p className="text-sm text-slate-600">
            Envie imagens, tabelas ou planilhas. A IA relaciona planos, frequências, preços, horários e pacotes para você revisar e publicar no catálogo oficial.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
        <span className={`rounded-full px-2.5 py-1 ${wizardStage === 'files' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700'}`}>1. Arquivos</span>
        <span className={`rounded-full px-2.5 py-1 ${wizardStage === 'review' && !confirming ? 'bg-indigo-600 text-white' : wizardStage === 'completed' || wizardStage === 'history_view' || (wizardStage === 'review' && confirming) ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>2. Revisão</span>
        <span className={`rounded-full px-2.5 py-1 ${wizardStage === 'review' && confirming ? 'bg-indigo-600 text-white' : wizardStage === 'completed' || wizardStage === 'history_view' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>3. Confirmação</span>
        <span className={`rounded-full px-2.5 py-1 ${wizardStage === 'completed' || wizardStage === 'history_view' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>4. Concluído</span>
      </div>
    </div>

    {activity && <p role="status" className="flex items-center gap-2 rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-800">
      <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />{activityLabels[activity]}
    </p>}

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">
      <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{error}</p>
        {errorDetails?.requestId && (
          <p className="text-xs text-rose-700">Protocolo de diagnóstico: <code className="font-mono">{errorDetails.requestId}</code></p>
        )}
      </div>
    </div>}

    {message && <p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm font-medium text-emerald-800">{message}</p>}

    {wizardStage === 'files' && !draft && activeJob && (
      <div className={`rounded-2xl border p-4 space-y-3 ${
        isJobRunning
          ? 'border-indigo-200 bg-indigo-50/70 text-indigo-950'
          : activeJob.status === 'failed'
            ? (!canRetryBatch(activeJob) || resolveErrorCategory(activeJob) === 'expired' || resolveErrorCategory(activeJob) === 'auth_error'
              ? 'border-rose-200 bg-rose-50/70 text-rose-950'
              : 'border-amber-200 bg-amber-50/80 text-amber-950')
            : 'border-slate-200 bg-slate-50 text-slate-800'
      }`} role="status">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            {isJobRunning
              ? <Loader2 aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin text-indigo-600 mt-0.5" />
              : activeJob.status === 'failed'
                ? <AlertCircle aria-hidden="true" className={`h-5 w-5 shrink-0 mt-0.5 ${!canRetryBatch(activeJob) || resolveErrorCategory(activeJob) === 'expired' || resolveErrorCategory(activeJob) === 'auth_error' ? 'text-rose-600' : 'text-amber-600'}`} />
                : <XCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-500 mt-0.5" />}
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-bold">
                {isJobRunning
                  ? (activeJob.status === 'processing' ? 'Extraindo serviços, preços e grades com IA…' : 'Análise na fila de processamento…')
                  : activeJob.status === 'failed'
                    ? failureHeading(activeJob)
                    : 'Importação cancelada'}
              </p>
              <p className="text-xs opacity-90 truncate">
                Arquivos: {activeJob.sources.map(s => s.fileName).join(', ')}
                {activeJob.attempts ? ` · Tentativa ${activeJob.attempts} de ${activeJob.maxAttempts || 3}` : ''}
                {activeJob.errorStage && activeJob.status === 'failed' && stageLabel(activeJob.errorStage)
                  ? ` · Etapa: ${stageLabel(activeJob.errorStage)}`
                  : ''}
                {activeJob.requestId ? ` · Protocolo ${activeJob.requestId}` : ''}
              </p>
              {isJobRunning && (
                <p className="text-xs text-indigo-800">
                  Os arquivos estão em armazenamento temporário isolado e serão excluídos automaticamente assim que a extração concluir.
                </p>
              )}
              {activeJob.status === 'failed' && activeJob.errorMessage && (
                <p className="text-xs font-medium">{activeJob.errorMessage}</p>
              )}
              {activeJob.status === 'cancelled' && (
                <p className="text-xs text-slate-600">Os arquivos temporários enviados para este lote foram removidos.</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isJobRunning && pollFailureCount >= 5 && (
              <button type="button" className={secondary} disabled={!!activity} onClick={() => void checkJobStatusNow(activeJob.id)}>
                <RefreshCw aria-hidden="true" className="h-4 w-4" />Atualizar status
              </button>
            )}
            {isJobRunning && (
              <button type="button" className={secondary} disabled={!!activity} onClick={() => void cancelBatch(activeJob.id)}>
                <XCircle aria-hidden="true" className="h-4 w-4" />Cancelar análise
              </button>
            )}
            {activeJob.status === 'failed' && canRetryBatch(activeJob) && (
              <button type="button" className={primary} disabled={!!activity} onClick={() => void retryBatch(activeJob.id)}>
                <RefreshCw aria-hidden="true" className="h-4 w-4" />Tentar novamente
              </button>
            )}
            {!isJobRunning && !canRetryBatch(activeJob) && (
              <button type="button" className={primary} disabled={!!activity} onClick={() => void reuploadForBatch(activeJob)}>
                <Upload aria-hidden="true" className="h-4 w-4" />Reenviar arquivos
              </button>
            )}
            {!isJobRunning && (
              <button type="button" className={secondary} disabled={!!activity} onClick={() => void discardDraft(activeJob.id)}>
                <Trash2 aria-hidden="true" className="h-4 w-4" />Descartar lote
              </button>
            )}
            {!isJobRunning && (
              <button type="button" className="text-xs font-semibold text-slate-600 hover:underline px-2 py-1 cursor-pointer" onClick={() => setActiveJob(null)}>
                Fechar aviso
              </button>
            )}
          </div>
        </div>
      </div>
    )}

    {wizardStage === 'files' && !draft && <>
      <div
        ref={dropzoneRef}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          if (!activity && !isJobRunning && e.dataTransfer.files?.length) selectFiles(Array.from(e.dataTransfer.files));
        }}
        className="space-y-3 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/35 p-4 sm:p-5"
      >
        <input className="peer sr-only" id={inputId} type="file" multiple disabled={!!activity || isJobRunning}
          accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.csv"
          onChange={event => { selectFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={inputId} className={secondary + ' peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500' + (activity || isJobRunning ? ' pointer-events-none opacity-50' : '')}>
            <Upload aria-hidden="true" className="h-4 w-4" />Selecionar arquivos
          </label>
          <span className="text-xs font-semibold text-slate-600">
            {files.length}/8 arquivos · {(totalBytes / MB).toFixed(2)} / 12 MB
          </span>
        </div>
        <p className="text-xs text-slate-600">
          Arraste ou envie JPG, PNG, WebP, PDF, DOCX, XLSX ou CSV UTF-8. Vários arquivos enviados juntos são cruzados em um catálogo único sem duplicar modalidades.
        </p>
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          As imagens e documentos são temporários e excluídos automaticamente após a extração, confirmação ou cancelamento (máx. 24h se pendentes).
        </p>
        {files.length > 0 && <ul className="grid gap-2 sm:grid-cols-2" aria-label="Arquivos selecionados">
          {files.map((file, index) => <li key={index} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
            <FileThumbnail file={file} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
              <p className="text-xs text-slate-500">{Math.max(1, Math.round(file.size / 1024))} KB</p>
            </div>
            <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 cursor-pointer" disabled={!!activity || isJobRunning}
              aria-label={'Remover ' + file.name} onClick={() => setFiles(files.filter((_, i) => i !== index))}><X className="h-4 w-4" /></button>
          </li>)}
        </ul>}
        <button type="button" className={primary} disabled={!!activity || isJobRunning || files.length === 0} onClick={() => void run('reading', async () => {
          const encoded = await Promise.all(files.map(encode));
          setActivity('analyzing');
          const analyzed = await postJsonWithTimeout<ImportDraft | DraftListItem>(endpoint + '/analyze', { files: encoded, async: true, reanalyze: true }, 30_000);
          setFiles([]);
          return analyzed;
        })}><Sparkles aria-hidden="true" className="h-4 w-4" />Analisar catálogo com IA</button>
      </div>

      {draftError && <p className="text-sm text-rose-800">{draftError} <button type="button" className="underline" onClick={() => void refreshDrafts()}>Tentar novamente</button></p>}

      {openDrafts.length > 0 && <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">Rascunhos e análises recentes</h3>
        <div className="space-y-2">
          {openDrafts.map(item => {
            const badge = statusBadge(item);
            return <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
              <button type="button" disabled={!!activity} className="flex flex-1 min-w-0 items-center gap-2 text-left text-sm font-semibold text-slate-800 hover:text-indigo-700 px-2 py-1 cursor-pointer"
                onClick={() => void run('opening', () => ApiClient.get<ImportDraft | DraftListItem>(endpoint + '/' + item.id))}>
                <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-600" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.sources.map(s => s.fileName).join(', ')}</span>
                  {item.status === 'failed' && item.errorMessage && (
                    <span className="block truncate text-[11px] font-normal text-slate-500">
                      {item.errorMessage}{item.requestId ? ` · Protocolo ${item.requestId}` : ''}
                    </span>
                  )}
                </span>
              </button>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                {badge.label}
              </span>
              {item.tempPurgedAt && item.status === 'ready' && (
                <span className="text-[11px] text-emerald-700 font-medium hidden sm:inline">Arquivos originais removidos</span>
              )}
              {item.status === 'failed' && canRetryBatch(item) && (
                <button type="button" disabled={!!activity || isJobRunning} onClick={() => void retryBatch(item.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 cursor-pointer disabled:opacity-50">
                  <RefreshCw className="h-3.5 w-3.5" />Retentar
                </button>
              )}
              {(item.status === 'failed' || item.status === 'cancelled') && !canRetryBatch(item) && (
                <button type="button" disabled={!!activity} onClick={() => void reuploadForBatch(item)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50">
                  <Upload className="h-3.5 w-3.5" />Reenviar arquivos
                </button>
              )}
              {(item.status === 'queued' || item.status === 'processing') && (
                <button type="button" disabled={!!activity} onClick={() => void cancelBatch(item.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
                  Cancelar
                </button>
              )}
              <button type="button" disabled={!!activity} onClick={() => void discardDraft(item.id)}
                aria-label="Descartar rascunho" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700 cursor-pointer">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>;
          })}
        </div>
      </div>}

      {completedHistory.length > 0 && <details className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
        <summary className="cursor-pointer font-bold text-slate-700 flex items-center gap-1.5">
          <History className="h-4 w-4 text-slate-500" /> Histórico de importações concluídas ({completedHistory.length})
        </summary>
        <ul className="mt-2 space-y-1.5">
          {completedHistory.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2">
              <button type="button" disabled={!!activity} onClick={() => void run('opening_history', () => ApiClient.get<ImportDraft>(endpoint + '/' + item.id))}
                className="font-semibold text-slate-800 hover:text-indigo-700 text-left truncate cursor-pointer">
                {item.sources.map(s => s.fileName).join(', ')}
              </button>
              <span className="text-[11px] text-emerald-700 font-semibold">
                {item.result?.services.length || 0} serviços · {item.result?.packages.length || 0} pacotes
              </span>
            </li>
          ))}
        </ul>
      </details>}
    </>}

    {(wizardStage === 'completed' || wizardStage === 'history_view') && draft?.result && <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-base">
          <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-emerald-600" />
          {wizardStage === 'history_view' ? 'Resumo de importação anterior' : 'Importação concluída e verificada no catálogo oficial'}
        </h3>
        {(catalogVerifiedCount !== null || draft.result.verifiedCatalogCount !== undefined) && (
          <span className="rounded-full bg-white border border-emerald-300 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
            {catalogVerifiedCount !== null
              ? `${catalogVerifiedCount} serviço(s) verificado(s) no catálogo ativo`
              : `${draft.result.verifiedCatalogCount} registro(s) verificado(s) no banco`}
          </span>
        )}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 text-sm">
        {[...draft.result.services, ...draft.result.packages].map(row => {
          const actionLabel = row.action === 'link'
            ? 'Vinculado ao existente'
            : row.action === 'update'
              ? (row.published === false ? 'Atualizado — Não publicado' : 'Atualizado e publicado')
              : (row.published === false ? 'Cadastrado — Não publicado' : 'Cadastrado e publicado');
          return (
            <li key={row.key} className="rounded-xl bg-white/90 border border-emerald-200 px-3 py-2 font-medium flex flex-wrap items-center justify-between gap-1.5">
              <span>{row.name}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className={`font-bold ${row.published === false ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {actionLabel}
                </span>
                {Number(row.priceOptionsCreated || 0) > 0 && (
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                    +{row.priceOptionsCreated} plano(s)
                  </span>
                )}
                {Number(row.schedulesCreated || 0) > 0 && (
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                    +{row.schedulesCreated} horário(s)
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {((draft.result.ignoredServices?.length || 0) > 0 || (draft.result.ignoredPackages?.length || 0) > 0) && (
        <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-700">
          <span className="font-bold text-slate-800">Ignorados na revisão (não cadastrados): </span>
          {[...(draft.result.ignoredServices || []), ...(draft.result.ignoredPackages || [])].map(i => i.name).join(', ')}
        </div>
      )}
      <div className="pt-1 flex flex-wrap gap-2">
        <button type="button" className={secondary} onClick={() => { setDraft(null); setWizardStage('files'); setCatalogVerifiedCount(null); setMessage(''); setError(''); }}>
          Nova importação
        </button>
      </div>
    </div>}

    {wizardStage === 'review' && draft && !draft.result && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-900">Revisar catálogo extraído</h3>
            {draft.tempPurgedAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <ShieldCheck className="h-3 w-3" />Arquivos originais excluídos
              </span>
            )}
          </div>
          <p className="break-words text-xs text-slate-600">Fontes ({draft.sources.length}): {draft.sources.map(s => s.fileName + (s.copies > 1 ? ` (${s.copies}x)` : '')).join(', ')}.</p>
        </div>
        <button type="button" className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer" onClick={() => void discardDraft(draft.id)}>
          Descartar lote
        </button>
      </div>

      <fieldset disabled={!!activity} className="min-w-0">
        <StudioCatalogImportReview draft={draft} onChange={proposal => { setDraft({ ...draft, proposal }); setConfirming(false); setMessage(''); }} />
      </fieldset>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        {previewCounts && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 space-y-1.5">
            <div className="font-bold text-slate-900">Prévia do que será aplicado no catálogo oficial:</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span><strong>Criar:</strong> {previewCounts.createServices} serviços, {previewCounts.prices} planos comerciais, {previewCounts.schedules} horários na grade, {previewCounts.createPackages} pacotes.</span>
              <span><strong>Vincular / Atualizar:</strong> {previewCounts.updateServices + previewCounts.linkServices} serviços, {previewCounts.linkPackages} pacotes.</span>
              <span><strong>Ignorados:</strong> {previewCounts.ignoreServices} serviços, {previewCounts.ignorePackages} pacotes.</span>
            </div>
          </div>
        )}

        {confirming && <p className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-sm font-medium text-indigo-900" role="status">
          Confirme abaixo para gravar definitivamente no cadastro oficial de Serviços &amp; Pacotes. Serviços marcados para exibição pública ficam disponíveis imediatamente no link público do estabelecimento.
        </p>}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={secondary} disabled={!!activity} onClick={() => void run('saving',
            () => ApiClient.put<ImportDraft>(endpoint + '/' + draft.id, { proposal: draft.proposal, revision: draft.revision }),
            'Rascunho salvo com diagnóstico atualizado.')}>
            <Save aria-hidden="true" className="h-4 w-4" />Salvar rascunho
          </button>
          <button type="button" className={primary} disabled={!ready || !!activity} onClick={() => {
            if (!confirming) { setConfirming(true); return; }
            void run('confirming', () => ApiClient.post<ImportDraft>(endpoint + '/' + draft.id + '/confirm',
              { confirmed: true, proposal: draft.proposal, revision: draft.revision }));
          }}>{confirming ? 'Confirmar e gravar no catálogo' : 'Revisar prévia e importar'}</button>
          <button type="button" className={secondary} disabled={!!activity} onClick={() => {
            if (confirming) { setConfirming(false); return; }
            if (!window.confirm('Voltar à lista de arquivos? Salve o rascunho antes se fez alterações recentes.')) return;
            setDraft(null); setWizardStage('files'); setConfirming(false); setError(''); setErrorDetails(null); setMessage('');
          }}>{confirming ? 'Voltar à edição' : 'Voltar aos arquivos'}</button>
        </div>
        {!ready && (
          <p className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            {selected.length === 0
              ? 'Todos os registros foram ignorados; nenhum cadastro será realizado. Selecione Criar, Atualizar ou Vincular em ao menos 1 item para importar.'
              : `Ainda falta marcar "Revisado" em ${selected.filter(r => !r.reviewed).length} item(ns) selecionado(s) para liberar a confirmação de importação.`}
          </p>
        )}
      </div>
    </>}
  </section>;
}
