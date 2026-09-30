import { MedicalComparison } from './shared/MedicalComparison';
import { ClinicalDraftRecoveryModal } from '../clinical/ClinicalDraftRecoveryModal';
import { ClinicalSnapshot } from '../clinical/ClinicalSnapshot';
import { MedicalCapabilityTools } from './shared/MedicalCapabilityTools';
import { MedicalTrends } from './shared/MedicalTrends';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SpecialtySectionRenderer } from './specialties/SpecialtySectionRenderer';
import { InternalMedicineRenderer } from './specialties/SpecialtyCustomRenderers';
import { specialtyNoteKeys, specialtySections } from './specialties/specialtySections';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useClinicalAutosave } from '../../hooks/useClinicalAutosave';
import { useHorizontalTabScroll } from '../../hooks/useHorizontalTabScroll';
import { ClinicalQuickHeaderActions } from '../clinical/ClinicalQuickHeaderActions';
import { PatientSearchSelect } from '../common/PatientSearchSelect';
import { ProfessionalModuleHeader } from '../common/ProfessionalModuleHeader';
import {
  Stethoscope,
  Activity,
  Heart,
  Brain,
  Search,
  CheckCircle2,
  FileText,
  History,
  Sparkles,
  Baby,
  Smile,
  Shield,
  X,
  Flame,
  Scale,
  Eye,
  Headphones,
  ShieldCheck,
  HeartHandshake,
  LayoutDashboard,
  HeartPulse,
  Columns,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import {
  MedicalSpecialtyPreset,
  MedicalSpecialtyItem,
  MedicalTreeResponse,
  MedicalVitalSigns,
  MedicalPhysicalExam,
  MedicalNeurologicalExam,
  MedicalSoapNotes,
  MedicalConsultation
} from '../../types/capabilities';

const MedicalBodyHistory = React.lazy(() => import('../zemda-body/ZemdaBodyModal').then(m => ({ default: m.ZemdaBodyModal })));

interface ZemdaMedWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
}

export const DEFAULT_MEDICAL_SPECIALTIES: MedicalSpecialtyPreset[] = [
  {
    id: 'clinica-medica',
    name: 'Clínica Médica',
    description: 'Atendimento geral do adulto, anamnese completa, rastreamento e conduta clínica.',
    iconName: 'Stethoscope',
    focusAreas: ['Doenças Crônicas', 'Medicina Preventiva', 'Risco Cirúrgico', 'Investigação Diagnóstica']
  },
  {
    id: 'neurologia',
    name: 'Neurologia',
    description: 'Exame neurológico detalhado, pares cranianos, reflexos, marcha e mapa de sintomas.',
    iconName: 'Brain',
    focusAreas: ['Exame Neurológico', 'AVC & Cognição', 'Cefaleias & Movimento', 'Neuromuscular']
  },
  {
    id: 'psiquiatria',
    name: 'Psiquiatria',
    description: 'Avaliação do estado mental, humor, afeto, sono, apetite e psicofármacos.',
    iconName: 'Smile',
    focusAreas: ['Humor & Afeto', 'Ansiedade & Pânico', 'Sono & Apetite', 'Psicofármacos']
  },
  {
    id: 'pediatria',
    name: 'Pediatria',
    description: 'Puericultura, marcos de desenvolvimento neuropsicomotor, vacinação e crescimento.',
    iconName: 'Baby',
    focusAreas: ['Puericultura', 'Marcos DNPM', 'Vacinação', 'Curvas de Crescimento']
  },
  {
    id: 'geriatria',
    name: 'Geriatria',
    description: 'Avaliação geriátrica ampla, polifarmácia, risco de quedas e autonomia funcional.',
    iconName: 'Shield',
    focusAreas: ['AGA', 'Polifarmácia & Desprescrição', 'Risco de Quedas', 'AVD/AIVD']
  },
  {
    id: 'endocrinologia',
    name: 'Endocrinologia e Metabologia',
    description: 'Controle glicêmico, metabolismo lipídico, tireoide, obesidade e metas laboratoriais.',
    iconName: 'Scale',
    focusAreas: ['Diabetes Mellitus', 'Tireoide', 'Metabolismo & Obesidade', 'Osteometabolismo']
  },
  {
    id: 'ortopedia',
    name: 'Ortopedia e Traumatologia',
    description: 'Exame músculo-esquelético, amplitude articular, testes ortopédicos e dor osteoarticular.',
    iconName: 'Activity',
    focusAreas: ['Aparelho Locomotor', 'Coluna Vertebral', 'Membros Superiores & Inferiores', 'Trauma']
  },
  {
    id: 'cardiologia',
    name: 'Cardiologia',
    description: 'Ausculta cardíaca, ritmo, controle pressórico e estratificação de risco cardiovascular.',
    iconName: 'Heart',
    focusAreas: ['Risco Cardiovascular', 'Hipertensão Arterial', 'Ausculta & Ritmo', 'Insuficiência Cardíaca']
  },
  {
    id: 'dermatologia',
    name: 'Dermatologia',
    description: 'Mapeamento de lesões cutâneas, fototipo de Fitzpatrick, dermatoscopia e conduta tópica.',
    iconName: 'Flame',
    focusAreas: ['Lesões Elementares', 'Regra ABCDE', 'Fototipo', 'Pele & Anexos']
  },
  {
    id: 'reumatologia',
    name: 'Reumatologia',
    description: 'Contagem de articulações inflamadas/dolorosas, rigidez matinal e manifestações sistêmicas.',
    iconName: 'Activity',
    focusAreas: ['Artropatias Inflamatórias', 'Autoimunidade Sistêmica', 'Fibromialgia', 'Osteoporose']
  },
  {
    id: 'ginecologia',
    name: 'Ginecologia e Obstetrícia',
    description: 'Saúde integral da mulher, pré-natal, rastreamento preventivo, climatério e planejamento reprodutivo.',
    iconName: 'HeartHandshake',
    focusAreas: ['Saúde da Mulher', 'Pré-Natal', 'Climatério & Menopausa', 'Rastreamento Preventivo']
  },
  {
    id: 'gastroenterologia',
    name: 'Gastroenterologia',
    description: 'Doenças do trato gastrointestinal alto e baixo, hepatologia clínica e distúrbios funcionais.',
    iconName: 'Stethoscope',
    focusAreas: ['DRGE & Gastrites', 'Doenças Intestinais', 'Hepatologia Clínica', 'Distúrbios Funcionais']
  },
  {
    id: 'oftalmologia',
    name: 'Oftalmologia',
    description: 'Refração, acuidade visual, rastreamento de glaucoma e avaliação de superfície ocular e retina.',
    iconName: 'Eye',
    focusAreas: ['Refração & Acuidade', 'Glaucoma & Tonometria', 'Superfície Ocular', 'Retina']
  },
  {
    id: 'otorrinolaringologia',
    name: 'Otorrinolaringologia',
    description: 'Afecções de ouvido, nariz e garganta, avaliação de vertigem e distúrbios de voz e sono.',
    iconName: 'Headphones',
    focusAreas: ['Rinologia', 'Otologia & Vertigem', 'Laringe & Voz', 'Distúrbios do Sono']
  },
  {
    id: 'urologia',
    name: 'Urologia',
    description: 'Saúde urológica e andrológica, afecções da próstata, litíase urinária e incontinência.',
    iconName: 'ShieldCheck',
    focusAreas: ['Próstata & Rastreamento', 'Litíase Urinária', 'Saúde do Homem', 'Incontinência Urinária']
  }
];

function normalizeSpecialtyString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(med-spec-|pa-med-|med-pa-|prof-medico-|prof-)/, '')
    .trim();
}

