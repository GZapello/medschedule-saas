import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';
import { ConsultationPaymentModal } from './ConsultationPaymentModal';
import { useAuth } from '../../context/AuthContext';
import { NutritionWorkspace } from '../nutrition/NutritionWorkspace';
import { OccupationalTherapyWorkspace } from '../occupational-therapy/OccupationalTherapyWorkspace';
import { SpeechTherapyWorkspace } from '../speech-therapy/SpeechTherapyWorkspace';
import { DentistryWorkspace } from '../dentistry/DentistryWorkspace';
import { PsychologyWorkspace } from '../psychology/PsychologyWorkspace';
import { PsychopedagogyWorkspace } from '../psychopedagogy/PsychopedagogyWorkspace';
import { PhysiotherapyWorkspace } from '../physiotherapy/PhysiotherapyWorkspace';
import { ZemdaMedWorkspace } from '../medical/ZemdaMedWorkspace';
import { ZemdaPersonalView } from '../personal/ZemdaPersonalView';
import { QuickConsultationModal } from './QuickConsultationModal';
import { ZemdaBodyWorkspace } from '../zemda-body/ZemdaBodyWorkspace';
import { GeneralClinicalWorkspace } from './GeneralClinicalWorkspace';
import { ZemdaEsteticWorkspace } from '../estetic/ZemdaEsteticWorkspace';
import { Activity, FileText, Stethoscope, ChevronLeft, Dumbbell, Sparkles } from 'lucide-react';

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
  const {
    isDoctor,
    isZemdaMed,
    isNutritionist,
    isZemdaNutri,
    isOccupationalTherapist,
    isZemdaTO,
    isSpeechTherapist,
    isZemdaFono,
    isDentist,
    isZemdaOdonto,
    isPsychologist,
    isZemdaPsico,
    isPsychopedagogue,
    isZemdaPP,
    isPhysiotherapist,
    isZemdaFisio,
    isPersonalTrainer,
    isZemdaPersonal,
    isEsthetician,
    isZemdaEstetic,
    isZemdaBody,
    currentUser,
    hasCapability
  } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');

  const deducedModuleFromProfession =
    (isDoctor || isZemdaMed || (currentUser?.professionName || '').toLowerCase().includes('médic') || (currentUser?.professionName || '').toLowerCase().includes('medic') || (appointment.service_name || '').toLowerCase().includes('médic')) ? 'ZemdaMed' :
    (isPsychopedagogue || isZemdaPP || (currentUser?.professionName || '').toLowerCase().includes('psicopedag') || (appointment.service_name || '').toLowerCase().includes('psicopedag')) ? 'ZemdaPP' :
    (isPsychologist || isZemdaPsico || (currentUser?.professionName || '').toLowerCase().includes('psicolog')) ? 'ZemdaPsico' :
    (isSpeechTherapist || isZemdaFono || (currentUser?.professionName || '').toLowerCase().includes('fono')) ? 'ZemdaFono' :
    (isDentist || isZemdaOdonto || (currentUser?.professionName || '').toLowerCase().includes('odonto') || (currentUser?.professionName || '').toLowerCase().includes('dentis')) ? 'ZemdaOdonto' :
    (isOccupationalTherapist || isZemdaTO || (currentUser?.professionName || '').toLowerCase().includes('ocupacional')) ? 'ZemdaTO' :
    (isNutritionist || isZemdaNutri || (currentUser?.professionName || '').toLowerCase().includes('nutri')) ? 'ZemdaNutri' :
    (isPersonalTrainer || isZemdaPersonal || (currentUser?.professionName || '').toLowerCase().includes('personal') || (currentUser?.professionName || '').toLowerCase().includes('educa')) ? 'ZemdaPersonal' :
    (isEsthetician || isZemdaEstetic || currentUser?.commercialModule === 'ZemdaEstetic' || (currentUser?.professionName || '').toLowerCase().includes('estet') || (currentUser?.professionName || '').toLowerCase().includes('estét')) ? 'ZemdaEstetic' :
    (isPhysiotherapist || isZemdaFisio || (currentUser?.professionName || '').toLowerCase().includes('fisio') || (appointment.service_name || '').toLowerCase().includes('fisio')) ? 'ZemdaFisio' :
    undefined;

  const effectiveModuleType =
    (status?.moduleType && status.moduleType !== 'general' ? status.moduleType : undefined) ||
    (appointment.clinical_module && appointment.clinical_module !== 'ZemdaBody' && appointment.clinical_module !== 'Zemda360' && appointment.clinical_module !== 'general' ? appointment.clinical_module : undefined) ||
    (initialModuleType && initialModuleType !== 'ZemdaBody' && initialModuleType !== 'Zemda360' && initialModuleType !== 'general' ? initialModuleType : undefined) ||
    deducedModuleFromProfession ||
    (status?.moduleType === 'general' ? 'general' : undefined) ||
    'general';

  // FLUXO DE ATENDIMENTO: "Iniciar atendimento" DEVE SEMPRE abrir o Prontuário / Evolução Clínica primeiro ('records')
  const [activeTab, setActiveTab] = useState<'records' | 'specialized' | 'zemda_body'>('records');

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

  if (status.alreadyCompleted) return <div role="dialog" aria-label="Atendimento concluído" className="fixed inset-0 z-50 bg-white p-8"><p>Este atendimento já foi finalizado. Consulte o prontuário para ver os registros.</p><button onClick={onFinished}>Voltar à agenda</button></div>;

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

  const Workspace =
    effectiveModuleType === 'ZemdaMed' ? ZemdaMedWorkspace :
    effectiveModuleType === 'ZemdaOdonto' ? DentistryWorkspace :
    effectiveModuleType === 'ZemdaNutri' ? NutritionWorkspace :
    effectiveModuleType === 'ZemdaTO' ? OccupationalTherapyWorkspace :
    effectiveModuleType === 'ZemdaFono' ? SpeechTherapyWorkspace :
    effectiveModuleType === 'ZemdaPsico' ? PsychologyWorkspace :
    effectiveModuleType === 'ZemdaPP' ? PsychopedagogyWorkspace :
    effectiveModuleType === 'ZemdaFisio' ? PhysiotherapyWorkspace :
    effectiveModuleType === 'ZemdaPersonal' ? ZemdaPersonalView :
    effectiveModuleType === 'ZemdaEstetic' ? ZemdaEsteticWorkspace :
    effectiveModuleType === 'general' ? GeneralClinicalWorkspace :
    null;

  // Se o profissional estiver visualizando o ZemdaBody dentro do mesmo atendimento:
  if (activeTab === 'zemda_body') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col overflow-auto" role="dialog" aria-modal="true" aria-label="Atendimento com Zemda360">
        {/* Barra superior de alternância */}
        <div className="flex flex-wrap items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer mr-1 sm:mr-2 shrink-0 min-h-[36px]"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar à agenda
            </button>
            <span className="font-bold text-xs text-slate-900 border-l pl-2 sm:pl-3 border-slate-200 truncate">
              {appointment.patient_name || 'Paciente'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setActiveTab('records')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-slate-600 hover:text-slate-900 cursor-pointer shrink-0 whitespace-nowrap min-h-[36px]"
            >
              <FileText className="w-3.5 h-3.5" /> Prontuário & Evolução
            </button>

            {Workspace && (
              <button
                type="button"
                onClick={() => setActiveTab('specialized')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-slate-600 hover:text-slate-900 cursor-pointer shrink-0 whitespace-nowrap min-h-[36px]"
              >
                <Stethoscope className="w-3.5 h-3.5" /> Módulo Clínico
              </button>
            )}

            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold rounded-lg bg-teal-600 text-white shadow-xs cursor-default shrink-0 whitespace-nowrap min-h-[36px]"
            >
              <Activity className="w-3.5 h-3.5" /> Zemda360 (Mapeamento)
            </button>
          </div>
        </div>

        {/* Área do Workspace */}
        <div className="p-4 sm:p-6 max-w-6xl mx-auto w-full flex-1">
          <ZemdaBodyWorkspace
            patientId={appointment.patient_id}
            appointmentId={appointment.id}
            professionalId={appointment.professional_id}
            module={effectiveModuleType}
            onClose={onClose}
          />
        </div>
      </div>
    );
  }

  // Se o módulo especializado for o ativo:
  if (activeTab === 'specialized' && Workspace) {
    if (effectiveModuleType === 'ZemdaPersonal') {
      return (
        <div className="fixed inset-0 z-50 bg-slate-50 overflow-auto" role="dialog" aria-modal="true" aria-label="Atendimento Personal Trainer">
          <div className="flex flex-wrap items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 bg-white border-b border-slate-200 sticky top-0 z-10 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer shrink-0 min-h-[36px]">
                Voltar à agenda
              </button>
              <span className="font-bold text-xs text-slate-800 border-l pl-2 sm:pl-3 border-slate-200 truncate">
                {appointment.patient_name || 'Aluno'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setActiveTab('records')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-slate-600 hover:text-slate-900 cursor-pointer shrink-0 whitespace-nowrap min-h-[36px]"
              >
                <FileText className="w-3.5 h-3.5" /> Prontuário
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold rounded-lg bg-orange-600 text-white shadow-xs cursor-default shrink-0 whitespace-nowrap min-h-[36px]"
              >
                <Dumbbell className="w-3.5 h-3.5" /> ZemdaPersonal
              </button>
              {isZemdaBody && (
                <button
                  type="button"
                  onClick={() => setActiveTab('zemda_body')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-teal-800 hover:bg-teal-50 cursor-pointer shrink-0 whitespace-nowrap min-h-[36px]"
                >
                  <Activity className="w-3.5 h-3.5" /> Zemda360
                </button>
              )}
            </div>
          </div>
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <ZemdaPersonalView
              key={appointment.id}
              initialStudentId={appointment.patient_id}
              initialAppointmentId={appointment.id}
              onFinishConsultation={onFinished}
              lockStudentContext={true}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 bg-slate-50 overflow-auto" role="dialog" aria-modal="true" aria-label="Atendimento clínico especializado">
        <div className="flex flex-wrap items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 bg-white border-b border-slate-200 sticky top-0 z-10 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer shrink-0 min-h-[36px]">
              Voltar à agenda
            </button>
            <span className="font-bold text-xs text-slate-800 border-l pl-2 sm:pl-3 border-slate-200 truncate">
              {appointment.patient_name || 'Paciente'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setActiveTab('records')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-slate-600 hover:text-slate-900 cursor-pointer shrink-0 whitespace-nowrap min-h-[36px]"
            >
              <FileText className="w-3.5 h-3.5" /> Prontuário
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold rounded-lg bg-indigo-600 text-white shadow-xs cursor-default shrink-0 whitespace-nowrap min-h-[36px]"
            >
              <Stethoscope className="w-3.5 h-3.5" /> Módulo Clínico
            </button>
            {isZemdaBody && (
              <button
                type="button"
                onClick={() => setActiveTab('zemda_body')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-teal-800 hover:bg-teal-50 cursor-pointer shrink-0 whitespace-nowrap min-h-[36px]"
              >
                <Activity className="w-3.5 h-3.5" /> Zemda360
              </button>
            )}
          </div>
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

  // Padrão: Prontuário / QuickConsultationModal com acesso ao Módulo Especializado e ZemdaBody
  return (
    <>
      <QuickConsultationModal
        appointment={{
          ...appointment,
          clinical_module: effectiveModuleType
        }}
        moduleType={effectiveModuleType || 'general'}
        onClose={onClose}
        onFinished={onFinished}
        onOpenZemdaBody={isZemdaBody ? () => setActiveTab('zemda_body') : undefined}
        onOpenSpecializedModule={Workspace ? () => setActiveTab('specialized') : undefined}
        specializedModuleName={
          effectiveModuleType === 'ZemdaMed' ? 'ZemdaMed' :
          effectiveModuleType === 'ZemdaPsico' ? 'ZemdaPsico' :
          effectiveModuleType === 'ZemdaPP' ? 'ZemdaPP' :
          effectiveModuleType === 'ZemdaFono' ? 'ZemdaFono' :
          effectiveModuleType === 'ZemdaOdonto' ? 'ZemdaOdonto' :
          effectiveModuleType === 'ZemdaTO' ? 'ZemdaTO' :
          effectiveModuleType === 'ZemdaNutri' ? 'ZemdaNutri' :
          effectiveModuleType === 'ZemdaFisio' ? 'ZemdaFisio' :
          effectiveModuleType === 'ZemdaPersonal' ? 'ZemdaPersonal' :
          effectiveModuleType === 'ZemdaEstetic' ? 'ZemdaEstetic' :
          effectiveModuleType === 'general' ? `Atendimento Clínico • ${currentUser?.canonicalProfessionName || currentUser?.professionName || 'Geral'}` :
          (isDoctor || isZemdaMed ? 'ZemdaMed' : isPersonalTrainer || isZemdaPersonal ? 'ZemdaPersonal' : isEsthetician || isZemdaEstetic ? 'ZemdaEstetic' : isPsychologist || isZemdaPsico ? 'ZemdaPsico' : isPsychopedagogue || isZemdaPP ? 'ZemdaPP' : isSpeechTherapist ? 'ZemdaFono' : isDentist ? 'ZemdaOdonto' : isOccupationalTherapist ? 'ZemdaTO' : isNutritionist ? 'ZemdaNutri' : undefined)
        }
      />
    </>
  );
}
