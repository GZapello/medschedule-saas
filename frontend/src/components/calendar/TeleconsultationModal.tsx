import { TeleconsultationTranscriptModal, TranscriptionHelp } from '../clinical/TeleconsultationTranscriptModal';
import { queueReviewedEvolution, isMeetingUrl, openTeleconsultation } from '../../utils/teleconsultation';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Video, X, Copy, Share2, ExternalLink, Sparkles, Edit3 } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { UniversalWhatsAppModal } from '../common/UniversalWhatsAppModal';

export interface TeleconsultationAppointment {
  id: string;
  professional_id?: string;
  profession?: string;
  clinical_module?: string;
  service_clinical_module?: string;
  modality?: string;
  meeting_url?: string | null;
  google_drive_url?: string | null;
  patient_id?: string;
  patient_name?: string;
  patient_phone?: string;
  start_time: string;
}

export function TeleconsultationModal({
  appointment,
  onClose,
  onSaved,
  onInsert,
  allowModalityChange = true,
  initialEditing = false
}: {
  appointment: TeleconsultationAppointment;
  onInsert?: (text: string) => void;
  allowModalityChange?: boolean;
  initialEditing?: boolean;
  onClose: () => void;
  onSaved: (url: string | null, modality: string) => void;
}) {
  const { showToast } = useToast();
  const [transcription, setTranscription] = useState(false);
  const [url, setUrl] = useState(appointment.meeting_url || '');
  const [modality, setModality] = useState(appointment.modality || 'presential');
  const [editing, setEditing] = useState(initialEditing || appointment.modality !== 'online' || !appointment.meeting_url);
  const [saving, setSaving] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [savedUrl, setSavedUrl] = useState(appointment.meeting_url || '');

  const date = new Date(appointment.start_time.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');
  const time = appointment.start_time.slice(11, 16);
  const online = modality === 'online';

  const save = async () => {
    if (online && url.trim() && !isMeetingUrl(url)) {
      showToast('Informe um link HTTPS válido para a teleconsulta.', 'error');
      return;
    }
    setSaving(true);
    try {
      await ApiClient.put(`/v1/appointments/${appointment.id}`, {
        meeting_url: online ? url.trim() || null : url.trim() || null,
        modality
      });
      setSavedUrl(url.trim());
      setEditing(false);
      onSaved(url.trim() || null, modality);
      showToast('Agendamento atualizado.', 'success');
      if (!online || initialEditing) onClose();
    } catch (err: any) {
      showToast(err.message || 'Não foi possível salvar o link.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[11000] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={online ? 'Configurar teleconsulta' : 'Editar modalidade'}
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-auto"
      >
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
              <Video className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {online ? 'Configurar teleconsulta' : 'Editar modalidade do atendimento'}
              </h3>
              <p className="text-xs text-slate-500">
                {appointment.patient_name || 'Paciente'} • {date} às {time}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar teleconsulta"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {editing ? (
          <div className="space-y-4">
            {allowModalityChange && (
              <label className="block text-xs font-semibold text-slate-700">
                Modalidade do atendimento
                <select
                  aria-label="Modalidade"
                  className="block w-full mt-1.5 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  value={modality}
                  onChange={e => setModality(e.target.value)}
                >
                  <option value="presential">Presencial</option>
                  <option value="online">Online (Teleconsulta)</option>
                  <option value="home">Domiciliar</option>
                </select>
              </label>
            )}

            {online && (
              <div className="space-y-2">
                {!savedUrl && (
                  <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    Cole abaixo o link da sala de videochamada (ex.: Google Meet, Zoom) para compartilhar com o paciente.
                  </p>
                )}
                <label className="block text-xs font-semibold text-slate-700">
                  Link da teleconsulta
                  <input
                    aria-label="Link da teleconsulta"
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://meet.google.com/xxx-xxxx-xxx"
                    className="block border border-slate-200 rounded-xl px-3 py-2 w-full mt-1.5 text-xs text-slate-800 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </label>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Salvando…' : 'Salvar configuração'}
              </button>
            </div>
          </div>
        ) : (
          online && (
            <div className="space-y-4">
              {savedUrl ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Link da sala configurada</span>
                  <p className="text-slate-800 font-medium break-all">{savedUrl}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Este atendimento online ainda não possui link de teleconsulta.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {savedUrl && (
                  <>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl px-3.5 py-2 cursor-pointer"
                      onClick={() => openTeleconsultation({ modality, meeting_url: savedUrl })}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir sala</span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl px-3 py-2 cursor-pointer"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(savedUrl);
                          showToast('Link da teleconsulta copiado.', 'success');
                        } catch {
                          showToast('Não foi possível copiar o link. Copie o endereço exibido.', 'error');
                        }
                      }}
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copiar link</span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-xl px-3 py-2 cursor-pointer"
                      onClick={() => setWhatsapp(true)}
                    >
                      <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Compartilhar</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl px-3 py-2 font-semibold text-slate-700 cursor-pointer"
                  onClick={() => setTranscription(true)}
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Transcrição & IA</span>
                </button>
                <TranscriptionHelp />
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium rounded-xl px-3 py-2 cursor-pointer"
                  onClick={() => setEditing(true)}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{savedUrl ? 'Editar link / modalidade' : 'Adicionar link'}</span>
                </button>
              </div>
            </div>
          )
        )}

        {transcription && online && (
          <TeleconsultationTranscriptModal
            appointment={{ ...appointment, modality, meeting_url: savedUrl }}
            onClose={() => setTranscription(false)}
            onInsert={
              onInsert ||
              (text => {
                queueReviewedEvolution(appointment.id, text);
              })
            }
          />
        )}
        {whatsapp && online && (
          <UniversalWhatsAppModal
            isOpen
            onClose={() => setWhatsapp(false)}
            title="Compartilhar teleconsulta"
            recipientName={appointment.patient_name || 'Paciente'}
            phone={appointment.patient_phone}
            defaultMessage={`Olá, ${appointment.patient_name || 'Paciente'}. Segue o link para o seu atendimento online no dia ${date} às ${time}:\n\n${savedUrl}\n\nAcesse alguns minutos antes do horário combinado.`}
          />
        )}
      </section>
    </div>,
    document.body
  );
}
