import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  Wallet,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Calculator,
  ShieldAlert,
  Edit3,
  Search,
  User,
  Percent,
  Sliders,
  AlertCircle
} from 'lucide-react';
import { ProfessionalPayroll, Professional } from '../../types';

export const ProfessionalPayrollView: React.FC = () => {
  const { showToast } = useToast();
  const { isClinicAdmin } = useAuth();

  const getCurrentMonthStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const [periodMonth, setPeriodMonth] = useState<string>(getCurrentMonthStr);
  const [payrolls, setPayrolls] = useState<ProfessionalPayroll[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [calculating, setCalculating] = useState<boolean>(false);

  // Modais
  const [payingRecord, setPayingRecord] = useState<ProfessionalPayroll | null>(null);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState<string>('');

  const [adjustingRecord, setAdjustingRecord] = useState<ProfessionalPayroll | null>(null);
  const [adjustmentValue, setAdjustmentValue] = useState<number>(0);
  const [adjustmentNotes, setAdjustmentNotes] = useState<string>('');
  const [savingAdjust, setSavingAdjust] = useState<boolean>(false);

  if (!isClinicAdmin) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs text-center space-y-3 max-w-md mx-auto my-12">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-full w-fit mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Acesso Restrito ao Gerenciador</h3>
        <p className="text-xs text-slate-500">
          O módulo de apuração de salários, comissões e repasses aos profissionais é exclusivo para a administração da clínica.
        </p>
      </div>
    );
  }

  const fetchPayrolls = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.get<ProfessionalPayroll[]>(`/v1/payroll?periodMonth=${periodMonth}`);
      setPayrolls(data);
    } catch (err: any) {
      showToast('Erro ao carregar pagamentos do período', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayrolls();
  }, [periodMonth]);

  const handlePrevMonth = () => {
    const [y, m] = periodMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setPeriodMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = periodMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    setPeriodMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  // Apuração e cálculo automático da folha do mês
  const handleCalculatePayroll = async () => {
    try {
      setCalculating(true);
      const res = await ApiClient.post<{ results: any[] }>('/v1/payroll/calculate', {
        periodMonth
      });

      // Salva os cálculos apurados no banco preservando quitação e ajustes existentes
      if (res.results && res.results.length > 0) {
        for (const r of res.results) {
          await ApiClient.post('/v1/payroll', {
            professionalId: r.professionalId,
            periodMonth: r.periodMonth,
            remunerationType: r.remunerationType,
            appointmentsCount: r.appointmentsCount,
            producedAmount: r.producedAmount,
            commissionPercentage: r.commissionPercentage,
            commissionAmount: r.commissionAmount,
            fixedSalary: r.fixedSalary,
            adjustments: Number(r.adjustments || 0),
            adjustmentNotes: r.adjustmentNotes || undefined,
            totalPayable: r.totalPayable,
            dueDate: r.dueDate,
            status: r.status || 'pending',
            paidDate: r.paidDate || undefined
          });
        }
      }

      showToast(`Apuração concluída para ${res.results?.length || 0} profissionais!`, 'success');
      fetchPayrolls();
    } catch (err: any) {
      showToast(err.message || 'Erro ao calcular repasses', 'error');
    } finally {
      setCalculating(false);
    }
  };

  // Marcar como pago
  const handleMarkAsPaid = async () => {
    if (!payingRecord) return;
    try {
      await ApiClient.patch(`/v1/payroll/${payingRecord.id}/pay`, {
        paidDate: payDate,
        notes: payNotes.trim() || null
      });
      showToast('Pagamento registrado com sucesso!', 'success');
      setPayingRecord(null);
      fetchPayrolls();
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar pagamento', 'error');
    }
  };

  // Salvar Ajuste / Bônus / Desconto
  const handleSaveAdjustment = async () => {
    if (!adjustingRecord) return;
    try {
      setSavingAdjust(true);
      const newTotal = (Number(adjustingRecord.commission_amount) || 0) +
                       (Number(adjustingRecord.fixed_salary) || 0) +
                       Number(adjustmentValue);

      await ApiClient.post('/v1/payroll', {
        id: adjustingRecord.id,
        professionalId: adjustingRecord.professional_id,
        periodMonth: adjustingRecord.period_month,
        remunerationType: adjustingRecord.remuneration_type,
        appointmentsCount: adjustingRecord.appointments_count,
        producedAmount: adjustingRecord.produced_amount,
        commissionPercentage: adjustingRecord.commission_percentage,
        commissionAmount: adjustingRecord.commission_amount,
        fixedSalary: adjustingRecord.fixed_salary,
        adjustments: Number(adjustmentValue),
        adjustmentNotes: adjustmentNotes.trim() || null,
        totalPayable: Math.max(0, newTotal),
        dueDate: adjustingRecord.due_date,
        paidDate: adjustingRecord.paid_date,
        status: adjustingRecord.status,
        notes: adjustingRecord.notes
      });

      showToast('Ajuste salvo com sucesso!', 'success');
      setAdjustingRecord(null);
      fetchPayrolls();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar ajuste', 'error');
    } finally {
      setSavingAdjust(false);
    }
  };

  // Cálculos de resumo
  const totalPayableMonth = payrolls.reduce((sum, p) => sum + Number(p.total_payable || 0), 0);
  const totalPaidMonth = payrolls.filter(p => p.status === 'paid').reduce((sum, p) => sum + Number(p.total_payable || 0), 0);
  const totalPendingMonth = payrolls.filter(p => p.status === 'pending').reduce((sum, p) => sum + Number(p.total_payable || 0), 0);
  const totalAppointments = payrolls.reduce((sum, p) => sum + Number(p.appointments_count || 0), 0);

  const formatPeriodLabel = (ym: string) => {
    const [y, m] = ym.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Pagamentos & Comissões</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Apuração automática de consultas realizadas no mês, comissões acordadas, salários fixos e controle de quitação.
          </p>
        </div>

        {/* Seletor de Período e Botão de Apuração */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-white text-slate-600 rounded-lg transition-all cursor-pointer"
              title="Mês anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-bold text-slate-800 capitalize min-w-[130px] text-center">
              {formatPeriodLabel(periodMonth)}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-white text-slate-600 rounded-lg transition-all cursor-pointer"
              title="Próximo mês"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleCalculatePayroll}
            disabled={calculating}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <Calculator className="w-3.5 h-3.5" />
            {calculating ? 'Apurando Consultas...' : 'Calcular Folha do Mês'}
          </button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500">Total a Repassar no Mês</p>
          <h3 className="text-xl font-black text-slate-900 mt-1">
            {totalPayableMonth.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </h3>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500">Pendente de Pagamento</p>
          <h3 className="text-xl font-black text-amber-600 mt-1">
            {totalPendingMonth.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </h3>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500">Já Quitado / Pago</p>
          <h3 className="text-xl font-black text-emerald-600 mt-1">
            {totalPaidMonth.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </h3>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500">Consultas Apuradas</p>
          <h3 className="text-xl font-black text-indigo-600 mt-1">{totalAppointments}</h3>
        </div>
      </div>

      {/* Tabela de Profissionais e Repasses */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Carregando folha de pagamentos...</div>
        ) : payrolls.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-3">
            <p>Nenhum lançamento de pagamento apurado para este mês ({periodMonth}).</p>
            <button
              onClick={handleCalculatePayroll}
              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Clique aqui para apurar atendimentos e comissões agora
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-4">Profissional</th>
                  <th className="p-4">Modalidade</th>
                  <th className="p-4 text-center">Atendimentos</th>
                  <th className="p-4 text-right">Faturamento Gerado</th>
                  <th className="p-4 text-right">Comissão</th>
                  <th className="p-4 text-right">Salário Fixo</th>
                  <th className="p-4 text-right">Ajustes (+/-)</th>
                  <th className="p-4 text-right">Total Líquido</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payrolls.map(pay => {
                  const isPaid = pay.status === 'paid';

                  return (
                    <tr key={pay.id} className="hover:bg-slate-50/50 transition-all">
                      <td className="p-4">
                        <div className="font-bold text-slate-900">{pay.professional_name}</div>
                        <div className="text-[10px] text-slate-400">{pay.specialty_name || 'Profissional'}</div>
                      </td>

                      <td className="p-4">
                        <span className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded">
                          {pay.remuneration_type === 'commission'
                            ? `Comissão (${pay.commission_percentage}%)`
                            : pay.remuneration_type === 'salary'
                            ? 'Salário Fixo'
                            : `Fixo + ${pay.commission_percentage}% Com.`}
                        </span>
                      </td>

                      <td className="p-4 text-center font-bold text-slate-800">
                        {pay.appointments_count}
                      </td>

                      <td className="p-4 text-right text-slate-600">
                        {Number(pay.produced_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>

                      <td className="p-4 text-right text-slate-700 font-medium">
                        {Number(pay.commission_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>

                      <td className="p-4 text-right text-slate-700 font-medium">
                        {Number(pay.fixed_salary).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className={Number(pay.adjustments) < 0 ? 'text-rose-600 font-bold' : Number(pay.adjustments) > 0 ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                            {Number(pay.adjustments).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                          <button
                            onClick={() => {
                              setAdjustingRecord(pay);
                              setAdjustmentValue(Number(pay.adjustments) || 0);
                              setAdjustmentNotes(pay.adjustment_notes || '');
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                            title="Ajustar Bônus / Desconto"
                          >
                            <Sliders className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      <td className="p-4 text-right font-black text-indigo-700 text-sm">
                        {Number(pay.total_payable).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>

                      <td className="p-4">
                        {isPaid ? (
                          <div>
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3" /> Pago
                            </span>
                            {pay.paid_date && (
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                Em {new Date(pay.paid_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <Clock className="w-3 h-3" /> Pendente
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-right whitespace-nowrap">
                        {!isPaid && (
                          <button
                            onClick={() => {
                              setPayingRecord(pay);
                              setPayDate(new Date().toISOString().split('T')[0]);
                              setPayNotes('');
                            }}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[11px] shadow-xs transition-all cursor-pointer"
                          >
                            Marcar Pago
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Marcar Pago */}
      {payingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Confirmar Pagamento</h3>
              <button onClick={() => setPayingRecord(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                <p className="font-bold text-emerald-900 text-sm">{payingRecord.professional_name}</p>
                <p className="text-emerald-700 text-xs mt-1">
                  Valor Líquido a Pagar:{' '}
                  <strong>{Number(payingRecord.total_payable).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                </p>
                <p className="text-emerald-600 text-[10px] mt-0.5">Competência: {payingRecord.period_month}</p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Data da Efetivação do Pagamento *</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Comprovante / Dados da Transferência / PIX</label>
                <textarea
                  rows={2}
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  placeholder="Ex: Transferência PIX realizada com sucesso, comprovante anexo..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPayingRecord(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleMarkAsPaid}
                  className="px-6 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs"
                >
                  Confirmar Quitação
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ajustar Bônus / Desconto */}
      {adjustingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Ajuste na Folha: {adjustingRecord.professional_name}</h3>
              <button onClick={() => setAdjustingRecord(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-500">
                Lance valores extras (positivos para bonificações) ou deduções (negativos para descontos de materiais, adiantamentos ou faltas).
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Valor do Ajuste (R$)</label>
                <input
                  type="number"
                  step={10}
                  value={adjustmentValue}
                  onChange={e => setAdjustmentValue(Number(e.target.value))}
                  placeholder="Ex: 250 ou -100"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Motivo do Ajuste</label>
                <textarea
                  rows={2}
                  value={adjustmentNotes}
                  onChange={e => setAdjustmentNotes(e.target.value)}
                  placeholder="Ex: Bônus por meta atingida de avaliações..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdjustingRecord(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveAdjustment}
                  disabled={savingAdjust}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {savingAdjust ? 'Salvando...' : 'Salvar Ajuste'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ProfessionalPayrollView;
