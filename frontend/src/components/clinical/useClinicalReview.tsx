import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClinicalReviewContent } from './ClinicalReviewContent';

type ReviewData = Record<string, any>;

// Preserve explicit false and zero; omit only values that were not assessed.
export function populatedClinicalData(value: any): any {
  if (value === null || value === undefined || value === '' || value === 'not_tested') return undefined;
  if (Array.isArray(value)) {
    const items = value.map(populatedClinicalData).filter(item => item !== undefined);
    return items.length ? items : undefined;
  }
  if (typeof value === 'object') {
    // Catalog rows and normative references alone are not performed assessments.
    const empty = (item: unknown) => item === undefined || item === null || item === '' || item === 'not_tested';
    const measurements = ['result', 'score', 'rightGrade', 'leftGrade', 'right', 'left'];
    const presentMeasurements = measurements.filter(key => Object.prototype.hasOwnProperty.call(value, key));
    if (presentMeasurements.length && presentMeasurements.every(key => empty(value[key])) && empty(value.notes)) return undefined;
    const entries = Object.entries(value).map(([key, item]) => [key, populatedClinicalData(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

export function useClinicalReview(contextKey?: string) {
  const [data, setData] = useState<ReviewData | null>(null);
  const pending = useRef<((accepted: boolean) => void) | null>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const settle = (accepted: boolean) => {
    pending.current?.(accepted);
    pending.current = null;
    setData(null);
  };
  useEffect(() => {
    settle(false);
    return () => { pending.current?.(false); pending.current = null; };
  }, [contextKey]);
  useEffect(() => { if (data) backButton.current?.focus(); }, [data]);

  const confirm = (payload: ReviewData) => new Promise<boolean>(resolve => {
    pending.current?.(false);
    pending.current = resolve;
    const { evolution, ...root } = payload;
    setData(structuredClone({ ...root, ...evolution, ...evolution?.moduleData }));
  });

  const dialog = data && createPortal(
    <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      onKeyDown={event => {
        if (event.key === 'Escape') settle(false);
        if (event.key === 'Tab') {
          const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
          const first = buttons[0], last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
      <section role="dialog" aria-modal="true" aria-labelledby={headingId} className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[92dvh] min-w-0 flex flex-col">
        <header className="px-4 py-3 shrink-0 border-b border-slate-200">
          <h2 id={headingId} className="text-lg font-bold text-slate-900">Resumo do atendimento</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 mt-2 break-words text-xs text-slate-600">
            <div><dt className="font-bold">Paciente</dt><dd>{data.patientName || 'Paciente selecionado'}</dd></div>
            <div><dt className="font-bold">Profissional</dt><dd>{data.professionalName || 'Profissional responsável pelo atendimento'}</dd></div>
            <div><dt className="font-bold">Data</dt><dd>{data.sessionDate ? (/^\d{4}-\d{2}-\d{2}/.test(data.sessionDate) ? new Date(data.sessionDate.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : data.sessionDate) : new Date().toLocaleDateString('pt-BR')}</dd></div>
            <div><dt className="font-bold">Especialidade / módulo</dt><dd>{data.serviceName || (data.moduleType === 'general' ? 'Atendimento Profissional' : data.moduleType) || data.title || 'Atendimento clínico'}</dd></div>
          </dl>
        </header>
        <div className="min-h-0 flex-1 px-4 py-3 sm:px-5 overflow-y-auto overflow-x-hidden bg-slate-50/60 [scrollbar-width:thin]">
          <ClinicalReviewContent data={populatedClinicalData(data) || {}} />
        </div>
        <footer className="px-4 py-3 shrink-0 border-t border-slate-200 bg-white flex justify-end gap-2">
          <button ref={backButton} type="button" onClick={() => settle(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold">Voltar e editar</button>
          <button type="button" onClick={() => settle(true)} className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-bold">Finalizar atendimento</button>
        </footer>
      </section>
    </div>, document.body
  );
  return { confirm, dialog };
}
