import React, { useState, useMemo } from 'react';
import { ZemdaBodyCanvas } from '../zemda-body/ZemdaBodyCanvas';
import { Workout, WorkoutExercise } from './types';
import { Flame, Eye, Info, Layers, Dumbbell } from 'lucide-react';

interface PersonalBodyMapIntegrationProps {
  workouts: Workout[];
  studentName?: string;
}

export const PersonalBodyMapIntegration: React.FC<PersonalBodyMapIntegrationProps> = ({
  workouts,
  studentName
}) => {
  const [activeViewMode, setActiveViewMode] = useState<'all' | 'front' | 'back' | 'left' | 'right'>('all');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);

  // Calcula o mapa de calor de volume semanal baseado nas séries dos treinos ativos
  const { volumeHeatmap, muscleSetsSummary } = useMemo(() => {
    const summary: Record<string, number> = {
      peito: 0,
      costas: 0,
      ombros: 0,
      biceps: 0,
      triceps: 0,
      quadriceps: 0,
      posterior: 0,
      gluteos: 0,
      abdomen: 0,
      panturrilha: 0
    };

    workouts.forEach((w) => {
      if (w.exercises) {
        w.exercises.forEach((ex) => {
          const group = (ex.muscle_group || '').toLowerCase();
          const sets = Number(ex.sets) || 0;

          if (group.includes('peit')) summary.peito += sets;
          else if (group.includes('cost') || group.includes('dors')) summary.costas += sets;
          else if (group.includes('ombr') || group.includes('delt')) summary.ombros += sets;
          else if (group.includes('bic')) summary.biceps += sets;
          else if (group.includes('tric')) summary.triceps += sets;
          else if (group.includes('quad') || group.includes('coxa anterior')) summary.quadriceps += sets;
          else if (group.includes('post') || group.includes('isquio')) summary.posterior += sets;
          else if (group.includes('glut')) summary.gluteos += sets;
          else if (group.includes('abd')) summary.abdomen += sets;
          else if (group.includes('pant') || group.includes('gastro')) summary.panturrilha += sets;
        });
      }
    });

    // Mapeia os grupos musculares para as chaves do bodyRegionsData
    const heatmap: Record<string, number> = {};

    // Função auxiliar para normalizar (0 a 1 onde 20 séries = 1.0)
    const normalize = (sets: number) => Math.min(1.0, parseFloat((sets / 20).toFixed(2)));

    if (summary.peito > 0) {
      heatmap['peito_direito'] = normalize(summary.peito);
      heatmap['peito_esquerdo'] = normalize(summary.peito);
      heatmap['torax'] = normalize(summary.peito);
    }
    if (summary.costas > 0) {
      heatmap['dorsal_direito'] = normalize(summary.costas);
      heatmap['dorsal_esquerdo'] = normalize(summary.costas);
      heatmap['costas_superior'] = normalize(summary.costas);
      heatmap['lombar'] = normalize(summary.costas * 0.6);
    }
    if (summary.ombros > 0) {
      heatmap['ombro_direito'] = normalize(summary.ombros);
      heatmap['ombro_esquerdo'] = normalize(summary.ombros);
      heatmap['ombro_lateral_d'] = normalize(summary.ombros);
      heatmap['ombro_lateral_e'] = normalize(summary.ombros);
    }
    if (summary.biceps > 0) {
      heatmap['braco_direito'] = normalize(summary.biceps);
      heatmap['braco_esquerdo'] = normalize(summary.biceps);
    }
    if (summary.triceps > 0) {
      heatmap['braco_direito_post'] = normalize(summary.triceps);
      heatmap['braco_esquerdo_post'] = normalize(summary.triceps);
    }
    if (summary.quadriceps > 0) {
      heatmap['coxa_anterior_d'] = normalize(summary.quadriceps);
      heatmap['coxa_anterior_e'] = normalize(summary.quadriceps);
    }
    if (summary.posterior > 0) {
      heatmap['coxa_posterior_d'] = normalize(summary.posterior);
      heatmap['coxa_posterior_e'] = normalize(summary.posterior);
    }
    if (summary.gluteos > 0) {
      heatmap['gluteo_direito'] = normalize(summary.gluteos);
      heatmap['gluteo_esquerdo'] = normalize(summary.gluteos);
    }
    if (summary.abdomen > 0) {
      heatmap['abdomen_central'] = normalize(summary.abdomen);
      heatmap['quadril_anterior'] = normalize(summary.abdomen);
    }
    if (summary.panturrilha > 0) {
      heatmap['panturrilha_d'] = normalize(summary.panturrilha);
      heatmap['panturrilha_e'] = normalize(summary.panturrilha);
      heatmap['perna_direita'] = normalize(summary.panturrilha);
      heatmap['perna_esquerda'] = normalize(summary.panturrilha);
    }

    return { volumeHeatmap: heatmap, muscleSetsSummary: summary };
  }, [workouts]);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
      {/* Header com legenda e seletor de vistas */}
      <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <span>Mapa Muscular 3D & Heatmap de Volume Semanal</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribuição anatômica das séries prescritas nos treinos ativos de {studentName || 'o aluno'}.
          </p>
        </div>

        {/* Seletor de Vistas */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveViewMode('all')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-slate-900 shadow-sm cursor-default"
          >
            Todas as Vistas
          </button>
        </div>
      </div>

      {/* Legenda de Intensidade de Volume */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
        <span className="font-semibold text-slate-600 flex items-center gap-1.5">
          <Info className="w-4 h-4 text-indigo-600" />
          Intensidade Semanal:
        </span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
            <span className="text-slate-600 text-[11px]">Baixo (1-8 séries)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
            <span className="text-slate-600 text-[11px]">Moderado (9-16 séries)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-600 inline-block" />
            <span className="text-slate-600 text-[11px]">Alto Volume (17+ séries)</span>
          </div>
        </div>
      </div>

      {/* Canvas Anatômico ZemdaBody com Overlay de Heatmap */}
      <div className="bg-slate-950/5 rounded-3xl p-4 border border-slate-200">
        <ZemdaBodyCanvas
          initialViewMode={activeViewMode}
          readOnly={true}
          volumeHeatmap={volumeHeatmap}
          activeMuscleHighlight={selectedMuscle ? { primary: [selectedMuscle] } : undefined}
          onToggleRegion={(regionId: string) => {
            setSelectedMuscle(regionId || null);
          }}
        />
      </div>

      {/* Resumo de Séries por Grupo */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Object.entries(muscleSetsSummary).map(([group, sets]) => (
          <button
            key={group}
            onClick={() => setSelectedMuscle(selectedMuscle === group ? null : group)}
            className={`p-3 rounded-2xl border text-left transition-all ${
              selectedMuscle === group
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                : 'bg-white border-slate-200 hover:border-indigo-300 text-slate-800'
            }`}
          >
            <div className="text-[10px] uppercase font-bold opacity-75">{group}</div>
            <div className="text-lg font-black mt-0.5">{sets} séries</div>
          </button>
        ))}
      </div>
    </div>
  );
};
