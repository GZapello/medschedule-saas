import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Printer,
  FileText,
  CheckCircle2,
  AlertCircle,
  Download,
  Share2,
  Copy,
  Building2,
  Calendar,
  User,
  School
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  useClinicDocumentData,
  ClinicDocumentHeader,
  ClinicDocumentFooter,
  DigitalStampInfo
} from '../common/ClinicDocumentHeader';
import { SignatureChoiceModal } from '../common/SignatureChoiceModal';

export type PsychopedagogyDocType = 'relatorio' | 'parecer' | 'encaminhamento' | 'orientacoes';

export interface PsychopedagogyDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: any;
  initialDocType?: PsychopedagogyDocType;
  profileData?: any;
  assessmentData?: any;
  sessionData?: any;
  domainsData?: any[];
  instrumentsData?: any[];
  planData?: any;
}

export const PsychopedagogyDocumentModal: React.FC<PsychopedagogyDocumentModalProps> = ({
  isOpen,
  onClose,
  patient,
  initialDocType = 'relatorio',
  profileData,
  assessmentData,
  sessionData,
  domainsData = [],
  instrumentsData = [],
  planData
}) => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { clinic, loading: clinicLoading, error: clinicError, canIssue } = useClinicDocumentData();

  const [docType, setDocType] = useState<PsychopedagogyDocType>(initialDocType);
  const [documentTitle, setDocumentTitle] = useState<string>('Relatório Psicopedagógico');
  const [documentContent, setDocumentContent] = useState<string>('');
  const [recipient, setRecipient] = useState<string>('À Escola / Equipe Pedagógica');
  const [purpose, setPurpose] = useState<string>('Acompanhamento da Aprendizagem e Adaptações Curriculares');
  const [showSignatureChoice, setShowSignatureChoice] = useState<boolean>(false);
  const [digitalStamp, setDigitalStamp] = useState<DigitalStampInfo | null>(null);

  const printSheetRef = useRef<HTMLDivElement>(null);

  const patientName = patient?.full_name || patient?.name || 'Aprendente';
  const birthDateStr = patient?.birth_date
    ? new Date(patient.birth_date).toLocaleDateString('pt-BR')
    : 'Não informada';
  const ageStr = patient?.birth_date
    ? `${Math.floor((Date.now() - new Date(patient.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25))} anos`
    : '';

  const professionalName = currentUser?.name || 'Psicopedagogo(a) Responsável';
  const professionalReg =
    currentUser?.registrationNumber ||
    (currentUser as any)?.registration_number ||
    (currentUser as any)?.cbo ||
    'ABPp / Registro Profissional';

  // Gerador de modelo baseado no tipo de documento e nos dados coletados no atendimento
  useEffect(() => {
    if (!isOpen) return;

    const todayStr = new Date().toLocaleDateString('pt-BR');
    const schoolName = profileData?.school_name || profileData?.schoolName || 'Instituição de Ensino';
    const gradeLevel = profileData?.grade_level || profileData?.schoolGrade || 'Ano escolar não informado';

    if (docType === 'relatorio') {
      setDocumentTitle('RELATÓRIO DE AVALIAÇÃO PSICOPEDAGÓGICA');
      setRecipient('À Direção / Coordenação Pedagógica e Família');
      setPurpose('Síntese da avaliação psicopedagógica e orientações pedagógicas');

      const synthesis = assessmentData?.psychopedagogical_synthesis || assessmentData?.conclusions || '';
      const hypothesis = assessmentData?.pedagogical_hypothesis || '';
      const recommendations = assessmentData?.recommendations || '';
      const instrumentsList = instrumentsData.length > 0
        ? instrumentsData.map(i => `• ${i.instrument_name} (${new Date(i.application_date || Date.now()).toLocaleDateString('pt-BR')}) - ${i.results_summary || 'Aplicado'}`).join('\n')
        : '• Provas Operatórias Piagetianas, EOCA e análise qualitativa de produções escolares.';

      setDocumentContent(
`1. IDENTIFICAÇÃO DO APRENDENTE
Nome: ${patientName}
Data de Nascimento: ${birthDateStr} ${ageStr ? `(${ageStr})` : ''}
Instituição Escolar: ${schoolName}
Ano/Série: ${gradeLevel}
Responsáveis: ${patient?.mother_name || patient?.father_name || 'Pais / Responsáveis Legais'}

2. MOTIVO DO ENCAMINHAMENTO / DEMANDA INVESTIGADA
${profileData?.main_complaint || profileData?.pedagogicalComplaint || 'Avaliação psicopedagógica para investigação das modalidades de aprendizagem e estratégias pedagógicas.'}

3. PROCEDIMENTOS E INSTRUMENTOS UTILIZADOS
Foram realizadas sessões clínicas psicopedagógicas individuais de observação, escuta e aplicação dos seguintes instrumentos:
${instrumentsList}

4. ANÁLISE DOS DOMÍNIOS DE APRENDIZAGEM
• Leitura: Avaliação de decodificação, fluência e compreensão textual.
• Escrita: Análise da grafomotricidade, ortografia e estruturação textual.
• Raciocínio Lógico-Matemático: Noção de número, resolução de problemas e operações.
• Funções Executivas: Atenção seletiva/sustentada, memória de trabalho e controle inibitório no contexto escolar.

5. SÍNTESE PSICOPEDAGÓGICA
${synthesis || 'O aprendente demonstra potencial cognitivo preservado, apresentando estilo de aprendizagem que se beneficia de recursos visuais, mediação estruturada e tempo estendido para conclusão de tarefas complexas.'}

6. HIPÓTESE PSICOPEDAGÓGICA
${hypothesis || 'Hipótese psicopedagógica formulada a partir do conjunto de sessões, sem caráter de diagnóstico médico ou psicológico privativo, voltada à mediação do processo de aprendizagem.'}

7. RECOMENDAÇÕES E DIRETRIZES
Para a Escola:
${recommendations || '• Estimular o uso de recursos multisensoriais e instruções fragmentadas em passos curtos.\n• Permitir tempo estendido em avaliações escritas e verificação oral da compreensão.\n• Posicionar o aprendente próximo ao professor e longe de estímulos distratores.'}

Para a Família:
• Estabelecer rotina diária de estudos em ambiente silencioso e organizado.
• Valorizar as conquistas diárias e potencialidades para fortalecimento do vínculo com o saber.`);
    } else if (docType === 'parecer') {
      setDocumentTitle('PARECER PSICOPEDAGÓGICO');
      setRecipient('À Coordenação Pedagógica e Família');
      setPurpose('Acompanhamento da evolução psicopedagógica');
      setDocumentContent(
`PARECER TÉCNICO SOBRE O PROCESSO DE APRENDIZAGEM

Aprendente: ${patientName}
Escola: ${schoolName} • Série/Ano: ${gradeLevel}
Data de Emissão: ${todayStr}

1. HISTÓRICO DO ATENDIMENTO
O(A) aprendente ${patientName} encontra-se em acompanhamento psicopedagógico clínico regular nesta instituição, com foco no desenvolvimento de estratégias de aprendizagem, autonomia e funções executivas.

2. ASPECTOS OBSERVADOS E EVOLUÇÃO
No decorrer dos atendimentos, foram trabalhados estímulos específicos voltados às áreas de leitura, escrita e raciocínio lógico. Observou-se evolução significativa no engajamento com as tarefas escolares e no desenvolvimento da autorregulação.

3. CONSIDERAÇÕES PSICOPEDAGÓGICAS
${assessmentData?.psychopedagogical_synthesis || 'Recomenda-se a manutenção do suporte psicopedagógico e a continuidade do diálogo frequente entre clínica, escola e família para consolidação dos ganhos pedagógicos.'}

4. ENCAMINHAMENTOS E ORIENTAÇÕES COMPLEMENTARES
Permaneço à disposição da equipe escolar para alinhamento pedagógico conjunto.`);
    } else if (docType === 'encaminhamento') {
      setDocumentTitle('ENCAMINHAMENTO MULTIPROFISSIONAL');
      setRecipient('Ao(À) Colega Especialista');
      setPurpose('Avaliação multiprofissional complementar');
      setDocumentContent(
`SOLICITAÇÃO DE AVALIAÇÃO COMPLEMENTAR

Paciente: ${patientName}
Idade: ${ageStr || 'Conforme cadastro'} • Nasc: ${birthDateStr}
Escola: ${schoolName} (${gradeLevel})

Prezado(a) Colega,

Encaminho o(a) aprendente ${patientName}, atualmente em intervenção psicopedagógica neste serviço, para vossa criteriosa avaliação especializada nas áreas complementares.

Motivo do Encaminhamento:
${profileData?.main_complaint || 'Dificuldades atencionais e no processamento da leitura/escrita que demandam investigação clínica interdisciplinar.'}

Observações Psicopedagógicas Relevantes:
${assessmentData?.areas_of_difficulty || 'Observa-se fadiga cognitiva rápida em tarefas de retenção auditiva e necessidade de descartar alterações fonoaudiológicas ou neurobiológicas associadas.'}

Coloco-me à disposição para discussão conjunta de caso e compartilhamento de relatórios técnicos em prol do melhor desenvolvimento do aprendente.`);
    } else if (docType === 'orientacoes') {
      setDocumentTitle('GUIA DE ORIENTAÇÕES DOMICILIARES E ESCOLARES');
      setRecipient('À Família e Educadores');
      setPurpose('Plano de rotinas, estimulação pedagógica e ambiente facilitador');
      setDocumentContent(
`GUIA DE ORIENTAÇÕES E ROTINA DE ESTUDOS

Aprendente: ${patientName}
Data: ${todayStr}

1. ROTINA DE ESTUDOS EM CASA
• Horário Fixo: Manter horário diário previsível para realização das lições de casa.
• Ambiente: Local iluminado, arejado, com mesa livre de celulares, brinquedos ou telas ligadas.
• Intervalos Programados: Para cada 25 a 30 minutos de concentração, realizar pausa de 5 minutos (Técnica Pomodoro adaptada).

2. ESTRATÉGIAS PARA LEITURA E ESCRITA
• Leitura Compartilhada: Pais e aprendente revezam parágrafos na leitura de histórias prazerosas.
• Mapa Mental: Antes de produzir um texto, anotar as palavras-chave em uma folha de rascunho.
• Verificação Amigável: Incentivar o aprendente a reler o que escreveu para identificar possíveis omissões de letras de forma autônoma.

3. ESTÍMULO ÀS FUNÇÕES EXECUTIVAS E AUTONOMIA
• Quadro de Rotina Visual: Disponibilizar calendário semanal com atividades, tarefas e mochilas organizadas na noite anterior.
• Elogio ao Esforço: Enfatizar a dedicação e o processo de aprendizagem, não apenas a nota final.`);
    }
  }, [isOpen, docType, patient, profileData, assessmentData, sessionData, domainsData, instrumentsData, planData]);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (!canIssue) {
      showToast('Dados da clínica emissora indisponíveis para impressão.', 'error');
      return;
    }
    window.print();
  };

  const handleCopyText = () => {
    if (!documentContent) return;
    navigator.clipboard.writeText(documentContent);
    showToast('Texto do documento copiado para a área de transferência!', 'success');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto print:p-0 print:bg-white print:static"
      role="dialog"
      aria-modal="true"
      aria-label="Emissão de Documentos Psicopedagógicos"
    >
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh] print:max-h-none print:shadow-none print:border-none print:w-full">
        
        {/* Barra Superior de Navegação & Ações (Oculta na Impressão) */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/80 border border-indigo-400/40 flex items-center justify-center text-indigo-200">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Emissão de Documentos Psicopedagógicos
              </h2>
              <p className="text-xs text-indigo-200">
                Aprendente: <strong className="text-white">{patientName}</strong> • Formato A4 oficial
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              title="Copiar texto para colar em e-mail ou WhatsApp"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar Texto</span>
            </button>

            <button
              type="button"
              disabled={!canIssue}
              onClick={handlePrint}
              className={`inline-flex items-center gap-1.5 px-4 py-2 font-bold text-xs rounded-xl shadow-xs transition-colors ${
                canIssue
                  ? 'bg-indigo-500 hover:bg-indigo-600 text-white cursor-pointer'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
              title={!canIssue ? 'Não foi possível carregar os dados da clínica emissora' : 'Imprimir / Salvar PDF'}
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Salvar PDF</span>
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

        {/* Barra de Tipos de Documentos (Oculta na Impressão) */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center gap-2 overflow-x-auto print:hidden">
          <span className="text-xs font-bold text-slate-500 shrink-0 mr-1">Tipo de Documento:</span>
          {[
            { id: 'relatorio', label: 'Relatório Psicopedagógico' },
            { id: 'parecer', label: 'Parecer Técnico' },
            { id: 'encaminhamento', label: 'Encaminhamento' },
            { id: 'orientacoes', label: 'Guia de Orientações' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDocType(tab.id as PsychopedagogyDocType)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                docType === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Conteúdo Principal: Editor à Esquerda e Folha A4 à Direita */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-100/60 print:p-0 print:bg-white print:block">
          
          {/* Coluna do Editor (Oculta na Impressão) */}
          <div className="lg:col-span-5 space-y-4 print:hidden">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-xs font-extrabold uppercase text-slate-700 tracking-wider">
                Personalização do Documento
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Título do Documento</label>
                <input
                  type="text"
                  value={documentTitle}
                  onChange={e => setDocumentTitle(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Destinatário</label>
                <input
                  type="text"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  placeholder="Ex: À Direção / Escola / Família"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Finalidade</label>
                <input
                  type="text"
                  value={purpose}
                  onChange={e => setPurpose(e.target.value)}
                  placeholder="Ex: Alinhamento pedagógico e adaptação"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Corpo do Documento (Texto Editável)
                </label>
                <textarea
                  rows={14}
                  value={documentContent}
                  onChange={e => setDocumentContent(e.target.value)}
                  className="w-full text-xs p-3 border border-slate-300 rounded-xl bg-white font-mono leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Coluna da Folha A4 Timbrada (Pré-visualização e Impressão) */}
          <div className="lg:col-span-7 flex justify-center print:w-full print:block">
            <div
              ref={printSheetRef}
              id="printable-pp-sheet"
              className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm w-full max-w-[210mm] text-slate-800 font-sans space-y-6 print:border-none print:shadow-none print:p-0 print:max-w-none"
            >
              {/* Cabeçalho Institucional Oficial da Clínica Emissora */}
              <ClinicDocumentHeader
                clinic={clinic}
                loading={clinicLoading}
                error={clinicError}
                documentTitle={documentTitle}
                documentSubtitle="Psicopedagogia Clínica & Institucional"
              />

              {/* Informações do Aprendente e Destinatário */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Aprendente</span>
                  <strong className="text-slate-900 text-sm block">{patientName}</strong>
                  <span className="text-slate-600 text-[11px] block">
                    Nascimento: {birthDateStr} {ageStr ? `• ${ageStr}` : ''}
                  </span>
                  {profileData?.school_name && (
                    <span className="text-slate-500 text-[11px] block mt-0.5">
                      Escola: {profileData.school_name} {profileData.grade_level ? `(${profileData.grade_level})` : ''}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Destinatário & Finalidade</span>
                  <strong className="text-slate-900 block">{recipient || 'A quem possa interessar'}</strong>
                  <span className="text-slate-600 text-[11px] block mt-0.5">{purpose}</span>
                  <span className="text-slate-400 text-[10px] block mt-1">
                    Profissional: {professionalName} ({professionalReg})
                  </span>
                </div>
              </div>

              {/* Texto do Documento */}
              <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-sans py-2 min-h-[280px]">
                {documentContent}
              </div>

              {/* Bloco de Assinatura (Manual ou Carimbo Digital ICP-Brasil) */}
              {!digitalStamp && (
                <div className="pt-10 border-t border-slate-300 text-center space-y-2 page-break-inside-avoid">
                  <div className="inline-block border-t-2 border-slate-800 w-72 pt-2">
                    <p className="font-bold text-xs text-slate-900">{professionalName}</p>
                    <p className="text-[11px] text-slate-600">{professionalReg}</p>
                    <p className="text-[10px] text-slate-400">Psicopedagogo(a) Responsável</p>
                  </div>
                </div>
              )}

              {/* Rodapé Oficial da Plataforma (com Selo ICP-Brasil quando assinado) */}
              <ClinicDocumentFooter digitalStamp={digitalStamp} />
            </div>
          </div>

        </div>

        {/* Footer Modal (Oculto na Impressão) */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-white shrink-0 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>

          <button
            type="button"
            disabled={!canIssue}
            onClick={() => setShowSignatureChoice(true)}
            className={`inline-flex items-center gap-2 px-6 py-2.5 font-bold text-xs rounded-xl shadow-md transition-all ${
              canIssue
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
            title={!canIssue ? 'Dados da clínica não carregados' : 'Emitir Documento (Manual ou ICP-Brasil)'}
          >
            <Printer className="w-4 h-4" />
            <span>Emitir Documento Oficial (A4)</span>
          </button>
        </div>

      </div>

      {/* Modal Universal de Escolha de Assinatura */}
      <SignatureChoiceModal
        isOpen={showSignatureChoice}
        onClose={() => setShowSignatureChoice(false)}
        documentTitle={documentTitle}
        documentType="psychopedagogy_report"
        patientName={patientName}
        professionalName={professionalName}
        professionalCouncil={professionalReg}
        rawContent={documentContent}
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
            signerRegistration: professionalReg,
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

      {/* Regras CSS globais de impressão para encaixe perfeito em A4 */}
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
          }
          body * {
            visibility: hidden !important;
          }
          #printable-pp-sheet,
          #printable-pp-sheet * {
            visibility: visible !important;
          }
          #printable-pp-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .page-break-inside-avoid {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
};
