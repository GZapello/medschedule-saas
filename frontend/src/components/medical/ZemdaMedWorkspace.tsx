import React, { useState, useEffect, useMemo } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useClinicalAutosave } from '../../hooks/useClinicalAutosave';
import { ClinicalAutosaveIndicator } from '../clinical/ClinicalAutosaveIndicator';
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
  HeartHandshake
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

export const ZemdaMedWorkspace: React.FC<ZemdaMedWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation
}) => {
  const { currentUser, clientTermLabel, practiceAreaIds } = useAuth();
  const { showToast } = useToast();

  // Árvore Médica Centralizada e Especialidades do Usuário
  const [medicalTree, setMedicalTree] = useState<MedicalSpecialtyItem[]>([]);
  const [userSpecialtyIds, setUserSpecialtyIds] = useState<string[]>([]);

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

  // Pacientes e Seleção
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [searchPatient, setSearchPatient] = useState<string>('');

  // Preset de Especialidade Ativo
  const [activePreset, setActivePreset] = useState<string>(() => {
    return allowedPresets[0]?.id || 'clinica-medica';
  });

  // Atualiza preset ativo quando allowedPresets for carregado
  useEffect(() => {
    if (allowedPresets.length > 0 && !allowedPresets.some(p => p.id === activePreset)) {
      setActivePreset(allowedPresets[0].id);
    }
  }, [allowedPresets, activePreset]);

  // Estado da Consulta Atual
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [hpi, setHpi] = useState('');
  const [pastMedicalHistory, setPastMedicalHistory] = useState('');
  const [familyHistory, setFamilyHistory] = useState('');
  const [habitsLifestyle, setHabitsLifestyle] = useState('');

  // Sinais Vitais
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
    mentalStatus: 'Vigil, orientado no tempo e espaço, discurso coerente.',
    cranialNerves: 'Pares cranianos (I a XII) sem déficits aparentes.',
    motorSystem: 'Força muscular preservada grau V/V nos 4 membros, tônus normal.',
    reflexes: 'Reflexos bicipital, tricipital, patelar e aquileu presentes e simétricos (+2/+4).',
    sensorySystem: 'Sensibilidade tátil, dolorosa e proprioceptiva preservadas bilateralmente.',
    coordinationAndGait: 'Prova índex-nariz adequada, marcha atípica sem ataxia.',
    meningealSigns: 'Ausência de rigidez de nuca, sinais de Kernig e Brudzinski negativos.',
    painMapMarkers: []
  });

  // Avaliação Psiquiátrica (Psiquiatria)
  const [psychiatricNotes, setPsychiatricNotes] = useState({
    mood: 'Eutímico',
    affect: 'Adequado e modulado',
    thoughtProcess: 'Lógico e linear, sem delírios ou ideação suicida',
    perception: 'Sem alucinações auditivas ou visuais',
    sleepApetite: 'Sono preservado (7h/noite), apetite estável'
  });

  // Avaliação Pediátrica (Pediatria)
  const [pediatricNotes, setPediatricNotes] = useState({
    growthPercentileWeight: 'P50',
    growthPercentileHeight: 'P50',
    vaccinationStatus: 'Vacinação em dia conforme PNI',
    dnpmMilestones: 'Marcos de desenvolvimento neuropsicomotor adequados para a idade',
    feedingType: 'Aleitamento materno / Alimentação da família'
  });

  // Avaliação Geriátrica Ampla (Geriatria)
  const [geriatricNotes, setGeriatricNotes] = useState({
    fallRisk: 'Baixo risco de quedas (Timed Up and Go < 10s)',
    polypharmacy: 'Uso de até 3 medicações de uso contínuo (sem polifarmácia excessiva)',
    katsIndexAVD: 'Independente para AVDs básicas (6/6)',
    lawtonIndexAIVD: 'Independente para AIVDs instrumentais (8/8)',
    cognitiveScreening: 'Mini-Mental: sem indícios de declínio cognitivo significativo'
  });

  // Avaliações Específicas das Demais Especialidades
  const [cardioNotes, setCardioNotes] = useState({
    rhythm: 'Ritmo sinusal regular',
    murmurs: 'Sem sopros patológicos',
    cvRisk: 'Risco cardiovascular intermediário',
    edema: 'Sem edema de membros inferiores'
  });

  const [dermatoNotes, setDermatoNotes] = useState({
    phototype: 'Fototipo III (Fitzpatrick)',
    lesionExam: 'Ectoscopia dermatológica sem lesões suspeitas de malignidade',
    abcdeCriteria: 'Ausência de assimetria, bordas regulares, cor uniforme, diâmetro < 6mm'
  });

  const [orthoNotes, setOrthoNotes] = useState({
    mobilityROM: 'Amplitude de movimento preservada nos segmentos avaliados',
    jointStability: 'Articulações estáveis, sem gaveta ou frouxidão ligamentar',
    palpationPain: 'Sem pontos gatilho dolorosos ou crepitações articulares'
  });

  const [rheumaNotes, setRheumaNotes] = useState({
    tenderJointCount: '0 articulações dolorosas',
    swollenJointCount: '0 articulações edemaciadas',
    morningStiffnessMinutes: 'Sem rigidez matinal significativa (< 15 min)'
  });

  const [gynecoNotes, setGynecoNotes] = useState({
    lmpDate: '',
    breastExam: 'Mamas simétricas, sem nódulos palpáveis ou secreção papilar',
    cervixExam: 'Colo uterino de aspecto eutrófico, sem lesões aparentes',
    preventiveStatus: 'Preventivo Papanicolau em dia'
  });

  const [endocrinoNotes, setEndocrinoNotes] = useState({
    fastingGlucose: '',
    hba1c: '',
    thyroidPalpation: 'Tireoide normopalpável, indolor, sem nódulos',
    waistCircumference: ''
  });

  const [gastroNotes, setGastroNotes] = useState({
    bristolScale: 'Tipo 4 (forma de salsicha, lisa e suave)',
    abdominalExam: 'Abdome indolor, sem visceromegalias palpáveis',
    gerdSymptoms: 'Sem queixas de pirose ou regurgitação'
  });

  const [ophtalmoNotes, setOphtalmoNotes] = useState({
    visualAcuityOD: '20/20',
    visualAcuityOE: '20/20',
    intraocularPressure: '14 mmHg bilateral',
    fundusExam: 'Fundo de olho com papila nítida, rácio E/P normal, vasos preservados'
  });

  const [otorrinoNotes, setOtorrinoNotes] = useState({
    otoscopy: 'Membrana timpânica íntegra, translúcida bilateralmente',
    rhinoscopy: 'Mucosa nasal corada, cornetos normotróficos, sem secreção',
    oropharynx: 'Orofaringe sem hiperemia, amígdalas grau I, palato íntegro'
  });

  const [uroNotes, setUroNotes] = useState({
    ipssScore: 'Sintomas obstrutivos ausentes ou leves',
    urinaryFlow: 'Micção sem esforço, jato urinário satisfatório',
    prostateExam: 'Próstata normotrófica, fibroelástica, indolor'
  });

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
  const [activeTab, setActiveTab] = useState<'consultation' | 'history'>('consultation');

  // Controle de Submissão
  const [isFinishing, setIsFinishing] = useState(false);

  // Carrega Pacientes
  useEffect(() => {
    ApiClient.get<any[]>('/v1/patients')
      .then(res => {
        if (Array.isArray(res)) setPatients(res);
      })
      .catch(err => console.error('Erro ao listar pacientes:', err));
  }, []);

  // Sincroniza Paciente Selecionado
  useEffect(() => {
    if (selectedPatientId && patients.length > 0) {
      const p = patients.find(item => item.id === selectedPatientId);
      setSelectedPatient(p || null);
      loadPatientConsultations(selectedPatientId);
    } else {
      setSelectedPatient(null);
      setConsultationsHistory([]);
    }
  }, [selectedPatientId, patients]);

  // Carrega Histórico Médico do Paciente
  const loadPatientConsultations = async (pId: string) => {
    try {
      setLoadingHistory(true);
      const res = await ApiClient.get<MedicalConsultation[]>(`/v1/medical/consultations/patient/${pId}`);
      if (Array.isArray(res)) {
        setConsultationsHistory(res);
      }
    } catch (err) {
      console.error('Erro ao carregar histórico médico:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Autosave Rascunho Clínico do Atendimento Médico
  const currentDraftPayload = useMemo(() => ({
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
    chiefComplaint, hpi, pastMedicalHistory, familyHistory, habitsLifestyle,
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
      if (!restored) return;
      if (restored.chiefComplaint !== undefined) setChiefComplaint(restored.chiefComplaint);
      if (restored.hpi !== undefined) setHpi(restored.hpi);
      if (restored.pastMedicalHistory !== undefined) setPastMedicalHistory(restored.pastMedicalHistory);
      if (restored.familyHistory !== undefined) setFamilyHistory(restored.familyHistory);
      if (restored.habitsLifestyle !== undefined) setHabitsLifestyle(restored.habitsLifestyle);
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
      if (restored.soapNotes !== undefined) setSoapNotes(prev => ({ ...prev, ...restored.soapNotes }));
      if (restored.cidCode !== undefined) setCidCode(restored.cidCode);
      if (restored.cidDescription !== undefined) setCidDescription(restored.cidDescription);
      if (restored.diagnosticHypotheses !== undefined) setDiagnosticHypotheses(restored.diagnosticHypotheses);
      if (restored.clinicalConduct !== undefined) setClinicalConduct(restored.clinicalConduct);
      if (restored.returnInDays !== undefined) setReturnInDays(restored.returnInDays);
    }
  });

  // Cálculo de IMC Automático
  useEffect(() => {
    if (vitalSigns.weight && vitalSigns.height && vitalSigns.height > 0) {
      const hM = vitalSigns.height > 3 ? vitalSigns.height / 100 : vitalSigns.height;
      const calculatedBmi = Number((vitalSigns.weight / (hM * hM)).toFixed(1));
      setVitalSigns(prev => ({ ...prev, bmi: calculatedBmi }));
    }
  }, [vitalSigns.weight, vitalSigns.height]);

  const getBmiBadge = (bmi?: number) => {
    if (!bmi) return null;
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

      // Anexa achados do exame físico especializado
      if (activePreset === 'neurologia') {
        evolutionText += `\n[EXAME NEUROLÓGICO]:\n• Mental: ${neurologicalExam.mentalStatus}\n• Pares Cranianos: ${neurologicalExam.cranialNerves}\n• Motor: ${neurologicalExam.motorSystem}\n• Reflexos: ${neurologicalExam.reflexes}\n• Marcha: ${neurologicalExam.coordinationAndGait}\n`;
      } else if (activePreset === 'psiquiatria') {
        evolutionText += `\n[EXAME DO ESTADO MENTAL]:\n• Humor: ${psychiatricNotes.mood} | Afeto: ${psychiatricNotes.affect}\n• Pensamento: ${psychiatricNotes.thoughtProcess}\n• Sensopercepção: ${psychiatricNotes.perception}\n• Sono/Apetite: ${psychiatricNotes.sleepApetite}\n`;
      } else if (activePreset === 'pediatria') {
        evolutionText += `\n[PUERICULTURA & CRESCIMENTO]:\n• Percentil Peso/Estatura: ${pediatricNotes.growthPercentileWeight} / ${pediatricNotes.growthPercentileHeight}\n• Vacinação: ${pediatricNotes.vaccinationStatus}\n• DNPM: ${pediatricNotes.dnpmMilestones}\n`;
      } else if (activePreset === 'geriatria') {
        evolutionText += `\n[AVALIAÇÃO GERIÁTRICA AMPLA (AGA)]:\n• Quedas: ${geriatricNotes.fallRisk}\n• Polifarmácia: ${geriatricNotes.polypharmacy}\n• AVD (Katz): ${geriatricNotes.katsIndexAVD} | AIVD (Lawton): ${geriatricNotes.lawtonIndexAIVD}\n`;
      } else if (activePreset === 'cardiologia') {
        evolutionText += `\n[AVALIAÇÃO CARDIOVASCULAR]:\n• Ausculta: ${cardioNotes.murmurs} | Ritmo: ${cardioNotes.rhythm}\n• Estratificação de Risco: ${cardioNotes.cvRisk}\n`;
      } else if (activePreset === 'dermatologia') {
        evolutionText += `\n[EXAME DERMATOLÓGICO]:\n• Lesões: ${dermatoNotes.lesionExam}\n• Fototipo: ${dermatoNotes.phototype} | ABCDE: ${dermatoNotes.abcdeCriteria}\n`;
      } else if (activePreset === 'ortopedia') {
        evolutionText += `\n[EXAME ORTOPÉDICO]:\n• Amplitude/Mobilidade: ${orthoNotes.mobilityROM}\n• Estabilidade: ${orthoNotes.jointStability}\n• Palpação: ${orthoNotes.palpationPain}\n`;
      } else if (activePreset === 'reumatologia') {
        evolutionText += `\n[AVALIAÇÃO REUMATOLÓGICA]:\n• Articulações Dolorosas: ${rheumaNotes.tenderJointCount} | Edemaciadas: ${rheumaNotes.swollenJointCount}\n• Rigidez Matinal: ${rheumaNotes.morningStiffnessMinutes}\n`;
      } else if (activePreset === 'ginecologia' || activePreset === 'ginecologia-obstetricia') {
        evolutionText += `\n[EXAME GINECOLÓGICO / OBSTÉTRICO]:\n• DUM: ${gynecoNotes.lmpDate || 'Não informada'}\n• Mamas: ${gynecoNotes.breastExam}\n• Rastreamento: ${gynecoNotes.preventiveStatus}\n`;
      } else if (activePreset === 'endocrinologia') {
        evolutionText += `\n[METABOLISMO & TIREOIDE]:\n• Glicemia: ${endocrinoNotes.fastingGlucose || '-'} | HbA1c: ${endocrinoNotes.hba1c || '-'}\n• Tireoide: ${endocrinoNotes.thyroidPalpation}\n`;
      } else if (activePreset === 'gastroenterologia') {
        evolutionText += `\n[EXAME GASTROENTEROLÓGICO]:\n• Escala de Bristol: ${gastroNotes.bristolScale}\n• Abdome: ${gastroNotes.abdominalExam}\n`;
      } else if (activePreset === 'oftalmologia') {
        evolutionText += `\n[EXAME OFTALMOLÓGICO]:\n• Acuidade OD/OE: ${ophtalmoNotes.visualAcuityOD} / ${ophtalmoNotes.visualAcuityOE}\n• Pressão Intraocular: ${ophtalmoNotes.intraocularPressure}\n`;
      } else if (activePreset === 'otorrinolaringologia') {
        evolutionText += `\n[EXAME OTORRINOLARINGOLÓGICO]:\n• Otoscopia: ${otorrinoNotes.otoscopy}\n• Rinoscopia/Orofaringe: ${otorrinoNotes.rhinoscopy}\n`;
      } else if (activePreset === 'urologia') {
        evolutionText += `\n[EXAME UROLÓGICO]:\n• Próstata: ${uroNotes.prostateExam}\n• Sintomas IPSS: ${uroNotes.ipssScore}\n`;
      }

      evolutionText += (cidCode ? `\n• CID-10: ${cidCode} - ${cidDescription || ''}\n` : '') +
        (diagnosticHypotheses.length > 0 ? `• Hipóteses: ${diagnosticHypotheses.join(', ')}\n` : '') +
        `\n[CONDUTA MÉDICA / PRESCRIÇÃO]:\n${clinicalConduct || soapNotes.plan}\n` +
        (returnInDays ? `\n• Retorno previsto em: ${returnInDays} dias` : '');

      await ApiClient.post('/v1/medical/finish-consultation', {
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

  const filteredPatients = patients.filter(p => {
    const term = (searchPatient || '').trim().toLowerCase();
    if (!term) return true;
    const name = (p.full_name || p.name || '').toLowerCase();
    const cpfClean = (p.cpf || '').replace(/\D/g, '');
    const termClean = term.replace(/\D/g, '');
    const phone = (p.phone || '').toLowerCase();
    const email = (p.email || '').toLowerCase();
    return (
      name.includes(term) ||
      (termClean.length >= 2 && cpfClean.includes(termClean)) ||
      (p.cpf || '').toLowerCase().includes(term) ||
      phone.includes(term) ||
      email.includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header ZemdaMed */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <Stethoscope className="w-3.5 h-3.5" />
              ZemdaMed • Medicina
            </span>

            {/* Seletor Compacto e Discreto no Topo */}
            {allowedPresets.length === 1 ? (
              <span className="text-xs px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30">
                {allowedPresets[0].name}
              </span>
            ) : (
              <div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full border border-white/20 backdrop-blur-xs">
                <span className="text-xs text-teal-300 font-bold">Especialidade atual:</span>
                <select
                  value={activePreset}
                  onChange={e => setActivePreset(e.target.value)}
                  className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer pr-1"
                >
                  {allowedPresets.map(preset => (
                    <option key={preset.id} value={preset.id} className="bg-slate-900 text-white">
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Indicador Padronizado de Autosave */}
            <div className="ml-2">
              <ClinicalAutosaveIndicator
                status={autosave.autosaveStatus}
                lastSavedTime={autosave.lastSavedTime}
                className="bg-white/10 text-white border-white/20"
              />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Consultório Médico & Especialidades
          </h1>
          <p className="text-slate-300 text-sm mt-1 max-w-2xl font-medium">
            Prontuário médico com anamnese estruturada, sinais vitais, exame físico adaptativo à especialidade, notas SOAP e integração ao CID-10.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {selectedPatient && (
            <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 text-right">
              <div className="text-[11px] text-teal-300 font-bold uppercase tracking-wider">
                {clientTermLabel} em Atendimento
              </div>
              <div className="text-sm font-bold text-white truncate max-w-[200px]">
                {selectedPatient.full_name || selectedPatient.name}
              </div>
            </div>
          )}

          <div className="flex bg-white/10 p-1 rounded-2xl border border-white/10">
            <button
              onClick={() => setActiveTab('consultation')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'consultation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
            >
              Atendimento
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
            >
              Histórico ({consultationsHistory.length})
            </button>
          </div>
        </div>
      </div>

      {/* Seleção do Paciente */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-2">
          1. Selecionar {clientTermLabel}
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Buscar ${clientTermLabel.toLowerCase()} por nome ou CPF...`}
              value={searchPatient}
              onChange={e => setSearchPatient(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          <select
            value={selectedPatientId}
            onChange={e => setSelectedPatientId(e.target.value)}
            className="px-4 py-2.5 text-sm rounded-2xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-teal-500 outline-none min-w-[240px]"
          >
            <option value="">Selecione na lista...</option>
            {filteredPatients.map(p => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.name} {p.cpf ? `(${p.cpf})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Seletor Compacto Discreto para Médicos com Múltiplas Especialidades */}
      {allowedPresets.length > 1 && (
        <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
              Especialidade de Atendimento:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {allowedPresets.map(preset => {
                const isSelected = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setActivePreset(preset.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">
            {allowedPresets.find(p => p.id === activePreset)?.focusAreas.join(' • ')}
          </span>
        </div>
      )}

      {activeTab === 'consultation' ? (
        <div className="space-y-6">
          {/* Card de Sinais Vitais */}
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

          {/* Anamnese Estruturada */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider border-b border-slate-100 pb-3">
              <FileText className="w-4 h-4 text-teal-600" />
              Anamnese Clínica
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Queixa Principal (QP) *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Cefaleia pulsátil há 3 dias acompanhada de náusea..."
                  value={chiefComplaint}
                  onChange={e => setChiefComplaint(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  História da Doença Atual (HDA)
                </label>
                <textarea
                  rows={2}
                  placeholder="Início, localização, intensidade, fatores de melhora e piora..."
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
                  rows={2}
                  placeholder="HAS, DM, cirurgias prévias, alergias medicamentosas..."
                  value={pastMedicalHistory}
                  onChange={e => setPastMedicalHistory(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Histórico Familiar (HF) & Hábitos de Vida
                </label>
                <textarea
                  rows={2}
                  placeholder="Doenças cardiovasculares, neoplasias na família, tabagismo, etilismo, atividade física..."
                  value={habitsLifestyle}
                  onChange={e => setHabitsLifestyle(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* Exame Físico Especializado Adaptativo à Especialidade */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider border-b border-slate-100 pb-3">
              <Stethoscope className="w-4 h-4 text-teal-600" />
              Exame Especializado ({allowedPresets.find(p => p.id === activePreset)?.name || 'Consulta Médica'})
            </h2>

            {/* NEUROLOGIA */}
            {activePreset === 'neurologia' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estado Mental & Funções Corticais</label>
                  <textarea
                    rows={2}
                    value={neurologicalExam.mentalStatus}
                    onChange={e => setNeurologicalExam({ ...neurologicalExam, mentalStatus: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pares Cranianos (I a XII)</label>
                  <textarea
                    rows={2}
                    value={neurologicalExam.cranialNerves}
                    onChange={e => setNeurologicalExam({ ...neurologicalExam, cranialNerves: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sistema Motor & Força (0 a V)</label>
                  <textarea
                    rows={2}
                    value={neurologicalExam.motorSystem}
                    onChange={e => setNeurologicalExam({ ...neurologicalExam, motorSystem: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Coordenação, Marcha & Sinais Meníngeos</label>
                  <textarea
                    rows={2}
                    value={neurologicalExam.coordinationAndGait}
                    onChange={e => setNeurologicalExam({ ...neurologicalExam, coordinationAndGait: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* PSIQUIATRIA */}
            {activePreset === 'psiquiatria' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Humor & Afeto</label>
                  <input
                    type="text"
                    value={psychiatricNotes.mood}
                    onChange={e => setPsychiatricNotes({ ...psychiatricNotes, mood: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Processo do Pensamento & Ideação</label>
                  <input
                    type="text"
                    value={psychiatricNotes.thoughtProcess}
                    onChange={e => setPsychiatricNotes({ ...psychiatricNotes, thoughtProcess: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sensopercepção</label>
                  <input
                    type="text"
                    value={psychiatricNotes.perception}
                    onChange={e => setPsychiatricNotes({ ...psychiatricNotes, perception: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sono & Apetite</label>
                  <input
                    type="text"
                    value={psychiatricNotes.sleepApetite}
                    onChange={e => setPsychiatricNotes({ ...psychiatricNotes, sleepApetite: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* PEDIATRIA */}
            {activePreset === 'pediatria' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Curvas e Percentis de Crescimento</label>
                  <input
                    type="text"
                    placeholder="Ex: Peso P50, Estatura P50, PC P50"
                    value={`${pediatricNotes.growthPercentileWeight} / ${pediatricNotes.growthPercentileHeight}`}
                    onChange={e => setPediatricNotes({ ...pediatricNotes, growthPercentileWeight: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Situação Vacinal (PNI)</label>
                  <input
                    type="text"
                    value={pediatricNotes.vaccinationStatus}
                    onChange={e => setPediatricNotes({ ...pediatricNotes, vaccinationStatus: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Marcos do Desenvolvimento (DNPM)</label>
                  <textarea
                    rows={2}
                    value={pediatricNotes.dnpmMilestones}
                    onChange={e => setPediatricNotes({ ...pediatricNotes, dnpmMilestones: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* GERIATRIA */}
            {activePreset === 'geriatria' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rastreamento de Quedas & Fragilidade</label>
                  <input
                    type="text"
                    value={geriatricNotes.fallRisk}
                    onChange={e => setGeriatricNotes({ ...geriatricNotes, fallRisk: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Polifarmácia & Desprescrição</label>
                  <input
                    type="text"
                    value={geriatricNotes.polypharmacy}
                    onChange={e => setGeriatricNotes({ ...geriatricNotes, polypharmacy: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Autonomia AVD (Índice de Katz)</label>
                  <input
                    type="text"
                    value={geriatricNotes.katsIndexAVD}
                    onChange={e => setGeriatricNotes({ ...geriatricNotes, katsIndexAVD: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Autonomia AIVD (Escala de Lawton)</label>
                  <input
                    type="text"
                    value={geriatricNotes.lawtonIndexAIVD}
                    onChange={e => setGeriatricNotes({ ...geriatricNotes, lawtonIndexAIVD: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* CARDIOLOGIA */}
            {activePreset === 'cardiologia' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ausculta Cardíaca & Sopros</label>
                  <input
                    type="text"
                    value={cardioNotes.murmurs}
                    onChange={e => setCardioNotes({ ...cardioNotes, murmurs: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ritmo & Frequência</label>
                  <input
                    type="text"
                    value={cardioNotes.rhythm}
                    onChange={e => setCardioNotes({ ...cardioNotes, rhythm: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estratificação de Risco Cardiovascular</label>
                  <input
                    type="text"
                    value={cardioNotes.cvRisk}
                    onChange={e => setCardioNotes({ ...cardioNotes, cvRisk: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Edema de MMII & Sinais Congestivos</label>
                  <input
                    type="text"
                    value={cardioNotes.edema}
                    onChange={e => setCardioNotes({ ...cardioNotes, edema: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* DERMATOLOGIA */}
            {activePreset === 'dermatologia' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fototipo de Fitzpatrick</label>
                  <input
                    type="text"
                    value={dermatoNotes.phototype}
                    onChange={e => setDermatoNotes({ ...dermatoNotes, phototype: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Critérios ABCDE de Lesões Pigmentadas</label>
                  <input
                    type="text"
                    value={dermatoNotes.abcdeCriteria}
                    onChange={e => setDermatoNotes({ ...dermatoNotes, abcdeCriteria: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ectoscopia & Dermatoscopia de Lesões</label>
                  <textarea
                    rows={2}
                    value={dermatoNotes.lesionExam}
                    onChange={e => setDermatoNotes({ ...dermatoNotes, lesionExam: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* ORTOPEDIA */}
            {activePreset === 'ortopedia' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Amplitude Articular (ADM) & Mobilidade</label>
                  <input
                    type="text"
                    value={orthoNotes.mobilityROM}
                    onChange={e => setOrthoNotes({ ...orthoNotes, mobilityROM: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estabilidade Articular & Testes Especiais</label>
                  <input
                    type="text"
                    value={orthoNotes.jointStability}
                    onChange={e => setOrthoNotes({ ...orthoNotes, jointStability: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pontos Dolorosos & Crepitações Ósseas</label>
                  <input
                    type="text"
                    value={orthoNotes.palpationPain}
                    onChange={e => setOrthoNotes({ ...orthoNotes, palpationPain: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* REUMATOLOGIA */}
            {activePreset === 'reumatologia' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Contagem Articular Dolorosa</label>
                  <input
                    type="text"
                    value={rheumaNotes.tenderJointCount}
                    onChange={e => setRheumaNotes({ ...rheumaNotes, tenderJointCount: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Contagem Articular Edemaciada (Sinovite)</label>
                  <input
                    type="text"
                    value={rheumaNotes.swollenJointCount}
                    onChange={e => setRheumaNotes({ ...rheumaNotes, swollenJointCount: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rigidez Matinal (Duração em minutos)</label>
                  <input
                    type="text"
                    value={rheumaNotes.morningStiffnessMinutes}
                    onChange={e => setRheumaNotes({ ...rheumaNotes, morningStiffnessMinutes: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* GINECOLOGIA E OBSTETRÍCIA */}
            {(activePreset === 'ginecologia' || activePreset === 'ginecologia-obstetricia') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Data da Última Menstruação (DUM)</label>
                  <input
                    type="date"
                    value={gynecoNotes.lmpDate}
                    onChange={e => setGynecoNotes({ ...gynecoNotes, lmpDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Exame Preventivo (Papanicolau)</label>
                  <input
                    type="text"
                    value={gynecoNotes.preventiveStatus}
                    onChange={e => setGynecoNotes({ ...gynecoNotes, preventiveStatus: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Exame das Mamas</label>
                  <input
                    type="text"
                    value={gynecoNotes.breastExam}
                    onChange={e => setGynecoNotes({ ...gynecoNotes, breastExam: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Exame Especular / Colo Uterino</label>
                  <input
                    type="text"
                    value={gynecoNotes.cervixExam}
                    onChange={e => setGynecoNotes({ ...gynecoNotes, cervixExam: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* ENDOCRINOLOGIA */}
            {activePreset === 'endocrinologia' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Glicemia de Jejum / HGT</label>
                  <input
                    type="text"
                    placeholder="Ex: 95 mg/dL"
                    value={endocrinoNotes.fastingGlucose}
                    onChange={e => setEndocrinoNotes({ ...endocrinoNotes, fastingGlucose: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hemoglobina Glicada (HbA1c)</label>
                  <input
                    type="text"
                    placeholder="Ex: 5.6%"
                    value={endocrinoNotes.hba1c}
                    onChange={e => setEndocrinoNotes({ ...endocrinoNotes, hba1c: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Palpação da Tireoide</label>
                  <input
                    type="text"
                    value={endocrinoNotes.thyroidPalpation}
                    onChange={e => setEndocrinoNotes({ ...endocrinoNotes, thyroidPalpation: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* GASTROENTEROLOGIA */}
            {activePreset === 'gastroenterologia' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Escala de Bristol (Fezes)</label>
                  <input
                    type="text"
                    value={gastroNotes.bristolScale}
                    onChange={e => setGastroNotes({ ...gastroNotes, bristolScale: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sintomas Dispépticos / DRGE</label>
                  <input
                    type="text"
                    value={gastroNotes.gerdSymptoms}
                    onChange={e => setGastroNotes({ ...gastroNotes, gerdSymptoms: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Palpação Abdominal & Visceromegalias</label>
                  <input
                    type="text"
                    value={gastroNotes.abdominalExam}
                    onChange={e => setGastroNotes({ ...gastroNotes, abdominalExam: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* OFTALMOLOGIA */}
            {activePreset === 'oftalmologia' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Acuidade Visual (OD / OE)</label>
                  <input
                    type="text"
                    placeholder="OD: 20/20 | OE: 20/20"
                    value={`${ophtalmoNotes.visualAcuityOD} / ${ophtalmoNotes.visualAcuityOE}`}
                    onChange={e => setOphtalmoNotes({ ...ophtalmoNotes, visualAcuityOD: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pressão Intraocular (Tonometria)</label>
                  <input
                    type="text"
                    value={ophtalmoNotes.intraocularPressure}
                    onChange={e => setOphtalmoNotes({ ...ophtalmoNotes, intraocularPressure: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fundo de Olho & Biomicroscopia</label>
                  <input
                    type="text"
                    value={ophtalmoNotes.fundusExam}
                    onChange={e => setOphtalmoNotes({ ...ophtalmoNotes, fundusExam: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* OTORRINOLARINGOLOGIA */}
            {activePreset === 'otorrinolaringologia' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Otoscopia Bilateral</label>
                  <input
                    type="text"
                    value={otorrinoNotes.otoscopy}
                    onChange={e => setOtorrinoNotes({ ...otorrinoNotes, otoscopy: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rinoscopia & Seios Nasais</label>
                  <input
                    type="text"
                    value={otorrinoNotes.rhinoscopy}
                    onChange={e => setOtorrinoNotes({ ...otorrinoNotes, rhinoscopy: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Orofaringe & Laringe</label>
                  <input
                    type="text"
                    value={otorrinoNotes.oropharynx}
                    onChange={e => setOtorrinoNotes({ ...otorrinoNotes, oropharynx: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* UROLOGIA */}
            {activePreset === 'urologia' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Exame / Toque Prostático</label>
                  <input
                    type="text"
                    value={uroNotes.prostateExam}
                    onChange={e => setUroNotes({ ...uroNotes, prostateExam: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Escore de Sintomas Prostáticos (IPSS)</label>
                  <input
                    type="text"
                    value={uroNotes.ipssScore}
                    onChange={e => setUroNotes({ ...uroNotes, ipssScore: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}

            {/* EXAME FÍSICO GERAL DE BASE (SEMPRE DISPONÍVEL COMO BASE OU CLÍNICA MÉDICA) */}
            {(activePreset === 'clinica-medica' || !['neurologia', 'psiquiatria'].includes(activePreset)) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Aparelho Cardiovascular</label>
                  <textarea
                    rows={2}
                    value={physicalExam.cardiovascular}
                    onChange={e => setPhysicalExam({ ...physicalExam, cardiovascular: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Aparelho Respiratório</label>
                  <textarea
                    rows={2}
                    value={physicalExam.respiratory}
                    onChange={e => setPhysicalExam({ ...physicalExam, respiratory: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Abdome</label>
                  <textarea
                    rows={2}
                    value={physicalExam.abdomen}
                    onChange={e => setPhysicalExam({ ...physicalExam, abdomen: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Extremidades & Pulsos</label>
                  <textarea
                    rows={2}
                    value={physicalExam.extremities}
                    onChange={e => setPhysicalExam({ ...physicalExam, extremities: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Notas SOAP & Hipóteses Diagnósticas com CID-10 */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider border-b border-slate-100 pb-3">
              <Brain className="w-4 h-4 text-teal-600" />
              Diagnóstico, CID-10 & Conduta Médica
            </h2>

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
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Hipóteses Diagnósticas / Diferenciais</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Digite uma hipótese e pressione adicionar..."
                  value={newHypothesis}
                  onChange={e => setNewHypothesis(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddHypothesis(); } }}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddHypothesis}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Adicionar
                </button>
              </div>

              {diagnosticHypotheses.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {diagnosticHypotheses.map((hyp, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 text-teal-800 text-xs font-bold border border-teal-200"
                    >
                      <span>{hyp}</span>
                      <X
                        className="w-3 h-3 cursor-pointer hover:text-rose-600"
                        onClick={() => handleRemoveHypothesis(i)}
                      />
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Conduta Médica & Prescrição */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Conduta Clínica, Orientações & Prescrição Médica *
              </label>
              <textarea
                rows={4}
                required
                placeholder="Prescrição de medicamentos, posologia, exames solicitados, encaminhamentos e recomendações..."
                value={clinicalConduct}
                onChange={e => setClinicalConduct(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none leading-relaxed"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-700">Retorno em:</label>
              <input
                type="number"
                placeholder="30"
                value={returnInDays || ''}
                onChange={e => setReturnInDays(e.target.value ? Number(e.target.value) : undefined)}
                className="w-24 px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none text-center font-bold"
              />
              <span className="text-xs text-slate-500 font-medium">dias</span>
            </div>
          </div>

          {/* Botão de Finalização */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleFinishConsultation}
              disabled={isFinishing || !selectedPatientId}
              className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-teal-700/25 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              <span>{isFinishing ? 'Finalizando e Selando...' : 'Finalizar Consulta e Registrar no Prontuário'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* Aba de Histórico de Consultas Médicas */
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider border-b border-slate-100 pb-3">
            <History className="w-4 h-4 text-teal-600" />
            Histórico Médico Longitudinal {selectedPatient ? `— ${selectedPatient.name}` : ''}
          </h2>

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
  );
};
