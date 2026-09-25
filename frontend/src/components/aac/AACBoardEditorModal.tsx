import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  MoveUp,
  MoveDown,
  Layers,
  Settings,
  Upload,
  Check,
  CornerDownRight,
  Copy,
  Home,
  AlertCircle,
  Smile,
  Sparkles,
  Coffee,
  Users,
  MapPin,
  Play,
  Droplet,
  Activity,
  Heart,
  BookOpen,
  HelpCircle,
  MessageSquare,
  Clock,
  Compass,
  Sun,
  Sliders,
  Palette,
  Hash,
  Tv,
  Moon,
  MessageCircle
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { AACBoard, AACCard, AACPage, AACCategories, FITZGERALD_COLORS } from './types';

interface AACBoardEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: AACBoard;
  initialTab?: 'cards' | 'pages' | 'settings';
  onBoardUpdated: () => void;
}

const COMMON_EMOJIS = [
  // Pessoas / Pronomes
  '🙋', '👉', '👨‍👩‍👧', '👨', '👩', '👶', '🧑‍⚕️', '🧑‍🏫', '👵', '👴',
  // Ações / Verbos
  '🤲', '🚫', '🍽️', '💧', '🏃', '🛑', '👂', '🗣️', '🖍️', '👀', '🤝', '🛌', '🚪',
  // Substantivos / Coisas
  '🚽', '🧸', '🎲', '🎵', '📖', '💊', '🥪', '🍎', '🍌', '🥛', '🧃', '🍞', '🍪', '🍲', '🚗', '📱',
  // Sentimentos / Estados
  '😃', '😢', '😡', '😨', '😌', '😰', '🤩', '😤', '🤕', '🤢', '🥶', '🥵', '😴', '🥱',
  // Respostas / Descritores
  '👍', '👎', '➕', '➖', '🆘', '❓', '❗', '🏁', '⭐', '❤️', '👋', '🙏'
];

const AVAILABLE_PAGE_ICONS = [
  { value: 'Layers', label: 'Camadas (Padrão)' },
  { value: 'Home', label: 'Início / Casa' },
  { value: 'AlertCircle', label: 'Necessidades & Alerta' },
  { value: 'Smile', label: 'Sentimentos & Emoções' },
  { value: 'Sparkles', label: 'Atividades & Lazer' },
  { value: 'Coffee', label: 'Alimentos & Bebidas' },
  { value: 'Users', label: 'Pessoas & Família' },
  { value: 'MapPin', label: 'Lugares' },
  { value: 'Play', label: 'Ações & Verbos' },
  { value: 'Droplet', label: 'Higiene' },
  { value: 'Activity', label: 'Corpo' },
  { value: 'Heart', label: 'Saúde / Dor' },
  { value: 'BookOpen', label: 'Escola' },
  { value: 'HelpCircle', label: 'Perguntas' },
  { value: 'MessageSquare', label: 'Social' },
  { value: 'Clock', label: 'Rotina' },
  { value: 'Compass', label: 'Transporte' },
  { value: 'Sun', label: 'Tempo / Clima' },
  { value: 'Sliders', label: 'Descritores / Conceitos' },
  { value: 'Palette', label: 'Cores' },
  { value: 'Hash', label: 'Números' },
  { value: 'Tv', label: 'Tecnologia' },
  { value: 'Moon', label: 'Sono / Descanso' },
  { value: 'MessageCircle', label: 'Comunicação' }
];

