import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Payment } from '../../types';
import {
  DollarSign,
  CheckCircle2,
  Clock,
  Download,
  Plus,
  Filter,
  CreditCard,
  QrCode,
  Banknote,
  X,
  Sparkles
} from 'lucide-react';
import { openZemdaAI } from '../../utils/aiHelper';

export const FinancialView: React.FC = () => {
  const { showToast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalPaid, setTotalPaid] = useState<number>(0);
  const [totalPending, setTotalPending] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  // Sub-abas Financeiro vs Caixa
  const [financialTab, setFinancialTab] = useState<'transactions' | 'cash_register'>('transactions');

  // Estado do Caixa
  const [cashRegister, setCashRegister] = useState<any>(null);
  const [cashMovements, setCashMovements] = useState<any[]>([]);
  const [cashTotals, setCashTotals] = useState<any>({});
  const [cashHistory, setCashHistory] = useState<any[]>([]);
  const [showOpenCashModal, setShowOpenCashModal] = useState<boolean>(false);
  const [initialBalance, setInitialBalance] = useState<string>('0');
  const [showCloseCashModal, setShowCloseCashModal] = useState<boolean>(false);
  const [countedCash, setCountedCash] = useState<string>('');
  const [differenceJustification, setDifferenceJustification] = useState<string>('');

  // Modal Novo Pagamento
  const [showModal, setShowModal] = useState<boolean>(false);
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('pix');
  const [paymentStatus, setPaymentStatus] = useState<string>('paid');
  const [patientId, setPatientId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [patientsList, setPatientsList] = useState<any[]>([]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      let query = '/v1/payments?';
      if (statusFilter !== 'all') query += `status=${statusFilter}&`;
      if (methodFilter !== 'all') query += `paymentMethod=${methodFilter}&`;

      const data = await ApiClient.get<any>(query);
      setPayments(data.payments || []);
      setTotalPaid(data.totalPaid || 0);
      setTotalPending(data.totalPending || 0);
    } catch (err: any) {
      showToast('Erro ao carregar dados financeiros', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchCashRegister = async () => {
    try {
      const [curr, hist] = await Promise.all([
        ApiClient.get<any>('/v1/cash-register/current'),
        ApiClient.get<any[]>('/v1/cash-register/history')
      ]);
      setCashRegister(curr.openRegister);
      setCashMovements(curr.movements || []);
      setCashTotals(curr.totalsByMethod || {});
      setCashHistory(hist || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (financialTab === 'transactions') {
      fetchPayments();
    } else {
      fetchCashRegister();
    }
  }, [financialTab, statusFilter, methodFilter]);

  useEffect(() => {
    ApiClient.get<any[]>('/v1/patients').then(setPatientsList).catch(() => {});
  }, []);

  const handleOpenCash = async () => {
    try {
      await ApiClient.post('/v1/cash-register/open', {
        initialBalance: parseFloat(initialBalance) || 0
      });
      showToast('Caixa aberto com sucesso!', 'success');
      setShowOpenCashModal(false);
      setInitialBalance('0');
      fetchCashRegister();
    } catch (err: any) {
      showToast(err.message || 'Erro ao abrir caixa', 'error');
    }
  };

  const handleCloseCash = async () => {
    if (!cashRegister) return;
    try {
      await ApiClient.post(`/v1/cash-register/${cashRegister.id}/close`, {
        countedCash: parseFloat(countedCash) || 0,
        differenceJustification
      });
      showToast('Caixa fechado com sucesso!', 'success');
      setShowCloseCashModal(false);
      setCountedCash('');
      setDifferenceJustification('');
      fetchCashRegister();
    } catch (err: any) {
      showToast(err.message || 'Erro ao fechar caixa', 'error');
    }
  };

  const handleMarkAsPaid = async (paymentId: string) => {
    try {
      await ApiClient.put(`/v1/payments/${paymentId}/status`, { status: 'paid' });
      showToast('Pagamento marcado como recebido com sucesso!', 'success');
      fetchPayments();
    } catch (err: any) {
      showToast('Erro ao atualizar pagamento', 'error');
    }
  };

  const handleCreatePayment = async () => {
    if (!amount || !patientId) {
      showToast('Informe o valor e o cliente', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/payments', {
        patientId,
        amount: Number(amount),
        paymentMethod,
        status: paymentStatus,
        notes: notes || null
      });

      showToast('Pagamento registrado com sucesso!', 'success');
      setShowModal(false);
      setAmount('');
      setNotes('');
      fetchPayments();
    } catch (err: any) {
      showToast('Erro ao cadastrar pagamento', 'error');
    }
  };

  const handleExportCsv = async () => {
    try {
      const csvText = await ApiClient.get<string>('/v1/reports/export-csv?type=payments');
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'relatorio-financeiro.csv';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Relatório financeiro baixado com sucesso!', 'success');
    } catch (err) {
      showToast('Erro ao exportar CSV', 'error');
    }
  };

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getMethodBadge = (method: string) => {
    switch (method) {
      case 'pix':
        return <span className="flex items-center gap-1 text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md font-bold text-[11px]"><QrCode className="w-3 h-3" /> PIX</span>;
      case 'credit_card':
        return <span className="flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md font-bold text-[11px]"><CreditCard className="w-3 h-3" /> Cartão</span>;
      case 'cash':
        return <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-bold text-[11px]"><Banknote className="w-3 h-3" /> Dinheiro</span>;
      default:
        return <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md text-[11px] uppercase">{method}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Módulo Financeiro</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Fluxo de recebimentos por PIX, Cartão e Dinheiro com controle de quitação.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => openZemdaAI({
              prompt: `Analise a situação financeira da clínica: Total recebido: ${formatCurrency(totalPaid)} | Total pendente: ${formatCurrency(totalPending)}. Quais estratégias você recomenda para acelerar o recebimento dos valores pendentes e otimizar os métodos de pagamento?`,
              autoSend: true
            })}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all cursor-pointer shadow-2xs"
            title="Receba uma análise inteligente do faturamento com a IA Zemda"
          >
            <Sparkles className="w-4 h-4 text-teal-600 animate-pulse" />
            Insights com IA
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" /> Novo Recebimento
          </button>
        </div>
      </div>

      {/* Sub-tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold">
        <button
          onClick={() => setFinancialTab('transactions')}
          className={`px-4 py-2 rounded-xl transition-all ${
            financialTab === 'transactions'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Lançamentos & Recebimentos
        </button>
        <button
          onClick={() => setFinancialTab('cash_register')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
            financialTab === 'cash_register'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Banknote className="w-3.5 h-3.5" />
          Controle de Caixa
          {cashRegister && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
          )}
        </button>
      </div>

      {financialTab === 'transactions' ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total Recebido</span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-emerald-600">{formatCurrency(totalPaid)}</div>
              <p className="text-xs text-slate-400 mt-1">pagamentos confirmados</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Pendente / A Receber</span>
                <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-rose-600">{formatCurrency(totalPending)}</div>
              <p className="text-xs text-slate-400 mt-1">aguardando quitação</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total Transações</span>
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900">{payments.length}</div>
              <p className="text-xs text-slate-400 mt-1">lançamentos registrados</p>
            </div>
          </div>

          {/* Filter and Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-slate-900 text-sm">Transações e Recebimentos</h3>

              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50"
                >
                  <option value="all">Todos os Status</option>
                  <option value="paid">Pago</option>
                  <option value="pending">Pendente</option>
                </select>

                <select
                  value={methodFilter}
                  onChange={e => setMethodFilter(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50"
                >
                  <option value="all">Todas as Formas</option>
                  <option value="pix">PIX</option>
                  <option value="credit_card">Cartão</option>
                  <option value="cash">Dinheiro</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-3.5">Data</th>
                    <th className="px-6 py-3.5">Cliente / Paciente</th>
                    <th className="px-6 py-3.5">Forma</th>
                    <th className="px-6 py-3.5">Valor</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        Nenhum lançamento encontrado.
                      </td>
                    </tr>
                  ) : (
                    payments.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-500">
                          {p.created_at?.split('T')[0] || p.created_at?.split(' ')[0]}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">{p.patient_name}</div>
                          {p.appointment_number && (
                            <div className="text-[10px] text-slate-400">{p.appointment_number}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">{getMethodBadge(p.payment_method)}</td>
                        <td className="px-6 py-4 font-extrabold text-slate-900 text-sm">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="px-6 py-4">
                          {p.status === 'paid' ? (
                            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                              Pago
                            </span>
                          ) : (
                            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                              Pendente
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {p.status === 'pending' && (
                            <button
                              onClick={() => handleMarkAsPaid(p.id)}
                              className="px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold rounded-lg text-xs"
                            >
                              Confirmar Recebimento
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* ABA: CONTROLE DE CAIXA */
        <div className="space-y-6">
          {/* Status do Caixa Atual */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            {cashRegister ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Caixa Aberto
                      </span>
                      <span className="text-xs text-slate-400">Operador: <strong>{cashRegister.operator_name}</strong></span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Aberto em: <strong>{new Date(cashRegister.opened_at).toLocaleString('pt-BR')}</strong> • Fundo de Troco Inicial: <strong>{formatCurrency(cashRegister.initial_balance)}</strong>
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setCountedCash('');
                      setDifferenceJustification('');
                      setShowCloseCashModal(true);
                    }}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Fechar Caixa & Conferência
                  </button>
                </div>

                {/* Resumo por Forma de Pagamento */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-medium">Dinheiro em Gaveta:</span>
                    <p className="text-base font-extrabold text-emerald-600 mt-0.5">
                      {formatCurrency((cashRegister.initial_balance || 0) + (cashTotals.cash || 0))}
                    </p>
                    <span className="text-[10px] text-slate-400">Troco + Entradas</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-medium">PIX Recebido:</span>
                    <p className="text-base font-extrabold text-teal-600 mt-0.5">
                      {formatCurrency(cashTotals.pix || 0)}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-medium">Cartão Crédito:</span>
                    <p className="text-base font-extrabold text-indigo-600 mt-0.5">
                      {formatCurrency(cashTotals.credit_card || 0)}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-400 font-medium">Cartão Débito:</span>
                    <p className="text-base font-extrabold text-blue-600 mt-0.5">
                      {formatCurrency(cashTotals.debit_card || 0)}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2 sm:col-span-1">
                    <span className="text-slate-400 font-medium">Total do Turno:</span>
                    <p className="text-base font-extrabold text-slate-900 mt-0.5">
                      {formatCurrency(cashTotals.total || 0)}
                    </p>
                  </div>
                </div>

                {/* Movimentações do Turno */}
                <div className="mt-4">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Recebimentos Registrados neste Caixa
                  </h4>
                  {cashMovements.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhuma movimentação realizada desde a abertura.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5">
                      {cashMovements.map(m => (
                        <div key={m.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-900">{m.patient_name || 'Recebimento Avulso'}</span>
                            <span className="text-slate-400 ml-2">({m.payment_method?.toUpperCase()})</span>
                          </div>
                          <span className="font-extrabold text-slate-800">{formatCurrency(m.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                    Caixa Fechado
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">Nenhum caixa aberto no momento</h3>
                  <p className="text-xs text-slate-500">
                    Abra uma nova sessão de caixa informando o fundo de troco para iniciar os recebimentos do dia.
                  </p>
                </div>
                <button
                  onClick={() => setShowOpenCashModal(true)}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                >
                  <Plus className="w-4 h-4" /> Abrir Caixa
                </button>
              </div>
            )}
          </div>

          {/* Histórico de Caixas Anteriores */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Histórico de Fechamentos de Caixa</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-3.5">Abertura / Fechamento</th>
                    <th className="px-6 py-3.5">Operador</th>
                    <th className="px-6 py-3.5">Fundo Inicial</th>
                    <th className="px-6 py-3.5">Saldo Físico Informado</th>
                    <th className="px-6 py-3.5">Diferença (Sobra/Falta)</th>
                    <th className="px-6 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {cashHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        Nenhum histórico de caixa arquivado.
                      </td>
                    </tr>
                  ) : (
                    cashHistory.map(h => (
                      <tr key={h.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">{new Date(h.opened_at).toLocaleDateString('pt-BR')}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(h.opened_at).toLocaleTimeString('pt-BR').slice(0, 5)} até {h.closed_at ? new Date(h.closed_at).toLocaleTimeString('pt-BR').slice(0, 5) : 'Em aberto'}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-800">{h.operator_name}</td>
                        <td className="px-6 py-4 font-semibold">{formatCurrency(h.initial_balance)}</td>
                        <td className="px-6 py-4 font-bold text-slate-900">{h.final_balance !== null ? formatCurrency(h.final_balance) : '—'}</td>
                        <td className="px-6 py-4">
                          {h.difference === null || h.difference === undefined ? (
                            <span className="text-slate-400">—</span>
                          ) : h.difference === 0 ? (
                            <span className="text-emerald-600 font-bold">Sem diferença (R$ 0,00)</span>
                          ) : h.difference > 0 ? (
                            <span className="text-blue-600 font-bold">Sobra: +{formatCurrency(h.difference)}</span>
                          ) : (
                            <span className="text-rose-600 font-bold">Falta: {formatCurrency(h.difference)}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            h.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {h.status === 'open' ? 'Aberto' : 'Fechado'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Abertura de Caixa */}
      {showOpenCashModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Abertura de Caixa</h3>
              <button onClick={() => setShowOpenCashModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-xs space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Fundo de Troco Inicial (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={initialBalance}
                  onChange={e => setInitialBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button onClick={() => setShowOpenCashModal(false)} className="px-3 py-1.5 border rounded-xl text-slate-600">
                Cancelar
              </button>
              <button onClick={handleOpenCash} className="px-5 py-1.5 bg-emerald-600 text-white font-bold rounded-xl shadow-xs">
                Confirmar Abertura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Fechamento de Caixa */}
      {showCloseCashModal && cashRegister && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Fechamento & Conferência de Caixa</h3>
              <button onClick={() => setShowCloseCashModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Fundo de Troco Inicial:</span>
                <strong className="text-slate-800">{formatCurrency(cashRegister.initial_balance)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Entradas em Dinheiro:</span>
                <strong className="text-slate-800">{formatCurrency(cashTotals.cash || 0)}</strong>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold">
                <span className="text-slate-700">Dinheiro Físico Esperado na Gaveta:</span>
                <span className="text-indigo-600 text-sm">
                  {formatCurrency((cashRegister.initial_balance || 0) + (cashTotals.cash || 0))}
                </span>
              </div>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Valor Contado Fisicamente em Dinheiro (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={countedCash}
                  onChange={e => setCountedCash(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900"
                />
              </div>

              {countedCash !== '' && (
                <div className="p-3 rounded-xl border text-xs font-bold">
                  {(() => {
                    const expected = (cashRegister.initial_balance || 0) + (cashTotals.cash || 0);
                    const diff = (parseFloat(countedCash) || 0) - expected;
                    if (diff === 0) {
                      return <span className="text-emerald-700">Conferência Exata: Sem diferença de valores.</span>;
                    } else if (diff > 0) {
                      return <span className="text-blue-700">Sobra de Caixa Identificada: +{formatCurrency(diff)}</span>;
                    } else {
                      return <span className="text-rose-700">Falta de Caixa Identificada: {formatCurrency(diff)}</span>;
                    }
                  })()}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Justificativa de Diferença / Observações</label>
                <textarea
                  rows={2}
                  value={differenceJustification}
                  onChange={e => setDifferenceJustification(e.target.value)}
                  placeholder="Ex: Troco arredondado, sangria realizada..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button onClick={() => setShowCloseCashModal(false)} className="px-3 py-1.5 border rounded-xl text-slate-600">
                Cancelar
              </button>
              <button onClick={handleCloseCash} className="px-5 py-1.5 bg-rose-600 text-white font-bold rounded-xl shadow-xs">
                Encerrar Caixa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Novo Pagamento */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Registrar Recebimento</h3>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cliente / Paciente *</label>
                <select
                  value={patientId}
                  onChange={e => setPatientId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                >
                  <option value="">Selecione o cliente...</option>
                  {patientsList.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Valor (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="150.00"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Forma</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                  >
                    <option value="pix">PIX</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="debit_card">Cartão de Débito</option>
                    <option value="cash">Dinheiro</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={paymentStatus}
                    onChange={e => setPaymentStatus(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                  >
                    <option value="paid">Pago</option>
                    <option value="pending">Pendente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ex: Pago via chave PIX CNPJ"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreatePayment}
                  className="px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
