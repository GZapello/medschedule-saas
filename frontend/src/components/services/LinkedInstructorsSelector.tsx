import React, { useMemo, useState } from 'react';
import { Users, Plus, Check, X, AlertCircle, Lock } from 'lucide-react';
import { Professional } from '../../types';

interface LinkedInstructorsSelectorProps {
  professionals: Professional[];
  primaryProfessionalId: string;
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  lockedIds?: string[];
  disabled?: boolean;
}

export const LinkedInstructorsSelector: React.FC<LinkedInstructorsSelectorProps> = ({
  professionals,
  primaryProfessionalId,
  selectedIds,
  onChange,
  lockedIds = [],
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const activeProfessionals = useMemo(() => {
    return professionals.filter(p => p.active !== 0);
  }, [professionals]);

  const normalizedSelected = useMemo(() => {
    const set = new Set<string>(selectedIds.filter(Boolean));
    if (primaryProfessionalId) set.add(primaryProfessionalId);
    return Array.from(set);
  }, [selectedIds, primaryProfessionalId]);

  const selectedObjects = useMemo(() => {
    const byId = new Map(professionals.map(p => [p.id, p]));
    return normalizedSelected
      .map(id => byId.get(id))
      .filter((p): p is Professional => Boolean(p));
  }, [normalizedSelected, professionals]);

  const toggleProfessional = (profId: string) => {
    if (disabled) return;
    if (profId === primaryProfessionalId) return;
    const exists = normalizedSelected.includes(profId);
    if (exists) {
      if (lockedIds.includes(profId)) return;
      onChange(normalizedSelected.filter(id => id !== profId));
    } else {
      onChange(Array.from(new Set([...normalizedSelected, profId])));
    }
  };

  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-teal-700 shrink-0" />
          <span className="text-[11px] font-bold text-slate-700">
            Instrutores que ministram esta aula ({normalizedSelected.length})
          </span>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(prev => !prev)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-800 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
        >
          {isOpen ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Concluir seleção</span>
            </>
          ) : (
            <span>+ Vincular instrutores</span>
          )}
        </button>
      </div>

      {/* Resumo visual dos instrutores vinculados */}
      {selectedObjects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedObjects.map(p => {
            const isPrimary = p.id === primaryProfessionalId;
            const isLocked = isPrimary || lockedIds.includes(p.id);
            const publicDisabled = p.public_booking_enabled === 0;
            return (
              <span
                key={p.id}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                  isPrimary
                    ? 'bg-teal-50 border-teal-200 text-teal-900'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <span className="truncate max-w-[160px]">{p.name}</span>
                {isPrimary && (
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-teal-600 text-white">
                    Responsável
                  </span>
                )}
                {publicDisabled && (
                  <span
                    title="Agendamento público desativado no perfil deste instrutor"
                    className="inline-flex items-center text-amber-600"
                  >
                    <AlertCircle className="w-3 h-3" />
                  </span>
                )}
                {!isLocked ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleProfessional(p.id)}
                    title={`Desvincular ${p.name}`}
                    className="ml-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                ) : (
                  !isPrimary && (
                    <span
                      title="Possui horários ativos na grade desta aula"
                      className="text-slate-400"
                    >
                      <Lock className="w-2.5 h-2.5" />
                    </span>
                  )
                )}
              </span>
            );
          })}
        </div>
      )}

      {isOpen && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-1.5 max-h-48 overflow-y-auto">
          {activeProfessionals.length === 0 ? (
            <p className="text-[11px] text-slate-500 px-1 py-1">
              Nenhum profissional ativo encontrado neste estabelecimento.
            </p>
          ) : (
            activeProfessionals.map(p => {
              const checked = normalizedSelected.includes(p.id);
              const isPrimary = p.id === primaryProfessionalId;
              const isLocked = isPrimary || (checked && lockedIds.includes(p.id));
              const publicDisabled = p.public_booking_enabled === 0;
              const hasScheduleConfigured = Array.isArray(p.schedules) ? p.schedules.some(s => s.is_active !== 0) : true;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled || isLocked}
                  onClick={() => toggleProfessional(p.id)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border text-left transition-all ${
                    checked
                      ? 'bg-white border-teal-400 shadow-2xs'
                      : 'bg-white/70 border-slate-200 hover:border-slate-300'
                  } ${isLocked ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                        checked
                          ? 'bg-teal-600 border-teal-600 text-white'
                          : 'bg-white border-slate-300 text-transparent'
                      }`}
                    >
                      <Check className="w-3 h-3" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-800 truncate">{p.name}</span>
                        {p.profession_name && (
                          <span className="text-[10px] text-slate-500">({p.profession_name})</span>
                        )}
                      </div>
                      {(publicDisabled || !hasScheduleConfigured) && (
                        <p className="text-[10px] text-amber-700 font-medium">
                          {publicDisabled
                            ? 'Agendamento público desativado no cadastro do instrutor'
                            : 'Sem horários configurados na escala semanal'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {isPrimary ? (
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                        Principal
                      </span>
                    ) : isLocked ? (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        Em grade ativa
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
          <p className="text-[10px] text-slate-500 px-1 pt-0.5">
            Todos os instrutores vinculados dividem o mesmo serviço no catálogo sem duplicá-lo e ficam disponíveis na grade semanal e no agendamento online.
          </p>
        </div>
      )}
    </div>
  );
};
