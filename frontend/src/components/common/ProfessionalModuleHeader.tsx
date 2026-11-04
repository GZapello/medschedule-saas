import React from 'react';
import { Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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
  onOpenZemda360?: () => void;
  showZemda360Button?: boolean;
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
  children,
  onOpenZemda360,
  showZemda360Button
}) => {
  const { isZemda360, isZemdaBody } = useAuth();
  const hasZemda360Access = Boolean(isZemda360 || isZemdaBody);
  const shouldRenderZemda360 = (showZemda360Button ?? true) && hasZemda360Access && Boolean(onOpenZemda360);

  return (
    <div className="clinical-readable clinical-professional-header bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
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

            {shouldRenderZemda360 && (
              <button
                type="button"
                onClick={onOpenZemda360}
                title="Abrir Zemda360 (Mapeamento Anatômico e Visual)"
                aria-label="Abrir Zemda360"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 shadow-2xs transition-all cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Zemda360</span>
              </button>
            )}
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
