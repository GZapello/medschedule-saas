import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Wrench, Sparkles } from 'lucide-react';

export interface ClinicalQuickToolItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  highlight?: boolean;
  badge?: string;
  description?: string;
}

export interface ClinicalQuickToolsMenuProps {
  tools: ClinicalQuickToolItem[];
  label?: string;
  className?: string;
  variant?: 'sky' | 'teal' | 'indigo' | 'emerald' | 'cyan' | 'purple' | 'slate';
}

const variantStyles: Record<string, { button: string; icon: string; badge: string; hover: string }> = {
  sky: {
    button: 'border-sky-200 bg-sky-50/70 text-sky-800 hover:bg-sky-100',
    icon: 'text-sky-600',
    badge: 'bg-sky-200/80 text-sky-900',
    hover: 'hover:bg-sky-50 hover:text-sky-900'
  },
  teal: {
    button: 'border-teal-200 bg-teal-50/70 text-teal-800 hover:bg-teal-100',
    icon: 'text-teal-600',
    badge: 'bg-teal-200/80 text-teal-900',
    hover: 'hover:bg-teal-50 hover:text-teal-900'
  },
  indigo: {
    button: 'border-indigo-200 bg-indigo-50/70 text-indigo-800 hover:bg-indigo-100',
    icon: 'text-indigo-600',
    badge: 'bg-indigo-200/80 text-indigo-900',
    hover: 'hover:bg-indigo-50 hover:text-indigo-900'
  },
  emerald: {
    button: 'border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100',
    icon: 'text-emerald-600',
    badge: 'bg-emerald-200/80 text-emerald-900',
    hover: 'hover:bg-emerald-50 hover:text-emerald-900'
  },
  cyan: {
    button: 'border-cyan-200 bg-cyan-50/70 text-cyan-800 hover:bg-cyan-100',
    icon: 'text-cyan-600',
    badge: 'bg-cyan-200/80 text-cyan-900',
    hover: 'hover:bg-cyan-50 hover:text-cyan-900'
  },
  purple: {
    button: 'border-purple-200 bg-purple-50/70 text-purple-800 hover:bg-purple-100',
    icon: 'text-purple-600',
    badge: 'bg-purple-200/80 text-purple-900',
    hover: 'hover:bg-purple-50 hover:text-purple-900'
  },
  slate: {
    button: 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
    icon: 'text-slate-600',
    badge: 'bg-slate-200 text-slate-800',
    hover: 'hover:bg-slate-50 hover:text-slate-900'
  }
};

export const ClinicalQuickToolsMenu: React.FC<ClinicalQuickToolsMenuProps> = ({
  tools,
  label = 'Ferramentas',
  className = '',
  variant = 'slate'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentVariant = variantStyles[variant] || variantStyles.slate;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!tools || tools.length === 0) return null;

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title="Abrir menu de ferramentas clínicas rápidas"
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border shadow-xs transition-all cursor-pointer whitespace-nowrap ${currentVariant.button}`}
      >
        <Wrench className={`w-3.5 h-3.5 ${currentVariant.icon}`} />
        <span>{label}</span>
        <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${currentVariant.badge}`}>
          {tools.length}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-1.5 w-60 origin-top-right rounded-2xl bg-white p-1.5 shadow-xl border border-slate-200/80 ring-1 ring-black/5 focus:outline-none z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Ferramentas Rápidas
            </span>
          </div>

          <div className="space-y-0.5">
            {tools.map(tool => {
              const ToolIcon = tool.icon || (tool.highlight ? Sparkles : Wrench);
              return (
                <button
                  key={tool.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsOpen(false);
                    tool.onClick();
                  }}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left cursor-pointer ${
                    tool.highlight
                      ? 'bg-sky-50/60 text-sky-800 hover:bg-sky-100/70 border border-sky-100'
                      : `text-slate-700 ${currentVariant.hover}`
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ToolIcon
                      className={`w-4 h-4 shrink-0 ${
                        tool.highlight ? 'text-sky-600' : currentVariant.icon
                      }`}
                    />
                    <span className="truncate">{tool.label}</span>
                  </div>
                  {tool.badge && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                      {tool.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
