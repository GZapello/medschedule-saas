import React, { useEffect, useId, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  History,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import type { ImportDraft, ImportReceipt, ImportSource } from '../../types/studioCatalogImport';
import { StudioCatalogImportReview } from './StudioCatalogImportReview';

const endpoint = '/v1/studio/catalog-imports';
const formats = /\.(jpe?g|png|webp|pdf|docx|xlsx|csv)$/i;
const MB = 1024 * 1024;
const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer';

type DraftListItem = { id: string; sources: ImportSource[]; result?: ImportReceipt | null; updatedAt: string };
type Activity = 'reading' | 'analyzing' | 'opening' | 'saving' | 'confirming' | 'deleting';
const activityLabels: Record<Activity, string> = {
  reading: 'Preparando os arquivos…',
  analyzing: 'Analisando os arquivos em conjunto com IA…',
  opening: 'Abrindo rascunho…',
  saving: 'Salvando progresso do rascunho…',
  confirming: 'Validando e cadastrando no catálogo oficial…',
  deleting: 'Descartando rascunho…'
};

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

export function StudioCatalogImportView() {
  const inputId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [allRecords, setAllRecords] = useState<DraftListItem[]>([]);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);

  async function refreshDrafts(signal?: AbortSignal) {
    try {
      setAllRecords(await ApiClient.get<DraftListItem[]>(endpoint + '?includeCompleted=1', { signal }));
      setDraftError('');
    } catch {
      if (!signal?.aborted) setDraftError('Não foi possível carregar os rascunhos e histórico.');
    }
  }

  useEffect(() => {
    const abort = new AbortController();
    void refreshDrafts(abort.signal);
    return () => abort.abort();
  }, []);

  function selectFiles(next: File[]) {
    setError('');
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

  async function run(task: Activity, operation: () => Promise<ImportDraft | null>, success = '') {
    if (activity) return;
    setActivity(task);
    setError('');
    setMessage('');
    try {
      const nextDraft = await operation();
      setDraft(nextDraft);
      setMessage(success);
      setConfirming(false);
      void refreshDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao processar a importação.');
      setConfirming(false);
    } finally {
      setActivity(null);
    }
  }

  async function discardDraft(id: string) {
    if (activity || !window.confirm('Descartar este rascunho permanentemente?')) return;
    setActivity('deleting');
    setError('');
    try {
      await ApiClient.delete(endpoint + '/' + id);
      if (draft?.id === id) setDraft(null);
      await refreshDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao descartar rascunho.');
    } finally {
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
      <div className="flex items-center gap-1.5 text-[11px] font-bold">
        <span className={`rounded-full px-2.5 py-1 ${!draft ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700'}`}>1. Arquivos</span>
        <span className={`rounded-full px-2.5 py-1 ${draft && !draft.result ? 'bg-indigo-600 text-white' : draft?.result ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>2. Revisão</span>
        <span className={`rounded-full px-2.5 py-1 ${draft?.result ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>3. Concluído</span>
      </div>
    </div>

    {activity && <p role="status" className="flex items-center gap-2 rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-800">
      <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />{activityLabels[activity]}
    </p>}
    {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">
      <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" /><span>{error}</span>
    </p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm font-medium text-emerald-800">{message}</p>}

    {!draft && <>
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          if (!activity && e.dataTransfer.files?.length) selectFiles(Array.from(e.dataTransfer.files));
        }}
        className="space-y-3 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/35 p-4 sm:p-5"
      >
        <input className="peer sr-only" id={inputId} type="file" multiple disabled={!!activity}
          accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.csv"
          onChange={event => { selectFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={inputId} className={secondary + ' peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500' + (activity ? ' pointer-events-none opacity-50' : '')}>
            <Upload aria-hidden="true" className="h-4 w-4" />Selecionar arquivos
          </label>
          <span className="text-xs font-semibold text-slate-600">
            {files.length}/8 arquivos · {(totalBytes / MB).toFixed(2)} / 12 MB
          </span>
        </div>
        <p className="text-xs text-slate-600">
          Arraste ou envie JPG, PNG, WebP, PDF, DOCX, XLSX ou CSV UTF-8. Vários arquivos enviados juntos são cruzados em um catálogo único sem duplicar modalidades.
        </p>
        {files.length > 0 && <ul className="grid gap-2 sm:grid-cols-2" aria-label="Arquivos selecionados">
          {files.map((file, index) => <li key={index} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
            <FileThumbnail file={file} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
              <p className="text-xs text-slate-500">{Math.max(1, Math.round(file.size / 1024))} KB</p>
            </div>
            <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 cursor-pointer" disabled={!!activity}
              aria-label={'Remover ' + file.name} onClick={() => setFiles(files.filter((_, i) => i !== index))}><X className="h-4 w-4" /></button>
          </li>)}
        </ul>}
        <button type="button" className={primary} disabled={!!activity || files.length === 0} onClick={() => void run('reading', async () => {
          const encoded = await Promise.all(files.map(encode));
          setActivity('analyzing');
          const analyzed = await ApiClient.post<ImportDraft>(endpoint + '/analyze', { files: encoded });
          setFiles([]);
          return analyzed;
        })}><Sparkles aria-hidden="true" className="h-4 w-4" />Analisar catálogo com IA</button>
      </div>

      {draftError && <p className="text-sm text-rose-800">{draftError} <button type="button" className="underline" onClick={() => void refreshDrafts()}>Tentar novamente</button></p>}

      {openDrafts.length > 0 && <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">Rascunhos salvos para continuar</h3>
        <div className="space-y-2">
          {openDrafts.map(item => <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
            <button type="button" disabled={!!activity} className="flex flex-1 min-w-0 items-center gap-2 text-left text-sm font-semibold text-slate-800 hover:text-indigo-700 px-2 py-1 cursor-pointer"
              onClick={() => void run('opening', () => ApiClient.get<ImportDraft>(endpoint + '/' + item.id))}>
              <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-600" />
              <span className="truncate">{item.sources.map(s => s.fileName).join(', ')}</span>
            </button>
            <button type="button" disabled={!!activity} onClick={() => void discardDraft(item.id)}
              aria-label="Descartar rascunho" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700 cursor-pointer">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>)}
        </div>
      </div>}

      {completedHistory.length > 0 && <details className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
        <summary className="cursor-pointer font-bold text-slate-700 flex items-center gap-1.5">
          <History className="h-4 w-4 text-slate-500" /> Histórico de importações concluídas ({completedHistory.length})
        </summary>
        <ul className="mt-2 space-y-1.5">
          {completedHistory.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2">
              <button type="button" disabled={!!activity} onClick={() => void run('opening', () => ApiClient.get<ImportDraft>(endpoint + '/' + item.id))}
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

    {draft?.result && <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
      <h3 className="flex items-center gap-2 font-bold text-base"><CheckCircle2 aria-hidden="true" className="h-5 w-5 text-emerald-600" />Importação concluída no catálogo oficial</h3>
      <ul className="grid gap-1.5 sm:grid-cols-2 text-sm">{[...draft.result.services, ...draft.result.packages].map(row =>
        <li key={row.key} className="rounded-xl bg-white/80 border border-emerald-200 px-3 py-1.5 font-medium">
          {row.name} · <span className="font-bold text-emerald-700">{row.action === 'link' ? 'Vinculado' : row.action === 'update' ? 'Atualizado' : 'Cadastrado'}</span>
        </li>)}</ul>
      <div className="pt-1">
        <button type="button" className={secondary} onClick={() => { setDraft(null); setMessage(''); }}>Nova importação</button>
      </div>
    </div>}

    {draft && !draft.result && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="font-bold text-slate-900">Revisar catálogo extraído</h3>
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
            setDraft(null); setError(''); setMessage('');
          }}>{confirming ? 'Voltar à edição' : 'Voltar aos arquivos'}</button>
        </div>
        {!ready && (
          <p className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            {selected.length === 0
              ? 'Selecione ao menos 1 serviço ou pacote para Criar, Atualizar ou Vincular (ou use "Selecionar & aprovar itens prontos").'
              : `Ainda falta marcar "Revisado" em ${selected.filter(r => !r.reviewed).length} item(ns) selecionado(s) para liberar a prévia de importação.`}
          </p>
        )}
      </div>
    </>}
  </section>;
}
