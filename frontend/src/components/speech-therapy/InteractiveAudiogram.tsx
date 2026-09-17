import React, { useState, useMemo } from 'react';
import { Volume2, Ear, RefreshCw, Eye, EyeOff, CheckCircle2, ShieldAlert } from 'lucide-react';

export interface AudiogramThresholds {
  [freq: number]: number | null;
}

export interface AudiogramData {
  rightAir: AudiogramThresholds;
  leftAir: AudiogramThresholds;
  rightBone: AudiogramThresholds;
  leftBone: AudiogramThresholds;
}

export interface InteractiveAudiogramProps {
  data: AudiogramData;
  onChange: (data: AudiogramData) => void;
  readOnly?: boolean;
}

const FREQUENCIES = [125, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000];
const INTENSITIES = [-10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

// Bananeira da fala (Speech Banana)
const SPEECH_BANANA_POLYGON = [
  { freq: 250, db: 30 },
  { freq: 500, db: 25 },
  { freq: 1000, db: 20 },
  { freq: 2000, db: 25 },
  { freq: 4000, db: 35 },
  { freq: 6000, db: 55 },
  { freq: 4000, db: 65 },
  { freq: 2000, db: 60 },
  { freq: 1000, db: 55 },
  { freq: 500, db: 50 },
  { freq: 250, db: 45 }
];

export const InteractiveAudiogram: React.FC<InteractiveAudiogramProps> = ({
  data,
  onChange,
  readOnly = false
}) => {
  const [activeEar, setActiveEar] = useState<'right' | 'left'>('right');
  const [conductionType, setConductionType] = useState<'air' | 'bone'>('air');
  const [showSpeechBanana, setShowSpeechBanana] = useState(true);

  // Dimensões SVG
  const svgWidth = 600;
  const svgHeight = 440;
  const margin = { top: 40, right: 30, bottom: 40, left: 55 };
  const graphWidth = svgWidth - margin.left - margin.right;
  const graphHeight = svgHeight - margin.top - margin.bottom;

  // Escala X (Frequências logarítmicas/proporcionais)
  const getX = (freq: number) => {
    const idx = FREQUENCIES.indexOf(freq);
    if (idx === -1) return margin.left;
    return margin.left + (idx / (FREQUENCIES.length - 1)) * graphWidth;
  };

  // Escala Y (Intensidades: -10 dB no topo, 120 dB na base)
  const getY = (db: number) => {
    const minDb = -10;
    const maxDb = 120;
    const ratio = (db - minDb) / (maxDb - minDb);
    return margin.top + ratio * graphHeight;
  };

  // Cálculo da Média Tritonal (PTA: 500, 1000, 2000 Hz)
  const calculatePTA = (ear: 'right' | 'left') => {
    const airData = ear === 'right' ? data.rightAir : data.leftAir;
    const v500 = airData[500];
    const v1000 = airData[1000];
    const v2000 = airData[2000];

    if (v500 !== null && v1000 !== null && v2000 !== null && v500 !== undefined && v1000 !== undefined && v2000 !== undefined) {
      const avg = Math.round((v500 + v1000 + v2000) / 3);
      let degree = 'Normal';
      if (avg <= 20) degree = 'Normal (<= 20 dB)';
      else if (avg <= 40) degree = 'Perda Auditiva Leve (21-40 dB)';
      else if (avg <= 70) degree = 'Perda Auditiva Moderada (41-70 dB)';
      else if (avg <= 90) degree = 'Perda Auditiva Severa (71-90 dB)';
      else degree = 'Perda Auditiva Profunda (> 90 dB)';
      return { avg, degree };
    }
    return { avg: null, degree: 'Limiares parciais' };
  };

  const rightPTA = useMemo(() => calculatePTA('right'), [data.rightAir]);
  const leftPTA = useMemo(() => calculatePTA('left'), [data.leftAir]);

  // Manipulação de clique na grade do audiograma
  const handleGridClick = (freq: number, db: number) => {
    if (readOnly) return;

    const targetKey =
      activeEar === 'right'
        ? conductionType === 'air'
          ? 'rightAir'
          : 'rightBone'
        : conductionType === 'air'
        ? 'leftAir'
        : 'leftBone';

    const currentMap = { ...data[targetKey] };
    if (currentMap[freq] === db) {
      currentMap[freq] = null; // desmarca se clicar no mesmo ponto
    } else {
      currentMap[freq] = db;
    }

    onChange({
      ...data,
      [targetKey]: currentMap
    });
  };

  const handleClear = () => {
    onChange({
      rightAir: {},
      leftAir: {},
      rightBone: {},
      leftBone: {}
    });
  };

  // Geração de pontos para polígono da Banana da Fala
  const speechBananaPoints = SPEECH_BANANA_POLYGON.map(p => `${getX(p.freq)},${getY(p.db)}`).join(' ');

  // Renderização de linhas contínuas entre limiares
  const renderLineSeries = (thresholds: AudiogramThresholds, color: string, isDashed: boolean = false) => {
    const points: { x: number; y: number }[] = [];
    FREQUENCIES.forEach(freq => {
      const db = thresholds[freq];
      if (db !== null && db !== undefined) {
        points.push({ x: getX(freq), y: getY(db) });
      }
    });

    if (points.length < 2) return null;

    const pathData = points.reduce((acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');

    return (
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={isDashed ? '4,4' : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-xs">
      {/* Cabeçalho do Audiograma */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Ear className="w-4 h-4 text-indigo-600" />
            Audiometria Tonal Liminar Interativa (Gráfico SVG Padronizado)
          </h3>
          <p className="text-xs text-slate-500">
            Mapeamento de via aérea e óssea para OD (Vermelho) e OE (Azul), cálculo automático de PTA e área da fala.
          </p>
        </div>

        {/* Controles de Orelha e Condução */}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setActiveEar('right')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeEar === 'right'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Orelha Direita (OD)
              </button>
              <button
                type="button"
                onClick={() => setActiveEar('left')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeEar === 'left'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Orelha Esquerda (OE)
              </button>
            </div>

            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setConductionType('air')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  conductionType === 'air'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Via Aérea (VA)
              </button>
              <button
                type="button"
                onClick={() => setConductionType('bone')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  conductionType === 'bone'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Via Óssea (VO)
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowSpeechBanana(!showSpeechBanana)}
              className="px-2.5 py-1.5 text-xs font-bold rounded-xl border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 transition-colors flex items-center gap-1 cursor-pointer"
            >
              {showSpeechBanana ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>Área da Fala</span>
            </button>

            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 text-slate-400 hover:text-red-500 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              title="Limpar gráfico"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Grid SVG do Audiograma */}
      <div className="flex flex-col xl:flex-row items-start justify-center gap-6">
        <div className="w-full max-w-[620px] overflow-x-auto bg-white dark:bg-slate-950 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full select-none">
            {/* Área da Fala (Speech Banana) */}
            {showSpeechBanana && (
              <polygon
                points={speechBananaPoints}
                fill="#fef3c7"
                fillOpacity="0.45"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="3,3"
              />
            )}

            {/* Linhas horizontais (Intensidade em dB) */}
            {INTENSITIES.map(db => {
              const y = getY(db);
              const isNormalBorder = db === 20;
              return (
                <g key={`db-${db}`}>
                  <line
                    x1={margin.left}
                    y1={y}
                    x2={svgWidth - margin.right}
                    y2={y}
                    stroke={isNormalBorder ? '#10b981' : '#e2e8f0'}
                    strokeWidth={isNormalBorder ? '1.8' : '1'}
                    strokeDasharray={isNormalBorder ? '4,2' : undefined}
                  />
                  <text
                    x={margin.left - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fontSize="10"
                    fill="#64748b"
                    fontWeight={db === 20 ? 'bold' : 'normal'}
                  >
                    {db}
                  </text>
                </g>
              );
            })}

            {/* Linhas verticais (Frequências em Hz) */}
            {FREQUENCIES.map(freq => {
              const x = getX(freq);
              return (
                <g key={`freq-${freq}`}>
                  <line
                    x1={x}
                    y1={margin.top}
                    x2={x}
                    y2={svgHeight - margin.bottom}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={margin.top - 12}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="bold"
                    fill="#475569"
                  >
                    {freq >= 1000 ? `${freq / 1000}k` : freq}
                  </text>
                </g>
              );
            })}

            {/* Rótulo Eixo Y */}
            <text
              transform={`rotate(-90)`}
              x={-(svgHeight / 2)}
              y="16"
              textAnchor="middle"
              fontSize="10"
              fontWeight="bold"
              fill="#64748b"
            >
              Nível de Audição em dB (NA)
            </text>

            {/* Rótulo Eixo X */}
            <text
              x={svgWidth / 2}
              y={svgHeight - 10}
              textAnchor="middle"
              fontSize="10"
              fontWeight="bold"
              fill="#64748b"
            >
              Frequência em Hertz (Hz)
            </text>

            {/* Linhas de Traçado das Vias */}
            {renderLineSeries(data.rightAir, '#dc2626', false)}
            {renderLineSeries(data.leftAir, '#2563eb', false)}
            {renderLineSeries(data.rightBone, '#dc2626', true)}
            {renderLineSeries(data.leftBone, '#2563eb', true)}

            {/* Pontos Clicáveis na Grade */}
            {FREQUENCIES.map(freq =>
              INTENSITIES.map(db => {
                const cx = getX(freq);
                const cy = getY(db);

                const hasRightAir = data.rightAir[freq] === db;
                const hasLeftAir = data.leftAir[freq] === db;
                const hasRightBone = data.rightBone[freq] === db;
                const hasLeftBone = data.leftBone[freq] === db;

                return (
                  <g key={`cell-${freq}-${db}`}>
                    {/* Área de clique invisível ampliada */}
                    {!readOnly && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r="11"
                        fill="transparent"
                        className="cursor-pointer hover:fill-indigo-500/20 transition-all"
                        onClick={() => handleGridClick(freq, db)}
                      />
                    )}

                    {/* Símbolo OD Via Aérea: Círculo Vermelho 'O' */}
                    {hasRightAir && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r="5.5"
                        fill="none"
                        stroke="#dc2626"
                        strokeWidth="2.5"
                      />
                    )}

                    {/* Símbolo OE Via Aérea: Cruz Azul 'X' */}
                    {hasLeftAir && (
                      <g stroke="#2563eb" strokeWidth="2.5">
                        <line x1={cx - 4.5} y1={cy - 4.5} x2={cx + 4.5} y2={cy + 4.5} />
                        <line x1={cx + 4.5} y1={cy - 4.5} x2={cx - 4.5} y2={cy + 4.5} />
                      </g>
                    )}

                    {/* Símbolo OD Via Óssea: Colchete Vermelho '<' */}
                    {hasRightBone && (
                      <path
                        d={`M ${cx - 2} ${cy - 5} L ${cx - 7} ${cy} L ${cx - 2} ${cy + 5}`}
                        fill="none"
                        stroke="#dc2626"
                        strokeWidth="2.2"
                      />
                    )}

                    {/* Símbolo OE Via Óssea: Colchete Azul '>' */}
                    {hasLeftBone && (
                      <path
                        d={`M ${cx + 2} ${cy - 5} L ${cx + 7} ${cy} L ${cx + 2} ${cy + 5}`}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="2.2"
                      />
                    )}
                  </g>
                );
              })
            )}
          </svg>
        </div>

        {/* Painel Lateral: Métricas, Legenda e PTA */}
        <div className="w-full xl:w-72 space-y-4">
          {/* Card Orelha Direita (OD) */}
          <div className="p-4 rounded-2xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-red-900 dark:text-red-300">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
                Orelha Direita (OD)
              </span>
              <span className="text-red-700 font-extrabold text-sm">
                {rightPTA.avg !== null ? `${rightPTA.avg} dB` : '-'}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-red-800 dark:text-red-400">
              {rightPTA.degree}
            </p>
            <div className="text-[10px] text-slate-500 flex items-center gap-3 pt-1 border-t border-red-100">
              <span>VA: Círculo (O)</span>
              <span>VO: Colchete (&lt;)</span>
            </div>
          </div>

          {/* Card Orelha Esquerda (OE) */}
          <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-blue-900 dark:text-blue-300">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />
                Orelha Esquerda (OE)
              </span>
              <span className="text-blue-700 font-extrabold text-sm">
                {leftPTA.avg !== null ? `${leftPTA.avg} dB` : '-'}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-blue-800 dark:text-blue-400">
              {leftPTA.degree}
            </p>
            <div className="text-[10px] text-slate-500 flex items-center gap-3 pt-1 border-t border-blue-100">
              <span>VA: Cruz (X)</span>
              <span>VO: Colchete (&gt;)</span>
            </div>
          </div>

          {/* Legenda dos Padrões de Normalidade */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-[11px] space-y-1.5 text-slate-600 dark:text-slate-300">
            <div className="font-bold text-slate-800 dark:text-slate-200">Critério Silman & Silverman (1997):</div>
            <div>• Normal: 0 a 20 dB</div>
            <div>• Leve: 21 a 40 dB</div>
            <div>• Moderada: 41 a 70 dB</div>
            <div>• Severa: 71 a 90 dB</div>
            <div>• Profunda: &gt; 90 dB</div>
          </div>
        </div>
      </div>
    </div>
  );
};
