import React, { useState, useEffect, useCallback } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Package, Plus, CheckCircle2, Clock, PauseCircle, XCircle, Calendar, CreditCard, RefreshCw } from 'lucide-react';

interface PatientPackagesTabProps {
  patientId: string;
  patientName?: string;
}

const CONTRACT_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  requested: { label: 'Solicitado (Online)', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  confirmed: { label: 'Confirmado', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  active: { label: 'Ativo', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  suspended: { label: 'Suspenso', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  expired: { label: 'Expirado', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  cancelled: { label: 'Cancelado', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
};

const PAYMENT_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pagamento pendente', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  partial: { label: 'Parcialmente pago', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  paid: { label: 'Pago', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  exempt: { label: 'Isento', cls: 'bg-slate-100 text-slate-600 border-slate-200' }
};

export const PatientPackagesTab: React.FC<PatientPackagesTabProps> = ({ patientId }) => {
  const { showToast } = useToast();
  const { isClinicAdmin, isReceptionist } = useAuth();
  const canManageContracts = isClinicAdmin || isReceptionist;

  const [contracts, setContracts] = useState<any[]>([]);
  const [catalogPackages, setCatalogPackages] = useState<any[]>([]);
  const [isStudioCompatible, setIsStudioCompatible] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const [showNewContractModal, setShowNewContractModal] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('pending');
  const [dueDay, setDueDay] = useState(10);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [contractsRes, catalogRes] = await Promise.all([
        ApiClient.get<{ contracts: any[] }>(`/v1/patients/${patientId}/packages`).catch(() => ({ contracts: [] })),
        ApiClient.get<{ isStudioCompatible: boolean; packages: any[] }>('/v1/packages').catch(() => ({ isStudioCompatible: false, packages: [] }))
      ]);
      setContracts(contractsRes?.contracts || []);
      setIsStudioCompatible(Boolean(catalogRes?.isStudioCompatible));
      const pkgs = catalogRes?.packages || [];
      setCatalogPackages(pkgs);
      if (pkgs.length > 0 && !selectedPackageId) {
        setSelectedPackageId(pkgs[0].id);
      }
    } catch {
      showToast('Erro ao carregar pacotes do aluno.', 'error');
    } finally {
      setLoading(false);
    }
  }, [patientId, selectedPackageId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPackageId) {
      showToast('Selecione um pacote do catálogo.', 'error');
      return;
    }
    try {
      setSubmitting(true);
      await ApiClient.post('/v1/package-contracts', {
        packageId: selectedPackageId,
        studentId: patientId,
        startDate,
        dueDay,
        paymentMethod,
        paymentStatus,
        contractStatus: 'active',
        notes: notes.trim() || null
      });
      showToast('Pacote contratado e cobrança vinculada com sucesso!', 'success');
      setShowNewContractModal(false);
      setNotes('');
      loadData();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao contratar pacote.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusAction = async (contractId: string, contractStatus: string, markFirstPaymentPaid = false) => {
    try {
      await ApiClient.patch(`/v1/package-contracts/${contractId}/status`, {
        contractStatus,
        markFirstPaymentPaid
      });
      showToast('Status do pacote atualizado com sucesso.', 'success');
      loadData();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao atualizar status do pacote.', 'error');
    }
  };

  const formatMoney = (val: number) => Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-5">
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600" />
            Pacotes de Aulas & Assinaturas do Aluno
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Saldo de aulas disponíveis, reservas futuras, utilizações confirmadas e vigência.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
          {canManageContracts && isStudioCompatible && catalogPackages.length > 0 && (
            <button
              type="button"
              onClick={() => setShowNewContractModal(true)}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Contratar Pacote
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
          Carregando pacotes do aluno...
        </div>
      ) : contracts.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
          <Package className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-xs font-semibold text-slate-600">Nenhum pacote contratado ainda para este aluno.</p>
          {canManageContracts && isStudioCompatible && catalogPackages.length > 0 && (
            <button
              type="button"
              onClick={() => setShowNewContractModal(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Vincular primeiro pacote
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {contracts.map(c => {
            const cBadge = CONTRACT_STATUS_BADGE[c.contract_status] || CONTRACT_STATUS_BADGE.active;
            const pBadge = PAYMENT_STATUS_BADGE[c.payment_status] || PAYMENT_STATUS_BADGE.pending;
            const summary = c.summary || { creditsTotal: 0, creditsReserved: 0, creditsUsed: 0, creditsRemaining: 0 };

            return (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{c.package_name_snapshot}</h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cBadge.cls}`}>
                        {cBadge.label}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pBadge.cls}`}>
                        {pBadge.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Vigência: <strong>{c.start_date}</strong> até <strong>{c.end_date || 'Indeterminada'}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                        {c.billing_type_snapshot === 'recurring_monthly' ? 'Mensalidade recorrente' : 'Pagamento único'} •{' '}
                        <strong className="text-indigo-700">{formatMoney(c.contracted_price)}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Ações rápidas */}
                  {canManageContracts && (
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {c.contract_status === 'requested' && (
                        <button
                          type="button"
                          onClick={() => handleStatusAction(c.id, 'active', true)}
                          className="px-2.5 py-1.5 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar e Quitar
                        </button>
                      )}
                      {c.contract_status === 'requested' && (
                        <button
                          type="button"
                          onClick={() => handleStatusAction(c.id, 'active', false)}
                          className="px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg cursor-pointer"
                        >
                          Ativar contrato
                        </button>
                      )}
                      {c.contract_status === 'active' && (
                        <button
                          type="button"
                          onClick={() => handleStatusAction(c.id, 'suspended')}
                          className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <PauseCircle className="w-3.5 h-3.5" /> Pausar
                        </button>
                      )}
                      {c.contract_status === 'suspended' && (
                        <button
                          type="button"
                          onClick={() => handleStatusAction(c.id, 'active')}
                          className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg cursor-pointer"
                        >
                          Reativar
                        </button>
                      )}
                      {!['cancelled', 'expired'].includes(c.contract_status) && (
                        <button
                          type="button"
                          onClick={() => handleStatusAction(c.id, 'cancelled')}
                          className="px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancelar
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Resumo Geral de Créditos */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase">Total do Pacote</div>
                    <div className="text-base font-extrabold text-slate-900">{summary.creditsTotal}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-100">
                    <div className="text-[10px] font-semibold text-blue-700 uppercase">Reservadas (Futuras)</div>
                    <div className="text-base font-extrabold text-blue-800">{summary.creditsReserved}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100">
                    <div className="text-[10px] font-semibold text-indigo-700 uppercase">Utilizadas</div>
                    <div className="text-base font-extrabold text-indigo-800">{summary.creditsUsed}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
                    <div className="text-[10px] font-semibold text-emerald-700 uppercase">Restantes</div>
                    <div className="text-base font-extrabold text-emerald-800">{summary.creditsRemaining}</div>
                  </div>
                </div>

                {/* Detalhamento por Serviço / Pool */}
                {Array.isArray(c.entitlements) && c.entitlements.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      {c.credit_mode_snapshot === 'shared_pool' ? 'Saldo Livre (Pool Compartilhado)' : 'Direitos por Modalidade'}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {c.entitlements.map((ent: any) => (
                        <div key={ent.id} className="p-3 rounded-xl bg-slate-50/80 border border-slate-200 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">
                              {ent.service_name || 'Aulas Livres no Pacote'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Disp: <strong>{ent.credits_total}</strong> • Res: <strong>{ent.credits_reserved}</strong> • Usad: <strong>{ent.credits_used}</strong>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-700 font-extrabold text-xs shrink-0">
                            {ent.credits_remaining} rest.
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {c.absent_consumption_policy_snapshot && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1 border-t border-slate-100">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Política: falta{' '}
                    <strong>
                      {c.absent_consumption_policy_snapshot === 'refund' ? 'restitui aula ao saldo' : 'consome crédito'}
                    </strong>{' '}
                    • Cancelamento gratuito até <strong>{c.cancellation_hours_limit_snapshot}h</strong> antes.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Contratar Novo Pacote */}
      {showNewContractModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <form
            onSubmit={handleCreateContract}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-base font-bold text-slate-900">Contratar Pacote para o Aluno</h4>
              <button
                type="button"
                onClick={() => setShowNewContractModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Pacote do Catálogo *</label>
              <select
                value={selectedPackageId}
                onChange={e => setSelectedPackageId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-semibold"
              >
                {catalogPackages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatMoney(p.price)} ({p.billing_type === 'recurring_monthly' ? 'Mensal' : 'Único'})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Início da Vigência</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dia de Vencimento</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={dueDay}
                  onChange={e => setDueDay(Math.min(28, Math.max(1, Number(e.target.value) || 10)))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Forma de Pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                >
                  <option value="pix">PIX</option>
                  <option value="credit_card">Cartão de Crédito</option>
                  <option value="debit_card">Cartão de Débito</option>
                  <option value="cash">Dinheiro</option>
                  <option value="bank_transfer">Transferência</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Situação Inicial</label>
                <select
                  value={paymentStatus}
                  onChange={e => setPaymentStatus(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                >
                  <option value="pending">Gerar cobrança pendente</option>
                  <option value="paid">Já recebido na contratação</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Observações (opcional)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ex: Matrícula promocional ou acordo de horários"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowNewContractModal(false)}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Contratando...' : 'Confirmar Contratação'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
