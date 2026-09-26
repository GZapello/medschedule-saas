import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Check,
  CheckCircle2,
  Clock,
  Dumbbell,
  Flame,
  Trophy,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  HelpCircle,
  MessageSquare,
  Sparkles,
  ArrowRight,
  Maximize2,
  X,
  Volume2
} from 'lucide-react';
import { ApiClient } from '../../api/client';

interface PublicExercise {
  id: string;
  order_index: number;
  name: string;
  muscle_group: string;
  sets: number;
  reps: string;
  load_kg?: number;
  rest_seconds?: number;
  cadence?: string;
  tempo?: string;
  technique?: string;
  technique_custom?: string;
  notes?: string;
  photo_url?: string;
}

interface PublicWorkout {
  id: string;
  title: string;
  division: string;
  structure_type?: string;
  notes?: string;
  updated_at?: string;
  exercises: PublicExercise[];
}

interface SessionSummary {
  completed_at: string;
  duration_minutes: number;
  exercises_count: number;
  completed_exercises_count: number;
  rpe?: number;
  feedback_notes?: string;
}

interface PersonalPublicStudentWorkoutViewProps {
  token: string;
}

export const PersonalPublicStudentWorkoutView: React.FC<PersonalPublicStudentWorkoutViewProps> = ({ token }) => {
  // Estado geral
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<'REVOKED' | 'EXPIRED' | 'NOT_FOUND' | 'ERROR' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [studentName, setStudentName] = useState('');
  const [clinicName, setClinicName] = useState('ZemdaPersonal');
  const [workouts, setWorkouts] = useState<PublicWorkout[]>([]);
  const [selectedWorkoutIndex, setSelectedWorkoutIndex] = useState(0);

  // Sessão em andamento
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [sessionWorkout, setSessionWorkout] = useState<PublicWorkout | null>(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);

  // Registro de execução
  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({});
  const [actualLoads, setActualLoads] = useState<Record<string, number>>({});
  const [actualReps, setActualReps] = useState<Record<string, string>>({});
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});
  const [exerciseRpe, setExerciseRpe] = useState<Record<string, number>>({});

  // Cronômetro do Treino Global
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Temporizador de Descanso
  const [restTimerActive, setRestTimerActive] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(60);
  const [restTotalSeconds, setRestTotalSeconds] = useState(60);

  // Modal de finalização
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [overallRpe, setOverallRpe] = useState<number>(8);
  const [overallFeedback, setOverallFeedback] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);
  const [sessionCompletedSummary, setSessionCompletedSummary] = useState<SessionSummary | null>(null);
  const [newPRsList, setNewPRsList] = useState<any[]>([]);

  // Zoom de imagem
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Carrega dados iniciais do link
  const loadWorkoutData = async () => {
    try {
      setLoading(true);
      setErrorStatus(null);
      const res = await ApiClient.get<any>(`/v1/public/personal/workouts/${encodeURIComponent(token)}`);
      setStudentName(res.student?.name || 'Aluno');
      setClinicName(res.clinicName || 'ZemdaPersonal');
      setWorkouts(res.workouts || []);

      // Se houver sessão em andamento já iniciada, restaura o estado
      if (res.activeSession) {
        const act = res.activeSession;
        setSessionId(act.id);
        setSessionStartedAt(act.started_at);
        if (act.snapshot?.workout && act.snapshot?.exercises) {
          setSessionWorkout({
            ...act.snapshot.workout,
            exercises: act.snapshot.exercises
          });
        }
        if (act.progress) {
          if (act.progress.completedSets) setCompletedSets(act.progress.completedSets);
          if (act.progress.actualLoads) setActualLoads(act.progress.actualLoads);
          if (act.progress.actualReps) setActualReps(act.progress.actualReps);
          if (act.progress.exerciseNotes) setExerciseNotes(act.progress.exerciseNotes);
          if (act.progress.exerciseRpe) setExerciseRpe(act.progress.exerciseRpe);
          if (typeof act.progress.currentExerciseIndex === 'number') {
            setCurrentExerciseIndex(act.progress.currentExerciseIndex);
          }
        }
      }
    } catch (err: any) {
      const code = err.response?.data?.code;
      const msg = err.response?.data?.error || 'Erro ao carregar treinos prescritos';
      if (code === 'EXPIRED') {
        setErrorStatus('EXPIRED');
      } else if (code === 'REVOKED') {
        setErrorStatus('REVOKED');
      } else if (err.response?.status === 404) {
        setErrorStatus('NOT_FOUND');
      } else {
        setErrorStatus('ERROR');
      }
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkoutData();
  }, [token]);

  // Cronômetro global do treino
  useEffect(() => {
    if (!sessionId || !sessionStartedAt) return;
    const startMs = new Date(sessionStartedAt).getTime();

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - startMs) / 1000));
      setElapsedSeconds(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionId, sessionStartedAt]);

  // Temporizador de descanso regressivo
  useEffect(() => {
    let timer: any = null;
    if (restTimerActive && restTimeLeft > 0) {
      timer = setInterval(() => {
        setRestTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (restTimerActive && restTimeLeft === 0) {
      setRestTimerActive(false);
      // Alerta sonoro / vibração
      try {
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      } catch {}
    }
    return () => clearInterval(timer);
  }, [restTimerActive, restTimeLeft]);

  // Autosave do progresso a cada alteração
  const saveProgressDebounced = useRef<any>(null);
  const triggerSaveProgress = (updatedState: any) => {
    if (!sessionId) return;
    if (saveProgressDebounced.current) clearTimeout(saveProgressDebounced.current);
    saveProgressDebounced.current = setTimeout(async () => {
      try {
        await ApiClient.post(`/v1/public/personal/workouts/${token}/sessions/${sessionId}/progress`, {
          progress_state: updatedState
        });
      } catch (err) {
        // Falhas silenciosas de autosave não devem travar o treino offline
      }
    }, 800);
  };

  const handleStartWorkout = async (workout: PublicWorkout) => {
    try {
      setLoading(true);
      const res = await ApiClient.post<any>(`/v1/public/personal/workouts/${token}/sessions/start`, {
        workout_id: workout.id
      });
      setSessionId(res.sessionId);
      setSessionStartedAt(res.started_at);
      setSessionWorkout(workout);
      setCurrentExerciseIndex(0);

      // Preenche valores iniciais de cargas e repetições sugeridas
      const initLoads: Record<string, number> = {};
      const initReps: Record<string, string> = {};
      workout.exercises.forEach((ex, exIdx) => {
        for (let s = 0; s < ex.sets; s++) {
          const key = `${exIdx}-${s}`;
          if (ex.load_kg) initLoads[key] = ex.load_kg;
          initReps[key] = ex.reps || '10';
        }
      });
      setActualLoads(initLoads);
      setActualReps(initReps);
      setCompletedSets({});
      setExerciseNotes({});
      setExerciseRpe({});
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao iniciar treino');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSet = (exIdx: number, setIdx: number, restSeconds: number) => {
    const key = `${exIdx}-${setIdx}`;
    const nextVal = !completedSets[key];
    const newSets = { ...completedSets, [key]: nextVal };
    setCompletedSets(newSets);

    // Se marcou como concluído, dispara o temporizador de descanso
    if (nextVal) {
      const rest = restSeconds || 60;
      setRestTotalSeconds(rest);
      setRestTimeLeft(rest);
      setRestTimerActive(true);
    }

    triggerSaveProgress({
      completedSets: newSets,
      actualLoads,
      actualReps,
      exerciseNotes,
      exerciseRpe,
      currentExerciseIndex: exIdx
    });
  };

  const handleUpdateLoad = (exIdx: number, setIdx: number, val: number) => {
    const key = `${exIdx}-${setIdx}`;
    const newLoads = { ...actualLoads, [key]: val };
    setActualLoads(newLoads);
    triggerSaveProgress({
      completedSets,
      actualLoads: newLoads,
      actualReps,
      exerciseNotes,
      exerciseRpe,
      currentExerciseIndex: exIdx
    });
  };

  const handleUpdateReps = (exIdx: number, setIdx: number, val: string) => {
    const key = `${exIdx}-${setIdx}`;
    const newReps = { ...actualReps, [key]: val };
    setActualReps(newReps);
    triggerSaveProgress({
      completedSets,
      actualLoads,
      actualReps: newReps,
      exerciseNotes,
      exerciseRpe,
      currentExerciseIndex: exIdx
    });
  };

  const handleUpdateExerciseNote = (exIdx: number, note: string) => {
    const newNotes = { ...exerciseNotes, [`${exIdx}`]: note };
    setExerciseNotes(newNotes);
    triggerSaveProgress({
      completedSets,
      actualLoads,
      actualReps,
      exerciseNotes: newNotes,
      exerciseRpe,
      currentExerciseIndex: exIdx
    });
  };

  const handleUpdateExerciseRpe = (exIdx: number, rpe: number) => {
    const newRpe = { ...exerciseRpe, [`${exIdx}`]: rpe };
    setExerciseRpe(newRpe);
    triggerSaveProgress({
      completedSets,
      actualLoads,
      actualReps,
      exerciseNotes,
      exerciseRpe: newRpe,
      currentExerciseIndex: exIdx
    });
  };

  const handleFinishWorkout = async () => {
    if (!sessionId || !sessionWorkout) return;
    try {
      setIsFinishing(true);

      const exercisesPerformed = sessionWorkout.exercises.map((ex, exIdx) => {
        let setsCompletedCount = 0;
        const setsData: any[] = [];
        let maxLoadThisEx = 0;

        for (let s = 0; s < ex.sets; s++) {
          const key = `${exIdx}-${s}`;
          const isDone = !!completedSets[key];
          if (isDone) setsCompletedCount++;
          const loadVal = Number(actualLoads[key]) || Number(ex.load_kg) || 0;
          if (loadVal > maxLoadThisEx) maxLoadThisEx = loadVal;

          setsData.push({
            set: s + 1,
            completed: isDone,
            load_kg: loadVal,
            reps: actualReps[key] || ex.reps
          });
        }

        return {
          name: ex.name,
          muscle_group: ex.muscle_group,
          load_kg: maxLoadThisEx,
          reps: ex.reps,
          sets_total: ex.sets,
          sets_completed: setsCompletedCount,
          sets_data: setsData,
          notes: exerciseNotes[`${exIdx}`] || null,
          rpe: exerciseRpe[`${exIdx}`] || null,
          skipped: setsCompletedCount === 0
        };
      });

      const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

      const res = await ApiClient.post<any>(
        `/v1/public/personal/workouts/${token}/sessions/${sessionId}/finish`,
        {
          duration_minutes: durationMinutes,
          rpe: overallRpe,
          feedback_notes: overallFeedback,
          exercises_performed: exercisesPerformed
        }
      );

      setSessionCompletedSummary(res.summary);
      setNewPRsList(res.newPRs || []);
      setShowFinishModal(false);
      setSessionId(null);
      setSessionWorkout(null);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao finalizar treino');
    } finally {
      setIsFinishing(false);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ==========================================
  // TELAS DE ERRO / EXPIRAÇÃO / REVOGAÇÃO
  // ==========================================
  if (errorStatus) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 selection:bg-teal-500 selection:text-white">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-3xl bg-slate-800/80 border border-slate-700 mx-auto flex items-center justify-center shadow-inner">
            {errorStatus === 'EXPIRED' ? (
              <Clock className="w-8 h-8 text-amber-400" />
            ) : errorStatus === 'REVOKED' ? (
              <AlertCircle className="w-8 h-8 text-rose-400" />
            ) : (
              <Dumbbell className="w-8 h-8 text-teal-400" />
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-white">
              {errorStatus === 'EXPIRED'
                ? 'Link Expirado por Inatividade'
                : errorStatus === 'REVOKED'
                ? 'Acesso Revogado'
                : 'Link Inválido'}
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              {errorMessage || 'Não foi possível carregar os treinos com este endereço de acesso.'}
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 text-xs text-slate-400 text-left space-y-1.5">
            <span className="font-bold text-slate-300 block">O que fazer?</span>
            <p>
              Entre em contato diretamente com o seu Personal Trainer para que ele gere um novo link de treino no sistema.
            </p>
          </div>

          <div className="pt-2 text-[11px] text-slate-600 font-medium">
            ZemdaPersonal • Prescrição de Alta Performance
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // LOADING INICIAL
  // ==========================================
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-3 border-teal-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-300">Carregando seus treinos...</p>
        <span className="text-xs text-slate-500 mt-1">ZemdaPersonal</span>
      </div>
    );
  }

  // ==========================================
  // TELA DE CELEBRAÇÃO / RESUMO PÓS-TREINO
  // ==========================================
  if (sessionCompletedSummary) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col items-center justify-center animate-in fade-in">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
          {/* Efeito Glow Superior */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 bg-teal-500/20 blur-2xl rounded-full pointer-events-none" />

          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-slate-950 mx-auto flex items-center justify-center shadow-lg shadow-teal-500/30 scale-105 animate-bounce">
            <Trophy className="w-10 h-10" />
          </div>

          <div className="space-y-1">
            <span className="text-xs uppercase font-extrabold tracking-widest text-teal-400">Treino Concluído!</span>
            <h2 className="text-2xl font-black text-white">Parabéns, {studentName}!</h2>
            <p className="text-xs text-slate-400">
              Sua sessão foi salva e sincronizada automaticamente com o ZemdaPersonal.
            </p>
          </div>

          {/* Destaque de Recordes Pessoais (PRs) */}
          {newPRsList.length > 0 && (
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-4 text-left space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-wider">
                <Flame className="w-4 h-4 fill-amber-400" />
                Novos Recordes Pessoais Superados!
              </div>
              <div className="space-y-1.5">
                {newPRsList.map((pr, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs bg-amber-900/20 p-2 rounded-xl border border-amber-500/20">
                    <span className="font-semibold text-slate-200">{pr.exercise_name}</span>
                    <span className="font-black text-amber-300">
                      {pr.new_pr} kg <span className="text-[10px] text-amber-500/80 font-normal">({pr.previous_max ? `+${pr.new_pr - pr.previous_max}kg` : '1º registro'})</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Métricas da Sessão */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950/70 border border-slate-800/80 p-3.5 rounded-2xl text-left">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Duração Total</span>
              <strong className="text-lg font-black text-teal-400">
                {sessionCompletedSummary.duration_minutes} min
              </strong>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 p-3.5 rounded-2xl text-left">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Exercícios Feitos</span>
              <strong className="text-lg font-black text-emerald-400">
                {sessionCompletedSummary.completed_exercises_count} de {sessionCompletedSummary.exercises_count}
              </strong>
            </div>
          </div>

          {sessionCompletedSummary.feedback_notes && (
            <div className="bg-slate-950/50 border border-slate-800 p-3 rounded-xl text-left text-xs text-slate-400">
              <span className="font-bold text-slate-300 block mb-0.5">Sua Observação:</span>
              "{sessionCompletedSummary.feedback_notes}"
            </div>
          )}

          <button
            onClick={() => {
              setSessionCompletedSummary(null);
              loadWorkoutData();
            }}
            className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black rounded-2xl text-sm transition-all shadow-lg shadow-teal-500/20 cursor-pointer"
          >
            Voltar aos Meus Treinos
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // MODO EM EXECUÇÃO (TREINO INICIADO)
  // ==========================================
  if (sessionId && sessionWorkout) {
    const currentEx = sessionWorkout.exercises[currentExerciseIndex];
    const totalExercises = sessionWorkout.exercises.length;
    const progressPercent = Math.round(((currentExerciseIndex + 1) / totalExercises) * 100);

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-teal-500 selection:text-white">
        {/* Barra Superior Fixa com Cronômetro e Progresso */}
        <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Treino em Andamento
              </span>
              <h2 className="text-xs font-black text-white truncate max-w-[180px]">
                {sessionWorkout.division ? `Divisão ${sessionWorkout.division}: ` : ''}{sessionWorkout.title}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {/* Cronômetro */}
              <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 font-mono text-xs font-black text-teal-300">
                <Clock className="w-3.5 h-3.5 text-teal-400" />
                {formatTimer(elapsedSeconds)}
              </div>

              <button
                onClick={() => setShowFinishModal(true)}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black tracking-wide transition-colors cursor-pointer shadow-sm"
              >
                Finalizar
              </button>
            </div>
          </div>

          {/* Barra de Progresso Horizontal */}
          <div className="max-w-lg mx-auto mt-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1">
              <span>Exercício {currentExerciseIndex + 1} de {totalExercises}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </header>

        {/* Temporizador Flutuante de Descanso (quando ativo) */}
        {restTimerActive && (
          <div className="sticky top-20 z-40 px-4 py-2">
            <div className="max-w-lg mx-auto bg-slate-900 border-2 border-teal-500/70 rounded-2xl p-3 shadow-2xl flex items-center justify-between animate-in slide-in-from-top-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-mono font-black text-sm">
                  {restTimeLeft}s
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Tempo de Descanso</span>
                  <span className="text-xs font-extrabold text-teal-300">Recupere o fôlego</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRestTimeLeft(prev => prev + 15)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[11px] font-bold rounded-lg text-slate-200 transition-colors"
                >
                  +15s
                </button>
                <button
                  onClick={() => setRestTimerActive(false)}
                  className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-[11px] font-extrabold rounded-lg text-slate-950 transition-colors cursor-pointer"
                >
                  Pular
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Conteúdo Principal do Exercício Atual */}
        <main className="flex-1 max-w-lg mx-auto w-full p-4 space-y-4">
          {currentEx && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
              {/* Header do Exercício */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[11px] font-extrabold rounded-lg uppercase">
                      {currentEx.muscle_group || 'Geral'}
                    </span>
                    {currentEx.technique && currentEx.technique !== 'Direta' && (
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold rounded-lg">
                        {currentEx.technique}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-black text-white leading-tight">
                    {currentEx.name}
                  </h3>
                </div>

                {/* Miniatura de Foto / Mídia (se houver) */}
                {currentEx.photo_url && (
                  <button
                    onClick={() => setZoomedImage(currentEx.photo_url || null)}
                    className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden shrink-0 group relative cursor-pointer"
                    title="Ampliar demonstração"
                  >
                    <img src={currentEx.photo_url} alt={currentEx.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Maximize2 className="w-4 h-4" />
                    </div>
                  </button>
                )}
              </div>

              {/* Instruções / Notas do Personal */}
              {currentEx.notes && (
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-xs text-slate-300 flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                  <span>{currentEx.notes}</span>
                </div>
              )}

              {/* Informações Prescritas */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-950/50 border border-slate-800 p-2 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 block uppercase">Séries</span>
                  <strong className="text-sm font-black text-slate-200">{currentEx.sets}</strong>
                </div>
                <div className="bg-slate-950/50 border border-slate-800 p-2 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 block uppercase">Reps Prescritas</span>
                  <strong className="text-sm font-black text-teal-400">{currentEx.reps || '—'}</strong>
                </div>
                <div className="bg-slate-950/50 border border-slate-800 p-2 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 block uppercase">Descanso</span>
                  <strong className="text-sm font-black text-amber-400">{currentEx.rest_seconds || 60}s</strong>
                </div>
              </div>

              {/* Lista de Séries para Registro de Carga / Repetições */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-slate-400 block uppercase tracking-wider">
                  Execução das Séries:
                </label>

                {Array.from({ length: currentEx.sets }).map((_, sIdx) => {
                  const key = `${currentExerciseIndex}-${sIdx}`;
                  const isDone = !!completedSets[key];
                  const currentLoad = actualLoads[key] ?? currentEx.load_kg ?? 0;
                  const currentRepsVal = actualReps[key] ?? currentEx.reps ?? '10';

                  return (
                    <div
                      key={sIdx}
                      className={`flex items-center justify-between p-2.5 rounded-2xl border transition-all ${
                        isDone
                          ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                          : 'bg-slate-950 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs">
                          #{sIdx + 1}
                        </span>
                        <div className="flex items-center gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={currentLoad || ''}
                              onChange={(e) => handleUpdateLoad(currentExerciseIndex, sIdx, Number(e.target.value))}
                              placeholder="0"
                              className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-center font-bold text-xs text-white focus:border-teal-500 focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-400 font-semibold">kg</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={currentRepsVal}
                              onChange={(e) => handleUpdateReps(currentExerciseIndex, sIdx, e.target.value)}
                              placeholder="reps"
                              className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-center font-bold text-xs text-white focus:border-teal-500 focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-400 font-semibold">reps</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleSet(currentExerciseIndex, sIdx, currentEx.rest_seconds || 60)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                          isDone
                            ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {isDone ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : null}
                        {isDone ? 'Feita' : 'Concluir'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Observação rápida do Aluno para este exercício */}
              <div className="pt-2">
                <input
                  type="text"
                  placeholder="Alguma observação deste exercício? (Ex: dor leve, aumento de carga...)"
                  value={exerciseNotes[`${currentExerciseIndex}`] || ''}
                  onChange={(e) => handleUpdateExerciseNote(currentExerciseIndex, e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
          )}

          {/* Navegação entre Exercícios */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              onClick={() => setCurrentExerciseIndex(prev => Math.max(0, prev - 1))}
              disabled={currentExerciseIndex === 0}
              className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 border border-slate-800 text-slate-300 font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>

            {currentExerciseIndex < totalExercises - 1 ? (
              <button
                onClick={() => setCurrentExerciseIndex(prev => Math.min(totalExercises - 1, prev + 1))}
                className="flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-500 text-slate-950 font-black rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-teal-500/20"
              >
                Próximo Exercício
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setShowFinishModal(true)}
                className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                Finalizar Treino
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Prévia do Próximo Exercício */}
          {currentExerciseIndex < totalExercises - 1 && (
            <div className="p-3 bg-slate-900/50 border border-slate-800/60 rounded-2xl flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-500 text-[11px] uppercase">A Seguir:</span>
              <span className="font-bold text-slate-300 truncate max-w-[240px]">
                {sessionWorkout.exercises[currentExerciseIndex + 1]?.name} ({sessionWorkout.exercises[currentExerciseIndex + 1]?.sets}x{sessionWorkout.exercises[currentExerciseIndex + 1]?.reps})
              </span>
            </div>
          )}
        </main>

        {/* Modal de Confirmação de Finalização */}
        {showFinishModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-white text-base">Finalizar Treino</h3>
                </div>
                <button
                  onClick={() => setShowFinishModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Tempo de Treino:</span>
                  <span className="font-bold text-teal-400">{formatTimer(elapsedSeconds)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Séries Concluídas:</span>
                  <span className="font-bold text-slate-300">
                    {Object.values(completedSets).filter(Boolean).length} séries
                  </span>
                </div>
              </div>

              {/* Percepção de Esforço (Escala Borg / RPE) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  Como foi o esforço hoje? (RPE: {overallRpe}/10)
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setOverallRpe(num)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        overallRpe === num
                          ? 'bg-teal-500 text-slate-950 font-black scale-105'
                          : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-500 block text-center">
                  {overallRpe <= 3 ? 'Muito Leve' : overallRpe <= 5 ? 'Moderado' : overallRpe <= 7 ? 'Intenso' : overallRpe <= 9 ? 'Muito Difícil' : 'Exaustão Total'}
                </span>
              </div>

              {/* Feedback Geral */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">Observação Final para o Personal:</label>
                <textarea
                  rows={2}
                  value={overallFeedback}
                  onChange={(e) => setOverallFeedback(e.target.value)}
                  placeholder="Ex: Treino ótimo, supino foi muito bem..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleFinishWorkout}
                  disabled={isFinishing}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition-colors cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isFinishing ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Confirmar e Salvar
                </button>
                <button
                  onClick={() => setShowFinishModal(false)}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Continuar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Zoom de Imagem do Exercício */}
        {zoomedImage && (
          <div
            onClick={() => setZoomedImage(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-pointer animate-in fade-in"
          >
            <div className="relative max-w-lg w-full max-h-[80vh] flex items-center justify-center">
              <img src={zoomedImage} alt="Exercício" className="max-w-full max-h-[80vh] object-contain rounded-2xl" />
              <button
                onClick={() => setZoomedImage(null)}
                className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // TELA INICIAL / VISÃO GERAL DOS TREINOS PRESCRITOS
  // ==========================================
  const currentSelectedWorkout = workouts[selectedWorkoutIndex] || workouts[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-teal-500 selection:text-white pb-12">
      {/* Header Mobile-First */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-4 sticky top-0 z-20">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center shadow-inner">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-black tracking-wider text-teal-400 block">
                {clinicName}
              </span>
              <h1 className="text-sm font-extrabold text-white">Treinos de {studentName}</h1>
            </div>
          </div>

          <div className="text-[11px] font-semibold text-slate-400 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
            {workouts.length} {workouts.length === 1 ? 'Treino' : 'Divisões'}
          </div>
        </div>
      </header>

      {/* Corpo da Página */}
      <main className="max-w-lg mx-auto w-full p-4 space-y-5">
        {workouts.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <Dumbbell className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="font-bold text-slate-300 text-sm">Nenhum treino prescrito no momento</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Seu personal trainer ainda não ativou nenhuma ficha de treino para o seu perfil. Assim que prescrever, ela aparecerá aqui automaticamente.
            </p>
          </div>
        ) : (
          <>
            {/* Seletor de Divisões (Treino A, Treino B, Treino C...) */}
            {workouts.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {workouts.map((w, idx) => (
                  <button
                    key={w.id}
                    onClick={() => setSelectedWorkoutIndex(idx)}
                    className={`px-4 py-2 rounded-2xl text-xs font-black transition-all shrink-0 cursor-pointer ${
                      selectedWorkoutIndex === idx
                        ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20 scale-102'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                    }`}
                  >
                    Treino {w.division || String.fromCharCode(65 + idx)}
                  </button>
                ))}
              </div>
            )}

            {/* Cartão de Detalhes da Divisão Selecionada */}
            {currentSelectedWorkout && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black tracking-widest text-teal-400">
                      Divisão {currentSelectedWorkout.division}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {currentSelectedWorkout.exercises?.length || 0} exercícios
                    </span>
                  </div>
                  <h2 className="text-lg font-black text-white">
                    {currentSelectedWorkout.title}
                  </h2>
                </div>

                {currentSelectedWorkout.notes && (
                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 text-xs text-slate-300 flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    <span>{currentSelectedWorkout.notes}</span>
                  </div>
                )}

                {/* Botão de Ação Primária: INICIAR TREINO */}
                <button
                  onClick={() => handleStartWorkout(currentSelectedWorkout)}
                  className="w-full py-4 bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 font-black rounded-2xl text-base flex items-center justify-center gap-2 shadow-xl shadow-teal-500/25 transition-all active:scale-98 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-slate-950" />
                  INICIAR TREINO
                </button>
              </div>
            )}

            {/* Lista dos Exercícios Prescritos */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                Exercícios Prescritos:
              </h3>

              {currentSelectedWorkout?.exercises?.map((ex, idx) => (
                <div
                  key={ex.id || idx}
                  className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-xs shrink-0">
                      {idx + 1}
                    </span>

                    <div className="space-y-0.5">
                      <h4 className="font-bold text-slate-100 text-xs">
                        {ex.name}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="text-teal-400 font-semibold">{ex.sets} séries x {ex.reps} reps</span>
                        {ex.load_kg ? (
                          <>
                            <span>•</span>
                            <span className="text-amber-400 font-semibold">{ex.load_kg} kg</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="px-2 py-0.5 bg-slate-950 text-slate-400 border border-slate-800 text-[10px] font-semibold rounded-lg block">
                      {ex.muscle_group || 'Geral'}
                    </span>
                    {ex.rest_seconds && (
                      <span className="text-[10px] text-slate-500 font-medium block mt-0.5">
                        {ex.rest_seconds}s descanso
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* Rodapé Seguro */}
      <footer className="text-center text-[11px] text-slate-600 mt-8 space-y-1">
        <p>Acesso exclusivo do aluno • ZemdaPersonal</p>
        <p className="text-[10px] text-slate-700">O link atualiza automaticamente a cada alteração feita pelo seu profissional.</p>
      </footer>
    </div>
  );
};
