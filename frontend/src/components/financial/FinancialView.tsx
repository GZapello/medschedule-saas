import { ResponsiveTable } from '../common/ResponsiveTable';
import { downloadBlob } from '../../utils/download';
import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Payment } from '../../types';
import { PatientSearchSelect } from '../common/PatientSearchSelect';
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
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  FileSpreadsheet,
  Package,
  Eye,
  RotateCcw,
  FileText
} from 'lucide-react';

interface FinancialViewProps {
  initialTab?: 'transactions' | 'payables' | 'cash_register';
  onNavigate?: (view: string, subId?: string, tab?: string) => void;
}

export const FinancialView: React.FC<FinancialViewProps> = ({ initialTab = 'transactions', onNavigate }) => {
  const { clientTermLabel } = useAuth();
  const { showToast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalPaid, setTotalPaid] = useState<number>(0);
  const [totalPending, setTotalPending] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  // Sub-abas Financeiro: Recebimentos vs Contas a Pagar vs Caixa
  const [financialTab, setFinancialTab] = useState<'transactions' | 'payables' | 'cash_register'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setFinancialTab(initialTab);
    }
  }, [initialTab]);

  // Estado de Contas a Pagar & Despesas
  const [payables, setPayables] = useState<any[]>([]);
  const [payableMetrics, setPayableMetrics] = useState<{ totalPending: number; totalOverdue: number; totalPaidMonth: number; totalRecords: number }>({
    totalPending: 0,
    totalOverdue: 0,
    totalPaidMonth: 0,
    totalRecords: 0
  });
  const [loadingPayables, setLoadingPayables] = useState<boolean>(false);
  const [payableStatusFilter, setPayableStatusFilter] = useState<string>('all');
  const [payableSearch, setPayableSearch] = useState<string>('');

  // Modais de Contas a Pagar
  const [showPayModal, setShowPayModal] = useState<boolean>(false);
  const [selectedPayable, setSelectedPayable] = useState<any>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<string>('pix');
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState<string>('');
  const [isSubmittingPay, setIsSubmittingPay] = useState<boolean>(false);

  const [showCancelPayModal, setShowCancelPayModal] = useState<boolean>(false);
  const [selectedPayableForCancel, setSelectedPayableForCancel] = useState<any>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState<boolean>(false);

  const [showPurchaseDetailsModal, setShowPurchaseDetailsModal] = useState<boolean>(false);
  const [purchaseDetails, setPurchaseDetails] = useState<any>(null);
  const [loadingPurchaseDetails, setLoadingPurchaseDetails] = useState<boolean>(false);

  // Estado do Caixa
  const [cashRegister, setCashRegister] = useState<any>(null);
  const [cashMovements, setCashMovements] = useState<any[]>([]);
  const [drawerMovements, setDrawerMovements] = useState<any[]>([]);
  const [cashTotals, setCashTotals] = useState<any>({});
  const [cashDrawerSummary, setCashDrawerSummary] = useState<any>(null);
  const [cashHistory, setCashHistory] = useState<any[]>([]);
  const [showOpenCashModal, setShowOpenCashModal] = useState<boolean>(false);
  const [initialBalance, setInitialBalance] = useState<string>('0');
  const [showCloseCashModal, setShowCloseCashModal] = useState<boolean>(false);
  const [countedCash, setCountedCash] = useState<string>('');
  const [differenceJustification, setDifferenceJustification] = useState<string>('');

  // Modal Suprimento / Sangria / Despesa
  const [showMovementModal, setShowMovementModal] = useState<boolean>(false);
  const [movementType, setMovementType] = useState<'SUPRIMENTO' | 'SANGRIA' | 'DESPESA'>('SUPRIMENTO');
  const [movementAmount, setMovementAmount] = useState<string>('');
  const [movementDescription, setMovementDescription] = useState<string>('');

  // Modal Novo Pagamento
  const [showModal, setShowModal] = useState<boolean>(false);
  const [amount, setAmount] = useState<string>('');
  const [amountTendered, setAmountTendered] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('pix');
  const [paymentStatus, setPaymentStatus] = useState<string>('paid');
  const [patientId, setPatientId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

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

  const fetchPayables = async () => {
    try {
      setLoadingPayables(true);
      let query = '/v1/accounts-payable?';
      if (payableStatusFilter !== 'all') query += `status=${payableStatusFilter}&`;
      if (payableSearch) query += `search=${encodeURIComponent(payableSearch)}&`;

      const data = await ApiClient.get<any>(query);
      setPayables(data.payables || []);
      setPayableMetrics(data.metrics || { totalPending: 0, totalOverdue: 0, totalPaidMonth: 0, totalRecords: 0 });
    } catch (err: any) {
      showToast('Erro ao carregar contas a pagar', 'error');
    } finally {
      setLoadingPayables(false);
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
      setDrawerMovements(curr.cashMovements || []);
      setCashTotals(curr.totalsByMethod || {});
      setCashDrawerSummary(curr.drawerSummary || null);
      setCashHistory(hist || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (financialTab === 'transactions') {
      fetchPayments();
    } else if (financialTab === 'cash_register') {
      fetchCashRegister();
    } else if (financialTab === 'payables') {
      fetchPayables();
    }
  }, [financialTab, statusFilter, methodFilter, payableStatusFilter]);

  const handleOpenPayModal = (payable: any) => {
    setSelectedPayable(payable);
    const remaining = Math.max(0, (Number(payable.amount) || 0) - (Number(payable.amount_paid) || 0));
    setPayAmount(String(remaining > 0 ? remaining : Number(payable.amount) || 0));
    setPayMethod(payable.payment_method || 'pix');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayNotes('');
    setShowPayModal(true);
  };

  const handleExecutePay = async () => {
    if (!selectedPayable) return;
    const val = parseFloat(payAmount);
    if (isNaN(val) || val <= 0) {
      showToast('Informe um valor de pagamento válido (maior que zero)', 'error');
      return;
    }

    try {
      setIsSubmittingPay(true);
      const res = await ApiClient.post<any>(`/v1/accounts-payable/${selectedPayable.id}/pay`, {
        amountPaid: val,
        paymentMethod: payMethod,
        paymentDate: payDate,
        notes: payNotes
      });

      if (res.drawerDeductionApplied) {
        showToast(`Pagamento registrado! R$ ${val.toFixed(2)} debitado da gaveta do caixa aberto.`, 'success');
        fetchCashRegister();
      } else {
        showToast(res.message || 'Pagamento registrado com sucesso!', 'success');
      }

      setShowPayModal(false);
      setSelectedPayable(null);
      fetchPayables();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao processar pagamento', 'error');
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const handleOpenCancelModal = (payable: any) => {
    setSelectedPayableForCancel(payable);
    setCancellationReason('');
    setShowCancelPayModal(true);
  };

  const handleExecuteCancel = async () => {
    if (!selectedPayableForCancel) return;
    if (!cancellationReason.trim()) {
      showToast('Informe o motivo do cancelamento', 'error');
      return;
    }

    try {
      setIsSubmittingCancel(true);
      await ApiClient.post<any>(`/v1/accounts-payable/${selectedPayableForCancel.id}/cancel`, {
        cancellationReason: cancellationReason.trim()
      });
      showToast('Conta cancelada com sucesso', 'success');
      setShowCancelPayModal(false);
      setSelectedPayableForCancel(null);
      fetchPayables();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao cancelar conta a pagar', 'error');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const handleRevertPayment = async (payable: any) => {
    if (!window.confirm(`Deseja realmente reverter o pagamento de R$ ${(payable.amount_paid || payable.amount).toFixed(2)}? Se houve saída de dinheiro na gaveta, será gerado um estorno.`)) {
      return;
    }

    try {
      const res = await ApiClient.post<any>(`/v1/accounts-payable/${payable.id}/revert`, {
        reason: 'Reversão solicitada pelo operador'
      });
      showToast(res.message || 'Pagamento revertido com sucesso!', 'success');
      fetchPayables();
      fetchCashRegister();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao reverter pagamento', 'error');
    }
  };

  const handleOpenPurchaseDetails = async (purchaseId: string) => {
    try {
      setLoadingPurchaseDetails(true);
      setShowPurchaseDetailsModal(true);
      const data = await ApiClient.get<any>(`/v1/purchases/${purchaseId}`);
      setPurchaseDetails(data);
    } catch (err: any) {
      showToast('Erro ao carregar detalhes da compra e estoque', 'error');
      setShowPurchaseDetailsModal(false);
    } finally {
      setLoadingPurchaseDetails(false);
    }
  };

  const handleOpenCash = async () => {
    try {
      const initVal = parseFloat(initialBalance);
      if (isNaN(initVal) || initVal < 0) {
        showToast('Informe um fundo inicial válido (maior ou igual a zero)', 'error');
        return;
      }
      await ApiClient.post('/v1/cash-register/open', {
        initialBalance: initVal
      });
      showToast('Caixa aberto com sucesso!', 'success');
      setShowOpenCashModal(false);
      setInitialBalance('0');
      fetchCashRegister();
    } catch (err: any) {
      showToast(err.message || 'Erro ao abrir caixa', 'error');
    }
  };

  const handleRecordMovement = async () => {
    if (!cashRegister) return;
    const val = parseFloat(movementAmount);
    if (!val || val <= 0) {
      showToast('Informe um valor válido maior que zero', 'error');
      return;
    }
    if (!movementDescription.trim()) {
      showToast('A descrição / justificativa é obrigatória', 'error');
      return;
    }
    try {
      await ApiClient.post(`/v1/cash-register/${cashRegister.id}/movement`, {
        type: movementType,
        amount: val,
        description: movementDescription.trim()
      });
      const label = movementType === 'SUPRIMENTO' ? 'Suprimento' : movementType === 'SANGRIA' ? 'Sangria' : 'Despesa';
      showToast(`${label} lançado com sucesso!`, 'success');
      setShowMovementModal(false);
      setMovementAmount('');
      setMovementDescription('');
      fetchCashRegister();
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar movimentação', 'error');
    }
  };

  const handleCloseCash = async () => {
    if (!cashRegister) return;
    const counted = parseFloat(countedCash);
    if (isNaN(counted) || counted < 0) {
      showToast('Informe o valor físico contado na gaveta', 'error');
      return;
    }
    const expected = cashDrawerSummary?.expectedCash ?? ((cashRegister.initial_balance || 0) + (cashTotals.cash || 0));
    const diff = Math.round((counted - expected) * 100) / 100;
    if (Math.abs(diff) >= 0.01 && !differenceJustification.trim()) {
      showToast('Justificativa obrigatória quando há diferença de caixa!', 'error');
      return;
    }

    try {
      await ApiClient.post(`/v1/cash-register/${cashRegister.id}/close`, {
        countedCash: counted,
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

  const handleExportCashCsv = async (regId: string) => {
    try {
      const csvText = await ApiClient.get<string>(`/v1/cash-register/${regId}/export`);
      downloadBlob(new Blob([csvText], { type: 'text/csv;charset=utf-8;' }), `caixa_${regId}.csv`);
      showToast('Exportação do caixa baixada com sucesso!', 'success');
    } catch (err: any) {
      showToast('Erro ao exportar CSV do caixa', 'error');
    }
  };

  const handleMarkAsPaid = async (paymentId: string) => {
    try {
      await ApiClient.put(`/v1/payments/${paymentId}/status`, { status: 'paid' });
      showToast('Pagamento marcado como recebido com sucesso!', 'success');
      fetchPayments();
      if (financialTab === 'cash_register') fetchCashRegister();
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
      const parsedAmount = parseFloat(amount) || 0;
      const parsedTendered = amountTendered ? parseFloat(amountTendered) : undefined;
      const calculatedChange = parsedTendered !== undefined ? Math.max(0, parsedTendered - parsedAmount) : undefined;

      await ApiClient.post('/v1/payments', {
        patientId,
        amount: parsedAmount,
        paymentMethod,
        status: paymentStatus,
        notes: notes || null,
        amountTendered: parsedTendered,
        changeAmount: calculatedChange
      });

      showToast('Recebimento lançado com sucesso!', 'success');
      setShowModal(false);
      setAmount('');
      setAmountTendered('');
      setPatientId('');
      setNotes('');
      fetchPayments();
      fetchCashRegister();
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar pagamento', 'error');
    }
  };

  const handleExportCsv = async () => {
    try {
      const csvText = await ApiClient.get<string>('/v1/reports/export-csv?type=payments');
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      await downloadBlob(blob, 'relatorio-financeiro.csv');
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
      case 'debit_card': return <span>Cartão de Débito</span>;
      case 'insurance': return <span>Convênio</span>;
      case 'other': return <span>Outro</span>;
      case 'cash':
        return <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-bold text-[11px]"><Banknote className="w-3 h-3" /> Dinheiro</span>;
      default:
        return <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md text-[11px] uppercase">{method}</span>;
    }
  };

  return (
    <div data-tour-loading={loading} className="space-y-6">
      {/* Top Header & Actions */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Módulo Financeiro</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Fluxo de recebimentos por PIX, Cartão e Dinheiro com controle de quitação.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
          <button
            onClick={handleExportCsv}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all min-h-[40px]"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button
            onClick={() => {
              setPatientId('');
              setAmount('');
              setNotes('');
              setShowModal(true);
            }}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all min-h-[40px]"
          >
            <Plus className="w-4 h-4" /> Novo Recebimento
          </button>
        </div>
      </div>

      {/* Sub-tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold overflow-x-auto no-scrollbar scroll-smooth mobile-wrap">
        <button
          onClick={() => setFinancialTab('transactions')}
          className={`px-4 py-2 rounded-xl transition-all shrink-0 whitespace-nowrap ${
            financialTab === 'transactions'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Lançamentos & Recebimentos
        </button>
        <button
          onClick={() => setFinancialTab('payables')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
            financialTab === 'payables'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          Contas a Pagar & Despesas
          {payableMetrics.totalOverdue > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
              Vencidas
            </span>
          )}
        </button>
        <button
          onClick={() => setFinancialTab('cash_register')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
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

              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="flex-1 sm:flex-initial text-xs font-semibold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 min-h-[38px]"
                >
                  <option value="all">Todos os Status</option>
                  <option value="paid">Pago</option>
                  <option value="pending">Pendente</option>
                </select>

                <select
                  value={methodFilter}
                  onChange={e => setMethodFilter(e.target.value)}
                  className="flex-1 sm:flex-initial text-xs font-semibold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 min-h-[38px]"
                >
                  <option value="all">Todas as Formas</option>
                  <option value="pix">PIX</option>
                  <option value="credit_card">Cartão</option>
                  <option value="cash">Dinheiro</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto mobile-table-container">
              <ResponsiveTable className="w-full text-left text-xs">
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
                              {p.status === 'exempt' ? 'Isento' : 'Pendente'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {p.status === 'pending' ? (
                            <button
                              onClick={() => handleMarkAsPaid(p.id)}
                              className="px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold rounded-lg text-xs cursor-pointer"
                            >
                              Confirmar Recebimento
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: 'receipts' } }));
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                              title="Ver ou emitir recibo oficial"
                            >
                              <Receipt className="w-3.5 h-3.5 text-slate-500" />
                              Recibo
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </ResponsiveTable>
            </div>
          </div>
        </>
      ) : financialTab === 'payables' ? (
        /* ABA: CONTAS A PAGAR & DESPESAS */
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total a Pagar</span>
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-indigo-700">{formatCurrency(payableMetrics.totalPending)}</div>
              <p className="text-xs text-slate-400 mt-1">obrigações pendentes</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-rose-200/80 bg-rose-50/20 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Vencidas em Atraso</span>
                <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                  <AlertCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-rose-600">{formatCurrency(payableMetrics.totalOverdue)}</div>
              <p className="text-xs text-rose-500 mt-1">requer atenção imediata</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Pagas no Mês</span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-emerald-600">{formatCurrency(payableMetrics.totalPaidMonth)}</div>
              <p className="text-xs text-slate-400 mt-1">despesas quitadas no período</p>
            </div>
          </div>

          {/* Filtros e Tabela de Contas a Pagar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Contas a Pagar e Despesas de Compras</h3>
                <p className="text-xs text-slate-500">Acompanhamento de despesas com fornecedores e insumos do estoque.</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Buscar fornecedor, NF ou descrição..."
                  value={payableSearch}
                  onChange={e => setPayableSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchPayables()}
                  className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 min-h-[38px] w-full sm:w-60"
                />

                <select
                  value={payableStatusFilter}
                  onChange={e => setPayableStatusFilter(e.target.value)}
                  className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 min-h-[38px]"
                >
                  <option value="all">Todos os Status</option>
                  <option value="pending">A Pagar (Em dia)</option>
                  <option value="overdue">Vencidas (Atrasadas)</option>
                  <option value="paid">Pagas / Liquidadas</option>
                  <option value="cancelled">Canceladas</option>
                </select>

                <button
                  onClick={fetchPayables}
                  className="px-3.5 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 min-h-[38px]"
                >
                  Filtrar
                </button>
              </div>
            </div>

            <div className="overflow-x-auto mobile-table-container">
              <ResponsiveTable className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3">Descrição / Categoria</th>
                    <th className="px-4 py-3">Fornecedor</th>
                    <th className="px-4 py-3">NF / Parcela</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Forma / Caixa</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loadingPayables ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-400">
                        Carregando contas a pagar...
                      </td>
                    </tr>
                  ) : payables.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-slate-400">
                        <CreditCard className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        Nenhuma conta a pagar encontrada para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    payables.map((pay: any) => {
                      const isOverdue = pay.display_status === 'overdue' || (pay.status === 'pending' && pay.due_date < new Date().toISOString().slice(0, 10));
                      const isPaid = pay.status === 'paid';
                      const isCancelled = pay.status === 'cancelled';
                      const amount = Number(pay.amount) || 0;
                      const paidAmt = Number(pay.amount_paid) || 0;

                      return (
                        <tr key={pay.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-bold text-slate-900">
                              {pay.due_date ? new Date(pay.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                            </div>
                            {isOverdue && !isPaid && !isCancelled && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-100 text-rose-700">
                                Vencida
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 max-w-[200px]">
                            <div className="font-bold text-slate-900 truncate" title={pay.description}>
                              {pay.description}
                            </div>
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-semibold mt-0.5">
                              {pay.category || 'Insumos / Produtos'}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-[180px]">
                            <div className="font-semibold text-slate-800 truncate" title={pay.supplier_name}>
                              {pay.supplier_name || '—'}
                            </div>
                            {pay.supplier_cnpj && (
                              <div className="text-[10px] text-slate-400">{pay.supplier_cnpj}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-bold text-slate-800">
                              {pay.invoice_number ? `NF ${pay.invoice_number}` : 'S/N'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {pay.total_installments > 1 ? `Parcela ${pay.installment_number}/${pay.total_installments}` : 'Parcela Única'}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-extrabold text-slate-900">{formatCurrency(amount)}</div>
                            {paidAmt > 0 && paidAmt < amount && (
                              <div className="text-[10px] text-emerald-600 font-bold">
                                Pago: {formatCurrency(paidAmt)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">
                              {pay.payment_method === 'cash' || pay.payment_method === 'dinheiro' ? (
                                <>
                                  <Banknote className="w-3 h-3 text-emerald-600" /> Dinheiro
                                </>
                              ) : pay.payment_method === 'pix' ? (
                                <>
                                  <QrCode className="w-3 h-3 text-teal-600" /> PIX
                                </>
                              ) : pay.payment_method === 'credit_card' || pay.payment_method === 'debit_card' ? (
                                <>
                                  <CreditCard className="w-3 h-3 text-indigo-600" /> Cartão
                                </>
                              ) : pay.payment_method === 'boleto' ? (
                                <>
                                  <FileText className="w-3 h-3 text-amber-600" /> Boleto
                                </>
                              ) : (
                                pay.payment_method || 'Outro'
                              )}
                            </span>
                            {pay.cash_register_id && (
                              <span className="block text-[9px] text-emerald-700 font-semibold mt-0.5" title="Debitado da gaveta física de caixa">
                                • Gaveta de Caixa
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Pago
                              </span>
                            ) : isCancelled ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                                Cancelada
                              </span>
                            ) : isOverdue ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                                <AlertCircle className="w-3 h-3 text-rose-600" /> Vencida
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                                <Clock className="w-3 h-3 text-amber-600" /> Pendente
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {!isPaid && !isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPayModal(pay)}
                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs transition-all flex items-center gap-1"
                                >
                                  <DollarSign className="w-3.5 h-3.5" /> Pagar
                                </button>
                              )}

                              {pay.purchase_id && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPurchaseDetails(pay.purchase_id)}
                                  title="Ver NF e produtos no estoque"
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-slate-200"
                                >
                                  <Package className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {!isPaid && !isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenCancelModal(pay)}
                                  title="Cancelar conta a pagar"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {isPaid && (
                                <button
                                  type="button"
                                  onClick={() => handleRevertPayment(pay)}
                                  title="Estornar / Reverter pagamento"
                                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-slate-200"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </ResponsiveTable>
            </div>
          </div>
        </div>
      ) : (
        /* ABA: CONTROLE DE CAIXA */
        <div className="space-y-6">
          {/* Status do Caixa Atual */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            {cashRegister ? (
              <div className="space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Caixa Aberto
                      </span>
                      <span className="text-xs text-slate-500">Operador: <strong>{cashRegister.operator_name || 'Operador'}</strong></span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Aberto em: <strong>{new Date(cashRegister.opened_at).toLocaleString('pt-BR')}</strong> • Fundo de Troco Inicial: <strong>{formatCurrency(cashRegister.initial_balance)}</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        setMovementType('SUPRIMENTO');
                        setMovementAmount('');
                        setMovementDescription('');
                        setShowMovementModal(true);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition-all"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" /> + Suprimento
                    </button>
                    <button
                      onClick={() => {
                        setMovementType('SANGRIA');
                        setMovementAmount('');
                        setMovementDescription('');
                        setShowMovementModal(true);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs rounded-xl border border-amber-200 transition-all"
                    >
                      <ArrowDownRight className="w-3.5 h-3.5" /> - Sangria
                    </button>
                    <button
                      onClick={() => {
                        setMovementType('DESPESA');
                        setMovementAmount('');
                        setMovementDescription('');
                        setShowMovementModal(true);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-all"
                    >
                      <ArrowDownRight className="w-3.5 h-3.5" /> - Despesa em Gaveta
                    </button>
                    <button
                      onClick={() => {
                        setCountedCash('');
                        setDifferenceJustification('');
                        setShowCloseCashModal(true);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Fechar Caixa & Conferência
                    </button>
                  </div>
                </div>

                {/* Resumo por Forma de Pagamento e Gaveta Física */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                  <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-100">
                    <span className="text-emerald-700 font-semibold flex items-center justify-between">
                      Dinheiro Físico Esperado:
                      <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                    </span>
                    <p className="text-base font-extrabold text-emerald-800 mt-1">
                      {formatCurrency(cashDrawerSummary?.expectedCash ?? ((cashRegister.initial_balance || 0) + (cashTotals.cash || 0)))}
                    </p>
                    <span className="text-[10px] text-emerald-600">Troco + Entradas - Saídas</span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-500 font-medium">Entradas em Dinheiro:</span>
                    <p className="text-base font-extrabold text-slate-800 mt-1">
                      {formatCurrency(cashDrawerSummary?.cashIn ?? cashTotals.cash ?? 0)}
                    </p>
                    <span className="text-[10px] text-slate-400">Recebimentos no caixa</span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-500 font-medium">Suprimentos (+):</span>
                    <p className="text-base font-extrabold text-emerald-600 mt-1">
                      {formatCurrency(cashDrawerSummary?.suprimentos ?? 0)}
                    </p>
                    <span className="text-[10px] text-slate-400">Aportes para troco</span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-slate-500 font-medium">Sangrias / Despesas (-):</span>
                    <p className="text-base font-extrabold text-rose-600 mt-1">
                      {formatCurrency(((cashDrawerSummary?.sangrias ?? 0) + (cashDrawerSummary?.despesas ?? 0)))}
                    </p>
                    <span className="text-[10px] text-slate-400">Retiradas e pagtos gaveta</span>
                  </div>

                  <div className="bg-teal-50/60 p-3 rounded-xl border border-teal-100">
                    <span className="text-teal-700 font-semibold flex items-center justify-between">
                      PIX Recebido:
                      <QrCode className="w-3.5 h-3.5 text-teal-600" />
                    </span>
                    <p className="text-base font-extrabold text-teal-800 mt-1">
                      {formatCurrency(cashTotals.pix || 0)}
                    </p>
                    <span className="text-[10px] text-teal-600">Eletrônico (não afeta gaveta)</span>
                  </div>

                  <div className="bg-indigo-50/60 p-3 rounded-xl border border-indigo-100">
                    <span className="text-indigo-700 font-semibold flex items-center justify-between">
                      Cartões (Créd./Déb.):
                      <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                    </span>
                    <p className="text-base font-extrabold text-indigo-800 mt-1">
                      {formatCurrency((cashTotals.credit_card || 0) + (cashTotals.debit_card || 0))}
                    </p>
                    <span className="text-[10px] text-indigo-600">Eletrônico (não afeta gaveta)</span>
                  </div>
                </div>

                {/* Movimentações do Turno e Ajustes de Gaveta */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Recebimentos Clínicos ({cashMovements.length})</span>
                      <span className="text-[11px] font-normal text-slate-400">Total: {formatCurrency(cashTotals.total || 0)}</span>
                    </h4>
                    {cashMovements.length === 0 ? (
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center text-xs text-slate-400 italic">
                        Nenhum recebimento registrado desde a abertura.
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                        {cashMovements.map(m => (
                          <div key={m.id} className="p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-100 flex items-center justify-between text-xs transition-colors">
                            <div>
                              <div className="font-bold text-slate-900">{m.patient_name || 'Recebimento Avulso'}</div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span className="uppercase font-semibold text-slate-600">{m.payment_method}</span>
                                <span>•</span>
                                <span>{new Date(m.created_at).toLocaleTimeString('pt-BR').slice(0, 5)}</span>
                                {m.amount_tendered ? (
                                  <span>• Entregue: {formatCurrency(m.amount_tendered)} (Troco: {formatCurrency(m.change_amount || 0)})</span>
                                ) : null}
                              </div>
                            </div>
                            <span className="font-extrabold text-slate-900 text-sm">{formatCurrency(m.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Aportes & Sangrias em Gaveta ({drawerMovements.length})</span>
                    </h4>
                    {drawerMovements.length === 0 ? (
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-center text-xs text-slate-400 italic">
                        Nenhuma sangria ou suprimento lançado neste turno.
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                        {drawerMovements.map(dm => {
                          const isSuprimento = dm.type === 'SUPRIMENTO';
                          const isSangria = dm.type === 'SANGRIA';
                          return (
                            <div key={dm.id} className="p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-100 flex items-center justify-between text-xs transition-colors">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-1.5 py-0.5 rounded-md font-bold text-[10px] ${
                                    isSuprimento ? 'bg-emerald-100 text-emerald-800' : isSangria ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                                  }`}>
                                    {dm.type}
                                  </span>
                                  <span className="font-bold text-slate-800">{dm.description}</span>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {new Date(dm.created_at).toLocaleTimeString('pt-BR').slice(0, 5)} • Operador: {dm.user_name || 'Operador'}
                                </div>
                              </div>
                              <span className={`font-extrabold text-sm ${isSuprimento ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {isSuprimento ? '+' : '-'}{formatCurrency(dm.amount)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
                    Abra uma nova sessão de caixa informando o fundo de troco inicial para habilitar os recebimentos do dia.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setInitialBalance('0');
                    setShowOpenCashModal(true);
                  }}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                >
                  <Plus className="w-4 h-4" /> Abrir Caixa
                </button>
              </div>
            )}
          </div>

          {/* Histórico de Caixas Anteriores */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Histórico de Fechamentos de Caixa</h3>
            </div>
            <div className="overflow-x-auto mobile-table-container">
              <ResponsiveTable className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                  <tr>
                    <th className="px-6 py-3.5">Abertura / Fechamento</th>
                    <th className="px-6 py-3.5">Operador</th>
                    <th className="px-6 py-3.5">Fundo Inicial</th>
                    <th className="px-6 py-3.5">Saldo Físico Informado</th>
                    <th className="px-6 py-3.5">Diferença (Sobra/Falta)</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {cashHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
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
                        <td className="px-6 py-4 font-medium text-slate-800">{h.operator_name || 'Operador'}</td>
                        <td className="px-6 py-4 font-semibold">{formatCurrency(h.initial_balance)}</td>
                        <td className="px-6 py-4 font-bold text-slate-900">{h.final_balance !== null && h.final_balance !== undefined ? formatCurrency(h.final_balance) : '—'}</td>
                        <td className="px-6 py-4">
                          {h.difference === null || h.difference === undefined ? (
                            <span className="text-slate-400">—</span>
                          ) : Math.abs(h.difference) < 0.01 ? (
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
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleExportCashCsv(h.id)}
                            title="Exportar CSV da sessão de caixa"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </ResponsiveTable>
            </div>
          </div>
        </div>
      )}

      {/* Modal Suprimento / Sangria / Despesa */}
      {showMovementModal && cashRegister && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {movementType === 'SUPRIMENTO' ? 'Lançar Suprimento de Troco' : movementType === 'SANGRIA' ? 'Lançar Sangria de Caixa' : 'Lançar Despesa em Espécie'}
              </h3>
              <button aria-label="Fechar" onClick={() => setShowMovementModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Movimentação</label>
                <select
                  value={movementType}
                  onChange={e => setMovementType(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-bold"
                >
                  <option value="SUPRIMENTO">Suprimento (+ Aporte de Troco)</option>
                  <option value="SANGRIA">Sangria (- Retirada para Cofre / Banco)</option>
                  <option value="DESPESA">Despesa em Gaveta (- Pagamento em Dinheiro)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Valor (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={movementAmount}
                  onChange={e => setMovementAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Justificativa / Descrição *</label>
                <input
                  type="text"
                  required
                  value={movementDescription}
                  onChange={e => setMovementDescription(e.target.value)}
                  placeholder={movementType === 'SUPRIMENTO' ? 'Ex: Reforço de troco notas de R$ 5 e R$ 10' : movementType === 'SANGRIA' ? 'Ex: Retirada de segurança para o cofre' : 'Ex: Compra urgente de material de limpeza'}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button onClick={() => setShowMovementModal(false)} className="w-full sm:w-auto px-3 py-2 border rounded-xl text-slate-600 min-h-[40px]">
                Cancelar
              </button>
              <button
                onClick={handleRecordMovement}
                className={`w-full sm:w-auto px-5 py-2 font-bold text-white rounded-xl shadow-xs min-h-[40px] ${
                  movementType === 'SUPRIMENTO' ? 'bg-emerald-600 hover:bg-emerald-700' : movementType === 'SANGRIA' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                Confirmar Lançamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Abertura de Caixa */}
      {showOpenCashModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Abertura de Caixa</h3>
              <button aria-label="Fechar" onClick={() => setShowOpenCashModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
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
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Informe o montante em cédulas e moedas físicas disponibilizado na gaveta (ex: R$ 200,00 ou R$ 0,00).
                </span>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button onClick={() => setShowOpenCashModal(false)} className="w-full sm:w-auto px-3 py-2 border rounded-xl text-slate-600 min-h-[40px]">
                Cancelar
              </button>
              <button onClick={handleOpenCash} className="w-full sm:w-auto px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl shadow-xs min-h-[40px]">
                Confirmar Abertura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Fechamento de Caixa */}
      {showCloseCashModal && cashRegister && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Fechamento & Conferência de Caixa</h3>
              <button aria-label="Fechar" onClick={() => setShowCloseCashModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
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
                <strong className="text-slate-800">{formatCurrency(cashDrawerSummary?.cashIn ?? cashTotals.cash ?? 0)}</strong>
              </div>
              {(cashDrawerSummary?.suprimentos || 0) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Suprimentos (+):</span>
                  <strong>+{formatCurrency(cashDrawerSummary.suprimentos)}</strong>
                </div>
              )}
              {((cashDrawerSummary?.sangrias || 0) + (cashDrawerSummary?.despesas || 0)) > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>Sangrias & Despesas (-):</span>
                  <strong>-{formatCurrency((cashDrawerSummary.sangrias || 0) + (cashDrawerSummary.despesas || 0))}</strong>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold">
                <span className="text-slate-700">Dinheiro Físico Esperado na Gaveta:</span>
                <span className="text-indigo-600 text-sm">
                  {formatCurrency(cashDrawerSummary?.expectedCash ?? ((cashRegister.initial_balance || 0) + (cashTotals.cash || 0)))}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                PIX ({formatCurrency(cashTotals.pix || 0)}) e Cartões ({formatCurrency((cashTotals.credit_card || 0) + (cashTotals.debit_card || 0))}) são registrados eletronicamente e não compõem a gaveta de dinheiro físico.
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
                    const expected = cashDrawerSummary?.expectedCash ?? ((cashRegister.initial_balance || 0) + (cashTotals.cash || 0));
                    const diff = Math.round(((parseFloat(countedCash) || 0) - expected) * 100) / 100;
                    if (Math.abs(diff) < 0.01) {
                      return <span className="text-emerald-700">✓ Conferência Exata: Sem diferença de valores.</span>;
                    } else if (diff > 0) {
                      return <span className="text-blue-700">▲ Sobra de Caixa Identificada: +{formatCurrency(diff)}</span>;
                    } else {
                      return <span className="text-rose-700">▼ Falta de Caixa Identificada: {formatCurrency(diff)}</span>;
                    }
                  })()}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Justificativa de Diferença / Observações
                  {countedCash !== '' && Math.abs((parseFloat(countedCash) || 0) - (cashDrawerSummary?.expectedCash ?? ((cashRegister.initial_balance || 0) + (cashTotals.cash || 0)))) >= 0.01 ? (
                    <span className="text-rose-600 font-bold ml-1">* (Obrigatória em caso de sobra ou falta)</span>
                  ) : null}
                </label>
                <textarea
                  rows={2}
                  value={differenceJustification}
                  onChange={e => setDifferenceJustification(e.target.value)}
                  placeholder="Ex: Troco arredondado, retirada urgente para farmácia..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button onClick={() => setShowCloseCashModal(false)} className="w-full sm:w-auto px-3 py-2 border rounded-xl text-slate-600 min-h-[40px]">
                Cancelar
              </button>
              <button onClick={handleCloseCash} className="w-full sm:w-auto px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs min-h-[40px]">
                Encerrar Caixa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Novo Pagamento */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Registrar Recebimento</h3>
              <button aria-label="Fechar" onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">{clientTermLabel} *</label>
                <PatientSearchSelect
                  value={patientId}
                  onChange={(id) => setPatientId(id)}
                  clientTermLabel={clientTermLabel}
                  placeholder={`Buscar ${clientTermLabel.toLowerCase()}...`}
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Valor Cobrado (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="150.00"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Forma</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 min-h-[38px]"
                  >
                    <option value="pix">PIX</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="debit_card">Cartão de Débito</option>
                    <option value="cash">Dinheiro em Espécie</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={paymentStatus}
                    onChange={e => setPaymentStatus(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 min-h-[38px]"
                  >
                    <option value="paid">Pago / Concluído</option>
                    <option value="pending">Pendente</option>
                  </select>
                </div>
              </div>

              {/* Se for dinheiro em espécie, exibe cálculo de troco */}
              {paymentMethod === 'cash' && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-emerald-800">Valor em Dinheiro Entregue (R$):</label>
                    <input
                      type="number"
                      step="0.01"
                      value={amountTendered}
                      onChange={e => setAmountTendered(e.target.value)}
                      placeholder={amount || '0.00'}
                      className="w-28 border border-emerald-300 rounded-lg px-2 py-1 text-right text-xs font-bold bg-white text-emerald-900"
                    />
                  </div>
                  {amountTendered && parseFloat(amountTendered) > (parseFloat(amount) || 0) && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-200">
                      <span className="font-bold text-emerald-800">Troco a Devolver:</span>
                      <strong className="text-emerald-900 text-sm">
                        {formatCurrency(parseFloat(amountTendered) - (parseFloat(amount) || 0))}
                      </strong>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ex: Recebido no balcão da clínica"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl min-h-[40px]"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreatePayment}
                  className="w-full sm:w-auto px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs min-h-[40px]"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAIS DE CONTAS A PAGAR */}

      {/* 1. Modal Registrar Pagamento */}
      {showPayModal && selectedPayable && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Registrar Pagamento de Despesa</h3>
                <p className="text-xs text-slate-500">Liquidação total ou parcial da obrigação com o fornecedor.</p>
              </div>
              <button aria-label="Fechar" onClick={() => setShowPayModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Descrição:</span>
                <strong className="text-slate-800 text-right truncate max-w-[220px]">{selectedPayable.description}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fornecedor:</span>
                <strong className="text-slate-800">{selectedPayable.supplier_name || '—'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Valor Total da Parcela:</span>
                <span className="font-bold text-slate-900">{formatCurrency(selectedPayable.amount)}</span>
              </div>
              {(Number(selectedPayable.amount_paid) || 0) > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Já Pago Anteriormente:</span>
                  <span>{formatCurrency(selectedPayable.amount_paid)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
                <span className="text-slate-700">Saldo Restante:</span>
                <span className="text-indigo-700">
                  {formatCurrency(Math.max(0, (Number(selectedPayable.amount) || 0) - (Number(selectedPayable.amount_paid) || 0)))}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Valor a Pagar Agora (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Forma de Pagamento *</label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-slate-50"
                >
                  <option value="pix">PIX</option>
                  <option value="cash">Dinheiro em Espécie (Gaveta)</option>
                  <option value="boleto">Boleto Bancário</option>
                  <option value="credit_card">Cartão de Crédito</option>
                  <option value="debit_card">Cartão de Débito</option>
                  <option value="bank_transfer">Transferência Bancária</option>
                  <option value="other">Outro</option>
                </select>
              </div>

              {/* Aviso dinâmico de integração com gaveta física */}
              {(payMethod === 'cash' || payMethod === 'dinheiro') && (
                <div className={`p-3 rounded-xl border text-[11px] ${
                  cashRegister
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  {cashRegister ? (
                    <div className="flex items-start gap-2">
                      <Banknote className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Integração com Caixa Aberto:</strong> O valor de {formatCurrency(parseFloat(payAmount) || 0)} será debitado do saldo esperado em dinheiro na gaveta física.
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Nenhum caixa físico aberto:</strong> O pagamento será registrado contabilmente no Financeiro, mas sem movimentar gaveta física no momento.
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Data do Pagamento *</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Observações do Pagamento</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  placeholder="Ex: Comprovante arquivado, transação bancária nº..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="w-full sm:w-auto px-4 py-2 border rounded-xl text-slate-600 min-h-[40px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecutePay}
                disabled={isSubmittingPay}
                className="w-full sm:w-auto px-6 py-2 bg-emerald-600 hover:bg-emerald-700 font-bold text-white rounded-xl shadow-xs min-h-[40px] disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isSubmittingPay ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Confirmar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal Cancelar Conta a Pagar */}
      {showCancelPayModal && selectedPayableForCancel && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
          <div className="bg-white rounded-3xl max-w-sm w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Cancelar Conta a Pagar</h3>
              <button aria-label="Fechar" onClick={() => setShowCancelPayModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Você está cancelando a obrigação <strong>{selectedPayableForCancel.description}</strong> no valor de{' '}
                <strong>{formatCurrency(selectedPayableForCancel.amount)}</strong>.
              </p>
              <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-rose-800 text-[11px]">
                Esta ação manterá o registro com status cancelado para histórico contábil e auditoria fiscal.
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1 text-xs">Justificativa do Cancelamento *</label>
              <textarea
                required
                rows={3}
                value={cancellationReason}
                onChange={e => setCancellationReason(e.target.value)}
                placeholder="Ex: Devolução de mercadoria / Nota cancelada pelo fornecedor / Lançamento duplicado..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setShowCancelPayModal(false)}
                className="w-full sm:w-auto px-4 py-2 border rounded-xl text-slate-600 min-h-[40px]"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleExecuteCancel}
                disabled={isSubmittingCancel}
                className="w-full sm:w-auto px-5 py-2 bg-rose-600 hover:bg-rose-700 font-bold text-white rounded-xl shadow-xs min-h-[40px] disabled:opacity-50"
              >
                {isSubmittingCancel ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal Detalhes da Compra & Itens de Estoque */}
      {showPurchaseDetailsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Origem da Compra & Entrada no Estoque</h3>
                  <p className="text-xs text-slate-500">Rastreabilidade completa entre nota fiscal, fornecedor e produtos.</p>
                </div>
              </div>
              <button aria-label="Fechar" onClick={() => setShowPurchaseDetailsModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingPurchaseDetails ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Carregando dados da compra e estoque...
              </div>
            ) : purchaseDetails ? (
              <div className="overflow-y-auto space-y-4 flex-1 text-xs">
                {/* Cabeçalho da Compra */}
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Nota Fiscal</span>
                    <strong className="text-slate-900 text-sm">
                      {purchaseDetails.purchase?.invoice_number ? `NF ${purchaseDetails.purchase.invoice_number}` : 'S/N'}
                      {purchaseDetails.purchase?.invoice_series ? ` • Série ${purchaseDetails.purchase.invoice_series}` : ''}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Fornecedor</span>
                    <strong className="text-slate-900 truncate block" title={purchaseDetails.purchase?.supplier_name}>
                      {purchaseDetails.purchase?.supplier_name || '—'}
                    </strong>
                    {purchaseDetails.purchase?.supplier_cnpj && (
                      <span className="text-[10px] text-slate-400">{purchaseDetails.purchase.supplier_cnpj}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Data de Emissão</span>
                    <strong className="text-slate-800">
                      {purchaseDetails.purchase?.issue_date ? new Date(purchaseDetails.purchase.issue_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Valor Total NF</span>
                    <strong className="text-emerald-700 text-sm">
                      {formatCurrency(purchaseDetails.purchase?.total_amount || 0)}
                    </strong>
                  </div>
                </div>

                {/* Discriminação de Valores */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded-xl border border-slate-200 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Produtos:</span>
                    <strong className="text-slate-800">{formatCurrency(purchaseDetails.purchase?.products_amount || 0)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Frete:</span>
                    <strong className="text-slate-800">{formatCurrency(purchaseDetails.purchase?.freight_amount || 0)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Descontos:</span>
                    <strong className="text-rose-600">-{formatCurrency(purchaseDetails.purchase?.discount_amount || 0)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Outras Despesas:</span>
                    <strong className="text-slate-800">{formatCurrency(purchaseDetails.purchase?.other_expenses_amount || 0)}</strong>
                  </div>
                </div>

                {/* Tabela de Produtos que Deram Entrada no Estoque */}
                <div>
                  <h4 className="font-bold text-slate-900 text-xs mb-2 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-emerald-600" />
                    Produtos / Insumos Entrados no Estoque ({purchaseDetails.stockMovements?.length || 0})
                  </h4>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <ResponsiveTable className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="px-3 py-2">Item / Descrição</th>
                          <th className="px-3 py-2">Categoria</th>
                          <th className="px-3 py-2">Qtd Entrada</th>
                          <th className="px-3 py-2">Custo Unit.</th>
                          <th className="px-3 py-2">Lote / Validade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {(!purchaseDetails.stockMovements || purchaseDetails.stockMovements.length === 0) ? (
                          <tr>
                            <td colSpan={5} className="text-center py-4 text-slate-400 text-xs">
                              Nenhuma movimentação de estoque localizada para esta compra.
                            </td>
                          </tr>
                        ) : (
                          purchaseDetails.stockMovements.map((mov: any) => (
                            <tr key={mov.id}>
                              <td className="px-3 py-2 font-bold text-slate-900">
                                {mov.item_name}
                                {mov.item_brand && <span className="block text-[10px] text-slate-400 font-normal">Marca: {mov.item_brand}</span>}
                              </td>
                              <td className="px-3 py-2 text-slate-600">{mov.item_category || 'Geral'}</td>
                              <td className="px-3 py-2 font-bold text-emerald-700">
                                +{mov.quantity} {mov.item_unit || 'UN'}
                              </td>
                              <td className="px-3 py-2 font-semibold">
                                {formatCurrency(mov.unit_cost || 0)}
                              </td>
                              <td className="px-3 py-2 text-[11px] text-slate-500">
                                {mov.batch_number ? `Lote: ${mov.batch_number}` : '—'}
                                {mov.expiration_date && ` • Val: ${mov.expiration_date}`}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </ResponsiveTable>
                  </div>
                </div>

                {/* Parcelas / Contas vinculadas */}
                {purchaseDetails.payables && purchaseDetails.payables.length > 0 && (
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs mb-2 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                      Parcelas Financeiras da Compra ({purchaseDetails.payables.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {purchaseDetails.payables.map((p: any) => (
                        <div key={p.id} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-900 block">{p.description}</span>
                            <span className="text-[10px] text-slate-500">
                              Venc: {p.due_date ? new Date(p.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'} • {p.payment_method?.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-right">
                            <strong className="text-slate-900 block">{formatCurrency(p.amount)}</strong>
                            <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              p.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {p.status === 'paid' ? 'Pago' : 'Pendente'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-2 pt-3 border-t border-slate-100 shrink-0 text-xs">
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => {
                    setShowPurchaseDetailsModal(false);
                    onNavigate('inventory');
                  }}
                  className="w-full sm:w-auto px-4 py-2 font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors flex items-center justify-center gap-1.5 min-h-[40px]"
                >
                  <Package className="w-4 h-4" /> Ir para o Estoque
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowPurchaseDetailsModal(false)}
                className="w-full sm:w-auto px-6 py-2 bg-slate-800 hover:bg-slate-900 font-bold text-white rounded-xl min-h-[40px]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
