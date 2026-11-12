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
  RefreshCw,
  Play,
  FileText
} from 'lucide-react';
import { WorkoutExercise, WorkoutTemplate, WorkoutTemplateDivision, Exercise } from './types';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PersonalExerciseLibraryModal } from './PersonalExerciseLibraryModal';
import { SecureFileImage } from '../common/SecureFileImage';
import { isStretch } from './exercisePresentation';
import { ExerciseImageCredit } from './ExerciseImageCredit';
import { PersonalVideoPlayerModal } from './PersonalVideoPlayerModal';

interface PersonalTemplateBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  templateToEdit?: WorkoutTemplate | null;
  initialTemplate?: {
    title: string;
    structure_type: string;
    description?: string;
    workouts: WorkoutTemplateDivision[];
  } | null;
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

const STRUCTURE_OPTIONS = [
  { value: 'ABC', label: 'ABC (3 divisões)' },
  { value: 'ABCD', label: 'ABCD (4 divisões)' },
  { value: 'ABCDE', label: 'ABCDE (5 divisões)' },
  { value: 'Upper/Lower', label: 'Upper / Lower (Superior/Inferior)' },
  { value: 'Fullbody', label: 'Full Body (Corpo Inteiro)' },
  { value: 'Custom', label: 'Personalizado' }
];

