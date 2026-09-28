import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
}

export interface EmptyStateProps {
  /** Ícone ilustrativo (lucide-react) exibido dentro de um círculo colorido. */
  icon: LucideIcon;
  /** Título curto explicando a ausência de dados. */
  title: string;
  /** Descrição breve orientando o que o usuário pode fazer. */
  description?: string;
  /** Ação primária opcional (ex: "Cadastrar item"). Omitir quando o usuário não tiver permissão. */
  action?: EmptyStateAction;
  /** Paleta do ícone/círculo. Padrão: 'slate' (neutro). */
  tone?: 'slate' | 'indigo' | 'amber' | 'rose' | 'emerald';
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<EmptyStateProps['tone']>, string> = {
  slate: 'bg-slate-100 text-slate-400',
  indigo: 'bg-indigo-50 text-indigo-500',
  amber: 'bg-amber-50 text-amber-500',
  rose: 'bg-rose-50 text-rose-500',
  emerald: 'bg-emerald-50 text-emerald-500'
};

/**
 * Estado vazio padrão para telas de listagem (Estoque, Orçamentos, Financeiro, etc.).
 * Explica a ausência de dados e, quando aplicável, oferece uma ação primária —
 * o chamador é responsável por só passar `action` quando o usuário tiver permissão.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  tone = 'slate',
  className = ''
}) => {
  const ActionIcon = action?.icon;

  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}>
      <div className={`p-3 rounded-full mb-3 ${TONE_CLASSES[tone]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {description && (
        <p className="text-xs text-slate-500 mt-1 max-w-sm">{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer"
        >
          {ActionIcon && <ActionIcon className="w-4 h-4" />}
          {action.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
