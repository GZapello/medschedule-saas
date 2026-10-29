import { ExerciseAnimation } from './ExerciseAnimation';
import { ExerciseCardThumbnail } from './ExerciseCardThumbnail';
import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Search,
  Plus,
  Dumbbell,
  ZoomIn,
  Trash2,
  Edit2,
  Check,
  Image as ImageIcon,
  Power,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import { Exercise } from './types';
import { ExerciseImageCredit } from './ExerciseImageCredit';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { FileImageUploader } from '../common/FileImageUploader';
import { SecureFileImage } from '../common/SecureFileImage';

interface PersonalExerciseLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExercise?: (exercise: Exercise) => void;
  isPickerMode?: boolean;
}

export const MUSCLE_CATEGORIES = [
  { id: '', label: 'Todos os Músculos' },
  { id: 'peitoral', label: 'Peitoral' },
  { id: 'costas', label: 'Costas' },
  { id: 'ombros', label: 'Ombros' },
  { id: 'biceps', label: 'Bíceps' },
  { id: 'triceps', label: 'Tríceps' },
  { id: 'antebraco', label: 'Antebraços' },
  { id: 'abdomen', label: 'Abdômen / Core' },
  { id: 'lombar', label: 'Lombar' },
  { id: 'quadriceps', label: 'Quadríceps' },
  { id: 'posterior', label: 'Posteriores de Coxa' },
  { id: 'gluteos', label: 'Glúteos' },
  { id: 'panturrilha', label: 'Panturrilhas' },
  { id: 'adutores', label: 'Adutores' },
  { id: 'abdutores', label: 'Abdutores' },
  { id: 'corpo_inteiro', label: 'Corpo Inteiro' },
  { id: 'cardio', label: 'Cardiorrespiratórios' },
  { id: 'mobilidade', label: 'Mobilidade' },
  { id: 'alongamento', label: 'Alongamentos' }
];

export const EQUIPMENT_LIST = [
  { id: '', label: 'Todos os Equipamentos' },
  { id: 'barra', label: 'Barra' },
  { id: 'halteres', label: 'Halteres' },
  { id: 'cabos', label: 'Cabos' },
  { id: 'maquina', label: 'Máquinas' },
  { id: 'peso_corporal', label: 'Peso Corporal' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'elastico', label: 'Elástico' },
  { id: 'smith', label: 'Smith Machine' },
  { id: 'suspensao', label: 'Fita de Suspensão / TRX' },
  { id: 'medicine_ball', label: 'Medicine Ball' },
  { id: 'caixa', label: 'Caixa / Step' }
];

export const CATEGORY_LIST = [
  { id: '', label: 'Todas as Categorias' },
  { id: 'musculacao', label: 'Musculação' },
  { id: 'cardio', label: 'Cardiorrespiratório' },
  { id: 'hipertrofia', label: 'Hipertrofia' },
  { id: 'forca', label: 'Força' },
  { id: 'resistencia', label: 'Resistência' },
  { id: 'funcional', label: 'Funcional' },
  { id: 'mobilidade', label: 'Mobilidade' },
  { id: 'potencia', label: 'Potência' },
  { id: 'alongamento', label: 'Alongamentos' },
  { id: 'aquecimento', label: 'Aquecimento' }
];

const PAGE_SIZE = 24;

