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

  // Mapeamento dinâmico de grid columns
  const getGridColsClass = (cols: number) => {
    switch (cols) {
      case 2:
        return 'grid-cols-2';
      case 3:
        return 'grid-cols-2 sm:grid-cols-3';
      case 5:
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5';
      case 6:
        return 'grid-cols-2 sm:grid-cols-4 md:grid-cols-6';
      case 4:
      default:
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4';
    }
  };

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
    <div className="flex-1 flex flex-col min-h-0 bg-slate-100">
      {/* Barra de Navegação de Páginas da Prancha */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto scrollbar-thin">
        <div className="flex items-center gap-1.5 shrink-0">
          {!isMainPage && pages.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectPage(pages[0].id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 transition-all cursor-pointer shadow-xs active:scale-95 mr-2"
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
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-purple-600 text-white shadow-sm'
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
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors cursor-pointer shrink-0"
            title="Adicionar ou editar cartões desta prancha"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Editar Prancha</span>
          </button>
        )}
      </div>

      {/* Grade de Cartões */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {cards.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 bg-white rounded-3xl border-2 border-dashed border-slate-300">
            <MessageSquare className="w-12 h-12 text-slate-300 mb-3" />
            <h4 className="text-base font-bold text-slate-700">Esta página está vazia</h4>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
              Nenhum cartão cadastrado para esta página da prancha de comunicação.
            </p>
            {canManage && onOpenEditor && (
              <button
                type="button"
                onClick={onOpenEditor}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Primeiro Cartão</span>
              </button>
            )}
          </div>
        ) : (
          <div className={`grid ${getGridColsClass(columns)} gap-3 sm:gap-4 max-w-7xl mx-auto`}>
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
                  className="group relative flex flex-col items-center justify-between p-3 sm:p-4 rounded-2xl sm:rounded-3xl border-3 shadow-xs hover:shadow-md transition-all active:scale-95 cursor-pointer min-h-[110px] sm:min-h-[140px] focus:outline-hidden focus:ring-4 focus:ring-purple-300"
                >
                  {/* Badge de Navegação para outra página */}
                  {hasTarget && (
                    <span className="absolute top-2 right-2 p-1 rounded-lg bg-indigo-600 text-white shadow-xs" title="Abre outra página">
                      <CornerDownRight className="w-3.5 h-3.5" />
                    </span>
                  )}

                  {/* Símbolo / Ícone / Imagem Central */}
                  <div className="flex-1 flex items-center justify-center w-full my-1">
                    {card.symbol_type === 'image' && card.image_url ? (
                      <img
                        src={card.image_url}
                        alt={card.label}
                        className="w-14 h-14 sm:w-20 sm:h-20 object-cover rounded-xl bg-white shadow-xs group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <span
                        className="text-3xl sm:text-5xl select-none group-hover:scale-110 transition-transform"
                        role="img"
                        aria-hidden="true"
                      >
                        {card.image_url || '💬'}
                      </span>
                    )}
                  </div>

                  {/* Rótulo / Legenda Escrita */}
                  <div className="w-full text-center mt-1">
                    <span className="block font-black text-xs sm:text-sm sm:tracking-tight leading-tight line-clamp-2 uppercase">
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
