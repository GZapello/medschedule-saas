import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  CornerDownRight,
  Plus,
  Layers,
  Heart,
  AlertCircle,
  Smile,
  Sparkles,
  Coffee,
  Home,
  MessageSquare,
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
  Undo2
} from 'lucide-react';
import { AACCard, AACPage, FITZGERALD_COLORS } from './types';

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
}

export const AACBoardView: React.FC<AACBoardViewProps> = ({
  pages,
  activePageId,
  onSelectPage,
  onCardClick,
  onErrei,
  phraseLength = 0,
  columns = 4,
  canManage = false,
  onOpenEditor
}) => {
  const currentPage = pages.find(p => p.id === activePageId) || pages[0];
  const cards = (currentPage?.cards || []).filter(c => Boolean(c.active));

  const isMainPage = pages.length > 0 && pages[0]?.id === currentPage?.id;

  // Estado do dropdown de "Mais categorias" com busca
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const moreRef = useRef<HTMLDivElement>(null);

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

  // Calcula dinamicamente colunas e linhas para que todos os cartões caibam sem rolagem vertical
  // Inclui o cartão de ação rápida "Errei" como parte da grade quando fornecido
  const hasErreiCard = typeof onErrei === 'function';
  const totalItems = cards.length + (hasErreiCard ? 1 : 0);

  const effectiveCols = React.useMemo(() => {
    if (columns && columns >= 5) return columns;
    if (totalItems > 18) return 7;
    if (totalItems > 12) return 6;
    if (totalItems > 8) return 5;
    if (totalItems > 4) return 4;
    return columns || 4;
  }, [columns, totalItems]);

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
        return <MessageSquare className="w-3.5 h-3.5" />;
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
    const len = label.length;
    if (len <= 5) return 'text-xs sm:text-sm md:text-base font-black';
    if (len <= 10) return 'text-[11px] sm:text-xs md:text-sm font-black';
    if (len <= 16) return 'text-[10px] sm:text-[11px] md:text-xs font-extrabold';
    return 'text-[9px] sm:text-[10px] md:text-[11px] font-bold';
  };

  // Separação em categorias principais visíveis e dropdown "Mais categorias"
  const PRIMARY_LIMIT = 7;
  const primaryPages = pages.slice(0, PRIMARY_LIMIT);
  const isCurrentInPrimary = primaryPages.some(p => p.id === currentPage?.id);
  const extraPages = pages.slice(PRIMARY_LIMIT);

  const filteredExtraPages = pages.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-100 overflow-hidden">
      {/* Barra de Categorias Responsiva */}
      <div className="px-3 py-1.5 bg-white border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto scrollbar-thin shrink-0">
        <div className="flex items-center gap-1.5 shrink-0">
          {!isMainPage && pages.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectPage(pages[0].id)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 transition-all cursor-pointer shadow-2xs active:scale-95 mr-1"
              title="Voltar para a página principal"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Início</span>
            </button>
          )}

          {/* Categorias Principais */}
          {primaryPages.map((p, idx) => {
            const isActive = p.id === currentPage?.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPage(p.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-2xs ring-1 ring-purple-400'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {getPageIcon(p.icon)}
                <span>{p.name || `Página ${idx + 1}`}</span>
                {p.cards && p.cards.length > 0 && (
                  <span
                    className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      isActive ? 'bg-purple-800 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {p.cards.length}
                  </span>
                )}
              </button>
            );
          })}

          {/* Se a categoria atual não estiver nas primárias, exibe-a destacada */}
          {!isCurrentInPrimary && currentPage && (
            <button
              type="button"
              onClick={() => onSelectPage(currentPage.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 text-white shadow-2xs ring-1 ring-purple-400 whitespace-nowrap cursor-pointer"
            >
              {getPageIcon(currentPage.icon)}
              <span>{currentPage.name}</span>
              {currentPage.cards && currentPage.cards.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-purple-800 text-white">
                  {currentPage.cards.length}
                </span>
              )}
            </button>
          )}

          {/* Botão [ Mais categorias ▾ ] com Dropdown e Busca */}
          {pages.length > PRIMARY_LIMIT && (
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => {
                  setIsMoreOpen(!isMoreOpen);
                  setSearchTerm('');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                  isMoreOpen
                    ? 'bg-purple-100 border-purple-300 text-purple-800'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
                title="Ver todas as categorias disponíveis"
              >
                <Layers className="w-3.5 h-3.5 text-purple-600" />
                <span>Mais categorias ({pages.length - PRIMARY_LIMIT})</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMoreOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Painel Dropdown de Categorias */}
              {isMoreOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-80 max-w-[90vw] bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-2.5 flex flex-col max-h-96 animate-in fade-in zoom-in-95 duration-150">
                  {/* Campo de Busca de Categoria */}
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

                  {/* Lista de Categorias Filtradas */}
                  <div className="overflow-y-auto space-y-1 pr-0.5 max-h-72">
                    {filteredExtraPages.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        Nenhuma categoria encontrada para "{searchTerm}".
                      </div>
                    ) : (
                      filteredExtraPages.map(page => {
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
                              isCurrent
                                ? 'bg-purple-600 text-white'
                                : 'hover:bg-purple-50 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className={isCurrent ? 'text-white' : 'text-purple-600'}>
                                {getPageIcon(page.icon)}
                              </span>
                              <span className="truncate">{page.name}</span>
                            </div>
                            <span
                              className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                                isCurrent
                                  ? 'bg-purple-800 text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {page.cards?.length || 0}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {canManage && onOpenEditor && (
          <button
            type="button"
            onClick={onOpenEditor}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors cursor-pointer shrink-0"
            title="Adicionar ou editar cartões e categorias"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Editar Categorias</span>
          </button>
        )}
      </div>

      {/* Grade de Cartões SEM ROLAGEM VERTICAL (Zero scroll interno, preenchendo toda a largura) */}
      <div className="flex-1 min-h-0 p-1.5 sm:p-2.5 overflow-hidden flex flex-col">
        {cards.length === 0 && !hasErreiCard ? (
          <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 bg-white rounded-2xl border-2 border-dashed border-slate-300">
            <MessageSquare className="w-10 h-10 text-slate-300 mb-2" />
            <h4 className="text-sm font-bold text-slate-700">Esta categoria está vazia</h4>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-3">
              Nenhum cartão cadastrado para a categoria "{currentPage?.name || ''}".
            </p>
            {canManage && onOpenEditor && (
              <button
                type="button"
                onClick={onOpenEditor}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Primeiro Cartão</span>
              </button>
            )}
          </div>
        ) : (
          <div
            className="h-full w-full grid gap-1.5 sm:gap-2.5"
            style={{
              gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`
            }}
          >
            {/* CARTÃO DE AÇÃO RÁPIDA DENTRO DA GRADE: ERREI (Visível para a criança/paciente) */}
            {hasErreiCard && (
              <button
                type="button"
                onClick={onErrei}
                disabled={phraseLength === 0}
                style={{
                  backgroundColor: phraseLength === 0 ? '#f8fafc' : '#fef3c7',
                  borderColor: phraseLength === 0 ? '#e2e8f0' : '#f59e0b',
                  color: phraseLength === 0 ? '#94a3b8' : '#78350f'
                }}
                className={`group relative flex flex-col items-center justify-between p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border-2 sm:border-3 transition-all h-full w-full min-h-0 min-w-0 overflow-hidden select-none ${
                  phraseLength === 0
                    ? 'opacity-40 cursor-not-allowed shadow-none'
                    : 'shadow-2xs hover:shadow-md active:scale-95 cursor-pointer ring-1 ring-amber-300 hover:bg-amber-200'
                }`}
                title="Apagar a última palavra (Errei)"
                aria-label="Errei, apagar última palavra da frase"
              >
                {/* Ícone Desfazer / Voltar grande */}
                <div className="flex-1 min-h-0 flex items-center justify-center w-full my-0.5 overflow-hidden">
                  <Undo2
                    className={`w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 transition-transform ${
                      phraseLength === 0 ? 'text-slate-300' : 'text-amber-600 group-hover:-rotate-12'
                    }`}
                  />
                </div>

                {/* Rótulo ERREI bem visível e claro para o paciente */}
                <div className="w-full text-center shrink-0 px-1 py-0.5 min-h-[2.4em] max-h-[3.6em] flex flex-col items-center justify-center">
                  <span
                    className={`block tracking-tight leading-tight text-center font-black uppercase text-xs sm:text-sm md:text-base ${
                      phraseLength === 0 ? 'text-slate-400' : 'text-amber-900'
                    }`}
                  >
                    ERREI
                  </span>
                  <span
                    className={`text-[9px] sm:text-[10px] font-semibold leading-tight ${
                      phraseLength === 0 ? 'text-slate-400' : 'text-amber-700/80'
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
              const hasTarget = Boolean(card.target_page_id);

              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onCardClick(card)}
                  style={{
                    backgroundColor: card.color || meta.bg,
                    borderColor: meta.border,
                    color: meta.text
                  }}
                  className="group relative flex flex-col items-center justify-between p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border-2 sm:border-3 shadow-2xs hover:shadow-md transition-all active:scale-95 cursor-pointer h-full w-full min-h-0 min-w-0 overflow-hidden focus:outline-hidden focus:ring-2 focus:ring-purple-300"
                >
                  {/* Badge de Navegação para outra página se houver */}
                  {hasTarget && (
                    <span
                      className="absolute top-1 right-1 p-0.5 sm:p-1 rounded-md bg-indigo-600 text-white shadow-2xs z-10"
                      title="Abre outra página"
                    >
                      <CornerDownRight className="w-3 h-3" />
                    </span>
                  )}

                  {/* Símbolo / Ícone / Imagem Central com flex-1 min-h-0 para manter alinhamento */}
                  <div className="flex-1 min-h-0 flex items-center justify-center w-full my-0.5 overflow-hidden">
                    {card.symbol_type === 'image' && card.image_url ? (
                      <img
                        src={card.image_url}
                        alt={card.label}
                        className="max-h-full max-w-full object-contain rounded-lg bg-white shadow-2xs group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <span
                        className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl select-none leading-none group-hover:scale-110 transition-transform"
                        role="img"
                        aria-hidden="true"
                      >
                        {card.image_url || '💬'}
                      </span>
                    )}
                  </div>

                  {/* Rótulo com ajuste automático da palavra (2 a 3 linhas, dinâmico, sem corte) */}
                  <div className="w-full text-center shrink-0 px-1 py-0.5 min-h-[2.4em] max-h-[3.6em] flex items-center justify-center">
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
    </div>
  );
};

export default AACBoardView;
