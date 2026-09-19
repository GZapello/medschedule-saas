import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Check,
  Trophy,
  Dumbbell,
  Clock,
  Activity,
  CheckCircle2,
  ChevronRight,
  Flame
} from 'lucide-react';
import { Workout, WorkoutExercise } from './types';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SecureFileImage } from '../common/SecureFileImage';

interface PersonalWorkoutExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFinished: () => void;
  workout: Workout;
  studentName?: string;
}

export const PersonalWorkoutExecutionModal: React.FC<PersonalWorkoutExecutionModalProps> = ({
  isOpen,
  onClose,
  onFinished,
  workout,
  studentName
}) => {
  const { showToast } = useToast();

  const [exercises, setExercises] = useState<any[]>([]);
  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({});
  const [exerciseLoads, setExerciseLoads] = useState<Record<string, number>>({});

  // Cronômetro de Descanso
  const [restSeconds, setRestSeconds] = useState(60);
  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);

  // Duração geral do treino
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [rpe, setRpe] = useState<number>(8);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  // PR Celebration Modal/Banner
  const [achievedPRs, setAchievedPRs] = useState<any[]>([]);

  useEffect(() => {
    if (workout && workout.exercises) {
      setExercises(workout.exercises);
      const initialLoads: Record<string, number> = {};
      workout.exercises.forEach((ex, idx) => {
        initialLoads[`${idx}`] = ex.load_kg || 0;
      });
      setExerciseLoads(initialLoads);
    }
  }, [workout]);

  // Timer interval
  useEffect(() => {
    let interval: any = null;
    if (timerActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && timerActive) {
      setTimerActive(false);
      try {
        // Toca bip sonoro discreto do navegador
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      } catch {}
    }
    return () => clearInterval(interval);
  }, [timerActive, timeLeft]);

  const startRestTimer = (seconds: number) => {
    setRestSeconds(seconds);
    setTimeLeft(seconds);
    setTimerActive(true);
  };

  const toggleSet = (exIndex: number, setIndex: number, restSec: number) => {
    const key = `${exIndex}-${setIndex}`;
    const next = !completedSets[key];
    setCompletedSets((prev) => ({ ...prev, [key]: next }));

    // Se marcou como concluído, dispara o cronômetro de descanso automaticamente
    if (next) {
      startRestTimer(restSec || 60);
    }
  };

  const handleFinishWorkout = async () => {
    try {
      setSaving(true);
      const performed = exercises.map((ex, idx) => ({
        name: ex.name,
        muscle_group: ex.muscle_group,
        load_kg: Number(exerciseLoads[`${idx}`]) || Number(ex.load_kg) || 0,
        reps: ex.reps,
        sets_total: ex.sets
      }));

      const res = await ApiClient.post<{ id: string; newPRs: any[]; message: string }>('/v1/personal/logs', {
        workout_id: workout.id,
        patient_id: workout.patient_id,
        completed_at: new Date().toISOString(),
        duration_minutes: durationMinutes,
        rpe,
        feedback_notes: feedback,
        exercises_performed: performed
      });

      if (res.newPRs && res.newPRs.length > 0) {
        setAchievedPRs(res.newPRs);
      } else {
        showToast('Treino concluído e registrado!', 'success');
        onFinished();
        onClose();
      }
    } catch (err) {
      console.error('Erro ao finalizar treino:', err);
      showToast('Erro ao salvar registro de execução', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/75 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-black text-sm shadow-md">
              {workout.division || 'A'}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{workout.title}</span>
              </h3>
              <p className="text-xs text-slate-300">
                Aluno(a): <strong>{studentName || workout.patient_name}</strong> • Modo Execução Dinâmica
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BARRA DO CRONÔMETRO DE DESCANSO INTERATIVO */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-4 text-white flex items-center justify-between flex-wrap gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-mono text-lg font-bold text-amber-300">
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </div>
            <div>
              <span className="text-xs text-slate-300 block font-medium">Cronômetro de Recuperação</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <button
                  onClick={() => setTimerActive(!timerActive)}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  {timerActive ? <Pause className="w-3 h-3 text-amber-300" /> : <Play className="w-3 h-3 text-emerald-300" />}
                  {timerActive ? 'Pausar' : 'Iniciar'}
                </button>
                <button
                  onClick={() => {
                    setTimeLeft(restSeconds);
                    setTimerActive(false);
                  }}
                  className="p-1 bg-white/10 hover:bg-white/20 text-slate-300 rounded-lg text-xs"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {[30, 45, 60, 90, 120].map((s) => (
              <button
                key={s}
                onClick={() => startRestTimer(s)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
                  restSeconds === s ? 'bg-amber-400 text-slate-950' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Exercícios com Checkboxes por Série */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {exercises.map((ex, exIdx) => (
            <div
              key={exIdx}
              className="p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:border-emerald-300 transition-all space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-black text-slate-400">#{exIdx + 1}</span>
                  {(ex.exercise_file_id || ex.photo_url) && (
                    <div className="w-10 h-10 rounded-xl bg-slate-200 border border-slate-300 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      <SecureFileImage
                        fileId={ex.exercise_file_id}
                        fallbackUrl={ex.photo_url}
                        alt=""
                        className="w-full h-full object-cover"
                        placeholderText=""
                      />
                    </div>
                  )}
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">{ex.name}</h4>
                    <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      {ex.muscle_group} • {ex.technique || 'Direta'}
                    </span>
                  </div>
                </div>

                {/* Input de Carga Realizada */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 font-medium">Carga:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={exerciseLoads[`${exIdx}`] ?? ex.load_kg ?? 0}
                    onChange={(e) =>
                      setExerciseLoads({
                        ...exerciseLoads,
                        [`${exIdx}`]: Number(e.target.value)
                      })
                    }
                    className="w-16 px-2 py-1 text-xs font-bold text-center bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-slate-600">kg</span>
                </div>
              </div>

              {/* Bolinhas / Caixas de Séries */}
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs text-slate-500 font-semibold">
                  Alvo: {ex.sets} séries × {ex.reps} reps
                </span>

                <div className="flex items-center gap-2">
                  {Array.from({ length: ex.sets }).map((_, sIdx) => {
                    const isChecked = !!completedSets[`${exIdx}-${sIdx}`];
                    return (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => toggleSet(exIdx, sIdx, ex.rest_seconds || 60)}
                        className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center transition-all ${
                          isChecked
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 scale-105'
                            : 'bg-white border border-slate-300 text-slate-600 hover:border-emerald-500'
                        }`}
                      >
                        {isChecked ? <Check className="w-4 h-4 stroke-[3]" /> : sIdx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Feedback Final da Sessão */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 mt-6">
            <h5 className="text-xs font-bold uppercase text-slate-700">Finalização do Treino</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Duração Total (minutos)</label>
                <input
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Percepção de Esforço (RPE 1-10)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={rpe}
                  onChange={(e) => setRpe(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-purple-700"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Feedback do Aluno / Observações</label>
                <input
                  type="text"
                  placeholder="Ex: Excelente rendimento, progrediu carga no supino e sem dor no ombro..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="text-xs text-slate-500">
            {Object.values(completedSets).filter(Boolean).length} séries concluídas
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleFinishWorkout}
              disabled={saving}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              {saving ? 'Concluindo...' : 'Finalizar e Registrar Treino'}
            </button>
          </div>
        </div>

        {/* MODAL DE CELEBRAÇÃO DE RECORDES PESSOAIS (PRs) */}
        {achievedPRs.length > 0 && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center space-y-5 shadow-2xl border border-amber-200">
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Trophy className="w-8 h-8 animate-bounce" />
              </div>

              <div>
                <h3 className="text-xl font-black text-slate-800">🎉 Novo Recorde Pessoal Alcançado!</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Parabéns! O aluno superou sua carga máxima histórica nesta sessão de treino.
                </p>
              </div>

              <div className="space-y-2">
                {achievedPRs.map((pr, idx) => (
                  <div key={idx} className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800">{pr.exercise_name}</span>
                    <div className="text-xs font-black text-amber-800">
                      {pr.previous_max ? `${pr.previous_max}kg ➔ ` : ''}
                      <span className="text-emerald-700 text-sm">{pr.new_pr} kg</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  setAchievedPRs([]);
                  showToast('Treino e novos recordes registrados!', 'success');
                  onFinished();
                  onClose();
                }}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-colors"
              >
                Continuar e Salvar Histórico
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
