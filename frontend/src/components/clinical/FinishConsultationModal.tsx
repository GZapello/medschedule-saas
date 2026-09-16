import React, { useState } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  X,
  CheckCircle2,
  FileText,
  Clock,
  Calendar,
  Pill,
  FileSpreadsheet,
  Share2,
  ChevronRight,
  Printer
} from 'lucide-react';
import { ConsultationPaymentModal } from './ConsultationPaymentModal';
import { PrintableDocumentModal } from './PrintableDocumentModal';

interface FinishConsultationModalProps {
  appointment: {
    id: string;
    patient_id: string;
    patient_name?: string;
    professional_id: string;
    professional_name?: string;
    service_id: string;
    service_name?: string;
    start_time: string;
  };
  clinicalData?: {
    title?: string;
    clinicalEvolution?: string;
    technicalNotes?: string;
    isSealed?: boolean;
    odontogramData?: any;
    toothChanges?: any[];
    moduleType?: string;
    moduleData?: any;
    assessmentData?: any;
  };
  onClose: () => void;
  onFinished: () => void;
}

export const FinishConsultationModal: React.FC<FinishConsultationModalProps> = ({
  appointment,
  clinicalData,
  onClose,
  onFinished
}) => {
  const { showToast } = useToast();
  const [receipt, setReceipt] = useState<any>(null);
  React.useEffect(() => {
    ApiClient.get<any>(`/v1/appointments/${appointment.id}/completion`).then(result => {
      if (result.awaitingPayment) setReceipt(result);
    }).catch((err: any) => showToast(err.message || 'Erro ao consultar atendimento.', 'error'));
  }, [appointment.id]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Seções ativas
  const [includeEvolution, setIncludeEvolution] = useState<boolean>(true);
  const [includeCertificate, setIncludeCertificate] = useState<boolean>(false);
  const [includePrescription, setIncludePrescription] = useState<boolean>(false);
  const [includeExamRequest, setIncludeExamRequest] = useState<boolean>(false);
  const [includeReturn, setIncludeReturn] = useState<boolean>(false);
  const [includeReferral, setIncludeReferral] = useState<boolean>(false);

  // Dados do formulário
  const [evolution, setEvolution] = useState({
    title: clinicalData?.title || `Consulta de ${appointment.service_name || 'Rotina'}`,
    clinicalEvolution: clinicalData?.clinicalEvolution || '',
    technicalNotes: clinicalData?.technicalNotes || '',
    isSealed: !!clinicalData?.isSealed
  });

  const [certificate, setCertificate] = useState({
    certificateType: 'rest', // rest, attendance, fitness
    daysOff: 1,
    startDate: new Date().toISOString().split('T')[0],
    cidCode: '',
    notes: ''
  });

  const [prescription, setPrescription] = useState({
    prescriptionType: 'simple', // simple, control
    content: ''
  });

  const [examRequest, setExamRequest] = useState({
    examsList: '',
    clinicalIndication: '',
    cidCode: ''
  });

  const [returnAppt, setReturnAppt] = useState({
    date: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
    time: '10:00'
  });

  const [referral, setReferral] = useState({
    referralReason: '',
    referredByProfessionalId: appointment.professional_id
  });

  // Modal para prévia e impressão de documento emitido
  const [printDoc, setPrintDoc] = useState<{ type: 'certificate' | 'prescription' | 'exam_request'; id: string } | null>(null);

  // Resumo de conclusão com sucesso
  const [completionSummary, setCompletionSummary] = useState<{
    hasEvolution: boolean;
    hasCertificate: boolean;
    hasPrescription: boolean;
    hasExamRequest: boolean;
    hasReturn: boolean;
    hasReferral: boolean;
    generatedDocs: any;
  } | null>(null);

  const DRAFT_KEY = `zemda_draft_appt_${appointment.id}`;

  // 1. Recuperação segura de rascunho salvo ao carregar
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.evolution) setEvolution(parsed.evolution);
        if (parsed.certificate) setCertificate(parsed.certificate);
        if (parsed.prescription) setPrescription(parsed.prescription);
        if (parsed.examRequest) setExamRequest(parsed.examRequest);
        if (parsed.returnAppt) setReturnAppt(parsed.returnAppt);
        if (parsed.referral) setReferral(parsed.referral);
        if (parsed.includeEvolution !== undefined) setIncludeEvolution(parsed.includeEvolution);
        if (parsed.includeCertificate !== undefined) setIncludeCertificate(parsed.includeCertificate);
        if (parsed.includePrescription !== undefined) setIncludePrescription(parsed.includePrescription);
        if (parsed.includeExamRequest !== undefined) setIncludeExamRequest(parsed.includeExamRequest);
        if (parsed.includeReturn !== undefined) setIncludeReturn(parsed.includeReturn);
        if (parsed.includeReferral !== undefined) setIncludeReferral(parsed.includeReferral);
      }
    } catch (e) {
      console.warn('Erro ao restaurar rascunho:', e);
    }
  }, [appointment.id]);

  // 2. Autosave automático e silencioso a cada alteração
  React.useEffect(() => {
    try {
      const stateToSave = {
        evolution,
        certificate,
        prescription,
        examRequest,
        returnAppt,
        referral,
        includeEvolution,
        includeCertificate,
        includePrescription,
        includeExamRequest,
        includeReturn,
        includeReferral
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      // Ignora erro de quota de localStorage
    }
  }, [evolution, certificate, prescription, examRequest, returnAppt, referral, includeEvolution, includeCertificate, includePrescription, includeExamRequest, includeReturn, includeReferral, DRAFT_KEY]);

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // Prevenção rigorosa de duplo clique

    try {
      setSubmitting(true);

      const payload: any = { saveOnly: true };

      if (evolution.clinicalEvolution.trim() || evolution.technicalNotes.trim()) {
        payload.evolution = {
          ...evolution,
          clinicalEvolution: evolution.clinicalEvolution.trim() || 'Atendimento clínico registrado.',
          odontogramData: clinicalData?.odontogramData,
          toothChanges: clinicalData?.toothChanges,
          moduleType: clinicalData?.moduleType,
          moduleData: clinicalData?.moduleData,
          assessmentData: clinicalData?.assessmentData
        };
      }

      if (clinicalData?.odontogramData || (clinicalData?.toothChanges && clinicalData.toothChanges.length > 0) || clinicalData?.moduleType) {
        if (!payload.evolution) {
          payload.evolution = {
            title: evolution.title || `Consulta de ${appointment.service_name || 'Rotina'}`,
            clinicalEvolution: evolution.clinicalEvolution.trim() || 'Atendimento clínico concluído.',
            technicalNotes: evolution.technicalNotes || '',
            isSealed: evolution.isSealed,
            odontogramData: clinicalData?.odontogramData,
            toothChanges: clinicalData?.toothChanges,
            moduleType: clinicalData?.moduleType,
            moduleData: clinicalData?.moduleData,
            assessmentData: clinicalData?.assessmentData
          };
        } else {
          payload.evolution.odontogramData = clinicalData?.odontogramData;
          payload.evolution.toothChanges = clinicalData?.toothChanges;
          payload.evolution.moduleType = clinicalData?.moduleType;
          payload.evolution.moduleData = clinicalData?.moduleData;
          payload.evolution.assessmentData = clinicalData?.assessmentData;
        }
      }

      if (includeCertificate) {
        payload.certificate = {
          patientId: appointment.patient_id,
          appointmentId: appointment.id,
          professionalId: appointment.professional_id,
          ...certificate
        };
      }

      if (includePrescription && prescription.content.trim()) {
        payload.prescription = {
          patientId: appointment.patient_id,
          appointmentId: appointment.id,
          professionalId: appointment.professional_id,
          ...prescription
        };
      }

      if (includeExamRequest && examRequest.examsList.trim()) {
        payload.examRequest = {
          patientId: appointment.patient_id,
          appointmentId: appointment.id,
          professionalId: appointment.professional_id,
          ...examRequest
        };
      }

      if (includeReturn && returnAppt.date && returnAppt.time) {
        payload.returnAppointment = {
          startTime: `${returnAppt.date} ${returnAppt.time}:00`,
          endTime: `${returnAppt.date} ${returnAppt.time.split(':')[0]}:45:00`,
          serviceId: appointment.service_id
        };
      }

      if (includeReferral && referral.referralReason) {
        payload.referral = referral;
      }

      const res = await ApiClient.post<any>(`/v1/appointments/${appointment.id}/finish`, payload);
      
      setReceipt(res);
    } catch (err: any) {
      console.error('Falha ao finalizar atendimento:', err);
      // NUNCA apaga os campos preenchidos
      showToast(
        err.message || 'Não foi possível finalizar o atendimento. Nenhuma informação foi perdida. Tente novamente ou entre em contato com o suporte.',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) return <ConsultationPaymentModal appointmentId={appointment.id} initialPayment={receipt.payment}
    onClose={onClose} onFinished={(result) => {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(`zemda_quick_consult_${appointment.id}`);
      setReceipt(null);
      setCompletionSummary({
        hasEvolution: !!receipt.generatedDocs?.recordId, hasCertificate: !!receipt.generatedDocs?.certificateId,
        hasPrescription: !!receipt.generatedDocs?.prescriptionId, hasExamRequest: !!receipt.generatedDocs?.examRequestId,
        hasReturn: !!receipt.generatedDocs?.returnAppointmentId, hasReferral: includeReferral,
        generatedDocs: result.generatedDocs || receipt.generatedDocs
      });
      showToast('Atendimento finalizado e recebimento registrado.', 'success');
    }} />;

  if (completionSummary) {
    return (
      <>
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 p-6 text-center space-y-5">
            <div className="w-14 h-14 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900">Atendimento Finalizado com Sucesso!</h2>
              <p className="text-xs text-slate-500 mt-1">
                Consulta de <strong>{appointment.patient_name || 'Paciente'}</strong> concluída e arquivada no histórico.
              </p>
            </div>

            {/* Checklist de Resumo */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2 text-xs text-slate-700">
              <div className="flex items-center gap-2 text-emerald-700 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Atendimento finalizado na agenda</span>
              </div>
              {completionSummary.hasEvolution && (
                <div className="flex items-center gap-2 text-emerald-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Evolução clínica arquivada com lacre legal</span>
                </div>
              )}
              {completionSummary.hasCertificate && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-emerald-700 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Atestado médico emitido</span>
                  </span>
                  {completionSummary.generatedDocs?.certificateId && (
                    <button
                      type="button"
                      onClick={() => setPrintDoc({ type: 'certificate', id: completionSummary.generatedDocs.certificateId })}
                      className="text-[11px] font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 bg-teal-50 px-2 py-1 rounded-lg border border-teal-200"
                    >
                      <Printer className="w-3 h-3" /> Imprimir A4
                    </button>
                  )}
                </div>
              )}
              {completionSummary.hasPrescription && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-emerald-700 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Receituário gerado</span>
                  </span>
                  {completionSummary.generatedDocs?.prescriptionId && (
                    <button
                      type="button"
                      onClick={() => setPrintDoc({ type: 'prescription', id: completionSummary.generatedDocs.prescriptionId })}
                      className="text-[11px] font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 bg-teal-50 px-2 py-1 rounded-lg border border-teal-200"
                    >
                      <Printer className="w-3 h-3" /> Imprimir A4
                    </button>
                  )}
                </div>
              )}
              {completionSummary.hasExamRequest && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-emerald-700 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Pedido de exame emitido</span>
                  </span>
                  {completionSummary.generatedDocs?.examRequestId && (
                    <button
                      type="button"
                      onClick={() => setPrintDoc({ type: 'exam_request', id: completionSummary.generatedDocs.examRequestId })}
                      className="text-[11px] font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 bg-teal-50 px-2 py-1 rounded-lg border border-teal-200"
                    >
                      <Printer className="w-3 h-3" /> Imprimir A4
                    </button>
                  )}
                </div>
              )}
              {completionSummary.hasReturn && (
                <div className="flex items-center gap-2 text-emerald-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Consulta de retorno agendada na data selecionada</span>
                </div>
              )}
              {completionSummary.hasReferral && (
                <div className="flex items-center gap-2 text-emerald-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Encaminhamento registrado</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setCompletionSummary(null);
                onFinished();
              }}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
            >
              Concluir e Voltar
            </button>
          </div>
        </div>

        {printDoc && (
          <PrintableDocumentModal
            documentType={printDoc.type}
            documentId={printDoc.id}
            onClose={() => setPrintDoc(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
        <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-700 via-indigo-900 to-slate-900 text-white p-6 flex items-start justify-between">
            <div>
              <span className="text-xs font-bold text-teal-300 uppercase tracking-widest">
                Encerramento de Consulta
              </span>
              <h2 className="text-xl font-bold tracking-tight text-white mt-0.5">
                Finalizar Atendimento: {appointment.patient_name || 'Paciente'}
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                Serviço: <strong>{appointment.service_name}</strong> • Profissional: <strong>{appointment.professional_name}</strong>
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-white/10 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleFinish} className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
            {/* Checklist de Itens para Finalizar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Selecione as ações complementares desta consulta:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                  includeEvolution ? 'border-teal-500 bg-teal-50/40 text-teal-900 font-bold' : 'border-slate-200 text-slate-600'
                }`}>
                  <input
                    type="checkbox"
                    checked={includeEvolution}
                    onChange={e => setIncludeEvolution(e.target.checked)}
                    className="rounded text-teal-600"
                  />
                  <span>Evolução Clínica</span>
                </label>

                <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                  includeCertificate ? 'border-indigo-500 bg-indigo-50/40 text-indigo-900 font-bold' : 'border-slate-200 text-slate-600'
                }`}>
                  <input
                    type="checkbox"
                    checked={includeCertificate}
                    onChange={e => setIncludeCertificate(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>Atestado Médico</span>
                </label>

                <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                  includePrescription ? 'border-emerald-500 bg-emerald-50/40 text-emerald-900 font-bold' : 'border-slate-200 text-slate-600'
                }`}>
                  <input
                    type="checkbox"
                    checked={includePrescription}
                    onChange={e => setIncludePrescription(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <span>Receituário</span>
                </label>

                <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                  includeExamRequest ? 'border-blue-500 bg-blue-50/40 text-blue-900 font-bold' : 'border-slate-200 text-slate-600'
                }`}>
                  <input
                    type="checkbox"
                    checked={includeExamRequest}
                    onChange={e => setIncludeExamRequest(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Pedido de Exames</span>
                </label>

                <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                  includeReturn ? 'border-amber-500 bg-amber-50/40 text-amber-900 font-bold' : 'border-slate-200 text-slate-600'
                }`}>
                  <input
                    type="checkbox"
                    checked={includeReturn}
                    onChange={e => setIncludeReturn(e.target.checked)}
                    className="rounded text-amber-600"
                  />
                  <span>Agendar Retorno</span>
                </label>

                <label className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                  includeReferral ? 'border-purple-500 bg-purple-50/40 text-purple-900 font-bold' : 'border-slate-200 text-slate-600'
                }`}>
                  <input
                    type="checkbox"
                    checked={includeReferral}
                    onChange={e => setIncludeReferral(e.target.checked)}
                    className="rounded text-purple-600"
                  />
                  <span>Encaminhamento</span>
                </label>
              </div>
            </div>

            {/* SEÇÃO 1: EVOLUÇÃO */}
            {includeEvolution && (
              <div className="bg-white p-5 rounded-2xl border border-teal-200 shadow-xs space-y-3 text-xs animate-in fade-in">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-600" /> Evolução no Prontuário
                </h3>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Título</label>
                  <input
                    type="text"
                    value={evolution.title}
                    onChange={e => setEvolution({ ...evolution, title: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Notas Clínicas / Conduta *</label>
                  <textarea
                    rows={4}
                    value={evolution.clinicalEvolution}
                    onChange={e => setEvolution({ ...evolution, clinicalEvolution: e.target.value })}
                    placeholder="Descreva a evolução deste atendimento, exame físico, hipóteses e orientações..."
                    className="w-full px-3 py-2 border rounded-xl font-mono text-xs"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="sealFinalRecord"
                    checked={evolution.isSealed}
                    onChange={e => setEvolution({ ...evolution, isSealed: e.target.checked })}
                    className="rounded text-teal-600"
                  />
                  <label htmlFor="sealFinalRecord" className="text-slate-700 font-medium">
                    Lacrar evolução imediatamente (garantia de conformidade e integridade legal)
                  </label>
                </div>
              </div>
            )}

            {/* SEÇÃO 2: ATESTADO */}
            {includeCertificate && (
              <div className="bg-white p-5 rounded-2xl border border-indigo-200 shadow-xs space-y-3 text-xs animate-in fade-in">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> Atestado Médico
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Finalidade *</label>
                    <select
                      value={certificate.certificateType}
                      onChange={e => setCertificate({ ...certificate, certificateType: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    >
                      <option value="rest">Repouso / Afastamento</option>
                      <option value="attendance">Comparecimento</option>
                      <option value="fitness">Aptidão Física / Laboral</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Dias de Afastamento</label>
                    <input
                      type="number"
                      min={1}
                      value={certificate.daysOff}
                      onChange={e => setCertificate({ ...certificate, daysOff: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">CID-10 (Opcional c/ consentimento)</label>
                    <input
                      type="text"
                      value={certificate.cidCode}
                      onChange={e => setCertificate({ ...certificate, cidCode: e.target.value })}
                      placeholder="Ex: J06.9"
                      className="w-full px-3 py-2 border rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 3: RECEITUÁRIO */}
            {includePrescription && (
              <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-xs space-y-3 text-xs animate-in fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Pill className="w-4 h-4 text-emerald-600" /> Receituário Médico
                  </h3>
                  <select
                    value={prescription.prescriptionType}
                    onChange={e => setPrescription({ ...prescription, prescriptionType: e.target.value })}
                    className="px-2.5 py-1 border rounded-lg font-medium text-slate-700"
                  >
                    <option value="simple">Receita Simples</option>
                    <option value="control">Controle Especial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Medicamentos, Posologia e Orientações *</label>
                  <textarea
                    rows={4}
                    value={prescription.content}
                    onChange={e => setPrescription({ ...prescription, content: e.target.value })}
                    placeholder="1. Paracetamol 750mg ----------- 1 comprimido VO a cada 6h se dor ou febre&#10;2. Amoxicilina 500mg ---------- 1 cápsula VO a cada 8h por 7 dias"
                    className="w-full px-3 py-2 border rounded-xl font-mono text-xs"
                  />
                </div>
              </div>
            )}

            {/* SEÇÃO 4: PEDIDO DE EXAMES */}
            {includeExamRequest && (
              <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-xs space-y-3 text-xs animate-in fade-in">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" /> Solicitação de Exames
                </h3>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Exames Solicitados *</label>
                  <textarea
                    rows={3}
                    value={examRequest.examsList}
                    onChange={e => setExamRequest({ ...examRequest, examsList: e.target.value })}
                    placeholder="Ex: Hemograma completo, Glicemia de jejum, Perfil lipídico, TSH..."
                    className="w-full px-3 py-2 border rounded-xl font-mono text-xs"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-bold mb-1">Indicação Clínica (Opcional)</label>
                    <input
                      type="text"
                      value={examRequest.clinicalIndication}
                      onChange={e => setExamRequest({ ...examRequest, clinicalIndication: e.target.value })}
                      placeholder="Ex: Avaliação pré-operatória, Investigação diagnóstica"
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">CID-10 (Opcional)</label>
                    <input
                      type="text"
                      value={examRequest.cidCode}
                      onChange={e => setExamRequest({ ...examRequest, cidCode: e.target.value.toUpperCase() })}
                      placeholder="Ex: I10, E11"
                      className="w-full px-3 py-2 border rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 5: RETORNO */}
            {includeReturn && (
              <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-xs space-y-3 text-xs animate-in fade-in">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-600" /> Consulta de Retorno
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Data Prevista *</label>
                    <input
                      type="date"
                      value={returnAppt.date}
                      onChange={e => setReturnAppt({ ...returnAppt, date: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Horário Previsto *</label>
                    <input
                      type="time"
                      value={returnAppt.time}
                      onChange={e => setReturnAppt({ ...returnAppt, time: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO 6: ENCAMINHAMENTO */}
            {includeReferral && (
              <div className="bg-white p-5 rounded-2xl border border-purple-200 shadow-xs space-y-3 text-xs animate-in fade-in">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-purple-600" /> Encaminhamento
                </h3>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Motivo do Encaminhamento *</label>
                  <textarea
                    rows={2}
                    value={referral.referralReason}
                    onChange={e => setReferral({ ...referral, referralReason: e.target.value })}
                    placeholder="Descreva o motivo do encaminhamento para outra especialidade..."
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {submitting ? 'Finalizando...' : 'Concluir Atendimento'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal de Impressão de Documento Emitido */}
      {printDoc && (
        <PrintableDocumentModal
          documentType={printDoc.type}
          documentId={printDoc.id}
          onClose={() => {
            setPrintDoc(null);
            onFinished();
          }}
        />
      )}
    </>
  );
};
