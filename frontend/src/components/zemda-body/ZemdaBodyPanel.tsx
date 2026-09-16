import React, { useState } from 'react';
import { BodyRegionDef } from './bodyRegionsData';
import { BodyMarkerItem } from './ZemdaBodyCanvas';
import {
  X,
  Activity,
  Droplet,
  ShieldAlert,
  Zap,
  Crosshair,
  Scissors,
  Gauge,
  Ruler,
  MessageSquare,
  Trash2,
  Plus,
  Save,
  CheckCircle2,
  Sliders
} from 'lucide-react';

interface ZemdaBodyPanelProps {
  region: BodyRegionDef | null;
  module?: string;
  markers: BodyMarkerItem[];
  onClose: () => void;
  onAddMarker: (marker: Omit<BodyMarkerItem, 'id'>) => Promise<void>;
  onDeleteMarker: (markerId: string) => Promise<void>;
  readOnly?: boolean;
}

export const ZemdaBodyPanel: React.FC<ZemdaBodyPanelProps> = ({
  region,
  module = 'general',
  markers,
  onClose,
  onAddMarker,
  onDeleteMarker,
  readOnly = false
}) => {
  if (!region) return null;

  // Marcadores já cadastrados nesta região e vista
  const regionMarkers = markers.filter(
    m => m.bodyRegion === region.region && m.view === region.view
  );

  // Formulário ativo
  const [activeFormType, setActiveFormType] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Estados dos formulários específicos
  // 1. Dor
  const [painScore, setPainScore] = useState<number>(7);
  const [painType, setPainType] = useState<string>('pontada');
  const [painNotes, setPainNotes] = useState<string>('');

  // 2. Edema
  const [edemaPresent, setEdemaPresent] = useState<boolean>(true);
  const [edemaIntensity, setEdemaIntensity] = useState<string>('moderado');
  const [edemaNotes, setEdemaNotes] = useState<string>('');

  // 3. Limitação
  const [limitationType, setLimitationType] = useState<string>('movimento');
  const [limitationDesc, setLimitationDesc] = useState<string>('');

  // 4. Sensibilidade
  const [sensitivityType, setSensitivityType] = useState<string>('diminuída');
  const [sensitivityNotes, setSensitivityNotes] = useState<string>('');

  // 5. Lesão
  const [injuryType, setInjuryType] = useState<string>('');
  const [injuryDesc, setInjuryDesc] = useState<string>('');
  const [injuryDate, setInjuryDate] = useState<string>('');
  const [injuryNotes, setInjuryNotes] = useState<string>('');

  // 6. Cicatriz
  const [scarType, setScarType] = useState<string>('');
  const [scarLocation, setScarLocation] = useState<string>('');
  const [scarDesc, setScarDesc] = useState<string>('');
  const [scarNotes, setScarNotes] = useState<string>('');

  // 7. Alteração Funcional
  const [funcDesc, setFuncDesc] = useState<string>('');
  const [funcImpact, setFuncImpact] = useState<string>('');
  const [funcNotes, setFuncNotes] = useState<string>('');

  // 8. Observação Livre
  const [freeObservation, setFreeObservation] = useState<string>('');

  // 9. Antropometria (Nutrição)
  const [anthroCm, setAnthroCm] = useState<string>('');
  const [anthroNotes, setAnthroNotes] = useState<string>('');

  // 10. Força Muscular (Fisio)
  const [muscleGrade, setMuscleGrade] = useState<string>('4');
  const [muscleNotes, setMuscleNotes] = useState<string>('');

  // 11. Amplitude ADM (Fisio)
  const [romValue, setRomValue] = useState<string>('');
  const [romNotes, setRomNotes] = useState<string>('');

  // Submissão do marcador
  const handleSaveCurrentForm = async () => {
    if (!activeFormType) return;
    setIsSubmitting(true);

    try {
      let markerType = activeFormType;
      let value: string | undefined;
      let severity: string | undefined;
      let notes: string | undefined;
      let detailsJson: any = {};

      switch (activeFormType) {
        case 'Dor':
          markerType = 'pain';
          value = `${painScore}/10`;
          severity = painScore >= 8 ? 'intensa' : painScore >= 4 ? 'moderada' : 'leve';
          notes = painNotes || `Dor em ${painType}`;
          detailsJson = { painScore, painType, notes: painNotes };
          break;

        case 'Edema':
          markerType = 'edema';
          value = edemaIntensity;
          severity = edemaIntensity;
          notes = edemaNotes || `Edema ${edemaIntensity}`;
          detailsJson = { present: edemaPresent, intensity: edemaIntensity, notes: edemaNotes };
          break;

        case 'Limitação':
          markerType = 'limitation';
          value = limitationType;
          notes = limitationDesc;
          detailsJson = { type: limitationType, description: limitationDesc };
          break;

        case 'Sensibilidade':
          markerType = 'sensitivity';
          value = sensitivityType;
          notes = sensitivityNotes;
          detailsJson = { type: sensitivityType, notes: sensitivityNotes };
          break;

        case 'Lesão':
          markerType = 'injury';
          value = injuryType || 'Lesão tecidual';
          notes = injuryDesc || injuryNotes;
          detailsJson = { type: injuryType, description: injuryDesc, date: injuryDate, notes: injuryNotes };
          break;

        case 'Cicatriz':
          markerType = 'scar';
          value = scarType || 'Cicatriz';
          notes = scarDesc || scarNotes;
          detailsJson = { type: scarType, location: scarLocation, description: scarDesc, notes: scarNotes };
          break;

        case 'Alteração Funcional':
          markerType = 'functional';
          value = funcDesc.slice(0, 20) || 'Alteração funcional';
          notes = funcImpact ? `${funcDesc} (Impacto: ${funcImpact})` : funcDesc;
          detailsJson = { description: funcDesc, impact: funcImpact, notes: funcNotes };
          break;

        case 'Antropometria':
          markerType = 'anthropometry';
          value = anthroCm ? `${anthroCm} cm` : undefined;
          notes = anthroNotes;
          detailsJson = { circumferenceCm: anthroCm, notes: anthroNotes };
          break;

        case 'Força Muscular':
          markerType = 'muscle_strength';
          value = `Grau ${muscleGrade}`;
          notes = muscleNotes;
          detailsJson = { grade: muscleGrade, notes: muscleNotes };
          break;

        case 'Amplitude (ADM)':
          markerType = 'rom';
          value = romValue ? `${romValue}°` : undefined;
          notes = romNotes;
          detailsJson = { romDegrees: romValue, notes: romNotes };
          break;

        case 'Observação':
        default:
          markerType = 'observation';
          value = 'Observação';
          notes = freeObservation;
          detailsJson = { notes: freeObservation };
          break;
      }

      await onAddMarker({
        bodyRegion: region.region,
        side: region.side,
        view: region.view,
        markerType,
        value,
        severity,
        notes,
        coordinates: {
          x: Number((region.center.x / 400).toFixed(4)),
          y: Number((region.center.y / 760).toFixed(4))
        },
        detailsJson
      });

      // Limpa formulário ativo
      setActiveFormType(null);
    } catch (err) {
      console.error('Erro ao adicionar marcador:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determina botões disponíveis conforme o módulo
  const isPhysio = module === 'ZemdaFisio';
  const isNutri = module === 'ZemdaNutri';
  const isTO = module === 'ZemdaTO';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh] w-full max-w-md animate-in slide-in-from-right-4 duration-200">
      {/* Header da Região */}
      <div className="px-5 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
            Região Selecionada
          </span>
          <h3 className="text-base font-bold tracking-tight capitalize">
            {region.label}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-300">
            <span className="bg-slate-700/60 px-2 py-0.5 rounded-md">
              Lado: <strong>{region.side === 'right' ? 'Direito' : region.side === 'left' ? 'Esquerdo' : 'Linha Média'}</strong>
            </span>
            <span className="bg-slate-700/60 px-2 py-0.5 rounded-md">
              Vista: <strong>{region.view === 'front' ? 'Frente' : region.view === 'back' ? 'Verso' : region.view === 'left' ? 'Esquerda' : 'Direita'}</strong>
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/70 rounded-xl transition-colors cursor-pointer"
          title="Fechar painel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Conteúdo rolável */}
      <div className="p-5 space-y-5 overflow-y-auto flex-1">
        {/* Registros já cadastrados nesta região */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
            Registros nesta Região ({regionMarkers.length})
          </h4>

          {regionMarkers.length === 0 ? (
            <p className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 italic text-center">
              Nenhuma informação registrada para esta região neste atendimento.
            </p>
          ) : (
            <div className="space-y-2">
              {regionMarkers.map((m, idx) => (
                <div
                  key={m.id || idx}
                  className="p-3 bg-slate-50 hover:bg-slate-100/70 rounded-xl border border-slate-200 flex items-start justify-between gap-2.5 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 capitalize">
                        {m.markerType}
                      </span>
                      {m.value && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 border border-teal-200">
                          {m.value}
                        </span>
                      )}
                    </div>
                    {m.notes && (
                      <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">
                        {m.notes}
                      </p>
                    )}
                  </div>

                  {!readOnly && m.id && (
                    <button
                      onClick={() => onDeleteMarker(m.id!)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="Excluir este registro"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Adicionar Informação Estruturada (Se não for read-only) */}
        {!readOnly && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Adicionar Informação
            </h4>

            {/* Grade de Botões de Tipo */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { type: 'Dor', icon: Activity, color: 'hover:bg-rose-50 hover:border-rose-300 text-rose-700' },
                { type: 'Edema', icon: Droplet, color: 'hover:bg-sky-50 hover:border-sky-300 text-sky-700' },
                { type: 'Limitação', icon: ShieldAlert, color: 'hover:bg-amber-50 hover:border-amber-300 text-amber-700' },
                { type: 'Sensibilidade', icon: Zap, color: 'hover:bg-purple-50 hover:border-purple-300 text-purple-700' },
                { type: 'Lesão', icon: Crosshair, color: 'hover:bg-red-50 hover:border-red-300 text-red-700' },
                { type: 'Cicatriz', icon: Scissors, color: 'hover:bg-slate-100 hover:border-slate-400 text-slate-700' },
                { type: 'Alteração Funcional', icon: Gauge, color: 'hover:bg-indigo-50 hover:border-indigo-300 text-indigo-700' },
                ...(isNutri ? [{ type: 'Antropometria', icon: Ruler, color: 'hover:bg-emerald-50 hover:border-emerald-300 text-emerald-700' }] : []),
                ...(isPhysio ? [
                  { type: 'Força Muscular', icon: Sliders, color: 'hover:bg-teal-50 hover:border-teal-300 text-teal-700' },
                  { type: 'Amplitude (ADM)', icon: Gauge, color: 'hover:bg-teal-50 hover:border-teal-300 text-teal-700' }
                ] : []),
                { type: 'Observação', icon: MessageSquare, color: 'hover:bg-slate-100 hover:border-slate-300 text-slate-700' },
              ].map(btn => {
                const Icon = btn.icon;
                const isSelected = activeFormType === btn.type;
                return (
                  <button
                    key={btn.type}
                    onClick={() => setActiveFormType(isSelected ? null : btn.type)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : `bg-white border-slate-200 ${btn.color}`
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{btn.type}</span>
                  </button>
                );
              })}
            </div>

            {/* FORMULÁRIO EXCLUSIVO CORRESPONDENTE AO TIPO SELECIONADO */}
            {activeFormType && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                  <span className="text-xs font-bold text-slate-800">
                    Preencher: {activeFormType}
                  </span>
                  <button
                    onClick={() => setActiveFormType(null)}
                    className="text-xs text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>

                {/* 1. Formulário de Dor */}
                {activeFormType === 'Dor' && (
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1 text-xs">
                        <label className="font-bold text-slate-700">Escala de Dor (EVA)</label>
                        <span className="font-black px-2 py-0.5 rounded-md bg-rose-100 text-rose-800">
                          {painScore} / 10
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        value={painScore}
                        onChange={e => setPainScore(Number(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-600"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-medium">
                        <span>0 Sem dor</span>
                        <span>5 Moderada</span>
                        <span>10 Intensa</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Dor</label>
                      <select
                        value={painType}
                        onChange={e => setPainType(e.target.value)}
                        className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      >
                        <option value="pontada">Pontada</option>
                        <option value="queimação">Queimação</option>
                        <option value="pressão">Pressão</option>
                        <option value="latejamento">Latejamento</option>
                        <option value="choque">Choque</option>
                        <option value="peso">Peso</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Observações da Dor</label>
                      <input
                        type="text"
                        value={painNotes}
                        onChange={e => setPainNotes(e.target.value)}
                        placeholder="Ex: Dor durante flexão, piora ao esforço..."
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* 2. Formulário de Edema */}
                {activeFormType === 'Edema' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Presença</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEdemaPresent(true)}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-xl border ${
                            edemaPresent ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-700'
                          }`}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          onClick={() => setEdemaPresent(false)}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-xl border ${
                            !edemaPresent ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700'
                          }`}
                        >
                          Não
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Intensidade</label>
                      <select
                        value={edemaIntensity}
                        onChange={e => setEdemaIntensity(e.target.value)}
                        className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      >
                        <option value="leve">Leve (+/4)</option>
                        <option value="moderado">Moderado (++/4)</option>
                        <option value="importante">Importante (+++/4 ou ++++/4)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Observações</label>
                      <input
                        type="text"
                        value={edemaNotes}
                        onChange={e => setEdemaNotes(e.target.value)}
                        placeholder="Ex: Cacifo positivo, melhora com elevação..."
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* 3. Formulário de Limitação */}
                {activeFormType === 'Limitação' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Limitação</label>
                      <select
                        value={limitationType}
                        onChange={e => setLimitationType(e.target.value)}
                        className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      >
                        <option value="movimento">Movimento</option>
                        <option value="amplitude">Amplitude</option>
                        <option value="força">Força</option>
                        <option value="funcionalidade">Funcionalidade</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Descrição</label>
                      <textarea
                        rows={2}
                        value={limitationDesc}
                        onChange={e => setLimitationDesc(e.target.value)}
                        placeholder="Descreva a limitação encontrada..."
                        className="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* 4. Formulário de Sensibilidade */}
                {activeFormType === 'Sensibilidade' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Classificação</label>
                      <select
                        value={sensitivityType}
                        onChange={e => setSensitivityType(e.target.value)}
                        className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      >
                        <option value="preservada">Preservada (Normal)</option>
                        <option value="diminuída">Diminuída (Hipoestesia)</option>
                        <option value="aumentada">Aumentada (Hiperestesia)</option>
                        <option value="ausente">Ausente (Anestesia)</option>
                        <option value="parestesia">Parestesia (Formigamento)</option>
                        <option value="outra">Outra</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Observações</label>
                      <input
                        type="text"
                        value={sensitivityNotes}
                        onChange={e => setSensitivityNotes(e.target.value)}
                        placeholder="Ex: Dermátomo L5, sensação de dormência..."
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* 5. Formulário de Lesão */}
                {activeFormType === 'Lesão' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tipo da Lesão</label>
                      <input
                        type="text"
                        value={injuryType}
                        onChange={e => setInjuryType(e.target.value)}
                        placeholder="Ex: Escoriação, ferida operatória, queimadura, hematoma..."
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Descrição</label>
                      <textarea
                        rows={2}
                        value={injuryDesc}
                        onChange={e => setInjuryDesc(e.target.value)}
                        placeholder="Dimensões, bordas, sinais flogísticos..."
                        className="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Data / Início</label>
                        <input
                          type="date"
                          value={injuryDate}
                          onChange={e => setInjuryDate(e.target.value)}
                          className="w-full text-xs border border-slate-200 rounded-xl px-3 py-1.5 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Observação</label>
                        <input
                          type="text"
                          value={injuryNotes}
                          onChange={e => setInjuryNotes(e.target.value)}
                          placeholder="Curativo, exsudato..."
                          className="w-full text-xs border border-slate-200 rounded-xl px-3 py-1.5 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 6. Formulário de Cicatriz */}
                {activeFormType === 'Cicatriz' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tipo da Cicatriz</label>
                      <input
                        type="text"
                        value={scarType}
                        onChange={e => setScarType(e.target.value)}
                        placeholder="Ex: Cirúrgica, hipertrófica, quelóide, atrófica..."
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Descrição e Localização</label>
                      <textarea
                        rows={2}
                        value={scarDesc}
                        onChange={e => setScarDesc(e.target.value)}
                        placeholder="Aderência tecidual, coloração, extensão..."
                        className="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* 7. Alteração Funcional */}
                {activeFormType === 'Alteração Funcional' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Descrição da Alteração</label>
                      <input
                        type="text"
                        value={funcDesc}
                        onChange={e => setFuncDesc(e.target.value)}
                        placeholder="Ex: Claudicação, instabilidade articular, déficit de preensão..."
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Impacto Funcional</label>
                      <input
                        type="text"
                        value={funcImpact}
                        onChange={e => setFuncImpact(e.target.value)}
                        placeholder="Ex: Dificuldade para subir escadas, carregar peso..."
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* 8. Antropometria (Nutrição) */}
                {activeFormType === 'Antropometria' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Medida em Centímetros (cm)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={anthroCm}
                        onChange={e => setAnthroCm(e.target.value)}
                        placeholder="Ex: 34.5"
                        className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Observações</label>
                      <input
                        type="text"
                        value={anthroNotes}
                        onChange={e => setAnthroNotes(e.target.value)}
                        placeholder="Ex: Ponto médio entre acrômio e olécrano..."
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* 9. Força Muscular (Fisioterapia) */}
                {activeFormType === 'Força Muscular' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Grau de Força (Escala MRC / Oxford)</label>
                      <select
                        value={muscleGrade}
                        onChange={e => setMuscleGrade(e.target.value)}
                        className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      >
                        <option value="0">Grau 0 - Nenhuma contração visível</option>
                        <option value="1">Grau 1 - Esboço de contração sem movimento</option>
                        <option value="2">Grau 2 - Movimento ativo com gravidade eliminada</option>
                        <option value="3">Grau 3 - Movimento ativo contra a gravidade</option>
                        <option value="4">Grau 4 - Movimento contra gravidade e resistência moderada</option>
                        <option value="5">Grau 5 - Força normal contra resistência máxima</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Observações</label>
                      <input
                        type="text"
                        value={muscleNotes}
                        onChange={e => setMuscleNotes(e.target.value)}
                        placeholder="Ex: Fadiga precoce após repetições..."
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* 10. Amplitude de Movimento (ADM) */}
                {activeFormType === 'Amplitude (ADM)' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Amplitude / Goniometria (Graus °)</label>
                      <input
                        type="text"
                        value={romValue}
                        onChange={e => setRomValue(e.target.value)}
                        placeholder="Ex: 90° de flexão (ativo), 105° (passivo)..."
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Observações</label>
                      <input
                        type="text"
                        value={romNotes}
                        onChange={e => setRomNotes(e.target.value)}
                        placeholder="Ex: Sensação final em bloco ósseo ou espasmo..."
                        className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* 11. Observação Livre */}
                {activeFormType === 'Observação' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Texto Clínico Livre</label>
                      <textarea
                        rows={3}
                        value={freeObservation}
                        onChange={e => setFreeObservation(e.target.value)}
                        placeholder="Registre informações clínicas específicas desta região..."
                        className="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* Botão de Salvar Formulário Ativo */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveCurrentForm}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Salvando...' : 'Salvar nesta Região'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span>Total de registros: {regionMarkers.length}</span>
        <button
          onClick={onClose}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          Fechar
        </button>
      </div>
    </div>
  );
};
