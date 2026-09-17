import React, { useState } from 'react';
import {
  TrendingUp,
  Activity,
  Scale,
  Calendar,
  BarChart2,
  Flame,
  Heart,
  Ruler,
  ArrowUpRight,
  ArrowDownRight,
  Minus
} from 'lucide-react';
import { Assessment } from './types';

interface PersonalEvolutionChartsProps {
  history: any[];
}

export const PersonalEvolutionCharts: React.FC<PersonalEvolutionChartsProps> = ({ history }) => {
  const [selectedMetric, setSelectedMetric] = useState<
    'weight' | 'body_fat' | 'lean_mass' | 'perimeters' | 'tav' | 'cardio' | 'vo2' | 'flexibility'
  >('weight');

  if (!history || history.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
        Nenhum dado histórico de avaliações disponível para gerar gráficos de evolução.
      </div>
    );
  }

  // Ordena cronologicamente
  const sorted = [...history].sort(
    (a, b) => new Date(a.assessment_date).getTime() - new Date(b.assessment_date).getTime()
  );

  const initial = sorted[0];
  const latest = sorted[sorted.length - 1];

  const deltaWeight = (latest.weight || 0) - (initial.weight || 0);
  const deltaFat = (latest.body_fat_percentage || 0) - (initial.body_fat_percentage || 0);
  const deltaLean = (latest.lean_mass_kg || 0) - (initial.lean_mass_kg || 0);

  // SVG Chart Dimensions
  const width = 680;
  const height = 240;
  const padding = 40;

  const renderSvgChart = (
    key: string,
    color: string,
    unit: string,
    title?: string,
    customTooltipVal?: (d: any) => string
  ) => {
    const validData = sorted.filter(
      (d) => d[key] !== null && d[key] !== undefined && Number(d[key]) !== 0
    );

    if (validData.length === 0) {
      return (
        <div className="h-44 flex items-center justify-center text-xs text-slate-400">
          Nenhum dado registrado para esta métrica no histórico.
        </div>
      );
    }

    if (validData.length === 1) {
      const d = validData[0];
      return (
        <div className="h-44 flex flex-col items-center justify-center text-xs text-slate-500 gap-1">
          <span className="font-bold text-slate-800 text-base">
            {d[key]} {unit}
          </span>
          <span>Apenas 1 registro em {new Date(d.assessment_date).toLocaleDateString('pt-BR')}.</span>
          <span className="text-slate-400 text-[11px]">Realize a próxima avaliação para traçar a curva de evolução.</span>
        </div>
      );
    }

    const values = validData.map((d) => Number(d[key]));
    const minVal = Math.min(...values) * 0.95;
    const maxVal = Math.max(...values) * 1.05;

    const points = validData.map((d, index) => {
      const x = padding + (index / (validData.length - 1)) * (width - padding * 2);
      const val = Number(d[key]);
      const y =
        height - padding - ((val - minVal) / (maxVal - minVal || 1)) * (height - padding * 2);
      return {
        x,
        y,
        val,
        date: d.assessment_date,
        extra: customTooltipVal ? customTooltipVal(d) : null
      };
    });

    const pathD = points.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, '');

    return (
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-60">
          {/* Linhas de Grade de Fundo */}
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e2e8f0" strokeWidth="1" />

          {/* Área sombreada sob a curva */}
          <path
            d={`${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`}
            fill={color}
            fillOpacity="0.12"
          />

          {/* Linha da métrica */}
          <path d={pathD} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Pontos com valores e datas */}
          {points.map((pt, idx) => (
            <g key={idx}>
              <circle cx={pt.x} cy={pt.y} r="5" fill="#ffffff" stroke={color} strokeWidth="3" />
              <text
                x={pt.x}
                y={pt.y - 12}
                textAnchor="middle"
                className="text-[11px] font-bold fill-slate-800"
              >
                {pt.val} {unit}
              </text>
              {pt.extra && (
                <text
                  x={pt.x}
                  y={pt.y - 25}
                  textAnchor="middle"
                  className="text-[9px] font-bold fill-indigo-600"
                >
                  {pt.extra}
                </text>
              )}
              <text
                x={pt.x}
                y={height - 12}
                textAnchor="middle"
                className="text-[10px] fill-slate-400 font-medium"
              >
                {new Date(pt.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  // Histórico Dedicado de TAV para Tabela
  const tavHistory = sorted.filter((d) => d.tav_value !== null && d.tav_value !== undefined);
  const tavRows = tavHistory.map((cur, idx) => {
    const prev = idx > 0 ? tavHistory[idx - 1] : null;
    const prevVal = prev ? Number(prev.tav_value) : null;
    const curVal = Number(cur.tav_value);
    let diff: number | null = null;
    let pctVariation: number | null = null;

    if (prevVal !== null) {
      diff = parseFloat((curVal - prevVal).toFixed(1));
      if (prevVal !== 0) {
        pctVariation = parseFloat(((diff / Math.abs(prevVal)) * 100).toFixed(1));
      }
    }

    return {
      date: cur.assessment_date,
      prevVal,
      curVal,
      diff,
      pctVariation,
      method: cur.tav_method || cur.composition_method || 'Bioimpedância',
      equipment: cur.tav_equipment || 'InBody',
      classification: cur.tav_classification || 'Normal',
      unit: cur.tav_unit || 'nível'
    };
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
      {/* Resumo Comparativo Inicial × Atual */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Variação de Peso</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800">{latest.weight || '—'} kg</span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                deltaWeight < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
              }`}
            >
              {deltaWeight > 0 ? `+${deltaWeight.toFixed(1)}` : deltaWeight.toFixed(1)} kg
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Iniciou com {initial.weight} kg</div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Variação de Gordura</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800">
              {latest.body_fat_percentage ? `${latest.body_fat_percentage}%` : '—'}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                deltaFat < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {deltaFat > 0 ? `+${deltaFat.toFixed(1)}` : deltaFat.toFixed(1)}%
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Iniciou com {initial.body_fat_percentage}%</div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Massa Magra</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800">
              {latest.lean_mass_kg ? `${latest.lean_mass_kg} kg` : '—'}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                deltaLean > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {deltaLean > 0 ? `+${deltaLean.toFixed(1)}` : deltaLean.toFixed(1)} kg
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Iniciou com {initial.lean_mass_kg} kg</div>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <span className="text-[11px] font-bold text-indigo-700 uppercase flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" />
            <span>TAV Mais Recente</span>
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-900">
              {latest.tav_value !== null && latest.tav_value !== undefined ? latest.tav_value : '—'}
            </span>
            <span className="text-xs text-indigo-600 font-bold">{latest.tav_unit || 'nível'}</span>
          </div>
          <div className="text-[10px] text-indigo-700 mt-1 font-semibold truncate">
            {latest.tav_classification || 'Sem classificação'}
          </div>
        </div>
      </div>

      {/* Tabs de Seleção do Gráfico */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-purple-600" />
          <span>Curva Histórica de Evolução</span>
        </h4>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setSelectedMetric('weight')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              selectedMetric === 'weight'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Peso
          </button>
          <button
            onClick={() => setSelectedMetric('body_fat')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              selectedMetric === 'body_fat'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            % Gordura
          </button>
          <button
            onClick={() => setSelectedMetric('lean_mass')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              selectedMetric === 'lean_mass'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Massa Magra
          </button>
          <button
            onClick={() => setSelectedMetric('tav')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 ${
              selectedMetric === 'tav'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            TAV (Gordura Visceral)
          </button>
          <button
            onClick={() => setSelectedMetric('perimeters')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              selectedMetric === 'perimeters'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Cintura
          </button>
          <button
            onClick={() => setSelectedMetric('cardio')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              selectedMetric === 'cardio'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            FC Repouso
          </button>
          <button
            onClick={() => setSelectedMetric('vo2')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              selectedMetric === 'vo2'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            VO₂ Máx
          </button>
          <button
            onClick={() => setSelectedMetric('flexibility')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              selectedMetric === 'flexibility'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Flexibilidade
          </button>
        </div>
      </div>

      {/* Exibição do Gráfico Selecionado */}
      <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
        {selectedMetric === 'weight' && renderSvgChart('weight', '#9333ea', 'kg')}
        {selectedMetric === 'body_fat' && renderSvgChart('body_fat_percentage', '#f59e0b', '%')}
        {selectedMetric === 'lean_mass' && renderSvgChart('lean_mass_kg', '#10b981', 'kg')}
        {selectedMetric === 'perimeters' && renderSvgChart('waist_cm', '#0ea5e9', 'cm')}
        {selectedMetric === 'tav' &&
          renderSvgChart('tav_value', '#6366f1', latest.tav_unit || 'nível', 'TAV', (d) =>
            d.tav_classification ? d.tav_classification : ''
          )}
        {selectedMetric === 'cardio' && renderSvgChart('resting_heart_rate_bpm', '#e11d48', 'bpm')}
        {selectedMetric === 'vo2' && renderSvgChart('vo2_max', '#059669', 'ml/kg/min')}
        {selectedMetric === 'flexibility' && renderSvgChart('flexibility_wells_cm', '#d97706', 'cm')}
      </div>

      {/* HISTÓRICO DEDICADO DO TAV (QUANDO SELECIONADO OU DISPONÍVEL) */}
      {selectedMetric === 'tav' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-indigo-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Histórico Detalhado de Medições do TAV
            </h4>
          </div>

          <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px] bg-slate-50">
                  <th className="py-2.5 px-3">Data</th>
                  <th className="py-2.5 px-3">Valor Anterior</th>
                  <th className="py-2.5 px-3">Valor Atual</th>
                  <th className="py-2.5 px-3">Diferença (+/-)</th>
                  <th className="py-2.5 px-3">% Variação</th>
                  <th className="py-2.5 px-3">Método</th>
                  <th className="py-2.5 px-3">Equipamento</th>
                  <th className="py-2.5 px-3">Classificação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tavRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-slate-800">
                      {new Date(r.date).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {r.prevVal !== null ? `${r.prevVal} ${r.unit}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-black text-indigo-900">
                      {r.curVal} {r.unit}
                    </td>
                    <td className="py-2.5 px-3">
                      {r.diff !== null ? (
                        <span
                          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-bold ${
                            r.diff < 0
                              ? 'bg-emerald-50 text-emerald-700'
                              : r.diff > 0
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.diff > 0 ? `+${r.diff}` : r.diff}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {r.pctVariation !== null ? (
                        <span
                          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-bold ${
                            r.pctVariation < 0
                              ? 'bg-emerald-50 text-emerald-700'
                              : r.pctVariation > 0
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.pctVariation > 0 ? `+${r.pctVariation}%` : `${r.pctVariation}%`}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{r.method}</td>
                    <td className="py-2.5 px-3 text-slate-700 font-medium">{r.equipment}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                        {r.classification}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabela Cronológica Geral */}
      {selectedMetric !== 'tav' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px]">
                <th className="py-2.5 px-3">Data</th>
                <th className="py-2.5 px-3">Peso</th>
                <th className="py-2.5 px-3">% Gordura</th>
                <th className="py-2.5 px-3">Massa Magra</th>
                <th className="py-2.5 px-3">TAV</th>
                <th className="py-2.5 px-3">Cintura</th>
                <th className="py-2.5 px-3">Quadril</th>
                <th className="py-2.5 px-3">VO₂ Máx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-slate-800">
                    {new Date(item.assessment_date).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-700">{item.weight || '—'} kg</td>
                  <td className="py-2.5 px-3 font-bold text-amber-600">
                    {item.body_fat_percentage ? `${item.body_fat_percentage}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-emerald-600 font-semibold">{item.lean_mass_kg || '—'} kg</td>
                  <td className="py-2.5 px-3 text-indigo-700 font-bold">
                    {item.tav_value !== null && item.tav_value !== undefined ? `${item.tav_value} ${item.tav_unit || 'nível'}` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">{item.waist_cm ? `${item.waist_cm} cm` : '—'}</td>
                  <td className="py-2.5 px-3 text-slate-600">{item.hip_cm ? `${item.hip_cm} cm` : '—'}</td>
                  <td className="py-2.5 px-3 text-slate-600">{item.vo2_max ? `${item.vo2_max} ml` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
