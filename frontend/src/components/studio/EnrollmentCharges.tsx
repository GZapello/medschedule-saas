import React, { useState } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import type { Payment } from '../../types';
import { formatCurrencyBRL } from '../../utils/establishmentContext';
import { UniversalWhatsAppModal } from '../common/UniversalWhatsAppModal';

type Charge = Pick<Payment, 'id' | 'amount' | 'status' | 'payment_date' | 'payment_method' | 'notes'> & {
  due_date?: string; installment_number?: number; total_installments?: number; competence_month?: string;
  manualReceiptBlock?: string | null;
};
const methods: Record<Payment['payment_method'], string> = {
  pix: 'Pix', cash: 'Dinheiro', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito',
  bank_transfer: 'Transferência', insurance: 'Convênio', other: 'Outro'
};
const statuses: Record<Payment['status'], string> = {
  paid: 'Paga', pending: 'Pendente', cancelled: 'Cancelada', exempt: 'Isenta', refunded: 'Estornada', partial: 'Parcial'
};
const dateLabel = (date?: string) => date ? date.slice(0, 10).split('-').reverse().join('/') : '—';
const inputClass = 'block mt-1 w-full rounded-lg border border-slate-300 px-3 py-2';

export function EnrollmentCharges({ charges, enrollmentId, plan, student, phone, studio, today, canReceive, refresh }: {
  charges: Charge[]; enrollmentId: string; plan: string; student: string; phone?: string; studio: string;
  today: string; canReceive: boolean; refresh: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [contact, setContact] = useState<Charge | null>(null);
  const [receipt, setReceipt] = useState<Charge | null>(null);
  const [saving, setSaving] = useState(false);
  const open = charges.filter(p => p.status === 'pending' || p.status === 'partial');
  const sum = (rows: Charge[]) => formatCurrencyBRL(rows.reduce((n, p) => n + Math.round(p.amount * 100), 0) / 100);
  const nextDue = open.map(p => p.due_date).filter((d): d is string => Boolean(d && d >= today)).sort()[0];
  async function receive(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!receipt || saving) return;
    const data = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await ApiClient.post(`/v1/financial/collections/${receipt.id}/mark-paid`, {
        enrollmentId, paymentMethod: data.get('method'), paymentDate: data.get('date'),
        amountReceived: Number(data.get('amount')), notes: data.get('notes')
      });
      setReceipt(null);
      showToast('Recebimento registrado.', 'success');
      await refresh();
    } catch (err) { showToast(err instanceof Error ? err.message : 'Erro ao registrar o recebimento.', 'error'); }
    finally { setSaving(false); }
  }
  return <>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span>Total pendente <b>{sum(open)}</b></span><span>Total recebido <b>{sum(charges.filter(p => p.status === 'paid'))}</b></span>
      <span>Próximo vencimento <b>{dateLabel(nextDue)}</b></span>
    </div>
    {charges.length === 0 && <p>Nenhuma cobrança registrada até o momento.</p>}
    <ul className="divide-y divide-slate-100">{charges.map(p => {
      const overdue = p.status === 'pending' && p.due_date && p.due_date < today;
      return <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
        <div><strong>{p.notes || `Cobrança ${p.competence_month || ''}`}{(p.total_installments || 0) > 1 && ` (${p.installment_number}/${p.total_installments})`}</strong>
          <p>Vencimento {dateLabel(p.due_date)} · {formatCurrencyBRL(p.amount)} · <b className={overdue ? 'text-rose-700' : p.status === 'paid' ? 'text-emerald-700' : ''}>{overdue ? 'Vencida' : statuses[p.status]}</b></p>
          {p.status === 'paid' && <p>Recebido em {dateLabel(p.payment_date)} · {methods[p.payment_method]}</p>}
        </div>
        {p.status === 'pending' && <div className="flex flex-wrap gap-2">
          <button type="button" className="font-semibold text-teal-700" onClick={() => setContact(p)}>WhatsApp</button>
          {canReceive && <button type="button" disabled={Boolean(p.manualReceiptBlock)} title={p.manualReceiptBlock || undefined}
            className="font-semibold text-indigo-700 disabled:text-slate-400" onClick={() => setReceipt(p)}>Marcar como pago</button>}
        </div>}
      </li>;
    })}</ul>
    {contact && <UniversalWhatsAppModal isOpen onClose={() => setContact(null)} title="Conferir mensagem de cobrança"
      recipientName={student} phone={phone} phoneErrorMessage="O aluno precisa de um telefone válido com DDD."
      defaultMessage={`Olá, ${student}! Aqui é da equipe ${studio}. A cobrança do plano ${plan}, no valor de ${formatCurrencyBRL(contact.amount)}, vence em ${dateLabel(contact.due_date)}. Qualquer dúvida, estamos à disposição.`} />}
    {receipt && <div role="dialog" aria-modal="true" aria-label="Registrar recebimento" className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4">
      <form onSubmit={receive} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 text-sm shadow-xl">
        <h3 className="font-bold">Registrar recebimento</h3>
        <p>{plan} · {formatCurrencyBRL(receipt.amount)}</p>
        <label className="block">Forma de pagamento<select name="method" defaultValue={receipt.payment_method || 'pix'} className={inputClass}>{Object.entries(methods).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="block">Data do recebimento<input name="date" required type="date" defaultValue={today} max={today} className={inputClass} /></label>
        <label className="block">Valor recebido (R$)<input name="amount" required type="number" step="0.01" min="0.01" defaultValue={receipt.amount} className={inputClass} /></label>
        <label className="block">Observações (opcional)<textarea name="notes" maxLength={2000} className={inputClass} /></label>
        <div className="flex justify-end gap-3"><button type="button" disabled={saving} onClick={() => setReceipt(null)}>Cancelar</button>
          <button disabled={saving} className="rounded-lg bg-teal-600 px-3 py-2 font-semibold text-white">{saving ? 'Registrando…' : 'Registrar recebimento'}</button></div>
      </form>
    </div>}
  </>;
}
