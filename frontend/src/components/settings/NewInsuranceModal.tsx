import React, { useState, useEffect } from 'react';
import { X, Plus, Shield, Loader2 } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

interface NewInsuranceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (created: { id: string; name: string; [key: string]: any }) => void;
  zIndex?: string;
}

const COMMON_INSURANCES = [
  'Unimed',
  'Bradesco Saúde',
  'Amil',
  'SulAmérica',
  'NotreDame Intermédica',
  'Porto Seguro',
  'Allianz Saúde',
  'Cassi',
  'Geap',
  'Golden Cross'
];

export const NewInsuranceModal: React.FC<NewInsuranceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  zIndex = 'z-[60]'
}) => {
  const { showToast } = useToast();

  const [name, setName] = useState<string>('');
  const [ansCode, setAnsCode] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setAnsCode('');
      setPhone('');
      setEmail('');
      setNotes('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('O nome do convênio é obrigatório', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await ApiClient.post<any>('/v1/insurances/clinic', {
        name: name.trim(),
        ansCode: ansCode.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null
      });

      showToast('Convênio cadastrado com sucesso!', 'success');
      onSuccess({ id: res.id, name: name.trim() });
      onClose();
    } catch (err: any) {
      showToast(err.message || err.error || 'Erro ao cadastrar convênio', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`fixed inset-0 ${zIndex} bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto`}>
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 my-auto text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Novo Convênio</h3>
              <p className="text-[11px] text-slate-400">Cadastro de plano / operadora</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Sugestões rápidas de convênios mais comuns */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
              Sugestões rápidas (clique para preencher):
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_INSURANCES.map(ins => (
                <button
                  key={ins}
                  type="button"
                  onClick={() => setName(ins)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    name.toLowerCase() === ins.toLowerCase()
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {ins}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nome do Convênio / Operadora <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Unimed Regional, Bradesco Top..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Código ANS (opcional)</label>
              <input
                type="text"
                value={ansCode}
                onChange={e => setAnsCode(e.target.value)}
                placeholder="Ex: 005711"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Telefone / Central</label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(11) 4004-0000"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">E-mail de Autorização (opcional)</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="autorizacao@convenio.com.br"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Observações Internas (opcional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Exige guia autorizada pelo portal antes da consulta..."
              className="w-full border border-slate-200 rounded-xl p-2.5 text-xs resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2 font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Convênio'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
