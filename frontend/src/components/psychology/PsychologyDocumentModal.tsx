import React, { useState } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  X,
  FileText,
  AlertTriangle,
  Printer,
  CheckCircle2,
  Send,
  Lock,
  ExternalLink,
  ShieldAlert,
  Info
} from 'lucide-react';

interface PsychologyDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  appointmentId?: string;
  patientName: string;
  hasAssessmentBasis: boolean;
  onDocumentIssued?: () => void;
}

type DocumentType = 'declaracao' | 'atestado' | 'relatorio' | 'relatorio_multiprofissional' | 'laudo' | 'parecer';

const PROHIBITED_DECLARACAO_TERMS = [
  'diagnóstico', 'diagnostico', 'cid-10', 'cid-11', 'dsm-5', 'sintoma',
  'depressão', 'depressao', 'ansiedade', 'transtorno', 'humor disfórico', 'psicopatologia'
];

export const PsychologyDocumentModal: React.FC<PsychologyDocumentModalProps> = ({
  isOpen,
  onClose,
  patientId,
  appointmentId,
  patientName,
  hasAssessmentBasis,
  onDocumentIssued
}) => {
  const { showToast } = useToast();

  const [documentType, setDocumentType] = useState<DocumentType>('declaracao');
  const [purpose, setPurpose] = useState('');
  const [requesterName, setRequesterName] = useState('');

  // Seções estruturadas conforme CFP 06/2019
  const [declaracaoText, setDeclaracaoText] = useState('');
  const [demandDescription, setDemandDescription] = useState('');
  const [procedureDescription, setProcedureDescription] = useState('');
  const [analysisDescription, setAnalysisDescription] = useState('');
  const [conclusionDescription, setConclusionDescription] = useState('');
  const [quesitosParecer, setQuesitosParecer] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [issuedDoc, setIssuedDoc] = useState<any | null>(null);

  // Registro de Entrega
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [deliveryRecipient, setDeliveryRecipient] = useState(patientName);
  const [deliveryChannel, setDeliveryChannel] = useState<'em_maos' | 'email' | 'portal' | 'outro'>('em_maos');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submittingDelivery, setSubmittingDelivery] = useState(false);
  const [deliveryRegistered, setDeliveryRegistered] = useState(false);

  if (!isOpen) return null;

  // Validação em tempo real de termos clínicos na Declaração
  const declaracaoViolations = documentType === 'declaracao'
    ? PROHIBITED_DECLARACAO_TERMS.filter(term =>
        (declaracaoText + ' ' + purpose).toLowerCase().includes(term)
      )
    : [];

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!purpose.trim()) {
      showToast('Informe a finalidade do documento.', 'error');
      return;
    }
    if (!requesterName.trim()) {
      showToast('Informe o solicitante ou interessado.', 'error');
      return;
    }

    if (documentType === 'laudo' && !hasAssessmentBasis) {
      showToast('O Laudo Psicológico exige processo formal de Avaliação Psicológica previamente registrado (CFP 06/2019).', 'error');
      return;
    }

    if (documentType === 'declaracao' && declaracaoViolations.length > 0) {
      showToast(`A Declaração não pode conter termos clínicos ou diagnósticos (${declaracaoViolations.join(', ')}).`, 'error');
      return;
    }

    let renderedText = '';
    const contentJson: Record<string, any> = {
      purpose,
      requesterName,
      patientName
    };

    if (documentType === 'declaracao') {
      if (!declaracaoText.trim()) {
        showToast('Preencha o texto da declaração.', 'error');
        return;
      }
      renderedText = declaracaoText.trim();
      contentJson.declaracaoText = declaracaoText.trim();
    } else if (documentType === 'atestado') {
      if (!conclusionDescription.trim()) {
        showToast('Preencha o teor do atestado psicológico fundamentado.', 'error');
        return;
      }
      renderedText = `ATESTADO PSICOLÓGICO\n\nAtesto, para fins de ${purpose}, a pedido de ${requesterName}, que a(o) paciente ${patientName} foi submetida(o) a avaliação psicológica perante este serviço.\n\nFundamentação e Conclusão:\n${conclusionDescription.trim()}`;
      contentJson.conclusion = conclusionDescription.trim();
    } else if (documentType === 'parecer') {
      if (!quesitosParecer.trim() || !analysisDescription.trim() || !conclusionDescription.trim()) {
        showToast('Preencha quesitos, análise técnica e conclusão para o Parecer.', 'error');
        return;
      }
      renderedText = `PARECER PSICOLÓGICO\n\n1. IDENTIFICAÇÃO\nPaciente/Objeto: ${patientName}\nSolicitante: ${requesterName}\nFinalidade: ${purpose}\n\n2. EMENTA / QUESITOS\n${quesitosParecer.trim()}\n\n3. ANÁLISE TÉCNICA FUNDAMENTADA\n${analysisDescription.trim()}\n\n4. CONCLUSÃO / RESPOSTA AOS QUESITOS\n${conclusionDescription.trim()}`;
      contentJson.quesitos = quesitosParecer.trim();
      contentJson.analysis = analysisDescription.trim();
      contentJson.conclusion = conclusionDescription.trim();
    } else {
      // Relatório, Relatório Multiprofissional, Laudo
      if (!demandDescription.trim() || !procedureDescription.trim() || !analysisDescription.trim() || !conclusionDescription.trim()) {
        showToast('Todos os 5 itens estruturados do documento são obrigatórios (CFP 06/2019).', 'error');
        return;
      }
      const titleLabel = documentType === 'laudo'
        ? 'LAUDO PSICOLÓGICO'
        : documentType === 'relatorio_multiprofissional'
        ? 'RELATÓRIO MULTIPROFISSIONAL'
        : 'RELATÓRIO PSICOLÓGICO';

      renderedText = `${titleLabel}\n\n1. IDENTIFICAÇÃO\nPaciente: ${patientName}\nSolicitante: ${requesterName}\nFinalidade: ${purpose}\n\n2. DESCRIÇÃO DA DEMANDA\n${demandDescription.trim()}\n\n3. PROCEDIMENTO\n${procedureDescription.trim()}\n\n4. ANÁLISE\n${analysisDescription.trim()}\n\n5. CONCLUSÃO\n${conclusionDescription.trim()}`;
      contentJson.demand = demandDescription.trim();
      contentJson.procedure = procedureDescription.trim();
      contentJson.analysis = analysisDescription.trim();
      contentJson.conclusion = conclusionDescription.trim();
    }

    try {
      setSubmitting(true);
      const res: any = await ApiClient.post('/v1/psychology/documents', {
        patientId,
        appointmentId,
        documentType,
        purpose,
        requesterName,
        contentJson,
        renderedText
      });

      setIssuedDoc(res);
      showToast('Documento psicológico emitido e selado com sucesso!', 'success');
      if (onDocumentIssued) onDocumentIssued();
    } catch (err: any) {
      showToast(err.message || 'Erro ao emitir documento psicológico.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issuedDoc?.documentId) return;

    try {
      setSubmittingDelivery(true);
      await ApiClient.post(`/v1/psychology/documents/${issuedDoc.documentId}/delivery`, {
        recipientName: deliveryRecipient,
        deliveryChannel,
        notes: deliveryNotes
      });
      setDeliveryRegistered(true);
      showToast('Comprovante de entrega formalizado no prontuário!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar entrega.', 'error');
    } finally {
      setSubmittingDelivery(false);
    }
  };

  const handlePrint = (docId: string) => {
    window.open(`/api/v1/psychology/documents/${docId}/print`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8 overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-teal-800 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <FileText className="w-5 h-5 text-teal-300" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Emissão de Documento Psicológico</h2>
              <p className="text-xs text-teal-200">
                Resolução CFP nº 06/2019 e Manual CFP 2025 • Assinatura e Carimbo SHA-256
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sucesso / Pós-Emissão */}
        {issuedDoc ? (
          <div className="p-6 overflow-y-auto space-y-6">
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 text-center space-y-3">
              <div className="w-12 h-12 bg-teal-600 text-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-teal-900">Documento Emitido e Selado com Sucesso</h3>
                <p className="text-xs text-teal-700 mt-1">
                  Número de Registro Oficial: <strong className="font-mono text-sm">{issuedDoc.documentNumber}</strong>
                </p>
                <p className="text-xs font-mono text-slate-500 mt-1 break-all">
                  Hash SHA-256: {issuedDoc.signatureHash}
                </p>
              </div>

              <div className="pt-2 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handlePrint(issuedDoc.documentId)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> Visualizar / Imprimir PDF Oficial
                </button>
                {!deliveryRegistered && !showDeliveryForm && (
                  <button
                    type="button"
                    onClick={() => setShowDeliveryForm(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    <Send className="w-4 h-4" /> Registrar Entrega ao Paciente/Solicitante
                  </button>
                )}
              </div>
            </div>

            {/* Formulário de Registro de Entrega */}
            {showDeliveryForm && !deliveryRegistered && (
              <form onSubmit={handleRegisterDelivery} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                  <Info className="w-4 h-4 text-teal-600" />
                  <span>Comprovante de Entrega de Documento Psicológico (CFP 06/2019)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Nome de quem recebeu</label>
                    <input
                      type="text"
                      value={deliveryRecipient}
                      onChange={e => setDeliveryRecipient(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Canal de Entrega</label>
                    <select
                      value={deliveryChannel}
                      onChange={e => setDeliveryChannel(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="em_maos">Em mãos (Cópia física assinada)</option>
                      <option value="email">E-mail institucional seguro/criptografado</option>
                      <option value="portal">Portal do Paciente</option>
                      <option value="outro">Outro meio formal</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">Observações do Protocolo</label>
                    <textarea
                      value={deliveryNotes}
                      onChange={e => setDeliveryNotes(e.target.value)}
                      placeholder="Ex: Entregue cópia com protocolo assinado fisicamente, arquivado em prontuário."
                      rows={2}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeliveryForm(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Agora não
                  </button>
                  <button
                    type="submit"
                    disabled={submittingDelivery}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    {submittingDelivery ? 'Registrando...' : 'Salvar Registro de Entrega'}
                  </button>
                </div>
              </form>
            )}

            {deliveryRegistered && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Comprovante de entrega protocolado com sucesso no histórico do prontuário.</span>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Concluir e Fechar
              </button>
            </div>
          </div>
        ) : (
          /* Formulário de Redação do Documento */
          <form onSubmit={handleCreateDocument} className="p-6 overflow-y-auto space-y-5 flex-1">
            {/* Seletor de Tipo de Documento */}
            <div>
              <label className="text-xs font-extrabold text-slate-700 block mb-2">
                Modalidade de Documento Psicológico (Resolução CFP nº 06/2019)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { id: 'declaracao', label: 'Declaração', desc: 'Fatos/presença (sem diagnóstico)' },
                  { id: 'atestado', label: 'Atestado Psicológico', desc: 'Fundamentado em avaliação' },
                  { id: 'relatorio', label: 'Relatório Psicológico', desc: 'Comunicação clínica estruturada' },
                  { id: 'relatorio_multiprofissional', label: 'Rel. Multiprofissional', desc: 'Atuação intersetorial' },
                  { id: 'laudo', label: 'Laudo Psicológico', desc: 'Exclusivo de Avaliação Psicológica' },
                  { id: 'parecer', label: 'Parecer Psicológico', desc: 'Resposta a quesito técnico' }
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDocumentType(t.id as any)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      documentType === t.id
                        ? 'bg-teal-50 border-teal-500 text-teal-950 font-bold shadow-xs ring-1 ring-teal-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold">{t.label}</div>
                    <div className="text-[11px] font-normal text-slate-500 leading-tight mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Alerta específico para Laudo sem Avaliação */}
            {documentType === 'laudo' && !hasAssessmentBasis && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-amber-900 text-xs flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Aviso Regulatório Obrigatório (CFP 06/2019 e 31/2022):</strong>
                  <p className="mt-1">
                    O <strong>Laudo Psicológico</strong> é resultante unicamente de um processo prévio e formal de Avaliação Psicológica.
                    Nenhuma Avaliação Psicológica formal foi registrada ainda para este paciente no sistema. Para emitir o Laudo, registre primeiro a Avaliação na aba correspondente do prontuário.
                  </p>
                </div>
              </div>
            )}

            {/* Alerta de vedação clínica na Declaração */}
            {documentType === 'declaracao' && declaracaoViolations.length > 0 && (
              <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 text-rose-900 text-xs flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Vedação Ética Legal (Art. 9º, CFP 06/2019):</strong>
                  <p className="mt-0.5">
                    A Declaração destina-se apenas a comprovar comparecimento e horários. Termos clínicos, sintomas ou diagnósticos são proibidos.
                    Termos detectados: <strong>{declaracaoViolations.join(', ')}</strong>. Remova-os para habilitar a emissão.
                  </p>
                </div>
              </div>
            )}

            {/* Metadados Obrigatórios */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Solicitante / Interessado <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={requesterName}
                  onChange={e => setRequesterName(e.target.value)}
                  placeholder="Ex: A própria paciente, Vara de Família, Empregador..."
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Finalidade Estrita do Documento <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={purpose}
                  onChange={e => setPurpose(e.target.value)}
                  placeholder="Ex: Justificativa de comparecimento ao trabalho..."
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* Conteúdo específico por tipo */}
            {documentType === 'declaracao' && (
              <div className="space-y-1.5 text-xs">
                <label className="font-bold text-slate-700 block">
                  Texto da Declaração (Estritamente Factual) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={declaracaoText}
                  onChange={e => setDeclaracaoText(e.target.value)}
                  placeholder={`Ex: Declaro, para os devidos fins a pedido de ${requesterName || 'Mariana Silva'}, que a referida paciente esteve sob atendimento psicológico neste consultório no dia ${new Date().toLocaleDateString('pt-BR')}, no período das 14:00 às 15:00 horas.`}
                  rows={5}
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-[11px] text-slate-500">
                  Nunca registre CID, sintomas ou descrição de estado emocional em Declarações.
                </p>
              </div>
            )}

            {documentType === 'atestado' && (
              <div className="space-y-1.5 text-xs">
                <label className="font-bold text-slate-700 block">
                  Fundamentação Técnica e Conclusão do Atestado <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={conclusionDescription}
                  onChange={e => setConclusionDescription(e.target.value)}
                  placeholder="Ex: Atesto que a paciente encontra-se em acompanhamento psicológico por motivo de sobrecarga adaptativa, necessitando de afastamento de suas atividades por um período de 05 (cinco) dias para estabilização de rotina e autocuidado."
                  rows={6}
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-[11px] text-slate-500">
                  O Atestado Psicológico deve ser fundamentado em avaliação e não deve incluir CID de forma automática ou prescritiva médica.
                </p>
              </div>
            )}

            {documentType === 'parecer' && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Quesitos Apresentados / Questão-Problema Técnica <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={quesitosParecer}
                    onChange={e => setQuesitosParecer(e.target.value)}
                    placeholder="Ex: 1. A metodologia de acolhimento utilizada apresenta consistência técnico-científica para o caso em tela?"
                    rows={3}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Análise Técnica Fundamentada <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={analysisDescription}
                    onChange={e => setAnalysisDescription(e.target.value)}
                    placeholder="Exponha a fundamentação teórica, metodológica e as diretrizes bibliográficas e resolutivas pertinentes..."
                    rows={4}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Conclusão / Respostas Aos Quesitos <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={conclusionDescription}
                    onChange={e => setConclusionDescription(e.target.value)}
                    placeholder="Conclusão com posicionamento conclusivo acerca do problema levantado..."
                    rows={3}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            )}

            {(documentType === 'relatorio' || documentType === 'relatorio_multiprofissional' || documentType === 'laudo') && (
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    2. Descrição da Demanda <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={demandDescription}
                    onChange={e => setDemandDescription(e.target.value)}
                    placeholder="Descreva as queixas, motivos da consulta ou solicitações que motivaram a avaliação..."
                    rows={3}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    3. Procedimento Realizado <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={procedureDescription}
                    onChange={e => setProcedureDescription(e.target.value)}
                    placeholder="Descreva recursos técnico-científicos utilizados: número de sessões, entrevistas, testes válidos no SATEPSI..."
                    rows={3}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    4. Análise Psicológica <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={analysisDescription}
                    onChange={e => setAnalysisDescription(e.target.value)}
                    placeholder="Análise integrada, sem juízos de valor moral, fundamentada na ciência psicológica..."
                    rows={4}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    5. Conclusão e Recomendações <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={conclusionDescription}
                    onChange={e => setConclusionDescription(e.target.value)}
                    placeholder="Síntese diagnóstica/compreensiva e encaminhamentos recomendados..."
                    rows={3}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            )}

            {/* Rodapé e Ações */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Lock className="w-3.5 h-3.5 text-teal-600" />
                <span>Documento imutável selado com carimbo criptográfico.</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || (documentType === 'laudo' && !hasAssessmentBasis) || declaracaoViolations.length > 0}
                  className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  {submitting ? 'Emitindo e Selando...' : 'Emitir e Selar Documento'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
