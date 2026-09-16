import React, { useState } from 'react';
import { TrendingUp, Activity, Scale, Calendar, BarChart2 } from 'lucide-react';
import { Assessment } from './types';

interface PersonalEvolutionChartsProps {
  history: any[];
}

export const PersonalEvolutionCharts: React.FC<PersonalEvolutionChartsProps> = ({ history }) => {
  const [selectedMetric, setSelectedMetric] = useState<'weight' | 'body_fat' | 'lean_mass' | 'perimeters'>('weight');

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
  const width = 650;
  const height = 220;
  const padding = 35;

  const renderSvgChart = (key: string, color: string, unit: string) => {
    const validData = sorted.filter((d) => d[key] !== null && d[key] !== undefined && Number(d[key]) > 0);
    if (validData.length < 2) {
      return (
        <div className="h-44 flex items-center justify-center text-xs text-slate-400">
          São necessárias pelo menos 2 avaliações com dados válidos para traçar a curva de evolução.
        </div>
      );
    }

    const values = validData.map((d) => Number(d[key]));
    const minVal = Math.min(...values) * 0.95;
    const maxVal = Math.max(...values) * 1.05;

    const points = validData.map((d, index) => {
      const x = padding + (index / (validData.length - 1)) * (width - padding * 2);
      const val = Number(d[key]);
      const y = height - padding - ((val - minVal) / (maxVal - minVal || 1)) * (height - padding * 2);
      return { x, y, val, date: d.assessment_date };
    });

    const pathD = points.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, '');

    return (
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56">
          {/* Linhas de Grade de Fundo */}
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#f1f5f9" strokeWidth="1" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e2e8f0" strokeWidth="1" />

          {/* Área sombreada sob a curva */}
          <path
            d={`${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`}
            fill={color}
            fillOpacity="0.1"
          />

          {/* Linha da métrica */}
          <path d={pathD} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Pontos com valores e datas */}
          {points.map((pt, idx) => (
            <g key={idx}>
              <circle cx={pt.x} cy={pt.y} r="5" fill="#ffffff" stroke={color} strokeWidth="3" />
              <text
                x={pt.x}
                y={pt.y - 10}
                textAnchor="middle"
                className="text-[11px] font-bold fill-slate-700"
              >
                {pt.val}{unit}
              </text>
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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
      {/* Resumo Comparativo Inicial × Atual */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </div>

      {/* Tabs de Seleção do Gráfico */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-purple-600" />
          <span>Curva Histórica de Evolução</span>
        </h4>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectedMetric('weight')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              selectedMetric === 'weight'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Peso Corporal
          </button>
          <button
            onClick={() => setSelectedMetric('body_fat')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              selectedMetric === 'body_fat'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            % de Gordura
          </button>
          <button
            onClick={() => setSelectedMetric('lean_mass')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              selectedMetric === 'lean_mass'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Massa Magra (kg)
          </button>
          <button
            onClick={() => setSelectedMetric('perimeters')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              selectedMetric === 'perimeters'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Cintura & Quadril
          </button>
        </div>
      </div>

      {/* Exibição do Gráfico Selecionado */}
      <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
        {selectedMetric === 'weight' && renderSvgChart('weight', '#9333ea', 'kg')}
        {selectedMetric === 'body_fat' && renderSvgChart('body_fat_percentage', '#f59e0b', '%')}
        {selectedMetric === 'lean_mass' && renderSvgChart('lean_mass_kg', '#10b981', 'kg')}
        {selectedMetric === 'perimeters' && renderSvgChart('waist_cm', '#0ea5e9', 'cm')}
      </div>

      {/* Tabela Cronológica Detalhada */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px]">
              <th className="py-2.5 px-3">Data</th>
              <th className="py-2.5 px-3">Peso</th>
              <th className="py-2.5 px-3">% Gordura</th>
              <th className="py-2.5 px-3">Massa Magra</th>
              <th className="py-2.5 px-3">Massa Gorda</th>
              <th className="py-2.5 px-3">Cintura</th>
              <th className="py-2.5 px-3">Quadril</th>
              <th className="py-2.5 px-3">Braço Dir.</th>
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
                <td className="py-2.5 px-3 text-slate-600">{item.fat_mass_kg || '—'} kg</td>
                <td className="py-2.5 px-3 text-slate-600">{item.waist_cm ? `${item.waist_cm} cm` : '—'}</td>
                <td className="py-2.5 px-3 text-slate-600">{item.hip_cm ? `${item.hip_cm} cm` : '—'}</td>
                <td className="py-2.5 px-3 text-slate-600">{item.arm_right_flexed ? `${item.arm_right_flexed} cm` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
