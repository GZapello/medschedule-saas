import React, { useState, useEffect, useMemo } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Service, Room, Specialty, Professional } from '../../types';
import {
  Scissors,
  Plus,
  Clock,
  DollarSign,
  DoorOpen,
  X,
  CheckCircle2,
  Pencil,
  Trash2,
  AlertTriangle,
  User,
  Users,
  Bell,
  Layers
} from 'lucide-react';

export const CLINICAL_MODULE_LABELS: Record<string, string> = {
  ZemdaMed: 'Medicina (ZemdaMed)',
  ZemdaOdonto: 'Odontologia (ZemdaOdonto)',
  ZemdaEstetic: 'Estética (ZemdaEstetic)',
  ZemdaFisio: 'Fisioterapia (ZemdaFisio)',
  ZemdaNutri: 'Nutrição (ZemdaNutri)',
  ZemdaPsico: 'Psicologia (ZemdaPsico)',
  ZemdaFono: 'Fonoaudiologia (ZemdaFono)',
  ZemdaTO: 'Terapia Ocupacional (ZemdaTO)',
  ZemdaPP: 'Psicopedagogia (ZemdaPP)',
  ZemdaPersonal: 'Personal Trainer (ZemdaPersonal)',
  general: 'Geral'
};

export const getModulesForProfessional = (prof: Professional | undefined | null): Array<{ code: string; label: string }> => {
  if (!prof) return [];
  if (prof.available_modules && prof.available_modules.length > 0) {
    return prof.available_modules;
  }
  const modules: Array<{ code: string; label: string }> = [];
  const pName = (prof.profession_name || '').toLowerCase();
  const pId = (prof.profession_id || '').toLowerCase();
  const spec = ((prof as any).specialty_custom || '').toLowerCase();
  const areas = (prof.practice_areas || '').toLowerCase();

  let primary = 'ZemdaMed';
  if (pId.includes('dent') || pName.includes('dent')) primary = 'ZemdaOdonto';
  else if (pId.includes('fisio') || pName.includes('fisio')) primary = 'ZemdaFisio';
  else if (pId.includes('nutri') || pName.includes('nutri')) primary = 'ZemdaNutri';
  else if (pId.includes('psico') || pName.includes('psicó') || pName.includes('psico')) primary = 'ZemdaPsico';
  else if (pId.includes('fono') || pName.includes('fono')) primary = 'ZemdaFono';
  else if (pId.includes('terapia-ocupacional') || pName.includes('ocupacional')) primary = 'ZemdaTO';
  else if (pId.includes('psicopedag') || pName.includes('psicopedag')) primary = 'ZemdaPP';
  else if (pId.includes('personal') || pName.includes('personal') || pName.includes('educação física')) primary = 'ZemdaPersonal';
  else if (pId.includes('estet') || pName.includes('estet')) primary = 'ZemdaEstetic';

  modules.push({ code: primary, label: CLINICAL_MODULE_LABELS[primary] || primary });

  // Checar se possui capacitação estética (HOF, especialização estética, permissão)
  const hasEstetic =
    (prof as any).zemda_estetic_enabled === 1 ||
    spec.includes('estet') ||
    spec.includes('harmoniz') ||
    spec.includes('hof') ||
    areas.includes('estet') ||
    areas.includes('harmoniz') ||
    areas.includes('hof');

  if (hasEstetic && primary !== 'ZemdaEstetic') {
    modules.push({ code: 'ZemdaEstetic', label: CLINICAL_MODULE_LABELS['ZemdaEstetic'] });
  }

  return modules;
};

