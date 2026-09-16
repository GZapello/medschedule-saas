import { useConsultationCompletion } from '../clinical/useConsultationCompletion';
import React, { useState, useEffect } from 'react';
import {
  Apple,
  Scale,
  Activity,
  Calculator,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Heart,
  History,
  Plus,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
  User,
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  Target,
  Flame,
  Utensils,
  BookOpen,
  PieChart
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface NutritionWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
}

export const NutritionWorkspace: React.FC<NutritionWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation
}) => {
  const { currentUser, currentTenant } = useAuth();
  const { showToast } = useToast();

  // Pacientes e Seleção
  const completion = useConsultationCompletion(onFinishConsultation);
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [patientSearch, setPatientSearch] = useState<string>('');

  // Abas do Módulo
  const [activeTab, setActiveTab] = useState<
    'anthropometry' | 'bioimpedance' | 'calculations' | 'recalls' | 'meal_plans' | 'goals' | 'anamnesis' | 'finish'
  >('anthropometry');

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Dados Antropométricos
  const [assessments, setAssessments] = useState<any[]>([]);
  const [anthroForm, setAnthroForm] = useState({
    weight: '',
    height: '',
    waistCirc: '',
    abdominalCirc: '',
    hipCirc: '',
    armCirc: '',
    calfCirc: '',
    neckCirc: '',
    thighCirc: '',
    notes: ''
  });

  // Bioimpedância
  const [bioList, setBioList] = useState<any[]>([]);
  const [bioForm, setBioForm] = useState({
    bodyFatPercent: '',
    muscleMassKg: '',
    boneMassKg: '',
    bodyWaterPercent: '',
    visceralFat: '',
    basalMetabolicRateKcal: '',
    metabolicAge: '',
    deviceModel: '',
    notes: ''
  });

  // Calculadoras Nutricionais
  const [calcFormula, setCalcFormula] = useState<'harris_benedict' | 'mifflin_st_jeor' | 'schofield' | 'dri'>('harris_benedict');
  const [activityFactor, setActivityFactor] = useState<number>(1.2);
  const [injuryFactor, setInjuryFactor] = useState<number>(1.0);
  const [customBmr, setCustomBmr] = useState<string>('');
  const [customGet, setCustomGet] = useState<string>('');
  const [carbPercent, setCarbPercent] = useState<number>(50);
  const [proteinPercent, setProteinPercent] = useState<number>(20);
  const [fatPercent, setFatPercent] = useState<number>(30);

  // Recordatório 24h
  const [recalls, setRecalls] = useState<any[]>([]);
  const [recallForm, setRecallForm] = useState({
    recallDate: new Date().toISOString().split('T')[0],
    isWeekend: false,
    meals: [
      { name: 'Café da Manhã', time: '08:00', foods: '', notes: '' },
      { name: 'Colação', time: '10:30', foods: '', notes: '' },
      { name: 'Almoço', time: '12:30', foods: '', notes: '' },
      { name: 'Lanche da Tarde', time: '16:00', foods: '', notes: '' },
      { name: 'Jantar', time: '19:30', foods: '', notes: '' },
      { name: 'Ceia', time: '22:00', foods: '', notes: '' }
    ],
    waterIntakeMl: '2000',
    notes: ''
  });

  // Banco de Alimentos & Plano Alimentar
  const [foodSearchQuery, setFoodSearchQuery] = useState<string>('');
  const [foodResults, setFoodResults] = useState<any[]>([]);
  const [mealPlans, setMealPlans] = useState<any[]>([]);
  const [planForm, setPlanForm] = useState<any>({
    title: 'Plano Alimentar Individualizado',
    calorieTarget: '2000',
    waterTargetMl: '2500',
    generalGuidelines: 'Mastigue devagar e evite líquidos durante as refeições principais.',
    meals: [
      {
        mealName: 'Café da Manhã',
        mealTime: '07:30',
        items: [{ food: 'Ovo cozido', portion: '2 unidades (100g)', calories: 140, carb: 1, protein: 12, fat: 10 }]
      },
      {
        mealName: 'Almoço',
        mealTime: '12:30',
        items: [
          { food: 'Arroz integral cozido', portion: '4 colheres de sopa (100g)', calories: 120, carb: 25, protein: 2.6, fat: 1 },
          { food: 'Feijão preto cozido', portion: '1 concha média (100g)', calories: 77, carb: 14, protein: 4.5, fat: 0.5 },
          { food: 'Peito de frango grelhado', portion: '1 filé médio (120g)', calories: 190, carb: 0, protein: 36, fat: 4 }
        ]
      }
    ]
  });

  // Metas Nutricionais
  const [goals, setGoals] = useState<any[]>([]);
  const [goalForm, setGoalForm] = useState({
    title: 'Ingestão de Água',
    description: 'Consumir no mínimo 2.5 litros de água por dia',
    category: 'hydration',
    targetValue: '2500 ml',
    deadlineDate: ''
  });

  // Anamnese Nutricional
  const [anamnesisData, setAnamnesisData] = useState<any>({
    clinicalHistory: '',
    bowelHabits: 'regular',
    allergiesIntolerances: '',
    foodAversions: '',
    foodPreferences: '',
    routineWakeUp: '07:00',
    routineSleep: '23:00',
    physicalActivity: 'Nenhuma no momento',
    supplementsInUse: '',
    notes: ''
  });

  // Finalização do Atendimento
  const [consultationEvolution, setConsultationEvolution] = useState<string>('');
  const [consultationConducts, setConsultationConducts] = useState<string>('');
  const [consultationTitle, setConsultationTitle] = useState<string>('Consulta Nutricional');

  // Carrega lista de pacientes da clínica
  useEffect(() => {
    async function loadPatients() {
      try {
        const res = await ApiClient.get<any[]>('/v1/patients');
        if (Array.isArray(res)) {
          setPatients(res);
        }
      } catch (err) {
        console.warn('Erro ao carregar lista de pacientes:', err);
      }
    }
    loadPatients();
  }, []);

  // Seleciona paciente
  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedPatient(null);
      return;
    }
    const found = patients.find(p => p.id === selectedPatientId);
    if (found) {
      setSelectedPatient(found);
      loadPatientData(selectedPatientId);
    } else {
      ApiClient.get<any>(`/v1/patients/${selectedPatientId}`).then(p => {
        setSelectedPatient(p);
        loadPatientData(selectedPatientId);
      }).catch(err => console.warn(err));
    }
  }, [selectedPatientId, patients]);

  // Carrega todos os dados nutricionais do paciente selecionado
  const loadPatientData = async (patId: string) => {
    try {
      setLoading(true);
      const [assRes, bioRes, recRes, planRes, goalRes, anaRes] = await Promise.allSettled([
        ApiClient.get<any[]>(`/v1/nutrition/assessments/${patId}`),
        ApiClient.get<any[]>(`/v1/nutrition/bioimpedance/${patId}`),
        ApiClient.get<any[]>(`/v1/nutrition/recalls/${patId}`),
        ApiClient.get<any[]>(`/v1/nutrition/meal-plans/${patId}`),
        ApiClient.get<any[]>(`/v1/nutrition/goals/${patId}`),
        ApiClient.get<any>(`/v1/nutrition/anamnesis/${patId}`)
      ]);

      if (assRes.status === 'fulfilled' && Array.isArray(assRes.value)) {
        setAssessments(assRes.value);
      }
      if (bioRes.status === 'fulfilled' && Array.isArray(bioRes.value)) {
        setBioList(bioRes.value);
      }
      if (recRes.status === 'fulfilled' && Array.isArray(recRes.value)) {
        setRecalls(recRes.value);
      }
      if (planRes.status === 'fulfilled' && Array.isArray(planRes.value)) {
        setMealPlans(planRes.value);
      }
      if (goalRes.status === 'fulfilled' && Array.isArray(goalRes.value)) {
        setGoals(goalRes.value);
      }
      if (anaRes.status === 'fulfilled' && anaRes.value && anaRes.value.data) {
        setAnamnesisData(anaRes.value.data);
      }
    } catch (err: any) {
      console.warn('Erro ao carregar dados do paciente no ZemdaNutri:', err);
    } finally {
      setLoading(false);
    }
  };

  // Cálculo automático de IMC
  const calculatedBmi = React.useMemo(() => {
    const w = parseFloat(anthroForm.weight.replace(',', '.'));
    const h = parseFloat(anthroForm.height.replace(',', '.'));
    if (!w || !h || h <= 0) return null;
    const heightM = h > 3 ? h / 100 : h;
    const bmi = w / (heightM * heightM);
    return Math.round(bmi * 10) / 10;
  }, [anthroForm.weight, anthroForm.height]);

  const bmiClassification = React.useMemo(() => {
    if (!calculatedBmi) return '';
    if (calculatedBmi < 18.5) return 'Baixo peso';
    if (calculatedBmi < 25) return 'Eutrofia (Peso normal)';
    if (calculatedBmi < 30) return 'Sobrepeso (Pré-obesidade)';
    if (calculatedBmi < 35) return 'Obesidade Grau I';
    if (calculatedBmi < 40) return 'Obesidade Grau II';
    return 'Obesidade Grau III (Grave)';
  }, [calculatedBmi]);

  // Cálculo de Relação Cintura-Quadril (RCQ)
  const calculatedRcq = React.useMemo(() => {
    const waist = parseFloat(anthroForm.waistCirc.replace(',', '.'));
    const hip = parseFloat(anthroForm.hipCirc.replace(',', '.'));
    if (!waist || !hip || hip <= 0) return null;
    return Math.round((waist / hip) * 100) / 100;
  }, [anthroForm.waistCirc, anthroForm.hipCirc]);

  // Cálculo do Gasto Energético (TMB & GET)
  const calculatedEnergy = React.useMemo(() => {
    const w = parseFloat(anthroForm.weight.replace(',', '.')) || (selectedPatient?.weight ? parseFloat(selectedPatient.weight) : 70);
    const h = (parseFloat(anthroForm.height.replace(',', '.')) || (selectedPatient?.height ? parseFloat(selectedPatient.height) : 170));
    const hCm = h > 3 ? h : h * 100;
    const gender = (selectedPatient?.gender || 'female').toLowerCase();
    const age = selectedPatient?.birth_date
      ? Math.floor((new Date().getTime() - new Date(selectedPatient.birth_date).getTime()) / (365.25 * 86400000))
      : 30;

    let tmb = 0;
    if (calcFormula === 'harris_benedict') {
      if (gender.startsWith('m')) {
        tmb = 66.5 + (13.75 * w) + (5.003 * hCm) - (6.75 * age);
      } else {
        tmb = 655.1 + (9.563 * w) + (1.850 * hCm) - (4.676 * age);
      }
    } else if (calcFormula === 'mifflin_st_jeor') {
      if (gender.startsWith('m')) {
        tmb = (10 * w) + (6.25 * hCm) - (5 * age) + 5;
      } else {
        tmb = (10 * w) + (6.25 * hCm) - (5 * age) - 161;
      }
    } else {
      tmb = gender.startsWith('m') ? (15.3 * w) + 679 : (14.7 * w) + 496;
    }

    const effectiveBmr = customBmr ? parseFloat(customBmr) : Math.round(tmb);
    const calculatedGet = Math.round(effectiveBmr * activityFactor * injuryFactor);
    const effectiveGet = customGet ? parseFloat(customGet) : calculatedGet;

    const carbKcal = effectiveGet * (carbPercent / 100);
    const carbG = Math.round(carbKcal / 4);

    const protKcal = effectiveGet * (proteinPercent / 100);
    const protG = Math.round(protKcal / 4);
    const protGPerKg = Math.round((protG / w) * 10) / 10;

    const fatKcal = effectiveGet * (fatPercent / 100);
    const fatG = Math.round(fatKcal / 9);

    return {
      bmr: effectiveBmr,
      totalEnergy: effectiveGet,
      carbG,
      protG,
      protGPerKg,
      fatG
    };
  }, [anthroForm.weight, anthroForm.height, selectedPatient, calcFormula, activityFactor, injuryFactor, customBmr, customGet, carbPercent, proteinPercent, fatPercent]);

  // Salva Avaliação Antropométrica
  const handleSaveAssessment = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente para registrar avaliação', 'info');
      return;
    }
    if (!anthroForm.weight) {
      showToast('Informe ao menos o peso atual do paciente', 'info');
      return;
    }

    try {
      setSaving(true);
      const w = parseFloat(anthroForm.weight.replace(',', '.'));
      const h = anthroForm.height ? parseFloat(anthroForm.height.replace(',', '.')) : null;

      await ApiClient.post('/v1/nutrition/assessments', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId || null,
        weight: w,
        height: h,
        bmi: calculatedBmi,
        waistCirc: anthroForm.waistCirc ? parseFloat(anthroForm.waistCirc.replace(',', '.')) : null,
        abdominalCirc: anthroForm.abdominalCirc ? parseFloat(anthroForm.abdominalCirc.replace(',', '.')) : null,
        hipCirc: anthroForm.hipCirc ? parseFloat(anthroForm.hipCirc.replace(',', '.')) : null,
        armCirc: anthroForm.armCirc ? parseFloat(anthroForm.armCirc.replace(',', '.')) : null,
        calfCirc: anthroForm.calfCirc ? parseFloat(anthroForm.calfCirc.replace(',', '.')) : null,
        neckCirc: anthroForm.neckCirc ? parseFloat(anthroForm.neckCirc.replace(',', '.')) : null,
        thighCirc: anthroForm.thighCirc ? parseFloat(anthroForm.thighCirc.replace(',', '.')) : null,
        notes: anthroForm.notes
      });

      showToast('Avaliação antropométrica salva com sucesso!', 'success');
      loadPatientData(selectedPatientId);
      setAnthroForm({
        weight: '',
        height: '',
        waistCirc: '',
        abdominalCirc: '',
        hipCirc: '',
        armCirc: '',
        calfCirc: '',
        neckCirc: '',
        thighCirc: '',
        notes: ''
      });
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar avaliação antropométrica', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salva Bioimpedância
  const handleSaveBioimpedance = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente para registrar bioimpedância', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/nutrition/bioimpedance', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId || null,
        bodyFatPercent: bioForm.bodyFatPercent ? parseFloat(bioForm.bodyFatPercent.replace(',', '.')) : null,
        muscleMassKg: bioForm.muscleMassKg ? parseFloat(bioForm.muscleMassKg.replace(',', '.')) : null,
        boneMassKg: bioForm.boneMassKg ? parseFloat(bioForm.boneMassKg.replace(',', '.')) : null,
        bodyWaterPercent: bioForm.bodyWaterPercent ? parseFloat(bioForm.bodyWaterPercent.replace(',', '.')) : null,
        visceralFat: bioForm.visceralFat ? parseFloat(bioForm.visceralFat.replace(',', '.')) : null,
        basalMetabolicRateKcal: bioForm.basalMetabolicRateKcal ? parseFloat(bioForm.basalMetabolicRateKcal) : null,
        metabolicAge: bioForm.metabolicAge ? parseInt(bioForm.metabolicAge) : null,
        deviceModel: bioForm.deviceModel || null,
        notes: bioForm.notes || null
      });

      showToast('Registro de bioimpedância salvo com sucesso!', 'success');
      loadPatientData(selectedPatientId);
      setBioForm({
        bodyFatPercent: '',
        muscleMassKg: '',
        boneMassKg: '',
        bodyWaterPercent: '',
        visceralFat: '',
        basalMetabolicRateKcal: '',
        metabolicAge: '',
        deviceModel: '',
        notes: ''
      });
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar bioimpedância', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salva Recordatório 24h
  const handleSaveRecall = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/nutrition/recalls', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId || null,
        recallDate: recallForm.recallDate,
        isWeekend: recallForm.isWeekend,
        meals: recallForm.meals,
        waterIntakeMl: recallForm.waterIntakeMl ? parseInt(recallForm.waterIntakeMl) : null,
        notes: recallForm.notes
      });

      showToast('Recordatório alimentar registrado com sucesso!', 'success');
      loadPatientData(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar recordatório', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Busca no Banco de Alimentos (TACO)
  const handleSearchFood = async (q: string) => {
    setFoodSearchQuery(q);
    if (q.trim().length < 2) {
      setFoodResults([]);
      return;
    }
    try {
      const res = await ApiClient.get<any[]>(`/v1/nutrition/foods?q=${encodeURIComponent(q)}`);
      if (Array.isArray(res)) {
        setFoodResults(res);
      }
    } catch (err) {
      console.warn('Erro ao buscar alimentos:', err);
    }
  };

  // Salva Plano Alimentar
  const handleSaveMealPlan = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/nutrition/meal-plans', {
        patientId: selectedPatientId,
        title: planForm.title,
        calorieTarget: planForm.calorieTarget ? parseInt(planForm.calorieTarget) : null,
        waterTargetMl: planForm.waterTargetMl ? parseInt(planForm.waterTargetMl) : null,
        generalGuidelines: planForm.generalGuidelines,
        meals: planForm.meals
      });

      showToast('Plano alimentar salvo com sucesso!', 'success');
      loadPatientData(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar plano alimentar', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salva Meta Nutricional
  const handleSaveGoal = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/nutrition/goals', {
        patientId: selectedPatientId,
        ...goalForm
      });
      showToast('Meta nutricional cadastrada com sucesso!', 'success');
      loadPatientData(selectedPatientId);
      setGoalForm({
        title: '',
        description: '',
        category: 'hydration',
        targetValue: '',
        deadlineDate: ''
      });
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar meta', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salva Anamnese Nutricional
  const handleSaveAnamnesis = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/nutrition/anamnesis', {
        patientId: selectedPatientId,
        data: anamnesisData
      });
      showToast('Anamnese nutricional salva com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar anamnese', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Finalizar Consulta Nutricional de forma Atômica
  const handleFinishConsultation = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente para finalizar o atendimento', 'info');
      return;
    }
    if (!consultationEvolution.trim()) {
      showToast('Por favor, informe a evolução clínica e conduta nutricional', 'info');
      return;
    }

    try {
      setSaving(true);
      await completion.save('/v1/nutrition/consultations/finish', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId || null,
        title: consultationTitle,
        clinicalEvolution: consultationEvolution,
        conducts: consultationConducts || undefined,
        assessmentData: anthroForm.weight ? {
          weight: parseFloat(anthroForm.weight.replace(',', '.')),
          height: anthroForm.height ? parseFloat(anthroForm.height.replace(',', '.')) : null,
          bmi: calculatedBmi,
          waistCirc: anthroForm.waistCirc ? parseFloat(anthroForm.waistCirc.replace(',', '.')) : null,
          abdominalCirc: anthroForm.abdominalCirc ? parseFloat(anthroForm.abdominalCirc.replace(',', '.')) : null,
          hipCirc: anthroForm.hipCirc ? parseFloat(anthroForm.hipCirc.replace(',', '.')) : null,
          armCirc: anthroForm.armCirc ? parseFloat(anthroForm.armCirc.replace(',', '.')) : null,
          calfCirc: anthroForm.calfCirc ? parseFloat(anthroForm.calfCirc.replace(',', '.')) : null,
          neckCirc: anthroForm.neckCirc ? parseFloat(anthroForm.neckCirc.replace(',', '.')) : null,
          thighCirc: anthroForm.thighCirc ? parseFloat(anthroForm.thighCirc.replace(',', '.')) : null,
          notes: anthroForm.notes
        } : null,
        calculationsData: calculatedEnergy,
        mealPlanData: planForm,
        goalsData: goals, anamnesisData, bioimpedanceData: bioForm, recallData: recallForm, anthropometryForm: anthroForm, goalForm,
        calculationInputs: { calcFormula, activityFactor, injuryFactor, customBmr, customGet, carbPercent, proteinPercent, fatPercent }
      });


    } catch (err: any) {
      showToast(err.message || 'Erro ao finalizar consulta nutricional', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {completion.dialog}
      {/* CABEÇALHO DO MÓDULO ZEMDANUTRI */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
            <Apple className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800">ZemdaNutri</h1>
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                Nutrição Especializada
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Avaliação antropométrica, composição corporal, calculadoras energéticas, planos alimentares e prontuário integrado.
            </p>
          </div>
        </div>

        {/* SELETOR DE PACIENTE */}
        <div className="flex items-center gap-3">
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedPatientId}
              disabled={!!initialAppointmentId}
              onChange={e => setSelectedPatientId(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-none transition-colors"
            >
              <option value="">Selecione um Paciente...</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name} {p.cpf ? `(${p.cpf})` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedPatient && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-900">
              <User className="w-3.5 h-3.5 text-emerald-600" />
              <span>{selectedPatient.full_name}</span>
            </div>
          )}
        </div>
      </div>

      {/* ABAS DE NAVEGAÇÃO */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'anthropometry', label: 'Antropometria', icon: Scale },
          { id: 'bioimpedance', label: 'Bioimpedância', icon: Activity },
          { id: 'calculations', label: 'Calculadoras TMB / GET', icon: Calculator },
          { id: 'recalls', label: 'Recordatório 24h', icon: Clock },
          { id: 'meal_plans', label: 'Plano Alimentar (TACO)', icon: Utensils },
          { id: 'goals', label: 'Metas Nutricionais', icon: Target },
          { id: 'anamnesis', label: 'Anamnese Nutricional', icon: BookOpen },
          { id: 'finish', label: 'Finalizar Atendimento', icon: CheckCircle2 }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selectedPatientId ? (
          <div className="flex flex-col items-center justify-center h-64 text-center bg-white rounded-2xl border border-slate-200 p-8">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <Apple className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Selecione um Paciente</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Escolha um paciente no menu superior para visualizar ou registrar avaliações antropométricas, bioimpedância e planos alimentares.
            </p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ABA 1: ANTROPOMETRIA */}
            {activeTab === 'anthropometry' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                  <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <Scale className="w-4 h-4 text-emerald-600" />
                        Nova Avaliação Antropométrica
                      </h3>
                      <p className="text-xs text-slate-500">
                        Registro de peso, altura, circunferências e cálculo instantâneo de IMC e classificação.
                      </p>
                    </div>

                    {calculatedBmi && (
                      <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-emerald-800">IMC Calculado</span>
                          <p className="text-lg font-extrabold text-emerald-700">{calculatedBmi} kg/m²</p>
                        </div>
                        <div className="h-8 w-px bg-emerald-200" />
                        <div>
                          <span className="text-[10px] uppercase font-bold text-emerald-800">Classificação</span>
                          <p className="text-xs font-bold text-emerald-900">{bmiClassification}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Peso Atual (kg) *</label>
                      <input
                        type="text"
                        placeholder="Ex: 72.5"
                        value={anthroForm.weight}
                        onChange={e => setAnthroForm({ ...anthroForm, weight: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Altura (cm ou m)</label>
                      <input
                        type="text"
                        placeholder="Ex: 172 ou 1.72"
                        value={anthroForm.height}
                        onChange={e => setAnthroForm({ ...anthroForm, height: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Circunferência da Cintura (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 82.0"
                        value={anthroForm.waistCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, waistCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Circunferência do Quadril (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 98.0"
                        value={anthroForm.hipCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, hipCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Circunferência Abdominal (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 86.0"
                        value={anthroForm.abdominalCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, abdominalCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Braço Relaxado (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 31.0"
                        value={anthroForm.armCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, armCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Panturrilha (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 36.5"
                        value={anthroForm.calfCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, calfCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Coxa Medial (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 54.0"
                        value={anthroForm.thighCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, thighCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {calculatedRcq && (
                    <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Relação Cintura-Quadril (RCQ):</span>
                      <span className="font-bold text-slate-900">{calculatedRcq}</span>
                    </div>
                  )}

                  <div className="mt-4">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Observações Clínicas</label>
                    <textarea
                      rows={2}
                      placeholder="Ex: Paciente relata edema pré-menstrual ou retenção hídrica..."
                      value={anthroForm.notes}
                      onChange={e => setAnthroForm({ ...anthroForm, notes: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveAssessment}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {saving ? 'Salvando...' : 'Salvar Avaliação Antropométrica'}
                    </button>
                  </div>
                </div>

                {/* HISTÓRICO ANTROPOMÉTRICO */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                    <History className="w-4 h-4 text-slate-500" />
                    Histórico de Evolução Antropométrica
                  </h3>

                  {assessments.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-4 text-center">Nenhuma avaliação antropométrica registrada ainda.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Data</th>
                            <th className="py-2.5 px-3">Peso</th>
                            <th className="py-2.5 px-3">Altura</th>
                            <th className="py-2.5 px-3">IMC</th>
                            <th className="py-2.5 px-3">Cintura</th>
                            <th className="py-2.5 px-3">Quadril</th>
                            <th className="py-2.5 px-3">Braço</th>
                            <th className="py-2.5 px-3">Observações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {assessments.map(item => (
                            <tr key={item.id} className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-3 font-semibold text-slate-700">{item.assessment_date}</td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">{item.weight} kg</td>
                              <td className="py-2.5 px-3">{item.height ? `${item.height} cm` : '-'}</td>
                              <td className="py-2.5 px-3">
                                <span className="font-bold text-emerald-700">{item.bmi || '-'}</span>
                              </td>
                              <td className="py-2.5 px-3">{item.waist_circ ? `${item.waist_circ} cm` : '-'}</td>
                              <td className="py-2.5 px-3">{item.hip_circ ? `${item.hip_circ} cm` : '-'}</td>
                              <td className="py-2.5 px-3">{item.arm_circ ? `${item.arm_circ} cm` : '-'}</td>
                              <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{item.notes || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 2: BIOIMPEDÂNCIA */}
            {activeTab === 'bioimpedance' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-emerald-600" />
                    Registro de Composição Corporal (Bioimpedância)
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Inserção dos dados do laudo de bioimpedância (InBody, Omron, Tanita ou compatíveis).
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">% Gordura Corporal (BF)</label>
                      <input
                        type="text"
                        placeholder="Ex: 22.4"
                        value={bioForm.bodyFatPercent}
                        onChange={e => setBioForm({ ...bioForm, bodyFatPercent: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Massa Muscular Esquelética (kg)</label>
                      <input
                        type="text"
                        placeholder="Ex: 28.5"
                        value={bioForm.muscleMassKg}
                        onChange={e => setBioForm({ ...bioForm, muscleMassKg: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Água Corporal Total (%)</label>
                      <input
                        type="text"
                        placeholder="Ex: 58.2"
                        value={bioForm.bodyWaterPercent}
                        onChange={e => setBioForm({ ...bioForm, bodyWaterPercent: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Gordura Visceral (Nível)</label>
                      <input
                        type="text"
                        placeholder="Ex: 4"
                        value={bioForm.visceralFat}
                        onChange={e => setBioForm({ ...bioForm, visceralFat: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Taxa Metabólica Basal (kcal)</label>
                      <input
                        type="text"
                        placeholder="Ex: 1450"
                        value={bioForm.basalMetabolicRateKcal}
                        onChange={e => setBioForm({ ...bioForm, basalMetabolicRateKcal: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Idade Metabólica (anos)</label>
                      <input
                        type="text"
                        placeholder="Ex: 26"
                        value={bioForm.metabolicAge}
                        onChange={e => setBioForm({ ...bioForm, metabolicAge: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Modelo do Equipamento</label>
                      <input
                        type="text"
                        placeholder="Ex: InBody 270"
                        value={bioForm.deviceModel}
                        onChange={e => setBioForm({ ...bioForm, deviceModel: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveBioimpedance}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {saving ? 'Salvando...' : 'Salvar Registro de Bioimpedância'}
                    </button>
                  </div>
                </div>

                {/* HISTÓRICO BIOIMPEDÂNCIA */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                    <History className="w-4 h-4 text-slate-500" />
                    Histórico de Bioimpedâncias
                  </h3>
                  {bioList.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-4 text-center">Nenhum exame de bioimpedância registrado.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Data</th>
                            <th className="py-2.5 px-3">% Gordura</th>
                            <th className="py-2.5 px-3">Massa Muscular</th>
                            <th className="py-2.5 px-3">Água Corporal</th>
                            <th className="py-2.5 px-3">Gordura Visceral</th>
                            <th className="py-2.5 px-3">TMB</th>
                            <th className="py-2.5 px-3">Equipamento</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {bioList.map(item => (
                            <tr key={item.id} className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-3 font-semibold text-slate-700">{item.exam_date}</td>
                              <td className="py-2.5 px-3 font-bold text-emerald-700">{item.body_fat_percent}%</td>
                              <td className="py-2.5 px-3">{item.muscle_mass_kg ? `${item.muscle_mass_kg} kg` : '-'}</td>
                              <td className="py-2.5 px-3">{item.body_water_percent ? `${item.body_water_percent}%` : '-'}</td>
                              <td className="py-2.5 px-3">{item.visceral_fat || '-'}</td>
                              <td className="py-2.5 px-3">{item.basal_metabolic_rate_kcal ? `${item.basal_metabolic_rate_kcal} kcal` : '-'}</td>
                              <td className="py-2.5 px-3 text-slate-500">{item.device_model || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 3: CALCULADORAS TMB / GET */}
            {activeTab === 'calculations' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-emerald-600" />
                      Calculadora Nutricional & Gasto Energético
                    </h3>
                    <p className="text-xs text-slate-500">
                      Cálculo de TMB pelas equações padronizadas, estimativa de GET e distribuição de macronutrientes com override manual.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Equação Preditiva</label>
                    <select
                      value={calcFormula}
                      onChange={e => setCalcFormula(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="harris_benedict">Harris-Benedict (1984)</option>
                      <option value="mifflin_st_jeor">Mifflin-St Jeor (1990)</option>
                      <option value="schofield">Schofield (OMS)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Fator Atividade Física (FA)</label>
                    <select
                      value={activityFactor}
                      onChange={e => setActivityFactor(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value={1.2}>Sedentário (1.20)</option>
                      <option value={1.375}>Levemente ativo (1.375)</option>
                      <option value={1.55}>Moderadamente ativo (1.55)</option>
                      <option value={1.725}>Muito ativo (1.725)</option>
                      <option value={1.9}>Extremamente ativo (1.90)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Fator Injúria / Estresse (FI)</label>
                    <select
                      value={injuryFactor}
                      onChange={e => setInjuryFactor(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value={1.0}>Normal / Sem injúria (1.00)</option>
                      <option value={1.1}>Pós-operatório leve (1.10)</option>
                      <option value={1.2}>Fratura / Infecção leve (1.20)</option>
                      <option value={1.3}>Trauma / Cirurgia de grande porte (1.30)</option>
                    </select>
                  </div>
                </div>

                {/* PAINEL DE RESULTADOS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5 bg-gradient-to-br from-emerald-50 to-green-50/50 rounded-2xl border border-emerald-200">
                  <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-emerald-800">Taxa Metabólica Basal (TMB)</span>
                    <p className="text-xl font-extrabold text-emerald-700 mt-1">{calculatedEnergy.bmr} kcal</p>
                    <span className="text-[10px] text-slate-400">Gasto em repouso</span>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-emerald-800">Gasto Total (GET)</span>
                    <p className="text-xl font-extrabold text-emerald-800 mt-1">{calculatedEnergy.totalEnergy} kcal</p>
                    <span className="text-[10px] text-slate-400">TMB × FA × FI</span>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-emerald-800">Meta Proteica</span>
                    <p className="text-xl font-extrabold text-emerald-700 mt-1">{calculatedEnergy.protG} g</p>
                    <span className="text-[10px] text-slate-400">{calculatedEnergy.protGPerKg} g/kg/dia</span>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-xs">
                    <span className="text-[10px] uppercase font-bold text-emerald-800">Carboidratos / Lipídios</span>
                    <p className="text-base font-extrabold text-slate-800 mt-1">{calculatedEnergy.carbG}g CHO | {calculatedEnergy.fatG}g LIP</p>
                    <span className="text-[10px] text-slate-400">{carbPercent}% CHO / {fatPercent}% LIP</span>
                  </div>
                </div>

                {/* AJUSTES MANUAIS (OVERRIDE) */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">Ajuste Manual / Sobrescrever Valores Pelo Nutricionista</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">TMB Manual (kcal)</label>
                      <input
                        type="number"
                        placeholder={`Padrão: ${calculatedEnergy.bmr}`}
                        value={customBmr}
                        onChange={e => setCustomBmr(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">GET / Meta Calórica Manual (kcal)</label>
                      <input
                        type="number"
                        placeholder={`Padrão: ${calculatedEnergy.totalEnergy}`}
                        value={customGet}
                        onChange={e => setCustomGet(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 4: RECORDATÓRIO 24H */}
            {activeTab === 'recalls' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      Recordatório Alimentar de 24 Horas
                    </h3>
                    <p className="text-xs text-slate-500">
                      Registro minucioso da ingestão alimentar habitual ou das últimas 24 horas.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Data de Referência</label>
                    <input
                      type="date"
                      value={recallForm.recallDate}
                      onChange={e => setRecallForm({ ...recallForm, recallDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Dia Atípico / Fim de Semana?</label>
                    <select
                      value={recallForm.isWeekend ? 'yes' : 'no'}
                      onChange={e => setRecallForm({ ...recallForm, isWeekend: e.target.value === 'yes' })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none"
                    >
                      <option value="no">Dia de semana habitual</option>
                      <option value="yes">Fim de semana / Atípico</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ingestão Hídrica Informada (ml)</label>
                    <input
                      type="number"
                      value={recallForm.waterIntakeMl}
                      onChange={e => setRecallForm({ ...recallForm, waterIntakeMl: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none"
                    />
                  </div>
                </div>

                {/* REFEIÇÕES DO RECORDATÓRIO */}
                <div className="space-y-4">
                  {recallForm.meals.map((meal, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{meal.name}</span>
                        <input
                          type="time"
                          value={meal.time}
                          onChange={e => {
                            const updated = [...recallForm.meals];
                            updated[idx].time = e.target.value;
                            setRecallForm({ ...recallForm, meals: updated });
                          }}
                          className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white"
                        />
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Alimentos, preparações, quantidades caseiras (ex: 2 fatias de pão com queijo, 1 xícara de café com açúcar)..."
                        value={meal.foods}
                        onChange={e => {
                          const updated = [...recallForm.meals];
                          updated[idx].foods = e.target.value;
                          setRecallForm({ ...recallForm, meals: updated });
                        }}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none bg-white"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveRecall}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Recordatório 24h'}
                  </button>
                </div>
              </div>
            )}

            {/* ABA 5: PLANO ALIMENTAR & TACO */}
            {activeTab === 'meal_plans' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Utensils className="w-4 h-4 text-emerald-600" />
                      Construtor de Cardápio / Plano Alimentar
                    </h3>
                    <p className="text-xs text-slate-500">
                      Montagem das refeições com busca integrada na Tabela Brasileira de Composição de Alimentos (TACO).
                    </p>
                  </div>
                </div>

                {/* BUSCA NO BANCO DE ALIMENTOS */}
                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-3">
                  <label className="block text-xs font-bold text-emerald-900">Pesquisar na Tabela TACO / IBGE</label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Digite o nome do alimento (ex: arroz, frango, aveia, banana)..."
                      value={foodSearchQuery}
                      onChange={e => handleSearchFood(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-emerald-200 bg-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {foodResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {foodResults.map(item => (
                        <div key={item.id} className="p-2.5 text-xs flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <p className="font-bold text-slate-800">{item.name}</p>
                            <span className="text-[10px] text-slate-500">
                              {item.energy_kcal} kcal | CHO: {item.carbohydrate_g}g | PTN: {item.protein_g}g | LIP: {item.lipid_g}g
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            TACO
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* DADOS DO PLANO */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Título do Plano</label>
                    <input
                      type="text"
                      value={planForm.title}
                      onChange={e => setPlanForm({ ...planForm, title: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Meta Calórica Diária (kcal)</label>
                    <input
                      type="number"
                      value={planForm.calorieTarget}
                      onChange={e => setPlanForm({ ...planForm, calorieTarget: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Meta Hídrica (ml)</label>
                    <input
                      type="number"
                      value={planForm.waterTargetMl}
                      onChange={e => setPlanForm({ ...planForm, waterTargetMl: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                {/* REFEIÇÕES DO PLANO */}
                <div className="space-y-4">
                  {planForm.meals.map((meal: any, mIdx: number) => (
                    <div key={mIdx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={meal.mealName}
                            onChange={e => {
                              const updated = [...planForm.meals];
                              updated[mIdx].mealName = e.target.value;
                              setPlanForm({ ...planForm, meals: updated });
                            }}
                            className="font-bold text-xs px-2 py-1 bg-white border border-slate-200 rounded-lg"
                          />
                          <input
                            type="time"
                            value={meal.mealTime}
                            onChange={e => {
                              const updated = [...planForm.meals];
                              updated[mIdx].mealTime = e.target.value;
                              setPlanForm({ ...planForm, meals: updated });
                            }}
                            className="text-xs px-2 py-1 bg-white border border-slate-200 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        {meal.items.map((item: any, iIdx: number) => (
                          <div key={iIdx} className="flex items-center gap-2 text-xs bg-white p-2.5 rounded-lg border border-slate-200">
                            <span className="font-semibold text-slate-800 flex-1">{item.food}</span>
                            <span className="text-slate-500">{item.portion}</span>
                            <span className="font-bold text-emerald-700">{item.calories} kcal</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveMealPlan}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Plano Alimentar'}
                  </button>
                </div>
              </div>
            )}

            {/* ABA 6: METAS NUTRICIONAIS */}
            {activeTab === 'goals' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-600" />
                      Metas Nutricionais & Acompanhamento
                    </h3>
                    <p className="text-xs text-slate-500">
                      Definição de metas comportamentais, de peso e hidratação com prazo.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Título da Meta</label>
                    <input
                      type="text"
                      placeholder="Ex: Aumentar ingestão hídrica"
                      value={goalForm.title}
                      onChange={e => setGoalForm({ ...goalForm, title: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Categoria</label>
                    <select
                      value={goalForm.category}
                      onChange={e => setGoalForm({ ...goalForm, category: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    >
                      <option value="weight">Peso Corporal</option>
                      <option value="hydration">Hidratação</option>
                      <option value="nutrition">Alimentação / Hábito</option>
                      <option value="activity">Atividade Física</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Valor Alvo</label>
                    <input
                      type="text"
                      placeholder="Ex: 2500 ml/dia ou 68 kg"
                      value={goalForm.targetValue}
                      onChange={e => setGoalForm({ ...goalForm, targetValue: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Prazo / Data Alvo</label>
                    <input
                      type="date"
                      value={goalForm.deadlineDate}
                      onChange={e => setGoalForm({ ...goalForm, deadlineDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Descrição / Instruções da Meta</label>
                  <textarea
                    rows={2}
                    placeholder="Instruções para o paciente atingir a meta..."
                    value={goalForm.description}
                    onChange={e => setGoalForm({ ...goalForm, description: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveGoal}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    Adicionar Meta
                  </button>
                </div>

                {/* LISTA DE METAS */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">Metas Cadastradas</h4>
                  {goals.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">Nenhuma meta cadastrada ainda.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {goals.map(g => (
                        <div key={g.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">{g.title}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {g.status === 'achieved' ? 'Atingida' : 'Em andamento'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">{g.description}</p>
                          <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                            <span>Alvo: <strong>{g.target_value}</strong></span>
                            {g.deadline_date && <span>Prazo: {g.deadline_date}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 7: ANAMNESE NUTRICIONAL */}
            {activeTab === 'anamnesis' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-emerald-600" />
                      Anamnese Nutricional Detalhada
                    </h3>
                    <p className="text-xs text-slate-500">
                      Histórico clínico, hábitos digestivos, aversões alimentares e rotina diária.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Histórico Clínico e Doenças Associadas</label>
                    <textarea
                      rows={3}
                      placeholder="Ex: Diabetes Mellitus tipo 2, hipertensão arterial, histórico familiar..."
                      value={anamnesisData.clinicalHistory}
                      onChange={e => setAnamnesisData({ ...anamnesisData, clinicalHistory: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Alergias e Intolerâncias Alimentares</label>
                    <textarea
                      rows={3}
                      placeholder="Ex: Intolerância à lactose, sensibilidade ao glúten, alergia a frutos do mar..."
                      value={anamnesisData.allergiesIntolerances}
                      onChange={e => setAnamnesisData({ ...anamnesisData, allergiesIntolerances: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Aversões Alimentares</label>
                    <textarea
                      rows={2}
                      placeholder="Alimentos que o paciente recusa ou não consome..."
                      value={anamnesisData.foodAversions}
                      onChange={e => setAnamnesisData({ ...anamnesisData, foodAversions: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Preferências Alimentares</label>
                    <textarea
                      rows={2}
                      placeholder="Alimentos e preparações preferidas pelo paciente..."
                      value={anamnesisData.foodPreferences}
                      onChange={e => setAnamnesisData({ ...anamnesisData, foodPreferences: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveAnamnesis}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Anamnese Nutricional'}
                  </button>
                </div>
              </div>
            )}

            {/* ABA 8: FINALIZAR ATENDIMENTO */}
            {activeTab === 'finish' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Finalizar Consulta Nutricional (Gravação Longitudinal no Prontuário)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Gera o registro oficial com todas as avaliações, metas e plano alimentar vinculados de forma definitiva e atômica.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Título da Consulta</label>
                  <input
                    type="text"
                    value={consultationTitle}
                    onChange={e => setConsultationTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Evolução Clínica Nutricional *</label>
                  <textarea
                    rows={4}
                    placeholder="Descreva o estado nutricional do paciente, evolução antropométrica, adesão ao plano anterior e diagnóstico nutricional..."
                    value={consultationEvolution}
                    onChange={e => setConsultationEvolution(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Condutas Nutricionais & Prescrições</label>
                  <textarea
                    rows={3}
                    placeholder="Conduta dietoterápica, orientações gerais, prescrição de suplementos / fitoterápicos, data de retorno..."
                    value={consultationConducts}
                    onChange={e => setConsultationConducts(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>

                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold">Garantia de Persistência Sem Perda de Dados</h5>
                    <p className="text-emerald-700 mt-0.5">
                      Ao finalizar, a consulta é gravada no banco com transação atômica. O histórico antropométrico, plano e metas permanecerão acessíveis no prontuário.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleFinishConsultation}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-md shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{saving ? 'Finalizando...' : 'Finalizar Consulta e Gravar Prontuário'}</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};
