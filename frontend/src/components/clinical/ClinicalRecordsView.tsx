import { ClinicalSnapshot } from './ClinicalSnapshot';
import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Patient, ClinicalRecord } from '../../types';
import {
  FileText,
  ShieldCheck,
  Lock,
  Plus,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  X,
  AlertCircle,
  Eye,
  Edit3,
  Printer,
  Download,
  History,
  Smile,
  Apple,
  Hand,
  Mic,
  Activity,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export const ClinicalRecordsView: React.FC = () => {
  const { clientTermLabel, currentTenant } = useAuth();
  const { showToast } = useToast();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [records, setRecords] = useState<ClinicalRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  // Modal Nova Evolução
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [sessionDate, setSessionDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [clinicalEvolution, setClinicalEvolution] = useState<string>('');
  const [technicalNotes, setTechnicalNotes] = useState<string>('');
  const [isSealed, setIsSealed] = useState<boolean>(false);

  // Modal Visualizar Evolução
  const [viewingRecord, setViewingRecord] = useState<ClinicalRecord | null>(null);

  // Modal Editar Evolução
  const [editingRecord, setEditingRecord] = useState<ClinicalRecord | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editClinicalEvolution, setEditClinicalEvolution] = useState<string>('');
  const [editTechnicalNotes, setEditTechnicalNotes] = useState<string>('');
  const [editIsSealed, setEditIsSealed] = useState<boolean>(false);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const fetchRecords = async (patientId: string) => {
    try {
      setLoading(true);
      const data = await ApiClient.get<ClinicalRecord[]>(`/v1/clinical-records/patient/${patientId}`);
      setRecords(data);
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar prontuário', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function loadPatients() {
      try {
        const data = await ApiClient.get<Patient[]>('/v1/patients');
        setPatients(data);
        if (data.length > 0) {
          setSelectedPatientId(data[0].id);
        }
      } catch (err: any) {
        showToast('Erro ao carregar lista de pacientes', 'error');
      }
    }
    loadPatients();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      fetchRecords(selectedPatientId);
    }
  }, [selectedPatientId]);

  const handleSaveRecord = async () => {
    if (!title || !clinicalEvolution) {
      showToast('Título e anotação da evolução são obrigatórios', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/clinical-records', {
        patientId: selectedPatientId,
        sessionDate,
        title,
        clinicalEvolution,
        technicalNotes: technicalNotes || null,
        isSealed
      });

      showToast('Evolução clínica gravada com sucesso!', 'success');
      setShowNewModal(false);
      setTitle('');
      setClinicalEvolution('');
      setTechnicalNotes('');
      setIsSealed(false);

      if (selectedPatientId) {
        fetchRecords(selectedPatientId);
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar evolução', 'error');
    }
  };

  // Iniciar Edição
  const handleStartEdit = (record: ClinicalRecord) => {
    if (record.is_sealed === 1) {
      showToast('Este prontuário foi lacrado e não pode ser editado (validade jurídica).', 'info');
      return;
    }
    setEditingRecord(record);
    setEditTitle(record.title || '');
    setEditClinicalEvolution(record.clinical_evolution || '');
    setEditTechnicalNotes(record.technical_notes || '');
    setEditIsSealed(false);
  };

  // Salvar Edição com Auditoria
  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    if (!editTitle.trim() || !editClinicalEvolution.trim()) {
      showToast('Título e evolução clínica são obrigatórios', 'error');
      return;
    }

    try {
      setSavingEdit(true);
      await ApiClient.put(`/v1/clinical-records/${editingRecord.id}`, {
        title: editTitle.trim(),
        clinicalEvolution: editClinicalEvolution.trim(),
        technicalNotes: editTechnicalNotes.trim() || null,
        isSealed: editIsSealed
      });

      showToast('Evolução clínica atualizada e auditoria registrada!', 'success');
      setEditingRecord(null);
      if (selectedPatientId) {
        fetchRecords(selectedPatientId);
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar prontuário', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Imprimir / Baixar PDF Oficial com Cabeçalho e Cidade da Clínica
  const handlePrintRecord = (record: ClinicalRecord) => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    const printUrl = `${ApiClient.getBaseUrl()}/v1/clinical-records/${record.id}/print?token=${token}&autoprint=true`;
    window.open(printUrl, '_blank');
  };

  const currentPatient = patients.find(p => p.id === selectedPatientId);

  // Parser de histórico de auditoria
  const parseEditHistory = (jsonStr?: string): any[] => {
    if (!jsonStr) return [];
    try {
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  return (
    <div className="space-y-6">
      {/* LGPD Banner */}
      <div className="bg-indigo-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-xl">
            <ShieldCheck className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Prontuário Eletrônico & Sigilo Profissional</h3>
            <p className="text-xs text-indigo-200">
              Conformidade rigorosa com a LGPD e conselhos de classe. Acesso restrito e auditado.
            </p>
          </div>
        </div>
        <span className="hidden sm:inline-block text-xs font-semibold px-3 py-1 bg-white/10 rounded-full border border-white/20">
          Criptografia & Auditoria Ativa
        </span>
      </div>

      {/* Patient Selector & Action */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
            Selecione o {clientTermLabel}:
          </label>
          <select
            value={selectedPatientId}
            onChange={e => setSelectedPatientId(e.target.value)}
            className="w-full sm:w-72 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            {patients.map(p => (
              <option key={p.id} value={p.id}>
                {p.full_name} {p.is_child ? '(Pediátrico)' : ''}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nova Evolução Clínica
        </button>
      </div>

      {/* Records Timeline */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Carregando histórico do prontuário...
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-200 text-center text-slate-400">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
            <p className="font-medium text-sm text-slate-600">Nenhum registro clínico cadastrado para este paciente.</p>
            <p className="text-xs text-slate-400 mt-1">Clique em "Nova Evolução Clínica" para iniciar o prontuário.</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-indigo-200 ml-4 pl-6 space-y-6">
            {records.map(r => {
              const editHistory = parseEditHistory(r.edit_history_json);
              const isExpanded = expandedRecordId === r.id;

              return (
                <div
                  key={r.id}
                  className={`relative bg-white rounded-2xl border transition-all duration-200 shadow-xs ${
                    isExpanded ? 'border-indigo-300 ring-2 ring-indigo-100 p-6' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 p-4 sm:p-5'
                  }`}
                >
                  {/* Timeline Dot */}
                  <div className={`absolute -left-[31px] top-5 w-4 h-4 rounded-full border-4 border-white shadow-xs transition-colors ${isExpanded ? 'bg-indigo-600 ring-2 ring-indigo-200' : 'bg-slate-400'}`} />

                  {/* CABEÇALHO COMPACTO (Sempre visível: data, profissional, módulo, procedimento, status e seta) */}
                  <div
                    onClick={() => setExpandedRecordId(prev => prev === r.id ? null : r.id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        {/* Data */}
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {r.session_date ? new Date(r.session_date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                        </span>

                        {/* Especialidade / Módulo */}
                        {r.module_type === 'ZemdaOdonto' && (
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200">
                            <Smile className="w-3 h-3 text-cyan-700" /> ZemdaOdonto
                          </span>
                        )}
                        {r.module_type === 'ZemdaNutri' && (
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-lime-100 text-lime-800 border border-lime-200">
                            <Apple className="w-3 h-3 text-lime-700" /> ZemdaNutri
                          </span>
                        )}
                        {r.module_type === 'ZemdaTO' && (
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            <Hand className="w-3 h-3 text-amber-700" /> ZemdaTO
                          </span>
                        )}
                        {r.module_type === 'ZemdaFono' && (
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                            <Mic className="w-3 h-3 text-purple-700" /> ZemdaFono
                          </span>
                        )}
                        {r.module_type === 'ZemdaFisio' && (
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                            <Activity className="w-3 h-3 text-teal-700" /> ZemdaFisio
                          </span>
                        )}
                        {(!r.module_type || r.module_type === 'general') && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Geral / Clínico
                          </span>
                        )}

                        {/* Status */}
                        {r.is_sealed === 1 ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            <Lock className="w-3 h-3" /> Lacrado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            <CheckCircle2 className="w-3 h-3 text-slate-400" /> Finalizado
                          </span>
                        )}

                        {editHistory.length > 0 && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            <History className="w-3 h-3" /> {editHistory.length} {editHistory.length === 1 ? 'edição' : 'edições'}
                          </span>
                        )}
                      </div>

                      {/* Procedimento e Profissional */}
                      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-sm sm:text-base">{r.title}</h4>
                        <span className="text-slate-300 hidden sm:inline">•</span>
                        <p className="text-xs text-slate-500">
                          Profissional: <span className="font-semibold text-slate-700">{r.professional_name}</span> {r.registration_number ? `(${r.registration_number})` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Botão lateral / Ícone: Ver detalhes / Seta */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedRecordId(prev => prev === r.id ? null : r.id);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer ${
                          isExpanded
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                        }`}
                        title={isExpanded ? 'Recolher detalhes deste atendimento' : 'Ver detalhes completos deste atendimento'}
                      >
                        <span>{isExpanded ? 'Recolher' : 'Ver detalhes'}</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* CONTEÚDO EXPANDIDO (Visível apenas quando selecionado) */}
                  {isExpanded && (
                    <div className="mt-5 pt-4 border-t border-slate-100 space-y-4">
                      {/* Clinical Evolution Text */}
                      <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
                        <div>
                          <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">
                            Evolução da Sessão / Conduta Clínica
                          </h5>
                          <p className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 whitespace-pre-wrap font-sans text-slate-800">
                            {r.clinical_evolution}
                          </p>
                        </div>

                        {r.technical_notes && (
                          <div>
                            <h5 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">
                              Anotações Técnicas & Encaminhamentos
                            </h5>
                            <p className="bg-teal-50/50 p-3 rounded-xl border border-teal-100 text-teal-900 whitespace-pre-wrap">
                              {r.technical_notes}
                            </p>
                          </div>
                        )}

                        <ClinicalSnapshot record={r} />
                      </div>

                      {/* AÇÕES CLÍNICAS: VISUALIZAR, EDITAR, BAIXAR PDF, IMPRIMIR */}
                      <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                        <div className="text-[11px] text-slate-400">
                          {currentTenant?.city && (
                            <span>Local: <strong className="text-slate-600">{currentTenant.city}</strong></span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setViewingRecord(r)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                            title="Visualizar detalhes completos da evolução"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-600" />
                            <span>Visualizar</span>
                          </button>

                          {r.is_sealed !== 1 ? (
                            <button
                              onClick={() => handleStartEdit(r)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors cursor-pointer"
                              title="Editar evolução clínica com auditoria"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Editar</span>
                            </button>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-xl cursor-not-allowed"
                              title="Prontuário lacrado para validade jurídica não permite alteração de texto"
                            >
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>Lacrado</span>
                            </span>
                          )}

                          <button
                            onClick={() => handlePrintRecord(r)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-colors cursor-pointer shadow-xs"
                            title="Imprimir ou baixar PDF em folha A4 oficial com cabeçalho da clínica"
                          >
                            <Printer className="w-3.5 h-3.5 text-teal-600" />
                            <span>Imprimir / PDF</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: VISUALIZAR PRONTUÁRIO */}
      {viewingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold text-teal-600 uppercase tracking-wider">Visualização de Prontuário</span>
                <h3 className="text-lg font-bold text-slate-900">{viewingRecord.title}</h3>
              </div>
              <button
                onClick={() => setViewingRecord(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <div>
                <span className="text-slate-400 font-medium">Paciente:</span>
                <p className="font-bold text-slate-800">{currentPatient?.full_name}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Profissional Responsável:</span>
                <p className="font-bold text-slate-800">{viewingRecord.professional_name}</p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Data do Atendimento:</span>
                <p className="font-bold text-slate-800">
                  {viewingRecord.session_date ? new Date(viewingRecord.session_date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                </p>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Status Jurídico:</span>
                <p className="font-bold">
                  {viewingRecord.is_sealed === 1 ? (
                    <span className="text-emerald-700 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Lacrado com Validade
                    </span>
                  ) : (
                    <span className="text-slate-600">Registro Aberto</span>
                  )}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Evolução Clínica & Conduta
              </h4>
              <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap shadow-inner font-sans">
                {viewingRecord.clinical_evolution}
              </div>
            </div>

            {viewingRecord.technical_notes && (
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Orientações Complementares
                </h4>
                <div className="bg-teal-50/50 p-3.5 rounded-xl border border-teal-100 text-xs text-teal-950 whitespace-pre-wrap">
                  {viewingRecord.technical_notes}
                </div>
              </div>
            )}

            <ClinicalSnapshot record={viewingRecord} />

            {/* Histórico de Auditoria / Revisões */}
            {viewingRecord.edit_history_json && parseEditHistory(viewingRecord.edit_history_json).length > 0 && (
              <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <History className="w-3.5 h-3.5 text-amber-700" />
                  <span>Histórico de Auditoria e Revisões</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-amber-800">
                  {parseEditHistory(viewingRecord.edit_history_json).map((item: any, idx: number) => (
                    <div key={idx} className="bg-white/80 p-2 rounded-lg border border-amber-100">
                      <div className="flex justify-between font-semibold">
                        <span>Revisão #{idx + 1}</span>
                        <span>{item.edited_at ? new Date(item.edited_at).toLocaleString('pt-BR') : '-'}</span>
                      </div>
                      <p className="mt-1 text-slate-600">Título anterior: "{item.previous_title}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <button
                onClick={() => handlePrintRecord(viewingRecord)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl shadow-xs"
              >
                <Printer className="w-3.5 h-3.5 text-teal-600" />
                <span>Imprimir Folha A4</span>
              </button>

              <button
                onClick={() => setViewingRecord(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDITAR PRONTUÁRIO COM AUDITORIA */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase">Edição com Auditoria LGPD</span>
                <h3 className="text-lg font-bold text-slate-900">{editingRecord.title}</h3>
              </div>
              <button
                onClick={() => setEditingRecord(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-blue-50 text-blue-900 rounded-xl border border-blue-100 text-xs flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <span>
                Esta alteração será registrada no histórico de auditoria do prontuário, preservando o texto anterior para total transparência clínica e jurídica.
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Título da Sessão *</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Evolução Clínica *</label>
                <textarea
                  rows={6}
                  value={editClinicalEvolution}
                  onChange={e => setEditClinicalEvolution(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs leading-relaxed"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Anotações Técnicas / Orientações</label>
                <textarea
                  rows={2}
                  value={editTechnicalNotes}
                  onChange={e => setEditTechnicalNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs"
                />
              </div>

              <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="editSealCheck"
                  checked={editIsSealed}
                  onChange={e => setEditIsSealed(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded-sm"
                />
                <label htmlFor="editSealCheck" className="text-xs font-semibold text-amber-900 cursor-pointer">
                  Lacrar prontuário eletrônico agora (bloqueia qualquer edição futura)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditingRecord(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50"
              >
                {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: NOVA EVOLUÇÃO */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase">Novo Registro Clínico</span>
                <h3 className="text-xl font-bold text-slate-900">{currentPatient?.full_name}</h3>
              </div>
              <button onClick={() => setShowNewModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data do Atendimento *</label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={e => setSessionDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Título da Sessão *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Ex: Sessão 5 - Regulação Emocional"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Evolução Clínica / Anotações do Atendimento *
                </label>
                <textarea
                  rows={5}
                  value={clinicalEvolution}
                  onChange={e => setClinicalEvolution(e.target.value)}
                  placeholder="Descreva a evolução do paciente, intervenções aplicadas e resposta terapêutica..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Anotações Técnicas / Plano para Próxima Sessão
                </label>
                <textarea
                  rows={2}
                  value={technicalNotes}
                  onChange={e => setTechnicalNotes(e.target.value)}
                  placeholder="Orientações dadas aos pais, atividades para casa ou lembretes clínicos..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs"
                />
              </div>

              <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="sealCheck"
                  checked={isSealed}
                  onChange={e => setIsSealed(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded-sm"
                />
                <label htmlFor="sealCheck" className="text-xs font-semibold text-amber-900 cursor-pointer">
                  Lacrar e finalizar prontuário (bloqueia edições futuras para validade jurídica)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveRecord}
                  className="px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Salvar no Prontuário
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