export const getCompatibleSpecialties = (
  allSpecialties: Specialty[],
  prof: Professional | undefined | null,
  moduleCode: string | null | undefined
): Specialty[] => {
  if (!allSpecialties || allSpecialties.length === 0) return [];
  if (!prof && !moduleCode) return allSpecialties;

  const targetModule = moduleCode || (prof ? getModulesForProfessional(prof)[0]?.code : null);

  let filtered: Specialty[] = [];

  if (targetModule === 'ZemdaEstetic') {
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      const sid = (s.id || '').toLowerCase();
      const sname = (s.name || '').toLowerCase();
      return (
        pid === 'prof-esteticista' ||
        sid.includes('estet') ||
        sid.includes('hof') ||
        sname.includes('estética') ||
        sname.includes('estetica') ||
        sname.includes('harmonização') ||
        sname.includes('harmonizacao')
      );
    });
  } else if (targetModule === 'ZemdaOdonto') {
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      const sid = (s.id || '').toLowerCase();
      const isEsteticOnly = sid.includes('pa-odonto-estetica');
      return pid === 'prof-dentista' && !isEsteticOnly;
    });
  } else if (targetModule === 'ZemdaFisio') {
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      return pid === 'prof-fisioterapeuta' || pid === 'prof-instrutor-pilates';
    });
  } else if (targetModule === 'ZemdaNutri') {
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      return pid === 'prof-nutricionista';
    });
  } else if (targetModule === 'ZemdaPsico') {
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      return pid === 'prof-psicologo' || pid === 'prof-psicoterapeuta' || pid === 'prof-psicanalista';
    });
  } else if (targetModule === 'ZemdaFono') {
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      return pid === 'prof-fonoaudiologo';
    });
  } else if (targetModule === 'ZemdaTO') {
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      return pid === 'prof-terapeuta-ocupacional';
    });
  } else if (targetModule === 'ZemdaPP') {
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      return pid === 'prof-psicopedagogo';
    });
  } else if (targetModule === 'ZemdaPersonal') {
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      return pid === 'prof-personal-trainer' || pid === 'prof-educacao-fisica';
    });
  } else if (targetModule === 'ZemdaMed') {
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      return pid === 'prof-medico' || pid === 'prof-psiquiatra';
    });
  } else if (prof?.profession_id) {
    const rawPid = prof.profession_id.toLowerCase();
    filtered = allSpecialties.filter(s => (s.profession_id || '').toLowerCase() === rawPid);
  }

  // Deduplicar especialidades por nome
  const seenNames = new Set<string>();
  const uniqueList: Specialty[] = [];
  for (const s of filtered) {
    const norm = s.name.trim().toLowerCase();
    if (!seenNames.has(norm)) {
      seenNames.add(norm);
      uniqueList.push(s);
    }
  }

  return uniqueList;
};

