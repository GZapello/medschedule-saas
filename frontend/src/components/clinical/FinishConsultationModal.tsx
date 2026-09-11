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
  onClose: () => void;
  onFinished: () => void;
}

export const FinishConsultationModal: React.FC<FinishConsultationModalProps> = ({
  appointment,
  onClose,
  onFinished
}) => {
  const { showToast } = useToast();
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
    title: `Consulta de ${appointment.service_name || 'Rotina'}`,
    clinicalEvolution: '',
    technicalNotes: '',
    isSealed: false
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
    clinicalIndication: ''
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

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);

      const payload: any = {};

      if (includeEvolution && evolution.clinicalEvolution.trim()) {
        payload.evolution = evolution;
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
      showToast('Atendimento finalizado com sucesso!', 'success');

      // Se gerou receita ou atestado, pergunta ou abre modal de impressão
      if (res.generatedDocs?.certificateId) {
        setPrintDoc({ type: 'certificate', id: res.generatedDocs.certificateId });
      } else if (res.generatedDocs?.prescriptionId) {
        setPrintDoc({ type: 'prescription', id: res.generatedDocs.prescriptionId });
      } else {
        onFinished();
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao finalizar atendimento', 'error');
    } finally {
      setSubmitting(false);
    }
  };

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
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Indicação Clínica (Opcional)</label>
                  <input
                    type="text"
                    value={examRequest.clinicalIndication}
                    onChange={e => setExamRequest({ ...examRequest, clinicalIndication: e.target.value })}
                    placeholder="Ex: Avaliação pré-operatória, Investigação diagnóstica"
                    className="w-full px-3 py-2 border rounded-xl"
                  />
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
