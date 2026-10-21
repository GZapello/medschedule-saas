import React, { useEffect, useState } from 'react';
import { Video, CheckCircle2, ExternalLink, Copy, Share2, FolderOpen, Sparkles, Settings2 } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { isGoogleDriveUrl, openGoogleDrive, openTeleconsultation, queueReviewedEvolution } from '../../utils/teleconsultation';
import { TeleconsultationAppointment, TeleconsultationModal } from '../calendar/TeleconsultationModal';
import { TeleconsultationTranscriptModal, TranscriptionHelp } from './TeleconsultationTranscriptModal';
import { UniversalWhatsAppModal } from '../common/UniversalWhatsAppModal';

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
  const { showToast } = useToast();
  const [url, setUrl] = useState(appointment.meeting_url || null);
  const [driveUrl, setDriveUrl] = useState(appointment.google_drive_url || null);
  const [links, setLinks] = useState<false | 'view' | 'edit'>(false);
  const [transcription, setTranscription] = useState(false);
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
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
  const hasMeetUrl = Boolean(url && url.trim());
  const hasDriveUrl = Boolean(driveUrl && driveUrl.trim() && isGoogleDriveUrl(driveUrl));

  const dateFormatted = appointment.start_time
    ? new Date(appointment.start_time.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR')
    : '';
  const timeFormatted = appointment.start_time ? appointment.start_time.slice(11, 16) : '';

  const handleCopyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link da teleconsulta copiado.', 'success');
    } catch {
      showToast('Não foi possível copiar o link automaticamente.', 'error');
    }
  };

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

  const secondaryBtn =
    'inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer shadow-2xs';

  return (
    <section
      aria-label="Atendimento online"
      className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 text-xs space-y-2.5 shadow-2xs"
    >
      {!hasMeetUrl ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                <Video className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>Atendimento online</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                Teleconsulta ainda não configurada
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Configure a teleconsulta e compartilhe o link com o paciente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLinks('edit')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Configurar teleconsulta</span>
            </button>

            {hasDriveUrl ? (
              <button type="button" className={secondaryBtn} onClick={() => openGoogleDrive(driveUrl)}>
                <FolderOpen className="w-3.5 h-3.5 text-indigo-600" />
                <span>Google Drive</span>
              </button>
            ) : (
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => {
                  setDriveInput('');
                  setDriveError('');
                  setEditingDrive(true);
                }}
              >
                <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
                <span>Google Drive</span>
              </button>
            )}

            <button type="button" className={secondaryBtn} onClick={() => setTranscription(true)}>
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Transcrição & IA</span>
            </button>
            <TranscriptionHelp />
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 text-xs">
              <Video className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Atendimento online</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>✓ Sala configurada</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                if (!openTeleconsultation(current)) setLinks('edit');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-3.5 py-1.5 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir sala</span>
            </button>

            <button type="button" className={secondaryBtn} onClick={handleCopyLink}>
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>Copiar link</span>
            </button>

            <button type="button" className={secondaryBtn} onClick={() => setSharingWhatsapp(true)}>
              <Share2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Compartilhar</span>
            </button>

            {hasDriveUrl ? (
              <div className="inline-flex items-center gap-1">
                <button type="button" className={secondaryBtn} onClick={() => openGoogleDrive(driveUrl)}>
                  <FolderOpen className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Google Drive</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDriveInput(driveUrl || '');
                    setDriveError('');
                    setEditingDrive(true);
                  }}
                  className="px-2 py-1.5 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Editar link do Google Drive"
                >
                  Editar Drive
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => {
                  setDriveInput('');
                  setDriveError('');
                  setEditingDrive(true);
                }}
              >
                <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
                <span>Google Drive</span>
              </button>
            )}

            <button type="button" className={secondaryBtn} onClick={() => setTranscription(true)}>
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Transcrição & IA</span>
            </button>

            <TranscriptionHelp />

            <button
              type="button"
              onClick={() => setLinks('edit')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Editar link da teleconsulta"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Editar configuração</span>
            </button>
          </div>
        </div>
      )}

      {editingDrive && (
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 pt-2.5 border-t border-slate-100">
          <label className="flex-1 text-xs font-medium text-slate-700">
            Link do Google Drive
            <input
              aria-label="Link do Google Drive"
              type="url"
              value={driveInput}
              onChange={e => {
                setDriveInput(e.target.value);
                setDriveError('');
              }}
              placeholder="https://drive.google.com/..."
              className="block w-full mt-1 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={savingDrive}
              onClick={handleSaveDrive}
              className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-3.5 py-1.5 text-xs font-semibold disabled:opacity-60 cursor-pointer"
            >
              {savingDrive ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingDrive(false);
                setDriveError('');
              }}
              className="rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 text-xs font-medium cursor-pointer"
            >
              Cancelar
            </button>
          </div>
          {driveError && <p className="text-xs text-rose-600 w-full">{driveError}</p>}
        </div>
      )}

      {links && (
        <TeleconsultationModal
          initialEditing={links === 'edit'}
          allowModalityChange={false}
          appointment={current}
          onInsert={apply}
          onClose={() => setLinks(false)}
          onSaved={newUrl => {
            setUrl(newUrl);
            onMeetingUrlSaved?.(newUrl);
          }}
        />
      )}

      {transcription && (
        <TeleconsultationTranscriptModal
          appointment={current}
          onInsert={apply}
          onClose={() => setTranscription(false)}
        />
      )}

      {sharingWhatsapp && hasMeetUrl && (
        <UniversalWhatsAppModal
          isOpen
          onClose={() => setSharingWhatsapp(false)}
          title="Compartilhar teleconsulta"
          recipientName={appointment.patient_name || 'Paciente'}
          phone={appointment.patient_phone}
          defaultMessage={`Olá, ${appointment.patient_name || 'Paciente'}. Segue o link para o seu atendimento online${dateFormatted ? ` no dia ${dateFormatted}` : ''}${timeFormatted ? ` às ${timeFormatted}` : ''}:\n\n${url}\n\nAcesse alguns minutos antes do horário combinado.`}
        />
      )}
    </section>
  );
}
