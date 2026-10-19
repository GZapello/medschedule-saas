import React, { useState, lazy, Suspense } from 'react';
import { DENTAL_CONDITIONS, OdontogramData, ToothFace } from './odontogramModel';
import { conditionLabel, describeToothStatus, faceLabel, toothFaces, toothName, ToothChange, updateToothCondition, isUpperTooth } from './odontogramClinical';
const HybridDentalArch = lazy(() => import('./HybridDentalArch'));

export class AnatomicalViewBoundary extends React.Component<{onShowFaces:()=>void;children:React.ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed ? <div role="alert" className="p-6 space-y-3"><p>Não foi possível carregar a visualização anatômica.</p><button type="button" className={button} onClick={this.props.onShowFaces}>Continuar no odontograma</button></div> : this.props.children;}
}

interface Props {
  currentData: OdontogramData;
  activeCondition: string;
  onChange: (data: OdontogramData, changes: ToothChange[]) => void;
  onToothClick?: (tooth: number, face?: ToothFace) => void;
  onOpenToothDossier?: (tooth: number) => void;
  onShowFaces: () => void;
  selectedTeeth: number[];
  multiSelectMode: boolean;
  onToggleTooth: (tooth: number) => void;
  readOnly?: boolean;

}
const button = 'px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-40';

export function HybridOdontogram({ currentData, activeCondition, onChange, onToothClick, onOpenToothDossier, onShowFaces, selectedTeeth, multiSelectMode, onToggleTooth, readOnly = false }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const condition = DENTAL_CONDITIONS.find(c => c.id === activeCondition);
  const targets = multiSelectMode ? selectedTeeth : selected ? [selected] : [];
  const apply = (face: ToothFace) => {
    if (readOnly) return;
    let updated = currentData;
    const changes: ToothChange[] = [];
    targets.forEach(n => {
      const actualFace = face === 'palatina' || face === 'lingual' ? (isUpperTooth(n) ? 'palatina' : 'lingual') : face;
      const result = updateToothCondition(updated, n, actualFace, activeCondition, !multiSelectMode && !condition?.affectsWholeTooth);
      updated = result.data; changes.push(...result.changes);
    });
    if (changes.length) onChange(updated, changes);
  };
  const select = (tooth: number) => {
    setSelected(tooth);
    onToothClick?.(tooth);
    if (multiSelectMode) { onToggleTooth(tooth); return; }
    if (!readOnly && condition?.affectsWholeTooth) {
      const result = updateToothCondition(currentData, tooth, 'whole', activeCondition);
      if (result.changes.length) onChange(result.data, result.changes);
    }
  };
  const selectFace = (tooth: number, face: ToothFace) => {
    setSelected(tooth);
    onToothClick?.(tooth, face);
    if (multiSelectMode) { onToggleTooth(tooth); return; }
    if (readOnly) return;
    const result = updateToothCondition(currentData, tooth, face, activeCondition);
    if (result.changes.length) onChange(result.data, result.changes);
  };
  return <section aria-label="Odontograma" className="min-w-0 max-w-full bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-3">
    <div className="flex flex-wrap justify-between items-center gap-2">
      <p className="text-xs text-slate-500">Anatomia e faces do mesmo dente · Clique nas faces para registrar a condição.</p>
      <div className="flex gap-1 items-center">
        <button type="button" className={button} aria-label="Diminuir zoom" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z - .25))}>−</button>
        <span className="text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
        <button type="button" className={button} aria-label="Aumentar zoom" disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + .25))}>+</button>
        <button type="button" className={button} onClick={() => setZoom(1)}>Reset</button>
      </div>
    </div>
    <div className="max-w-full overflow-auto rounded-xl" style={{ maxHeight: zoom > 1 ? '70vh' : undefined }} tabIndex={0} aria-label="Arcadas; amplie e deslize para navegar">
      <div className="bg-slate-50 rounded-xl" style={{ width: `${zoom * 100}%`, minHeight: 180, minWidth: zoom * 880 }}>
        <AnatomicalViewBoundary onShowFaces={onShowFaces}>
          <Suspense fallback={<p role="status" className="p-6 text-sm text-slate-500">Carregando visualização anatômica...</p>}>
            <HybridDentalArch currentData={currentData} selected={selected} hovered={hovered}
              selectedTeeth={selectedTeeth} multiSelectMode={multiSelectMode}
              onSelect={select} onHover={setHovered} onFaceClick={selectFace} readOnly={readOnly}/>
          </Suspense>
        </AnatomicalViewBoundary>
      </div>
    </div>
    <div className="min-h-8 text-xs text-slate-600" role="status">{hovered ? `Dente ${hovered} — ${toothName(hovered)} · ${describeToothStatus(currentData[hovered], hovered)}` : 'Use Tab e Enter para selecionar pelo teclado. O zoom permite navegar pelas arcadas em telas menores.'}</div>
    {(selected || (multiSelectMode && targets.length > 0)) && <div className="border border-cyan-200 rounded-xl p-4 space-y-3" aria-label="Painel do dente selecionado">
      <div><h4 className="font-bold text-slate-800">{multiSelectMode ? `${targets.length} dentes selecionados` : `Dente ${selected}`}</h4>
        {selected && <p className="text-xs text-slate-500">{toothName(selected)}</p>}</div>
      {selected && <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {([...toothFaces(selected), 'whole'] as ToothFace[]).map(face => <div key={face}><dt className="text-slate-500">{faceLabel(face, selected)}</dt><dd className="font-semibold text-slate-700">{conditionLabel(currentData[selected]?.[face])}</dd></div>)}
      </dl>}
      {!readOnly && multiSelectMode && targets.length > 0 && <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-600">{condition?.affectsWholeTooth ? condition.label : `${conditionLabel(activeCondition)} — selecione a face${multiSelectMode ? ' para os dentes selecionados' : ''}:`}</p>
        <div className="flex flex-wrap gap-2">
          {condition?.affectsWholeTooth ? <button type="button" className={button} onClick={() => apply('whole')}>Aplicar condição</button> : <>
            {toothFaces(selected || targets[0]).map(face => <button type="button" className={button} key={face} onClick={() => apply(face)}>{multiSelectMode && (face === 'palatina' || face === 'lingual') ? 'Palatina / Lingual' : faceLabel(face, selected || targets[0])}</button>)}
            {activeCondition === 'healthy' && <button type="button" className={button} onClick={() => apply('whole')}>Limpar condição do dente inteiro</button>}
          </>}
        </div>
      </div>}
      <div className="flex flex-wrap gap-2">
        {!readOnly && !multiSelectMode && selected && activeCondition === 'healthy' && <button type="button" className={button} onClick={() => apply('whole')}>Limpar condição do dente inteiro</button>}
        {selected && onOpenToothDossier && <><button type="button" className={button} onClick={() => onOpenToothDossier(selected)}>Abrir dossiê</button><button type="button" className={button} onClick={() => onOpenToothDossier(selected)}>Histórico</button></>}
      </div>
    </div>}
  </section>;
}
