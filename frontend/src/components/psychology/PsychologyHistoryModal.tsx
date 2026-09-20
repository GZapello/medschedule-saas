import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  X,
  History,
  Calendar,
  Clock,
  Shield,
  FileText,
  Lock,
  Printer,
  Plus,
  Send,
  CheckCircle2,
  AlertCircle,
  Globe,
  Award
} from 'lucide-react';

interface PsychologyHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
}

export const PsychologyHistoryModal: React.FC<PsychologyHistoryModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [historyData, setHistoryData] = useState<any>({
    patient: null,
    sessions: [],
    assessments: [],
    documents: [],
    screenings: []
  });

  const [activeSubTab, setActiveSubTab] = useState<'sessions' | 'assessments' | 'documents'>('sessions');

  // Adendo a sessão
  const [amendingSessionId, setAmendingSessionId] = useState<string | null>(null);
  const [amendmentNote, setAmendmentNote] = useState('');
  const [submittingAmendment, setSubmittingAmendment] = useState(false);

  // Registro de Entrega em Documento Antigo
  const [deliveryDocId, setDeliveryDocId] = useState<string | null>(null);
  const [deliveryRecipient, setDeliveryRecipient] = useState(patientName);
  const [deliveryChannel, setDeliveryChannel] = useState<'em_maos' | 'email' | 'portal' | 'outro'>('em_maos');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submittingDelivery, setSubmittingDelivery] = useState(false);

  const fetchHistory = async () => {
    if (!patientId) return;
    try {
      setLoading(true);
      const res: any = await ApiClient.get(`/v1/psychology/history/${patientId}`);
      setHistoryData(res || {});
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar histórico longitudinal.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && patientId) {
      fetchHistory();
    }
  }, [isOpen, patientId]);

  if (!isOpen) return null;

  const handleAddAmendment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendingSessionId || !amendmentNote.trim()) return;

    try {
      setSubmittingAmendment(true);
      await ApiClient.post(`/v1/psychology/sessions/${amendingSessionId}/amendments`, {
        note: amendmentNote.trim()
      });
      showToast('Adendo formal registrado e anexado ao prontuário!', 'success');
      setAmendingSessionId(null);
      setAmendmentNote('');
      fetchHistory();
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar adendo.', 'error');
    } finally {
      setSubmittingAmendment(false);
    }
  };

  const handleRegisterDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryDocId) return;

    try {
      setSubmittingDelivery(true);
      await ApiClient.post(`/v1/psychology/documents/${deliveryDocId}/delivery`, {
        recipientName: deliveryRecipient,
        deliveryChannel,
        notes: deliveryNotes
      });
      showToast('Comprovante de entrega protocolado com sucesso!', 'success');
      setDeliveryDocId(null);
      setDeliveryNotes('');
      fetchHistory();
    } catch (err: any) {
      showToast(err.message || 'Erro ao protocolar entrega.', 'error');
    } finally {
      setSubmittingDelivery(false);
    }
  };

  const handlePrintDoc = (docId: string) => {
    window.open(`/api/v1/psychology/documents/${docId}/print`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="bg-linear-to-r from-slate-900 via-teal-950 to-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <History className="w-5 h-5 text-teal-300" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Histórico Longitudinal Confidencial</h2>
              <p className="text-xs text-teal-200">
                {patientName} • Sigilo e Prontuário Psicológico (Resoluções CFP 01/2009 e 06/2019)
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

        {/* Sub-Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 text-xs font-bold gap-4 shrink-0">
          <button
            onClick={() => setActiveSubTab('sessions')}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeSubTab === 'sessions'
                ? 'border-teal-600 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Evoluções & Sessões ({historyData.sessions?.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab('assessments')}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeSubTab === 'assessments'
                ? 'border-teal-600 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Avaliações Psicológicas ({historyData.assessments?.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab('documents')}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeSubTab === 'documents'
                ? 'border-teal-600 text-teal-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Documentos Emitidos ({historyData.documents?.length || 0})
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-xs font-medium">
              Carregando histórico do paciente...
            </div>
          ) : (
            <>
              {/* SESSÕES E EVOLUÇÕES */}
              {activeSubTab === 'sessions' && (
                <div className="space-y-4">
                  {historyData.sessions?.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      Nenhuma sessão registrada ou selada para este paciente.
                    </div>
                  ) : (
                    historyData.sessions.map((sess: any) => {
                      const amendments = sess.amendments_json ? JSON.parse(sess.amendments_json) : [];
                      const isOnline = sess.modality === 'online';
                      const tdic = sess.tdic_info_json ? JSON.parse(sess.tdic_info_json) : null;

                      return (
                        <div key={sess.id} className="border border-slate-200 rounded-2xl p-5 bg-white space-y-4 shadow-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 bg-teal-50 text-teal-800 font-extrabold text-xs rounded-lg border border-teal-200">
                                Sessão #{sess.session_number}
                              </span>
                              <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                                <Calendar className="w-3.5 h-3.5" />
                                {new Date(sess.session_date).toLocaleDateString('pt-BR')}
                              </span>
                              {isOnline ? (
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-md flex items-center gap-1 border border-blue-200">
                                  <Globe className="w-3 h-3" /> Online TDIC (CFP 09/2024)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-medium rounded-md">
                                  Presencial
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {sess.is_sealed === 1 && (
                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 text-[11px] font-bold rounded-lg border border-emerald-200 flex items-center gap-1">
                                  <Lock className="w-3 h-3 text-emerald-600" /> Selado e Imutável
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setAmendingSessionId(sess.id)}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" /> Adicionar Adendo
                              </button>
                            </div>
                          </div>

                          {/* Detalhes Online TDIC */}
                          {isOnline && tdic && (
                            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 text-xs text-blue-900 space-y-1">
                              <div className="font-bold">Informações TDIC (Resolução CFP 09/2024):</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-blue-800">
                                <div><strong>Plataforma:</strong> {tdic.platform || 'Telemedicina Zemda'}</div>
                                <div><strong>Condições Técnicas:</strong> {tdic.technicalConditions || 'Estáveis'}</div>
                                <div><strong>Contato de Emergência:</strong> {tdic.emergencyContact || 'Informado em prontuário'}</div>
                                <div><strong>Segurança:</strong> Criptografia de ponta a ponta ativa</div>
                              </div>
                            </div>
                          )}

                          {/* Conteúdo Clínico */}
                          <div className="space-y-2 text-xs">
                            {sess.current_demand && (
                              <div>
                                <strong className="text-slate-700 block mb-0.5">Demanda Atual / Queixa da Sessão:</strong>
                                <p className="text-slate-800 bg-slate-50 p-2.5 rounded-lg whitespace-pre-wrap">{sess.current_demand}</p>
                              </div>
                            )}

                            <div>
                              <strong className="text-slate-700 block mb-0.5">Evolução Clínica & Intervenções:</strong>
                              <p className="text-slate-800 bg-slate-50 p-3 rounded-lg whitespace-pre-wrap font-sans leading-relaxed">
                                {sess.clinical_evolution}
                              </p>
                            </div>

                            {sess.conduct_plan && (
                              <div>
                                <strong className="text-slate-700 block mb-0.5">Conduta / Próximos Passos:</strong>
                                <p className="text-slate-800 bg-slate-50 p-2.5 rounded-lg whitespace-pre-wrap">{sess.conduct_plan}</p>
                              </div>
                            )}
                          </div>

                          {/* Adendos Registrados */}
                          {amendments.length > 0 && (
                            <div className="border-t border-slate-100 pt-3 space-y-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" /> Adendos Posteriores Vinculados ({amendments.length})
                              </span>
                              {amendments.map((am: any, idx: number) => (
                                <div key={idx} className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs space-y-1">
                                  <div className="flex justify-between items-center text-[11px] text-amber-900 font-semibold">
                                    <span>Adendo #{idx + 1} por {am.authorName || 'Psicólogo'}</span>
                                    <span>{new Date(am.addedAt).toLocaleString('pt-BR')}</span>
                                  </div>
                                  <p className="text-slate-800 whitespace-pre-wrap font-sans">{am.note}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Carimbo de Selamento */}
                          <div className="border-t border-slate-100 pt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-mono">
                            <span>Assinado por: {sess.signed_by_name} • {sess.signed_by_registration}</span>
                            <span className="truncate max-w-xs">Hash: {sess.signature_hash}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* AVALIAÇÕES PSICOLÓGICAS */}
              {activeSubTab === 'assessments' && (
                <div className="space-y-4">
                  {historyData.assessments?.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      Nenhum processo de Avaliação Psicológica formal registrado.
                    </div>
                  ) : (
                    historyData.assessments.map((evalItem: any) => {
                      const fundSources = evalItem.fundamental_sources_json ? JSON.parse(evalItem.fundamental_sources_json) : [];
                      const compSources = evalItem.complementary_sources_json ? JSON.parse(evalItem.complementary_sources_json) : [];

                      return (
                        <div key={evalItem.id} className="border border-slate-200 rounded-2xl p-5 bg-white space-y-4 shadow-xs">
                          <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                            <div>
                              <h4 className="font-bold text-slate-900 text-sm">{evalItem.assessment_title}</h4>
                              <p className="text-xs text-slate-500 mt-0.5">Finalidade: {evalItem.purpose}</p>
                            </div>
                            <span className="px-2.5 py-1 bg-teal-50 text-teal-800 text-xs font-bold rounded-lg border border-teal-200">
                              Status: {evalItem.status === 'completed' ? 'Concluída' : 'Em andamento'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                              <strong className="text-slate-700 block mb-1">Fontes Fundamentais (CFP 31/2022):</strong>
                              {fundSources.length > 0 ? (
                                <ul className="list-disc list-inside space-y-0.5 text-slate-800">
                                  {fundSources.map((s: string, i: number) => (
                                    <li key={i}>{s}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-slate-400">Nenhuma fonte fundamental especificada</span>
                              )}
                            </div>
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                              <strong className="text-slate-700 block mb-1">Fontes Complementares:</strong>
                              {compSources.length > 0 ? (
                                <ul className="list-disc list-inside space-y-0.5 text-slate-800">
                                  {compSources.map((s: string, i: number) => (
                                    <li key={i}>{s}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-slate-400">Nenhuma fonte complementar</span>
                              )}
                            </div>
                          </div>

                          {evalItem.clinical_integration_analysis && (
                            <div className="text-xs space-y-1">
                              <strong className="text-slate-700 block">Análise de Integração Clínica:</strong>
                              <p className="text-slate-800 bg-slate-50 p-3 rounded-xl whitespace-pre-wrap">
                                {evalItem.clinical_integration_analysis}
                              </p>
                            </div>
                          )}

                          {evalItem.conclusion_synthesis && (
                            <div className="text-xs space-y-1">
                              <strong className="text-slate-700 block">Síntese Conclusiva:</strong>
                              <p className="text-slate-800 bg-slate-50 p-3 rounded-xl whitespace-pre-wrap">
                                {evalItem.conclusion_synthesis}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* DOCUMENTOS EMITIDOS */}
              {activeSubTab === 'documents' && (
                <div className="space-y-4">
                  {historyData.documents?.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      Nenhum documento psicológico oficial emitido até o momento.
                    </div>
                  ) : (
                    historyData.documents.map((doc: any) => {
                      const delivery = doc.delivery_receipt_json ? JSON.parse(doc.delivery_receipt_json) : null;
                      const typeLabels: Record<string, string> = {
                        declaracao: 'Declaração',
                        atestado: 'Atestado Psicológico',
                        relatorio: 'Relatório Psicológico',
                        relatorio_multiprofissional: 'Relatório Multiprofissional',
                        laudo: 'Laudo Psicológico',
                        parecer: 'Parecer Psicológico'
                      };

                      return (
                        <div key={doc.id} className="border border-slate-200 rounded-2xl p-5 bg-white space-y-3 shadow-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 bg-slate-900 text-white font-mono text-xs font-bold rounded-lg">
                                {doc.document_number}
                              </span>
                              <span className="px-2.5 py-1 bg-teal-50 text-teal-900 font-bold text-xs rounded-lg border border-teal-200">
                                {typeLabels[doc.document_type] || doc.document_type}
                              </span>
                              <span className="text-xs text-slate-500">Versão {doc.version}.0</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handlePrintDoc(doc.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
                              </button>
                              {!delivery && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeliveryDocId(doc.id);
                                    setDeliveryRecipient(doc.requester_name || patientName);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                                >
                                  <Send className="w-3.5 h-3.5" /> Protocolar Entrega
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div><strong>Solicitante:</strong> {doc.requester_name}</div>
                            <div><strong>Finalidade:</strong> {doc.purpose}</div>
                            <div><strong>Emissão:</strong> {new Date(doc.created_at).toLocaleDateString('pt-BR')}</div>
                            <div><strong>Assinado por:</strong> {doc.signed_by_name} ({doc.signed_by_registration})</div>
                          </div>

                          {delivery ? (
                            <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 space-y-1">
                              <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Entrega Protocolada:
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-emerald-800">
                                <div><strong>Recebido por:</strong> {delivery.recipientName}</div>
                                <div><strong>Data:</strong> {new Date(delivery.deliveryDate).toLocaleDateString('pt-BR')}</div>
                                <div><strong>Canal:</strong> {delivery.deliveryChannel}</div>
                                {delivery.notes && <div><strong>Obs:</strong> {delivery.notes}</div>}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                              Pendente de registro do protocolo de entrega ao paciente/solicitante.
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal de Adicionar Adendo */}
        {amendingSessionId && (
          <div className="p-5 bg-amber-50 border-t border-amber-200 shrink-0">
            <form onSubmit={handleAddAmendment} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Registrar Adendo a Sessão Selada (Não altera o texto original)
                </span>
                <button
                  type="button"
                  onClick={() => setAmendingSessionId(null)}
                  className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
              <textarea
                value={amendmentNote}
                onChange={e => setAmendmentNote(e.target.value)}
                placeholder="Exponha a complementação ou retificação factual com data e justificativa técnica..."
                rows={3}
                required
                className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={submittingAmendment}
                  className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  {submittingAmendment ? 'Registrando...' : 'Gravar Adendo'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal de Protocolo de Entrega */}
        {deliveryDocId && (
          <div className="p-5 bg-slate-50 border-t border-slate-200 shrink-0">
            <form onSubmit={handleRegisterDelivery} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-teal-600" />
                  Protocolar Comprovante de Entrega de Documento
                </span>
                <button
                  type="button"
                  onClick={() => setDeliveryDocId(null)}
                  className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nome de quem recebeu</label>
                  <input
                    type="text"
                    value={deliveryRecipient}
                    onChange={e => setDeliveryRecipient(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Canal de Entrega</label>
                  <select
                    value={deliveryChannel}
                    onChange={e => setDeliveryChannel(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="em_maos">Em mãos (Cópia física assinada)</option>
                    <option value="email">E-mail institucional criptografado</option>
                    <option value="portal">Portal do Paciente</option>
                    <option value="outro">Outro meio formal</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">Observações do Protocolo</label>
                  <input
                    type="text"
                    value={deliveryNotes}
                    onChange={e => setDeliveryNotes(e.target.value)}
                    placeholder="Ex: Entregue cópia com recibo assinado perante a recepção."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={submittingDelivery}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  {submittingDelivery ? 'Salvando...' : 'Formalizar Entrega'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
