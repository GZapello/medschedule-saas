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

  // Contagem dos cartões de sistema fixos dentro da grade
  // Principal: 1. INÍCIO | 2. ERREI (2 cartões de sistema)
  // Secundárias: 1. INÍCIO | 2. VOLTAR | 3. ERREI (3 cartões de sistema)
  const systemCardsCount = isMainPage ? 2 : 3;
  const totalItems = cards.length + systemCardsCount;

  // Calcula dinamicamente colunas e linhas respeitando as preferências de acessibilidade e os cartões de sistema
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
        return <Home className="w-3.5 h-3.5" />;
      case 'alertcircle':
      case 'alert':
        return <AlertCircle className="w-3.5 h-3.5" />;
      case 'smile':
        return <Smile className="w-3.5 h-3.5" />;
      case 'sparkles':
        return <Sparkles className="w-3.5 h-3.5" />;
      case 'coffee':
        return <Coffee className="w-3.5 h-3.5" />;
      case 'users':
        return <Users className="w-3.5 h-3.5" />;
      case 'mappin':
        return <MapPin className="w-3.5 h-3.5" />;
      case 'play':
        return <Play className="w-3.5 h-3.5" />;
      case 'droplet':
        return <Droplet className="w-3.5 h-3.5" />;
      case 'activity':
        return <Activity className="w-3.5 h-3.5" />;
      case 'heart':
        return <Heart className="w-3.5 h-3.5" />;
      case 'bookopen':
        return <BookOpen className="w-3.5 h-3.5" />;
      case 'helpcircle':
        return <HelpCircle className="w-3.5 h-3.5" />;
      case 'messagesquare':
        return <MessageCircle className="w-3.5 h-3.5" />;
      case 'clock':
        return <Clock className="w-3.5 h-3.5" />;
      case 'compass':
        return <Compass className="w-3.5 h-3.5" />;
      case 'sun':
        return <Sun className="w-3.5 h-3.5" />;
      case 'sliders':
        return <Sliders className="w-3.5 h-3.5" />;
      case 'palette':
        return <Palette className="w-3.5 h-3.5" />;
      case 'hash':
        return <Hash className="w-3.5 h-3.5" />;
      case 'tv':
        return <Tv className="w-3.5 h-3.5" />;
      case 'moon':
        return <Moon className="w-3.5 h-3.5" />;
      case 'messagecircle':
        return <MessageCircle className="w-3.5 h-3.5" />;
      default:
        return <Layers className="w-3.5 h-3.5" />;
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
      {/* BARRA DE CATEGORIAS SUPERIOR (Apenas categorias, sem Início/Voltar na barra) */}
      {/* ========================================================================= */}
      <div className={`px-2.5 py-1.5 ${isHighContrast ? 'bg-neutral-900 border-b-2 border-neutral-700' : 'bg-white border-b border-slate-200'} flex items-center justify-between gap-2 overflow-x-auto scrollbar-thin shrink-0 select-none shadow-2xs`}>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
          {primaryPages.map((p, idx) => {
            const isActive = p.id === currentPage?.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPage(p.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-2xs ring-1 ring-purple-400'
                    : isHighContrast
                    ? 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {getPageIcon(p.icon)}
                <span>{p.name || `Página ${idx + 1}`}</span>
              </button>
            );
          })}

          {/* Se a categoria atual não estiver entre as primárias, exibe-a com destaque */}
          {!primaryPages.some(p => p.id === currentPage?.id) && currentPage && (
            <button
              type="button"
              onClick={() => onSelectPage(currentPage.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 text-white shadow-2xs ring-1 ring-purple-400 whitespace-nowrap cursor-pointer"
            >
              {getPageIcon(currentPage.icon)}
              <span>{currentPage.name}</span>
            </button>
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
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                  isMoreOpen
                    ? 'bg-purple-100 border-purple-300 text-purple-800'
                    : isHighContrast
                    ? 'bg-neutral-800 border-neutral-600 text-neutral-200 hover:bg-neutral-700'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
                title="Ver todas as categorias"
              >
                <Layers className="w-3.5 h-3.5 text-purple-600" />
                <span>Outras Categorias</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMoreOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown com Busca */}
              {isMoreOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-72 max-w-[90vw] bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-2.5 flex flex-col max-h-96 animate-in fade-in zoom-in-95 duration-150 text-slate-800">
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
      {/* GRADE DE CARTÕES DA PRANCHA COM CARTÕES DE SISTEMA DENTRO DA GRADE */}
      {/* POSIÇÕES FIXAS: */}
      {/* PRINCIPAL: 1. INÍCIO | 2. ERREI | 3. RESTANTE */}
      {/* SECUNDÁRIAS: 1. INÍCIO | 2. VOLTAR | 3. ERREI | 4. RESTANTE */}
      {/* ========================================================================= */}
      <div className="flex-1 min-h-0 p-1.5 sm:p-2 overflow-hidden flex flex-col">
        <div
          className="h-full w-full grid gap-1.5 sm:gap-2"
          style={{
            gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`
          }}
        >
          {/* =================================================================== */}
          {/* POSIÇÃO 1: CARTÃO DE SISTEMA [ 🏠 INÍCIO ] (Em TODAS as páginas)   */}
          {/* =================================================================== */}
          <button
            type="button"
            onClick={() => {
              if (onHome) onHome();
            }}
            style={{
              backgroundColor: isHighContrast ? '#f59e0b' : '#fef3c7',
              borderColor: isHighContrast ? '#000000' : '#f59e0b',
              color: isHighContrast ? '#000000' : '#78350f'
            }}
            className={`group relative flex flex-col items-center justify-between p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border-2 sm:border-3 shadow-2xs hover:shadow-md transition-all active:scale-95 cursor-pointer h-full w-full min-h-0 min-w-0 overflow-hidden select-none ${
              isHighContrast ? 'border-4 ring-2 ring-black font-black' : 'ring-1 ring-amber-300 hover:bg-amber-200'
            }`}
            title="Retornar à página Principal"
            aria-label="Início, ir para página Principal"
          >
            <div className="flex-1 min-h-0 flex items-center justify-center w-full my-0.5 overflow-hidden">
              <Home
                className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 text-amber-600 transition-transform group-hover:scale-110 stroke-[2.5]"
              />
            </div>
            <div className="w-full text-center shrink-0 px-1 py-0.5 min-h-[2.2em] max-h-[3.4em] flex flex-col items-center justify-center">
              <span className={`block tracking-tight leading-tight text-center font-black uppercase text-xs sm:text-sm md:text-base ${
                isHighContrast ? 'text-black' : 'text-amber-900'
              }`}>
                INÍCIO
              </span>
              <span className={`text-[9px] sm:text-[10px] font-semibold leading-tight ${
                isHighContrast ? 'text-black/80' : 'text-amber-700/80'
              }`}>
                Principal
              </span>
            </div>
          </button>

          {/* =================================================================== */}
          {/* POSIÇÃO 2: CARTÃO DE SISTEMA [ ↩ VOLTAR ] (Nas páginas secundárias) */}
          {/* =================================================================== */}
          {!isMainPage && (
            <button
              type="button"
              onClick={() => {
                if (onBack) onBack();
              }}
              style={{
                backgroundColor: isHighContrast ? '#3b82f6' : '#e0e7ff',
                borderColor: isHighContrast ? '#000000' : '#818cf8',
                color: isHighContrast ? '#000000' : '#312e81'
              }}
              className={`group relative flex flex-col items-center justify-between p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border-2 sm:border-3 shadow-2xs hover:shadow-md transition-all active:scale-95 cursor-pointer h-full w-full min-h-0 min-w-0 overflow-hidden select-none ${
                isHighContrast ? 'border-4 ring-2 ring-black font-black' : 'ring-1 ring-indigo-300 hover:bg-indigo-200'
              }`}
              title="Voltar para a página anterior"
              aria-label="Voltar para página anterior"
            >
              <div className="flex-1 min-h-0 flex items-center justify-center w-full my-0.5 overflow-hidden">
                <Undo2
                  className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 text-indigo-600 transition-transform group-hover:-translate-x-1 stroke-[2.5]"
                />
              </div>
              <div className="w-full text-center shrink-0 px-1 py-0.5 min-h-[2.2em] max-h-[3.4em] flex flex-col items-center justify-center">
                <span className={`block tracking-tight leading-tight text-center font-black uppercase text-xs sm:text-sm md:text-base ${
                  isHighContrast ? 'text-black' : 'text-indigo-900'
                }`}>
                  VOLTAR
                </span>
                <span className={`text-[9px] sm:text-[10px] font-semibold leading-tight ${
                  isHighContrast ? 'text-black/80' : 'text-indigo-700/80'
                }`}>
                  Retornar
                </span>
              </div>
            </button>
          )}

          {/* =================================================================== */}
          {/* POSIÇÃO 3 (ou 2 na Principal): CARTÃO DE SISTEMA [ ↶ ERREI ]       */}
          {/* Fala "Errei" e remove a última palavra da frase montada             */}
          {/* =================================================================== */}
          {Boolean(onErrei) && (
            <button
              type="button"
              onClick={onErrei}
              style={{
                backgroundColor: isHighContrast ? '#ef4444' : '#fee2e2',
                borderColor: isHighContrast ? '#000000' : '#f87171',
                color: isHighContrast ? '#000000' : '#991b1b'
              }}
              className={`group relative flex flex-col items-center justify-between p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border-2 sm:border-3 shadow-2xs hover:shadow-md transition-all active:scale-95 cursor-pointer h-full w-full min-h-0 min-w-0 overflow-hidden select-none ${
                isHighContrast ? 'border-4 ring-2 ring-black font-black' : 'ring-1 ring-rose-300 hover:bg-rose-200'
              }`}
              title="Falar 'Errei' e apagar a última palavra"
              aria-label="Errei, apagar última palavra"
            >
              <div className="flex-1 min-h-0 flex items-center justify-center w-full my-0.5 overflow-hidden">
                <Undo2
                  className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 text-rose-600 transition-transform group-hover:-rotate-12 stroke-[2.5]"
                />
              </div>
              <div className="w-full text-center shrink-0 px-1 py-0.5 min-h-[2.2em] max-h-[3.4em] flex flex-col items-center justify-center">
                <span className={`block tracking-tight leading-tight text-center font-black uppercase text-xs sm:text-sm md:text-base ${
                  isHighContrast ? 'text-black' : 'text-rose-950'
                }`}>
                  ERREI
                </span>
                <span className={`text-[9px] sm:text-[10px] font-semibold leading-tight ${
                  isHighContrast ? 'text-black/80' : 'text-rose-800/80'
                }`}>
                  Desfazer
                </span>
              </div>
            </button>
          )}

          {/* =================================================================== */}
          {/* RESTANTE DOS CARTÕES DA CATEGORIA ATUAL                             */}
          {/* =================================================================== */}
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
                {/* Badge de Navegação para cartões de pasta/categoria */}
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

                {/* Rótulo Escrito */}
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
      </div>

      {/* ========================================================================= */}
      {/* BARRA DE VOCABULÁRIO NUCLEAR PERMANENTE (Core Dock) quando ativada         */}
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
