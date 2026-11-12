import React, { useState } from 'react';
import { Activity, Plus, Trash2, CheckCircle2, Info } from 'lucide-react';

export interface PatientBodyMapRegion {
  id: string;
  regionId: string;
  regionLabel: string;
  view: 'front' | 'back';
  complaintType: string;
  intensity: number;
  notes?: string;
  source?: string;
}

interface AnatomicalZone {
  id: string;
  label: string;
  view: 'front' | 'back';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

const ANATOMICAL_ZONES: AnatomicalZone[] = [
  // Vista Anterior (Frente)
  { id: 'head_front', label: 'Cabeça / Face', view: 'front', cx: 100, cy: 36, rx: 18, ry: 22 },
  { id: 'neck_front', label: 'Pescoço / Cervical Anterior', view: 'front', cx: 100, cy: 68, rx: 10, ry: 8 },
  { id: 'shoulder_right', label: 'Ombro Direito', view: 'front', cx: 64, cy: 88, rx: 14, ry: 12 },
  { id: 'shoulder_left', label: 'Ombro Esquerdo', view: 'front', cx: 136, cy: 88, rx: 14, ry: 12 },
  { id: 'chest', label: 'Tórax / Peito', view: 'front', cx: 100, cy: 106, rx: 24, ry: 20 },
  { id: 'abdomen', label: 'Abdome', view: 'front', cx: 100, cy: 150, rx: 22, ry: 22 },
  { id: 'arm_right', label: 'Braço / Antebraço Direito', view: 'front', cx: 48, cy: 136, rx: 10, ry: 32 },
  { id: 'arm_left', label: 'Braço / Antebraço Esquerdo', view: 'front', cx: 152, cy: 136, rx: 10, ry: 32 },
  { id: 'hand_right', label: 'Punho / Mão Direita', view: 'front', cx: 42, cy: 184, rx: 9, ry: 12 },
  { id: 'hand_left', label: 'Punho / Mão Esquerda', view: 'front', cx: 158, cy: 184, rx: 9, ry: 12 },
  { id: 'pelvis_front', label: 'Quadril / Pelve', view: 'front', cx: 100, cy: 188, rx: 24, ry: 14 },
  { id: 'thigh_knee_right', label: 'Coxa / Joelho Direito', view: 'front', cx: 84, cy: 238, rx: 13, ry: 34 },
  { id: 'thigh_knee_left', label: 'Coxa / Joelho Esquerdo', view: 'front', cx: 116, cy: 238, rx: 13, ry: 34 },
  { id: 'leg_foot_right', label: 'Perna / Tornozelo / Pé Direito', view: 'front', cx: 84, cy: 306, rx: 11, ry: 32 },
  { id: 'leg_foot_left', label: 'Perna / Tornozelo / Pé Esquerdo', view: 'front', cx: 116, cy: 306, rx: 11, ry: 32 },

  // Vista Posterior (Costas)
  { id: 'head_back', label: 'Cabeça / Nuca', view: 'back', cx: 100, cy: 36, rx: 18, ry: 22 },
  { id: 'cervical_back', label: 'Coluna Cervical / Pescoço', view: 'back', cx: 100, cy: 68, rx: 11, ry: 9 },
  { id: 'scapula_right', label: 'Ombro / Escápula Esquerda', view: 'back', cx: 68, cy: 94, rx: 15, ry: 14 },
  { id: 'scapula_left', label: 'Ombro / Escápula Direita', view: 'back', cx: 132, cy: 94, rx: 15, ry: 14 },
  { id: 'thoracic_spine', label: 'Coluna Torácica / Meio das Costas', view: 'back', cx: 100, cy: 114, rx: 20, ry: 22 },
  { id: 'lumbar_spine', label: 'Coluna Lombar', view: 'back', cx: 100, cy: 154, rx: 22, ry: 18 },
  { id: 'glute_hip', label: 'Glúteos / Quadril Posterior', view: 'back', cx: 100, cy: 190, rx: 24, ry: 16 },
  { id: 'posterior_thigh_left', label: 'Posterior de Coxa Esquerda', view: 'back', cx: 84, cy: 238, rx: 13, ry: 32 },
  { id: 'posterior_thigh_right', label: 'Posterior de Coxa Direita', view: 'back', cx: 116, cy: 238, rx: 13, ry: 32 },
  { id: 'calf_heel_left', label: 'Panturrilha / Calcanhar Esquerdo', view: 'back', cx: 84, cy: 304, rx: 11, ry: 32 },
  { id: 'calf_heel_right', label: 'Panturrilha / Calcanhar Direito', view: 'back', cx: 116, cy: 304, rx: 11, ry: 32 }
];

const COMPLAINT_TYPES = [
  { id: 'dor', label: 'Dor' },
  { id: 'desconforto', label: 'Desconforto / Incômodo' },
  { id: 'tensao', label: 'Tensão / Rigidez' },
  { id: 'formigamento', label: 'Formigamento / Dormência' },
  { id: 'estetica', label: 'Queixa Estética / Pele' },
  { id: 'outro', label: 'Outro' }
];

export const PreConsultationBodyMapSimple: React.FC<{
  regions: PatientBodyMapRegion[];
  onChange?: (regions: PatientBodyMapRegion[]) => void;
  readOnly?: boolean;
}> = ({ regions, onChange, readOnly = false }) => {
  const [activeView, setActiveView] = useState<'front' | 'back'>('front');
  const [selectedZone, setSelectedZone] = useState<AnatomicalZone | null>(null);
  const [complaintType, setComplaintType] = useState<string>('dor');
  const [intensity, setIntensity] = useState<number>(5);
  const [notes, setNotes] = useState<string>('');

  const visibleZones = ANATOMICAL_ZONES.filter(z => z.view === activeView);

  const handleZoneClick = (zone: AnatomicalZone) => {
    if (readOnly) return;
    const existing = regions.find(r => r.regionId === zone.id);
    setSelectedZone(zone);
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
    if (!selectedZone || !onChange) return;
    const nextItem: PatientBodyMapRegion = {
      id: `pcr-${selectedZone.id}`,
      regionId: selectedZone.id,
      regionLabel: selectedZone.label,
      view: selectedZone.view,
      complaintType,
      intensity,
      notes: notes.trim(),
      source: 'patient_pre_consultation'
    };
    const filtered = regions.filter(r => r.regionId !== selectedZone.id);
    onChange([...filtered, nextItem]);
    setSelectedZone(null);
  };

  const handleRemoveRegion = (regionId: string) => {
    if (!onChange) return;
    onChange(regions.filter(r => r.regionId !== regionId));
    if (selectedZone?.id === regionId) {
      setSelectedZone(null);
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">
              Mapa Corporal — Zemda360
            </h4>
            <p className="text-[11px] text-slate-500">
              {readOnly
                ? 'Regiões informadas pelo paciente na Pré-consulta Digital'
                : 'Toque nas regiões do corpo para indicar dor, desconforto ou queixa'}
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-xl bg-white border border-slate-200 p-0.5">
          <button
            type="button"
            onClick={() => {
              setActiveView('front');
              setSelectedZone(null);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeView === 'front' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Frente ({regions.filter(r => r.view === 'front').length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveView('back');
              setSelectedZone(null);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeView === 'back' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Costas ({regions.filter(r => r.view === 'back').length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* Silhueta Anatômica Simplificada */}
        <div className="md:col-span-5 bg-white rounded-2xl border border-slate-200 p-3 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Vista {activeView === 'front' ? 'Anterior (Frente)' : 'Posterior (Costas)'}
          </span>
          <svg viewBox="0 0 200 355" className="w-full max-w-[210px] h-auto select-none">
            {/* Silhueta base neutra */}
            <g fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5">
              {/* Cabeça */}
              <ellipse cx="100" cy="36" rx="19" ry="23" />
              {/* Pescoço */}
              <rect x="90" y="58" width="20" height="16" rx="6" />
              {/* Tronco */}
              <path d="M68,74 L132,74 L126,198 L74,198 Z" />
              {/* Braços */}
              <rect x="40" y="76" width="24" height="106" rx="11" />
              <rect x="136" y="76" width="24" height="106" rx="11" />
              {/* Pernas */}
              <rect x="73" y="198" width="24" height="142" rx="11" />
              <rect x="103" y="198" width="24" height="142" rx="11" />
            </g>

            {/* Zonas interativas */}
            {visibleZones.map(zone => {
              const marked = regions.find(r => r.regionId === zone.id);
              const isSelected = selectedZone?.id === zone.id;
              return (
                <g
                  key={zone.id}
                  onClick={() => handleZoneClick(zone)}
                  className={readOnly ? '' : 'cursor-pointer group'}
                >
                  <ellipse
                    cx={zone.cx}
                    cy={zone.cy}
                    rx={zone.rx}
                    ry={zone.ry}
                    fill={
                      marked
                        ? 'rgba(225, 29, 72, 0.35)'
                        : isSelected
                        ? 'rgba(79, 70, 229, 0.30)'
                        : 'rgba(99, 102, 241, 0.08)'
                    }
                    stroke={
                      marked
                        ? '#e11d48'
                        : isSelected
                        ? '#4f46e5'
                        : '#94a3b8'
                    }
                    strokeWidth={marked || isSelected ? 2 : 1}
                    strokeDasharray={marked || isSelected ? undefined : '2,2'}
                  />
                  {marked && (
                    <text
                      x={zone.cx}
                      y={zone.cy + 4}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="bold"
                      fill="#881337"
                    >
                      {marked.intensity}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {!readOnly && (
            <p className="text-[10px] text-slate-400 text-center mt-1">
              Toque em uma região pontilhada para detalhar o sintoma
            </p>
          )}
        </div>

        {/* Painel lateral: Edição de região selecionada + Lista de regiões marcadas */}
        <div className="md:col-span-7 flex flex-col gap-3">
          {!readOnly && selectedZone && (
            <div className="bg-white rounded-2xl border-2 border-indigo-200 p-3.5 flex flex-col gap-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-indigo-950">
                  Região: {selectedZone.label}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedZone(null)}
                  className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Tipo de queixa ou sensação
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {COMPLAINT_TYPES.map(ct => (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => setComplaintType(ct.id)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border text-left transition-colors cursor-pointer ${
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
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Observação sobre esta região (opcional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ex.: Piora ao levantar o braço ou ao caminhar..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveRegion}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Confirmar região
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                Regiões marcadas ({regions.length})
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                <Info className="w-3 h-3" /> Informado pelo paciente
              </span>
            </div>

            {regions.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                {readOnly
                  ? 'Nenhuma região corporal foi demarcada pelo paciente.'
                  : 'Nenhuma região selecionada ainda. Toque no mapa ao lado para adicionar.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                {regions.map(reg => (
                  <div
                    key={reg.regionId}
                    className="p-2.5 rounded-xl border border-slate-100 bg-slate-50 flex items-start justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-800">
                          {reg.regionLabel}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 font-semibold">
                          {reg.view === 'back' ? 'Costas' : 'Frente'}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                          {reg.complaintType} • {reg.intensity}/10
                        </span>
                      </div>
                      {reg.notes && (
                        <p className="text-[11px] text-slate-600 mt-1">
                          “{reg.notes}”
                        </p>
                      )}
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRegion(reg.regionId)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                        title="Remover região"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
