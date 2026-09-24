import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  Printer,
  Copy,
  Plus,
  Settings,
  MessageSquareHeart,
  Sparkles,
  ChevronDown,
  Layers,
  Info
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AACBoard, AACCard, AACPhraseItem } from './types';
import { AACPhraseBar } from './AACPhraseBar';
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

  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<AACBoard[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<AACBoard | null>(null);
  const [activePageId, setActivePageId] = useState<string>('');

  // Faixa de Frase (Phrase Strip)
  const [phrase, setPhrase] = useState<AACPhraseItem[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakOnClick, setSpeakOnClick] = useState(true);

  // Modos de Exibição
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);

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
        // Carrega os detalhes completos da primeira prancha (ou mantém a já selecionada se existir)
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
          // Mantém a página ativa se ainda existir, senão vai para a primeira
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

  // Alternar Tela Cheia
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
      // Fallback gracioso para fullscreen baseado em CSS (fixed inset-0 z-50)
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

  // Clique no Cartão da Prancha
  const handleCardClick = (card: AACCard) => {
    // 1. Adiciona à faixa de frase
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

    // 2. Se fala instantânea estiver ligada, reproduz APENAS a palavra/termo do cartão
    // A montagem de frases completas é realizada na faixa de frase pelo botão 'Falar'
    if (speakOnClick) {
      speakText(card.label);
    }

    // 3. Se o cartão possui vínculo para abrir outra página, navega para ela
    if (card.target_page_id) {
      setActivePageId(card.target_page_id);
    }
  };

  // Remover Último Cartão da Faixa
  const handleRemoveLast = () => {
    setPhrase(prev => prev.slice(0, -1));
  };

  // Limpar Faixa de Frase
  const handleClearPhrase = () => {
    setPhrase([]);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // Criar Primeira Prancha (com ou sem modelo de vocabulário nuclear)
  const handleCreateStarterBoard = async (useTemplate: boolean) => {
    try {
      setCreatingTemplate(true);
      const res = await ApiClient.post<{ board: AACBoard }>('/v1/aac/boards', {
        patientId,
        name: useTemplate ? 'Prancha de Comunicação Nuclear' : 'Nova Prancha em Branco',
        description: useTemplate
          ? 'Prancha configurada com vocabulário nuclear essencial (Chave Fitzgerald).'
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

  // Imprimir Prancha (A4 limpa sem navbar para uso em papel/plastificação)
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
        {/* Barra Superior / Header */}
        <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-2.5 bg-white border-b border-slate-200 gap-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-purple-100 text-purple-700 shadow-2xs">
              <MessageSquareHeart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-slate-800">
                  Prancha de Comunicação CAA
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800">
                  {canManage ? 'Uso & Gestão' : 'Modo Uso'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Paciente: <span className="font-bold text-slate-700">{patientName || 'Atendimento'}</span>
                {selectedBoard?.context ? ` • ${selectedBoard.context}` : ''}
              </p>
            </div>
          </div>

          {/* Seleção de Pranchas e Controles de Topo */}
          <div className="flex items-center gap-2">
            {boards.length > 1 && (
              <div className="relative">
                <select
                  value={selectedBoard?.id || ''}
                  onChange={e => loadBoardDetail(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 cursor-pointer focus:ring-2 focus:ring-purple-400 focus:outline-hidden"
                >
                  {boards.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}

            {/* Duplicar Prancha (apenas com permissão de gestão) */}
            {canManage && selectedBoard && (
              <button
                type="button"
                onClick={handleDuplicateCurrentBoard}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Duplicar esta prancha"
              >
                <Copy className="w-4 h-4" />
              </button>
            )}

            {/* Imprimir Prancha (A4 para baixa tecnologia) */}
            {selectedBoard && (
              <button
                type="button"
                onClick={handlePrintBoard}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Imprimir prancha para plastificação (Baixa Tecnologia)"
              >
                <Printer className="w-4 h-4" />
              </button>
            )}

            {/* Gerenciar / Editar Prancha (apenas com permissão de gestão) */}
            {canManage && selectedBoard && (
              <button
                type="button"
                onClick={() => setIsEditorOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Personalizar</span>
              </button>
            )}

            {/* Tela Cheia */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isFullscreen
                  ? 'bg-amber-100 border-amber-300 text-amber-900'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title={isFullscreen ? 'Sair da tela cheia (ESC)' : 'Expandir para tela cheia'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Fechar */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer ml-1"
              title="Fechar janela de CAA"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corpo Principal */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-3" />
              <p className="text-xs font-semibold text-slate-500">Carregando pranchas de CAA…</p>
            </div>
          ) : !selectedBoard ? (
            /* Estado quando o paciente NÃO possui nenhuma prancha cadastrada */
            <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 text-center max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-purple-100 text-purple-700 flex items-center justify-center mb-4 shadow-sm">
                <Sparkles className="w-8 h-8" />
              </div>

              <h3 className="text-lg font-black text-slate-800">
                Nenhuma Prancha de Comunicação Ativa
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-2 mb-6">
                {canManage
                  ? `O paciente ${patientName || ''} ainda não possui pranchas cadastradas. Você pode iniciar com o vocabulário nuclear padrão completo ou criar uma em branco.`
                  : `O paciente ${patientName || ''} ainda não possui uma prancha de comunicação cadastrada no prontuário. Solicite a um profissional com permissão de gestão (como Fonoaudiologia ou Terapia Ocupacional) a criação do recurso.`}
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
                    <span>{creatingTemplate ? 'Carregando Vocabulário…' : 'Criar Prancha com Modelo Pronto (Recomendado)'}</span>
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
            /* Visualização Interativa da Prancha */
            <>
              {/* 1. Faixa de Frase (Phrase Bar) fixa no topo */}
              <AACPhraseBar
                phrase={phrase}
                onRemoveLast={handleRemoveLast}
                onClear={handleClearPhrase}
                onSpeak={handleSpeakPhrase}
                isSpeaking={isSpeaking}
                speakOnClick={speakOnClick}
                onToggleSpeakOnClick={() => setSpeakOnClick(!speakOnClick)}
              />

              {/* 2. Grade de Cartões e Seletor de Páginas */}
              <AACBoardView
                pages={selectedBoard.pages || []}
                activePageId={activePageId}
                onSelectPage={setActivePageId}
                onCardClick={handleCardClick}
                columns={selectedBoard.columns || 4}
                canManage={canManage}
                onOpenEditor={() => setIsEditorOpen(true)}
              />
            </>
          )}
        </div>
      </div>

      {/* Modal de Edição da Prancha (Apenas se o usuário tiver AAC_BOARD_MANAGE) */}
      {isEditorOpen && selectedBoard && canManage && (
        <AACBoardEditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          board={selectedBoard}
          onBoardUpdated={() => {
            loadBoardDetail(selectedBoard.id);
          }}
        />
      )}
    </div>
  );
};
export default AACBoardModal;
