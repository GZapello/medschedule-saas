import React from 'react';

const fieldClass = 'w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-teal-500 outline-none';
export function ClinicalTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...props} value={props.value ?? ''} className={`${fieldClass} ${props.className || ''}`} />;
}
export function ClinicalSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} value={props.value ?? ''} className={`${fieldClass} ${props.className || ''}`}><option value="">Não avaliado</option>{children}</select>;
}
export function ClinicalNumberInput({ value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
  value?: number | null | ''; onChange: (value: number | undefined) => void;
}) {
  return <input {...props} type="number" value={value ?? ''} onChange={event => onChange(Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : undefined)} className={`${fieldClass} ${props.className || ''}`} />;
}
