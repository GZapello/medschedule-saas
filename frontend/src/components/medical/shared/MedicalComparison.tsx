import React, { useState } from 'react';
import { EvolutionComparisonModal, ComparisonItem } from '../../common/EvolutionComparisonModal';
import { MedicalConsultation } from '../../../types/capabilities';
import { specialtyNoteKeys, specialtySections } from '../specialties/specialtySections';
import { medicalComparisonValues } from './medicalComparisonValues';

export const MedicalComparison: React.FC<{ history: MedicalConsultation[]; specialty: string }> = ({ history, specialty }) => {
  const [open, setOpen] = useState(false);
  const key = specialtyNoteKeys[specialty];
  const records = history.filter(row => specialtyNoteKeys[row.specialty_preset] === key).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  if (records.length < 2) return null;
  const initial = records[0], previous = records[records.length - 2], current = records[records.length - 1];
  const items: ComparisonItem[] = (specialtySections[specialty] || []).flatMap(section => section.fields.map(([field, label]) => ({
    id: field, category: section.title, name: label,
    initialValue: initial.specialtyNotes?.[key]?.[field], previousValue: previous.specialtyNotes?.[key]?.[field], currentValue: current.specialtyNotes?.[key]?.[field],
    status: 'not_evaluated' as const
  }))).filter(item => [item.initialValue, item.previousValue, item.currentValue].some(value => value !== undefined && value !== null && value !== ''));
  const shared = [initial, previous, current].map(record => medicalComparisonValues({
    'Avaliações compartilhadas': record.specialtyNotes?.sharedAssessments,
    'Lesões': record.specialtyNotes?.[key]?.lesions,
    'Sinais vitais': record.vitalSigns
  }));
  for (const path of new Set(shared.flatMap(values => Object.keys(values)))) {
    items.push({ id: `shared:${path}`, category: path.split(' / ')[0], name: path.split(' / ').slice(1).join(' / '),
      initialValue: shared[0][path], previousValue: shared[1][path], currentValue: shared[2][path], status: 'not_evaluated' });
  }
  return <>
    <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-teal-700">Comparar consultas da especialidade ativa</button>
    <EvolutionComparisonModal isOpen={open} onClose={() => setOpen(false)} title="Comparação clínica" subtitle="A interpretação da evolução cabe ao profissional." initialDate={new Date(initial.created_at).toLocaleDateString('pt-BR')} previousDate={new Date(previous.created_at).toLocaleDateString('pt-BR')} currentDate={new Date(current.created_at).toLocaleDateString('pt-BR')} items={items} />
  </>;
};
