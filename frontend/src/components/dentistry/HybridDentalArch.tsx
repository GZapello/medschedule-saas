import React from 'react';
import { OdontogramData, ToothFace, DENTAL_CONDITIONS } from './odontogramModel';
import { ToothAnatomyView } from './ToothAnatomyView';
import { ToothFaceMiniMap } from './ToothFaceMiniMap';
import {
  UPPER_PERMANENT,
  LOWER_PERMANENT,
  UPPER_PERMANENT_RIGHT,
  UPPER_PERMANENT_LEFT,
  LOWER_PERMANENT_RIGHT,
  LOWER_PERMANENT_LEFT,
  UPPER_DECIDUOUS_RIGHT,
  UPPER_DECIDUOUS_LEFT,
  LOWER_DECIDUOUS_RIGHT,
  LOWER_DECIDUOUS_LEFT
} from './permanentTeeth';
import { toothFaces, conditionLabel, toothName } from './odontogramClinical';

interface Props {
  currentData: OdontogramData;
  selected: number | null;
  hovered: number | null;
  selectedTeeth: number[];
  multiSelectMode: boolean;
  readOnly?: boolean;
  dentitionType?: 'permanent' | 'deciduous' | 'mixed';
  onSelect: (tooth: number) => void;
  onHover: (tooth: number | null) => void;
  onFaceClick: (tooth: number, face: ToothFace) => void;
  onOpenToothDossier?: (tooth: number) => void;
}