export const ServicesView: React.FC = () => {
  const { showToast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedProfFilter, setSelectedProfFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);

  // Modal Novo Serviço
  const [showServiceModal, setShowServiceModal] = useState<boolean>(false);
  const [professionalId, setProfessionalId] = useState<string>('');
  const [clinicalModule, setClinicalModule] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [specialtyId, setSpecialtyId] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(50);
  const [bufferMinutes, setBufferMinutes] = useState<number>(10);
  const [price, setPrice] = useState<string>('180.00');
  const [modality, setModality] = useState<'both' | 'presential' | 'online' | 'home'>('both');
  const [description, setDescription] = useState<string>('');
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(false);
  const [reminderValue, setReminderValue] = useState<number>(30);
  const [reminderUnit, setReminderUnit] = useState<'DAYS' | 'MONTHS' | 'YEARS'>('DAYS');

  // Modal Editar Serviço
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editProfessionalId, setEditProfessionalId] = useState<string>('');
  const [editClinicalModule, setEditClinicalModule] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editSpecialtyId, setEditSpecialtyId] = useState<string>('');
  const [editDurationMinutes, setEditDurationMinutes] = useState<number>(50);
  const [editBufferMinutes, setEditBufferMinutes] = useState<number>(10);
  const [editPrice, setEditPrice] = useState<string>('180.00');
  const [editModality, setEditModality] = useState<'both' | 'presential' | 'online' | 'home'>('both');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editReminderEnabled, setEditReminderEnabled] = useState<boolean>(false);
  const [editReminderValue, setEditReminderValue] = useState<number>(30);
  const [editReminderUnit, setEditReminderUnit] = useState<'DAYS' | 'MONTHS' | 'YEARS'>('DAYS');
  const [editActive, setEditActive] = useState<boolean>(true);
  const [updating, setUpdating] = useState<boolean>(false);

  // Modal / Confirmação de Exclusão ou Inativação
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Modal Nova Sala
  const [showRoomModal, setShowRoomModal] = useState<boolean>(false);
  const [roomName, setRoomName] = useState<string>('');
  const [roomDesc, setRoomDesc] = useState<string>('');

  const selectedProfForCreate = useMemo(() => {
    return professionals.find(p => p.id === professionalId) || null;
  }, [professionals, professionalId]);

  const createAvailableModules = useMemo(() => {
    return getModulesForProfessional(selectedProfForCreate);
  }, [selectedProfForCreate]);

  const createCompatibleSpecialties = useMemo(() => {
    return getCompatibleSpecialties(specialties, selectedProfForCreate, clinicalModule);
  }, [specialties, selectedProfForCreate, clinicalModule]);

  const selectedProfForEdit = useMemo(() => {
    return professionals.find(p => p.id === editProfessionalId) || null;
  }, [professionals, editProfessionalId]);

  const editAvailableModules = useMemo(() => {
    return getModulesForProfessional(selectedProfForEdit);
  }, [selectedProfForEdit]);

  const editCompatibleSpecialties = useMemo(() => {
    return getCompatibleSpecialties(specialties, selectedProfForEdit, editClinicalModule);
  }, [specialties, selectedProfForEdit, editClinicalModule]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [srvs, rms, specs, profs] = await Promise.all([
        ApiClient.get<Service[]>('/v1/services'),
        ApiClient.get<Room[]>('/v1/rooms'),
        ApiClient.get<Specialty[]>('/v1/taxonomy/specialties'),
        ApiClient.get<Professional[]>('/v1/professionals').catch(() => [])
      ]);
      setServices(srvs || []);
      setRooms(rms || []);
      setSpecialties(specs || []);
      const profList = Array.isArray(profs) ? profs : [];
      setProfessionals(profList);
      if (profList.length > 0 && !professionalId) {
        setProfessionalId(profList[0].id);
        const mods = getModulesForProfessional(profList[0]);
        if (mods.length > 0) {
          setClinicalModule(mods[0].code);
        }
      }
    } catch (err: any) {
      showToast('Erro ao carregar serviços e salas', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectProfessional = (newProfId: string) => {
    setProfessionalId(newProfId);
    const prof = professionals.find(p => p.id === newProfId);
    const mods = getModulesForProfessional(prof);
    
    let newMod = '';
    if (mods.length === 1) {
      newMod = mods[0].code;
    } else if (mods.some(m => m.code === clinicalModule)) {
      newMod = clinicalModule;
    } else if (mods.length > 0) {
      newMod = mods[0].code;
    }
    setClinicalModule(newMod);

    const compatSpecs = getCompatibleSpecialties(specialties, prof, newMod);
    if (!compatSpecs.some(s => s.id === specialtyId)) {
      setSpecialtyId('');
    }
  };

  const handleSelectModule = (newMod: string) => {
    setClinicalModule(newMod);
    const prof = professionals.find(p => p.id === professionalId);
    const compatSpecs = getCompatibleSpecialties(specialties, prof, newMod);
    if (!compatSpecs.some(s => s.id === specialtyId)) {
      setSpecialtyId('');
    }
  };

  const handleSelectEditProfessional = (newProfId: string) => {
    setEditProfessionalId(newProfId);
    const prof = professionals.find(p => p.id === newProfId);
    const mods = getModulesForProfessional(prof);
    
    let newMod = '';
    if (mods.length === 1) {
      newMod = mods[0].code;
    } else if (mods.some(m => m.code === editClinicalModule)) {
      newMod = editClinicalModule;
    } else if (mods.length > 0) {
      newMod = mods[0].code;
    }
    setEditClinicalModule(newMod);

    const compatSpecs = getCompatibleSpecialties(specialties, prof, newMod);
    if (!compatSpecs.some(s => s.id === editSpecialtyId)) {
      setEditSpecialtyId('');
    }
  };

  const handleSelectEditModule = (newMod: string) => {
    setEditClinicalModule(newMod);
    const prof = professionals.find(p => p.id === editProfessionalId);
    const compatSpecs = getCompatibleSpecialties(specialties, prof, newMod);
    if (!compatSpecs.some(s => s.id === editSpecialtyId)) {
      setEditSpecialtyId('');
    }
  };

  const handleCreateService = async () => {
    if (!name.trim() || !price) {
      showToast('Nome e valor do serviço são obrigatórios', 'error');
      return;
    }

    if (!professionalId) {
      showToast('Selecione o profissional responsável pelo serviço', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/services', {
        professionalId,
        clinicalModule: clinicalModule || null,
        name: name.trim(),
        specialtyId: specialtyId || null,
        durationMinutes: Number(durationMinutes),
        bufferMinutes: Number(bufferMinutes),
        price: Number(price),
        modality,
        description: description || null,
        reminderEnabled,
        reminderValue: reminderEnabled ? Number(reminderValue) : null,
        reminderUnit: reminderEnabled ? reminderUnit : 'DAYS'
      });

      showToast('Serviço cadastrado com sucesso!', 'success');
      setShowServiceModal(false);
      setName('');
      setDescription('');
      setReminderEnabled(false);
      setReminderValue(30);
      setReminderUnit('DAYS');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar serviço', 'error');
    }
  };

  const handleCreateRoom = async () => {
    if (!roomName) {
      showToast('Nome da sala é obrigatório', 'error');
      return;
    }

    try {
      await ApiClient.post('/v1/rooms', {
        name: roomName,
        description: roomDesc || null
      });

      showToast('Sala cadastrada com sucesso!', 'success');
      setShowRoomModal(false);
      setRoomName('');
      setRoomDesc('');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar sala', 'error');
    }
  };

  const handleOpenEdit = (s: Service) => {
    setEditingService(s);
    const profId = s.professional_id || (professionals.length > 0 ? professionals[0].id : '');
    setEditProfessionalId(profId);
    
    const prof = professionals.find(p => p.id === profId);
    const mods = getModulesForProfessional(prof);
    
    let targetMod = s.clinical_module || '';
    if (!targetMod) {
      if (mods.length === 1) {
        targetMod = mods[0].code;
      } else if (mods.length > 0) {
        targetMod = mods[0].code;
      }
    }
    setEditClinicalModule(targetMod);

    setEditName(s.name);
    setEditSpecialtyId(s.specialty_id || '');
    setEditDurationMinutes(s.duration_minutes || 50);
    setEditBufferMinutes(s.buffer_minutes || 10);
    setEditPrice(String(s.price || '0.00'));
    setEditModality(s.modality || 'both');
    setEditDescription(s.description || '');
    setEditActive(s.active === 1);
    setEditReminderEnabled(Boolean(s.reminder_enabled));
    setEditReminderValue(s.reminder_value || 30);
    setEditReminderUnit((s.reminder_unit as any) || 'DAYS');
  };

  const handleUpdateService = async () => {
    if (!editingService) return;
    if (!editName.trim() || !editPrice) {
      showToast('Nome e valor do serviço são obrigatórios', 'error');
      return;
    }

    if (!editProfessionalId) {
      showToast('Selecione o profissional responsável pelo serviço', 'error');
      return;
    }

    try {
      setUpdating(true);
      await ApiClient.put(`/v1/services/${editingService.id}`, {
        professionalId: editProfessionalId,
        clinicalModule: editClinicalModule || null,
        name: editName.trim(),
        specialtyId: editSpecialtyId || null,
        durationMinutes: Number(editDurationMinutes),
        bufferMinutes: Number(editBufferMinutes),
        price: Number(editPrice),
        modality: editModality,
        description: editDescription || null,
        active: editActive ? 1 : 0,
        reminderEnabled: editReminderEnabled,
        reminderValue: editReminderEnabled ? Number(editReminderValue) : null,
        reminderUnit: editReminderEnabled ? editReminderUnit : 'DAYS'
      });

      showToast('Serviço atualizado com sucesso!', 'success');
      setEditingService(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar serviço', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteService = async () => {
    if (!serviceToDelete) return;
    try {
      setDeleting(true);
      const res = await ApiClient.delete<{ success: boolean; action: string; message: string }>(
        `/v1/services/${serviceToDelete.id}`
      );
      showToast(res.message || 'Operação realizada com sucesso', 'success');
      setServiceToDelete(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao processar exclusão do serviço', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Agrupamento dos serviços por profissional
  const groupedServices = useMemo(() => {
    const profMap = new Map<string, Professional>();
    professionals.forEach(p => profMap.set(p.id, p));

    // Se filtrou por um profissional específico
    if (selectedProfFilter !== 'all') {
      const prof = profMap.get(selectedProfFilter);
      return [{
        profId: selectedProfFilter,
        profName: prof?.name || 'Profissional',
        professionName: prof?.profession_name || '',
        items: services.filter(s => s.professional_id === selectedProfFilter)
      }];
    }

    // Se 'Todos', agrupa em seções por profissional
    const groups: Array<{
      profId: string | null;
      profName: string;
      professionName: string;
      items: Service[];
    }> = [];

    for (const prof of professionals) {
      const profServices = services.filter(s => s.professional_id === prof.id);
      groups.push({
        profId: prof.id,
        profName: prof.name,
        professionName: prof.profession_name || '',
        items: profServices
      });
    }

    // Serviços sem profissional atribuído (histórico ou geral)
    const unassigned = services.filter(s => !s.professional_id || !profMap.has(s.professional_id));
    if (unassigned.length > 0) {
      groups.push({
        profId: null,
        profName: 'Geral da Clínica / Não Atribuído',
        professionName: '',
        items: unassigned
      });
    }

    return groups;
  }, [services, professionals, selectedProfFilter]);

  const handleOpenCreateModalForProf = (profId?: string | null) => {
    const targetId = profId || (professionals.length > 0 ? professionals[0].id : '');
    if (targetId) {
      handleSelectProfessional(targetId);
    }
    setShowServiceModal(true);
  };

  return (
    <div className="space-y-8">
      {/* Serviços Section */}
      <div className="space-y-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Catálogo de Serviços por Profissional</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cada profissional possui seus próprios serviços, valores, durações e modalidades de atendimento.
            </p>
          </div>
          <button
            onClick={() => handleOpenCreateModalForProf(selectedProfFilter !== 'all' ? selectedProfFilter : null)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Novo Serviço
          </button>
        </div>

        {/* Filtros e Seletores por Profissional */}
        {professionals.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setSelectedProfFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                selectedProfFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Todos os Profissionais</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedProfFilter === 'all' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {services.length}
              </span>
            </button>
            {professionals.map(p => {
              const count = services.filter(s => s.professional_id === p.id).length;
              const isSelected = selectedProfFilter === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProfFilter(p.id)}
                  className={`px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>{p.name}</span>
                  {p.profession_name && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${isSelected ? 'bg-indigo-500 text-indigo-100' : 'bg-slate-100 text-slate-500'}`}>
                      {p.profession_name}
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Listagem Separada por Seções de Profissionais */}
        <div className="space-y-6">
          {groupedServices.map(group => (
            <div key={group.profId || 'unassigned'} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                    {group.profName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{group.profName}</h3>
                    {group.professionName && (
                      <p className="text-[11px] text-slate-500 font-medium">{group.professionName}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenCreateModalForProf(group.profId)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Serviço
                </button>
              </div>

              {group.items.length === 0 ? (
                <div className="p-8 bg-slate-50/70 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                  Nenhum serviço cadastrado para este profissional ainda. Clique em "Adicionar Serviço" acima.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.items.map(s => {
                    const isActive = s.active === 1;
                    return (
                      <div
                        key={s.id}
                        className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                          isActive ? 'bg-white border-slate-200 shadow-xs hover:border-slate-300' : 'bg-slate-50/80 border-slate-200/80 opacity-80'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-bold text-slate-900 text-sm">{s.name}</h4>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {isActive ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Ativo
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                    Inativo
                                  </span>
                                )}
                                {s.clinical_module && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full inline-flex items-center gap-1">
                                    <Layers className="w-3 h-3 text-blue-600" />
                                    {CLINICAL_MODULE_LABELS[s.clinical_module] || s.clinical_module}
                                  </span>
                                )}
                                {s.specialty_name && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full inline-block">
                                    {s.specialty_name}
                                  </span>
                                )}
                                {Boolean(s.reminder_enabled) && (
                                  <span
                                    className="text-[10px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full inline-flex items-center gap-1"
                                    title={`Lembrar após ${s.reminder_value} ${s.reminder_unit === 'YEARS' ? 'ano(s)' : s.reminder_unit === 'MONTHS' ? 'mês(es)' : 'dia(s)'}`}
                                  >
                                    <Bell className="w-3 h-3 text-indigo-600" />
                                    Lembrar após {s.reminder_value} {s.reminder_unit === 'YEARS' ? (s.reminder_value === 1 ? 'ano' : 'anos') : s.reminder_unit === 'MONTHS' ? (s.reminder_value === 1 ? 'mês' : 'meses') : (s.reminder_value === 1 ? 'dia' : 'dias')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-sm font-extrabold text-indigo-600 whitespace-nowrap">
                              {Number(s.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                          {s.description && (
                            <p className="text-xs text-slate-500 mt-2 line-clamp-2">{s.description}</p>
                          )}
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                          <div className="flex items-center gap-1 font-medium text-slate-700">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" /> {s.duration_minutes} min (+{s.buffer_minutes}m buffer)
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="capitalize font-semibold text-slate-600 text-[11px] mr-1">
                              {s.modality === 'both' ? 'Presencial/Online' : s.modality === 'presential' ? 'Presencial' : s.modality === 'online' ? 'Online' : 'Domiciliar'}
                            </span>
                            <button
                              onClick={() => handleOpenEdit(s)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="Editar Serviço"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setServiceToDelete(s)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Excluir ou Inativar Serviço"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Salas Section */}
      <div className="space-y-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Salas e Espaços de Atendimento</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Organize salas físicas para evitar conflitos de espaço físico na clínica.
            </p>
          </div>
          <button
            onClick={() => setShowRoomModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" /> Nova Sala
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {rooms.map(r => (
            <div key={r.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                <DoorOpen className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{r.name}</h4>
                <p className="text-xs text-slate-400 mt-0.5">{r.description || 'Sala ativa'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Novo Serviço */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Novo Serviço</h3>
              <button onClick={() => setShowServiceModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Profissional Responsável *</label>
                <select
                  value={professionalId}
                  onChange={e => handleSelectProfessional(e.target.value)}
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
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Módulo do atendimento *</span>
                  {createAvailableModules.length === 1 && (
                    <span className="text-[10px] text-slate-400 font-normal">Módulo único do profissional</span>
                  )}
                </label>
                <select
                  value={clinicalModule}
                  onChange={e => handleSelectModule(e.target.value)}
                  disabled={createAvailableModules.length <= 1}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium disabled:opacity-80 disabled:cursor-not-allowed"
                  required
                >
                  {createAvailableModules.length === 0 && (
                    <option value="">Nenhum módulo clínico disponível</option>
                  )}
                  {createAvailableModules.map(m => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Define qual workspace clínico abrirá ao iniciar o atendimento deste serviço.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Atendimento *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Consulta Odontológica Inicial"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Especialidade</label>
                <select
                  value={specialtyId}
                  onChange={e => setSpecialtyId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                >
                  <option value="">Geral / Sem Especialidade Específica</option>
                  {createCompatibleSpecialties.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Preço (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Duração (minutos)</label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={e => setDurationMinutes(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Intervalo / Buffer (minutos)</label>
                  <input
                    type="number"
                    value={bufferMinutes}
                    onChange={e => setBufferMinutes(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
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

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Descrição exibida ao cliente na página pública..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs"
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={e => setReminderEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                  />
                  <span>Criar lembrete de retorno/contato</span>
                </label>

                {reminderEnabled && (
                  <div className="mt-2.5 p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700 whitespace-nowrap">Lembrar após</span>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={reminderValue}
                        onChange={e => setReminderValue(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs text-center font-bold"
                      />
                      <select
                        value={reminderUnit}
                        onChange={e => setReminderUnit(e.target.value as any)}
                        className="border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer"
                      >
                        <option value="DAYS">Dias</option>
                        <option value="MONTHS">Meses</option>
                        <option value="YEARS">Anos</option>
                      </select>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      Após a realização deste serviço, o Zemda avisará você na Dashboard para entrar em contato com o paciente.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowServiceModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateService}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Salvar Serviço
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Sala */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Nova Sala</h3>
              <button onClick={() => setShowRoomModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome da Sala / Espaço *</label>
                <input
                  type="text"
                  value={roomName}
                  onChange={e => setRoomName(e.target.value)}
                  placeholder="Ex: Consultório 01 (Infantil)"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={roomDesc}
                  onChange={e => setRoomDesc(e.target.value)}
                  placeholder="Ex: Sala equipada com brinquedoteca"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowRoomModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateRoom}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Salvar Sala
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Serviço */}
      {editingService && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Editar Serviço</h3>
              <button
                onClick={() => setEditingService(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Profissional Responsável *</label>
                <select
                  value={editProfessionalId}
                  onChange={e => handleSelectEditProfessional(e.target.value)}
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
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Módulo do atendimento *</span>
                  {editAvailableModules.length === 1 && (
                    <span className="text-[10px] text-slate-400 font-normal">Módulo único do profissional</span>
                  )}
                </label>
                <select
                  value={editClinicalModule}
                  onChange={e => handleSelectEditModule(e.target.value)}
                  disabled={editAvailableModules.length <= 1}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium disabled:opacity-80 disabled:cursor-not-allowed"
                  required
                >
                  {editAvailableModules.length === 0 && (
                    <option value="">Nenhum módulo clínico disponível</option>
                  )}
                  {editAvailableModules.map(m => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Define qual workspace clínico abrirá ao iniciar o atendimento deste serviço.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Atendimento *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Ex: Consulta Odontológica Inicial"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Especialidade</label>
                <select
                  value={editSpecialtyId}
                  onChange={e => setEditSpecialtyId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                >
                  <option value="">Geral / Sem Especialidade Específica</option>
                  {editSpecialtyId && !editCompatibleSpecialties.some(s => s.id === editSpecialtyId) && (
                    <option value={editSpecialtyId}>
                      {editingService?.specialty_name || 'Especialidade Atual'}
                    </option>
                  )}
                  {editCompatibleSpecialties.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Preço (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Duração (minutos)</label>
                  <input
                    type="number"
                    value={editDurationMinutes}
                    onChange={e => setEditDurationMinutes(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Intervalo / Buffer (minutos)</label>
                  <input
                    type="number"
                    value={editBufferMinutes}
                    onChange={e => setEditBufferMinutes(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Modalidade</label>
                  <select
                    value={editModality}
                    onChange={e => setEditModality(e.target.value as any)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50"
                  >
                    <option value="both">Presencial ou Online</option>
                    <option value="presential">Apenas Presencial</option>
                    <option value="online">Apenas Online</option>
                    <option value="home">Domiciliar</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status do Serviço</label>
                  <select
                    value={editActive ? '1' : '0'}
                    onChange={e => setEditActive(e.target.value === '1')}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-semibold"
                  >
                    <option value="1">Ativo</option>
                    <option value="0">Inativo (Desativado)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  placeholder="Descrição exibida ao cliente na página pública..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs"
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={editReminderEnabled}
                    onChange={e => setEditReminderEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                  />
                  <span>Criar lembrete de retorno/contato</span>
                </label>

                {editReminderEnabled && (
                  <div className="mt-2.5 p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700 whitespace-nowrap">Lembrar após</span>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={editReminderValue}
                        onChange={e => setEditReminderValue(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs text-center font-bold"
                      />
                      <select
                        value={editReminderUnit}
                        onChange={e => setEditReminderUnit(e.target.value as any)}
                        className="border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer"
                      >
                        <option value="DAYS">Dias</option>
                        <option value="MONTHS">Meses</option>
                        <option value="YEARS">Anos</option>
                      </select>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      Após a realização deste serviço, o Zemda avisará você na Dashboard para entrar em contato com o paciente.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleUpdateService}
                  disabled={updating}
                  className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {updating ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão ou Inativação */}
      {serviceToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 mb-4 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Excluir Serviço</h3>
                <p className="text-xs text-slate-500">Confirmação de segurança</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p>
                Tem certeza de que deseja excluir o serviço <strong className="text-slate-900">{serviceToDelete.name}</strong>?
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] leading-relaxed">
                <strong>Atenção:</strong> Se o serviço já possuir vínculos históricos com agendamentos, atendimentos ou registros financeiros, ele será <strong>inativado com segurança</strong> para manter a integridade dos relatórios e prontuários.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-5">
              <button
                type="button"
                onClick={() => setServiceToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteService}
                disabled={deleting}
                className="px-5 py-2 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {deleting ? 'Processando...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
