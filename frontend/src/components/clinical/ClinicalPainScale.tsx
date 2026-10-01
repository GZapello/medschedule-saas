import React, { useId } from 'react';

export function ClinicalPainScale({ value, onChange, label = 'Dor (EVA)', disabled = false }: {
  value?: number | null | ''; onChange: (value: number | undefined) => void; label?: string; disabled?: boolean;
}) {
  const id = useId();
  const assessed = typeof value === 'number' && Number.isFinite(value);
  return <div className="space-y-3" data-clinical-scale="pain">
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-xs font-bold text-slate-700">{label}</label>
      <output htmlFor={id} aria-live="polite" className="text-sm font-extrabold text-rose-700">{assessed ? `EVA: ${value}/10` : 'Não avaliado'}</output>
      {assessed && !disabled && <button type="button" onClick={() => onChange(undefined)} className="text-xs text-slate-500">Limpar</button>}
    </div>
    <input id={id} type="range" min={0} max={10} step={1} disabled={disabled}
      value={assessed ? value : 0} aria-valuetext={assessed ? `${value} de 10` : 'Não avaliado'}
      onChange={event => onChange(Number(event.currentTarget.value))}
      onPointerUp={event => onChange(Number(event.currentTarget.value))}
      onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) onChange(Number(event.currentTarget.value)); }}
      className={`w-full accent-rose-600 cursor-pointer ${assessed ? '' : 'opacity-50'}`} />
    <div className="flex justify-between text-[10px] text-slate-500"><span>0: Sem dor</span><span>3: Leve</span><span>5: Moderada</span><span>8: Intensa</span><span>10: Insuportável</span></div>
  </div>;
}
