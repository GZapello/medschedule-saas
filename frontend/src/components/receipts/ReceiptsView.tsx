import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { valorPorExtenso } from '../../utils/numberToWords';
import {
  Receipt,
  Plus,
  Search,
  Printer,
  FileText,
  Mail,
  Download,
  CheckCircle2,
  AlertTriangle,
  X,
  Settings,
  Building2,
  User,
  DollarSign
} from 'lucide-react';

export const ReceiptsView: React.FC = () => {
  const { currentTenant, isClinicAdmin } = useAuth();
  const { showToast } = useToast();

  const [receipts, setReceipts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modais
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  // Dados para novo recibo
  const [patients, setPatients] = useState<any[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  const [newReceiptForm, setNewReceiptForm] = useState({
    patientId: '',
    payerType: 'pf',
    payerName: '',
    payerDocument: '',
    payerEmail: '',
    payerPhone: '',
    payerAddress: '',
    serviceDescription: '',
    serviceDate: new Date().toLocaleDateString('pt-BR'),
    professionalName: '',
    professionalSpecialty: '',
    professionalRegistry: '',
    grossAmount: '',
    discountAmount: '0',
    finalAmount: '',
    paymentMethod: 'pix',
    paymentStatus: 'paid',
    notes: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [recData, setDataSettings, patData, profData, srvData] = await Promise.all([
        ApiClient.get<any[]>('/v1/receipts'),
        ApiClient.get<any>('/v1/receipts/settings'),
        ApiClient.get<any[]>('/v1/patients'),
        ApiClient.get<any[]>('/v1/professionals'),
        ApiClient.get<any[]>('/v1/services')
      ]);

      setReceipts(recData);
      setSettings(setDataSettings);
      setPatients(patData);
      setProfessionals(profData);
      setServices(srvData);
    } catch (err) {
      console.error('Erro ao carregar recibos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePatientSelect = (patId: string) => {
    const pat = patients.find(p => p.id === patId);
    if (pat) {
      setNewReceiptForm(prev => ({
        ...prev,
        patientId: pat.id,
        payerName: pat.full_name,
        payerDocument: pat.cpf || '',
        payerEmail: pat.email || '',
        payerPhone: pat.phone || '',
        payerAddress: pat.address ? `${pat.address}, ${pat.city || ''}/${pat.state || ''}` : ''
      }));
    }
  };

  const handleServiceSelect = (srvId: string) => {
    const srv = services.find(s => s.id === srvId);
    if (srv) {
      setNewReceiptForm(prev => ({
        ...prev,
        serviceDescription: srv.name,
        grossAmount: String(srv.price),
        finalAmount: String(srv.price)
      }));
    }
  };

  const handleProfessionalSelect = (profId: string) => {
    const prof = professionals.find(p => p.id === profId);
    if (prof) {
      setNewReceiptForm(prev => ({
        ...prev,
        professionalName: prof.name,
        professionalSpecialty: prof.specialty_name || '',
        professionalRegistry: prof.registration_number ? `${prof.registration_type || 'CRM'} ${prof.registration_number}` : ''
      }));
    }
  };

  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!settings || settings.is_configured === 0) {
      showToast('Configure primeiro os Dados para Emissão de Recibos', 'error');
      setIsSettingsModalOpen(true);
      return;
    }

    if (!newReceiptForm.payerName || !newReceiptForm.payerDocument || !newReceiptForm.finalAmount) {
      showToast('Preencha o tomador, documento e valor final', 'error');
      return;
    }

    try {
      const res = await ApiClient.post<any>('/v1/receipts', {
        ...newReceiptForm,
        finalAmount: Number(newReceiptForm.finalAmount),
        grossAmount: Number(newReceiptForm.grossAmount || newReceiptForm.finalAmount),
        discountAmount: Number(newReceiptForm.discountAmount || 0)
      });

      showToast(`Recibo ${res.receiptNumber} emitido com sucesso!`, 'success');
      setIsIssueModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao emitir recibo', 'error');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ApiClient.put('/v1/receipts/settings', settings);
      showToast('Configurações de recibo salvas com sucesso!', 'success');
      setIsSettingsModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar configurações', 'error');
    }
  };

  const filteredReceipts = receipts.filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.receipt_number?.toLowerCase().includes(term) ||
      r.payer_name?.toLowerCase().includes(term) ||
      r.professional_name?.toLowerCase().includes(term)
    );
  });

  const totalAmount = receipts.reduce((acc, r) => acc + Number(r.final_amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-indigo-600" />
            Recibos e Comprovantes de Pagamento
          </h1>
          <p className="text-xs text-slate-500">
            Emissão independente com numeração própria sequencial por clínica ({currentTenant?.trade_name || currentTenant?.name}).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {isClinicAdmin && (
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              Dados para Recibos
            </button>
          )}

          <button
            onClick={() => {
              if (!settings || settings.is_configured === 0) {
                showToast('Atenção: Configure os dados do emitente antes de emitir recibos', 'error');
                setIsSettingsModalOpen(true);
              } else {
                setIsIssueModalOpen(true);
              }
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Emitir Novo Recibo
          </button>
        </div>
      </div>

      {/* Alerta de Configuração Pendente */}
      {settings && settings.is_configured === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900">Módulo de Recibos Pendente de Configuração</p>
              <p className="text-amber-700">
                Para emitir recibos válidos e em conformidade, é necessário preencher e validar os dados do emitente e o modelo padrão.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer whitespace-nowrap"
          >
            Configurar Agora
          </button>
        </div>
      )}

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total de Recibos Emitidos</span>
          <p className="text-2xl font-black text-slate-800 mt-1">{receipts.length}</p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Volume Faturado em Recibos</span>
          <p className="text-2xl font-black text-emerald-600 mt-1">
            {totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Próxima Numeração da Clínica</span>
          <p className="text-2xl font-black text-indigo-600 mt-1 font-mono">
            {settings?.receipt_prefix || 'REC-'}{String(settings?.next_sequence || 1).padStart(6, '0')}
          </p>
        </div>
      </div>

      {/* Busca e Tabela */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-xs space-y-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por número (REC-000001), tomador ou profissional..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3">Número</th>
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3">Tomador / Paciente</th>
                <th className="py-3 px-3">Profissional</th>
                <th className="py-3 px-3">Serviço</th>
                <th className="py-3 px-3">Valor</th>
                <th className="py-3 px-3">Pagamento</th>
                <th className="py-3 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredReceipts.map(rec => (
                <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3 font-mono font-bold text-indigo-600">
                    {rec.receipt_number}
                  </td>
                  <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                    {rec.service_date || new Date(rec.issued_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-3 px-3">
                    <p className="font-bold text-slate-800">{rec.payer_name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{rec.payer_document}</p>
                  </td>
                  <td className="py-3 px-3 text-slate-700 font-medium">
                    {rec.professional_name}
                  </td>
                  <td className="py-3 px-3 text-slate-600">
                    {rec.service_description}
                  </td>
                  <td className="py-3 px-3 font-bold text-slate-900">
                    {Number(rec.final_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] uppercase">
                      {rec.payment_method}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={async () => {
                        try {
                          const detailed = await ApiClient.get<any>(`/v1/receipts/${rec.id}`);
                          setSelectedReceipt(detailed);
                        } catch {
                          setSelectedReceipt(rec);
                        }
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ml-auto"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Visualizar
                    </button>
                  </td>
                </tr>
              ))}

              {filteredReceipts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    {loading ? 'Carregando recibos...' : 'Nenhum recibo emitido encontrado.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================== */}
      {/* MODAL 1: Emissão de Novo Recibo */}
      {/* ========================================================== */}
      {isIssueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold">Emitir Novo Recibo Oficial</h3>
                <p className="text-xs text-slate-400">
                  Numeração gerada: <strong className="text-indigo-400 font-mono">{settings?.receipt_prefix || 'REC-'}{String(settings?.next_sequence || 1).padStart(6, '0')}</strong>
                </p>
              </div>
              <button onClick={() => setIsIssueModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateReceipt} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* Seletores rápidos */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preencher Paciente</label>
                  <select
                    onChange={e => handlePatientSelect(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-xl bg-white text-xs"
                  >
                    <option value="">-- Selecionar Paciente --</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preencher Serviço</label>
                  <select
                    onChange={e => handleServiceSelect(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-xl bg-white text-xs"
                  >
                    <option value="">-- Selecionar Serviço --</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id}>{s.name} - R$ {s.price}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Profissional</label>
                  <select
                    onChange={e => handleProfessionalSelect(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-xl bg-white text-xs"
                  >
                    <option value="">-- Selecionar Profissional --</option>
                    {professionals.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dados do Tomador / Pagador */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                  Dados do Tomador (Pagador)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nome do Tomador *</label>
                    <input
                      type="text"
                      required
                      value={newReceiptForm.payerName}
                      onChange={e => setNewReceiptForm({ ...newReceiptForm, payerName: e.target.value })}
                      placeholder="Ex: Mariana Silva"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">CPF ou CNPJ do Tomador *</label>
                    <input
                      type="text"
                      required
                      value={newReceiptForm.payerDocument}
                      onChange={e => setNewReceiptForm({ ...newReceiptForm, payerDocument: e.target.value })}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">E-mail do Tomador</label>
                    <input
                      type="email"
                      value={newReceiptForm.payerEmail}
                      onChange={e => setNewReceiptForm({ ...newReceiptForm, payerEmail: e.target.value })}
                      placeholder="mariana@email.com"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Telefone</label>
                    <input
                      type="text"
                      value={newReceiptForm.payerPhone}
                      onChange={e => setNewReceiptForm({ ...newReceiptForm, payerPhone: e.target.value })}
                      placeholder="(11) 98888-0000"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                    />
                  </div>
                </div>
              </div>

              {/* Detalhes do Serviço & Valores */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                  Serviço e Valores
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">Descrição do Serviço *</label>
                    <input
                      type="text"
                      required
                      value={newReceiptForm.serviceDescription}
                      onChange={e => setNewReceiptForm({ ...newReceiptForm, serviceDescription: e.target.value })}
                      placeholder="Consulta de Psicoterapia Individual"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Data da Prestação *</label>
                    <input
                      type="text"
                      required
                      value={newReceiptForm.serviceDate}
                      onChange={e => setNewReceiptForm({ ...newReceiptForm, serviceDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Valor Final Pago (R$) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newReceiptForm.finalAmount}
                      onChange={e => setNewReceiptForm({ ...newReceiptForm, finalAmount: e.target.value })}
                      placeholder="250.00"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-bold text-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Forma de Pagamento</label>
                    <select
                      value={newReceiptForm.paymentMethod}
                      onChange={e => setNewReceiptForm({ ...newReceiptForm, paymentMethod: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                    >
                      <option value="pix">PIX</option>
                      <option value="credit_card">Cartão de Crédito</option>
                      <option value="debit_card">Cartão de Débito</option>
                      <option value="cash">Dinheiro em Espécie</option>
                      <option value="bank_transfer">Transferência Bancária</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Profissional Responsável</label>
                    <input
                      type="text"
                      value={newReceiptForm.professionalName}
                      onChange={e => setNewReceiptForm({ ...newReceiptForm, professionalName: e.target.value })}
                      placeholder="Dr. Lucas Silveira"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                    />
                  </div>
                </div>
              </div>

              {/* Botões */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsIssueModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:text-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Confirmar e Emitir Recibo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL 2: Visualizador Oficial de Recibo (Impressão / PDF) */}
      {/* ========================================================== */}
      {/* ========================================================== */}
      {/* MODAL 2: Visualizador Oficial de Recibo (Impressão / PDF) */}
      {/* ========================================================== */}
      {selectedReceipt && (() => {
        const logoUrl = selectedReceipt.emitter?.logoUrl || selectedReceipt.emitter?.logo_url || currentTenant?.logo_url;
        const emitterName = selectedReceipt.emitter?.tradeName || selectedReceipt.emitter?.name || currentTenant?.trade_name || currentTenant?.name || 'Clínica Médica';
        const emitterLegalName = selectedReceipt.emitter?.name || currentTenant?.name;
        const emitterDoc = selectedReceipt.emitter?.document || selectedReceipt.emitter_document || currentTenant?.cnpj_cpf;
        const emitterBoard = selectedReceipt.emitter?.boardName;
        const emitterReg = selectedReceipt.emitter?.registryNumber;
        const emitterRegState = selectedReceipt.emitter?.registryState;
        const emitterAddress = selectedReceipt.emitter?.address || [currentTenant?.address, currentTenant?.city, currentTenant?.state].filter(Boolean).join(' - ');
        const emitterPhone = selectedReceipt.emitter?.phone || currentTenant?.phone;
        const emitterEmail = selectedReceipt.emitter?.email || currentTenant?.email;

        const finalAmountNum = Number(selectedReceipt.final_amount || 0);
        const amountFormatted = finalAmountNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const amountInWords = valorPorExtenso(finalAmountNum);

        const methodMap: Record<string, string> = {
          pix: 'PIX (Transferência Instantânea)',
          credit_card: 'Cartão de Crédito',
          debit_card: 'Cartão de Débito',
          cash: 'Dinheiro em Espécie',
          bank_transfer: 'Transferência Bancária'
        };
        const paymentMethodLabel = methodMap[selectedReceipt.payment_method] || selectedReceipt.payment_method?.toUpperCase() || 'PIX';

        const issueDate = selectedReceipt.issued_at ? new Date(selectedReceipt.issued_at) : new Date();
        const cityStr = selectedReceipt.emitter?.city || currentTenant?.city || 'Localidade';
        const stateStr = selectedReceipt.emitter?.state || currentTenant?.state || '';
        const locationStr = stateStr ? `${cityStr} - ${stateStr}` : cityStr;
        const dateFormattedLong = issueDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white">
            <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl my-8 print:my-0 print:max-w-none print:shadow-none print:rounded-none">
              {/* Barra de Ações Superior (Oculta na Impressão) */}
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-teal-400">
                    {selectedReceipt.receipt_number}
                  </span>
                  <span className="text-[11px] text-slate-400">• Recibo Oficial Quitado</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir / Salvar PDF
                  </button>
                  <button
                    onClick={() => {
                      showToast('Comprovante enviado por e-mail para o paciente com sucesso!', 'success');
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Enviar E-mail
                  </button>
                  <button
                    onClick={() => setSelectedReceipt(null)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Folha Oficial A4 do Recibo */}
              <div id="printable-receipt-sheet" className="p-8 sm:p-12 space-y-6 bg-white text-slate-800 font-sans print:p-0 print:m-0">
                {/* 1. Cabeçalho do Emitente com Logotipo */}
                <div className="flex items-start justify-between pb-6 border-b-2 border-slate-900 gap-6">
                  <div className="flex items-center gap-4">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={emitterName}
                        className="h-16 max-w-[180px] object-contain rounded-xl"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shadow-xs flex-shrink-0">
                        <Building2 className="w-8 h-8 text-slate-600" />
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
                        {emitterName}
                      </h2>
                      {emitterLegalName && emitterLegalName !== emitterName && (
                        <p className="text-xs text-slate-600 font-medium">{emitterLegalName}</p>
                      )}
                      <div className="text-[11px] text-slate-600 mt-1 space-y-0.5">
                        <p>
                          <strong>CNPJ/CPF:</strong> {emitterDoc || '—'}
                          {emitterBoard && emitterReg && ` • ${emitterBoard}: ${emitterReg}${emitterRegState ? `/${emitterRegState}` : ''}`}
                          {selectedReceipt.emitter?.municipalRegistration && ` • IM: ${selectedReceipt.emitter.municipalRegistration}`}
                        </p>
                        {emitterAddress && <p>{emitterAddress}</p>}
                        <p>
                          {emitterPhone && <span>Tel: {emitterPhone}</span>}
                          {emitterPhone && emitterEmail && <span> • </span>}
                          {emitterEmail && <span>E-mail: {emitterEmail}</span>}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="inline-block px-3.5 py-1.5 bg-slate-100 border border-slate-300 font-mono font-black text-sm rounded-xl text-slate-900">
                      {selectedReceipt.receipt_number}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Emissão: <strong>{new Date(selectedReceipt.issued_at).toLocaleDateString('pt-BR')}</strong>
                    </p>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 mt-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      PAGAMENTO QUITADO
                    </span>
                  </div>
                </div>

                {/* 2. Título & Bloco de Destaque de Valor */}
                <div className="text-center py-2 space-y-2">
                  <span className="text-xs font-black tracking-widest text-slate-400 uppercase">
                    COMPROVANTE / RECIBO DE PAGAMENTO
                  </span>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl max-w-lg mx-auto shadow-xs">
                    <span className="text-[11px] uppercase font-bold text-slate-400 block">Valor Quitado</span>
                    <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                      {amountFormatted}
                    </p>
                    <p className="text-xs font-semibold text-slate-600 italic mt-1">
                      ({amountInWords})
                    </p>
                  </div>
                </div>

                {/* 3. Texto Declaratório de Quitação */}
                <div className="p-5 bg-slate-50/70 border border-slate-200 rounded-2xl text-xs leading-relaxed text-slate-800">
                  <p>
                    Recebemos de <strong>{selectedReceipt.payer_name}</strong>
                    {selectedReceipt.payer_document && <span>, inscrito(a) sob o documento nº <strong>{selectedReceipt.payer_document}</strong></span>}
                    , a quantia supra de <strong>{amountFormatted}</strong> (<em>{amountInWords}</em>), referente à prestação do serviço de <strong>{selectedReceipt.service_description}</strong>
                    {selectedReceipt.service_date && <span>, realizado em <strong>{selectedReceipt.service_date}</strong></span>}
                    {selectedReceipt.professional_name && <span> através do(a) profissional <strong>{selectedReceipt.professional_name}</strong></span>}
                    , concedendo pelo presente instrumento a devida e irrevogável quitação da importância discriminada.
                  </p>
                </div>

                {/* 4. Quadro Estruturado: Tomador & Detalhes da Operação */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-400 uppercase text-[10px] block mb-1.5 tracking-wider">
                      Dados do Paciente / Tomador
                    </span>
                    <p className="text-slate-900 font-bold text-sm">{selectedReceipt.payer_name}</p>
                    <p className="text-slate-600">
                      <strong>Documento:</strong> <span className="font-mono">{selectedReceipt.payer_document || 'Não informado'}</span>
                    </p>
                    {selectedReceipt.payer_phone && (
                      <p className="text-slate-600"><strong>Telefone:</strong> {selectedReceipt.payer_phone}</p>
                    )}
                    {selectedReceipt.payer_address && (
                      <p className="text-slate-600"><strong>Endereço:</strong> {selectedReceipt.payer_address}</p>
                    )}
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-400 uppercase text-[10px] block mb-1.5 tracking-wider">
                      Detalhes do Serviço & Transação
                    </span>
                    <p className="text-slate-800">
                      <strong>Serviço:</strong> {selectedReceipt.service_description}
                    </p>
                    <p className="text-slate-800">
                      <strong>Forma de Pagamento:</strong> <span className="font-semibold">{paymentMethodLabel}</span>
                    </p>
                    <p className="text-slate-800">
                      <strong>Data do Atendimento:</strong> {selectedReceipt.service_date || new Date().toLocaleDateString('pt-BR')}
                    </p>
                    <p className="text-slate-800">
                      <strong>Status:</strong> <span className="font-bold text-emerald-700">Quitado</span>
                    </p>
                  </div>
                </div>

                {/* 5. Localidade e Data por Extenso */}
                <div className="text-right text-xs text-slate-600 pt-4">
                  {locationStr}, {dateFormattedLong}.
                </div>

                {/* 6. Linha e Bloco de Assinatura */}
                <div className="pt-10 pb-4 text-center page-break-inside-avoid">
                  <div className="w-72 h-0.5 bg-slate-800 mx-auto mb-2.5" />
                  <p className="font-bold text-sm text-slate-900">
                    {selectedReceipt.professional_name || emitterLegalName || emitterName}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedReceipt.professional_specialty || 'Responsável Técnico'}
                    {selectedReceipt.professional_registry && ` • ${selectedReceipt.professional_registry}`}
                  </p>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Assinatura / Carimbo do Emitente
                  </span>
                </div>

                {/* 7. Rodapé Discreto Oficial Zemda */}
                <div className="border-t border-slate-200 pt-4 mt-8 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-400 gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Logotipo monocromático sutil */}
                    <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                    <span>Documento gerado pelo <strong>Zemda</strong> • Tecnologia para Gestão em Saúde</span>
                  </div>
                  <span>Válido para fins de comprovação fiscal e dedução no IRPF conforme legislação vigente</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
          #printable-receipt-sheet,
          #printable-receipt-sheet * {
            visibility: visible !important;
          }
          #printable-receipt-sheet {
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

      {/* ========================================================== */}
      {/* MODAL 3: Configuração de Dados para Emissão de Recibos */}
      {/* ========================================================== */}
      {isSettingsModalOpen && settings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold">Configurar Dados para Emissão de Recibos</h3>
                <p className="text-xs text-slate-400">
                  Dados cadastrais do emitente e modelo de recibo da clínica.
                </p>
              </div>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Razão Social / Nome do Emitente *</label>
                  <input
                    type="text"
                    required
                    value={settings.emitter_name}
                    onChange={e => setSettings({ ...settings, emitter_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nome Fantasia</label>
                  <input
                    type="text"
                    value={settings.emitter_trade_name}
                    onChange={e => setSettings({ ...settings, emitter_trade_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">CNPJ ou CPF do Emitente *</label>
                  <input
                    type="text"
                    required
                    value={settings.emitter_document}
                    onChange={e => setSettings({ ...settings, emitter_document: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Inscrição Municipal</label>
                  <input
                    type="text"
                    value={settings.emitter_municipal_reg || ''}
                    onChange={e => setSettings({ ...settings, emitter_municipal_reg: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Conselho Profissional</label>
                  <input
                    type="text"
                    value={settings.emitter_board_name || ''}
                    onChange={e => setSettings({ ...settings, emitter_board_name: e.target.value })}
                    placeholder="CRM, CRP, CRFa, OAB..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Número do Registro / UF</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settings.emitter_registry_number || ''}
                      onChange={e => setSettings({ ...settings, emitter_registry_number: e.target.value })}
                      placeholder="123456"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                    />
                    <input
                      type="text"
                      maxLength={2}
                      value={settings.emitter_registry_state || ''}
                      onChange={e => setSettings({ ...settings, emitter_registry_state: e.target.value.toUpperCase() })}
                      placeholder="UF"
                      className="w-14 px-2 py-2 border border-slate-200 rounded-xl bg-slate-50 text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Telefone de Contato</label>
                  <input
                    type="text"
                    value={settings.emitter_phone || ''}
                    onChange={e => setSettings({ ...settings, emitter_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={settings.emitter_email || ''}
                    onChange={e => setSettings({ ...settings, emitter_email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Prefixo dos Recibos</label>
                  <input
                    type="text"
                    value={settings.receipt_prefix || 'REC-'}
                    onChange={e => setSettings({ ...settings, receipt_prefix: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Modelo de Texto Padrão</label>
                  <textarea
                    rows={3}
                    value={settings.default_template_text}
                    onChange={e => setSettings({ ...settings, default_template_text: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:text-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Salvar Configurações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
