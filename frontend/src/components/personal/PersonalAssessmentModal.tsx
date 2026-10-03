import {PersonalAssessmentIndicator,IndicatorDetails} from './PersonalAssessmentIndicator';
import { PersonalTechnicalFields } from './PersonalTechnicalFields';
import { useClinicalFormReset } from '../../hooks/useClinicalFormReset';
import { Posture, readPosture, emptyPosture } from './posture';
import React, { useState, useEffect, lazy, Suspense } from 'react';
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
import { useClinicalAutosave } from '../../hooks/useClinicalAutosave';
import { ClinicalAutosaveIndicator } from '../clinical/ClinicalAutosaveIndicator';
import { PatientSearchSelect } from '../common/PatientSearchSelect';

const PersonalPostureEditor = lazy(() => import('./PersonalPostureEditor'));

interface PersonalAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  student?: Student | any | null;
  studentsList?: Student[];
  assessmentToEdit?: any;
  postureOnly?: boolean;
  sourceModule?: 'ZemdaPersonal' | 'ZemdaFisio';
  clientTermLabel?: string;
}

export const PersonalAssessmentModal: React.FC<PersonalAssessmentModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  student,
  studentsList = [],
  assessmentToEdit,
  postureOnly = false,
  sourceModule = 'ZemdaPersonal',
  clientTermLabel: propClientTermLabel
}) => {
  const effectiveTermLabel = propClientTermLabel || (postureOnly ? 'Paciente' : 'Aluno');
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'anthropometry' | 'composition' | 'skinfolds' | 'cardio_tests' | 'photos_notes'>('anthropometry');

  const [selectedStudentId, setSelectedStudentId] = useState(student?.id || '');
  const [selectedStudent, setSelectedStudent] = useState<Student | any | null>(student || null);
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split('T')[0]);

  // Tab 1: Antropometria Básica & Perímetros (cm)
  const [weight, setWeight] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');

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
  const [tavUnit, setTavUnit] = useState<string>('');
  const [tavMethod, setTavMethod] = useState<string>('');
  const [tavEquipment, setTavEquipment] = useState<string>('InBody');
  const [tavProtocolId, setTavProtocolId] = useState<string>('');
  const [tavClassification, setTavClassification] = useState<string>('');
  const [tavColorCode, setTavColorCode] = useState<string>('#10B981');
  const [tavNotes, setTavNotes] = useState<string>('');
  const [tavProtocolsList, setTavProtocolsList] = useState<TavProtocol[]>([]);

  // Tab 3: Dobras Cutâneas (mm)
  const [skinfoldsProtocol, setSkinfoldsProtocol] = useState<'pollock_7' | 'pollock_3' | 'petroski' | 'guedes'>('pollock_7');
  const [technical, setTechnical] = useState<any>({});
  const [calculationPreview, setCalculationPreview] = useState<any>(null);
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
  const [strengthTests, setStrengthTests] = useState<StrengthTestItem[]>([]);

  // Testes de Resistência Muscular
  const [endurancePushups, setEndurancePushups] = useState<number | ''>('');
  const [enduranceSitups, setEnduranceSitups] = useState<number | ''>('');
  const [enduranceSquats, setEnduranceSquats] = useState<number | ''>('');
  const [endurancePlankSeconds, setEndurancePlankSeconds] = useState<number | ''>('');

  // Tab 5: Fotos & Notas
  const [photoFront, setPhotoFront] = useState('');
  const [photoFrontFileId, setPhotoFrontFileId] = useState('');
  const [photoBack, setPhotoBack] = useState('');
  const [photoBackFileId, setPhotoBackFileId] = useState('');
  const [photoRight, setPhotoRight] = useState('');
  const [photoRightFileId, setPhotoRightFileId] = useState('');
  const [photoLeft, setPhotoLeft] = useState('');
  const [photoLeftFileId, setPhotoLeftFileId] = useState('');
  const [notes, setNotes] = useState('');
  useClinicalFormReset((assessmentToEdit?.patient_id || student?.id || selectedStudentId) + ':' + (assessmentToEdit?.id || 'new') + ':' + isOpen, [
    [weight, setWeight],
    [height, setHeight],
    [neckCm, setNeckCm],
    [shoulderCm, setShoulderCm],
    [chestCm, setChestCm],
    [waistCm, setWaistCm],
    [abdomenCm, setAbdomenCm],
    [hipCm, setHipCm],
    [armRightRelaxed, setArmRightRelaxed],
    [armLeftRelaxed, setArmLeftRelaxed],
    [armRightFlexed, setArmRightFlexed],
    [armLeftFlexed, setArmLeftFlexed],
    [forearmRight, setForearmRight],
    [forearmLeft, setForearmLeft],
    [wristRight, setWristRight],
    [wristLeft, setWristLeft],
    [thighRightProx, setThighRightProx],
    [thighLeftProx, setThighLeftProx],
    [thighRightMed, setThighRightMed],
    [thighLeftMed, setThighLeftMed],
    [thighRightDist, setThighRightDist],
    [thighLeftDist, setThighLeftDist],
    [calfRight, setCalfRight],
    [calfLeft, setCalfLeft],
    [manualFatPct, setManualFatPct],
    [manualMuscleMass, setManualMuscleMass],
    [bodyWaterLiters, setBodyWaterLiters],
    [bmrKcal, setBmrKcal],
    [tavValue, setTavValue],
    [tavProtocolId, setTavProtocolId],
    [tavClassification, setTavClassification],
    [tavNotes, setTavNotes],
    [foldTriceps, setFoldTriceps],
    [foldSubscapular, setFoldSubscapular],
    [foldBiceps, setFoldBiceps],
    [foldChest, setFoldChest],
    [foldAxillary, setFoldAxillary],
    [foldSuprailiac, setFoldSuprailiac],
    [foldAbdominal, setFoldAbdominal],
    [foldThigh, setFoldThigh],
    [foldCalf, setFoldCalf],
    [restingHeartRate, setRestingHeartRate],
    [bloodPressureSystolic, setBloodPressureSystolic],
    [bloodPressureDiastolic, setBloodPressureDiastolic],
    [vo2Max, setVo2Max],
    [flexibilityWellsCm, setFlexibilityWellsCm],
    [strengthTests, setStrengthTests],
    [endurancePushups, setEndurancePushups],
    [enduranceSitups, setEnduranceSitups],
    [enduranceSquats, setEnduranceSquats],
    [endurancePlankSeconds, setEndurancePlankSeconds],
    [photoFront, setPhotoFront],
    [photoFrontFileId, setPhotoFrontFileId],
    [photoBack, setPhotoBack],
    [photoBackFileId, setPhotoBackFileId],
    [photoRight, setPhotoRight],
    [photoRightFileId, setPhotoRightFileId],
    [photoLeft, setPhotoLeft],
    [photoLeftFileId, setPhotoLeftFileId],
    [notes, setNotes],
  ]);


  const [saving, setSaving] = useState(false);
  const [posture,setPosture] = useState<Posture|null>(null);
  const [postureMode,setPostureMode] = useState(false);
  const [postureBusy,setPostureBusy] = useState(false);
  const [uploadingFront,setUploadingFront] = useState(false);
  const [uploadingBack,setUploadingBack] = useState(false);
  const [uploadingRight,setUploadingRight] = useState(false);
  const [uploadingLeft,setUploadingLeft] = useState(false);
  const photosUploading = uploadingFront || uploadingBack || uploadingRight || uploadingLeft;
  useEffect(() => { if(isOpen) { const saved=readPosture(assessmentToEdit?.posture_json); setPosture(saved || (postureOnly ? emptyPosture() : null)); setPostureMode(Boolean(saved) || postureOnly); if(postureOnly)setActiveTab('photos_notes'); } }, [isOpen,assessmentToEdit?.id]);

  const autosavePayload = React.useMemo(() => ({
    weight,
    height,
    neckCm,
    shoulderCm,
    chestCm,
    waistCm,
    abdomenCm,
    hipCm,
    armRightRelaxed,
    armLeftRelaxed,
    armRightFlexed,
    armLeftFlexed,
    forearmRight,
    forearmLeft,
    wristRight,
    wristLeft,
    thighRightProx,
    thighLeftProx,
    thighRightMed,
    thighLeftMed,
    thighRightDist,
    thighLeftDist,
    calfRight,
    calfLeft,
    compositionMethod,
    manualFatPct,
    manualMuscleMass,
    bodyWaterLiters,
    bmrKcal,
    tavValue,
    skinfoldsProtocol,
    technical,
    foldTriceps,
    foldSubscapular,
    foldBiceps,
    foldChest,
    foldAxillary,
    foldSuprailiac,
    foldAbdominal,
    foldThigh,
    foldCalf,
    restingHeartRate,
    bloodPressureSystolic,
    bloodPressureDiastolic,
    vo2Max,
    flexibilityWellsCm,
    strengthTests,
    endurancePushups,
    enduranceSitups,
    enduranceSquats,
    endurancePlankSeconds,
    notes
  }), [
    weight,
    height,
    neckCm,
    shoulderCm,
    chestCm,
    waistCm,
    abdomenCm,
    hipCm,
    armRightRelaxed,
    armLeftRelaxed,
    armRightFlexed,
    armLeftFlexed,
    forearmRight,
    forearmLeft,
    wristRight,
    wristLeft,
    thighRightProx,
    thighLeftProx,
    thighRightMed,
    thighLeftMed,
    thighRightDist,
    thighLeftDist,
    calfRight,
    calfLeft,
    compositionMethod,
    manualFatPct,
    manualMuscleMass,
    bodyWaterLiters,
    bmrKcal,
    tavValue,
    skinfoldsProtocol,
    technical,
    foldTriceps,
    foldSubscapular,
    foldBiceps,
    foldChest,
    foldAxillary,
    foldSuprailiac,
    foldAbdominal,
    foldThigh,
    foldCalf,
    restingHeartRate,
    bloodPressureSystolic,
    bloodPressureDiastolic,
    vo2Max,
    flexibilityWellsCm,
    strengthTests,
    endurancePushups,
    enduranceSitups,
    enduranceSquats,
    endurancePlankSeconds,
    notes
  ]);

  const handleRestoreDraft = (data: any) => {
    if (!data) return;
    if (data.weight !== undefined) setWeight(data.weight);
    if (data.height !== undefined) setHeight(data.height);
    if (data.neckCm !== undefined) setNeckCm(data.neckCm);
    if (data.shoulderCm !== undefined) setShoulderCm(data.shoulderCm);
    if (data.chestCm !== undefined) setChestCm(data.chestCm);
    if (data.waistCm !== undefined) setWaistCm(data.waistCm);
    if (data.abdomenCm !== undefined) setAbdomenCm(data.abdomenCm);
    if (data.hipCm !== undefined) setHipCm(data.hipCm);
    if (data.armRightRelaxed !== undefined) setArmRightRelaxed(data.armRightRelaxed);
    if (data.armLeftRelaxed !== undefined) setArmLeftRelaxed(data.armLeftRelaxed);
    if (data.armRightFlexed !== undefined) setArmRightFlexed(data.armRightFlexed);
    if (data.armLeftFlexed !== undefined) setArmLeftFlexed(data.armLeftFlexed);
    if (data.forearmRight !== undefined) setForearmRight(data.forearmRight);
    if (data.forearmLeft !== undefined) setForearmLeft(data.forearmLeft);
    if (data.wristRight !== undefined) setWristRight(data.wristRight);
    if (data.wristLeft !== undefined) setWristLeft(data.wristLeft);
    if (data.thighRightProx !== undefined) setThighRightProx(data.thighRightProx);
    if (data.thighLeftProx !== undefined) setThighLeftProx(data.thighLeftProx);
    if (data.thighRightMed !== undefined) setThighRightMed(data.thighRightMed);
    if (data.thighLeftMed !== undefined) setThighLeftMed(data.thighLeftMed);
    if (data.thighRightDist !== undefined) setThighRightDist(data.thighRightDist);
    if (data.thighLeftDist !== undefined) setThighLeftDist(data.thighLeftDist);
    if (data.calfRight !== undefined) setCalfRight(data.calfRight);
    if (data.calfLeft !== undefined) setCalfLeft(data.calfLeft);
    if (data.compositionMethod !== undefined) setCompositionMethod(data.compositionMethod);
    if (data.manualFatPct !== undefined) setManualFatPct(data.manualFatPct);
    if (data.manualMuscleMass !== undefined) setManualMuscleMass(data.manualMuscleMass);
    if (data.bodyWaterLiters !== undefined) setBodyWaterLiters(data.bodyWaterLiters);
    if (data.bmrKcal !== undefined) setBmrKcal(data.bmrKcal);
    if (data.tavValue !== undefined) setTavValue(data.tavValue);
    if (data.skinfoldsProtocol !== undefined) setSkinfoldsProtocol(data.skinfoldsProtocol);
    if (data.technical !== undefined) setTechnical(data.technical);
    if (data.foldTriceps !== undefined) setFoldTriceps(data.foldTriceps);
    if (data.foldSubscapular !== undefined) setFoldSubscapular(data.foldSubscapular);
    if (data.foldBiceps !== undefined) setFoldBiceps(data.foldBiceps);
    if (data.foldChest !== undefined) setFoldChest(data.foldChest);
    if (data.foldAxillary !== undefined) setFoldAxillary(data.foldAxillary);
    if (data.foldSuprailiac !== undefined) setFoldSuprailiac(data.foldSuprailiac);
    if (data.foldAbdominal !== undefined) setFoldAbdominal(data.foldAbdominal);
    if (data.foldThigh !== undefined) setFoldThigh(data.foldThigh);
    if (data.foldCalf !== undefined) setFoldCalf(data.foldCalf);
    if (data.restingHeartRate !== undefined) setRestingHeartRate(data.restingHeartRate);
    if (data.bloodPressureSystolic !== undefined) setBloodPressureSystolic(data.bloodPressureSystolic);
    if (data.bloodPressureDiastolic !== undefined) setBloodPressureDiastolic(data.bloodPressureDiastolic);
    if (data.vo2Max !== undefined) setVo2Max(data.vo2Max);
    if (data.flexibilityWellsCm !== undefined) setFlexibilityWellsCm(data.flexibilityWellsCm);
    if (Array.isArray(data.strengthTests)) setStrengthTests(data.strengthTests);
    if (data.endurancePushups !== undefined) setEndurancePushups(data.endurancePushups);
    if (data.enduranceSitups !== undefined) setEnduranceSitups(data.enduranceSitups);
    if (data.enduranceSquats !== undefined) setEnduranceSquats(data.enduranceSquats);
    if (data.endurancePlankSeconds !== undefined) setEndurancePlankSeconds(data.endurancePlankSeconds);
    if (data.notes !== undefined) setNotes(data.notes);
  };

  const autosave = useClinicalAutosave({
    moduleType: 'ZemdaPersonal_Assessment',
    patientId: selectedStudentId,
    payload: autosavePayload,
    onRestoreDraft: handleRestoreDraft,
    enabled: isOpen && !!selectedStudentId && !postureOnly
  });

  // Carregar protocolos TAV na abertura
  useEffect(() => {
    if (isOpen) {
      loadTavProtocols();
    }
  }, [isOpen]);

  useEffect(() => {
    if (student) {
      setSelectedStudentId(student.id);
      setSelectedStudent(student);
      setWeight('');
      setHeight('');
    }
  }, [student]);

  useEffect(() => {
    if (isOpen) { setPhotoFront('');setPhotoFrontFileId('');setPhotoBack('');setPhotoBackFileId('');setPhotoRight('');setPhotoRightFileId('');setPhotoLeft('');setPhotoLeftFileId(''); }
    if (assessmentToEdit && isOpen) {
      setTechnical({...Object.fromEntries(['fold_iliac_crest','fold_supraspinale','humerus_breadth_cm','femur_breadth_cm','hba1c_pct','uric_acid_mg_dl','glucose_is_fasting','tav_protocol_race_code','glucose_mg_dl','triglycerides_mg_dl','ldl_mg_dl','hdl_mg_dl','biochemical_source','biochemical_exam_date','muscle_mass_method','muscle_mass_notes'].map(k=>[k,assessmentToEdit[k] ?? null])), skinfold_measurements: (()=>{try{return JSON.parse(assessmentToEdit.skinfold_measurements_json || '{}')}catch{return {}}})(),technical_mode:!!assessmentToEdit.skinfold_measurements_json});
      setNeckCm(assessmentToEdit.neck_cm ?? '');
      setShoulderCm(assessmentToEdit.shoulder_cm ?? '');
      setChestCm(assessmentToEdit.chest_cm ?? '');
      setWaistCm(assessmentToEdit.waist_cm ?? '');
      setAbdomenCm(assessmentToEdit.abdomen_cm ?? '');
      setHipCm(assessmentToEdit.hip_cm ?? '');
      setArmRightRelaxed(assessmentToEdit.arm_right_relaxed ?? '');
      setArmLeftRelaxed(assessmentToEdit.arm_left_relaxed ?? '');
      setArmRightFlexed(assessmentToEdit.arm_right_flexed ?? '');
      setArmLeftFlexed(assessmentToEdit.arm_left_flexed ?? '');
      setForearmRight(assessmentToEdit.forearm_right ?? '');
      setForearmLeft(assessmentToEdit.forearm_left ?? '');
      setWristRight(assessmentToEdit.wrist_right ?? '');
      setWristLeft(assessmentToEdit.wrist_left ?? '');
      setThighRightProx(assessmentToEdit.thigh_right_prox ?? '');
      setThighLeftProx(assessmentToEdit.thigh_left_prox ?? '');
      setThighRightMed(assessmentToEdit.thigh_right_med ?? '');
      setThighLeftMed(assessmentToEdit.thigh_left_med ?? '');
      setThighRightDist(assessmentToEdit.thigh_right_dist ?? '');
      setThighLeftDist(assessmentToEdit.thigh_left_dist ?? '');
      setCalfRight(assessmentToEdit.calf_right ?? '');
      setCalfLeft(assessmentToEdit.calf_left ?? '');
      setFoldTriceps(assessmentToEdit.fold_triceps ?? '');
      setFoldSubscapular(assessmentToEdit.fold_subscapular ?? '');
      setFoldBiceps(assessmentToEdit.fold_biceps ?? '');
      setFoldChest(assessmentToEdit.fold_chest ?? '');
      setFoldAxillary(assessmentToEdit.fold_axillary ?? '');
      setFoldSuprailiac(assessmentToEdit.fold_suprailiac ?? '');
      setFoldAbdominal(assessmentToEdit.fold_abdominal ?? '');
      setFoldThigh(assessmentToEdit.fold_thigh ?? '');
      setFoldCalf(assessmentToEdit.fold_calf ?? '');
      setManualFatPct(assessmentToEdit.body_fat_percentage ?? '');
      setManualMuscleMass(assessmentToEdit.muscle_mass_kg ?? '');
      setBodyWaterLiters(assessmentToEdit.body_water_liters ?? '');
      setBmrKcal(assessmentToEdit.bmr_kcal ?? '');
      setTavValue(assessmentToEdit.tav_value ?? '');
      setRestingHeartRate(assessmentToEdit.resting_heart_rate_bpm ?? '');
      setBloodPressureSystolic(assessmentToEdit.blood_pressure_systolic ?? '');
      setBloodPressureDiastolic(assessmentToEdit.blood_pressure_diastolic ?? '');
      setVo2Max(assessmentToEdit.vo2_max ?? '');
      setFlexibilityWellsCm(assessmentToEdit.flexibility_wells_cm ?? '');
      setSkinfoldsProtocol(assessmentToEdit.skinfolds_protocol || assessmentToEdit.protocol || 'pollock_7');
      setCompositionMethod(assessmentToEdit.composition_method || 'dobras');
      setTavEquipment(assessmentToEdit.tav_equipment || '');
      setTavUnit(assessmentToEdit.tav_measured_unit || assessmentToEdit.tav_unit || '');
      setTavMethod(assessmentToEdit.tav_method || '');
      setTavProtocolId(assessmentToEdit.tav_protocol_id || '');
      setTavNotes(assessmentToEdit.tav_notes || '');
      if (assessmentToEdit.patient_id) setSelectedStudentId(assessmentToEdit.patient_id);
      if (assessmentToEdit.assessment_date) setAssessmentDate(assessmentToEdit.assessment_date);
      if (assessmentToEdit.weight) setWeight(assessmentToEdit.weight);
      if (assessmentToEdit.height) setHeight(assessmentToEdit.height);
      if (assessmentToEdit.notes) setNotes(assessmentToEdit.notes);

      // Carrega fotos existentes vinculadas à avaliação
      if (Array.isArray(assessmentToEdit.photos)) {
        for (const p of assessmentToEdit.photos) {
          const fileId = p.file_id || p.fileId || '';
          if (p.photo_type === 'front') {
            setPhotoFront(p.photo_url || '');
            if (fileId) setPhotoFrontFileId(fileId);
          } else if (p.photo_type === 'back') {
            setPhotoBack(p.photo_url || '');
            if (fileId) setPhotoBackFileId(fileId);
          } else if (p.photo_type === 'right') {
            setPhotoRight(p.photo_url || '');
            if (fileId) setPhotoRightFileId(fileId);
          } else if (p.photo_type === 'left') {
            setPhotoLeft(p.photo_url || '');
            if (fileId) setPhotoLeftFileId(fileId);
          }
        }
      }
    }
  }, [assessmentToEdit, isOpen]);

  const loadTavProtocols = async () => {
    try {
      const res = await ApiClient.get<{ protocols: TavProtocol[] }>('/v1/personal/tav/protocols');
      if (res && res.protocols) {
        setTavProtocolsList(res.protocols);

      }
    } catch (err) {
      console.warn('Erro ao carregar protocolos TAV:', err);
    }
  };

  useEffect(()=>{if(isOpen && !assessmentToEdit) setTechnical({});},[isOpen,selectedStudentId,assessmentToEdit?.id]);
  // Aluno Atual e Dados Demográficos
  const currentStudent = selectedStudent || studentsList?.find((s) => s.id === selectedStudentId) || student;
  const previewBody = {
    ...(assessmentToEdit?.calculation_version ? {calculation_version:assessmentToEdit.calculation_version,anthropometric_sex_at_assessment:assessmentToEdit.anthropometric_sex_at_assessment,age_at_assessment:assessmentToEdit.age_at_assessment}:{}),
    anthropometric_sex:currentStudent?.anthropometric_sex ?? null,
    tav_value:tavValue,tav_equipment:tavEquipment,tav_unit:tavUnit,tav_protocol_id:tavProtocolId,tav_method:tavMethod,
    patient_id:selectedStudentId,assessment_date:assessmentDate,weight,height,neck_cm:neckCm,waist_cm:waistCm,hip_cm:hipCm,
    composition_method:compositionMethod,protocol:skinfoldsProtocol,skinfolds_protocol:skinfoldsProtocol,
    body_fat_percentage:manualFatPct,muscle_mass_kg:manualMuscleMass,bmr_kcal:assessmentToEdit?.bmr_method==='mifflin_st_jeor'?null:bmrKcal,
    fold_triceps:foldTriceps,fold_subscapular:foldSubscapular,fold_biceps:foldBiceps,fold_chest:foldChest,
    fold_axillary:foldAxillary,fold_suprailiac:foldSuprailiac,fold_abdominal:foldAbdominal,fold_thigh:foldThigh,fold_calf:foldCalf,
    arm_right_flexed:armRightFlexed,arm_left_flexed:armLeftFlexed,calf_right:calfRight,calf_left:calfLeft,
    ...technical,skinfold_measurements_json:technical.technical_mode ? JSON.stringify(technical.skinfold_measurements || {}) : null
  };
  const previewKey=JSON.stringify(previewBody);
  useEffect(()=>{
    setCalculationPreview(null);
    if(!isOpen || postureOnly || !selectedStudentId)return;
    let active=true;
    const timer=setTimeout(()=>{ApiClient.post<any>('/v1/personal/assessments/preview',JSON.parse(previewKey)).then(r=>{if(active)setCalculationPreview(r)}).catch(()=>{if(active)setCalculationPreview(null)});},250);
    return ()=>{active=false;clearTimeout(timer)};
  },[previewKey,isOpen,postureOnly,selectedStudentId]);
  const w=Number(weight) || 0,h=Number(height) || 0;
  const age=calculationPreview?.demographics?.age ?? null;
  const isMale=calculationPreview?.demographics?.sex==='male';
  const bmi=calculationPreview?.values?.bmi ?? null;
  const bmiClassification=calculationPreview?.values?.bmi_classification || '';
  const whr=calculationPreview?.values?.whr ?? null,whrRisk=calculationPreview?.values?.whr_classification || '';
  const whtr=calculationPreview?.values?.whtr ?? null,whtrRisk=calculationPreview?.values?.whtr_classification || '';
  const sumSkinfolds=calculationPreview?.values?.skinfold_sum ?? '—';
  const calculatedFatPct=calculationPreview?.values?.body_fat_percentage ?? null;
  const fatMassKg=calculationPreview?.values?.fat_mass_kg ?? null,leanMassKg=calculationPreview?.values?.lean_mass_kg ?? null;
  const estimatedMuscleMass=manualMuscleMass !== '' ? Number(manualMuscleMass) : null;

  useEffect(()=>{
    const item=calculationPreview?.classifications?.tav;
    setTavClassification(tavValue!=='' ? item?.classification || '' : '');
    setTavColorCode(({teal:'#0D9488',amber:'#F59E0B',rose:'#E11D48'} as Record<string,string>)[item?.tone] || '#64748B');
  },[calculationPreview,tavValue]);

  // Manipuladores de Testes 1RM
  const handleAddStrengthTest = () => {
    setStrengthTests([...strengthTests, { exercise_name: '' }]);
  };

  const handleUpdateStrengthTest = (index: number, field: keyof StrengthTestItem, value: any) => {
    const updated = [...strengthTests];
    (updated[index] as any)[field] = value;
    if (field === 'load_kg' || field === 'reps') {
      const load = Number(field === 'load_kg' ? value : updated[index].load_kg) || 0;
      const reps = Number(field === 'reps' ? value : updated[index].reps) || 0;
      if (load > 0 && reps > 0) {
        updated[index].one_rm_kg = Math.round(load * (1 + reps / 30) * 10) / 10;
      } else { updated[index].one_rm_kg = undefined; }
    }
    setStrengthTests(updated);
  };

  const handleRemoveStrengthTest = (index: number) => {
    setStrengthTests(strengthTests.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (postureBusy || saving || photosUploading) return;
    if (!selectedStudentId) {
      showToast(`Selecione o ${effectiveTermLabel.toLowerCase()} para a avaliação`, 'error');
      return;
    }
    if ((!w || !h) && !posture) {
      showToast('Peso e altura são obrigatórios', 'error');
      return;
    }

    try {
      setSaving(true);
      // Signed URLs expire. Persist only the R2 attachment identifier.
      const photos: Array<{ photo_type: string; file_id: string }> = [];
      if (photoFrontFileId) photos.push({ photo_type: 'front', file_id: photoFrontFileId });
      if (photoBackFileId) photos.push({ photo_type: 'back', file_id: photoBackFileId });
      if (photoRightFileId) photos.push({ photo_type: 'right', file_id: photoRightFileId });
      if (photoLeftFileId) photos.push({ photo_type: 'left', file_id: photoLeftFileId });

      // Preserve photo notes and extra photo types when editing posture in an existing assessment.
      if (postureOnly && Array.isArray(assessmentToEdit?.photos)) {
        for (const previous of assessmentToEdit.photos) {
          const fileId = previous.file_id || previous.fileId;
          if (!fileId) continue;
          const selected = photos.find(p => p.photo_type === previous.photo_type && p.file_id === fileId);
          if (selected) Object.assign(selected, { notes: previous.notes || null });
          else if (!['front','back','right','left'].includes(previous.photo_type)) photos.push({photo_type:previous.photo_type,file_id:fileId,...{notes:previous.notes || null}});
        }
      }

      // Agrupar testes de resistência muscular
      const enduranceTests: EnduranceTestItem[] = [];
      if (endurancePushups !== '') enduranceTests.push({ test_name: 'Flexão de Braço', result_value: Number(endurancePushups), unit: 'reps' });
      if (enduranceSitups !== '') enduranceTests.push({ test_name: 'Abdominais', result_value: Number(enduranceSitups), unit: 'reps' });
      if (enduranceSquats !== '') enduranceTests.push({ test_name: 'Agachamento', result_value: Number(enduranceSquats), unit: 'reps' });
      if (endurancePlankSeconds !== '') enduranceTests.push({ test_name: 'Prancha Isométrica', result_value: Number(endurancePlankSeconds), unit: 'segundos' });

      const payload = {
        ...technical,
        skinfold_measurements_json:technical.technical_mode ? JSON.stringify(technical.skinfold_measurements || {}) : null,
        patient_id: selectedStudentId,
        assessment_date: assessmentDate,
        protocol: skinfoldsProtocol,
        weight: w || undefined,
        height: h || undefined,
        body_fat_percentage: compositionMethod === 'dobras' ? null : manualFatPct === '' ? null : Number(manualFatPct),
        muscle_mass_kg: estimatedMuscleMass || null,
        composition_method: compositionMethod,
        body_water_liters: bodyWaterLiters !== '' ? Number(bodyWaterLiters) : null,
        bmr_kcal: assessmentToEdit?.bmr_method==='mifflin_st_jeor' ? null : bmrKcal !== '' ? Number(bmrKcal) : null,
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
        photos,
        posture: posture || undefined,
        source_module: sourceModule
      };

      if (assessmentToEdit?.id) {
        await ApiClient.put(`/v1/personal/assessments/${assessmentToEdit.id}`, postureOnly ? { assessment_date: assessmentDate, posture: posture || undefined, photos, notes, source_module: sourceModule } : payload);
        showToast(postureOnly ? 'Avaliação postural atualizada com sucesso!' : 'Avaliação física atualizada com sucesso!', 'success');
      } else {
        const createPayload = postureOnly ? {
          patient_id: selectedStudentId,
          assessment_date: assessmentDate,
          photos,
          posture: posture || undefined,
          notes,
          source_module: sourceModule
        } : payload;
        await ApiClient.post('/v1/personal/assessments', createPayload);
        showToast(postureOnly ? 'Avaliação postural registrada com sucesso!' : 'Avaliação física completa registrada com sucesso!', 'success');
      }
      if(!postureOnly) await autosave.clearDraft();
      onSaved();
      onClose();
    } catch (err) {
      console.error('Erro ao salvar avaliação:', err);
      showToast(postureOnly ? 'Erro ao registrar avaliação postural' : 'Erro ao registrar avaliação física completa', 'error');
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
                {postureOnly ? 'Avaliação Postural' : 'Avaliação Física Completa & Composição Corporal'}
              </h3>
              <p className="text-xs text-slate-500">
                {postureOnly ? 'Fotos, marcações e observações por região.' : 'Antropometria, Composição, TAV, Dobras, Cardiovascular, Força 1RM e Fotos.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!postureOnly && <ClinicalAutosaveIndicator
              status={autosave.autosaveStatus}
              lastSavedTime={autosave.lastSavedTime}
            />}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Info Strip: Aluno e Data */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">{effectiveTermLabel} *</label>
            <PatientSearchSelect
              isStudent={!postureOnly}
              clientTermLabel={effectiveTermLabel}
              value={selectedStudentId}
              onChange={(id, stud) => {
                if(id!==selectedStudentId){setPosture(postureMode?emptyPosture():null);setPhotoFrontFileId('');setPhotoBackFileId('');setPhotoRightFileId('');setPhotoLeftFileId('');setPhotoFront('');setPhotoBack('');setPhotoRight('');setPhotoLeft('');}
                setSelectedStudentId(id);
                setSelectedStudent((stud as any) || null);
              }}
              disabled={!!student || postureBusy || saving || photosUploading}
              placeholder={`Buscar ${effectiveTermLabel.toLowerCase()} pelo nome...`}
            />
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
              <span className="text-[10px] uppercase font-bold text-slate-400 block">{effectiveTermLabel} / Idade</span>
              <strong className="text-xs text-slate-800">
                {currentStudent?.name || (currentStudent as any)?.full_name || '—'} • {age !== null ? `${age} anos` : 'Idade não informada'}
              </strong>
            </div>
          </div>
        </div>

        {!postureOnly && <>
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
            <strong className="text-amber-300 font-bold">{calculatedFatPct != null ? `${calculatedFatPct}%` : '—'}</strong><span className="text-[10px] text-slate-300">{calculationPreview?.values?.body_fat_classification}</span>
          </div>
          <div className="h-4 w-px bg-white/20 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-purple-300 text-[11px]">Massa Magra:</span>
            <strong className="text-emerald-300 font-bold">{leanMassKg > 0 ? `${leanMassKg} kg` : '—'}</strong>
          </div>
          <div className="h-4 w-px bg-white/20 hidden sm:block" />
          {tavValue!=='' && <div className="flex items-center gap-2">
            <span className="text-purple-300 text-[11px]">TAV medido:</span>
            <strong className="text-cyan-300 font-bold">{`${tavValue} ${tavUnit}`}</strong>
            {tavClassification && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-cyan-200">
                {tavClassification}
              </span>
            )}
          </div>}
          {calculationPreview?.values?.vai_value!=null && <div className="text-xs"><span className="text-purple-300">VAI: </span><strong>{Number(calculationPreview.values.vai_value).toLocaleString('pt-BR',{maximumFractionDigits:2})}</strong><span className="text-[10px] text-slate-300"> · Indicador indireto</span></div>}
        </div>

        {/* Barra de Navegação das 5 Abas */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-white overflow-x-auto py-2">
          <button
            type="button"
            disabled={photosUploading || postureBusy}
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
            disabled={photosUploading || postureBusy}
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
            disabled={photosUploading || postureBusy}
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
            disabled={photosUploading || postureBusy}
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
            disabled={photosUploading || postureBusy}
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

        </>}
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
                      value={compositionMethod === 'dobras' ? calculatedFatPct ?? '' : manualFatPct}
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

              <div className="grid grid-cols-2 gap-3">{['bmi','bodyFat','whr','whtr'].map(key=><PersonalAssessmentIndicator key={key} unit={key==='bmi'?'kg/m²':key==='bodyFat'?'%':''} item={calculationPreview?.classifications?.[key]}/>)}</div>
              {/* ÁREA DEDICADA: MÓDULO TAV (TECIDO ADIPOSO VISCERAL) */}
              <div className="p-5 bg-gradient-to-br from-indigo-50/70 via-purple-50/50 to-white rounded-3xl border-2 border-indigo-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-indigo-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                      <Flame className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">
                        Tecido Adiposo Visceral — TAV
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Estimativa por protocolo científico, medição informada e índice indireto apresentados separadamente.
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-full border border-indigo-200">
                    Estimado ≠ medido ≠ VAI
                  </span>
                </div>

                <div className="space-y-2">
                  <PersonalAssessmentIndicator item={calculationPreview?.classifications?.predictedTav}/>
                  <p className="text-[11px] text-slate-500">Método: equação preditiva antropométrico-bioquímica · Cavalcanti et al., RBONE 14(91).</p>
                </div>
                <div className="space-y-2">
                  <PersonalAssessmentIndicator item={calculationPreview?.classifications?.vai}/>
                  <p className="text-[11px] text-slate-500">Indicador indireto de adiposidade visceral. Atualizado automaticamente conforme os dados da avaliação.</p>
                  <button type="button" onClick={()=>setActiveTab('cardio_tests')} className="text-xs font-semibold text-indigo-700 hover:underline">Preencher dados bioquímicos</button>
                </div>
                <details className="border-t border-indigo-100 pt-4 space-y-3"><summary className="text-xs font-semibold text-indigo-700 cursor-pointer">Informar TAV medido por equipamento</summary>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Método de medição (opcional)</label><input value={tavMethod} onChange={e=>setTavMethod(e.target.value)} placeholder="Tomografia, ressonância, DXA, bioimpedância…" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"/></div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  {/* Catálogo de Protocolos & Equipamentos */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Equipamento / Protocolo (opcional)
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
                          setTavUnit(proto.unit || '');
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
                      onChange={(e) => {setTavEquipment(e.target.value);setTavProtocolId('');}}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-semibold"
                    />
                  </div>

                  {/* Escala / Unidade */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Unidade / Escala
                    </label>
                    <select
                      value={tavUnit}
                      onChange={(e) => {setTavUnit(e.target.value);setTavProtocolId('');}}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-semibold"
                    >
                      <option value="">Não informado</option><option value="mL">Volume em mL</option><option value="cm³">Volume em cm³</option><option value="nível">Nível / Grau (1 a 20, 1 a 59)</option>
                      <option value="cm²">Área em cm² (DXA / Tomografia)</option>
                      <option value="kg">Massa em kg</option>
                      <option value="escala_direta">Escala Direta</option>
                    </select>
                  </div>

                  {/* Valor medido do TAV */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Valor medido do TAV
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

                <IndicatorDetails item={calculationPreview?.classifications?.tav}/>
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
                </details>
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
                    Preencha as dobras exigidas pelo protocolo selecionado. A fórmula calcula automaticamente com base no protocolo.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={skinfoldsProtocol}
                    onChange={(e) => setSkinfoldsProtocol(e.target.value as any)}
                    className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-semibold text-slate-800"
                  >
                    <option value="pollock_7">Jackson & Pollock 7 Dobras</option>
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
          {!postureOnly && ['skinfolds','composition','cardio_tests'].includes(activeTab) && <PersonalTechnicalFields value={technical} onChange={setTechnical} tab={activeTab} preview={calculationPreview}/>}
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
              {!postureOnly && (
                <label className="flex items-center gap-2 text-sm font-semibold text-indigo-800">
                  <input type="checkbox" checked={postureMode} disabled={postureBusy} onChange={e=>{setPostureMode(e.target.checked);if(e.target.checked&&!posture)setPosture(emptyPosture());}} />
                  Modo Avaliação Postural
                </label>
              )}
              {postureMode && posture && <Suspense fallback={<p className="text-xs">Carregando ferramentas posturais…</p>}><PersonalPostureEditor key={[selectedStudentId,photoFrontFileId,photoBackFileId,photoRightFileId,photoLeftFileId].join(':')} value={posture} onChange={setPosture} onBusy={setPostureBusy} patientId={selectedStudentId} photos={[
                {view:'front',fileId:photoFrontFileId,url:photoFront},{view:'back',fileId:photoBackFileId,url:photoBack},
                {view:'right',fileId:photoRightFileId,url:photoRight},{view:'left',fileId:photoLeftFileId,url:photoLeft}
              ]} /></Suspense>}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-purple-600" />
                    <span>Fotos da Avaliação Corporal</span>
                  </h4>
                </div>

                {!selectedStudentId && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>Selecione um {effectiveTermLabel.toLowerCase()} para adicionar fotos.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <FileImageUploader
                    label="Foto Frontal"
                    buttonText="+ Adicionar foto"
                    patientId={selectedStudentId || undefined}
                    assessmentId={assessmentToEdit?.id || undefined}
                    position="front"
                    category="personal_assessment_front"
                    layoutMode="stacked"
                    initialUrl={photoFront}
                    initialFileId={photoFrontFileId}
                    onUploadingChange={setUploadingFront}
                    disabled={!selectedStudentId || postureBusy}
                    onUploaded={(info) => {
                      setPhotoFrontFileId(info.id);
                      setPhotoFront('');
                    }}
                    onRemoved={() => {
                      setPhotoFrontFileId('');
                      setPhotoFront('');
                    }}
                  />

                  <FileImageUploader
                    label="Foto Posterior"
                    buttonText="+ Adicionar foto"
                    patientId={selectedStudentId || undefined}
                    assessmentId={assessmentToEdit?.id || undefined}
                    position="back"
                    category="personal_assessment_back"
                    layoutMode="stacked"
                    initialUrl={photoBack}
                    initialFileId={photoBackFileId}
                    onUploadingChange={setUploadingBack}
                    disabled={!selectedStudentId || postureBusy}
                    onUploaded={(info) => {
                      setPhotoBackFileId(info.id);
                      setPhotoBack('');
                    }}
                    onRemoved={() => {
                      setPhotoBackFileId('');
                      setPhotoBack('');
                    }}
                  />

                  <FileImageUploader
                    label="Lateral Direita"
                    buttonText="+ Adicionar foto"
                    patientId={selectedStudentId || undefined}
                    assessmentId={assessmentToEdit?.id || undefined}
                    position="right"
                    category="personal_assessment_right"
                    layoutMode="stacked"
                    initialUrl={photoRight}
                    initialFileId={photoRightFileId}
                    onUploadingChange={setUploadingRight}
                    disabled={!selectedStudentId || postureBusy}
                    onUploaded={(info) => {
                      setPhotoRightFileId(info.id);
                      setPhotoRight('');
                    }}
                    onRemoved={() => {
                      setPhotoRightFileId('');
                      setPhotoRight('');
                    }}
                  />

                  <FileImageUploader
                    label="Lateral Esquerda"
                    buttonText="+ Adicionar foto"
                    patientId={selectedStudentId || undefined}
                    assessmentId={assessmentToEdit?.id || undefined}
                    position="left"
                    category="personal_assessment_left"
                    layoutMode="stacked"
                    initialUrl={photoLeft}
                    initialFileId={photoLeftFileId}
                    onUploadingChange={setUploadingLeft}
                    disabled={!selectedStudentId || postureBusy}
                    onUploaded={(info) => {
                      setPhotoLeftFileId(info.id);
                      setPhotoLeft('');
                    }}
                    onRemoved={() => {
                      setPhotoLeftFileId('');
                      setPhotoLeft('');
                    }}
                  />
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
                disabled={saving || postureBusy || photosUploading}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-xl flex items-center gap-2 shadow-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Gravando Avaliação...' : postureOnly ? 'Salvar Avaliação Postural' : 'Salvar Avaliação Física Completa'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
