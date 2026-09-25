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
import { AACBoard, AACCard, AACPhraseItem, FITZGERALD_COLORS, AACAccessibilityPrefs } from './types';
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
  const lastCardTapRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<AACBoard[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<AACBoard | null>(null);
  const [activePageId, setActivePageId] = useState<string>('');

  // Pilha de Histórico de Navegação
  const [navigationStack, setNavigationStack] = useState<string[]>([]);

  // Preferências de Acessibilidade
  const [isAccessibilityOpen, setIsAccessibilityOpen] = useState(false);
  const [accessibilityPrefs, setAccessibilityPrefs] = useState<AACAccessibilityPrefs>(() => {
    try {
      const saved = localStorage.getItem('aac_accessibility_prefs');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {
      gridDensity: 'medium',
      textSize: 'normal',
      symbolSize: 'normal',
      highContrast: false,
      speakOnClick: true,
      speechRate: 0.95,
      voiceURI: '',
      pinCoreBar: false
    };
  });

  const updateAccessibilityPrefs = (patch: Partial<AACAccessibilityPrefs>) => {
    setAccessibilityPrefs(prev => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem('aac_accessibility_prefs', JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  };

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const updateVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        const pt = voices.filter(v => v.lang.startsWith('pt') || v.lang.includes('BR') || v.lang.includes('PT'));
        setAvailableVoices(pt.length > 0 ? pt : voices);
      }
    };
    updateVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  // Faixa de Frase
  const [phrase, setPhrase] = useState<AACPhraseItem[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

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
    if (!text || !text.trim()) {
      if (onEndCallback) onEndCallback();
      return;
    }
    if (!('speechSynthesis' in window)) {
      showToast('Síntese de voz não suportada neste navegador.', 'info');
      if (onEndCallback) onEndCallback();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = accessibilityPrefs.speechRate || 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (accessibilityPrefs.voiceURI) {
      const customVoice = voices.find(v => v.voiceURI === accessibilityPrefs.voiceURI);
      if (customVoice) utterance.voice = customVoice;
    } else {
      const ptVoice = voices.find(v => v.lang.includes('pt-BR') || v.lang.includes('pt_BR') || v.lang.startsWith('pt'));
      if (ptVoice) utterance.voice = ptVoice;
    }

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

  // Clique no Cartão da Prancha:
  // REGRA: Se card.category === 'navigation' OU card.behavior === 'navigation' OU se for atalho com target_page_id (ex: termina em →):
  // SOMENTE navegar; NÃO adicionar à frase; NÃO falar automaticamente; NÃO alterar frase existente.
  const handleCardClick = (card: AACCard) => {
    const now = Date.now();
    // Protege contra toques acidentais repetidos em menos de 350ms no mesmo cartão (espasmos ou tremores motores)
    if (lastCardTapRef.current.id === card.id && (now - lastCardTapRef.current.time) < 350) {
      return;
    }
    lastCardTapRef.current = { id: card.id, time: now };

    const isNavigationOnly =
      card.category === 'navigation' ||
      card.behavior === 'navigation' ||
      (Boolean(card.target_page_id) && (!card.spoken_text || card.label.endsWith('→')));

    if (isNavigationOnly && card.target_page_id) {
      if (activePageId && activePageId !== card.target_page_id) {
        setNavigationStack(prev => [...prev, activePageId]);
      }
      setActivePageId(card.target_page_id);
      return;
    }

    // Cartão de vocabulário comum: adiciona à frase
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

    // Fala apenas o termo do cartão selecionado se a fala ao tocar estiver ligada
    if (accessibilityPrefs.speakOnClick) {
      speakText(card.spoken_text || card.label);
    }

    // Se for cartão híbrido (palavra + navegação)
    if (card.target_page_id && card.behavior === 'word_and_navigation') {
      if (activePageId && activePageId !== card.target_page_id) {
        setNavigationStack(prev => [...prev, activePageId]);
      }
      setActivePageId(card.target_page_id);
    }
  };

  // Histórico de Navegação: Voltar
  const handleBack = () => {
    if (navigationStack.length > 0) {
      const prevPageId = navigationStack[navigationStack.length - 1];
      setNavigationStack(prev => prev.slice(0, -1));
      setActivePageId(prevPageId);
    } else if (selectedBoard?.pages && selectedBoard.pages.length > 0) {
      setActivePageId(selectedBoard.pages[0].id);
    }
  };

  // Retornar diretamente ao Início (Principal)
  const handleHome = () => {
    setNavigationStack([]);
    if (selectedBoard?.pages && selectedBoard.pages.length > 0) {
      setActivePageId(selectedBoard.pages[0].id);
    }
  };

  // Função ERREI: fala "Errei" SEMPRE e remove APENAS a última palavra se houver
  const handleErrei = () => {
    speakText('Errei');
    setPhrase(prev => (prev.length > 0 ? prev.slice(0, -1) : prev));
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
        isFullscreen ? 'p-0 bg-slate-950' : 'p-1.5 sm:p-3'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Prancha de Comunicação CAA"
    >
      <div
        className={`bg-white w-full h-full flex flex-col overflow-hidden shadow-2xl transition-all ${
          isFullscreen ? 'rounded-none' : 'rounded-2xl sm:rounded-3xl max-w-[98vw] max-h-[97vh] h-[96vh] border border-slate-200'
        }`}
      >
        {/* ========================================================================= */}
        {/* 1. TOPO ULTRACOMPACTO: [ frase compacta ] [ 🔊 Falar ] [ ⚙ Acessibilidade ] [ ✕ ] */}
        {/* ========================================================================= */}
        {selectedBoard ? (
          <div className="bg-white px-2.5 sm:px-3 py-1 border-b border-slate-200 flex items-center justify-between gap-1.5 sm:gap-2 shrink-0 z-30 shadow-2xs h-9 sm:h-10">
            {/* [ FRASE COMPACTA (texto / mini-tokens flex-1) ] */}
            <div
              ref={phraseContainerRef}
              className="flex-1 flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-lg min-h-[28px] max-h-[30px] overflow-x-auto scrollbar-none"
              role="region"
              aria-label="Faixa compacta da frase"
            >
              {phrase.length === 0 ? (
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] select-none italic font-medium truncate">
                  <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                  <span>Toque nos cartões para formar a frase…</span>
                </div>
              ) : (
                phrase.map((item, idx) => {
                  const meta = FITZGERALD_COLORS[item.category] || FITZGERALD_COLORS.descriptor;
                  return (
                    <React.Fragment key={`${item.id}-${idx}`}>
                      {idx > 0 && <span className="text-slate-300 font-bold select-none text-[10px]">·</span>}
                      <span
                        style={{
                          backgroundColor: item.color || meta.bg,
                          borderColor: meta.border,
                          color: meta.text
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-black border shadow-2xs shrink-0 select-none whitespace-nowrap"
                      >
                        {item.symbol_type === 'image' && item.image_url ? (
                          <img
                            src={item.image_url}
                            alt=""
                            className="w-3.5 h-3.5 rounded object-cover"
                          />
                        ) : (
                          <span className="text-xs select-none leading-none" role="img" aria-hidden="true">
                            {item.image_url || '💬'}
                          </span>
                        )}
                        <span>{item.label}</span>
                      </span>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            {/* [ 🔊 FALAR ] */}
            <button
              type="button"
              onClick={handleSpeakPhrase}
              disabled={phrase.length === 0 || isSpeaking}
              className={`h-7 sm:h-7.5 inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 rounded-lg font-black text-xs shadow-2xs transition-all cursor-pointer shrink-0 select-none ${
                phrase.length === 0
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : isSpeaking
                  ? 'bg-amber-500 text-white animate-pulse ring-2 ring-amber-200'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
              }`}
              title="Falar frase completa montada"
            >
              <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'animate-bounce' : ''}`} />
              <span>{isSpeaking ? 'Falando…' : 'Falar'}</span>
            </button>

            {/* [ ⚙ ACESSIBILIDADE ] */}
            <button
              type="button"
              onClick={() => setIsAccessibilityOpen(true)}
              className="h-7 sm:h-7.5 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-lg font-bold text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer shrink-0 select-none"
              title="Acessibilidade, voz, tamanho e ajustes"
            >
              <Settings className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Acessibilidade</span>
            </button>

            {/* Fechar discreto */}
            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              title="Fechar janela de CAA"
            >
              <X className="w-4 h-4" />
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
                  ? `O paciente ${patientName || ''} ainda não possui pranchas cadastradas. Você pode iniciar com a prancha completa contendo mais de 30 categorias clínicas e vocabulário dinâmico pré-configurado.`
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
                    <span>{creatingTemplate ? 'Carregando Categorias…' : 'Criar Prancha com Modelo Pronto (Recomendado)'}</span>
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
              onSelectPage={(pageId) => {
                if (pageId !== activePageId) {
                  setNavigationStack(prev => [...prev, activePageId]);
                }
                setActivePageId(pageId);
              }}
              onCardClick={handleCardClick}
              onErrei={handleErrei}
              phraseLength={phrase.length}
              columns={selectedBoard.columns || 4}
              canManage={canManage}
              onOpenEditor={() => {
                setEditorInitialTab('cards');
                setIsEditorOpen(true);
              }}
              onBack={handleBack}
              onHome={handleHome}
              canGoBack={navigationStack.length > 0 || (selectedBoard.pages && selectedBoard.pages[0]?.id !== activePageId)}
              accessibilityPrefs={accessibilityPrefs}
            />
          )}
        </div>
      </div>

      {/* Modal / Painel de Acessibilidade e Ajustes */}
      {isAccessibilityOpen && (
        <div
          className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="acc-title"
        >
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="acc-title" className="text-sm font-black text-slate-800">
                    Acessibilidade & Ajustes da Prancha
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Personalize para necessidades visuais, motoras e de voz
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAccessibilityOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Corpo das Opções com Scroll */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              {/* 1. Presets de Densidade de Grade */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-2">
                  Densidade da Grade (Necessidade Motora / Visual)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => updateAccessibilityPrefs({ gridDensity: 'large' })}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      accessibilityPrefs.gridDensity === 'large'
                        ? 'bg-purple-50 border-purple-500 text-purple-900 ring-2 ring-purple-200 font-black'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-black text-xs">Grande</span>
                    <span className="text-[10px] text-slate-500">3-4 cartões maiores</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateAccessibilityPrefs({ gridDensity: 'medium' })}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      accessibilityPrefs.gridDensity === 'medium'
                        ? 'bg-purple-50 border-purple-500 text-purple-900 ring-2 ring-purple-200 font-black'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-black text-xs">Médio</span>
                    <span className="text-[10px] text-slate-500">Grade padrão</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateAccessibilityPrefs({ gridDensity: 'compact' })}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      accessibilityPrefs.gridDensity === 'compact'
                        ? 'bg-purple-50 border-purple-500 text-purple-900 ring-2 ring-purple-200 font-black'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-black text-xs">Completo</span>
                    <span className="text-[10px] text-slate-500">Mais vocabulário</span>
                  </button>
                </div>
              </div>

              {/* 2. Visual: Tamanho do Texto, Símbolos e Alto Contraste */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800">Alto Contraste</span>
                    <p className="text-[10px] text-slate-500">Bordas reforçadas e fundo de alta legibilidade</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateAccessibilityPrefs({ highContrast: !accessibilityPrefs.highContrast })}
                    className={`px-3 py-1 rounded-full text-xs font-black transition-colors cursor-pointer ${
                      accessibilityPrefs.highContrast
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {accessibilityPrefs.highContrast ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800">Tamanho do Texto</span>
                    <p className="text-[10px] text-slate-500">Escala de fonte dos cartões</p>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    {(['normal', 'large', 'extra-large'] as const).map(sz => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => updateAccessibilityPrefs({ textSize: sz })}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize transition-colors cursor-pointer ${
                          accessibilityPrefs.textSize === sz
                            ? 'bg-white text-purple-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {sz === 'normal' ? 'Normal' : sz === 'large' ? 'Grande' : 'Muito Grande'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800">Tamanho dos Símbolos</span>
                    <p className="text-[10px] text-slate-500">Ícones e emojis centrais ampliados</p>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    {(['normal', 'large'] as const).map(symSz => (
                      <button
                        key={symSz}
                        type="button"
                        onClick={() => updateAccessibilityPrefs({ symbolSize: symSz })}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize transition-colors cursor-pointer ${
                          accessibilityPrefs.symbolSize === symSz
                            ? 'bg-white text-purple-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {symSz === 'normal' ? 'Normal' : 'Amplo'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800">Fixar Barra de Núcleo Permanente</span>
                    <p className="text-[10px] text-slate-500">Mantém Eu, Quero, Não, Mais na mesma posição</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateAccessibilityPrefs({ pinCoreBar: !accessibilityPrefs.pinCoreBar })}
                    className={`px-3 py-1 rounded-full text-xs font-black transition-colors cursor-pointer ${
                      accessibilityPrefs.pinCoreBar
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {accessibilityPrefs.pinCoreBar ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* 3. Síntese de Voz (TTS) */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800">Fala ao Tocar no Cartão</span>
                    <p className="text-[10px] text-slate-500">Reproduz a palavra de cada cartão ao clicar</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateAccessibilityPrefs({ speakOnClick: !accessibilityPrefs.speakOnClick })}
                    className={`px-3 py-1 rounded-full text-xs font-black transition-colors cursor-pointer ${
                      accessibilityPrefs.speakOnClick
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {accessibilityPrefs.speakOnClick ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-800">Velocidade da Voz</span>
                    <span className="font-mono text-[11px] font-bold text-indigo-700">
                      {accessibilityPrefs.speechRate}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.05"
                    value={accessibilityPrefs.speechRate}
                    onChange={e => updateAccessibilityPrefs({ speechRate: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400">
                    <span>Mais Lenta (0.5x)</span>
                    <span>Padrão (1.0x)</span>
                    <span>Mais Rápida (1.5x)</span>
                  </div>
                </div>

                {availableVoices.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Voz em Português
                    </label>
                    <select
                      value={accessibilityPrefs.voiceURI || ''}
                      onChange={e => updateAccessibilityPrefs({ voiceURI: e.target.value })}
                      className="w-full text-xs rounded-xl border border-slate-300 p-2 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-400"
                    >
                      <option value="">Voz Padrão do Sistema (Automática)</option>
                      {availableVoices.map(v => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 4. Ações Rápidas & Ferramentas Profissionais */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                  Ações da Prancha
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleClearPhrase();
                      setIsAccessibilityOpen(false);
                    }}
                    disabled={phrase.length === 0}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold text-left cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>Limpar frase</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleToggleFullscreen();
                      setIsAccessibilityOpen(false);
                    }}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors font-bold text-left cursor-pointer"
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4 shrink-0" /> : <Maximize2 className="w-4 h-4 shrink-0" />}
                    <span>{isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handlePrintBoard();
                      setIsAccessibilityOpen(false);
                    }}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors font-bold text-left cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>Imprimir A4</span>
                  </button>

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        handleDuplicateCurrentBoard();
                        setIsAccessibilityOpen(false);
                      }}
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors font-bold text-left cursor-pointer"
                    >
                      <Copy className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>Duplicar prancha</span>
                    </button>
                  )}
                </div>

                {canManage && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditorInitialTab('cards');
                        setIsEditorOpen(true);
                        setIsAccessibilityOpen(false);
                      }}
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors font-bold text-left cursor-pointer"
                    >
                      <Settings className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Editar Cartões</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditorInitialTab('pages');
                        setIsEditorOpen(true);
                        setIsAccessibilityOpen(false);
                      }}
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors font-bold text-left cursor-pointer"
                    >
                      <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Editar Categorias</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsAccessibilityOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-white font-bold text-xs hover:bg-slate-900 transition-colors cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

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
