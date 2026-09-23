import React, { useEffect, useId, useRef, useState, useMemo } from 'react';
import { ChevronDown, Search, X, Check, Sparkles, RefreshCw } from 'lucide-react';
import { RegistrationProfessionOption } from '../../types/professions';

export interface RegistrationProfessionSelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: RegistrationProfessionOption[];
  loading?: boolean;
}

export const RegistrationProfessionSelect: React.FC<RegistrationProfessionSelectProps> = ({
  value,
  onChange,
  options,
  loading
}) => {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const list = options || [];

  const norm = (str: string) =>
    str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return list;
    const q = norm(searchQuery);
    return list.filter(opt => {
      const label = norm(opt.label || opt.name || '');
      const canonical = norm(opt.canonicalName || '');
      const display = norm(opt.displayOption || '');
      const board = norm(opt.boardLabel || '');
      const mods = (opt.modules || []).map(m => norm(m)).join(' ');
      const slug = norm(opt.slug || '');
      return (
        label.includes(q) ||
        canonical.includes(q) ||
        display.includes(q) ||
        board.includes(q) ||
        mods.includes(q) ||
        slug.includes(q)
      );
    });
  }, [list, searchQuery]);

  const selectedOption = list.find(option => option.id === value);

  const handleOpen = () => {
    setOpen(true);
    setSearchQuery('');
    const idx = filteredList.findIndex(o => o.id === value);
    setActiveIndex(idx >= 0 ? idx : 0);
  };

  const handleClose = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const chooseOption = (option: RegistrationProfessionOption) => {
    onChange(option.id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  // Auto-focus search input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  // Scroll active item into view when activeIndex changes
  useEffect(() => {
    if (open && activeIndex >= 0) {
      const el = document.getElementById(`${id}-${activeIndex}`);
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [open, activeIndex, id]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => Math.min(filteredList.length - 1, prev + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => Math.max(0, prev - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredList[activeIndex]) {
        chooseOption(filteredList[activeIndex]);
      }
      return;
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0 w-full">
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        id="registration-profession"
        type="button"
        role="combobox"
        aria-label="Profissão"
        aria-required="true"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? handleClose() : handleOpen())}
        onKeyDown={e => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key) && !open) {
            e.preventDefault();
            handleOpen();
          }
        }}
        className="w-full min-w-0 pl-11 pr-10 py-3 sm:py-2.5 text-left text-base sm:text-sm border border-slate-200 rounded-2xl bg-slate-50 hover:bg-white focus:bg-white focus:ring-2 focus:ring-teal-500 font-medium text-slate-800 transition-all cursor-pointer flex items-center justify-between shadow-xs"
      >
        <span className="truncate">
          {selectedOption ? (
            <span className="text-slate-900 font-bold">
              {selectedOption.label || selectedOption.name}{' '}
              <span className="font-normal text-teal-700">
                — {(selectedOption.modules || (selectedOption.module ? [selectedOption.module, 'ZemdaBody'] : ['Recursos gerais do Zemda', 'ZemdaBody'])).join(' + ')}
              </span>
            </span>
          ) : loading ? (
            <span className="text-slate-400 flex items-center gap-2 text-xs">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-600" />
              Carregando profissões ativas...
            </span>
          ) : (
            <span className="text-slate-400 text-xs sm:text-sm">Selecione sua profissão...</span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ${open ? 'rotate-180 text-teal-600' : ''}`}
        />
      </button>

      {/* Dropdown with transparent backdrop */}
      {open && (
        <>
          {/* Backdrop for click outside without layout interference */}
          <div
            className="fixed inset-0 z-40 bg-black/10 backdrop-blur-2xs"
            onClick={handleClose}
          />

          {/* Floating Dropdown Listbox */}
          <div
            ref={listboxRef}
            role="listbox"
            aria-label="Profissões disponíveis"
            className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-80 sm:max-h-96 w-full animate-in fade-in-50 zoom-in-95 duration-150"
          >
            {/* Search Input Box */}
            <div className="p-2.5 bg-slate-50 border-b border-slate-100 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Buscar profissão (ex: fisio, psico, odonto, med)..."
                  className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 placeholder:text-slate-400 transition-all shadow-inner"
                  onClick={e => e.stopPropagation()}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-md cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Items List */}
            <div className="overflow-y-auto overscroll-contain flex-1 divide-y divide-slate-100 scroll-smooth">
              {loading ? (
                <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                  <span>Carregando profissões do catálogo...</span>
                </div>
              ) : filteredList.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 italic">
                  Nenhuma profissão ativa encontrada para &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                filteredList.map((option, idx) => {
                  const isSelected = option.id === value;
                  const isActive = activeIndex === idx;
                  const modulesList = option.modules || (option.module ? [option.module, 'ZemdaBody'] : ['Recursos gerais do Zemda', 'ZemdaBody']);
                  const modulesLabel = modulesList.join(' + ');

                  return (
                    <div
                      key={option.id}
                      id={`${id}-${idx}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => chooseOption(option)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`px-4 py-3 text-xs sm:text-sm cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-teal-50/90 text-teal-950 font-bold border-l-4 border-l-teal-600'
                          : isActive
                          ? 'bg-slate-50 text-slate-900'
                          : 'text-slate-700 hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">
                            {option.label || option.name}
                          </span>
                          {option.boardLabel && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {option.boardLabel}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-teal-700 font-medium mt-0.5 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-teal-500 shrink-0" />
                          <span>{modulesLabel}</span>
                        </div>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-teal-600 shrink-0 stroke-[2.5]" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
