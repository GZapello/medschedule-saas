import React, { useEffect, useId, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Save, Sparkles, Upload, X } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { ImportDraft, ImportSource, StudioCatalogImportReview } from './StudioCatalogImportReview';

const endpoint = '/v1/studio/catalog-imports';
const formats = /\.(jpe?g|png|webp|pdf|docx|xlsx|csv)$/i;
const MB = 1024 * 1024;
const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
type DraftListItem = { id: string; sources: ImportSource[]; updatedAt: string };
type Activity = 'reading' | 'analyzing' | 'opening' | 'saving' | 'confirming';
const activityLabels: Record<Activity, string> = {
  reading: 'Preparando os arquivos…', analyzing: 'Analisando os arquivos com IA…', opening: 'Abrindo rascunho…',
  saving: 'Salvando rascunho…', confirming: 'Cadastrando registros aprovados…'
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
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);

  async function refreshDrafts(signal?: AbortSignal) {
    try {
      setDrafts(await ApiClient.get<DraftListItem[]>(endpoint, { signal }));
      setDraftError('');
    } catch {
      if (!signal?.aborted) setDraftError('Não foi possível carregar os rascunhos.');
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
      setError('Use arquivos compatíveis de até 5 MB cada. Arquivos vazios não podem ser analisados.');
      return;
    }
    if (all.length > 8 || all.reduce((bytes, file) => bytes + file.size, 0) > 12 * MB) {
      setError('Envie até 8 arquivos, com limite de 12 MB no total.');
      return;
    }
    setFiles(all);
  }

  async function run(task: Activity, operation: () => Promise<ImportDraft>, success = '') {
    if (activity) return;
    setActivity(task);
    setError('');
    setMessage('');
    try {
      setDraft(await operation());
      setMessage(success);
      setConfirming(false);
      void refreshDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao processar a importação.');
      setConfirming(false);
    } finally { setActivity(null); }
  }

  const selected = draft ? [...draft.proposal.services, ...draft.proposal.packages].filter(row => row.action !== 'ignore') : [];
  const ready = selected.length > 0 && selected.every(row => row.reviewed);

  return <section className="min-w-0 space-y-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6" aria-labelledby={inputId + '-heading'}>
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><Sparkles aria-hidden="true" className="h-5 w-5" /></div>
      <div className="min-w-0">
        <h2 id={inputId + '-heading'} className="text-lg font-bold text-slate-900">Importar Serviços com IA</h2>
        <p className="text-sm text-slate-600">Envie seu catálogo ou tabela de preços. Revise os serviços, os planos e os horários identificados antes do cadastro.</p>
      </div>
    </div>

    {activity && <p role="status" className="flex items-center gap-2 rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-800">
      <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />{activityLabels[activity]}
    </p>}
    {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
      <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />{error}
    </p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

    {!draft && <>
      <div className="space-y-3 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
        <input className="peer sr-only" id={inputId} type="file" multiple disabled={!!activity}
          accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.csv"
          onChange={event => { selectFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
        <label htmlFor={inputId} className={secondary + ' cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500' + (activity ? ' pointer-events-none opacity-50' : '')}>
          <Upload aria-hidden="true" className="h-4 w-4" />Selecionar arquivos
        </label>
        <p className="text-xs text-slate-600">JPG, PNG, WebP, PDF, DOCX, XLSX ou CSV em UTF-8. Até 8 arquivos, 5 MB por arquivo e 12 MB no total.</p>
        {files.length > 0 && <ul className="space-y-2" aria-label="Arquivos selecionados">
          {files.map((file, index) => <li key={index} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
            <FileThumbnail file={file} />
            <div className="min-w-0 flex-1">
              <p className="break-all text-sm font-semibold text-slate-800">{file.name}</p>
              <p className="text-xs text-slate-600">{Math.max(1, Math.round(file.size / 1024))} KB</p>
            </div>
            <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700" disabled={!!activity}
              aria-label={'Remover ' + file.name} onClick={() => setFiles(files.filter((_, i) => i !== index))}><X className="h-4 w-4" /></button>
          </li>)}
        </ul>}
        <button type="button" className={primary} disabled={!!activity || files.length === 0} onClick={() => void run('reading', async () => {
          const encoded = await Promise.all(files.map(encode));
          setActivity('analyzing');
          const analyzed = await ApiClient.post<ImportDraft>(endpoint + '/analyze', { files: encoded });
          setFiles([]);
          return analyzed;
        })}><Sparkles aria-hidden="true" className="h-4 w-4" />Analisar com IA</button>
      </div>
      {draftError && <p className="text-sm text-rose-800">{draftError} <button type="button" className="underline" onClick={() => void refreshDrafts()}>Tentar novamente</button></p>}
      {drafts.length > 0 && <div className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">Rascunhos</h3>
        {drafts.map(item => <button type="button" key={item.id} disabled={!!activity} className={secondary + ' w-full justify-start text-left'}
          onClick={() => void run('opening', () => ApiClient.get<ImportDraft>(endpoint + '/' + item.id))}>
          <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 break-all">{item.sources.map(s => s.fileName).join(', ')}</span>
        </button>)}
      </div>}
    </>}

    {draft?.result && <div className="space-y-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
      <h3 className="flex items-center gap-2 font-bold"><CheckCircle2 aria-hidden="true" className="h-5 w-5" />Importação concluída</h3>
      <ul className="space-y-1 text-sm">{[...draft.result.services, ...draft.result.packages].map(row =>
        <li key={row.key} className="break-words">{row.name} · {row.action === 'link' ? 'Vinculado' : row.action === 'update' ? 'Atualizado' : 'Cadastrado'}</li>)}</ul>
      <button type="button" className={secondary} onClick={() => { setDraft(null); setMessage(''); }}>Nova importação</button>
    </div>}

    {draft && !draft.result && <>
      <div className="space-y-1">
        <h3 className="font-bold text-slate-900">Revisar proposta</h3>
        <p className="break-words text-xs text-slate-600">Fontes: {draft.sources.map(s => s.fileName + (s.copies > 1 ? ' (' + s.copies + ' cópias reunidas)' : '')).join(', ')}.</p>
        <p className="text-sm text-slate-600">Abra os registros que deseja cadastrar, confira os dados e escolha uma ação em cada um.</p>
      </div>
      <fieldset disabled={!!activity} className="min-w-0">
        <StudioCatalogImportReview draft={draft} onChange={proposal => { setDraft({ ...draft, proposal }); setConfirming(false); setMessage(''); }} />
      </fieldset>
      <div className="space-y-3 border-t border-slate-100 pt-4">
        <p className="text-sm font-semibold text-slate-800">{selected.length} {selected.length === 1 ? 'registro selecionado' : 'registros selecionados'}</p>
        {confirming && <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900" role="status">
          Serão aplicadas as ações aprovadas nos registros selecionados. Novos serviços e pacotes entram no catálogo interno.
        </p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} disabled={!!activity} onClick={() => void run('saving',
            () => ApiClient.put<ImportDraft>(endpoint + '/' + draft.id, { proposal: draft.proposal, revision: draft.revision }),
            'Rascunho salvo. Você pode reabri-lo nesta página.')}>
            <Save aria-hidden="true" className="h-4 w-4" />Salvar rascunho
          </button>
          <button type="button" className={primary} disabled={!ready || !!activity} onClick={() => {
            if (!confirming) { setConfirming(true); return; }
            void run('confirming', () => ApiClient.post<ImportDraft>(endpoint + '/' + draft.id + '/confirm',
              { confirmed: true, proposal: draft.proposal, revision: draft.revision }));
          }}>{confirming ? 'Confirmar e cadastrar' : 'Confirmar importação'}</button>
          <button type="button" className={secondary} disabled={!!activity} onClick={() => {
            if (confirming) { setConfirming(false); return; }
            if (!window.confirm('Voltar à lista? Alterações feitas desde o último salvamento serão descartadas.')) return;
            setDraft(null); setError(''); setMessage('');
          }}>{confirming ? 'Voltar à revisão' : 'Voltar aos arquivos'}</button>
        </div>
      </div>
      {error && <p className="text-sm font-semibold text-rose-800">{error}</p>}
    </>}
  </section>;
}
