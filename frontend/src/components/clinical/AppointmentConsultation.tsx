import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';
import { ConsultationPaymentModal } from './ConsultationPaymentModal';
import { useAuth } from '../../context/AuthContext';
import { NutritionWorkspace } from '../nutrition/NutritionWorkspace';
import { OccupationalTherapyWorkspace } from '../occupational-therapy/OccupationalTherapyWorkspace';
import { SpeechTherapyWorkspace } from '../speech-therapy/SpeechTherapyWorkspace';
import { DentistryWorkspace } from '../dentistry/DentistryWorkspace';
import { QuickConsultationModal } from './QuickConsultationModal';

export function AppointmentConsultation({
  appointment,
  initialModuleType,
  onClose,
  onFinished
}: {
  appointment: any;
  initialModuleType?: string;
  onClose: () => void;
  onFinished: () => void;
}) {
  const { isNutritionist, isOccupationalTherapist, isSpeechTherapist, isDentist } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    ApiClient.get(`/v1/appointments/${appointment.id}/completion`)
      .then(setStatus)
      .catch((err: any) => setError(err.message || 'Sem permissão para este atendimento.'));
  }, [appointment.id]);

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="alertdialog">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-xl">
          <h3 className="text-lg font-bold text-slate-800">Acesso Restrito</h3>
          <p className="text-sm text-slate-600">{error}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 transition-colors"
          >
            Voltar à agenda
          </button>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-xs flex items-center justify-center p-8">
        <p className="text-sm font-medium text-slate-600">Carregando atendimento…</p>
      </div>
    );
  }

  if (status.awaitingPayment) {
    return (
      <ConsultationPaymentModal
        appointmentId={appointment.id}
        initialPayment={status.payment}
        onClose={onClose}
        onFinished={onFinished}
      />
    );
  }

  const effectiveModuleType = appointment.clinical_module || initialModuleType || status.moduleType;

  const Workspace =
    effectiveModuleType === 'ZemdaOdonto' ? DentistryWorkspace :
    effectiveModuleType === 'ZemdaNutri' ? NutritionWorkspace :
    effectiveModuleType === 'ZemdaTO' ? OccupationalTherapyWorkspace :
    effectiveModuleType === 'ZemdaFono' ? SpeechTherapyWorkspace :
    null;

  if (!Workspace) {
    return (
      <QuickConsultationModal
        appointment={{
          ...appointment,
          clinical_module: effectiveModuleType
        }}
        moduleType={effectiveModuleType || 'general'}
        onClose={onClose}
        onFinished={onFinished}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-auto" role="dialog" aria-modal="true" aria-label="Atendimento clínico">
      <div className="flex justify-end p-2 bg-white border-b sticky top-0 z-10">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium">
          Voltar à agenda
        </button>
      </div>
      <Workspace
        key={appointment.id}
        initialPatientId={appointment.patient_id}
        initialAppointmentId={appointment.id}
        onFinishConsultation={onFinished}
      />
    </div>
  );
}
