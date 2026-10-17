import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, CheckCircle2 } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface QuickActionDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  emptyMessage?: string;
  actionLabel?: string;
  onAction?: () => void;
  showAction?: boolean;
  disabled?: boolean;
  className?: string;
  rightContent?: React.ReactNode;
}

export const QuickActionDropdown: React.FC<QuickActionDropdownProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  emptyMessage = 'Nenhuma opção disponível',
  actionLabel,
  onAction,
  showAction = false,
  disabled = false,
  className = '',
  rightContent
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fecha com tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);
  const displayText = selectedOption ? selectedOption.label : placeholder;

  return (
    <div ref={containerRef} className={`relative ${isOpen ? 'z-40' : ''} ${className}`}>
      {rightContent ? (
        <div className={`w-full min-w-0 border rounded-xl px-3 text-xs flex items-center gap-2 transition-all focus-within:ring-2 focus-within:ring-sky-500/20 ${disabled ? 'opacity-60' : ''} ${isOpen ? 'border-sky-500 bg-white' : 'border-slate-200 bg-slate-50 hover:bg-white'}`}>
          <button type="button" disabled={disabled} aria-expanded={isOpen}
            onClick={() => setIsOpen(prev => !prev)}
            className="flex-1 min-w-0 !px-0 py-2 text-left bg-transparent cursor-pointer disabled:cursor-not-allowed">
            <span className={`block truncate ${selectedOption ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>{displayText}</span>
          </button>
          <div className="shrink-0" onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}>
            {rightContent}
          </div>
          <button type="button" disabled={disabled} aria-label="Abrir opções" aria-expanded={isOpen}
            onClick={() => setIsOpen(prev => !prev)}
            className="shrink-0 !min-w-0 !px-0 py-2 bg-transparent cursor-pointer disabled:cursor-not-allowed">
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-sky-600' : ''}`} />
          </button>
        </div>
      ) : (
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={`w-full border rounded-xl px-3 py-2 text-xs text-left flex items-center justify-between transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
          isOpen
            ? 'border-sky-500 ring-2 ring-sky-500/20 bg-white shadow-2xs'
            : 'border-slate-200 bg-slate-50 hover:bg-white text-slate-800'
        }`}
      >
        <span className={`truncate ${selectedOption ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
          {displayText}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ml-1.5 ${
            isOpen ? 'rotate-180 text-sky-600' : ''
          }`}
        />
      </button>
      )}

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100 animate-fadeIn">
          {showAction && actionLabel && onAction && (
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xs border-b border-slate-100 p-2 shadow-2xs">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsOpen(false);
                  onAction();
                }}
                className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 rounded-xl text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100/90 transition-colors cursor-pointer border border-teal-200/70 shadow-2xs"
              >
                <div className="w-5 h-5 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Plus className="w-3.5 h-3.5" />
                </div>
                <span className="truncate">{actionLabel}</span>
              </button>
            </div>
          )}

          <div className="p-1 space-y-0.5">
            {options.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400 italic">
                {emptyMessage}
              </div>
            ) : (
              options.map(option => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50 text-sky-900 font-bold'
                        : 'text-slate-700 hover:bg-slate-50 font-normal'
                    }`}
                  >
                    <div className="truncate">
                      <div className="truncate">{option.label}</div>
                      {option.sublabel && (
                        <div className="text-[10px] text-slate-400 font-normal truncate mt-0.5">
                          {option.sublabel}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 shrink-0 ml-2" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
