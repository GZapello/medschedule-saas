import React, { useState } from 'react';
import { ApiClient } from '../../api/client';

export function ConsultationPaymentModal({ appointmentId, initialPayment, onFinished, onClose }: {
  appointmentId: string; initialPayment?: any; onFinished: (result: any) => void; onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(initialPayment?.amount ?? ''));
  const [method, setMethod] = useState(initialPayment?.payment_method || 'pix');
  const [status, setStatus] = useState(initialPayment?.status || 'pending');
  const [notes, setNotes] = useState(initialPayment?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    try {
      const result = await ApiClient.post(`/v1/appointments/${appointmentId}/finish`, {
        payment: { amount: status === 'exempt' ? 0 : Number(amount.replace(',', '.')), paymentMethod: method, status, notes }
      });
      onFinished(result);
    } catch (err: any) { setError(err.message || 'Não foi possível registrar o recebimento.'); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
    <form onSubmit={confirm} className="bg-white rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-xl">
      <h2 id="receipt-title" className="text-xl font-bold">Recebimento do atendimento</h2>
      <p className="text-sm text-slate-600">Prontuário salvo. Confirme o recebimento para finalizar a consulta e atualizar o Financeiro da clínica.</p>
      <label className="block text-sm">Valor do atendimento (R$)
        <input aria-label="Valor do atendimento" inputMode="decimal" required={status !== 'exempt'} disabled={status === 'exempt'} value={amount} onChange={e => setAmount(e.target.value)} className="block w-full border rounded-lg p-2" />
      </label>
      <label className="block text-sm">Forma de pagamento
        <select aria-label="Forma de pagamento" value={method} onChange={e => setMethod(e.target.value)} className="block w-full border rounded-lg p-2">
          <option value="cash">Dinheiro</option><option value="pix">PIX</option><option value="credit_card">Cartão de Crédito</option><option value="debit_card">Cartão de Débito</option><option value="insurance">Convênio</option><option value="other">Outro</option>
        </select>
      </label>
      <label className="block text-sm">Status
        <select aria-label="Status do recebimento" value={status} onChange={e => setStatus(e.target.value)} className="block w-full border rounded-lg p-2">
          <option value="paid">Pago</option><option value="pending">Pendente</option><option value="exempt">Isento</option>
        </select>
      </label>
      <label className="block text-sm">Observação (opcional)<textarea value={notes} onChange={e => setNotes(e.target.value)} className="block w-full border rounded-lg p-2" /></label>
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
      <div className="flex justify-end gap-3"><button type="button" disabled={saving} onClick={onClose}>Continuar depois</button><button disabled={saving} className="bg-teal-700 text-white rounded-lg px-4 py-2">{saving ? 'Registrando…' : 'Confirmar e finalizar'}</button></div>
    </form>
  </div>;
}
