import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Printer,
  ArrowRightCircle,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  User,
  Truck,
  Trash2,
  Edit3,
  Calendar,
  DollarSign,
  Share2,
  X
} from 'lucide-react';
import { Budget, BudgetItem, Patient } from '../../types';
import {
  ClinicDocumentHeader,
  ClinicDocumentFooter
} from '../common/ClinicDocumentHeader';

export const BudgetsView: React.FC = () => {
  const { showToast } = useToast();
  const { clientTermLabel, currentTenant } = useAuth();

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Tabs & Filtros
  const [activeTab, setActiveTab] = useState<'patient' | 'supplier'>('patient');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  // Modais
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [printBudgetData, setPrintBudgetData] = useState<{ budget: Budget; items: BudgetItem[]; tenant: any } | null>(null);

  // Form states para novo orçamento
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [supplierContact, setSupplierContact] = useState<string>('');
  const [validityDays, setValidityDays] = useState<number>(15);
  const [notes, setNotes] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [items, setItems] = useState<Array<{ description: string; quantity: number; unitPrice: number }>>([
    { description: '', quantity: 1, unitPrice: 0 }
  ]);
  const [saving, setSaving] = useState<boolean>(false);

  const fetchPatients = async () => {
    try {
      const pts = await ApiClient.get<Patient[]>('/v1/patients');
      setPatients(pts);
      if (pts.length > 0 && !selectedPatientId) setSelectedPatientId(pts[0].id);
    } catch (e) {
      console.warn('Erro ao carregar pacientes:', e);
    }
  };

  const fetchBudgets = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('budgetType', activeTab);
      if (filterStatus) params.append('status', filterStatus);
      if (search) params.append('search', search);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const data = await ApiClient.get<Budget[]>(`/v1/budgets${qs}`);
      setBudgets(data);
    } catch (err: any) {
      showToast('Erro ao carregar orçamentos', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [activeTab, filterStatus]);

  const handleAddItemRow = () => {
    setItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveItemRow = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: 'description' | 'quantity' | 'unitPrice', value: any) => {
    setItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  };

  const calculateTotal = () => {
    return Math.max(0, calculateSubtotal() - (Number(discount) || 0));
  };

  const handleCreateBudget = async () => {
    const validItems = items.filter(it => it.description.trim() && it.quantity > 0);
    if (validItems.length === 0) {
      showToast('Adicione pelo menos um item com descrição e valor', 'error');
      return;
    }

    if (activeTab === 'patient' && !selectedPatientId) {
      showToast('Selecione um paciente para o orçamento', 'error');
      return;
    }

    if (activeTab === 'supplier' && !supplierName.trim()) {
      showToast('Informe o nome do fornecedor', 'error');
      return;
    }

    try {
      setSaving(true);
      const validityDate = new Date();
      validityDate.setDate(validityDate.getDate() + (Number(validityDays) || 15));
      const validityDateStr = validityDate.toISOString().split('T')[0];

      await ApiClient.post('/v1/budgets', {
        budgetType: activeTab,
        patientId: activeTab === 'patient' ? selectedPatientId : null,
        supplierName: activeTab === 'supplier' ? supplierName.trim() : null,
        supplierContact: activeTab === 'supplier' ? supplierContact.trim() : null,
        discount: Number(discount) || 0,
        validityDate: validityDateStr,
        notes: notes.trim() || null,
        items: validItems.map(it => ({
          description: it.description.trim(),
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice)
        }))
      });

      showToast('Orçamento gerado com sucesso!', 'success');
      setShowNewModal(false);
      setSupplierName('');
      setSupplierContact('');
      setNotes('');
      setDiscount(0);
      setItems([{ description: '', quantity: 1, unitPrice: 0 }]);
      fetchBudgets();
    } catch (err: any) {
      showToast(err.message || 'Erro ao criar orçamento', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToInventory = async (budgetId: string) => {
    if (!confirm('Deseja aprovar este orçamento e dar entrada automática de todos os itens no estoque da clínica?')) return;
    try {
      const res = await ApiClient.post<{ message: string }>(`/v1/budgets/${budgetId}/convert-to-inventory`);
      showToast(res.message || 'Itens convertidos em entrada de estoque com sucesso!', 'success');
      fetchBudgets();
    } catch (err: any) {
      showToast(err.message || 'Erro ao converter orçamento para o estoque', 'error');
    }
  };

  const handleOpenPrintView = async (budgetId: string) => {
    try {
      const data = await ApiClient.get<{ budget: Budget; items: BudgetItem[]; tenant: any }>(
        `/v1/budgets/${budgetId}`
      );
      setPrintBudgetData(data);
    } catch (err: any) {
      showToast('Erro ao carregar dados para impressão', 'error');
    }
  };

  const handleChangeStatus = async (budgetId: string, newStatus: string) => {
    try {
      await ApiClient.patch(`/v1/budgets/${budgetId}/status`, { status: newStatus });
      showToast('Status atualizado!', 'success');
      fetchBudgets();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar status', 'error');
    }
  };

  const handleDeleteBudget = async (id: string) => {
    if (!confirm('Deseja realmente excluir este orçamento?')) return;
    try {
      await ApiClient.delete(`/v1/budgets/${id}`);
      showToast('Orçamento excluído!', 'success');
      fetchBudgets();
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir orçamento', 'error');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">Aprovado</span>;
      case 'sent':
        return <span className="bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">Enviado</span>;
      case 'rejected':
        return <span className="bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">Recusado</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold">Rascunho</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Orçamentos & Propostas</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gere propostas para {clientTermLabel.toLowerCase()}s com impressão em folha A4 e controle orçamentos de insumos com conversão direta em estoque.
          </p>
        </div>

        <button
          onClick={() => {
            setItems([{ description: '', quantity: 1, unitPrice: 0 }]);
            setDiscount(0);
            setNotes('');
            setShowNewModal(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer text-xs self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          {activeTab === 'patient' ? `Novo Orçamento de ${clientTermLabel}` : 'Novo Orçamento de Insumos'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('patient')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'patient'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <User className="w-4 h-4" />
          Orçamentos de {clientTermLabel}s
        </button>
        <button
          onClick={() => setActiveTab('supplier')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'supplier'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Truck className="w-4 h-4" />
          Orçamentos de Fornecedores / Insumos
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchBudgets()}
            placeholder={activeTab === 'patient' ? `Buscar por número ou ${clientTermLabel.toLowerCase()}...` : 'Buscar por fornecedor ou número...'}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium text-slate-700"
        >
          <option value="">Todos os Status</option>
          <option value="draft">Rascunho</option>
          <option value="sent">Enviado</option>
          <option value="approved">Aprovado</option>
          <option value="rejected">Recusado</option>
        </select>
      </div>

      {/* Lista de Orçamentos */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Carregando orçamentos...</div>
        ) : budgets.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            Nenhum orçamento encontrado nesta categoria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-4">Identificador</th>
                  <th className="p-4">{activeTab === 'patient' ? clientTermLabel : 'Fornecedor'}</th>
                  <th className="p-4">Data Emissão</th>
                  <th className="p-4">Validade</th>
                  <th className="p-4">Valor Total</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {budgets.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50/50 transition-all">
                    <td className="p-4 font-bold text-slate-900">
                      {b.budget_number}
                    </td>

                    <td className="p-4 font-semibold text-slate-800">
                      {activeTab === 'patient' ? b.patient_name || 'Paciente' : b.supplier_name || 'Fornecedor'}
                    </td>

                    <td className="p-4 text-slate-500">
                      {new Date(b.created_at).toLocaleDateString('pt-BR')}
                    </td>

                    <td className="p-4 text-slate-500">
                      {b.validity_date ? new Date(b.validity_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>

                    <td className="p-4 font-bold text-slate-900 text-sm">
                      {Number(b.total_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>

                    <td className="p-4">
                      {b.converted_to_inventory ? (
                        <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3" /> Convertido em Estoque
                        </span>
                      ) : (
                        getStatusBadge(b.status)
                      )}
                    </td>

                    <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                      {/* Ação de impressão A4 (para paciente) */}
                      {activeTab === 'patient' && (
                        <button
                          onClick={() => handleOpenPrintView(b.id)}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-[11px] transition-all cursor-pointer inline-flex items-center gap-1"
                          title="Visualizar e Imprimir Formato A4"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Imprimir A4
                        </button>
                      )}

                      {/* Conversão em Estoque (para fornecedor) */}
                      {activeTab === 'supplier' && !b.converted_to_inventory && (
                        <button
                          onClick={() => handleConvertToInventory(b.id)}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-[11px] transition-all cursor-pointer inline-flex items-center gap-1"
                          title="Converter itens em entrada no estoque"
                        >
                          <ArrowRightCircle className="w-3.5 h-3.5" />
                          Entrada em Estoque
                        </button>
                      )}

                      {/* Mudar status */}
                      <select
                        value={b.status}
                        onChange={e => handleChangeStatus(b.id, e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-[11px] bg-white font-medium text-slate-700 cursor-pointer"
                      >
                        <option value="draft">Rascunho</option>
                        <option value="sent">Enviado</option>
                        <option value="approved">Aprovado</option>
                        <option value="rejected">Recusado</option>
                      </select>

                      <button
                        onClick={() => handleDeleteBudget(b.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-all cursor-pointer"
                        title="Excluir orçamento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Novo Orçamento */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {activeTab === 'patient' ? `Novo Orçamento de ${clientTermLabel}` : 'Novo Orçamento de Insumos / Fornecedor'}
              </h3>
              <button onClick={() => setShowNewModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              {activeTab === 'patient' ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{clientTermLabel} *</label>
                  <select
                    value={selectedPatientId}
                    onChange={e => setSelectedPatientId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
                  >
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name} {p.cpf ? `• CPF: ${p.cpf}` : ''}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Fornecedor / Distribuidor *</label>
                    <input
                      type="text"
                      value={supplierName}
                      onChange={e => setSupplierName(e.target.value)}
                      placeholder="Ex: Dental Cremer"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Contato / Vendedor</label>
                    <input
                      type="text"
                      value={supplierContact}
                      onChange={e => setSupplierContact(e.target.value)}
                      placeholder="Ex: Carlos (11) 98888-0000"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Tabela de Itens */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">Itens / Procedimentos Orçados</label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Linha
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[10px]">
                      <tr>
                        <th className="p-2.5">Descrição do Item / Procedimento</th>
                        <th className="p-2.5 w-20">Qtd</th>
                        <th className="p-2.5 w-28">Valor Unit. (R$)</th>
                        <th className="p-2.5 w-28">Subtotal</th>
                        <th className="p-2.5 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((it, idx) => {
                        const lineTotal = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
                        return (
                          <tr key={idx}>
                            <td className="p-2">
                              <input
                                type="text"
                                value={it.description}
                                onChange={e => handleItemChange(idx, 'description', e.target.value)}
                                placeholder="Ex: Consulta especializada, Aplicação toxina botulínica..."
                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min={1}
                                value={it.quantity}
                                onChange={e => handleItemChange(idx, 'quantity', Number(e.target.value))}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={it.unitPrice}
                                onChange={e => handleItemChange(idx, 'unitPrice', Number(e.target.value))}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs"
                              />
                            </td>
                            <td className="p-2 font-bold text-slate-800">
                              {lineTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="p-2 text-center">
                              {items.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItemRow(idx)}
                                  className="text-slate-300 hover:text-rose-600 transition-all cursor-pointer"
                                >
                                  ✕
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totais e Desconto */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Validade da Proposta</label>
                    <select
                      value={validityDays}
                      onChange={e => setValidityDays(Number(e.target.value))}
                      className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-xs"
                    >
                      <option value={7}>7 dias</option>
                      <option value={15}>15 dias</option>
                      <option value={30}>30 dias</option>
                      <option value={60}>60 dias</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Desconto Geral (R$)</label>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={discount}
                      onChange={e => setDiscount(Number(e.target.value))}
                      className="border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-xs w-28 font-medium"
                    />
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] text-slate-500">
                    Subtotal: {calculateSubtotal().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                  <div className="text-base font-bold text-indigo-700 mt-0.5">
                    Total: {calculateTotal().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações / Formas de Pagamento Aceitas</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ex: Em até 6x no cartão de crédito sem juros ou 5% à vista no PIX..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateBudget}
                  disabled={saving}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {saving ? 'Gerando...' : 'Gerar Orçamento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Visualização e Impressão Formato A4 */}
      {printBudgetData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-8 shadow-2xl border border-slate-200 my-auto print:border-0 print:shadow-none print:m-0 print:max-w-none print:w-full">
            {/* Barra de controle na tela (oculta na impressão) */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-600" />
                <span className="font-bold text-slate-900 text-sm">Visualização de Impressão A4</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  disabled={!printBudgetData.tenant?.name && !currentTenant?.name}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs shadow-xs transition-all cursor-pointer"
                  title={!printBudgetData.tenant?.name && !currentTenant?.name ? 'Dados da clínica emissora não carregados' : 'Imprimir / Salvar PDF'}
                >
                  <Printer className="w-4 h-4" />
                  Imprimir / Salvar PDF
                </button>
                <button
                  onClick={() => setPrintBudgetData(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Documento A4 Timbrado */}
            <div className="space-y-6 text-slate-800 text-xs font-sans">
              {/* Cabeçalho Oficial da Clínica */}
              <ClinicDocumentHeader
                clinic={printBudgetData.tenant || currentTenant}
                documentTitle="ORÇAMENTO"
                documentNumber={printBudgetData.budget.budget_number}
                documentDate={new Date(printBudgetData.budget.created_at).toLocaleDateString('pt-BR')}
                documentSubtitle="Proposta Comercial e Orçamento de Tratamento"
              />

              {/* Dados do Paciente */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">Paciente:</span>
                  <p className="font-bold text-slate-900 text-sm">{printBudgetData.budget.patient_name || 'Paciente'}</p>
                </div>
                {printBudgetData.budget.patient_cpf && (
                  <div>
                    <span className="text-slate-500">CPF:</span>
                    <p className="font-semibold text-slate-800">{printBudgetData.budget.patient_cpf}</p>
                  </div>
                )}
                {printBudgetData.budget.validity_date && (
                  <div>
                    <span className="text-slate-500">Validade da Proposta:</span>
                    <p className="font-semibold text-slate-800">
                      {new Date(printBudgetData.budget.validity_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                )}
              </div>

              {/* Tabela de Itens */}
              <div className="border border-slate-300 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Procedimento / Especificação</th>
                      <th className="p-3 text-center w-16">Qtd</th>
                      <th className="p-3 text-right w-28">Valor Unit.</th>
                      <th className="p-3 text-right w-28">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {printBudgetData.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-3 font-medium text-slate-800">{it.description}</td>
                        <td className="p-3 text-center">{it.quantity}</td>
                        <td className="p-3 text-right text-slate-600">
                          {Number(it.unit_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-900">
                          {Number(it.total_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-semibold text-xs">
                    {Number(printBudgetData.budget.discount) > 0 && (
                      <tr>
                        <td colSpan={3} className="p-2 text-right text-slate-500">Desconto Concedido:</td>
                        <td className="p-2 text-right text-rose-600 font-bold">
                          - {Number(printBudgetData.budget.discount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={3} className="p-3 text-right text-sm font-bold text-slate-900 uppercase">
                        Valor Total da Proposta:
                      </td>
                      <td className="p-3 text-right text-base font-black text-indigo-700">
                        {Number(printBudgetData.budget.total_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Observações e Condições */}
              {printBudgetData.budget.notes && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
                  <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                    Condições Comerciais & Pagamento:
                  </span>
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{printBudgetData.budget.notes}</p>
                </div>
              )}

              {/* Assinatura */}
              <div className="pt-12 grid grid-cols-2 gap-8 text-center">
                <div className="border-t border-slate-400 pt-2">
                  <p className="font-bold text-slate-800">{printBudgetData.tenant?.trade_name || printBudgetData.tenant?.name || currentTenant?.trade_name || currentTenant?.name || 'Responsável da Clínica'}</p>
                  <p className="text-[10px] text-slate-400">Assinatura / Carimbo</p>
                </div>
                <div className="border-t border-slate-400 pt-2">
                  <p className="font-bold text-slate-800">{printBudgetData.budget.patient_name || 'Paciente / Responsável'}</p>
                  <p className="text-[10px] text-slate-400">De acordo com o orçamento</p>
                </div>
              </div>

              {/* Rodapé Oficial do Sistema */}
              <ClinicDocumentFooter />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default BudgetsView;
