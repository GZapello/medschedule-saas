import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { valorPorExtenso } from '../../utils/numberToWords';
import { isValidPhoneNumber, generateWhatsAppUrl } from '../../utils/phone.utils';
import { isNativePrint, printNativeHtml } from '../../utils/nativePrint';
import {
  Receipt,
  Printer,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Building2,
  MessageCircle,
  Download,
  Info
} from 'lucide-react';

export interface ConsultationReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string;
  patientId?: string;
  patientName?: string;
  patientPhone?: string;
  professionalId?: string;
  professionalName?: string;
  serviceId?: string;
  serviceName?: string;
  initialPayment?: any;
}

const PAYMENT_METHODS_LABELS: Record<string, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  cash: 'Dinheiro',
  bank_transfer: 'Transferência Bancária',
  boleto: 'Boleto Bancário',
  convenio: 'Convênio',
  other: 'Outro'
};

export const ConsultationReceiptModal: React.FC<ConsultationReceiptModalProps> = ({
  isOpen,
  onClose,
  appointmentId,
  patientId,
  patientName,
  patientPhone,
  professionalId,
  professionalName,
  serviceId,
  serviceName,
  initialPayment
}) => {
  const { currentTenant, currentUser } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [paymentStatusNotice, setPaymentStatusNotice] = useState<'pending' | 'exempt' | null>(null);
  const [whatsappGuidance, setWhatsappGuidance] = useState<string | null>(null);
  const [phoneWarning, setPhoneWarning] = useState<string | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !appointmentId) return;

    let isMounted = true;

    async function loadOrIssueReceipt() {
      try {
        setLoading(true);
        setError(null);
        setPaymentStatusNotice(null);
        setWhatsappGuidance(null);
        setPhoneWarning(null);

        // 1. Tenta buscar recibo já existente para este agendamento (idempotência e histórico)
        try {
          const existing = await ApiClient.get<any>(`/v1/receipts/by-appointment/${appointmentId}`);
          if (existing && existing.id && isMounted) {
            setReceipt(existing);
            setLoading(false);
            return;
          }
        } catch (existingErr: any) {
          // Se for 404, significa que ainda não foi emitido; prossegue para emissão
        }

        // 2. Busca informações do pagamento vinculado ao agendamento
        let payment = initialPayment;
        if (!payment || !payment.status) {
          try {
            const payments = await ApiClient.get<any[]>(`/v1/payments?appointmentId=${encodeURIComponent(appointmentId)}`);
            if (payments && payments.length > 0) {
              payment = payments[0];
            }
          } catch (payErr) {
            console.warn('[ConsultationReceiptModal] Não foi possível consultar pagamento:', payErr);
          }
        }

        const effectiveStatus = payment?.status || 'pending';

        // Regra 7: emitir recibo de quitação somente para pagamentos efetivamente recebidos
        if (effectiveStatus === 'pending') {
          if (isMounted) {
            setPaymentStatusNotice('pending');
            setLoading(false);
          }
          return;
        }

        if (effectiveStatus === 'exempt') {
          if (isMounted) {
            setPaymentStatusNotice('exempt');
            setLoading(false);
          }
          return;
        }

        // 3. Busca dados completos do paciente se necessário (documento, telefone, endereço)
        let resolvedPatient: any = null;
        const targetPatientId = patientId || payment?.patient_id;
        if (targetPatientId) {
          try {
            resolvedPatient = await ApiClient.get<any>(`/v1/patients/${targetPatientId}`).catch(() => null);
          } catch {}
        }

        // 4. Busca dados do profissional se necessário
        let resolvedProf: any = null;
        const targetProfId = professionalId || payment?.professional_id;
        if (targetProfId) {
          try {
            resolvedProf = await ApiClient.get<any>(`/v1/professionals/${targetProfId}`).catch(() => null);
          } catch {}
        }

        // 5. Prepara os dados para emissão oficial do recibo
        const effectivePatientName = resolvedPatient?.full_name || patientName || payment?.patient_name || 'Paciente';
        const effectivePatientDoc = resolvedPatient?.cpf || resolvedPatient?.document || 'Não informado';
        const effectivePatientPhone = resolvedPatient?.phone || patientPhone || payment?.patient_phone || '';
        const effectivePatientAddress = resolvedPatient?.address
          ? `${resolvedPatient.address}, ${resolvedPatient.city || ''}/${resolvedPatient.state || ''}`
          : '';

        const effectiveServiceName = serviceName || payment?.service_name || 'Atendimento Clínico';
        const effectiveProfName = professionalName || resolvedProf?.name || currentUser?.name || 'Profissional Responsável';
        const effectiveProfSpecialty = resolvedProf?.specialty || currentUser?.canonicalProfessionName || currentUser?.professionName || '';
        const effectiveProfReg = resolvedProf?.registration_number || currentUser?.registrationNumber || '';

        const finalAmountNum = Number(payment?.amount || payment?.final_amount || 0);
        const baseAmountNum = payment?.base_amount !== undefined
          ? Number(payment.base_amount)
          : (payment?.baseAmount !== undefined ? Number(payment.baseAmount) : finalAmountNum);
        const addAmountNum = Number(payment?.additional_amount || payment?.additionalAmount || 0);
        const discAmountNum = Number(payment?.discount_amount || payment?.discountAmount || 0);
        const grossAmountNum = baseAmountNum + addAmountNum;

        const effectivePaymentMethod = payment?.payment_method || payment?.paymentMethod || 'pix';

        // 6. Emite o recibo no backend
        const issuePayload = {
          appointmentId,
          paymentId: payment?.id || null,
          patientId: targetPatientId || null,
          payerType: 'pf',
          payerName: effectivePatientName,
          payerDocument: effectivePatientDoc,
          payerPhone: effectivePatientPhone,
          payerAddress: effectivePatientAddress,
          serviceDescription: effectiveServiceName,
          serviceDate: new Date().toLocaleDateString('pt-BR'),
          professionalName: effectiveProfName,
          professionalSpecialty: effectiveProfSpecialty,
          professionalRegistry: effectiveProfReg,
          grossAmount: grossAmountNum,
          discountAmount: discAmountNum,
          finalAmount: finalAmountNum,
          paymentMethod: effectivePaymentMethod,
          paymentStatus: 'paid'
        };

        const result = await ApiClient.post<any>('/v1/receipts', issuePayload);

        if (!isMounted) return;

        if (result?.receipt) {
          setReceipt(result.receipt);
        } else if (result?.id) {
          const fresh = await ApiClient.get<any>(`/v1/receipts/${result.id}`);
          if (isMounted) setReceipt(fresh);
        } else {
          throw new Error('Falha ao obter confirmação de emissão do recibo.');
        }

        showToast('Recibo oficial de quitação emitido com sucesso!', 'success');
      } catch (err: any) {
        console.error('[ConsultationReceiptModal] Erro ao carregar ou emitir recibo:', err);
        if (isMounted) {
          setError(err?.message || 'Não foi possível carregar os dados para emissão do recibo.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadOrIssueReceipt();

    return () => {
      isMounted = false;
    };
  }, [isOpen, appointmentId]);

  if (!isOpen) return null;

  // Handler para Imprimir / Salvar PDF
  const handlePrintOrPdf = () => {
    if (!sheetRef.current || !receipt) return;

    if (isNativePrint()) {
      const sheetHtml = sheetRef.current.outerHTML;
      void printNativeHtml(sheetHtml, `Recibo_${receipt.receipt_number || 'Oficial'}`).catch(() => {
        window.print();
      });
      return;
    }

    window.print();
  };

  // Handler para Enviar pelo WhatsApp
  const handleSendWhatsApp = () => {
    if (!receipt) return;

    const phone = receipt.payer_phone || patientPhone;
    if (!phone || !isValidPhoneNumber(phone)) {
      setPhoneWarning('O paciente não possui um número de WhatsApp válido cadastrado (número ausente ou sem DDD). Atualize o cadastro do paciente para compartilhar via WhatsApp ou utilize a opção "Baixar PDF / Imprimir".');
      return;
    }

    setPhoneWarning(null);

    const clinicName = receipt.emitter?.name || receipt.clinic_name || currentTenant?.trade_name || currentTenant?.name || 'Clínica';
    const amountFormatted = Number(receipt.final_amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const methodKey = String(receipt.payment_method || '').toLowerCase();
    const methodLabel = PAYMENT_METHODS_LABELS[methodKey] || receipt.payment_method || 'Pagamento confirmado';

    const message = (
      `Olá, ${receipt.payer_name}! 😊\n\n` +
      `Aqui é da equipe da *${clinicName}*.\n\n` +
      `Encaminhamos a comprovação do seu atendimento:\n` +
      `📄 *Recibo:* ${receipt.receipt_number}\n` +
      `🩺 *Serviço:* ${receipt.service_description}\n` +
      `📅 *Data:* ${receipt.service_date || new Date().toLocaleDateString('pt-BR')}\n` +
      `💰 *Valor Quitado:* ${amountFormatted} (${methodLabel})\n\n` +
      `O recibo oficial de quitação em PDF está disponível para download e arquivamento.\n\n` +
      `Ficamos à disposição!\n` +
      `— ${clinicName}`
    );

    const waUrl = generateWhatsAppUrl(phone, message);
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    setWhatsappGuidance('Conversa do WhatsApp aberta! Como navegadores web e o WhatsApp não anexam arquivos automaticamente a links externos, você pode anexar o PDF baixado diretamente na conversa com o paciente.');
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white mobile-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consultation-receipt-title"
    >
      <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl my-4 sm:my-8 print:my-0 print:max-w-none print:shadow-none print:rounded-none flex flex-col max-h-[92vh]">
        {/* Barra Superior de Ações (Oculta na Impressão) */}
        <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="font-mono text-xs font-bold text-teal-400 truncate block">
                {receipt?.receipt_number || 'Recibo de Atendimento'}
              </span>
              <span className="text-[10px] text-slate-400 truncate block">
                {receipt ? 'Comprovante Oficial de Quitação' : 'Emissão de Recibo'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {receipt && (
              <>
                <button
                  type="button"
                  onClick={handlePrintOrPdf}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                  title="Imprimir folha A4 ou Salvar como PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Baixar PDF / Imprimir</span>
                  <span className="sm:hidden">PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                  title="Abrir conversa no WhatsApp com os dados do recibo"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Enviar pelo WhatsApp</span>
                  <span className="sm:hidden">WhatsApp</span>
                </button>
              </>
            )}

            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notificações e Orientações contextuais */}
        {whatsappGuidance && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 flex items-start gap-2 text-xs text-emerald-900 shrink-0 print:hidden animate-in fade-in">
            <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-800">WhatsApp aberto</p>
              <p className="text-[11px] text-emerald-700 mt-0.5 leading-snug">{whatsappGuidance}</p>
            </div>
            <button
              type="button"
              onClick={() => setWhatsappGuidance(null)}
              className="text-emerald-500 hover:text-emerald-800 text-xs font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {phoneWarning && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-start gap-2 text-xs text-amber-900 shrink-0 print:hidden animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800">WhatsApp indisponível</p>
              <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">{phoneWarning}</p>
            </div>
            <button
              type="button"
              onClick={() => setPhoneWarning(null)}
              className="text-amber-500 hover:text-amber-800 text-xs font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Conteúdo Central com Rolagem */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 print:bg-white print:p-0">
          {loading && (
            <div className="py-20 text-center space-y-3">
              <div className="w-10 h-10 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Preparando emissão do recibo oficial...</p>
              <p className="text-xs text-slate-400">Verificando quitação e formatando documento A4</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-6 bg-white rounded-2xl border border-red-200 text-center space-y-4 max-w-md mx-auto my-8">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Não foi possível emitir o recibo</h3>
                <p className="text-xs text-slate-500 mt-1">{error}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Voltar
              </button>
            </div>
          )}

          {/* Caso 1: Pagamento Pendente (Regra 7) */}
          {paymentStatusNotice === 'pending' && !loading && (
            <div className="p-6 sm:p-8 bg-white rounded-2xl border border-amber-200 text-center space-y-4 max-w-lg mx-auto my-6 shadow-sm">
              <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">Atendimento com Pagamento Pendente</h3>
                <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                  O <strong>Recibo Oficial de Quitação</strong> só pode ser emitido após a confirmação e efetivação do pagamento.
                </p>
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-[11px] text-amber-800 text-left mt-3">
                  <p className="font-semibold mb-1">Como emitir o recibo deste atendimento:</p>
                  <ol className="list-decimal list-inside space-y-1 text-amber-900/90">
                    <li>Acesse o menu <strong>Financeiro</strong> na barra lateral;</li>
                    <li>Localize o lançamento pendente deste atendimento;</li>
                    <li>Confirme o recebimento (baixar pagamento);</li>
                    <li>O recibo oficial estará disponível imediatamente na aba <strong>Recibos</strong>.</li>
                  </ol>
                </div>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Entendi e Fechar
                </button>
              </div>
            </div>
          )}

          {/* Caso 2: Atendimento Isento */}
          {paymentStatusNotice === 'exempt' && !loading && (
            <div className="p-6 sm:p-8 bg-white rounded-2xl border border-slate-200 text-center space-y-4 max-w-md mx-auto my-6 shadow-sm">
              <div className="w-14 h-14 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center mx-auto border border-slate-200">
                <Info className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">Atendimento Isento de Cobrança</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Este atendimento foi registrado com status <strong>Isento</strong> (sem cobrança financeira).
                  O recibo de quitação fiscal aplica-se exclusivamente a serviços com valores recebidos.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}

          {/* Caso 3: Recibo Oficial Quitado (Pré-visualização A4) */}
          {receipt && !loading && (() => {
            const emitterName = receipt.emitter?.name || receipt.clinic_name || currentTenant?.trade_name || currentTenant?.name || 'Clínica';
            const emitterLegalName = receipt.emitter?.tradeName || currentTenant?.name;
            const emitterDoc = receipt.emitter?.document || currentTenant?.cnpj_cpf || '';
            const emitterBoard = receipt.emitter?.boardName || '';
            const emitterReg = receipt.emitter?.registryNumber || '';
            const emitterRegState = receipt.emitter?.registryState || '';
            const emitterAddress = receipt.emitter?.address || currentTenant?.address || '';
            const emitterPhone = receipt.emitter?.phone || currentTenant?.phone || '';
            const emitterEmail = receipt.emitter?.email || currentTenant?.email || '';
            const logoUrl = receipt.emitter?.logoUrl || receipt.clinic_logo || currentTenant?.logo_url;

            const amountNumber = Number(receipt.final_amount || 0);
            const amountFormatted = amountNumber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const amountInWords = valorPorExtenso(amountNumber);

            const methodKey = String(receipt.payment_method || '').toLowerCase();
            const paymentMethodLabel = PAYMENT_METHODS_LABELS[methodKey] || receipt.payment_method || 'PIX';

            const issueDate = receipt.issued_at ? new Date(receipt.issued_at) : new Date();
            const cityStr = receipt.emitter?.city || currentTenant?.city || 'Localidade';
            const stateStr = receipt.emitter?.state || currentTenant?.state || '';
            const locationStr = stateStr ? `${cityStr} - ${stateStr}` : cityStr;
            const dateFormattedLong = issueDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

            return (
              <div
                ref={sheetRef}
                id="printable-consultation-receipt"
                className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 text-slate-800 font-sans space-y-6 max-w-2xl mx-auto print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none"
              >
                {/* 1. Cabeçalho do Emitente com Logotipo */}
                <div className="flex items-start justify-between pb-6 border-b-2 border-slate-900 gap-4 sm:gap-6">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={emitterName}
                        className="h-14 sm:h-16 max-w-[150px] sm:max-w-[180px] object-contain rounded-xl shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shadow-xs shrink-0">
                        <Building2 className="w-7 h-7 sm:w-8 sm:h-8 text-slate-600" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight uppercase leading-tight truncate">
                        {emitterName}
                      </h2>
                      {emitterLegalName && emitterLegalName !== emitterName && (
                        <p className="text-xs text-slate-600 font-medium truncate">{emitterLegalName}</p>
                      )}
                      <div className="text-[11px] text-slate-600 mt-1 space-y-0.5">
                        <p className="truncate">
                          <strong>CNPJ/CPF:</strong> {emitterDoc || '—'}
                          {emitterBoard && emitterReg && ` • ${emitterBoard}: ${emitterReg}${emitterRegState ? `/${emitterRegState}` : ''}`}
                          {receipt.emitter?.municipalRegistration && ` • IM: ${receipt.emitter.municipalRegistration}`}
                        </p>
                        {emitterAddress && <p className="text-[10px] sm:text-[11px] text-slate-500 leading-tight">{emitterAddress}</p>}
                        <p className="text-[10px] sm:text-[11px] text-slate-500">
                          {emitterPhone && <span>Tel: {emitterPhone}</span>}
                          {emitterPhone && emitterEmail && <span> • </span>}
                          {emitterEmail && <span>{emitterEmail}</span>}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 font-mono font-black text-xs sm:text-sm rounded-xl text-slate-900">
                      {receipt.receipt_number}
                    </span>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1">
                      Emissão: <strong>{new Date(receipt.issued_at || Date.now()).toLocaleDateString('pt-BR')}</strong>
                    </p>
                    <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 mt-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      PAGAMENTO QUITADO
                    </span>
                  </div>
                </div>

                {/* 2. Destaque de Valor Quitado */}
                <div className="text-center py-2 space-y-2">
                  <span className="text-[10px] sm:text-xs font-black tracking-widest text-slate-400 uppercase">
                    COMPROVANTE / RECIBO DE PAGAMENTO
                  </span>
                  <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-2xl max-w-md mx-auto shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Valor Quitado</span>
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                      {amountFormatted}
                    </p>
                    <p className="text-[11px] sm:text-xs font-semibold text-slate-600 italic mt-0.5">
                      ({amountInWords})
                    </p>
                  </div>
                </div>

                {/* 3. Texto Declaratório de Quitação */}
                <div className="p-4 sm:p-5 bg-slate-50/70 border border-slate-200 rounded-2xl text-[11px] sm:text-xs leading-relaxed text-slate-800">
                  <p>
                    Recebemos de <strong>{receipt.payer_name}</strong>
                    {receipt.payer_document && receipt.payer_document !== 'Não informado' && (
                      <span>, inscrito(a) sob o documento nº <strong>{receipt.payer_document}</strong></span>
                    )}
                    , a quantia supra de <strong>{amountFormatted}</strong> (<em>{amountInWords}</em>), referente à prestação do serviço de <strong>{receipt.service_description}</strong>
                    {receipt.service_date && <span>, realizado em <strong>{receipt.service_date}</strong></span>}
                    {receipt.professional_name && <span> através do(a) profissional <strong>{receipt.professional_name}</strong></span>}
                    , concedendo pelo presente instrumento a devida e irrevogável quitação da importância discriminada.
                  </p>
                </div>

                {/* 4. Quadro Estruturado: Tomador & Transação */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs pt-1">
                  <div className="p-3.5 sm:p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-400 uppercase text-[9px] sm:text-[10px] block mb-1 tracking-wider">
                      Dados do Paciente / Tomador
                    </span>
                    <p className="text-slate-900 font-bold text-xs sm:text-sm truncate">{receipt.payer_name}</p>
                    <p className="text-slate-600 text-[11px]">
                      <strong>Documento:</strong> <span className="font-mono">{receipt.payer_document || 'Não informado'}</span>
                    </p>
                    {receipt.payer_phone && (
                      <p className="text-slate-600 text-[11px]"><strong>Telefone:</strong> {receipt.payer_phone}</p>
                    )}
                    {receipt.payer_address && (
                      <p className="text-slate-600 text-[11px]"><strong>Endereço:</strong> {receipt.payer_address}</p>
                    )}
                  </div>

                  <div className="p-3.5 sm:p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-400 uppercase text-[9px] sm:text-[10px] block mb-1 tracking-wider">
                      Detalhes do Serviço & Transação
                    </span>
                    <p className="text-slate-800 text-[11px] truncate">
                      <strong>Serviço:</strong> {receipt.service_description}
                    </p>
                    <p className="text-slate-800 text-[11px]">
                      <strong>Forma de Pagamento:</strong> <span className="font-semibold">{paymentMethodLabel}</span>
                    </p>
                    <p className="text-slate-800 text-[11px]">
                      <strong>Data do Atendimento:</strong> {receipt.service_date || new Date().toLocaleDateString('pt-BR')}
                    </p>
                    <p className="text-slate-800 text-[11px]">
                      <strong>Status:</strong> <span className="font-bold text-emerald-700">Quitado</span>
                    </p>
                  </div>
                </div>

                {/* 5. Localidade e Data por Extenso */}
                <div className="text-right text-[11px] text-slate-600 pt-2 sm:pt-4">
                  {locationStr}, {dateFormattedLong}.
                </div>

                {/* 6. Linha de Assinatura */}
                <div className="pt-8 sm:pt-10 pb-2 text-center page-break-inside-avoid">
                  <div className="w-64 sm:w-72 h-0.5 bg-slate-800 mx-auto mb-2" />
                  <p className="font-bold text-xs sm:text-sm text-slate-900">
                    {receipt.professional_name || emitterLegalName || emitterName}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {receipt.professional_specialty || 'Responsável Técnico'}
                    {receipt.professional_registry && ` • ${receipt.professional_registry}`}
                  </p>
                  <span className="text-[9px] text-slate-400 block mt-1">
                    Assinatura / Carimbo do Emitente
                  </span>
                </div>

                {/* 7. Rodapé Discreto Oficial Zemda */}
                <div className="border-t border-slate-200 pt-3 mt-6 flex flex-col sm:flex-row items-center justify-between text-[9px] text-slate-400 gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                    <span>Documento gerado pelo <strong>Zemda</strong> • Tecnologia para Gestão em Saúde</span>
                  </div>
                  <span>Válido para comprovação fiscal e dedução no IRPF conforme legislação vigente</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Rodapé do Modal (Oculto na Impressão) */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Estilos Globais de Impressão A4 */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 12mm 15mm;
        }
        @media print {
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-consultation-receipt,
          #printable-consultation-receipt * {
            visibility: visible !important;
          }
          #printable-consultation-receipt {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm 15mm !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
          }
          .page-break-inside-avoid {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
};
