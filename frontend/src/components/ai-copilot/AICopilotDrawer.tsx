import React, { useState, useEffect, useRef } from 'react';
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
  ArrowRight,
  Mic,
  MicOff,
  Copy,
  FileText,
  AlertTriangle,
  Stethoscope
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
  const [activeTab, setActiveTab] = useState<'chat' | 'audio_draft'>('chat');
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'assistant',
      text: 'Olá! Sou o Assistente Clínico da Zemda. Posso auxiliar você com agendamentos em linguagem natural, resumo de prontuário, rascunhos de atestado ou transcrição em tempo real da consulta.\n\nComo posso ajudar você agora?'
    }
  ]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Speech Recognition State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedDraft, setRecordedDraft] = useState<string>('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check Speech Recognition support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        if (activeTab === 'audio_draft') {
          setRecordedDraft(prev => prev + ' ' + currentTranscript);
        } else {
          setInput(prev => (prev ? prev + ' ' + currentTranscript : currentTranscript));
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        showToast(`Erro na captação de áudio: ${event.error}`, 'error');
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, [activeTab]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      showToast('Reconhecimento de voz não suportado neste navegador. Recomendamos Google Chrome ou Edge.', 'info');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      showToast('Gravação de áudio pausada.', 'info');
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        showToast('Captando áudio em português...', 'info');
      } catch (err) {
        recognitionRef.current.stop();
        setIsRecording(false);
      }
    }
  };

  const handleStructureDraft = async () => {
    if (!recordedDraft.trim()) {
      showToast('Grave ou digite algum relato antes de estruturar.', 'info');
      return;
    }
    try {
      setLoading(true);
      const res = await ApiClient.post<any>('/v1/ai/chat', {
        message: `Por favor estruture a seguinte transcrição bruta de atendimento médico em formato clínico SOAP (Subjetivo, Objetivo, Avaliação, Plano):\n\n"${recordedDraft}"`
      });
      setRecordedDraft(res.reply || recordedDraft);
      showToast('Rascunho SOAP estruturado com sucesso!', 'success');
    } catch (err: any) {
      showToast('Não foi possível estruturar automaticamente. Edite manualmente.', 'error');
    } finally {
      setLoading(false);
    }
  };

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
                <h3 className="font-bold text-sm">Copiloto Clínico Zemda</h3>
                <p className="text-[11px] text-teal-100">Inteligência contextual e apoio assistencial</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-white/80 hover:text-white rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2.5 text-center transition-colors ${
                activeTab === 'chat'
                  ? 'bg-white text-indigo-700 border-b-2 border-indigo-600 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              💬 Chat & Ações
            </button>
            <button
              onClick={() => setActiveTab('audio_draft')}
              className={`flex-1 py-2.5 text-center flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'audio_draft'
                  ? 'bg-white text-indigo-700 border-b-2 border-indigo-600 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Mic className="w-3.5 h-3.5 text-rose-500" /> Transcrição de Consulta
            </button>
          </div>

          {activeTab === 'chat' ? (
            <>
              {/* Quick suggestions pills */}
              <div className="p-3 bg-slate-50 border-b border-slate-200 overflow-x-auto flex gap-2 no-scrollbar">
                {[
                  'Quantos atendimentos tive este mês?',
                  'Elaborar rascunho de atestado médico',
                  'Sugerir orientações de pós-consulta',
                  'Mostre meus horários livres de amanhã'
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
                  <button
                    type="button"
                    onClick={toggleRecording}
                    className={`p-2 rounded-xl transition-all ${
                      isRecording
                        ? 'bg-rose-600 text-white animate-pulse'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    title={isRecording ? 'Parar gravação de voz' : 'Falar por voz'}
                  >
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
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
            </>
          ) : (
            /* Consultation Audio & Draft Mode */
            <div className="flex-1 flex flex-col p-4 space-y-3 overflow-y-auto">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <Stethoscope className="w-4 h-4 text-amber-600" />
                  Gravação e Rascunho da Consulta
                </div>
                Ative o microfone durante a anamnese. O áudio será transcrito em tempo real e você poderá estruturá-lo no modelo SOAP com um clique.
              </div>

              <div className="flex items-center justify-center py-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`flex items-center gap-2.5 px-5 py-2.5 rounded-full font-bold text-xs shadow-md transition-all ${
                    isRecording
                      ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse ring-4 ring-rose-200'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <MicOff className="w-4 h-4" /> Pausar Captação de Voz
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" /> Iniciar Gravação da Consulta
                    </>
                  )}
                </button>
              </div>

              <div className="flex-1 flex flex-col">
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Rascunho Transcrito:</span>
                  {recordedDraft && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(recordedDraft);
                        showToast('Rascunho copiado para a área de transferência!', 'success');
                      }}
                      className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-[11px]"
                    >
                      <Copy className="w-3 h-3" /> Copiar
                    </button>
                  )}
                </label>
                <textarea
                  value={recordedDraft}
                  onChange={e => setRecordedDraft(e.target.value)}
                  placeholder="A fala da consulta aparecerá aqui automaticamente. Você também pode digitar ou editar este texto..."
                  className="flex-1 w-full border border-slate-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden resize-none min-h-[220px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleStructureDraft}
                  disabled={loading || !recordedDraft.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-teal-300" />
                  {loading ? 'Estruturando...' : 'Estruturar em SOAP com IA'}
                </button>
                <button
                  type="button"
                  onClick={() => setRecordedDraft('')}
                  disabled={!recordedDraft}
                  className="px-3 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold"
                >
                  Limpar
                </button>
              </div>
            </div>
          )}

          {/* Legal / Ethical Medical AI Disclaimer */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>
              <strong>Aviso Ético:</strong> Sugestões de IA para apoio à decisão. A responsabilidade técnica e decisão clínica são exclusivas do profissional de saúde.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
