import { EvolutionPhotoField } from '../../common/EvolutionPhotoField';
import React from 'react';
import { ClinicalFileUploader } from '../../common/ClinicalFileUploader';
import { specialtySections } from './specialtySections';

interface Props {
  previousLesions?: Record<string, any>[];
  specialty: string;
  value: Record<string, any>;
  onChange?: (value: Record<string, any>) => void;
  patientId: string;
  appointmentId?: string;
  readOnly?: boolean;
}
const lesionFields = [['identification', 'Identificação'], ['location', 'Localização (Zemda360)'], ['type', 'Tipo'], ['size', 'Tamanho'], ['shape', 'Formato'], ['color', 'Cor'], ['borders', 'Bordas'], ['surface', 'Superfície'], ['symptoms', 'Sintomas'], ['duration', 'Tempo de evolução'], ['notes', 'Observações'], ['asymmetry', 'ABCDE — Assimetria'], ['abcdeBorders', 'ABCDE — Bordas'], ['abcdeColor', 'ABCDE — Cor'], ['diameter', 'ABCDE — Diâmetro'], ['evolution', 'ABCDE — Evolução']];
export const SpecialtySectionRenderer: React.FC<Props> = ({ previousLesions, specialty, value, onChange, patientId, appointmentId, readOnly }) => {
  const notes = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const update = (key: string, next: unknown) => onChange?.({ ...notes, [key]: next });
  const renderFields = (fields: string[][], data: Record<string, any>, change: (key: string, value: string) => void) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
      {fields.map(([key, label]) => <label key={key} className="block text-xs font-bold text-slate-700">
        {label}
        <textarea rows={2} value={typeof data[key] === 'string' || typeof data[key] === 'number' ? data[key] : ''} readOnly={readOnly}
          onChange={e => change(key, e.target.value)} className="mt-1 w-full px-3 py-2 text-xs font-normal rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none" />
      </label>)}
    </div>
  );
  const sections = specialtySections[specialty] || [];
  const known = new Set(sections.flatMap(s => s.fields.map(([key]) => key)).concat(['lesions', 'sharedRegional', 'attachments']));
  const legacy = Object.entries(notes).filter(([key, val]) => !known.has(key) && typeof val === 'string' && val);
  const lesions: Record<string, any>[] = Array.isArray(notes.lesions) ? notes.lesions.filter((l: any) => l && typeof l === 'object' && !Array.isArray(l)) : [];
  return <div className="space-y-3">
    {sections.map(s => <details key={s.title} className="rounded-xl border border-slate-200 p-3" open={readOnly || undefined}>
      <summary className="text-xs font-bold text-slate-700 cursor-pointer">{s.title}</summary>
      {renderFields(s.fields, notes, update)}
    </details>)}
    {specialty === 'dermatologia' && <div className="space-y-3">
      {!readOnly && Array.isArray(previousLesions) && previousLesions.filter(l => l && !lesions.some(current => current.id === l.id)).map((l, i) => <button key={l.id || i} type="button" className="block text-xs text-teal-700" onClick={() => update('lesions', [...lesions, { id: l.id || crypto.randomUUID(), identification: l.identification, location: l.location, photos: Array.isArray(l.photos) ? l.photos.filter((photo: any) => photo && typeof photo === 'object').map((photo: any) => ({ ...photo, isCurrentSession: false })) : [] }])}>Acompanhar lesão anterior: {l.identification || i + 1}</button>)}

      {!readOnly && <button type="button" className="text-xs font-bold text-teal-700" onClick={() => update('lesions', [...lesions, { id: crypto.randomUUID() }])}>Adicionar lesão</button>}
      {lesions.map((lesion, index) => <details key={lesion.id || index} className="rounded-xl border border-slate-200 p-3">
        <summary className="text-xs font-bold text-slate-700 cursor-pointer">Lesão {index + 1} — {lesion.identification || 'Sem identificação'}</summary>
        {renderFields(lesionFields, lesion, (key, next) => update('lesions', lesions.map((l, i) => i === index ? { ...l, [key]: next } : l)))}
        <EvolutionPhotoField patientId={patientId} appointmentId={appointmentId} category="clinical_evolution" label="Fotografias e evolução da lesão" disabled={readOnly}
          photos={Array.isArray(lesion.photos) ? lesion.photos.filter((photo: any) => photo && typeof photo === 'object') : lesion.photo ? [{ ...lesion.photo, capturedAt: lesion.photo.capturedAt || '', fileId: lesion.photo.fileId || lesion.photo.id }] : []}
          onChangePhotos={photos => update('lesions', lesions.map((l, i) => i === index ? { ...l, photos } : l))} />
        {!readOnly && <button type="button" className="text-xs text-rose-700 mt-3" onClick={() => update('lesions', lesions.filter((_, i) => i !== index))}>Remover lesão</button>}
      </details>)}
    </div>}
    {['oftalmologia', 'cardiologia', 'otorrinolaringologia'].includes(specialty) && <details className="rounded-xl border border-slate-200 p-3"><summary className="text-xs font-bold cursor-pointer">Anexos de exames</summary>
      {(Array.isArray(notes.attachments) ? notes.attachments : []).filter(Boolean).map((file: any, i: number) => <ClinicalFileUploader key={file.fileId || file.id || i} patientId={patientId} moduleType="ZemdaMed" isSealed initialFileId={file.fileId || file.id} initialFilename={file.originalFilename} initialMimeType={file.mimeType} />)}
      {!readOnly && <ClinicalFileUploader patientId={patientId} appointmentId={appointmentId} moduleType="ZemdaMed" category="exam" label="Adicionar exame recebido" onUploaded={file => update('attachments', [...(Array.isArray(notes.attachments) ? notes.attachments : []), file])} />}
    </details>}
    {!!legacy.length && <details className="rounded-xl border border-slate-200 p-3"><summary className="text-xs font-bold cursor-pointer">Anotações anteriores preservadas</summary>{renderFields(legacy.map(([key]) => [key, key]), notes, update)}</details>}
  </div>;
};
