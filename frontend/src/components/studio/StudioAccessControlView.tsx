import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  ShieldCheck,
  ShieldAlert,
  QrCode,
  UserCheck,
  LogOut,
  RefreshCw,
  Edit3,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  KeyRound,
  X
} from 'lucide-react';

export const StudioAccessControlView: React.FC = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>({
    todayAllowedCount: 0,
    todayDeniedCount: 0,
    weekAllowedCount: 0,
    monthAllowedCount: 0,
    currentOccupancy: 0,
    activeInsideStudents: [],
    peakHours: []
  });

  const [students, setStudents] = useState<any[]>([]);
  const [checkInMode, setCheckInMode] = useState<'student' | 'cpf' | 'qr'>('student');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [cpfOrCodeInput, setCpfOrCodeInput] = useState<string>('');
  const [qrTokenInput, setQrTokenInput] = useState<string>('');
  const [checkInNotes, setCheckInNotes] = useState<string>('');
  const [authorizeException, setAuthorizeException] = useState<boolean>(false);
  const [exceptionReason, setExceptionReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [lastCheckInResult, setLastCheckInResult] = useState<any | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Modal de Correção Manual Auditável
  const [correctingLog, setCorrectingLog] = useState<any | null>(null);
  const [correctStatus, setCorrectStatus] = useState<'allowed' | 'denied'>('allowed');
  const [correctCheckOut, setCorrectCheckOut] = useState<string>('');
  const [correctReason, setCorrectReason] = useState<string>('');

  const fetchAccessData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (dateFilter) params.set('date', dateFilter);

      const res = await ApiClient.get<any>(`/v1/studio/access/logs?${params.toString()}`);
      setLogs(Array.isArray(res?.logs) ? res.logs : []);
      if (res?.metrics) setMetrics(res.metrics);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar controle de acesso.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccessData();
  }, [statusFilter, dateFilter]);

  useEffect(() => {
    ApiClient.get<any[]>('/v1/patients')
      .then(res => setStudents(Array.isArray(res) ? res : []))
      .catch(() => setStudents([]));
  }, []);

  const handleCheckIn = async (e: React.FormEvent, forceException = false) => {
    e.preventDefault();
    const useException = forceException || authorizeException;
    if (useException && exceptionReason.trim().length < 3) {
      showToast('Informe o motivo da liberação por exceção (mínimo 3 caracteres).', 'error');
      return;
    }

    const payload: any = {
      notes: checkInNotes.trim() || null,
      authorizeException: useException,
      exceptionReason: useException ? exceptionReason.trim() : null
    };

    if (checkInMode === 'student') {
      if (!selectedStudentId) {
        showToast('Selecione o aluno para registrar a entrada.', 'error');
        return;
      }
      payload.studentId = selectedStudentId;
      payload.identificationMethod = 'manual';
    } else if (checkInMode === 'cpf') {
      if (!cpfOrCodeInput.trim()) {
        showToast('Digite o CPF, telefone ou código do aluno.', 'error');
        return;
      }
      payload.cpfOrCode = cpfOrCodeInput.trim();
      payload.identificationMethod = 'cpf';
    } else {
      if (!qrTokenInput.trim()) {
        showToast('Cole ou leia o token QR Code do aluno.', 'error');
        return;
      }
      payload.qrToken = qrTokenInput.trim();
      payload.identificationMethod = 'qr_code';
    }

    try {
      setSubmitting(true);
      const res = await ApiClient.post<any>('/v1/studio/access/check-in', payload);
      setLastCheckInResult(res);
      showToast(
        res.isException
          ? `Entrada liberada por exceção para ${res.student?.fullName}!`
          : `Acesso liberado para ${res.student?.fullName}!`,
        'success'
      );
      setAuthorizeException(false);
      setExceptionReason('');
      setCheckInNotes('');
      fetchAccessData();
    } catch (err: any) {
      // Quando bloqueado (422), exibe o card de bloqueio com opção de liberar por exceção
      setLastCheckInResult({
        allowed: false,
        denialReasonCode: err?.code || 'ACCESS_DENIED',
        denialReasonMessage: err?.message || 'Entrada bloqueada pelas regras do plano.'
      });
      showToast(err?.message || 'Acesso bloqueado.', 'error');
      fetchAccessData();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async (logId: string, studentName?: string) => {
    try {
      await ApiClient.post(`/v1/studio/access/${logId}/check-out`, {});
      showToast(`Saída registrada${studentName ? ` para ${studentName}` : ''}!`, 'success');
      fetchAccessData();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao registrar saída.', 'error');
    }
  };

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingLog) return;
    if (correctReason.trim().length < 3) {
      showToast('Informe o motivo da retificação para auditoria.', 'error');
      return;
    }
    try {
      await ApiClient.patch(`/v1/studio/access/${correctingLog.id}/correct`, {
        accessStatus: correctStatus,
        checkOutAt: correctCheckOut.trim() ? correctCheckOut.trim() : undefined,
        correctionReason: correctReason.trim()
      });
      showToast('Registro de acesso retificado com sucesso!', 'success');
      setCorrectingLog(null);
      setCorrectReason('');
      fetchAccessData();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao corrigir registro.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-600" />
            Controle de Acesso &amp; Portaria (Academia &amp; Studio)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Valide entradas de acesso livre ou limitado por nome, CPF/código ou QR Code sem consumir créditos de aulas agendadas.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchAccessData}
          className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar Painel
        </button>
      </div>

      {/* KPIs de Ocupação e Acesso */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl border border-teal-200 bg-teal-50 text-teal-900">
          <div className="text-[11px] font-semibold opacity-80 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> Presentes Agora
          </div>
          <div className="text-2xl font-extrabold mt-1">{metrics.currentOccupancy ?? 0}</div>
        </div>
        <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900">
          <div className="text-[11px] font-semibold opacity-80">Entradas Hoje</div>
          <div className="text-2xl font-extrabold mt-1">{metrics.todayAllowedCount ?? 0}</div>
        </div>
        <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-900">
          <div className="text-[11px] font-semibold opacity-80">Bloqueios Hoje</div>
          <div className="text-2xl font-extrabold mt-1">{metrics.todayDeniedCount ?? 0}</div>
        </div>
        <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-900">
          <div className="text-[11px] font-semibold opacity-80">Acessos na Semana</div>
          <div className="text-2xl font-extrabold mt-1">{metrics.weekAllowedCount ?? 0}</div>
        </div>
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-slate-900">
          <div className="text-[11px] font-semibold opacity-80">Acessos no Mês</div>
          <div className="text-2xl font-extrabold mt-1">{metrics.monthAllowedCount ?? 0}</div>
        </div>
      </div>

      {/* Terminal de Check-in + Alunos Presentes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Terminal de Registro de Entrada */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-teal-600" />
              Registrar Entrada (Check-in da Academia)
            </h3>
            <div className="flex items-center gap-1.5 text-xs">
              {[
                { id: 'student', label: 'Por Aluno' },
                { id: 'cpf', label: 'CPF / Telefone' },
                { id: 'qr', label: 'QR Code' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCheckInMode(tab.id as any)}
                  className={`px-3 py-1 rounded-xl font-bold cursor-pointer ${
                    checkInMode === tab.id ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={e => handleCheckIn(e, false)} className="space-y-3 text-xs">
            {checkInMode === 'student' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Selecione o Aluno *</label>
                <select
                  value={selectedStudentId}
                  onChange={e => setSelectedStudentId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 font-semibold text-slate-900"
                >
                  <option value="">Escolha o aluno na lista...</option>
                  {students.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.full_name} {st.phone ? `• ${st.phone}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {checkInMode === 'cpf' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">CPF, Telefone ou Código do Aluno *</label>
                <input
                  type="text"
                  value={cpfOrCodeInput}
                  onChange={e => setCpfOrCodeInput(e.target.value)}
                  placeholder="Digite o CPF, WhatsApp ou nome completo..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-white font-semibold"
                />
              </div>
            )}

            {checkInMode === 'qr' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-indigo-600" /> Token QR Code do Aluno *
                </label>
                <input
                  type="text"
                  value={qrTokenInput}
                  onChange={e => setQrTokenInput(e.target.value)}
                  placeholder="Cole ou escaneie o código zqr...."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-white font-mono"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <input
                type="text"
                value={checkInNotes}
                onChange={e => setCheckInNotes(e.target.value)}
                placeholder="Observação rápida (opcional)..."
                className="border border-slate-200 rounded-xl px-3 py-2 bg-white"
              />
              <label className="flex items-center gap-2 font-semibold text-amber-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={authorizeException}
                  onChange={e => setAuthorizeException(e.target.checked)}
                />
                Liberar por exceção (com justificativa)
              </label>
            </div>

            {authorizeException && (
              <div>
                <label className="block font-semibold text-amber-900 mb-1">Justificativa obrigatória da exceção *</label>
                <input
                  type="text"
                  value={exceptionReason}
                  onChange={e => setExceptionReason(e.target.value)}
                  placeholder="Ex: Reposição autorizada pela gerência..."
                  className="w-full border border-amber-300 bg-amber-50/50 rounded-xl px-3 py-2"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-sm shadow-xs cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Validando Acesso...' : 'Validar e Registrar Entrada'}
            </button>
          </form>

          {/* Resultado Imediato do Check-in */}
          {lastCheckInResult && (
            <div
              className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                lastCheckInResult.allowed
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950'
              }`}
            >
              <div className="flex items-start gap-3">
                {lastCheckInResult.allowed ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 text-xs">
                  <div className="font-extrabold text-sm">
                    {lastCheckInResult.allowed
                      ? lastCheckInResult.isException
                        ? `ENTRADA LIBERADA POR EXCEÇÃO — ${lastCheckInResult.student?.fullName || ''}`
                        : `ACESSO LIBERADO — ${lastCheckInResult.student?.fullName || ''}`
                      : 'ACESSO BLOQUEADO'}
                  </div>
                  {lastCheckInResult.allowed ? (
                    <div className="text-emerald-800 space-x-2">
                      <span>Plano: <strong>{lastCheckInResult.planName}</strong></span>
                      {lastCheckInResult.usageStats && (
                        <span>
                          • Acessos na semana: <strong>{lastCheckInResult.usageStats.weekEntries}</strong>
                          {lastCheckInResult.usageStats.maxEntriesPerWeek ? `/${lastCheckInResult.usageStats.maxEntriesPerWeek}` : ' (Livre)'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-rose-800 font-medium">
                      Motivo ({lastCheckInResult.denialReasonCode}): {lastCheckInResult.denialReasonMessage}
                    </div>
                  )}
                </div>
              </div>
              {!lastCheckInResult.allowed && !authorizeException && (
                <button
                  type="button"
                  onClick={() => setAuthorizeException(true)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-rose-300 text-rose-800 font-bold text-xs hover:bg-rose-100 cursor-pointer shrink-0"
                >
                  Autorizar Exceção
                </button>
              )}
            </div>
          )}
        </div>

        {/* Lista de Alunos Presentes Agora (Check-out Rápido) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                No Estabelecimento ({metrics.activeInsideStudents?.length || 0})
              </h3>
              <span className="text-[10px] text-slate-400">Janela ativa 3h</span>
            </div>

            {!metrics.activeInsideStudents || metrics.activeInsideStudents.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">
                Nenhum aluno com entrada aberta no momento.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {metrics.activeInsideStudents.map((st: any) => (
                  <div key={st.logId} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">{st.studentName}</div>
                      <div className="text-[10px] text-slate-500 truncate">
                        Entrada às {String(st.checkInAt || '').slice(11, 16)} • {st.planName || 'Plano'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCheckOut(st.logId, st.studentName)}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 text-indigo-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <LogOut className="w-3 h-3" /> Saída
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Histórico Completo de Acessos e Auditoria */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-teal-600" />
            Histórico de Entradas, Saídas e Tentativas Bloqueadas
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 font-semibold"
            >
              <option value="all">Todos os status</option>
              <option value="allowed">Liberados</option>
              <option value="denied">Bloqueados / Negados</option>
            </select>
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-1.5 bg-white"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Carregando registros de acesso...</div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">Nenhum registro de acesso encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] text-slate-400 uppercase">
                  <th className="py-2.5 px-3">Data / Entrada</th>
                  <th className="py-2.5 px-3">Saída</th>
                  <th className="py-2.5 px-3">Aluno</th>
                  <th className="py-2.5 px-3">Plano / Método</th>
                  <th className="py-2.5 px-3">Resultado</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(log => {
                  const isAllowed = log.access_status === 'allowed';
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">
                        {String(log.check_in_at || '').slice(0, 16).replace('T', ' ')}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {log.check_out_at ? String(log.check_out_at).slice(11, 16) : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {log.student_name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        <div>{log.plan_name_snapshot || 'Sem plano ativo'}</div>
                        <div className="text-[10px] text-slate-400 uppercase">{log.identification_method}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        {isAllowed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            {log.is_exception ? 'Exceção Autorizada' : 'Liberado'}
                          </span>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3 h-3" /> Bloqueado
                            </span>
                            {log.denial_reason_message && (
                              <div className="text-[10px] text-rose-700 mt-0.5">{log.denial_reason_message}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1">
                        {isAllowed && !log.check_out_at && (
                          <button
                            type="button"
                            onClick={() => handleCheckOut(log.id, log.student_name)}
                            className="px-2 py-1 rounded-lg border border-slate-200 text-indigo-700 hover:bg-indigo-50 font-semibold text-[11px] cursor-pointer"
                          >
                            Registrar Saída
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setCorrectingLog(log);
                            setCorrectStatus(log.access_status === 'denied' ? 'denied' : 'allowed');
                            setCorrectCheckOut(log.check_out_at || '');
                            setCorrectReason('');
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="Retificar Registro com Auditoria"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
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

      {/* Modal de Retificação Manual Auditável */}
      {correctingLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Retificar Registro de Acesso</h3>
              <button type="button" onClick={() => setCorrectingLog(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCorrection} className="space-y-3">
              <p className="text-slate-600">
                Aluno: <strong>{correctingLog.student_name}</strong> ({String(correctingLog.check_in_at || '').slice(0, 16).replace('T', ' ')})
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Status do Acesso</label>
                <select
                  value={correctStatus}
                  onChange={e => setCorrectStatus(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white"
                >
                  <option value="allowed">Liberado</option>
                  <option value="denied">Negado / Cancelado</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Data/Hora de Saída (YYYY-MM-DDTHH:MM:00)</label>
                <input
                  type="text"
                  value={correctCheckOut}
                  onChange={e => setCorrectCheckOut(e.target.value)}
                  placeholder="Ex: 2026-11-18T10:30:00"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Motivo da Correção Manual *</label>
                <input
                  type="text"
                  required
                  value={correctReason}
                  onChange={e => setCorrectReason(e.target.value)}
                  placeholder="Obrigatório para auditoria..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setCorrectingLog(null)} className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer">
                  Salvar Retificação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