export const PersonalTemplateBuilder: React.FC<PersonalTemplateBuilderProps> = ({
  isOpen,
  onClose,
  onSaved,
  templateToEdit,
  initialTemplate
}) => {
  const { showToast } = useToast();

  const [title, setTitle] = useState('');
  const [structureType, setStructureType] = useState('ABC');
  const [description, setDescription] = useState('');
  const [divisions, setDivisions] = useState<WorkoutTemplateDivision[]>([
    { title: 'Treino A', division: 'A', notes: '', exercises: [] }
  ]);
  const [activeDivisionIndex, setActiveDivisionIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // Modais de apoio
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [zoomedPhoto, setZoomedPhoto] = useState<{ fileId?: string; url?: string } | null>(null);
  const [playingVideo, setPlayingVideo] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (templateToEdit) {
      setTitle(templateToEdit.title || '');
      setStructureType(templateToEdit.structure_type || 'ABC');
      setDescription(templateToEdit.description || '');
      if (Array.isArray(templateToEdit.workouts) && templateToEdit.workouts.length > 0) {
        setDivisions(
          templateToEdit.workouts.map((w, idx) => ({
            title: w.title || `Treino ${String.fromCharCode(65 + idx)}`,
            division: (w.division || String.fromCharCode(65 + idx)).toUpperCase(),
            notes: w.notes || '',
            exercises: Array.isArray(w.exercises) ? [...w.exercises] : []
          }))
        );
      } else {
        setDivisions([{ title: 'Treino A', division: 'A', notes: '', exercises: [] }]);
      }
      setActiveDivisionIndex(0);
    } else if (initialTemplate) {
      setTitle(initialTemplate.title || '');
      setStructureType(initialTemplate.structure_type || 'ABC');
      setDescription(initialTemplate.description || '');
      if (Array.isArray(initialTemplate.workouts) && initialTemplate.workouts.length > 0) {
        setDivisions(
          initialTemplate.workouts.map((w, idx) => ({
            title: w.title || `Treino ${String.fromCharCode(65 + idx)}`,
            division: (w.division || String.fromCharCode(65 + idx)).toUpperCase(),
            notes: w.notes || '',
            exercises: Array.isArray(w.exercises) ? [...w.exercises] : []
          }))
        );
      } else {
        setDivisions([{ title: 'Treino A', division: 'A', notes: '', exercises: [] }]);
      }
      setActiveDivisionIndex(0);
    } else {
      setTitle('');
      setStructureType('ABC');
      setDescription('');
      setDivisions([
        { title: 'Treino A - Peito e Tríceps', division: 'A', notes: '', exercises: [] },
        { title: 'Treino B - Costas e Bíceps', division: 'B', notes: '', exercises: [] },
        { title: 'Treino C - Pernas e Ombros', division: 'C', notes: '', exercises: [] }
      ]);
      setActiveDivisionIndex(0);
    }
  }, [isOpen, templateToEdit, initialTemplate]);

  if (!isOpen) return null;

  const currentDivision = divisions[activeDivisionIndex] || divisions[0];
  const currentExercises = currentDivision?.exercises || [];

  // Adicionar nova divisão
  const handleAddDivision = () => {
    const nextLetter = String.fromCharCode(65 + (divisions.length % 26));
    const newDivision: WorkoutTemplateDivision = {
      title: `Treino ${nextLetter}`,
      division: nextLetter,
      notes: '',
      exercises: []
    };
    setDivisions([...divisions, newDivision]);
    setActiveDivisionIndex(divisions.length);
  };

  // Remover divisão
  const handleRemoveDivision = (indexToRemove: number) => {
    if (divisions.length <= 1) {
      showToast('O modelo deve conter ao menos 1 divisão de treino', 'info');
      return;
    }
    const updated = divisions.filter((_, idx) => idx !== indexToRemove);
    setDivisions(updated);
    if (activeDivisionIndex >= updated.length) {
      setActiveDivisionIndex(updated.length - 1);
    }
  };

  // Atualizar divisão atual
  const handleUpdateCurrentDivision = (field: keyof WorkoutTemplateDivision, value: any) => {
    const updated = [...divisions];
    updated[activeDivisionIndex] = {
      ...updated[activeDivisionIndex],
      [field]: value
    };
    setDivisions(updated);
  };

  // Exercícios da divisão atual
  const handleSelectExerciseFromLibrary = (exercise: Exercise) => {
    const updatedDivisions = [...divisions];
    const divisionExercises = [...currentExercises];

    if (replaceIndex !== null && replaceIndex >= 0 && replaceIndex < divisionExercises.length) {
      const prev = divisionExercises[replaceIndex];
      divisionExercises[replaceIndex] = {
        ...prev,
        exercise_id: exercise.id,
        name: exercise.name,
        muscle_group: exercise.muscle_group,
        photo_url: exercise.photo_url,
        video_url: exercise.video_url || null,
        exercise_file_id: exercise.exercise_file_id,
        exercise_default_photo: exercise.photo_url,
        category: exercise.category,
        image_attribution_json: exercise.image_attribution_json,
        instructions: exercise.instructions
      };
      setReplaceIndex(null);
    } else {
      const stretch = isStretch(exercise);
      const newEx: WorkoutExercise = {
        exercise_id: exercise.id,
        name: exercise.name,
        muscle_group: exercise.muscle_group,
        sets: 3,
        reps: stretch ? '30s' : '10-12',
        load_kg: undefined,
        rest_seconds: stretch ? 0 : 60,
        cadence: '2-0-2',
        technique: 'Direta',
        notes: '',
        photo_url: exercise.photo_url,
        video_url: exercise.video_url || null,
        exercise_file_id: exercise.exercise_file_id,
        exercise_default_photo: exercise.photo_url,
        category: exercise.category,
        image_attribution_json: exercise.image_attribution_json,
        instructions: exercise.instructions
      };
      divisionExercises.push(newEx);
    }

    updatedDivisions[activeDivisionIndex] = {
      ...updatedDivisions[activeDivisionIndex],
      exercises: divisionExercises
    };
    setDivisions(updatedDivisions);
  };

  const handleUpdateExercise = (index: number, field: keyof WorkoutExercise, value: any) => {
    const updatedDivisions = [...divisions];
    const divisionExercises = [...currentExercises];
    divisionExercises[index] = { ...divisionExercises[index], [field]: value };
    updatedDivisions[activeDivisionIndex] = {
      ...updatedDivisions[activeDivisionIndex],
      exercises: divisionExercises
    };
    setDivisions(updatedDivisions);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updatedDivisions = [...divisions];
    const divisionExercises = [...currentExercises];
    const temp = divisionExercises[index];
    divisionExercises[index] = divisionExercises[index - 1];
    divisionExercises[index - 1] = temp;
    updatedDivisions[activeDivisionIndex] = {
      ...updatedDivisions[activeDivisionIndex],
      exercises: divisionExercises
    };
    setDivisions(updatedDivisions);
  };

  const handleMoveDown = (index: number) => {
    if (index === currentExercises.length - 1) return;
    const updatedDivisions = [...divisions];
    const divisionExercises = [...currentExercises];
    const temp = divisionExercises[index];
    divisionExercises[index] = divisionExercises[index + 1];
    divisionExercises[index + 1] = temp;
    updatedDivisions[activeDivisionIndex] = {
      ...updatedDivisions[activeDivisionIndex],
      exercises: divisionExercises
    };
    setDivisions(updatedDivisions);
  };

  const handleDuplicateExercise = (index: number) => {
    const updatedDivisions = [...divisions];
    const divisionExercises = [...currentExercises];
    const copy = { ...divisionExercises[index] };
    divisionExercises.splice(index + 1, 0, copy);
    updatedDivisions[activeDivisionIndex] = {
      ...updatedDivisions[activeDivisionIndex],
      exercises: divisionExercises
    };
    setDivisions(updatedDivisions);
    showToast('Exercício duplicado na divisão', 'info');
  };

  const handleRemoveExercise = (index: number) => {
    const updatedDivisions = [...divisions];
    const divisionExercises = currentExercises.filter((_, idx) => idx !== index);
    updatedDivisions[activeDivisionIndex] = {
      ...updatedDivisions[activeDivisionIndex],
      exercises: divisionExercises
    };
    setDivisions(updatedDivisions);
  };

  // Salvar modelo de treino
  const handleSave = async () => {
    if (!title.trim()) {
      showToast('Por favor, informe o nome do modelo de treino', 'info');
      return;
    }

    const totalExercises = divisions.reduce((acc, d) => acc + (d.exercises?.length || 0), 0);
    if (totalExercises === 0) {
      showToast('Adicione ao menos um exercício no modelo de treino', 'info');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        structure_type: structureType,
        description: description.trim() || undefined,
        workouts: divisions
      };

      if (templateToEdit?.id) {
        await ApiClient.put(`/v1/personal/templates/${templateToEdit.id}`, payload);
        showToast('Modelo de treino atualizado com sucesso!', 'success');
      } else {
        await ApiClient.post('/v1/personal/templates', payload);
        showToast('Modelo de treino criado com sucesso!', 'success');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar modelo:', err);
      showToast(err.message || 'Erro ao salvar modelo de treino', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalExercisesCount = divisions.reduce((acc, d) => acc + (d.exercises?.length || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl h-[94vh] flex flex-col overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>{templateToEdit ? 'Editar Modelo de Treino' : 'Criar Modelo de Treino'}</span>
                <span className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Biblioteca do Personal
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure as divisões e exercícios. Você poderá aplicar este modelo a qualquer aluno a qualquer momento.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Informações Gerais do Modelo */}
          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-500" />
              <span>Identificação do Modelo</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Modelo <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Hipertrofia ABC - Foco Superior, Push/Pull/Legs Avançado..."
                  className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Estrutura
                </label>
                <select
                  value={structureType}
                  onChange={(e) => setStructureType(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                >
                  {STRUCTURE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Descrição ou Objetivo do Modelo (opcional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Treino voltado para alunos intermediários em fase de ganho de massa, 3 a 5 dias por semana..."
                rows={2}
                className="w-full text-xs px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Abas das Divisões de Treino */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                {divisions.map((div, idx) => {
                  const isActive = idx === activeDivisionIndex;
                  const count = div.exercises?.length || 0;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveDivisionIndex(idx)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span>{div.title || `Treino ${div.division || String.fromCharCode(65 + idx)}`}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          isActive
                            ? 'bg-emerald-700 text-emerald-100'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={handleAddDivision}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Adicionar nova divisão"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nova Divisão</span>
                </button>
              </div>

              {divisions.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveDivision(activeDivisionIndex)}
                  className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  title="Remover esta divisão"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir Divisão</span>
                </button>
              )}
            </div>

            {/* Configuração da Divisão Atual */}
            <div className="bg-slate-50/70 dark:bg-slate-800/30 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Letra / Identificador
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    value={currentDivision.division}
                    onChange={(e) => handleUpdateCurrentDivision('division', e.target.value.toUpperCase())}
                    className="w-full text-xs font-bold text-center px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 uppercase"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Nome da Divisão
                  </label>
                  <input
                    type="text"
                    value={currentDivision.title}
                    onChange={(e) => handleUpdateCurrentDivision('title', e.target.value)}
                    placeholder="Ex: Treino A - Peitoral, Tríceps e Abdômen"
                    className="w-full text-xs font-semibold px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Observações ou Orientações da Divisão
                </label>
                <input
                  type="text"
                  value={currentDivision.notes || ''}
                  onChange={(e) => handleUpdateCurrentDivision('notes', e.target.value)}
                  placeholder="Ex: Aquecimento prévio com manguito e mobilidade articular..."
                  className="w-full text-xs px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Lista de Exercícios da Divisão Atual */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-emerald-500" />
                  <span>
                    Exercícios da Divisão ({currentExercises.length})
                  </span>
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setReplaceIndex(null);
                    setIsLibraryOpen(true);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all hover:scale-[1.02] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar Exercício</span>
                </button>
              </div>

              {currentExercises.length === 0 ? (
                <div className="text-center py-10 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                  <Dumbbell className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Nenhum exercício adicionado a esta divisão ainda.
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 mb-4">
                    Selecione exercícios da biblioteca de musculação, alongamento ou funcional.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceIndex(null);
                      setIsLibraryOpen(true);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl inline-flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Abrir Biblioteca de Exercícios</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentExercises.map((ex, index) => {
                    const stretch = isStretch(ex);
                    return (
                      <div
                        key={index}
                        className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600 shadow-xs transition-all space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center shrink-0">
                              {index + 1}
                            </span>

                            {/* Foto Thumbnail */}
                            <div
                              onClick={() =>
                                (ex.exercise_file_id || ex.photo_url || ex.exercise_default_photo) &&
                                setZoomedPhoto({
                                  fileId: ex.exercise_file_id,
                                  url: ex.photo_url || ex.exercise_default_photo
                                })
                              }
                              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                            >
                              <SecureFileImage
                                fileId={ex.exercise_file_id}
                                fallbackUrl={ex.photo_url || ex.exercise_default_photo}
                                alt=""
                                className="w-full h-full object-cover"
                                placeholderText=""
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={ex.name}
                                onChange={(e) => handleUpdateExercise(index, 'name', e.target.value)}
                                placeholder="Nome do exercício"
                                className="w-full font-bold text-xs text-slate-800 dark:text-slate-100 bg-transparent border-b border-transparent focus:border-emerald-500 outline-none truncate"
                              />
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] uppercase font-bold text-slate-400">
                                  {ex.muscle_group}
                                </span>
                                {ex.video_url && (
                                  <button
                                    type="button"
                                    onClick={() => setPlayingVideo({ url: ex.video_url!, name: ex.name })}
                                    className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-100 px-1.5 py-0.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                                    title="Assistir demonstração em vídeo"
                                  >
                                    <Play className="w-2.5 h-2.5 fill-current" />
                                    <span>Vídeo</span>
                                  </button>
                                )}
                              </div>
                              <ExerciseImageCredit value={ex.image_attribution_json} />
                            </div>
                          </div>

                          {/* Ações do Exercício */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5 border border-slate-200 dark:border-slate-600">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => handleMoveUp(index)}
                                title="Mover para cima"
                                className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === currentExercises.length - 1}
                                onClick={() => handleMoveDown(index)}
                                title="Mover para baixo"
                                className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setReplaceIndex(index);
                                setIsLibraryOpen(true);
                              }}
                              title="Substituir exercício"
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDuplicateExercise(index)}
                              title="Duplicar exercício"
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveExercise(index)}
                              title="Remover exercício"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Parâmetros Prescritos */}
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                              Séries
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={ex.sets}
                              onChange={(e) => handleUpdateExercise(index, 'sets', parseInt(e.target.value) || 1)}
                              className="w-full px-2 py-1 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                              {stretch ? 'Duração' : 'Reps'}
                            </label>
                            <input
                              type="text"
                              value={ex.reps}
                              onChange={(e) => handleUpdateExercise(index, 'reps', e.target.value)}
                              placeholder={stretch ? '30s' : '10-12'}
                              className="w-full px-2 py-1 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                              Carga (kg / %)
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              value={ex.load_kg !== undefined && ex.load_kg !== null ? ex.load_kg : ''}
                              onChange={(e) =>
                                handleUpdateExercise(
                                  index,
                                  'load_kg',
                                  e.target.value === '' ? undefined : parseFloat(e.target.value)
                                )
                              }
                              placeholder="Opcional"
                              className="w-full px-2 py-1 border border-slate-200 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                              Descanso (s)
                            </label>
                            <input
                              type="number"
                              step={5}
                              value={ex.rest_seconds}
                              onChange={(e) =>
                                handleUpdateExercise(index, 'rest_seconds', parseInt(e.target.value) || 0)
                              }
                              className="w-full px-2 py-1 border border-slate-200 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                              Técnica Avançada
                            </label>
                            <select
                              value={ex.technique || 'Direta'}
                              onChange={(e) => handleUpdateExercise(index, 'technique', e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                            >
                              {TECHNIQUES.map((tech) => (
                                <option key={tech} value={tech}>
                                  {tech}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Observações do exercício */}
                        <div>
                          <input
                            type="text"
                            value={ex.notes || ''}
                            onChange={(e) => handleUpdateExercise(index, 'notes', e.target.value)}
                            placeholder="Observações do exercício (ex: cadência 3-0-1, pico de contração 2s...)"
                            className="w-full px-2 py-1 text-xs border border-dashed border-slate-200 dark:border-slate-600 rounded-lg bg-transparent text-slate-600 dark:text-slate-300 placeholder:text-slate-400"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rodapé com Resumo e Ações */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
            <span>
              Total: <strong>{divisions.length}</strong> {divisions.length === 1 ? 'divisão' : 'divisões'}
            </span>
            <span>•</span>
            <span>
              <strong>{totalExercisesCount}</strong> {totalExercisesCount === 1 ? 'exercício' : 'exercícios'}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-lg shadow-emerald-600/20 flex items-center space-x-2 transition-all hover:scale-[1.02] cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Salvando...' : templateToEdit ? 'Atualizar Modelo' : 'Salvar Modelo'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal da Biblioteca de Exercícios */}
      <PersonalExerciseLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => {
          setIsLibraryOpen(false);
          setReplaceIndex(null);
        }}
        onSelectExercise={handleSelectExerciseFromLibrary}
        isPickerMode={true}
      />

      {/* Modal de Zoom da Foto */}
      {zoomedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-fadeIn"
          onClick={() => setZoomedPhoto(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] p-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setZoomedPhoto(null)}
              className="absolute -top-3 -right-3 p-1.5 rounded-full bg-slate-900 text-white shadow-lg hover:scale-105 transition-transform"
            >
              <X className="w-4 h-4" />
            </button>
            <SecureFileImage
              fileId={zoomedPhoto.fileId}
              fallbackUrl={zoomedPhoto.url}
              alt="Exercício"
              className="max-h-[75vh] w-auto object-contain rounded-xl"
            />
          </div>
        </div>
      )}

      {/* Modal de Reprodução de Vídeo */}
      <PersonalVideoPlayerModal
        isOpen={Boolean(playingVideo)}
        onClose={() => setPlayingVideo(null)}
        videoUrl={playingVideo?.url}
        exerciseName={playingVideo?.name || 'Exercício'}
      />
    </div>
  );
};
