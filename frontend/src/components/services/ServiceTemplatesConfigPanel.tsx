import React, { useEffect, useState } from 'react';
import { Dumbbell, Edit2, Layers, Plus, Star } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { WorkoutTemplate } from '../personal/types';
import { PersonalTemplateBuilder } from '../personal/PersonalTemplateBuilder';

interface ServiceTemplatesConfigPanelProps {
  defaultTemplateId: string;
  linkedTemplateIds: string[];
  compact?: boolean;
  onChange: (next: {
    defaultTemplateId: string;
    linkedTemplateIds: string[];
  }) => void;
}

export const ServiceTemplatesConfigPanel: React.FC<ServiceTemplatesConfigPanelProps> = ({
  defaultTemplateId,
  linkedTemplateIds,
  compact = false,
  onChange
}) => {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [templateToEdit, setTemplateToEdit] = useState<WorkoutTemplate | null>(null);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<{ templates: WorkoutTemplate[] }>('/v1/personal/templates');
      setTemplates(Array.isArray(res?.templates) ? res.templates : []);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleToggleTemplate = (tplId: string) => {
    const exists = linkedTemplateIds.includes(tplId);
    let nextIds: string[];
    let nextDefault = defaultTemplateId;
    if (exists) {
      nextIds = linkedTemplateIds.filter(id => id !== tplId);
      if (nextDefault === tplId) {
        nextDefault = nextIds[0] || '';
      }
    } else {
      nextIds = [...linkedTemplateIds, tplId];
      if (!nextDefault) {
        nextDefault = tplId;
      }
    }
    onChange({
      defaultTemplateId: nextDefault,
      linkedTemplateIds: nextIds
    });
  };

  const handleSelectDefault = (tplId: string) => {
    if (!tplId) {
      onChange({
        defaultTemplateId: '',
        linkedTemplateIds
      });
      return;
    }
    const nextIds = linkedTemplateIds.includes(tplId)
      ? linkedTemplateIds
      : [tplId, ...linkedTemplateIds];
    onChange({
      defaultTemplateId: tplId,
      linkedTemplateIds: nextIds
    });
  };

  const selectedDefaultObj = templates.find(t => t.id === defaultTemplateId) || null;

  return (
    <div className={`rounded-xl border border-indigo-100 bg-indigo-50/40 ${compact ? 'p-3 space-y-2.5' : 'p-4 space-y-3'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Dumbbell className="w-4 h-4 text-indigo-600" />
            <span>Templates de Exercícios da Aula (ZemdaPersonal)</span>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Vincule um ou mais modelos de treino existentes à aula e defina o template padrão para execução imediata na sessão.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {selectedDefaultObj && (
            <button
              type="button"
              onClick={() => {
                setTemplateToEdit(selectedDefaultObj);
                setBuilderOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>Editar Padrão</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setTemplateToEdit(null);
              setBuilderOpen(true);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer shadow-2xs"
          >
            <Plus className="w-3 h-3" />
            <span>+ Novo Template</span>
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-500 py-2">Carregando modelos do ZemdaPersonal...</p>
      ) : templates.length === 0 ? (
        <div className="rounded-lg bg-white border border-dashed border-indigo-200 p-3 text-xs text-slate-600 flex items-center justify-between gap-2">
          <span>Nenhum template cadastrado ainda na biblioteca do ZemdaPersonal.</span>
          <button
            type="button"
            onClick={() => {
              setTemplateToEdit(null);
              setBuilderOpen(true);
            }}
            className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 cursor-pointer shrink-0"
          >
            Criar Primeiro Template
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Template padrão para esta aula/serviço
            </label>
            <select
              value={defaultTemplateId}
              onChange={e => handleSelectDefault(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
            >
              <option value="">Sem template padrão fixo (selecionar na aula)</option>
              {templates.map(tpl => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.title} ({tpl.structure_type} • {tpl.exercises_count ?? 0} exercícios)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Templates vinculados disponíveis para o instrutor ({linkedTemplateIds.length})
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
              {templates.map(tpl => {
                const isLinked = linkedTemplateIds.includes(tpl.id);
                const isDefault = defaultTemplateId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                      isLinked
                        ? 'bg-white border-indigo-400 text-slate-900 shadow-2xs'
                        : 'bg-white/70 border-slate-200 text-slate-600 hover:border-indigo-200'
                    }`}
                  >
                    <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isLinked}
                        onChange={() => handleToggleTemplate(tpl.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold truncate flex items-center gap-1">
                          <span className="truncate">{tpl.title}</span>
                          {isDefault && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 shrink-0">
                              <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-600" />
                              Padrão
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {tpl.structure_type} • {tpl.exercises_count ?? 0} exerc.
                        </div>
                      </div>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setTemplateToEdit(tpl);
                        setBuilderOpen(true);
                      }}
                      title="Editar template na biblioteca"
                      className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-indigo-600 cursor-pointer shrink-0"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {builderOpen && (
        <PersonalTemplateBuilder
          isOpen={builderOpen}
          onClose={() => {
            setBuilderOpen(false);
            setTemplateToEdit(null);
          }}
          onSaved={async () => {
            const prevIds = new Set(templates.map(t => t.id));
            const res = await ApiClient.get<{ templates: WorkoutTemplate[] }>('/v1/personal/templates').catch(() => ({ templates: [] }));
            const nextList = Array.isArray(res?.templates) ? res.templates : [];
            setTemplates(nextList);
            const newlyCreated = nextList.find(t => !prevIds.has(t.id));
            if (newlyCreated) {
              const nextLinked = Array.from(new Set([newlyCreated.id, ...linkedTemplateIds]));
              onChange({
                defaultTemplateId: defaultTemplateId || newlyCreated.id,
                linkedTemplateIds: nextLinked
              });
            }
          }}
          templateToEdit={templateToEdit}
        />
      )}
    </div>
  );
};
