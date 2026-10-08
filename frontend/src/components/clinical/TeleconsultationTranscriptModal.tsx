import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import type { TeleconsultationAppointment } from '../calendar/TeleconsultationModal';

export function TranscriptionHelp() {
  return <details className="relative group text-xs text-slate-600"><summary aria-label="Ajuda sobre Transcrição & IA" title="Como usar a transcrição" className="cursor-pointer list-none rounded-full border border-indigo-200 w-7 h-7 flex items-center justify-center font-bold">?</summary>
    <p className="mt-2 rounded-xl bg-white border border-indigo-100 p-3 max-w-md leading-relaxed">Você pode usar a Transcrição Zemda durante o atendimento ou a transcrição do Google Meet. No Meet, quando disponível na sua conta, ative a transcrição. Ao finalizar, copie o texto e cole em “Importar transcrição do Google Meet”. O Zemda organiza o conteúdo conforme sua área para revisão antes de salvar.</p>
  </details>;
}

export function TeleconsultationTranscriptModal({ appointment, onClose, onInsert }: {
  appointment: TeleconsultationAppointment; onClose: () => void; onInsert?: (text: string) => void;
}) {
  const speech = useSpeechRecognition();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [source, setSource] = useState<'zemda' | 'meet'>('zemda');
  const [consent, setConsent] = useState(false);
  const [meetConsent, setMeetConsent] = useState(false);
  const [imported, setImported] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [resolvedModule, setResolvedModule] = useState(appointment.clinical_module || appointment.service_clinical_module || '');
  const dialog = useRef<HTMLElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { alive.current = false; previous?.focus(); };
  }, []);
  if (appointment.modality !== 'online') return null;
  const transcript = source === 'meet' ? imported : speech.transcript;
  const authorized = source === 'meet' ? meetConsent : consent;
  const close = () => {
    if ((transcript.trim() || draft || busy || speech.isListening) && !window.confirm('Fechar e descartar a transcrição e o rascunho desta janela?')) return;
    onClose();
  };
  const organize = async () => {
    if (!authorized || !transcript.trim() || busy) return;
    setBusy(true);
    try {
      const result = await ApiClient.post<{ organizedText: string; clinical_module?: string }>('/v1/ai/organize-evolution', {
        teleconsultation: true, transcript, mode: 'organize', appointmentId: appointment.id,
        patientId: appointment.patient_id, professionalId: appointment.professional_id,
        profession: appointment.profession || currentUser?.professionName || '',
        clinical_module: appointment.clinical_module || appointment.service_clinical_module || 'general'
      });
      if (!alive.current) return;
      if (!result.organizedText?.trim()) throw new Error('Não foi possível organizar a transcrição.');
      setDraft(result.organizedText); setReviewed(false); setEditing(false);
      setResolvedModule(result.clinical_module || resolvedModule);
    } catch (err: any) { if (alive.current) showToast(err.message || 'Falha na IA. A transcrição foi preservada.', 'error'); }
    finally { if (alive.current) setBusy(false); }
  };
  const button = 'rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-40';
  return createPortal(<div className="fixed inset-0 z-[12000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onKeyDown={e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, summary, [tabindex="0"]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Transcrição & IA" className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92dvh] overflow-auto outline-none">
      <header className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex justify-between items-start gap-3 z-10">
        <div><h2 className="text-lg font-bold text-slate-900">{draft ? '✨ Organização da Teleconsulta' : 'Transcrição & IA'}</h2><p className="text-xs text-slate-500 mt-1">{appointment.patient_name || 'Atendimento online'}{resolvedModule ? ` • ${resolvedModule}` : ''} • Rascunho para revisão</p></div>
        <button type="button" onClick={close} aria-label="Fechar Transcrição & IA" className={button}>✕</button>
      </header>
      <div className="p-5 space-y-4">
        <p className="text-xs text-slate-600 bg-indigo-50 rounded-xl p-3">A transcrição bruta não é salva automaticamente. Apenas o conteúdo revisado e aplicado por você segue para a evolução.</p>
        {!draft ? <>
          <div className="grid sm:grid-cols-2 gap-2" role="group" aria-label="Origem da transcrição">
            <button type="button" disabled={busy} aria-pressed={source === 'zemda'} className={`${button} ${source === 'zemda' ? 'border-indigo-500 text-indigo-700 bg-indigo-50' : ''}`} onClick={() => setSource('zemda')}>🎙 Transcrição Zemda</button>
            <button type="button" disabled={busy || speech.isListening || speech.isPaused} aria-pressed={source === 'meet'} className={`${button} ${source === 'meet' ? 'border-indigo-500 text-indigo-700 bg-indigo-50' : ''}`} onClick={() => setSource('meet')}>📋 Importar transcrição do Google Meet</button>
          </div>
          {source === 'meet' ? <>
            <label className="flex gap-2 text-sm items-start"><input type="checkbox" checked={meetConsent} onChange={e => setMeetConsent(e.target.checked)} />Confirme que o paciente foi informado sobre a utilização da transcrição para apoio ao registro profissional.</label>
            <label className="block text-sm font-medium">Transcrição do Google Meet<textarea aria-label="Transcrição do Google Meet" disabled={busy} maxLength={100000} value={imported} onChange={e => setImported(e.target.value)} rows={10} placeholder="Cole aqui a transcrição gerada pelo Google Meet…" className="block mt-2 w-full border border-slate-200 rounded-xl p-3 font-normal" /></label>
          </> : <>
            <p className="text-xs text-slate-500">Usa o microfone deste navegador. Não captura diretamente o áudio da aba do Meet.</p>
            <label className="flex gap-2 items-start text-sm"><input type="checkbox" disabled={speech.isListening || speech.isPaused} checked={consent} onChange={e => setConsent(e.target.checked)} />Confirmo que o paciente foi informado e autorizou a transcrição deste atendimento.</label>
            {!speech.isSupported && <p role="alert" className="text-sm text-amber-800">Navegador sem suporte à transcrição. Use Chrome ou Edge, ou importe o texto do Meet.</p>}
            <div className="flex flex-wrap gap-2">
              {!speech.isListening && !speech.isPaused && <button type="button" className={button} disabled={!consent || !speech.isSupported || busy} onClick={() => { if (!speech.transcript || window.confirm('Iniciar uma nova transcrição e descartar a anterior?')) speech.startListening(); }}>Iniciar transcrição</button>}
              {speech.isListening && <button type="button" className={button} onClick={speech.pauseListening}>Pausar</button>}
              {speech.isPaused && <button type="button" className={button} onClick={speech.resumeListening}>Continuar</button>}
              {(speech.isListening || speech.isPaused) && <button type="button" className={button} onClick={speech.stopListening}>Finalizar</button>}
            </div>
            <p role="status" className="text-xs text-indigo-700">{speech.statusLabel}</p>
            {speech.errorMessage && <p role="alert">{speech.errorMessage}</p>}
            <div className="min-h-24 max-h-64 overflow-auto whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm">{speech.transcript || 'A transcrição aparecerá aqui.'}</div>
          </>}
          <button type="button" disabled={busy || !authorized || !transcript.trim() || speech.isListening || speech.isPaused} onClick={organize} className="bg-indigo-600 text-white rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-40">{busy ? 'Organizando…' : '✨ Organizar com IA'}</button>
        </> : <>
          {editing ? <label className="block text-sm font-medium">Edite o conteúdo antes de aplicar<textarea aria-label="Rascunho da transcrição" rows={14} value={draft} onChange={e => { setDraft(e.target.value); setReviewed(false); }} className="mt-2 w-full border border-indigo-200 rounded-xl p-3 font-normal" /></label>
            : <div className="space-y-3">{draft.split(/(?=^\*\*[^\n]+\*\*)/m).filter(Boolean).map((part, i) => {
              const match = part.match(/^\*\*(.+?)\*\*:?\s*\n?([\s\S]*)/);
              return <section key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><h3 className="text-sm font-semibold text-indigo-800">{match?.[1] || 'Evolução sugerida'}</h3><p className="text-sm whitespace-pre-wrap text-slate-700 mt-2">{match?.[2] || part}</p></section>;
            })}</div>}
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />Revisei o conteúdo.</label>
          <p className="text-xs text-slate-500">Ao aplicar, o texto é acrescentado à evolução, preservando o conteúdo existente.</p>
          <div className="flex flex-wrap gap-2">
            {onInsert && <button type="button" disabled={!reviewed || !draft.trim()} className="bg-indigo-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40" onClick={() => { onInsert(draft.trim()); onClose(); showToast('Conteúdo revisado acrescentado à evolução.', 'success'); }}>Aplicar à evolução</button>}
            <button type="button" className={button} onClick={async () => { try { await navigator.clipboard.writeText(draft); showToast('Rascunho copiado para revisão.', 'success'); } catch { showToast('Não foi possível copiar. Use Editar para selecionar o texto.', 'error'); } }}>Copiar</button>
            <button type="button" className={button} onClick={() => setEditing(!editing)}>{editing ? 'Concluir edição' : 'Editar'}</button>
            <button type="button" className={button} onClick={() => { if (window.confirm('Descartar o rascunho gerado?')) { setDraft(''); setReviewed(false); } }}>Descartar</button>
          </div>
          {!onInsert && <p className="text-xs text-slate-500">Copie o conteúdo revisado e abra o prontuário para inseri-lo na evolução.</p>}
        </>}
      </div>
    </section>
  </div>, document.body);
}