const SPECIALTY_ALIAS_MAP: Record<string, string> = {
  oftalmo: 'oftalmologia',
  oftalmologista: 'oftalmologia',
  neuro: 'neurologia',
  neurologista: 'neurologia',
  neurologica: 'neurologia',
  cardio: 'cardiologia',
  cardiologista: 'cardiologia',
  dermato: 'dermatologia',
  dermatologista: 'dermatologia',
  ortopedia: 'ortopedia',
  ortopedista: 'ortopedia',
  traumatologia: 'ortopedia',
  traumatologista: 'ortopedia',
  reuma: 'reumatologia',
  reumatologista: 'reumatologia',
  reumatologia: 'reumatologia',
  gineco: 'ginecologia',
  ginecologista: 'ginecologia',
  obstetra: 'ginecologia',
  obstetricia: 'ginecologia',
  endocrino: 'endocrinologia',
  endocrinologista: 'endocrinologia',
  gastro: 'gastroenterologia',
  gastroenterologista: 'gastroenterologia',
  gastroenterologia: 'gastroenterologia',
  otorrino: 'otorrinolaringologia',
  otorrinolaringologista: 'otorrinolaringologia',
  otorrinolaringologia: 'otorrinolaringologia',
  uro: 'urologia',
  urologista: 'urologia',
  psiquiatra: 'psiquiatria',
  psiquiatria: 'psiquiatria',
  pediatra: 'pediatria',
  pediatria: 'pediatria',
  geriatra: 'geriatria',
  geriatria: 'geriatria',
  clinica: 'clinica-medica',
  clinico: 'clinica-medica'
};

function matchSpecialtyPreset(candidate: string | undefined | null, presets: MedicalSpecialtyPreset[]): MedicalSpecialtyPreset | null {
  if (!candidate || !presets || presets.length === 0) return null;
  const raw = normalizeSpecialtyString(candidate);
  if (!raw) return null;

  // 1. Correspondência exata em id ou slug
  const exact = presets.find(p => normalizeSpecialtyString(p.id) === raw || normalizeSpecialtyString(p.slug || '') === raw);
  if (exact) return exact;

  // 2. Correspondência exata em name
  const nameMatch = presets.find(p => normalizeSpecialtyString(p.name) === raw);
  if (nameMatch) return nameMatch;

  // 3. Correspondência por aliases conhecidos
  for (const [alias, targetPresetId] of Object.entries(SPECIALTY_ALIAS_MAP)) {
    if (raw.includes(alias) || alias.includes(raw)) {
      const match = presets.find(p => p.id === targetPresetId || p.slug === targetPresetId);
      if (match) return match;
    }
  }

  // 4. Substring no id ou name
  const subMatch = presets.find(p => {
    const pId = normalizeSpecialtyString(p.id);
    const pName = normalizeSpecialtyString(p.name);
    return raw.includes(pId) || pId.includes(raw) || raw.includes(pName) || pName.includes(raw);
  });
  if (subMatch) return subMatch;

  return null;
}

