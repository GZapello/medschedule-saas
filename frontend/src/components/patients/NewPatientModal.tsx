import React, { useState } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { X, Plus, Baby, User } from 'lucide-react';
import { maskBrazilianPhone, validateBrazilianPhone } from '../../utils/phone-mask';

interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewPatientModal: React.FC<NewPatientModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { showToast } = useToast();
  const { clientTermLabel } = useAuth();

  const [fullName, setFullName] = useState<string>('');
  const [socialName, setSocialName] = useState<string>('');
  const [birthDate, setBirthDate] = useState<string>('');
  const [cpf, setCpf] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [city, setCity] = useState<string>('São Paulo');
  const [state, setState] = useState<string>('SP');
  const [emergencyContact, setEmergencyContact] = useState<string>('');
  const [emergencyPhone, setEmergencyPhone] = useState<string>('');
  const [notesAdmin, setNotesAdmin] = useState<string>('');

  // Atendimento infantil / menor
  const [isChild, setIsChild] = useState<boolean>(false);
  const [guardianName, setGuardianName] = useState<string>('');
  const [guardianRelationship, setGuardianRelationship] = useState<string>('mother');
  const [guardianPhone, setGuardianPhone] = useState<string>('');
  const [guardianCpf, setGuardianCpf] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !phone) {
      showToast('Nome completo e telefone são obrigatórios', 'error');
      return;
    }

    const phoneVal = validateBrazilianPhone(phone);
    if (!phoneVal.valid) {
      showToast(phoneVal.error || 'Telefone inválido', 'error');
      return;
    }

    if (isChild && (!guardianName || !guardianPhone)) {
      showToast('Informe o nome e telefone do responsável legal', 'error');
      return;
    }

    if (isChild && guardianPhone) {
      const gVal = validateBrazilianPhone(guardianPhone);
      if (!gVal.valid) {
        showToast(`Responsável: ${gVal.error}`, 'error');
        return;
      }
    }

    if (emergencyPhone) {
      const emVal = validateBrazilianPhone(emergencyPhone);
      if (!emVal.valid) {
        showToast(`Emergência: ${emVal.error}`, 'error');
        return;
      }
    }

    try {
      setLoading(true);
      const guardians = isChild
        ? [
            {
              fullName: guardianName,
              relationship: guardianRelationship,
              phone: guardianPhone,
              cpf: guardianCpf || null,
              isPrimary: true
            }
          ]
        : [];

      await ApiClient.post('/v1/patients', {
        fullName,
        socialName: socialName || null,
        birthDate: birthDate || null,
        cpf: cpf || null,
        phone,
        whatsapp: whatsapp || phone,
        email: email || null,
        address: address || null,
        city,
        state,
        emergencyContact: emergencyContact || null,
        emergencyPhone: emergencyPhone || null,
        notesAdmin: notesAdmin || null,
        isChild,
        guardians
      });

      showToast(`${clientTermLabel} cadastrado com sucesso!`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h3 className="text-lg font-bold text-slate-900">Novo {clientTermLabel}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Checkbox Infantil */}
          <div className="bg-pink-50 p-3 rounded-2xl border border-pink-100 flex items-center gap-3">
            <input
              type="checkbox"
              id="isChildModal"
              checked={isChild}
              onChange={e => setIsChild(e.target.checked)}
              className="w-4 h-4 text-pink-600 rounded-sm"
            />
            <label htmlFor="isChildModal" className="text-xs font-semibold text-pink-900 cursor-pointer flex items-center gap-1.5">
              <Baby className="w-4 h-4 text-pink-600" />
              É atendimento infantil / adolescente / menor de idade?
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome Completo *</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Nome completo"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome Social (se houver)</label>
              <input
                type="text"
                value={socialName}
                onChange={e => setSocialName(e.target.value)}
                placeholder="Nome social"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Data de Nascimento</label>
              <input
                type="date"
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">CPF</label>
              <input
                type="text"
                value={cpf}
                onChange={e => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">WhatsApp / Telefone *</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(maskBrazilianPhone(e.target.value))}
                placeholder="(11) 99999-9999"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="cliente@email.com"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
          </div>

          {/* Se for Infantil, campos do Responsável Legal */}
          {isChild && (
            <div className="p-4 bg-pink-50/50 border border-pink-200 rounded-2xl space-y-3">
              <h4 className="font-bold text-pink-900 text-xs uppercase tracking-wider">
                Responsável Legal (Pai, Mãe ou Tutor)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nome do Responsável *</label>
                  <input
                    type="text"
                    value={guardianName}
                    onChange={e => setGuardianName(e.target.value)}
                    placeholder="Nome completo do responsável"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Parentesco</label>
                  <select
                    value={guardianRelationship}
                    onChange={e => setGuardianRelationship(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  >
                    <option value="mother">Mãe</option>
                    <option value="father">Pai</option>
                    <option value="legal_guardian">Tutor(a) / Guardião Legal</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">WhatsApp do Responsável *</label>
                  <input
                    type="tel"
                    value={guardianPhone}
                    onChange={e => setGuardianPhone(maskBrazilianPhone(e.target.value))}
                    placeholder="(11) 98888-8888"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">CPF do Responsável</label>
                  <input
                    type="text"
                    value={guardianCpf}
                    onChange={e => setGuardianCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Contato de Emergência</label>
              <input
                type="text"
                value={emergencyContact}
                onChange={e => setEmergencyContact(e.target.value)}
                placeholder="Nome do contato"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Telefone de Emergência</label>
              <input
                type="tel"
                value={emergencyPhone}
                onChange={e => setEmergencyPhone(maskBrazilianPhone(e.target.value))}
                placeholder="(11) 99999-9999"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50"
            >
              Salvar Cadastro
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
