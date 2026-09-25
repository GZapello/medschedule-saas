import React, { useState, useEffect, useMemo } from 'react';
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
  PieChart,
  Edit2,
  X,
  Printer,
  ChevronDown,
  ChevronUp,
  Layers
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConsultationCompletion } from '../clinical/useConsultationCompletion';
import { PatientPreviousRecordsModal } from '../clinical/PatientPreviousRecordsModal';
import { ExternalTestsManager } from '../common/ExternalTestsManager';
import { MeasurableGoalsManager } from '../common/MeasurableGoalsManager';
import { PatientFollowUpDocumentModal } from '../clinical/PatientFollowUpDocumentModal';
import { useClinicalAutosave } from '../../hooks/useClinicalAutosave';
import { useHorizontalTabScroll } from '../../hooks/useHorizontalTabScroll';
import { ClinicalQuickHeaderActions, ClinicalQuickToolItem } from '../clinical/ClinicalQuickHeaderActions';
import { ClinicalDraftRecoveryModal } from '../clinical/ClinicalDraftRecoveryModal';
import { PatientSearchSelect } from '../common/PatientSearchSelect';

interface NutritionWorkspaceProps {
  initialPatientId?: string;
  initialAppointmentId?: string;
  onFinishConsultation?: () => void;
}

export interface FoodItem {
  id: string;
  name: string;
  category?: string;
  source: string;
  source_code?: string;
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  lipid_g: number;
  fiber_g?: number;
}

export interface MealPlanFoodItem {
  food: string;
  portion: string;
  grams: number;
  calories: number;
  carb: number;
  protein: number;
  fat: number;
  substitutions?: {
    food: string;
    portion: string;
    calories: number;
    carb: number;
    protein: number;
    fat: number;
  }[];
}

export interface MealPlanMeal {
  mealName: string;
  mealTime: string;
  items: MealPlanFoodItem[];
}

