import React, { useState, useEffect, useMemo } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  Scale,
  Ruler,
  Activity,
  Heart,
  Calendar,
  Save,
  Plus,
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
  ChevronRight,
  Clock,
  History,
  FileText,
  User,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export interface BodyMeasureItem {
  part: string;
  measureCm: number | string;
  observation?: string;
}

export interface AnthropometricRecord {
  id: string;
  tenant_id: string;
  patient_id: string;
  appointment_id?: string;
  professional_id: string;
  professional_name?: string;
  assessment_date: string;
  weight?: number | null;
  height?: number | null;
  waist_circumference?: number | null;
  abdomen_circumference?: number | null;
  hip_circumference?: number | null;
  body_fat_percentage?: number | null;
  fat_mass_kg?: number | null;
  muscle_mass_kg?: number | null;
  visceral_fat?: string | null;
  bmi?: number | null;
  whr?: number | null;
  whtr?: number | null;
  body_measures?: BodyMeasureItem[];
  notes?: string | null;
  created_at: string;
}

interface AnthropometricAssessmentViewProps {
  patientId: string;
  appointmentId?: string;
  patientSex?: 'female' | 'male';
  patientAge?: number;
  readOnly?: boolean;
}

const BODY_PARTS_LIST = [
  'Pescoço',
  'Ombros',
  'Tórax',
  'Cintura',
  'Abdômen',
  'Quadril',
  'Braço direito',
  'Braço esquerdo',
  'Antebraço direito',
  'Antebraço esquerdo',
  'Coxa direita',
  'Coxa esquerda',
  'Panturrilha direita',
  'Panturrilha esquerda'
];

