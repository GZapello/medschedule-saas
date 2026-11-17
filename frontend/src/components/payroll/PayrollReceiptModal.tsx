import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  History,
  Printer,
  X
} from 'lucide-react';
import { ApiClient, buildApiUrl, getApiBaseUrl } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ProfessionalPayroll } from '../../types';
import { downloadBlob } from '../../utils/download';
import { isNativePrint, printNativeHtml } from '../../utils/nativePrint';

export interface PayrollReceiptBreakdownItem {
  id?: string;
  serviceName: string;
  serviceKind?: string;
  participantRole: 'primary' | 'co_instructor';
  isPackageCovered: boolean;
  commissionType: string;
  commissionRate: number;
  grossBasisAmount: number;
  commissionAmount: number;
  eligibleStudentsCount: number;
  referenceDate?: string | null;
  financialBasisNote?: string | null;
}

export interface PayrollReceiptSnapshot {
  receiptNumber: string;
  documentId: string;
  verificationCode: string;
  issuedAt: string;
  issuedAtBr: string;
  receiptStatus: 'active' | 'superseded' | 'reversed';
  statusReason: string | null;
  previousReceiptNumber: string | null;
  payrollId: string;
  payrollStatus: string;
  establishment: {
    id: string;
    name: string;
    tradeName: string;
    corporateName: string | null;
    document: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
    establishmentProfile: 'clinic' | 'studio' | 'mixed';
  };
  professional: {
    id: string;
    name: string;
    profession: string;
    specialty: string | null;
    cpf: string | null;
    registry: string | null;
  };
  payment: {
    periodMonth: string;
    competenceLabel: string;
    referencePeriodLabel: string;
    paidDate: string | null;
    paidDateBr: string | null;
    dueDate: string | null;
    remunerationType: 'commission' | 'salary' | 'both';
    remunerationLabel: string;
    paymentMethod: string | null;
    notes: string | null;
  };
  values: {
    hasFixedSalary: boolean;
    hasCommission: boolean;
    fixedSalary: number;
    appointmentsCount: number;
    producedAmount: number;
    commissionPercentage: number | null;
    commissionPercentageLabel: string | null;
    commissionAmount: number;
    adjustments: number;
    adjustmentNotes: string | null;
    totalPaid: number;
    totalPaidInWords: string;
    otherPayouts: Array<{ label: string; amount: number }>;
    breakdownItems: PayrollReceiptBreakdownItem[];
  };
}

export interface PayrollReceiptRecord {
  id: string;
  tenantId: string;
  payrollId: string;
  professionalId: string;
  receiptNumber: string;
  sequenceNumber: number;
  periodMonth: string;
  receiptStatus: 'active' | 'superseded' | 'reversed';
  statusReason: string | null;
  snapshotHash: string;
  issuedByUserId: string | null;
  issuedByName: string | null;
  issuedAt: string;
  supersededAt: string | null;
  snapshot: PayrollReceiptSnapshot;
}

interface PayrollReceiptModalProps {
  isOpen: boolean;
  payroll: ProfessionalPayroll | null;
  onClose: () => void;
}

