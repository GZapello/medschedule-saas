import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  X,
  XCircle
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PatientSearchResult, PatientSearchSelect } from '../common/PatientSearchSelect';
import { ResponsiveTable } from '../common/ResponsiveTable';
import { LaunchStudentConsumptionModal } from './LaunchStudentConsumptionModal';

interface StudentConsumptionTabProps {
  canCreate: boolean;
  canManageFinancial: boolean;
  canEditPrice: boolean;
}

const formatCurrencyCents = (cents: number) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDateTime = (raw?: string | null) => {
  if (!raw) return '—';
  const clean = String(raw);
  const datePart = clean.slice(0, 10);
  const timePart = clean.length >= 16 ? clean.slice(11, 16) : '';
  const [y, m, d] = datePart.split('-');
  return d && m && y ? `${d}/${m}/${y}${timePart ? ` ${timePart}` : ''}` : clean;
};

const METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  cash: 'Dinheiro',
  bank_transfer: 'Transferência',
  other: 'Outro'
};

export const StudentConsumptionTab: React.FC<StudentConsumptionTabProps> = ({
  canCreate,
  canManageFinancial,
  canEditPrice
}) => {
  const { showToast } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [consumptions, setConsumptions] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    totalPendingCents: 0,
    totalPaidCents: 0,
    totalCancelledCents: 0,
    countPending: 0,
    countPaid: 0,
    countTotal: 0
  });

  // Filtros
  const [filterPatientId, setFilterPatientId] = useState<string>('');
  const [filterPatientObj, setFilterPatientObj] = useState<PatientSearchResult | null>(null);
  const [studentSummary, setStudentSummary] = useState<{
    pendingProductsCents: number;
    pendingTuitionsCents: number;
    consolidatedPendingCents: number;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // Modais
  const [showLaunchModal, setShowLaunchModal] = useState<boolean>(false);
  const [settlingItem, setSettlingItem] = useState<any | null>(null);
  const [settleMethod, setSettleMethod] = useState<string>('pix');
  const [settleDate, setSettleDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [settleNotes, setSettleNotes] = useState<string>('');
  const [submittingSettle, setSubmittingSettle] = useState<boolean>(false);

  const [cancellingItem, setCancellingItem] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [revertStock, setRevertStock] = useState<boolean>(true);
  const [submittingCancel, setSubmittingCancel] = useState<boolean>(false);

  const fetchConsumptions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterPatientId) params.set('patientId', filterPatientId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (search.trim()) params.set('search', search.trim());

      const res = await ApiClient.get<any>(`/v1/studio/consumptions?${params.toString()}`);
      setConsumptions(Array.isArray(res?.consumptions) ? res.consumptions : []);
      if (res?.summary) setSummary(res.summary);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar consumos dos alunos.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterPatientId, statusFilter, startDate, endDate, search, showToast]);

  const fetchStudentSummary = useCallback(async () => {
    if (!filterPatientId) {
      setStudentSummary(null);
      return;
    }
    try {
      const data = await ApiClient.get<any>(`/v1/studio/consumptions/student/${filterPatientId}`);
      setStudentSummary({
        pendingProductsCents: Number(data?.pendingProductsCents || 0),
        pendingTuitionsCents: Number(data?.pendingTuitionsCents || 0),
        consolidatedPendingCents: Number(data?.consolidatedPendingCents || 0)
      });
    } catch {
      setStudentSummary(null);
    }
  }, [filterPatientId]);

  useEffect(() => {
    fetchConsumptions();
  }, [fetchConsumptions]);

  useEffect(() => {
    fetchStudentSummary();
  }, [fetchStudentSummary]);

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingItem || submittingSettle) return;
    try {
      setSubmittingSettle(true);
      await ApiClient.post(`/v1/studio/consumptions/${settlingItem.id}/settle`, {
        paymentMethod: settleMethod,
        paymentDate: settleDate,
        notes: settleNotes.trim() || undefined
      });
      showToast('Consumo quitado com sucesso!', 'success');
      setSettlingItem(null);
      fetchConsumptions();
      fetchStudentSummary();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao quitar consumo.', 'error');
    } finally {
      setSubmittingSettle(false);
    }
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingItem || submittingCancel) return;
    if (!cancelReason.trim()) {
      showToast('Informe o motivo do cancelamento ou estorno.', 'error');
      return;
    }
    try {
      setSubmittingCancel(true);
      await ApiClient.post(`/v1/studio/consumptions/${cancellingItem.id}/cancel`, {
        reason: cancelReason.trim(),
        revertStock
      });
      showToast(
        cancellingItem.payment_status === 'paid'
          ? 'Consumo estornado com histórico preservado!'
          : 'Consumo cancelado com sucesso!',
        'success'
      );
      setCancellingItem(null);
      fetchConsumptions();
      fetchStudentSummary();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao cancelar consumo.', 'error');
    } finally {
      setSubmittingCancel(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">Pago</span>;
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">Pendente</span>;
      case 'refunded':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px]">Estornado</span>;
      case 'cancelled':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold text-[10px]">Cancelado</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px]">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Vendas Pagas</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-600">{formatCurrencyCents(summary.totalPaidCents)}</div>
          <p className="text-xs text-slate-400 mt-1">{summary.countPaid} venda(s) confirmada(s)</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Pendente / A Receber</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-amber-600">{formatCurrencyCents(summary.totalPendingCents)}</div>
          <p className="text-xs text-slate-400 mt-1">{summary.countPending} consumo(s) em aberto</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Consumos Registrados</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{summary.countTotal}</div>
          <p className="text-xs text-slate-400 mt-1">produtos lançados no filtro</p>
        </div>
      </div>

      {/* Resumo Financeiro Consolidado por Aluno selecionado */}
      {filterPatientId && studentSummary && (
        <div className="bg-white p-4 rounded-2xl border border-teal-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
              Resumo Financeiro do Aluno ({filterPatientObj?.full_name || filterPatientObj?.name || 'Selecionado'})
            </span>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Consumos permanecem em lançamentos separados, sem alterar mensalidades ou cobranças emitidas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">Mensalidades pendentes</span>
              <strong className="text-slate-800">{formatCurrencyCents(studentSummary.pendingTuitionsCents)}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Consumos pendentes</span>
              <strong className="text-amber-700">{formatCurrencyCents(studentSummary.pendingProductsCents)}</strong>
            </div>
            <div className="pl-3 border-l border-slate-200">
              <span className="text-slate-400 block text-[10px]">Total consolidado a receber</span>
              <strong className="text-sm font-extrabold text-indigo-700">{formatCurrencyCents(studentSummary.consolidatedPendingCents)}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Filtros e Listagem */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Consumo dos Alunos</h3>
              <p className="text-[11px] text-slate-500">Registro integrado ao Estoque de Insumos e Contas a Receber do Studio.</p>
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={() => setShowLaunchModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs min-h-[40px] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Lançar Consumo
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="lg:col-span-1">
              <PatientSearchSelect
                compact
                value={filterPatientId}
                selectedPatient={filterPatientObj}
                onChange={(id, pat) => {
                  setFilterPatientId(id);
                  setFilterPatientObj(pat || null);
                }}
                onClear={() => {
                  setFilterPatientId('');
                  setFilterPatientObj(null);
                }}
                placeholder="Filtrar por aluno..."
                clientTermLabel="Aluno"
                enableCreateNew={false}
              />
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar produto ou aluno..."
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 min-h-[38px]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 min-h-[38px]"
            >
              <option value="all">Todas as situações</option>
              <option value="pending">Pendente (a receber)</option>
              <option value="paid">Pago</option>
              <option value="cancelled">Cancelado</option>
              <option value="refunded">Estornado</option>
            </select>

            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              title="Data inicial"
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 min-h-[38px]"
            />

            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              title="Data final"
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 min-h-[38px]"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Carregando consumos...</div>
        ) : consumptions.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Nenhum consumo encontrado para os filtros aplicados.
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {consumptions.map(c => (
                <div key={c.id} className="p-4 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900">{c.patient_name}</div>
                      <div className="text-[11px] text-slate-500">{formatDateTime(c.created_at)}</div>
                    </div>
                    {statusBadge(c.payment_status)}
                  </div>
                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div>
                      <span className="font-semibold text-slate-800 block">{c.product_name_snapshot}</span>
                      <span className="text-[11px] text-slate-500">
                        {c.quantity} {c.sale_unit_snapshot} × {formatCurrencyCents(c.unit_price_cents)}
                      </span>
                    </div>
                    <strong className="text-sm text-slate-900">{formatCurrencyCents(c.total_amount_cents)}</strong>
                  </div>
                  {c.cancellation_reason && (
                    <div className="text-[11px] text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-lg">
                      Motivo: {c.cancellation_reason}
                    </div>
                  )}
                  {canManageFinancial && (c.payment_status === 'pending' || c.payment_status === 'paid') && (
                    <div className="flex items-center gap-2 pt-1">
                      {c.payment_status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSettlingItem(c);
                            setSettleMethod('pix');
                            setSettleDate(new Date().toISOString().slice(0, 10));
                            setSettleNotes('');
                          }}
                          className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs cursor-pointer"
                        >
                          Quitar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setCancellingItem(c);
                          setCancelReason('');
                          setRevertStock(true);
                        }}
                        className="flex-1 py-2 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 font-bold text-xs cursor-pointer"
                      >
                        {c.payment_status === 'paid' ? 'Estornar' : 'Cancelar'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto mobile-table-container">
              <ResponsiveTable className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-5 py-3.5">Data</th>
                    <th className="px-5 py-3.5">Aluno</th>
                    <th className="px-5 py-3.5">Produto</th>
                    <th className="px-5 py-3.5">Total</th>
                    <th className="px-5 py-3.5">Situação</th>
                    <th className="px-5 py-3.5">Responsável</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {consumptions.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 text-slate-500 font-medium whitespace-nowrap">
                        {formatDateTime(c.created_at)}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-slate-900">
                        {c.patient_name}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-800">{c.product_name_snapshot}</div>
                        <div className="text-[11px] text-slate-400">
                          {c.quantity} {c.sale_unit_snapshot} × {formatCurrencyCents(c.unit_price_cents)}
                          {c.notes ? ` · ${c.notes}` : ''}
                        </div>
                        {c.cancellation_reason && (
                          <div className="text-[10px] text-rose-600 mt-0.5">
                            Motivo: {c.cancellation_reason}
                            {Number(c.stock_reverted) === 1 ? ' (estoque devolvido)' : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-extrabold text-slate-900">
                        {formatCurrencyCents(c.total_amount_cents)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          {statusBadge(c.payment_status)}
                          {c.payment_status === 'paid' && c.payment_method && (
                            <span className="text-[10px] text-slate-500">
                              {METHOD_LABELS[c.payment_method] || c.payment_method}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-[11px]">
                        {c.created_by_name || 'Sistema'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {canManageFinancial && (c.payment_status === 'pending' || c.payment_status === 'paid') ? (
                          <div className="inline-flex items-center gap-1.5">
                            {c.payment_status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSettlingItem(c);
                                  setSettleMethod('pix');
                                  setSettleDate(new Date().toISOString().slice(0, 10));
                                  setSettleNotes('');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Quitar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setCancellingItem(c);
                                setCancelReason('');
                                setRevertStock(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] cursor-pointer"
                            >
                              {c.payment_status === 'paid' ? (
                                <>
                                  <RotateCcw className="w-3 h-3" />
                                  Estornar
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3 h-3" />
                                  Cancelar
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>
          </>
        )}
      </div>

      {/* Modal Lançar Consumo */}
      <LaunchStudentConsumptionModal
        isOpen={showLaunchModal}
        onClose={() => setShowLaunchModal(false)}
        onSuccess={() => {
          fetchConsumptions();
          fetchStudentSummary();
        }}
        canEditPrice={canEditPrice}
        initialPatient={filterPatientObj}
      />

      {/* Modal Quitar Consumo Pendente */}
      {settlingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Quitar Consumo</h3>
                <p className="text-[11px] text-slate-500">
                  {settlingItem.patient_name} · {settlingItem.product_name_snapshot}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setSettlingItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSettle} className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <span className="font-semibold text-emerald-900">Valor a receber:</span>
                <strong className="text-base font-extrabold text-emerald-800">
                  {formatCurrencyCents(settlingItem.total_amount_cents)}
                </strong>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Forma de pagamento *</label>
                <select
                  value={settleMethod}
                  onChange={e => setSettleMethod(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-slate-50"
                >
                  <option value="pix">PIX</option>
                  <option value="credit_card">Cartão de Crédito</option>
                  <option value="debit_card">Cartão de Débito</option>
                  <option value="cash">Dinheiro</option>
                  <option value="bank_transfer">Transferência Bancária</option>
                  <option value="other">Outro</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Data do pagamento *</label>
                <input
                  type="date"
                  value={settleDate}
                  onChange={e => setSettleDate(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações (opcional)</label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={e => setSettleNotes(e.target.value)}
                  placeholder="Comprovante ou observação..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSettlingItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={submittingSettle}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingSettle ? 'Salvando...' : 'Confirmar Quitação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cancelar / Estornar Consumo */}
      {cancellingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {cancellingItem.payment_status === 'paid' ? 'Estornar Consumo Pago' : 'Cancelar Consumo'}
              </h3>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setCancellingItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCancel} className="space-y-3 text-xs">
              <p className="text-slate-600">
                Você está {cancellingItem.payment_status === 'paid' ? 'estornando' : 'cancelando'} o consumo de{' '}
                <strong>{cancellingItem.product_name_snapshot}</strong> ({cancellingItem.quantity} {cancellingItem.sale_unit_snapshot}) para{' '}
                <strong>{cancellingItem.patient_name}</strong> no valor de{' '}
                <strong>{formatCurrencyCents(cancellingItem.total_amount_cents)}</strong>.
              </p>

              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={revertStock}
                  onChange={e => setRevertStock(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span className="font-semibold text-slate-700">
                  Devolver {cancellingItem.quantity} {cancellingItem.sale_unit_snapshot} ao Estoque de Insumos
                </span>
              </label>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Motivo do cancelamento/estorno *</label>
                <textarea
                  rows={3}
                  required
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Ex: Lançamento incorreto / Produto devolvido..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCancellingItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={submittingCancel}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-50 cursor-pointer"
                >
                  {submittingCancel ? 'Processando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
