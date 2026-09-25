import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  CornerDownRight,
  Layers,
  Heart,
  AlertCircle,
  Smile,
  Sparkles,
  Coffee,
  Home,
  Users,
  MapPin,
  Play,
  Droplet,
  Activity,
  BookOpen,
  HelpCircle,
  Clock,
  Compass,
  Sun,
  Sliders,
  Palette,
  Hash,
  Tv,
  Moon,
  MessageCircle,
  Search,
  ChevronDown,
  X,
  Undo2,
  Pin
} from 'lucide-react';
import { AACCard, AACPage, AACAccessibilityPrefs, FITZGERALD_COLORS } from './types';

interface AACBoardViewProps {
  pages: AACPage[];
  activePageId: string;
  onSelectPage: (pageId: string) => void;
  onCardClick: (card: AACCard) => void;
  onErrei?: () => void;
  phraseLength?: number;
  columns?: number;
  canManage?: boolean;
  onOpenEditor?: () => void;
  onBack?: () => void;
  onHome?: () => void;
  canGoBack?: boolean;
  accessibilityPrefs?: AACAccessibilityPrefs;
}

const CORE_WORDS_LABELS = ['EU', 'VOCÊ', 'QUERO', 'NÃO QUERO', 'MAIS', 'ACABOU', 'SIM', 'NÃO', 'AJUDA'];

