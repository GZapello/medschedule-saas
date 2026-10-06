import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { MealPlanFoodItem } from './NutritionWorkspace';

export function ManualMealFoodModal({ item, onSave, onClose }: { item?: MealPlanFoodItem; onSave: (item: MealPlanFoodItem) => void; onClose: () => void }) {
  const [name, setName] = useState(item?.food || '');
  const [quantity, setQuantity] = useState(String(item?.quantity || 1));
  const [unit, setUnit] = useState(item?.unit || 'g');
  const [notes, setNotes] = useState(item?.notes || '');
  const [values, setValues] = useState({ calories: String(item?.calories ?? 0), carb: String(item?.carb ?? 0), protein: String(item?.protein ?? 0), fat: String(item?.fat ?? 0) });
  const [error, setError] = useState('');
  const number = (value: string) => value.trim() === '' ? NaN : Number(value.replace(',', '.'));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = number(quantity);
    const nutrients = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, number(value)])) as { calories: number; carb: number; protein: number; fat: number };
    if (!name.trim() || !Number.isFinite(amount) || amount <= 0 || Object.values(nutrients).some(value => !Number.isFinite(value) || value < 0)) {
      setError('Informe o nome, uma quantidade maior que zero e nutrientes válidos, iguais ou maiores que zero.'); return;
    }
    onSave({ ...item, food: name.trim(), quantity: amount, unit, portion: `${amount} ${unit}`, grams: unit === 'g' ? amount : 0, ...nutrients, source: 'manual', notes: notes.trim() || undefined });
  };
  return <div className="fixed inset-0 z-[10000] bg-slate-900/60 flex items-center justify-center p-4" onKeyDown={event => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'Tab') {
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, textarea');
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-label={item ? 'Editar alimento manual' : 'Adicionar alimento manual'} className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-md max-h-[90dvh] overflow-y-auto space-y-4">
      <header className="flex justify-between items-center"><h2 className="font-bold text-slate-900">{item ? 'Editar alimento manual' : 'Adicionar alimento manual'}</h2><button type="button" aria-label="Fechar" onClick={onClose}><X className="w-5 h-5" /></button></header>
      <label className="block text-xs font-bold">Nome do alimento<input autoFocus required value={name} onChange={event => setName(event.target.value)} className="block w-full border rounded-lg px-3 py-2 mt-1 font-normal" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-bold">Quantidade<input required inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} className="block w-full border rounded-lg px-3 py-2 mt-1 font-normal" /></label>
        <label className="text-xs font-bold">Unidade<select aria-label="Unidade" value={unit} onChange={event => setUnit(event.target.value)} className="block w-full border rounded-lg px-3 py-2 mt-1 font-normal">{['g', 'ml', 'unidade', 'colher', 'colher de chá', 'colher de sopa', 'xícara', 'porção', 'fatia', 'copo'].map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      <p className="text-xs text-slate-500">Valores nutricionais para a quantidade informada.</p>
      <div className="grid grid-cols-2 gap-3">{([['calories', 'kcal'], ['carb', 'Carboidratos (CHO) — g'], ['protein', 'Proteínas (PTN) — g'], ['fat', 'Gorduras (LIP) — g']] as const).map(([key, label]) => <label key={key} className="text-xs font-bold">{label}<input required inputMode="decimal" value={values[key]} onChange={event => setValues({ ...values, [key]: event.target.value })} className="block w-full border rounded-lg px-3 py-2 mt-1 font-normal" /></label>)}</div>
      <label className="block text-xs font-bold">Observação (opcional)<textarea value={notes} onChange={event => setNotes(event.target.value)} className="block w-full border rounded-lg px-3 py-2 mt-1 font-normal" rows={2} /></label>
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
      <footer className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-2 border rounded-lg text-xs font-bold">Cancelar</button><button type="submit" className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">Salvar alimento</button></footer>
    </form>
  </div>;
}
