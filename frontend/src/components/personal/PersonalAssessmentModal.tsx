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
  AlertCircle
} from 'lucide-react';
import { Student } from './types';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

interface PersonalAssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  student?: Student | null;
  studentsList?: Student[];
}

export const PersonalAssessmentModal: React.FC<PersonalAssessmentModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  student,
  studentsList = []
}) => {
  const { showToast } = useToast();

  const [selectedStudentId, setSelectedStudentId] = useState(student?.id || '');
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [protocol, setProtocol] = useState<'pollock_7' | 'pollock_3' | 'bioimpedance'>('pollock_7');

  // Medidas Gerais
  const [weight, setWeight] = useState<number | ''>(student?.current_weight || '');
  const [height, setHeight] = useState<number | ''>(student?.height || '');
  const [notes, setNotes] = useState('');

  // Dobras cutâneas (mm)
  const [foldSubscapular, setFoldSubscapular] = useState<number | ''>('');
  const [foldTriceps, setFoldTriceps] = useState<number | ''>('');
  const [foldChest, setFoldChest] = useState<number | ''>('');
  const [foldAxillary, setFoldAxillary] = useState<number | ''>('');
  const [foldSuprailiac, setFoldSuprailiac] = useState<number | ''>('');
  const [foldAbdominal, setFoldAbdominal] = useState<number | ''>('');
  const [foldThigh, setFoldThigh] = useState<number | ''>('');
  const [foldCalf, setFoldCalf] = useState<number | ''>('');

  // Perímetros (cm)
  const [neckCm, setNeckCm] = useState<number | ''>('');
  const [shoulderCm, setShoulderCm] = useState<number | ''>('');
  const [chestCm, setChestCm] = useState<number | ''>('');
  const [waistCm, setWaistCm] = useState<number | ''>('');
  const [abdomenCm, setAbdomenCm] = useState<number | ''>('');
  const [hipCm, setHipCm] = useState<number | ''>('');
  const [armRightFlexed, setArmRightFlexed] = useState<number | ''>('');
  const [armLeftFlexed, setArmLeftFlexed] = useState<number | ''>('');
  const [thighRightMed, setThighRightMed] = useState<number | ''>('');
  const [thighLeftMed, setThighLeftMed] = useState<number | ''>('');
  const [calfRight, setCalfRight] = useState<number | ''>('');
  const [calfLeft, setCalfLeft] = useState<number | ''>('');

  // Manual % de gordura (usado se bioimpedância)
  const [manualFatPct, setManualFatPct] = useState<number | ''>('');

  // Fotos
  const [photoFront, setPhotoFront] = useState('');
  const [photoBack, setPhotoBack] = useState('');
  const [photoRight, setPhotoRight] = useState('');
  const [photoLeft, setPhotoLeft] = useState('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (student) {
      setSelectedStudentId(student.id);
      if (student.current_weight) setWeight(student.current_weight);
      if (student.height) setHeight(student.height);
    }
  }, [student]);

  // Cálculos em tempo real
  const currentStudent = studentsList.find((s) => s.id === selectedStudentId) || student;
  const isMale = (currentStudent?.gender || 'm').toLowerCase().startsWith('m');
  const birthDate = currentStudent?.birth_date;
  let age = 28;
  if (birthDate) {
    const diff = Date.now() - new Date(birthDate).getTime();
    age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }

  // IMC
  const w = Number(weight) || 0;
  const h = Number(height) || 0;
  const bmi = w > 0 && h > 0 ? parseFloat((w / ((h / 100) * (h / 100))).toFixed(2)) : 0;

  // RCQ
  const waist = Number(waistCm) || 0;
  const hip = Number(hipCm) || 0;
  const whr = waist > 0 && hip > 0 ? parseFloat((waist / hip).toFixed(2)) : 0;

  // % de Gordura calculado
  let calculatedFatPct = 0;
  if (protocol === 'bioimpedance') {
    calculatedFatPct = Number(manualFatPct) || 0;
  } else if (protocol === 'pollock_7') {
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
      if (d > 0) {
        calculatedFatPct = parseFloat((((4.95 / d) - 4.5) * 100).toFixed(2));
      }
    }
  } else if (protocol === 'pollock_3') {
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

  calculatedFatPct = Math.max(0, Math.min(65, calculatedFatPct));
  const fatMassKg = w > 0 && calculatedFatPct > 0 ? parseFloat(((w * calculatedFatPct) / 100).toFixed(2)) : 0;
  const leanMassKg = w > 0 && fatMassKg > 0 ? parseFloat((w - fatMassKg).toFixed(2)) : 0;
  const muscleMassKg = leanMassKg > 0 ? parseFloat((leanMassKg * 0.52).toFixed(2)) : 0;

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

      await ApiClient.post('/v1/personal/assessments', {
        patient_id: selectedStudentId,
        assessment_date: assessmentDate,
        protocol,
        weight: w,
        height: h,
        body_fat_percentage: calculatedFatPct,
        fold_subscapular: foldSubscapular !== '' ? foldSubscapular : null,
        fold_triceps: foldTriceps !== '' ? foldTriceps : null,
        fold_chest: foldChest !== '' ? foldChest : null,
        fold_axillary: foldAxillary !== '' ? foldAxillary : null,
        fold_suprailiac: foldSuprailiac !== '' ? foldSuprailiac : null,
        fold_abdominal: foldAbdominal !== '' ? foldAbdominal : null,
        fold_thigh: foldThigh !== '' ? foldThigh : null,
        fold_calf: foldCalf !== '' ? foldCalf : null,
        neck_cm: neckCm !== '' ? neckCm : null,
        shoulder_cm: shoulderCm !== '' ? shoulderCm : null,
        chest_cm: chestCm !== '' ? chestCm : null,
        waist_cm: waistCm !== '' ? waistCm : null,
        abdomen_cm: abdomenCm !== '' ? abdomenCm : null,
        hip_cm: hipCm !== '' ? hipCm : null,
        arm_right_flexed: armRightFlexed !== '' ? armRightFlexed : null,
        arm_left_flexed: armLeftFlexed !== '' ? armLeftFlexed : null,
        thigh_right_med: thighRightMed !== '' ? thighRightMed : null,
        thigh_left_med: thighLeftMed !== '' ? thighLeftMed : null,
        calf_right: calfRight !== '' ? calfRight : null,
        calf_left: calfLeft !== '' ? calfLeft : null,
        notes,
        photos
      });

      showToast('Avaliação física registrada com sucesso!', 'success');
      onSaved();
      onClose();
    } catch (err) {
      console.error('Erro ao salvar avaliação:', err);
      showToast('Erro ao registrar avaliação física', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-600/20">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Nova Avaliação Física & Composição Corporal</h3>
              <p className="text-xs text-slate-500">
                Protocolo Pollock (3 ou 7 dobras), perímetros corporais e fotos comparativas.
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Seleção do Aluno, Data e Protocolo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Aluno(a) *</label>
              <select
                disabled={!!student}
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
              >
                <option value="">Selecione um aluno...</option>
                {studentsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.gender === 'm' ? 'Masc' : 'Fem'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Data da Avaliação *</label>
              <input
                type="date"
                required
                value={assessmentDate}
                onChange={(e) => setAssessmentDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
              >
              </input>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Método / Protocolo *</label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
              >
                <option value="pollock_7">Pollock 7 Dobras (Padrão Ouro)</option>
                <option value="pollock_3">Pollock 3 Dobras</option>
                <option value="bioimpedance">Bioimpedância / Valor Direto</option>
              </select>
            </div>
          </div>

          {/* Dados Antropométricos Básicos */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Peso (kg) *</label>
              <input
                type="number"
                step="0.1"
                required
                placeholder="Ex: 75.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Altura (cm) *</label>
              <input
                type="number"
                step="0.5"
                required
                placeholder="Ex: 178"
                value={height}
                onChange={(e) => setHeight(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">IMC Calculado</label>
              <div className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800">
                {bmi > 0 ? `${bmi} kg/m²` : '—'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Relação Cintura/Quadril</label>
              <div className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800">
                {whr > 0 ? whr : '—'}
              </div>
            </div>
          </div>

          {/* CARD DE RESULTADOS ESTIMADOS EM TEMPO REAL */}
          <div className="bg-gradient-to-r from-purple-900 to-indigo-900 rounded-2xl p-5 text-white shadow-sm">
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-200 mb-3 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-purple-300" />
              <span>Cálculo Automático de Composição Corporal</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <div className="text-[11px] text-purple-200 uppercase font-semibold">% Gordura</div>
                <div className="text-2xl font-black mt-1 text-amber-300">
                  {calculatedFatPct > 0 ? `${calculatedFatPct}%` : '—'}
                </div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <div className="text-[11px] text-purple-200 uppercase font-semibold">Massa Gorda</div>
                <div className="text-2xl font-bold mt-1">
                  {fatMassKg > 0 ? `${fatMassKg} kg` : '—'}
                </div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <div className="text-[11px] text-purple-200 uppercase font-semibold">Massa Magra</div>
                <div className="text-2xl font-bold mt-1 text-emerald-300">
                  {leanMassKg > 0 ? `${leanMassKg} kg` : '—'}
                </div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <div className="text-[11px] text-purple-200 uppercase font-semibold">Massa Muscular (Est.)</div>
                <div className="text-2xl font-bold mt-1 text-cyan-300">
                  {muscleMassKg > 0 ? `${muscleMassKg} kg` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* DOBRAS CUTÂNEAS */}
          {protocol !== 'bioimpedance' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Dobras Cutâneas (milímetros - mm)
                </h4>
                <span className="text-[11px] text-purple-600 font-medium">
                  {protocol === 'pollock_7' ? 'Protocolo 7 Dobras' : 'Protocolo 3 Dobras'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={protocol === 'pollock_3' && isMale ? 'opacity-40' : ''}>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tríceps</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldTriceps}
                    onChange={(e) => setFoldTriceps(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className={protocol === 'pollock_3' ? 'opacity-40' : ''}>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Subescapular</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldSubscapular}
                    onChange={(e) => setFoldSubscapular(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className={protocol === 'pollock_3' && !isMale ? 'opacity-40' : ''}>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Peitoral</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldChest}
                    onChange={(e) => setFoldChest(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className={protocol === 'pollock_3' ? 'opacity-40' : ''}>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Axilar Média</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldAxillary}
                    onChange={(e) => setFoldAxillary(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className={protocol === 'pollock_3' && isMale ? 'opacity-40' : ''}>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Suprailíaca</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldSuprailiac}
                    onChange={(e) => setFoldSuprailiac(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className={protocol === 'pollock_3' && !isMale ? 'opacity-40' : ''}>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Abdominal</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldAbdominal}
                    onChange={(e) => setFoldAbdominal(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Coxa</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldThigh}
                    onChange={(e) => setFoldThigh(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className={protocol === 'pollock_3' ? 'opacity-40' : ''}>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Panturrilha</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="mm"
                    value={foldCalf}
                    onChange={(e) => setFoldCalf(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
              <label className="block text-xs font-semibold text-purple-900 mb-1">
                % de Gordura Corporal Direto (Bioimpedância)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="Ex: 18.5"
                value={manualFatPct}
                onChange={(e) => setManualFatPct(e.target.value ? Number(e.target.value) : '')}
                className="w-full max-w-xs px-3 py-2 text-xs bg-white border border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
              />
            </div>
          )}

          {/* PERÍMETROS CORPORAIS (CM) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Perímetros & Circunferências (cm)
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pescoço</label>
                <input
                  type="number"
                  step="0.5"
                  placeholder="cm"
                  value={neckCm}
                  onChange={(e) => setNeckCm(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
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
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
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
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
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
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
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
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Braço Dir. (Contraído)</label>
                <input
                  type="number"
                  step="0.5"
                  placeholder="cm"
                  value={armRightFlexed}
                  onChange={(e) => setArmRightFlexed(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Braço Esq. (Contraído)</label>
                <input
                  type="number"
                  step="0.5"
                  placeholder="cm"
                  value={armLeftFlexed}
                  onChange={(e) => setArmLeftFlexed(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Coxa Dir. (Medial)</label>
                <input
                  type="number"
                  step="0.5"
                  placeholder="cm"
                  value={thighRightMed}
                  onChange={(e) => setThighRightMed(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>
            </div>
          </div>

          {/* FOTOS DE COMPARAÇÃO */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-purple-600" />
              <span>Fotos da Avaliação (URLs / Antes e Depois)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Foto Frontal</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={photoFront}
                  onChange={(e) => setPhotoFront(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Foto Posterior (Costas)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={photoBack}
                  onChange={(e) => setPhotoBack(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Lateral Direita</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={photoRight}
                  onChange={(e) => setPhotoRight(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Lateral Esquerda</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={photoLeft}
                  onChange={(e) => setPhotoLeft(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>
            </div>
          </div>

          {/* NOTAS */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Observações da Avaliação</label>
            <textarea
              rows={2}
              placeholder="Ex: Aluno relatou menor retenção hídrica, melhora na postura e simetria dos dorsais..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
            />
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
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
              {saving ? 'Salvando Avaliação...' : 'Salvar Avaliação Física'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
