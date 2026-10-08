import React, { useState } from 'react';
import { openTeleconsultation, queueReviewedEvolution } from '../../utils/teleconsultation';
import { TeleconsultationAppointment, TeleconsultationModal } from '../calendar/TeleconsultationModal';
import { TeleconsultationTranscriptModal, TranscriptionHelp } from './TeleconsultationTranscriptModal';

type Props = { appointment: TeleconsultationAppointment; onInsert?: (text: string) => void; onRequestEvolution?: () => void; onMeetingUrlSaved?: (url: string | null) => void };
export function OnlineConsultationTools(props: Props) {
  return props.appointment.modality === 'online' ? <OnlineTools key={props.appointment.id} {...props} /> : null;
}
function OnlineTools({ appointment, onInsert, onRequestEvolution, onMeetingUrlSaved }: Props) {
  const [url, setUrl] = useState(appointment.meeting_url);
  const [links, setLinks] = useState(false);
  const [transcription, setTranscription] = useState(false);
  const current = { ...appointment, meeting_url: url };
  const apply = onInsert || (onRequestEvolution ? (text: string) => { queueReviewedEvolution(appointment.id, text); onRequestEvolution(); } : undefined);
  const button = 'rounded-xl bg-white border border-indigo-100 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100';
  return <section aria-label="Teleconsulta" className="bg-indigo-50/80 border border-indigo-100 rounded-2xl p-3 sm:p-4 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-semibold text-indigo-900 mr-2">📹 Teleconsulta</h3>
      <button type="button" className={button} onClick={() => { if (!openTeleconsultation(current)) setLinks(true); }}>Abrir Google Meet</button>
      <button type="button" className={button} onClick={() => setLinks(true)}>Compartilhar link</button>
      <button type="button" className={button} onClick={() => setTranscription(true)}>Transcrição & IA</button>
      <TranscriptionHelp />
    </div>
    {links && <TeleconsultationModal allowModalityChange={false} appointment={current} onInsert={apply} onClose={() => setLinks(false)} onSaved={newUrl => { setUrl(newUrl); onMeetingUrlSaved?.(newUrl); }} />}
    {transcription && <TeleconsultationTranscriptModal appointment={current} onInsert={apply} onClose={() => setTranscription(false)} />}
  </section>;
}
