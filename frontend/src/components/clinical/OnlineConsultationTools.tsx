import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';
import { isGoogleDriveUrl, openGoogleDrive, openTeleconsultation, queueReviewedEvolution } from '../../utils/teleconsultation';
import { TeleconsultationAppointment, TeleconsultationModal } from '../calendar/TeleconsultationModal';
import { TeleconsultationTranscriptModal, TranscriptionHelp } from './TeleconsultationTranscriptModal';

type Props = {
  appointment: TeleconsultationAppointment;
  onInsert?: (text: string) => void;
  onRequestEvolution?: () => void;
  onMeetingUrlSaved?: (url: string | null) => void;
  onDriveUrlSaved?: (url: string | null) => void;
};

export function OnlineConsultationTools(props: Props) {
  return props.appointment.modality === 'online' ? <OnlineTools key={props.appointment.id} {...props} /> : null;
}

function OnlineTools({ appointment, onInsert, onRequestEvolution, onMeetingUrlSaved, onDriveUrlSaved }: Props) {
  const [url, setUrl] = useState(appointment.meeting_url || null);
  const [driveUrl, setDriveUrl] = useState(appointment.google_drive_url || null);
  const [links, setLinks] = useState<false | 'view' | 'edit'>(false);
  const [transcription, setTranscription] = useState(false);
  const [editingDrive, setEditingDrive] = useState(false);
  const [driveInput, setDriveInput] = useState(appointment.google_drive_url || '');
  const [savingDrive, setSavingDrive] = useState(false);
  const [driveError, setDriveError] = useState('');

  useEffect(() => {
    setUrl(appointment.meeting_url || null);
  }, [appointment.meeting_url]);

  useEffect(() => {
    setDriveUrl(appointment.google_drive_url || null);
    if (!editingDrive) {
      setDriveInput(appointment.google_drive_url || '');
    }
  }, [appointment.google_drive_url, editingDrive]);

  const current = { ...appointment, meeting_url: url, google_drive_url: driveUrl };
  const apply = onInsert || (onRequestEvolution ? (text: string) => { queueReviewedEvolution(appointment.id, text); onRequestEvolution(); } : undefined);
  const button = 'rounded-xl bg-white border border-indigo-100 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 cursor-pointer';
  const hasMeetUrl = Boolean(url && url.trim());
  const hasDriveUrl = Boolean(driveUrl && driveUrl.trim() && isGoogleDriveUrl(driveUrl));

  const handleSaveDrive = async () => {
    const trimmed = driveInput.trim();
    if (trimmed && !isGoogleDriveUrl(trimmed)) {
      setDriveError('Informe um link HTTPS válido do Google Drive.');
      return;
    }
    setSavingDrive(true);
    setDriveError('');
    try {
      const nextDriveUrl = trimmed || null;
      await ApiClient.put(`/v1/appointments/${appointment.id}`, { google_drive_url: nextDriveUrl });
      setDriveUrl(nextDriveUrl);
      setEditingDrive(false);
      onDriveUrlSaved?.(nextDriveUrl);
      window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
    } catch (err: any) {
      setDriveError(err.message || 'Não foi possível salvar o link do Google Drive.');
    } finally {
      setSavingDrive(false);
    }
  };

  return (
    <section aria-label="Atendimento online" className="bg-indigo-50/80 border border-indigo-100 rounded-2xl p-3 sm:p-4 text-sm space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-indigo-900 mr-2">📹 Atendimento online</h3>
        <button type="button" className={button} onClick={() => { if (!openTeleconsultation(current)) setLinks('edit'); }}>Abrir Google Meet</button>
        <button type="button" className={button} onClick={() => setLinks('edit')}>Configurar Meet</button>
        {!hasMeetUrl && !links && (
          <>
            <span className="text-xs text-amber-800">Google Meet ainda não configurado.</span>
            <button type="button" className={button} onClick={() => setLinks('edit')}>Configurar</button>
          </>
        )}
        <button type="button" className={button} onClick={() => setLinks(hasMeetUrl ? 'view' : 'edit')}>Compartilhar link</button>
        {hasDriveUrl ? (
          <>
            <button type="button" className={button} onClick={() => openGoogleDrive(driveUrl)}>📁 Abrir Google Drive</button>
            <button type="button" className={button} onClick={() => { setDriveInput(driveUrl || ''); setDriveError(''); setEditingDrive(true); }}>Editar link</button>
          </>
        ) : (
          <button type="button" className={button} onClick={() => { setDriveInput(''); setDriveError(''); setEditingDrive(true); }}>+ Adicionar link do Google Drive</button>
        )}
        <button type="button" className={button} onClick={() => setTranscription(true)}>Transcrição & IA</button>
        <TranscriptionHelp />
      </div>

      {editingDrive && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 pt-2 border-t border-indigo-100">
          <label className="flex-1 text-xs font-medium text-indigo-950">
            Link do Google Drive
            <input
              aria-label="Link do Google Drive"
              type="url"
              value={driveInput}
              onChange={e => { setDriveInput(e.target.value); setDriveError(''); }}
              placeholder="https://drive.google.com/..."
              className="block w-full mt-1 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={savingDrive}
              onClick={handleSaveDrive}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 text-xs font-semibold disabled:opacity-60 cursor-pointer"
            >
              {savingDrive ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => { setEditingDrive(false); setDriveError(''); }}
              className="rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 text-xs font-medium cursor-pointer"
            >
              Cancelar
            </button>
          </div>
          {driveError && <p className="text-xs text-rose-600 w-full">{driveError}</p>}
        </div>
      )}

      {links && <TeleconsultationModal initialEditing={links === 'edit'} allowModalityChange={false} appointment={current} onInsert={apply} onClose={() => setLinks(false)} onSaved={newUrl => { setUrl(newUrl); onMeetingUrlSaved?.(newUrl); }} />}
      {transcription && <TeleconsultationTranscriptModal appointment={current} onInsert={apply} onClose={() => setTranscription(false)} />}
    </section>
  );
}
