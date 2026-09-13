import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  Send,
  X,
  Calendar,
  FileText,
  DollarSign,
  Users,
  Building2,
  Maximize2,
  Zap,
  ArrowRight
} from 'lucide-react';
import { Tenant } from '../../types';
import { openZemdaAI } from '../../utils/aiHelper';

interface QuickAIAssistantShortcutProps {
  tenant: Tenant | null;
  onOpenCopilot: () => void;
}

export const QuickAIAssistantShortcut: React.FC<QuickAIAssistantShortcutProps> = ({
  tenant,
  onOpenCopilot
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [quickInput, setQuickInput] = useState<string>('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const clinicName = tenant?.trade_name || tenant?.name || 'Sua Clínica';
  const logoUrl = tenant?.logo_url;

  // Fecha o popover ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Executa atalho rápido enviando o comando direto para o Copilot
  const handleQuickAction = (prompt: string) => {
    setIsOpen(false);
    openZemdaAI({
      prompt,
      autoSend: true
    });
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    const prompt = quickInput.trim();
    setQuickInput('');
    setIsOpen(false);
    openZemdaAI({
      prompt,
      autoSend: true
    });
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 select-none">
      {/* Popover do Assistente Rápido de Atalho */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute bottom-16 left-0 w-80 sm:w-92 rounded-3xl bg-slate-900/95 backdrop-blur-xl border border-teal-500/30 shadow-2xl shadow-teal-950/60 p-4.5 space-y-3.5 z-50 text-slate-200 animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          {/* Cabeçalho do Popover */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Logo com fundo transparente no cabeçalho */}
              <div className="w-8 h-8 rounded-xl bg-transparent flex items-center justify-center overflow-hidden flex-shrink-0 border border-teal-500/30">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={clinicName}
                    className="w-full h-full object-contain bg-transparent"
                  />
                ) : (
                  <Building2 className="w-4 h-4 text-teal-400" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-white text-xs truncate">{clinicName}</h4>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-teal-500/20 text-teal-300 text-[9px] font-black border border-teal-500/30">
                    <Sparkles className="w-2.5 h-2.5 text-teal-300" />
                    IA
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">Assistente Rápido de Inteligência Clínica</p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Atalhos Rápidos em 1 Clique */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-1">
              Atalhos Rápidos com IA
            </span>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button
                onClick={() =>
                  handleQuickAction(
                    'Quero agendar uma consulta rápida. Por favor, me mostre os próximos horários disponíveis na agenda hoje.'
                  )
                }
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-teal-950/60 hover:border-teal-500/40 border border-slate-700/60 text-left text-slate-200 hover:text-white transition-all flex items-center gap-2 cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-medium leading-tight truncate">Agendar Horário</span>
              </button>

              <button
                onClick={() =>
                  handleQuickAction(
                    'Preciso criar um modelo de evolução clínica recente com histórico do paciente. Como devo estruturar?'
                  )
                }
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-teal-950/60 hover:border-teal-500/40 border border-slate-700/60 text-left text-slate-200 hover:text-white transition-all flex items-center gap-2 cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-medium leading-tight truncate">Evolução Clínica</span>
              </button>

              <button
                onClick={() =>
                  handleQuickAction(
                    'Faça um resumo executivo dos pacientes atendidos hoje e do status das consultas na agenda.'
                  )
                }
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-teal-950/60 hover:border-teal-500/40 border border-slate-700/60 text-left text-slate-200 hover:text-white transition-all flex items-center gap-2 cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-medium leading-tight truncate">Resumo do Dia</span>
              </button>

              <button
                onClick={() =>
                  handleQuickAction(
                    'Qual é o balanço financeiro e fechamento de caixa registrado para as consultas de hoje?'
                  )
                }
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-teal-950/60 hover:border-teal-500/40 border border-slate-700/60 text-left text-slate-200 hover:text-white transition-all flex items-center gap-2 cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <DollarSign className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-medium leading-tight truncate">Balanço de Caixa</span>
              </button>
            </div>
          </div>

          {/* Campo de Comando Rápido */}
          <form onSubmit={handleInputSubmit} className="relative pt-1">
            <input
              type="text"
              value={quickInput}
              onChange={e => setQuickInput(e.target.value)}
              placeholder="Digite um comando rápido para a IA..."
              className="w-full pl-3.5 pr-9 py-2.5 rounded-xl bg-slate-950/90 border border-slate-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-xs text-white placeholder-slate-500 outline-none transition-all"
              autoFocus
            />
            <button
              type="submit"
              disabled={!quickInput.trim()}
              className="absolute right-1.5 top-2 p-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 disabled:opacity-30 disabled:hover:bg-teal-500 text-slate-950 transition-all cursor-pointer"
              title="Enviar comando"
            >
              <Send className="w-3 h-3" />
            </button>
          </form>

          {/* Botão de Abertura do Painel Completo */}
          <button
            onClick={() => {
              setIsOpen(false);
              onOpenCopilot();
            }}
            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-teal-500/15 via-indigo-500/15 to-teal-500/15 hover:from-teal-500/25 hover:to-indigo-500/25 border border-teal-500/30 text-teal-300 hover:text-teal-200 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Abrir Copilot Completo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Botão Flutuante de Atalho (Logo da Clínica + Fundo Transparente + Indicadores de IA) */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(prev => !prev)}
        className="relative group flex items-center justify-center w-12 h-12 rounded-2xl bg-transparent hover:bg-white/10 active:scale-95 transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-400/50"
        title={`Assistente IA • ${clinicName}\nClique para abrir os atalhos rápidos`}
        aria-label="Assistente IA da Clínica"
      >
        {/* Halo / Aura animada de Inteligência Artificial */}
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-teal-400 via-cyan-400 to-indigo-500 opacity-75 group-hover:opacity-100 blur-xs group-hover:blur-sm transition-all duration-500 animate-pulse pointer-events-none" />

        {/* Container Central com Fundo Transparente e Borda Tecnológica */}
        <div className="relative w-11 h-11 rounded-2xl bg-slate-950/20 backdrop-blur-xs flex items-center justify-center overflow-hidden border border-teal-400/60 group-hover:border-teal-300 shadow-lg shadow-teal-500/20 group-hover:shadow-teal-400/30 transition-all">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={clinicName}
              className="w-8 h-8 object-contain bg-transparent drop-shadow-sm group-hover:scale-105 transition-transform"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-transparent text-teal-300 font-black text-base drop-shadow-xs">
              {(tenant?.name?.charAt(0) || 'Z').toUpperCase()}
            </div>
          )}
        </div>

        {/* Selo / Chip Superior Indicando ser IA */}
        <div className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 rounded-full bg-gradient-to-r from-teal-500 to-indigo-600 border border-white/40 shadow-md flex items-center gap-0.5 text-white text-[8.5px] font-black tracking-wider uppercase pointer-events-none">
          <Sparkles className="w-2 h-2 text-amber-300 fill-amber-300" />
          <span>IA</span>
        </div>

        {/* Ponto de Status Online da IA com efeito Radar/Ping */}
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900 flex items-center justify-center pointer-events-none shadow-xs">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        </div>
      </button>
    </div>
  );
};

export default QuickAIAssistantShortcut;
