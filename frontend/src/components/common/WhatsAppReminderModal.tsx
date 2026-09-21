import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Phone,
  Calendar,
  Sparkles,
  Loader2
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import {
  isValidPhoneNumber,
  formatPhoneDisplay,
  buildWhatsAppReminderMessage,
  generateWhatsAppUrl,
  isDateToday
} from '../../utils/phone.utils';

export const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
  </svg>
);

export interface WhatsAppReminderAppointment {
  id: string;
  patient_id?: string;
  patient_name: string;
  patient_phone?: string;
  start_time: string;
  professional_name: string;
  service_name?: string;
  appointment_number?: string;
  status?: string;
}

export interface WhatsAppReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: WhatsAppReminderAppointment | null;
  clinicName?: string;
  onSuccess?: () => void;
}

export const WhatsAppReminderModal: React.FC<WhatsAppReminderModalProps> = ({
  isOpen,
  onClose,
  appointment,
  clinicName = 'Clínica',
  onSuccess
}) => {
  const [message, setMessage] = useState<string>('');
  const [isOfficial, setIsOfficial] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [canFallback, setCanFallback] = useState<boolean>(false);

  // Consulta o status da conexão oficial do WhatsApp
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingStatus(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setCanFallback(false);

    ApiClient.get<{ success: boolean; data: { officialAvailable: boolean; displayPhoneNumber: string | null } }>(
      '/v1/whatsapp/status'
    )
      .then((res) => {
        if (isMounted) {
          setIsOfficial(Boolean(res?.data?.officialAvailable));
        }
      })
      .catch((err) => {
        console.warn('[WhatsAppReminderModal] Falha ao consultar status oficial:', err);
        if (isMounted) setIsOfficial(false);
      })
      .finally(() => {
        if (isMounted) setLoadingStatus(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Inicializa o template da mensagem com os dados do agendamento
  useEffect(() => {
    if (appointment && isOpen) {
      const template = buildWhatsAppReminderMessage({
        patientName: appointment.patient_name,
        professionalName: appointment.professional_name,
        clinicName,
        startTime: appointment.start_time,
        serviceName: appointment.service_name
      });
      setMessage(template);
    }
  }, [appointment, clinicName, isOpen]);

  if (!isOpen || !appointment) return null;

  const phoneValid = isValidPhoneNumber(appointment.patient_phone);
  const formattedPhone = formatPhoneDisplay(appointment.patient_phone);
  const isToday = isDateToday(appointment.start_time);
  const timeStr = appointment.start_time.includes('T')
    ? appointment.start_time.split('T')[1].slice(0, 5)
    : '00:00';
  const dateStr = appointment.start_time.includes('T')
    ? appointment.start_time.split('T')[0]
    : appointment.start_time.slice(0, 10);
  const [y, m, d] = dateStr.split('-');
  const formattedDate = d && m && y ? `${d}/${m}/${y}` : dateStr;

  // Envio oficial pela Meta Cloud API
  const handleSendOfficial = async () => {
    if (!phoneValid) return;
    setIsSending(true);
    setErrorMessage(null);

    try {
      const res: any = await ApiClient.post(
        `/v1/appointments/${appointment.id}/whatsapp-reminder`,
        { messageText: message }
      );

      setSuccessMessage('Lembrete enviado com sucesso pelo WhatsApp Oficial!');
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('[WhatsAppReminderModal] Erro no envio oficial:', err);
      const msg = err.response?.data?.error || err.message || 'Falha ao enviar mensagem pelo WhatsApp Cloud';
      setErrorMessage(msg);
      setCanFallback(true);
    } finally {
      setIsSending(false);
    }
  };

  // Envio manual / Contingência (Abre wa.me e registra histórico)
  const handleOpenManual = async () => {
    if (!phoneValid) return;
    setIsSending(true);
    setErrorMessage(null);

    try {
      const url = generateWhatsAppUrl(appointment.patient_phone || '', message);
      window.open(url, '_blank', 'noopener,noreferrer');

      // Registra no backend como lembrete manual aberto
      await ApiClient.post(
        `/v1/appointments/${appointment.id}/whatsapp-reminder`,
        {
          messageText: message,
          fallbackOpened: true
        }
      );

      setSuccessMessage('WhatsApp Web/App aberto com mensagem preenchida e envio registrado!');
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('[WhatsAppReminderModal] Erro ao registrar abertura manual:', err);
      // Mesmo se a requisição falhar, a janela externa do WhatsApp já foi aberta
      setSuccessMessage('WhatsApp aberto! (Aviso: histórico não pôde ser gravado)');
      setTimeout(() => {
        onClose();
      }, 1800);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm">
              <WhatsAppIcon className="w-5 h-5 fill-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">
                Enviar Lembrete por WhatsApp
              </h3>
              <p className="text-xs text-slate-500">
                Confirmação de dados antes do envio para evitar erros.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSending}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-4 space-y-4 text-xs">
          
          {/* Status Badge da Integração */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 px-3.5 py-2.5 rounded-xl">
            <span className="font-medium text-slate-600">Canal de Envio:</span>
            {loadingStatus ? (
              <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando conexão...
              </span>
            ) : isOfficial ? (
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                WhatsApp Cloud API Oficial (Disparo Direto)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 bg-slate-200/70 px-2.5 py-1 rounded-lg">
                <ExternalLink className="w-3 h-3 text-slate-500" />
                WhatsApp Web / App (Link Pré-preenchido)
              </span>
            )}
          </div>

          {/* Resumo Estruturado do Agendamento */}
          <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3.5 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-slate-400 text-[11px] block font-medium">Paciente:</span>
                <span className="font-bold text-slate-900 text-sm">{appointment.patient_name}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block font-medium">Telefone Destino:</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  {phoneValid ? (
                    <span className="font-bold text-slate-900">{formattedPhone}</span>
                  ) : (
                    <span className="text-rose-600 font-bold">Sem telefone válido</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-emerald-100/80">
              <div>
                <span className="text-slate-400 text-[11px] block font-medium">Data & Horário:</span>
                <span className="font-bold text-slate-800">
                  {isToday ? 'Hoje' : formattedDate} às {timeStr}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block font-medium">Profissional:</span>
                <span className="font-medium text-slate-800 truncate block">
                  {appointment.professional_name}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block font-medium">Consulta/Serviço:</span>
                <span className="font-medium text-slate-800 truncate block">
                  {appointment.service_name || 'Consulta'}
                </span>
              </div>
            </div>
          </div>

          {/* Validação de Telefone Ausente */}
          {!phoneValid && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Telefone não cadastrado ou formato inválido.</p>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  Para disparar mensagens, atualize o telefone do paciente no cadastro com DDD.
                </p>
              </div>
            </div>
          )}

          {/* Feedback de Erro ou Sucesso */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Falha no envio oficial:</p>
                <p className="text-[11px] text-rose-700 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="font-bold text-xs">{successMessage}</p>
            </div>
          )}

          {/* Área de Edição da Mensagem */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-slate-700 flex items-center gap-1.5">
                <span>Prévia da Mensagem (Editável)</span>
              </label>
              <span className="text-[11px] text-slate-400">
                {message.length} caracteres
              </span>
            </div>
            <textarea
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSending || Boolean(successMessage)}
              placeholder="Digite a mensagem a ser enviada..."
              className="w-full p-3 text-xs bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans resize-none leading-relaxed text-slate-800"
            />
          </div>
        </div>

        {/* Modal Footer / Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            Cancelar
          </button>

          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center gap-2">
            {/* Se falhar no envio oficial, exibe botão imediato de contingência via Link */}
            {canFallback && (
              <button
                type="button"
                onClick={handleOpenManual}
                disabled={isSending || !phoneValid}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300/80 rounded-xl transition-all cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir no WhatsApp Web/App (Contingência)</span>
              </button>
            )}

            {isOfficial && !canFallback ? (
              <button
                type="button"
                onClick={handleSendOfficial}
                disabled={isSending || !phoneValid || Boolean(successMessage) || loadingStatus}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-all cursor-pointer"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Disparando...</span>
                  </>
                ) : (
                  <>
                    <WhatsAppIcon className="w-4 h-4 fill-white" />
                    <span>Enviar pelo WhatsApp</span>
                  </>
                )}
              </button>
            ) : !canFallback ? (
              <button
                type="button"
                onClick={handleOpenManual}
                disabled={isSending || !phoneValid || Boolean(successMessage) || loadingStatus}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-all cursor-pointer"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Abrindo...</span>
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    <span>Abrir no WhatsApp Web/App</span>
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>

      </div>
    </div>
  );
};
