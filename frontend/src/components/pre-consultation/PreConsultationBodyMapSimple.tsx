import React, { useState, useMemo, useEffect } from 'react';
import { Activity, Plus, Trash2, Info, Edit3, Check } from 'lucide-react';
import { ZemdaBodyCanvas, BodyViewMode } from '../zemda-body/ZemdaBodyCanvas';
import {
  bodyAnatomicalRegions,
  canonicalRegion,
  anatomicalLabel,
  REGION_TAXONOMY,
  BODY_VIEWS
} from '../zemda-body/anatomicalRegions';

export interface PatientBodyMapRegion {
  id: string;
  regionId: string;
  canonicalRegionId?: string;
  regionLabel: string;
  view: 'front' | 'back' | 'left' | 'right';
  side?: 'right' | 'left' | 'midline';
  group?: string;
  kind?: 'region' | 'joint';
  complaintType: string;
  intensity: number;
  notes?: string;
  source?: string;
}

/**
 * Mapeamento de compatibilidade retroativa para submissões salvas anteriormente
 * com o antigo mapa simplificado, convertendo para IDs canônicos do Zemda360.
 */
export const SIMPLIFIED_LEGACY_TO_CANONICAL: Record<string, string> = {
  head_front: 'cabeca',
  head_back: 'cabeca',
  neck_front: 'cervical',
  cervical_back: 'joint_cervical',
  shoulder_right: 'shoulder_right',
  shoulder_left: 'shoulder_left',
  chest: 'thorax',
  abdomen: 'abdomen_upper',
  arm_right: 'upper_arm_right',
  arm_left: 'upper_arm_left',
  hand_right: 'hand_right',
  hand_left: 'hand_left',
  pelvis_front: 'pelvis',
  thigh_knee_right: 'thigh_anterior_right',
  thigh_knee_left: 'thigh_anterior_left',
  leg_foot_right: 'leg_anterior_right',
  leg_foot_left: 'leg_anterior_left',
  scapula_right: 'scapula_right',
  scapula_left: 'scapula_left',
  thoracic_spine: 'thoracic_back',
  lumbar_spine: 'lumbar',
  glute_hip: 'pelvis',
  posterior_thigh_left: 'thigh_posterior_left',
  posterior_thigh_right: 'thigh_posterior_right',
  calf_heel_left: 'leg_posterior_left',
  calf_heel_right: 'leg_posterior_right'
};

export function resolveCanonicalZemda360RegionId(rawId: string): string {
  const trimmed = String(rawId || '').trim();
  if (!trimmed) return '';
  if (SIMPLIFIED_LEGACY_TO_CANONICAL[trimmed]) {
    return SIMPLIFIED_LEGACY_TO_CANONICAL[trimmed];
  }
  return canonicalRegion(trimmed);
}

const COMPLAINT_TYPES = [
  { id: 'dor', label: 'Dor' },
  { id: 'desconforto', label: 'Desconforto / Incômodo' },
  { id: 'tensao', label: 'Tensão / Rigidez' },
  { id: 'formigamento', label: 'Formigamento / Dormência' },
  { id: 'inchaco', label: 'Inchaço / Edema' },
  { id: 'estetica', label: 'Queixa Estética / Pele' },
  { id: 'outro', label: 'Outro' }
];

const VIEW_LABELS: Record<'front' | 'back' | 'left' | 'right', string> = {
  front: 'Frente',
  back: 'Costas',
  left: 'Lado E',
  right: 'Lado D'
};

const SIDE_LABELS: Record<'right' | 'left' | 'midline', string> = {
  right: 'Lado Direito',
  left: 'Lado Esquerdo',
  midline: 'Linha Média / Central'
};

const GROUP_LABELS: Record<string, string> = {
  head_neck: 'Cabeça e Pescoço',
  trunk: 'Tronco e Coluna',
  upper_limb: 'Membros Superiores',
  lower_limb: 'Membros Inferiores',
  joints: 'Articulações'
};

