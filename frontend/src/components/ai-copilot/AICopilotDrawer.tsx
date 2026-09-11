import React, { useState } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  Sparkles,
  X,
  Send,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  Bot,
  ArrowRight
} from 'lucide-react';

interface AICopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAppointmentCreated?: () => void;
}

interface Message {
  sender: 'user' | 'assistant';
  text: string;
  actionCard?: any;
}

export const AICopilotDrawer: React.FC<AICopilotDrawerProps> = ({
  isOpen,
  onClose,
  onAppointmentCreated
}) => {
  const { showToast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'assistant',
      text: 'Olá! Sou o Assistente Inteligente da sua clínica. Você pode me pedir coisas como:\n\n- *"Agende uma consulta para Mariana amanhã às 15h"*\n- *"Mostre meus horários livres de amanhã"*\n- *"Quantos atendimentos tive este mês?"*\n\nComo posso ajudar você agora?'
    }
  ]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSend = async (userText?: string) => {
    const textToSend = userText || input;
    if (!textToSend.trim() || loading) return;

    const userMessage: Message = { sender: 'user', text: textToSend };
    setMessages(prev => [...prev, userMessage]);
    if (!userText) setInput('');
    setLoading(true);

    try {
      const data = await ApiClient.post<any>('/v1/ai/chat', { message: textToSend });
      setMessages(prev => [
        ...prev,
        {
          sender: 'assistant',
          text: data.reply,
          actionCard: data.actionCard
        }
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'assistant',
          text: 'Desculpe, não consegui processar o comando no momento. Por favor, tente novamente.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteActionCard = async (card: any) => {
    try {
      setLoading(true);
      await ApiClient.post('/v1/appointments', {
        patientId: card.patientId,
        professionalId: card.professionalId,
        serviceId: card.serviceId,
        startTime: card.startTime,
        endTime: card.endTime,
        modality: 'presential',
        internalNotes: 'Agendado via comando do Assistente de IA'
      });

      showToast('Agendamento confirmado e registrado na agenda!', 'success');
      setMessages(prev => [
        ...prev,
        {
          sender: 'assistant',
          text: `Perfeito! O agendamento para **${card.patientName}** às **${card.time}** foi registrado com sucesso na agenda.`
        }
      ]);

      if (onAppointmentCreated) {
        onAppointmentCreated();
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao confirmar agendamento', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Drawer Header */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-700 via-indigo-600 to-teal-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/10 backdrop-blur-md rounded-xl">
                <Sparkles className="w-5 h-5 text-teal-300" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Copiloto Inteligente</h3>
                <p className="text-[11px] text-teal-100">Comandos em linguagem natural</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-white/80 hover:text-white rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick suggestions pills */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 overflow-x-auto flex gap-2 no-scrollbar">
            {[
              'Quantos atendimentos tive este mês?',
              'Mostre meus horários livres de amanhã',
              'Agende para Mariana amanhã às 15h'
            ].map((sug, i) => (
              <button
                key={i}
                onClick={() => handleSend(sug)}
                className="text-[11px] font-semibold bg-white border border-slate-200 hover:border-indigo-400 px-3 py-1 rounded-full whitespace-nowrap text-slate-700 hover:text-indigo-600 transition-colors shadow-2xs"
              >
                {sug}
              </button>
            ))}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`p-3.5 rounded-2xl text-xs max-w-[85%] leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none shadow-xs'
                      : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>

                {/* Interactive Action Confirmation Card */}
                {m.actionCard && (
                  <div className="mt-2.5 p-4 bg-white border-2 border-indigo-500 rounded-2xl shadow-md max-w-[90%] space-y-3 animate-in zoom-in-95">
                    <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                      <Calendar className="w-4 h-4" /> {m.actionCard.title}
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-700">
                      <div>Paciente: <strong>{m.actionCard.patientName}</strong></div>
                      <div>Profissional: <strong>{m.actionCard.professionalName}</strong></div>
                      <div>Horário: <strong className="text-indigo-600">{m.actionCard.date} às {m.actionCard.time}</strong></div>
                      <div>Valor: <strong>R$ {m.actionCard.price?.toFixed(2)}</strong></div>
                    </div>

                    <button
                      onClick={() => handleExecuteActionCard(m.actionCard)}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar no Sistema Agora
                    </button>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-400 italic">
                <Sparkles className="w-4 h-4 animate-spin text-indigo-500" />
                Processando intenção...
              </div>
            )}
          </div>

          {/* Input Bar */}
          <div className="p-3 border-t border-slate-200 bg-white">
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Escreva seu comando em linguagem natural..."
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
