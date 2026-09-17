import React, { useState, useEffect } from 'react';
import {
  X,
  Dumbbell,
  Plus,
  Trash2,
  Save,
  ZoomIn,
  Copy,
  ChevronDown,
  Layers,
  Clock,
  Activity,
  Flame,
  ArrowUp,
  ArrowDown,
  RefreshCw
} from 'lucide-react';
import { Student, Workout, WorkoutExercise, Exercise } from './types';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PersonalExerciseLibraryModal } from './PersonalExerciseLibraryModal';

interface PersonalWorkoutBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  student?: Student | null;
  studentsList?: Student[];
  workoutToEdit?: Workout | null;
}

const TECHNIQUES = [
  'Direta',
  'Drop-set',
  'Rest-pause',
  'Bi-set (Super-série)',
  'Tri-set',
  'GVT (German Volume Training)',
  'Pirâmide Crescente',
  'Pirâmide Decrescente',
  'Ponto Zero (Isometria 2s na contração máxima)',
  'FST-7 (Fascia Stretch Training)',
  'Excêntrica Lenta (3 a 4s)',
  'Cluster Sets'
];

export const PersonalWorkoutBuilder: React.FC<PersonalWorkoutBuilderProps> = ({
  isOpen,
  onClose,
  onSaved,
  student,
  studentsList = [],
  workoutToEdit
}) => {
  const { showToast } = useToast();

  const [selectedStudentId, setSelectedStudentId] = useState(student?.id || '');
  const [title, setTitle] = useState('');
  const [division, setDivision] = useState('A');
  const [structureType, setStructureType] = useState('ABC');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [saving, setSaving] = useState(false);

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (student) {
      setSelectedStudentId(student.id);
    }
    if (workoutToEdit) {
      setSelectedStudentId(workoutToEdit.patient_id);
      setTitle(workoutToEdit.title);
      setDivision(workoutToEdit.division || 'A');
      setStructureType(workoutToEdit.structure_type || 'ABC');
      setNotes(workoutToEdit.notes || '');
      loadWorkoutDetails(workoutToEdit.id);
    } else {
      // Default new workout
      setTitle('Treino de Hipertrofia');
      setDivision('A');
      setExercises([]);
    }
  }, [student, workoutToEdit]);

  const loadWorkoutDetails = async (workoutId: string) => {
    try {
      const res = await ApiClient.get<{ workout: Workout; exercises: WorkoutExercise[] }>(`/v1/personal/workouts/${workoutId}`);
      if (res.exercises) {
        setExercises(res.exercises);
      }
    } catch (err) {
      console.error('Erro ao carregar detalhes do treino:', err);
    }
  };

  const handleSelectExerciseFromLibrary = (exercise: Exercise) => {
    if (replaceIndex !== null && replaceIndex >= 0 && replaceIndex < exercises.length) {
      // Substituir o exercício preservando parâmetros de treino: séries, repetições, carga, descanso, cadência, RPE, RIR, técnica, notas
      const updated = [...exercises];
      const prev = updated[replaceIndex];
      updated[replaceIndex] = {
        ...prev,
        exercise_id: exercise.id,
        name: exercise.name,
        muscle_group: exercise.muscle_group,
        photo_url: exercise.photo_url,
        exercise_default_photo: exercise.photo_url,
        instructions: exercise.instructions
      };
      setExercises(updated);
      setReplaceIndex(null);
      showToast(`Exercício alterado para "${exercise.name}". Séries, repetições e cargas preservadas!`, 'success');
    } else {
      // Adicionar novo exercício ao final do treino
      const newEx: WorkoutExercise = {
        exercise_id: exercise.id,
        order_index: exercises.length + 1,
        name: exercise.name,
        muscle_group: exercise.muscle_group,
        sets: 3,
        reps: '10-12',
        load_kg: 0,
        rest_seconds: 60,
        cadence: '2-0-2',
        rpe: 8,
        rir: 2,
        technique: 'Direta',
        photo_url: exercise.photo_url,
        exercise_default_photo: exercise.photo_url,
        instructions: exercise.instructions
      };
      setExercises([...exercises, newEx]);
    }
    setIsLibraryOpen(false);
  };

  const handleOpenReplace = (index: number) => {
    setReplaceIndex(index);
    setIsLibraryOpen(true);
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const updated = [...exercises];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    updated.forEach((ex, i) => {
      ex.order_index = i + 1;
    });
    setExercises(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index >= exercises.length - 1) return;
    const updated = [...exercises];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    updated.forEach((ex, i) => {
      ex.order_index = i + 1;
    });
    setExercises(updated);
  };

  const handleAddBlankExercise = () => {
    const newEx: WorkoutExercise = {
      order_index: exercises.length + 1,
      name: 'Novo Exercício',
      muscle_group: 'peitoral',
      sets: 3,
      reps: '10-12',
      load_kg: 0,
      rest_seconds: 60,
      cadence: '2-0-2',
      rpe: 8,
      rir: 2,
      technique: 'Direta'
    };
    setExercises([...exercises, newEx]);
  };

  const handleUpdateExercise = (index: number, field: keyof WorkoutExercise, value: any) => {
    const updated = [...exercises];
    updated[index] = { ...updated[index], [field]: value };
    setExercises(updated);
  };

  const handleRemoveExercise = (index: number) => {
    const updated = exercises.filter((_, idx) => idx !== index);
    updated.forEach((ex, i) => {
      ex.order_index = i + 1;
    });
    setExercises(updated);
  };

  // Cálculo de volume semanal em tempo real
  const volumeByMuscle: Record<string, number> = {};
  exercises.forEach((ex) => {
    const group = (ex.muscle_group || 'geral').toLowerCase();
    volumeByMuscle[group] = (volumeByMuscle[group] || 0) + (Number(ex.sets) || 0);
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      showToast('Selecione o aluno do treino', 'error');
      return;
    }
    if (!title.trim()) {
      showToast('Título do treino obrigatório', 'error');
      return;
    }
    if (exercises.length === 0) {
      showToast('Adicione pelo menos 1 exercício ao treino', 'error');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        patient_id: selectedStudentId,
        title: title.trim(),
        division: division.toUpperCase(),
        structure_type: structureType,
        notes,
        exercises
      };

      if (workoutToEdit) {
        await ApiClient.put(`/v1/personal/workouts/${workoutToEdit.id}`, payload);
        showToast('Treino atualizado com sucesso!', 'success');
      } else {
        await ApiClient.post('/v1/personal/workouts', payload);
        showToast('Treino prescrito com sucesso!', 'success');
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error('Erro ao salvar treino:', err);
      showToast('Erro ao salvar prescrição de treino', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {workoutToEdit ? 'Editar Prescrição de Treino' : 'Nova Prescrição de Treino'}
              </h3>
              <p className="text-xs text-slate-500">
                Divisões A-E, métodos avançados, cadência, controle de RPE/RIR e fotos demonstrativas.
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
        <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Identificação e Divisão */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Aluno(a) *</label>
              <select
                disabled={!!student || !!workoutToEdit}
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="">Selecione um aluno...</option>
                {studentsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Título do Treino *</label>
              <input
                type="text"
                required
                placeholder="Ex: Peito, Ombros e Tríceps"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Letra da Divisão *</label>
              <select
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
              >
                <option value="A">Treino A</option>
                <option value="B">Treino B</option>
                <option value="C">Treino C</option>
                <option value="D">Treino D</option>
                <option value="E">Treino E</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Estrutura Global</label>
              <select
                value={structureType}
                onChange={(e) => setStructureType(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="ABC">ABC (3 dias)</option>
                <option value="ABCD">ABCD (4 dias)</option>
                <option value="ABCDE">ABCDE (5 dias)</option>
                <option value="Upper/Lower">Upper / Lower (Superiores/Inferiores)</option>
                <option value="Push/Pull/Legs">Push / Pull / Legs</option>
                <option value="Fullbody">Full Body (Corpo Inteiro)</option>
              </select>
            </div>
          </div>

          {/* Banner de Volume Semanal em Tempo Real */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-800">Volume Total da Sessão:</span>
              <span className="text-xs text-slate-500">
                {exercises.reduce((acc, curr) => acc + (Number(curr.sets) || 0), 0)} séries no total
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {Object.entries(volumeByMuscle).map(([muscle, sets]) => (
                <span
                  key={muscle}
                  className="text-[11px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md capitalize"
                >
                  {muscle}: {sets} séries
                </span>
              ))}
            </div>
          </div>

          {/* Lista de Exercícios Prescritos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Exercícios & Parâmetros ({exercises.length})
              </h4>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsLibraryOpen(true)}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Biblioteca com Fotos
                </button>
                <button
                  type="button"
                  onClick={handleAddBlankExercise}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Exercício Livre
                </button>
              </div>
            </div>

            {exercises.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center gap-2">
                <Dumbbell className="w-8 h-8 text-slate-300" />
                <span>Nenhum exercício adicionado a este treino ainda.</span>
                <button
                  type="button"
                  onClick={() => setIsLibraryOpen(true)}
                  className="mt-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-sm"
                >
                  Abrir Catálogo de Exercícios
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {exercises.map((ex, index) => (
                  <div
                    key={index}
                    className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-emerald-200 shadow-sm transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1">
                        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">
                          {index + 1}
                        </span>

                        {/* Foto Thumbnail com Zoom */}
                        <div
                          onClick={() => ex.photo_url && setZoomedPhoto(ex.photo_url)}
                          className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          {ex.photo_url ? (
                            <img src={ex.photo_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Dumbbell className="w-4 h-4 text-slate-300" />
                          )}
                        </div>

                        <div className="flex-1 min-w-[200px]">
                          <input
                            type="text"
                            value={ex.name}
                            onChange={(e) => handleUpdateExercise(index, 'name', e.target.value)}
                            placeholder="Nome do exercício"
                            className="w-full font-bold text-xs text-slate-800 bg-transparent border-b border-transparent focus:border-emerald-500 outline-none"
                          />
                          <span className="text-[10px] uppercase font-bold text-slate-400">
                            {ex.muscle_group}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Botões de Reordenação ▲ / ▼ */}
                        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveUp(index)}
                            title="Mover para cima"
                            className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={index === exercises.length - 1}
                            onClick={() => handleMoveDown(index)}
                            title="Mover para baixo"
                            className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Botão de Substituição Preservando Parâmetros */}
                        <button
                          type="button"
                          onClick={() => handleOpenReplace(index)}
                          title="Substituir exercício mantendo séries, repetições, carga e anotações"
                          className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3 text-slate-500" />
                          <span>Substituir</span>
                        </button>

                        {/* Seletor de Técnica Avançada */}
                        <select
                          value={ex.technique || 'Direta'}
                          onChange={(e) => handleUpdateExercise(index, 'technique', e.target.value)}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg outline-none"
                        >
                          {TECHNIQUES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(index)}
                          title="Remover exercício do treino"
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Parâmetros do Exercício: Séries, Repetições, Carga, Cadência, Descanso, RPE */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 pt-2 border-t border-slate-100">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Séries</label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={ex.sets}
                          onChange={(e) => handleUpdateExercise(index, 'sets', Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none text-center font-bold text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Repetições</label>
                        <input
                          type="text"
                          value={ex.reps}
                          onChange={(e) => handleUpdateExercise(index, 'reps', e.target.value)}
                          placeholder="Ex: 10-12"
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none text-center font-bold text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Carga Alvo (kg)</label>
                        <input
                          type="number"
                          step="0.5"
                          value={ex.load_kg || ''}
                          onChange={(e) => handleUpdateExercise(index, 'load_kg', Number(e.target.value))}
                          placeholder="kg"
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none text-center font-bold text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Descanso (s)</label>
                        <input
                          type="number"
                          step="5"
                          value={ex.rest_seconds}
                          onChange={(e) => handleUpdateExercise(index, 'rest_seconds', Number(e.target.value))}
                          placeholder="60"
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none text-center font-medium text-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Cadência</label>
                        <input
                          type="text"
                          value={ex.cadence || ''}
                          onChange={(e) => handleUpdateExercise(index, 'cadence', e.target.value)}
                          placeholder="2-0-2"
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none text-center text-slate-700"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">RPE Alvo / RIR</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="5"
                            max="10"
                            step="0.5"
                            value={ex.rpe || ''}
                            onChange={(e) => handleUpdateExercise(index, 'rpe', Number(e.target.value))}
                            placeholder="RPE 8"
                            className="w-1/2 px-1.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none text-center text-slate-800"
                          />
                          <input
                            type="number"
                            min="0"
                            max="5"
                            value={ex.rir || ''}
                            onChange={(e) => handleUpdateExercise(index, 'rir', Number(e.target.value))}
                            placeholder="RIR 2"
                            className="w-1/2 px-1.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none text-center text-slate-800"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Observações da técnica do exercício */}
                    <div className="pt-1">
                      <input
                        type="text"
                        value={ex.notes || ''}
                        onChange={(e) => handleUpdateExercise(index, 'notes', e.target.value)}
                        placeholder="Orientações posturais ou biomecânicas específicas para este exercício..."
                        className="w-full text-[11px] text-slate-600 bg-slate-50/70 px-3 py-1.5 rounded-lg border border-slate-100 outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observações Gerais do Treino */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Instruções Gerais da Rotina</label>
            <textarea
              rows={2}
              placeholder="Ex: Aquecer 5 min na esteira leve. Priorizar cadência excêntrica nas primeiras duas séries de trabalho..."
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
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl flex items-center gap-2 shadow-sm transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando Treino...' : 'Salvar Prescrição de Treino'}
            </button>
          </div>
        </form>

        {/* Modal Seletor de Exercício com Foto */}
        <PersonalExerciseLibraryModal
          isOpen={isLibraryOpen}
          onClose={() => {
            setIsLibraryOpen(false);
            setReplaceIndex(null);
          }}
          isPickerMode={true}
          onSelectExercise={handleSelectExerciseFromLibrary}
        />

        {/* Zoom de Foto */}
        {zoomedPhoto && (
          <div
            onClick={() => setZoomedPhoto(null)}
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn cursor-pointer"
          >
            <div className="max-w-md w-full bg-white rounded-2xl overflow-hidden p-2 shadow-2xl">
              <img src={zoomedPhoto} alt="" className="w-full h-auto rounded-xl object-contain" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
