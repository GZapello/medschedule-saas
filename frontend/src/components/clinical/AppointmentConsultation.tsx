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
import { OnlineConsultationTools } from './OnlineConsultationTools';
import { QuickConsultationModal } from './QuickConsultationModal';
import { ZemdaBodyWorkspace } from '../zemda-body/ZemdaBodyWorkspace';
import { GeneralClinicalWorkspace } from './GeneralClinicalWorkspace';
import { ZemdaEsteticWorkspace } from '../estetic/ZemdaEsteticWorkspace';
import { resolveClinicalModuleInfo } from './clinicalModuleResolver';
import { Activity, FileText, Stethoscope, ChevronLeft, Dumbbell, Sparkles, X, Calendar, User } from 'lucide-react';

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
  const auth = useAuth();
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
  } = auth;
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const [meetingLink, setMeetingLink] = useState<{ id: string; url: string | null } | null>(null);
  const [driveLink, setDriveLink] = useState<{ id: string; url: string | null } | null>(null);
  const onlineAppointment = {
    ...appointment,
    meeting_url: meetingLink && meetingLink.id === appointment.id ? meetingLink.url : appointment.meeting_url,
    google_drive_url: driveLink && driveLink.id === appointment.id ? driveLink.url : appointment.google_drive_url
  };
  const onMeetingUrlSaved = (url: string | null) => setMeetingLink({ id: appointment.id, url });
  const onDriveUrlSaved = (url: string | null) => setDriveLink({ id: appointment.id, url });

  const resolvedModule = resolveClinicalModuleInfo({
    moduleType:
      status?.moduleType && status.moduleType !== 'general'
        ? status.moduleType
        : initialModuleType && initialModuleType !== 'general' && initialModuleType !== 'ZemdaBody' && initialModuleType !== 'Zemda360'
        ? initialModuleType
        : undefined,
    clinicalModule: appointment.clinical_module,
    serviceName: appointment.service_name,
    currentUser,
    auth
  });

  const effectiveModuleType = resolvedModule.id;

  // FLUXO DE ATENDIMENTO: "Iniciar atendimento" DEVE SEMPRE abrir o Prontuário / Evolução Clínica primeiro ('records')
  const [activeTab, setActiveTab] = useState<'records' | 'specialized' | 'zemda_body'>('records');
  const [returnWorkspaceTab, setReturnWorkspaceTab] = useState<'resumo' | 'evolucao' | 'modulo' | 'documentos' | 'finalizacao'>('evolucao');

  useEffect(() => {
    ApiClient.get(`/v1/appointments/${appointment.id}/completion`)
      .then(setStatus)
      .catch((err: any) => setError(err.message || 'Sem permissão para este atendimento.'));
  }, [appointment.id]);

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 mobile-modal" role="alertdialog">
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
      <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-xs flex items-center justify-center p-8 mobile-modal">
        <p className="text-sm font-medium text-slate-600">Carregando atendimento…</p>
      </div>
    );
  }

  if (status.alreadyCompleted) return <div role="dialog" aria-label="Atendimento concluído" className="fixed inset-0 z-50 bg-white p-8 mobile-modal"><p>Este atendimento já foi finalizado. Consulte o prontuário para ver os registros.</p><button onClick={onFinished}>Voltar à agenda</button></div>;

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

  const startIso = (appointment.attendance_start_at || appointment.start_time || '').replace(' ', 'T');
  const endIso = (appointment.attendance_end_at || appointment.attendance_expected_end_at || appointment.end_time || '').replace(' ', 'T');
  const datePart = startIso ? startIso.split('T')[0] : '';
  const formattedDate = datePart ? new Date(datePart + 'T12:00:00').toLocaleDateString('pt-BR') : '';
  const startTimeStr = startIso && startIso.includes('T') ? startIso.split('T')[1]?.slice(0, 5) : '';
  const endTimeStr = endIso && endIso.includes('T') ? endIso.split('T')[1]?.slice(0, 5) : '';
  const timeRangeChip = [
    formattedDate,
    startTimeStr ? (endTimeStr ? `${startTimeStr}–${endTimeStr}` : startTimeStr) : ''
  ].filter(Boolean).join(' • ');
  const professionalChip = appointment.professional_name || currentUser?.name || 'Profissional';
  const serviceChip = appointment.service_name || 'Atendimento Clínico';
  const specialtyChip = resolvedModule.profession || resolvedModule.badge || currentUser?.canonicalProfessionName || currentUser?.professionName || 'Especialidade';

  const renderUnifiedTopBar = (currentView: 'specialized' | 'zemda_body', ariaLabel?: string) => (
    <div className="px-3.5 sm:px-6 py-2 bg-white border-b border-slate-200 sticky top-0 z-20 shadow-2xs space-y-1.5">
      {/* LINHA 1: Voltar + Paciente + Badge do Módulo | Abas Principais + Fechar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Voltar à agenda
          </button>
          <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
            {appointment.patient_name || 'Paciente'}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200 shrink-0">
            {resolvedModule.icon && <resolvedModule.icon className="w-3 h-3 text-teal-600 shrink-0" />}
            <span>{resolvedModule.name}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 max-w-full">
          <nav aria-label={ariaLabel || 'Navegação do atendimento'} className="flex items-center gap-1 bg-slate-100/90 p-0.5 rounded-lg border border-slate-200 overflow-x-auto max-w-full mobile-wrap">
            {[
              { id: 'resumo', label: 'Resumo' },
              { id: 'evolucao', label: 'Evolução' },
              {
                id: 'modulo',
                label: resolvedModule.name,
                tooltip: resolvedModule.tooltip,
                Icon: resolvedModule.icon
              },
              { id: 'documentos', label: 'Documentos' },
              { id: 'finalizacao', label: 'Finalização' }
            ].map(tab => {
              const isActive = currentView === 'specialized' && tab.id === 'modulo';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id === 'modulo') {
                      setActiveTab('specialized');
                    } else {
                      setReturnWorkspaceTab(tab.id as any);
                      setActiveTab('records');
                    }
                  }}
                  title={tab.tooltip}
                  aria-label={tab.tooltip || tab.label}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-teal-700 shadow-2xs border border-slate-200/90'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {tab.Icon && (
                    <tab.Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-teal-700' : 'text-slate-500'}`} />
                  )}
                  <span>{tab.label}</span>
                </button>
              );
            })}

            {isZemdaBody && (
              <button
                type="button"
                onClick={() => setActiveTab('zemda_body')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  currentView === 'zemda_body'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'text-teal-800 hover:bg-teal-50'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Zemda360</span>
              </button>
            )}
          </nav>

          <button
            type="button"
            aria-label="Fechar atendimento"
            onClick={onClose}
            className="hidden sm:inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer shrink-0"
            title="Fechar atendimento"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* CHIPS DE INFORMAÇÕES DO ATENDIMENTO */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
        {timeRangeChip && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100/90 border border-slate-200/80 font-medium text-slate-700">
            <Calendar className="w-3 h-3 text-indigo-500 shrink-0" />
            <span>{timeRangeChip}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100/90 border border-slate-200/80 font-medium text-slate-700">
          <User className="w-3 h-3 text-teal-600 shrink-0" />
          <span>{professionalChip}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100/90 border border-slate-200/80 font-medium text-slate-700">
          <Stethoscope className="w-3 h-3 text-slate-500 shrink-0" />
          <span>{serviceChip}</span>
        </span>
        {specialtyChip && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100/90 border border-slate-200/80 font-medium text-slate-600">
            <Sparkles className="w-3 h-3 text-teal-600 shrink-0" />
            <span>{specialtyChip}</span>
          </span>
        )}
      </div>
    </div>
  );

  // Se o profissional estiver visualizando o ZemdaBody dentro do mesmo atendimento:
  if (activeTab === 'zemda_body') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col overflow-auto mobile-modal" role="dialog" aria-modal="true" aria-label="Atendimento com Zemda360">
        {renderUnifiedTopBar('zemda_body', 'Navegação Zemda360')}
        <div className="px-4 sm:px-6 pt-2 max-w-6xl mx-auto w-full">
          <OnlineConsultationTools appointment={{ ...onlineAppointment, clinical_module: effectiveModuleType }} onRequestEvolution={() => { setReturnWorkspaceTab('evolucao'); setActiveTab('records'); }} onMeetingUrlSaved={onMeetingUrlSaved} onDriveUrlSaved={onDriveUrlSaved} />
        </div>
        {/* Área do Workspace */}
        <div className="p-3 sm:p-5 max-w-6xl mx-auto w-full flex-1">
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
        <div className="fixed inset-0 z-50 bg-slate-50 overflow-auto mobile-modal" role="dialog" aria-modal="true" aria-label="Atendimento Personal Trainer">
          {renderUnifiedTopBar('specialized', 'Navegação ZemdaPersonal')}
          <div className="px-4 sm:px-6 pt-2 max-w-7xl mx-auto w-full">
            <OnlineConsultationTools appointment={{ ...onlineAppointment, clinical_module: effectiveModuleType }} onRequestEvolution={() => { setReturnWorkspaceTab('evolucao'); setActiveTab('records'); }} onMeetingUrlSaved={onMeetingUrlSaved} onDriveUrlSaved={onDriveUrlSaved} />
          </div>
          <ZemdaPersonalView
            key={appointment.id}
            initialStudentId={appointment.patient_id}
            initialAppointmentId={appointment.id}
            onFinishConsultation={onFinished}
            lockStudentContext={true}
          />
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 bg-slate-50 overflow-auto mobile-modal" role="dialog" aria-modal="true" aria-label="Atendimento clínico especializado">
        {renderUnifiedTopBar('specialized', 'Navegação do módulo clínico')}
        <div className="px-4 sm:px-6 pt-2 max-w-7xl mx-auto w-full">
          <OnlineConsultationTools appointment={{ ...onlineAppointment, clinical_module: effectiveModuleType }} onRequestEvolution={() => { setReturnWorkspaceTab('evolucao'); setActiveTab('records'); }} onMeetingUrlSaved={onMeetingUrlSaved} onDriveUrlSaved={onDriveUrlSaved} />
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
          ...onlineAppointment,
          clinical_module: effectiveModuleType
        }}
        initialWorkspaceTab={returnWorkspaceTab}
        onMeetingUrlSaved={onMeetingUrlSaved}
        onDriveUrlSaved={onDriveUrlSaved}
        moduleType={effectiveModuleType || 'general'}
        onClose={onClose}
        onFinished={onFinished}
        onOpenZemdaBody={isZemdaBody ? () => setActiveTab('zemda_body') : undefined}
        onOpenSpecializedModule={Workspace ? () => setActiveTab('specialized') : undefined}
        specializedModuleName={resolvedModule.name}
      />
    </>
  );
}