export const NutritionWorkspace: React.FC<NutritionWorkspaceProps> = ({
  initialPatientId,
  initialAppointmentId,
  onFinishConsultation
}) => {
  const { currentUser, currentTenant } = useAuth();
  const { showToast } = useToast();
  const completion = useConsultationCompletion(onFinishConsultation);

  // Pacientes e Seleção
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [showPreviousRecordsModal, setShowPreviousRecordsModal] = useState<boolean>(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<
    'evolution' | 'anamnesis' | 'anthropometry' | 'bioimpedance' | 'recalls' | 'calculations' | 'meal_plans' | 'goals' | 'tests' | 'finish'
  >('evolution');

  // Hook para usabilidade e rolagem suave das abas de Nutrição
  const { tabScrollProps } = useHorizontalTabScroll(activeTab);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // 1. Evolução Clínica Nutricional
  const [consultationTitle, setConsultationTitle] = useState<string>('Consulta Nutricional');
  const [consultationEvolution, setConsultationEvolution] = useState<string>('');
  const [consultationConducts, setConsultationConducts] = useState<string>('');
  const [clinicalComplaints, setClinicalComplaints] = useState<string>('');
  const [digestiveSymptoms, setDigestiveSymptoms] = useState<string>('Sem queixas digestivas relatadas');

  // 2. Anamnese Nutricional
  const [anamnesisData, setAnamnesisData] = useState({
    digestiveHealth: 'regular',
    bowelHabits: 'Diário, fezes tipo 3 ou 4 na escala de Bristol',
    waterIntakeLiters: '2.0',
    sleepQuality: 'Adequada (7-8 horas/noite)',
    physicalActivity: 'Musculação 3x/semana moderada',
    foodAllergies: '',
    foodPreferences: '',
    foodAversions: '',
    supplementsInUse: '',
    notes: ''
  });

  // 3. Antropometria
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

  // 4. Bioimpedância
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

  // 5. Recordatório 24h
  const [recalls, setRecalls] = useState<any[]>([]);
  const [recallForm, setRecallForm] = useState({
    recallDate: new Date().toISOString().split('T')[0],
    isWeekend: false,
    meals: [
      { name: 'Café da Manhã', time: '07:30', foods: '', notes: '' },
      { name: 'Colação (Manhã)', time: '10:00', foods: '', notes: '' },
      { name: 'Almoço', time: '12:30', foods: '', notes: '' },
      { name: 'Lanche da Tarde', time: '16:00', foods: '', notes: '' },
      { name: 'Jantar', time: '19:30', foods: '', notes: '' },
      { name: 'Ceia', time: '22:00', foods: '', notes: '' }
    ],
    waterIntakeMl: '2000',
    notes: ''
  });

  // 6. Calculadoras Nutricionais
  const [calcFormula, setCalcFormula] = useState<'harris_benedict' | 'mifflin_st_jeor' | 'schofield' | 'dri'>('harris_benedict');
  const [activityFactor, setActivityFactor] = useState<number>(1.2);
  const [injuryFactor, setInjuryFactor] = useState<number>(1.0);
  const [customBmr, setCustomBmr] = useState<string>('');
  const [customGet, setCustomGet] = useState<string>('');
  const [carbPercent, setCarbPercent] = useState<number>(50);
  const [proteinPercent, setProteinPercent] = useState<number>(20);
  const [fatPercent, setFatPercent] = useState<number>(30);

  // 7. Construtor de Cardápio / Plano Alimentar (TACO / TBCA)
  const [foodSearchQuery, setFoodSearchQuery] = useState<string>('');
  const [foodResults, setFoodResults] = useState<FoodItem[]>([]);
  const [searchingFood, setSearchingFood] = useState<boolean>(false);
  const [selectedMealIndexForAdd, setSelectedMealIndexForAdd] = useState<number>(0);
  const [portionGramsInput, setPortionGramsInput] = useState<number>(100);
  const [addingFoodTarget, setAddingFoodTarget] = useState<FoodItem | null>(null);
  const [addingAsSubstitutionToItemIndex, setAddingAsSubstitutionToItemIndex] = useState<number | null>(null);

  // Modal Criação de Receita
  const [showRecipeModal, setShowRecipeModal] = useState<boolean>(false);
  const [recipeName, setRecipeName] = useState<string>('');
  const [recipeServings, setRecipeServings] = useState<number>(1);
  const [recipeIngredients, setRecipeIngredients] = useState<
    { food: FoodItem; grams: number }[]
  >([]);

  const [planForm, setPlanForm] = useState<{
    title: string;
    calorieTarget: string;
    waterTargetMl: string;
    generalGuidelines: string;
    meals: MealPlanMeal[];
  }>({
    title: 'Plano Alimentar Individualizado',
    calorieTarget: '2000',
    waterTargetMl: '2500',
    generalGuidelines: 'Mastigue devagar e evite líquidos em excesso durante as refeições principais. Manter boa hidratação ao longo do dia.',
    meals: [
      {
        mealName: 'Café da Manhã',
        mealTime: '07:30',
        items: [
          { food: 'Ovo de galinha inteiro cozido', portion: '100g (2 un)', grams: 100, calories: 146, carb: 0.6, protein: 13.3, fat: 9.5 },
          { food: 'Pão de trigo francês', portion: '50g (1 un)', grams: 50, calories: 150, carb: 29.3, protein: 4, fat: 1.5 }
        ]
      },
      {
        mealName: 'Almoço',
        mealTime: '12:30',
        items: [
          { food: 'Arroz polido cozido', portion: '150g', grams: 150, calories: 192, carb: 42.2, protein: 3.8, fat: 0.3 },
          { food: 'Feijão carioca cozido', portion: '100g', grams: 100, calories: 76, carb: 13.6, protein: 4.8, fat: 0.5 },
          { food: 'Frango peito sem pele grelhado', portion: '120g', grams: 120, calories: 191, carb: 0, protein: 38.4, fat: 3.8 }
        ]
      },
      {
        mealName: 'Lanche da Tarde',
        mealTime: '16:00',
        items: [
          { food: 'Banana prata crua', portion: '100g (1 un)', grams: 100, calories: 98, carb: 26, protein: 1.3, fat: 0.1 },
          { food: 'Aveia em flocos', portion: '30g (2 col)', grams: 30, calories: 118, carb: 20, protein: 4.2, fat: 2.2 }
        ]
      },
      {
        mealName: 'Jantar',
        mealTime: '19:30',
        items: [
          { food: 'Frango peito sem pele grelhado', portion: '120g', grams: 120, calories: 191, carb: 0, protein: 38.4, fat: 3.8 },
          { food: 'Batata doce cozida', portion: '150g', grams: 150, calories: 116, carb: 27.6, protein: 0.9, fat: 0.2 }
        ]
      }
    ]
  });

  // Payload do Autosave Universal Clínico (ZemdaNutri)
  const autosavePayload = useMemo(() => ({
    consultationTitle,
    consultationEvolution,
    consultationConducts,
    clinicalComplaints,
    digestiveSymptoms,
    anamnesisData,
    anthroForm,
    bioForm,
    recallForm,
    planForm,
    calcFormula,
    activityFactor,
    carbPercent,
    proteinPercent,
    fatPercent
  }), [
    consultationTitle,
    consultationEvolution,
    consultationConducts,
    clinicalComplaints,
    digestiveSymptoms,
    anamnesisData,
    anthroForm,
    bioForm,
    recallForm,
    planForm,
    calcFormula,
    activityFactor,
    carbPercent,
    proteinPercent,
    fatPercent
  ]);

  const handleRestoreDraft = (data: any) => {
    if (!data) return;
    if (data.consultationTitle !== undefined) setConsultationTitle(data.consultationTitle);
    if (data.consultationEvolution !== undefined) setConsultationEvolution(data.consultationEvolution);
    if (data.consultationConducts !== undefined) setConsultationConducts(data.consultationConducts);
    if (data.clinicalComplaints !== undefined) setClinicalComplaints(data.clinicalComplaints);
    if (data.digestiveSymptoms !== undefined) setDigestiveSymptoms(data.digestiveSymptoms);
    if (data.anamnesisData) setAnamnesisData(prev => ({ ...prev, ...data.anamnesisData }));
    if (data.anthroForm) setAnthroForm(prev => ({ ...prev, ...data.anthroForm }));
    if (data.bioForm) setBioForm(prev => ({ ...prev, ...data.bioForm }));
    if (data.recallForm) setRecallForm(prev => ({ ...prev, ...data.recallForm }));
    if (data.planForm) setPlanForm(prev => ({ ...prev, ...data.planForm }));
    if (data.calcFormula) setCalcFormula(data.calcFormula);
    if (data.activityFactor) setActivityFactor(data.activityFactor);
    if (data.carbPercent) setCarbPercent(data.carbPercent);
    if (data.proteinPercent) setProteinPercent(data.proteinPercent);
    if (data.fatPercent) setFatPercent(data.fatPercent);
  };

  const autosave = useClinicalAutosave({
    moduleType: 'ZemdaNutri',
    patientId: selectedPatientId,
    appointmentId: initialAppointmentId,
    payload: autosavePayload,
    onRestoreDraft: handleRestoreDraft
  });

  // Seleção de paciente e carregamento de dados
  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedPatient(null);
      return;
    }
    ApiClient.get<any>(`/v1/patients/${selectedPatientId}`).then(p => {
      const patData = p?.patient || p;
      setSelectedPatient(patData);
      loadPatientData(selectedPatientId);
    }).catch(err => {
      console.warn('Erro ao carregar paciente:', err);
      loadPatientData(selectedPatientId);
    });
  }, [selectedPatientId]);

  const loadPatientData = async (patId: string) => {
    try {
      setLoading(true);
      const [assRes, bioRes, recRes, planRes, anaRes] = await Promise.allSettled([
        ApiClient.get<any[]>(`/v1/nutrition/assessments/${patId}`),
        ApiClient.get<any[]>(`/v1/nutrition/bioimpedance/${patId}`),
        ApiClient.get<any[]>(`/v1/nutrition/recalls/${patId}`),
        ApiClient.get<any[]>(`/v1/nutrition/meal-plans/${patId}`),
        ApiClient.get<any>(`/v1/nutrition/anamnesis/${patId}`)
      ]);

      if (assRes.status === 'fulfilled' && Array.isArray(assRes.value)) {
        setAssessments(assRes.value);
        if (assRes.value.length > 0) {
          const latest = assRes.value[0];
          setAnthroForm({
            weight: latest.weight ? String(latest.weight) : '',
            height: latest.height ? String(latest.height) : '',
            waistCirc: latest.waist_circumference ? String(latest.waist_circumference) : '',
            abdominalCirc: latest.abdominal_circumference ? String(latest.abdominal_circumference) : '',
            hipCirc: latest.hip_circumference ? String(latest.hip_circumference) : '',
            armCirc: latest.arm_circumference ? String(latest.arm_circumference) : '',
            calfCirc: latest.calf_circumference ? String(latest.calf_circumference) : '',
            neckCirc: latest.neck_circumference ? String(latest.neck_circumference) : '',
            thighCirc: latest.thigh_circumference ? String(latest.thigh_circumference) : '',
            notes: latest.notes || ''
          });
        }
      }

      if (bioRes.status === 'fulfilled' && Array.isArray(bioRes.value)) {
        setBioList(bioRes.value);
      }

      if (recRes.status === 'fulfilled' && Array.isArray(recRes.value)) {
        setRecalls(recRes.value);
      }

      if (planRes.status === 'fulfilled' && Array.isArray(planRes.value) && planRes.value.length > 0) {
        const latestPlan = planRes.value[0];
        try {
          const parsedMeals = typeof latestPlan.meals_json === 'string' ? JSON.parse(latestPlan.meals_json) : latestPlan.meals_json;
          if (Array.isArray(parsedMeals)) {
            setPlanForm(prev => ({
              ...prev,
              title: latestPlan.title || prev.title,
              calorieTarget: latestPlan.calorie_target ? String(latestPlan.calorie_target) : prev.calorieTarget,
              waterTargetMl: latestPlan.water_target_ml ? String(latestPlan.water_target_ml) : prev.waterTargetMl,
              generalGuidelines: latestPlan.general_guidelines || prev.generalGuidelines,
              meals: parsedMeals
            }));
          }
        } catch (e) {
          console.warn('Erro ao processar plano existente:', e);
        }
      }

      if (anaRes.status === 'fulfilled' && anaRes.value) {
        const a = anaRes.value;
        setAnamnesisData({
          digestiveHealth: a.digestive_health || 'regular',
          bowelHabits: a.bowel_habits || '',
          waterIntakeLiters: a.water_intake_liters ? String(a.water_intake_liters) : '2.0',
          sleepQuality: a.sleep_quality || '',
          physicalActivity: a.physical_activity || '',
          foodAllergies: a.food_allergies || '',
          foodPreferences: a.food_preferences || '',
          foodAversions: a.food_aversions || '',
          supplementsInUse: a.supplements_in_use || '',
          notes: a.notes || ''
        });
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do paciente:', err);
    } finally {
      setLoading(false);
    }
  };

  // Cálculo Dinâmico de IMC
  const calculatedBmi = useMemo(() => {
    const w = parseFloat(anthroForm.weight.replace(',', '.'));
    const h = parseFloat(anthroForm.height.replace(',', '.'));
    if (!w || !h || h <= 0) return null;
    const hMeters = h > 3 ? h / 100 : h;
    return (w / (hMeters * hMeters)).toFixed(2);
  }, [anthroForm.weight, anthroForm.height]);

  const bmiClassification = useMemo(() => {
    if (!calculatedBmi) return null;
    const v = parseFloat(calculatedBmi);
    if (v < 18.5) return { label: 'Baixo Peso', color: 'text-amber-600 bg-amber-50' };
    if (v < 24.9) return { label: 'Eutrofia (Peso Normal)', color: 'text-emerald-700 bg-emerald-50' };
    if (v < 29.9) return { label: 'Sobrepeso (Pré-obesidade)', color: 'text-amber-700 bg-amber-50' };
    if (v < 34.9) return { label: 'Obesidade Grau I', color: 'text-rose-600 bg-rose-50' };
    if (v < 39.9) return { label: 'Obesidade Grau II', color: 'text-rose-700 bg-rose-50' };
    return { label: 'Obesidade Grau III (Grave)', color: 'text-rose-900 bg-rose-100' };
  }, [calculatedBmi]);

  // Cálculos Energéticos (TMB, GET, Macronutrientes)
  const calculatedEnergy = useMemo(() => {
    const w = parseFloat(anthroForm.weight.replace(',', '.')) || 70;
    const h = parseFloat(anthroForm.height.replace(',', '.')) || 170;
    const hCm = h < 3 ? h * 100 : h;
    const isFemale = selectedPatient?.gender === 'female';
    const age = selectedPatient?.birth_date
      ? Math.floor((Date.now() - new Date(selectedPatient.birth_date).getTime()) / (365.25 * 86400000))
      : 30;

    let bmr = 0;
    if (calcFormula === 'harris_benedict') {
      if (isFemale) {
        bmr = 655.1 + 9.563 * w + 1.85 * hCm - 4.676 * age;
      } else {
        bmr = 66.5 + 13.75 * w + 5.003 * hCm - 6.755 * age;
      }
    } else if (calcFormula === 'mifflin_st_jeor') {
      if (isFemale) {
        bmr = 10 * w + 6.25 * hCm - 5 * age - 161;
      } else {
        bmr = 10 * w + 6.25 * hCm - 5 * age + 5;
      }
    } else if (calcFormula === 'schofield') {
      if (isFemale) {
        bmr = 14.818 * w + 486.6;
      } else {
        bmr = 15.057 * w + 692.2;
      }
    } else {
      bmr = 10 * w + 6.25 * hCm - 5 * age;
    }

    const finalBmr = customBmr ? parseFloat(customBmr) : Math.round(bmr);
    const get = customGet ? parseFloat(customGet) : Math.round(finalBmr * activityFactor * injuryFactor);

    const carbKcal = (get * carbPercent) / 100;
    const protKcal = (get * proteinPercent) / 100;
    const fatKcal = (get * fatPercent) / 100;

    const carbG = Math.round(carbKcal / 4);
    const protG = Math.round(protKcal / 4);
    const fatG = Math.round(fatKcal / 9);
    const protGPerKg = (protG / w).toFixed(2);

    return {
      bmr: finalBmr,
      totalEnergy: get,
      carbG,
      protG,
      fatG,
      protGPerKg
    };
  }, [
    anthroForm.weight,
    anthroForm.height,
    selectedPatient,
    calcFormula,
    activityFactor,
    injuryFactor,
    customBmr,
    customGet,
    carbPercent,
    proteinPercent,
    fatPercent
  ]);

  // Totalizadores em Tempo Real do Plano Alimentar Atual
  const planTotals = useMemo(() => {
    let calories = 0;
    let carb = 0;
    let protein = 0;
    let fat = 0;

    planForm.meals.forEach(meal => {
      meal.items.forEach(item => {
        calories += item.calories || 0;
        carb += item.carb || 0;
        protein += item.protein || 0;
        fat += item.fat || 0;
      });
    });

    const w = parseFloat(anthroForm.weight.replace(',', '.')) || 70;
    const protPerKg = (protein / w).toFixed(2);
    const targetKcal = parseInt(planForm.calorieTarget) || calculatedEnergy.totalEnergy || 2000;
    const caloriePercent = Math.min(150, Math.round((calories / targetKcal) * 100));

    return {
      calories: Math.round(calories),
      carb: Math.round(carb * 10) / 10,
      protein: Math.round(protein * 10) / 10,
      fat: Math.round(fat * 10) / 10,
      protPerKg,
      targetKcal,
      caloriePercent
    };
  }, [planForm.meals, planForm.calorieTarget, calculatedEnergy.totalEnergy, anthroForm.weight]);

  // Busca de Alimentos no Banco TACO/TBCA
  const handleSearchFood = async (q: string) => {
    setFoodSearchQuery(q);
    if (q.trim().length < 2) {
      setFoodResults([]);
      return;
    }
    try {
      setSearchingFood(true);
      const res = await ApiClient.get<FoodItem[]>(`/v1/nutrition/foods?q=${encodeURIComponent(q)}`);
      if (Array.isArray(res)) {
        setFoodResults(res);
      }
    } catch (err) {
      console.warn('Erro ao buscar alimentos:', err);
    } finally {
      setSearchingFood(false);
    }
  };

  // Adicionar Alimento à Refeição Selecionada
  const handleAddFoodToMeal = (food: FoodItem) => {
    setAddingFoodTarget(food);
    setPortionGramsInput(100);
    setAddingAsSubstitutionToItemIndex(null);
  };

  const handleConfirmAddFood = () => {
    if (!addingFoodTarget) return;

    const grams = portionGramsInput || 100;
    const cal = Math.round((addingFoodTarget.energy_kcal * grams) / 100);
    const cho = Math.round(((addingFoodTarget.carbohydrate_g || 0) * grams) / 100 * 10) / 10;
    const ptn = Math.round(((addingFoodTarget.protein_g || 0) * grams) / 100 * 10) / 10;
    const lip = Math.round(((addingFoodTarget.lipid_g || 0) * grams) / 100 * 10) / 10;

    const updatedMeals = [...planForm.meals];
    const targetMeal = updatedMeals[selectedMealIndexForAdd];

    if (!targetMeal) return;

    if (addingAsSubstitutionToItemIndex !== null && targetMeal.items[addingAsSubstitutionToItemIndex]) {
      // Adiciona como opção de substituição
      const parentItem = targetMeal.items[addingAsSubstitutionToItemIndex];
      if (!parentItem.substitutions) parentItem.substitutions = [];
      parentItem.substitutions.push({
        food: addingFoodTarget.name,
        portion: `${grams}g`,
        calories: cal,
        carb: cho,
        protein: ptn,
        fat: lip
      });
      showToast(`Substituição adicionada a ${parentItem.food}!`, 'success');
    } else {
      // Adiciona como item principal
      targetMeal.items.push({
        food: addingFoodTarget.name,
        portion: `${grams}g`,
        grams,
        calories: cal,
        carb: cho,
        protein: ptn,
        fat: lip,
        substitutions: []
      });
      showToast(`Alimento adicionado a ${targetMeal.mealName}!`, 'success');
    }

    setPlanForm({ ...planForm, meals: updatedMeals });
    setAddingFoodTarget(null);
    setAddingAsSubstitutionToItemIndex(null);
  };

  // Gerenciamento de Refeições
  const handleAddMeal = () => {
    const newMealName = prompt('Nome da nova refeição:', 'Lanche');
    if (!newMealName) return;
    setPlanForm({
      ...planForm,
      meals: [
        ...planForm.meals,
        {
          mealName: newMealName,
          mealTime: '15:00',
          items: []
        }
      ]
    });
  };

  const handleRemoveMeal = (mealIndex: number) => {
    if (!confirm('Deseja remover esta refeição e seus alimentos?')) return;
    const updated = planForm.meals.filter((_, idx) => idx !== mealIndex);
    setPlanForm({ ...planForm, meals: updated });
  };

  const handleRemoveFoodItem = (mealIndex: number, itemIndex: number) => {
    const updatedMeals = [...planForm.meals];
    updatedMeals[mealIndex].items = updatedMeals[mealIndex].items.filter((_, idx) => idx !== itemIndex);
    setPlanForm({ ...planForm, meals: updatedMeals });
  };

  const handleRemoveSubstitution = (mealIndex: number, itemIndex: number, subIndex: number) => {
    const updatedMeals = [...planForm.meals];
    const item = updatedMeals[mealIndex].items[itemIndex];
    if (item && item.substitutions) {
      item.substitutions = item.substitutions.filter((_, idx) => idx !== subIndex);
      setPlanForm({ ...planForm, meals: updatedMeals });
    }
  };

  // Criador de Receitas com cálculo por porção
  const handleAddIngredientToRecipe = (food: FoodItem) => {
    setRecipeIngredients(prev => [...prev, { food, grams: 100 }]);
  };

  const recipeTotals = useMemo(() => {
    let calories = 0;
    let carb = 0;
    let protein = 0;
    let fat = 0;

    recipeIngredients.forEach(item => {
      const g = item.grams || 100;
      calories += (item.food.energy_kcal * g) / 100;
      carb += ((item.food.carbohydrate_g || 0) * g) / 100;
      protein += ((item.food.protein_g || 0) * g) / 100;
      fat += ((item.food.lipid_g || 0) * g) / 100;
    });

    const servings = Math.max(1, recipeServings);
    return {
      totalCal: Math.round(calories),
      totalCarb: Math.round(carb * 10) / 10,
      totalProt: Math.round(protein * 10) / 10,
      totalFat: Math.round(fat * 10) / 10,
      perServingCal: Math.round(calories / servings),
      perServingCarb: Math.round((carb / servings) * 10) / 10,
      perServingProt: Math.round((protein / servings) * 10) / 10,
      perServingFat: Math.round((fat / servings) * 10) / 10
    };
  }, [recipeIngredients, recipeServings]);

  const handleApplyRecipeToMeal = (mealIndex: number) => {
    if (!recipeName.trim() || recipeIngredients.length === 0) {
      showToast('Preencha o nome da receita e adicione ingredientes', 'error');
      return;
    }

    const updatedMeals = [...planForm.meals];
    if (updatedMeals[mealIndex]) {
      updatedMeals[mealIndex].items.push({
        food: `Receita: ${recipeName} (1 porção)`,
        portion: `1 porção de ${recipeServings}`,
        grams: 100,
        calories: recipeTotals.perServingCal,
        carb: recipeTotals.perServingCarb,
        protein: recipeTotals.perServingProt,
        fat: recipeTotals.perServingFat,
        substitutions: []
      });
      setPlanForm({ ...planForm, meals: updatedMeals });
      showToast(`Receita ${recipeName} adicionada com sucesso!`, 'success');
      setShowRecipeModal(false);
      setRecipeName('');
      setRecipeIngredients([]);
    }
  };

  // Salvar Antropometria
  const handleSaveAnthropometry = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    if (!anthroForm.weight) {
      showToast('Informe o peso do paciente', 'error');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/nutrition/assessments', {
        patientId: selectedPatientId,
        appointmentId: initialAppointmentId || null,
        weight: parseFloat(anthroForm.weight.replace(',', '.')),
        height: anthroForm.height ? parseFloat(anthroForm.height.replace(',', '.')) : null,
        bmi: calculatedBmi ? parseFloat(calculatedBmi) : null,
        waistCircumference: anthroForm.waistCirc ? parseFloat(anthroForm.waistCirc.replace(',', '.')) : null,
        abdominalCircumference: anthroForm.abdominalCirc ? parseFloat(anthroForm.abdominalCirc.replace(',', '.')) : null,
        hipCircumference: anthroForm.hipCirc ? parseFloat(anthroForm.hipCirc.replace(',', '.')) : null,
        armCircumference: anthroForm.armCirc ? parseFloat(anthroForm.armCirc.replace(',', '.')) : null,
        calfCircumference: anthroForm.calfCirc ? parseFloat(anthroForm.calfCirc.replace(',', '.')) : null,
        neckCircumference: anthroForm.neckCirc ? parseFloat(anthroForm.neckCirc.replace(',', '.')) : null,
        thighCircumference: anthroForm.thighCirc ? parseFloat(anthroForm.thighCirc.replace(',', '.')) : null,
        notes: anthroForm.notes
      });
      showToast('Avaliação antropométrica salva com sucesso!', 'success');
      await loadPatientData(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar avaliação antropométrica', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salvar Bioimpedância
  const handleSaveBioimpedance = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
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
        basalMetabolicRateKcal: bioForm.basalMetabolicRateKcal ? parseInt(bioForm.basalMetabolicRateKcal) : null,
        metabolicAge: bioForm.metabolicAge ? parseInt(bioForm.metabolicAge) : null,
        deviceModel: bioForm.deviceModel || null,
        notes: bioForm.notes || null
      });
      showToast('Registro de bioimpedância salvo com sucesso!', 'success');
      await loadPatientData(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar bioimpedância', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salvar Recordatório 24h
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
        mealsJson: recallForm.meals,
        waterIntakeMl: recallForm.waterIntakeMl ? parseInt(recallForm.waterIntakeMl) : null,
        notes: recallForm.notes
      });
      showToast('Recordatório 24h salvo com sucesso!', 'success');
      await loadPatientData(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar recordatório', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salvar Plano Alimentar
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
      showToast('Plano alimentar salvo com sucesso no banco de dados!', 'success');
      await loadPatientData(selectedPatientId);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar plano alimentar', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Salvar Anamnese
  const handleSaveAnamnesis = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/nutrition/anamnesis', {
        patientId: selectedPatientId,
        ...anamnesisData,
        waterIntakeLiters: anamnesisData.waterIntakeLiters ? parseFloat(anamnesisData.waterIntakeLiters.replace(',', '.')) : null
      });
      showToast('Anamnese nutricional salva com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar anamnese', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 10. Finalização Canônica do Atendimento
  const handleFinishConsultation = async () => {
    if (!selectedPatientId) {
      showToast('Selecione um paciente para finalizar o atendimento', 'info');
      return;
    }
    if (!consultationEvolution.trim()) {
      showToast('Por favor, descreva a evolução clínica do paciente na aba Evolução ou Finalização', 'error');
      setActiveTab('evolution');
      return;
    }

    try {
      setSaving(true);
      await completion.save('/v1/nutrition/consultations/finish', {
        patientId: selectedPatientId,
        patientName: selectedPatient?.full_name,
        appointmentId: initialAppointmentId || null,
        moduleType: 'ZemdaNutri',
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
        anamnesisData,
        bioimpedanceData: bioForm,
        recallData: recallForm
      });
      await autosave.clearDraft();
      showToast('Consulta nutricional finalizada e gravada com sucesso!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Erro ao finalizar consulta nutricional', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Helper para texto do plano alimentar para o documento do paciente
  const generatedMealPlanText = useMemo(() => {
    return planForm.meals.map(m => {
      const itemsList = m.items.map(it => {
        let text = `• ${it.food} (${it.portion}) - ${it.calories} kcal`;
        if (it.substitutions && it.substitutions.length > 0) {
          text += '\n  ↳ Opções de substituição: ' + it.substitutions.map(s => `${s.food} (${s.portion})`).join(' ou ');
        }
        return text;
      }).join('\n');
      return `[ ${m.mealName.toUpperCase()} - ${m.mealTime} ]\n${itemsList}`;
    }).join('\n\n');
  }, [planForm.meals]);

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
              Evolução, avaliação antropométrica, composição corporal, calculadoras energéticas, planos alimentares e metas.
            </p>
          </div>
        </div>

        {/* SELETOR DE PACIENTE */}
        <div className="flex items-center gap-3">
          <PatientSearchSelect
            compact
            value={selectedPatientId}
            selectedPatient={selectedPatient}
            disabled={!!initialAppointmentId}
            onChange={(id, pat) => {
              setSelectedPatientId(id);
              if (pat) setSelectedPatient(pat);
              else if (!id) setSelectedPatient(null);
            }}
          />

          {selectedPatientId && (
            <ClinicalQuickHeaderActions
              autosaveStatus={autosave.autosaveStatus}
              lastSavedTime={autosave.lastSavedTime}
              onViewPreviousRecords={() => setShowPreviousRecordsModal(true)}
              onFinishConsultation={() => setActiveTab('finish')}
              finishLabel="Finalizar Atendimento"
              isSubmitting={saving}
              tools={[
                {
                  id: 'patient_guide',
                  label: 'Guia do Paciente',
                  icon: Printer,
                  onClick: () => setShowFollowUpModal(true)
                }
              ]}
              toolsVariant="emerald"
              toolsLabel="Ferramentas"
            />
          )}
        </div>
      </div>

      {/* 10 ABAS DE NAVEGAÇÃO ORDENADAS (Trilha Limpa com Rolagem Livre) */}
      <div className="bg-white border-b border-slate-200 px-6 shrink-0">
        <div {...tabScrollProps} className={`${tabScrollProps.className} flex items-center gap-1 py-1`}>
          {[
            { id: 'evolution', label: '1. Evolução', icon: Activity },
            { id: 'anamnesis', label: '2. Anamnese', icon: BookOpen },
            { id: 'anthropometry', label: '3. Antropometria', icon: Scale },
            { id: 'bioimpedance', label: '4. Composição / Bioimpedância', icon: Activity },
            { id: 'recalls', label: '5. Recordatório 24h', icon: Clock },
            { id: 'calculations', label: '6. Cálculos Energéticos', icon: Calculator },
            { id: 'meal_plans', label: '7. Plano Alimentar Builder', icon: Utensils },
            { id: 'goals', label: '8. Metas', icon: Target },
            { id: 'tests', label: '9. Testes Externos', icon: FileText },
            { id: 'finish', label: '10. Finalização', icon: CheckCircle2 }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tour={`tab-${tab.id}`}
                data-active={isActive}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
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
              Escolha um paciente no seletor superior para iniciar a consulta nutricional, avaliar antropometria e construir o plano alimentar.
            </p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ========================================== */}
            {/* ABA 1: EVOLUÇÃO CLÍNICA NUTRICIONAL */}
            {/* ========================================== */}
            {activeTab === 'evolution' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-600" />
                      Evolução Clínica & Conduta Nutricional
                    </h3>
                    <p className="text-xs text-slate-500">
                      Registro longitudinal do atendimento, estado nutricional, adesão dietética e condutas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('finish')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Ir para Finalização
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <label className="block text-xs font-bold text-slate-700 mb-1">Sintomas Digestivos / Gastrointestinais</label>
                    <input
                      type="text"
                      value={digestiveSymptoms}
                      onChange={e => setDigestiveSymptoms(e.target.value)}
                      placeholder="Ex: Refluxo, distensão abdominal, constipação..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Queixas Principais & Relato Subjetivo do Paciente
                  </label>
                  <textarea
                    rows={2}
                    value={clinicalComplaints}
                    onChange={e => setClinicalComplaints(e.target.value)}
                    placeholder="Relato do paciente sobre fome, saciedade, rotina, apetite e rotina alimentar..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Evolução Clínica Nutricional *
                  </label>
                  <textarea
                    rows={5}
                    value={consultationEvolution}
                    onChange={e => setConsultationEvolution(e.target.value)}
                    placeholder="Descreva detalhadamente a evolução do paciente: avaliação do peso atual, adesão ao plano alimentar anterior, mudanças no comportamento alimentar, diagnóstico nutricional e raciocínio clínico..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Conduta Dietoterápica & Prescrições Nutricionais
                  </label>
                  <textarea
                    rows={3}
                    value={consultationConducts}
                    onChange={e => setConsultationConducts(e.target.value)}
                    placeholder="Ajustes calóricos, introdução ou remoção de alimentos, suplementação (creatina, whey, ômega 3), metas comportamentais e data de retorno..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-400">
                    A evolução é vinculada automaticamente ao prontuário do paciente na finalização.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('anthropometry')}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Avançar para Antropometria →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================== */}
            {/* ABA 2: ANAMNESE NUTRICIONAL */}
            {/* ========================================== */}
            {activeTab === 'anamnesis' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-emerald-600" />
                      Anamnese Nutricional Detalhada
                    </h3>
                    <p className="text-xs text-slate-500">
                      Hábitos alimentares, rotina, histórico de aversões, alergias e saúde intestinal.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Saúde Digestiva Geral</label>
                    <select
                      value={anamnesisData.digestiveHealth}
                      onChange={e => setAnamnesisData({ ...anamnesisData, digestiveHealth: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none bg-white"
                    >
                      <option value="otima">Ótima / Sem queixas</option>
                      <option value="regular">Regular / Queixas esporádicas</option>
                      <option value="ruim">Ruim (Azia, refluxo ou dor frequente)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Hábito Intestinal (Escala Bristol)</label>
                    <input
                      type="text"
                      value={anamnesisData.bowelHabits}
                      onChange={e => setAnamnesisData({ ...anamnesisData, bowelHabits: e.target.value })}
                      placeholder="Ex: 1x ao dia, Bristol tipo 4"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ingestão Hídrica Habitual (L/dia)</label>
                    <input
                      type="text"
                      value={anamnesisData.waterIntakeLiters}
                      onChange={e => setAnamnesisData({ ...anamnesisData, waterIntakeLiters: e.target.value })}
                      placeholder="Ex: 2.0"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Qualidade do Sono & Rotina</label>
                    <input
                      type="text"
                      value={anamnesisData.sleepQuality}
                      onChange={e => setAnamnesisData({ ...anamnesisData, sleepQuality: e.target.value })}
                      placeholder="Ex: Dorme às 23h, acorda às 07h, sono reparador"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Atividade Física e Treinos</label>
                    <input
                      type="text"
                      value={anamnesisData.physicalActivity}
                      onChange={e => setAnamnesisData({ ...anamnesisData, physicalActivity: e.target.value })}
                      placeholder="Ex: Musculação 4x/semana + 30 min cardio"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Alergias e Intolerâncias Alimentares</label>
                    <textarea
                      rows={2}
                      value={anamnesisData.foodAllergies}
                      onChange={e => setAnamnesisData({ ...anamnesisData, foodAllergies: e.target.value })}
                      placeholder="Ex: Intolerância à lactose, alergia a frutos do mar, sensibilidade ao glúten..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Preferências e Alimentos Favoritos</label>
                    <textarea
                      rows={2}
                      value={anamnesisData.foodPreferences}
                      onChange={e => setAnamnesisData({ ...anamnesisData, foodPreferences: e.target.value })}
                      placeholder="Alimentos que o paciente faz questão de incluir no cardápio..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Aversões Alimentares</label>
                    <textarea
                      rows={2}
                      value={anamnesisData.foodAversions}
                      onChange={e => setAnamnesisData({ ...anamnesisData, foodAversions: e.target.value })}
                      placeholder="Alimentos que o paciente não consome de forma alguma..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Suplementos e Medicamentos em Uso</label>
                    <textarea
                      rows={2}
                      value={anamnesisData.supplementsInUse}
                      onChange={e => setAnamnesisData({ ...anamnesisData, supplementsInUse: e.target.value })}
                      placeholder="Ex: Whey protein, creatina, multivitamínico, anticoncepcional..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveAnamnesis}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Anamnese Nutricional'}
                  </button>
                </div>
              </div>
            )}

            {/* ========================================== */}
            {/* ABA 3: ANTROPOMETRIA */}
            {/* ========================================== */}
            {activeTab === 'anthropometry' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                  <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <Scale className="w-4 h-4 text-emerald-600" />
                        Avaliação Antropométrica
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
                          <p className={`text-xs font-bold px-2 py-0.5 rounded-md ${bmiClassification?.color}`}>
                            {bmiClassification?.label}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Peso Atual (kg) *</label>
                      <input
                        type="text"
                        placeholder="Ex: 72.5"
                        value={anthroForm.weight}
                        onChange={e => setAnthroForm({ ...anthroForm, weight: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Altura (cm ou m)</label>
                      <input
                        type="text"
                        placeholder="Ex: 175 ou 1.75"
                        value={anthroForm.height}
                        onChange={e => setAnthroForm({ ...anthroForm, height: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Cintura (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 82"
                        value={anthroForm.waistCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, waistCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Abdômen (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 88"
                        value={anthroForm.abdominalCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, abdominalCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Quadril (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 102"
                        value={anthroForm.hipCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, hipCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Braço Relaxado (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 32"
                        value={anthroForm.armCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, armCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Coxa Medial (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 56"
                        value={anthroForm.thighCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, thighCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Panturrilha (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 37"
                        value={anthroForm.calfCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, calfCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Pescoço (cm)</label>
                      <input
                        type="text"
                        placeholder="Ex: 38"
                        value={anthroForm.neckCirc}
                        onChange={e => setAnthroForm({ ...anthroForm, neckCirc: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Relação Cintura/Quadril</label>
                      <div className="px-3 py-2 text-xs rounded-xl bg-slate-100 font-bold text-slate-700">
                        {anthroForm.waistCirc && anthroForm.hipCirc && parseFloat(anthroForm.hipCirc) > 0
                          ? (parseFloat(anthroForm.waistCirc) / parseFloat(anthroForm.hipCirc)).toFixed(2)
                          : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Observações da Avaliação Antropométrica</label>
                    <textarea
                      rows={2}
                      placeholder="Condições de aferição, balança utilizada, particularidades..."
                      value={anthroForm.notes}
                      onChange={e => setAnthroForm({ ...anthroForm, notes: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>

                  <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveAnthropometry}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      {saving ? 'Salvando...' : 'Salvar Avaliação Antropométrica'}
                    </button>
                  </div>
                </div>

                {/* Histórico de Medições */}
                {assessments.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Histórico Longitudinal de Antropometria ({assessments.length})
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Data</th>
                            <th className="py-2.5 px-3">Peso</th>
                            <th className="py-2.5 px-3">Altura</th>
                            <th className="py-2.5 px-3">IMC</th>
                            <th className="py-2.5 px-3">Cintura</th>
                            <th className="py-2.5 px-3">Quadril</th>
                            <th className="py-2.5 px-3">RCQ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {assessments.map(a => (
                            <tr key={a.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 font-semibold text-slate-800">
                                {new Date(a.conducted_at || a.created_at).toLocaleDateString('pt-BR')}
                              </td>
                              <td className="py-2.5 px-3 font-bold text-emerald-800">{a.weight} kg</td>
                              <td className="py-2.5 px-3">{a.height} cm</td>
                              <td className="py-2.5 px-3 font-semibold">{a.bmi || '—'}</td>
                              <td className="py-2.5 px-3">{a.waist_circumference ? `${a.waist_circumference} cm` : '—'}</td>
                              <td className="py-2.5 px-3">{a.hip_circumference ? `${a.hip_circumference} cm` : '—'}</td>
                              <td className="py-2.5 px-3">
                                {a.waist_circumference && a.hip_circumference
                                  ? (a.waist_circumference / a.hip_circumference).toFixed(2)
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========================================== */}
            {/* ABA 4: COMPOSIÇÃO CORPORAL / BIOIMPEDÂNCIA */}
            {/* ========================================== */}
            {activeTab === 'bioimpedance' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-600" />
                      Composição Corporal & Bioimpedância Elétrica (BIA)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Percentual de gordura, massa muscular esquelética, gordura visceral e água corporal.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Gordura Corporal (%)</label>
                    <input
                      type="text"
                      placeholder="Ex: 18.5"
                      value={bioForm.bodyFatPercent}
                      onChange={e => setBioForm({ ...bioForm, bodyFatPercent: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Massa Muscular (kg)</label>
                    <input
                      type="text"
                      placeholder="Ex: 33.2"
                      value={bioForm.muscleMassKg}
                      onChange={e => setBioForm({ ...bioForm, muscleMassKg: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Água Corporal (%)</label>
                    <input
                      type="text"
                      placeholder="Ex: 58.0"
                      value={bioForm.bodyWaterPercent}
                      onChange={e => setBioForm({ ...bioForm, bodyWaterPercent: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Gordura Visceral (Nível 1-59)</label>
                    <input
                      type="text"
                      placeholder="Ex: 4"
                      value={bioForm.visceralFat}
                      onChange={e => setBioForm({ ...bioForm, visceralFat: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Massa Óssea (kg)</label>
                    <input
                      type="text"
                      placeholder="Ex: 3.1"
                      value={bioForm.boneMassKg}
                      onChange={e => setBioForm({ ...bioForm, boneMassKg: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Taxa Metabólica Aparelho (kcal)</label>
                    <input
                      type="number"
                      placeholder="Ex: 1650"
                      value={bioForm.basalMetabolicRateKcal}
                      onChange={e => setBioForm({ ...bioForm, basalMetabolicRateKcal: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Idade Metabólica (anos)</label>
                    <input
                      type="number"
                      placeholder="Ex: 26"
                      value={bioForm.metabolicAge}
                      onChange={e => setBioForm({ ...bioForm, metabolicAge: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Modelo do Equipamento BIA</label>
                    <input
                      type="text"
                      placeholder="Ex: InBody 270, Omron 514"
                      value={bioForm.deviceModel}
                      onChange={e => setBioForm({ ...bioForm, deviceModel: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveBioimpedance}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Registro de Bioimpedância'}
                  </button>
                </div>
              </div>
            )}

            {/* ========================================== */}
            {/* ABA 5: RECORDATÓRIO 24H */}
            {/* ========================================== */}
            {activeTab === 'recalls' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      Recordatório Alimentar de 24 Horas
                    </h3>
                    <p className="text-xs text-slate-500">
                      Registro detalhado da ingestão alimentar habitual do dia anterior.
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
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none bg-white"
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
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Recordatório 24h'}
                  </button>
                </div>
              </div>
            )}

            {/* ========================================== */}
            {/* ABA 6: CÁLCULOS ENERGÉTICOS (TMB, GET, VET) */}
            {/* ========================================== */}
            {activeTab === 'calculations' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-emerald-600" />
                      Calculadoras Energéticas & Distribuição de Macronutrientes
                    </h3>
                    <p className="text-xs text-slate-500">
                      Cálculo de TMB e GET pelos métodos consagrados com distribuição percentual e g/kg.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Fórmula Preditiva da TMB</label>
                    <select
                      value={calcFormula}
                      onChange={e => setCalcFormula(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none bg-white"
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
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none bg-white"
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
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none bg-white"
                    >
                      <option value={1.0}>Normal / Sem estresse (1.00)</option>
                      <option value={1.1}>Pós-operatório leve (1.10)</option>
                      <option value={1.2}>Fratura / Infecção leve (1.20)</option>
                      <option value={1.3}>Trauma / Cirurgia grande (1.30)</option>
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

                {/* SLIDERS DE MACRONUTRIENTES */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                  <h4 className="text-xs font-bold text-slate-800">Ajuste da Distribuição dos Macronutrientes (%)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span>Carboidratos: {carbPercent}%</span>
                        <span className="text-slate-500">{calculatedEnergy.carbG}g</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="75"
                        step="5"
                        value={carbPercent}
                        onChange={e => setCarbPercent(parseInt(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span>Proteínas: {proteinPercent}%</span>
                        <span className="text-slate-500">{calculatedEnergy.protG}g</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="50"
                        step="5"
                        value={proteinPercent}
                        onChange={e => setProteinPercent(parseInt(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span>Lipídios: {fatPercent}%</span>
                        <span className="text-slate-500">{calculatedEnergy.fatG}g</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="50"
                        step="5"
                        value={fatPercent}
                        onChange={e => setFatPercent(parseInt(e.target.value))}
                        className="w-full accent-emerald-600"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Soma atual: {carbPercent + proteinPercent + fatPercent}%
                  </p>
                </div>
              </div>
            )}

            {/* ========================================== */}
            {/* ABA 7: CONSTRUTOR DE PLANO ALIMENTAR (TACO / TBCA) */}
            {/* ========================================== */}
            {activeTab === 'meal_plans' && (
              <div className="space-y-6">
                
                {/* BANNER DE TOTAIS DO DIA X METAS */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-800">Totalizadores do Cardápio</span>
                      <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                        <span>{planTotals.calories} kcal planejadas</span>
                        <span className="text-xs text-slate-400 font-normal">
                          / Meta: {planTotals.targetKcal} kcal ({planTotals.caloriePercent}%)
                        </span>
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <div className="px-3 py-1.5 bg-blue-50 text-blue-900 rounded-xl border border-blue-100 font-semibold">
                        CHO: <strong>{planTotals.carb}g</strong>
                      </div>
                      <div className="px-3 py-1.5 bg-emerald-50 text-emerald-900 rounded-xl border border-emerald-100 font-semibold">
                        PTN: <strong>{planTotals.protein}g</strong> ({planTotals.protPerKg} g/kg)
                      </div>
                      <div className="px-3 py-1.5 bg-amber-50 text-amber-900 rounded-xl border border-amber-100 font-semibold">
                        LIP: <strong>{planTotals.fat}g</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowRecipeModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl font-bold transition-colors cursor-pointer"
                      >
                        <PieChart className="w-3.5 h-3.5" />
                        <span>+ Criar Receita</span>
                      </button>
                    </div>
                  </div>

                  <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        planTotals.caloriePercent > 105
                          ? 'bg-amber-500'
                          : planTotals.caloriePercent >= 90
                          ? 'bg-emerald-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(100, planTotals.caloriePercent)}%` }}
                    />
                  </div>
                </div>

                {/* BUSCA NO BANCO DE ALIMENTOS — TACO / TBCA (Item 6) */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Search className="w-4 h-4 text-emerald-600" />
                        Banco de Alimentos — TACO / TBCA
                      </h4>
                      <p className="text-xs text-slate-500">
                        Busca rápida sem acentos por nome, categoria ou código oficial (TACO / Tabela Brasileira de Composição de Alimentos).
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Inserir na refeição:</span>
                      <select
                        value={selectedMealIndexForAdd}
                        onChange={e => setSelectedMealIndexForAdd(parseInt(e.target.value))}
                        className="text-xs font-semibold px-2.5 py-1.5 border border-slate-200 rounded-xl bg-slate-50"
                      >
                        {planForm.meals.map((m, idx) => (
                          <option key={idx} value={idx}>{m.mealName}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Buscar alimento por nome ou categoria (ex: arroz, frango, feijão, aveia, maçã, queijo)..."
                      value={foodSearchQuery}
                      onChange={e => handleSearchFood(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-emerald-200 bg-emerald-50/20 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  {searchingFood && (
                    <p className="text-xs text-slate-400 py-2">Consultando banco de alimentos...</p>
                  )}

                  {foodResults.length > 0 && (
                    <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {foodResults.map(item => (
                        <div
                          key={item.id}
                          className="p-3 text-xs flex items-center justify-between hover:bg-emerald-50/50 transition-colors"
                        >
                          <div className="flex-1 pr-3">
                            <div className="flex items-center gap-2">
                              <strong className="text-slate-900">{item.name}</strong>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                {item.source}
                              </span>
                              {item.category && (
                                <span className="text-[10px] text-slate-400">({item.category})</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Por 100g: <strong>{item.energy_kcal} kcal</strong> | CHO: {item.carbohydrate_g}g | PTN: {item.protein_g}g | LIP: {item.lipid_g}g
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddFoodToMeal(item)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" /> Adicionar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* MODAL ADICIONAR PORÇÃO ESPECÍFICA */}
                {addingFoodTarget && (
                  <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
                      <div className="flex items-center justify-between border-b pb-3">
                        <h4 className="font-bold text-sm text-slate-900">Definir Quantidade / Porção</h4>
                        <button onClick={() => setAddingFoodTarget(null)} className="p-1 text-slate-400 hover:text-slate-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-800">{addingFoodTarget.name}</p>
                        <p className="text-[11px] text-slate-500">
                          Destino: <strong>{planForm.meals[selectedMealIndexForAdd]?.mealName}</strong>
                          {addingAsSubstitutionToItemIndex !== null && ' (Substituição)'}
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Quantidade em gramas (g)</label>
                        <input
                          type="number"
                          min={1}
                          value={portionGramsInput}
                          onChange={e => setPortionGramsInput(parseInt(e.target.value) || 100)}
                          className="w-full px-3 py-2 text-xs border rounded-xl font-bold text-slate-900"
                        />
                      </div>

                      <div className="p-3 bg-emerald-50 rounded-xl text-xs text-emerald-900 space-y-1">
                        <span className="font-bold block text-[11px] uppercase">Valores calculados da porção:</span>
                        <div className="grid grid-cols-4 gap-1 text-center font-bold">
                          <div>{Math.round((addingFoodTarget.energy_kcal * portionGramsInput) / 100)} kcal</div>
                          <div>CHO: {Math.round(((addingFoodTarget.carbohydrate_g || 0) * portionGramsInput) / 100)}g</div>
                          <div>PTN: {Math.round(((addingFoodTarget.protein_g || 0) * portionGramsInput) / 100)}g</div>
                          <div>LIP: {Math.round(((addingFoodTarget.lipid_g || 0) * portionGramsInput) / 100)}g</div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setAddingFoodTarget(null)}
                          className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmAddFood}
                          className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs"
                        >
                          Confirmar e Inserir
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* REFEIÇÕES DO PLANO BUILDER */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-800">Refeições do Cardápio ({planForm.meals.length})</h4>
                    <button
                      type="button"
                      onClick={handleAddMeal}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar Refeição
                    </button>
                  </div>

                  {planForm.meals.map((meal, mIdx) => {
                    let mealKcal = 0;
                    let mealCho = 0;
                    let mealPtn = 0;
                    let mealLip = 0;
                    meal.items.forEach(it => {
                      mealKcal += it.calories || 0;
                      mealCho += it.carb || 0;
                      mealPtn += it.protein || 0;
                      mealLip += it.fat || 0;
                    });

                    return (
                      <div key={mIdx} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={meal.mealName}
                              onChange={e => {
                                const updated = [...planForm.meals];
                                updated[mIdx].mealName = e.target.value;
                                setPlanForm({ ...planForm, meals: updated });
                              }}
                              className="font-bold text-sm text-slate-900 bg-transparent hover:bg-slate-50 border border-transparent hover:border-slate-200 rounded-lg px-2 py-0.5"
                            />
                            <input
                              type="time"
                              value={meal.mealTime}
                              onChange={e => {
                                const updated = [...planForm.meals];
                                updated[mIdx].mealTime = e.target.value;
                                setPlanForm({ ...planForm, meals: updated });
                              }}
                              className="text-xs px-2 py-0.5 border border-slate-200 rounded-lg bg-slate-50"
                            />
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg">
                              {Math.round(mealKcal)} kcal (CHO: {Math.round(mealCho)}g | PTN: {Math.round(mealPtn)}g | LIP: {Math.round(mealLip)}g)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveMeal(mIdx)}
                              className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                              title="Remover refeição"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Itens da Refeição */}
                        <div className="space-y-2">
                          {meal.items.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-2">
                              Nenhum alimento nesta refeição. Pesquise na tabela TACO/TBCA acima para inserir itens.
                            </p>
                          ) : (
                            meal.items.map((item, iIdx) => (
                              <div key={iIdx} className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex-1 pr-2">
                                    <span className="font-bold text-slate-900">{item.food}</span>
                                    <span className="text-slate-500 ml-2 font-medium">({item.portion})</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-bold text-emerald-700">{item.calories} kcal</span>
                                    <span className="text-[11px] text-slate-500">
                                      CHO: {item.carb}g | PTN: {item.protein}g | LIP: {item.fat}g
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedMealIndexForAdd(mIdx);
                                        setAddingAsSubstitutionToItemIndex(iIdx);
                                        showToast(`Pesquise um alimento acima para adicionar como substituição de ${item.food}`, 'info');
                                      }}
                                      className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md hover:bg-teal-100 transition-colors"
                                      title="Adicionar opção de substituição"
                                    >
                                      + Substituição
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveFoodItem(mIdx, iIdx)}
                                      className="text-slate-400 hover:text-rose-600 p-0.5"
                                      title="Remover alimento"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Substituições */}
                                {item.substitutions && item.substitutions.length > 0 && (
                                  <div className="pl-4 border-l-2 border-teal-300 space-y-1 mt-1">
                                    <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider block">
                                      Opções de Substituição:
                                    </span>
                                    {item.substitutions.map((sub, sIdx) => (
                                      <div key={sIdx} className="flex items-center justify-between text-[11px] text-slate-600 bg-white p-1.5 rounded-lg border border-slate-200">
                                        <span>↳ {sub.food} ({sub.portion}) - {sub.calories} kcal</span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveSubstitution(mIdx, iIdx, sIdx)}
                                          className="text-slate-400 hover:text-rose-600 p-0.5"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowFollowUpModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" /> Visualizar Impressão A4 do Paciente
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveMealPlan}
                    className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Salvar Plano Alimentar no Prontuário'}
                  </button>
                </div>
              </div>
            )}

            {/* ========================================== */}
            {/* ABA 8: METAS (Item 7) */}
            {/* ========================================== */}
            {activeTab === 'goals' && (
              <MeasurableGoalsManager
                patientId={selectedPatientId}
                specialty="nutri"
                moduleType="nutri"
              />
            )}

            {/* ========================================== */}
            {/* ABA 9: TESTES EXTERNOS (Item 4) */}
            {/* ========================================== */}
            {activeTab === 'tests' && (
              <ExternalTestsManager
                patientId={selectedPatientId}
                moduleType="nutri"
              />
            )}

            {/* ========================================== */}
            {/* ABA 10: FINALIZAÇÃO CANÔNICA (Item 10) */}
            {/* ========================================== */}
            {activeTab === 'finish' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Finalização da Consulta Nutricional
                    </h3>
                    <p className="text-xs text-slate-500">
                      Revisão geral, gravação no prontuário eletrônico com assinatura legal e geração de documento de acompanhamento.
                    </p>
                  </div>
                </div>

                {/* Checklist da Consulta */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs">
                    <span className="font-bold text-emerald-900 block mb-1">Antropometria</span>
                    <p className="text-emerald-700">
                      {anthroForm.weight ? `Peso: ${anthroForm.weight} kg (IMC: ${calculatedBmi || '—'})` : 'Nenhum peso aferido hoje'}
                    </p>
                  </div>
                  <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs">
                    <span className="font-bold text-emerald-900 block mb-1">Cálculo Energético</span>
                    <p className="text-emerald-700">
                      GET: {calculatedEnergy.totalEnergy} kcal | PTN: {calculatedEnergy.protG}g
                    </p>
                  </div>
                  <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs">
                    <span className="font-bold text-emerald-900 block mb-1">Cardápio Planejado</span>
                    <p className="text-emerald-700">
                      {planTotals.calories} kcal ({planForm.meals.length} refeições)
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Evolução Clínica e Conduta Nutricional *</label>
                  <textarea
                    rows={5}
                    value={consultationEvolution}
                    onChange={e => setConsultationEvolution(e.target.value)}
                    placeholder="Descreva a evolução da consulta, conduta terapêutica e recomendações..."
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowFollowUpModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-teal-700" />
                    <span>Gerar Acompanhamento para o Paciente</span>
                  </button>

                  <button
                    type="button"
                    disabled={saving || !consultationEvolution.trim()}
                    onClick={handleFinishConsultation}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{saving ? 'Gravando no Prontuário...' : 'Finalizar Atendimento'}</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Modal Criar Receita */}
      {showRecipeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-sm text-slate-900">Criador de Receita com Macros por Porção</h3>
              <button onClick={() => setShowRecipeModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome da Receita *</label>
                <input
                  type="text"
                  placeholder="Ex: Panqueca de Aveia e Banana"
                  value={recipeName}
                  onChange={e => setRecipeName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rendimento (Nº de Porções) *</label>
                <input
                  type="number"
                  min={1}
                  value={recipeServings}
                  onChange={e => setRecipeServings(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-xs border rounded-xl font-bold"
                />
              </div>
            </div>

            {/* Ingredientes adicionados */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">
                Ingredientes ({recipeIngredients.length}):
              </span>
              {recipeIngredients.length === 0 ? (
                <p className="text-xs text-slate-400 italic bg-slate-50 p-2.5 rounded-xl">
                  Nenhum ingrediente adicionado. Pesquise no banco TACO acima e clique em Adicionar.
                </p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {recipeIngredients.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="font-medium text-slate-800">{item.food.name}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={item.grams}
                          onChange={e => {
                            const updated = [...recipeIngredients];
                            updated[idx].grams = parseInt(e.target.value) || 100;
                            setRecipeIngredients(updated);
                          }}
                          className="w-16 px-1.5 py-0.5 border rounded text-xs font-bold text-center"
                        />
                        <span className="text-slate-400">g</span>
                        <button
                          type="button"
                          onClick={() => setRecipeIngredients(recipeIngredients.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-rose-600 p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Painel por porção */}
            <div className="p-3 bg-emerald-50 rounded-xl text-xs space-y-1">
              <span className="text-[10px] font-bold text-emerald-900 uppercase">Valores por Porção (1/{recipeServings}):</span>
              <div className="grid grid-cols-4 gap-2 text-center font-bold text-emerald-800">
                <div>{recipeTotals.perServingCal} kcal</div>
                <div>CHO: {recipeTotals.perServingCarb}g</div>
                <div>PTN: {recipeTotals.perServingProt}g</div>
                <div>LIP: {recipeTotals.perServingFat}g</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowRecipeModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleApplyRecipeToMeal(selectedMealIndexForAdd)}
                className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs"
              >
                Inserir na Refeição Selecionada
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Prontuários Anteriores */}
      {showPreviousRecordsModal && selectedPatientId && (
        <PatientPreviousRecordsModal
          patientId={selectedPatientId}
          patientName={selectedPatient?.full_name}
          onClose={() => setShowPreviousRecordsModal(false)}
        />
      )}

      {/* Modal Guia do Paciente (PDF Handout) */}
      {showFollowUpModal && selectedPatientId && (
        <PatientFollowUpDocumentModal
          isOpen={showFollowUpModal}
          onClose={() => setShowFollowUpModal(false)}
          patientId={selectedPatientId}
          patientName={selectedPatient?.full_name || 'Paciente'}
          moduleType="ZemdaNutri"
          initialGuidelines={planForm.generalGuidelines}
          mealPlanText={generatedMealPlanText}
        />
      )}

      <ClinicalDraftRecoveryModal
        isOpen={autosave.conflictModalOpen}
        onClose={() => autosave.resolveConflict('local')}
        serverDraftTime={autosave.serverDraftData?.updated_at || autosave.serverDraftData?.client_updated_at}
        localDraftTime={autosave.localDraftData?.clientUpdatedAt}
        onRecoverServer={() => autosave.resolveConflict('server')}
        onKeepCurrent={() => autosave.resolveConflict('local')}
      />
    </div>
  );
};
