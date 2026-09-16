import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Plus,
  Dumbbell,
  ZoomIn,
  Trash2,
  Edit2,
  Check,
  Image as ImageIcon
} from 'lucide-react';
import { Exercise } from './types';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

interface PersonalExerciseLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExercise?: (exercise: Exercise) => void;
  isPickerMode?: boolean;
}

const MUSCLE_CATEGORIES = [
  { id: '', label: 'Todos' },
  { id: 'peito', label: 'Peito' },
  { id: 'costas', label: 'Costas' },
  { id: 'ombros', label: 'Ombros' },
  { id: 'biceps', label: 'Bíceps' },
  { id: 'triceps', label: 'Tríceps' },
  { id: 'quadriceps', label: 'Quadríceps' },
  { id: 'posterior', label: 'Posterior' },
  { id: 'gluteos', label: 'Glúteos' },
  { id: 'abdomen', label: 'Abdômen' },
  { id: 'panturrilha', label: 'Panturrilha' },
  { id: 'cardio', label: 'Cardio / Funcional' }
];

export const PersonalExerciseLibraryModal: React.FC<PersonalExerciseLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectExercise,
  isPickerMode = false
}) => {
  const { showToast } = useToast();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('');
  const [zoomedExercise, setZoomedExercise] = useState<Exercise | null>(null);

  // Formulário para novo exercício customizado
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMuscle, setNewMuscle] = useState('peito');
  const [newInstructions, setNewInstructions] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadExercises();
    }
  }, [isOpen, selectedMuscle]);

  const loadExercises = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedMuscle) params.append('muscle', selectedMuscle);
      if (search) params.append('q', search);

      const res = await ApiClient.get<{ exercises: Exercise[] }>(`/v1/personal/exercises?${params.toString()}`);
      setExercises(res.exercises || []);
    } catch (err) {
      console.error('Erro ao carregar exercícios:', err);
      showToast('Erro ao carregar biblioteca de exercícios', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadExercises();
  };

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      showToast('Nome do exercício obrigatório', 'error');
      return;
    }

    try {
      setSaving(true);
      await ApiClient.post('/v1/personal/exercises', {
        name: newName,
        muscle_group: newMuscle,
        instructions: newInstructions,
        photo_url: newPhotoUrl
      });
      showToast('Exercício criado com sucesso!', 'success');
      setIsCreating(false);
      setNewName('');
      setNewInstructions('');
      setNewPhotoUrl('');
      loadExercises();
    } catch (err) {
      console.error('Erro ao salvar exercício:', err);
      showToast('Erro ao salvar exercício customizado', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    if (!window.confirm('Excluir este exercício customizado?')) return;
    try {
      await ApiClient.delete(`/v1/personal/exercises/${exerciseId}`);
      showToast('Exercício excluído com sucesso!', 'success');
      loadExercises();
    } catch (err) {
      showToast('Não foi possível excluir o exercício.', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {isPickerMode ? 'Selecionar Exercício para o Treino' : 'Biblioteca de Exercícios & Cinesiologia'}
              </h3>
              <p className="text-xs text-slate-500">
                Catálogo completo com fotos anatômicas, execução e grupamentos musculares.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Criar Exercício Customizado
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Formulário Novo Exercício (quando ativo) */}
        {isCreating && (
          <div className="p-5 bg-indigo-50/50 border-b border-indigo-100 animate-slideDown">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900">Novo Exercício Customizado</h4>
              <button onClick={() => setIsCreating(false)} className="text-xs text-slate-500 hover:text-slate-700">
                Cancelar
              </button>
            </div>
            <form onSubmit={handleCreateExercise} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Exercício *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Supino Inclinado com Halteres"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Grupamento Principal *</label>
                <select
                  value={newMuscle}
                  onChange={(e) => setNewMuscle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none capitalize"
                >
                  {MUSCLE_CATEGORIES.filter((c) => c.id).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">URL da Imagem / Foto</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newPhotoUrl}
                  onChange={(e) => setNewPhotoUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors"
                >
                  {saving ? 'Salvando...' : 'Salvar Exercício'}
                </button>
              </div>
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Instruções de Execução & Postura</label>
                <input
                  type="text"
                  placeholder="Ex: Pés firmes no solo, escápulas em retração e depressão, descida controlada em 3s..."
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </form>
          </div>
        )}

        {/* Filtros e Busca */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white">
          <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[240px] relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou instruções..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
            />
          </form>

          {/* Categorias por Chip */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
            {MUSCLE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedMuscle(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedMuscle === cat.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid de Exercícios */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Carregando exercícios...
            </div>
          ) : exercises.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              Nenhum exercício encontrado com os filtros selecionados.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {exercises.map((ex) => (
                <div
                  key={ex.id}
                  className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-200 p-3 flex flex-col justify-between shadow-sm hover:shadow-md transition-all group relative"
                >
                  {/* Thumbnail com Zoom */}
                  <div className="relative w-full h-36 bg-slate-100 rounded-xl overflow-hidden mb-3 flex items-center justify-center border border-slate-100">
                    {ex.photo_url ? (
                      <img src={ex.photo_url} alt={ex.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="text-slate-300 flex flex-col items-center gap-1">
                        <ImageIcon className="w-8 h-8" />
                        <span className="text-[10px]">Sem foto</span>
                      </div>
                    )}

                    <button
                      onClick={() => setZoomedExercise(ex)}
                      title="Ampliar visualização e foto"
                      className="absolute top-2 right-2 p-1.5 bg-slate-900/60 hover:bg-slate-900 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>

                    {ex.is_custom === 1 && (
                      <span className="absolute bottom-2 left-2 text-[9px] font-bold px-2 py-0.5 bg-indigo-600/90 text-white rounded-md backdrop-blur-sm">
                        Customizado
                      </span>
                    )}
                  </div>

                  {/* Informações */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                      {ex.muscle_group}
                    </span>
                    <h4 className="font-bold text-slate-800 text-xs leading-snug line-clamp-1">{ex.name}</h4>
                    {ex.instructions && (
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        {ex.instructions}
                      </p>
                    )}
                  </div>

                  {/* Ação */}
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    {isPickerMode ? (
                      <button
                        onClick={() => onSelectExercise && onSelectExercise(ex)}
                        className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1 shadow-sm transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Adicionar ao Treino
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setZoomedExercise(ex)}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          Ver detalhes
                        </button>
                        {ex.is_custom === 1 && (
                          <button
                            onClick={() => handleDeleteExercise(ex.id)}
                            title="Excluir exercício customizado"
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal de Zoom do Exercício */}
        {zoomedExercise && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                    {zoomedExercise.muscle_group}
                  </span>
                  <h3 className="text-lg font-bold text-slate-800 mt-1">{zoomedExercise.name}</h3>
                </div>
                <button
                  onClick={() => setZoomedExercise(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="w-full h-64 bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-200">
                {zoomedExercise.photo_url ? (
                  <img src={zoomedExercise.photo_url} alt={zoomedExercise.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-slate-400 flex flex-col items-center gap-2">
                    <ImageIcon className="w-12 h-12 text-slate-300" />
                    <span className="text-xs">Foto ou GIF anatômico não disponível</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h5 className="text-xs font-bold uppercase text-slate-500">Padrão de Movimento & Execução</h5>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                  {zoomedExercise.instructions || 'Nenhuma instrução específica cadastrada para este exercício.'}
                </p>
              </div>

              {isPickerMode && (
                <button
                  onClick={() => {
                    if (onSelectExercise) onSelectExercise(zoomedExercise);
                    setZoomedExercise(null);
                  }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  Adicionar ao Treino
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
