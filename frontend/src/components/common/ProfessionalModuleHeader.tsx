import React from 'react';

export interface ProfessionalModuleHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  iconGradient?: string;
  iconShadow?: string;
  title: string;
  badgeLabel: string;
  badgeVariant?: string;
  secondaryBadge?: React.ReactNode;
  description: string;
  children?: React.ReactNode;
}

export const ProfessionalModuleHeader: React.FC<ProfessionalModuleHeaderProps> = ({
  icon: Icon,
  iconGradient = 'from-sky-500 to-blue-600',
  iconShadow = 'shadow-sky-500/20',
  title,
  badgeLabel,
  badgeVariant = 'bg-sky-100 text-sky-800 border-sky-200',
  secondaryBadge,
  description,
  children
}) => {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${iconGradient} text-white flex items-center justify-center shadow-md ${iconShadow} shrink-0`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h1>
            <span
              className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${badgeVariant}`}
            >
              {badgeLabel}
            </span>
            {secondaryBadge}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>

      {children && (
        <div className="flex flex-wrap items-center gap-3">
          {children}
        </div>
      )}
    </div>
  );
};
