import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Stethoscope,
  Activity,
  Heart,
  Thermometer,
  Scale,
  Brain,
  Search,
  User,
  CheckCircle2,
  Calendar,
  Clock,
  Save,
  FileText,
  AlertTriangle,
  History,
  Sparkles,
  Baby,
  Smile,
  Shield,
  X,
  ChevronRight,
  ArrowRight,
  Flame,
  Check
} from 'lucide-react';
import {
  MedicalSpecialtyPresetKey,
  MedicalSpecialtyPreset,
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

export const MEDICAL_SPECIALTY_PRESETS: MedicalSpecialtyPreset[] = [
  {
    id: 'clinica-medica',
    name: 'Clínica Médica',
    description: 'Atendimento geral do adulto, anamnese completa, rastreamento e conduta clínica.',
    iconName: 'Stethoscope',
    focusAreas: ['Geral', 'Cardiometabólico', 'Prevenção']
  },
  {
    id: 'neurologia',
    name: 'Neurologia',
    description: 'Exame neurológico detalhado, pares cranianos, reflexos, marcha e mapa de sintomas.',
    iconName: 'Brain',
    focusAreas: ['Pares Cranianos', 'Força Motora', 'Reflexos', 'Mapa Corporal']
  },
  {
    id: 'psiquiatria',
    name: 'Psiquiatria',
    description: 'Avaliação do estado mental, humor, afeto, sono, apetite e psicofármacos.',
    iconName: 'Smile',
    focusAreas: ['Humor', 'Afeto', 'Ideação', 'Sono & Apetite']
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
    focusAreas: ['AGA', 'Polifarmácia', 'Risco de Quedas', 'AVD/AIVD']
  },
  {
    id: 'endocrinologia',
    name: 'Endocrinologia',
    description: 'Controle glicêmico, metabolismo lipídico, tireoide, obesidade e metas laboratoriais.',
    iconName: 'Scale',
    focusAreas: ['Glicemia', 'Tireoide', 'Metabolismo', 'IMC']
  },
  {
    id: 'ortopedia',
    name: 'Ortopedia',
    description: 'Exame músculo-esquelético, amplitude articular, testes ortopédicos e dor osteoarticular.',
    iconName: 'Activity',
    focusAreas: ['Articulações', 'Amplitude de Movimento', 'Testes Especiais']
  },
  {
    id: 'cardiologia',
    name: 'Cardiologia',
    description: 'Ausculta cardíaca, ritmo, controle pressórico e estratificação de risco cardiovascular.',
    iconName: 'Heart',
    focusAreas: ['Risco Cardiovascular', 'Ausculta', 'Hipertensão', 'Ritmo']
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
    focusAreas: ['Articulações Dolorosas', 'Rigidez Matinal', 'Autoimunidade']
  }
];

const AREA_TO_PRESET_MAP: Record<string, MedicalSpecialtyPresetKey> = {
  'pa-med-clinica': 'clinica-medica',
  'clinica-medica': 'clinica-medica',
  'pa-med-neuro': 'neurologia',
  'neurologia': 'neurologia',
  'pa-med-psiquiatria': 'psiquiatria',
  'psiquiatria': 'psiquiatria',
  'pa-med-pediatria': 'pediatria',
  'pediatria': 'pediatria',
  'pa-med-geriatria': 'geriatria',
  'geriatria': 'geriatria',
  'pa-med-endocrino': 'endocrinologia',
  'pa-med-endocrinologia': 'endocrinologia',
  'endocrinologia': 'endocrinologia',
  'pa-med-ortopedia': 'ortopedia',
  'ortopedia': 'ortopedia',
  'pa-med-cardio': 'cardiologia',
  'pa-med-cardiologia': 'cardiologia',
  'cardiologia': 'cardiologia',
  'pa-med-dermato': 'dermatologia',
  'pa-med-dermatologia': 'dermatologia',
  'dermatologia': 'dermatologia',
  'pa-med-reumato': 'reumatologia',
  'pa-med-reumatologia': 'reumatologia',
  'reumatologia': 'reumatologia',
  'prof-psiquiatra': 'psiquiatria',
  'prof-cardiologista': 'cardiologia',
  'prof-pediatra': 'pediatria',
  'prof-dermatologista': 'dermatologia',
  'prof-neurologista': 'neurologia',
  'prof-ortopedista': 'ortopedia',
  'prof-endocrinologista': 'endocrinologia',
  'prof-geriatra': 'geriatria',
  'prof-reumatologista': 'reumatologia'
};

function resolveUserMedicalPresets(
  practiceAreaIds: string[] | undefined,
  currentUser: any
): MedicalSpecialtyPreset[] {
  const matchedPresetIds = new Set<MedicalSpecialtyPresetKey>();

  if (Array.isArray(practiceAreaIds) && practiceAreaIds.length > 0) {
    for (const areaId of practiceAreaIds) {
      const mapped = AREA_TO_PRESET_MAP[areaId] || AREA_TO_PRESET_MAP[areaId.toLowerCase()];
      if (mapped) matchedPresetIds.add(mapped);
    }
  }

  if (Array.isArray(currentUser?.practiceAreas)) {
    for (const pa of currentUser.practiceAreas) {
      const id = typeof pa === 'string' ? pa : (pa?.id || pa?.slug);
      if (id && AREA_TO_PRESET_MAP[id]) matchedPresetIds.add(AREA_TO_PRESET_MAP[id]);
    }
  }

  const profStr = String(currentUser?.profession || '').toLowerCase();
  const specStr = String(currentUser?.specialty || '').toLowerCase();
  for (const [key, presetKey] of Object.entries(AREA_TO_PRESET_MAP)) {
    const rawKey = key.replace('pa-med-', '').replace('prof-', '');
    if ((rawKey.length > 3 && profStr.includes(rawKey)) || (rawKey.length > 3 && specStr.includes(rawKey))) {
      matchedPresetIds.add(presetKey);
    }
  }

  if (matchedPresetIds.size === 0) {
    if (currentUser?.role === 'superadmin') {
      return MEDICAL_SPECIALTY_PRESETS;
    }
    return [MEDICAL_SPECIALTY_PRESETS[0]];
  }

  const presets = MEDICAL_SPECIALTY_PRESETS.filter(p => matchedPresetIds.has(p.id));
  return presets.length > 0 ? presets : [MEDICAL_SPECIALTY_PRESETS[0]];
}

export const ZemdaMedWorkspace: React.FC<ZemdaMedWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation
}) => {
  const { currentUser, clientTermLabel, practiceAreaIds } = useAuth();
  const { showToast } = useToast();

  const allowedPresets = useMemo(() => {
    return resolveUserMedicalPresets(practiceAreaIds, currentUser);
  }, [practiceAreaIds, currentUser]);

  // Pacientes e Seleção
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [searchPatient, setSearchPatient] = useState<string>('');

  // Preset de Especialidade Ativo - abre direto na especialidade cadastrada do médico
  const [activePreset, setActivePreset] = useState<MedicalSpecialtyPresetKey>(() => {
    const initialAllowed = resolveUserMedicalPresets(practiceAreaIds, currentUser);
    return initialAllowed[0]?.id || 'clinica-medica';
  });

  // Atualiza preset ativo caso allowedPresets mude
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

  // Exame Físico Geral
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

  // Exame Neurológico & Marcadores de Dor
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

  // Especialidades Específicas
  const [psychiatricNotes, setPsychiatricNotes] = useState({
    mood: 'Eutímico',
    affect: 'Adequado e modulado',
    thoughtProcess: 'Lógico e linear, sem delírios ou ideação suicida',
    perception: 'Sem alucinações auditivas ou visuais',
    sleepApetite: 'Sono preservado (7h/noite), apetite estável'
  });

  const [pediatricNotes, setPediatricNotes] = useState({
    growthPercentileWeight: 'P50',
    growthPercentileHeight: 'P50',
    vaccinationStatus: 'Vacinação em dia conforme PNI',
    dnpmMilestones: 'Marcos de desenvolvimento adequados para a faixa etária'
  });

  const [geriatricNotes, setGeriatricNotes] = useState({
    fallRisk: 'Baixo risco',
    polypharmacy: 'Uso de até 3 medicações de uso contínuo',
    katsIndexAVD: 'Independente para AVDs básicas (6/6)',
    lawtonIndexAIVD: 'Independente para instrumentais (8/8)'
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
  const [isSavingDraft, setIsSavingDraft] = useState(false);

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

      const evolutionText = `[ZemdaMed — Consulta de ${MEDICAL_SPECIALTY_PRESETS.find(p => p.id === activePreset)?.name}]\n\n` +
        `• Queixa Principal: ${chiefComplaint || 'Consulta de rotina'}\n` +
        (hpi ? `• HDA: ${hpi}\n` : '') +
        (vitalSigns.bloodPressureSystolic ? `• Sinais Vitais: PA ${vitalSigns.bloodPressureSystolic}/${vitalSigns.bloodPressureDiastolic || ''} mmHg, FC ${vitalSigns.heartRate || '-'} bpm, SpO2 ${vitalSigns.oxygenSaturation || '-'}%, Temp ${vitalSigns.temperature || '-'}°C, IMC ${vitalSigns.bmi || '-'}\n` : '') +
        (cidCode ? `• CID-10: ${cidCode} - ${cidDescription || ''}\n` : '') +
        (diagnosticHypotheses.length > 0 ? `• Hipóteses: ${diagnosticHypotheses.join(', ')}\n` : '') +
        `\n[CONDUTA MÉDICA / PLANO]:\n${clinicalConduct || soapNotes.plan}\n` +
        (returnInDays ? `\n• Retorno previsto em: ${returnInDays} dias` : '');

      await ApiClient.post('/v1/medical/finish-consultation', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId || null,
        title: `Consulta Médica — ${MEDICAL_SPECIALTY_PRESETS.find(p => p.id === activePreset)?.name}`,
        specialtyPreset: activePreset,
        chiefComplaint,
        hpi,
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
      loadPatientConsultations(selectedPatientId);

      if (onFinishConsultation) {
        onFinishConsultation();
      }
    } catch (err: any) {
      console.error('Erro ao finalizar consulta:', err);
      showToast(err.message || 'Erro ao finalizar consulta médica', 'error');
    } finally {
      setIsFinishing(false);
    }
  };

  const filteredPatients = patients.filter(p =>
    (p.name || '').toLowerCase().includes(searchPatient.toLowerCase()) ||
    (p.cpf || '').includes(searchPatient)
  );

  return (
    <div className="space-y-6">
      {/* Top Header ZemdaMed */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
              <Stethoscope className="w-3.5 h-3.5" />
              ZemdaMed • Medicina Especializada
            </span>
            {allowedPresets.length === 1 ? (
              <span className="text-xs px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30">
                {allowedPresets[0].name}
              </span>
            ) : (
              <div className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-full border border-white/20">
                <span className="text-[11px] text-teal-300 font-bold">Especialidade:</span>
                <select
                  value={activePreset}
                  onChange={e => setActivePreset(e.target.value as MedicalSpecialtyPresetKey)}
                  className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
                >
                  {allowedPresets.map(preset => (
                    <option key={preset.id} value={preset.id} className="bg-slate-900 text-white">
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Consultório Médico & Especialidades
          </h1>
          <p className="text-slate-300 text-sm mt-1 max-w-2xl font-medium">
            Prontuário médico com anamnese estruturada, sinais vitais, exame neurológico com mapa de sintomas, notas SOAP e integração ao CID-10.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {selectedPatient && (
            <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 text-right">
              <div className="text-[11px] text-teal-300 font-bold uppercase tracking-wider">
                {clientTermLabel} em Atendimento
              </div>
              <div className="text-sm font-bold text-white truncate max-w-[200px]">
                {selectedPatient.name}
              </div>
            </div>
          )}

          <div className="flex bg-white/10 p-1 rounded-2xl border border-white/10">
            <button
              onClick={() => setActiveTab('consultation')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'consultation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'
              }`}
            >
              Atendimento
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
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
                {p.name} {p.cpf ? `(${p.cpf})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Seletor Compacto Discreto para Médicos com Múltiplas Especialidades */}
      {allowedPresets.length > 1 && (
        <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs flex items-center justify-between gap-4">
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

          {/* Exame Físico por Sistemas & Específico do Preset */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 uppercase tracking-wider border-b border-slate-100 pb-3">
              <Stethoscope className="w-4 h-4 text-teal-600" />
              Exame Físico Especializado ({MEDICAL_SPECIALTY_PRESETS.find(p => p.id === activePreset)?.name})
            </h2>

            {activePreset === 'neurologia' ? (
              <div className="space-y-4">
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
              </div>
            ) : activePreset === 'psiquiatria' ? (
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
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">Extremidades & Pele</label>
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
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none font-mono"
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
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
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