export const AnthropometricAssessmentView: React.FC<AnthropometricAssessmentViewProps> = ({
  patientId,
  appointmentId,
  patientSex = 'female',
  patientAge = 32,
  readOnly = false
}) => {
  const { showToast } = useToast();

  const [history, setHistory] = useState<AnthropometricRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'form' | 'history' | 'evolution'>('form');

  // Estado do formulário
  const [selectedSex, setSelectedSex] = useState<'female' | 'male'>(patientSex);
  const [selectedAge, setSelectedAge] = useState<number>(patientAge || 30);
  const [assessmentDate, setAssessmentDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [weight, setWeight] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [waist, setWaist] = useState<string>('');
  const [abdomen, setAbdomen] = useState<string>('');
  const [hip, setHip] = useState<string>('');
  const [bodyFat, setBodyFat] = useState<string>('');
  const [fatMass, setFatMass] = useState<string>('');
  const [muscleMass, setMuscleMass] = useState<string>('');
  const [visceralFat, setVisceralFat] = useState<string>('');
  const [generalNotes, setGeneralNotes] = useState<string>('');

  // Tabela de medidas corporais
  const [measures, setMeasures] = useState<Record<string, { cm: string; obs: string }>>(() => {
    const initial: Record<string, { cm: string; obs: string }> = {};
    BODY_PARTS_LIST.forEach(part => {
      initial[part] = { cm: '', obs: '' };
    });
    return initial;
  });

  // Carrega histórico do paciente
  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.get<AnthropometricRecord[]>(
        `/v1/body-assessments/patient/${patientId}/anthropometry`
      );
      const list = data || [];
      setHistory(list);

      // Se houver registro anterior, sugere altura ou medidas de base se vazios
      if (list.length > 0) {
        const latest = list[0];
        if (latest.height && !height) {
          setHeight(String(latest.height));
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar histórico antropométrico:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [patientId]);

  // Cálculos automáticos ao alterar peso, altura ou % de gordura
  const numWeight = parseFloat(weight) || 0;
  const numHeight = parseFloat(height) || 0;
  const numWaist = parseFloat(waist) || 0;
  const numAbdomen = parseFloat(abdomen) || 0;
  const numHip = parseFloat(hip) || 0;
  const numFatPct = parseFloat(bodyFat) || 0;

  // Auto-cálculo da massa de gordura e massa magra
  const handleFatPctChange = (val: string) => {
    setBodyFat(val);
    const parsedPct = parseFloat(val);
    if (!isNaN(parsedPct) && numWeight > 0) {
      const calcFat = (numWeight * parsedPct) / 100;
      setFatMass(calcFat.toFixed(2));
      const calcMuscle = numWeight - calcFat;
      setMuscleMass(calcMuscle.toFixed(2));
    }
  };

  const handleWeightChange = (val: string) => {
    setWeight(val);
    const parsedW = parseFloat(val);
    if (!isNaN(parsedW) && numFatPct > 0) {
      const calcFat = (parsedW * numFatPct) / 100;
      setFatMass(calcFat.toFixed(2));
      const calcMuscle = parsedW - calcFat;
      setMuscleMass(calcMuscle.toFixed(2));
    }
  };

  // 1. IMC
  const bmiInfo = useMemo(() => {
    if (numWeight <= 0 || numHeight <= 0) return null;
    const hMeters = numHeight / 100;
    const val = Number((numWeight / (hMeters * hMeters)).toFixed(2));

    let label = 'Eutrófico (Adequado)';
    let color = 'text-emerald-700 bg-emerald-100 border-emerald-300';
    if (val < 18.5) {
      label = 'Baixo Peso';
      color = 'text-blue-700 bg-blue-100 border-blue-300';
    } else if (val >= 25 && val < 30) {
      label = 'Sobrepeso';
      color = 'text-amber-800 bg-amber-100 border-amber-300';
    } else if (val >= 30 && val < 35) {
      label = 'Obesidade Grau I';
      color = 'text-orange-800 bg-orange-100 border-orange-300';
    } else if (val >= 35 && val < 40) {
      label = 'Obesidade Grau II';
      color = 'text-rose-800 bg-rose-100 border-rose-300';
    } else if (val >= 40) {
      label = 'Obesidade Grau III (Mórbida)';
      color = 'text-red-900 bg-red-100 border-red-400';
    }
    return { val, label, color };
  }, [numWeight, numHeight]);

  // 2. RCQ (Relação Cintura / Quadril)
  const whrInfo = useMemo(() => {
    if (numWaist <= 0 || numHip <= 0) return null;
    const val = Number((numWaist / numHip).toFixed(2));
    let label = 'Baixo Risco Cardiovascular';
    let color = 'text-emerald-700 bg-emerald-100 border-emerald-300';

    if (selectedSex === 'female') {
      if (val >= 0.85) {
        label = 'Alto Risco Cardiovascular';
        color = 'text-rose-800 bg-rose-100 border-rose-300';
      } else if (val >= 0.80) {
        label = 'Risco Moderado';
        color = 'text-amber-800 bg-amber-100 border-amber-300';
      }
    } else {
      if (val >= 0.96) {
        label = 'Alto Risco Cardiovascular';
        color = 'text-rose-800 bg-rose-100 border-rose-300';
      } else if (val >= 0.90) {
        label = 'Risco Moderado';
        color = 'text-amber-800 bg-amber-100 border-amber-300';
      }
    }
    return { val, label, color };
  }, [numWaist, numHip, selectedSex]);

  // 3. RCEst (Relação Cintura / Estatura)
  const whtrInfo = useMemo(() => {
    if (numWaist <= 0 || numHeight <= 0) return null;
    const val = Number((numWaist / numHeight).toFixed(2));
    const isRisk = val >= 0.50;
    return {
      val,
      label: isRisk ? 'Risco Cardiovascular Aumentado' : 'Adequado (Baixo Risco)',
      color: isRisk ? 'text-amber-800 bg-amber-100 border-amber-300' : 'text-emerald-700 bg-emerald-100 border-emerald-300'
    };
  }, [numWaist, numHeight]);

  // 4. Classificação do % de Gordura por Sexo e Idade
  const fatCategoryInfo = useMemo(() => {
    if (numFatPct <= 0) return null;

    // Thresholds: Muito baixo | Baixo | Adequado | Elevado | Muito elevado
    let t = { vLow: 14, low: 17, ok: 24, high: 29 };
    if (selectedSex === 'male') {
      if (selectedAge < 30) t = { vLow: 8, low: 11, ok: 17, high: 22 };
      else if (selectedAge < 40) t = { vLow: 9, low: 12, ok: 18, high: 23 };
      else if (selectedAge < 50) t = { vLow: 10, low: 14, ok: 20, high: 25 };
      else if (selectedAge < 60) t = { vLow: 11, low: 15, ok: 22, high: 26 };
      else t = { vLow: 12, low: 16, ok: 23, high: 27 };
    } else {
      if (selectedAge < 30) t = { vLow: 14, low: 17, ok: 23, high: 28 };
      else if (selectedAge < 40) t = { vLow: 15, low: 18, ok: 24, high: 29 };
      else if (selectedAge < 50) t = { vLow: 16, low: 19, ok: 25, high: 30 };
      else if (selectedAge < 60) t = { vLow: 17, low: 20, ok: 27, high: 32 };
      else t = { vLow: 18, low: 21, ok: 29, high: 34 };
    }

    let category: 'Muito baixo' | 'Baixo' | 'Adequado' | 'Elevado' | 'Muito elevado';
    let activeIndex = 2; // default Adequado

    if (numFatPct < t.vLow) {
      category = 'Muito baixo';
      activeIndex = 0;
    } else if (numFatPct < t.low) {
      category = 'Baixo';
      activeIndex = 1;
    } else if (numFatPct <= t.ok) {
      category = 'Adequado';
      activeIndex = 2;
    } else if (numFatPct <= t.high) {
      category = 'Elevado';
      activeIndex = 3;
    } else {
      category = 'Muito elevado';
      activeIndex = 4;
    }

    return { category, activeIndex };
  }, [numFatPct, selectedSex, selectedAge]);

  // Comparação Evolutiva: Mais recente x Anterior
  const evolutionData = useMemo(() => {
    if (history.length < 2) return null;
    const current = history[0];
    const previous = history[1];

    const calcDiff = (curr?: number | null, prev?: number | null, unit = '') => {
      if (curr === undefined || curr === null || prev === undefined || prev === null) return null;
      const diff = Number((curr - prev).toFixed(2));
      return {
        prev,
        curr,
        diff,
        unit,
        formatted: `${prev} ${unit} → ${curr} ${unit} (${diff > 0 ? '+' : ''}${diff} ${unit})`
      };
    };

    return {
      currentDate: current.assessment_date,
      previousDate: previous.assessment_date,
      weight: calcDiff(current.weight, previous.weight, 'kg'),
      bmi: calcDiff(current.bmi, previous.bmi),
      bodyFat: calcDiff(current.body_fat_percentage, previous.body_fat_percentage, '%'),
      fatMass: calcDiff(current.fat_mass_kg, previous.fat_mass_kg, 'kg'),
      muscleMass: calcDiff(current.muscle_mass_kg, previous.muscle_mass_kg, 'kg'),
      waist: calcDiff(current.waist_circumference, previous.waist_circumference, 'cm'),
      abdomen: calcDiff(current.abdomen_circumference, previous.abdomen_circumference, 'cm'),
      hip: calcDiff(current.hip_circumference, previous.hip_circumference, 'cm'),
      whr: calcDiff(current.whr, previous.whr),
      whtr: calcDiff(current.whtr, previous.whtr)
    };
  }, [history]);

  // Atualizar medida corporal individual
  const handleMeasureChange = (part: string, field: 'cm' | 'obs', value: string) => {
    setMeasures(prev => ({
      ...prev,
      [part]: {
        ...prev[part],
        [field]: value
      }
    }));
  };

  // Salvar avaliação
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;

    if (!weight && !waist && !bodyFat) {
      showToast('Preencha ao menos o peso, cintura ou percentual de gordura para salvar', 'error');
      return;
    }

    try {
      setSaving(true);

      const bodyMeasuresArray: BodyMeasureItem[] = Object.entries(measures)
        .filter(([_, data]) => data.cm.trim() !== '' || data.obs.trim() !== '')
        .map(([part, data]) => ({
          part,
          measureCm: parseFloat(data.cm) || data.cm,
          observation: data.obs.trim() || undefined
        }));

      await ApiClient.post('/v1/body-assessments/anthropometry', {
        patientId,
        appointmentId,
        assessmentDate,
        weight: numWeight || null,
        height: numHeight || null,
        waistCircumference: numWaist || null,
        abdomenCircumference: numAbdomen || null,
        hipCircumference: numHip || null,
        bodyFatPercentage: numFatPct || null,
        fatMassKg: parseFloat(fatMass) || null,
        muscleMassKg: parseFloat(muscleMass) || null,
        visceralFat: visceralFat.trim() || null,
        bodyMeasures: bodyMeasuresArray,
        notes: generalNotes.trim() || null
      });

      showToast('Avaliação antropométrica registrada com sucesso!', 'success');
      await loadHistory();
      setActiveTab('history');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar avaliação antropométrica', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleNewAssessment = () => {
    setAssessmentDate(new Date().toISOString().split('T')[0]);
    setWeight('');
    setWaist('');
    setAbdomen('');
    setHip('');
    setBodyFat('');
    setFatMass('');
    setMuscleMass('');
    setVisceralFat('');
    setGeneralNotes('');
    const resetMeasures: Record<string, { cm: string; obs: string }> = {};
    BODY_PARTS_LIST.forEach(part => {
      resetMeasures[part] = { cm: '', obs: '' };
    });
    setMeasures(resetMeasures);
    setActiveTab('form');
  };

  const formatDate = (d: string) => {
    try {
      const [year, month, day] = d.split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return d;
    }
  };

  return (
    <div className="mt-6 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all">
      {/* Header da Seção */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-500/30 text-emerald-400">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-black uppercase tracking-wider mb-1 border border-emerald-500/30">
              Módulo Especializado • Nutrição
            </div>
            <h3 className="text-lg font-black tracking-tight">Avaliação Antropométrica e Medidas Corporais</h3>
            <p className="text-xs text-slate-300">
              Circunferências, bioimpedância, índices automáticos (IMC, RCQ, RCEst) e histórico evolutivo.
            </p>
          </div>
        </div>

        {/* Abas Superiores */}
        <div className="flex items-center gap-1.5 p-1 bg-white/10 rounded-2xl border border-white/10 text-xs font-bold self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
              activeTab === 'form' ? 'bg-white text-slate-900 shadow-sm font-black' : 'text-slate-300 hover:text-white'
            }`}
          >
            Nova Avaliação
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('evolution')}
            disabled={history.length < 2}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
              activeTab === 'evolution'
                ? 'bg-white text-slate-900 shadow-sm font-black'
                : 'text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            Evolução {history.length >= 2 && `(${history.length})`}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
              activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm font-black' : 'text-slate-300 hover:text-white'
            }`}
          >
            Histórico ({history.length})
          </button>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div className="p-5 sm:p-7">
        {/* ========================================================================= */}
        {/* ABA 1: FORMULÁRIO DE AVALIAÇÃO */}
        {/* ========================================================================= */}
        {activeTab === 'form' && (
          <form onSubmit={handleSave} className="space-y-6">
            {/* Barra de Contexto: Data, Sexo e Idade para Classificações */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Data da Avaliação
                  </label>
                  <input
                    type="date"
                    required
                    value={assessmentDate}
                    onChange={e => setAssessmentDate(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Sexo do Paciente (para Referências)
                  </label>
                  <div className="inline-flex rounded-xl bg-slate-200 p-0.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setSelectedSex('female')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        selectedSex === 'female' ? 'bg-white text-emerald-950 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Feminino
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSex('male')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        selectedSex === 'male' ? 'bg-white text-emerald-950 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Masculino
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Idade (Anos)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={selectedAge}
                    onChange={e => setSelectedAge(parseInt(e.target.value) || 30)}
                    className="w-20 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 text-center"
                  />
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-400">
                  {history.length === 0 ? 'Primeira avaliação' : `${history.length} avaliação(ões) cadastrada(s)`}
                </span>
              </div>
            </div>

            {/* Grid 1: Dados Antropométricos e Bioimpedância */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-emerald-600" />
                1. Dados Antropométricos e Composição Corporal
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {/* Peso */}
                <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Peso (kg) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 72.5"
                    value={weight}
                    onChange={e => handleWeightChange(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Altura */}
                <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Altura (cm) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="Ex: 170"
                    value={height}
                    onChange={e => setHeight(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Cintura */}
                <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Cintura (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 82.0"
                    value={waist}
                    onChange={e => setWaist(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Abdômen */}
                <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Abdômen (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 88.5"
                    value={abdomen}
                    onChange={e => setAbdomen(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Quadril */}
                <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Quadril (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 102.0"
                    value={hip}
                    onChange={e => setHip(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* % Gordura Corporal */}
                <div className="bg-amber-50/50 p-3 rounded-2xl border border-amber-200">
                  <label className="block text-[11px] font-bold text-amber-900 mb-1">
                    % Gordura Corporal
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 24.5"
                    value={bodyFat}
                    onChange={e => handleFatPctChange(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-sm font-bold text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Massa de Gordura (kg) */}
                <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Massa de Gordura (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Calculada ou Bioimpedância"
                    value={fatMass}
                    onChange={e => setFatMass(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Massa Muscular / Magra (kg) */}
                <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Massa Muscular / Magra (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Calculada ou Bioimpedância"
                    value={muscleMass}
                    onChange={e => setMuscleMass(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Gordura Visceral */}
                <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Gordura Visceral (Nível)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 4 ou Nível 5"
                    value={visceralFat}
                    onChange={e => setVisceralFat(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Painel de Índices Automáticos e Escala Visual de Gordura */}
            <div className="bg-gradient-to-br from-slate-50 to-emerald-50/30 p-5 rounded-3xl border border-emerald-100 space-y-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                2. Índices Automáticos e Classificações Clínicas
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Card IMC */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    IMC (Índice de Massa Corporal)
                  </div>
                  {bmiInfo ? (
                    <div>
                      <div className="text-2xl font-black text-slate-900">{bmiInfo.val} <span className="text-xs text-slate-400 font-normal">kg/m²</span></div>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold mt-1.5 border ${bmiInfo.color}`}>
                        {bmiInfo.label}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Informe peso e altura para calcular</p>
                  )}
                </div>

                {/* Card RCQ */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Relação Cintura / Quadril (RCQ)
                  </div>
                  {whrInfo ? (
                    <div>
                      <div className="text-2xl font-black text-slate-900">{whrInfo.val}</div>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold mt-1.5 border ${whrInfo.color}`}>
                        {whrInfo.label}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Informe cintura e quadril para calcular</p>
                  )}
                </div>

                {/* Card RCEst */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Relação Cintura / Estatura (RCEst)
                  </div>
                  {whtrInfo ? (
                    <div>
                      <div className="text-2xl font-black text-slate-900">{whtrInfo.val}</div>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold mt-1.5 border ${whtrInfo.color}`}>
                        {whtrInfo.label}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Informe cintura e altura para calcular</p>
                  )}
                </div>
              </div>

              {/* Escala Visual de Gordura Corporal */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">
                    Escala de Gordura Corporal ({selectedSex === 'female' ? 'Mulheres' : 'Homens'}, {selectedAge} anos):
                  </span>
                  {fatCategoryInfo && (
                    <span className="font-black text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full text-xs">
                      Classificação: {fatCategoryInfo.category} ({numFatPct}%)
                    </span>
                  )}
                </div>

                {/* Barra com 5 níveis */}
                <div className="grid grid-cols-5 gap-1 pt-1">
                  {[
                    { label: 'Muito baixo', bg: 'bg-blue-200 text-blue-900' },
                    { label: 'Baixo', bg: 'bg-teal-200 text-teal-900' },
                    { label: 'Adequado', bg: 'bg-emerald-300 text-emerald-950' },
                    { label: 'Elevado', bg: 'bg-amber-300 text-amber-950' },
                    { label: 'Muito elevado', bg: 'bg-rose-300 text-rose-950' }
                  ].map((level, idx) => {
                    const isCurrent = fatCategoryInfo?.activeIndex === idx;
                    return (
                      <div
                        key={level.label}
                        className={`py-2 px-1 rounded-xl text-center text-[10px] font-bold transition-all ${level.bg} ${
                          isCurrent
                            ? 'ring-2 ring-slate-900 shadow-md font-black scale-102'
                            : 'opacity-60'
                        }`}
                      >
                        {level.label}
                        {isCurrent && <div className="text-[9px] text-slate-900">● Atual</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Grid 2: Tabela de Medidas Corporais (Circunferências) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Ruler className="w-4 h-4 text-emerald-600" />
                  3. Tabela de Medidas Corporais (Circunferências em cm)
                </h4>
                <span className="text-[11px] text-slate-400">Preencha as partes medidas</span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-4 w-1/4">Parte Corporal</th>
                      <th className="py-2.5 px-4 w-1/4">Medida em cm</th>
                      <th className="py-2.5 px-4 w-1/6">Data</th>
                      <th className="py-2.5 px-4 w-1/3">Observação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {BODY_PARTS_LIST.map(part => (
                      <tr key={part} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-800">
                          {part}
                        </td>
                        <td className="py-2 px-4">
                          <input
                            type="number"
                            step="0.1"
                            placeholder="cm"
                            value={measures[part]?.cm || ''}
                            onChange={e => handleMeasureChange(part, 'cm', e.target.value)}
                            className="w-28 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="py-2 px-4 text-slate-500 text-[11px]">
                          {formatDate(assessmentDate)}
                        </td>
                        <td className="py-2 px-4">
                          <input
                            type="text"
                            placeholder="Obs..."
                            value={measures[part]?.obs || ''}
                            onChange={e => handleMeasureChange(part, 'obs', e.target.value)}
                            className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Observações Gerais */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Observações Clínicas Gerais / Condutas Antropométricas
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Paciente refere retenção hídrica pré-menstrual; meta de perda de 3kg de gordura no próximo ciclo..."
                value={generalNotes}
                onChange={e => setGeneralNotes(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>

            {/* Botão de Salvar */}
            {!readOnly && (
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black rounded-2xl shadow-md transition-all flex items-center gap-2 cursor-pointer text-xs disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Gravando Avaliação...' : 'Salvar Avaliação Antropométrica'}
                </button>
              </div>
            )}
          </form>
        )}

        {/* ========================================================================= */}
        {/* ABA 2: COMPARATIVO EVOLUTIVO */}
        {/* ========================================================================= */}
        {activeTab === 'evolution' && (
          <div className="space-y-6">
            {evolutionData ? (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-4 sm:p-5 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      Comparativo de Avaliações
                    </span>
                    <h4 className="text-base font-black">
                      Avaliação Anterior ({formatDate(evolutionData.previousDate)}) → Avaliação Atual ({formatDate(evolutionData.currentDate)})
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleNewAssessment}
                    className="px-3.5 py-2 bg-emerald-500 text-slate-950 rounded-xl font-bold text-xs hover:bg-emerald-400 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Nova Avaliação
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {[
                    { label: 'Peso Corporal', data: evolutionData.weight },
                    { label: 'IMC (kg/m²)', data: evolutionData.bmi },
                    { label: '% Gordura Corporal', data: evolutionData.bodyFat },
                    { label: 'Massa de Gordura', data: evolutionData.fatMass },
                    { label: 'Massa Muscular/Magra', data: evolutionData.muscleMass },
                    { label: 'Circunferência da Cintura', data: evolutionData.waist },
                    { label: 'Circunferência Abdominal', data: evolutionData.abdomen },
                    { label: 'Circunferência do Quadril', data: evolutionData.hip },
                    { label: 'RCQ (Cintura/Quadril)', data: evolutionData.whr },
                    { label: 'RCEst (Cintura/Estatura)', data: evolutionData.whtr }
                  ]
                    .filter(item => item.data !== null)
                    .map(item => {
                      const diff = item.data!.diff;
                      const isReduction = diff < 0;
                      const isZero = diff === 0;

                      return (
                        <div key={item.label} className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            {item.label}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-extrabold text-slate-900">
                              {item.data!.prev} {item.data!.unit} → {item.data!.curr} {item.data!.unit}
                            </span>
                            <span
                              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-black ${
                                isZero
                                  ? 'bg-slate-200 text-slate-700'
                                  : isReduction
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {isZero ? (
                                <Minus className="w-3 h-3" />
                              ) : isReduction ? (
                                <TrendingDown className="w-3 h-3" />
                              ) : (
                                <TrendingUp className="w-3 h-3" />
                              )}
                              {diff > 0 ? `+${diff}` : diff} {item.data!.unit}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold">São necessárias ao menos 2 avaliações para exibir o comparativo evolutivo.</p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA 3: HISTÓRICO DE AVALIAÇÕES */}
        {/* ========================================================================= */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">
                Histórico Cronológico de Avaliações ({history.length})
              </h4>
              <button
                type="button"
                onClick={handleNewAssessment}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Avaliação
              </button>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold">Nenhuma avaliação antropométrica registrada ainda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((record, index) => (
                  <div
                    key={record.id}
                    className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-slate-900">
                          {formatDate(record.assessment_date)}
                        </span>
                        {index === 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                            Mais Recente
                          </span>
                        )}
                      </div>
                      {record.professional_name && (
                        <span className="text-xs text-slate-500">
                          Por: {record.professional_name}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
                      {record.weight && (
                        <div>
                          <span className="text-slate-400 text-[10px] block">Peso:</span>
                          <span className="font-bold text-slate-800">{record.weight} kg</span>
                        </div>
                      )}
                      {record.bmi && (
                        <div>
                          <span className="text-slate-400 text-[10px] block">IMC:</span>
                          <span className="font-bold text-slate-800">{record.bmi}</span>
                        </div>
                      )}
                      {record.body_fat_percentage && (
                        <div>
                          <span className="text-slate-400 text-[10px] block">% Gordura:</span>
                          <span className="font-bold text-slate-800">{record.body_fat_percentage}%</span>
                        </div>
                      )}
                      {record.fat_mass_kg && (
                        <div>
                          <span className="text-slate-400 text-[10px] block">Massa Gordura:</span>
                          <span className="font-bold text-slate-800">{record.fat_mass_kg} kg</span>
                        </div>
                      )}
                      {record.muscle_mass_kg && (
                        <div>
                          <span className="text-slate-400 text-[10px] block">Massa Magra:</span>
                          <span className="font-bold text-slate-800">{record.muscle_mass_kg} kg</span>
                        </div>
                      )}
                      {record.waist_circumference && (
                        <div>
                          <span className="text-slate-400 text-[10px] block">Cintura:</span>
                          <span className="font-bold text-slate-800">{record.waist_circumference} cm</span>
                        </div>
                      )}
                    </div>

                    {record.body_measures && record.body_measures.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex flex-wrap gap-1.5">
                        {record.body_measures.map(m => (
                          <span
                            key={m.part}
                            className="inline-block px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-[10px] text-slate-700 font-medium"
                          >
                            {m.part}: <strong>{m.measureCm} cm</strong>
                          </span>
                        ))}
                      </div>
                    )}

                    {record.notes && (
                      <div className="mt-2 text-xs text-slate-600 italic bg-white p-2 rounded-xl border border-slate-200/60">
                        {record.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
