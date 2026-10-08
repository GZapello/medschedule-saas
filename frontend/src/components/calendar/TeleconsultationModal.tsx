import { TeleconsultationTranscriptModal, TranscriptionHelp } from '../clinical/TeleconsultationTranscriptModal';
import { queueReviewedEvolution } from '../../utils/teleconsultation';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { UniversalWhatsAppModal } from '../common/UniversalWhatsAppModal';
import { isMeetingUrl, openTeleconsultation } from '../../utils/teleconsultation';

export interface TeleconsultationAppointment {
  id: string;
  professional_id?: string;
  profession?: string;
  clinical_module?: string;
  service_clinical_module?: string;
  modality?: string;
  meeting_url?: string | null;
  patient_id?: string;
  patient_name?: string;
  patient_phone?: string;
  start_time: string;
}

export function TeleconsultationModal({ appointment, onClose, onSaved, onStart, onInsert, allowModalityChange = true }: {
  appointment: TeleconsultationAppointment;
  onStart?: () => void;
  onInsert?: (text: string) => void;
  allowModalityChange?: boolean;
  onClose: () => void;
  onSaved: (url: string | null, modality: string) => void;
}) {
  const { showToast } = useToast();
  const [transcription, setTranscription] = useState(false);
  const [url, setUrl] = useState(appointment.meeting_url || '');
  const [modality, setModality] = useState(appointment.modality || 'presential');
  const [editing, setEditing] = useState(appointment.modality !== 'online');
  const [saving, setSaving] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [savedUrl, setSavedUrl] = useState(appointment.meeting_url || '');
  const date = new Date(appointment.start_time.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR');
  const time = appointment.start_time.slice(11, 16);
  const online = modality === 'online';
  const save = async () => {
    if (online && url.trim() && !isMeetingUrl(url)) {
      showToast('Informe um link HTTPS válido para a teleconsulta.', 'error'); return;
    }
    setSaving(true);
    try {
      await ApiClient.put(`/v1/appointments/${appointment.id}`, { meeting_url: url.trim() || null, modality });
      setSavedUrl(url.trim());
      setEditing(false);
      onSaved(url.trim() || null, modality);
      showToast('Agendamento atualizado.', 'success');
      if (!online) onClose();
    } catch (err: any) { showToast(err.message || 'Não foi possível salvar o link.', 'error'); }
    finally { setSaving(false); }
  };
  return createPortal(<div className="fixed inset-0 z-[11000] bg-slate-900/60 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-label={online ? 'Teleconsulta' : 'Editar modalidade'} className="bg-white rounded-2xl p-5 w-full max-w-lg space-y-4 max-h-[90vh] overflow-auto">
      <div className="flex justify-between items-center"><h3 className="font-bold">{online ? '📹 Teleconsulta' : 'Editar modalidade'}</h3><button type="button" onClick={onClose} aria-label="Fechar teleconsulta">✕</button></div>
      <p>Paciente: {appointment.patient_name || 'Paciente'}</p>
      <p>Data: {date} • Horário: {time}</p>
      {editing ? <>
        {allowModalityChange && <label className="block text-sm">Modalidade<select aria-label="Modalidade" className="border rounded-lg p-2 ml-2" value={modality} onChange={e => setModality(e.target.value)}><option value="presential">Presencial</option><option value="online">Online</option>{modality === 'home' && <option value="home">Domiciliar</option>}</select></label>}
        {online && <>
          {!savedUrl && <p className="text-sm text-amber-800">Este atendimento online ainda não possui link de teleconsulta.</p>}
          <label className="block text-sm">Link da teleconsulta<input aria-label="Link da teleconsulta" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://meet.google.com/xxx-xxxx-xxx" className="block border rounded-lg p-2 w-full mt-1" /></label>
        </>}
        <button type="button" disabled={saving} onClick={save} className="bg-indigo-600 text-white px-3 py-2 rounded-lg">{saving ? 'Salvando…' : 'Salvar agendamento'}</button>
        <button type="button" onClick={onClose} className="px-3 py-2">Cancelar</button>
      </> : online && <>
        {savedUrl ? <p className="text-sm break-all">Link: {savedUrl}</p> : <p>Este atendimento online ainda não possui link de teleconsulta.</p>}
        <div className="flex flex-wrap gap-2 text-sm bg-indigo-50 border border-indigo-100 rounded-xl p-3">
          {savedUrl && <>
            <button type="button" className="border rounded-lg p-2" onClick={async () => {
              try { await navigator.clipboard.writeText(savedUrl); showToast('Link da teleconsulta copiado.', 'success'); }
              catch { showToast('Não foi possível copiar o link. Copie o endereço exibido.', 'error'); }
            }}>📋 Copiar link</button>
            <button type="button" className="border rounded-lg p-2" onClick={() => setWhatsapp(true)}>💬 Compartilhar pelo WhatsApp</button>
            <button type="button" className="border rounded-lg p-2" onClick={() => openTeleconsultation({ modality, meeting_url: savedUrl })}>📹 Abrir Google Meet</button>
          </>}
          <button type="button" className="bg-white border border-indigo-200 rounded-lg p-2 text-indigo-800" onClick={() => setTranscription(true)}>Transcrição & IA</button>
          <TranscriptionHelp />
          {onStart && savedUrl && <button type="button" className="bg-indigo-600 text-white rounded-lg p-2" onClick={onStart}>Iniciar atendimento</button>}
          <button type="button" className="border rounded-lg p-2" onClick={() => setEditing(true)}>{savedUrl ? 'Editar link / modalidade' : 'Adicionar link'}</button>
          <button type="button" onClick={onClose}>Cancelar</button>
        </div>
      </>}
      {transcription && online && <TeleconsultationTranscriptModal appointment={{ ...appointment, modality, meeting_url: savedUrl }} onClose={() => setTranscription(false)} onInsert={onInsert || (onStart ? text => { queueReviewedEvolution(appointment.id, text); onStart(); } : undefined)} />}
      {whatsapp && online && <UniversalWhatsAppModal isOpen onClose={() => setWhatsapp(false)} title="Compartilhar teleconsulta" recipientName={appointment.patient_name || 'Paciente'} phone={appointment.patient_phone}
        defaultMessage={`Olá, ${appointment.patient_name || 'Paciente'}. Segue o link para o seu atendimento online no dia ${date} às ${time}:\n\n${savedUrl}\n\nAcesse alguns minutos antes do horário combinado.`} />}
    </section>
  </div>, document.body);
}