export default function HybridDentalArch(props: Props) {
  const dentitionType = props.dentitionType || 'permanent';

  // Renderizador de card individual de dente padronizado
  const renderToothCard = (tooth: number, colIndex?: number) => {
    const status = props.currentData[tooth] || {};
    const selected = props.multiSelectMode
      ? props.selectedTeeth.includes(tooth)
      : props.selected === tooth;
    const highlighted = selected || props.hovered === tooth;
    const conditions = [
      ...new Set(
        (['whole', ...toothFaces(tooth)] as ToothFace[])
          .map(f => status[f])
          .filter(c => c && c !== 'healthy')
      )
    ];

    return (
      <div
        key={tooth}
        data-tooth={tooth}
        data-selected={selected}
        data-highlighted={highlighted}
        style={colIndex !== undefined ? { gridColumn: colIndex } : undefined}
        className={`min-w-0 rounded-lg border p-0.5 transition-all flex flex-col justify-between ${
          highlighted
            ? 'border-cyan-500 bg-cyan-50/50 shadow-xs ring-1 ring-cyan-400'
            : 'border-slate-100 hover:border-slate-300 bg-white'
        }`}
      >
        <div>
          <div className="text-center text-xs font-bold text-slate-600 mb-0.5" data-fdi={tooth}>
            {tooth}
          </div>
          <ToothAnatomyView
            tooth={tooth}
            status={status}
            selected={selected}
            highlighted={highlighted}
            onSelect={() => props.onSelect(tooth)}
            onHover={props.onHover}
          />
          <ToothFaceMiniMap
            tooth={tooth}
            status={status}
            highlighted={highlighted}
            readOnly={props.readOnly}
            onFaceClick={face => props.onFaceClick(tooth, face)}
            onHover={props.onHover}
          />
        </div>

        <div className="pt-0.5">
          <div
            className="flex flex-wrap justify-center gap-0.5 min-h-3 pt-0.5"
            aria-label={`Condições do dente ${tooth}`}
          >
            {conditions.map(c => (
              <span
                key={c}
                title={conditionLabel(c)}
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: DENTAL_CONDITIONS.find(d => d.id === c)?.color }}
              />
            ))}
          </div>
          {(status.whole === 'missing' || status.whole === 'implant') && (
            <p className="text-[8px] text-center text-slate-500 font-bold leading-none py-0.5">
              {status.whole === 'missing' ? 'Ausente' : 'Implante'}
            </p>
          )}
          {props.onOpenToothDossier && (
            <button
              type="button"
              title={`Abrir Dossiê do Dente ${tooth}`}
              onClick={(e) => {
                e.stopPropagation();
                props.onOpenToothDossier!(tooth);
              }}
              className="w-full mt-1 py-0.5 text-[8px] font-bold text-cyan-700 bg-cyan-50/80 hover:bg-cyan-100 rounded border border-cyan-200 transition"
            >
              Dossiê
            </button>
          )}
        </div>
      </div>
    );
  };

  // Linha Média vertical
  const renderMidline = (colIndex: number) => (
    <div
      key={`midline-${colIndex}`}
      style={{ gridColumn: colIndex }}
      className="flex flex-col items-center justify-center my-auto h-full py-1 pointer-events-none select-none"
      title="Linha Média Dental"
    >
      <div className="w-[2px] h-full bg-cyan-400/80 rounded-full" />
    </div>
  );

  // Plano Oclusal horizontal
  const renderOcclusalPlane = () => (
    <div className="relative flex items-center justify-center py-2 select-none" key="occlusal-plane">
      <div className="w-full border-t border-dashed border-slate-300" />
      <span className="absolute bg-white px-3 py-0.5 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400">
        Plano Oclusal
      </span>
    </div>
  );

  // ==========================================
  // 1. MODO PERMANENTE (32 dentes)
  // ==========================================
  if (dentitionType === 'permanent') {
    return (
      <div className="space-y-4 p-2">
        {/* Arcada Superior Permanente */}
        <section data-arch="upper" aria-label="Arcada superior permanente">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <h4 className="text-xs font-bold text-slate-700">Arcada Superior Permanente (Maxila)</h4>
            <span className="text-[10px] text-slate-500 font-medium">18 a 11 (Dir) | 21 a 28 (Esq)</span>
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr)) 8px repeat(8, minmax(0, 1fr))' }}
          >
            {UPPER_PERMANENT_RIGHT.map((tooth, i) => renderToothCard(tooth, i + 1))}
            {renderMidline(9)}
            {UPPER_PERMANENT_LEFT.map((tooth, i) => renderToothCard(tooth, i + 10))}
          </div>
        </section>

        {renderOcclusalPlane()}

        {/* Arcada Inferior Permanente */}
        <section data-arch="lower" aria-label="Arcada inferior permanente">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <h4 className="text-xs font-bold text-slate-700">Arcada Inferior Permanente (Mandíbula)</h4>
            <span className="text-[10px] text-slate-500 font-medium">48 a 41 (Dir) | 31 a 38 (Esq)</span>
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr)) 8px repeat(8, minmax(0, 1fr))' }}
          >
            {LOWER_PERMANENT_RIGHT.map((tooth, i) => renderToothCard(tooth, i + 1))}
            {renderMidline(9)}
            {LOWER_PERMANENT_LEFT.map((tooth, i) => renderToothCard(tooth, i + 10))}
          </div>
        </section>
      </div>
    );
  }

  // ==========================================
  // 2. MODO DECÍDUA / INFANTIL (20 dentes)
  // ==========================================
  if (dentitionType === 'deciduous') {
    return (
      <div className="space-y-4 p-2 max-w-[680px] mx-auto">
        {/* Arcada Superior Decídua */}
        <section data-arch="upper-deciduous" aria-label="Arcada superior decídua">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <h4 className="text-xs font-bold text-cyan-800">Arcada Superior Decídua — Quadrantes 5 & 6</h4>
            <span className="text-[10px] text-slate-500 font-medium">55 a 51 (Dir) | 61 a 65 (Esq)</span>
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr)) 8px repeat(5, minmax(0, 1fr))' }}
          >
            {UPPER_DECIDUOUS_RIGHT.map((tooth, i) => renderToothCard(tooth, i + 1))}
            {renderMidline(6)}
            {UPPER_DECIDUOUS_LEFT.map((tooth, i) => renderToothCard(tooth, i + 7))}
          </div>
        </section>

        {renderOcclusalPlane()}

        {/* Arcada Inferior Decídua */}
        <section data-arch="lower-deciduous" aria-label="Arcada inferior decídua">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <h4 className="text-xs font-bold text-cyan-800">Arcada Inferior Decídua — Quadrantes 8 & 7</h4>
            <span className="text-[10px] text-slate-500 font-medium">85 a 81 (Dir) | 71 a 75 (Esq)</span>
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr)) 8px repeat(5, minmax(0, 1fr))' }}
          >
            {LOWER_DECIDUOUS_RIGHT.map((tooth, i) => renderToothCard(tooth, i + 1))}
            {renderMidline(6)}
            {LOWER_DECIDUOUS_LEFT.map((tooth, i) => renderToothCard(tooth, i + 7))}
          </div>
        </section>
      </div>
    );
  }

  // ==========================================
  // 3. MODO MISTO (Permanente + Decídua)
  // ==========================================
  // No modo misto, as arcadas decíduas ficam posicionadas entre as permanentes
  // (próximas ao plano oclusal), com alinhamento anatômico sobre os dentes permanentes
  // sucessores (ex: 55 sobre 15, 54 sobre 14, 53 sobre 13, 52 sobre 12, 51 sobre 11).
  return (
    <div className="space-y-4 p-2">
      {/* ARCADA SUPERIOR */}
      <div className="space-y-3 bg-white/70 rounded-xl p-2 border border-slate-100">
        {/* Row 1: Superior Permanente (18..11 | 21..28) */}
        <section data-arch="upper-permanent" aria-label="Arcada superior permanente">
          <div className="flex items-center justify-between mb-1 px-1">
            <h4 className="text-xs font-bold text-slate-700">Arcada Superior Permanente (Maxila) — Quadrantes 1 & 2</h4>
            <span className="text-[10px] text-slate-500 font-medium">18 a 11 (Dir) | 21 a 28 (Esq)</span>
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr)) 8px repeat(8, minmax(0, 1fr))' }}
          >
            {UPPER_PERMANENT_RIGHT.map((tooth, i) => renderToothCard(tooth, i + 1))}
            {renderMidline(9)}
            {UPPER_PERMANENT_LEFT.map((tooth, i) => renderToothCard(tooth, i + 10))}
          </div>
        </section>

        {/* Row 2: Superior Decídua (55..51 | 61..65) alinhada anatomicamente */}
        <section data-arch="upper-deciduous" aria-label="Arcada superior decídua">
          <div className="flex items-center justify-between mb-1 px-1">
            <h4 className="text-xs font-bold text-cyan-800">Arcada Superior Decídua (Infantil) — Quadrantes 5 & 6</h4>
            <span className="text-[10px] text-cyan-600 font-medium">55 a 51 (Dir) | 61 a 65 (Esq)</span>
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr)) 8px repeat(8, minmax(0, 1fr))' }}
          >
            {/* 55..51 posicionados nas colunas 4..8 (alinhados a 15..11) */}
            {UPPER_DECIDUOUS_RIGHT.map((tooth, i) => renderToothCard(tooth, i + 4))}
            {renderMidline(9)}
            {/* 61..65 posicionados nas colunas 10..14 (alinhados a 21..25) */}
            {UPPER_DECIDUOUS_LEFT.map((tooth, i) => renderToothCard(tooth, i + 10))}
          </div>
        </section>
      </div>

      {renderOcclusalPlane()}

      {/* ARCADA INFERIOR */}
      <div className="space-y-3 bg-white/70 rounded-xl p-2 border border-slate-100">
        {/* Row 3: Inferior Decídua (85..81 | 71..75) alinhada anatomicamente */}
        <section data-arch="lower-deciduous" aria-label="Arcada inferior decídua">
          <div className="flex items-center justify-between mb-1 px-1">
            <h4 className="text-xs font-bold text-cyan-800">Arcada Inferior Decídua (Infantil) — Quadrantes 8 & 7</h4>
            <span className="text-[10px] text-cyan-600 font-medium">85 a 81 (Dir) | 71 a 75 (Esq)</span>
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr)) 8px repeat(8, minmax(0, 1fr))' }}
          >
            {/* 85..81 posicionados nas colunas 4..8 (alinhados a 45..41) */}
            {LOWER_DECIDUOUS_RIGHT.map((tooth, i) => renderToothCard(tooth, i + 4))}
            {renderMidline(9)}
            {/* 71..75 posicionados nas colunas 10..14 (alinhados a 31..35) */}
            {LOWER_DECIDUOUS_LEFT.map((tooth, i) => renderToothCard(tooth, i + 10))}
          </div>
        </section>

        {/* Row 4: Inferior Permanente (48..41 | 31..38) */}
        <section data-arch="lower-permanent" aria-label="Arcada inferior permanente">
          <div className="flex items-center justify-between mb-1 px-1">
            <h4 className="text-xs font-bold text-slate-700">Arcada Inferior Permanente (Mandíbula) — Quadrantes 4 & 3</h4>
            <span className="text-[10px] text-slate-500 font-medium">48 a 41 (Dir) | 31 a 38 (Esq)</span>
          </div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr)) 8px repeat(8, minmax(0, 1fr))' }}
          >
            {LOWER_PERMANENT_RIGHT.map((tooth, i) => renderToothCard(tooth, i + 1))}
            {renderMidline(9)}
            {LOWER_PERMANENT_LEFT.map((tooth, i) => renderToothCard(tooth, i + 10))}
          </div>
        </section>
      </div>
    </div>
  );
}