export const ZemdaMedWorkspace: React.FC<ZemdaMedWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation
}) => {
  const { currentUser, clientTermLabel, practiceAreaIds, hasCapability } = useAuth();
  const { showToast } = useToast();

  // Árvore Médica Centralizada e Especialidades do Usuário
  const [medicalTree, setMedicalTree] = useState<MedicalSpecialtyItem[]>([]);
  const restoredSpecialtyRef = useRef<string | null>(null);
  const userHasExplicitlySelectedPresetRef = useRef<boolean>(false);
  const [resourceCapabilities, setResourceCapabilities] = useState<string[] | null>(null);
  const [medicalAreaIds, setMedicalAreaIds] = useState<string[]>([]);
  const [userSpecialtyIds, setUserSpecialtyIds] = useState<string[]>([]);
  const [appointmentSpecialty, setAppointmentSpecialty] = useState<string | null>(null);

  // Busca detalhes do agendamento quando fornecido para extrair a especialidade do serviço
  useEffect(() => {
    if (!initialAppointmentId) {
      setAppointmentSpecialty(null);
      return;
    }
    let isSubscribed = true;
    ApiClient.get<any>(`/v1/appointments/${initialAppointmentId}`)
      .then(res => {
        if (!isSubscribed) return;
        const apt = res?.appointment || res;
        const specCandidate = apt?.service_name || apt?.specialty || apt?.service_id || null;
        if (specCandidate) {
          setAppointmentSpecialty(String(specCandidate));
        }
        if (!selectedPatientId && apt?.patient_id) {
          setSelectedPatientId(apt.patient_id);
        }
      })
      .catch(() => {});
    return () => {
      isSubscribed = false;
    };
  }, [initialAppointmentId]);

  // Carrega a árvore médica e especialidades do médico
  useEffect(() => {
    let isMounted = true;

    Promise.all([
      ApiClient.get<MedicalTreeResponse>('/v1/taxonomy/medical-tree').catch(() => null),
      ApiClient.get<any>('/v1/capabilities/my-resources').catch(() => null)
    ]).then(([treeRes, resData]) => {
      if (!isMounted) return;

      if (treeRes && Array.isArray(treeRes.specialties)) {
        setMedicalTree(treeRes.specialties);
      }

      if (Array.isArray(resData?.activeCapabilities)) setResourceCapabilities(resData.activeCapabilities);
      setMedicalAreaIds(resData?.medicalPracticeAreaIds || resData?.medicalHierarchy?.practiceAreaIds || []);
      if (resData?.medicalSpecialtyIds && Array.isArray(resData.medicalSpecialtyIds)) {
        setUserSpecialtyIds(resData.medicalSpecialtyIds);
      } else if (resData?.medicalHierarchy?.specialtyIds) {
        setUserSpecialtyIds(resData.medicalHierarchy.specialtyIds);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Presets disponíveis para o médico logado
  const allowedPresets = useMemo<MedicalSpecialtyPreset[]>(() => {
    const catalogSource: MedicalSpecialtyPreset[] = (medicalTree.length > 0 ? medicalTree : DEFAULT_MEDICAL_SPECIALTIES).map(s => ({
      id: s.slug || s.id,
      name: s.name,
      slug: s.slug || s.id,
      description: s.description || '',
      iconName: s.iconName || 'Stethoscope',
      focusAreas: s.focusAreas || [],
      practiceAreas: s.practiceAreas || []
    }));

    // SuperAdmin tem acesso a todas as 15 especialidades no consultório para testes
    if (currentUser?.role === 'superadmin') {
      return catalogSource;
    }

    // Se o médico possui especialidades médicas vinculadas (ex: Neurologia + Psiquiatria)
    if (userSpecialtyIds.length > 0) {
      const filtered = catalogSource.filter(p =>
        medicalTree.some(s => s.slug === p.id && userSpecialtyIds.includes(s.id)) ||
        userSpecialtyIds.includes(p.id) ||
        userSpecialtyIds.some(id => id.includes(p.id) || p.id.includes(id.replace('med-spec-', '')))
      );
      if (filtered.length > 0) return filtered;
    }

    // Fallback com áreas legadas em practiceAreaIds
    if (Array.isArray(practiceAreaIds) && practiceAreaIds.length > 0) {
      const filtered = catalogSource.filter(p =>
        practiceAreaIds.some(paId => {
          const cleanPa = paId.replace('pa-med-', '').replace('med-spec-', '').replace('med-pa-', '');
          return p.id.includes(cleanPa) || cleanPa.includes(p.id);
        })
      );
      if (filtered.length > 0) return filtered;
    }

    // Fallback por nome/título da profissão
    const profStr = String(currentUser?.professionName || currentUser?.canonicalProfessionName || currentUser?.professionId || '').toLowerCase();
    const specStr = String(currentUser?.specialtyName || '').toLowerCase();
    const matched = catalogSource.filter(p => {
      const pName = p.name.toLowerCase();
      const pId = p.id.toLowerCase();
      return profStr.includes(pId) || specStr.includes(pId) || profStr.includes(pName) || specStr.includes(pName);
    });

    if (matched.length > 0) return matched;

    return [catalogSource[0]];
  }, [medicalTree, userSpecialtyIds, practiceAreaIds, currentUser]);

  // Pacientes e Seleção — Sem auto-seleção de paciente fantasma
  const [selectedPatientId, setSelectedPatientId] = useState<string>(() => {
    return initialPatientId || '';
  });
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);

  useEffect(() => {
    if (initialPatientId) {
      setSelectedPatientId(initialPatientId);
    }
  }, [initialPatientId]);

  // Preset de Especialidade Ativo — Cálculo síncrono inicial para evitar flash de clínica médica
  const [activePreset, setActivePreset] = useState<string>(() => {
    const syncCandidates: (string | undefined | null)[] = [
      currentUser?.specialtyName,
      ...(practiceAreaIds || []),
      currentUser?.practiceAreas,
      currentUser?.professionName,
      currentUser?.canonicalProfessionName
    ];
    for (const cand of syncCandidates) {
      if (!cand) continue;
      const match = matchSpecialtyPreset(cand, DEFAULT_MEDICAL_SPECIALTIES);
      if (match && match.id !== 'clinica-medica') {
        return match.id;
      }
    }
    return 'clinica-medica';
  });

  // Atualiza preset ativo seguindo ordem estrita de prioridade
  useEffect(() => {
    if (allowedPresets.length === 0) return;

    // Se o usuário selecionou manualmente uma especialidade no select, respeita a escolha
    if (userHasExplicitlySelectedPresetRef.current) {
      if (allowedPresets.some(p => p.id === activePreset)) {
        return;
      }
    }

    // Se um rascunho salvo foi restaurado com especialidade específica, mantém rigorosamente
    if (restoredSpecialtyRef.current) {
      const matchRestored = allowedPresets.find(p => p.id === restoredSpecialtyRef.current || p.slug === restoredSpecialtyRef.current);
      if (matchRestored) {
        setActivePreset(matchRestored.id);
        restoredSpecialtyRef.current = null;
        return;
      }
    }

    // Prioridade 1: Especialidade do Agendamento (se veio de agendamento de consulta)
    if (appointmentSpecialty) {
      const matchApp = matchSpecialtyPreset(appointmentSpecialty, allowedPresets);
      if (matchApp) {
        setActivePreset(matchApp.id);
        return;
      }
    }

    // Prioridade 2: Especialidades médicas vinculadas ao profissional (userSpecialtyIds)
    if (userSpecialtyIds.length > 0) {
      for (const specId of userSpecialtyIds) {
        const matchSpec = matchSpecialtyPreset(specId, allowedPresets);
        if (matchSpec && matchSpec.id !== 'clinica-medica') {
          setActivePreset(matchSpec.id);
          return;
        }
      }
      const matchSpecAny = matchSpecialtyPreset(userSpecialtyIds[0], allowedPresets);
      if (matchSpecAny) {
        setActivePreset(matchSpecAny.id);
        return;
      }
    }

    // Prioridade 3: Perfil do médico / Simulação Sandbox (specialtyName, practiceAreaIds, professionName)
    const profileCandidates: (string | undefined | null)[] = [
      currentUser?.specialtyName,
      ...(practiceAreaIds || []),
      currentUser?.practiceAreas,
      currentUser?.professionName,
      currentUser?.canonicalProfessionName,
      currentUser?.professionId
    ];
    for (const cand of profileCandidates) {
      if (!cand) continue;
      const matchProf = matchSpecialtyPreset(cand, allowedPresets);
      if (matchProf && matchProf.id !== 'clinica-medica') {
        setActivePreset(matchProf.id);
        return;
      }
    }

    // Prioridade 4: Primeiro preset específico permitido diferente de clínica médica
    const specificPreset = allowedPresets.find(p => p.id !== 'clinica-medica' && p.slug !== 'clinica-medica');
    if (specificPreset && currentUser?.role !== 'superadmin') {
      setActivePreset(specificPreset.id);
      return;
    }

    // Prioridade 5: Clínica médica como fallback final
    if (!allowedPresets.some(p => p.id === activePreset)) {
      setActivePreset(allowedPresets[0].id);
    }
  }, [allowedPresets, appointmentSpecialty, userSpecialtyIds, practiceAreaIds, currentUser]);

  // Estado da Consulta Atual — Anamnese
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [hpi, setHpi] = useState('');
  const [pastMedicalHistory, setPastMedicalHistory] = useState('');
  const [familyHistory, setFamilyHistory] = useState('');
  const [habitsLifestyle, setHabitsLifestyle] = useState('');

  // Sinais Vitais & Biometria
  const [vitalSigns, setVitalSigns] = useState<MedicalVitalSigns>({
    bloodPressureSystolic: undefined,
    bloodPressureDiastolic: undefined,
    heartRate: undefined,
    respiratoryRate: undefined,
    oxygenSaturation: undefined,
    temperature: undefined,
    weight: undefined,
    height: undefined,
    bmi: undefined
  });

  // Exame Físico Geral (Clínica Médica e Base)
  const [physicalExam, setPhysicalExam] = useState<MedicalPhysicalExam>({
    generalStatus: 'Bom estado geral, corado, hidratado, acianótico, anictérico.',
    headAndNeck: '',
    cardiovascular: 'Bulhas rítmicas normofonéticas em 2 tempos, sem sopros audíveis.',
    respiratory: 'Murmúrio vesicular universalmente audível, sem ruídos adventícios.',
    abdomen: 'Plano, flácido, indolor à palpação superficial e profunda, ruídos hidroaéreos presentes.',
    extremities: 'Sem edemas, pulsos periféricos palpáveis e simétricos, boa perfusão periférica.',
    skin: '',
    additionalNotes: ''
  });

  // Exame Neurológico (Neurologia)
  const [neurologicalExam, setNeurologicalExam] = useState<MedicalNeurologicalExam>({
    mentalStatus: '',
    cranialNerves: '',
    motorSystem: '',
    reflexes: '',
    sensorySystem: '',
    coordinationAndGait: '',
    meningealSigns: '',
    painMapMarkers: []
  });

  // Avaliação Psiquiátrica (Psiquiatria)
  const [psychiatricNotes, setPsychiatricNotes] = useState<Record<string, any>>({
    mood: '',
    affect: '',
    thoughtProcess: '',
    perception: '',
    sleepApetite: ''
  });

  // Avaliação Pediátrica (Pediatria)
  const [pediatricNotes, setPediatricNotes] = useState<Record<string, any>>({
    growthPercentileWeight: '',
    growthPercentileHeight: '',
    vaccinationStatus: '',
    dnpmMilestones: '',
    feedingType: ''
  });

  // Avaliação Geriátrica Ampla (Geriatria)
  const [geriatricNotes, setGeriatricNotes] = useState<Record<string, any>>({
    fallRisk: '',
    polypharmacy: '',
    katsIndexAVD: '',
    lawtonIndexAIVD: '',
    cognitiveScreening: ''
  });

  // Avaliações Específicas das Demais Especialidades
  const [cardioNotes, setCardioNotes] = useState<Record<string, any>>({
    rhythm: '',
    murmurs: '',
    cvRisk: '',
    edema: ''
  });

  const [dermatoNotes, setDermatoNotes] = useState<Record<string, any>>({
    phototype: '',
    lesionExam: '',
    abcdeCriteria: ''
  });

  const [orthoNotes, setOrthoNotes] = useState<Record<string, any>>({
    mobilityROM: '',
    jointStability: '',
    palpationPain: ''
  });

  const [rheumaNotes, setRheumaNotes] = useState<Record<string, any>>({
    tenderJointCount: '',
    swollenJointCount: '',
    morningStiffnessMinutes: ''
  });

  const [gynecoNotes, setGynecoNotes] = useState<Record<string, any>>({
    lmpDate: '',
    breastExam: '',
    cervixExam: '',
    preventiveStatus: ''
  });

  const [endocrinoNotes, setEndocrinoNotes] = useState<Record<string, any>>({
    fastingGlucose: '',
    hba1c: '',
    thyroidPalpation: '',
    waistCircumference: ''
  });

  const [gastroNotes, setGastroNotes] = useState<Record<string, any>>({
    bristolScale: '',
    abdominalExam: '',
    gerdSymptoms: ''
  });

  const [ophtalmoNotes, setOphtalmoNotes] = useState<Record<string, any>>({
    visualAcuityOD: '',
    visualAcuityOE: '',
    intraocularPressure: '',
    fundusExam: ''
  });

  const [otorrinoNotes, setOtorrinoNotes] = useState<Record<string, any>>({
    otoscopy: '',
    rhinoscopy: '',
    oropharynx: ''
  });

  const [uroNotes, setUroNotes] = useState<Record<string, any>>({
    ipssScore: '',
    urinaryFlow: '',
    prostateExam: ''
  });

  const [internalMedicineNotes, setInternalMedicineNotes] = useState<Record<string, any>>({});
  const specialtyNotes: Record<string, Record<string, any>> = { internalMedicineNotes, neurologicalExam, psychiatricNotes, pediatricNotes, geriatricNotes, cardioNotes, dermatoNotes, orthoNotes, rheumaNotes, gynecoNotes, endocrinoNotes, gastroNotes, ophtalmoNotes, otorrinoNotes, uroNotes };
  const specialtySetters: Record<string, (value: any) => void> = { internalMedicineNotes: setInternalMedicineNotes, neurologicalExam: setNeurologicalExam, psychiatricNotes: setPsychiatricNotes, pediatricNotes: setPediatricNotes, geriatricNotes: setGeriatricNotes, cardioNotes: setCardioNotes, dermatoNotes: setDermatoNotes, orthoNotes: setOrthoNotes, rheumaNotes: setRheumaNotes, gynecoNotes: setGynecoNotes, endocrinoNotes: setEndocrinoNotes, gastroNotes: setGastroNotes, ophtalmoNotes: setOphtalmoNotes, otorrinoNotes: setOtorrinoNotes, uroNotes: setUroNotes };
  const activeNoteKey = specialtyNoteKeys[activePreset] || 'internalMedicineNotes';

  const [sharedAssessments, setSharedAssessments] = useState<Record<string, any>>({});
  const activeSpecialty = medicalTree.find(item => item.slug === activePreset || item.id === activePreset);
  const selectedMedicalAreas = activeSpecialty?.practiceAreas?.filter(area => medicalAreaIds.includes(area.id)) || [];
  const hiddenByArea = new Set(selectedMedicalAreas.flatMap(area => area.hiddenCapabilities || []));
  const activeCapabilities = Array.from(new Set([...(activeSpecialty?.defaultCapabilities || []), ...(activeSpecialty?.optionalCapabilities || []), ...selectedMedicalAreas.flatMap(area => [...(area.defaultCapabilities || []), ...(area.optionalCapabilities || [])])])).filter(cap => !hiddenByArea.has(cap) && (resourceCapabilities ? resourceCapabilities.includes(cap) : hasCapability(cap)));

  // SOAP
  const [soapNotes, setSoapNotes] = useState<MedicalSoapNotes>({
    subjective: '',
    objective: '',
    assessment: '',
    plan: ''
  });

  // CID-10 e Hipóteses Diagnósticas
  const [cidCode, setCidCode] = useState('');
  const [cidDescription, setCidDescription] = useState('');
  const [diagnosticHypotheses, setDiagnosticHypotheses] = useState<string[]>([]);
  const [newHypothesis, setNewHypothesis] = useState('');
  const [clinicalConduct, setClinicalConduct] = useState('');
  const [returnInDays, setReturnInDays] = useState<number | undefined>(undefined);

  // Histórico de Consultas
  const [consultationsHistory, setConsultationsHistory] = useState<MedicalConsultation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [bodyHistoryId, setBodyHistoryId] = useState<string | null>(null);

  // Navegação Estruturada por Abas do ZemdaMed
  type MedicalWorkspaceTab =
    | 'summary'
    | 'anamnesis'
    | 'specialty'
    | 'assessments'
    | 'physical_exam'
    | 'soap'
    | 'diagnosis'
    | 'conduct'
    | 'history';

  const [activeTab, setActiveTab] = useState<MedicalWorkspaceTab>('summary');
  const { tabScrollProps } = useHorizontalTabScroll(activeTab);

  // Controle de Submissão
  const [isFinishing, setIsFinishing] = useState(false);

  React.useLayoutEffect(() => {
    Object.values(specialtySetters).forEach(set => set({}));
    setSharedAssessments({});
    setVitalSigns({});
    setPhysicalExam({
      generalStatus: 'Bom estado geral, corado, hidratado, acianótico, anictérico.',
      headAndNeck: '',
      cardiovascular: 'Bulhas rítmicas normofonéticas em 2 tempos, sem sopros audíveis.',
      respiratory: 'Murmúrio vesicular universalmente audível, sem ruídos adventícios.',
      abdomen: 'Plano, flácido, indolor à palpação superficial e profunda, ruídos hidroaéreos presentes.',
      extremities: 'Sem edemas, pulsos periféricos palpáveis e simétricos, boa perfusão periférica.',
      skin: '',
      additionalNotes: ''
    });
    setChiefComplaint('');
    setHpi('');
    setPastMedicalHistory('');
    setFamilyHistory('');
    setHabitsLifestyle('');
    setSoapNotes({ subjective: '', objective: '', assessment: '', plan: '' });
    setCidCode('');
    setCidDescription('');
    setDiagnosticHypotheses([]);
    setNewHypothesis('');
    setClinicalConduct('');
    setReturnInDays(undefined);
    setConsultationsHistory([]);
    setBodyHistoryId(null);
    setExpandedHistoryId(null);
    setActiveTab('summary');
  }, [selectedPatientId, initialAppointmentId]);

  // Sincroniza Paciente Selecionado
  const currentPatientRef = useRef(selectedPatientId);
  currentPatientRef.current = selectedPatientId;

  useEffect(() => {
    if (selectedPatientId) {
      if (!selectedPatient || selectedPatient.id !== selectedPatientId) {
        ApiClient.get<any>(`/v1/patients/${selectedPatientId}`)
          .then(res => {
            if (currentPatientRef.current !== selectedPatientId) return;
            const p = res?.patient || res;
            setSelectedPatient(p || null);
          })
          .catch(() => {});
      }
      loadPatientConsultations(selectedPatientId);
    } else {
      setSelectedPatient(null);
      setConsultationsHistory([]);
    }
  }, [selectedPatientId]);

  // Carrega Histórico Médico do Paciente
  const loadPatientConsultations = async (pId: string) => {
    try {
      setLoadingHistory(true);
      const res = await ApiClient.get<MedicalConsultation[]>(`/v1/medical/consultations/patient/${pId}`);
      if (currentPatientRef.current === pId && Array.isArray(res)) {
        setConsultationsHistory(res);
      }
    } catch (err) {
      console.error('Erro ao carregar histórico médico:', err);
    } finally {
      if (currentPatientRef.current === pId) setLoadingHistory(false);
    }
  };

  // Autosave Rascunho Clínico do Atendimento Médico
  const currentDraftPayload = useMemo(() => ({
    specialtyPreset: activePreset,
    sharedAssessments,
    internalMedicineNotes,
    chiefComplaint,
    hpi,
    pastMedicalHistory,
    familyHistory,
    habitsLifestyle,
    vitalSigns,
    physicalExam,
    neurologicalExam,
    psychiatricNotes,
    pediatricNotes,
    geriatricNotes,
    cardioNotes,
    dermatoNotes,
    orthoNotes,
    rheumaNotes,
    gynecoNotes,
    endocrinoNotes,
    gastroNotes,
    ophtalmoNotes,
    otorrinoNotes,
    uroNotes,
    soapNotes,
    cidCode,
    cidDescription,
    diagnosticHypotheses,
    clinicalConduct,
    returnInDays
  }), [
    activePreset, sharedAssessments, internalMedicineNotes, chiefComplaint, hpi, pastMedicalHistory, familyHistory, habitsLifestyle,
    vitalSigns, physicalExam, neurologicalExam, psychiatricNotes, pediatricNotes,
    geriatricNotes, cardioNotes, dermatoNotes, orthoNotes, rheumaNotes, gynecoNotes,
    endocrinoNotes, gastroNotes, ophtalmoNotes, otorrinoNotes, uroNotes, soapNotes,
    cidCode, cidDescription, diagnosticHypotheses, clinicalConduct, returnInDays
  ]);

  const autosave = useClinicalAutosave({
    moduleType: 'medical',
    patientId: selectedPatientId,
    appointmentId: initialAppointmentId,
    payload: currentDraftPayload,
    onRestoreDraft: (restored: any) => {
      if (!restored || typeof restored !== 'object') return;
      if (typeof restored.specialtyPreset === 'string') {
        restoredSpecialtyRef.current = restored.specialtyPreset;
        const matched = allowedPresets.find(p => p.id === restored.specialtyPreset || p.slug === restored.specialtyPreset);
        if (matched) {
          setActivePreset(matched.id);
          restoredSpecialtyRef.current = null;
        }
      }
      if (typeof restored.chiefComplaint === 'string') setChiefComplaint(restored.chiefComplaint);
      if (typeof restored.hpi === 'string') setHpi(restored.hpi);
      if (restored.sharedAssessments) setSharedAssessments(restored.sharedAssessments);
      if (restored.internalMedicineNotes) setInternalMedicineNotes(restored.internalMedicineNotes);
      if (typeof restored.pastMedicalHistory === 'string') setPastMedicalHistory(restored.pastMedicalHistory);
      if (typeof restored.familyHistory === 'string') setFamilyHistory(restored.familyHistory);
      if (typeof restored.habitsLifestyle === 'string') setHabitsLifestyle(restored.habitsLifestyle);
      if (restored.vitalSigns !== undefined) setVitalSigns(prev => ({ ...prev, ...restored.vitalSigns }));
      if (restored.physicalExam !== undefined) setPhysicalExam(prev => ({ ...prev, ...restored.physicalExam }));
      if (restored.neurologicalExam !== undefined) setNeurologicalExam(prev => ({ ...prev, ...restored.neurologicalExam }));
      if (restored.psychiatricNotes !== undefined) setPsychiatricNotes(prev => ({ ...prev, ...restored.psychiatricNotes }));
      if (restored.pediatricNotes !== undefined) setPediatricNotes(prev => ({ ...prev, ...restored.pediatricNotes }));
      if (restored.geriatricNotes !== undefined) setGeriatricNotes(prev => ({ ...prev, ...restored.geriatricNotes }));
      if (restored.cardioNotes !== undefined) setCardioNotes(prev => ({ ...prev, ...restored.cardioNotes }));
      if (restored.dermatoNotes !== undefined) setDermatoNotes(prev => ({ ...prev, ...restored.dermatoNotes }));
      if (restored.orthoNotes !== undefined) setOrthoNotes(prev => ({ ...prev, ...restored.orthoNotes }));
      if (restored.rheumaNotes !== undefined) setRheumaNotes(prev => ({ ...prev, ...restored.rheumaNotes }));
      if (restored.gynecoNotes !== undefined) setGynecoNotes(prev => ({ ...prev, ...restored.gynecoNotes }));
      if (restored.endocrinoNotes !== undefined) setEndocrinoNotes(prev => ({ ...prev, ...restored.endocrinoNotes }));
      if (restored.gastroNotes !== undefined) setGastroNotes(prev => ({ ...prev, ...restored.gastroNotes }));
      if (restored.ophtalmoNotes !== undefined) setOphtalmoNotes(prev => ({ ...prev, ...restored.ophtalmoNotes }));
      if (restored.otorrinoNotes !== undefined) setOtorrinoNotes(prev => ({ ...prev, ...restored.otorrinoNotes }));
      if (restored.uroNotes !== undefined) setUroNotes(prev => ({ ...prev, ...restored.uroNotes }));
      if (restored.soapNotes && typeof restored.soapNotes === 'object') {
        setSoapNotes({
          subjective: String(restored.soapNotes.subjective || ''),
          objective: String(restored.soapNotes.objective || ''),
          assessment: String(restored.soapNotes.assessment || ''),
          plan: String(restored.soapNotes.plan || '')
        });
      }
      if (typeof restored.cidCode === 'string') setCidCode(restored.cidCode);
      if (typeof restored.cidDescription === 'string') setCidDescription(restored.cidDescription);
      if (Array.isArray(restored.diagnosticHypotheses)) setDiagnosticHypotheses(restored.diagnosticHypotheses);
      if (typeof restored.clinicalConduct === 'string') setClinicalConduct(restored.clinicalConduct);
      if (restored.returnInDays !== undefined) setReturnInDays(restored.returnInDays);
    }
  });

  // Cálculo de IMC Automático
  useEffect(() => {
    if (vitalSigns.weight && vitalSigns.height && vitalSigns.height > 0) {
      const hM = vitalSigns.height > 3 ? vitalSigns.height / 100 : vitalSigns.height;
      const calculatedBmi = Number((vitalSigns.weight / (hM * hM)).toFixed(1));
      setVitalSigns(prev => ({ ...prev, bmi: calculatedBmi }));
    } else {
      setVitalSigns(prev => prev.bmi === undefined ? prev : ({ ...prev, bmi: undefined }));
    }
  }, [vitalSigns.weight, vitalSigns.height]);

  const getBmiBadge = (bmi?: number) => {
    if (!bmi) return null;
    if (activePreset === 'pediatria') return { label: 'IMC registrado', color: 'bg-slate-100 text-slate-700' };
    if (bmi < 18.5) return { label: 'Abaixo do peso', color: 'bg-amber-100 text-amber-800' };
    if (bmi < 25) return { label: 'Peso saudável', color: 'bg-emerald-100 text-emerald-800' };
    if (bmi < 30) return { label: 'Sobrepeso', color: 'bg-amber-100 text-amber-800' };
    return { label: 'Obesidade', color: 'bg-rose-100 text-rose-800' };
  };

  const handleAddHypothesis = () => {
    if (newHypothesis.trim() && !diagnosticHypotheses.includes(newHypothesis.trim())) {
      setDiagnosticHypotheses(prev => [...prev, newHypothesis.trim()]);
      setNewHypothesis('');
    }
  };

  const handleRemoveHypothesis = (idx: number) => {
    setDiagnosticHypotheses(prev => prev.filter((_, i) => i !== idx));
  };

  // Finalizar Consulta Médica (Registrando no Prontuário Geral Selado)
  const handleFinishConsultation = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente para registrar o atendimento.', 'info');
      return;
    }

    if (!clinicalConduct.trim() && !soapNotes.plan.trim()) {
      showToast('Preencha a Conduta Clínica ou Plano Terapêutico para concluir.', 'info');
      setActiveTab('conduct');
      return;
    }

    try {
      setIsFinishing(true);

      const activePresetObj = allowedPresets.find(p => p.id === activePreset);
      const specName = activePresetObj?.name || 'Consulta Médica';

      let evolutionText = `[ZemdaMed — Consulta de ${specName}]\n\n` +
        `• Queixa Principal: ${chiefComplaint || 'Consulta de rotina'}\n` +
        (hpi ? `• HDA: ${hpi}\n` : '') +
        (pastMedicalHistory ? `• Antecedentes (HPP): ${pastMedicalHistory}\n` : '') +
        (familyHistory ? `• Histórico Familiar: ${familyHistory}\n` : '') +
        (vitalSigns.bloodPressureSystolic ? `• Sinais Vitais: PA ${vitalSigns.bloodPressureSystolic}/${vitalSigns.bloodPressureDiastolic || ''} mmHg, FC ${vitalSigns.heartRate || '-'} bpm, SpO2 ${vitalSigns.oxygenSaturation || '-'}%, Temp ${vitalSigns.temperature || '-'}°C, IMC ${vitalSigns.bmi || '-'}\n` : '');

      evolutionText += (cidCode ? `\n• CID-10: ${cidCode} - ${cidDescription || ''}\n` : '') +
        (diagnosticHypotheses.length > 0 ? `• Hipóteses: ${diagnosticHypotheses.join(', ')}\n` : '') +
        `\n[CONDUTA MÉDICA / PRESCRIÇÃO]:\n${clinicalConduct || soapNotes.plan}\n` +
        (returnInDays ? `\n• Retorno previsto em: ${returnInDays} dias` : '');

      const activeNotes = specialtyNotes[activeNoteKey] || {};
      for (const section of specialtySections[activePreset] || []) {
        const findings = section.fields.filter(([key]) => activeNotes[key] !== undefined && activeNotes[key] !== '').map(([key, label]) => label + ': ' + activeNotes[key]);
        if (findings.length) evolutionText += '\n[' + section.title + ']\n' + findings.join('\n') + '\n';
      }

      await ApiClient.post('/v1/medical/finish-consultation', {
        ...currentDraftPayload,
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId || null,
        title: `Consulta Médica — ${specName}`,
        specialtyPreset: activePreset,
        chiefComplaint,
        hpi,
        pastMedicalHistory,
        familyHistory,
        habitsLifestyle,
        vitalSigns,
        physicalExam,
        neurologicalExam,
        diagnosticHypotheses,
        cidCode,
        cidDescription,
        soapNotes,
        conducts: clinicalConduct,
        clinicalEvolution: evolutionText,
        returnInDays
      });

      showToast('Consulta médica finalizada com sucesso e registrada no prontuário do paciente!', 'success');
      await autosave.clearDraft();
      sessionStorage.removeItem('zemda_med_active_patient_id');
      setActiveTab('history');
      loadPatientConsultations(selectedPatientId);

      if (onFinishConsultation) {
        onFinishConsultation();
      }
    } catch (err: any) {
      console.error('Erro ao finalizar consulta médica:', err);
      showToast(err.message || 'Erro ao registrar atendimento médico.', 'error');
    } finally {
      setIsFinishing(false);
    }
  };

  const specialtyAssessment = (
    <SpecialtySectionRenderer
      previousLesions={consultationsHistory.find(row => Array.isArray(row.specialtyNotes?.dermatoNotes?.lesions))?.specialtyNotes?.dermatoNotes?.lesions}
      specialty={activePreset}
      value={specialtyNotes[activeNoteKey] || {}}
      onChange={specialtySetters[activeNoteKey]}
      patientId={selectedPatientId}
      appointmentId={initialAppointmentId}
    />
  );

  // Definição das Abas da Navegação Horizontal
  const medicalTabs: Array<{ id: MedicalWorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'summary', label: 'Resumo', icon: LayoutDashboard },
    { id: 'anamnesis', label: 'Anamnese', icon: FileText },
    { id: 'specialty', label: 'Especialidade', icon: Stethoscope },
    { id: 'assessments', label: 'Avaliações', icon: Sparkles },
    { id: 'physical_exam', label: 'Exame Físico', icon: HeartPulse },
    { id: 'soap', label: 'SOAP', icon: Columns },
    { id: 'diagnosis', label: 'Diagnóstico', icon: Brain },
    { id: 'conduct', label: 'Conduta', icon: CheckCircle2 },
    { id: 'history', label: `Histórico (${consultationsHistory.length})`, icon: History }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      <ClinicalDraftRecoveryModal
        isOpen={autosave.conflictModalOpen}
        moduleName="ZemdaMed"
        onSelectVersion={autosave.resolveConflict}
        onClose={() => {}}
      />
      {bodyHistoryId && (
        <React.Suspense fallback={null}>
          <MedicalBodyHistory
            isOpen
            readOnly
            patientId={selectedPatientId}
            assessmentId={bodyHistoryId}
            onClose={() => setBodyHistoryId(null)}
          />
        </React.Suspense>
      )}

      {/* CABEÇALHO DO MÓDULO ZEMDAMED */}
      <ProfessionalModuleHeader
        icon={Stethoscope}
        iconGradient="from-teal-600 to-slate-800"
        iconShadow="shadow-teal-600/20"
        title="ZemdaMed"
        badgeLabel="Medicina Especializada"
        badgeVariant="bg-teal-100 text-teal-800 border-teal-200"
        description="Prontuário médico com anamnese estruturada, sinais vitais, exame físico adaptativo à especialidade, notas SOAP e integração ao CID-10."
      >
        {/* Seletor Compacto de Especialidade quando houver mais de 1 */}
        {allowedPresets.length > 1 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[10px] font-extrabold uppercase text-slate-400">Especialidade:</span>
            <select
              value={activePreset}
              onChange={e => {
                userHasExplicitlySelectedPresetRef.current = true;
                setActivePreset(e.target.value);
              }}
              className="text-xs font-bold text-teal-900 bg-transparent focus:outline-none cursor-pointer"
            >
              {allowedPresets.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div data-tour="medical-patient-select" className="w-full">
          <PatientSearchSelect
            compact
            value={selectedPatientId}
            selectedPatient={selectedPatient}
            clientTermLabel={clientTermLabel}
            disabled={!!initialAppointmentId}
            onChange={async (id, pat) => {
              if (selectedPatientId && autosave.isDirty) {
                const saved = await autosave.forceSaveDraft();
                if (!saved) {
                  showToast('Salve o rascunho antes de trocar de paciente.', 'error');
                  return;
                }
              }
              setSelectedPatientId(id);
              if (pat) {
                setSelectedPatient(pat);
              } else if (!id) {
                setSelectedPatient(null);
                sessionStorage.removeItem('zemda_med_active_patient_id');
              }
            }}
          />
        </div>

        {selectedPatientId && (
          <ClinicalQuickHeaderActions
            autosaveStatus={autosave.autosaveStatus}
            lastSavedTime={autosave.lastSavedTime}
            onViewPreviousRecords={() => setActiveTab('history')}
            onFinishConsultation={() => setActiveTab('conduct')}
            finishLabel="Finalizar Atendimento"
            isSubmitting={isFinishing}
            toolsVariant="teal"
          />
        )}
      </ProfessionalModuleHeader>

      {/* BARRA HORIZONTAL DE ABAS PADRONIZADA (Trilha Horizontal com Scroll Suave) */}
      <div className="bg-white border-b border-slate-200 px-6 shrink-0">
        <div {...tabScrollProps} className={`${tabScrollProps.className} flex items-center gap-1 py-1`}>
          {medicalTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tour={`tab-${tab.id}`}
                data-active={isActive}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selectedPatientId ? (
          <div className="flex flex-col items-center justify-center h-64 text-center bg-white rounded-2xl border border-slate-200 p-8 max-w-6xl mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-3">
              <Stethoscope className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Selecione um(a) {clientTermLabel}</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Escolha um paciente no menu superior para iniciar o atendimento médico estruturado, sinais vitais e notas SOAP.
            </p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ABA 1 — RESUMO */}
            {activeTab === 'summary' && (
              <div className="space-y-6">
                {/* Card Compacto do Paciente & Especialidade Ativa */}
                <div className="p-5 bg-white border border-teal-200 rounded-3xl shadow-xs flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center font-black text-base shadow-sm">
                      {(selectedPatient?.full_name || selectedPatient?.name || 'P').charAt(0)}
                    </div>
                    <div>
                      <div className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                        <span>{selectedPatient?.full_name || selectedPatient?.name}</span>
                        <span className="px-2.5 py-0.5 bg-teal-50 text-teal-800 border border-teal-200 rounded-full text-[10px] font-bold">
                          {allowedPresets.find(p => p.id === activePreset)?.name || 'Medicina'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                        <span><strong>CPF:</strong> {selectedPatient?.cpf || 'Não informado'}</span>
                        <span>•</span>
                        <span><strong>Nascimento:</strong> {selectedPatient?.birth_date || 'Não informado'}</span>
                        <span>•</span>
                        <span><strong>Telefone:</strong> {selectedPatient?.phone || 'Não informado'}</span>
                        {selectedPatient?.insurance_name && (
                          <>
                            <span>•</span>
                            <span><strong>Convênio:</strong> {selectedPatient.insurance_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('anamnesis')}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Ir para Anamnese</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sinais Vitais & Biometria (Compacto e Editável) */}
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                      <Activity className="w-4 h-4 text-teal-600" />
                      Sinais Vitais & Biometria
                    </h2>
                    {vitalSigns.bmi && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">IMC: {vitalSigns.bmi}</span>
                        {getBmiBadge(vitalSigns.bmi) && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getBmiBadge(vitalSigns.bmi)!.color}`}>
                            {getBmiBadge(vitalSigns.bmi)!.label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">PA Sistólica</label>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="120"
                          value={vitalSigns.bloodPressureSystolic || ''}
                          onChange={e => setVitalSigns({ ...vitalSigns, bloodPressureSystolic: e.target.value ? Number(e.target.value) : undefined })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">mmHg</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">PA Diastólica</label>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="80"
                          value={vitalSigns.bloodPressureDiastolic || ''}
                          onChange={e => setVitalSigns({ ...vitalSigns, bloodPressureDiastolic: e.target.value ? Number(e.target.value) : undefined })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">mmHg</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Freq. Cardíaca</label>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="75"
                          value={vitalSigns.heartRate || ''}
                          onChange={e => setVitalSigns({ ...vitalSigns, heartRate: e.target.value ? Number(e.target.value) : undefined })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">bpm</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Freq. Resp.</label>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="16"
                          value={vitalSigns.respiratoryRate || ''}
                          onChange={e => setVitalSigns({ ...vitalSigns, respiratoryRate: e.target.value ? Number(e.target.value) : undefined })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">irpm</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Saturação SpO2</label>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="98"
                          value={vitalSigns.oxygenSaturation || ''}
                          onChange={e => setVitalSigns({ ...vitalSigns, oxygenSaturation: e.target.value ? Number(e.target.value) : undefined })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">%</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Temperatura</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          placeholder="36.5"
                          value={vitalSigns.temperature || ''}
                          onChange={e => setVitalSigns({ ...vitalSigns, temperature: e.target.value ? Number(e.target.value) : undefined })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">°C</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Peso</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          placeholder="70.5"
                          value={vitalSigns.weight || ''}
                          onChange={e => setVitalSigns({ ...vitalSigns, weight: e.target.value ? Number(e.target.value) : undefined })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">kg</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Altura</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="1.75"
                          value={vitalSigns.height || ''}
                          onChange={e => setVitalSigns({ ...vitalSigns, height: e.target.value ? Number(e.target.value) : undefined })}
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">m</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Alertas Relevantes & Resumo da Consulta */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Alertas Clínicos Relevantes */}
                  <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
                    <h3 className="text-xs font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider border-b border-slate-100 pb-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Alertas Clínicos Relevantes
                    </h3>

                    <div className="space-y-2 text-xs">
                      {selectedPatient?.allergies ? (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
                          <span className="font-bold">⚠️ Alergias Registradas:</span> {selectedPatient.allergies}
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                          <span className="font-bold">✓ Alergias:</span> Nenhuma alergia medicamentosa severa informada.
                        </div>
                      )}

                      {vitalSigns.bloodPressureSystolic && (vitalSigns.bloodPressureSystolic >= 140 || (vitalSigns.bloodPressureDiastolic && vitalSigns.bloodPressureDiastolic >= 90)) && (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
                          <span className="font-bold">⚠️ Atenção à PA:</span> Pressão arterial em níveis elevados ({vitalSigns.bloodPressureSystolic}/{vitalSigns.bloodPressureDiastolic} mmHg).
                        </div>
                      )}

                      {vitalSigns.oxygenSaturation && vitalSigns.oxygenSaturation <= 94 && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
                          <span className="font-bold">⚠️ Atenção à SpO2:</span> Saturação de oxigênio limítrofe/baixa ({vitalSigns.oxygenSaturation}%).
                        </div>
                      )}

                      {selectedPatient?.medications && (
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                          <span className="font-bold">💊 Medicamentos de Uso Contínuo:</span> {selectedPatient.medications}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resumo da Consulta em Andamento */}
                  <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
                    <h3 className="text-xs font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider border-b border-slate-100 pb-2.5">
                      <FileText className="w-4 h-4 text-teal-600" />
                      Visão Geral do Atendimento Atual
                    </h3>

                    <div className="space-y-2.5 text-xs text-slate-600">
                      <div>
                        <span className="font-bold text-slate-800">Queixa Principal:</span>{' '}
                        {chiefComplaint ? (
                          <span className="text-slate-900 font-medium">{chiefComplaint}</span>
                        ) : (
                          <span className="text-slate-400 italic">Ainda não informada (clique na aba Anamnese)</span>
                        )}
                      </div>

                      <div>
                        <span className="font-bold text-slate-800">Diagnóstico Principal (CID-10):</span>{' '}
                        {cidCode ? (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                            {cidCode} {cidDescription && `— ${cidDescription}`}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Ainda não definido</span>
                        )}
                      </div>

                      <div>
                        <span className="font-bold text-slate-800">Hipóteses Registradas:</span>{' '}
                        {diagnosticHypotheses.length > 0 ? (
                          <span className="text-slate-800 font-medium">{diagnosticHypotheses.join(', ')}</span>
                        ) : (
                          <span className="text-slate-400 italic">Nenhuma adicionada</span>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab('anamnesis')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Anamnese
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('specialty')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Especialidade
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('assessments')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Avaliações
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('physical_exam')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Exame Físico
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('soap')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          SOAP
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('diagnosis')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Diagnóstico
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('conduct')}
                          className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Conduta & Prescrição
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 2 — ANAMNESE */}
            {activeTab === 'anamnesis' && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                      <FileText className="w-4 h-4 text-teal-600" />
                      Anamnese Clínica Estruturada
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Histórico clínico do paciente, queixa principal, evolução da doença atual e antecedentes.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Queixa Principal (QP) *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Cefaleia pulsátil há 3 dias acompanhada de náusea..."
                        value={chiefComplaint}
                        onChange={e => setChiefComplaint(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        História da Doença Atual (HDA)
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Início, localização, intensidade, fatores de melhora e piora, sintomas associados..."
                        value={hpi}
                        onChange={e => setHpi(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Antecedentes Pessoais / Patológicos (HPP)
                      </label>
                      <textarea
                        rows={3}
                        placeholder="HAS, DM, cirurgias prévias, alergias medicamentosas, internações..."
                        value={pastMedicalHistory}
                        onChange={e => setPastMedicalHistory(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Antecedentes Familiares
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Doenças cardiovasculares, neoplasias, diabetes, histórico hereditário..."
                        value={familyHistory}
                        onChange={e => setFamilyHistory(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Hábitos e Estilo de Vida
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Tabagismo, etilismo, atividade física, qualidade do sono, rotina ocupacional..."
                        value={habitsLifestyle}
                        onChange={e => setHabitsLifestyle(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Seção adicional de Clínica Médica na Anamnese */}
                {activePreset === 'clinica-medica' && (
                  <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                        <Stethoscope className="w-4 h-4 text-teal-600" />
                        Clínica Médica — Revisão por Sistemas, Condições Crônicas & Acompanhamento
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Interrogatório sistemático sobre os aparelhos, condições crônicas de base e estratificação de risco.
                      </p>
                    </div>

                    <InternalMedicineRenderer
                      data={internalMedicineNotes}
                      update={(key, val) => setInternalMedicineNotes(prev => ({ ...prev, [key]: val }))}
                      patientId={selectedPatientId}
                      appointmentId={initialAppointmentId}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ABA 3 — ESPECIALIDADE */}
            {activeTab === 'specialty' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                      <Stethoscope className="w-4 h-4 text-teal-600" />
                      Avaliação Especializada — {allowedPresets.find(p => p.id === activePreset)?.name || 'Consulta Médica'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {allowedPresets.find(p => p.id === activePreset)?.description || 'Exame específico e achados clínicos direcionados à especialidade médica.'}
                    </p>
                  </div>

                  {allowedPresets.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-500">Mudar especialidade:</span>
                      <select
                        value={activePreset}
                        onChange={e => setActivePreset(e.target.value)}
                        className="text-xs font-bold text-teal-900 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer"
                      >
                        {allowedPresets.map(preset => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {specialtyAssessment}
              </div>
            )}

            {/* ABA 4 — AVALIAÇÕES */}
            {activeTab === 'assessments' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    Avaliações Clínicas Complementares & Ferramentas
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ferramentas integradas para testes funcionais, escalas clínicas, goniometria, dor, AVDs e mapeamento 3D Zemda360.
                  </p>
                </div>

                {activeCapabilities.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs font-bold text-slate-700">Nenhuma avaliação complementar ativa</p>
                    <p className="text-xs text-slate-500 mt-1">
                      As ferramentas complementares são associadas às capabilities permitidas para a especialidade ativa.
                    </p>
                  </div>
                ) : (
                  <MedicalCapabilityTools
                    key={selectedPatientId + activePreset}
                    capabilities={activeCapabilities}
                    patientId={selectedPatientId}
                    patient={selectedPatient}
                    appointmentId={initialAppointmentId}
                    value={sharedAssessments}
                    onChange={setSharedAssessments}
                    saveDraft={autosave.forceSaveDraft}
                  />
                )}
              </div>
            )}

            {/* ABA 5 — EXAME FÍSICO */}
            {activeTab === 'physical_exam' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                    <HeartPulse className="w-4 h-4 text-teal-600" />
                    Exame Físico Geral
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ectoscopia, avaliação segmentar geral dos sistemas orgânicos e achados propedêuticos.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Estado Geral</label>
                    <textarea
                      rows={2}
                      value={physicalExam.generalStatus || ''}
                      onChange={e => setPhysicalExam(prev => ({ ...prev, generalStatus: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Cabeça e Pescoço</label>
                    <textarea
                      rows={2}
                      value={physicalExam.headAndNeck || ''}
                      onChange={e => setPhysicalExam(prev => ({ ...prev, headAndNeck: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Pele & Anexos</label>
                    <textarea
                      rows={2}
                      value={physicalExam.skin || ''}
                      onChange={e => setPhysicalExam(prev => ({ ...prev, skin: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Aparelho Cardiovascular</label>
                    <textarea
                      rows={2}
                      value={physicalExam.cardiovascular || ''}
                      onChange={e => setPhysicalExam(prev => ({ ...prev, cardiovascular: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Aparelho Respiratório</label>
                    <textarea
                      rows={2}
                      value={physicalExam.respiratory || ''}
                      onChange={e => setPhysicalExam(prev => ({ ...prev, respiratory: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Abdome</label>
                    <textarea
                      rows={2}
                      value={physicalExam.abdomen || ''}
                      onChange={e => setPhysicalExam(prev => ({ ...prev, abdomen: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Extremidades & Pulsos Periféricos</label>
                    <textarea
                      rows={2}
                      value={physicalExam.extremities || ''}
                      onChange={e => setPhysicalExam(prev => ({ ...prev, extremities: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Observações do Exame Físico</label>
                    <textarea
                      rows={2}
                      placeholder="Outros achados propedêuticos ou observações adicionais..."
                      value={physicalExam.additionalNotes || ''}
                      onChange={e => setPhysicalExam(prev => ({ ...prev, additionalNotes: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 6 — SOAP */}
            {activeTab === 'soap' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                    <Columns className="w-4 h-4 text-teal-600" />
                    Registro Clínico Estruturado — Metodologia SOAP
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Estruturação do raciocínio clínico nos quatro eixos: Subjetivo, Objetivo, Avaliação e Plano.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1">
                      <span className="text-teal-600 font-black">S</span> — Subjetivo
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Relato do paciente, queixas, sintomas percebidos e impressões pessoais..."
                      value={soapNotes.subjective}
                      onChange={e => setSoapNotes(prev => ({ ...prev, subjective: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1">
                      <span className="text-teal-600 font-black">O</span> — Objetivo
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Sinais vitais observados, achados físicos, resultados laboratoriais e de imagem..."
                      value={soapNotes.objective}
                      onChange={e => setSoapNotes(prev => ({ ...prev, objective: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1">
                      <span className="text-teal-600 font-black">A</span> — Avaliação
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Raciocínio diagnóstico, síntese dos achados, hipóteses formuladas e evolução clínica..."
                      value={soapNotes.assessment}
                      onChange={e => setSoapNotes(prev => ({ ...prev, assessment: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-800 mb-1">
                      <span className="text-teal-600 font-black">P</span> — Plano
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Conduta terapêutica, prescrição medicamentosa, exames solicitados e orientações..."
                      value={soapNotes.plan}
                      onChange={e => setSoapNotes(prev => ({ ...prev, plan: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none leading-relaxed"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ABA 7 — DIAGNÓSTICO */}
            {activeTab === 'diagnosis' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                    <Brain className="w-4 h-4 text-teal-600" />
                    Diagnóstico, CID-10 & Hipóteses Clínicas
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Classificação Internacional de Doenças (CID-10) e listagem de hipóteses diagnósticas ou diferenciais.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Código CID-10 Principal</label>
                    <input
                      type="text"
                      placeholder="Ex: I10, E11, G43, F32..."
                      value={cidCode}
                      onChange={e => setCidCode(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none font-mono font-bold"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Descrição do Diagnóstico</label>
                    <input
                      type="text"
                      placeholder="Ex: Hipertensão essencial primária, Diabetes mellitus tipo 2..."
                      value={cidDescription}
                      onChange={e => setCidDescription(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                    />
                  </div>
                </div>

                {/* Hipóteses Diagnósticas Adicionais */}
                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hipóteses Diagnósticas / Diferenciais</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Digite uma hipótese e pressione Enter ou clique em Adicionar..."
                      value={newHypothesis}
                      onChange={e => setNewHypothesis(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddHypothesis(); } }}
                      className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddHypothesis}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors"
                    >
                      Adicionar
                    </button>
                  </div>

                  {diagnosticHypotheses.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {diagnosticHypotheses.map((hyp, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-teal-50 text-teal-800 text-xs font-bold border border-teal-200"
                        >
                          <span>{hyp}</span>
                          <X
                            className="w-3.5 h-3.5 cursor-pointer hover:text-rose-600 transition-colors"
                            onClick={() => handleRemoveHypothesis(i)}
                          />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 8 — CONDUTA */}
            {activeTab === 'conduct' && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                      <CheckCircle2 className="w-4 h-4 text-teal-600" />
                      Conduta Médica, Orientações & Prescrição
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Definição terapêutica, prescrição médica, exames complementares solicitados e agendamento de retorno.
                    </p>
                  </div>

                  {/* Conduta Médica & Prescrição */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Conduta Clínica, Orientações & Prescrição Médica *
                    </label>
                    <textarea
                      rows={6}
                      required
                      placeholder="Prescrição de medicamentos, posologia, solicitações de exames laboratoriais ou de imagem, encaminhamentos e orientações gerais ao paciente..."
                      value={clinicalConduct}
                      onChange={e => setClinicalConduct(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none leading-relaxed"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <label className="text-xs font-bold text-slate-700">Previsão de Retorno:</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        placeholder="30"
                        value={returnInDays || ''}
                        onChange={e => setReturnInDays(e.target.value ? Number(e.target.value) : undefined)}
                        className="w-20 px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none text-center font-bold"
                      />
                      <span className="text-xs text-slate-500 font-medium">dias</span>
                    </div>
                  </div>
                </div>

                {/* Painel de Finalização da Consulta */}
                <div className="p-6 bg-gradient-to-br from-slate-900 to-teal-950 text-white rounded-3xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-extrabold flex items-center gap-2 text-white">
                      <CheckCircle2 className="w-5 h-5 text-teal-400" />
                      Finalizar Consulta Médica
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 max-w-lg">
                      Ao finalizar, a consulta será selada e arquivada no prontuário eletrônico permanente do paciente, limpando o rascunho ativo.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleFinishConsultation}
                    disabled={isFinishing || !selectedPatientId}
                    className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-teal-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
                  >
                    <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                    <span>{isFinishing ? 'Finalizando e Selando...' : 'Finalizar Consulta e Registrar no Prontuário'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* ABA 9 — HISTÓRICO */}
            {activeTab === 'history' && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
                <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider border-b border-slate-100 pb-3">
                  <History className="w-4 h-4 text-teal-600" />
                  Histórico Médico Longitudinal {selectedPatient ? `— ${selectedPatient.full_name || selectedPatient.name}` : ''}
                </h2>

                <MedicalComparison history={consultationsHistory} specialty={activePreset} />
                <MedicalTrends history={consultationsHistory} />
                {loadingHistory ? (
                  <div className="p-8 text-center text-xs text-slate-400">Carregando consultas anteriores...</div>
                ) : consultationsHistory.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Stethoscope className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs">Nenhuma consulta médica anterior registrada para este paciente.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {consultationsHistory.map(item => (
                      <div key={item.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900">
                            {item.specialty_preset ? item.specialty_preset.toUpperCase() : 'CONSULTA MÉDICA'}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {new Date(item.created_at).toLocaleDateString('pt-BR')} às {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
                          className="text-xs font-bold text-teal-700 cursor-pointer"
                          aria-expanded={expandedHistoryId === item.id}
                        >
                          {expandedHistoryId === item.id ? 'Recolher avaliação completa' : 'Ver avaliação completa'}
                        </button>
                        {expandedHistoryId === item.id && (
                          <SpecialtySectionRenderer
                            specialty={item.specialty_preset}
                            value={item.specialtyNotes?.[specialtyNoteKeys[item.specialty_preset]] || {}}
                            patientId={selectedPatientId}
                            readOnly
                          />
                        )}
                        {expandedHistoryId === item.id && (
                          <details className="text-xs border-t border-slate-200 pt-2">
                            <summary className="cursor-pointer font-bold">Dados completos da consulta</summary>
                            <ClinicalSnapshot
                              record={{
                                module_type: 'ZemdaMed',
                                module_data_json: {
                                  vitalSigns: item.vitalSigns,
                                  physicalExam: item.physicalExam,
                                  neurologicalExam: item.neurologicalExam,
                                  soapNotes: item.soapNotes,
                                  ...item.specialtyNotes
                                }
                              }}
                            />
                          </details>
                        )}
                        {item.specialtyNotes?.sharedAssessments?.zemda360?.assessmentId && (
                          <button
                            type="button"
                            onClick={() => setBodyHistoryId(item.specialtyNotes!.sharedAssessments.zemda360.assessmentId)}
                            className="text-xs font-bold text-teal-700 cursor-pointer"
                          >
                            Ver Zemda360 desta consulta
                          </button>
                        )}
                        {item.chief_complaint && (
                          <p className="text-xs text-slate-700">
                            <strong>QP:</strong> {item.chief_complaint}
                          </p>
                        )}
                        {item.clinical_conduct && (
                          <p className="text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200">
                            <strong>Conduta:</strong> {item.clinical_conduct}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};
