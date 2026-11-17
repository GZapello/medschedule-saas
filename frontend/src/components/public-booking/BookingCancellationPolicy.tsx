import React, { useEffect, useId, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

interface PolicySource {
  booking_cancellation_policy_enabled?: number;
  booking_cancellation_policy_text?: string | null;
}

export function BookingCancellationPolicyEditor({ source, endpoint, onSaved }: {
  source: PolicySource; endpoint: string; onSaved: (value: PolicySource) => void;
}) {
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(source.booking_cancellation_policy_enabled === 1);
  const [text, setText] = useState(source.booking_cancellation_policy_text || '');
  const [saving, setSaving] = useState(false);
  const id = useId();
  useEffect(() => {
    setEnabled(source.booking_cancellation_policy_enabled === 1);
    setText(source.booking_cancellation_policy_text || '');
  }, [endpoint, source.booking_cancellation_policy_enabled, source.booking_cancellation_policy_text]);
  const save = async () => {
    if (saving) return;
    if (enabled && !text.trim()) { showToast('Escreva a política de cancelamento antes de ativá-la.', 'error'); return; }
    setSaving(true);
    try {
      const result = await ApiClient.put<PolicySource>(endpoint, { bookingCancellationPolicy: { enabled, text } });
      onSaved(result);
      showToast('Política de cancelamento salva.', 'success');
    } catch (error: any) { showToast(error.message || 'Não foi possível salvar a política.', 'error'); }
    finally { setSaving(false); }
  };
  return <section className="space-y-2.5 border-t border-slate-200/70 pt-3 min-w-0" aria-label="Política de cancelamento">
    <h5 className="text-xs font-bold text-slate-900">Política de cancelamento</h5>
    <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-700" htmlFor={id}>
      Ativar política de cancelamento
      <button id={id} type="button" role="switch" aria-checked={enabled} aria-label="Ativar política de cancelamento" disabled={saving}
        onClick={() => setEnabled(!enabled)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 ${enabled ? 'bg-teal-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${enabled ? 'left-5' : 'left-0.5'}`} />
      </button>
    </label>
    <p className="text-[11px] text-slate-500">Defina as condições para cancelamento ou reagendamento. A política ficará disponível para consulta durante o agendamento online.</p>
    {enabled && <label className="block text-xs font-medium text-slate-700">Texto da política
      <textarea value={text} onChange={event => setText(event.target.value)} maxLength={10000} rows={5} disabled={saving}
        className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-normal focus:outline-none focus:ring-1 focus:ring-teal-500" />
    </label>}
    <button type="button" disabled={saving} onClick={save} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50">
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Salvar política
    </button>
  </section>;
}

export function BookingCancellationPolicyReader({ source }: { source?: PolicySource | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  if (source?.booking_cancellation_policy_enabled !== 1 || !source.booking_cancellation_policy_text?.trim()) return null;
  return <div className="my-3 text-center">
    <button type="button" onClick={() => dialog.current?.showModal()} className="text-xs font-medium text-teal-700 underline underline-offset-2 hover:text-teal-900">Ver política de cancelamento</button>
    <dialog ref={dialog} aria-labelledby={title} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[85vh] rounded-2xl border border-slate-200 bg-white p-0 text-left text-slate-900 shadow-xl backdrop:bg-slate-900/50">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
        <h2 id={title} className="text-base font-bold">Política de cancelamento</h2>
        <button type="button" aria-label="Fechar política de cancelamento" onClick={() => dialog.current?.close()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap break-words p-4 text-sm text-slate-700">{source.booking_cancellation_policy_text}</div>
      <div className="border-t border-slate-100 p-4 text-right"><button type="button" onClick={() => dialog.current?.close()} className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800">Fechar</button></div>
    </dialog>
  </div>;
}
