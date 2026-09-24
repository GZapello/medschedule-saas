import React, { useState } from 'react';
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
  Eye,
  EyeOff
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { AACBoard, AACCard, AACPage, AACCategories, FITZGERALD_COLORS } from './types';

interface AACBoardEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: AACBoard;
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

export const AACBoardEditorModal: React.FC<AACBoardEditorModalProps> = ({
  isOpen,
  onClose,
  board,
  onBoardUpdated
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'cards' | 'pages' | 'settings'>('cards');
  const [selectedPageId, setSelectedPageId] = useState<string>(
    board.pages?.[0]?.id || ''
  );

  // Estados de Configuração da Prancha
  const [boardName, setBoardName] = useState(board.name || '');
  const [boardDescription, setBoardDescription] = useState(board.description || '');
  const [boardContext, setBoardContext] = useState(board.context || 'Geral');
  const [boardColumns, setBoardColumns] = useState(board.columns || 4);
  const [savingSettings, setSavingSettings] = useState(false);

  // Estados de Edição de Cartão
  const [editingCard, setEditingCard] = useState<AACCard | null>(null);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
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

  // Estados de Edição de Página
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  const [newPageIcon, setNewPageIcon] = useState('Layers');
  const [savingPage, setSavingPage] = useState(false);

  if (!isOpen) return null;

  const currentPage = board.pages?.find(p => p.id === selectedPageId) || board.pages?.[0];
  const pageCards = currentPage?.cards || [];

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
    setCardLabel('');
    setCardSpokenText('');
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
    setCardLabel(card.label);
    setCardSpokenText(card.spoken_text);
    setCardCategory(card.category);
    setCardColor(card.color || FITZGERALD_COLORS[card.category]?.bg || '#f1f5f9');
    setCardSymbolType(card.symbol_type || 'emoji');
    setCardImageUrl(card.image_url || '💬');
    setCardTargetPageId(card.target_page_id || '');
    setCardActive(Boolean(card.active));
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

    if (!selectedPageId) {
      showToast('Selecione uma página para o cartão', 'info');
      return;
    }

    try {
      setSavingCard(true);
      const payload = {
        page_id: selectedPageId,
        label: cardLabel.trim(),
        spoken_text: cardSpokenText.trim() || cardLabel.trim(),
        category: cardCategory,
        color: cardColor || FITZGERALD_COLORS[cardCategory]?.bg || '#f1f5f9',
        symbol_type: cardSymbolType,
        image_url: cardImageUrl,
        target_page_id: cardTargetPageId || null,
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
      onBoardUpdated();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar cartão', 'error');
    } finally {
      setSavingCard(false);
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
            onClick={() => setActiveTab('pages')}
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
          {/* ABA 1: CARTÕES */}
          {activeTab === 'cards' && (
            <div className="space-y-6">
              {/* Seletor de Página Atual */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">Página Atual:</span>
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
                    <span>Adicionar Cartão nesta Página</span>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        placeholder="Ex: Água, Quero, Banheiro..."
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-purple-400 focus:outline-hidden"
                      />
                    </div>

                    {/* Fala Sintetizada (Spoken text) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        O que a voz deve falar
                      </label>
                      <input
                        type="text"
                        value={cardSpokenText}
                        onChange={e => setCardSpokenText(e.target.value)}
                        placeholder="Ex: Quero beber água por favor"
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-purple-400 focus:outline-hidden"
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
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-purple-400 focus:outline-hidden"
                      >
                        {Object.entries(FITZGERALD_COLORS).map(([key, meta]) => (
                          <option key={key} value={key}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Link para Outra Página (Navegação) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Navegar para outra página ao clicar?
                      </label>
                      <select
                        value={cardTargetPageId}
                        onChange={e => setCardTargetPageId(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-purple-400 focus:outline-hidden"
                      >
                        <option value="">Nenhuma (permanecer nesta página)</option>
                        {(board.pages || [])
                          .filter(p => p.id !== selectedPageId)
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              Ir para: {p.name}
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
                    Nenhum cartão nesta página ainda. Clique em "Adicionar Cartão nesta Página" acima.
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
                                  <CornerDownRight className="w-3 h-3" /> Navega
                                </span>
                              )}
                              {!isActive && (
                                <span className="px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-bold">
                                  Inativo
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              Fala: "{card.spoken_text}"
                            </p>
                          </div>
                        </div>

                        {/* Ações de Reordenação e Edição */}
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

          {/* ABA 2: PÁGINAS */}
          {activeTab === 'pages' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Páginas e Categorias Temáticas
                  </h4>
                  <p className="text-xs text-slate-500">
                    Organize as diferentes telas de comunicação da prancha.
                  </p>
                </div>

                {!isCreatingPage && (
                  <button
                    type="button"
                    onClick={() => { setIsCreatingPage(true); setNewPageName(''); }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nova Página</span>
                  </button>
                )}
              </div>

              {/* Formulário Nova Página */}
              {isCreatingPage && (
                <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-200 space-y-3">
                  <h5 className="text-xs font-bold text-purple-900">Adicionar Nova Página</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nome da Página *
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
                        <option value="Layers">Camadas (Padrão)</option>
                        <option value="Home">Início / Casa</option>
                        <option value="AlertCircle">Necessidades / Alerta</option>
                        <option value="Smile">Sentimentos / Emoções</option>
                        <option value="Sparkles">Atividades / Lazer</option>
                        <option value="Coffee">Alimentos & Bebidas</option>
                        <option value="Heart">Saúde & Cuidados</option>
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
                      {savingPage ? 'Criando…' : 'Salvar Página'}
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de Páginas */}
              <div className="space-y-2">
                {(board.pages || []).map((page, pIdx) => (
                  <div
                    key={page.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                        {pIdx + 1}
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

          {/* ABA 3: CONFIGURAÇÕES DA PRANCHA */}
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
                          ? 'bg-purple-600 text-white shadow-xs'
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
                  Descrição / Observações Clínicas da Prancha
                </label>
                <textarea
                  value={boardDescription}
                  onChange={e => setBoardDescription(e.target.value)}
                  rows={3}
                  placeholder="Objetivos clínicos, nível de comunicador e recomendações para parceiros comunicativos..."
                  className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden"
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-xs cursor-pointer"
                >
                  {savingSettings ? 'Salvando…' : 'Salvar Configurações'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
