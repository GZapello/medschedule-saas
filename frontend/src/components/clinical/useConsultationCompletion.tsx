import { resolveConsultationAppointment } from './resolveConsultationAppointment';
import { useClinicalReview } from './useClinicalReview';
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../api/client';
import { ConsultationPaymentModal } from './ConsultationPaymentModal';
import { PatientFollowUpDocumentModal } from './PatientFollowUpDocumentModal';
import { PatientPreviousRecordsModal } from './PatientPreviousRecordsModal';
import { CheckCircle2, Printer, Eye } from 'lucide-react';

export function useConsultationCompletion(onFinished?: () => void, contextKey?: string, options?: { showPostCompletion?: boolean }) {
  const review = useClinicalReview(contextKey);
  const { currentUser } = useAuth();
  const inFlight = useRef(false);
  const completed = useRef(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const directAppointment = useRef<string>();
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;
  useEffect(() => {
    completed.current = false;
    setIsCompleted(false);
    directAppointment.current = undefined;
    setReceipt(null);
    setLastPayload(null);
    setShowPostConsultationModal(false);
    setShowFollowUpDocModal(false);
    setShowRecordsModal(false);
  }, [contextKey]);
  const [receipt, setReceipt] = useState<any>(null);
  const [lastPayload, setLastPayload] = useState<any>(null);

  // Post-consultation modal state
  const [showPostConsultationModal, setShowPostConsultationModal] = useState<boolean>(false);
  const [showFollowUpDocModal, setShowFollowUpDocModal] = useState<boolean>(false);
  const [showRecordsModal, setShowRecordsModal] = useState<boolean>(false);

  const complete = async (endpoint: string, payload: any) => {
    if (!payload.patientId) throw new Error('Selecione um paciente para finalizar o atendimento.');
    if (inFlight.current || completed.current) return null;
    const context = contextKey;
    inFlight.current = true;
    try {
      if (!await review.confirm(payload)) return null;
      const appointmentId = await resolveConsultationAppointment({ ...payload, appointmentId: payload.appointmentId || directAppointment.current });
      if (currentContext.current !== context) return null;
      directAppointment.current = appointmentId;
      setLastPayload({ ...payload, appointmentId });

      const result = await ApiClient.post<any>(endpoint, { ...payload, appointmentId });
      if (result.alreadyCompleted) {
        throw new Error('Este atendimento já foi finalizado. Abra o prontuário para consultar o histórico.');
      }
      if (currentContext.current !== context) return null;
      completed.current = true;
      setIsCompleted(true);
      setReceipt({ ...result, appointmentId });
      setShowPostConsultationModal(options?.showPostCompletion !== false);
      window.dispatchEvent(new CustomEvent('appointment-updated', { detail: { appointmentId, status: 'completed' } }));
      window.dispatchEvent(new Event('refresh-appointments'));
      window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
      return result;
    } finally {
      inFlight.current = false;
    }
  };

  const handleFinishAll = () => {
    setShowPostConsultationModal(false);
    setShowFollowUpDocModal(false);
    setShowRecordsModal(false);
    setReceipt(null);
    onFinished?.();
  };

  const dialog = (
    <>
      {review.dialog}
      {receipt?.awaitingPayment && (
        <ConsultationPaymentModal
          appointmentId={receipt.appointmentId}
          initialPayment={receipt.payment}
          onClose={() => {
            setReceipt(null);
            setShowPostConsultationModal(true);
          }}
          onFinished={() => {
            setReceipt(null);
            setShowPostConsultationModal(true);
          }}
        />
      )}

      {showPostConsultationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 p-6 text-center space-y-5">
            <div className="w-14 h-14 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">Atendimento Finalizado com Sucesso!</h2>
              <p className="text-xs text-slate-500 mt-1">
                Evolução clínica e registros arquivados com segurança no prontuário do paciente.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowFollowUpDocModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Gerar acompanhamento para o paciente</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRecordsModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200"
              >
                <Eye className="w-4 h-4 text-slate-600" />
                <span>Ver prontuário do paciente</span>
              </button>

              <button
                type="button"
                onClick={handleFinishAll}
                className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {showFollowUpDocModal && lastPayload?.patientId && (
        <PatientFollowUpDocumentModal
          isOpen={showFollowUpDocModal}
          onClose={() => setShowFollowUpDocModal(false)}
          patientId={lastPayload.patientId}
          patientName={lastPayload.patientName || 'Paciente'}
          appointmentId={receipt?.appointmentId || lastPayload.appointmentId}
          professionalName={lastPayload.professionalName || currentUser?.name}
          professionalCouncil={currentUser?.registrationNumber ? (currentUser.registrationType ? `${currentUser.registrationType}: ${currentUser.registrationNumber}` : `Registro: ${currentUser.registrationNumber}`) : undefined}
          moduleType={lastPayload.moduleType}
          moduleData={lastPayload}
          clinicalEvolution={lastPayload.clinicalEvolution}
          technicalNotes={lastPayload.technicalNotes}
          professionId={currentUser?.canonicalProfessionId || currentUser?.professionId}
          practiceAreaIds={currentUser?.practiceAreaIds}
          capabilities={currentUser?.capabilities}
          initialGuidelines={lastPayload.guidelines || lastPayload.generalGuidelines}
          mealPlanText={lastPayload.mealPlanText}
          homeExercisesText={lastPayload.homeExercisesText}
          homeActivitiesText={lastPayload.homeActivitiesText}
        />
      )}

      {showRecordsModal && lastPayload?.patientId && (
        <PatientPreviousRecordsModal
          isOpen={showRecordsModal}
          onClose={() => setShowRecordsModal(false)}
          patientId={lastPayload.patientId}
          patientName={lastPayload.patientName || 'Paciente'}
        />
      )}
    </>
  );

  return { isCompleted, complete, save: async (endpoint: string, payload: any) => !!await complete(endpoint, payload), dialog };
}
