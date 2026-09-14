import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  ClipboardList,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  FileCheck,
  Calendar,
  User,
  Trash2,
  Edit3,
  Filter,
  Eye,
  Printer,
  Download
} from 'lucide-react';
import { PendingExam, Patient, Professional } from '../../types';
import { PrintableDocumentModal } from '../clinical/PrintableDocumentModal';

export const PendingExamsView: React.FC = () => {
  const { showToast } = useToast();
  const { clientTermLabel } = useAuth();

  const [exams, setExams] = useState<PendingExam[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filtros
  const [search, setSearch] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterProfId, setFilterProfId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Modais
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [editingExam, setEditingExam] = useState<PendingExam | null>(null);
  const [receivingExam, setReceivingExam] = useState<PendingExam | null>(null);

  // Modal de Impressão / Documento A4
  const [printingExamId, setPrintingExamId] = useState<string | null>(null);
  const [printInitialAction, setPrintInitialAction] = useState<'view' | 'print' | 'pdf'>('view');

  // Form states para Novo / Edição
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedProfId, setSelectedProfId] = useState<string>('');
  const [examName, setExamName] = useState<string>('');
  const [requestDate, setRequestDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState<string>('');
  const [examNotes, setExamNotes] = useState<string>('');
  const [cidCode, setCidCode] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Form state para Dar Baixa
  const [receivedDate, setReceivedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [receivedNotes, setReceivedNotes] = useState<string>('');

  const fetchAuxData = async () => {
    try {
      const [pts, profs] = await Promise.all([
        ApiClient.get<Patient[]>('/v1/patients'),
        ApiClient.get<Professional[]>('/v1/professionals')
      ]);
      setPatients(pts);
      setProfessionals(profs);
      if (pts.length > 0 && !selectedPatientId) setSelectedPatientId(pts[0].id);
      if (profs.length > 0 && !selectedProfId) setSelectedProfId(profs[0].id);
    } catch (e) {
      console.warn('Erro ao carregar dados auxiliares:', e);
    }
  };

  const fetchExams = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterProfId) params.append('professionalId', filterProfId);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (search) params.append('search', search);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const data = await ApiClient.get<PendingExam[]>(`/v1/pending-exams${qs}`);
      setExams(data);
    } catch (err: any) {
      showToast('Erro ao carregar exames a receber', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuxData();
  }, []);

  useEffect(() => {
    fetchExams();
  }, [filterStatus, filterProfId, startDate, endDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchExams();
  };

  const handleOpenPrintDoc = (examId: string, action: 'view' | 'print' | 'pdf') => {
    setPrintInitialAction(action);
    setPrintingExamId(examId);
  };

  const handleCreateExam = async () => {
    if (!selectedPatientId || !examName.trim() || !requestDate) {
      showToast('Preencha o paciente, nome do exame e data de solicitação', 'error');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/pending-exams', {
        patientId: selectedPatientId,
        professionalId: selectedProfId || null,
        examName: examName.trim(),
        requestDate,
        expectedDate: expectedDate || null,
        notes: examNotes || null,
        cidCode: cidCode.trim() || null
      });

      showToast('Exame adicionado ao controle com sucesso!', 'success');
      setShowNewModal(false);
      setExamName('');
      setExamNotes('');
      setCidCode('');
      setExpectedDate('');
      fetchExams();
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar exame', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingExam || !examName.trim()) return;
    try {
      setSaving(true);
      await ApiClient.put(`/v1/pending-exams/${editingExam.id}`, {
        examName: examName.trim(),
        professionalId: selectedProfId || null,
        requestDate,
        expectedDate: expectedDate || null,
        notes: examNotes || null,
        cidCode: cidCode.trim() || null
      });

      showToast('Exame atualizado com sucesso!', 'success');
      setEditingExam(null);
      setCidCode('');
      fetchExams();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar exame', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReceived = async () => {
    if (!receivingExam) return;
    try {
      setSaving(true);
      await ApiClient.put(`/v1/pending-exams/${receivingExam.id}`, {
        status: 'received',
        receivedDate,
        notes: receivedNotes ? `${receivingExam.notes ? receivingExam.notes + ' | ' : ''}Resultado: ${receivedNotes}` : receivingExam.notes
      });

      showToast('Exame marcado como recebido!', 'success');
      setReceivingExam(null);
      setReceivedNotes('');
      fetchExams();
    } catch (err: any) {
      showToast(err.message || 'Erro ao dar baixa no exame', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este registro de exame?')) return;
    try {
      await ApiClient.delete(`/v1/pending-exams/${id}`);
      showToast('Registro excluído!', 'success');
      fetchExams();
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir exame', 'error');
    }
  };

  const openEditModal = (exam: PendingExam) => {
    setEditingExam(exam);
    setSelectedPatientId(exam.patient_id);
    setSelectedProfId(exam.professional_id || '');
    setExamName(exam.exam_name);
    setRequestDate(exam.request_date);
    setExpectedDate(exam.expected_date || '');
    setExamNotes(exam.notes || '');
    setCidCode(exam.cid_code || '');
  };

  // Contadores de resumo
  const waitingCount = exams.filter(e => e.status === 'waiting' && !e.is_delayed).length;
  const delayedCount = exams.filter(e => e.is_delayed || e.status === 'delayed').length;
  const receivedCount = exams.filter(e => e.status === 'received').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <ClipboardList className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Exames a Receber</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Controle solicitações, prazos e laudos de exames pendentes dos {clientTermLabel.toLowerCase()}s com alertas de atraso.
          </p>
        </div>

        <button
          onClick={() => {
            setExamName('');
            setExamNotes('');
            setCidCode('');
            setExpectedDate('');
            setShowNewModal(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer text-xs self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          Registrar Solicitação de Exame
        </button>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">Aguardando Entrega</p>
            <h3 className="text-2xl font-bold text-amber-600 mt-1">{waitingCount}</h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">Exames Atrasados</p>
            <h3 className="text-2xl font-bold text-rose-600 mt-1">{delayedCount}</h3>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">Laudos Recebidos</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{receivedCount}</h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Buscar por exame, ${clientTermLabel.toLowerCase()} ou observação...`}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
          />
        </form>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium text-slate-700"
        >
          <option value="">Todos os Status</option>
          <option value="waiting">Aguardando</option>
          <option value="received">Recebido</option>
          <option value="cancelled">Cancelado</option>
        </select>

        <select
          value={filterProfId}
          onChange={e => setFilterProfId(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium text-slate-700"
        >
          <option value="">Todos os Profissionais</option>
          {professionals.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>De:</span>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="border border-slate-200 rounded-xl px-2 py-1.5 bg-slate-50 text-xs"
          />
          <span>Até:</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="border border-slate-200 rounded-xl px-2 py-1.5 bg-slate-50 text-xs"
          />
        </div>
      </div>

      {/* Tabela de Exames */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Carregando exames...</div>
        ) : exams.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            Nenhum exame pendente ou registrado para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-4">{clientTermLabel}</th>
                  <th className="p-4">Exame Solicitado</th>
                  <th className="p-4">Solicitante</th>
                  <th className="p-4">Data Solicitação</th>
                  <th className="p-4">Previsão</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exams.map(exam => {
                  const isDelayed = exam.is_delayed || exam.status === 'delayed';
                  const isReceived = exam.status === 'received';

                  return (
                    <tr key={exam.id} className="hover:bg-slate-50/50 transition-all">
                      <td className="p-4 font-bold text-slate-900">
                        <div>{exam.patient_name}</div>
                        {exam.patient_phone && (
                          <div className="text-[10px] text-slate-400 font-normal">{exam.patient_phone}</div>
                        )}
                      </td>

                      <td className="p-4">
                        <span className="font-semibold text-slate-800">{exam.exam_name}</span>
                        {exam.notes && (
                          <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{exam.notes}</p>
                        )}
                      </td>

                      <td className="p-4 text-slate-600 font-medium">
                        {exam.professional_name || '—'}
                      </td>

                      <td className="p-4 text-slate-500">
                        {new Date(exam.request_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </td>

                      <td className="p-4">
                        {exam.expected_date ? (
                          <div className="flex items-center gap-1.5">
                            <span className={isDelayed ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                              {new Date(exam.expected_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </span>
                            {isDelayed && (
                              <span className="bg-rose-100 text-rose-700 text-[9px] font-bold px-1.5 py-0.5 rounded">
                                Atrasado
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">Não informada</span>
                        )}
                      </td>

                      <td className="p-4">
                        {isReceived ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" /> Recebido
                          </span>
                        ) : isDelayed ? (
                          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <AlertTriangle className="w-3 h-3" /> Atrasado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <Clock className="w-3 h-3" /> Aguardando
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                        {/* 1. Visualizar Solicitação de Exame */}
                        <button
                          onClick={() => handleOpenPrintDoc(exam.id, 'view')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg text-[11px] font-semibold transition-all cursor-pointer"
                          title="Visualizar Solicitação de Exame em folha A4"
                        >
                          <Eye className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="hidden xl:inline">Visualizar</span>
                        </button>

                        {/* 2. Imprimir Solicitação de Exame */}
                        <button
                          onClick={() => handleOpenPrintDoc(exam.id, 'print')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-teal-700 hover:bg-teal-50 border border-slate-200 hover:border-teal-200 rounded-lg text-[11px] font-semibold transition-all cursor-pointer"
                          title="Imprimir Solicitação de Exame em papel A4"
                        >
                          <Printer className="w-3.5 h-3.5 text-teal-600" />
                          <span className="hidden xl:inline">Imprimir</span>
                        </button>

                        {/* 3. Baixar PDF */}
                        <button
                          onClick={() => handleOpenPrintDoc(exam.id, 'pdf')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg text-[11px] font-semibold transition-all cursor-pointer"
                          title="Baixar PDF da Solicitação de Exame"
                        >
                          <Download className="w-3.5 h-3.5 text-blue-600" />
                          <span className="hidden xl:inline">Baixar PDF</span>
                        </button>

                        {!isReceived && (
                          <button
                            onClick={() => {
                              setReceivingExam(exam);
                              setReceivedDate(new Date().toISOString().split('T')[0]);
                              setReceivedNotes('');
                            }}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-[11px] transition-all cursor-pointer"
                            title="Dar Baixa / Marcar Recebido"
                          >
                            Dar Baixa
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(exam)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                          title="Editar"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(exam.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Novo Exame */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Registrar Solicitação de Exame</h3>
              <button onClick={() => setShowNewModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">{clientTermLabel} *</label>
                <select
                  value={selectedPatientId}
                  onChange={e => setSelectedPatientId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
                >
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Profissional Solicitante</label>
                <select
                  value={selectedProfId}
                  onChange={e => setSelectedProfId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
                >
                  <option value="">Nenhum / Externo</option>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Exame / Procedimento *</label>
                <input
                  type="text"
                  value={examName}
                  onChange={e => setExamName(e.target.value)}
                  placeholder="Ex: Hemograma Completo, Ressonância Magnética Craniana"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data da Solicitação *</label>
                  <input
                    type="date"
                    value={requestDate}
                    onChange={e => setRequestDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Previsão de Entrega</label>
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={e => setExpectedDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">CID-10 (Opcional)</label>
                <input
                  type="text"
                  value={cidCode}
                  onChange={e => setCidCode(e.target.value)}
                  placeholder="Ex: R10.4, M54.5"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações / Laboratório / Orientações</label>
                <textarea
                  rows={2}
                  value={examNotes}
                  onChange={e => setExamNotes(e.target.value)}
                  placeholder="Ex: Laboratório Fleury, jejum de 12 horas necessário..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateExam}
                  disabled={saving}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Exame'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dar Baixa / Recebido */}
      {receivingExam && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Dar Baixa no Exame</h3>
              <button onClick={() => setReceivingExam(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <p className="font-bold text-emerald-900">{receivingExam.exam_name}</p>
                <p className="text-emerald-700 text-[11px] mt-0.5">Paciente: {receivingExam.patient_name}</p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Data do Recebimento do Laudo *</label>
                <input
                  type="date"
                  value={receivedDate}
                  onChange={e => setReceivedDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notas do Resultado / Conclusão</label>
                <textarea
                  rows={3}
                  value={receivedNotes}
                  onChange={e => setReceivedNotes(e.target.value)}
                  placeholder="Ex: Laudo normal sem alterações, arquivado no prontuário..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReceivingExam(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleMarkReceived}
                  disabled={saving}
                  className="px-6 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {saving ? 'Gravando...' : 'Confirmar Recebimento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Exame */}
      {editingExam && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Editar Exame</h3>
              <button onClick={() => setEditingExam(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Profissional Solicitante</label>
                <select
                  value={selectedProfId}
                  onChange={e => setSelectedProfId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
                >
                  <option value="">Nenhum / Externo</option>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Exame *</label>
                <input
                  type="text"
                  value={examName}
                  onChange={e => setExamName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data da Solicitação *</label>
                  <input
                    type="date"
                    value={requestDate}
                    onChange={e => setRequestDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Previsão de Entrega</label>
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={e => setExpectedDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">CID-10 (Opcional)</label>
                <input
                  type="text"
                  value={cidCode}
                  onChange={e => setCidCode(e.target.value)}
                  placeholder="Ex: R10.4, M54.5"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={examNotes}
                  onChange={e => setExamNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingExam(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Impressão / Visualização / PDF */}
      {printingExamId && (
        <PrintableDocumentModal
          documentType="pending_exam"
          documentId={printingExamId}
          initialAction={printInitialAction}
          onClose={() => setPrintingExamId(null)}
        />
      )}
    </div>
  );
};
export default PendingExamsView;
