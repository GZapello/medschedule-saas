import { ResponsiveTable } from '../common/ResponsiveTable';
import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  Sliders,
  History,
  Edit3,
  Trash2,
  Filter,
  CheckCircle2,
  Boxes,
  Truck,
  ShieldAlert,
  FileUp,
  FileText,
  Check,
  Layers,
  AlertCircle
} from 'lucide-react';
import { InventoryItem, InventoryMovement } from '../../types';

export const InventoryView: React.FC = () => {
  const { showToast } = useToast();
  const { isClinicAdmin, isReceptionist, hasPermission, canAccessInventory } = useAuth();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [metrics, setMetrics] = useState({ total: 0, lowStock: 0, zeroStock: 0, expiringSoon: 0 });
  const [loading, setLoading] = useState<boolean>(true);

  // Importação Inteligente de Nota Fiscal
  const invoiceFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const invoiceAbortControllerRef = React.useRef<AbortController | null>(null);
  const [isParsingInvoice, setIsParsingInvoice] = useState<boolean>(false);
  const [isConfirmingInvoice, setIsConfirmingInvoice] = useState<boolean>(false);
  const [showInvoiceConferenceModal, setShowInvoiceConferenceModal] = useState<boolean>(false);
  const [invoiceData, setInvoiceData] = useState<{
    invoiceInfo: any;
    items: Array<any>;
  } | null>(null);

  const cancelInvoiceUpload = () => {
    if (invoiceAbortControllerRef.current) {
      invoiceAbortControllerRef.current.abort();
      invoiceAbortControllerRef.current = null;
    }
    setIsParsingInvoice(false);
    if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = '';
    showToast('Processamento da nota fiscal cancelado.', 'info');
  };

  // Tabs & Filtros
  const [activeTab, setActiveTab] = useState<'items' | 'history'>('items');
  const [search, setSearch] = useState<string>('');
  const [filterAlert, setFilterAlert] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');

  // Modais
  const [showItemModal, setShowItemModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);

  // Form states do Item
  const [itemName, setItemName] = useState<string>('');
  const [itemCategory, setItemCategory] = useState<string>('insumo');
  const [itemBrand, setItemBrand] = useState<string>('');
  const [itemPresentation, setItemPresentation] = useState<string>('unidade');
  const [itemQuantity, setItemQuantity] = useState<number>(0);
  const [itemUnit, setItemUnit] = useState<string>('un');
  const [itemMinStock, setItemMinStock] = useState<number>(5);
  const [itemUnitCost, setItemUnitCost] = useState<number>(0);
  const [itemSupplier, setItemSupplier] = useState<string>('');
  const [itemBatch, setItemBatch] = useState<string>('');
  const [itemExpiration, setItemExpiration] = useState<string>('');
  const [itemNotes, setItemNotes] = useState<string>('');
  const [savingItem, setSavingItem] = useState<boolean>(false);

  // Form states da Movimentação
  const [movementType, setMovementType] = useState<'in' | 'out' | 'adjustment'>('in');
  const [movementQty, setMovementQty] = useState<number>(1);
  const [movementReason, setMovementReason] = useState<string>('');
  const [movementDoc, setMovementDoc] = useState<string>('');
  const [savingMovement, setSavingMovement] = useState<boolean>(false);

  // Restrição de acesso
  const isAuthorized = Boolean(canAccessInventory || isClinicAdmin || isReceptionist || hasPermission('manage_inventory') || hasPermission('view_inventory'));
  if (!isAuthorized) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs text-center space-y-3 max-w-md mx-auto my-12">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-full w-fit mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Acesso Restrito</h3>
        <p className="text-xs text-slate-500">
          O módulo de controle de estoque de insumos e produtos é reservado exclusivamente para os administradores da clínica.
        </p>
      </div>
    );
  }

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (filterAlert) params.append('filterAlert', filterAlert);
      if (filterCategory) params.append('category', filterCategory);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await ApiClient.get<{ items: InventoryItem[]; metrics: any; totalItems: number }>(`/v1/inventory${qs}`);
      setItems(res.items || []);
      setMetrics(res.metrics || { total: 0, lowStock: 0, zeroStock: 0, expiringSoon: 0 });
    } catch (err: any) {
      showToast('Erro ao carregar estoque', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchMovements = async (itemId?: string) => {
    try {
      const qs = itemId ? `?itemId=${itemId}` : '';
      const data = await ApiClient.get<InventoryMovement[]>(`/v1/inventory/movements${qs}`);
      setMovements(data);
    } catch (err: any) {
      console.warn('Erro ao carregar histórico de movimentações:', err);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [filterAlert, filterCategory]);

  useEffect(() => {
    const handleInventoryUpdate = () => {
      fetchInventory();
      if (activeTab === 'history') {
        fetchMovements();
      }
    };
    window.addEventListener('zemda-inventory-updated', handleInventoryUpdate);
    return () => window.removeEventListener('zemda-inventory-updated', handleInventoryUpdate);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchMovements();
    }
  }, [activeTab]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInventory();
  };

  const handleSaveItem = async () => {
    if (!itemName.trim()) {
      showToast('Nome do produto/insumo é obrigatório', 'error');
      return;
    }
    try {
      setSavingItem(true);
      const payload = {
        name: itemName.trim(),
        category: itemCategory,
        brand: itemBrand.trim() || null,
        presentation: itemPresentation,
        quantity: itemQuantity,
        unit: itemUnit,
        minStock: Number(itemMinStock),
        unitCost: Number(itemUnitCost),
        supplier: itemSupplier.trim() || null,
        batchNumber: itemBatch.trim() || null,
        expirationDate: itemExpiration || null,
        notes: itemNotes.trim() || null
      };

      if (editingItem) {
        await ApiClient.put(`/v1/inventory/${editingItem.id}`, payload);
        showToast('Item de estoque atualizado!', 'success');
      } else {
        await ApiClient.post('/v1/inventory', payload);
        showToast('Item cadastrado no estoque com sucesso!', 'success');
      }

      setShowItemModal(false);
      setEditingItem(null);
      fetchInventory();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar item', 'error');
    } finally {
      setSavingItem(false);
    }
  };

  const handleSaveMovement = async () => {
    if (!movementItem || movementQty <= 0) {
      showToast('Informe uma quantidade válida para a movimentação', 'error');
      return;
    }
    try {
      setSavingMovement(true);
      await ApiClient.post('/v1/inventory/movements', {
        itemId: movementItem.id,
        movementType,
        quantity: movementQty,
        reason: movementReason.trim() || null,
        documentReference: movementDoc.trim() || null
      });

      showToast('Movimentação de estoque registrada!', 'success');
      setMovementItem(null);
      setMovementQty(1);
      setMovementReason('');
      setMovementDoc('');
      fetchInventory();
      if (activeTab === 'history') fetchMovements();
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar movimentação', 'error');
    } finally {
      setSavingMovement(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Deseja realmente desativar este item do estoque?')) return;
    try {
      await ApiClient.delete(`/v1/inventory/${id}`);
      showToast('Item removido do estoque!', 'success');
      fetchInventory();
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir item', 'error');
    }
  };

  const openNewModal = () => {
    setEditingItem(null);
    setItemName('');
    setItemCategory('insumo');
    setItemBrand('');
    setItemPresentation('unidade');
    setItemQuantity(0);
    setItemUnit('un');
    setItemMinStock(5);
    setItemUnitCost(0);
    setItemSupplier('');
    setItemBatch('');
    setItemExpiration('');
    setItemNotes('');
    setShowItemModal(true);
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemCategory(item.category || 'insumo');
    setItemBrand(item.brand || '');
    setItemPresentation(item.presentation || 'unidade');
    setItemQuantity(item.quantity);
    setItemUnit(item.unit || 'un');
    setItemMinStock(item.min_stock || 5);
    setItemUnitCost(item.unit_cost || 0);
    setItemSupplier(item.supplier || '');
    setItemBatch(item.batch_number || '');
    setItemExpiration(item.expiration_date || '');
    setItemNotes(item.notes || '');
    setShowItemModal(true);
  };

  const handleInvoiceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Cancela requisição anterior se houver
    if (invoiceAbortControllerRef.current) {
      invoiceAbortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    invoiceAbortControllerRef.current = abortController;

    // Timeout de segurança no cliente (45 segundos)
    const timeoutId = setTimeout(() => {
      if (invoiceAbortControllerRef.current === abortController) {
        abortController.abort();
        setIsParsingInvoice(false);
        showToast('Tempo limite excedido ao processar a nota fiscal. Tente novamente ou use o arquivo XML.', 'error');
      }
    }, 45000);

    try {
      setIsParsingInvoice(true);
      showToast('Processando nota fiscal em memória...', 'info');

      const reader = new FileReader();

      reader.onerror = () => {
        clearTimeout(timeoutId);
        setIsParsingInvoice(false);
        if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = '';
        showToast('Erro ao ler arquivo da nota fiscal.', 'error');
      };

      reader.onabort = () => {
        clearTimeout(timeoutId);
        setIsParsingInvoice(false);
        if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = '';
      };

      reader.onload = async () => {
        try {
          const base64Content = (reader.result as string).split(',')[1];
          const res = await ApiClient.post<any>('/v1/inventory/invoices/parse', {
            fileBase64: base64Content,
            fileName: file.name,
            mimeType: file.type
          }, { signal: abortController.signal });

          if (!res.items || res.items.length === 0) {
            showToast('Nenhum item foi detectado na nota fiscal.', 'error');
            return;
          }

          setInvoiceData(res);
          setShowInvoiceConferenceModal(true);
          showToast(`${res.items.length} itens detectados para conferência!`, 'success');
        } catch (err: any) {
          if (err.name === 'AbortError' || abortController.signal.aborted) {
            return;
          }
          showToast(err.message || 'Erro ao processar arquivo da nota fiscal', 'error');
        } finally {
          clearTimeout(timeoutId);
          setIsParsingInvoice(false);
          invoiceAbortControllerRef.current = null;
          if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      clearTimeout(timeoutId);
      setIsParsingInvoice(false);
      invoiceAbortControllerRef.current = null;
      showToast('Erro ao ler arquivo da nota fiscal', 'error');
    }
  };

  const handleConfirmInvoiceImport = async () => {
    if (!invoiceData || !invoiceData.items) return;
    try {
      setIsConfirmingInvoice(true);
      const res = await ApiClient.post<any>('/v1/inventory/invoices/confirm', {
        invoiceInfo: invoiceData.invoiceInfo,
        items: invoiceData.items
      });
      showToast(res.message || 'Itens importados com sucesso para o estoque!', 'success');
      setShowInvoiceConferenceModal(false);
      setInvoiceData(null);
      fetchInventory();
    } catch (err: any) {
      showToast(err.message || 'Erro ao confirmar importação da nota fiscal', 'error');
    } finally {
      setIsConfirmingInvoice(false);
    }
  };

  const updateInvoiceItemField = (index: number, field: string, value: any) => {
    if (!invoiceData) return;
    const updated = [...invoiceData.items];
    updated[index] = { ...updated[index], [field]: value };
    setInvoiceData({ ...invoiceData, items: updated });
  };

  const applyPackConversion = (index: number, multiplier: number) => {
    if (!invoiceData) return;
    const updated = [...invoiceData.items];
    const it = updated[index];
    const newQty = (it.quantity || 1) * multiplier;
    const newCost = it.unitCost ? Number((it.unitCost / multiplier).toFixed(4)) : 0;
    updated[index] = {
      ...it,
      quantity: newQty,
      unit: 'UN',
      unitCost: newCost,
      packMultiplier: undefined
    };
    setInvoiceData({ ...invoiceData, items: updated });
    showToast(`Convertido para ${newQty} unidades com custo unitário recalculado (R$ ${newCost.toFixed(2)})`, 'info');
  };

  return (
    <div data-tour-loading={loading} className="space-y-6">
      {/* Input de arquivo oculto para importação de NF */}
      <input
        type="file"
        ref={invoiceFileInputRef}
        onChange={handleInvoiceFileUpload}
        accept=".xml,.pdf,image/*"
        className="hidden"
      />

      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Package className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Estoque de Insumos & Produtos</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gestão precisa de suprimentos clínicos, materiais descartáveis, medicamentos, lotes e validade com alertas em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <button
            onClick={() => {
              if (isParsingInvoice) {
                cancelInvoiceUpload();
              } else {
                invoiceFileInputRef.current?.click();
              }
            }}
            className={`flex items-center gap-2 px-4 py-2.5 ${isParsingInvoice ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer text-xs`}
          >
            {isParsingInvoice ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Cancelar Processamento
              </>
            ) : (
              <>
                <FileUp className="w-4 h-4" />
                Importar Nota Fiscal
              </>
            )}
          </button>

          <button
            onClick={openNewModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer text-xs"
          >
            <Plus className="w-4 h-4" />
            Novo Item
          </button>
        </div>
      </div>

      {/* Banner de Processamento Ativo em Memória */}
      {isParsingInvoice && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <div>
              <p className="text-sm font-bold text-indigo-950">Processando nota fiscal em memória com IA...</p>
              <p className="text-xs text-indigo-700 mt-0.5">Identificando fornecedor, produtos, quantidades, lotes, validade e multiplicadores. Nenhum arquivo é salvo em disco (Zero Retention).</p>
            </div>
          </div>
          <button
            type="button"
            onClick={cancelInvoiceUpload}
            className="px-3 py-1.5 bg-white border border-indigo-300 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 text-xs font-semibold text-slate-700 rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Cards de Alertas de Estoque */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div
          onClick={() => setFilterAlert('')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            filterAlert === '' ? 'bg-indigo-50/50 border-indigo-300 shadow-2xs' : 'bg-white border-slate-200 shadow-2xs hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">Total de Itens</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{metrics.total}</h3>
            </div>
            <div className="p-3 bg-slate-100 text-slate-600 rounded-xl">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div
          onClick={() => setFilterAlert(filterAlert === 'low' ? '' : 'low')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            filterAlert === 'low' ? 'bg-amber-100/50 border-amber-400 shadow-2xs' : 'bg-white border-slate-200 shadow-2xs hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">Estoque Baixo</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">{metrics.lowStock}</h3>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div
          onClick={() => setFilterAlert(filterAlert === 'zero' ? '' : 'zero')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            filterAlert === 'zero' ? 'bg-rose-100/50 border-rose-400 shadow-2xs' : 'bg-white border-slate-200 shadow-2xs hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">Estoque Zerado</p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1">{metrics.zeroStock}</h3>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div
          onClick={() => setFilterAlert(filterAlert === 'expiring' ? '' : 'expiring')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            filterAlert === 'expiring' ? 'bg-orange-100/50 border-orange-400 shadow-2xs' : 'bg-white border-slate-200 shadow-2xs hover:border-orange-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">Validade Próxima</p>
              <h3 className="text-2xl font-bold text-orange-600 mt-1">{metrics.expiringSoon}</h3>
            </div>
            <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('items')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'items'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4" />
          Itens de Estoque ({items.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'history'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          Histórico de Movimentações
        </button>
      </div>

      {activeTab === 'items' ? (
        <div className="space-y-4">
          {/* Barra de Filtros */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
            <form onSubmit={handleSearchSubmit} className="flex-1 min-w-0 lg:min-w-[200px] relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome, marca, fornecedor ou lote..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </form>

            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium text-slate-700"
            >
              <option value="">Todas as Categorias</option>
              <option value="insumo">Insumo Descartável</option>
              <option value="medicamento">Medicamento / Farmácia</option>
              <option value="odontologico">Material Odontológico</option>
              <option value="equipamento">Equipamento / Instrumental</option>
              <option value="escritorio">Escritório & Geral</option>
            </select>
          </div>

          {/* Tabela de Itens */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Carregando itens de estoque...</div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                Nenhum item de estoque encontrado.
              </div>
            ) : (
              <div className="overflow-x-auto mobile-table-container">
                <ResponsiveTable className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="p-4">Item / Apresentação</th>
                      <th className="p-4">Lote & Validade</th>
                      <th className="p-4">Saldo em Estoque</th>
                      <th className="p-4">Estoque Mínimo</th>
                      <th className="p-4">Custo Unitário</th>
                      <th className="p-4">Fornecedor</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map(item => {
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-all">
                          <td className="p-4">
                            <div className="font-bold text-slate-900">{item.name}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {item.brand ? `${item.brand} • ` : ''}
                              {item.presentation || 'Unidade'}
                            </div>
                          </td>

                          <td className="p-4">
                            <div className="font-medium text-slate-700">Lote: {item.batch_number || 'S/L'}</div>
                            {item.expiration_date ? (
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className={`text-[10px] font-semibold ${
                                  item.is_expired ? 'text-rose-600 font-bold' : item.is_expiring_soon ? 'text-amber-600 font-bold' : 'text-slate-500'
                                }`}>
                                  Val: {new Date(item.expiration_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </span>
                                {item.is_expired && (
                                  <span className="bg-rose-100 text-rose-700 text-[8px] font-bold px-1 rounded">VENCIDO</span>
                                )}
                                {!item.is_expired && item.is_expiring_soon && (
                                  <span className="bg-amber-100 text-amber-700 text-[8px] font-bold px-1 rounded">&lt;30d</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">Sem validade</span>
                            )}
                          </td>

                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${
                                item.is_zero_stock ? 'text-rose-600' : item.is_low_stock ? 'text-amber-600' : 'text-slate-900'
                              }`}>
                                {item.quantity} {item.unit || 'un'}
                              </span>
                              {item.is_zero_stock ? (
                                <span className="bg-rose-100 text-rose-700 text-[9px] font-bold px-1.5 py-0.5 rounded">
                                  Zerado
                                </span>
                              ) : item.is_low_stock ? (
                                <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded">
                                  Baixo
                                </span>
                              ) : null}
                            </div>
                          </td>

                          <td className="p-4 text-slate-600 font-medium">
                            {item.min_stock || 0} {item.unit || 'un'}
                          </td>

                          <td className="p-4 font-semibold text-slate-800">
                            {Number(item.unit_cost || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>

                          <td className="p-4 text-slate-500">
                            {item.supplier || '—'}
                          </td>

                          <td className="p-4 text-right space-x-1.5">
                            <button
                              onClick={() => {
                                setMovementItem(item);
                                setMovementType('in');
                                setMovementQty(1);
                                setMovementReason('');
                                setMovementDoc('');
                              }}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-[11px] transition-all cursor-pointer"
                              title="Lançar movimentação"
                            >
                              Movimentar
                            </button>
                            <button
                              onClick={() => openEditModal(item)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                              title="Editar"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </ResponsiveTable>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Tab Histórico de Movimentações */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {movements.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Nenhuma movimentação registrada no estoque.
            </div>
          ) : (
            <div className="overflow-x-auto mobile-table-container">
              <ResponsiveTable className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="p-4">Data / Hora</th>
                    <th className="p-4">Item / Lote</th>
                    <th className="p-4">Tipo</th>
                    <th className="p-4">Qtd</th>
                    <th className="p-4">Saldo Anterior → Novo</th>
                    <th className="p-4">Origem / Paciente</th>
                    <th className="p-4">Motivo / Justificativa</th>
                    <th className="p-4">Responsável</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.map(m => {
                    const isIn = m.movement_type === 'in';
                    const isOut = m.movement_type === 'out';

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50 transition-all">
                        <td className="p-4 text-slate-500">
                          {new Date(m.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-4 font-bold text-slate-900">
                          <div>{m.item_name}</div>
                          {m.batch && (
                            <div className="text-[10px] font-normal text-slate-500">Lote: {m.batch}</div>
                          )}
                        </td>
                        <td className="p-4">
                          {isIn ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                              <ArrowUpRight className="w-3 h-3" /> Entrada
                            </span>
                          ) : isOut ? (
                            <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                              <ArrowDownRight className="w-3 h-3" /> Saída
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                              <Sliders className="w-3 h-3" /> Ajuste
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-bold text-slate-800">
                          {isIn ? `+${m.quantity}` : isOut ? `-${m.quantity}` : m.quantity} {m.unit || 'un'}
                        </td>
                        <td className="p-4 text-slate-600 font-medium">
                          {m.previous_quantity} → <strong className="text-slate-900">{m.new_quantity}</strong>
                        </td>
                        <td className="p-4">
                          {m.module_type ? (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              m.module_type === 'ZemdaOdonto'
                                ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                                : m.module_type === 'ZemdaEstetic'
                                ? 'bg-purple-50 text-purple-800 border-purple-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}>
                              {m.module_type}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Manual</span>
                          )}
                          {m.patient_name && (
                            <div className="text-[11px] text-slate-700 font-medium mt-0.5 truncate max-w-[150px]" title={m.patient_name}>
                              Pac: {m.patient_name}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-slate-600">
                          {m.reason || '—'}
                          {m.document_reference && (
                            <span className="text-[10px] text-slate-400 block">Doc/NF: {m.document_reference}</span>
                          )}
                        </td>
                        <td className="p-4 text-slate-500">{m.user_name || m.professional_name || 'Sistema'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </ResponsiveTable>
            </div>
          )}
        </div>
      )}

      {/* Modal Item (Novo ou Edição) */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editingItem ? 'Editar Item de Estoque' : 'Cadastrar Item no Estoque'}
              </h3>
              <button onClick={() => setShowItemModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Produto / Insumo *</label>
                <input
                  type="text"
                  value={itemName}
                  onChange={e => setItemName(e.target.value)}
                  placeholder="Ex: Luva Procedimento Nitrílica M, Agulha 30G..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoria</label>
                  <select
                    value={itemCategory}
                    onChange={e => setItemCategory(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
                  >
                    <option value="insumo">Insumo Descartável</option>
                    <option value="medicamento">Medicamento / Farmácia</option>
                    <option value="odontologico">Material Odontológico</option>
                    <option value="equipamento">Equipamento / Instrumental</option>
                    <option value="escritorio">Escritório & Geral</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Marca / Fabricante</label>
                  <input
                    type="text"
                    value={itemBrand}
                    onChange={e => setItemBrand(e.target.value)}
                    placeholder="Ex: Medix, BD, 3M"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Apresentação</label>
                  <input
                    type="text"
                    value={itemPresentation}
                    onChange={e => setItemPresentation(e.target.value)}
                    placeholder="Ex: Caixa c/ 100"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unidade Medida</label>
                  <select
                    value={itemUnit}
                    onChange={e => setItemUnit(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
                  >
                    <option value="un">un (Unidade)</option>
                    <option value="cx">cx (Caixa)</option>
                    <option value="frasco">frasco</option>
                    <option value="ampola">ampola</option>
                    <option value="ml">ml</option>
                    <option value="par">par</option>
                    <option value="pacote">pct (Pacote)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Qtd Atual {!editingItem ? '(Inicial)' : ''}</label>
                  <input
                    type="number"
                    min={0}
                    value={itemQuantity}
                    onChange={e => setItemQuantity(Number(e.target.value))}
                    disabled={Boolean(editingItem)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estoque Mínimo (Alerta)</label>
                  <input
                    type="number"
                    min={0}
                    value={itemMinStock}
                    onChange={e => setItemMinStock(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Custo Unitário (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={itemUnitCost}
                    onChange={e => setItemUnitCost(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Número do Lote</label>
                  <input
                    type="text"
                    value={itemBatch}
                    onChange={e => setItemBatch(e.target.value)}
                    placeholder="Ex: LOTE2409A"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data de Validade</label>
                  <input
                    type="date"
                    value={itemExpiration}
                    onChange={e => setItemExpiration(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fornecedor Principal</label>
                <input
                  type="text"
                  value={itemSupplier}
                  onChange={e => setItemSupplier(e.target.value)}
                  placeholder="Ex: Dental Cremer, Distribuidora Saúde Ltda"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações Internas</label>
                <textarea
                  rows={2}
                  value={itemNotes}
                  onChange={e => setItemNotes(e.target.value)}
                  placeholder="Instruções de conservação, localização na prateleira..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveItem}
                  disabled={savingItem}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {savingItem ? 'Salvando...' : 'Salvar Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Lançar Movimentação */}
      {movementItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Movimentar Estoque</h3>
              <button onClick={() => setMovementItem(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200">
                <p className="font-bold text-indigo-900">{movementItem.name}</p>
                <p className="text-indigo-700 text-[11px] mt-0.5">
                  Saldo atual: <strong>{movementItem.quantity} {movementItem.unit || 'un'}</strong>
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tipo de Movimentação *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setMovementType('in')}
                    className={`py-2 px-3 rounded-xl font-bold border transition-all ${
                      movementType === 'in'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    + Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementType('out')}
                    className={`py-2 px-3 rounded-xl font-bold border transition-all ${
                      movementType === 'out'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    - Saída
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovementType('adjustment')}
                    className={`py-2 px-3 rounded-xl font-bold border transition-all ${
                      movementType === 'adjustment'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    = Ajuste
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {movementType === 'adjustment' ? 'Novo Saldo Real Apurado *' : 'Quantidade *'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={movementQty}
                  onChange={e => setMovementQty(Number(e.target.value))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Motivo / Justificativa</label>
                <input
                  type="text"
                  value={movementReason}
                  onChange={e => setMovementReason(e.target.value)}
                  placeholder="Ex: Compra de reposição, Uso em procedimento, Perda"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Referência / Documento / NF (Opcional)</label>
                <input
                  type="text"
                  value={movementDoc}
                  onChange={e => setMovementDoc(e.target.value)}
                  placeholder="Ex: NF-e 12345"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMovementItem(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveMovement}
                  disabled={savingMovement}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50"
                >
                  {savingMovement ? 'Gravando...' : 'Confirmar Movimentação'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Conferência de Importação de Nota Fiscal */}
      {showInvoiceConferenceModal && invoiceData && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal">
          <div className="bg-white rounded-3xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <FileUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Conferência de Entrada por Nota Fiscal</h3>
                  <p className="text-xs text-slate-500">Revise os produtos identificados antes de atualizar o estoque da clínica.</p>
                </div>
              </div>
              <button
                aria-label="Fechar"
                onClick={() => setShowInvoiceConferenceModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Cabeçalho da Nota Fiscal */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-xs shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Nota Fiscal</span>
                <span className="font-extrabold text-slate-800 text-sm">
                  {invoiceData.invoiceInfo?.invoiceNumber ? `NF-e ${invoiceData.invoiceInfo.invoiceNumber}` : 'S/N (Cupom/Recibo)'}
                  {invoiceData.invoiceInfo?.series ? ` • Série ${invoiceData.invoiceInfo.series}` : ''}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Fornecedor / Emitente</span>
                <span className="font-bold text-slate-800 truncate block" title={invoiceData.invoiceInfo?.supplier?.name}>
                  {invoiceData.invoiceInfo?.supplier?.name || invoiceData.invoiceInfo?.supplier?.tradeName || 'Não identificado'}
                </span>
                {invoiceData.invoiceInfo?.supplier?.cnpj && (
                  <span className="text-[10px] text-slate-400">{invoiceData.invoiceInfo.supplier.cnpj}</span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Data de Emissão</span>
                <span className="font-bold text-slate-800">
                  {invoiceData.invoiceInfo?.issueDate ? new Date(invoiceData.invoiceInfo.issueDate).toLocaleDateString('pt-BR') : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Valor Total NF</span>
                <span className="font-extrabold text-emerald-700 text-sm">
                  R$ {(invoiceData.invoiceInfo?.totalAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Tabela de Itens para Conferência */}
            <div className="overflow-y-auto flex-1 border border-slate-200 rounded-2xl">
              <ResponsiveTable className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0 z-10">
                  <tr>
                    <th className="px-3.5 py-3 w-44">Destino / Ação</th>
                    <th className="px-3.5 py-3">Descrição do Produto / Insumo</th>
                    <th className="px-3.5 py-3 w-28">Quantidade</th>
                    <th className="px-3.5 py-3 w-20">Unidade</th>
                    <th className="px-3.5 py-3 w-28">Custo Unit. (R$)</th>
                    <th className="px-3.5 py-3 w-28">Lote</th>
                    <th className="px-3.5 py-3 w-32">Validade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {invoiceData.items.map((it, idx) => {
                    const isUpdate = it.action === 'update';
                    const isIgnore = it.action === 'ignore';
                    return (
                      <tr key={it.id || idx} className={`hover:bg-slate-50/70 transition-colors ${isIgnore ? 'opacity-40 bg-slate-50/50' : ''}`}>
                        <td className="px-3.5 py-3">
                          <select
                            value={it.action}
                            onChange={e => updateInvoiceItemField(idx, 'action', e.target.value)}
                            className={`w-full rounded-xl px-2.5 py-1.5 font-bold text-xs border ${
                              isUpdate
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : it.action === 'create'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-slate-100 border-slate-200 text-slate-500'
                            }`}
                          >
                            <option value="update">Atualizar Estoque</option>
                            <option value="create">Cadastrar Novo</option>
                            <option value="ignore">Ignorar Item</option>
                          </select>

                          {isUpdate && (
                            <div className="mt-1">
                              <select
                                value={it.matchedItemId || ''}
                                onChange={e => updateInvoiceItemField(idx, 'matchedItemId', e.target.value)}
                                className="w-full text-[11px] border border-slate-200 rounded-lg p-1 bg-white"
                              >
                                <option value="">Selecionar item existente...</option>
                                {items.map(existing => (
                                  <option key={existing.id} value={existing.id}>
                                    {existing.name} (Atual: {existing.quantity} {existing.unit})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>

                        <td className="px-3.5 py-3">
                          <input
                            type="text"
                            value={it.cleanName || it.name}
                            onChange={e => updateInvoiceItemField(idx, 'cleanName', e.target.value)}
                            disabled={isIgnore}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-900 text-xs"
                          />
                          {it.name !== it.cleanName && (
                            <span className="text-[10px] text-slate-400 block truncate mt-0.5" title={it.name}>
                              Orig: {it.name}
                            </span>
                          )}
                        </td>

                        <td className="px-3.5 py-3">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={it.quantity}
                            onChange={e => updateInvoiceItemField(idx, 'quantity', parseFloat(e.target.value) || 0)}
                            disabled={isIgnore}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                          />
                          {it.packMultiplier && it.packMultiplier > 1 && (
                            <button
                              type="button"
                              onClick={() => applyPackConversion(idx, it.packMultiplier!)}
                              className="mt-1 px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[9px] font-bold border border-indigo-200 block w-full text-center"
                              title={`Converter ${it.quantity} caixas para ${it.quantity * it.packMultiplier} unidades`}
                            >
                              Converter ({it.quantity * it.packMultiplier} UN)
                            </button>
                          )}
                        </td>

                        <td className="px-3.5 py-3">
                          <input
                            type="text"
                            value={it.unit}
                            onChange={e => updateInvoiceItemField(idx, 'unit', e.target.value.toUpperCase())}
                            disabled={isIgnore}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-center uppercase"
                          />
                        </td>

                        <td className="px-3.5 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={it.unitCost}
                            onChange={e => updateInvoiceItemField(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                            disabled={isIgnore}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                          />
                        </td>

                        <td className="px-3.5 py-3">
                          <input
                            type="text"
                            value={it.batchNumber || ''}
                            onChange={e => updateInvoiceItemField(idx, 'batchNumber', e.target.value)}
                            placeholder="Lote"
                            disabled={isIgnore}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs"
                          />
                        </td>

                        <td className="px-3.5 py-3">
                          <input
                            type="date"
                            value={it.expirationDate || ''}
                            onChange={e => updateInvoiceItemField(idx, 'expirationDate', e.target.value)}
                            disabled={isIgnore}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </ResponsiveTable>
            </div>

            {/* Rodapé e Ações */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 shrink-0 text-xs">
              <div className="text-slate-500 font-medium">
                Resumo: <strong>{invoiceData.items.filter(i => i.action === 'update').length}</strong> para atualizar estoque,{' '}
                <strong>{invoiceData.items.filter(i => i.action === 'create').length}</strong> novos itens,{' '}
                <strong>{invoiceData.items.filter(i => i.action === 'ignore').length}</strong> ignorados.
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowInvoiceConferenceModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmInvoiceImport}
                  disabled={isConfirmingInvoice}
                  className="flex items-center gap-2 px-6 py-2.5 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all disabled:opacity-50"
                >
                  {isConfirmingInvoice ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Confirmar Entrada no Estoque
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default InventoryView;
