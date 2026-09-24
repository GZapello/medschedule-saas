import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Info,
  Layers,
  History,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Eye,
  RotateCcw
} from 'lucide-react';

export type ToothFace = 'vestibular' | 'lingual' | 'palatina' | 'mesial' | 'distal' | 'oclusal' | 'whole';

export interface ToothCondition {
  id: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  affectsFace?: boolean;
  affectsWholeTooth?: boolean;
}

export const DENTAL_CONDITIONS: ToothCondition[] = [
  { id: 'healthy', label: 'Hígido', color: '#64748b', bgColor: 'bg-white', borderColor: 'border-slate-300', description: 'Sem alterações patológicas' },
  { id: 'decay', label: 'Cárie Ativa', color: '#ef4444', bgColor: 'bg-red-500', borderColor: 'border-red-600', description: 'Lesão cariosa ativa necessitando restauração', affectsFace: true },
  { id: 'restoration_resin', label: 'Restauração Resina', color: '#3b82f6', bgColor: 'bg-blue-500', borderColor: 'border-blue-600', description: 'Restauração estética em compósito', affectsFace: true },
  { id: 'restoration_amalgam', label: 'Restauração Amálgama', color: '#475569', bgColor: 'bg-slate-700', borderColor: 'border-slate-800', description: 'Restauração metálica em amálgama', affectsFace: true },
  { id: 'endodontics', label: 'Canal Tratado (Endo)', color: '#10b981', bgColor: 'bg-emerald-500', borderColor: 'border-emerald-600', description: 'Tratamento endodôntico realizado / obturado', affectsWholeTooth: true },
  { id: 'endo_indicated', label: 'Canal a Tratar', color: '#f59e0b', bgColor: 'bg-amber-500', borderColor: 'border-amber-600', description: 'Polpa necrosada ou pulpite irreversível', affectsWholeTooth: true },
  { id: 'crown_prosthesis', label: 'Coroa / Bloco Prótese', color: '#d97706', bgColor: 'bg-amber-600', borderColor: 'border-amber-700', description: 'Prótese fixa, jaqueta, inlay/onlay', affectsWholeTooth: true },
  { id: 'implant', label: 'Implante Dentário', color: '#8b5cf6', bgColor: 'bg-purple-600', borderColor: 'border-purple-700', description: 'Implante de titânio osseointegrado', affectsWholeTooth: true },
  { id: 'missing', label: 'Dente Ausente', color: '#1e293b', bgColor: 'bg-slate-900', borderColor: 'border-slate-950', description: 'Dente perdido ou previamente extraído', affectsWholeTooth: true },
  { id: 'extract_indicated', label: 'Indicação Extração', color: '#dc2626', bgColor: 'bg-rose-600', borderColor: 'border-rose-700', description: 'Exodontia indicada', affectsWholeTooth: true },
  { id: 'orthodontic_bracket', label: 'Aparelho / Braquete', color: '#ea580c', bgColor: 'bg-orange-500', borderColor: 'border-orange-600', description: 'Acessório ortodôntico instalado', affectsWholeTooth: true },
  { id: 'fracture', label: 'Dente Fraturado', color: '#e11d48', bgColor: 'bg-rose-500', borderColor: 'border-rose-600', description: 'Trinca ou fratura de esmalte/raiz', affectsFace: true },
  { id: 'sealant', label: 'Selante Preventivo', color: '#06b6d4', bgColor: 'bg-cyan-500', borderColor: 'border-cyan-600', description: 'Selamento de fóssulas e fissuras', affectsFace: true },
  { id: 'veneer', label: 'Faceta / Lente', color: '#0d9488', bgColor: 'bg-teal-600', borderColor: 'border-teal-700', description: 'Laminado cerâmico ou resina direta', affectsFace: true },
  { id: 'periapical_lesion', label: 'Lesão Periapical', color: '#b91c1c', bgColor: 'bg-red-700', borderColor: 'border-red-800', description: 'Radiolucência periapical / granuloma / cisto', affectsWholeTooth: true },
  // Condições Odontopediátricas e Especiais
  { id: 'amelogenesis', label: 'Amelogênese Imperfeita', color: '#c084fc', bgColor: 'bg-purple-400', borderColor: 'border-purple-500', description: 'Defeito estrutural de mineralização do esmalte', affectsWholeTooth: true },
  { id: 'hmi', label: 'HMI (Hipomineralização)', color: '#f97316', bgColor: 'bg-orange-500', borderColor: 'border-orange-600', description: 'Hipomineralização molar-incisivo', affectsFace: true },
  { id: 'natal_tooth', label: 'Dente Natal / Neonatal', color: '#06b6d4', bgColor: 'bg-cyan-500', borderColor: 'border-cyan-600', description: 'Dente irrompido ao nascimento ou dias após', affectsWholeTooth: true },
  { id: 'anodontia', label: 'Agenesia / Anodontia', color: '#64748b', bgColor: 'bg-slate-500', borderColor: 'border-slate-600', description: 'Ausência congênita do elemento dental', affectsWholeTooth: true },
  { id: 'supernumerary', label: 'Dente Supranumerário', color: '#a855f7', bgColor: 'bg-purple-600', borderColor: 'border-purple-700', description: 'Elemento dental supranumerário / mesiodens', affectsWholeTooth: true },
  { id: 'trauma', label: 'Traumatismo Dental', color: '#ef4444', bgColor: 'bg-red-500', borderColor: 'border-red-600', description: 'Subluxação, intrusão, extrusão ou fratura por trauma infantil', affectsFace: true }
];