export const AACBoardEditorModal: React.FC<AACBoardEditorModalProps> = ({
  isOpen,
  onClose,
  board,
  initialTab = 'cards',
  onBoardUpdated
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'cards' | 'pages' | 'settings'>(initialTab);
  const [selectedPageId, setSelectedPageId] = useState<string>(
    board.pages?.[0]?.id || ''
  );

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Estados de Configuração da Prancha
  const [boardName, setBoardName] = useState(board.name || '');
  const [boardDescription, setBoardDescription] = useState(board.description || '');
  const [boardContext, setBoardContext] = useState(board.context || 'Geral');
  const [boardColumns, setBoardColumns] = useState(board.columns || 4);
  const [savingSettings, setSavingSettings] = useState(false);

  // Estados de Edição de Cartão
  const [editingCard, setEditingCard] = useState<AACCard | null>(null);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [cardBehavior, setCardBehavior] = useState<'word' | 'navigation' | 'word_and_navigation'>('word');
  const [cardPageId, setCardPageId] = useState<string>(board.pages?.[0]?.id || '');
  const [cardLabel, setCardLabel] = useState('');
  const [cardSpokenText, setCardSpokenText] = useState('');
  const [cardCategory, setCardCategory] = useState<AACCategories>('action');
  const [cardColor, setCardColor] = useState('');
  const [cardSymbolType, setCardSymbolType] = useState<'symbol' | 'emoji' | 'image'>('emoji');
  const [cardImageUrl, setCardImageUrl] = useState('💬');
  const [cardTargetPageId, setCardTargetPageId] = useState<string>('');
  const [cardActive, setCardActive] = useState(true);
  const [savingCard, setSavingCard] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Estados de Criação / Edição de Página
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  const [newPageIcon, setNewPageIcon] = useState('Layers');
  const [savingPage, setSavingPage] = useState(false);

  // Edição de Página Existente (Nome e Ícone)
  const [editingPage, setEditingPage] = useState<AACPage | null>(null);
  const [editPageName, setEditPageName] = useState('');
  const [editPageIcon, setEditPageIcon] = useState('Layers');
  const [savingEditPage, setSavingEditPage] = useState(false);

  if (!isOpen) return null;

  const currentPage = board.pages?.find(p => p.id === selectedPageId) || board.pages?.[0];
  const pageCards = currentPage?.cards || [];

  const getCategoryIcon = (iconName?: string) => {
    switch (iconName?.toLowerCase()) {
      case 'home':
        return <Home className="w-4 h-4" />;
      case 'alertcircle':
      case 'alert':
        return <AlertCircle className="w-4 h-4" />;
      case 'smile':
        return <Smile className="w-4 h-4" />;
      case 'sparkles':
        return <Sparkles className="w-4 h-4" />;
      case 'coffee':
        return <Coffee className="w-4 h-4" />;
      case 'users':
        return <Users className="w-4 h-4" />;
      case 'mappin':
        return <MapPin className="w-4 h-4" />;
      case 'play':
        return <Play className="w-4 h-4" />;
      case 'droplet':
        return <Droplet className="w-4 h-4" />;
      case 'activity':
        return <Activity className="w-4 h-4" />;
      case 'heart':
        return <Heart className="w-4 h-4" />;
      case 'bookopen':
        return <BookOpen className="w-4 h-4" />;
      case 'helpcircle':
        return <HelpCircle className="w-4 h-4" />;
      case 'messagesquare':
        return <MessageSquare className="w-4 h-4" />;
      case 'clock':
        return <Clock className="w-4 h-4" />;
      case 'compass':
        return <Compass className="w-4 h-4" />;
      case 'sun':
        return <Sun className="w-4 h-4" />;
      case 'sliders':
        return <Sliders className="w-4 h-4" />;
      case 'palette':
        return <Palette className="w-4 h-4" />;
      case 'hash':
        return <Hash className="w-4 h-4" />;
      case 'tv':
        return <Tv className="w-4 h-4" />;
      case 'moon':
        return <Moon className="w-4 h-4" />;
      case 'messagecircle':
        return <MessageCircle className="w-4 h-4" />;
      default:
        return <Layers className="w-4 h-4" />;
    }
  };

  // Salvar Configurações Gerais da Prancha
  const handleSaveSettings = async () => {
    if (!boardName.trim()) {
      showToast('O nome da prancha é obrigatório', 'info');
      return;
    }

    try {
      setSavingSettings(true);
      await ApiClient.put(`/v1/aac/boards/${board.id}`, {
        name: boardName.trim(),
        description: boardDescription.trim(),
        context: boardContext.trim(),
        columns: boardColumns
      });
      showToast('Configurações da prancha atualizadas!', 'success');
      onBoardUpdated();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar configurações.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  // Abrir Modal/Form para Novo Cartão
  const handleStartCreateCard = () => {
    setEditingCard(null);
    setCardPageId(selectedPageId);
    setCardLabel('');
    setCardSpokenText('');
    setCardBehavior('word');
    setCardCategory('action');
    setCardColor(FITZGERALD_COLORS.action.bg);
    setCardSymbolType('emoji');
    setCardImageUrl('💬');
    setCardTargetPageId('');
    setCardActive(true);
    setIsCreatingCard(true);
  };

  // Abrir Modal/Form para Editar Cartão Existente
  const handleStartEditCard = (card: AACCard) => {
    setEditingCard(card);
    setCardPageId(card.page_id || selectedPageId);
    setCardLabel(card.label);
    setCardSpokenText(card.spoken_text);
    setCardCategory(card.category);
    setCardColor(card.color || FITZGERALD_COLORS[card.category]?.bg || '#f1f5f9');
    setCardSymbolType(card.symbol_type || 'emoji');
    setCardImageUrl(card.image_url || '💬');
    setCardTargetPageId(card.target_page_id || '');
    setCardActive(Boolean(card.active));
    const initialBehavior: 'word' | 'navigation' | 'word_and_navigation' =
      card.behavior || (card.category === 'navigation' ? 'navigation' : (card.target_page_id ? 'word_and_navigation' : 'word'));
    setCardBehavior(initialBehavior);
    setIsCreatingCard(true);
  };

  // Upload de Imagem Personalizada para o Cartão
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('A imagem deve ter no máximo 5MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setUploadingImage(true);
        const base64 = reader.result as string;
        const res = await ApiClient.post<{ success: boolean; url: string }>('/v1/aac/upload-image', {
          image: base64,
          fileName: file.name
        });
        if (res.url) {
          setCardImageUrl(res.url);
          setCardSymbolType('image');
          showToast('Imagem enviada com sucesso!', 'success');
        }
      } catch (err: any) {
        showToast(err.message || 'Erro ao carregar imagem', 'error');
      } finally {
        setUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Salvar Cartão (Criar ou Atualizar)
  const handleSaveCard = async () => {
    if (!cardLabel.trim()) {
      showToast('Informe o texto do cartão', 'info');
      return;
    }

    const targetPage = cardPageId || selectedPageId;
    if (!targetPage) {
      showToast('Selecione uma categoria/página para o cartão', 'info');
      return;
    }

    if ((cardBehavior === 'navigation' || cardBehavior === 'word_and_navigation') && !cardTargetPageId) {
      showToast('Selecione a página de destino da navegação', 'info');
      return;
    }

    try {
      setSavingCard(true);
      const resolvedTargetPageId = (cardBehavior === 'navigation' || cardBehavior === 'word_and_navigation')
        ? (cardTargetPageId || null)
        : null;
      const resolvedCategory = cardBehavior === 'navigation' ? 'navigation' : cardCategory;

      const payload = {
        page_id: targetPage,
        label: cardLabel.trim(),
        spoken_text: cardBehavior === 'navigation' ? '' : (cardSpokenText.trim() || cardLabel.trim()),
        category: resolvedCategory,
        color: cardColor || FITZGERALD_COLORS[resolvedCategory]?.bg || '#f1f5f9',
        symbol_type: cardSymbolType,
        image_url: cardImageUrl,
        target_page_id: resolvedTargetPageId,
        behavior: cardBehavior,
        active: cardActive ? 1 : 0
      };

      if (editingCard) {
        await ApiClient.put(`/v1/aac/boards/${board.id}/cards/${editingCard.id}`, payload);
        showToast('Cartão atualizado!', 'success');
      } else {
        await ApiClient.post(`/v1/aac/boards/${board.id}/cards`, payload);
        showToast('Cartão adicionado à prancha!', 'success');
      }

      setIsCreatingCard(false);
      setEditingCard(null);
      if (targetPage !== selectedPageId) {
        setSelectedPageId(targetPage);
      }
      onBoardUpdated();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar cartão', 'error');
    } finally {
      setSavingCard(false);
    }
  };

  // Duplicar Cartão
  const handleDuplicateCard = async (cardId: string) => {
    try {
      await ApiClient.post(`/v1/aac/boards/${board.id}/cards/${cardId}/duplicate`);
      showToast('Cartão duplicado com sucesso!', 'success');
      onBoardUpdated();
    } catch (err: any) {
      showToast(err.message || 'Erro ao duplicar cartão', 'error');
    }
  };

  // Excluir Cartão
  const handleDeleteCard = async (cardId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este cartão?')) return;

    try {
      await ApiClient.delete(`/v1/aac/boards/${board.id}/cards/${cardId}`);
      showToast('Cartão excluído', 'success');
      onBoardUpdated();
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir cartão', 'error');
    }
  };

  // Mover Cartão (Reordenar)
  const handleMoveCard = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= pageCards.length) return;

    const reordered = [...pageCards];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const cardsPayload = reordered.map((c, idx) => ({
      id: c.id,
      position: idx,
      page_id: selectedPageId
    }));

    try {
      await ApiClient.post(`/v1/aac/boards/${board.id}/reorder-cards`, { cards: cardsPayload });
      onBoardUpdated();
    } catch (err: any) {
      showToast('Erro ao reordenar cartões', 'error');
    }
  };

  // Criar Nova Página
  const handleCreatePage = async () => {
    if (!newPageName.trim()) {
      showToast('Informe o nome da nova página', 'info');
      return;
    }

    try {
      setSavingPage(true);
      const res = await ApiClient.post<any>(`/v1/aac/boards/${board.id}/pages`, {
        name: newPageName.trim(),
        icon: newPageIcon || 'Layers'
      });
      showToast('Nova página criada!', 'success');
      setNewPageName('');
      setIsCreatingPage(false);
      onBoardUpdated();
      if (res.page?.id) {
        setSelectedPageId(res.page.id);
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao criar página', 'error');
    } finally {
      setSavingPage(false);
    }
  };

  // Iniciar Edição de Página (Nome e Ícone)
  const handleStartEditPage = (page: AACPage) => {
    setEditingPage(page);
    setEditPageName(page.name);
    setEditPageIcon(page.icon || 'Layers');
    setIsCreatingPage(false);
  };

  // Salvar Edição de Página
  const handleSaveEditPage = async () => {
    if (!editingPage) return;
    if (!editPageName.trim()) {
      showToast('O nome da categoria é obrigatório', 'info');
      return;
    }
    try {
      setSavingEditPage(true);
      await ApiClient.put(`/v1/aac/boards/${board.id}/pages/${editingPage.id}`, {
        name: editPageName.trim(),
        icon: editPageIcon
      });
      showToast('Categoria atualizada com sucesso!', 'success');
      setEditingPage(null);
      onBoardUpdated();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar categoria', 'error');
    } finally {
      setSavingEditPage(false);
    }
  };

  // Duplicar Página
  const handleDuplicatePage = async (pageId: string) => {
    try {
      await ApiClient.post(`/v1/aac/boards/${board.id}/pages/${pageId}/duplicate`);
      showToast('Categoria duplicada com sucesso!', 'success');
      onBoardUpdated();
    } catch (err: any) {
      showToast(err.message || 'Erro ao duplicar categoria', 'error');
    }
  };

  // Reordenar Páginas (Mover para Cima / Baixo)
  const handleMovePage = async (index: number, direction: 'up' | 'down') => {
    const allPages = board.pages || [];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= allPages.length) return;

    const reordered = [...allPages];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const pagesPayload = reordered.map((p, idx) => ({
      id: p.id,
      position: idx
    }));

    try {
      await ApiClient.post(`/v1/aac/boards/${board.id}/reorder-pages`, { pages: pagesPayload });
      onBoardUpdated();
    } catch (err: any) {
      showToast('Erro ao reordenar categorias', 'error');
    }
  };

  // Excluir Página
  const handleDeletePage = async (pageId: string) => {
    if ((board.pages?.length || 0) <= 1) {
      showToast('A prancha deve possuir pelo menos uma página ativa.', 'error');
      return;
    }

    if (!window.confirm('Excluir esta página e todos os cartões dela? Esta ação não pode ser desfeita.')) return;

    try {
      await ApiClient.delete(`/v1/aac/boards/${board.id}/pages/${pageId}`);
      showToast('Página excluída com sucesso', 'success');
      onBoardUpdated();
      const remainingPages = (board.pages || []).filter(p => p.id !== pageId);
      if (remainingPages.length > 0) {
        setSelectedPageId(remainingPages[0].id);
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir página', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header do Editor */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800">
                Gerenciar Prancha de Comunicação
              </h3>
              <p className="text-xs text-slate-500">
                {board.name} • {board.context || 'Geral'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas do Editor */}
        <div className="flex items-center gap-2 px-6 pt-3 bg-white border-b border-slate-200">
          <button
            type="button"
            onClick={() => { setActiveTab('cards'); setIsCreatingCard(false); }}
            className={`px-4 py-2.5 font-bold text-xs rounded-t-xl transition-all border-b-2 cursor-pointer ${
              activeTab === 'cards'
                ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Cartões & Vocabulário ({pageCards.length})
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('pages'); setEditingPage(null); }}
            className={`px-4 py-2.5 font-bold text-xs rounded-t-xl transition-all border-b-2 cursor-pointer ${
              activeTab === 'pages'
                ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Páginas & Categorias ({board.pages?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 font-bold text-xs rounded-t-xl transition-all border-b-2 cursor-pointer ${
              activeTab === 'settings'
                ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Configurações da Prancha
          </button>
        </div>

        {/* Conteúdo das Abas */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ========================================================================= */}
          {/* ABA 1: CARTÕES */}
          {/* ========================================================================= */}
          {activeTab === 'cards' && (
            <div className="space-y-6">
              {/* Seletor de Página Atual */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Categoria Atual:</span>
                  <select
                    value={selectedPageId}
                    onChange={e => {
                      setSelectedPageId(e.target.value);
                      setIsCreatingCard(false);
                    }}
                    className="text-xs font-bold rounded-xl border border-slate-300 px-3 py-1.5 bg-white text-slate-800 shadow-2xs focus:ring-2 focus:ring-purple-400 focus:outline-hidden"
                  >
                    {(board.pages || []).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.cards?.length || 0} cartões)
                      </option>
                    ))}
                  </select>
                </div>

                {!isCreatingCard && (
                  <button
                    type="button"
                    onClick={handleStartCreateCard}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Cartão nesta Categoria</span>
                  </button>
                )}
              </div>

              {/* Formulário de Adicionar / Editar Cartão */}
              {isCreatingCard ? (
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <h4 className="text-sm font-bold text-slate-800">
                      {editingCard ? 'Editar Cartão' : 'Novo Cartão de CAA'}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsCreatingCard(false)}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>

                  {/* Seletor de Comportamento do Cartão */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Comportamento do Cartão *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCardBehavior('word');
                          setCardTargetPageId('');
                          if (cardCategory === 'navigation') setCardCategory('action');
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          cardBehavior === 'word'
                            ? 'bg-purple-50 border-purple-400 text-purple-900 ring-2 ring-purple-200'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="block text-xs font-black">Palavra / Fala</span>
                        <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">
                          Insere na frase e pronuncia o áudio sintetizado.
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCardBehavior('navigation');
                          setCardCategory('navigation');
                          setCardColor(FITZGERALD_COLORS.navigation.bg);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          cardBehavior === 'navigation'
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-900 ring-2 ring-indigo-200'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="block text-xs font-black flex items-center gap-1">
                          <span>Navegação</span>
                          <CornerDownRight className="w-3 h-3 text-indigo-600" />
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">
                          Apenas abre outra categoria (NÃO fala e NÃO entra na frase).
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCardBehavior('word_and_navigation');
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          cardBehavior === 'word_and_navigation'
                            ? 'bg-blue-50 border-blue-400 text-blue-900 ring-2 ring-blue-200'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="block text-xs font-black">Palavra + Navegação</span>
                        <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">
                          Pronuncia a palavra e abre a categoria de destino.
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Categoria / Página onde o cartão reside (permite transferir de categoria) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Categoria / Página deste Cartão
                      </label>
                      <select
                        value={cardPageId}
                        onChange={e => setCardPageId(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-purple-400 focus:outline-hidden"
                      >
                        {(board.pages || []).map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.id === selectedPageId ? '(atual)' : ''}
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Altere para mover este cartão para outra categoria da prancha.
                      </span>
                    </div>

                    {/* Destino da Navegação quando aplicável */}
                    {cardBehavior !== 'word' ? (
                      <div>
                        <label className="block text-xs font-bold text-indigo-700 mb-1 flex items-center gap-1">
                          <CornerDownRight className="w-3.5 h-3.5" />
                          <span>Página de Destino ao Clicar *</span>
                        </label>
                        <select
                          value={cardTargetPageId}
                          onChange={e => setCardTargetPageId(e.target.value)}
                          className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50/50 focus:ring-2 focus:ring-indigo-400 focus:outline-hidden"
                        >
                          <option value="">Selecione a página de destino…</option>
                          {(board.pages || [])
                            .filter(p => p.id !== cardPageId)
                            .map(p => (
                              <option key={p.id} value={p.id}>
                                Ir para: {p.name} ({p.cards?.length || 0} cartões)
                              </option>
                            ))}
                        </select>
                      </div>
                    ) : (
                      <div className="opacity-40">
                        <label className="block text-xs font-bold text-slate-500 mb-1">
                          Página de Destino
                        </label>
                        <div className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-400">
                          Desativada para cartões de fala simples
                        </div>
                      </div>
                    )}

                    {/* Rótulo Escrito */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Texto Escrito no Cartão *
                      </label>
                      <input
                        type="text"
                        value={cardLabel}
                        onChange={e => {
                          setCardLabel(e.target.value);
                          if (!cardSpokenText || cardSpokenText === cardLabel) {
                            setCardSpokenText(e.target.value);
                          }
                        }}
                        placeholder={cardBehavior === 'navigation' ? 'Ex: Brincadeiras →' : 'Ex: Água, Quero, Banheiro...'}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-purple-400 focus:outline-hidden"
                      />
                    </div>

                    {/* Fala Sintetizada (Spoken text) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        O que a voz deve falar {cardBehavior === 'navigation' && <span className="text-slate-400 font-normal">(Opcional / Não falado)</span>}
                      </label>
                      <input
                        type="text"
                        value={cardSpokenText}
                        onChange={e => setCardSpokenText(e.target.value)}
                        disabled={cardBehavior === 'navigation'}
                        placeholder={cardBehavior === 'navigation' ? 'Cartões de navegação não pronunciam fala' : 'Ex: Quero beber água por favor'}
                        className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 ${
                          cardBehavior === 'navigation' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-purple-400'
                        } focus:outline-hidden`}
                      />
                    </div>

                    {/* Categoria Fitzgerald */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Categoria Semântica (Chave Fitzgerald)
                      </label>
                      <select
                        value={cardCategory}
                        onChange={e => {
                          const cat = e.target.value as AACCategories;
                          setCardCategory(cat);
                          setCardColor(FITZGERALD_COLORS[cat]?.bg || '#f1f5f9');
                        }}
                        disabled={cardBehavior === 'navigation'}
                        className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 ${
                          cardBehavior === 'navigation' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-purple-400'
                        } focus:outline-hidden`}
                      >
                        {Object.entries(FITZGERALD_COLORS).map(([key, meta]) => (
                          <option key={key} value={key}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Símbolo / Ícone / Upload */}
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <label className="block text-xs font-bold text-slate-700">
                      Símbolo Visual do Cartão
                    </label>

                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200">
                        {cardSymbolType === 'image' && cardImageUrl ? (
                          <img
                            src={cardImageUrl}
                            alt="Prévia"
                            className="w-10 h-10 object-cover rounded-lg bg-slate-100"
                          />
                        ) : (
                          <span className="text-3xl select-none" role="img" aria-hidden="true">
                            {cardImageUrl || '💬'}
                          </span>
                        )}
                        <span className="text-xs font-medium text-slate-500">Símbolo atual</span>
                      </div>

                      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors cursor-pointer shadow-2xs">
                        <Upload className="w-3.5 h-3.5 text-slate-600" />
                        <span>{uploadingImage ? 'Enviando foto…' : 'Carregar Foto do Computador'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileChange}
                          disabled={uploadingImage}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Grade de Emojis Populares para Seleção Rápida */}
                    <div className="p-3 bg-white rounded-2xl border border-slate-200 space-y-1">
                      <span className="text-[11px] font-bold text-slate-500 block">
                        Ou escolha um símbolo rápido:
                      </span>
                      <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto p-1">
                        {COMMON_EMOJIS.map(em => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => {
                              setCardImageUrl(em);
                              setCardSymbolType('emoji');
                            }}
                            className={`p-1.5 text-xl rounded-lg transition-transform hover:scale-125 cursor-pointer ${
                              cardImageUrl === em && cardSymbolType === 'emoji'
                                ? 'bg-purple-200 ring-2 ring-purple-500'
                                : 'hover:bg-slate-100'
                            }`}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Status Ativo */}
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="cardActiveCheck"
                      checked={cardActive}
                      onChange={e => setCardActive(e.target.checked)}
                      className="rounded-md border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    <label htmlFor="cardActiveCheck" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                      Cartão visível e ativo na prancha
                    </label>
                  </div>

                  {/* Botões do Formulário */}
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setIsCreatingCard(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCard}
                      disabled={savingCard}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-xs cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{savingCard ? 'Salvando…' : editingCard ? 'Salvar Alterações' : 'Adicionar Cartão'}</span>
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Lista dos Cartões da Página */}
              <div className="space-y-2">
                {pageCards.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-500 text-xs">
                    Nenhum cartão nesta categoria ainda. Clique em "Adicionar Cartão nesta Categoria" acima.
                  </div>
                ) : (
                  pageCards.map((card, idx) => {
                    const meta = FITZGERALD_COLORS[card.category] || FITZGERALD_COLORS.descriptor;
                    const isActive = Boolean(card.active);

                    return (
                      <div
                        key={card.id}
                        className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                          isActive
                            ? 'bg-white border-slate-200 hover:border-purple-300 shadow-2xs'
                            : 'bg-slate-100 border-slate-200 opacity-60'
                        }`}
                      >
                        {/* Informações do Cartão */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            style={{ backgroundColor: card.color || meta.bg, borderColor: meta.border }}
                            className="w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs"
                          >
                            {card.symbol_type === 'image' && card.image_url ? (
                              <img
                                src={card.image_url}
                                alt={card.label}
                                className="w-9 h-9 object-cover rounded-lg bg-white"
                              />
                            ) : (
                              <span className="text-xl select-none" role="img" aria-hidden="true">
                                {card.image_url || '💬'}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-800 uppercase truncate">
                                {card.label}
                              </span>
                              <span
                                style={{ backgroundColor: meta.bg, color: meta.text, borderColor: meta.border }}
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                              >
                                {meta.label}
                              </span>
                              {card.target_page_id && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                                  <CornerDownRight className="w-3 h-3" />
                                  <span>
                                    {board.pages?.find(p => p.id === card.target_page_id)?.name || 'Navega'}
                                  </span>
                                </span>
                              )}
                              {!isActive && (
                                <span className="px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-bold">
                                  Oculto
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {card.category === 'navigation' || card.behavior === 'navigation'
                                ? 'Navegação pura (não reproduz voz)'
                                : card.behavior === 'word_and_navigation'
                                ? `Fala: "${card.spoken_text}" + Navegação`
                                : `Fala: "${card.spoken_text}"`}
                            </p>
                          </div>
                        </div>

                        {/* Ações de Reordenação, Duplicação e Edição */}
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => handleMoveCard(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            title="Mover para cima"
                          >
                            <MoveUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveCard(idx, 'down')}
                            disabled={idx === pageCards.length - 1}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            title="Mover para baixo"
                          >
                            <MoveDown className="w-4 h-4" />
                          </button>

                          {/* Botão Duplicar Cartão */}
                          <button
                            type="button"
                            onClick={() => handleDuplicateCard(card.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                            title="Duplicar cartão"
                          >
                            <Copy className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEditCard(card)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer"
                            title="Editar cartão"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCard(card.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Excluir cartão"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 2: PÁGINAS E CATEGORIAS */}
          {/* ========================================================================= */}
          {activeTab === 'pages' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Páginas e Categorias Temáticas
                  </h4>
                  <p className="text-xs text-slate-500">
                    Crie, renomeie, mude ícones, reordene, duplique ou exclua categorias da prancha.
                  </p>
                </div>

                {!isCreatingPage && !editingPage && (
                  <button
                    type="button"
                    onClick={() => { setIsCreatingPage(true); setNewPageName(''); }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nova Categoria</span>
                  </button>
                )}
              </div>

              {/* Formulário Nova Página */}
              {isCreatingPage && (
                <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-200 space-y-3">
                  <h5 className="text-xs font-bold text-purple-900">Adicionar Nova Categoria</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nome da Categoria *
                      </label>
                      <input
                        type="text"
                        value={newPageName}
                        onChange={e => setNewPageName(e.target.value)}
                        placeholder="Ex: Rotina Escolar, Sentimentos, Brincadeiras..."
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ícone Representativo
                      </label>
                      <select
                        value={newPageIcon}
                        onChange={e => setNewPageIcon(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden"
                      >
                        {AVAILABLE_PAGE_ICONS.map(ic => (
                          <option key={ic.value} value={ic.value}>
                            {ic.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingPage(false)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleCreatePage}
                      disabled={savingPage}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors cursor-pointer shadow-xs"
                    >
                      {savingPage ? 'Criando…' : 'Salvar Categoria'}
                    </button>
                  </div>
                </div>
              )}

              {/* Formulário Editar Página Existente */}
              {editingPage && (
                <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200 space-y-3">
                  <h5 className="text-xs font-bold text-amber-900">Editar Categoria: {editingPage.name}</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nome da Categoria *
                      </label>
                      <input
                        type="text"
                        value={editPageName}
                        onChange={e => setEditPageName(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ícone Representativo
                      </label>
                      <select
                        value={editPageIcon}
                        onChange={e => setEditPageIcon(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden"
                      >
                        {AVAILABLE_PAGE_ICONS.map(ic => (
                          <option key={ic.value} value={ic.value}>
                            {ic.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingPage(null)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEditPage}
                      disabled={savingEditPage}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors cursor-pointer shadow-xs"
                    >
                      {savingEditPage ? 'Salvando…' : 'Salvar Alterações'}
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de Páginas */}
              <div className="space-y-2">
                {(board.pages || []).map((page, pIdx) => (
                  <div
                    key={page.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:border-purple-200 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                        {getCategoryIcon(page.icon)}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          {page.name}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {page.cards?.length || 0} cartões vinculados
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Reordenar Categoria */}
                      <button
                        type="button"
                        onClick={() => handleMovePage(pIdx, 'up')}
                        disabled={pIdx === 0}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                        title="Mover para cima"
                      >
                        <MoveUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMovePage(pIdx, 'down')}
                        disabled={pIdx === (board.pages?.length || 0) - 1}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                        title="Mover para baixo"
                      >
                        <MoveDown className="w-4 h-4" />
                      </button>

                      {/* Duplicar Categoria */}
                      <button
                        type="button"
                        onClick={() => handleDuplicatePage(page.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                        title="Duplicar categoria e seus cartões"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      {/* Editar Nome e Ícone */}
                      <button
                        type="button"
                        onClick={() => handleStartEditPage(page)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer"
                        title="Editar nome e ícone da categoria"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {/* Excluir Categoria */}
                      <button
                        type="button"
                        onClick={() => handleDeletePage(page.id)}
                        disabled={(board.pages?.length || 0) <= 1}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-30 cursor-pointer"
                        title="Excluir página"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 3: CONFIGURAÇÕES DA PRANCHA */}
          {/* ========================================================================= */}
          {activeTab === 'settings' && (
            <div className="max-w-xl space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome da Prancha *
                </label>
                <input
                  type="text"
                  value={boardName}
                  onChange={e => setBoardName(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Contexto de Utilização
                </label>
                <input
                  type="text"
                  value={boardContext}
                  onChange={e => setBoardContext(e.target.value)}
                  placeholder="Ex: Geral, Consultório, Alimentação, Escola..."
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Número de Colunas na Grade (2 a 6)
                </label>
                <div className="flex items-center gap-2">
                  {[2, 3, 4, 5, 6].map(cols => (
                    <button
                      key={cols}
                      type="button"
                      onClick={() => setBoardColumns(cols)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        boardColumns === cols
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {cols} colunas
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações / Descrição Clínica
                </label>
                <textarea
                  value={boardDescription}
                  onChange={e => setBoardDescription(e.target.value)}
                  rows={3}
                  placeholder="Objetivos terapêuticos, orientações para a família ou escola..."
                  className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden"
                />
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-sm cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{savingSettings ? 'Salvando…' : 'Salvar Configurações da Prancha'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AACBoardEditorModal;
