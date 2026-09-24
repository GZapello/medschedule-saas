import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  Send,
  Bot,
  User,
  RotateCcw,
  Lightbulb,
  CheckCircle2,
  TrendingUp,
  Dumbbell,
  Lock
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Student } from './types';

interface PersonalAIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  student?: Student | null;
  studentsList?: Student[];
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

const QUICK_PROMPTS = [
  'Sugerir progressão de carga calculada para o aluno',
  'Analisar a distribuição de volume semanal por grupamento',
  'Interpretar evolução da composição corporal (Pollock)',
  'Propor divisão de treino otimizada para hipertrofia',
  'Ajustar exercícios considerando possíveis dores ou restrições'
];

export const PersonalAIAssistantModal: React.FC<PersonalAIAssistantModalProps> = ({
  isOpen,
  onClose,
  student,
  studentsList = []
}) => {
  const { showToast } = useToast();

  const [selectedStudentId, setSelectedStudentId] = useState(student?.id || '');
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: student
        ? `Olá! Sou o **Assistente de Treinamento ZemdaPersonal** para **${student.name}**.\n\nEstou integrado com os dados reais de avaliações físicas, periodização e histórico de treinos de **${student.name}**.\nComo posso ajudar na prescrição ou análise de treino hoje?`
        : `Olá! Sou o **Assistente de Treinamento e Fisiologia ZemdaPersonal**.\n\nEstou integrado com os dados reais de avaliações físicas, dobras cutâneas, divisões de treino e recordes pessoais do aluno.\nComo posso ajudar no planejamento ou na análise hoje?`,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (student) setSelectedStudentId(student.id);
  }, [student]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: 'msg-' + Date.now(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setLoading(true);

    try {
      const historyPayload = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          sender: m.sender,
          text: m.text
        }));

      const res = await ApiClient.post<{ response: string; modelUsed: string }>('/v1/personal/ai/assistant', {
        studentId: selectedStudentId || undefined,
        message: query,
        conversationHistory: historyPayload
      });

      const assistantMsg: ChatMessage = {
        id: 'msg-' + (Date.now() + 1),
        sender: 'assistant',
        text: res.response || 'Sem resposta disponível.',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Erro ao consultar IA:', err);
      showToast('Erro ao comunicar com o assistente IA', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'assistant',
        text: student
          ? `Histórico limpo. Como posso ajudar com a prescrição ou análise de treino de **${student.name}** agora?`
          : 'Histórico limpo. Como posso ajudar com a prescrição de treino ou avaliação física agora?',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-3xl w-full h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-900 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/30 border border-indigo-400/30 text-amber-300 flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Assistente IA ZemdaPersonal</span>
                <span className="text-[10px] bg-indigo-500/40 text-indigo-200 font-semibold px-2 py-0.5 rounded-full">
                  Fisiologia & Treino
                </span>
              </h3>
              <p className="text-xs text-slate-300">
                Prescrição de sobrecarga progressiva, análise de dobras cutâneas e periodização.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClearChat}
              title="Limpar conversa"
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Seletor ou Contexto Travado do Aluno (Item 14) */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
          {student ? (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">Aluno em Análise:</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold rounded-lg shadow-2xs">
                <Lock className="w-3.5 h-3.5 text-indigo-500" />
                {student.name}
              </span>
              <span className="text-[11px] text-slate-500 italic hidden sm:inline">
                (Contexto travado — para analisar outro aluno, feche e acesse pela respectiva ficha)
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">Aluno em Análise:</span>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800 outline-none"
              >
                <option value="">Geral (Sem aluno específico)</option>
                {studentsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <span className="text-[11px] text-slate-400">
            {selectedStudentId ? 'Contexto de dobras, PRs e treinos ativos injetado' : 'Modo consultoria geral'}
          </span>
        </div>

        {/* Área de Mensagens */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 bg-slate-50/40">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs shrink-0 ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'bg-gradient-to-tr from-indigo-900 to-purple-900 text-amber-300 shadow-sm'
                }`}
              >
                {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed shadow-sm ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-none whitespace-pre-wrap'
                }`}
              >
                {msg.text}
                <div
                  className={`text-[9px] mt-2 font-medium ${
                    msg.sender === 'user' ? 'text-indigo-200 text-right' : 'text-slate-400'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-900 to-purple-900 text-amber-300 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-500 rounded-tl-none flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span>Analisando cinesiologia e histórico do aluno...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chips de Ações Rápidas */}
        <div className="px-4 py-2 border-t border-slate-100 bg-white flex items-center gap-2 overflow-x-auto">
          {QUICK_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              disabled={loading}
              onClick={() => handleSendMessage(prompt)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-colors border border-slate-200/60"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input de Mensagem */}
        <div className="p-4 border-t border-slate-100 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Digite sua dúvida clínica ou solicitação para a IA..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              className="flex-1 px-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || loading}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-2xl transition-colors shadow-md shadow-indigo-600/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
