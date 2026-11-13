import React, { useState, useEffect } from 'react';
import { X, Plus, Edit3, Loader2, Users } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Professional, Room, Service } from '../../types';
import { ClassScheduleSection, DraftClassScheduleInput } from './ClassScheduleSection';
import { ServiceRecurrenceConfigPanel } from './ServiceRecurrenceConfigPanel';
import {
  isMixedProfile,
  isStudioProfile,
  normalizeEstablishmentProfile,
  parseServiceRecurrenceConfig,
  RecurrenceFrequency,
  resolveServiceDomain,
  ServiceDomain,
  supportsStudioFeatures
} from '../../utils/establishmentContext';

interface NewServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (saved: { id: string; name: string; [key: string]: any }) => void;
  initialProfessionalId?: string;
  professionals?: Professional[];
  serviceToEdit?: Service | null;
  zIndex?: string;
}

export const NewServiceModal: React.FC<NewServiceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialProfessionalId,
  professionals = [],
  serviceToEdit = null,
  zIndex = 'z-[60]'
}) => {
  const { showToast } = useToast();
  const { currentTenant } = useAuth();
  const isEditing = Boolean(serviceToEdit?.id);
  const establishmentProfile = normalizeEstablishmentProfile(currentTenant?.establishment_profile);
  const isStudioCompatible = supportsStudioFeatures(establishmentProfile);
  const isMixed = isMixedProfile(establishmentProfile);
  const isPureStudio = isStudioProfile(establishmentProfile);

  const [professionalId, setProfessionalId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [price, setPrice] = useState<string>('150');
  const [durationMinutes, setDurationMinutes] = useState<number>(50);
  const [bufferMinutes, setBufferMinutes] = useState<number>(0);
  const [modality, setModality] = useState<'both' | 'presential' | 'online' | 'home'>('both');
  const [serviceDomain, setServiceDomain] = useState<ServiceDomain>(isPureStudio ? 'studio' : 'clinical');
  const [serviceKind, setServiceKind] = useState<'individual' | 'group'>('individual');
  const [defaultCapacity, setDefaultCapacity] = useState<number>(10);
  const [allowRecurrence, setAllowRecurrence] = useState<boolean>(true);
  const [allowedFrequencies, setAllowedFrequencies] = useState<RecurrenceFrequency[]>(['weekly']);
  const [defaultFrequency, setDefaultFrequency] = useState<RecurrenceFrequency>('weekly');
  const [description, setDescription] = useState<string>('');
  const [draftSchedules, setDraftSchedules] = useState<DraftClassScheduleInput[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const showStudioConfig = isPureStudio || (isMixed && serviceDomain === 'studio');

  useEffect(() => {
    if (isOpen && isStudioCompatible) {
      ApiClient.get<Room[]>('/v1/rooms')
        .then(res => setRooms(Array.isArray(res) ? res : []))
        .catch(() => setRooms([]));
    }
  }, [isOpen, isStudioCompatible]);

  useEffect(() => {
    if (isOpen) {
      setDraftSchedules([]);
      if (serviceToEdit) {
        const domain = resolveServiceDomain({
          establishmentProfile,
          serviceDomain: serviceToEdit.service_domain,
          serviceKind: serviceToEdit.service_kind,
          clinicalModule: serviceToEdit.clinical_module
        });
        const recCfg = parseServiceRecurrenceConfig(serviceToEdit);
        setName(serviceToEdit.name || '');
        setPrice(String(serviceToEdit.price ?? '150'));
        setDurationMinutes(Number(serviceToEdit.duration_minutes) || 50);
        setBufferMinutes(Number(serviceToEdit.buffer_minutes) || 0);
        setModality((serviceToEdit.modality as any) || 'both');
        setServiceDomain(domain);
        setServiceKind(domain === 'studio' && serviceToEdit.service_kind === 'group' ? 'group' : 'individual');
        setDefaultCapacity(Number(serviceToEdit.default_capacity) || 10);
        setAllowRecurrence(recCfg.allowRecurrence);
        setAllowedFrequencies(
          recCfg.hasExplicitConfig
            ? recCfg.allowedFrequencies
            : (recCfg.allowRecurrence ? ['weekly'] : [])
        );
        setDefaultFrequency(recCfg.defaultFrequency || 'weekly');
        setDescription(serviceToEdit.description || '');
        setProfessionalId(serviceToEdit.professional_id || initialProfessionalId || professionals[0]?.id || '');
      } else {
        setName('');
        setPrice('150');
        setDurationMinutes(50);
        setBufferMinutes(0);
        setModality('both');
        setServiceDomain(isPureStudio ? 'studio' : 'clinical');
        setServiceKind('individual');
        setDefaultCapacity(10);
        setAllowRecurrence(true);
        setAllowedFrequencies(['weekly']);
        setDefaultFrequency('weekly');
        setDescription('');
        if (initialProfessionalId && professionals.some(p => p.id === initialProfessionalId)) {
          setProfessionalId(initialProfessionalId);
        } else if (professionals.length > 0) {
          setProfessionalId(professionals[0].id);
        } else {
          setProfessionalId('');
        }
      }
    }
  }, [isOpen, initialProfessionalId, professionals, serviceToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('O nome do serviço é obrigatório', 'error');
      return;
    }
    if (!professionalId) {
      showToast('Selecione o profissional responsável', 'error');
      return;
    }
    const numPrice = parseFloat(String(price).replace(',', '.'));
    if (isNaN(numPrice) || numPrice < 0) {
      showToast('Informe um valor válido para o serviço', 'error');
      return;
    }
    if (showStudioConfig && serviceKind === 'group' && (!Number.isInteger(Number(defaultCapacity)) || Number(defaultCapacity) < 1)) {
      showToast('Informe um número inteiro positivo de vagas para a turma', 'error');
      return;
    }

    try {
      setLoading(true);
      const effectiveKind = showStudioConfig ? serviceKind : 'individual';
      const payload: any = {
        professionalId,
        name: name.trim(),
        price: numPrice,
        durationMinutes: Number(durationMinutes) || 50,
        bufferMinutes: Number(bufferMinutes) || 0,
        modality,
        serviceKind: effectiveKind,
        defaultCapacity: effectiveKind === 'group' ? Number(defaultCapacity) : null,
        allowRecurrence,
        ...(isStudioCompatible ? { serviceDomain: showStudioConfig ? 'studio' : 'clinical' } : {}),
        ...(showStudioConfig
          ? {
              allowedRecurrenceFrequencies: allowRecurrence ? allowedFrequencies : [],
              defaultRecurrenceFrequency: allowRecurrence ? defaultFrequency : null
            }
          : {}),
        classSchedules: !isEditing && showStudioConfig && effectiveKind === 'group' ? draftSchedules : undefined,
        description: description.trim() || null
      };

      const res = isEditing && serviceToEdit
        ? await ApiClient.put<any>(`/v1/services/${serviceToEdit.id}`, payload)
        : await ApiClient.post<any>('/v1/services', payload);

      showToast(isEditing ? 'Serviço atualizado com sucesso!' : 'Serviço cadastrado com sucesso!', 'success');
      onSuccess(res?.service || { id: serviceToEdit?.id, ...payload, ...res });
      onClose();
    } catch (err: any) {
      showToast(err.message || err.error || (isEditing ? 'Erro ao atualizar serviço' : 'Erro ao cadastrar serviço'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`fixed inset-0 ${zIndex} bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto mobile-modal`}>
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 my-auto text-xs max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              {isEditing ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{isEditing ? 'Editar Serviço' : 'Novo Serviço'}</h3>
              <p className="text-[11px] text-slate-400">{isEditing ? 'Atualização rápida de atendimento' : 'Cadastro rápido de atendimento'}</p>
            </div>
          </div>
          <button aria-label="Fechar"
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Profissional Responsável <span className="text-rose-500">*</span>
            </label>
            <select
              value={professionalId}
              onChange={e => setProfessionalId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium"
              required
            >
              <option value="">Selecione o profissional...</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.profession_name ? `(${p.profession_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nome do Serviço <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Consulta Inicial, Sessão de Fisioterapia..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Preço (R$) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="150.00"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Duração (minutos) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="5"
                min="5"
                max="480"
                value={durationMinutes}
                onChange={e => setDurationMinutes(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                required
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Modalidade</label>
            <select
              value={modality}
              onChange={e => setModality(e.target.value as any)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
            >
              <option value="both">Presencial ou Online</option>
              <option value="presential">Apenas Presencial</option>
              <option value="online">Apenas Online</option>
              <option value="home">Domiciliar</option>
            </select>
          </div>

          {isMixed && (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="font-bold text-slate-800">Segmento do Serviço</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setServiceDomain('clinical');
                    setServiceKind('individual');
                  }}
                  className={`px-3 py-2 rounded-xl border text-left font-semibold transition-all cursor-pointer ${
                    serviceDomain === 'clinical'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Atendimento Clínico
                </button>
                <button
                  type="button"
                  onClick={() => setServiceDomain('studio')}
                  className={`px-3 py-2 rounded-xl border text-left font-semibold transition-all cursor-pointer ${
                    serviceDomain === 'studio'
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Aula / Serviço de Studio
                </button>
              </div>
            </div>
          )}

          {showStudioConfig ? (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-teal-600" />
                Configurações do Studio
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setServiceKind('individual')}
                  className={`px-3 py-2 rounded-xl border text-left font-semibold transition-all cursor-pointer ${
                    serviceKind === 'individual'
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Individual
                </button>
                <button
                  type="button"
                  onClick={() => setServiceKind('group')}
                  className={`px-3 py-2 rounded-xl border text-left font-semibold transition-all cursor-pointer ${
                    serviceKind === 'group'
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Aula coletiva / Turma
                </button>
              </div>
              {serviceKind === 'group' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Vagas por aula/turma <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    value={defaultCapacity}
                    onChange={e => setDefaultCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                    required
                  />
                </div>
              )}
              <ServiceRecurrenceConfigPanel
                allowRecurrence={allowRecurrence}
                allowedFrequencies={allowedFrequencies}
                defaultFrequency={defaultFrequency}
                onChange={next => {
                  setAllowRecurrence(next.allowRecurrence);
                  setAllowedFrequencies(next.allowedFrequencies);
                  setDefaultFrequency(next.defaultFrequency);
                }}
              />
            </div>
          ) : (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowRecurrence}
                  onChange={e => setAllowRecurrence(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300"
                />
                <span>Permitir repetição/recorrência na agenda</span>
              </label>
            </div>
          )}

          {showStudioConfig && serviceKind === 'group' && (
            <ClassScheduleSection
              serviceId={isEditing ? serviceToEdit?.id : null}
              serviceModality={modality}
              durationMinutes={Number(durationMinutes) || 50}
              defaultCapacity={Number(defaultCapacity) || 10}
              defaultProfessionalId={professionalId}
              professionals={professionals}
              rooms={rooms}
              draftSchedules={draftSchedules}
              onDraftSchedulesChange={setDraftSchedules}
            />
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Descrição (opcional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Breve descrição do procedimento ou orientações ao paciente..."
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
              disabled={loading || !name.trim() || !professionalId}
              className="inline-flex items-center gap-1.5 px-5 py-2 font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Serviço'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
