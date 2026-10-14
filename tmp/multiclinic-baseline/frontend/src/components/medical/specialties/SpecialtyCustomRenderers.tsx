import React from 'react';
import {
  SectionCard,
  CompactInput,
  CompactTextArea,
  ComparativeSideTable,
  ComparativeRow
} from './SpecialtyFieldComponents';
import { EvolutionPhotoField } from '../../common/EvolutionPhotoField';
import { Brain, Heart, Eye, Headphones, Activity, Scale, Baby, Shield, Smile, Flame, ShieldCheck, Stethoscope } from 'lucide-react';

interface SpecialtyRendererProps {
  data: Record<string, any>;
  update: (key: string, val: any) => void;
  readOnly?: boolean;
  patientId: string;
  appointmentId?: string;
  previousLesions?: Record<string, any>[];
}

// 1. NEUROLOGIA
export const NeurologyRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => {
  const cranialPairs = [
    { key: 'cranialI', label: 'I — Olfatório' },
    { key: 'cranialII', label: 'II — Óptico' },
    { key: 'cranialIII', label: 'III — Oculomotor' },
    { key: 'cranialIV', label: 'IV — Troclear' },
    { key: 'cranialV', label: 'V — Trigêmeo' },
    { key: 'cranialVI', label: 'VI — Abducente' },
    { key: 'cranialVII', label: 'VII — Facial' },
    { key: 'cranialVIII', label: 'VIII — Vestibulococlear' },
    { key: 'cranialIX', label: 'IX — Glossofaríngeo' },
    { key: 'cranialX', label: 'X — Vago' },
    { key: 'cranialXI', label: 'XI — Acessório' },
    { key: 'cranialXII', label: 'XII — Hipoglosso' }
  ];

  return (
    <div className="space-y-4">
      {/* Estado Mental */}
      <SectionCard title="Estado Mental & Funções Corticais" icon={<Brain className="w-4 h-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <CompactInput label="Nível de Consciência" fieldKey="consciousness" value={data.consciousness} onChange={update} readOnly={readOnly} placeholder="Ex: Vigil, sonolento, torporoso..." />
          <CompactInput label="Orientação Temporoespacial" fieldKey="orientation" value={data.orientation} onChange={update} readOnly={readOnly} placeholder="Ex: Orientado no tempo e espaço..." />
          <CompactInput label="Linguagem & Comunicação" fieldKey="language" value={data.language} onChange={update} readOnly={readOnly} placeholder="Ex: Fluente, sem afasias..." />
          <CompactInput label="Atenção & Concentração" fieldKey="attention" value={data.attention} onChange={update} readOnly={readOnly} placeholder="Ex: Preservada, disperso..." />
          <CompactInput label="Memória (Imediata / Recente)" fieldKey="memory" value={data.memory} onChange={update} readOnly={readOnly} placeholder="Ex: Preservada, déficits de evocação..." />
        </div>
      </SectionCard>

      {/* Pares Cranianos */}
      <SectionCard title="Pares Cranianos (I a XII)" badge="Nervos Cranianos" description="Avaliação sistemática dos 12 pares cranianos (status, simetria e reflexos pupilares/corneanos)">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {cranialPairs.map(cp => (
            <div key={cp.key} className="bg-white p-2.5 rounded-xl border border-slate-200/80">
              <label className="block text-[11px] font-bold text-slate-700 mb-1 truncate" title={cp.label}>
                {cp.label}
              </label>
              <input
                type="text"
                placeholder="Preservado"
                value={typeof data[cp.key] === 'string' ? data[cp.key] : ''}
                readOnly={readOnly}
                onChange={e => update(cp.key, e.target.value)}
                className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-teal-500 outline-none"
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Sistema Motor */}
      <SectionCard title="Sistema Motor">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CompactInput label="Tônus Muscular" fieldKey="tone" value={data.tone} onChange={update} readOnly={readOnly} placeholder="Normotonia, hipotonia, espasticidade..." />
          <CompactInput label="Trofismo Muscular" fieldKey="trophism" value={data.trophism} onChange={update} readOnly={readOnly} placeholder="Eutrófico, hipotrofia, atrofia..." />
          <CompactInput label="Movimentos Involuntários" fieldKey="involuntaryMovements" value={data.involuntaryMovements} onChange={update} readOnly={readOnly} placeholder="Ausentes, tremor, mioclonias, tiques..." />
        </div>
      </SectionCard>

      {/* Reflexos Profundos e Superficiais */}
      <SectionCard title="Reflexos Osteotendíneos & Cutâneos" description="Graduação clássica (0 a 4+ ou normorreflexia bilateral)">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <CompactInput label="Bicipital (C5-C6)" fieldKey="bicipital" value={data.bicipital} onChange={update} readOnly={readOnly} placeholder="++/++++ bilateral" />
          <CompactInput label="Tricipital (C7-C8)" fieldKey="tricipital" value={data.tricipital} onChange={update} readOnly={readOnly} placeholder="++/++++ bilateral" />
          <CompactInput label="Patelar (L3-L4)" fieldKey="patellar" value={data.patellar} onChange={update} readOnly={readOnly} placeholder="++/++++ bilateral" />
          <CompactInput label="Aquileu (S1-S2)" fieldKey="achilles" value={data.achilles} onChange={update} readOnly={readOnly} placeholder="++/++++ bilateral" />
          <CompactInput label="Cutâneo-Plantar" fieldKey="plantar" value={data.plantar} onChange={update} readOnly={readOnly} placeholder="Flexor bilateral (sem Babinski)" />
        </div>
      </SectionCard>

      {/* Sensibilidade */}
      <SectionCard title="Sensibilidade Somatossensorial">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <CompactInput label="Sensibilidade Tátil" fieldKey="tactile" value={data.tactile} onChange={update} readOnly={readOnly} placeholder="Preservada bilateral" />
          <CompactInput label="Sensibilidade Dolorosa" fieldKey="painSensitivity" value={data.painSensitivity} onChange={update} readOnly={readOnly} placeholder="Preservada, hiperalgesia..." />
          <CompactInput label="Sensibilidade Térmica" fieldKey="thermal" value={data.thermal} onChange={update} readOnly={readOnly} placeholder="Preservada frio/calor" />
          <CompactInput label="Propriocepção Consciente" fieldKey="proprioception" value={data.proprioception} onChange={update} readOnly={readOnly} placeholder="Posição articular preservada" />
        </div>
      </SectionCard>

      {/* Coordenação, Equilíbrio e Marcha */}
      <SectionCard title="Coordenação, Equilíbrio & Sinais Meníngeos">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <CompactInput label="Manobra Índex-Nariz" fieldKey="fingerNose" value={data.fingerNose} onChange={update} readOnly={readOnly} placeholder="Eumétrico bilateral" />
          <CompactInput label="Manobra Calcanhar-Joelho" fieldKey="heelKnee" value={data.heelKnee} onChange={update} readOnly={readOnly} placeholder="Eumétrico bilateral" />
          <CompactInput label="Diadococinesia" fieldKey="diadochokinesia" value={data.diadochokinesia} onChange={update} readOnly={readOnly} placeholder="Preservada (sem disdiadococinesia)" />
          <CompactInput label="Base de Sustentação & Marcha" fieldKey="base" value={data.base} onChange={update} readOnly={readOnly} placeholder="Base estreita, marcha típica" />
          <CompactInput label="Sinal de Romberg" fieldKey="romberg" value={data.romberg} onChange={update} readOnly={readOnly} placeholder="Negativo (estável)" />
          <CompactInput label="Sinais Meníngeos (Rigidez / Kernig / Brudzinski)" fieldKey="meningealSigns" value={data.meningealSigns} onChange={update} readOnly={readOnly} placeholder="Ausentes (sem rigidez de nuca)" />
          <CompactTextArea label="Observações de Equilíbrio & Marcha" fieldKey="balanceChanges" value={data.balanceChanges} onChange={update} readOnly={readOnly} className="sm:col-span-2 lg:col-span-3" />
        </div>
      </SectionCard>
    </div>
  );
};

// 2. OFTALMOLOGIA (Comparativo OD / OE Lado a Lado)
export const OphthalmologyRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => {
  const refractionRows: ComparativeRow[] = [
    { label: 'Acuidade Visual Sem Correção', odKey: 'visualAcuityOD', oeKey: 'visualAcuityOE', placeholder: '20/20' },
    { label: 'Acuidade Visual Com Correção', odKey: 'correctedAcuityOD', oeKey: 'correctedAcuityOE', placeholder: '20/20' },
    { label: 'Acuidade Perto (J)', odKey: 'nearAcuityOD', oeKey: 'nearAcuityOE', placeholder: 'J1' },
    { label: 'Acuidade Longe', odKey: 'farAcuityOD', oeKey: 'farAcuityOE', placeholder: '20/20' },
    { label: 'Refração — Esfera', odKey: 'sphereOD', oeKey: 'sphereOE', placeholder: '+1.50', unit: 'DE' },
    { label: 'Refração — Cilindro', odKey: 'cylinderOD', oeKey: 'cylinderOE', placeholder: '-0.75', unit: 'DC' },
    { label: 'Refração — Eixo', odKey: 'axisOD', oeKey: 'axisOE', placeholder: '90°', unit: '°' },
    { label: 'Refração — Adição', odKey: 'additionOD', oeKey: 'additionOE', placeholder: '+2.00', unit: 'D' },
    { label: 'Pressão Intraocular (PIO)', odKey: 'iopOD', oeKey: 'iopOE', placeholder: '14', unit: 'mmHg' }
  ];

  const bioRows: ComparativeRow[] = [
    { label: 'Pálpebras e Cílios', odKey: 'eyelidsOD', oeKey: 'eyelidsOE', placeholder: 'Sem blefarite / ptose' },
    { label: 'Conjuntiva e Esclera', odKey: 'conjunctivaOD', oeKey: 'conjunctivaOE', placeholder: 'Clara, sem hiperemia' },
    { label: 'Córnea', odKey: 'corneaOD', oeKey: 'corneaOE', placeholder: 'Transparente, sem opacidades' },
    { label: 'Câmara Anterior', odKey: 'anteriorChamberOD', oeKey: 'anteriorChamberOE', placeholder: 'Profunda, ampla, sem Tyndall' },
    { label: 'Íris e Pupila', odKey: 'irisOD', oeKey: 'irisOE', placeholder: 'Reagente, fotorreflexo preservado' },
    { label: 'Cristalino', odKey: 'lensOD', oeKey: 'lensOE', placeholder: 'Transparente, sem facoesclerose' },
    { label: 'Disco Óptico / Papila', odKey: 'discOD', oeKey: 'discOE', placeholder: 'Corada, bordos nítidos, escavação 0.3' },
    { label: 'Vasos Retinianos', odKey: 'vesselsOD', oeKey: 'vesselsOE', placeholder: 'Calibre e trajeto normais' },
    { label: 'Mácula', odKey: 'maculaOD', oeKey: 'maculaOE', placeholder: 'Brilho foveal preservado' },
    { label: 'Retina Periférica', odKey: 'retinaOD', oeKey: 'retinaOE', placeholder: 'Aplicada 360°, sem roturas' },
    { label: 'Motilidade Ocular', odKey: 'motilityOD', oeKey: 'motilityOE', placeholder: 'Movimentos preservados nas 6 posições' },
    { label: 'Outras Alterações', odKey: 'changesOD', oeKey: 'changesOE', placeholder: 'Nenhum outro achado' }
  ];

  return (
    <div className="space-y-4">
      {/* Tabela Comparativa de Refração e Acuidade */}
      <ComparativeSideTable
        title="Refração, Acuidade Visual & Tonometria (OD / OE)"
        rows={refractionRows}
        data={data}
        onChange={update}
        readOnly={readOnly}
      />

      {/* Biomicroscopia e Fundo de Olho */}
      <ComparativeSideTable
        title="Biomicroscopia & Fundoscopia Comparativa (OD / OE)"
        rows={bioRows}
        data={data}
        onChange={update}
        readOnly={readOnly}
      />

      {/* Tonometria e Exames Específicos */}
      <SectionCard title="Tonometria & Exames Especializados" icon={<Eye className="w-4 h-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <CompactInput label="Método da PIO" fieldKey="iopMethod" value={data.iopMethod} onChange={update} readOnly={readOnly} placeholder="Aplanação de Goldmann, Sopro..." />
          <CompactInput label="Horário da Medição da PIO" fieldKey="iopTime" value={data.iopTime} onChange={update} readOnly={readOnly} placeholder="Ex: 09:30" />
          <CompactInput label="OCT (Tomografia de Coerência)" fieldKey="oct" value={data.oct} onChange={update} readOnly={readOnly} placeholder="Camada de fibras nervosas preservada..." />
          <CompactInput label="Retinografia" fieldKey="retinography" value={data.retinography} onChange={update} readOnly={readOnly} placeholder="Registro fotográfico..." />
          <CompactInput label="Campimetria Visual" fieldKey="visualField" value={data.visualField} onChange={update} readOnly={readOnly} placeholder="Campo visual preservado sem escotomas..." />
          <CompactInput label="Topografia Corneana" fieldKey="topography" value={data.topography} onChange={update} readOnly={readOnly} placeholder="Ceratometria K1/K2..." />
          <CompactInput label="Paquimetria Corneana (µm)" fieldKey="pachymetry" value={data.pachymetry} onChange={update} readOnly={readOnly} placeholder="Ex: 540 µm" />
        </div>
      </SectionCard>
    </div>
  );
};

// 3. CARDIOLOGIA
export const CardiologyRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => (
  <div className="space-y-4">
    {/* Sintomas */}
    <SectionCard title="Sintomas Cardiovasculares" icon={<Heart className="w-4 h-4" />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <CompactInput label="Dor Torácica / Angina" fieldKey="chestPain" value={data.chestPain} onChange={update} readOnly={readOnly} placeholder="Ausente, em aperto, queimação, aos esforços..." />
        <CompactInput label="Dispneia (Classe Funcional NYHA)" fieldKey="dyspnea" value={data.dyspnea} onChange={update} readOnly={readOnly} placeholder="Ausente, aos grandes/médios/pequenos esforços..." />
        <CompactInput label="Palpitações" fieldKey="palpitations" value={data.palpitations} onChange={update} readOnly={readOnly} placeholder="Ausentes, taquicardia paroxística..." />
        <CompactInput label="Síncope / Pré-Síncope" fieldKey="syncope" value={data.syncope} onChange={update} readOnly={readOnly} placeholder="Sem episódios sincopais..." />
        <CompactInput label="Edema de Membros Inferiores" fieldKey="edema" value={data.edema} onChange={update} readOnly={readOnly} placeholder="Ausente, vespertino, cacifo..." />
        <CompactInput label="Intolerância ao Esforço" fieldKey="exerciseIntolerance" value={data.exerciseIntolerance} onChange={update} readOnly={readOnly} placeholder="Tolerância habitual, fadiga precoce..." />
      </div>
    </SectionCard>

    {/* Exame Físico Cardiovascular */}
    <SectionCard title="Exame Físico Cardiovascular Especializado">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <CompactInput label="Ritmo Cardíaco" fieldKey="rhythm" value={data.rhythm} onChange={update} readOnly={readOnly} placeholder="Ritmo sinusal regular em 2T..." />
        <CompactInput label="Bulhas Cardíacas" fieldKey="heartSounds" value={data.heartSounds} onChange={update} readOnly={readOnly} placeholder="Normofonéticas sem desdobramentos..." />
        <CompactInput label="Sopros Cardíacos" fieldKey="murmurs" value={data.murmurs} onChange={update} readOnly={readOnly} placeholder="Sem sopros audíveis / Sistólico em foco aórtico..." />
        <CompactInput label="Pulsos Periféricos" fieldKey="pulses" value={data.pulses} onChange={update} readOnly={readOnly} placeholder="Simétricos e amplos em 4 membros..." />
        <CompactInput label="Perfusão Periférica" fieldKey="perfusion" value={data.perfusion} onChange={update} readOnly={readOnly} placeholder="Enchimento capilar < 2s..." />
        <CompactInput label="Edema ao Exame" fieldKey="examEdema" value={data.examEdema} onChange={update} readOnly={readOnly} placeholder="Ausente / Maleolar +/4+..." />
      </div>
    </SectionCard>

    {/* Estratificação de Risco Cardiovascular */}
    <SectionCard title="Fatores de Risco & Estratificação Cardiovascular">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <CompactInput label="Hipertensão Arterial (HAS)" fieldKey="hypertension" value={data.hypertension} onChange={update} readOnly={readOnly} placeholder="Normotenso / Estágio 1, 2, 3..." />
        <CompactInput label="Diabetes Mellitus" fieldKey="diabetes" value={data.diabetes} onChange={update} readOnly={readOnly} placeholder="Não diabético / DM2 controlado..." />
        <CompactInput label="Tabagismo" fieldKey="smoking" value={data.smoking} onChange={update} readOnly={readOnly} placeholder="Não fumante / Ex-fumante (anos-maço)..." />
        <CompactInput label="Dislipidemia" fieldKey="dyslipidemia" value={data.dyslipidemia} onChange={update} readOnly={readOnly} placeholder="Perfil lipídico prévio..." />
        <CompactInput label="Histórico Familiar de DAC Precoce" fieldKey="familyRisk" value={data.familyRisk} onChange={update} readOnly={readOnly} placeholder="Ausente / Parente 1º grau..." />
        <CompactInput label="Estratificação de Risco (Global / Framingham)" fieldKey="cvRisk" value={data.cvRisk} onChange={update} readOnly={readOnly} placeholder="Baixo / Intermediário / Alto risco..." />
      </div>
    </SectionCard>

    {/* Exames Complementares */}
    <SectionCard title="Exames Complementares Cardiológicos">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <CompactInput label="Eletrocardiograma (ECG)" fieldKey="ecg" value={data.ecg} onChange={update} readOnly={readOnly} placeholder="Ritmo sinusal, FC 72, eixo normal..." />
        <CompactInput label="Ecocardiograma Transtorácico" fieldKey="echo" value={data.echo} onChange={update} readOnly={readOnly} placeholder="FEVE normal, sem disfunção segmentar..." />
        <CompactInput label="MAPA 24h" fieldKey="mapa" value={data.mapa} onChange={update} readOnly={readOnly} placeholder="Pressão média 24h, descenso noturno..." />
        <CompactInput label="Holter 24h" fieldKey="holter" value={data.holter} onChange={update} readOnly={readOnly} placeholder="Sem arritmias sustentadas..." />
        <CompactInput label="Teste Ergométrico" fieldKey="stressTest" value={data.stressTest} onChange={update} readOnly={readOnly} placeholder="Negativo para isquemia miocárdica..." />
        <CompactInput label="Outros Exames / Marcadores" fieldKey="otherTests" value={data.otherTests} onChange={update} readOnly={readOnly} placeholder="Troponina, BNP, Angio-TC..." />
      </div>
    </SectionCard>
  </div>
);

// 4. DERMATOLOGIA
export const DermatologyRenderer: React.FC<SpecialtyRendererProps> = ({
  data,
  update,
  readOnly,
  patientId,
  appointmentId,
  previousLesions
}) => {
  const lesions: Record<string, any>[] = Array.isArray(data.lesions)
    ? data.lesions.filter((l: any) => l && typeof l === 'object' && !Array.isArray(l))
    : [];

  const updateLesion = (index: number, key: string, nextVal: any) => {
    const updated = lesions.map((l, i) => (i === index ? { ...l, [key]: nextVal } : l));
    update('lesions', updated);
  };

  const addLesion = () => {
    update('lesions', [
      ...lesions,
      {
        id: crypto.randomUUID(),
        identification: `Lesão ${lesions.length + 1}`,
        location: '',
        type: '',
        size: '',
        color: '',
        borders: '',
        asymmetry: 'Simétrica',
        abcdeBorders: 'Regulares',
        abcdeColor: 'Homogênea',
        diameter: '< 6mm',
        evolution: 'Estável'
      }
    ]);
  };

  const removeLesion = (index: number) => {
    update('lesions', lesions.filter((_, i) => i !== index));
  };

  const phototypeOptions = [
    { value: 'Fototipo I', label: 'Fototipo I — Pele muito clara, sempre queima, nunca bronzeia' },
    { value: 'Fototipo II', label: 'Fototipo II — Pele clara, queima facilmente, bronzeia pouco' },
    { value: 'Fototipo III', label: 'Fototipo III — Pele morena clara, queima moderadamente, bronzeia gradualmente' },
    { value: 'Fototipo IV', label: 'Fototipo IV — Pele morena moderada, queima pouco, bronzeia com facilidade' },
    { value: 'Fototipo V', label: 'Fototipo V — Pele morena escura, raramente queima, bronzeia profundamente' },
    { value: 'Fototipo VI', label: 'Fototipo VI — Pele negra, nunca queima, intensamente pigmentada' }
  ];

  return (
    <div className="space-y-4">
      {/* Fototipo de Fitzpatrick */}
      <SectionCard title="Pele, Anexos & Fototipo de Fitzpatrick" icon={<Flame className="w-4 h-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 leading-tight">
              Classificação do Fototipo
            </label>
            <select
              value={data.phototype || ''}
              disabled={readOnly}
              onChange={e => update('phototype', e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:border-teal-500 outline-none"
            >
              <option value="">Selecione o fototipo...</option>
              {phototypeOptions.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <CompactInput
            label="Características Gerais dos Anexos (Cabelos / Unhas)"
            fieldKey="skinNotes"
            value={data.skinNotes}
            onChange={update}
            readOnly={readOnly}
            placeholder="Elasticidade, hidratação, leito ungueal..."
          />
        </div>
      </SectionCard>

      {/* Gestão de Lesões Cutâneas */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
              Mapeamento de Lesões Cutâneas & Dermatoscopia ({lesions.length})
            </h3>
            {lesions.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                {lesions.length} {lesions.length === 1 ? 'lesão cadastrada' : 'lesões cadastradas'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!readOnly && Array.isArray(previousLesions) && previousLesions.length > 0 && (
              <div className="flex items-center gap-1.5">
                {previousLesions
                  .filter(l => l && !lesions.some(curr => curr.id === l.id))
                  .map((l, i) => (
                    <button
                      key={l.id || i}
                      type="button"
                      onClick={() =>
                        update('lesions', [
                          ...lesions,
                          {
                            id: l.id || crypto.randomUUID(),
                            identification: l.identification,
                            location: l.location,
                            type: l.type,
                            photos: Array.isArray(l.photos)
                              ? l.photos.map((p: any) => ({ ...p, isCurrentSession: false }))
                              : []
                          }
                        ])
                      }
                      className="px-2.5 py-1 text-xs font-semibold rounded-xl bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 transition-colors"
                    >
                      + Acompanhar: {l.identification || `Lesão ${i + 1}`}
                    </button>
                  ))}
              </div>
            )}

            {!readOnly && (
              <button
                type="button"
                onClick={addLesion}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>+ Adicionar Lesão</span>
              </button>
            )}
          </div>
        </div>

        {lesions.length === 0 ? (
          <div className="p-6 text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 text-slate-500">
            <Flame className="w-6 h-6 mx-auto mb-1.5 text-slate-400" />
            <p className="text-xs font-medium">Nenhuma lesão mapeada nesta consulta.</p>
            {!readOnly && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                Clique em "+ Adicionar Lesão" para documentar lesões cutâneas com regra ABCDE e fotografias.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {lesions.map((lesion, index) => (
              <div
                key={lesion.id || index}
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5 relative"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-teal-600 text-white text-[11px] font-extrabold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <h4 className="text-xs font-black text-slate-900">
                      {lesion.identification || `Lesão ${index + 1}`}
                    </h4>
                    {lesion.location && (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700">
                        {lesion.location}
                      </span>
                    )}
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeLesion(index)}
                      className="text-xs font-bold text-rose-600 hover:text-rose-800 transition-colors"
                    >
                      Remover Lesão
                    </button>
                  )}
                </div>

                {/* Linha 1: Identificação, Localização, Tipo e Tamanho */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <CompactInput
                    label="Identificação da Lesão *"
                    fieldKey="identification"
                    value={lesion.identification}
                    onChange={(_, val) => updateLesion(index, 'identification', val)}
                    readOnly={readOnly}
                    placeholder="Ex: Nevo dorso superior direito"
                  />
                  <CompactInput
                    label="Localização Anatômica (Zemda360)"
                    fieldKey="location"
                    value={lesion.location}
                    onChange={(_, val) => updateLesion(index, 'location', val)}
                    readOnly={readOnly}
                    placeholder="Ex: Região escapular direita"
                  />
                  <CompactInput
                    label="Tipo / Morfologia"
                    fieldKey="type"
                    value={lesion.type}
                    onChange={(_, val) => updateLesion(index, 'type', val)}
                    readOnly={readOnly}
                    placeholder="Mácula, pápula, nódulo, placa..."
                  />
                  <CompactInput
                    label="Tamanho / Dimensões"
                    fieldKey="size"
                    value={lesion.size}
                    onChange={(_, val) => updateLesion(index, 'size', val)}
                    readOnly={readOnly}
                    placeholder="Ex: 5 x 4 mm"
                  />
                </div>

                {/* Linha 2: Formato, Cor, Bordas e Superfície */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <CompactInput
                    label="Formato"
                    fieldKey="shape"
                    value={lesion.shape}
                    onChange={(_, val) => updateLesion(index, 'shape', val)}
                    readOnly={readOnly}
                    placeholder="Ovalada, irregular..."
                  />
                  <CompactInput
                    label="Cor"
                    fieldKey="color"
                    value={lesion.color}
                    onChange={(_, val) => updateLesion(index, 'color', val)}
                    readOnly={readOnly}
                    placeholder="Castanho claro, polimorfa..."
                  />
                  <CompactInput
                    label="Bordas"
                    fieldKey="borders"
                    value={lesion.borders}
                    onChange={(_, val) => updateLesion(index, 'borders', val)}
                    readOnly={readOnly}
                    placeholder="Nítidas, esbatidas..."
                  />
                  <CompactInput
                    label="Superfície"
                    fieldKey="surface"
                    value={lesion.surface}
                    onChange={(_, val) => updateLesion(index, 'surface', val)}
                    readOnly={readOnly}
                    placeholder="Lisa, áspera, descamativa..."
                  />
                </div>

                {/* Seção ABCDE da Dermatoscopia */}
                <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-3 space-y-2">
                  <span className="text-[11px] font-black text-amber-900 uppercase tracking-wider block">
                    Critérios Dermatoscópicos ABCDE
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <CompactInput
                      label="A — Assimetria"
                      fieldKey="asymmetry"
                      value={lesion.asymmetry}
                      onChange={(_, val) => updateLesion(index, 'asymmetry', val)}
                      readOnly={readOnly}
                      placeholder="Simétrica / 1 eixo / 2 eixos"
                    />
                    <CompactInput
                      label="B — Bordas"
                      fieldKey="abcdeBorders"
                      value={lesion.abcdeBorders}
                      onChange={(_, val) => updateLesion(index, 'abcdeBorders', val)}
                      readOnly={readOnly}
                      placeholder="Regulares / Irregulares"
                    />
                    <CompactInput
                      label="C — Cor"
                      fieldKey="abcdeColor"
                      value={lesion.abcdeColor}
                      onChange={(_, val) => updateLesion(index, 'abcdeColor', val)}
                      readOnly={readOnly}
                      placeholder="Única / Múltiplas cores"
                    />
                    <CompactInput
                      label="D — Diâmetro"
                      fieldKey="diameter"
                      value={lesion.diameter}
                      onChange={(_, val) => updateLesion(index, 'diameter', val)}
                      readOnly={readOnly}
                      placeholder="< 6mm / > 6mm"
                    />
                    <CompactInput
                      label="E — Evolução"
                      fieldKey="evolution"
                      value={lesion.evolution}
                      onChange={(_, val) => updateLesion(index, 'evolution', val)}
                      readOnly={readOnly}
                      placeholder="Estável / Modificou"
                    />
                  </div>
                </div>

                {/* Sintomas, Duração e Notas */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <CompactInput
                    label="Sintomas Associados"
                    fieldKey="symptoms"
                    value={lesion.symptoms}
                    onChange={(_, val) => updateLesion(index, 'symptoms', val)}
                    readOnly={readOnly}
                    placeholder="Prurido, dor, sangramento..."
                  />
                  <CompactInput
                    label="Tempo de Evolução"
                    fieldKey="duration"
                    value={lesion.duration}
                    onChange={(_, val) => updateLesion(index, 'duration', val)}
                    readOnly={readOnly}
                    placeholder="Meses, anos, recente..."
                  />
                  <CompactInput
                    label="Observações da Lesão"
                    fieldKey="notes"
                    value={lesion.notes}
                    onChange={(_, val) => updateLesion(index, 'notes', val)}
                    readOnly={readOnly}
                    placeholder="Conduta dermatoscópica, biópsia..."
                  />
                </div>

                {/* Fotos da Lesão */}
                <div className="pt-2 border-t border-slate-100">
                  <EvolutionPhotoField
                    patientId={patientId}
                    appointmentId={appointmentId}
                    category="clinical_evolution"
                    label="Fotografias Clínicas & Dermatoscopia da Lesão"
                    disabled={readOnly}
                    photos={
                      Array.isArray(lesion.photos)
                        ? lesion.photos.filter((photo: any) => photo && typeof photo === 'object')
                        : lesion.photo
                        ? [
                            {
                              ...lesion.photo,
                              capturedAt: lesion.photo.capturedAt || '',
                              fileId: lesion.photo.fileId || lesion.photo.id
                            }
                          ]
                        : []
                    }
                    onChangePhotos={photos => updateLesion(index, 'photos', photos)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// 5. ORTOPEDIA E TRAUMATOLOGIA
export const OrthopedicsRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => {
  const regions = [
    'Coluna Cervical',
    'Coluna Torácica',
    'Coluna Lombar',
    'Ombro & Cintura Escapular',
    'Cotovelo',
    'Punho & Mão',
    'Pelve & Quadril',
    'Joelho',
    'Tornozelo & Pé'
  ];

  return (
    <div className="space-y-4">
      <SectionCard
        title="Exame Ortopédico & Aparelho Locomotor"
        icon={<Activity className="w-4 h-4" />}
        description="Foco clínico segmentar integrado às avaliações especializadas do ZemdaFisio e Zemda360"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 leading-tight">
              Região Anatômica em Foco
            </label>
            <select
              value={data.orthoRegion || ''}
              disabled={readOnly}
              onChange={e => update('orthoRegion', e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:border-teal-500 outline-none"
            >
              <option value="">Selecione o segmento ortopédico...</option>
              {regions.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <CompactInput
            label="Dor & Escala Visual Analógica (EVA)"
            fieldKey="orthoPain"
            value={data.orthoPain}
            onChange={update}
            readOnly={readOnly}
            placeholder="Ex: EVA 7/10, piora à palpação do tubérculo maior..."
          />

          <CompactInput
            label="Amplitude Articular (ADM)"
            fieldKey="orthoMobility"
            value={data.orthoMobility}
            onChange={update}
            readOnly={readOnly}
            placeholder="Ex: Flexão 120°, Abdução 90° com dor..."
          />

          <CompactInput
            label="Força Muscular (Oxford 0-5)"
            fieldKey="orthoStrength"
            value={data.orthoStrength}
            onChange={update}
            readOnly={readOnly}
            placeholder="Ex: Grau 4 em flexores de quadril..."
          />

          <CompactInput
            label="Manobras Especiais & Testes Ortopédicos"
            fieldKey="orthoTests"
            value={data.orthoTests}
            onChange={update}
            readOnly={readOnly}
            placeholder="Ex: Neer positivo, Hawkins positivo, Gaveta anterior negativo..."
          />

          <CompactInput
            label="Estabilidade & Palpação Óssea"
            fieldKey="orthoPalpation"
            value={data.orthoPalpation}
            onChange={update}
            readOnly={readOnly}
            placeholder="Sem crepitação, dor ao estresse em varo..."
          />

          <CompactTextArea
            label="Observações Ortopédicas & Planejamento Cirúrgico / Conservador"
            fieldKey="orthoNotes"
            value={data.orthoNotes}
            onChange={update}
            readOnly={readOnly}
            className="sm:col-span-2 lg:col-span-3"
          />
        </div>
      </SectionCard>
    </div>
  );
};

// 6. PSIQUIATRIA
export const PsychiatryRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => (
  <div className="space-y-4">
    {/* Exame do Estado Mental */}
    <SectionCard title="Exame do Estado Mental (EEM)" icon={<Smile className="w-4 h-4" />}>
      <div className="space-y-3">
        {/* Apresentação e Conduta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CompactInput label="Aparência Geral" fieldKey="appearance" value={data.appearance} onChange={update} readOnly={readOnly} placeholder="Asseado, vestimentas adequadas..." />
          <CompactInput label="Atitude com o Examinador" fieldKey="attitude" value={data.attitude} onChange={update} readOnly={readOnly} placeholder="Colaborativo, queixoso, esquivo..." />
          <CompactInput label="Comportamento" fieldKey="behavior" value={data.behavior} onChange={update} readOnly={readOnly} placeholder="Adequado ao contexto..." />
          <CompactInput label="Psicomotricidade" fieldKey="psychomotor" value={data.psychomotor} onChange={update} readOnly={readOnly} placeholder="Eunérgica, inquietação, lentificação..." />
        </div>

        {/* Consciência e Cognição */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CompactInput label="Consciência" fieldKey="consciousness" value={data.consciousness} onChange={update} readOnly={readOnly} placeholder="Lúcida e vigil..." />
          <CompactInput label="Orientação" fieldKey="orientation" value={data.orientation} onChange={update} readOnly={readOnly} placeholder="Orientada autopsiquicamente e alopsiquicamente..." />
          <CompactInput label="Atenção" fieldKey="attention" value={data.attention} onChange={update} readOnly={readOnly} placeholder="Normovigil e normotenaz..." />
          <CompactInput label="Memória" fieldKey="memory" value={data.memory} onChange={update} readOnly={readOnly} placeholder="Preservada para fatos recentes e remotos..." />
        </div>

        {/* Afetividade */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CompactInput label="Humor Basal" fieldKey="mood" value={data.mood} onChange={update} readOnly={readOnly} placeholder="Eutímico, deprimido, expansivo, ansioso..." />
          <CompactInput label="Afeto & Modulação" fieldKey="affect" value={data.affect} onChange={update} readOnly={readOnly} placeholder="Congruente, modulado, embotado, lábil..." />
        </div>

        {/* Pensamento e Percepção */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CompactInput label="Pensamento (Forma)" fieldKey="thought" value={data.thought} onChange={update} readOnly={readOnly} placeholder="Lógico, agregado..." />
          <CompactInput label="Curso do Pensamento" fieldKey="thoughtProcess" value={data.thoughtProcess} onChange={update} readOnly={readOnly} placeholder="Velocidade normal, lentificado, acelerado..." />
          <CompactInput label="Conteúdo do Pensamento" fieldKey="thoughtContent" value={data.thoughtContent} onChange={update} readOnly={readOnly} placeholder="Sem delírios ou ideação de ruína/morte..." />
          <CompactInput label="Percepção (Sensopercepção)" fieldKey="perception" value={data.perception} onChange={update} readOnly={readOnly} placeholder="Sem alucinações ou ilusões..." />
        </div>

        {/* Linguagem, Crítica e Juízo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CompactInput label="Linguagem" fieldKey="language" value={data.language} onChange={update} readOnly={readOnly} placeholder="Clara, articulada, sem neologismos..." />
          <CompactInput label="Juízo Crítico da Realidade" fieldKey="judgment" value={data.judgment} onChange={update} readOnly={readOnly} placeholder="Preservado..." />
          <CompactInput label="Insight sobre a Condição" fieldKey="insight" value={data.insight} onChange={update} readOnly={readOnly} placeholder="Presente, reconhece a necessidade de tratamento..." />
        </div>
      </div>
    </SectionCard>

    {/* Funcionamento Global e Tratamento */}
    <SectionCard title="Funcionamento Global, Hábitos & Adesão">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <CompactInput label="Padrão de Sono" fieldKey="sleep" value={data.sleep} onChange={update} readOnly={readOnly} placeholder="Repousador / Insônia inicial, intermediária..." />
        <CompactInput label="Apetite & Peso" fieldKey="appetite" value={data.appetite} onChange={update} readOnly={readOnly} placeholder="Preservado, hiporexia, hiperfagia..." />
        <CompactInput label="Substâncias Psicoativas" fieldKey="substances" value={data.substances} onChange={update} readOnly={readOnly} placeholder="Nega uso / Álcool social, tabaco..." />
        <CompactInput label="Funcionamento Social & Familiar" fieldKey="socialFunction" value={data.socialFunction} onChange={update} readOnly={readOnly} placeholder="Rede de apoio preservada, isolamento..." />
        <CompactInput label="Funcionamento Ocupacional" fieldKey="occupationalFunction" value={data.occupationalFunction} onChange={update} readOnly={readOnly} placeholder="Ativo no trabalho, afastado..." />
        <CompactInput label="Adesão Medicamentosa" fieldKey="adherence" value={data.adherence} onChange={update} readOnly={readOnly} placeholder="Boa adesão, efeitos adversos..." />
      </div>
    </SectionCard>
  </div>
);

// 7. PEDIATRIA
export const PediatricsRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => (
  <div className="space-y-4">
    {/* Nascimento / Perinatal */}
    <SectionCard title="Histórico Perinatal & Nascimento" icon={<Baby className="w-4 h-4" />}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <CompactInput label="Idade Gestacional" fieldKey="gestationalAge" value={data.gestationalAge} onChange={update} readOnly={readOnly} placeholder="39 sem" />
        <CompactInput label="Tipo de Parto" fieldKey="delivery" value={data.delivery} onChange={update} readOnly={readOnly} placeholder="Vaginal / Cesárea" />
        <CompactInput label="Peso ao Nascer" fieldKey="birthWeight" value={data.birthWeight} onChange={update} readOnly={readOnly} placeholder="3200" unit="g" />
        <CompactInput label="Comprimento" fieldKey="birthLength" value={data.birthLength} onChange={update} readOnly={readOnly} placeholder="49" unit="cm" />
        <CompactInput label="Perímetro Cefálico" fieldKey="birthHeadCircumference" value={data.birthHeadCircumference} onChange={update} readOnly={readOnly} placeholder="34.5" unit="cm" />
        <CompactInput label="Apgar (1º e 5º min)" fieldKey="apgar" value={data.apgar} onChange={update} readOnly={readOnly} placeholder="9/10" />
      </div>
    </SectionCard>

    {/* Marcos do DNPM */}
    <SectionCard title="Marcos do Desenvolvimento Neuropsicomotor (DNPM)">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <CompactInput label="Desenvolvimento Motor" fieldKey="motorDevelopment" value={data.motorDevelopment} onChange={update} readOnly={readOnly} placeholder="Sustentação cefálica, sentar sem apoio..." />
        <CompactInput label="Linguagem & Comunicação" fieldKey="languageDevelopment" value={data.languageDevelopment} onChange={update} readOnly={readOnly} placeholder="Balbucio, primeiras palavras, frases..." />
        <CompactInput label="Social & Adaptativo" fieldKey="socialDevelopment" value={data.socialDevelopment} onChange={update} readOnly={readOnly} placeholder="Sorriso social, contato visual..." />
        <CompactInput label="Cognitivo & Lúdico" fieldKey="cognitiveDevelopment" value={data.cognitiveDevelopment} onChange={update} readOnly={readOnly} placeholder="Atenção compartilhada, exploração..." />
      </div>
    </SectionCard>

    {/* Alimentação e Vacinas */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SectionCard title="Alimentação & Nutrição Infantil">
        <div className="space-y-3">
          <CompactInput label="Aleitamento Materno" fieldKey="breastfeeding" value={data.breastfeeding} onChange={update} readOnly={readOnly} placeholder="Exclusivo, misto, fórmula..." />
          <CompactInput label="Introdução Alimentar" fieldKey="foodIntroduction" value={data.foodIntroduction} onChange={update} readOnly={readOnly} placeholder="Iniciada aos 6 meses, boa aceitação..." />
          <CompactInput label="Dieta Atual & Rotina" fieldKey="currentDiet" value={data.currentDiet} onChange={update} readOnly={readOnly} placeholder="Frutas, legumes, proteínas, hidratação..." />
        </div>
      </SectionCard>

      <SectionCard title="Calendário Vacinal & Imunização">
        <div className="space-y-3">
          <CompactInput label="Situação Vacinal" fieldKey="vaccinationStatus" value={data.vaccinationStatus} onChange={update} readOnly={readOnly} placeholder="Em dia conforme PNI..." />
          <CompactTextArea label="Observações de Vacinas / Próximas Doses" fieldKey="vaccinationNotes" value={data.vaccinationNotes} onChange={update} readOnly={readOnly} rows={3} placeholder="Campanhas, atrasos ou vacinas especiais..." />
        </div>
      </SectionCard>
    </div>
  </div>
);

// 8. GERIATRIA
export const GeriatricsRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => (
  <div className="space-y-4">
    <SectionCard title="Avaliação Geriátrica Ampla (AGA)" icon={<Shield className="w-4 h-4" />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <CompactInput label="Funcionalidade (AVD / AIVD)" fieldKey="functionality" value={data.functionality} onChange={update} readOnly={readOnly} placeholder="Independente, dependência parcial..." />
        <CompactInput label="Cognição (MEEM / MoCA)" fieldKey="cognition" value={data.cognition} onChange={update} readOnly={readOnly} placeholder="Preservada, declínio cognitivo leve..." />
        <CompactInput label="Humor (GDS-15)" fieldKey="mood" value={data.mood} onChange={update} readOnly={readOnly} placeholder="Sem sintomas depressivos..." />
        <CompactInput label="Nutrição (MAN / Perda Ponderal)" fieldKey="nutrition" value={data.nutrition} onChange={update} readOnly={readOnly} placeholder="Eutrófico, risco nutricional..." />
        <CompactInput label="Risco de Quedas (Timed Up & Go)" fieldKey="fallRisk" value={data.fallRisk} onChange={update} readOnly={readOnly} placeholder="Baixo risco / Histórico de quedas..." />
        <CompactInput label="Continência Urinária & Fecal" fieldKey="continence" value={data.continence} onChange={update} readOnly={readOnly} placeholder="Continente / Incontinência de urgência..." />
        <CompactInput label="Acuidade Visual" fieldKey="vision" value={data.vision} onChange={update} readOnly={readOnly} placeholder="Preservada com óculos..." />
        <CompactInput label="Acuidade Auditiva" fieldKey="hearing" value={data.hearing} onChange={update} readOnly={readOnly} placeholder="Sem queixas / Presbiacusia..." />
        <CompactInput label="Suporte Social & Cuidador" fieldKey="socialSupport" value={data.socialSupport} onChange={update} readOnly={readOnly} placeholder="Mora com familiares, cuidador ativo..." />
      </div>
    </SectionCard>

    <SectionCard title="Polifarmácia & Desprescrição (Critérios de Beers / STOPP-START)">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <CompactInput label="Total de Medicamentos" fieldKey="medicationCount" value={data.medicationCount} onChange={update} readOnly={readOnly} placeholder="Ex: 5 fármacos" />
        <CompactInput label="Medicamentos em Uso Contínuo" fieldKey="polypharmacy" value={data.polypharmacy} onChange={update} readOnly={readOnly} placeholder="Anti-hipertensivos, estatinas..." className="sm:col-span-2" />
        <CompactInput label="Duplicidades / Potencial Inapropriado" fieldKey="duplicates" value={data.duplicates} onChange={update} readOnly={readOnly} placeholder="Sem duplicidades identificadas..." />
        <CompactTextArea label="Observações de Conciliação Medicamentosa" fieldKey="medicationNotes" value={data.medicationNotes} onChange={update} readOnly={readOnly} className="sm:col-span-2 lg:col-span-4" />
      </div>
    </SectionCard>
  </div>
);

// 9. ENDOCRINOLOGIA E METABOLOGIA
export const EndocrinologyRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => (
  <div className="space-y-4">
    {/* Diabetes e Controle Glicêmico */}
    <SectionCard title="Diabetes Mellitus & Controle Glicêmico" icon={<Scale className="w-4 h-4" />}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <CompactInput label="Glicemia Casual" fieldKey="glucose" value={data.glucose} onChange={update} readOnly={readOnly} placeholder="110" unit="mg/dL" />
        <CompactInput label="Glicemia de Jejum" fieldKey="fastingGlucose" value={data.fastingGlucose} onChange={update} readOnly={readOnly} placeholder="98" unit="mg/dL" />
        <CompactInput label="HbA1c Recente" fieldKey="hba1c" value={data.hba1c} onChange={update} readOnly={readOnly} placeholder="6.5" unit="%" />
        <CompactInput label="Esquema Terapêutico" fieldKey="diabetesTreatment" value={data.diabetesTreatment} onChange={update} readOnly={readOnly} placeholder="Metformina 850mg 2x..." />
        <CompactInput label="Uso de Insulina" fieldKey="insulin" value={data.insulin} onChange={update} readOnly={readOnly} placeholder="NPH, Glargina, doses..." />
        <CompactInput label="Hipoglicemias" fieldKey="hypoglycemia" value={data.hypoglycemia} onChange={update} readOnly={readOnly} placeholder="Sem episódios / Frequência..." />
      </div>
    </SectionCard>

    {/* Tireoide e Osteometabolismo */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SectionCard title="Avaliação da Tireoide">
        <div className="grid grid-cols-2 gap-3">
          <CompactInput label="TSH Basal" fieldKey="tsh" value={data.tsh} onChange={update} readOnly={readOnly} placeholder="2.1" unit="mUI/L" />
          <CompactInput label="T4 Livre" fieldKey="t4" value={data.t4} onChange={update} readOnly={readOnly} placeholder="1.2" unit="ng/dL" />
          <CompactInput label="Palpação da Tireoide" fieldKey="thyroidPalpation" value={data.thyroidPalpation} onChange={update} readOnly={readOnly} placeholder="Normotrófica, indolor..." className="col-span-2" />
          <CompactInput label="Nódulos / Negação" fieldKey="nodules" value={data.nodules} onChange={update} readOnly={readOnly} placeholder="Sem nódulos palpáveis..." />
          <CompactInput label="Ultrassonografia" fieldKey="thyroidUltrasound" value={data.thyroidUltrasound} onChange={update} readOnly={readOnly} placeholder="ACR TI-RADS..." />
        </div>
      </SectionCard>

      <SectionCard title="Metabolismo Ósseo & Osteoporose">
        <div className="grid grid-cols-2 gap-3">
          <CompactInput label="Cálcio Sérico" fieldKey="calcium" value={data.calcium} onChange={update} readOnly={readOnly} placeholder="9.4" unit="mg/dL" />
          <CompactInput label="Vitamina D (25-OH-D)" fieldKey="vitaminD" value={data.vitaminD} onChange={update} readOnly={readOnly} placeholder="32" unit="ng/mL" />
          <CompactInput label="Densitometria Óssea" fieldKey="densitometry" value={data.densitometry} onChange={update} readOnly={readOnly} placeholder="T-score coluna L1-L4..." />
          <CompactInput label="Histórico de Fraturas" fieldKey="fractures" value={data.fractures} onChange={update} readOnly={readOnly} placeholder="Sem fraturas prévias por fragilidade..." />
        </div>
      </SectionCard>
    </div>
  </div>
);

// 10. REUMATOLOGIA
export const RheumatologyRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => (
  <div className="space-y-4">
    <SectionCard title="Avaliação Articular & Sinovite" icon={<Activity className="w-4 h-4" />}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CompactInput label="Articulações Dolorosas" fieldKey="tenderJointCount" value={data.tenderJointCount} onChange={update} readOnly={readOnly} placeholder="0 de 28" />
        <CompactInput label="Articulações Edemaciadas (Sinovite)" fieldKey="swollenJointCount" value={data.swollenJointCount} onChange={update} readOnly={readOnly} placeholder="0 de 28" />
        <CompactInput label="Rigidez Articular" fieldKey="jointStiffness" value={data.jointStiffness} onChange={update} readOnly={readOnly} placeholder="Ausente, IFPs, punhos..." />
        <CompactInput label="Limitação Funcional" fieldKey="functionalLimitation" value={data.functionalLimitation} onChange={update} readOnly={readOnly} placeholder="Mínima, preservada..." />
      </div>
    </SectionCard>

    <SectionCard title="Sintomas Sistêmicos & Atividade de Doença">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <CompactInput label="Rigidez Matinal" fieldKey="morningStiffnessMinutes" value={data.morningStiffnessMinutes} onChange={update} readOnly={readOnly} placeholder="15" unit="minutos" />
        <CompactInput label="Fadiga Referida" fieldKey="fatigue" value={data.fatigue} onChange={update} readOnly={readOnly} placeholder="Ausente, leve, incapacitante..." />
        <CompactInput label="Dor Difusa / Tender Points" fieldKey="diffusePain" value={data.diffusePain} onChange={update} readOnly={readOnly} placeholder="Sem dor generalizada..." />
        <CompactInput label="Manifestações Sistêmicas" fieldKey="systemicManifestations" value={data.systemicManifestations} onChange={update} readOnly={readOnly} placeholder="Olho seco, aftas, fenômeno de Raynaud..." />
      </div>
    </SectionCard>
  </div>
);

// 11. GINECOLOGIA E OBSTETRÍCIA
export const GynecologyRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => (
  <div className="space-y-4">
    {/* História Menstrual e Ginecológica */}
    <SectionCard title="História Ginecológica & Ciclo Menstrual" icon={<Heart className="w-4 h-4" />}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <CompactInput label="Menarca" fieldKey="menarche" value={data.menarche} onChange={update} readOnly={readOnly} placeholder="12 anos" />
        <CompactInput label="DUM (Última Menstruação)" fieldKey="lmpDate" value={data.lmpDate} onChange={update} readOnly={readOnly} placeholder="DD/MM/AAAA" />
        <CompactInput label="Ciclo Menstrual" fieldKey="cycle" value={data.cycle} onChange={update} readOnly={readOnly} placeholder="28 dias" />
        <CompactInput label="Regularidade" fieldKey="regularity" value={data.regularity} onChange={update} readOnly={readOnly} placeholder="Regular / Irregular" />
        <CompactInput label="Duração do Fluxo" fieldKey="duration" value={data.duration} onChange={update} readOnly={readOnly} placeholder="4-5 dias" />
        <CompactInput label="Volume do Fluxo" fieldKey="flow" value={data.flow} onChange={update} readOnly={readOnly} placeholder="Moderado" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
        <CompactInput label="Sintomas Catameniais / Dismenorreia" fieldKey="symptoms" value={data.symptoms} onChange={update} readOnly={readOnly} placeholder="Cólica leve no 1º dia..." />
        <CompactInput label="Método Contraceptivo" fieldKey="contraception" value={data.contraception} onChange={update} readOnly={readOnly} placeholder="DIU cobre, ACO, preservativo..." />
        <CompactInput label="Rastreamento Preventivo (Papanicolau/Mamografia)" fieldKey="preventiveStatus" value={data.preventiveStatus} onChange={update} readOnly={readOnly} placeholder="Em dia (coleta há 6 meses)..." />
        <CompactInput label="Histórico de ISTs" fieldKey="sti" value={data.sti} onChange={update} readOnly={readOnly} placeholder="Nega episódios prévios..." />
        <CompactInput label="Cirurgias Ginecológicas Prévias" fieldKey="surgeries" value={data.surgeries} onChange={update} readOnly={readOnly} placeholder="Nega / Cesariana prévia..." />
        <CompactInput label="Histórico Ginecológico Complementar" fieldKey="gynecoHistory" value={data.gynecoHistory} onChange={update} readOnly={readOnly} placeholder="SOP, miomatose, endometriose..." />
      </div>
    </SectionCard>

    {/* Exame Físico Ginecológico */}
    <SectionCard title="Exame Físico Ginecológico">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <CompactInput label="Mamas" fieldKey="breastExam" value={data.breastExam} onChange={update} readOnly={readOnly} placeholder="Simétricas, sem nódulos..." />
        <CompactInput label="Vulva" fieldKey="vulva" value={data.vulva} onChange={update} readOnly={readOnly} placeholder="Sem lesões ativas..." />
        <CompactInput label="Vagina" fieldKey="vagina" value={data.vagina} onChange={update} readOnly={readOnly} placeholder="Mucosa trófica, sem leucorreia..." />
        <CompactInput label="Colo Uterino" fieldKey="cervixExam" value={data.cervixExam} onChange={update} readOnly={readOnly} placeholder="Sem lesões macroscópicas..." />
        <CompactInput label="Útero" fieldKey="uterus" value={data.uterus} onChange={update} readOnly={readOnly} placeholder="Tamanho e consistência normais..." />
        <CompactInput label="Anexos" fieldKey="adnexa" value={data.adnexa} onChange={update} readOnly={readOnly} placeholder="Livres e indolores..." />
      </div>
    </SectionCard>

    {/* Pré-Natal e Obstetrícia */}
    <SectionCard title="Acompanhamento Obstétrico & Pré-Natal">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <CompactInput label="Gesta (G)" fieldKey="gravidity" value={data.gravidity} onChange={update} readOnly={readOnly} placeholder="G1" />
        <CompactInput label="Para (P)" fieldKey="parity" value={data.parity} onChange={update} readOnly={readOnly} placeholder="P0" />
        <CompactInput label="Abortos (A)" fieldKey="abortions" value={data.abortions} onChange={update} readOnly={readOnly} placeholder="A0" />
        <CompactInput label="Cesáreas" fieldKey="cesareans" value={data.cesareans} onChange={update} readOnly={readOnly} placeholder="0" />
        <CompactInput label="Data Provável do Parto (DPP)" fieldKey="dueDate" value={data.dueDate} onChange={update} readOnly={readOnly} placeholder="DD/MM/AAAA" />
        <CompactInput label="Idade Gestacional" fieldKey="gestationalAge" value={data.gestationalAge} onChange={update} readOnly={readOnly} placeholder="28 sem 3 dias" />
        <CompactInput label="Altura Uterina" fieldKey="fundalHeight" value={data.fundalHeight} onChange={update} readOnly={readOnly} placeholder="27" unit="cm" />
        <CompactInput label="BCF (Batimentos Fetais)" fieldKey="fetalHeartRate" value={data.fetalHeartRate} onChange={update} readOnly={readOnly} placeholder="144" unit="bpm" />
        <CompactInput label="Movimentos Fetais" fieldKey="fetalMovement" value={data.fetalMovement} onChange={update} readOnly={readOnly} placeholder="Presentes e ativos..." />
        <CompactInput label="Edema Gestacional" fieldKey="edema" value={data.edema} onChange={update} readOnly={readOnly} placeholder="Ausente / Maleolar..." />
        <CompactInput label="Intercorrências Gestacionais" fieldKey="complications" value={data.complications} onChange={update} readOnly={readOnly} placeholder="Pré-eclâmpsia, DMG negados..." className="sm:col-span-2" />
      </div>
    </SectionCard>
  </div>
);

// 12. GASTROENTEROLOGIA
export const GastroenterologyRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => (
  <div className="space-y-4">
    {/* Sintomas Digestivos */}
    <SectionCard title="Sintomatologia Digestiva & Trato Gastrointestinal" icon={<Stethoscope className="w-4 h-4" />}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <CompactInput label="Dor Abdominal" fieldKey="abdominalPain" value={data.abdominalPain} onChange={update} readOnly={readOnly} placeholder="Epigástrica, cólica, em pontada..." />
        <CompactInput label="Pirose (Azia)" fieldKey="heartburn" value={data.heartburn} onChange={update} readOnly={readOnly} placeholder="Retroesternal, pós-prandial..." />
        <CompactInput label="Refluxo / Regurgitação" fieldKey="reflux" value={data.reflux} onChange={update} readOnly={readOnly} placeholder="Ácido, alimentar..." />
        <CompactInput label="Regurgitação Específica" fieldKey="regurgitation" value={data.regurgitation} onChange={update} readOnly={readOnly} placeholder="Frequência e episódios..." />
        <CompactInput label="Náuseas" fieldKey="nausea" value={data.nausea} onChange={update} readOnly={readOnly} placeholder="Ausentes, matinais..." />
        <CompactInput label="Vômitos" fieldKey="vomiting" value={data.vomiting} onChange={update} readOnly={readOnly} placeholder="Sem episódios..." />
        <CompactInput label="Disfagia (Dificuldade de Deglutição)" fieldKey="dysphagia" value={data.dysphagia} onChange={update} readOnly={readOnly} placeholder="Para sólidos, líquidos..." />
        <CompactInput label="Odinofagia (Dor ao Deglutir)" fieldKey="odynophagia" value={data.odynophagia} onChange={update} readOnly={readOnly} placeholder="Ausente..." />
        <CompactInput label="Distensão Abdominal / Empachamento" fieldKey="distension" value={data.distension} onChange={update} readOnly={readOnly} placeholder="Pós-prandial, flatulência..." />
        <CompactInput label="Constipação Intestinal" fieldKey="constipation" value={data.constipation} onChange={update} readOnly={readOnly} placeholder="Dificuldade evacuatória..." />
        <CompactInput label="Diarreia" fieldKey="diarrhea" value={data.diarrhea} onChange={update} readOnly={readOnly} placeholder="Fezes líquidas, episódios..." />
        <CompactInput label="Sangramento Digestivo" fieldKey="bleeding" value={data.bleeding} onChange={update} readOnly={readOnly} placeholder="Hematêmese, melena, enterorragia..." />
        <CompactInput label="Perda Ponderal Involuntária" fieldKey="weightLoss" value={data.weightLoss} onChange={update} readOnly={readOnly} placeholder="Peso estável / Perda de kg em meses..." className="sm:col-span-2 lg:col-span-4" />
      </div>
    </SectionCard>

    {/* Hábito Intestinal e Bristol */}
    <SectionCard title="Hábito Intestinal & Escala de Bristol">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CompactInput label="Frequência Evacuatória" fieldKey="bowelFrequency" value={data.bowelFrequency} onChange={update} readOnly={readOnly} placeholder="1x ao dia, dia sim dia não..." />
        <CompactInput label="Escala de Bristol (Formato das Fezes)" fieldKey="bristolScale" value={data.bristolScale} onChange={update} readOnly={readOnly} placeholder="Tipo 3 ou 4 (normais e moldadas)..." />
      </div>
    </SectionCard>

    {/* Exame Físico Abdominal */}
    <SectionCard title="Exame Físico do Abdome">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <CompactInput label="Inspeção Abdominal" fieldKey="inspection" value={data.inspection} onChange={update} readOnly={readOnly} placeholder="Plano, simétrico, sem cicatrizes cirúrgicas..." />
        <CompactInput label="Ausculta (Ruídos Hidroaéreos)" fieldKey="auscultation" value={data.auscultation} onChange={update} readOnly={readOnly} placeholder="RHA presentes e normoativos nos 4Q..." />
        <CompactInput label="Percussão" fieldKey="percussion" value={data.percussion} onChange={update} readOnly={readOnly} placeholder="Timpanismo fisiológico, espaço de Traube livre..." />
        <CompactInput label="Palpação Superficial" fieldKey="superficialPalpation" value={data.superficialPalpation} onChange={update} readOnly={readOnly} placeholder="Abdome flácido, indolor, sem defesa muscular..." />
        <CompactInput label="Palpação Profunda" fieldKey="deepPalpation" value={data.deepPalpation} onChange={update} readOnly={readOnly} placeholder="Sem massas ou descompressão dolorosa..." />
        <CompactInput label="Visceromegalias (Fígado / Baço)" fieldKey="organomegaly" value={data.organomegaly} onChange={update} readOnly={readOnly} placeholder="Fígado e baço não palpáveis..." />
        <CompactInput label="Dor Localizada & Sinais Específicos" fieldKey="localizedPain" value={data.localizedPain} onChange={update} readOnly={readOnly} placeholder="Blumberg, Murphy e Rovsing negativos..." className="sm:col-span-2" />
      </div>
    </SectionCard>
  </div>
);

// 13. OTORRINOLARINGOLOGIA
export const OtolaryngologyRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => {
  const otoRows: ComparativeRow[] = [
    { label: 'Otoscopia & Conduto Auditivo', odKey: 'otoscopyOD', oeKey: 'otoscopyOE', placeholder: 'Conduto pérvio e limpo' },
    { label: 'Membrana Timpânica', odKey: 'tympanumOD', oeKey: 'tympanumOE', placeholder: 'Translúcida, triângulo visível' },
    { label: 'Secreção / Otorreia', odKey: 'dischargeOD', oeKey: 'dischargeOE', placeholder: 'Ausente' },
    { label: 'Cerume', odKey: 'waxOD', oeKey: 'waxOE', placeholder: 'Ausente ou fisiológico' },
    { label: 'Otalgia / Dor à Tração', odKey: 'painOD', oeKey: 'painOE', placeholder: 'Indolor à palpação do trago' }
  ];

  return (
    <div className="space-y-4">
      {/* Otologia Comparativa */}
      <ComparativeSideTable
        title="Otoscopia & Avaliação Otológica Comparativa (OD / OE)"
        rows={otoRows}
        data={data}
        onChange={update}
        readOnly={readOnly}
      />

      {/* Rinologia / Nariz */}
      <SectionCard title="Rinologia & Fossa Nasal" icon={<Headphones className="w-4 h-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <CompactInput label="Septo Nasal" fieldKey="septum" value={data.septum} onChange={update} readOnly={readOnly} placeholder="Centrado / Desvio leve..." />
          <CompactInput label="Mucosa Nasal" fieldKey="mucosa" value={data.mucosa} onChange={update} readOnly={readOnly} placeholder="Corada, hidratada..." />
          <CompactInput label="Cornetos / Conchas" fieldKey="turbinates" value={data.turbinates} onChange={update} readOnly={readOnly} placeholder="Normotróficos..." />
          <CompactInput label="Secreção Nasal" fieldKey="secretion" value={data.secretion} onChange={update} readOnly={readOnly} placeholder="Ausente, hialina..." />
          <CompactInput label="Obstrução Respiratória" fieldKey="obstruction" value={data.obstruction} onChange={update} readOnly={readOnly} placeholder="Nega obstrução..." />
        </div>
      </SectionCard>

      {/* Orofaringe, Laringe e Voz */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title="Orofaringe & Cavidade Oral">
          <div className="grid grid-cols-2 gap-3">
            <CompactInput label="Mucosa Oral" fieldKey="oralMucosa" value={data.oralMucosa} onChange={update} readOnly={readOnly} placeholder="Íntegra, sem lesões..." />
            <CompactInput label="Amígdalas (Tonsilas)" fieldKey="tonsils" value={data.tonsils} onChange={update} readOnly={readOnly} placeholder="Grau I, sem exsudato..." />
            <CompactInput label="Palato" fieldKey="palate" value={data.palate} onChange={update} readOnly={readOnly} placeholder="Móvel e simétrico..." />
            <CompactInput label="Parede Posterior" fieldKey="oropharynx" value={data.oropharynx} onChange={update} readOnly={readOnly} placeholder="Sem gotejamento posterior..." />
          </div>
        </SectionCard>

        <SectionCard title="Laringe & Queixa Vocal">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CompactInput label="Queixa Vocal" fieldKey="voiceComplaint" value={data.voiceComplaint} onChange={update} readOnly={readOnly} placeholder="Voz sem queixas / Rouquidão..." />
            <CompactInput label="Exames de Laringoscopia" fieldKey="voiceExams" value={data.voiceExams} onChange={update} readOnly={readOnly} placeholder="Pregas vocais móveis e simétricas..." />
            <CompactTextArea label="Observações de Voz & Laringe" fieldKey="voiceNotes" value={data.voiceNotes} onChange={update} readOnly={readOnly} className="sm:col-span-2" />
          </div>
        </SectionCard>
      </div>

      {/* Vertigem e Equilíbrio */}
      <SectionCard title="Avaliação de Vertigem & Equilíbrio">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CompactInput label="Sintomas Vertiginosos" fieldKey="vertigoSymptoms" value={data.vertigoSymptoms} onChange={update} readOnly={readOnly} placeholder="Vertigem rotatória, desequilíbrio..." />
          <CompactInput label="Duração das Crises" fieldKey="vertigoDuration" value={data.vertigoDuration} onChange={update} readOnly={readOnly} placeholder="Segundos, minutos, horas..." />
          <CompactInput label="Fatores Desencadeantes" fieldKey="triggers" value={data.triggers} onChange={update} readOnly={readOnly} placeholder="Mudança de decúbito, movimentos rápidos..." />
          <CompactInput label="Sintomas Associados" fieldKey="associatedSymptoms" value={data.associatedSymptoms} onChange={update} readOnly={readOnly} placeholder="Zumbido, plenitude auricular, náusea..." />
        </div>
      </SectionCard>
    </div>
  );
};

// 14. UROLOGIA
export const UrologyRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => (
  <div className="space-y-4">
    {/* Sintomas Urinários LUTS */}
    <SectionCard title="Sintomas Urinários do Trato Inferior (LUTS / IPSS)" icon={<ShieldCheck className="w-4 h-4" />}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <CompactInput label="Frequência Urinária Diurna" fieldKey="frequency" value={data.frequency} onChange={update} readOnly={readOnly} placeholder="Fisiológica (4-6x)..." />
        <CompactInput label="Urgência Miccional" fieldKey="urgency" value={data.urgency} onChange={update} readOnly={readOnly} placeholder="Ausente..." />
        <CompactInput label="Noctúria" fieldKey="nocturia" value={data.nocturia} onChange={update} readOnly={readOnly} placeholder="0 a 1x..." />
        <CompactInput label="Disúria (Ardência)" fieldKey="dysuria" value={data.dysuria} onChange={update} readOnly={readOnly} placeholder="Ausente..." />
        <CompactInput label="Hesitação Miccional" fieldKey="hesitation" value={data.hesitation} onChange={update} readOnly={readOnly} placeholder="Sem retardo miccional..." />
        <CompactInput label="Calibre do Jato Urinário" fieldKey="urinaryFlow" value={data.urinaryFlow} onChange={update} readOnly={readOnly} placeholder="Forte, contínuo..." />
        <CompactInput label="Esforço Miccional" fieldKey="straining" value={data.straining} onChange={update} readOnly={readOnly} placeholder="Sem esforço..." />
        <CompactInput label="Esvaziamento Incompleto" fieldKey="incompleteEmptying" value={data.incompleteEmptying} onChange={update} readOnly={readOnly} placeholder="Nega sensação de resíduo..." />
        <CompactInput label="Hematúria" fieldKey="hematuria" value={data.hematuria} onChange={update} readOnly={readOnly} placeholder="Nega sangramento..." />
        <CompactInput label="Incontinência Urinária" fieldKey="incontinence" value={data.incontinence} onChange={update} readOnly={readOnly} placeholder="Continente / Perdas aos esforços..." />
      </div>
    </SectionCard>

    {/* Próstata, Litíase e Saúde do Homem */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <SectionCard title="Avaliação Prostática">
        <div className="space-y-3">
          <CompactInput label="PSA Total / Livre" fieldKey="psa" value={data.psa} onChange={update} readOnly={readOnly} placeholder="1.2 ng/mL..." />
          <CompactInput label="Exame Físico (Toque Retal)" fieldKey="prostateExam" value={data.prostateExam} onChange={update} readOnly={readOnly} placeholder="Lisa, fibroelástica, sem nódulos..." />
          <CompactInput label="Volume Prostático (g / cm³)" fieldKey="prostateVolume" value={data.prostateVolume} onChange={update} readOnly={readOnly} placeholder="25 g" />
          <CompactTextArea label="Observações Prostáticas" fieldKey="prostateNotes" value={data.prostateNotes} onChange={update} readOnly={readOnly} rows={2} />
        </div>
      </SectionCard>

      <SectionCard title="Litíase Urinária">
        <div className="space-y-3">
          <CompactInput label="Localização do Cálculo" fieldKey="stoneLocation" value={data.stoneLocation} onChange={update} readOnly={readOnly} placeholder="Pélvis renal, ureter..." />
          <CompactInput label="Lateralidade" fieldKey="stoneSide" value={data.stoneSide} onChange={update} readOnly={readOnly} placeholder="Direito, esquerdo, bilateral..." />
          <CompactInput label="Histórico de Cólicas" fieldKey="stoneHistory" value={data.stoneHistory} onChange={update} readOnly={readOnly} placeholder="Episódio há 1 ano..." />
          <CompactInput label="Recorrência Litiásica" fieldKey="recurrence" value={data.recurrence} onChange={update} readOnly={readOnly} placeholder="Primeiro episódio / Recorrente..." />
        </div>
      </SectionCard>

      <SectionCard title="Saúde do Homem & Andrologia">
        <div className="space-y-3">
          <CompactInput label="Função Sexual (IIEF-5)" fieldKey="sexualFunction" value={data.sexualFunction} onChange={update} readOnly={readOnly} placeholder="Sem queixas eréteis..." />
          <CompactInput label="Histórico Andrológico" fieldKey="andrologicalHistory" value={data.andrologicalHistory} onChange={update} readOnly={readOnly} placeholder="Fertilidade, varicocele..." />
          <CompactTextArea label="Observações Andrológicas" fieldKey="andrologicalNotes" value={data.andrologicalNotes} onChange={update} readOnly={readOnly} rows={3} />
        </div>
      </SectionCard>
    </div>
  </div>
);

// 15. CLÍNICA MÉDICA
export const InternalMedicineRenderer: React.FC<SpecialtyRendererProps> = ({ data, update, readOnly }) => (
  <div className="space-y-4">
    {/* Revisão por Sistemas */}
    <SectionCard title="Revisão Sistemática por Aparelhos e Sistemas (ROS)" icon={<Stethoscope className="w-4 h-4" />}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <CompactInput label="Geral / Constitucional" fieldKey="constitutional" value={data.constitutional} onChange={update} readOnly={readOnly} placeholder="Sem febre, astenia ou perda ponderal..." />
        <CompactInput label="Cardiovascular" fieldKey="cardiovascular" value={data.cardiovascular} onChange={update} readOnly={readOnly} placeholder="Sem dor precordial ou palpitações..." />
        <CompactInput label="Respiratório" fieldKey="respiratory" value={data.respiratory} onChange={update} readOnly={readOnly} placeholder="Sem tosse, expectoração ou dispneia..." />
        <CompactInput label="Gastrointestinal" fieldKey="gastrointestinal" value={data.gastrointestinal} onChange={update} readOnly={readOnly} placeholder="Hábito intestinal preservado, sem náuseas..." />
        <CompactInput label="Geniturinário" fieldKey="genitourinary" value={data.genitourinary} onChange={update} readOnly={readOnly} placeholder="Diurese espontânea e clara, sem disúria..." />
        <CompactInput label="Neurológico" fieldKey="neurological" value={data.neurological} onChange={update} readOnly={readOnly} placeholder="Sem queixas de cefaleia ou tontura..." />
        <CompactInput label="Musculoesquelético" fieldKey="musculoskeletal" value={data.musculoskeletal} onChange={update} readOnly={readOnly} placeholder="Sem queixas articulares ou mialgias..." />
        <CompactInput label="Dermatológico" fieldKey="dermatological" value={data.dermatological} onChange={update} readOnly={readOnly} placeholder="Pele íntegra, sem prurido ou erupções..." />
        <CompactInput label="Endocrinológico" fieldKey="endocrine" value={data.endocrine} onChange={update} readOnly={readOnly} placeholder="Sem queixas de poliúria ou polidipsia..." />
      </div>
    </SectionCard>

    {/* Condições Crônicas */}
    <SectionCard title="Acompanhamento de Condições Crônicas">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <CompactInput label="Hipertensão Arterial Sistêmica (HAS)" fieldKey="hypertension" value={data.hypertension} onChange={update} readOnly={readOnly} placeholder="Controlada, metas atingidas..." />
        <CompactInput label="Diabetes Mellitus (DM)" fieldKey="diabetes" value={data.diabetes} onChange={update} readOnly={readOnly} placeholder="Bom controle glicêmico..." />
        <CompactInput label="Dislipidemia" fieldKey="dyslipidemia" value={data.dyslipidemia} onChange={update} readOnly={readOnly} placeholder="Controle lipídico com estatina..." />
        <CompactInput label="Obesidade & Manejo do Peso" fieldKey="obesity" value={data.obesity} onChange={update} readOnly={readOnly} placeholder="IMC estável, plano alimentar..." />
        <CompactInput label="Doença Renal Crônica (DRC)" fieldKey="kidneyDisease" value={data.kidneyDisease} onChange={update} readOnly={readOnly} placeholder="Taxa de filtração glomerular estável..." />
        <CompactInput label="Tabagismo & Hábitos" fieldKey="smoking" value={data.smoking} onChange={update} readOnly={readOnly} placeholder="Não fumante / Em cessação..." />
        <CompactTextArea label="Outras Condições Crônicas" fieldKey="otherConditions" value={data.otherConditions} onChange={update} readOnly={readOnly} className="sm:col-span-2 lg:col-span-3" />
      </div>
    </SectionCard>

    {/* Acompanhamento Clínico */}
    <SectionCard title="Acompanhamento Clínico & Estratificação de Risco">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <CompactInput label="Medicina Preventiva & Rastreio" fieldKey="prevention" value={data.prevention} onChange={update} readOnly={readOnly} placeholder="Exames de rastreio em dia..." />
        <CompactInput label="Risco Cirúrgico Pré-Operatório" fieldKey="surgicalRisk" value={data.surgicalRisk} onChange={update} readOnly={readOnly} placeholder="ASA 1 ou 2, risco cardiovascular baixo..." />
        <CompactInput label="Investigação Diagnóstica em Curso" fieldKey="investigation" value={data.investigation} onChange={update} readOnly={readOnly} placeholder="Solicitados exames complementares..." />
        <CompactInput label="Cuidados Paliativos & Metas" fieldKey="palliativeCare" value={data.palliativeCare} onChange={update} readOnly={readOnly} placeholder="Conforto, alívio de sintomas..." />
      </div>
    </SectionCard>
  </div>
);
