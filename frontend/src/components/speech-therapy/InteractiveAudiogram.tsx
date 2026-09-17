import React, { useState, useMemo } from 'react';
import {
  Ear,
  Eye,
  EyeOff,
  RefreshCw,
  Shield,
  HelpCircle,
  Layers,
  Sliders,
  Volume2
} from 'lucide-react';
import {
  AudiogramData,
  AudiometryThresholdItem,
  EarSide,
  ConductionType,
  TransducerType
} from './audiology/audiology.types';

export type { AudiogramData, AudiometryThresholdItem };
export type AudiogramThresholds = { [freq: number]: number | null };
import {
  CONVENTIONAL_FREQUENCIES,
  CONVENTIONAL_INTENSITIES
} from './audiology/audiology-calculations';

export interface InteractiveAudiogramProps {
  data: AudiogramData;
  onChange: (data: AudiogramData) => void;
  readOnly?: boolean;
  comparisonData?: AudiogramData | null;
  comparisonLabel?: string;
}

// Bananeira da fala (Speech Banana) aproximada para Português Brasileiro (CFFa / ISO)
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
  readOnly = false,
  comparisonData = null,
  comparisonLabel = 'Exame anterior'
}) => {
  const [activeEar, setActiveEar] = useState<EarSide>('right');
  const [conductionType, setConductionType] = useState<ConductionType>('air');
  const [isMasked, setIsMasked] = useState<boolean>(false);
  const [maskingLevel, setMaskingLevel] = useState<string>('');
  const [isNoResponse, setIsNoResponse] = useState<boolean>(false);
  const [activeTransducer, setActiveTransducer] = useState<TransducerType>('supra_aural');
  const [showSpeechBanana, setShowSpeechBanana] = useState<boolean>(true);
  const [showComparison, setShowComparison] = useState<boolean>(true);

  // DIMENSÕES SVG GEOMETRICAMENTE PADRONIZADAS (Guia CFFa 2023)
  // Regra: A largura física de 1 oitava deve ser visualmente equivalente à altura de 20 dB.
  // Frequências: 125 a 8000 Hz = 6 oitavas completas (125->250, 250->500, 500->1000, 1000->2000, 2000->4000, 4000->8000).
  // Faixa de intensidade: -10 a 120 dB NA = 130 dB vertical.
  // 6 oitavas * 90px = 540px de largura útil.
  // 130 dB / 20 dB * 90px = 585px de altura útil.
  const octaveWidth = 90;
  const graphWidth = 6 * octaveWidth; // 540px
  const graphHeight = (130 / 20) * octaveWidth; // 585px

  const margin = { top: 40, right: 35, bottom: 45, left: 60 };
  const svgWidth = margin.left + graphWidth + margin.right; // 635px
  const svgHeight = margin.top + graphHeight + margin.bottom; // 670px

  // Escala X Logarítmica estrita baseada em log2
  const getX = (freq: number): number => {
    const minFreq = 125;
    const maxFreq = 8000;
    const ratio = Math.log2(freq / minFreq) / Math.log2(maxFreq / minFreq);
    return margin.left + Math.max(0, Math.min(1, ratio)) * graphWidth;
  };

  // Escala Y Linear de -10 a 120 dB NA
  const getY = (db: number): number => {
    const minDb = -10;
    const maxDb = 120;
    const ratio = (db - minDb) / (maxDb - minDb);
    return margin.top + Math.max(0, Math.min(1, ratio)) * graphHeight;
  };

  // Coleta limiares detalhados ou sintetiza a partir dos dicionários
  const detailedList: AudiometryThresholdItem[] = useMemo(() => {
    if (data.detailedThresholds && data.detailedThresholds.length > 0) {
      return data.detailedThresholds;
    }
    // Fallback compatível: constrói array a partir dos dicionários
    const list: AudiometryThresholdItem[] = [];
    const collect = (dict: Record<number, number | null>, ear: EarSide, conduction: ConductionType) => {
      for (const [fStr, db] of Object.entries(dict)) {
        if (db !== null && db !== undefined) {
          list.push({
            frequency: Number(fStr),
            db,
            ear,
            conduction,
            masked: false,
            noResponse: false,
            maskingLevel: null,
            transducer: 'supra_aural'
          });
        }
      }
    };
    collect(data.rightAir || {}, 'right', 'air');
    collect(data.leftAir || {}, 'left', 'air');
    collect(data.rightBone || {}, 'right', 'bone');
    collect(data.leftBone || {}, 'left', 'bone');
    return list;
  }, [data]);

  // Manipulação de clique na grade
  const handleGridClick = (freq: number, db: number) => {
    if (readOnly) return;

    const currentDetails = [...detailedList];
    const existingIndex = currentDetails.findIndex(
      item => item.frequency === freq && item.ear === activeEar && item.conduction === conductionType
    );

    const targetKey =
      activeEar === 'right'
        ? conductionType === 'air'
          ? 'rightAir'
          : 'rightBone'
        : conductionType === 'air'
        ? 'leftAir'
        : 'leftBone';

    const currentDict = { ...(data[targetKey] || {}) };

    if (existingIndex >= 0 && currentDetails[existingIndex].db === db) {
      // Desmarca o ponto
      currentDetails.splice(existingIndex, 1);
      delete currentDict[freq];
    } else {
      const newItem: AudiometryThresholdItem = {
        frequency: freq,
        db,
        ear: activeEar,
        conduction: conductionType,
        masked: isMasked,
        noResponse: isNoResponse,
        maskingLevel: isMasked && maskingLevel ? Number(maskingLevel) : null,
        transducer: activeTransducer
      };

      if (existingIndex >= 0) {
        currentDetails[existingIndex] = newItem;
      } else {
        currentDetails.push(newItem);
      }
      currentDict[freq] = db;
    }

    onChange({
      ...data,
      [targetKey]: currentDict,
      detailedThresholds: currentDetails
    });
  };

  const handleClear = () => {
    if (window.confirm('Deseja limpar todos os limiares deste audiograma?')) {
      onChange({
        rightAir: {},
        leftAir: {},
        rightBone: {},
        leftBone: {},
        detailedThresholds: []
      });
    }
  };

  // Traçado das linhas contínuas ou tracejadas entre os pontos
  const renderLineSeries = (
    dict: Record<number, number | null>,
    color: string,
    isDashed: boolean = false,
    opacity: number = 1
  ) => {
    const points: { x: number; y: number }[] = [];
    CONVENTIONAL_FREQUENCIES.forEach(freq => {
      const db = dict[freq];
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
        strokeDasharray={isDashed ? '5,4' : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
    );
  };

  // Renderiza símbolo audiométrico conforme convenção ASHA / Guia CFFa 2023
  const renderThresholdSymbol = (item: AudiometryThresholdItem, isComparison = false) => {
    const cx = getX(item.frequency);
    const cy = getY(item.db);
    const isRight = item.ear === 'right';
    const color = isComparison ? (isRight ? '#fca5a5' : '#93c5fd') : (isRight ? '#dc2626' : '#2563eb');
    const strokeW = isComparison ? '1.8' : '2.4';
    const key = `sym-${item.ear}-${item.conduction}-${item.frequency}-${item.db}-${isComparison ? 'comp' : 'curr'}`;

    let symbolElement: React.ReactNode = null;

    if (item.conduction === 'air') {
      if (isRight) {
        if (item.masked) {
          // Triângulo vermelho (OD VA mascarado)
          const h = 11;
          const r = 6.5;
          const points = `${cx},${cy - r} ${cx - r},${cy + r * 0.7} ${cx + r},${cy + r * 0.7}`;
          symbolElement = (
            <polygon
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
            />
          );
        } else {
          // Círculo vermelho 'O' (OD VA não mascarado)
          symbolElement = (
            <circle
              cx={cx}
              cy={cy}
              r="6"
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
            />
          );
        }
      } else {
        // Orelha Esquerda (OE)
        if (item.masked) {
          // Quadrado azul (OE VA mascarado)
          symbolElement = (
            <rect
              x={cx - 5.5}
              y={cy - 5.5}
              width="11"
              height="11"
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
            />
          );
        } else {
          // Cruz azul 'X' (OE VA não mascarado)
          symbolElement = (
            <g stroke={color} strokeWidth={strokeW}>
              <line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} />
              <line x1={cx + 5} y1={cy - 5} x2={cx - 5} y2={cy + 5} />
            </g>
          );
        }
      }
    } else {
      // Via Óssea (VO)
      if (isRight) {
        if (item.masked) {
          // Colchete aberto à direita '[' (OD VO mascarado)
          symbolElement = (
            <path
              d={`M ${cx - 2} ${cy - 7} L ${cx - 7} ${cy - 7} L ${cx - 7} ${cy + 7} L ${cx - 2} ${cy + 7}`}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
            />
          );
        } else {
          // Colchete aberto à direita '<' (OD VO não mascarado)
          symbolElement = (
            <path
              d={`M ${cx - 2} ${cy - 6} L ${cx - 8} ${cy} L ${cx - 2} ${cy + 6}`}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
            />
          );
        }
      } else {
        // OE VO
        if (item.masked) {
          // Colchete aberto à esquerda ']' (OE VO mascarado)
          symbolElement = (
            <path
              d={`M ${cx + 2} ${cy - 7} L ${cx + 7} ${cy - 7} L ${cx + 7} ${cy + 7} L ${cx + 2} ${cy + 7}`}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
            />
          );
        } else {
          // Colchete aberto à esquerda '>' (OE VO não mascarado)
          symbolElement = (
            <path
              d={`M ${cx + 2} ${cy - 6} L ${cx + 8} ${cy} L ${cx + 2} ${cy + 6}`}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
            />
          );
        }
      }
    }

    // Flecha de Ausência de Resposta (ASHA): Seta inclinada a 45° apontando para baixo
    const renderNoResponseArrow = () => {
      const arrowLen = 13;
      // Para OD aponta para baixo e esquerda; para OE para baixo e direita
      const dirX = isRight ? -1 : 1;
      const x2 = cx + dirX * (arrowLen * 0.7);
      const y2 = cy + arrowLen * 0.9;

      return (
        <g stroke={color} strokeWidth={strokeW} key={`nr-${key}`}>
          <line x1={cx} y1={cy} x2={x2} y2={y2} />
          {/* Ponta da flecha */}
          <line x1={x2} y1={y2} x2={x2 - dirX * 3} y2={y2 - 5} />
          <line x1={x2} y1={y2} x2={x2} y2={y2 - 6} />
        </g>
      );
    };

    return (
      <g key={key} opacity={isComparison ? 0.6 : 1}>
        {symbolElement}
        {item.noResponse && renderNoResponseArrow()}
        {item.masked && item.maskingLevel && !isComparison && (
          <text
            x={cx}
            y={cy - 9}
            fontSize="8"
            fontWeight="bold"
            fill={color}
            textAnchor="middle"
          >
            {item.maskingLevel}m
          </text>
        )}
      </g>
    );
  };

  // Pontos da Área da Fala (Speech Banana)
  const speechBananaPoints = SPEECH_BANANA_POLYGON.map(p => `${getX(p.freq)},${getY(p.db)}`).join(' ');

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-6 shadow-xs">
      {/* Cabeçalho do Audiograma com Controles */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Ear className="w-4 h-4 text-sky-600" />
            Audiograma Tonal Liminar Interativo (CFFa 2023)
          </h3>
          <p className="text-xs text-slate-500">
            Escala logarítmica (base 2), proporção 1:1 (1 oitava = 20 dB), simbologia ASHA/CFFa, suporte a mascaramento e ausência de resposta.
          </p>
        </div>

        {/* Barra de Ferramentas Interativa */}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Seletor Orelha */}
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
                OD (Vermelho)
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
                OE (Azul)
              </button>
            </div>

            {/* Seletor Condução */}
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

            {/* Mascaramento */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIsMasked(!isMasked)}
                className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  isMasked ? 'bg-amber-500 text-white' : 'text-slate-600 dark:text-slate-400'
                }`}
                title="Ativar mascaramento para os próximos pontos clicados"
              >
                {isMasked ? 'Mascarado' : 'Não mascarado'}
              </button>
              {isMasked && (
                <div className="flex items-center gap-1 pl-1">
                  <input
                    type="number"
                    min="0"
                    max="120"
                    step="5"
                    value={maskingLevel}
                    onChange={e => setMaskingLevel(e.target.value)}
                    placeholder="dB"
                    className="w-14 px-1.5 py-0.5 text-xs rounded-lg border border-amber-300 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                  />
                  <span className="text-[10px] text-slate-500 font-semibold">dB</span>
                </div>
              )}
            </div>

            {/* Ausência de Resposta */}
            <button
              type="button"
              onClick={() => setIsNoResponse(!isNoResponse)}
              className={`px-2.5 py-1 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                isNoResponse
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title="Marcar ausência de resposta (flecha a 45°)"
            >
              Sem Resposta
            </button>

            {/* Transdutor */}
            <select
              value={activeTransducer}
              onChange={e => setActiveTransducer(e.target.value as TransducerType)}
              className="text-xs px-2 py-1 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold"
            >
              <option value="supra_aural">Fone Supra-aural (TDH-39)</option>
              <option value="insert">Fone de Inserção (ER-3A)</option>
              <option value="bone_vibrator">Vibrador Ósseo (B-71)</option>
              <option value="free_field">Campo Livre</option>
              <option value="other">Outro Transdutor</option>
            </select>

            {/* Área da Fala */}
            <button
              type="button"
              onClick={() => setShowSpeechBanana(!showSpeechBanana)}
              className="p-1.5 text-xs font-bold rounded-xl border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
              title="Alternar Banana da Fala"
            >
              {showSpeechBanana ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>

            {/* Limpar */}
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 text-slate-400 hover:text-red-500 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              title="Limpar todos os pontos"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Gráfico SVG com Proporção Rígida */}
      <div className="flex flex-col xl:flex-row items-start justify-center gap-6">
        <div className="w-full max-w-[660px] overflow-x-auto bg-white dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full select-none">
            {/* Área da Fala (Speech Banana) */}
            {showSpeechBanana && (
              <polygon
                points={speechBananaPoints}
                fill="#fef3c7"
                fillOpacity="0.4"
                stroke="#f59e0b"
                strokeWidth="1.2"
                strokeDasharray="4,3"
              />
            )}

            {/* Linhas Horizontais (Intensidade em dB NA de -10 a 120) */}
            {CONVENTIONAL_INTENSITIES.map(db => {
              const y = getY(db);
              const isZero = db === 0;
              const isNormalLimit = db === 20 || db === 25;
              return (
                <g key={`db-${db}`}>
                  <line
                    x1={margin.left}
                    y1={y}
                    x2={margin.left + graphWidth}
                    y2={y}
                    stroke={isZero ? '#94a3b8' : isNormalLimit ? '#10b981' : '#e2e8f0'}
                    strokeWidth={isZero ? '1.5' : isNormalLimit ? '1.5' : '1'}
                    strokeDasharray={isNormalLimit ? '4,3' : undefined}
                  />
                  <text
                    x={margin.left - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fontSize="10"
                    fill={isNormalLimit ? '#059669' : '#64748b'}
                    fontWeight={isNormalLimit || isZero ? 'bold' : 'normal'}
                  >
                    {db}
                  </text>
                </g>
              );
            })}

            {/* Linhas Verticais (Frequências em Hz com escala log2) */}
            {CONVENTIONAL_FREQUENCIES.map(freq => {
              const x = getX(freq);
              const isIntermediate = [750, 1500, 3000, 6000].includes(freq);
              return (
                <g key={`freq-${freq}`}>
                  <line
                    x1={x}
                    y1={margin.top}
                    x2={x}
                    y2={margin.top + graphHeight}
                    stroke={isIntermediate ? '#cbd5e1' : '#94a3b8'}
                    strokeWidth={isIntermediate ? '0.9' : '1.3'}
                    strokeDasharray={isIntermediate ? '3,3' : undefined}
                  />
                  <text
                    x={x}
                    y={margin.top - 12}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight={isIntermediate ? 'normal' : 'bold'}
                    fill="#334155"
                  >
                    {freq >= 1000 ? `${freq / 1000}k` : freq}
                  </text>
                </g>
              );
            })}

            {/* Rótulo Eixo Y */}
            <text
              transform="rotate(-90)"
              x={-(margin.top + graphHeight / 2)}
              y="18"
              textAnchor="middle"
              fontSize="11"
              fontWeight="bold"
              fill="#475569"
            >
              Nível de Audição em Decibel (dB NA)
            </text>

            {/* Rótulo Eixo X */}
            <text
              x={margin.left + graphWidth / 2}
              y={svgHeight - 12}
              textAnchor="middle"
              fontSize="11"
              fontWeight="bold"
              fill="#475569"
            >
              Frequência em Hertz (Hz)
            </text>

            {/* Comparação Longitudinal Sobreposta (Exame Anterior) */}
            {comparisonData && showComparison && (
              <g className="comparison-overlay" opacity="0.5">
                {renderLineSeries(comparisonData.rightAir || {}, '#f87171', false, 0.6)}
                {renderLineSeries(comparisonData.leftAir || {}, '#60a5fa', false, 0.6)}
                {renderLineSeries(comparisonData.rightBone || {}, '#f87171', true, 0.6)}
                {renderLineSeries(comparisonData.leftBone || {}, '#60a5fa', true, 0.6)}
                {/* Símbolos do exame anterior */}
                {(comparisonData.detailedThresholds || []).map(item => renderThresholdSymbol(item, true))}
              </g>
            )}

            {/* Traçados das Vias do Exame Atual */}
            {renderLineSeries(data.rightAir || {}, '#dc2626', false)}
            {renderLineSeries(data.leftAir || {}, '#2563eb', false)}
            {renderLineSeries(data.rightBone || {}, '#dc2626', true)}
            {renderLineSeries(data.leftBone || {}, '#2563eb', true)}

            {/* Símbolos dos Limiares Atuais */}
            {detailedList.map(item => renderThresholdSymbol(item, false))}

            {/* Áreas Clicáveis na Grade para Entrada de Limiares */}
            {!readOnly &&
              CONVENTIONAL_FREQUENCIES.map(freq =>
                CONVENTIONAL_INTENSITIES.map(db => {
                  const cx = getX(freq);
                  const cy = getY(db);
                  return (
                    <circle
                      key={`click-${freq}-${db}`}
                      cx={cx}
                      cy={cy}
                      r="12"
                      fill="transparent"
                      className="cursor-pointer hover:fill-sky-500/20 transition-colors"
                      onClick={() => handleGridClick(freq, db)}
                    />
                  );
                })
              )}
          </svg>
        </div>

        {/* Painel Lateral: Legenda e Padrão da Simbologia ASHA/CFFa */}
        <div className="w-full xl:w-72 space-y-4">
          {/* Legenda dos Símbolos CFFa */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs space-y-3">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-sky-600" />
              Simbologia Audiométrica (CFFa / ASHA)
            </h4>

            {/* Orelha Direita */}
            <div className="space-y-1.5 pb-2 border-b border-slate-200 dark:border-slate-700">
              <span className="font-bold text-red-700 flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                Orelha Direita (OD - Vermelho)
              </span>
              <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                <div>VA não masc: <b>O</b></div>
                <div>VA mascarada: <b>△</b></div>
                <div>VO não masc: <b>&lt;</b></div>
                <div>VO mascarada: <b>[</b></div>
              </div>
            </div>

            {/* Orelha Esquerda */}
            <div className="space-y-1.5 pb-2 border-b border-slate-200 dark:border-slate-700">
              <span className="font-bold text-blue-700 flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                Orelha Esquerda (OE - Azul)
              </span>
              <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                <div>VA não masc: <b>X</b></div>
                <div>VA mascarada: <b>▢</b></div>
                <div>VO não masc: <b>&gt;</b></div>
                <div>VO mascarada: <b>]</b></div>
              </div>
            </div>

            {/* Símbolos Especiais */}
            <div className="space-y-1 text-[11px] text-slate-600">
              <div>• Ausência de resposta: <b>Símbolo + flecha a 45°</b></div>
              <div>• Campo livre: <b>S</b></div>
              <div>• Proporção: <b>1 oitava = 20 dB</b></div>
            </div>
          </div>

          {/* Comparação Longitudinal */}
          {comparisonData && (
            <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/20 border border-sky-200 text-xs space-y-2">
              <div className="flex items-center justify-between font-bold text-sky-900">
                <span>{comparisonLabel}</span>
                <button
                  type="button"
                  onClick={() => setShowComparison(!showComparison)}
                  className="text-[11px] text-sky-700 hover:underline cursor-pointer"
                >
                  {showComparison ? 'Ocultar' : 'Exibir'}
                </button>
              </div>
              <p className="text-[11px] text-sky-800">
                Traçado tracejado semi-transparente sobreposto para análise de evolução.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