export const AACBoardView: React.FC<AACBoardViewProps> = ({
  pages,
  activePageId,
  onSelectPage,
  onCardClick,
  onErrei,
  phraseLength = 0,
  columns = 4,
  onBack,
  onHome,
  canGoBack = false,
  accessibilityPrefs
}) => {
  const currentPage = pages.find(p => p.id === activePageId) || pages[0];
  const cards = (currentPage?.cards || []).filter(c => Boolean(c.active));

  const isMainPage = pages.length > 0 && pages[0]?.id === currentPage?.id;

  // Estado do dropdown de "Mais categorias" com busca
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const moreRef = useRef<HTMLDivElement>(null);

  // Feedback visual imediato ao tocar no cartão
  const [tappedCardId, setTappedCardId] = useState<string | null>(null);

  const handleCardPress = (card: AACCard) => {
    setTappedCardId(card.id);
    setTimeout(() => {
      setTappedCardId(null);
    }, 220);
    onCardClick(card);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    if (isMoreOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMoreOpen]);

  // Cartão Errei na grade
  const hasErreiCard = typeof onErrei === 'function';
  const totalItems = cards.length + (hasErreiCard ? 1 : 0);

  // Calcula dinamicamente colunas e linhas respeitando as preferências de acessibilidade
  const effectiveCols = useMemo(() => {
    const density = accessibilityPrefs?.gridDensity || 'medium';
    if (density === 'large') {
      if (totalItems <= 4) return 2;
      if (totalItems <= 8) return 3;
      return 4;
    }
    if (density === 'compact') {
      if (totalItems <= 8) return 4;
      if (totalItems <= 15) return 6;
      if (totalItems <= 24) return 7;
      return 8;
    }
    // medium (padrão equilibrado)
    if (columns && columns >= 5) return columns;
    if (totalItems > 18) return 7;
    if (totalItems > 12) return 6;
    if (totalItems > 8) return 5;
    if (totalItems > 4) return 4;
    return columns || 4;
  }, [columns, totalItems, accessibilityPrefs?.gridDensity]);

  const rowCount = Math.max(1, Math.ceil(totalItems / effectiveCols));

  // Ícones clínicos para cada categoria
  const getPageIcon = (iconName?: string) => {
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
        return <MessageCircle className="w-4 h-4" />;
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

  // Ajuste automático de tipografia para o rótulo do cartão
  const getCardLabelStyle = (label: string) => {
    const textSize = accessibilityPrefs?.textSize || 'normal';
    const len = label.length;

    if (textSize === 'extra-large') {
      if (len <= 6) return 'text-sm sm:text-base md:text-lg font-black';
      if (len <= 12) return 'text-xs sm:text-sm md:text-base font-black';
      return 'text-[11px] sm:text-xs md:text-sm font-black';
    }

    if (textSize === 'large') {
      if (len <= 6) return 'text-xs sm:text-sm md:text-base font-black';
      if (len <= 12) return 'text-[11px] sm:text-xs md:text-sm font-extrabold';
      return 'text-[10px] sm:text-[11px] md:text-xs font-bold';
    }

    if (len <= 5) return 'text-xs sm:text-sm md:text-base font-black';
    if (len <= 10) return 'text-[11px] sm:text-xs md:text-sm font-black';
    if (len <= 16) return 'text-[10px] sm:text-[11px] md:text-xs font-extrabold';
    return 'text-[9px] sm:text-[10px] md:text-[11px] font-bold';
  };

  const getSymbolSizeStyle = () => {
    const symSize = accessibilityPrefs?.symbolSize || 'normal';
    if (symSize === 'large') {
      return 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl';
    }
    return 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl';
  };

  const isHighContrast = Boolean(accessibilityPrefs?.highContrast);

  // Cartões do Vocabulário Nuclear Permanente (quando ativado em preferências e não estamos na home)
  const coreCards = useMemo(() => {
    if (!accessibilityPrefs?.pinCoreBar) return [];
    const mainPage = pages[0];
    if (!mainPage || !mainPage.cards) return [];
    return mainPage.cards.filter(c =>
      CORE_WORDS_LABELS.some(label => c.label.toUpperCase().trim() === label)
    );
  }, [accessibilityPrefs?.pinCoreBar, pages]);

  // Separação em categorias principais visíveis e dropdown "Mais categorias"
  const PRIMARY_LIMIT = 7;
  const primaryPages = pages.slice(0, PRIMARY_LIMIT);

  const filteredExtraPages = pages.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${isHighContrast ? 'bg-black text-white' : 'bg-slate-100'} overflow-hidden`}>
      {/* ========================================================================= */}
      {/* 1. BARRA DE NAVEGAÇÃO E CONTROLE INFANTIL FIXA (Nunca rola, sempre previsível) */}
      {/* ========================================================================= */}
      <div className={`px-2.5 py-1.5 ${isHighContrast ? 'bg-neutral-900 border-b-2 border-neutral-700' : 'bg-white border-b border-slate-200'} flex items-center justify-between gap-2 shrink-0 select-none shadow-2xs`}>
        {/* Bloco de Navegação com Posição Espacial 100% Fixa (Canto Superior Esquerdo) */}
        <div className="flex items-center gap-2 shrink-0">
          {isMainPage ? (
            /* Na página Principal: Âncora de INÍCIO fixa no mesmo canto exato */
            <div
              className={`inline-flex items-center gap-1.5 h-10 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-black tracking-wide border-2 ${
                isHighContrast
                  ? 'bg-neutral-800 text-amber-300 border-amber-400'
                  : 'bg-amber-100/90 text-amber-950 border-amber-400 shadow-2xs'
              } cursor-default select-none`}
              title="Você está na tela inicial da prancha"
            >
              <Home className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 stroke-[2.5]" />
              <span>INÍCIO</span>
            </div>
          ) : (
            /* Em TODAS as páginas secundárias: [ ← VOLTAR ] e [ 🏠 INÍCIO ] SEMPRE visíveis e grandes */
            <div className="flex items-center gap-2 shrink-0">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className={`inline-flex items-center justify-center gap-1.5 h-10 sm:h-11 px-3.5 sm:px-4.5 rounded-xl text-xs sm:text-sm font-black tracking-wide transition-all cursor-pointer shadow-sm active:scale-95 ${
                    isHighContrast
                      ? 'bg-blue-600 text-white border-2 border-white hover:bg-blue-700'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-400'
                  }`}
                  title="Voltar 1 página anterior"
                  aria-label="Voltar para a página anterior"
                >
                  <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                  <span>VOLTAR</span>
                </button>
              )}

              {onHome && (
                <button
                  type="button"
                  onClick={onHome}
                  className={`inline-flex items-center justify-center gap-1.5 h-10 sm:h-11 px-3.5 sm:px-4.5 rounded-xl text-xs sm:text-sm font-black tracking-wide transition-all cursor-pointer shadow-sm active:scale-95 ${
                    isHighContrast
                      ? 'bg-amber-500 text-black border-2 border-white hover:bg-amber-600'
                      : 'bg-amber-400 hover:bg-amber-500 text-slate-950 border-2 border-amber-500'
                  }`}
                  title="Voltar diretamente para a página Principal"
                  aria-label="Ir para a página Inicial"
                >
                  <Home className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                  <span>INÍCIO</span>
                </button>
              )}
            </div>
          )}

          {/* Contexto da Página Atual (Símbolo + Nome) */}
          {!isMainPage && currentPage && (
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-black truncate max-w-[200px] md:max-w-xs ${
              isHighContrast
                ? 'bg-neutral-800 text-white border-neutral-700'
                : 'bg-purple-50 text-purple-900 border-purple-200'
            }`}>
              <span className="text-purple-600">{getPageIcon(currentPage.icon)}</span>
              <span className="truncate uppercase">{currentPage.name}</span>
            </div>
          )}
        </div>

        {/* Lado Direito: Abas de Categorias ou Seletor */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin py-0.5">
          {/* Na página principal, mostra as categorias primárias (Símbolo + Palavra, sem contadores numéricos) */}
          {isMainPage && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
              {primaryPages.slice(1).map(p => {
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectPage(p.id)}
                    className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                      isHighContrast
                        ? 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700 border border-neutral-700'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/80'
                    }`}
                  >
                    {getPageIcon(p.icon)}
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Dropdown de Outras Categorias (Sem contadores numéricos) */}
          {pages.length > PRIMARY_LIMIT && (
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => {
                  setIsMoreOpen(!isMoreOpen);
                  setSearchTerm('');
                }}
                className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                  isMoreOpen
                    ? 'bg-purple-100 border-purple-300 text-purple-800'
                    : isHighContrast
                    ? 'bg-neutral-800 border-neutral-600 text-neutral-200 hover:bg-neutral-700'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
                title="Ver todas as categorias"
              >
                <Layers className="w-4 h-4 text-purple-600" />
                <span>Outras Categorias</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMoreOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown com Busca */}
              {isMoreOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-72 max-w-[90vw] bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-2.5 flex flex-col max-h-96 animate-in fade-in zoom-in-95 duration-150 text-slate-800">
                  <div className="relative mb-2 shrink-0">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Buscar categoria..."
                      autoFocus
                      className="w-full text-xs font-medium pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-purple-400 focus:outline-hidden"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="overflow-y-auto space-y-1 pr-0.5 max-h-72">
                    {filteredExtraPages.map(page => {
                      const isCurrent = page.id === currentPage?.id;
                      return (
                        <button
                          key={page.id}
                          type="button"
                          onClick={() => {
                            onSelectPage(page.id);
                            setIsMoreOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer text-left ${
                            isCurrent ? 'bg-purple-600 text-white' : 'hover:bg-purple-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className={isCurrent ? 'text-white' : 'text-purple-600'}>
                              {getPageIcon(page.icon)}
                            </span>
                            <span className="truncate">{page.name}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. GRADE DE CARTÕES SEM ROLAGEM VERTICAL (Área da Criança, Limpa e Tátil) */}
      {/* ========================================================================= */}
      <div className="flex-1 min-h-0 p-1.5 sm:p-2 overflow-hidden flex flex-col">
        {cards.length === 0 && !hasErreiCard ? (
          /* Categoria sem cartões: botão amigável para retornar ao início sem travar o paciente */
          <div className={`h-full w-full flex flex-col items-center justify-center text-center p-6 rounded-2xl border-2 border-dashed ${
            isHighContrast ? 'bg-neutral-900 border-neutral-700 text-neutral-300' : 'bg-white border-slate-300'
          }`}>
            <Sparkles className="w-12 h-12 text-amber-500 mb-2" />
            <h4 className="text-base font-black text-slate-800">Pronto para Voltar</h4>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
              Toque no botão abaixo para voltar à tela inicial da sua prancha.
            </p>
            {onHome && (
              <button
                type="button"
                onClick={onHome}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm shadow-md active:scale-95 transition-all cursor-pointer border-2 border-amber-500"
              >
                <Home className="w-5 h-5" />
                <span>VOLTAR AO INÍCIO</span>
              </button>
            )}
          </div>
        ) : (
          <div
            className="h-full w-full grid gap-1.5 sm:gap-2"
            style={{
              gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`
            }}
          >
            {/* CARTÃO DE AÇÃO RÁPIDA DENTRO DA GRADE: ERREI (Visível para o paciente) */}
            {hasErreiCard && (
              <button
                type="button"
                onClick={onErrei}
                disabled={phraseLength === 0}
                style={{
                  backgroundColor: phraseLength === 0 ? (isHighContrast ? '#1e293b' : '#f8fafc') : (isHighContrast ? '#78350f' : '#fef3c7'),
                  borderColor: phraseLength === 0 ? '#64748b' : (isHighContrast ? '#fbbf24' : '#f59e0b'),
                  color: phraseLength === 0 ? '#94a3b8' : (isHighContrast ? '#fef3c7' : '#78350f')
                }}
                className={`group relative flex flex-col items-center justify-between p-1 sm:p-1.5 rounded-xl sm:rounded-2xl transition-all h-full w-full min-h-0 min-w-0 overflow-hidden select-none ${
                  isHighContrast ? 'border-3 sm:border-4' : 'border-2 sm:border-3'
                } ${
                  phraseLength === 0
                    ? 'opacity-40 cursor-not-allowed shadow-none'
                    : 'shadow-2xs hover:shadow-md active:scale-95 cursor-pointer ring-1 ring-amber-300 hover:bg-amber-200'
                }`}
                title="Apagar apenas a última palavra (Errei)"
                aria-label="Errei, apagar última palavra da frase"
              >
                {/* Ícone Desfazer / Voltar grande */}
                <div className="flex-1 min-h-0 flex items-center justify-center w-full my-0.5 overflow-hidden">
                  <Undo2
                    className={`w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 transition-transform stroke-[2.5] ${
                      phraseLength === 0 ? 'text-slate-400' : 'text-amber-600 group-hover:-rotate-12'
                    }`}
                  />
                </div>

                {/* Rótulo ERREI claro com Símbolo + Palavra */}
                <div className="w-full text-center shrink-0 px-1 py-0.5 min-h-[2.2em] max-h-[3.4em] flex flex-col items-center justify-center">
                  <span
                    className={`block tracking-tight leading-tight text-center font-black uppercase text-xs sm:text-sm md:text-base ${
                      phraseLength === 0 ? 'text-slate-400' : isHighContrast ? 'text-white' : 'text-amber-900'
                    }`}
                  >
                    ERREI
                  </span>
                  <span
                    className={`text-[9px] sm:text-[10px] font-semibold leading-tight ${
                      phraseLength === 0 ? 'text-slate-400' : isHighContrast ? 'text-amber-200' : 'text-amber-700/80'
                    }`}
                  >
                    Desfazer
                  </span>
                </div>
              </button>
            )}

            {/* Cartões da Categoria Atual */}
            {cards.map(card => {
              const meta = FITZGERALD_COLORS[card.category] || FITZGERALD_COLORS.descriptor;
              const isNav = card.category === 'navigation' || card.behavior === 'navigation' || (Boolean(card.target_page_id) && (!card.spoken_text || card.label.endsWith('→')));
              const isRecentlyTapped = tappedCardId === card.id;

              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleCardPress(card)}
                  style={{
                    backgroundColor: isHighContrast
                      ? (isNav ? '#1e1b4b' : card.color || meta.bg)
                      : (isNav ? '#eef2ff' : card.color || meta.bg),
                    borderColor: isHighContrast
                      ? '#ffffff'
                      : (isNav ? '#818cf8' : meta.border),
                    color: isHighContrast
                      ? '#ffffff'
                      : (isNav ? '#312e81' : meta.text)
                  }}
                  className={`group relative flex flex-col items-center justify-between p-1 sm:p-1.5 rounded-xl sm:rounded-2xl transition-all active:scale-95 cursor-pointer h-full w-full min-h-0 min-w-0 overflow-hidden focus:outline-hidden select-none ${
                    isRecentlyTapped ? 'ring-4 ring-purple-500 scale-95 brightness-105' : ''
                  } ${
                    isHighContrast
                      ? 'border-3 sm:border-4 font-black'
                      : isNav
                      ? 'border-2 sm:border-3 ring-2 ring-indigo-200 shadow-xs hover:shadow-md'
                      : 'border-2 sm:border-3 shadow-2xs hover:shadow-md'
                  }`}
                >
                  {/* Badge Exclusivo de Categoria / Pasta para Navegação Clara */}
                  {isNav && (
                    <div
                      className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md bg-indigo-600 text-white font-black text-[9px] sm:text-[10px] flex items-center gap-0.5 shadow-2xs select-none"
                      title="Abre outra tela"
                    >
                      <CornerDownRight className="w-3 h-3 stroke-[2.5]" />
                      <span className="hidden sm:inline">➔</span>
                    </div>
                  )}

                  {/* Símbolo / Ícone / Imagem Central */}
                  <div className="flex-1 min-h-0 flex items-center justify-center w-full my-0.5 overflow-hidden">
                    {card.symbol_type === 'image' && card.image_url ? (
                      <img
                        src={card.image_url}
                        alt={card.label}
                        className="max-h-full max-w-full object-contain rounded-lg bg-white shadow-2xs group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <span
                        className={`${getSymbolSizeStyle()} select-none leading-none group-hover:scale-110 transition-transform`}
                        role="img"
                        aria-hidden="true"
                      >
                        {card.image_url || '💬'}
                      </span>
                    )}
                  </div>

                  {/* Rótulo Escrito com Símbolo + Palavra */}
                  <div className="w-full text-center shrink-0 px-1 py-0.5 min-h-[2.2em] max-h-[3.4em] flex items-center justify-center">
                    <span
                      className={`block tracking-tight leading-tight text-center break-words hyphens-auto uppercase line-clamp-3 ${getCardLabelStyle(
                        card.label
                      )}`}
                      title={card.label}
                    >
                      {card.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. BARRA DE VOCABULÁRIO NUCLEAR PERMANENTE (Core Dock) quando ativada */}
      {/* ========================================================================= */}
      {accessibilityPrefs?.pinCoreBar && !isMainPage && coreCards.length > 0 && (
        <div className={`px-2 py-1.5 ${isHighContrast ? 'bg-neutral-900 border-t-2 border-neutral-700' : 'bg-slate-200/90 border-t border-slate-300'} flex items-center gap-1.5 overflow-x-auto shrink-0 select-none shadow-sm`}>
          <div className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-500 mr-1 shrink-0">
            <Pin className="w-3.5 h-3.5 text-purple-600" />
            <span className="hidden sm:inline">Núcleo</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-thin">
            {coreCards.map(coreCard => {
              const meta = FITZGERALD_COLORS[coreCard.category] || FITZGERALD_COLORS.descriptor;
              return (
                <button
                  key={`dock-${coreCard.id}`}
                  type="button"
                  onClick={() => handleCardPress(coreCard)}
                  style={{
                    backgroundColor: coreCard.color || meta.bg,
                    borderColor: meta.border,
                    color: meta.text
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-black shadow-2xs hover:shadow-xs active:scale-95 transition-all cursor-pointer shrink-0 whitespace-nowrap"
                  title={`Inserir palavra nuclear: ${coreCard.label}`}
                >
                  <span className="text-base select-none leading-none">{coreCard.image_url || '💬'}</span>
                  <span className="uppercase">{coreCard.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AACBoardView;
