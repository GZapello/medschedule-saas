import React from 'react';
import { useOnboarding } from './OnboardingContext';
import { Keyboard, X, Sparkles, Command } from 'lucide-react';

interface ShortcutGroup {
  category: string;
  items: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'Navegação e Sistema',
    items: [
      { keys: ['Alt', 'H'], description: 'Abrir a Central de Ajuda do Zemda' },
      { keys: ['Alt', 'A'], description: 'Abrir o Assistente Inteligente Zemda' },
      { keys: ['ESC'], description: 'Fechar janelas, modais ou cancelar tour ativo' }
    ]
  },
  {
    category: 'Tours Guiados',
    items: [
      { keys: ['Enter', 'ou', '→'], description: 'Avançar para o próximo passo' },
      { keys: ['←'], description: 'Voltar ao passo anterior' },
      { keys: ['ESC'], description: 'Encerrar / pular tour atual' }
    ]
  },
  {
    category: 'Atendimento Clínico',
    items: [
      { keys: ['Ctrl', 'S'], description: 'Salvar anotações manuais no prontuário' },
      { keys: ['Tab'], description: 'Alternar entre campos de texto e formulários' }
    ]
  }
];

export const KeyboardShortcutsModal: React.FC = () => {
  const { isShortcutsOpen, closeShortcuts } = useOnboarding();

  if (!isShortcutsOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200 relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h2 id="shortcuts-modal-title" className="text-sm font-bold text-slate-900 leading-tight">
                Atalhos de Teclado
              </h2>
              <p className="text-[11px] text-slate-500">
                Aumente sua agilidade na rotina clínica
              </p>
            </div>
          </div>

          <button
            onClick={closeShortcuts}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Fechar atalhos"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Grupos de atalhos */}
        <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
          {SHORTCUT_GROUPS.map((group, idx) => (
            <div key={idx} className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                {group.category}
              </span>
              <div className="space-y-1.5">
                {group.items.map((item, itemIdx) => (
                  <div
                    key={itemIdx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/70 border border-slate-100/80 text-xs"
                  >
                    <span className="text-slate-700 font-medium">{item.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, kIdx) => (
                        <kbd
                          key={kIdx}
                          className="px-2 py-0.5 text-[10px] font-bold bg-white text-slate-800 border border-slate-200 rounded-md shadow-2xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button
            onClick={closeShortcuts}
            className="px-4 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
