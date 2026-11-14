import React, { useState, useEffect, useMemo } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
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
  Layers,
  Package,
  Calendar
} from 'lucide-react';
import { PackageModal } from './PackageModal';
import { ClassScheduleSection, DraftClassScheduleInput } from './ClassScheduleSection';
import { ServiceRecurrenceConfigPanel } from './ServiceRecurrenceConfigPanel';
import { LinkedInstructorsSelector } from './LinkedInstructorsSelector';
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

export const getModulesForProfessional = (
  prof: Professional | undefined | null,
  authContext?: {
    currentUser?: any;
    isZemdaEstetic?: boolean;
    userPermissions?: string[];
  }
): Array<{ code: string; label: string }> => {
  if (!prof) return [];

  // Começa com os módulos retornados pelo backend (removendo 'general' se houver módulos clínicos)
  const initialBackendMods = (prof.available_modules || []).filter(m => m.code !== 'general');
  const modules: Array<{ code: string; label: string }> = [...initialBackendMods];

  const pName = (prof.profession_name || '').toLowerCase();
  const pId = (prof.profession_id || '').toLowerCase();
  const spec = ((prof as any).specialty_custom || '').toLowerCase();
  const areas = (prof.practice_areas || '').toLowerCase();

  const addIf = (flag: any, code: string) => {
    if (Boolean(flag) && !modules.some(m => m.code === code)) {
      modules.push({ code, label: CLINICAL_MODULE_LABELS[code] || code });
    }
  };

  // 1. Identificar módulo clínico canônico da profissão
  let primary: string | null = null;
  if (pId.includes('dent') || pName.includes('dent')) primary = 'ZemdaOdonto';
  else if (pId.includes('fisio') || pName.includes('fisio')) primary = 'ZemdaFisio';
  else if (pId.includes('nutri') || pName.includes('nutri')) primary = 'ZemdaNutri';
  else if (pId.includes('psico') || pName.includes('psicó') || pName.includes('psico')) primary = 'ZemdaPsico';
  else if (pId.includes('fono') || pName.includes('fono')) primary = 'ZemdaFono';
  else if (pId.includes('terapia-ocupacional') || pName.includes('ocupacional')) primary = 'ZemdaTO';
  else if (pId.includes('psicopedag') || pName.includes('psicopedag')) primary = 'ZemdaPP';
  else if (pId.includes('personal') || pName.includes('personal') || pName.includes('educação física')) primary = 'ZemdaPersonal';
  else if (pId.includes('estet') || pName.includes('estet')) primary = 'ZemdaEstetic';
  else if (pId.includes('med') || pName.includes('médic') || pName.includes('medicina') || pName.includes('psiquiat')) primary = 'ZemdaMed';

  if (primary) addIf(true, primary);

  // 2. Flags explícitas do cadastro se presentes no objeto
  addIf((prof as any).zemda_odonto_enabled, 'ZemdaOdonto');
  addIf((prof as any).zemda_fisio_enabled, 'ZemdaFisio');
  addIf((prof as any).zemda_nutri_enabled, 'ZemdaNutri');
  addIf((prof as any).zemda_to_enabled, 'ZemdaTO');
  addIf((prof as any).zemda_fono_enabled, 'ZemdaFono');
  addIf((prof as any).zemda_pp_enabled, 'ZemdaPP');
  addIf((prof as any).zemda_psico_enabled, 'ZemdaPsico');
  addIf((prof as any).zemda_personal_enabled, 'ZemdaPersonal');
  addIf((prof as any).zemda_med_enabled, 'ZemdaMed');
  addIf((prof as any).zemda_estetic_enabled, 'ZemdaEstetic');

  // 3. Capacitação estética (HOF, especialização estética, permissão, practiceAreaIds)
  const isDentist = primary === 'ZemdaOdonto' || pId.includes('dent') || pName.includes('dent');
  const isFisio = primary === 'ZemdaFisio' || pId.includes('fisio') || pName.includes('fisio');
  const isBiomed = pId.includes('biomed') || pName.includes('bioméd');
  const isFarm = pId.includes('farm') || pName.includes('farmác');
  const isMed = primary === 'ZemdaMed' || pId.includes('med') || pName.includes('méd');
  const isEstet = primary === 'ZemdaEstetic' || pId.includes('estet') || pName.includes('estet');

  const aestheticPracticeAreaIds = [
    'pa-odonto-estetica',
    'pa-estet-facial',
    'pa-estet-corporal',
    'pa-estet-capilar',
    'pa-biomed-estetica',
    'pa-farm-estetica'
  ];

  const isMatchingAuthUser = Boolean(
    authContext?.currentUser && (
      authContext.currentUser.professionalId === prof.id ||
      authContext.currentUser.id === prof.user_id ||
      (authContext.currentUser.name && prof.name && authContext.currentUser.name.trim().toLowerCase() === prof.name.trim().toLowerCase())
    )
  );

  const authHasEstetic = isMatchingAuthUser && Boolean(
    authContext?.isZemdaEstetic ||
    authContext?.currentUser?.zemdaEsteticEnabled ||
    authContext?.currentUser?.practiceAreaIds?.some((pa: string) => aestheticPracticeAreaIds.includes(pa)) ||
    authContext?.currentUser?.capabilities?.some((c: string) => c.startsWith('ESTETIC_')) ||
    authContext?.userPermissions?.includes('access_zemda_estetic')
  );

  const profAreaIds = Array.isArray((prof as any).practiceAreaIds) ? (prof as any).practiceAreaIds : [];
  const hasAestheticAreaId = aestheticPracticeAreaIds.some(id =>
    profAreaIds.includes(id) || areas.includes(id) || spec.includes(id)
  );

  const hasAestheticSignal =
    authHasEstetic ||
    hasAestheticAreaId ||
    (prof as any).zemda_estetic_enabled === 1 ||
    (prof as any).zemdaEsteticEnabled === true ||
    spec.includes('estet') ||
    spec.includes('harmoniz') ||
    spec.includes('hof') ||
    spec.includes('facial') ||
    areas.includes('estet') ||
    areas.includes('harmoniz') ||
    areas.includes('hof') ||
    areas.includes('facial') ||
    pName.includes('hof') ||
    pName.includes('harmoniz');

  if (hasAestheticSignal && (isDentist || isFisio || isBiomed || isFarm || isEstet || isMed)) {
    addIf(true, 'ZemdaEstetic');
  }

  // 4. Somente se não houver NENHUM módulo clínico específico, e a profissão for geral/apoio, retorna 'general'
  if (modules.length === 0) {
    return [{ code: 'general', label: 'Geral' }];
  }

  return modules;
};

