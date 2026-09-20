import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  X,
  Printer,
  FileText,
  Apple,
  Activity,
  Dumbbell,
  Clock,
  Calendar,
  CheckCircle2,
  ShieldCheck,
  User,
  Heart,
  AlertCircle
} from 'lucide-react';
import {
  ClinicDocumentHeader,
  ClinicDocumentFooter,
  useClinicDocumentData,
  DigitalStampInfo
} from '../common/ClinicDocumentHeader';
import { SignatureChoiceModal } from '../common/SignatureChoiceModal';

export interface PatientFollowUpDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  professionalName?: string;
  professionalCouncil?: string;
  serviceName?: string;
  moduleType?: string;
  initialGuidelines?: string;
  mealPlanText?: string;
  homeExercisesText?: string;
  homeActivitiesText?: string;
}

export const PatientFollowUpDocumentModal: React.FC<PatientFollowUpDocumentModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  appointmentId,
  professionalName,
  professionalCouncil,
  serviceName,
  moduleType,
  initialGuidelines = '',
  mealPlanText = '',
  homeExercisesText = '',
  homeActivitiesText = ''
}) => {
  const { showToast } = useToast();
  const printSheetRef = useRef<HTMLDivElement>(null);

  const { clinic: clinicData, loading: clinicLoading, error: clinicError, canIssue: canIssueClinic } = useClinicDocumentData();
  const [patientDetails, setPatientDetails] = useState<any>(null);

  const hasProfessional = Boolean(professionalName && professionalName.trim().length > 0);
  const canPrint = canIssueClinic && hasProfessional;

  // Editable sections for the handout
  const [generalGuidelines, setGeneralGuidelines] = useState<string>(
    initialGuidelines || 'Seguir as orientações terapêuticas combinadas em consulta. Em caso de dúvidas ou sintomas atípicos, entre em contato com a equipe.'
  );
  const [mealPlan, setMealPlan] = useState<string>(mealPlanText);
  const [homeExercises, setHomeExercises] = useState<string>(homeExercisesText);
  const [homeActivities, setHomeActivities] = useState<string>(homeActivitiesText);
  const [nextAppointmentNote, setNextAppointmentNote] = useState<string>('');
  const [showSignatureChoice, setShowSignatureChoice] = useState<boolean>(false);
  const [digitalStamp, setDigitalStamp] = useState<DigitalStampInfo | null>(null);

  useEffect(() => {
    async function loadPatient() {
      try {
        if (patientId) {
          const pat = await ApiClient.get<any>(`/v1/patients/${patientId}`);
          setPatientDetails(pat);
        }
      } catch (err) {
        console.warn('Erro ao carregar dados do paciente:', err);
      }
    }
    if (isOpen && patientId) {
      loadPatient();
    }
  }, [isOpen, patientId]);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (!canIssueClinic) {
      showToast('Não foi possível carregar os dados da clínica emissora. Impressão bloqueada.', 'error');
      return;
    }
    if (!hasProfessional) {
      showToast('Profissional responsável não identificado. Impressão bloqueada.', 'error');
      return;
    }
    if (!printSheetRef.current) return;
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) {
      showToast('Por favor, autorize pop-ups para imprimir o acompanhamento.', 'info');
      return;
    }

    const title = `Acompanhamento_${patientName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;
    const contentHtml = printSheetRef.current.innerHTML;

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 15mm 15mm 15mm;
          }
          body {
            background-color: #ffffff;
            color: #0f172a;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0;
            padding: 0;
          }
          .a4-page {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
            background: #ffffff;
            box-sizing: border-box;
          }
          @media print {
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="no-print p-4 bg-slate-100 border-b border-slate-200 text-center">
          <button onclick="window.print()" class="px-6 py-2.5 bg-teal-600 text-white font-bold rounded-xl text-sm shadow hover:bg-teal-700 cursor-pointer">
            Imprimir / Salvar como PDF
          </button>
        </div>
        <div class="a4-page p-6">
          ${contentHtml}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const todayStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Modal */}
        <div className="bg-gradient-to-r from-teal-700 via-teal-800 to-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-teal-300">
              <Heart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Documento de Acompanhamento para o Paciente
              </h2>
              <p className="text-xs text-teal-200">
                Orientações domiciliares, plano de cuidados e rotina prescrita (Formato A4 limpo)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canPrint}
              onClick={handlePrint}
              className={`inline-flex items-center gap-1.5 px-4 py-2 font-bold text-xs rounded-xl shadow-xs transition-colors ${
                canPrint
                  ? 'bg-white text-teal-900 hover:bg-teal-50 cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              title={
                !canIssueClinic
                  ? 'Não foi possível carregar os dados da clínica emissora'
                  : !hasProfessional
                  ? 'Profissional responsável não identificado'
                  : 'Imprimir / PDF A4'
              }
            >
              <Printer className="w-4 h-4 text-teal-700" />
              <span>Imprimir / PDF A4</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Informative Banner */}
        <div className="bg-teal-50 px-6 py-2.5 border-b border-teal-100 flex items-center gap-2 text-xs text-teal-900">
          <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
          <span>
            <strong>Privacidade Clínica Garantida:</strong> Este documento omite anotações sigilosas, diagnósticos internos e testes psicológicos confidenciais, contendo exclusivamente instruções práticas e educativas para o paciente.
          </span>
        </div>

        {/* Error Warning Banner if cannot issue */}
        {!canPrint && (
          <div className="bg-rose-50 px-6 py-2.5 border-b border-rose-200 flex items-center gap-2 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              {!canIssueClinic
                ? 'Não foi possível carregar os dados da clínica emissora. A emissão do documento está temporariamente bloqueada.'
                : 'Profissional responsável não identificado. Atribua o profissional responsável para liberar a impressão oficial.'}
            </span>
          </div>
        )}

        {/* Content & Live Preview */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/50">
          
          {/* Edit Controls Column (col 5) */}
          <div className="lg:col-span-5 space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">
              Personalizar Conteúdo da Entrega
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Orientações Gerais & Recomendações
              </label>
              <textarea
                rows={3}
                value={generalGuidelines}
                onChange={e => setGeneralGuidelines(e.target.value)}
                placeholder="Instruções sobre hidratação, sono, postura, etc..."
                className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>

            {(moduleType === 'ZemdaNutri' || mealPlanText) && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Apple className="w-3.5 h-3.5 text-emerald-600" />
                  Plano Alimentar / Horários de Refeições
                </label>
                <textarea
                  rows={4}
                  value={mealPlan}
                  onChange={e => setMealPlan(e.target.value)}
                  placeholder="Café da manhã, lanches, almoço, jantar..."
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none font-mono"
                />
              </div>
            )}

            {(moduleType === 'ZemdaFisio' || moduleType === 'ZemdaPersonal' || homeExercisesText) && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-teal-600" />
                  Exercícios Domiciliares / Prescrição de Movimento
                </label>
                <textarea
                  rows={4}
                  value={homeExercises}
                  onChange={e => setHomeExercises(e.target.value)}
                  placeholder="Séries, repetições, cuidados e frequência..."
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none font-mono"
                />
              </div>
            )}

            {(moduleType === 'ZemdaFono' || moduleType === 'ZemdaTO' || homeActivitiesText) && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  Atividades & Treinos Domiciliares
                </label>
                <textarea
                  rows={3}
                  value={homeActivities}
                  onChange={e => setHomeActivities(e.target.value)}
                  placeholder="Estímulos motores, orofaciais ou rotina de autonomia..."
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                Previsão de Retorno / Próximo Encontro
              </label>
              <input
                type="text"
                value={nextAppointmentNote}
                onChange={e => setNextAppointmentNote(e.target.value)}
                placeholder="Ex: Retorno em 15 dias ou conforme agendamento"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Document Preview Sheet (col 7) */}
          <div className="lg:col-span-7 flex justify-center">
            <div
              ref={printSheetRef}
              className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm w-full max-w-[210mm] text-slate-800 font-sans space-y-6"
            >
              {/* Institutional Clinic Header */}
              <ClinicDocumentHeader
                clinic={clinicData}
                loading={clinicLoading}
                error={clinicError}
                documentTitle="GUIA DO PACIENTE"
                documentSubtitle="Acompanhamento Terapêutico"
              />

              {/* Patient and Professional Banner */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Paciente</span>
                  <strong className="text-sm text-slate-900 block">{patientName}</strong>
                  {patientDetails?.birth_date && (
                    <span className="text-slate-500 text-[11px]">
                      Nascimento: {new Date(patientDetails.birth_date).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Profissional Responsável</span>
                  <strong className={`text-sm block ${hasProfessional ? 'text-slate-900' : 'text-rose-600 italic font-semibold'}`}>
                    {hasProfessional ? professionalName : 'Profissional responsável não identificado'}
                  </strong>
                  <span className="text-slate-500 text-[11px]">
                    {professionalCouncil ? `Registro: ${professionalCouncil}` : (serviceName || 'Atendimento Clínico')}
                  </span>
                </div>
              </div>

              {/* Title of the handout */}
              <div className="text-center py-2 border-b border-slate-100">
                <h2 className="text-base font-extrabold text-teal-900 uppercase tracking-wide">
                  Plano de Orientações e Cuidados Domiciliares
                </h2>
                <p className="text-xs text-slate-500">
                  Recomendações terapêuticas personalizadas para continuidade do tratamento
                </p>
              </div>

              {/* General Guidelines */}
              {generalGuidelines.trim() && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                    Orientações Gerais
                  </h3>
                  <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {generalGuidelines}
                  </div>
                </div>
              )}

              {/* Meal Plan */}
              {mealPlan.trim() && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <Apple className="w-3.5 h-3.5 text-emerald-600" />
                    Plano Alimentar & Hidratação
                  </h3>
                  <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-mono">
                    {mealPlan}
                  </div>
                </div>
              )}

              {/* Home Exercises */}
              {homeExercises.trim() && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-teal-600" />
                    Prescrição de Exercícios em Casa
                  </h3>
                  <div className="p-3 bg-teal-50/40 border border-teal-100 rounded-xl text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-mono">
                    {homeExercises}
                  </div>
                </div>
              )}

              {/* Home Activities */}
              {homeActivities.trim() && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    Atividades e Estímulos Diários
                  </h3>
                  <div className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-xl text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {homeActivities}
                  </div>
                </div>
              )}

              {/* Next Appointment Note */}
              {nextAppointmentNote.trim() && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-900">
                  <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
                  <span><strong>Próximo Retorno:</strong> {nextAppointmentNote}</span>
                </div>
              )}

              {/* Footer and Signature */}
              <div className="pt-8 mt-8 border-t border-slate-200 text-center space-y-4">
                {!digitalStamp && (
                  <div className="inline-block border-t border-slate-400 w-64 pt-2">
                    <p className={`font-bold text-xs ${hasProfessional ? 'text-slate-900' : 'text-rose-600 italic'}`}>
                      {hasProfessional ? professionalName : 'Profissional responsável não identificado'}
                    </p>
                    {professionalCouncil && <p className="text-[11px] text-slate-500">{professionalCouncil}</p>}
                  </div>
                )}
                <ClinicDocumentFooter digitalStamp={digitalStamp} />
              </div>

            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-white shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>

          <button
            type="button"
            disabled={!canPrint}
            onClick={() => setShowSignatureChoice(true)}
            className={`inline-flex items-center gap-2 px-6 py-2.5 font-bold text-xs rounded-xl shadow-md transition-all ${
              canPrint
                ? 'bg-teal-600 hover:bg-teal-700 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
            title={
              !canIssueClinic
                ? 'Não foi possível carregar os dados da clínica emissora'
                : !hasProfessional
                ? 'Profissional responsável não identificado'
                : 'Emitir Acompanhamento (Manual ou ICP-Brasil)'
            }
          >
            <Printer className="w-4 h-4" />
            <span>Emitir Acompanhamento (A4)</span>
          </button>
        </div>

      </div>

      {/* Modal Universal de Escolha de Assinatura */}
      <SignatureChoiceModal
        isOpen={showSignatureChoice}
        onClose={() => setShowSignatureChoice(false)}
        documentTitle="Plano de Orientações e Cuidados Domiciliares"
        documentType="clinical_record"
        patientName={patientName}
        professionalName={professionalName}
        professionalCouncil={professionalCouncil}
        rawContent={`${generalGuidelines}\n${mealPlan}\n${homeExercises}\n${homeActivities}`}
        onSelectManualPrint={() => {
          setDigitalStamp(null);
          setTimeout(() => {
            handlePrint();
          }, 150);
        }}
        onSignSuccess={(sigResult) => {
          setDigitalStamp({
            format: 'PAdES',
            isIcpBrasil: true,
            signerName: professionalName,
            signerRegistration: professionalCouncil,
            issuer: sigResult.validationResult?.issuer || 'AC SOLUTI Multipla v5 (ICP-Brasil)',
            serialNumber: sigResult.validationResult?.serialNumber,
            signedAt: sigResult.signedAt,
            sha256Hash: sigResult.sha256Hash,
            verificationUrl: sigResult.verificationUrl,
            qrCodeSvg: sigResult.qrCodeSvg,
            qrCodeDataUrl: sigResult.qrCodeDataUrl
          });
          setTimeout(() => {
            handlePrint();
          }, 300);
        }}
      />
    </div>
  );
};
