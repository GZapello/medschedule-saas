import React, { useState, useEffect } from 'react';
import {
  X,
  ClipboardCheck,
  Scale,
  Ruler,
  Activity,
  Camera,
  Save,
  CheckCircle2,
  AlertCircle,
  Heart,
  Dumbbell,
  Layers,
  Plus,
  Trash2,
  HelpCircle,
  Flame
} from 'lucide-react';
import { Student, TavProtocol, StrengthTestItem, EnduranceTestItem } from './types';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { FileImageUploader } from '../common/FileImageUploader';

interface PersonalAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  student?: Student | null;
  studentsList?: Student[];
  assessmentToEdit?: any;
}

export const PersonalAssessmentModal: React.FC<PersonalAssessmentModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  student,
  studentsList = [],
  assessmentToEdit
}) => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'anthropometry' | 'composition' | 'skinfolds' | 'cardio_tests' | 'photos_notes'>('anthropometry');

  const [selectedStudentId, setSelectedStudentId] = useState(student?.id || '');
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split('T')[0]);

  // Tab 1: Antropometria Básica & Perímetros (cm)
  const [weight, setWeight] = useState<number | ''>(student?.current_weight || '');
  const [height, setHeight] = useState<number | ''>(student?.height || '');

  // Perímetros com lateralidade D / E
  const [neckCm, setNeckCm] = useState<number | ''>('');
  const [shoulderCm, setShoulderCm] = useState<number | ''>('');
  const [chestCm, setChestCm] = useState<number | ''>('');
  const [waistCm, setWaistCm] = useState<number | ''>('');
  const [abdomenCm, setAbdomenCm] = useState<number | ''>('');
  const [hipCm, setHipCm] = useState<number | ''>('');

  const [armRightRelaxed, setArmRightRelaxed] = useState<number | ''>('');
  const [armLeftRelaxed, setArmLeftRelaxed] = useState<number | ''>('');
  const [armRightFlexed, setArmRightFlexed] = useState<number | ''>('');
  const [armLeftFlexed, setArmLeftFlexed] = useState<number | ''>('');

  const [forearmRight, setForearmRight] = useState<number | ''>('');
  const [forearmLeft, setForearmLeft] = useState<number | ''>('');
  const [wristRight, setWristRight] = useState<number | ''>('');
  const [wristLeft, setWristLeft] = useState<number | ''>('');

  const [thighRightProx, setThighRightProx] = useState<number | ''>('');
  const [thighLeftProx, setThighLeftProx] = useState<number | ''>('');
  const [thighRightMed, setThighRightMed] = useState<number | ''>('');
  const [thighLeftMed, setThighLeftMed] = useState<number | ''>('');
  const [thighRightDist, setThighRightDist] = useState<number | ''>('');
  const [thighLeftDist, setThighLeftDist] = useState<number | ''>('');

  const [calfRight, setCalfRight] = useState<number | ''>('');
  const [calfLeft, setCalfLeft] = useState<number | ''>('');

  // Tab 2: Composição Corporal & TAV
  const [compositionMethod, setCompositionMethod] = useState<'dobras' | 'bioimpedancia' | 'dxa' | 'outro'>('dobras');
  const [manualFatPct, setManualFatPct] = useState<number | ''>('');
  const [manualMuscleMass, setManualMuscleMass] = useState<number | ''>('');
  const [bodyWaterLiters, setBodyWaterLiters] = useState<number | ''>('');
  const [bmrKcal, setBmrKcal] = useState<number | ''>('');

  // Módulo TAV (Tecido Adiposo Visceral)
  const [tavValue, setTavValue] = useState<number | ''>('');
  const [tavUnit, setTavUnit] = useState<string>('nível');
  const [tavMethod, setTavMethod] = useState<string>('Bioimpedância');
  const [tavEquipment, setTavEquipment] = useState<string>('InBody');
  const [tavProtocolId, setTavProtocolId] = useState<string>('');
  const [tavClassification, setTavClassification] = useState<string>('');
  const [tavColorCode, setTavColorCode] = useState<string>('#10B981');
  const [tavNotes, setTavNotes] = useState<string>('');
  const [tavProtocolsList, setTavProtocolsList] = useState<TavProtocol[]>([]);

  // Tab 3: Dobras Cutâneas (mm)
  const [skinfoldsProtocol, setSkinfoldsProtocol] = useState<'pollock_7' | 'pollock_3' | 'petroski' | 'guedes'>('pollock_7');
  const [foldTriceps, setFoldTriceps] = useState<number | ''>('');
  const [foldSubscapular, setFoldSubscapular] = useState<number | ''>('');
  const [foldBiceps, setFoldBiceps] = useState<number | ''>('');
  const [foldChest, setFoldChest] = useState<number | ''>('');
  const [foldAxillary, setFoldAxillary] = useState<number | ''>('');
  const [foldSuprailiac, setFoldSuprailiac] = useState<number | ''>('');
  const [foldAbdominal, setFoldAbdominal] = useState<number | ''>('');
  const [foldThigh, setFoldThigh] = useState<number | ''>('');
  const [foldCalf, setFoldCalf] = useState<number | ''>('');

  // Tab 4: Cardio & Testes Funcionais
  const [restingHeartRate, setRestingHeartRate] = useState<number | ''>('');
  const [bloodPressureSystolic, setBloodPressureSystolic] = useState<number | ''>('');
  const [bloodPressureDiastolic, setBloodPressureDiastolic] = useState<number | ''>('');
  const [vo2Max, setVo2Max] = useState<number | ''>('');
  const [vo2MethodType, setVo2MethodType] = useState<string>('Teste Submáximo');
  const [vo2Protocol, setVo2Protocol] = useState<string>('Teste de Caminhada de 1 Milha');
  const [flexibilityWellsCm, setFlexibilityWellsCm] = useState<number | ''>('');

  // Testes de Força 1RM (Dinâmico)
  const [strengthTests, setStrengthTests] = useState<StrengthTestItem[]>([
    { exercise_name: 'Supino Reto', load_kg: 60, reps: 8, one_rm_kg: 76 }
  ]);

  // Testes de Resistência Muscular
  const [endurancePushups, setEndurancePushups] = useState<number | ''>('');
  const [enduranceSitups, setEnduranceSitups] = useState<number | ''>('');
  const [enduranceSquats, setEnduranceSquats] = useState<number | ''>('');
  const [endurancePlankSeconds, setEndurancePlankSeconds] = useState<number | ''>('');

  // Tab 5: Fotos & Notas
  const [photoFront, setPhotoFront] = useState('');
  const [photoBack, setPhotoBack] = useState('');
  const [photoRight, setPhotoRight] = useState('');
  const [photoLeft, setPhotoLeft] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);

  // Carregar protocolos TAV na abertura
  useEffect(() => {
    if (isOpen) {
      loadTavProtocols();
    }
  }, [isOpen]);

  useEffect(() => {
    if (student) {
      setSelectedStudentId(student.id);
      if (student.current_weight) setWeight(student.current_weight);
      if (student.height) setHeight(student.height);
    }
  }, [student]);

  useEffect(() => {
    if (assessmentToEdit && isOpen) {
      if (assessmentToEdit.patient_id) setSelectedStudentId(assessmentToEdit.patient_id);
      if (assessmentToEdit.assessment_date) setAssessmentDate(assessmentToEdit.assessment_date);
      if (assessmentToEdit.weight) setWeight(assessmentToEdit.weight);
      if (assessmentToEdit.height) setHeight(assessmentToEdit.height);
      if (assessmentToEdit.notes) setNotes(assessmentToEdit.notes);

      // Carrega fotos existentes vinculadas à avaliação
      if (Array.isArray(assessmentToEdit.photos)) {
        for (const p of assessmentToEdit.photos) {
          if (p.photo_type === 'front') setPhotoFront(p.photo_url || '');
          else if (p.photo_type === 'back') setPhotoBack(p.photo_url || '');
          else if (p.photo_type === 'right') setPhotoRight(p.photo_url || '');
          else if (p.photo_type === 'left') setPhotoLeft(p.photo_url || '');
        }
      }
    }
  }, [assessmentToEdit, isOpen]);

  const loadTavProtocols = async () => {
    try {
      const res = await ApiClient.get<{ protocols: TavProtocol[] }>('/v1/personal/tav/protocols');
      if (res && res.protocols) {
        setTavProtocolsList(res.protocols);
        if (res.protocols.length > 0 && !tavProtocolId) {
          const first = res.protocols[0];
          setTavProtocolId(first.id);
          setTavEquipment(first.equipment);
          setTavMethod(first.method);
          setTavUnit(first.unit || 'nível');
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar protocolos TAV:', err);
    }
  };

  // Aluno Atual e Dados Demográficos
  const currentStudent = studentsList.find((s) => s.id === selectedStudentId) || student;
  const isMale = (currentStudent?.gender || 'm').toLowerCase().startsWith('m');
  const birthDate = currentStudent?.birth_date;
  let age = 28;
  if (birthDate) {
    const diff = Date.now() - new Date(birthDate).getTime();
    age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }

  // Cálculos Automáticos de Índices
  const w = Number(weight) || 0;
  const h = Number(height) || 0;
  const bmi = w > 0 && h > 0 ? parseFloat((w / ((h / 100) * (h / 100))).toFixed(2)) : 0;

  let bmiClassification = '';
  if (bmi > 0) {
    if (bmi < 18.5) bmiClassification = 'Abaixo do peso';
    else if (bmi < 25) bmiClassification = 'Peso saudável';
    else if (bmi < 30) bmiClassification = 'Sobrepeso';
    else if (bmi < 35) bmiClassification = 'Obesidade Grau I';
    else bmiClassification = 'Obesidade Grau II+';
  }

  // RCQ (Relação Cintura / Quadril)
  const waist = Number(waistCm) || 0;
  const hip = Number(hipCm) || 0;
  const whr = waist > 0 && hip > 0 ? parseFloat((waist / hip).toFixed(2)) : 0;
  let whrRisk = '';
  if (whr > 0) {
    if (isMale) {
      whrRisk = whr < 0.9 ? 'Risco Baixo' : whr < 1.0 ? 'Risco Moderado' : 'Risco Alto';
    } else {
      whrRisk = whr < 0.8 ? 'Risco Baixo' : whr < 0.85 ? 'Risco Moderado' : 'Risco Alto';
    }
  }

  // RCE (Relação Cintura / Estatura)
  const whtr = waist > 0 && h > 0 ? parseFloat((waist / h).toFixed(2)) : 0;
  let whtrRisk = '';
  if (whtr > 0) {
    whtrRisk = whtr < 0.5 ? 'Normal (Baixo Risco)' : 'Elevado (Risco Aumentado)';
  }

  // Soma das Dobras Cutâneas
  const sumSkinfolds =
    (Number(foldTriceps) || 0) +
    (Number(foldSubscapular) || 0) +
    (Number(foldBiceps) || 0) +
    (Number(foldChest) || 0) +
    (Number(foldAxillary) || 0) +
    (Number(foldSuprailiac) || 0) +
    (Number(foldAbdominal) || 0) +
    (Number(foldThigh) || 0) +
    (Number(foldCalf) || 0);

  // % de Gordura
  let calculatedFatPct = 0;
  if (compositionMethod === 'bioimpedancia' || compositionMethod === 'dxa' || compositionMethod === 'outro') {
    calculatedFatPct = Number(manualFatPct) || 0;
  } else {
    // Cálculo por dobras
    if (skinfoldsProtocol === 'pollock_7') {
      const s7 =
        (Number(foldSubscapular) || 0) +
        (Number(foldTriceps) || 0) +
        (Number(foldChest) || 0) +
        (Number(foldAxillary) || 0) +
        (Number(foldSuprailiac) || 0) +
        (Number(foldAbdominal) || 0) +
        (Number(foldThigh) || 0);

      if (s7 > 0) {
        let d = 0;
        if (isMale) {
          d = 1.112 - 0.00043499 * s7 + 0.00000055 * s7 * s7 - 0.00028826 * age;
        } else {
          d = 1.097 - 0.00046971 * s7 + 0.00000056 * s7 * s7 - 0.00012828 * age;
        }
        if (d > 0) calculatedFatPct = parseFloat((((4.95 / d) - 4.5) * 100).toFixed(2));
      }
    } else if (skinfoldsProtocol === 'pollock_3') {
      if (isMale) {
        const s3 = (Number(foldChest) || 0) + (Number(foldAbdominal) || 0) + (Number(foldThigh) || 0);
        if (s3 > 0) {
          const d = 1.10938 - 0.0008267 * s3 + 0.0000016 * s3 * s3 - 0.0002574 * age;
          if (d > 0) calculatedFatPct = parseFloat((((4.95 / d) - 4.5) * 100).toFixed(2));
        }
      } else {
        const s3 = (Number(foldTriceps) || 0) + (Number(foldSuprailiac) || 0) + (Number(foldThigh) || 0);
        if (s3 > 0) {
          const d = 1.0994921 - 0.0009929 * s3 + 0.0000023 * s3 * s3 - 0.0001392 * age;
          if (d > 0) calculatedFatPct = parseFloat((((4.95 / d) - 4.5) * 100).toFixed(2));
        }
      }
    }
  }

  calculatedFatPct = Math.max(0, Math.min(65, calculatedFatPct));
  const fatMassKg = w > 0 && calculatedFatPct > 0 ? parseFloat(((w * calculatedFatPct) / 100).toFixed(2)) : 0;
  const leanMassKg = w > 0 && fatMassKg > 0 ? parseFloat((w - fatMassKg).toFixed(2)) : 0;
  const estimatedMuscleMass = manualMuscleMass !== '' ? Number(manualMuscleMass) : leanMassKg > 0 ? parseFloat((leanMassKg * 0.52).toFixed(2)) : 0;

  // Atualização em tempo real da classificação de TAV
  useEffect(() => {
    if (tavValue === '' || tavValue === null) {
      setTavClassification('');
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await ApiClient.post<{
          classification: string;
          protocolName?: string;
          color?: string;
        }>('/v1/personal/tav/classify', {
          protocol_id: tavProtocolId || undefined,
          method: tavMethod,
          equipment: tavEquipment,
          value: Number(tavValue),
          gender: currentStudent?.gender,
          age
        });

        if (res && res.classification) {
          setTavClassification(res.classification);
          if (res.color) setTavColorCode(res.color);
        }
      } catch (err) {
        setTavClassification('Classificação não disponível para este método.');
        setTavColorCode('#64748B');
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [tavValue, tavProtocolId, tavEquipment, tavMethod, age, currentStudent?.gender]);

  // Manipuladores de Testes 1RM
  const handleAddStrengthTest = () => {
    setStrengthTests([
      ...strengthTests,
      { exercise_name: 'Novo Exercício', load_kg: 50, reps: 10, one_rm_kg: 67 }
    ]);
  };

  const handleUpdateStrengthTest = (index: number, field: keyof StrengthTestItem, value: any) => {
    const updated = [...strengthTests];
    (updated[index] as any)[field] = value;
    if (field === 'load_kg' || field === 'reps') {
      const load = Number(field === 'load_kg' ? value : updated[index].load_kg) || 0;
      const reps = Number(field === 'reps' ? value : updated[index].reps) || 0;
      if (load > 0 && reps > 0) {
        updated[index].one_rm_kg = Math.round(load * (1 + reps / 30) * 10) / 10;
      }
    }
    setStrengthTests(updated);
  };

  const handleRemoveStrengthTest = (index: number) => {
    setStrengthTests(strengthTests.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      showToast('Selecione o aluno para a avaliação', 'error');
      return;
    }
    if (!w || !h) {
      showToast('Peso e altura são obrigatórios', 'error');
      return;
    }

    try {
      setSaving(true);
      const photos: Array<{ photo_type: string; photo_url: string }> = [];
      if (photoFront.trim()) photos.push({ photo_type: 'front', photo_url: photoFront.trim() });
      if (photoBack.trim()) photos.push({ photo_type: 'back', photo_url: photoBack.trim() });
      if (photoRight.trim()) photos.push({ photo_type: 'right', photo_url: photoRight.trim() });
      if (photoLeft.trim()) photos.push({ photo_type: 'left', photo_url: photoLeft.trim() });

      // Agrupar testes de resistência muscular
      const enduranceTests: EnduranceTestItem[] = [];
      if (endurancePushups !== '') enduranceTests.push({ test_name: 'Flexão de Braço', result_value: Number(endurancePushups), unit: 'reps' });
      if (enduranceSitups !== '') enduranceTests.push({ test_name: 'Abdominais', result_value: Number(enduranceSitups), unit: 'reps' });
      if (enduranceSquats !== '') enduranceTests.push({ test_name: 'Agachamento', result_value: Number(enduranceSquats), unit: 'reps' });
      if (endurancePlankSeconds !== '') enduranceTests.push({ test_name: 'Prancha Isométrica', result_value: Number(endurancePlankSeconds), unit: 'segundos' });

      const payload = {
        patient_id: selectedStudentId,
        assessment_date: assessmentDate,
        protocol: skinfoldsProtocol,
        weight: w,
        height: h,
        body_fat_percentage: calculatedFatPct,
        muscle_mass_kg: estimatedMuscleMass || null,
        composition_method: compositionMethod,
        body_water_liters: bodyWaterLiters !== '' ? Number(bodyWaterLiters) : null,
        bmr_kcal: bmrKcal !== '' ? Number(bmrKcal) : null,
        raw_composition_data: {
          manualFatPct,
          manualMuscleMass,
          bodyWaterLiters,
          bmrKcal
        },

        // TAV
        tav_value: tavValue !== '' ? Number(tavValue) : null,
        tav_unit: tavUnit,
        tav_method: tavMethod,
        tav_equipment: tavEquipment,
        tav_protocol_id: tavProtocolId || null,
        tav_classification: tavClassification || null,
        tav_notes: tavNotes || null,

        // Perímetros Completos com Lateralidade D/E
        neck_cm: neckCm !== '' ? Number(neckCm) : null,
        shoulder_cm: shoulderCm !== '' ? Number(shoulderCm) : null,
        chest_cm: chestCm !== '' ? Number(chestCm) : null,
        waist_cm: waistCm !== '' ? Number(waistCm) : null,
        abdomen_cm: abdomenCm !== '' ? Number(abdomenCm) : null,
        hip_cm: hipCm !== '' ? Number(hipCm) : null,
        arm_right_relaxed: armRightRelaxed !== '' ? Number(armRightRelaxed) : null,
        arm_left_relaxed: armLeftRelaxed !== '' ? Number(armLeftRelaxed) : null,
        arm_right_flexed: armRightFlexed !== '' ? Number(armRightFlexed) : null,
        arm_left_flexed: armLeftFlexed !== '' ? Number(armLeftFlexed) : null,
        forearm_right: forearmRight !== '' ? Number(forearmRight) : null,
        forearm_left: forearmLeft !== '' ? Number(forearmLeft) : null,
        wrist_right: wristRight !== '' ? Number(wristRight) : null,
        wrist_left: wristLeft !== '' ? Number(wristLeft) : null,
        thigh_right_prox: thighRightProx !== '' ? Number(thighRightProx) : null,
        thigh_left_prox: thighLeftProx !== '' ? Number(thighLeftProx) : null,
        thigh_right_med: thighRightMed !== '' ? Number(thighRightMed) : null,
        thigh_left_med: thighLeftMed !== '' ? Number(thighLeftMed) : null,
        thigh_right_dist: thighRightDist !== '' ? Number(thighRightDist) : null,
        thigh_left_dist: thighLeftDist !== '' ? Number(thighLeftDist) : null,
        calf_right: calfRight !== '' ? Number(calfRight) : null,
        calf_left: calfLeft !== '' ? Number(calfLeft) : null,

        // 9 Dobras Cutâneas
        skinfolds_protocol: skinfoldsProtocol,
        fold_triceps: foldTriceps !== '' ? Number(foldTriceps) : null,
        fold_subscapular: foldSubscapular !== '' ? Number(foldSubscapular) : null,
        fold_biceps: foldBiceps !== '' ? Number(foldBiceps) : null,
        fold_chest: foldChest !== '' ? Number(foldChest) : null,
        fold_axillary: foldAxillary !== '' ? Number(foldAxillary) : null,
        fold_suprailiac: foldSuprailiac !== '' ? Number(foldSuprailiac) : null,
        fold_abdominal: foldAbdominal !== '' ? Number(foldAbdominal) : null,
        fold_thigh: foldThigh !== '' ? Number(foldThigh) : null,
        fold_calf: foldCalf !== '' ? Number(foldCalf) : null,

        // Cardiovascular & Testes Funcionais
        resting_heart_rate_bpm: restingHeartRate !== '' ? Number(restingHeartRate) : null,
        blood_pressure_systolic: bloodPressureSystolic !== '' ? Number(bloodPressureSystolic) : null,
        blood_pressure_diastolic: bloodPressureDiastolic !== '' ? Number(bloodPressureDiastolic) : null,
        vo2_max: vo2Max !== '' ? Number(vo2Max) : null,
        vo2_method_type: vo2MethodType,
        vo2_protocol: vo2Protocol,
        flexibility_wells_cm: flexibilityWellsCm !== '' ? Number(flexibilityWellsCm) : null,

        strength_tests: strengthTests,
        muscular_endurance_tests: enduranceTests,

        notes,
        photos
      };

      if (assessmentToEdit?.id) {
        await ApiClient.put(`/v1/personal/assessments/${assessmentToEdit.id}`, payload);
        showToast('Avaliação física atualizada com sucesso!', 'success');
      } else {
        await ApiClient.post('/v1/personal/assessments', payload);
        showToast('Avaliação física completa registrada com sucesso!', 'success');
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error('Erro ao salvar avaliação:', err);
      showToast('Erro ao registrar avaliação física completa', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-600/20">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Avaliação Física Completa & Composição Corporal
              </h3>
              <p className="text-xs text-slate-500">
                Antropometria, Composição, TAV, Dobras, Cardiovascular, Força 1RM e Fotos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Info Strip: Aluno e Data */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Aluno(a) *</label>
            <select
              disabled={!!student}
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-semibold text-slate-800"
            >
              <option value="">Selecione o aluno...</option>
              {studentsList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.gender === 'm' ? 'Masc' : 'Fem'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Data da Avaliação *</label>
            <input
              type="date"
              required
              value={assessmentDate}
              onChange={(e) => setAssessmentDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-semibold text-slate-800"
            />
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0">
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Aluno / Idade</span>
              <strong className="text-xs text-slate-800">
                {currentStudent?.name || '—'} • {age} anos
              </strong>
            </div>
          </div>
        </div>

        {/* Mini KPI Preview Flutuante */}
        <div className="bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-900 text-white px-6 py-2.5 flex items-center justify-around text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-purple-300 text-[11px]">IMC:</span>
            <strong className="text-amber-300 font-bold">{bmi > 0 ? `${bmi} kg/m²` : '—'}</strong>
            {bmiClassification && <span className="text-[10px] text-slate-300">({bmiClassification})</span>}
          </div>
          <div className="h-4 w-px bg-white/20 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-purple-300 text-[11px]">% Gordura:</span>
            <strong className="text-amber-300 font-bold">{calculatedFatPct > 0 ? `${calculatedFatPct}%` : '—'}</strong>
          </div>
          <div className="h-4 w-px bg-white/20 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-purple-300 text-[11px]">Massa Magra:</span>
            <strong className="text-emerald-300 font-bold">{leanMassKg > 0 ? `${leanMassKg} kg` : '—'}</strong>
          </div>
          <div className="h-4 w-px bg-white/20 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-purple-300 text-[11px]">TAV:</span>
            <strong className="text-cyan-300 font-bold">{tavValue !== '' ? `${tavValue} ${tavUnit}` : '—'}</strong>
            {tavClassification && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-cyan-200">
                {tavClassification}
              </span>
            )}
          </div>
        </div>

        {/* Barra de Navegação das 5 Abas */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-white overflow-x-auto py-2">
          <button
            type="button"
            onClick={() => setActiveTab('anthropometry')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'anthropometry'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Ruler className="w-4 h-4" />
            1. Antropometria & Perímetros
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('composition')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'composition'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Scale className="w-4 h-4" />
            2. Composição & TAV
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('skinfolds')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'skinfolds'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4" />
            3. Dobras Cutâneas
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cardio_tests')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'cardio_tests'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Heart className="w-4 h-4" />
            4. Cardio & Testes 1RM
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('photos_notes')}
            className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'photos_notes'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Camera className="w-4 h-4" />
            5. Fotos & Parecer
          </button>
        </div>

        {/* Formulário Principal */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* ========================================================
              ABA 1: ANTROPOMETRIA & PERÍMETROS COMPLETOS (COM D/E)
             ======================================================== */}
          {activeTab === 'anthropometry' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Peso, Altura e Índices de Risco */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-purple-600" />
                  <span>Dados Básicos e Índices de Risco</span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Peso Corporal (kg) *</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      placeholder="Ex: 75.5"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Estatura (cm) *</label>
                    <input
                      type="number"
                      step="0.5"
                      required
                      placeholder="Ex: 178"
                      value={height}
                      onChange={(e) => setHeight(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">IMC (kg/m²)</label>
                    <div className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800">
                      {bmi > 0 ? `${bmi} (${bmiClassification})` : '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">RCQ / RCE</label>
                    <div className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800">
                      {whr > 0 ? `RCQ: ${whr} (${whrRisk})` : '—'} {whtr > 0 ? `| RCE: ${whtr} (${whtrRisk})` : ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* Perímetros com Lateralidade Completa */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                  <Ruler className="w-4 h-4 text-purple-600" />
                  <span>Perímetros / Circunferências com Lateralidade Completa (cm)</span>
                </h4>

                {/* Tronco Central */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 mb-4">
                  <span className="text-[11px] font-bold text-purple-800 uppercase block">Tronco & Cabeça</span>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pescoço</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={neckCm}
                        onChange={(e) => setNeckCm(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Ombros</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={shoulderCm}
                        onChange={(e) => setShoulderCm(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tórax</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={chestCm}
                        onChange={(e) => setChestCm(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Cintura</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={waistCm}
                        onChange={(e) => setWaistCm(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold text-purple-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Abdômen</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={abdomenCm}
                        onChange={(e) => setAbdomenCm(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Quadril</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={hipCm}
                        onChange={(e) => setHipCm(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold text-purple-700"
                      />
                    </div>
                  </div>
                </div>

                {/* Membros Superiores (D / E) */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 mb-4">
                  <span className="text-[11px] font-bold text-purple-800 uppercase block">
                    Membros Superiores (Braços, Antebraços e Punhos D / E)
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Braço Relaxado Dir.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={armRightRelaxed}
                        onChange={(e) => setArmRightRelaxed(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Braço Relaxado Esq.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={armLeftRelaxed}
                        onChange={(e) => setArmLeftRelaxed(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Braço Contraído Dir.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={armRightFlexed}
                        onChange={(e) => setArmRightFlexed(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Braço Contraído Esq.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={armLeftFlexed}
                        onChange={(e) => setArmLeftFlexed(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Antebraço Dir.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={forearmRight}
                        onChange={(e) => setForearmRight(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Antebraço Esq.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={forearmLeft}
                        onChange={(e) => setForearmLeft(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Punho Dir.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={wristRight}
                        onChange={(e) => setWristRight(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Punho Esq.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={wristLeft}
                        onChange={(e) => setWristLeft(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Membros Inferiores (D / E) */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <span className="text-[11px] font-bold text-purple-800 uppercase block">
                    Membros Inferiores (Coxas Proximal/Medial/Distal e Panturrilhas D / E)
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Coxa Proximal Dir.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={thighRightProx}
                        onChange={(e) => setThighRightProx(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Coxa Proximal Esq.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={thighLeftProx}
                        onChange={(e) => setThighLeftProx(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Coxa Medial Dir.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={thighRightMed}
                        onChange={(e) => setThighRightMed(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Coxa Medial Esq.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={thighLeftMed}
                        onChange={(e) => setThighLeftMed(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Coxa Distal Dir.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={thighRightDist}
                        onChange={(e) => setThighRightDist(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Coxa Distal Esq.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={thighLeftDist}
                        onChange={(e) => setThighLeftDist(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Panturrilha Dir.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={calfRight}
                        onChange={(e) => setCalfRight(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Panturrilha Esq.</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="cm"
                        value={calfLeft}
                        onChange={(e) => setCalfLeft(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              ABA 2: COMPOSIÇÃO CORPORAL & MÓDULO TAV DEDICADO
             ======================================================== */}
          {activeTab === 'composition' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Método de Avaliação de Composição */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Método de Composição Corporal
                    </h4>
                    <p className="text-[11px] text-slate-500">Selecione o método utilizado na coleta dos dados.</p>
                  </div>

                  <select
                    value={compositionMethod}
                    onChange={(e) => setCompositionMethod(e.target.value as any)}
                    className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-semibold text-slate-800"
                  >
                    <option value="dobras">Dobras Cutâneas (Cálculo Automático)</option>
                    <option value="bioimpedancia">Bioimpedância (InBody, Tanita, Omron)</option>
                    <option value="dxa">Densitometria DXA</option>
                    <option value="outro">Inserção Direta / Outro</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">% de Gordura (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 18.5"
                      value={compositionMethod === 'dobras' ? calculatedFatPct : manualFatPct}
                      disabled={compositionMethod === 'dobras'}
                      onChange={(e) => setManualFatPct(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold text-amber-600 disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Massa Muscular (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 34.2"
                      value={manualMuscleMass !== '' ? manualMuscleMass : estimatedMuscleMass || ''}
                      onChange={(e) => setManualMuscleMass(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-semibold text-cyan-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Água Corporal Total (L)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 45.0"
                      value={bodyWaterLiters}
                      onChange={(e) => setBodyWaterLiters(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-semibold text-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">TMB Estimada (kcal)</label>
                    <input
                      type="number"
                      step="1"
                      placeholder="Ex: 1850"
                      value={bmrKcal}
                      onChange={(e) => setBmrKcal(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-semibold text-slate-700"
                    />
                  </div>
                </div>
              </div>

              {/* ÁREA DEDICADA: MÓDULO TAV (TECIDO ADIPOSO VISCERAL) */}
              <div className="p-5 bg-gradient-to-br from-indigo-50/70 via-purple-50/50 to-white rounded-3xl border-2 border-indigo-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-indigo-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                      <Flame className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">
                        Módulo TAV — Tecido Adiposo Visceral
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Classificação rigorosa por equipamento, escala e tabela de referência oficial.
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-full border border-indigo-200">
                    Escala preservada sem conversão automática
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  {/* Catálogo de Protocolos & Equipamentos */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Equipamento / Protocolo *
                    </label>
                    <select
                      value={tavProtocolId}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        setTavProtocolId(selectedId);
                        const proto = tavProtocolsList.find((p) => p.id === selectedId);
                        if (proto) {
                          setTavEquipment(proto.equipment);
                          setTavMethod(proto.method);
                          setTavUnit(proto.unit || 'nível');
                        }
                      }}
                      className="w-full px-3 py-2 text-xs bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-semibold text-slate-800"
                    >
                      <option value="">Selecione do catálogo...</option>
                      {tavProtocolsList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.equipment} — {p.protocol_name} ({p.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Nome do Equipamento Manual ou Customizado */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Equipamento Utilizado
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: InBody 770, Tanita BC-549..."
                      value={tavEquipment}
                      onChange={(e) => setTavEquipment(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-semibold"
                    />
                  </div>

                  {/* Escala / Unidade */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Unidade / Escala *
                    </label>
                    <select
                      value={tavUnit}
                      onChange={(e) => setTavUnit(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-semibold"
                    >
                      <option value="nível">Nível / Grau (1 a 20, 1 a 59)</option>
                      <option value="cm²">Área em cm² (DXA / Tomografia)</option>
                      <option value="kg">Massa em kg</option>
                      <option value="escala_direta">Escala Direta</option>
                    </select>
                  </div>

                  {/* Valor do TAV */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Valor do TAV *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 5 ou 75.0"
                      value={tavValue}
                      onChange={(e) => setTavValue(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 text-xs bg-white border border-indigo-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-black text-indigo-900 text-sm"
                    />
                  </div>
                </div>

                {/* Exibição da Classificação em Tempo Real ou Aviso de Indisponibilidade */}
                <div className="bg-white p-3.5 rounded-2xl border border-indigo-100 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600">Classificação Clínica do TAV:</span>
                    {tavClassification ? (
                      <span
                        className="px-3 py-1 rounded-xl text-xs font-black text-white shadow-sm"
                        style={{ backgroundColor: tavColorCode || '#10B981' }}
                      >
                        {tavClassification}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Insira o valor do TAV para classificar</span>
                    )}
                  </div>

                  {tavClassification === 'Classificação não disponível para este método.' && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Classificação não disponível para este método. Valor bruto armazenado com segurança.</span>
                    </div>
                  )}
                </div>

                {/* Observação Clínica do TAV */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Observação Clínica sobre o TAV
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Nível 5 dentro da faixa normal para o protocolo InBody; manter controle alimentar..."
                    value={tavNotes}
                    onChange={(e) => setTavNotes(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              ABA 3: PROTOCOLOS & 9 DOBRAS CUTÂNEAS (MM)
             ======================================================== */}
          {activeTab === 'skinfolds' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Protocolo de Dobras Cutâneas
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Preencha as 9 dobras disponíveis. A fórmula calcula automaticamente com base no protocolo.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={skinfoldsProtocol}
                    onChange={(e) => setSkinfoldsProtocol(e.target.value as any)}
                    className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-semibold text-slate-800"
                  >
                    <option value="pollock_7">Jackson & Pollock 7 Dobras (Padrão Ouro)</option>
                    <option value="pollock_3">Jackson & Pollock 3 Dobras</option>
                    <option value="petroski">Petroski 4 Dobras</option>
                    <option value="guedes">Guedes</option>
                  </select>

                  <div className="px-3 py-2 bg-purple-50 border border-purple-200 rounded-xl text-xs font-black text-purple-900">
                    Soma: {sumSkinfolds} mm
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tríceps (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldTriceps}
                    onChange={(e) => setFoldTriceps(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subescapular (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldSubscapular}
                    onChange={(e) => setFoldSubscapular(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bíceps (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldBiceps}
                    onChange={(e) => setFoldBiceps(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold text-purple-700"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Peitoral (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldChest}
                    onChange={(e) => setFoldChest(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Axilar Média (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldAxillary}
                    onChange={(e) => setFoldAxillary(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Suprailíaca (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldSuprailiac}
                    onChange={(e) => setFoldSuprailiac(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Abdominal (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldAbdominal}
                    onChange={(e) => setFoldAbdominal(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Coxa (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldThigh}
                    onChange={(e) => setFoldThigh(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Panturrilha Medial (mm)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldCalf}
                    onChange={(e) => setFoldCalf(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              ABA 4: CARDIOVASCULAR & TESTES DE FORÇA 1RM / RESISTÊNCIA
             ======================================================== */}
          {activeTab === 'cardio_tests' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Avaliação Cardiovascular */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Heart className="w-4 h-4 text-rose-600" />
                  <span>Avaliação Cardiovascular & Hemodinâmica</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      FC Repouso (bpm)
                    </label>
                    <input
                      type="number"
                      placeholder="Ex: 62"
                      value={restingHeartRate}
                      onChange={(e) => setRestingHeartRate(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      PA Sistólica (mmHg)
                    </label>
                    <input
                      type="number"
                      placeholder="Ex: 120"
                      value={bloodPressureSystolic}
                      onChange={(e) => setBloodPressureSystolic(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      PA Diastólica (mmHg)
                    </label>
                    <input
                      type="number"
                      placeholder="Ex: 80"
                      value={bloodPressureDiastolic}
                      onChange={(e) => setBloodPressureDiastolic(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Capacidade Cardiorrespiratória & VO2 Máx */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  <span>Cardiorrespiratório — VO₂ Máximo</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      VO₂ Máx (ml/kg/min)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 42.5"
                      value={vo2Max}
                      onChange={(e) => setVo2Max(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none font-bold text-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tipo de Medição
                    </label>
                    <select
                      value={vo2MethodType}
                      onChange={(e) => setVo2MethodType(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                    >
                      <option value="Teste Submáximo">Teste Submáximo</option>
                      <option value="Teste Máximo">Teste Máximo de Campo</option>
                      <option value="Estimativa / Fórmula">Estimativa Indireta</option>
                      <option value="Ergoespirometria">Ergoespirometria Laboratorial</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Protocolo / Teste Utilizado
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Teste de Cooper, Caminhada 1 Milha..."
                      value={vo2Protocol}
                      onChange={(e) => setVo2Protocol(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Testes de Força 1RM Dinâmicos (Fórmula Epley) */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Dumbbell className="w-4 h-4 text-indigo-600" />
                      <span>Testes de Força / Carga Máxima Estimada (1RM - Epley)</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">Fórmula de Epley: 1RM = Carga × (1 + Reps / 30)</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddStrengthTest}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Teste
                  </button>
                </div>

                <div className="space-y-2">
                  {strengthTests.map((t, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                      <input
                        type="text"
                        placeholder="Nome do Exercício (ex: Leg Press)"
                        value={t.exercise_name}
                        onChange={(e) => handleUpdateStrengthTest(idx, 'exercise_name', e.target.value)}
                        className="flex-1 px-2.5 py-1 text-xs border border-slate-200 rounded-lg outline-none font-semibold text-slate-800"
                      />
                      <div className="w-24">
                        <input
                          type="number"
                          placeholder="Carga (kg)"
                          value={t.load_kg || ''}
                          onChange={(e) => handleUpdateStrengthTest(idx, 'load_kg', Number(e.target.value))}
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg outline-none text-center font-bold"
                        />
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          placeholder="Reps"
                          value={t.reps || ''}
                          onChange={(e) => handleUpdateStrengthTest(idx, 'reps', Number(e.target.value))}
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg outline-none text-center font-bold"
                        />
                      </div>
                      <div className="w-28 text-center bg-indigo-50 border border-indigo-100 rounded-lg py-1 text-xs font-black text-indigo-700">
                        1RM: {t.one_rm_kg || 0} kg
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveStrengthTest(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resistência Muscular & Flexibilidade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Resistência Muscular */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Testes de Resistência Muscular
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Flexão de Braço (reps)</label>
                      <input
                        type="number"
                        placeholder="Reps"
                        value={endurancePushups}
                        onChange={(e) => setEndurancePushups(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Abdominal (reps)</label>
                      <input
                        type="number"
                        placeholder="Reps em 1 min"
                        value={enduranceSitups}
                        onChange={(e) => setEnduranceSitups(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Agachamento (reps)</label>
                      <input
                        type="number"
                        placeholder="Reps"
                        value={enduranceSquats}
                        onChange={(e) => setEnduranceSquats(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Prancha Isométrica (s)</label>
                      <input
                        type="number"
                        placeholder="Segundos"
                        value={endurancePlankSeconds}
                        onChange={(e) => setEndurancePlankSeconds(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Flexibilidade (Banco de Wells) */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Flexibilidade — Banco de Wells
                  </h4>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Sentar e Alcançar (cm)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="Ex: 28.5 cm"
                      value={flexibilityWellsCm}
                      onChange={(e) => setFlexibilityWellsCm(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-800 text-xs"
                    />
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      Medido na escala padrão do Banco de Wells com pés apoiados na marca de 23 cm ou 0 cm conforme protocolo.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              ABA 5: FOTOS CORPORAIS (4 VISTAS) & PARECER DO TREINADOR
             ======================================================== */}
          {activeTab === 'photos_notes' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-purple-600" />
                  <span>Fotos da Avaliação Corporal</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-col justify-between">
                    <FileImageUploader
                      label="Foto Frontal"
                      buttonText="+ Adicionar foto"
                      patientId={selectedStudentId || undefined}
                      assessmentId={assessmentToEdit?.id || undefined}
                      position="front"
                      category="personal_assessment_front"
                      initialUrl={photoFront}
                      onUploaded={(info) => setPhotoFront(info.url || '')}
                      onRemoved={() => setPhotoFront('')}
                    />
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-col justify-between">
                    <FileImageUploader
                      label="Foto Posterior"
                      buttonText="+ Adicionar foto"
                      patientId={selectedStudentId || undefined}
                      assessmentId={assessmentToEdit?.id || undefined}
                      position="back"
                      category="personal_assessment_back"
                      initialUrl={photoBack}
                      onUploaded={(info) => setPhotoBack(info.url || '')}
                      onRemoved={() => setPhotoBack('')}
                    />
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-col justify-between">
                    <FileImageUploader
                      label="Lateral Direita"
                      buttonText="+ Adicionar foto"
                      patientId={selectedStudentId || undefined}
                      assessmentId={assessmentToEdit?.id || undefined}
                      position="right"
                      category="personal_assessment_right"
                      initialUrl={photoRight}
                      onUploaded={(info) => setPhotoRight(info.url || '')}
                      onRemoved={() => setPhotoRight('')}
                    />
                  </div>

                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-col justify-between">
                    <FileImageUploader
                      label="Lateral Esquerda"
                      buttonText="+ Adicionar foto"
                      patientId={selectedStudentId || undefined}
                      assessmentId={assessmentToEdit?.id || undefined}
                      position="left"
                      category="personal_assessment_left"
                      initialUrl={photoLeft}
                      onUploaded={(info) => setPhotoLeft(info.url || '')}
                      onRemoved={() => setPhotoLeft('')}
                    />
                  </div>
                </div>
              </div>

              {/* Parecer Técnico do Treinador */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Parecer Técnico e Recomendações do Treinador
                </label>
                <textarea
                  rows={4}
                  placeholder="Ex: Aluno apresentou melhora substancial na densidade muscular e redução de 2 níveis de gordura visceral. Recomenda-se manter o ciclo de hipertrofia com cardio moderado..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>
            </div>
          )}

          {/* Footer com Botões */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="text-[11px] text-slate-400">
              Campos em branco são salvos com segurança sem alterar histórico prévio.
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-xl flex items-center gap-2 shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Gravando Avaliação...' : 'Salvar Avaliação Física Completa'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