export const getCompatibleSpecialties = (
  allSpecialties: Specialty[],
  prof: Professional | undefined | null,
  moduleCode: string | null | undefined
): Specialty[] => {
  if (!allSpecialties || allSpecialties.length === 0) return [];

  const targetModule = moduleCode || (prof ? getModulesForProfessional(prof)[0]?.code : null);

  let filtered: Specialty[] = [];

  const isDentist = prof && (
    (prof.profession_id || '').toLowerCase().includes('dent') ||
    (prof.profession_name || '').toLowerCase().includes('dent')
  );
  const isFisio = prof && (
    (prof.profession_id || '').toLowerCase().includes('fisio') ||
    (prof.profession_name || '').toLowerCase().includes('fisio')
  );

  if (targetModule === 'ZemdaEstetic') {
    // Especialidades e áreas estéticas permitidas para o contexto
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      const sid = (s.id || '').toLowerCase();
      const sname = (s.name || '').toLowerCase();

      // Bloquear profissões de saúde não compatíveis com este profissional
      if ([
        'prof-biomedicina', 'prof-farmacia', 'prof-enfermeiro', 'prof-doula',
        'prof-fonoaudiologo', 'prof-nutricionista', 'prof-psicologo',
        'prof-arteterapia', 'prof-musicoterapia', 'prof-psicopedagogo',
        'prof-terapeuta-ocupacional', 'prof-personal-trainer'
      ].includes(pid)) {
        if (prof?.profession_id?.toLowerCase() !== pid) {
          return false;
        }
      }

      // Fisioterapia Dermatofuncional só para fisioterapeuta
      if (pid === 'prof-fisioterapeuta' && !isFisio) {
        return false;
      }

      const isAesthetic =
        pid === 'prof-esteticista' ||
        sid.includes('pa-odonto-estetica') ||
        sid.includes('spec-odonto-hof') ||
        sid.includes('estet') ||
        sid.includes('hof') ||
        sname.includes('estética') ||
        sname.includes('estetica') ||
        sname.includes('harmonização') ||
        sname.includes('harmonizacao') ||
        sname.includes('dermatofuncional');

      if (!isAesthetic) return false;

      // Se for Cirurgião-Dentista atendendo em ZemdaEstetic:
      // Focar em Harmonização Orofacial / Harmonização Facial / Estética Facial
      if (isDentist) {
        if (
          sname.includes('corporal') ||
          sname.includes('pós-operatório') ||
          sname.includes('pos-operatorio') ||
          sname.includes('spaterapia')
        ) {
          return false;
        }
      }

      return true;
    });
  } else if (targetModule === 'ZemdaOdonto') {
    // Especialidades odontológicas
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      return pid === 'prof-dentista';
    });
  } else if (targetModule === 'ZemdaFisio') {
    // Especialidades de Fisioterapia e Instrutor (Pilates e modalidades)
    filtered = allSpecialties.filter(s => {
      const pid = (s.profession_id || '').toLowerCase();
      return pid === 'prof-fisioterapeuta' || pid === 'prof-instrutor' || pid === 'prof-instrutor-pilates' || pid === 'pilates_instructor';
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
  } else if (targetModule === 'general') {
    // Somente especialidades compatíveis com a profissão do profissional
    if (prof?.profession_id) {
      const rawPid = prof.profession_id.toLowerCase();
      filtered = allSpecialties.filter(s => (s.profession_id || '').toLowerCase() === rawPid);
    }
  }

  // Deduplicar especialidades por nome normalizado
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
  const { currentUser, currentTenant, isZemdaEstetic, userPermissions } = useAuth();
  const establishmentProfile = normalizeEstablishmentProfile(currentTenant?.establishment_profile);
  const isStudioCompatible = supportsStudioFeatures(establishmentProfile);
  const isMixed = isMixedProfile(establishmentProfile);
  const isPureStudio = isStudioProfile(establishmentProfile);
  const [services, setServices] = useState<Service[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [packagesError, setPackagesError] = useState<string | null>(null);
  const [showPackageModal, setShowPackageModal] = useState<boolean>(false);
  const [editingPackage, setEditingPackage] = useState<any | null>(null);
  const [selectedProfFilter, setSelectedProfFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);

  const authContext = useMemo(() => ({
    currentUser,
    isZemdaEstetic,
    userPermissions
  }), [currentUser, isZemdaEstetic, userPermissions]);

  // Modal Novo Serviço
  const [showServiceModal, setShowServiceModal] = useState<boolean>(false);
  const [professionalId, setProfessionalId] = useState<string>('');
  const [linkedProfessionalIds, setLinkedProfessionalIds] = useState<string[]>([]);
  const [clinicalModule, setClinicalModule] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [specialtyId, setSpecialtyId] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(50);
  const [bufferMinutes, setBufferMinutes] = useState<number>(10);
  const [price, setPrice] = useState<string>('180.00');
  const [modality, setModality] = useState<'both' | 'presential' | 'online' | 'home'>('both');
  const [serviceDomain, setServiceDomain] = useState<ServiceDomain>(isPureStudio ? 'studio' : 'clinical');
  const [serviceKind, setServiceKind] = useState<'individual' | 'group'>('individual');
  const [defaultCapacity, setDefaultCapacity] = useState<number>(10);
  const [allowRecurrence, setAllowRecurrence] = useState<boolean>(true);
  const [allowedFrequencies, setAllowedFrequencies] = useState<RecurrenceFrequency[]>(['weekly']);
  const [defaultFrequency, setDefaultFrequency] = useState<RecurrenceFrequency>('weekly');
  const [draftClassSchedules, setDraftClassSchedules] = useState<DraftClassScheduleInput[]>([]);
  const [hasPendingCreateScheduleForm, setHasPendingCreateScheduleForm] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(false);
  const [reminderValue, setReminderValue] = useState<number>(30);
  const [reminderUnit, setReminderUnit] = useState<'DAYS' | 'MONTHS' | 'YEARS'>('DAYS');

  // Modal Editar Serviço
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editProfessionalId, setEditProfessionalId] = useState<string>('');
  const [editLinkedProfessionalIds, setEditLinkedProfessionalIds] = useState<string[]>([]);
  const [editClinicalModule, setEditClinicalModule] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editSpecialtyId, setEditSpecialtyId] = useState<string>('');
  const [editDurationMinutes, setEditDurationMinutes] = useState<number>(50);
  const [editBufferMinutes, setEditBufferMinutes] = useState<number>(10);
  const [editPrice, setEditPrice] = useState<string>('180.00');
  const [editModality, setEditModality] = useState<'both' | 'presential' | 'online' | 'home'>('both');
  const [editServiceDomain, setEditServiceDomain] = useState<ServiceDomain>(isPureStudio ? 'studio' : 'clinical');
  const [editServiceKind, setEditServiceKind] = useState<'individual' | 'group'>('individual');
  const [editDefaultCapacity, setEditDefaultCapacity] = useState<number>(10);
  const [editAllowRecurrence, setEditAllowRecurrence] = useState<boolean>(true);
  const [editAllowedFrequencies, setEditAllowedFrequencies] = useState<RecurrenceFrequency[]>(['weekly']);
  const [editDefaultFrequency, setEditDefaultFrequency] = useState<RecurrenceFrequency>('weekly');
  const [editDraftClassSchedules, setEditDraftClassSchedules] = useState<DraftClassScheduleInput[]>([]);
  const [hasPendingEditScheduleForm, setHasPendingEditScheduleForm] = useState<boolean>(false);

  const showCreateStudioConfig = isPureStudio || (isMixed && serviceDomain === 'studio');
  const showEditStudioConfig = isPureStudio || (isMixed && editServiceDomain === 'studio');
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
    return getModulesForProfessional(selectedProfForCreate, authContext);
  }, [selectedProfForCreate, authContext]);

  const createCompatibleSpecialties = useMemo(() => {
    return getCompatibleSpecialties(specialties, selectedProfForCreate, clinicalModule);
  }, [specialties, selectedProfForCreate, clinicalModule]);

  const selectedProfForEdit = useMemo(() => {
    return professionals.find(p => p.id === editProfessionalId) || null;
  }, [professionals, editProfessionalId]);

  const editAvailableModules = useMemo(() => {
    return getModulesForProfessional(selectedProfForEdit, authContext);
  }, [selectedProfForEdit, authContext]);

  const editCompatibleSpecialties = useMemo(() => {
    return getCompatibleSpecialties(specialties, selectedProfForEdit, editClinicalModule);
  }, [specialties, selectedProfForEdit, editClinicalModule]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setPackagesError(null);
      let pkgFetchError: string | null = null;
      const [srvs, rms, specs, profs, pkgRes] = await Promise.all([
        ApiClient.get<Service[]>('/v1/services'),
        ApiClient.get<Room[]>('/v1/rooms'),
        ApiClient.get<Specialty[]>('/v1/taxonomy/specialties'),
        ApiClient.get<Professional[]>('/v1/professionals').catch(() => []),
        isStudioCompatible
          ? ApiClient.get<{ isStudioCompatible: boolean; packages: any[] }>('/v1/packages?includeInactive=1').catch((err: any) => {
              pkgFetchError = err?.message || 'Não foi possível carregar os pacotes de serviços.';
              return null;
            })
          : Promise.resolve({ isStudioCompatible: false, packages: [] })
      ]);
      setServices(srvs || []);
      setRooms(rms || []);
      setSpecialties(specs || []);
      if (isStudioCompatible) {
        if (pkgFetchError) {
          setPackagesError(pkgFetchError);
          setPackages([]);
        } else {
          setPackages(pkgRes?.packages || []);
        }
      } else {
        setPackages([]);
      }
      const profList = Array.isArray(profs) ? profs : [];
      setProfessionals(profList);
      if (profList.length > 0 && (!professionalId || !profList.some(p => p.id === professionalId))) {
        setProfessionalId(profList[0].id);
        setLinkedProfessionalIds([profList[0].id]);
        const mods = getModulesForProfessional(profList[0], authContext);
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
    setServices([]);
    setPackages([]);
    setPackagesError(null);
    setSelectedProfFilter('all');
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchData();
    const handleAppointmentUpdated = () => {
      fetchData();
    };
    window.addEventListener('zemda-appointment-updated', handleAppointmentUpdated);
    return () => {
      window.removeEventListener('zemda-appointment-updated', handleAppointmentUpdated);
    };
  }, [currentTenant?.id, establishmentProfile]);

  const handleSelectProfessional = (newProfId: string) => {
    setProfessionalId(newProfId);
    if (newProfId) {
      setLinkedProfessionalIds(prev => Array.from(new Set([newProfId, ...prev])));
    }
    const prof = professionals.find(p => p.id === newProfId);
    const mods = getModulesForProfessional(prof, authContext);
    
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
    if (newProfId) {
      setEditLinkedProfessionalIds(prev => Array.from(new Set([newProfId, ...prev])));
    }
    const prof = professionals.find(p => p.id === newProfId);
    const mods = getModulesForProfessional(prof, authContext);
    
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

    if (showCreateStudioConfig && serviceKind === 'group' && hasPendingCreateScheduleForm) {
      showToast('Confirme ou cancele o horário aberto na grade semanal antes de salvar a aula.', 'error');
      return;
    }

    try {
      const effectiveKind = showCreateStudioConfig ? serviceKind : 'individual';
      const normalizedCreateLinked = showCreateStudioConfig
        ? Array.from(new Set([professionalId, ...linkedProfessionalIds].filter(Boolean)))
        : [professionalId];
      const createdRes = await ApiClient.post<any>('/v1/services', {
        professionalId,
        ...(showCreateStudioConfig ? { linkedProfessionalIds: normalizedCreateLinked } : {}),
        clinicalModule: clinicalModule || null,
        name: name.trim(),
        specialtyId: specialtyId || null,
        durationMinutes: Number(durationMinutes),
        bufferMinutes: Number(bufferMinutes),
        price: Number(price),
        modality,
        serviceKind: effectiveKind,
        defaultCapacity: effectiveKind === 'group' ? Number(defaultCapacity) : null,
        allowRecurrence,
        ...(isStudioCompatible ? { serviceDomain: showCreateStudioConfig ? 'studio' : 'clinical' } : {}),
        ...(showCreateStudioConfig
          ? {
              allowedRecurrenceFrequencies: allowRecurrence ? allowedFrequencies : [],
              defaultRecurrenceFrequency: allowRecurrence ? defaultFrequency : null
            }
          : {}),
        classSchedules: showCreateStudioConfig && effectiveKind === 'group' ? draftClassSchedules : undefined,
        description: description || null,
        reminderEnabled,
        reminderValue: reminderEnabled ? Number(reminderValue) : null,
        reminderUnit: reminderEnabled ? reminderUnit : 'DAYS'
      });

      const activeSchedsCount = Array.isArray(createdRes?.class_schedules)
        ? createdRes.class_schedules.filter((cs: any) => Number(cs.active) !== 0).length
        : 0;
      if (showCreateStudioConfig && effectiveKind === 'group' && activeSchedsCount === 0) {
        showToast(
          'Aula salva como rascunho interno! Adicione pelo menos um dia e horário para disponibilizá-la no agendamento online.',
          'info'
        );
      } else {
        showToast('Serviço cadastrado com sucesso!', 'success');
      }
      if (Array.isArray(createdRes?.schedule_warnings) && createdRes.schedule_warnings.length > 0) {
        showToast(createdRes.schedule_warnings[0], 'info');
      }
      setShowServiceModal(false);
      setName('');
      setServiceDomain(isPureStudio ? 'studio' : 'clinical');
      setServiceKind('individual');
      setDefaultCapacity(10);
      setAllowRecurrence(true);
      setAllowedFrequencies(['weekly']);
      setDefaultFrequency('weekly');
      setDraftClassSchedules([]);
      setLinkedProfessionalIds(professionalId ? [professionalId] : []);
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
    const mods = getModulesForProfessional(prof, authContext);
    
    let targetMod = s.clinical_module || '';
    if (!targetMod) {
      if (mods.length === 1) {
        targetMod = mods[0].code;
      } else if (mods.length > 0) {
        targetMod = mods[0].code;
      }
    }
    setEditClinicalModule(targetMod);

    const domain = resolveServiceDomain({
      establishmentProfile,
      serviceDomain: s.service_domain,
      serviceKind: s.service_kind,
      clinicalModule: s.clinical_module
    });
    const recCfg = parseServiceRecurrenceConfig(s);
    setEditName(s.name);
    setEditSpecialtyId(s.specialty_id || '');
    setEditDurationMinutes(s.duration_minutes || 50);
    setEditBufferMinutes(s.buffer_minutes || 10);
    setEditPrice(s.price !== undefined && s.price !== null ? String(s.price) : '0.00');
    setEditModality(s.modality || 'both');
    setEditServiceDomain(domain);
    setEditServiceKind(domain === 'studio' && s.service_kind === 'group' ? 'group' : 'individual');
    setEditDefaultCapacity(Number(s.default_capacity) || 10);
    setEditAllowRecurrence(recCfg.allowRecurrence);
    setEditAllowedFrequencies(
      recCfg.hasExplicitConfig
        ? recCfg.allowedFrequencies
        : (recCfg.allowRecurrence ? ['weekly'] : [])
    );
    setEditDefaultFrequency(recCfg.defaultFrequency || 'weekly');
    setEditDraftClassSchedules([]);
    setHasPendingEditScheduleForm(false);
    setEditDescription(s.description || '');
    const existingEditLinked = Array.isArray(s.linked_professional_ids) && s.linked_professional_ids.length > 0
      ? s.linked_professional_ids
      : (profId ? [profId] : []);
    setEditLinkedProfessionalIds(Array.from(new Set([profId, ...existingEditLinked].filter(Boolean))));
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

    if (showEditStudioConfig && editServiceKind === 'group' && hasPendingEditScheduleForm) {
      showToast('Confirme ou cancele o horário aberto na grade semanal antes de salvar.', 'error');
      return;
    }

    try {
      setUpdating(true);
      const effectiveEditKind = showEditStudioConfig ? editServiceKind : 'individual';
      const normalizedEditLinked = showEditStudioConfig
        ? Array.from(new Set([editProfessionalId, ...editLinkedProfessionalIds].filter(Boolean)))
        : [editProfessionalId];
      const shouldSendEditDraftSchedules =
        showEditStudioConfig &&
        effectiveEditKind === 'group' &&
        editingService.service_kind !== 'group' &&
        editDraftClassSchedules.length > 0;
      const updRes = await ApiClient.put<any>(`/v1/services/${editingService.id}`, {
        professionalId: editProfessionalId,
        ...(showEditStudioConfig ? { linkedProfessionalIds: normalizedEditLinked } : {}),
        clinicalModule: editClinicalModule || null,
        name: editName.trim(),
        specialtyId: editSpecialtyId || null,
        durationMinutes: Number(editDurationMinutes),
        bufferMinutes: Number(editBufferMinutes),
        price: Number(editPrice),
        modality: editModality,
        serviceKind: effectiveEditKind,
        defaultCapacity: effectiveEditKind === 'group' ? Number(editDefaultCapacity) : null,
        allowRecurrence: editAllowRecurrence,
        ...(isStudioCompatible ? { serviceDomain: showEditStudioConfig ? 'studio' : 'clinical' } : {}),
        ...(showEditStudioConfig
          ? {
              allowedRecurrenceFrequencies: editAllowRecurrence ? editAllowedFrequencies : [],
              defaultRecurrenceFrequency: editAllowRecurrence ? editDefaultFrequency : null
            }
          : {}),
        ...(shouldSendEditDraftSchedules ? { classSchedules: editDraftClassSchedules } : {}),
        description: editDescription || null,
        active: editActive ? 1 : 0,
        reminderEnabled: editReminderEnabled,
        reminderValue: editReminderEnabled ? Number(editReminderValue) : null,
        reminderUnit: editReminderEnabled ? editReminderUnit : 'DAYS'
      });

      const updSchedulesCount = Array.isArray(updRes?.class_schedules)
        ? updRes.class_schedules.filter((cs: any) => Number(cs.active) !== 0).length
        : 0;
      if (showEditStudioConfig && effectiveEditKind === 'group' && updSchedulesCount === 0) {
        showToast(
          'Aula atualizada como rascunho interno. Adicione dias e horários para disponibilizá-la no agendamento online.',
          'info'
        );
      } else {
        showToast('Serviço atualizado com sucesso!', 'success');
      }
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

    // Se filtrou por um profissional específico, inclui serviços em que ele é responsável OU instrutor vinculado
    if (selectedProfFilter !== 'all') {
      const prof = profMap.get(selectedProfFilter);
      return [{
        profId: selectedProfFilter,
        profName: prof?.name || 'Profissional',
        professionName: prof?.profession_name || '',
        items: services.filter(
          s => s.professional_id === selectedProfFilter || s.linked_professional_ids?.includes(selectedProfFilter)
        )
      }];
    }

    // Se 'Todos', agrupa em seções pelo profissional responsável (sem duplicar o card do serviço compartilhado)
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

  const selectableCreateScheduleProfessionals = useMemo(() => {
    const activeIds = new Set([professionalId, ...linkedProfessionalIds].filter(Boolean));
    const matched = professionals.filter(p => activeIds.has(p.id));
    return matched.length > 0 ? matched : professionals;
  }, [professionals, professionalId, linkedProfessionalIds]);

  const selectableEditScheduleProfessionals = useMemo(() => {
    const activeIds = new Set([editProfessionalId, ...editLinkedProfessionalIds].filter(Boolean));
    const matched = professionals.filter(p => activeIds.has(p.id));
    return matched.length > 0 ? matched : professionals;
  }, [professionals, editProfessionalId, editLinkedProfessionalIds]);

  const lockedEditInstructorIds = useMemo(() => {
    if (!editingService?.class_schedules) return [];
    return Array.from(
      new Set(
        editingService.class_schedules
          .filter(cs => Number(cs.active) !== 0)
          .map(cs => cs.professional_id)
          .filter(Boolean)
      )
    );
  }, [editingService]);

  const handleOpenCreateModalForProf = (profId?: string | null, initialKind: 'individual' | 'group' = 'individual') => {
    setServiceKind(initialKind);
    setHasPendingCreateScheduleForm(false);
    const targetId = profId || (professionals.length > 0 ? professionals[0].id : '');
    if (targetId) {
      handleSelectProfessional(targetId);
      setLinkedProfessionalIds([targetId]);
    } else {
      setLinkedProfessionalIds([]);
    }
    setDraftClassSchedules([]);
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
          {isStudioCompatible ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  handleOpenCreateModalForProf(selectedProfFilter !== 'all' ? selectedProfFilter : null, 'individual');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Serviço Individual
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isMixed) setServiceDomain('studio');
                  handleOpenCreateModalForProf(selectedProfFilter !== 'all' ? selectedProfFilter : null, 'group');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" /> Aula Coletiva
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingPackage(null);
                  setShowPackageModal(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Package className="w-4 h-4" /> Criar Pacote de Serviços
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleOpenCreateModalForProf(selectedProfFilter !== 'all' ? selectedProfFilter : null)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Novo Serviço
            </button>
          )}
        </div>

        {/* Filtros e Seletores por Profissional */}
        {professionals.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs mobile-wrap">
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
              const count = services.filter(
                s => s.professional_id === p.id || s.linked_professional_ids?.includes(p.id)
              ).length;
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
                                {s.service_kind === 'group' && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-full inline-block">
                                    Turma • {s.default_capacity || 1} vagas
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
                          {isStudioCompatible && Array.isArray(s.linked_professionals) && s.linked_professionals.length > 1 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-slate-600">
                              <span className="font-bold text-slate-700 inline-flex items-center gap-1">
                                <Users className="w-3 h-3 text-teal-600" />
                                Instrutores ({s.linked_professionals.length}):
                              </span>
                              <span>
                                {s.linked_professionals.map(lp => lp.name).join(', ')}
                              </span>
                            </div>
                          )}
                          {isStudioCompatible && s.service_kind === 'group' && (
                            <div
                              className={`mt-2.5 p-2 rounded-xl border text-[11px] space-y-0.5 ${
                                !s.weekly_schedule_summary?.length || (s.schedule_diagnostics && s.schedule_diagnostics.publishableCount === 0)
                                  ? 'bg-amber-50/70 border-amber-200'
                                  : 'bg-teal-50/70 border-teal-100'
                              }`}
                            >
                              <div
                                className={`font-bold flex items-center justify-between gap-1 ${
                                  !s.weekly_schedule_summary?.length || (s.schedule_diagnostics && s.schedule_diagnostics.publishableCount === 0)
                                    ? 'text-amber-800'
                                    : 'text-teal-800'
                                }`}
                              >
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  Grade semanal
                                </span>
                                {(!s.weekly_schedule_summary?.length || (s.schedule_diagnostics && s.schedule_diagnostics.publishableCount === 0)) && (
                                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                    Sem horários públicos
                                  </span>
                                )}
                              </div>
                              {Array.isArray(s.weekly_schedule_summary) && s.weekly_schedule_summary.length > 0 ? (
                                <>
                                  {s.weekly_schedule_summary.slice(0, 3).map((item, idx) => (
                                    <p key={idx} className="text-slate-700 truncate" title={item.text}>
                                      • {item.weekdaysLabel} — {item.timeRange} ({item.professionalName})
                                    </p>
                                  ))}
                                  {s.schedule_diagnostics && s.schedule_diagnostics.publishableCount === 0 && s.schedule_diagnostics.blockers[0] && (
                                    <p className="text-[10px] text-amber-700 font-medium pt-0.5">
                                      {s.schedule_diagnostics.blockers[0]}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <p className="text-amber-800 font-medium">
                                  Esta aula ainda não possui dias e horários cadastrados. Edite para adicionar à grade pública.
                                </p>
                              )}
                            </div>
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

      {/* Pacotes de Serviços (Studios / Mistos) */}
      {isStudioCompatible && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" />
                Pacotes de Serviços e Planos
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Combine modalidades e instrutores distintos em mensalidades únicas ou pacotes fechados sem cobrar sessão individual.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingPackage(null);
                setShowPackageModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" /> Novo Pacote
            </button>
          </div>

          {packagesError ? (
            <div className="bg-amber-50 p-5 rounded-2xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
              <span>{packagesError}</span>
              <button
                type="button"
                onClick={() => fetchData()}
                className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 font-bold text-amber-900 hover:bg-amber-100 cursor-pointer self-start sm:self-auto"
              >
                Tentar novamente
              </button>
            </div>
          ) : packages.length === 0 ? (
            <div className="bg-white p-6 rounded-2xl border border-dashed border-slate-300 text-center space-y-2 text-xs text-slate-500">
              <p>Nenhum pacote cadastrado ainda neste Studio. Crie pacotes de Pilates, Dança, Zumba ou planos livres combinados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {packages.map(pkg => (
                <div
                  key={pkg.id}
                  className={`bg-white p-5 rounded-2xl border shadow-xs flex flex-col justify-between gap-4 transition-all ${
                    pkg.active ? 'border-slate-200 hover:border-indigo-300' : 'border-slate-200 opacity-70 bg-slate-50'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="font-bold text-slate-900 text-base truncate">{pkg.name}</h4>
                          {!pkg.active && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                              Inativo
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {pkg.billing_type === 'recurring_monthly' ? 'Mensalidade recorrente' : `Pagamento único (${pkg.installments_count || 1}x)`}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">
                            {pkg.credit_mode === 'shared_pool' ? `Livre • ${pkg.total_credits} aulas` : `Por serviço • ${pkg.total_credits} aulas`}
                          </span>
                        </div>
                      </div>
                      <span className="text-sm font-extrabold text-indigo-600 whitespace-nowrap">
                        {Number(pkg.price || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>

                    {pkg.description && <p className="text-xs text-slate-500 line-clamp-2">{pkg.description}</p>}

                    <div className="space-y-1 pt-1">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Modalidades incluídas</div>
                      <div className="space-y-1">
                        {(pkg.items || []).map((it: any) => (
                          <div key={it.id} className="text-xs flex items-center justify-between gap-2 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                            <div className="min-w-0">
                              <span className="font-semibold text-slate-800 truncate block">{it.service_name}</span>
                              {it.service_professional_name && (
                                <span className="text-[10px] text-slate-500">Prof: {it.service_professional_name}</span>
                              )}
                            </div>
                            <span className="text-[11px] font-bold text-indigo-700 shrink-0">
                              {pkg.credit_mode === 'shared_pool'
                                ? 'Pool livre'
                                : `${it.included_credits} aula${Number(it.included_credits) === 1 ? '' : 's'}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Validade: <strong>{pkg.validity_days || 30}d</strong> • Falta:{' '}
                      <strong>{pkg.absent_consumption_policy === 'refund' ? 'Restitui' : 'Consome'}</strong>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPackage(pkg);
                          setShowPackageModal(true);
                        }}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                        title="Editar Pacote"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {Boolean(pkg.active) && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await ApiClient.delete(`/v1/packages/${pkg.id}`);
                              showToast('Pacote inativado no catálogo.', 'success');
                              fetchData();
                            } catch (err: any) {
                              showToast(err?.message || 'Erro ao inativar pacote.', 'error');
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="Inativar Pacote"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
      {/* Modal Novo Serviço */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden mobile-modal">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header Fixo / Sticky */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-white">
              <h3 className="text-lg font-bold text-slate-900">Novo Serviço</h3>
              <button aria-label="Fechar"
                type="button"
                onClick={() => setShowServiceModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="p-6 overflow-y-auto flex-1 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Profissional Responsável *</label>
                <select
                  value={professionalId}
                  onChange={e => handleSelectProfessional(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium cursor-pointer"
                  required
                >
                  <option value="">Selecione o profissional...</option>
                  {professionals.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.profession_name ? `(${p.profession_name})` : ''}
                    </option>
                  ))}
                </select>

                {showCreateStudioConfig && (
                  <div className="mt-2">
                    <LinkedInstructorsSelector
                      professionals={professionals}
                      primaryProfessionalId={professionalId}
                      selectedIds={linkedProfessionalIds}
                      onChange={setLinkedProfessionalIds}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Módulo do atendimento *</span>
                  {createAvailableModules.length === 1 && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      {createAvailableModules[0].code === 'general' ? 'Workspace Geral da Clínica' : 'Módulo único do profissional'}
                    </span>
                  )}
                  {createAvailableModules.length > 1 && (
                    <span className="text-[10px] text-indigo-600 font-semibold">
                      {createAvailableModules.length} módulos disponíveis
                    </span>
                  )}
                </label>
                <select
                  value={clinicalModule}
                  onChange={e => handleSelectModule(e.target.value)}
                  disabled={createAvailableModules.length <= 1}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 font-medium disabled:opacity-80 disabled:cursor-not-allowed cursor-pointer"
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
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 cursor-pointer"
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
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-slate-50 cursor-pointer"
                >
                  <option value="both">Presencial ou Online</option>
                  <option value="presential">Apenas Presencial</option>
                  <option value="online">Apenas Online</option>
                  <option value="home">Domiciliar</option>
                </select>
              </div>

              {isMixed && (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-800 text-xs">Segmento do Serviço</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setServiceDomain('clinical');
                        setServiceKind('individual');
                      }}
                      className={`px-3 py-2 rounded-xl border text-left font-semibold cursor-pointer transition-all ${
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
                      className={`px-3 py-2 rounded-xl border text-left font-semibold cursor-pointer transition-all ${
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

              {showCreateStudioConfig ? (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="font-bold text-slate-800 text-xs">Configurações do Studio</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setServiceKind('individual')}
                      className={`px-3 py-2 rounded-xl border text-left font-semibold cursor-pointer transition-all ${
                        serviceKind === 'individual'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() => setServiceKind('group')}
                      className={`px-3 py-2 rounded-xl border text-left font-semibold cursor-pointer transition-all ${
                        serviceKind === 'group'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Aula coletiva / Turma
                    </button>
                  </div>
                  {serviceKind === 'group' && (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Vagas por aula/turma *</label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        step="1"
                        value={defaultCapacity}
                        onChange={e => setDefaultCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                      />
                    </div>
                  )}
                  {serviceKind === 'group' && (
                    <ClassScheduleSection
                      serviceId={null}
                      serviceModality={modality}
                      durationMinutes={Number(durationMinutes) || 50}
                      defaultCapacity={Number(defaultCapacity) || 10}
                      defaultProfessionalId={professionalId}
                      professionals={selectableCreateScheduleProfessionals}
                      rooms={rooms}
                      draftSchedules={draftClassSchedules}
                      onDraftSchedulesChange={setDraftClassSchedules}
                      onFormOpenChange={setHasPendingCreateScheduleForm}
                    />
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
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowRecurrence}
                      onChange={e => setAllowRecurrence(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300"
                    />
                    <span>Permitir agendamentos recorrentes neste serviço</span>
                  </label>
                </div>
              )}

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
                      Após a realização deste serviço, o Zemda avisará você no Painel para entrar em contato com o paciente.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Fixo */}
            <div className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-slate-100 flex-shrink-0 bg-slate-50/80">
              <button
                type="button"
                onClick={() => setShowServiceModal(false)}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateService}
                className="px-6 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs cursor-pointer"
              >
                Salvar Serviço
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Sala */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Nova Sala</h3>
              <button aria-label="Fechar" onClick={() => setShowRoomModal(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-hidden mobile-modal">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header Fixo */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900">Editar Serviço</h3>
                <p className="text-xs text-slate-500">Altere os dados do atendimento ou regras de retorno</p>
              </div>
              <button aria-label="Fechar"
                onClick={() => setEditingService(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="p-6 overflow-y-auto flex-1 space-y-3.5 text-xs">
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

                {showEditStudioConfig && (
                  <div className="mt-2">
                    <LinkedInstructorsSelector
                      professionals={professionals}
                      primaryProfessionalId={editProfessionalId}
                      selectedIds={editLinkedProfessionalIds}
                      onChange={setEditLinkedProfessionalIds}
                      lockedIds={lockedEditInstructorIds}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Módulo do atendimento *</span>
                  {editAvailableModules.length === 1 && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      {editAvailableModules[0].code === 'general' ? 'Workspace Geral da Clínica' : 'Módulo único do profissional'}
                    </span>
                  )}
                  {editAvailableModules.length > 1 && (
                    <span className="text-[10px] text-indigo-600 font-semibold">
                      {editAvailableModules.length} módulos disponíveis
                    </span>
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

              {isMixed && (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-800 text-xs">Segmento do Serviço</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditServiceDomain('clinical');
                        setEditServiceKind('individual');
                      }}
                      className={`px-3 py-2 rounded-xl border text-left font-semibold cursor-pointer transition-all ${
                        editServiceDomain === 'clinical'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Atendimento Clínico
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditServiceDomain('studio')}
                      className={`px-3 py-2 rounded-xl border text-left font-semibold cursor-pointer transition-all ${
                        editServiceDomain === 'studio'
                          ? 'border-teal-600 bg-teal-50 text-teal-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Aula / Serviço de Studio
                    </button>
                  </div>
                </div>
              )}

              {showEditStudioConfig ? (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="font-bold text-slate-800 text-xs">Configurações do Studio</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditServiceKind('individual')}
                      className={`px-3 py-2 rounded-xl border text-left font-semibold cursor-pointer transition-all ${
                        editServiceKind === 'individual'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Individual
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditServiceKind('group')}
                      className={`px-3 py-2 rounded-xl border text-left font-semibold cursor-pointer transition-all ${
                        editServiceKind === 'group'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Aula coletiva / Turma
                    </button>
                  </div>
                  {editServiceKind === 'group' && (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Vagas por aula/turma *</label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        step="1"
                        value={editDefaultCapacity}
                        onChange={e => setEditDefaultCapacity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
                      />
                    </div>
                  )}
                  {editServiceKind === 'group' && editingService && (
                    <ClassScheduleSection
                      serviceId={editingService.service_kind === 'group' ? editingService.id : null}
                      serviceModality={editModality}
                      durationMinutes={Number(editDurationMinutes) || 50}
                      defaultCapacity={Number(editDefaultCapacity) || 10}
                      defaultProfessionalId={editProfessionalId}
                      professionals={selectableEditScheduleProfessionals}
                      rooms={rooms}
                      draftSchedules={editDraftClassSchedules}
                      onDraftSchedulesChange={setEditDraftClassSchedules}
                      onFormOpenChange={setHasPendingEditScheduleForm}
                      onSchedulesChanged={(nextSchedules, nextSummary, nextDiag) => {
                        setEditingService(prev =>
                          prev
                            ? {
                                ...prev,
                                class_schedules: nextSchedules,
                                weekly_schedule_summary: nextSummary,
                                schedule_diagnostics: nextDiag ?? null
                              }
                            : prev
                        );
                        setServices(prev =>
                          prev.map(item =>
                            item.id === editingService.id
                              ? {
                                  ...item,
                                  class_schedules: nextSchedules,
                                  weekly_schedule_summary: nextSummary,
                                  schedule_diagnostics: nextDiag ?? null
                                }
                              : item
                          )
                        );
                      }}
                    />
                  )}
                  <ServiceRecurrenceConfigPanel
                    allowRecurrence={editAllowRecurrence}
                    allowedFrequencies={editAllowedFrequencies}
                    defaultFrequency={editDefaultFrequency}
                    onChange={next => {
                      setEditAllowRecurrence(next.allowRecurrence);
                      setEditAllowedFrequencies(next.allowedFrequencies);
                      setEditDefaultFrequency(next.defaultFrequency);
                    }}
                  />
                </div>
              ) : (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editAllowRecurrence}
                      onChange={e => setEditAllowRecurrence(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300"
                    />
                    <span>Permitir agendamentos recorrentes neste serviço</span>
                  </label>
                </div>
              )}

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
                      Após a realização deste serviço, o Zemda avisará você no Painel para entrar em contato com o paciente.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Fixo */}
            <div className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-slate-100 flex-shrink-0 bg-slate-50/80">
              <button
                type="button"
                onClick={() => setEditingService(null)}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer"
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
      )}

      {/* Modal Confirmar Exclusão ou Inativação */}
      {serviceToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 mobile-modal">
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

      <PackageModal
        isOpen={showPackageModal}
        onClose={() => {
          setShowPackageModal(false);
          setEditingPackage(null);
        }}
        onSuccess={fetchData}
        services={services}
        professionals={professionals}
        editingPackage={editingPackage}
      />
    </div>
  );
};
