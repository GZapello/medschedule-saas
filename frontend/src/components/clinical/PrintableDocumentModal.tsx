import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { X, Printer, Download, CheckCircle2, AlertCircle } from 'lucide-react';

interface PrintableDocumentModalProps {
  documentType: 'certificate' | 'prescription' | 'exam_request';
  documentId: string;
  onClose: () => void;
}

export const PrintableDocumentModal: React.FC<PrintableDocumentModalProps> = ({
  documentType,
  documentId,
  onClose
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    async function loadDocument() {
      try {
        setLoading(true);
        const endpoint =
          documentType === 'certificate' ? `/v1/clinical/certificates/${documentId}` :
          documentType === 'prescription' ? `/v1/clinical/prescriptions/${documentId}` :
          `/v1/clinical/exam-requests/${documentId}`;

        const res = await ApiClient.get<any>(endpoint);
        setData(res);
      } catch (err: any) {
        showToast('Erro ao carregar documento para impressão', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadDocument();
  }, [documentType, documentId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading || !data) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center gap-3 text-slate-700">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold">Formatando documento A4...</span>
        </div>
      </div>
    );
  }

  const { document: doc, template } = data;
  const clinicAddress = `${doc.address_street || ''}, ${doc.address_number || ''} - ${doc.address_neighborhood || ''}, ${doc.address_city || ''}/${doc.address_state || ''}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[96vh] overflow-hidden print:border-none print:shadow-none print:max-h-none print:w-full print:rounded-none">
        {/* Modal Top Bar (Hidden on print) */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-teal-400 uppercase tracking-widest">
              Visualização A4
            </span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs font-semibold text-slate-200">
              {documentType === 'certificate' ? 'Atestado Médico' :
               documentType === 'prescription' ? 'Receituário Clínico' : 'Solicitação de Exames'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Salvar PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-white/10 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Sheet (Simulated A4 Paper) */}
        <div className="flex-1 overflow-y-auto p-8 sm:p-12 bg-white text-slate-800 font-sans print:p-8 print:m-0 print:overflow-visible">
          {/* Clinic Header */}
          <div className="border-b-2 border-slate-800 pb-6 mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {doc.logo_url && (
                <img src={doc.logo_url} alt="Logo" className="w-16 h-16 object-contain rounded-xl" />
              )}
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">{doc.clinic_name}</h1>
                <p className="text-xs text-slate-600 mt-0.5">{clinicAddress}</p>
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-3">
                  {doc.clinic_cnpj && <span>CNPJ: {doc.clinic_cnpj}</span>}
                  {doc.clinic_phone && <span>Tel: {doc.clinic_phone}</span>}
                  {doc.clinic_email && <span>E-mail: {doc.clinic_email}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Document Content */}
          <div className="my-8 space-y-6">
            {/* Title */}
            <div className="text-center">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-wider">
                {documentType === 'certificate' ? 'Atestado Médico' :
                 documentType === 'prescription' ? 'Receituário' : 'Solicitação de Exames'}
              </h2>
              {doc.certificate_type && (
                <span className="text-xs text-slate-500 font-medium">
                  {doc.certificate_type === 'rest' ? 'Repouso e Afastamento das Atividades' :
                   doc.certificate_type === 'attendance' ? 'Declaração de Comparecimento' : 'Aptidão'}
                </span>
              )}
            </div>

            {/* Patient Header Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500 font-medium">Paciente:</span>
                  <strong className="text-slate-900 block text-sm">{doc.patient_name}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">CPF:</span>
                  <strong className="text-slate-900 block">{doc.patient_cpf || 'Não informado'}</strong>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="text-sm leading-relaxed text-slate-800 min-h-[220px] py-4">
              {documentType === 'certificate' && (
                <div className="space-y-4">
                  <p className="indent-8 text-justify">
                    Atesto para os devidos fins que o(a) paciente <strong>{doc.patient_name}</strong> esteve sob meus cuidados profissionais nesta data
                    {doc.days_off ? `, devendo permanecer em repouso e afastado(a) de suas atividades laborais e/ou escolares por um período de ${doc.days_off} dia(s), a contar de ${doc.start_date ? new Date(doc.start_date).toLocaleDateString('pt-BR') : 'hoje'}.` : '.'}
                  </p>
                  {doc.cid_code && (
                    <p className="text-xs text-slate-600 bg-slate-100 p-2 rounded-lg inline-block font-mono">
                      CID-10: {doc.cid_code} (Registrado mediante consentimento do paciente)
                    </p>
                  )}
                  {doc.notes && (
                    <p className="text-xs text-slate-600 italic">
                      Observações: {doc.notes}
                    </p>
                  )}
                </div>
              )}

              {documentType === 'prescription' && (
                <div className="space-y-4 font-mono text-sm bg-slate-50/50 p-6 rounded-2xl border border-slate-200 whitespace-pre-wrap">
                  {doc.content}
                </div>
              )}

              {documentType === 'exam_request' && (
                <div className="space-y-4">
                  <p className="font-semibold text-xs text-slate-500 uppercase tracking-wider">
                    Solicito a realização dos seguintes exames laboratoriais / de imagem:
                  </p>
                  <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200 whitespace-pre-wrap font-mono text-sm">
                    {doc.exams_list}
                  </div>
                  {doc.clinical_indication && (
                    <p className="text-xs text-slate-600">
                      <strong>Indicação Clínica:</strong> {doc.clinical_indication}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Date and Location */}
            <div className="text-right text-xs text-slate-600 mt-8">
              {doc.address_city || 'Localidade'}, {new Date(doc.created_at || Date.now()).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.
            </div>

            {/* Professional Signature Block */}
            <div className="pt-16 mt-12 flex flex-col items-center justify-center text-center">
              <div className="w-72 border-t-2 border-slate-800 mb-2" />
              <strong className="text-slate-900 text-sm">{doc.professional_name}</strong>
              <span className="text-xs text-slate-600 font-medium">
                {doc.specialty || 'Profissional de Saúde'} • {doc.registration_type || 'CRM'} nº {doc.registration_number || '—'}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 pt-6 mt-16 text-center text-[10px] text-slate-400">
            Documento emitido eletronicamente através do sistema Zemda • Válido com assinatura física ou certificado digital ICP-Brasil.
          </div>
        </div>
      </div>
    </div>
  );
};
