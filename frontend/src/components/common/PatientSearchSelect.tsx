import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, User, X, Loader2, Baby, AlertCircle, Phone, FileText } from 'lucide-react';
import { ApiClient } from '../../api/client';

export interface PatientSearchResult {
  id: string;
  full_name?: string;
  name?: string;
  social_name?: string;
  cpf?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  is_child?: boolean | number;
  birth_date?: string;
  gender?: string;
  active?: boolean | number;
  status?: string;
  avatar_url?: string | null;
  [key: string]: any;
}

export interface PatientSearchSelectProps {
  value?: string | null;
  onChange: (patientId: string, patient?: PatientSearchResult | null) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  error?: string;
  autoFocus?: boolean;
  allowClear?: boolean;
  clientTermLabel?: string; // e.g. "Paciente", "Aluno", "Aprendente", "Cliente"
  isStudent?: boolean;
  searchEndpoint?: string;
  selectedPatient?: PatientSearchResult | null;
  onClear?: () => void;
  id?: string;
}

export const PatientSearchSelect: React.FC<PatientSearchSelectProps> = ({
  value,
  onChange,
  placeholder,
  label,
  required = false,
  disabled = false,
  compact = false,
  className = '',
  error,
  autoFocus = false,
  allowClear = true,
  clientTermLabel = 'Paciente',
  isStudent = false,
  searchEndpoint,
  selectedPatient: externalSelectedPatient,
  onClear,
  id
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [loadedPatient, setLoadedPatient] = useState<PatientSearchResult | null>(externalSelectedPatient || null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<any>(null);

  // Sincroniza se o pai passou externalSelectedPatient
  useEffect(() => {
    if (externalSelectedPatient) {
      setLoadedPatient(externalSelectedPatient);
    }
  }, [externalSelectedPatient]);

  // Se tem `value` mas não temos os detalhes do paciente, busca pontualmente pelo ID
  useEffect(() => {
    let isCancelled = false;
    if (value && (!loadedPatient || loadedPatient.id !== value)) {
      if (externalSelectedPatient && externalSelectedPatient.id === value) {
        setLoadedPatient(externalSelectedPatient);
        return;
      }

      const fetchSingle = async () => {
        try {
          if (isStudent) {
            const res = await ApiClient.get<any>(`/v1/personal/students/${value}`);
            if (!isCancelled) {
              const studentData = res?.student || res;
              setLoadedPatient(studentData);
            }
          } else {
            const res = await ApiClient.get<any>(`/v1/patients/${value}`);
            if (!isCancelled) {
              const patData = res?.patient || res;
              setLoadedPatient(patData);
            }
          }
        } catch (err) {
          console.warn('[PatientSearchSelect] Não foi possível carregar detalhes do paciente:', err);
        }
      };

      fetchSingle();
    } else if (!value) {
      setLoadedPatient(null);
    }

    return () => {
      isCancelled = true;
    };
  }, [value, isStudent]);

  // Executa busca no servidor com suporte a debounce e endpoint customizável
  const executeSearch = useCallback(
    async (queryText: string) => {
      setLoading(true);
      try {
        const trimmed = queryText.trim();
        let url = '';

        if (searchEndpoint) {
          const sep = searchEndpoint.includes('?') ? '&' : '?';
          url = `${searchEndpoint}${sep}search=${encodeURIComponent(trimmed)}&limit=20`;
        } else if (isStudent) {
          url = `/v1/personal/students?q=${encodeURIComponent(trimmed)}`;
        } else {
          url = `/v1/patients?search=${encodeURIComponent(trimmed)}&limit=20`;
        }

        const res = await ApiClient.get<any>(url);
        let list: PatientSearchResult[] = [];

        if (Array.isArray(res)) {
          list = res;
        } else if (res?.patients && Array.isArray(res.patients)) {
          list = res.patients;
        } else if (res?.students && Array.isArray(res.students)) {
          list = res.students;
        }

        setResults(list);
        setSelectedIndex(-1);
      } catch (err) {
        console.warn('[PatientSearchSelect] Erro na busca:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [searchEndpoint, isStudent]
  );

  // Debounce na digitação (300ms)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setSearchTerm(text);
    setIsOpen(true);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      executeSearch(text);
    }, 300);
  };

  // Ao focar no campo de busca, abre dropdown e carrega sugestões iniciais se vazio
  const handleFocus = () => {
    setIsOpen(true);
    if (results.length === 0) {
      executeSearch(searchTerm);
    }
  };

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleSelectPatient = (patient: PatientSearchResult) => {
    setLoadedPatient(patient);
    setIsOpen(false);
    setSearchTerm('');
    onChange(patient.id, patient);
  };

  const handleClear = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setLoadedPatient(null);
    setSearchTerm('');
    setIsOpen(false);
    onChange('', null);
    if (onClear) onClear();
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Teclado: Navegação com setas e seleção com Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        if (results.length === 0) executeSearch(searchTerm);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelectPatient(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const displayName = loadedPatient?.full_name || loadedPatient?.name || '';
  const defaultPlaceholder = placeholder || `Buscar ${clientTermLabel.toLowerCase()} pelo nome, CPF ou telefone...`;

  // ========================================================
  // RENDER: MODO COMPACTO (Para barras horizontais de cabeçalho)
  // ========================================================
  if (compact) {
    return (
      <div ref={containerRef} className={`relative inline-block ${className}`}>
        {value && loadedPatient ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl transition-all shadow-2xs group max-w-[320px]">
            <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] shrink-0">
              {displayName ? displayName.charAt(0).toUpperCase() : <User className="w-3 h-3 text-slate-500" />}
            </div>
            <span className="text-xs font-bold text-slate-800 truncate" title={displayName}>
              {displayName}
            </span>
            {loadedPatient.is_child && (
              <span className="px-1.5 py-0.2 text-[9px] font-bold bg-amber-100 text-amber-800 rounded-md shrink-0">
                Ped
              </span>
            )}
            {!disabled && allowClear && (
              <button
                type="button"
                onClick={handleClear}
                title={`Trocar ${clientTermLabel.toLowerCase()}`}
                className="p-0.5 text-slate-400 hover:text-rose-600 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer shrink-0 ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="relative min-w-[240px] sm:min-w-[280px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              id={id}
              type="text"
              autoFocus={autoFocus}
              disabled={disabled}
              value={searchTerm}
              placeholder={defaultPlaceholder}
              onChange={handleInputChange}
              onFocus={handleFocus}
              onKeyDown={handleKeyDown}
              className={`w-full pl-8 pr-8 py-1.5 text-xs font-semibold rounded-xl border ${
                error ? 'border-rose-400 bg-rose-50/30' : 'border-slate-200 bg-slate-50 hover:bg-white'
              } focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed`}
            />
            {loading && (
              <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            )}

            {isOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 animate-fadeIn">
                {results.length === 0 ? (
                  <div className="p-3.5 text-center text-xs text-slate-500 font-medium">
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                        Buscando {clientTermLabel.toLowerCase()}s...
                      </span>
                    ) : (
                      `Nenhum ${clientTermLabel.toLowerCase()} encontrado.`
                    )}
                  </div>
                ) : (
                  results.map((patient, index) => {
                    const patName = patient.full_name || patient.name || '';
                    const isSelected = selectedIndex === index;
                    return (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => handleSelectPatient(patient)}
                        className={`w-full text-left p-2.5 flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer ${
                          isSelected ? 'bg-sky-50/80 text-sky-900' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="truncate">
                          <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                            <span>{patName}</span>
                            {patient.is_child && (
                              <span className="px-1.5 py-0.2 text-[9px] font-bold bg-amber-100 text-amber-800 rounded-md">
                                Pediátrico
                              </span>
                            )}
                          </div>
                          {(patient.cpf || patient.phone || patient.social_name) && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                              {patient.social_name && <span>({patient.social_name})</span>}
                              {patient.cpf && <span>CPF: {patient.cpf}</span>}
                              {patient.phone && <span>Tel: {patient.phone}</span>}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ========================================================
  // RENDER: MODO FORMULÁRIO / MODAL (Completo e Estruturado)
  // ========================================================
  return (
    <div ref={containerRef} className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {value && loadedPatient ? (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 transition-all hover:border-slate-300">
          <div className="flex items-center gap-3 truncate">
            <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center font-extrabold text-xs shrink-0">
              {displayName ? displayName.charAt(0).toUpperCase() : <User className="w-4 h-4 text-slate-500" />}
            </div>
            <div className="truncate">
              <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-2">
                <span>{displayName}</span>
                {loadedPatient.is_child && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-md">
                    <Baby className="w-3 h-3 text-amber-700" /> Pediátrico
                  </span>
                )}
                {loadedPatient.active === 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-800 rounded-md">
                    Inativo
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-3 mt-0.5 truncate">
                {loadedPatient.social_name && <span>Nome social: {loadedPatient.social_name}</span>}
                {loadedPatient.cpf && <span>CPF: {loadedPatient.cpf}</span>}
                {loadedPatient.phone && <span>Tel: {loadedPatient.phone}</span>}
                {loadedPatient.birth_date && (
                  <span>Nasc: {new Date(loadedPatient.birth_date).toLocaleDateString('pt-BR')}</span>
                )}
              </div>
            </div>
          </div>

          {!disabled && allowClear && (
            <button
              type="button"
              onClick={handleClear}
              className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-rose-700 hover:bg-slate-200/70 rounded-xl border border-slate-200 bg-white transition-colors cursor-pointer shrink-0"
            >
              Trocar
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={inputRef}
            id={id}
            type="text"
            autoFocus={autoFocus}
            disabled={disabled}
            value={searchTerm}
            placeholder={defaultPlaceholder}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            className={`w-full pl-10 pr-9 py-2.5 text-xs font-medium rounded-xl border ${
              error ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200 bg-slate-50 hover:bg-white'
            } focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed`}
          />
          {loading && (
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          )}

          {isOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100 animate-fadeIn">
              {results.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 font-medium">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      Buscando {clientTermLabel.toLowerCase()}s...
                    </span>
                  ) : (
                    `Nenhum ${clientTermLabel.toLowerCase()} encontrado.`
                  )}
                </div>
              ) : (
                results.map((patient, index) => {
                  const patName = patient.full_name || patient.name || '';
                  const isSelected = selectedIndex === index;
                  return (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => handleSelectPatient(patient)}
                      className={`w-full text-left p-3 flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer ${
                        isSelected ? 'bg-sky-50 text-sky-900' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="truncate">
                        <div className="font-bold text-slate-800 truncate flex items-center gap-2">
                          <span>{patName}</span>
                          {patient.is_child && (
                            <span className="px-1.5 py-0.2 text-[9px] font-bold bg-amber-100 text-amber-800 rounded-md">
                              Pediátrico
                            </span>
                          )}
                          {patient.active === 0 && (
                            <span className="px-1.5 py-0.2 text-[9px] font-bold bg-rose-100 text-rose-800 rounded-md">
                              Inativo
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          {patient.social_name && <span>({patient.social_name})</span>}
                          {patient.cpf && <span>CPF: {patient.cpf}</span>}
                          {patient.phone && <span>Tel: {patient.phone}</span>}
                          {patient.birth_date && (
                            <span>Nasc: {new Date(patient.birth_date).toLocaleDateString('pt-BR')}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-bold text-sky-600 shrink-0">Selecionar →</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      )}
    </div>
  );
};
