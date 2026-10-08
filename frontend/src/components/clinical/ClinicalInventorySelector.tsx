import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../../api/client';
import {
  Package,
  Plus,
  Search,
  Check,
  AlertCircle,
  X,
  Layers,
  Calendar,
  Hash,
  DollarSign,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';

export interface ClinicalInventoryItem {
  id: string;
  name: string;
  category?: string | null;
  product_type?: string | null;
  brand?: string | null;
  presentation?: string | null;
  volume_ml?: number | null;
  quantity: number;
  unit: string;
  batch_number?: string | null;
  expiration_date?: string | null;
  unit_cost?: number;
  supplier?: string | null;
  min_stock?: number;
}

export interface ClinicalInventorySelection {
  productId: string | null;
  productName: string;
  brand?: string;
  manufacturer?: string;
  batchLot?: string;
  expiryDate?: string;
  quantity: number | '';
  unit: string;
  withoutProduct: boolean;
}

interface ClinicalInventorySelectorProps {
  value: ClinicalInventorySelection;
  onChange: (value: ClinicalInventorySelection) => void;
  disabled?: boolean;
  required?: boolean;
  allowWithoutProduct?: boolean;
  defaultCategory?: string;
  mode?: 'usage' | 'budget';
}

export function ClinicalInventorySelector({
  value,
  onChange,
  disabled = false,
  required = true,
  allowWithoutProduct = true,
  defaultCategory = 'Geral',
  mode = 'usage'
}: ClinicalInventorySelectorProps) {
  const [items, setItems] = useState<ClinicalInventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Quick Add Form state
  const [quickAddForm, setQuickAddForm] = useState({
    name: '',
    category: defaultCategory,
    productType: '',
    brand: '',
    presentation: 'unidade',
    quantity: '10',
    unit: 'un',
    batchNumber: '',
    expirationDate: '',
    unitCost: '0',
    minStock: '2',
    notes: ''
  });
  const [savingQuickAdd, setSavingQuickAdd] = useState(false);
  const [quickAddError, setQuickAddError] = useState('');

  const loadItems = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<{ items: ClinicalInventoryItem[] }>('/v1/clinical-inventory/items');
      setItems(res.items || []);
    } catch (err) {
      console.warn('Erro ao carregar estoque clínico:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();

    const handleUpdate = () => {
      loadItems();
    };
    window.addEventListener('zemda-inventory-updated', handleUpdate);
    return () => window.removeEventListener('zemda-inventory-updated', handleUpdate);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedItem = items.find(i => i.id === value.productId);

  const handleSelectItem = (item: ClinicalInventoryItem) => {
    onChange({
      ...value,
      productId: item.id,
      productName: item.name,
      brand: item.brand || '',
      manufacturer: item.brand || '',
      batchLot: item.batch_number || '',
      expiryDate: item.expiration_date ? item.expiration_date.slice(0, 10) : '',
      unit: item.unit || 'un',
      withoutProduct: false
    });
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const handleWithoutProductToggle = (checked: boolean) => {
    if (checked) {
      onChange({
        productId: null,
        productName: '',
        brand: '',
        manufacturer: '',
        batchLot: '',
        expiryDate: '',
        quantity: '',
        unit: 'un',
        withoutProduct: true
      });
    } else {
      onChange({
        ...value,
        withoutProduct: false
      });
    }
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickAddError('');
    if (!quickAddForm.name.trim()) {
      setQuickAddError('Nome do produto é obrigatório.');
      return;
    }
    const initialQty = Number(quickAddForm.quantity);
    if (isNaN(initialQty) || initialQty < 0) {
      setQuickAddError('Quantidade inicial inválida.');
      return;
    }

    try {
      setSavingQuickAdd(true);
      const res = await ApiClient.post<{ message: string; item: ClinicalInventoryItem }>(
        '/v1/clinical-inventory/items/quick-add',
        {
          name: quickAddForm.name.trim(),
          category: quickAddForm.category.trim() || undefined,
          productType: quickAddForm.productType.trim() || undefined,
          brand: quickAddForm.brand.trim() || undefined,
          presentation: quickAddForm.presentation.trim() || 'unidade',
          quantity: initialQty,
          unit: quickAddForm.unit.trim() || 'un',
          batchNumber: quickAddForm.batchNumber.trim() || undefined,
          expirationDate: quickAddForm.expirationDate.trim() || undefined,
          unitCost: Number(quickAddForm.unitCost) || 0,
          minStock: Number(quickAddForm.minStock) || 2,
          notes: quickAddForm.notes.trim() || undefined
        }
      );

      // Notify other views
      window.dispatchEvent(
        new CustomEvent('zemda-inventory-updated', {
          detail: { itemId: res.item.id, newQuantity: res.item.quantity }
        })
      );

      // Reload and auto-select
      await loadItems();
      handleSelectItem(res.item);
      setShowQuickAddModal(false);

      // Reset form
      setQuickAddForm({
        name: '',
        category: 'Estética',
        productType: '',
        brand: '',
        presentation: 'unidade',
        quantity: '10',
        unit: 'un',
        batchNumber: '',
        expirationDate: '',
        unitCost: '0',
        minStock: '2',
        notes: ''
      });
    } catch (err: any) {
      setQuickAddError(err.message || 'Erro ao cadastrar produto no estoque.');
    } finally {
      setSavingQuickAdd(false);
    }
  };

  const filteredItems = items.filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.brand && item.brand.toLowerCase().includes(q)) ||
      (item.batch_number && item.batch_number.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  });

  const currentStock = selectedItem ? Number(selectedItem.quantity) : 0;
  const usedQty = typeof value.quantity === 'number' ? value.quantity : (Number(value.quantity) || 0);
  const remainingStock = currentStock - usedQty;
  const isInsufficient = selectedItem && usedQty > currentStock;

  return (
    <div className="space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200">
      {/* Header com toggle "Sem produto" */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Package className="w-4 h-4 text-teal-600" />
          {mode === 'budget' ? 'Produto / Insumo do Estoque' : 'Produto / Insumo utilizado'}{' '}
          {required && !value.withoutProduct && <span className="text-red-500">*</span>}
        </label>

        {allowWithoutProduct && mode !== 'budget' && (
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors select-none">
            <input
              type="checkbox"
              checked={value.withoutProduct}
              onChange={e => handleWithoutProductToggle(e.target.checked)}
              disabled={disabled}
              className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5"
            />
            <span>Procedimento sem utilização de produto/insumo</span>
          </label>
        )}
      </div>

      {allowWithoutProduct && mode !== 'budget' && value.withoutProduct ? (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Este procedimento não registrará baixa no estoque central da clínica.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Seletor de Estoque Central */}
          <div className="flex gap-2 items-center" ref={dropdownRef}>
            <div className="relative flex-1">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`w-full flex items-center justify-between bg-white border ${
                  !value.productId && required ? 'border-amber-300' : 'border-slate-300'
                } rounded-lg px-3 py-2 text-xs text-left shadow-xs hover:border-slate-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500`}
              >
                <span className={selectedItem ? 'font-semibold text-slate-800' : 'text-slate-400'}>
                  {selectedItem
                    ? `${selectedItem.name}${selectedItem.brand ? ` — ${selectedItem.brand}` : ''} (Saldo: ${selectedItem.quantity} ${selectedItem.unit})`
                    : 'Pesquisar no estoque central da clínica...'}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {isDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                  <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        autoFocus
                        placeholder="Buscar por nome, marca ou lote..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {filteredItems.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-500">
                        Nenhum produto ativo encontrado no estoque.
                      </div>
                    ) : (
                      filteredItems.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectItem(item)}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-teal-50 flex items-center justify-between transition-colors ${
                            item.id === value.productId ? 'bg-teal-50/80 font-bold text-teal-900' : 'text-slate-700'
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-slate-800">{item.name}</div>
                            <div className="text-[11px] text-slate-500 flex gap-2">
                              {item.brand && <span>{item.brand}</span>}
                              {item.batch_number && <span>Lote: {item.batch_number}</span>}
                              {item.expiration_date && <span>Val: {item.expiration_date.slice(0, 10)}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                                item.quantity <= 0
                                  ? 'bg-red-100 text-red-700'
                                  : item.quantity <= (item.min_stock || 2)
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              Saldo: {item.quantity} {item.unit}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={() => setShowQuickAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-xs hover:border-slate-400 transition-colors shrink-0"
              title="Cadastrar novo produto no estoque da clínica"
            >
              <Plus className="w-3.5 h-3.5 text-teal-600" />
              <span>Novo produto</span>
            </button>
          </div>

          {/* Dados do produto selecionado + Quantidade */}
          {selectedItem && (
            <div className="bg-white border border-teal-200/80 rounded-xl p-3 shadow-xs space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Marca / Fabricante</span>
                  <span className="font-medium text-slate-700">{selectedItem.brand || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Lote</span>
                  <span className="font-medium text-slate-700">{selectedItem.batch_number || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Validade</span>
                  <span className="font-medium text-slate-700">
                    {selectedItem.expiration_date ? selectedItem.expiration_date.slice(0, 10) : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Saldo Atual</span>
                  <span className="font-bold text-teal-700">
                    {selectedItem.quantity} {selectedItem.unit}
                  </span>
                </div>
              </div>

              {/* Input de Quantidade e projeção de saldo */}
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700 shrink-0">
                    {mode === 'budget' ? 'Quantidade prevista:' : 'Quantidade utilizada:'}
                  </label>
                  <div className="relative w-28">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      required={!value.withoutProduct}
                      disabled={disabled}
                      value={value.quantity}
                      onChange={e =>
                        onChange({
                          ...value,
                          quantity: e.target.value === '' ? '' : Number(e.target.value)
                        })
                      }
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                      placeholder="0"
                    />
                    <span className="absolute right-2.5 top-1.5 text-xs text-slate-400 font-bold pointer-events-none">
                      {selectedItem.unit}
                    </span>
                  </div>
                </div>

                {mode === 'budget' ? (
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span>Saldo em estoque (referência):</span>
                    <span className="font-semibold text-slate-700">
                      {currentStock} {selectedItem.unit}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-xs">
                    {usedQty > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Saldo após procedimento:</span>
                        <span
                          className={`font-bold px-2 py-0.5 rounded-md ${
                            isInsufficient ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {remainingStock} {selectedItem.unit}
                        </span>
                      </div>
                    )}

                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded-md border border-teal-200/60">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                      Baixa automática no estoque
                    </span>
                  </div>
                )}
              </div>

              {mode === 'budget' ? (
                <div className="p-2.5 bg-sky-50 border border-sky-200/80 rounded-lg text-xs text-sky-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>Este item está apenas previsto no orçamento e não movimentará o estoque.</span>
                </div>
              ) : (
                isInsufficient && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>
                      Estoque insuficiente! A quantidade solicitada ({usedQty} {selectedItem.unit}) excede o saldo
                      disponível ({currentStock} {selectedItem.unit}).
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal de Cadastro Rápido de Produto no Estoque Central */}
      {showQuickAddModal && (
        <div className="fixed inset-0 z-[100001] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-slate-800 text-sm">Adicionar Produto ao Estoque Central</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickAddSubmit} className="p-5 space-y-3.5">
              {quickAddError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{quickAddError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome do produto / substância *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Botox 100U, Fio PDO Espiculado, Ácido Hialurônico..."
                  value={quickAddForm.name}
                  onChange={e => setQuickAddForm({ ...quickAddForm, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Categoria</label>
                  <input
                    type="text"
                    placeholder="Ex: Toxinas, Preenchedores, Insumos..."
                    value={quickAddForm.category}
                    onChange={e => setQuickAddForm({ ...quickAddForm, category: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Marca / Fabricante</label>
                  <input
                    type="text"
                    placeholder="Ex: Allergan, Galderma, Rennova..."
                    value={quickAddForm.brand}
                    onChange={e => setQuickAddForm({ ...quickAddForm, brand: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quantidade inicial no estoque *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0"
                    placeholder="Ex: 50, 100, 2"
                    value={quickAddForm.quantity}
                    onChange={e => setQuickAddForm({ ...quickAddForm, quantity: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unidade *</label>
                  <select
                    value={quickAddForm.unit}
                    onChange={e => setQuickAddForm({ ...quickAddForm, unit: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden bg-white"
                  >
                    <option value="un">un (unidades)</option>
                    <option value="U">U (unidades internacionais)</option>
                    <option value="ml">ml (mililitros)</option>
                    <option value="frasco">frasco</option>
                    <option value="ampola">ampola</option>
                    <option value="seringa">seringa</option>
                    <option value="cx">caixa</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Lote</label>
                  <input
                    type="text"
                    placeholder="Ex: BTX2026-A"
                    value={quickAddForm.batchNumber}
                    onChange={e => setQuickAddForm({ ...quickAddForm, batchNumber: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Validade</label>
                  <input
                    type="date"
                    value={quickAddForm.expirationDate}
                    onChange={e => setQuickAddForm({ ...quickAddForm, expirationDate: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Custo unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={quickAddForm.unitCost}
                    onChange={e => setQuickAddForm({ ...quickAddForm, unitCost: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estoque mínimo (alerta)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="2"
                    value={quickAddForm.minStock}
                    onChange={e => setQuickAddForm({ ...quickAddForm, minStock: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={savingQuickAdd}
                  onClick={() => setShowQuickAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingQuickAdd}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                >
                  {savingQuickAdd ? 'Salvando...' : 'Salvar no Estoque Central'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