export const PersonalExerciseLibraryModal: React.FC<PersonalExerciseLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectExercise,
  isPickerMode = false
}) => {
  const { showToast } = useToast();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<{ type: 'network' | 'auth' | 'general'; message: string } | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);

  // Controle de cancelamento e race condition
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // One card animation at a time, including touch screens and filtered lists.
  const [activeAnimationId, setActiveAnimationId] = useState<string | null>(null);

  // Zoom
  const [zoomedExercise, setZoomedExercise] = useState<Exercise | null>(null);

  // Formulário para novo exercício customizado / edição
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formMuscle, setFormMuscle] = useState('peitoral');
  const [formEquipment, setFormEquipment] = useState('barra');
  const [formCategory, setFormCategory] = useState('hipertrofia');
  const [formRegion, setFormRegion] = useState('membros_superiores');
  const [formExecutionType, setFormExecutionType] = useState('bilateral');
  const [formMechanics, setFormMechanics] = useState('composto');
  const [formLevel, setFormLevel] = useState('intermediario');
  const [formInstructions, setFormInstructions] = useState('');
  const [formTechnicalNotes, setFormTechnicalNotes] = useState('');
  const [formPhotoUrl, setFormPhotoUrl] = useState('');
  const [formFileId, setFormFileId] = useState('');
  const [formIsActive, setFormIsActive] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Reset animations when state changes
  useEffect(() => { setActiveAnimationId(null); }, [isOpen, currentPage, selectedMuscle, selectedEquipment, selectedCategory]);
  useEffect(() => { if (zoomedExercise) setActiveAnimationId(null); }, [zoomedExercise]);
  useEffect(() => { if (isFormOpen) setActiveAnimationId(null); }, [isFormOpen]);

  // Limpa requisições pendentes ao fechar o modal
  useEffect(() => {
    if (!isOpen) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setActiveAnimationId(null);
      setZoomedExercise(null);
      setIsFormOpen(false);
    }
  }, [isOpen]);

  // Carrega exercícios ao abrir ou alterar filtros
  useEffect(() => {
    if (isOpen) {
      setCurrentPage(1);
      loadExercises();
    }
  }, [isOpen, selectedMuscle, selectedEquipment, selectedCategory, showInactive]);

  const loadExercises = async () => {
    // Cancela requisição anterior se ainda estiver em voo
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const reqId = ++requestIdRef.current;

    try {
      setLoading(true);
      setLoadError(null);

      const params = new URLSearchParams();
      if (selectedMuscle) params.append('muscle', selectedMuscle);
      if (selectedEquipment) params.append('equipment', selectedEquipment);
      if (selectedCategory) params.append('category', selectedCategory);
      if (search.trim()) params.append('q', search.trim());
      if (showInactive) {
        params.append('is_active', 'all');
      } else {
        params.append('is_active', '1');
      }

      const res = await ApiClient.get<{ exercises: Exercise[] }>(
        `/v1/personal/exercises?${params.toString()}`,
        { signal: controller.signal }
      );

      // Atualiza apenas se for a requisição mais recente
      if (reqId === requestIdRef.current) {
        setExercises(res.exercises || []);
        setLoadError(null);
      }
    } catch (err: any) {
      // Ignora cancelamentos intencionais (troca rápida de filtro ou fechamento)
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        return;
      }
      if (reqId !== requestIdRef.current) {
        return;
      }

      console.error('Erro ao carregar exercícios:', err);
      let errorType: 'network' | 'auth' | 'general' = 'general';
      let errorMsg = 'Não foi possível carregar a biblioteca de exercícios.';

      if (err?.status === 401 || err?.status === 403) {
        errorType = 'auth';
        errorMsg = 'Sua sessão expirou ou seu usuário não possui permissão para acessar o ZemdaPersonal.';
      } else if (err?.code === 'NETWORK_ERROR' || !navigator.onLine) {
        errorType = 'network';
        errorMsg = 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.';
      } else if (err?.message) {
        errorMsg = err.message;
      }

      setLoadError({ type: errorType, message: errorMsg });
      showToast(errorMsg, 'error');
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    loadExercises();
  };

  const handleClearFilters = () => {
    setSelectedMuscle('');
    setSelectedEquipment('');
    setSelectedCategory('');
    setSearch('');
    setCurrentPage(1);
  };

  const handleOpenCreateForm = () => {
    setEditingExerciseId(null);
    setFormName('');
    setFormMuscle(selectedMuscle || 'peitoral');
    setFormEquipment('barra');
    setFormCategory('hipertrofia');
    setFormRegion('membros_superiores');
    setFormExecutionType('bilateral');
    setFormMechanics('composto');
    setFormLevel('intermediario');
    setFormInstructions('');
    setFormTechnicalNotes('');
    setFormPhotoUrl('');
    setFormFileId('');
    setFormIsActive(1);
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (ex: Exercise) => {
    setEditingExerciseId(ex.id);
    setFormName(ex.name);
    setFormMuscle(ex.muscle_group || 'peitoral');
    setFormEquipment(ex.equipment || 'barra');
    setFormCategory(ex.category || 'hipertrofia');
    setFormRegion(ex.body_region || 'membros_superiores');
    setFormExecutionType(ex.execution_type || 'bilateral');
    setFormMechanics(ex.mechanics || 'composto');
    setFormLevel(ex.level || 'intermediario');
    setFormInstructions(ex.instructions || '');
    setFormTechnicalNotes(ex.technical_notes || '');
    setFormPhotoUrl(ex.photo_url || '');
    setFormFileId(ex.exercise_file_id || '');
    setFormIsActive(ex.is_active !== undefined ? ex.is_active : 1);
    setIsFormOpen(true);
  };

  const handleSaveExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Nome do exercício obrigatório', 'error');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: formName.trim(),
        muscle_group: formMuscle,
        body_region: formRegion,
        equipment: formEquipment,
        category: formCategory,
        execution_type: formExecutionType,
        mechanics: formMechanics,
        level: formLevel,
        instructions: formInstructions,
        technical_notes: formTechnicalNotes,
        exercise_file_id: formFileId || null,
        is_active: formIsActive
      };

      if (editingExerciseId) {
        await ApiClient.put(`/v1/personal/exercises/${editingExerciseId}`, payload);
        showToast('Exercício atualizado com sucesso!', 'success');
      } else {
        await ApiClient.post('/v1/personal/exercises', payload);
        showToast('Exercício criado com sucesso!', 'success');
      }

      setIsFormOpen(false);
      setEditingExerciseId(null);
      loadExercises();
    } catch (err) {
      console.error('Erro ao salvar exercício:', err);
      showToast('Erro ao salvar exercício', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (ex: Exercise) => {
    const nextStatus = ex.is_active === 0 ? 1 : 0;
    try {
      await ApiClient.put(`/v1/personal/exercises/${ex.id}`, { is_active: nextStatus });
      showToast(nextStatus === 1 ? 'Exercício ativado com sucesso!' : 'Exercício desativado!', 'info');
      loadExercises();
    } catch (err) {
      showToast('Erro ao alterar status do exercício', 'error');
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    if (!window.confirm('Deseja desativar ou excluir este exercício? O histórico em treinos anteriores será preservado.')) return;
    try {
      await ApiClient.delete(`/v1/personal/exercises/${exerciseId}`);
      showToast('Exercício excluído/desativado com sucesso!', 'success');
      loadExercises();
    } catch (err) {
      showToast('Não foi possível excluir o exercício.', 'error');
    }
  };

  if (!isOpen) return null;

  // Cálculos de Paginação
  const totalExercises = exercises.length;
  const totalPages = Math.max(1, Math.ceil(totalExercises / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedExercises = exercises.slice(startIndex, startIndex + PAGE_SIZE);
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalExercises);
  const hasActiveFilters = Boolean(selectedMuscle || selectedEquipment || selectedCategory || search.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn mobile-modal">
      <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-800">
                {isPickerMode ? 'Selecionar Exercício para o Treino' : 'Biblioteca de Exercícios & Cinesiologia'}
              </h3>
              <p className="text-xs text-slate-500">
                Exercícios com cinesiologia, instruções técnicas e animações em alta performance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenCreateForm}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Criar Exercício
            </button>
            <button
              aria-label="Fechar"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filtros e Busca */}
        <div className="p-4 border-b border-slate-100 bg-white space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <form onSubmit={handleSearchSubmit} className="flex-1 min-w-0 lg:min-w-[240px] relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, equipamento ou cinesiologia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  title="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            <select
              value={selectedEquipment}
              onChange={(e) => setSelectedEquipment(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700 cursor-pointer"
            >
              {EQUIPMENT_LIST.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.label}
                </option>
              ))}
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700 cursor-pointer"
            >
              {CATEGORY_LIST.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>Incluir inativos</span>
            </label>
          </div>

          {/* Chips de Músculos */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full mobile-wrap">
            {MUSCLE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedMuscle(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedMuscle === cat.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Barra de Filtros Ativos */}
          {hasActiveFilters && (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-xs border-t border-slate-100/80">
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                <Filter className="w-3 h-3 text-slate-400" />
                Filtros ativos:
              </span>
              {selectedMuscle && (
                <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 font-medium px-2 py-0.5 rounded-md text-[11px]">
                  Músculo: {MUSCLE_CATEGORIES.find((m) => m.id === selectedMuscle)?.label || selectedMuscle}
                  <button
                    onClick={() => setSelectedMuscle('')}
                    className="hover:text-indigo-900 cursor-pointer p-0.5"
                    title="Remover filtro"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedEquipment && (
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded-md text-[11px]">
                  Equipamento: {EQUIPMENT_LIST.find((e) => e.id === selectedEquipment)?.label || selectedEquipment}
                  <button
                    onClick={() => setSelectedEquipment('')}
                    className="hover:text-slate-900 cursor-pointer p-0.5"
                    title="Remover filtro"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedCategory && (
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded-md text-[11px]">
                  Categoria: {CATEGORY_LIST.find((c) => c.id === selectedCategory)?.label || selectedCategory}
                  <button
                    onClick={() => setSelectedCategory('')}
                    className="hover:text-slate-900 cursor-pointer p-0.5"
                    title="Remover filtro"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {search.trim() && (
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded-md text-[11px]">
                  Busca: &ldquo;{search.trim()}&rdquo;
                  <button
                    onClick={() => setSearch('')}
                    className="hover:text-slate-900 cursor-pointer p-0.5"
                    title="Remover busca"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                onClick={handleClearFilters}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2 ml-1 cursor-pointer"
              >
                Limpar todos
              </button>
            </div>
          )}
        </div>

        {/* Grid de Exercícios */}
        <div ref={gridContainerRef} className="p-5 sm:p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span className="font-semibold text-slate-700">Carregando catálogo de exercícios...</span>
              <span className="text-[11px] text-slate-400">Consultando cinesiologia e ilustrações</span>
            </div>
          ) : loadError ? (
            <div className="py-16 text-center flex flex-col items-center justify-center max-w-md mx-auto px-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 shadow-xs">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-1">
                Não foi possível carregar os exercícios
              </h4>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                {loadError.message}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadExercises()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tentar novamente
                </button>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
          ) : exercises.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center justify-center max-w-md mx-auto px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                <Search className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-1">
                Nenhum exercício encontrado
              </h4>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Nenhum exercício corresponde aos filtros selecionados. Tente ajustar os filtros ou remover a busca textual.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  Limpar todos os filtros
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span>
                    Exibindo <strong className="text-slate-800">{startIndex + 1}–{endIndex}</strong> de{' '}
                    <strong className="text-slate-800">{totalExercises}</strong> exercícios
                  </span>
                  {selectedMuscle && (
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md uppercase">
                      {MUSCLE_CATEGORIES.find((m) => m.id === selectedMuscle)?.label || selectedMuscle}
                    </span>
                  )}
                </div>
                {totalPages > 1 && (
                  <span className="text-[11px] text-slate-400">
                    Página {safeCurrentPage} de {totalPages}
                  </span>
                )}
              </div>

              {/* Grid de Exercícios Paginados (limite de 24 no DOM para salvar memória e evitar congelamento de aba) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {paginatedExercises.map((ex) => {
                  const isInactive = ex.is_active === 0;
                  return (
                    <div
                      key={ex.id}
                      className={`bg-white rounded-2xl border ${
                        isInactive ? 'border-dashed border-slate-300 opacity-60' : 'border-slate-200 hover:border-indigo-300'
                      } p-3 flex flex-col justify-between shadow-sm hover:shadow-md transition-all group relative`}
                    >
                      {/* Thumbnail com Zoom e GIF no hover */}
                      <ExerciseCardThumbnail
                        exercise={ex}
                        onZoom={() => setZoomedExercise(ex)}
                        isInactive={isInactive}
                        active={activeAnimationId === ex.id && !zoomedExercise && !isFormOpen && !loading}
                        onActiveChange={(active) =>
                          setActiveAnimationId((current) => (active ? ex.id : current === ex.id ? null : current))
                        }
                      />

                      {/* Informações */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                            {ex.muscle_group}
                          </span>
                          {ex.equipment && (
                            <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                              {ex.equipment}
                            </span>
                          )}
                          {ex.level && (
                            <span className="text-[9px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md capitalize">
                              {ex.level}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500">{ex.category}</span>
                        <h4
                          onClick={() => setZoomedExercise(ex)}
                          className="font-bold text-slate-800 text-xs leading-snug line-clamp-1 cursor-pointer hover:text-indigo-600"
                        >
                          {ex.name}
                        </h4>
                        {ex.instructions && (
                          <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                            {ex.instructions}
                          </p>
                        )}
                      </div>

                      {/* Ações */}
                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                        {isPickerMode ? (
                          <button
                            onClick={() => onSelectExercise && onSelectExercise(ex)}
                            className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1 shadow-sm transition-colors cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Selecionar
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => setZoomedExercise(ex)}
                              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                            >
                              Ver detalhes
                            </button>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleOpenEditForm(ex)}
                                title="Editar exercício"
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleToggleActive(ex)}
                                title={isInactive ? 'Ativar exercício' : 'Desativar exercício'}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  isInactive
                                    ? 'text-rose-500 hover:bg-rose-50'
                                    : 'text-emerald-500 hover:bg-emerald-50'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                              {ex.is_custom === 1 && (
                                <button
                                  onClick={() => handleDeleteExercise(ex.id)}
                                  title="Excluir ou desativar"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Controles de Paginação */}
              {totalPages > 1 && (
                <div className="pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 mt-5">
                  <span className="text-xs text-slate-500">
                    Página <strong className="text-slate-800">{safeCurrentPage}</strong> de{' '}
                    <strong className="text-slate-800">{totalPages}</strong> ({totalExercises} exercícios no catálogo)
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setCurrentPage((prev) => Math.max(prev - 1, 1));
                        gridContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      disabled={safeCurrentPage === 1}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Anterior
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(
                          (p) =>
                            p === 1 ||
                            p === totalPages ||
                            Math.abs(p - safeCurrentPage) <= 1
                        )
                        .map((page, idx, arr) => {
                          const prevPage = arr[idx - 1];
                          const showEllipsis = prevPage && page - prevPage > 1;
                          return (
                            <React.Fragment key={page}>
                              {showEllipsis && (
                                <span className="text-slate-400 text-xs px-1">...</span>
                              )}
                              <button
                                onClick={() => {
                                  setCurrentPage(page);
                                  gridContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className={`w-7 h-7 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                  safeCurrentPage === page
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {page}
                              </button>
                            </React.Fragment>
                          );
                        })}
                    </div>

                    <button
                      onClick={() => {
                        setCurrentPage((prev) => Math.min(prev + 1, totalPages));
                        gridContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      disabled={safeCurrentPage === totalPages}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-1 cursor-pointer"
                    >
                      Próxima
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal de Zoom do Exercício */}
        {zoomedExercise && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fadeIn mobile-modal">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                    {zoomedExercise.muscle_group}
                  </span>
                  <h3 className="text-lg font-bold text-slate-800 mt-1">{zoomedExercise.name}</h3>
                </div>
                <button
                  aria-label="Fechar"
                  onClick={() => setZoomedExercise(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="w-full h-64 bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-200">
                <SecureFileImage
                  fileId={zoomedExercise.exercise_file_id}
                  fallbackUrl={zoomedExercise.photo_url}
                  alt={zoomedExercise.name}
                  className="w-full h-full object-contain"
                  placeholderText="Foto ou imagem não disponível"
                />
              </div>

              {zoomedExercise.gif_url && (
                <ExerciseAnimation
                  key={zoomedExercise.id}
                  url={zoomedExercise.gif_url}
                  name={zoomedExercise.name}
                  attribution={zoomedExercise.gif_attribution}
                />
              )}

              <p className="text-xs text-slate-600">
                Execução: {zoomedExercise.execution_type} • Mecânica: {zoomedExercise.mechanics} • Região: {zoomedExercise.body_region}
              </p>
              <p className="text-xs text-slate-600">
                Músculos secundários: {zoomedExercise.secondary_muscles_json || 'Não informados'}
              </p>
              {zoomedExercise.suggested_duration && (
                <p className="text-xs text-slate-600">{zoomedExercise.suggested_duration}</p>
              )}
              <ExerciseImageCredit value={zoomedExercise.image_attribution_json} />

              {/* Informações detalhadas */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {zoomedExercise.equipment && (
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Equipamento</span>
                    <strong className="text-slate-700">{zoomedExercise.equipment}</strong>
                  </div>
                )}
                {zoomedExercise.category && (
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Categoria</span>
                    <strong className="text-slate-700 capitalize">{zoomedExercise.category}</strong>
                  </div>
                )}
                {zoomedExercise.level && (
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Nível</span>
                    <strong className="text-slate-700 capitalize">{zoomedExercise.level}</strong>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h5 className="text-xs font-bold uppercase text-slate-500">Padrão de Movimento & Execução</h5>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                  {zoomedExercise.instructions || 'Nenhuma instrução específica cadastrada para este exercício.'}
                </p>
              </div>

              {zoomedExercise.technical_notes && (
                <div className="space-y-2">
                  <h5 className="text-xs font-bold uppercase text-slate-500">Notas Técnicas & Cuidados</h5>
                  <p className="text-xs text-slate-700 leading-relaxed bg-amber-50/60 p-3 rounded-xl border border-amber-100">
                    {zoomedExercise.technical_notes}
                  </p>
                </div>
              )}

              {isPickerMode && (
                <button
                  onClick={() => {
                    if (onSelectExercise) onSelectExercise(zoomedExercise);
                    setZoomedExercise(null);
                  }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Selecionar para o Treino
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Separado Criar / Editar Exercício (z-[70] sobre a Biblioteca z-50) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm overflow-y-auto animate-fadeIn mobile-modal">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div>
                <h4 className="text-sm sm:text-base font-bold text-slate-800 uppercase tracking-wider">
                  {editingExerciseId ? 'Editar Exercício' : 'Novo Exercício Customizado'}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Preencha os dados biomecânicos e selecione uma foto anatômica para o catálogo.
                </p>
              </div>
              <button
                aria-label="Fechar"
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingExerciseId(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExercise} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Exercício *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Supino Inclinado com Halteres"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Grupamento Principal *</label>
                  <select
                    value={formMuscle}
                    onChange={(e) => setFormMuscle(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none capitalize cursor-pointer"
                  >
                    {formMuscle && !MUSCLE_CATEGORIES.some((item) => item.id === formMuscle) && (
                      <option value={formMuscle}>{formMuscle}</option>
                    )}
                    {MUSCLE_CATEGORIES.filter((c) => c.id).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Equipamento</label>
                  <select
                    value={formEquipment}
                    onChange={(e) => setFormEquipment(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                  >
                    {formEquipment && !EQUIPMENT_LIST.some((item) => item.id === formEquipment) && (
                      <option value={formEquipment}>{formEquipment}</option>
                    )}
                    {EQUIPMENT_LIST.filter((eq) => eq.id).map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                  >
                    {formCategory && !CATEGORY_LIST.some((item) => item.id === formCategory) && (
                      <option value={formCategory}>{formCategory}</option>
                    )}
                    {CATEGORY_LIST.filter((cat) => cat.id).map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Região Corporal</label>
                  <select
                    value={formRegion}
                    onChange={(e) => setFormRegion(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                  >
                    <option value="membros_superiores">Membros Superiores</option>
                    <option value="membros_inferiores">Membros Inferiores</option>
                    <option value="tronco">Tronco</option>
                    <option value="core">Core</option>
                    <option value="corpo_inteiro">Corpo Inteiro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mecânica & Tipo</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={formMechanics}
                      onChange={(e) => setFormMechanics(e.target.value)}
                      className="w-full px-2 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                    >
                      <option value="composto">Composto</option>
                      <option value="isolado">Isolado</option>
                    </select>
                    <select
                      value={formExecutionType}
                      onChange={(e) => setFormExecutionType(e.target.value)}
                      className="w-full px-2 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                    >
                      <option value="bilateral">Bilateral</option>
                      <option value="unilateral">Unilateral</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nível & Status</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      value={formLevel}
                      onChange={(e) => setFormLevel(e.target.value)}
                      className="w-full px-2 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                    >
                      <option value="iniciante">Iniciante</option>
                      <option value="intermediario">Intermediário</option>
                      <option value="avancado">Avançado</option>
                    </select>
                    <select
                      value={formIsActive}
                      onChange={(e) => setFormIsActive(Number(e.target.value))}
                      className="w-full px-2 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-semibold text-indigo-700 cursor-pointer"
                    >
                      <option value={1}>Ativo</option>
                      <option value={0}>Inativo</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Upload de Imagem R2 / Foto do Exercício */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <FileImageUploader
                  label="Foto do exercício"
                  buttonText="Adicionar Foto"
                  category="exercises"
                  patientId="exercises"
                  exerciseId={editingExerciseId || undefined}
                  initialFileId={formFileId}
                  onUploadingChange={setUploading}
                  onUploaded={(info) => {
                    setFormFileId(info.id);
                    setFormPhotoUrl('');
                  }}
                  onRemoved={() => {
                    setFormFileId('');
                    setFormPhotoUrl('');
                  }}
                />
              </div>

              {/* Instruções e Notas Técnicas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Instruções de Execução & Postura
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Pés firmes no solo, escápulas em retração e depressão, descida controlada em 3s..."
                    value={formInstructions}
                    onChange={(e) => setFormInstructions(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notas Técnicas / Cuidados Articulares
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Evitar hiperextensão lombar, manter cotovelos a 45 graus, amplitude máxima segura..."
                    value={formTechnicalNotes}
                    onChange={(e) => setFormTechnicalNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingExerciseId(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : editingExerciseId ? 'Salvar Alterações' : 'Cadastrar Exercício'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
