import React from 'react';
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
  MessageSquare
} from 'lucide-react';
import { AACCard, AACPage, FITZGERALD_COLORS } from './types';

interface AACBoardViewProps {
  pages: AACPage[];
  activePageId: string;
  onSelectPage: (pageId: string) => void;
  onCardClick: (card: AACCard) => void;
  columns?: number;
  canManage?: boolean;
  onOpenEditor?: () => void;
}

export const AACBoardView: React.FC<AACBoardViewProps> = ({
  pages,
  activePageId,
  onSelectPage,
  onCardClick,
  columns = 4,
  canManage = false,
  onOpenEditor
}) => {
  const currentPage = pages.find(p => p.id === activePageId) || pages[0];
  const cards = (currentPage?.cards || []).filter(c => Boolean(c.active));

  const isMainPage = pages.length > 0 && pages[0]?.id === currentPage?.id;

  // Calcula dinamicamente colunas e linhas para que todos os cartões caibam sem rolagem vertical
  const cardCount = cards.length;
  const effectiveCols = React.useMemo(() => {
    if (columns && columns >= 5) return columns;
    if (cardCount > 14) return 6;
    if (cardCount > 8) return 4;
    return columns || 4;
  }, [columns, cardCount]);

  const rowCount = Math.max(1, Math.ceil(cardCount / effectiveCols));

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
      case 'heart':
        return <Heart className="w-4 h-4" />;
      default:
        return <Layers className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-100 overflow-hidden">
      {/* Barra de Navegação de Páginas da Prancha */}
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

          {pages.map((p, idx) => {
            const isActive = p.id === currentPage?.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPage(p.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {getPageIcon(p.icon)}
                <span>{p.name || `Página ${idx + 1}`}</span>
                {p.cards && p.cards.length > 0 && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      isActive ? 'bg-purple-800 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {p.cards.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {canManage && onOpenEditor && (
          <button
            type="button"
            onClick={onOpenEditor}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors cursor-pointer shrink-0"
            title="Adicionar ou editar cartões desta prancha"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Editar Prancha</span>
          </button>
        )}
      </div>

      {/* Grade de Cartões sem Rolagem Vertical (100% da área útil ajustada proporcionalmente) */}
      <div className="flex-1 min-h-0 p-2 sm:p-3 overflow-hidden flex flex-col justify-center items-center">
        {cards.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center text-center p-6 bg-white rounded-2xl border-2 border-dashed border-slate-300">
            <MessageSquare className="w-10 h-10 text-slate-300 mb-2" />
            <h4 className="text-sm font-bold text-slate-700">Esta página está vazia</h4>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-3">
              Nenhum cartão cadastrado para esta página da prancha de comunicação.
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
            className="h-full w-full grid gap-1.5 sm:gap-2.5 max-w-7xl mx-auto"
            style={{
              gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`
            }}
          >
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
                  className="group relative flex flex-col items-center justify-between p-1 sm:p-2 rounded-xl sm:rounded-2xl border-2 sm:border-3 shadow-2xs hover:shadow-md transition-all active:scale-95 cursor-pointer h-full w-full min-h-0 min-w-0 overflow-hidden focus:outline-hidden focus:ring-2 focus:ring-purple-300"
                >
                  {/* Badge de Navegação para outra página */}
                  {hasTarget && (
                    <span className="absolute top-1 right-1 p-0.5 sm:p-1 rounded-md bg-indigo-600 text-white shadow-2xs z-10" title="Abre outra página">
                      <CornerDownRight className="w-3 h-3" />
                    </span>
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
                        className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl select-none leading-none group-hover:scale-110 transition-transform"
                        role="img"
                        aria-hidden="true"
                      >
                        {card.image_url || '💬'}
                      </span>
                    )}
                  </div>

                  {/* Rótulo / Legenda Escrita */}
                  <div className="w-full text-center shrink-0 px-0.5">
                    <span className="block font-black text-[10px] sm:text-xs md:text-sm tracking-tight leading-tight truncate uppercase">
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
