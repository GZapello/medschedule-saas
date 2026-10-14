import React from 'react';

export interface ClinicalModuleEmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title?: string;
  clientTermLabel?: string;
  description?: string;
  action?: React.ReactNode;
  colorVariant?: 'teal' | 'cyan' | 'purple' | 'sky' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'slate';
  className?: string;
}

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  teal: {
    bg: 'bg-teal-50',
    text: 'text-teal-600',
    border: 'border-teal-200'
  },
  cyan: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-600',
    border: 'border-cyan-200'
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-600',
    border: 'border-purple-200'
  },
  sky: {
    bg: 'bg-sky-50',
    text: 'text-sky-600',
    border: 'border-sky-200'
  },
  indigo: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    border: 'border-indigo-200'
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    border: 'border-emerald-200'
  },
  rose: {
    bg: 'bg-rose-50',
    text: 'text-rose-600',
    border: 'border-rose-200'
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    border: 'border-amber-200'
  },
  slate: {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200'
  }
};

export const ClinicalModuleEmptyState: React.FC<ClinicalModuleEmptyStateProps> = ({
  icon: Icon,
  title,
  clientTermLabel = 'Paciente',
  description = 'Escolha um paciente no menu superior para iniciar o atendimento.',
  action,
  colorVariant = 'teal',
  className = ''
}) => {
  const theme = COLOR_MAP[colorVariant] || COLOR_MAP.teal;
  const effectiveTitle = title || `Selecione um(a) ${clientTermLabel}`;

  return (
    <div
      data-tour="clinical-empty-state"
      className={`flex flex-col items-center justify-center min-h-[300px] text-center bg-white rounded-2xl border border-slate-200 p-8 shadow-xs max-w-xl mx-auto my-8 animate-fadeIn ${className}`}
    >
      <div className={`w-14 h-14 rounded-2xl ${theme.bg} ${theme.text} flex items-center justify-center mb-3.5 shadow-2xs`}>
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-base font-bold text-slate-800 mb-1">{effectiveTitle}</h3>
      <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-4">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
};