export interface ToothStatus {
  whole?: string; // condition id
  vestibular?: string;
  lingual?: string;
  palatina?: string;
  mesial?: string;
  distal?: string;
  oclusal?: string;
  notes?: string;
}

export type OdontogramData = Record<number, ToothStatus>;

interface OdontogramCanvasProps {
  initialData?: OdontogramData;
  currentData?: OdontogramData;
  onChange?: (updatedCurrent: OdontogramData, changes: any[]) => void;
  onToothClick?: (toothNumber: number, face?: ToothFace) => void;
  onOpenToothDossier?: (toothNumber: number) => void;
  readOnly?: boolean;
}

// Numeração FDI permanente
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

// Numeração FDI decídua (infantil)
const DECIDUOUS_UPPER_RIGHT = [55, 54, 53, 52, 51];
const DECIDUOUS_UPPER_LEFT = [61, 62, 63, 64, 65];
const DECIDUOUS_LOWER_RIGHT = [85, 84, 83, 82, 81];
const DECIDUOUS_LOWER_LEFT = [71, 72, 73, 74, 75];

export const OdontogramCanvas: React.FC<OdontogramCanvasProps> = ({
  initialData = {},
  currentData = {},
  onChange,
  onToothClick,
  onOpenToothDossier,
  readOnly = false
}) => {
  const [data, setData] = useState<OdontogramData>(currentData);
  const [dentitionType, setDentitionType] = useState<'permanent' | 'deciduous' | 'mixed'>('permanent');
  const [activeCondition, setActiveCondition] = useState<string>('decay');
  const [viewMode, setViewMode] = useState<'current' | 'initial' | 'compare'>('current');
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState<boolean>(false);
  const [selectedToothHistory, setSelectedToothHistory] = useState<number | null>(null);

  // Sincronizar estado interno com currentData sempre que atualizado externamente ou via API
  useEffect(() => {
    if (currentData) {
      setData(currentData);
    }
  }, [currentData]);

  // Cores por condição
  const getConditionColor = (condId?: string) => {
    if (!condId || condId === 'healthy') return '#ffffff';
    const found = DENTAL_CONDITIONS.find(c => c.id === condId);
    return found ? found.color : '#ffffff';
  };

  const isAnterior = (tooth: number) => {
    const num = tooth % 10;
    return num >= 1 && num <= 3; // 11-13, 21-23, 31-33, 41-43, 51-53, 61-63, 71-73, 81-83
  };

  const isUpper = (tooth: number) => (tooth >= 11 && tooth <= 28) || (tooth >= 51 && tooth <= 65);

  const handleFaceClick = (toothNumber: number, face: ToothFace, e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly || viewMode === 'initial') return;

    if (multiSelectMode) {
      toggleToothSelection(toothNumber);
      return;
    }

    const currentTooth = data[toothNumber] || {};
    const cond = DENTAL_CONDITIONS.find(c => c.id === activeCondition);
    const isUpperTooth = isUpper(toothNumber);
    const innerFaceKey: ToothFace = isUpperTooth ? 'palatina' : 'lingual';

    let updatedTooth: ToothStatus = { ...currentTooth };
    let emittedChanges: any[] = [];

    if (cond?.affectsWholeTooth) {
      // Condição de dente inteiro (canal, implante, coroa, ausente, etc.)
      if (updatedTooth.whole === activeCondition) {
        delete updatedTooth.whole;
      } else {
        updatedTooth.whole = activeCondition;
      }
      emittedChanges.push({
        toothNumber,
        face: 'whole',
        condition: updatedTooth.whole || 'healthy',
        previousCondition: currentTooth.whole
      });
    } else if (face === 'whole') {
      // Usuário clicou no botão "Faces/Dente" com uma condição de FACE selecionada (cárie, restauração, selante, etc.)
      // NUNCA salvar no 'whole' - aplicar nas 5 faces anatômicas
      const faces: ToothFace[] = ['vestibular', innerFaceKey, 'mesial', 'distal', 'oclusal'];
      const allActive = faces.every(f => (updatedTooth as any)[f] === activeCondition);

      // Limpar whole caso existisse por erro anterior
      if (updatedTooth.whole === activeCondition) {
        delete updatedTooth.whole;
      }

      faces.forEach(f => {
        const prev = (currentTooth as any)[f];
        if (allActive) {
          delete (updatedTooth as any)[f];
        } else {
          (updatedTooth as any)[f] = activeCondition;
        }
        emittedChanges.push({
          toothNumber,
          face: f,
          condition: allActive ? 'healthy' : activeCondition,
          previousCondition: prev
        });
      });
    } else {
      // Clique em face específica (vestibular, lingual/palatina, mesial, distal, oclusal)
      const currentFaceVal = (updatedTooth as any)[face];
      if (currentFaceVal === activeCondition) {
        delete (updatedTooth as any)[face];
      } else {
        (updatedTooth as any)[face] = activeCondition;
      }

      // Garantir que a condição de face nunca corrompa o 'whole'
      if (updatedTooth.whole === activeCondition) {
        delete updatedTooth.whole;
      }

      emittedChanges.push({
        toothNumber,
        face,
        condition: (updatedTooth as any)[face] || 'healthy',
        previousCondition: currentFaceVal
      });
    }

    const updatedData: OdontogramData = {
      ...data,
      [toothNumber]: updatedTooth
    };

    setData(updatedData);

    if (onChange) {
      onChange(updatedData, emittedChanges);
    }

    if (onToothClick) {
      onToothClick(toothNumber, face);
    }
  };

  const toggleToothSelection = (toothNumber: number) => {
    setSelectedTeeth(prev =>
      prev.includes(toothNumber) ? prev.filter(t => t !== toothNumber) : [...prev, toothNumber]
    );
  };

  const applyConditionToSelected = () => {
    if (selectedTeeth.length === 0 || !activeCondition) return;

    const cond = DENTAL_CONDITIONS.find(c => c.id === activeCondition);
    const updatedData = { ...data };
    const changes: any[] = [];

    // Determina a face real de destino: 'whole' somente para condições de dente inteiro;
    // Para condições de face, aplicar na oclusal (ou vestibular para facetas)
    const targetFace: ToothFace = cond?.affectsWholeTooth
      ? 'whole'
      : (cond?.id === 'veneer' ? 'vestibular' : 'oclusal');

    for (const tooth of selectedTeeth) {
      const toothStatus = { ...(updatedData[tooth] || {}) };
      const prevVal = targetFace === 'whole' ? toothStatus.whole : (toothStatus as any)[targetFace];

      if (cond?.affectsWholeTooth) {
        toothStatus.whole = activeCondition;
      } else {
        (toothStatus as any)[targetFace] = activeCondition;
        // Previne qualquer presença indevida no campo 'whole'
        if (toothStatus.whole === activeCondition) {
          delete toothStatus.whole;
        }
      }

      updatedData[tooth] = toothStatus;
      changes.push({
        toothNumber: tooth,
        face: targetFace,
        condition: activeCondition,
        previousCondition: prevVal
      });
    }

    setData(updatedData);
    setSelectedTeeth([]);
    if (onChange) onChange(updatedData, changes);
  };

  const renderTooth = (toothNumber: number, isCompareInitial = false) => {
    const activeData = isCompareInitial ? initialData : (viewMode === 'initial' ? initialData : data);
    const toothStatus = activeData[toothNumber] || {};
    const isSelected = selectedTeeth.includes(toothNumber);

    const isUpperTooth = isUpper(toothNumber);
    const anterior = isAnterior(toothNumber);

    // Faces: Superior usa Palatina no lugar de Lingual
    const innerFaceKey: ToothFace = isUpperTooth ? 'palatina' : 'lingual';

    // Orientação anatômica de Mesial e Distal em relação à linha média (centro da arcada):
    // Quadrantes 1, 4, 5 e 8 ficam no lado DIREITO do paciente (lado ESQUERDO da tela):
    // Linha média fica à DIREITA -> Mesial é à DIREITA e Distal é à ESQUERDA.
    // Quadrantes 2, 3, 6 e 7 ficam no lado ESQUERDO do paciente (lado DIREITO da tela):
    // Linha média fica à ESQUERDA -> Mesial é à ESQUERDA e Distal é à DIREITA.
    const quadrant = Math.floor(toothNumber / 10);
    const isRightQuadrant = quadrant === 1 || quadrant === 4 || quadrant === 5 || quadrant === 8;

    const leftFaceKey: ToothFace = isRightQuadrant ? 'distal' : 'mesial';
    const rightFaceKey: ToothFace = isRightQuadrant ? 'mesial' : 'distal';

    const wholeCond = toothStatus.whole;
    const isMissing = wholeCond === 'missing';
    const isExtract = wholeCond === 'extract_indicated';
    const isEndo = wholeCond === 'endodontics';
    const isImplant = wholeCond === 'implant';
    const isCrown = wholeCond === 'crown_prosthesis';
    const isLesion = wholeCond === 'periapical_lesion';
    const isBracket = wholeCond === 'orthodontic_bracket';

    const vestColor = getConditionColor(toothStatus.vestibular);
    const lingPalColor = getConditionColor((toothStatus as any)[innerFaceKey]);
    const leftColor = getConditionColor((toothStatus as any)[leftFaceKey]);
    const rightColor = getConditionColor((toothStatus as any)[rightFaceKey]);
    const oclusalColor = getConditionColor(toothStatus.oclusal);

    const cond = DENTAL_CONDITIONS.find(c => c.id === activeCondition);

    return (
      <div
        key={toothNumber}
        onClick={() => {
          if (multiSelectMode) {
            toggleToothSelection(toothNumber);
          } else {
            setSelectedToothHistory(toothNumber);
            if (onToothClick) onToothClick(toothNumber);
          }
        }}
        className={`relative flex flex-col items-center p-1 sm:p-1.5 rounded-xl border transition-all cursor-pointer flex-shrink-0 ${
          isSelected
            ? 'bg-cyan-100/60 border-cyan-500 shadow-md ring-2 ring-cyan-400'
            : 'bg-white border-slate-200 hover:border-cyan-400 hover:shadow-xs'
        }`}
      >
        {/* Número do Dente (FDI) */}
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[11px] font-black text-slate-800 tracking-tight">
            {toothNumber}
          </span>
          {isImplant && (
            <span className="w-2 h-2 rounded-full bg-purple-600" title="Implante" />
          )}
          {isEndo && (
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Canal Tratado" />
          )}
        </div>

        {/* Desenho Anatômico / Gráfico de Faces (SVG Interativo) */}
        <div className="relative w-9 h-9 sm:w-11 sm:h-11">
          {/* Marcador de Dente Ausente (X Preto) */}
          {isMissing ? (
            <svg viewBox="0 0 50 50" className="w-full h-full text-slate-800">
              <line x1="8" y1="8" x2="42" y2="42" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <line x1="42" y1="8" x2="8" y2="42" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
          ) : isExtract ? (
            /* Marcador de Extração Indicada (X Vermelho) */
            <svg viewBox="0 0 50 50" className="w-full h-full text-rose-600">
              <line x1="8" y1="8" x2="42" y2="42" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <line x1="42" y1="8" x2="8" y2="42" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
          ) : isCrown ? (
            /* Coroa Protética Total (Dourado com contorno) */
            <div
              onClick={(e) => handleFaceClick(toothNumber, 'whole', e)}
              className="w-full h-full rounded-full border-2 border-amber-600 bg-amber-200/80 flex items-center justify-center font-black text-[10px] text-amber-900 shadow-inner"
            >
              CR
            </div>
          ) : (
            /* 5 Faces Geométricas Interativas */
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xs select-none">
              {/* Face Superior (Vestibular nos superiores, Lingual nos inferiores) */}
              <polygon
                points="15,15 85,15 65,35 35,35"
                fill={isUpperTooth ? vestColor : lingPalColor}
                stroke="#64748b"
                strokeWidth="2"
                className="cursor-pointer hover:brightness-90 transition-all"
                onClick={(e) => handleFaceClick(toothNumber, isUpperTooth ? 'vestibular' : innerFaceKey, e)}
              >
                <title>{isUpperTooth ? 'Vestibular (V)' : (innerFaceKey === 'palatina' ? 'Palatina (P)' : 'Lingual (L)')}</title>
              </polygon>

              {/* Face Inferior (Palatina/Lingual nos superiores, Vestibular nos inferiores) */}
              <polygon
                points="35,65 65,65 85,85 15,85"
                fill={isUpperTooth ? lingPalColor : vestColor}
                stroke="#64748b"
                strokeWidth="2"
                className="cursor-pointer hover:brightness-90 transition-all"
                onClick={(e) => handleFaceClick(toothNumber, isUpperTooth ? innerFaceKey : 'vestibular', e)}
              >
                <title>{isUpperTooth ? (innerFaceKey === 'palatina' ? 'Palatina (P)' : 'Lingual (L)') : 'Vestibular (V)'}</title>
              </polygon>

              {/* Face Esquerda (Distal em Q1/Q4/Q5/Q8; Mesial em Q2/Q3/Q6/Q7) */}
              <polygon
                points="15,15 35,35 35,65 15,85"
                fill={leftColor}
                stroke="#64748b"
                strokeWidth="2"
                className="cursor-pointer hover:brightness-90 transition-all"
                onClick={(e) => handleFaceClick(toothNumber, leftFaceKey, e)}
              >
                <title>{leftFaceKey === 'mesial' ? 'Mesial (M) — voltada para a linha média' : 'Distal (D)'}</title>
              </polygon>

              {/* Face Direita (Mesial em Q1/Q4/Q5/Q8; Distal em Q2/Q3/Q6/Q7) */}
              <polygon
                points="85,15 65,35 65,65 85,85"
                fill={rightColor}
                stroke="#64748b"
                strokeWidth="2"
                className="cursor-pointer hover:brightness-90 transition-all"
                onClick={(e) => handleFaceClick(toothNumber, rightFaceKey, e)}
              >
                <title>{rightFaceKey === 'mesial' ? 'Mesial (M) — voltada para a linha média' : 'Distal (D)'}</title>
              </polygon>

              {/* Face Central: Oclusal (ou Incisal em dentes anteriores) */}
              {anterior ? (
                <rect
                  x="35"
                  y="42"
                  width="30"
                  height="16"
                  rx="2"
                  fill={oclusalColor}
                  stroke="#64748b"
                  strokeWidth="2"
                  className="cursor-pointer hover:brightness-90 transition-all"
                  onClick={(e) => handleFaceClick(toothNumber, 'oclusal', e)}
                >
                  <title>Incisal (I)</title>
                </rect>
              ) : (
                <rect
                  x="35"
                  y="35"
                  width="30"
                  height="30"
                  rx="3"
                  fill={oclusalColor}
                  stroke="#64748b"
                  strokeWidth="2"
                  className="cursor-pointer hover:brightness-90 transition-all"
                  onClick={(e) => handleFaceClick(toothNumber, 'oclusal', e)}
                >
                  <title>Oclusal (O)</title>
                </rect>
              )}
            </svg>
          )}

          {/* Indicador de Braquete Ortodôntico */}
          {isBracket && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-3.5 h-3.5 bg-orange-500 rounded border border-white shadow-xs flex items-center justify-center text-[7px] font-bold text-white">
                #
              </div>
            </div>
          )}

          {/* Lesão periapical */}
          {isLesion && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-rose-600/90 border border-white pointer-events-none" />
          )}
        </div>

        {/* Botões de Ação Rápida */}
        <div className="flex items-center gap-1 mt-1">
          {!readOnly && viewMode !== 'initial' && (
            <button
              type="button"
              title={cond?.affectsWholeTooth ? "Aplicar condição no dente inteiro" : "Aplicar condição em todas as faces"}
              onClick={(e) => handleFaceClick(toothNumber, 'whole', e)}
              className="text-[9px] font-bold text-slate-500 hover:text-cyan-600 hover:underline px-0.5 py-0.5"
            >
              {cond?.affectsWholeTooth ? 'Dente' : 'Faces'}
            </button>
          )}
          {onOpenToothDossier && (
            <button
              type="button"
              title="Abrir Dossiê Clínico do Dente"
              onClick={(e) => {
                e.stopPropagation();
                onOpenToothDossier(toothNumber);
              }}
              className="text-[9px] font-bold text-cyan-600 hover:text-cyan-800 bg-cyan-50 dark:bg-cyan-950/40 px-1 py-0.5 rounded border border-cyan-200 dark:border-cyan-800 transition"
            >
              Dossiê
            </button>
          )}
        </div>
      </div>
    );
  };

  // Renderizador unificado da arcada dentária completa:
  // Mostra todos os dentes juntos, centralizados no desktop, sem scrolls separados nos quadrantes.
  // No mobile/tablet, mantém um único scroll horizontal por arcada.
  const renderArchRow = (
    rightTeeth: number[],
    leftTeeth: number[],
    isCompareInitial = false,
    isDeciduous = false
  ) => {
    return (
      <div className="w-full overflow-x-auto pb-1.5 scrollbar-thin">
        <div className={`flex items-center justify-center min-w-max mx-auto p-2 sm:p-2.5 rounded-2xl border transition-all ${
          isDeciduous
            ? 'bg-cyan-50/50 border-cyan-200'
            : isCompareInitial
              ? 'bg-white border-cyan-200'
              : 'bg-white/90 border-slate-200 shadow-xs'
        }`}>
          {/* Quadrante Direito (do Paciente) - Exibido à Esquerda da tela (Ex: 18..11 ou 48..41) */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            {rightTeeth.map((tooth) => renderTooth(tooth, isCompareInitial))}
          </div>

          {/* Linha Média Visual com destaque vertical entre 11|21, 41|31, 51|61, 81|71 */}
          <div
            className="flex flex-col items-center justify-center px-1 sm:px-2 select-none group flex-shrink-0"
            title="Linha Média Dental"
          >
            <div className="h-2 w-[2px] bg-cyan-400 group-hover:bg-cyan-500 transition-colors" />
            <span className="text-[9px] sm:text-[10px] font-black uppercase text-cyan-700 dark:text-cyan-400 tracking-tighter my-0.5 px-0.5">
              Média
            </span>
            <div className="h-6 sm:h-9 w-[2px] bg-cyan-500 group-hover:bg-cyan-600 rounded-full transition-colors" />
          </div>

          {/* Quadrante Esquerdo (do Paciente) - Exibido à Direita da tela (Ex: 21..28 ou 31..38) */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            {leftTeeth.map((tooth) => renderTooth(tooth, isCompareInitial))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Barra de Ferramentas do Odontograma */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
        {/* Modos de visualização: Atual vs Inicial vs Comparativo */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setViewMode('current')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'current'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            Odontograma Atual
          </button>
          <button
            type="button"
            onClick={() => setViewMode('initial')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'initial'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            Odontograma Inicial
          </button>
          <button
            type="button"
            onClick={() => setViewMode('compare')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
              viewMode === 'compare'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Comparativo
          </button>
        </div>

        {/* Seletor de Dentição (Permanente / Decídua / Mista) */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setDentitionType('permanent')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              dentitionType === 'permanent'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Permanente
          </button>
          <button
            type="button"
            onClick={() => setDentitionType('deciduous')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              dentitionType === 'deciduous'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Decídua (Infantil)
          </button>
          <button
            type="button"
            onClick={() => setDentitionType('mixed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              dentitionType === 'mixed'
                ? 'bg-cyan-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mista
          </button>
        </div>

        {/* Modo de seleção múltipla */}
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMultiSelectMode(!multiSelectMode);
                setSelectedTeeth([]);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                multiSelectMode
                  ? 'bg-amber-50 border-amber-300 text-amber-800 ring-2 ring-amber-200'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {multiSelectMode ? '✓ Seleção Múltipla Ativa' : 'Modo Seleção Múltipla'}
            </button>

            {multiSelectMode && selectedTeeth.length > 0 && (
              <button
                type="button"
                onClick={applyConditionToSelected}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 text-white hover:bg-cyan-700 shadow-xs flex items-center gap-1.5 animate-pulse"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Aplicar em {selectedTeeth.length} dente(s)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Paleta de Condições Clínicas */}
      {!readOnly && viewMode !== 'initial' && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
              Condição a Aplicar (Selecione e clique na face ou dente):
            </span>
            <span className="text-[11px] text-slate-500 font-medium hidden md:inline">
              V: Vestibular | L/P: Lingual ou Palatina | M: Mesial (voltada à linha média) | D: Distal | O/I: Oclusal/Incisal
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {DENTAL_CONDITIONS.map((c) => {
              const isSelected = activeCondition === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCondition(c.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xs ${
                    isSelected
                      ? 'bg-white border-cyan-500 ring-2 ring-cyan-400 text-cyan-950 scale-105'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full border border-black/10"
                    style={{ backgroundColor: c.color }}
                  />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Exibição Odontograma: Arcada Superior e Inferior */}
      <div className="bg-slate-50/70 border border-slate-200 rounded-3xl p-4 sm:p-6 space-y-6 sm:space-y-8 shadow-xs">
        {/* ARCADA SUPERIOR */}
        <div className="space-y-4">
          {(dentitionType === 'permanent' || dentitionType === 'mixed') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-600">
                  Arcada Superior Permanente (Maxila) — Quadrante 1 & 2
                </span>
                <span className="text-[11px] text-slate-500 font-bold">18 a 11 (Dir) | 21 a 28 (Esq)</span>
              </div>
              {renderArchRow(UPPER_RIGHT, UPPER_LEFT, false, false)}
            </div>
          )}

          {(dentitionType === 'deciduous' || dentitionType === 'mixed') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-black uppercase tracking-wider text-cyan-700">
                  Arcada Superior Decídua (Infantil) — Quadrante 5 & 6
                </span>
                <span className="text-[11px] text-slate-500 font-bold">55 a 51 (Dir) | 61 a 65 (Esq)</span>
              </div>
              {renderArchRow(DECIDUOUS_UPPER_RIGHT, DECIDUOUS_UPPER_LEFT, false, true)}
            </div>
          )}
        </div>

        {/* Divisor com Linha Média Horizontal (Plano Oclusal) */}
        <div className="relative flex items-center justify-center py-1">
          <div className="w-full border-t border-dashed border-slate-300" />
          <span className="absolute bg-white px-3 py-0.5 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Plano Oclusal
          </span>
        </div>

        {/* ARCADA INFERIOR */}
        <div className="space-y-4">
          {(dentitionType === 'deciduous' || dentitionType === 'mixed') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-black uppercase tracking-wider text-cyan-700">
                  Arcada Inferior Decídua (Infantil) — Quadrante 8 & 7
                </span>
                <span className="text-[11px] text-slate-500 font-bold">85 a 81 (Dir) | 71 a 75 (Esq)</span>
              </div>
              {renderArchRow(DECIDUOUS_LOWER_RIGHT, DECIDUOUS_LOWER_LEFT, false, true)}
            </div>
          )}

          {(dentitionType === 'permanent' || dentitionType === 'mixed') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-600">
                  Arcada Inferior Permanente (Mandíbula) — Quadrante 4 & 3
                </span>
                <span className="text-[11px] text-slate-500 font-bold">48 a 41 (Dir) | 31 a 38 (Esq)</span>
              </div>
              {renderArchRow(LOWER_RIGHT, LOWER_LEFT, false, false)}
            </div>
          )}
        </div>
      </div>

      {/* MODO COMPARATIVO (Mostra lado a lado com a mesma unificação de arcada) */}
      {viewMode === 'compare' && (
        <div className="p-5 bg-cyan-50/50 border border-cyan-200 rounded-3xl space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-700" />
            <span className="text-xs font-extrabold text-cyan-950 uppercase tracking-wide">
              Comparativo: Odontograma Inicial (Registro de Entrada)
            </span>
          </div>

          <div className="space-y-4">
            {renderArchRow(UPPER_RIGHT, UPPER_LEFT, true, false)}
            {renderArchRow(LOWER_RIGHT, LOWER_LEFT, true, false)}
          </div>
        </div>
      )}

      {/* Histórico do Dente Selecionado */}
      {selectedToothHistory && (
        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-cyan-600" />
              <span className="text-xs font-extrabold text-slate-800">
                Intervenções e Status do Dente {selectedToothHistory}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedToothHistory(null)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              Fechar
            </button>
          </div>

          <div className="text-xs text-slate-600 space-y-1">
            <p>
              <strong>Status Atual:</strong> {JSON.stringify(data[selectedToothHistory] || 'Hígido')}
            </p>
            <p className="text-[11px] text-slate-500">
              Clique nas faces geométricas acima para adicionar restaurações, cáries ou tratamentos endodônticos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