function formatBRL(v: number): string {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const PayrollReceiptModal: React.FC<PayrollReceiptModalProps> = ({
  isOpen,
  payroll,
  onClose
}) => {
  const { showToast } = useToast();
  const { currentTenant } = useAuth();
  const sheetRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<PayrollReceiptRecord | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<PayrollReceiptRecord | null>(null);
  const [history, setHistory] = useState<PayrollReceiptRecord[]>([]);
  const [filename, setFilename] = useState<string>('recibo-repasse-profissional.pdf');

  useEffect(() => {
    if (!isOpen || !payroll?.id) return;

    let cancelled = false;
    async function loadOrIssue() {
      try {
        setLoading(true);
        setError(null);
        setSelectedReceipt(null);
        setActiveReceipt(null);
        setHistory([]);

        const res = await ApiClient.post<{
          receipt: PayrollReceiptRecord;
          history: PayrollReceiptRecord[];
          alreadyIssued: boolean;
          filename?: string;
        }>(`/v1/payroll/${payroll!.id}/receipt`, {});

        if (cancelled) return;
        setActiveReceipt(res.receipt);
        setSelectedReceipt(res.receipt);
        setHistory(Array.isArray(res.history) ? res.history : [res.receipt]);
        if (res.filename) setFilename(res.filename);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Não foi possível gerar o recibo deste pagamento.');
        if (Array.isArray(err?.data?.history) && err.data.history.length > 0) {
          setHistory(err.data.history);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadOrIssue();
    return () => {
      cancelled = true;
    };
  }, [isOpen, payroll?.id]);

  if (!isOpen || !payroll) return null;

  const currentRecord = selectedReceipt || activeReceipt;
  const snap = currentRecord?.snapshot;

  const handleDownloadPdf = async () => {
    if (!currentRecord || downloadingPdf) return;
    try {
      setDownloadingPdf(true);
      const token =
        localStorage.getItem('auth_token') ||
        localStorage.getItem('token') ||
        '';
      const tenantId =
        localStorage.getItem('active_tenant_id') ||
        localStorage.getItem('tenantId') ||
        currentTenant?.id ||
        '';

      const qs = currentRecord.id ? `?receiptId=${encodeURIComponent(currentRecord.id)}` : '';
      const url = buildApiUrl(getApiBaseUrl(), `/v1/payroll/${payroll.id}/receipt/pdf${qs}`);
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Tenant-ID': tenantId
        },
        cache: 'no-store'
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson?.error || `Erro ${response.status} ao baixar PDF do recibo.`);
      }

      const blob = await response.blob();
      const targetFilename = filename || `recibo-repasse-profissional-${payroll.period_month}.pdf`;
      await downloadBlob(blob, targetFilename);
      showToast('PDF do recibo baixado com sucesso!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Falha ao baixar o PDF do recibo.', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrint = () => {
    if (!sheetRef.current || !snap) return;
    if (isNativePrint()) {
      void printNativeHtml(sheetRef.current.outerHTML, `Recibo_${snap.receiptNumber}`).catch(() => {
        window.print();
      });
      return;
    }
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white mobile-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payroll-receipt-modal-title"
    >
      <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl my-4 sm:my-8 print:my-0 print:max-w-none print:shadow-none print:rounded-none flex flex-col max-h-[92vh]">
        {/* Barra Superior de Ações (Oculta na Impressão) */}
        <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span id="payroll-receipt-modal-title" className="font-mono text-xs font-bold text-teal-400 truncate block">
                {snap?.receiptNumber || 'Recibo de Pagamento ao Profissional'}
              </span>
              <span className="text-[10px] text-slate-400 truncate block">
                {snap ? `${snap.professional.name} • ${snap.payment.competenceLabel}` : 'Preparando documento oficial'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {snap && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  data-testid="payroll-receipt-download-pdf"
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                  title="Baixar arquivo PDF oficial"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{downloadingPdf ? 'Gerando PDF...' : 'Baixar PDF'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  data-testid="payroll-receipt-print"
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                  title="Imprimir recibo em página A4"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Imprimir</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar recibo"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corpo do Modal */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/70 print:p-0 print:bg-white space-y-4">
          {loading ? (
            <div className="py-16 text-center text-xs text-slate-500">
              Gerando documento oficial de quitação...
            </div>
          ) : error && !snap ? (
            <div className="max-w-lg mx-auto bg-white p-6 rounded-2xl border border-rose-200 text-center space-y-3">
              <div className="w-11 h-11 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Não foi possível gerar o recibo</h3>
              <p className="text-xs text-slate-600">{error}</p>
            </div>
          ) : null}

          {/* Histórico de versões de recibos (se houver reemissão/estorno) */}
          {history.length > 1 && (
            <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2 text-xs print:hidden">
              <div className="flex items-center gap-1.5 text-slate-600 font-semibold">
                <History className="w-3.5 h-3.5 text-indigo-600" />
                <span>Histórico de emissões ({history.length}):</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {history.map(h => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelectedReceipt(h)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                      currentRecord?.id === h.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {h.receiptNumber}{' '}
                    {h.receiptStatus === 'active'
                      ? '(Atual)'
                      : h.receiptStatus === 'reversed'
                      ? '(Estornado)'
                      : '(Substituído)'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pré-visualização A4 */}
          {snap && currentRecord && (
            <div
              ref={sheetRef}
              id="printable-payroll-receipt"
              data-testid="payroll-receipt-preview"
              className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 text-slate-800 font-sans space-y-5 max-w-2xl mx-auto print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none"
            >
              {currentRecord.receiptStatus !== 'active' && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>
                    {currentRecord.receiptStatus === 'reversed'
                      ? `RECIBO INATIVO — PAGAMENTO ESTORNADO/REABERTO (${currentRecord.statusReason || 'Consulte o status atual da folha'})`
                      : `RECIBO SUBSTITUÍDO POR CORREÇÃO POSTERIOR (${currentRecord.statusReason || 'Consulte a emissão mais recente'})`}
                  </span>
                </div>
              )}

              {/* 1. Cabeçalho do Estabelecimento */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-5 border-b-2 border-slate-900 gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  {snap.establishment.logoUrl ? (
                    <img
                      src={snap.establishment.logoUrl}
                      alt={snap.establishment.tradeName}
                      className="h-14 sm:h-16 max-w-[140px] object-contain rounded-xl shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                      <Building2 className="w-7 h-7" />
                    </div>
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <h2 className="text-base sm:text-lg font-black text-slate-900 uppercase leading-tight">
                      {snap.establishment.tradeName}
                    </h2>
                    {snap.establishment.corporateName && (
                      <p className="text-[11px] font-medium text-slate-600">
                        Razão Social: {snap.establishment.corporateName}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-600">
                      {snap.establishment.document ? `CPF/CNPJ: ${snap.establishment.document}` : ''}
                      {snap.establishment.document && snap.establishment.phone ? ' • ' : ''}
                      {snap.establishment.phone ? `Tel: ${snap.establishment.phone}` : ''}
                      {(snap.establishment.document || snap.establishment.phone) && snap.establishment.email ? ' • ' : ''}
                      {snap.establishment.email || ''}
                    </p>
                    {snap.establishment.address && (
                      <p className="text-[10px] text-slate-500 leading-tight">{snap.establishment.address}</p>
                    )}
                  </div>
                </div>

                <div className="sm:text-right shrink-0 space-y-1">
                  <span className="inline-block px-3 py-1 bg-slate-100 border border-slate-300 font-mono font-black text-xs rounded-xl text-slate-900">
                    {snap.receiptNumber}
                  </span>
                  <p className="text-[10px] text-slate-500">
                    Emissão: <strong>{snap.issuedAtBr}</strong>
                  </p>
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        currentRecord.receiptStatus === 'active'
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : 'text-rose-700 bg-rose-50 border-rose-200'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {currentRecord.receiptStatus === 'active'
                        ? 'Situação: Pago'
                        : currentRecord.receiptStatus === 'reversed'
                        ? 'Estornado'
                        : 'Substituído'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Título e Total Destacado */}
              <div className="text-center space-y-2.5">
                <div>
                  <h3 className="text-sm sm:text-base font-black tracking-wide text-slate-900 uppercase">
                    RECIBO DE PAGAMENTO AO PROFISSIONAL
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Competência: <strong className="text-slate-700">{snap.payment.competenceLabel}</strong> • Período: {snap.payment.referencePeriodLabel}
                  </p>
                </div>

                <div className="p-4 bg-teal-50/70 border border-teal-200 rounded-2xl max-w-md mx-auto">
                  <span className="text-[10px] uppercase font-bold text-teal-800 block">Total efetivamente pago</span>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {formatBRL(snap.values.totalPaid)}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-600 italic mt-0.5">
                    ({snap.values.totalPaidInWords})
                  </p>
                </div>
              </div>

              {/* 3. Dados das Partes & Referências */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                  <span className="font-bold text-slate-400 uppercase text-[10px] block tracking-wider">
                    Identificação do Profissional
                  </span>
                  <p className="text-slate-900 font-bold text-sm">{snap.professional.name}</p>
                  <p className="text-slate-600 text-[11px]">
                    <strong>Profissão:</strong> {snap.professional.profession}
                    {snap.professional.specialty ? ` (${snap.professional.specialty})` : ''}
                  </p>
                  {snap.professional.cpf && (
                    <p className="text-slate-600 text-[11px]">
                      <strong>CPF:</strong> <span className="font-mono">{snap.professional.cpf}</span>
                    </p>
                  )}
                  {snap.professional.registry && (
                    <p className="text-slate-600 text-[11px]">
                      <strong>Registro profissional:</strong> {snap.professional.registry}
                    </p>
                  )}
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                  <span className="font-bold text-slate-400 uppercase text-[10px] block tracking-wider">
                    Referências do Pagamento
                  </span>
                  <p className="text-slate-700 text-[11px]">
                    <strong>Modalidade:</strong> {snap.payment.remunerationLabel}
                  </p>
                  <p className="text-slate-700 text-[11px]">
                    <strong>Competência:</strong> {snap.payment.competenceLabel}
                  </p>
                  <p className="text-slate-700 text-[11px]">
                    <strong>Data do pagamento:</strong> {snap.payment.paidDateBr || 'Registrado'}
                  </p>
                  <p className="text-slate-700 text-[11px]">
                    <strong>Forma de pagamento:</strong> {snap.payment.paymentMethod || 'Não informada'}
                  </p>
                </div>
              </div>

              {/* 4. Declaração */}
              <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-2xl text-[11px] leading-relaxed text-slate-800">
                Declaro ter recebido de <strong>{snap.establishment.tradeName}</strong>
                {snap.establishment.document ? ` (CPF/CNPJ ${snap.establishment.document})` : ''}, a importância líquida de{' '}
                <strong>{formatBRL(snap.values.totalPaid)}</strong> (<em>{snap.values.totalPaidInWords}</em>), referente à competência{' '}
                <strong>{snap.payment.competenceLabel}</strong> ({snap.payment.referencePeriodLabel}), paga em{' '}
                <strong>{snap.payment.paidDateBr || snap.issuedAtBr.slice(0, 10)}</strong>, dando plena quitação dos valores abaixo discriminados.
              </div>

              {/* 5. Tabela Discriminada de Valores */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                      <th className="p-3">Discriminação</th>
                      <th className="p-3">Referência / Detalhe</th>
                      <th className="p-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {snap.values.hasFixedSalary && (
                      <tr>
                        <td className="p-3 font-semibold text-slate-800">Salário fixo</td>
                        <td className="p-3 text-slate-500">Remuneração fixa mensal acordada</td>
                        <td className="p-3 text-right font-semibold text-slate-900">
                          {formatBRL(snap.values.fixedSalary)}
                        </td>
                      </tr>
                    )}

                    {snap.values.hasCommission ? (
                      <>
                        <tr>
                          <td className="p-3 font-semibold text-slate-800">Atendimentos considerados</td>
                          <td className="p-3 text-slate-500">
                            Faturamento de referência: {formatBRL(snap.values.producedAmount)}
                          </td>
                          <td className="p-3 text-right font-semibold text-slate-900">
                            {snap.values.appointmentsCount} atendimento(s)
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3 font-semibold text-slate-800">Comissões</td>
                          <td className="p-3 text-slate-500">
                            {snap.values.commissionPercentageLabel
                              ? `Regra aplicada: ${snap.values.commissionPercentageLabel}`
                              : 'Comissões apuradas no período'}
                          </td>
                          <td className="p-3 text-right font-semibold text-slate-900">
                            {formatBRL(snap.values.commissionAmount)}
                          </td>
                        </tr>
                      </>
                    ) : snap.values.appointmentsCount > 0 ? (
                      <tr>
                        <td className="p-3 font-semibold text-slate-800">Atendimentos registrados no período</td>
                        <td className="p-3 text-slate-500">
                          Faturamento de referência: {formatBRL(snap.values.producedAmount)}
                        </td>
                        <td className="p-3 text-right font-semibold text-slate-900">
                          {snap.values.appointmentsCount} atendimento(s)
                        </td>
                      </tr>
                    ) : null}

                    <tr>
                      <td className="p-3 font-semibold text-slate-800">
                        {snap.values.adjustments > 0
                          ? 'Ajustes positivos / Bonificações (+)'
                          : snap.values.adjustments < 0
                          ? 'Ajustes negativos / Deduções (-)'
                          : 'Ajustes financeiros'}
                      </td>
                      <td className="p-3 text-slate-500">
                        {snap.values.adjustmentNotes || 'Sem acréscimos ou descontos lançados'}
                      </td>
                      <td
                        className={`p-3 text-right font-semibold ${
                          snap.values.adjustments < 0
                            ? 'text-rose-600'
                            : snap.values.adjustments > 0
                            ? 'text-emerald-700'
                            : 'text-slate-700'
                        }`}
                      >
                        {formatBRL(snap.values.adjustments)}
                      </td>
                    </tr>

                    {snap.values.otherPayouts.map((op, idx) => (
                      <tr key={idx}>
                        <td className="p-3 font-semibold text-slate-800">{op.label}</td>
                        <td className="p-3 text-slate-500">Incluído no pagamento líquido</td>
                        <td className="p-3 text-right font-semibold text-slate-900">{formatBRL(op.amount)}</td>
                      </tr>
                    ))}

                    <tr className="bg-teal-50/70 border-t-2 border-teal-200">
                      <td className="p-3 font-black text-slate-900">Total recebido / pago</td>
                      <td className="p-3 font-semibold text-teal-800">
                        Situação: {currentRecord.receiptStatus === 'active' ? 'Pago' : currentRecord.receiptStatus}
                      </td>
                      <td className="p-3 text-right font-black text-teal-800 text-sm">
                        {formatBRL(snap.values.totalPaid)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {snap.payment.notes && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700">
                  <strong className="text-slate-900">Observações / Comprovante:</strong> {snap.payment.notes}
                </div>
              )}

              {snap.values.breakdownItems.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Detalhamento de repasses incluídos ({snap.values.breakdownItems.length})
                  </p>
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 text-[11px]">
                    {snap.values.breakdownItems.slice(0, 12).map((it, idx) => (
                      <div key={it.id || idx} className="px-3 py-1.5 flex items-center justify-between gap-2">
                        <span className="text-slate-700 truncate">
                          {it.serviceName} ({it.participantRole === 'co_instructor' ? 'Coinstrutor' : 'Titular'})
                        </span>
                        <span className="font-semibold text-slate-900 shrink-0">
                          {formatBRL(it.commissionAmount)}
                        </span>
                      </div>
                    ))}
                    {snap.values.breakdownItems.length > 12 && (
                      <div className="px-3 py-1.5 text-[10px] text-slate-400 italic">
                        + {snap.values.breakdownItems.length - 12} item(ns) no PDF completo.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Rodapé & Identificação */}
              <div className="border-t border-slate-200 pt-4 mt-4 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-400 gap-1.5">
                <span>Documento emitido pelo <strong>Zemda</strong></span>
                <span>
                  ID: <strong className="font-mono">{snap.documentId}</strong> • Código: <strong className="font-mono">{snap.verificationCode}</strong>
                </span>
              </div>
            </div>
          )}
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
          #printable-payroll-receipt,
          #printable-payroll-receipt * {
            visibility: visible !important;
          }
          #printable-payroll-receipt {
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
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
};

export default PayrollReceiptModal;
