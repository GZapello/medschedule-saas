import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  Lock,
  Package,
  QrCode,
  ShoppingBag,
  X
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PatientSearchResult, PatientSearchSelect } from '../common/PatientSearchSelect';

interface SellableProduct {
  id: string;
  name: string;
  category?: string;
  brand?: string;
  quantity: number;
  unit: string;
  sale_unit: string;
  sale_price: number;
}

interface LaunchStudentConsumptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  canEditPrice: boolean;
  initialPatient?: PatientSearchResult | null;
}

const DISCRETE_UNITS = new Set([
  'un',
  'unidade',
  'cx',
  'frasco',
  'ampola',
  'par',
  'pacote',
  'pct',
  'garrafa',
  'lata',
  'barra'
]);

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cons-${crypto.randomUUID()}`;
  }
  return `cons-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const formatCurrency = (val: number) =>
  Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const LaunchStudentConsumptionModal: React.FC<LaunchStudentConsumptionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  canEditPrice,
  initialPatient = null
}) => {
  const { showToast } = useToast();

  const [products, setProducts] = useState<SellableProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [patientId, setPatientId] = useState<string>(initialPatient?.id || '');
  const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(initialPatient);
  const [productId, setProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [unitPriceStr, setUnitPriceStr] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('pending');
  const [paymentMethod, setPaymentMethod] = useState<string>('pix');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(generateIdempotencyKey);

  useEffect(() => {
    if (!isOpen) return;
    setPatientId(initialPatient?.id || '');
    setSelectedPatient(initialPatient);
    setProductId('');
    setQuantity('1');
    setUnitPriceStr('');
    setPaymentStatus('pending');
    setPaymentMethod('pix');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setAmountReceived('');
    setNotes('');
    setIdempotencyKey(generateIdempotencyKey());

    setLoadingProducts(true);
    ApiClient.get<{ products: SellableProduct[] }>('/v1/studio/consumptions/sellable-products')
      .then(res => {
        setProducts(Array.isArray(res?.products) ? res.products : []);
      })
      .catch(err => {
        showToast(err?.message || 'Erro ao carregar produtos disponíveis para venda.', 'error');
        setProducts([]);
      })
      .finally(() => setLoadingProducts(false));
  }, [isOpen, initialPatient]);

  const selectedProduct = useMemo(
    () => products.find(p => p.id === productId) || null,
    [products, productId]
  );

  const handleSelectProduct = (nextId: string) => {
    setProductId(nextId);
    const prod = products.find(p => p.id === nextId);
    if (prod) {
      setUnitPriceStr(Number(prod.sale_price || 0).toFixed(2));
      setQuantity('1');
    } else {
      setUnitPriceStr('');
    }
    setIdempotencyKey(generateIdempotencyKey());
  };

  const parsedQty = useMemo(() => {
    const num = Number(String(quantity).replace(',', '.'));
    return Number.isFinite(num) ? num : 0;
  }, [quantity]);

  const unitPriceCents = useMemo(() => {
    const raw = canEditPrice
      ? Number(String(unitPriceStr).replace(',', '.'))
      : Number(selectedProduct?.sale_price || 0);
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return Math.round(raw * 100);
  }, [canEditPrice, unitPriceStr, selectedProduct]);

  const totalAmountCents = useMemo(() => {
    if (parsedQty <= 0 || unitPriceCents <= 0) return 0;
    return Math.round(parsedQty * unitPriceCents);
  }, [parsedQty, unitPriceCents]);

  const totalReais = totalAmountCents / 100;
  const availableQty = Number(selectedProduct?.quantity || 0);
  const saleUnit = selectedProduct?.sale_unit || selectedProduct?.unit || 'un';
  const isDiscreteUnit = DISCRETE_UNITS.has(saleUnit.toLowerCase());

  const validationError = useMemo(() => {
    if (!patientId) return 'Selecione o aluno.';
    if (!selectedProduct) return 'Selecione um produto comercializável.';
    if (availableQty <= 0) return 'Produto sem estoque disponível no momento.';
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) return 'Informe uma quantidade maior que zero.';
    if (isDiscreteUnit && !Number.isInteger(parsedQty)) {
      return `A unidade "${saleUnit}" exige quantidade inteira.`;
    }
    if (parsedQty > availableQty) {
      return `Quantidade excede o saldo disponível (${availableQty} ${saleUnit}).`;
    }
    if (unitPriceCents <= 0) return 'Produto sem preço de venda válido.';
    return null;
  }, [patientId, selectedProduct, availableQty, parsedQty, isDiscreteUnit, saleUnit, unitPriceCents]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    try {
      setSubmitting(true);
      await ApiClient.post('/v1/studio/consumptions', {
        patientId,
        inventoryItemId: selectedProduct!.id,
        quantity: parsedQty,
        ...(canEditPrice ? { unitPrice: unitPriceCents / 100 } : {}),
        paymentStatus,
        ...(paymentStatus === 'paid'
          ? {
              paymentMethod,
              paymentDate,
              ...(paymentMethod === 'cash' && amountReceived.trim() !== ''
                ? { amountReceived: Number(amountReceived.replace(',', '.')) }
                : {})
            }
          : {}),
        notes: notes.trim() || undefined,
        idempotencyKey
      });

      showToast(
        paymentStatus === 'paid'
          ? 'Consumo registrado, pago e baixado do estoque!'
          : 'Consumo registrado em aberto e baixado do estoque!',
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao registrar consumo do aluno.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const cashReceivedNum = Number(String(amountReceived).replace(',', '.')) || 0;
  const cashChange = paymentMethod === 'cash' && cashReceivedNum > totalReais ? cashReceivedNum - totalReais : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Lançar Consumo</h3>
              <p className="text-[11px] text-slate-500">Venda rápida integrada ao estoque e financeiro</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* 1. Aluno */}
          <div>
            <PatientSearchSelect
              label="Aluno *"
              value={patientId}
              selectedPatient={selectedPatient}
              onChange={(id, pat) => {
                setPatientId(id);
                setSelectedPatient(pat || null);
                setIdempotencyKey(generateIdempotencyKey());
              }}
              onClear={() => {
                setPatientId('');
                setSelectedPatient(null);
              }}
              placeholder="Buscar aluno por nome ou telefone..."
              clientTermLabel="Aluno"
              enableCreateNew={false}
              required
            />
          </div>

          {/* 2. Produto */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Produto *</label>
            {loadingProducts ? (
              <div className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
                Carregando produtos comercializáveis...
              </div>
            ) : products.length === 0 ? (
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  Nenhum produto marcado como <strong>Disponível para venda aos alunos</strong> no Estoque de Insumos.
                </div>
              </div>
            ) : (
              <select
                value={productId}
                onChange={e => handleSelectProduct(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs bg-slate-50 font-semibold text-slate-800"
              >
                <option value="">Selecione um produto do estoque...</option>
                {products.map(p => {
                  const unitLabel = p.sale_unit || p.unit || 'un';
                  return (
                    <option key={p.id} value={p.id} disabled={Number(p.quantity) <= 0}>
                      {p.name} — {formatCurrency(p.sale_price)} / {unitLabel} (Disp: {p.quantity} {unitLabel})
                    </option>
                  );
                })}
              </select>
            )}

            {selectedProduct && (
              <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                  <Package className="w-3.5 h-3.5 text-teal-600" />
                  {selectedProduct.name} ({saleUnit})
                </span>
                <span className={`font-bold ${availableQty > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  Disponível: {availableQty} {saleUnit}
                </span>
              </div>
            )}
          </div>

          {/* 3. Quantidade, Valor Unitário e Total */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Quantidade ({saleUnit}) *
              </label>
              <input
                type="number"
                min={isDiscreteUnit ? 1 : 0.01}
                step={isDiscreteUnit ? 1 : 0.01}
                max={availableQty > 0 ? availableQty : undefined}
                value={quantity}
                onChange={e => {
                  setQuantity(e.target.value);
                  setIdempotencyKey(generateIdempotencyKey());
                }}
                required
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 bg-white"
              />
            </div>

            <div>
              <label className="flex items-center justify-between font-semibold text-slate-700 mb-1">
                <span>Valor unitário</span>
                {!canEditPrice && (
                  <span title="Definido no cadastro do estoque">
                    <Lock className="w-3 h-3 text-slate-400" />
                  </span>
                )}
              </label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={canEditPrice ? unitPriceStr : (unitPriceCents / 100).toFixed(2)}
                onChange={e => {
                  setUnitPriceStr(e.target.value);
                  setIdempotencyKey(generateIdempotencyKey());
                }}
                readOnly={!canEditPrice}
                disabled={!canEditPrice}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Valor total</label>
              <div className="w-full border border-emerald-200 bg-emerald-50/70 rounded-xl px-3 py-2 text-xs font-extrabold text-emerald-800">
                {formatCurrency(totalReais)}
              </div>
            </div>
          </div>

          {/* 4. Situação Financeira */}
          <div className="space-y-2.5">
            <label className="block font-semibold text-slate-700">Situação financeira *</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentStatus('pending')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  paymentStatus === 'pending'
                    ? 'border-amber-500 bg-amber-50/70 text-amber-950 ring-1 ring-amber-400'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Deixar pendente
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Registra em Contas a Receber do aluno.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPaymentStatus('paid')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  paymentStatus === 'paid'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Registrar como já pago
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Confirma o recebimento imediato.
                </p>
              </button>
            </div>
          </div>

          {/* Campos adicionais quando Já Pago */}
          {paymentStatus === 'paid' && (
            <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/30 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Forma de pagamento *</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white text-slate-800"
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
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-semibold"
                  />
                </div>
              </div>

              {paymentMethod === 'cash' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Valor recebido (R$)</label>
                    <input
                      type="number"
                      min={totalReais}
                      step={0.01}
                      value={amountReceived}
                      onChange={e => setAmountReceived(e.target.value)}
                      placeholder={totalReais.toFixed(2)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white font-bold"
                    />
                  </div>
                  <div className="flex flex-col justify-end pb-1">
                    <span className="text-[10px] text-slate-500">Troco calculado</span>
                    <strong className="text-sm text-emerald-700">{formatCurrency(cashChange)}</strong>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-[10px] text-emerald-800">
                {paymentMethod === 'pix' ? <QrCode className="w-3.5 h-3.5" /> : paymentMethod === 'cash' ? <Banknote className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
                <span>O recebimento integrará automaticamente o fluxo financeiro e o caixa aberto (quando aplicável).</span>
              </div>
            </div>
          )}

          {/* 5. Observações */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Observações (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Consumo pós-aula / Retirado na recepção..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
          </div>

          {validationError && selectedProduct && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-medium">
              {validationError}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl min-h-[40px] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || Boolean(validationError)}
              className="w-full sm:w-auto px-6 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs min-h-[40px] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Registrando...' : 'Confirmar Consumo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