export const PreConsultationBodyMapSimple: React.FC<{
  regions: PatientBodyMapRegion[];
  onChange?: (regions: PatientBodyMapRegion[]) => void;
  readOnly?: boolean;
  initialBodyModel?: 'female' | 'male';
}> = ({ regions, onChange, readOnly = false, initialBodyModel = 'female' }) => {
  const [bodyModel, setBodyModel] = useState<'female' | 'male'>(initialBodyModel);
  const [activeView, setActiveView] = useState<BodyViewMode>('front');
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [complaintType, setComplaintType] = useState<string>('dor');
  const [intensity, setIntensity] = useState<number>(5);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (initialBodyModel === 'male' || initialBodyModel === 'female') {
      setBodyModel(initialBodyModel);
    }
  }, [initialBodyModel]);

  // Catálogo oficial do motor anatômico Zemda360 (1024x768 calibrado sobre Corpo_Feminino.jpg / Corpo_masculino.jpg)
  const regionCatalog = useMemo(() => bodyAnatomicalRegions(bodyModel), [bodyModel]);

  // Metadados unificados de cada região canônica disponível no catálogo corporal do Zemda360
  const canonicalCatalogMap = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        label: string;
        side: 'right' | 'left' | 'midline';
        views: ('front' | 'back' | 'left' | 'right')[];
        group: string;
        kind: 'region' | 'joint';
        parent: string | null;
      }
    >();

    for (const item of regionCatalog) {
      const canId = resolveCanonicalZemda360RegionId(item.baseRegion || item.region || item.id);
      if (!canId) continue;
      const taxMeta = REGION_TAXONOMY.find(t => t.id === canId);
      const label = taxMeta?.label || anatomicalLabel(canId, bodyModel) || item.label;
      const side: 'right' | 'left' | 'midline' =
        taxMeta?.side === 'right'
          ? 'right'
          : taxMeta?.side === 'left'
          ? 'left'
          : item.side || 'midline';
      const kind: 'region' | 'joint' =
        taxMeta?.kind === 'joint' || item.isJoint ? 'joint' : 'region';
      const group =
        taxMeta?.group && taxMeta.group !== 'face'
          ? taxMeta.group
          : canId === 'cabeca' || canId === 'pescoco' || canId === 'cervical' || canId === 'joint_cervical'
          ? 'head_neck'
          : kind === 'joint'
          ? 'joints'
          : 'trunk';

      const existing = map.get(canId);
      if (existing) {
        if (!existing.views.includes(item.view)) {
          existing.views.push(item.view);
        }
      } else {
        map.set(canId, {
          id: canId,
          label,
          side,
          views: [item.view],
          group,
          kind,
          parent: taxMeta?.parent || null
        });
      }
    }
    return map;
  }, [regionCatalog, bodyModel]);

  // Normaliza regiões salvas (incluindo compatibilidade com submissões antigas)
  const normalizedRegions = useMemo(() => {
    return (Array.isArray(regions) ? regions : []).map(r => {
      const canId = resolveCanonicalZemda360RegionId(r.canonicalRegionId || r.regionId);
      const meta = canonicalCatalogMap.get(canId);
      return {
        ...r,
        canonicalRegionId: canId || r.regionId,
        regionLabel: r.regionLabel || meta?.label || anatomicalLabel(canId, bodyModel) || r.regionId,
        side: r.side || meta?.side || 'midline',
        view: (r.view || meta?.views[0] || 'front') as 'front' | 'back' | 'left' | 'right',
        group: r.group || meta?.group || 'trunk',
        kind: r.kind || meta?.kind || 'region'
      };
    });
  }, [regions, canonicalCatalogMap, bodyModel]);

  // IDs destacados no canvas do Zemda360
  const canvasSelectedRegionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of normalizedRegions) {
      if (r.canonicalRegionId) ids.add(r.canonicalRegionId);
      if (r.regionId) ids.add(r.regionId);
    }
    if (activeRegionId && !readOnly) {
      ids.add(activeRegionId);
    }
    return Array.from(ids);
  }, [normalizedRegions, activeRegionId, readOnly]);

  const openRegionEditor = (rawRegionId: string) => {
    if (readOnly) return;
    const canId = resolveCanonicalZemda360RegionId(rawRegionId);
    if (!canId) return;

    const existing = normalizedRegions.find(
      r => r.canonicalRegionId === canId || r.regionId === canId
    );
    setActiveRegionId(canId);
    if (existing) {
      setComplaintType(existing.complaintType || 'dor');
      setIntensity(typeof existing.intensity === 'number' ? existing.intensity : 5);
      setNotes(existing.notes || '');
    } else {
      setComplaintType('dor');
      setIntensity(5);
      setNotes('');
    }
  };

  const handleSaveRegion = () => {
    if (!activeRegionId || !onChange) return;
    const meta = canonicalCatalogMap.get(activeRegionId);
    const resolvedView: 'front' | 'back' | 'left' | 'right' =
      activeView !== 'all' && (!meta || meta.views.includes(activeView))
        ? activeView
        : meta?.views[0] || 'front';

    const label = meta?.label || anatomicalLabel(activeRegionId, bodyModel) || activeRegionId;
    const nextItem: PatientBodyMapRegion = {
      id: `pcr-${activeRegionId}`,
      regionId: activeRegionId,
      canonicalRegionId: activeRegionId,
      regionLabel: label,
      view: resolvedView,
      side: meta?.side || 'midline',
      group: meta?.group || 'trunk',
      kind: meta?.kind || 'region',
      complaintType,
      intensity,
      notes: notes.trim(),
      source: 'patient_pre_consultation'
    };

    const filtered = regions.filter(
      r => resolveCanonicalZemda360RegionId(r.canonicalRegionId || r.regionId) !== activeRegionId
    );
    onChange([...filtered, nextItem]);
    setActiveRegionId(null);
  };

  const handleRemoveRegion = (targetId: string) => {
    if (!onChange) return;
    const targetCanonical = resolveCanonicalZemda360RegionId(targetId);
    onChange(
      regions.filter(r => {
        const rCan = resolveCanonicalZemda360RegionId(r.canonicalRegionId || r.regionId);
        return rCan !== targetCanonical && r.regionId !== targetId;
      })
    );
    if (activeRegionId && resolveCanonicalZemda360RegionId(activeRegionId) === targetCanonical) {
      setActiveRegionId(null);
    }
  };

  // Opções agrupadas por hierarquia anatômica para seleção assistida
  const groupedSelectableRegions = useMemo(() => {
    const groups: Record<string, Array<{ id: string; label: string; side: 'right' | 'left' | 'midline' }>> = {
      head_neck: [],
      trunk: [],
      upper_limb: [],
      lower_limb: [],
      joints: []
    };
    for (const item of canonicalCatalogMap.values()) {
      if (activeView !== 'all' && !item.views.includes(activeView)) continue;
      const gKey = groups[item.group] ? item.group : 'trunk';
      groups[gKey].push({ id: item.id, label: item.label, side: item.side });
    }
    return groups;
  }, [canonicalCatalogMap, activeView]);

  const activeRegionMeta = activeRegionId ? canonicalCatalogMap.get(activeRegionId) : null;
  const activeRegionExisting = activeRegionId
    ? normalizedRegions.find(r => r.canonicalRegionId === activeRegionId || r.regionId === activeRegionId)
    : null;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-3.5 sm:p-4 flex flex-col gap-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-extrabold text-slate-900">
              Mapa Corporal — Zemda360
            </h4>
            <p className="text-[11px] text-slate-500">
              {readOnly
                ? 'Regiões anatômicas informadas pelo paciente na Pré-consulta Digital'
                : 'Selecione a vista e toque diretamente na região corporal ou articulação para registrar sua queixa'}
            </p>
          </div>
        </div>

        {/* Alternador de Modelo Anatômico (Feminino / Masculino) */}
        <div className="inline-flex items-center rounded-xl bg-white border border-slate-200 p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setBodyModel('female')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              bodyModel === 'female'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Corpo Feminino
          </button>
          <button
            type="button"
            onClick={() => setBodyModel('male')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              bodyModel === 'male'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Corpo Masculino
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start min-w-0">
        {/* Motor Anatômico Oficial Zemda360 */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-3 flex flex-col items-center min-w-0">
          <ZemdaBodyCanvas
            bodyModel={bodyModel}
            regionCatalog={regionCatalog}
            controlledView={activeView}
            onViewChange={v => {
              setActiveView(v);
            }}
            selectedRegions={canvasSelectedRegionIds}
            onToggleRegion={openRegionEditor}
            tool="select"
            readOnly={readOnly}
          />

          {!readOnly && (
            <div className="w-full mt-3 pt-2.5 border-t border-slate-100 flex flex-col gap-1.5 min-w-0">
              <label className="text-[11px] font-bold text-slate-600">
                Ou selecione a região anatômica pela lista ({BODY_VIEWS.find(v => v.id === activeView)?.label || 'Vista atual'}):
              </label>
              <select
                value={activeRegionId || ''}
                onChange={e => {
                  if (e.target.value) {
                    openRegionEditor(e.target.value);
                  }
                }}
                className="w-full min-w-0 max-w-full truncate px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">Escolher região anatômica ou articulação...</option>
                {Object.entries(groupedSelectableRegions).map(([groupKey, items]) =>
                  items.length > 0 ? (
                    <optgroup key={groupKey} label={GROUP_LABELS[groupKey] || groupKey}>
                      {items.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.label} ({SIDE_LABELS[item.side]})
                        </option>
                      ))}
                    </optgroup>
                  ) : null
                )}
              </select>
            </div>
          )}
        </div>

        {/* Painel lateral: Detalhamento da região selecionada + Lista de regiões marcadas */}
        <div className="lg:col-span-5 flex flex-col gap-3 min-w-0">
          {!readOnly && activeRegionId && (
            <div className="bg-white rounded-2xl border-2 border-indigo-300 p-3.5 flex flex-col gap-3 shadow-xs min-w-0">
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <span className="text-xs font-extrabold text-indigo-950 block break-words">
                    {activeRegionMeta?.label || anatomicalLabel(activeRegionId, bodyModel) || activeRegionId}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {SIDE_LABELS[activeRegionMeta?.side || 'midline']}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      {activeRegionMeta?.kind === 'joint' ? 'Articulação' : 'Região Anatômica'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveRegionId(null)}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
                >
                  Fechar
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                  Tipo de queixa ou sensação
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {COMPLAINT_TYPES.map(ct => (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => setComplaintType(ct.id)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border text-left transition-colors cursor-pointer truncate ${
                        complaintType === ct.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-600">
                    Intensidade (0 a 10)
                  </label>
                  <span className="text-xs font-extrabold text-rose-600">
                    {intensity}/10
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={intensity}
                  onChange={e => setIntensity(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-semibold mt-0.5">
                  <span>0 (Sem dor)</span>
                  <span>5 (Moderada)</span>
                  <span>10 (Intensa)</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Observação sobre esta região (opcional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ex.: Piora ao movimentar, iniciou há 3 dias..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {activeRegionExisting ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveRegion(activeRegionId)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remover marcação
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={handleSaveRegion}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  {activeRegionExisting ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Atualizar marcação
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> Confirmar seleção
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-col gap-2.5 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">
                Regiões demarcadas ({normalizedRegions.length})
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                <Info className="w-3 h-3 shrink-0" /> Informado pelo paciente
              </span>
            </div>

            {normalizedRegions.length === 0 ? (
              <p className="text-xs text-slate-400 py-5 text-center">
                {readOnly
                  ? 'Nenhuma região corporal foi demarcada pelo paciente.'
                  : 'Nenhuma região selecionada ainda. Toque no mapa corporal do Zemda360 ao lado para adicionar.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {normalizedRegions.map(reg => {
                  const complaintObj = COMPLAINT_TYPES.find(c => c.id === reg.complaintType);
                  const complaintLabel = complaintObj ? complaintObj.label : reg.complaintType;
                  return (
                    <div
                      key={reg.canonicalRegionId || reg.regionId}
                      className="p-2.5 rounded-xl border border-slate-100 bg-slate-50 flex items-start justify-between gap-2 min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-800 break-words">
                            {reg.regionLabel}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 font-semibold">
                            {VIEW_LABELS[reg.view] || 'Frente'}
                          </span>
                          {reg.side && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold">
                              {SIDE_LABELS[reg.side]}
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                            {complaintLabel} • {reg.intensity}/10
                          </span>
                        </div>
                        {reg.notes && (
                          <p className="text-[11px] text-slate-600 mt-1 break-words">
                            “{reg.notes}”
                          </p>
                        )}
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (reg.view && activeView !== 'all') {
                                setActiveView(reg.view);
                              }
                              openRegionEditor(reg.canonicalRegionId || reg.regionId);
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded-lg cursor-pointer"
                            title="Editar região"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRegion(reg.canonicalRegionId || reg.regionId)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                            title="Remover região"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
