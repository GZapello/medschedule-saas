import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  Printer,
  Copy,
  Plus,
  Settings,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  Volume2,
  VolumeX,
  Sparkles,
  Layers,
  Info
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AACBoard, AACCard, AACPhraseItem, FITZGERALD_COLORS } from './types';
import { AACBoardView } from './AACBoardView';
import { AACBoardEditorModal } from './AACBoardEditorModal';

export interface AACBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
}

export const AACBoardModal: React.FC<AACBoardModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName
}) => {
  const { hasCapability } = useAuth();
  const { showToast } = useToast();

  const canUse = hasCapability('AAC_BOARD_USE');
  const canManage = hasCapability('AAC_BOARD_MANAGE');

  const containerRef = useRef<HTMLDivElement>(null);
  const phraseContainerRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<AACBoard[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<AACBoard | null>(null);
  const [activePageId, setActivePageId] = useState<string>('');

  // Faixa de Frase
  const [phrase, setPhrase] = useState<AACPhraseItem[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakOnClick, setSpeakOnClick] = useState(true);

  // Painel Dropdown de "Mais Opções"
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);

  // Modos de Exibição e Edição
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorInitialTab, setEditorInitialTab] = useState<'cards' | 'pages' | 'settings'>('cards');
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  // Auto-scroll da faixa de frase quando uma nova palavra entra
  useEffect(() => {
    if (phraseContainerRef.current) {
      phraseContainerRef.current.scrollLeft = phraseContainerRef.current.scrollWidth;
    }
  }, [phrase.length]);

  // Fechar dropdown de opções ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target as Node)) {
        setIsOptionsMenuOpen(false);
      }
    };
    if (isOptionsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOptionsMenuOpen]);

  // Carregar Pranchas do Paciente
  const loadBoards = useCallback(async () => {
    if (!patientId) return;
    try {
      setLoading(true);
      const res = await ApiClient.get<{ boards: AACBoard[]; patientName?: string }>(
        `/v1/aac/boards?patientId=${patientId}`
      );
      const list = res.boards || [];
      setBoards(list);

      if (list.length > 0) {
        const targetId = selectedBoard?.id && list.some(b => b.id === selectedBoard.id)
          ? selectedBoard.id
          : list[0].id;
        await loadBoardDetail(targetId);
      } else {
        setSelectedBoard(null);
        setActivePageId('');
      }
    } catch (err: any) {
      console.warn('Erro ao carregar pranchas de CAA:', err);
      showToast(err.message || 'Erro ao carregar pranchas de comunicação.', 'error');
    } finally {
      setLoading(false);
    }
  }, [patientId, selectedBoard?.id]);

  const loadBoardDetail = async (boardId: string) => {
    try {
      const res = await ApiClient.get<{ board: AACBoard }>(`/v1/aac/boards/${boardId}`);
      if (res.board) {
        setSelectedBoard(res.board);
        if (res.board.pages && res.board.pages.length > 0) {
          setActivePageId(prev =>
            res.board.pages?.some(p => p.id === prev) ? prev : res.board.pages![0].id
          );
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar detalhes da prancha:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadBoards();
    }
  }, [isOpen, loadBoards]);

  // Sincronização de Tela Cheia com a Fullscreen API do navegador
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  const handleToggleFullscreen = async () => {
    try {
      if (!isFullscreen) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (_) {
      setIsFullscreen(!isFullscreen);
    }
  };

  // Síntese de Voz (Web Speech API)
  const speakText = (text: string, onEndCallback?: () => void) => {
    if (!('speechSynthesis' in window)) {
      showToast('Síntese de voz não suportada neste navegador.', 'info');
      if (onEndCallback) onEndCallback();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.includes('pt-BR') || v.lang.includes('pt_BR') || v.lang.startsWith('pt'));
    if (ptVoice) utterance.voice = ptVoice;

    utterance.onend = () => {
      setIsSpeaking(false);
      if (onEndCallback) onEndCallback();
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      if (onEndCallback) onEndCallback();
    };

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  // Reproduzir Frase Completa da Faixa
  const handleSpeakPhrase = () => {
    if (phrase.length === 0) return;
    const fullText = phrase.map(item => item.spoken_text || item.label).join(' ');
    speakText(fullText);
  };

  // Clique no Cartão da Prancha: fala SOMENTE a palavra do cartão!
  const handleCardClick = (card: AACCard) => {
    setPhrase(prev => [
      ...prev,
      {
        id: card.id,
        label: card.label,
        spoken_text: card.spoken_text || card.label,
        category: card.category,
        color: card.color,
        symbol_type: card.symbol_type,
        image_url: card.image_url
      }
    ]);

    // Fala apenas o termo do cartão selecionado
    if (speakOnClick) {
      speakText(card.label);
    }

    if (card.target_page_id) {
      setActivePageId(card.target_page_id);
    }
  };

  // Função ERREI: remove APENAS a última palavra, atualiza imediatamente e NÃO reproduz a frase
  const handleErrei = () => {
    setPhrase(prev => prev.slice(0, -1));
    setIsOptionsMenuOpen(false);
  };

  // Limpar Frase Inteira
  const handleClearPhrase = () => {
    setPhrase([]);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // Criar Primeira Prancha
  const handleCreateStarterBoard = async (useTemplate: boolean) => {
    try {
      setCreatingTemplate(true);
      const res = await ApiClient.post<{ board: AACBoard }>('/v1/aac/boards', {
        patientId,
        name: useTemplate ? 'Prancha de Comunicação Nuclear' : 'Nova Prancha em Branco',
        description: useTemplate
          ? 'Prancha configurada com vocabulário nuclear completo (Chave Fitzgerald).'
          : 'Prancha criada em branco.',
        context: 'Geral & Consultório',
        columns: 4,
        useStarterTemplate: useTemplate
      });

      showToast('Prancha de comunicação criada com sucesso!', 'success');
      await loadBoards();
      if (res.board) {
        setSelectedBoard(res.board);
        if (res.board.pages && res.board.pages.length > 0) {
          setActivePageId(res.board.pages[0].id);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao criar prancha de comunicação.', 'error');
    } finally {
      setCreatingTemplate(false);
    }
  };

  // Duplicar Prancha Atual
  const handleDuplicateCurrentBoard = async () => {
    if (!selectedBoard) return;
    try {
      const res = await ApiClient.post<{ board: AACBoard }>(
        `/v1/aac/boards/${selectedBoard.id}/duplicate`
      );
      showToast('Prancha duplicada com sucesso!', 'success');
      await loadBoards();
      if (res.board) {
        setSelectedBoard(res.board);
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao duplicar prancha.', 'error');
    }
  };

  // Imprimir Prancha
  const handlePrintBoard = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex flex-col justify-center items-center ${
        isFullscreen ? 'p-0 bg-slate-950' : 'p-2 sm:p-5'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Prancha de Comunicação CAA"
    >
      <div
        className={`bg-white w-full h-full flex flex-col overflow-hidden shadow-2xl transition-all ${
          isFullscreen ? 'rounded-none' : 'rounded-2xl sm:rounded-3xl max-w-7xl max-h-[96vh] sm:h-[94vh] border border-slate-200'
        }`}
      >
        {/* ========================================================================= */}
        {/* 1. TOPO MAIS LIMPO: [ FRASE / PALAVRAS ]   [ 🔊 FALAR ]   [ ••• MAIS OPÇÕES ] */}
        {/* ========================================================================= */}
        {selectedBoard ? (
          <div className="bg-white px-3 sm:px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 z-30 shadow-2xs">
            {/* [ FRASE / PALAVRAS SELECIONADAS ] */}
            <div
              ref={phraseContainerRef}
              className="flex-1 flex items-center gap-1.5 p-1.5 bg-slate-50 border border-slate-300 rounded-xl min-h-[46px] sm:min-h-[50px] overflow-x-auto scroll-smooth focus:outline-hidden"
              role="region"
              aria-label="Faixa de construção da frase"
            >
              {phrase.length === 0 ? (
                <div className="flex items-center gap-2 px-2 text-slate-400 text-xs select-none italic font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>Toque nos cartões para formar a frase do paciente…</span>
                </div>
              ) : (
                phrase.map((item, idx) => {
                  const meta = FITZGERALD_COLORS[item.category] || FITZGERALD_COLORS.descriptor;
                  return (
                    <div
                      key={`${item.id}-${idx}`}
                      style={{
                        backgroundColor: item.color || meta.bg,
                        borderColor: meta.border,
                        color: meta.text
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-2xs shrink-0 transition-transform animate-in fade-in zoom-in-95 duration-150"
                    >
                      {item.symbol_type === 'image' && item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.label}
                          className="w-6 h-6 rounded-md object-cover bg-white shrink-0"
                        />
                      ) : (
                        <span className="text-lg sm:text-xl select-none leading-none shrink-0" role="img" aria-hidden="true">
                          {item.image_url || '💬'}
                        </span>
                      )}
                      <span className="text-xs sm:text-sm font-black whitespace-nowrap">
                        {item.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* [ 🔊 FALAR ] */}
            <button
              type="button"
              onClick={handleSpeakPhrase}
              disabled={phrase.length === 0 || isSpeaking}
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 sm:px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm shadow-sm transition-all cursor-pointer shrink-0 ${
                phrase.length === 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  : isSpeaking
                  ? 'bg-amber-500 text-white animate-pulse ring-2 ring-amber-200'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md active:scale-95'
              }`}
              title="Reproduzir frase inteira por síntese de voz (Web Speech)"
            >
              <Volume2 className={`w-4 h-4 ${isSpeaking ? 'animate-bounce' : ''}`} />
              <span>{isSpeaking ? 'Falando…' : 'Falar'}</span>
            </button>

            {/* [ ••• MAIS OPÇÕES ] */}
            <div className="relative shrink-0" ref={optionsMenuRef}>
              <button
                type="button"
                onClick={() => setIsOptionsMenuOpen(!isOptionsMenuOpen)}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-bold text-xs sm:text-sm border transition-all cursor-pointer ${
                  isOptionsMenuOpen
                    ? 'bg-purple-100 border-purple-300 text-purple-800'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
                title="Mais opções e configurações da prancha"
                aria-expanded={isOptionsMenuOpen}
              >
                <MoreHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Mais opções</span>
              </button>

              {/* PAINEL PARA BAIXO com todos os controles */}
              {isOptionsMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 flex flex-col space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  {/* Função ERREI */}
                  <button
                    type="button"
                    onClick={handleErrei}
                    disabled={phrase.length === 0}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-left"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      <span className="block font-black">Errei</span>
                      <span className="text-[10px] text-slate-400 font-normal">Apaga apenas a última palavra</span>
                    </div>
                  </button>

                  {/* Limpar frase */}
                  <button
                    type="button"
                    onClick={() => {
                      handleClearPhrase();
                      setIsOptionsMenuOpen(false);
                    }}
                    disabled={phrase.length === 0}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-left"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                    <div>
                      <span className="block font-black">Limpar frase</span>
                      <span className="text-[10px] text-rose-400 font-normal">Apaga todas as palavras selecionadas</span>
                    </div>
                  </button>

                  {/* Fala ao tocar ON/OFF */}
                  <button
                    type="button"
                    onClick={() => {
                      setSpeakOnClick(!speakOnClick);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      {speakOnClick ? (
                        <Volume2 className="w-4 h-4 text-indigo-600 shrink-0" />
                      ) : (
                        <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span>Fala ao tocar no cartão</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        speakOnClick ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {speakOnClick ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <div className="my-1 border-t border-slate-100" />

                  {/* Duplicar prancha */}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        handleDuplicateCurrentBoard();
                        setIsOptionsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                    >
                      <Copy className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>Duplicar prancha</span>
                    </button>
                  )}

                  {/* Imprimir */}
                  <button
                    type="button"
                    onClick={() => {
                      handlePrintBoard();
                      setIsOptionsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                  >
                    <Printer className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Imprimir (Plastificação A4)</span>
                  </button>

                  {/* Personalizar */}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditorInitialTab('cards');
                        setIsEditorOpen(true);
                        setIsOptionsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors cursor-pointer text-left"
                    >
                      <Settings className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Personalizar prancha e cartões</span>
                    </button>
                  )}

                  {/* Editar categorias */}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditorInitialTab('pages');
                        setIsEditorOpen(true);
                        setIsOptionsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors cursor-pointer text-left"
                    >
                      <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Editar categorias</span>
                    </button>
                  )}

                  <div className="my-1 border-t border-slate-100" />

                  {/* Trocar prancha se houver mais de uma */}
                  {boards.length > 1 && (
                    <div className="px-3 py-1.5">
                      <label className="block text-[10px] font-bold text-slate-400 mb-1">
                        Trocar prancha ativa:
                      </label>
                      <select
                        value={selectedBoard?.id || ''}
                        onChange={e => {
                          loadBoardDetail(e.target.value);
                          setIsOptionsMenuOpen(false);
                        }}
                        className="w-full text-xs font-bold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-hidden"
                      >
                        {boards.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Tela Cheia */}
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleFullscreen();
                      setIsOptionsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4 text-amber-600 shrink-0" />
                    ) : (
                      <Maximize2 className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                    <span>{isFullscreen ? 'Sair da tela cheia (ESC)' : 'Tela cheia'}</span>
                  </button>

                  {/* Fechar prancha */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsOptionsMenuOpen(false);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer text-left"
                  >
                    <X className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Fechar janela de CAA</span>
                  </button>
                </div>
              )}
            </div>

            {/* Fechar discreto */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 ml-1"
              title="Fechar janela de CAA"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          /* Header simples para quando não há prancha selecionada */
          <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shrink-0">
            <h2 className="text-sm sm:text-base font-black text-slate-800">
              Prancha de Comunicação CAA
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Corpo Principal da Prancha */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-3" />
              <p className="text-xs font-semibold text-slate-500">Carregando pranchas de CAA…</p>
            </div>
          ) : !selectedBoard ? (
            /* Estado quando o paciente não possui nenhuma prancha cadastrada */
            <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 text-center max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-purple-100 text-purple-700 flex items-center justify-center mb-4 shadow-sm">
                <Sparkles className="w-8 h-8" />
              </div>

              <h3 className="text-lg font-black text-slate-800">
                Nenhuma Prancha de Comunicação Ativa
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-2 mb-6">
                {canManage
                  ? `O paciente ${patientName || ''} ainda não possui pranchas cadastradas. Você pode iniciar com a prancha completa contendo 27 categorias clínicas e vocabulário amplo pré-configurado.`
                  : `O paciente ${patientName || ''} ainda não possui uma prancha de comunicação cadastrada no prontuário. Solicite a um profissional com permissão de gestão (Fonoaudiologia ou Terapia Ocupacional) a criação do recurso.`}
              </p>

              {canManage ? (
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
                  <button
                    type="button"
                    onClick={() => handleCreateStarterBoard(true)}
                    disabled={creatingTemplate}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs sm:text-sm shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{creatingTemplate ? 'Carregando 27 Categorias…' : 'Criar Prancha com Modelo Pronto (Recomendado)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCreateStarterBoard(false)}
                    disabled={creatingTemplate}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Criar em Branco</span>
                  </button>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 p-3 rounded-2xl bg-slate-100 text-slate-600 text-xs font-medium">
                  <Info className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Modo de visualização ativo. Aguardando configuração da prancha por profissional habilitado.</span>
                </div>
              )}
            </div>
          ) : (
            /* Visualização Interativa dos Cartões e Categorias */
            <AACBoardView
              pages={selectedBoard.pages || []}
              activePageId={activePageId}
              onSelectPage={setActivePageId}
              onCardClick={handleCardClick}
              columns={selectedBoard.columns || 4}
              canManage={canManage}
              onOpenEditor={() => {
                setEditorInitialTab('cards');
                setIsEditorOpen(true);
              }}
            />
          )}
        </div>
      </div>

      {/* Modal de Edição da Prancha */}
      {isEditorOpen && selectedBoard && canManage && (
        <AACBoardEditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          board={selectedBoard}
          initialTab={editorInitialTab}
          onBoardUpdated={() => {
            loadBoardDetail(selectedBoard.id);
          }}
        />
      )}
    </div>
  );
};

export default AACBoardModal;
