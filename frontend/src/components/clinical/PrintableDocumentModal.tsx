import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { X, Printer, Download, Eye, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { formatDoctorName } from '../../utils/formatters';
import { SignatureChoiceModal } from '../common/SignatureChoiceModal';

export interface PrintableDocumentModalProps {
  documentType: 'certificate' | 'prescription' | 'exam_request' | 'pending_exam';
  documentId: string;
  onClose: () => void;
  initialAction?: 'view' | 'print' | 'pdf';
}

export const PrintableDocumentModal: React.FC<PrintableDocumentModalProps> = ({
  documentType,
  documentId,
  onClose,
  initialAction
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<any>(null);
  const [digitalSignature, setDigitalSignature] = useState<any>(null);
  const [showSignatureChoice, setShowSignatureChoice] = useState<boolean>(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggeredActionRef = useRef<boolean>(false);

  const parsedStamp = React.useMemo(() => {
    if (!digitalSignature?.pades_visual_stamp_json) return null;
    try {
      return typeof digitalSignature.pades_visual_stamp_json === 'string'
        ? JSON.parse(digitalSignature.pades_visual_stamp_json)
        : digitalSignature.pades_visual_stamp_json;
    } catch {
      return null;
    }
  }, [digitalSignature]);

  useEffect(() => {
    async function loadDocument() {
      try {
        setLoading(true);
        const endpoint =
          documentType === 'certificate' ? `/v1/clinical/certificates/${documentId}` :
          documentType === 'prescription' ? `/v1/clinical/prescriptions/${documentId}` :
          documentType === 'pending_exam' ? `/v1/pending-exams/${documentId}/document` :
          `/v1/clinical/exam-requests/${documentId}`;

        const [res, sigRes] = await Promise.all([
          ApiClient.get<any>(endpoint),
          ApiClient.get<any>(`/v1/digital-signatures/document/${documentType}/${documentId}`).catch(() => null)
        ]);
        setData(res);
        if (sigRes?.signature) {
          setDigitalSignature(sigRes.signature);
        }
      } catch (err: any) {
        showToast('Erro ao carregar documento para impressão', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadDocument();
  }, [documentType, documentId]);

  const getCleanDocTitle = () => {
    const typeLabel =
      documentType === 'certificate' ? 'Atestado' :
      documentType === 'prescription' ? 'Receituario' : 'Pedido_Exame';
    const patientName = (data?.document?.patient_name || 'Paciente').replace(/[^a-zA-Z0-9]/g, '_');
    const today = new Date().toISOString().slice(0, 10);
    return `${typeLabel}_${patientName}_${today}`;
  };

  // Opção 1: Visualizar (Abre em nova guia limpa para pré-visualização completa sem UI)
  const handleVisualizar = () => {
    if (!sheetRef.current || !data) return;
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) {
      showToast('Aviso: Ative os pop-ups do navegador para abrir a visualização em nova guia.', 'info');
      return;
    }

    const title = getCleanDocTitle();
    const sheetHtml = sheetRef.current.outerHTML;

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
            margin: 15mm;
          }
          body {
            background-color: #f8fafc;
            color: #1e293b;
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .a4-container {
            max-width: 210mm;
            margin: 0 auto;
            background: #ffffff;
            padding: 20mm;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            border-radius: 8px;
          }
          .toolbar {
            position: sticky;
            top: 10px;
            max-width: 210mm;
            margin: 0 auto 16px auto;
            background: #0f172a;
            color: white;
            padding: 10px 20px;
            border-radius: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 999;
          }
          @media print {
            .toolbar { display: none !important; }
            body { padding: 0 !important; background: #ffffff !important; }
            .a4-container { box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <span style="font-weight: bold; font-size: 13px;">👁️ Pré-visualização A4: ${title}</span>
          <div style="display: flex; gap: 8px;">
            <button onclick="window.print()" style="background: #0d9488; color: white; border: none; padding: 6px 16px; border-radius: 8px; font-weight: bold; font-size: 12px; cursor: pointer;">Imprimir / Salvar PDF</button>
            <button onclick="window.close()" style="background: rgba(255,255,255,0.15); color: white; border: none; padding: 6px 12px; border-radius: 8px; font-size: 12px; cursor: pointer;">Fechar</button>
          </div>
        </div>
        <div class="a4-container">
          ${sheetHtml}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Opção 2: Imprimir diretamente
  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = getCleanDocTitle();
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  // Opção 3: Baixar PDF (orientação direta ao destino PDF nativo com nome de arquivo já pré-formatado)
  const handleDownloadPdf = () => {
    const originalTitle = document.title;
    document.title = getCleanDocTitle();
    showToast('Dica: Selecione "Salvar como PDF" como impressora/destino no navegador.', 'info');
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  useEffect(() => {
    if (!loading && data && initialAction && !triggeredActionRef.current) {
      triggeredActionRef.current = true;
      if (initialAction === 'print') {
        setTimeout(() => handlePrint(), 300);
      } else if (initialAction === 'pdf') {
        setTimeout(() => handleDownloadPdf(), 300);
      }
    }
  }, [loading, data, initialAction]);

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
  const clinicAddress = [
    doc.address_street || doc.street ? `${doc.address_street || doc.street}${doc.address_number || doc.number ? `, ${doc.address_number || doc.number}` : ''}` : doc.address || '',
    doc.address_neighborhood || doc.neighborhood || '',
    (doc.address_city || doc.clinic_city || doc.city) ? `${doc.address_city || doc.clinic_city || doc.city}/${doc.address_state || doc.clinic_state || doc.state || ''}` : ''
  ].filter(Boolean).join(' - ');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[96vh] overflow-hidden print:border-none print:shadow-none print:max-h-none print:w-full print:rounded-none">
        {/* Modal Top Bar (3 Opções Distintas: Visualizar, Imprimir, Baixar PDF) - Hidden on print */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-bold text-teal-400 uppercase tracking-widest">
              Documento A4
            </span>
            <span className="text-xs text-slate-500">|</span>
            <span className="text-xs font-semibold text-slate-200 truncate max-w-[200px] sm:max-w-xs">
              {documentType === 'certificate' ? 'Atestado Médico' :
               documentType === 'prescription' ? 'Receituário Clínico' : 'Solicitação de Exames'}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 1. Visualizar */}
            <button
              onClick={handleVisualizar}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
              title="Abrir em visualização limpa de tela cheia / nova guia"
            >
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              Visualizar
            </button>

            {/* 2. Imprimir */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              title="Imprimir documento em papel A4"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>

            {/* 3. Baixar PDF */}
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              title="Baixar ou Salvar como arquivo PDF"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar PDF
            </button>

            {/* 4. Opções de Assinatura */}
            <button
              onClick={() => setShowSignatureChoice(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              title="Opções de Assinatura e Impressão"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Assinatura
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-white/10 transition-all ml-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Aviso não-impeditivo caso o registro profissional não esteja cadastrado */}
        {!doc.registration_number && (
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center justify-between text-xs text-amber-900 print:hidden">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Aviso:</strong> O número de registro profissional (ex.: CRM, CREFITO, CRP) não foi cadastrado. O documento pode ser emitido normalmente, mas o carimbo ficará sem o número do conselho.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'settings' } }));
              }}
              className="text-teal-700 hover:text-teal-900 font-bold underline whitespace-nowrap ml-3 cursor-pointer shrink-0"
            >
              Completar Registro →
            </button>
          </div>
        )}

        {/* Printable Sheet (Simulated A4 Paper) */}
        <div
          id="printable-doc-sheet"
          ref={sheetRef}
          className="flex-1 overflow-y-auto p-8 sm:p-12 bg-white text-slate-800 font-sans print:p-8 print:m-0 print:overflow-visible"
        >
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-slate-500 font-medium block">Paciente:</span>
                  <strong className="text-slate-900 block text-sm">{doc.patient_name}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">CPF:</span>
                  <strong className="text-slate-900 block">{doc.patient_cpf || 'Não informado'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Data de Nascimento:</span>
                  <strong className="text-slate-900 block">{doc.patient_birth ? new Date(doc.patient_birth).toLocaleDateString('pt-BR') : 'Não informada'}</strong>
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
                    <p className="text-xs text-slate-700 bg-slate-100 p-2.5 rounded-lg border border-slate-200 inline-block font-mono">
                      <strong>CID-10:</strong> {doc.cid_code} (Registrado mediante autorização e consentimento expresso do paciente conforme Resolução CFM)
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

              {(documentType === 'exam_request' || documentType === 'pending_exam') && (
                <div className="space-y-4">
                  <p className="font-semibold text-xs text-slate-500 uppercase tracking-wider">
                    Solicito a realização dos seguintes exames laboratoriais / de imagem:
                  </p>
                  <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200 whitespace-pre-wrap font-mono text-sm">
                    {doc.exams_list || doc.exam_name}
                  </div>
                  {(doc.clinical_indication || doc.notes) && (
                    <p className="text-xs text-slate-600">
                      <strong>Indicação Clínica / Observações:</strong> {doc.clinical_indication || doc.notes}
                    </p>
                  )}
                  {doc.cid_code && (
                    <p className="text-xs text-slate-700 bg-slate-100 p-2 rounded-lg inline-block font-mono border border-slate-200">
                      <strong>CID-10:</strong> {doc.cid_code}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Date and Location (Localidade automática da clínica) */}
            <div className="text-right text-xs text-slate-600 mt-8">
              {(doc.clinic_city || doc.address_city || doc.city ? `${doc.clinic_city || doc.address_city || doc.city}${doc.clinic_state || doc.address_state || doc.state ? ` - ${doc.clinic_state || doc.address_state || doc.state}` : ''}` : 'Localidade')}, {new Date(doc.created_at || Date.now()).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.
            </div>

            {/* Professional Signature Block (Dr. / Dra., Especialidade e Registro) */}
            <div className="pt-16 mt-12 flex flex-col items-center justify-center text-center page-break-inside-avoid">
              <div className="w-72 border-t-2 border-slate-800 mb-2" />
              <strong className="text-slate-900 text-sm">
                {doc.professional_name ? formatDoctorName(doc.professional_name, doc.professional_gender) : 'Assinatura e Carimbo do Profissional Solicitante'}
              </strong>
              <span className="text-xs text-slate-600 font-medium">
                {doc.professional_name
                  ? `${doc.specialty || 'Profissional de Saúde'}${doc.registration_number ? ` • ${doc.registration_type || 'CRM'} nº ${doc.registration_number}` : ''}`
                  : (doc.clinic_name || 'Clínica')}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 pt-4 mt-8 text-center text-[10px] text-slate-500 space-y-2 page-break-inside-avoid">
            {parsedStamp ? (
              <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                {parsedStamp.qrCodeDataUrl && (
                  <img
                    src={parsedStamp.qrCodeDataUrl}
                    alt="QR Code de Verificação"
                    className="w-16 h-16 shrink-0 border border-slate-200 rounded-lg p-0.5 bg-white shadow-xs"
                  />
                )}
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-teal-600" />
                    <span>{parsedStamp.title || 'DOCUMENTO ASSINADO DIGITALMENTE'}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-teal-100 text-teal-800 font-bold">
                      {parsedStamp.standard || 'ICP-Brasil'}
                    </span>
                  </div>
                  <div className="text-slate-700 font-medium">
                    Signatário: <strong>{parsedStamp.signerName}</strong>
                    {parsedStamp.signerRegistration && <span> • {parsedStamp.signerRegistration}</span>}
                    {parsedStamp.signedAt && <span> em {new Date(parsedStamp.signedAt).toLocaleString('pt-BR')}</span>}
                  </div>
                  <div className="font-mono text-[9px] text-slate-500 break-all">
                    Hash SHA-256: {parsedStamp.hashSha256}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    Validação pública: <a href={parsedStamp.verificationUrl} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline font-semibold">{parsedStamp.verificationUrl}</a>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                Documento emitido através da Plataforma Zemda • Válido mediante assinatura física do profissional responsável.
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 15mm;
        }
        @media print {
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-doc-sheet,
          #printable-doc-sheet * {
            visibility: visible !important;
          }
          #printable-doc-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm 15mm !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
          }
          .page-break-inside-avoid {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
      {showSignatureChoice && (
        <SignatureChoiceModal
          isOpen={showSignatureChoice}
          onClose={() => setShowSignatureChoice(false)}
          documentType={documentType === 'pending_exam' ? 'exam_request' : documentType}
          documentId={documentId}
          documentTitle={
            documentType === 'certificate' ? 'Atestado Médico' :
            documentType === 'prescription' ? 'Receituário Clínico' : 'Solicitação de Exames'
          }
          patientName={doc?.patient_name}
          onSelectManualPrint={() => {
            setShowSignatureChoice(false);
            handlePrint();
          }}
          onSignSuccess={(res) => {
            if (res?.signature) {
              setDigitalSignature(res.signature);
            }
            setShowSignatureChoice(false);
            showToast('Documento assinado com sucesso com ICP-Brasil!', 'success');
          }}
        />
      )}
    </div>
  );
};
