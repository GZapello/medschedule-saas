import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { X, Baby, User, Save, Shield, CreditCard, Phone, Mail, MapPin } from 'lucide-react';
import { maskBrazilianPhone, validateBrazilianPhone } from '../../utils/phone-mask';

interface EditPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  initialData?: any;
  onSuccess: () => void;
}

export const EditPatientModal: React.FC<EditPatientModalProps> = ({
  isOpen,
  onClose,
  patientId,
  initialData,
  onSuccess
}) => {
  const { showToast } = useToast();
  const { clientTermLabel } = useAuth();

  const [loading, setLoading] = useState<boolean>(false);
  const [fetching, setFetching] = useState<boolean>(false);

  // Dados principais
  const [fullName, setFullName] = useState<string>('');
  const [socialName, setSocialName] = useState<string>('');
  const [birthDate, setBirthDate] = useState<string>('');
  const [cpf, setCpf] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  // Endereço
  const [address, setAddress] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [zipCode, setZipCode] = useState<string>('');

  // Emergência e notas
  const [emergencyContact, setEmergencyContact] = useState<string>('');
  const [emergencyPhone, setEmergencyPhone] = useState<string>('');
  const [notesAdmin, setNotesAdmin] = useState<string>('');

  // Menor / Pediátrico
  const [isChild, setIsChild] = useState<boolean>(false);
  const [guardianName, setGuardianName] = useState<string>('');
  const [guardianRelationship, setGuardianRelationship] = useState<string>('mother');
  const [guardianPhone, setGuardianPhone] = useState<string>('');
  const [guardianCpf, setGuardianCpf] = useState<string>('');

  // Convênio / Plano de Saúde
  const [healthInsuranceProvider, setHealthInsuranceProvider] = useState<string>('');
  const [healthInsuranceCard, setHealthInsuranceCard] = useState<string>('');
  const [healthInsurancePlan, setHealthInsurancePlan] = useState<string>('');

  // Popula dados ao abrir
  useEffect(() => {
    if (!isOpen || !patientId) return;

    const populateFromData = (patient: any, guardians: any[] = []) => {
      setFullName(patient.full_name || '');
      setSocialName(patient.social_name || '');
      setBirthDate(patient.birth_date || '');
      setCpf(patient.cpf || '');
      setPhone(patient.phone || '');
      setWhatsapp(patient.whatsapp || patient.phone || '');
      setEmail(patient.email || '');
      setAddress(patient.address || '');
      setCity(patient.city || '');
      setState(patient.state || '');
      setZipCode(patient.zip_code || '');
      setEmergencyContact(patient.emergency_contact || '');
      setEmergencyPhone(patient.emergency_phone || '');
      setNotesAdmin(patient.notes_admin || '');
      setIsChild(Boolean(patient.is_child));

      // Convênio
      setHealthInsuranceProvider(patient.health_insurance_provider || '');
      setHealthInsuranceCard(patient.health_insurance_card || '');
      setHealthInsurancePlan(patient.health_insurance_plan || '');

      // Responsável
      if (guardians && guardians.length > 0) {
        const primaryG = guardians.find((g: any) => g.is_primary) || guardians[0];
        setGuardianName(primaryG.full_name || '');
        setGuardianRelationship(primaryG.relationship || 'mother');
        setGuardianPhone(primaryG.phone || '');
        setGuardianCpf(primaryG.cpf || '');
      } else {
        setGuardianName('');
        setGuardianRelationship('mother');
        setGuardianPhone('');
        setGuardianCpf('');
      }
    };

    if (initialData && initialData.full_name) {
      populateFromData(initialData, initialData.guardians || []);
    } else {
      // Busca dados completos do endpoint
      setFetching(true);
      ApiClient.get<any>(`/v1/patients/${patientId}`)
        .then(res => {
          const patient = res.patient || res;
          const guardians = res.guardians || [];
          populateFromData(patient, guardians);
        })
        .catch(err => {
          showToast(err.message || 'Erro ao carregar dados do paciente', 'error');
        })
        .finally(() => setFetching(false));
    }
  }, [isOpen, patientId, initialData]);

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
      showToast('Informe o nome e telefone do responsável legal para pacientes menores', 'error');
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

      await ApiClient.put(`/v1/patients/${patientId}`, {
        fullName,
        socialName: socialName || null,
        birthDate: birthDate || null,
        cpf: cpf || null,
        phone,
        whatsapp: whatsapp || phone,
        email: email || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipCode: zipCode || null,
        emergencyContact: emergencyContact || null,
        emergencyPhone: emergencyPhone || null,
        notesAdmin: notesAdmin || null,
        isChild,
        healthInsuranceProvider: healthInsuranceProvider || null,
        healthInsuranceCard: healthInsuranceCard || null,
        healthInsurancePlan: healthInsurancePlan || null,
        guardians
      });

      showToast(`Cadastro do ${clientTermLabel.toLowerCase()} atualizado com sucesso!`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar dados do paciente', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto my-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Editar Cadastro do {clientTermLabel}</h3>
              <p className="text-xs text-slate-400">
                Altere dados de contato, responsáveis, convênio e endereço mantendo todo o histórico preservado.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {fetching ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Carregando dados...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4 text-xs">
            {/* Paciente Pediátrico / Menor */}
            <div className="bg-pink-50/80 p-3 rounded-2xl border border-pink-200/60 flex items-center gap-3">
              <input
                type="checkbox"
                id="isChildEditModal"
                checked={isChild}
                onChange={e => setIsChild(e.target.checked)}
                className="w-4 h-4 text-pink-600 rounded-sm cursor-pointer"
              />
              <label htmlFor="isChildEditModal" className="text-xs font-semibold text-pink-900 cursor-pointer flex items-center gap-1.5">
                <Baby className="w-4 h-4 text-pink-600" />
                Paciente Pediátrico / Menor de Idade (Requer Responsável Legal)
              </label>
            </div>

            {/* Responsável Legal (se menor) */}
            {isChild && (
              <div className="p-4 bg-pink-50/40 rounded-2xl border border-pink-100 space-y-3 animate-in fade-in duration-150">
                <div className="font-bold text-pink-950 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-pink-600" />
                  Dados do Responsável Legal *
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Nome Completo do Responsável *</label>
                    <input
                      type="text"
                      required={isChild}
                      value={guardianName}
                      onChange={e => setGuardianName(e.target.value)}
                      placeholder="Ex: Maria das Graças"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Parentesco / Vínculo</label>
                    <select
                      value={guardianRelationship}
                      onChange={e => setGuardianRelationship(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    >
                      <option value="mother">Mãe</option>
                      <option value="father">Pai</option>
                      <option value="grandparent">Avô / Avó</option>
                      <option value="legal_guardian">Tutor(a) / Guardião Legal</option>
                      <option value="other">Outro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Telefone / WhatsApp do Responsável *</label>
                    <input
                      type="text"
                      required={isChild}
                      value={guardianPhone}
                      onChange={e => setGuardianPhone(maskBrazilianPhone(e.target.value))}
                      placeholder="(11) 98888-7777"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">CPF do Responsável</label>
                    <input
                      type="text"
                      value={guardianCpf}
                      onChange={e => setGuardianCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Dados Pessoais Principais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Nome completo do paciente"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Nome Social / Como prefere ser chamado</label>
                <input
                  type="text"
                  value={socialName}
                  onChange={e => setSocialName(e.target.value)}
                  placeholder="Nome social (opcional)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Data de Nascimento</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={e => setBirthDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">CPF</label>
                <input
                  type="text"
                  value={cpf}
                  onChange={e => setCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Telefone / WhatsApp *</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={e => setPhone(maskBrazilianPhone(e.target.value))}
                  placeholder="(11) 99999-9999"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="paciente@exemplo.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                />
              </div>
            </div>

            {/* Convênio / Plano de Saúde */}
            <div className="p-3.5 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <span>Convênio / Plano de Saúde</span>
                <span className="text-[10px] text-indigo-400 font-normal">(Opcional)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Operadora / Convênio</label>
                  <input
                    type="text"
                    value={healthInsuranceProvider}
                    onChange={e => setHealthInsuranceProvider(e.target.value)}
                    placeholder="Ex: Unimed, Amil, SulAmérica"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Nº Carteirinha</label>
                  <input
                    type="text"
                    value={healthInsuranceCard}
                    onChange={e => setHealthInsuranceCard(e.target.value)}
                    placeholder="000000000000"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Plano / Categoria</label>
                  <input
                    type="text"
                    value={healthInsurancePlan}
                    onChange={e => setHealthInsurancePlan(e.target.value)}
                    placeholder="Ex: Especial, Básico, Nacional"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <MapPin className="w-4 h-4 text-slate-500" />
                <span>Endereço Residencial</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-medium mb-1">Rua, Número e Bairro</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="Av. Paulista, 1000 - Bela Vista"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">CEP</label>
                  <input
                    type="text"
                    value={zipCode}
                    onChange={e => setZipCode(e.target.value)}
                    placeholder="01310-100"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Cidade</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="São Paulo"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Estado (UF)</label>
                  <input
                    type="text"
                    value={state}
                    onChange={e => setState(e.target.value.toUpperCase())}
                    maxLength={2}
                    placeholder="SP"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white uppercase"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Contato de Emergência</label>
                  <input
                    type="text"
                    value={emergencyContact}
                    onChange={e => setEmergencyContact(e.target.value)}
                    placeholder="Nome e parentesco"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Telefone de Emergência</label>
                  <input
                    type="tel"
                    value={emergencyPhone}
                    onChange={e => setEmergencyPhone(maskBrazilianPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Observações Gerais */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Observações Gerais / Administrativas</label>
              <textarea
                value={notesAdmin}
                onChange={e => setNotesAdmin(e.target.value)}
                rows={2}
                placeholder="Anotações internas sobre o paciente (preferências de atendimento, restrições financeiras, etc.)"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white resize-none"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-xl cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
