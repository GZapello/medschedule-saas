import React from 'react';

export interface BaseFieldProps {
  label: string;
  fieldKey: string;
  value: any;
  onChange?: (key: string, val: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  unit?: string;
  className?: string;
}

export const SectionCard: React.FC<{
  title: string;
  icon?: React.ReactNode;
  badge?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, icon, badge, description, children, className = '' }) => (
  <div className={`bg-slate-50/70 border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3.5 ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2.5">
      <div className="flex items-center gap-2">
        {icon && <span className="text-teal-600">{icon}</span>}
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">{title}</h3>
      </div>
      {badge && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100/70 text-teal-800 border border-teal-200/70">
          {badge}
        </span>
      )}
      {description && <p className="text-[11px] text-slate-500 w-full mt-0.5">{description}</p>}
    </div>
    {children}
  </div>
);

export const CompactInput: React.FC<BaseFieldProps & {
  type?: 'text' | 'number';
  step?: string;
}> = ({ label, fieldKey, value, onChange, placeholder, readOnly, unit, type = 'text', step, className = '' }) => (
  <div className={className}>
    <label className="block text-[11px] font-bold text-slate-700 mb-1 leading-tight">{label}</label>
    <div className="relative">
      <input
        type={type}
        step={step}
        placeholder={placeholder || '—'}
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        readOnly={readOnly}
        onChange={e => onChange?.(fieldKey, e.target.value)}
        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all placeholder:text-slate-400 font-normal"
      />
      {unit && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 select-none">
          {unit}
        </span>
      )}
    </div>
  </div>
);

export const CompactSelect: React.FC<BaseFieldProps & {
  options: Array<{ value: string; label: string }>;
}> = ({ label, fieldKey, value, onChange, readOnly, options, className = '' }) => (
  <div className={className}>
    <label className="block text-[11px] font-bold text-slate-700 mb-1 leading-tight">{label}</label>
    <select
      value={typeof value === 'string' ? value : ''}
      disabled={readOnly}
      onChange={e => onChange?.(fieldKey, e.target.value)}
      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all cursor-pointer font-normal"
    >
      <option value="">Não avaliado / Selecionar...</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

export const CompactTextArea: React.FC<BaseFieldProps & {
  rows?: number;
}> = ({ label, fieldKey, value, onChange, placeholder, readOnly, rows = 2, className = '' }) => (
  <div className={className}>
    <label className="block text-[11px] font-bold text-slate-700 mb-1 leading-tight">{label}</label>
    <textarea
      rows={rows}
      placeholder={placeholder || 'Observações e achados...'}
      value={typeof value === 'string' || typeof value === 'number' ? value : ''}
      readOnly={readOnly}
      onChange={e => onChange?.(fieldKey, e.target.value)}
      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all placeholder:text-slate-400 font-normal leading-relaxed"
    />
  </div>
);

export interface ComparativeRow {
  label: string;
  odKey: string;
  oeKey: string;
  placeholder?: string;
  unit?: string;
}

export const ComparativeSideTable: React.FC<{
  title: string;
  rows: ComparativeRow[];
  data: Record<string, any>;
  onChange: (key: string, val: string) => void;
  readOnly?: boolean;
}> = ({ title, rows, data, onChange, readOnly }) => (
  <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
    <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">{title}</h3>
      <div className="grid grid-cols-2 gap-3 text-center w-52 sm:w-64">
        <span className="text-[11px] font-black text-teal-800 bg-teal-100/60 rounded-lg py-0.5 border border-teal-200/60">
          OD (Olho Direito)
        </span>
        <span className="text-[11px] font-black text-sky-800 bg-sky-100/60 rounded-lg py-0.5 border border-sky-200/60">
          OE (Olho Esquerdo)
        </span>
      </div>
    </div>

    <div className="divide-y divide-slate-200/50">
      {rows.map(row => (
        <div key={row.odKey} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-700 sm:w-1/3">{row.label}</span>
          <div className="grid grid-cols-2 gap-3 sm:w-64">
            <div className="relative">
              <input
                type="text"
                placeholder={row.placeholder || 'OD'}
                value={typeof data[row.odKey] === 'string' ? data[row.odKey] : ''}
                readOnly={readOnly}
                onChange={e => onChange(row.odKey, e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none text-center font-medium"
              />
              {row.unit && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-semibold select-none">
                  {row.unit}
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder={row.placeholder || 'OE'}
                value={typeof data[row.oeKey] === 'string' ? data[row.oeKey] : ''}
                readOnly={readOnly}
                onChange={e => onChange(row.oeKey, e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none text-center font-medium"
              />
              {row.unit && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-semibold select-none">
                  {row.unit}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);
