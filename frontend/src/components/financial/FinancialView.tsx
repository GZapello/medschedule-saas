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
  X
} from 'lucide-react';

export const FinancialView: React.FC = () => {
  const { showToast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalPaid, setTotalPaid] = useState<number>(0);
  const [totalPending, setTotalPending] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

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

  useEffect(() => {
    fetchPayments();
  }, [statusFilter, methodFilter]);

  useEffect(() => {
    ApiClient.get<any[]>('/v1/patients').then(setPatientsList).catch(() => {});
  }, []);

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

        <div className="flex items-center gap-2.5">
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
