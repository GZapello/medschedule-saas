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
  Stethoscope,
  Plus,
  ThumbsUp,
  ThumbsDown,
  Layers,
  Wand2,
  RotateCcw,
  Check,
  ChevronDown
} from 'lucide-react';

interface AICopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAppointmentCreated?: () => void;
  activePatientId?: string;
  activeAppointmentId?: string;
}

interface Message {
  sender: 'user' | 'assistant';
  text: string;
  actionCard?: any;
  feedbackGiven?: 'up' | 'down';
}

export const AICopilotDrawer: React.FC<AICopilotDrawerProps> = ({
  isOpen,
  onClose,
  onAppointmentCreated,
  activePatientId,
  activeAppointmentId
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'chat' | 'audio_draft' | 'improve_text'>('chat');
  
  // Seletor de Contexto Inteligente
  const [contextScope, setContextScope] = useState<
    'appointment' | 'full_records' | 'last_30_days' | 'last_90_days' | 'exams' | 'no_clinical'
  >(activeAppointmentId ? 'appointment' : activePatientId ? 'full_records' : 'no_clinical');

  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(activePatientId || '');

  // Conversa ativa
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'assistant',
      text: 'Olá! Sou a **Assistente Zemda**. Estou conectada ao ambiente da sua clínica para apoiar a organização documental, síntese de prontuários, comandos de agenda e transcrição clínica.\n\nComo posso ajudar você agora?'
    }
  ]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Speech Recognition & Ditado
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedDraft, setRecordedDraft] = useState<string>('');
  const recognitionRef = useRef<any>(null);

  // Ferramenta "Melhorar com IA"
  const [improveMode, setImproveMode] = useState<string>('technical');
  const [originalToImprove, setOriginalToImprove] = useState<string>('');
  const [improvedResult, setImprovedResult] = useState<string>('');
  const [isImproving, setIsImproving] = useState<boolean>(false);

  // Carrega lista de pacientes para o seletor quando aplicável
  useEffect(() => {
    if (isOpen) {
      ApiClient.get<any[]>('/v1/patients')
        .then(res => setPatients(res))
        .catch(() => {});
      if (activePatientId) setSelectedPatientId(activePatientId);
    }
  }, [isOpen, activePatientId]);

  useEffect(() => {
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
        setIsRecording(false);
        showToast(`Erro no reconhecimento de voz: ${event.error}`, 'error');
      };

      recognition.onend = () => setIsRecording(false);
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
      showToast('Gravação pausada.', 'info');
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

  const handleSend = async (userText?: string) => {
    const textToSend = userText || input;
    if (!textToSend.trim() || loading) return;

    const userMessage: Message = { sender: 'user', text: textToSend };
    setMessages(prev => [...prev, userMessage]);
    if (!userText) setInput('');
    setLoading(true);

    try {
      const payload = {
        message: textToSend,
        context: {
          scope: contextScope,
          patientId: selectedPatientId || undefined,
          appointmentId: activeAppointmentId || undefined
        }
      };

      const data = await ApiClient.post<any>('/v1/ai/chat', payload);
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
          text: 'Desculpe, não foi possível processar a consulta no momento. Nenhuma informação foi perdida. Tente novamente.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleImproveText = async () => {
    if (!originalToImprove.trim()) {
      showToast('Digite ou cole o texto a ser aprimorado.', 'info');
      return;
    }
    try {
      setIsImproving(true);
      const res = await ApiClient.post<any>('/v1/ai/improve-text', {
        text: originalToImprove,
        mode: improveMode
      });
      setImprovedResult(res.improvedText || '');
    } catch (err: any) {
      showToast('Erro ao processar melhoria de texto.', 'error');
    } finally {
      setIsImproving(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([
      {
        sender: 'assistant',
        text: 'Nova conversa iniciada. Selecione o contexto desejado e envie seu comando ou dúvida clínica/administrativa.'
      }
    ]);
    showToast('Nova conversa pronta.', 'info');
  };

  const handleFeedback = async (index: number, type: 'up' | 'down') => {
    setMessages(prev =>
      prev.map((m, i) => (i === index ? { ...m, feedbackGiven: type } : m))
    );
    try {
      await ApiClient.post('/v1/ai/feedback', {
        feedback: type === 'up' ? 'positive' : 'negative',
        context: { contextScope, patientId: selectedPatientId }
      });
      showToast('Obrigado pelo seu feedback!', 'success');
    } catch (e) {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className="w-screen max-w-lg bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-teal-800 via-indigo-900 to-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-teal-500/20 border border-teal-400/30 backdrop-blur-md rounded-xl">
                <Sparkles className="w-5 h-5 text-teal-300" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Assistente Zemda</h3>
                <p className="text-[11px] text-teal-200">Inteligência contextual clínica e administrativa</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewConversation}
                className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                title="Nova Conversa"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Seletor de Contexto Inteligente */}
          <div className="p-2.5 bg-slate-100 border-b border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              <Layers className="w-3.5 h-3.5 text-indigo-600" /> Contexto da IA:
            </div>
            <select
              value={contextScope}
              onChange={e => setContextScope(e.target.value as any)}
              className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-teal-500"
            >
              <option value="appointment">Atendimento Atual</option>
              <option value="full_records">Prontuário Completo</option>
              <option value="last_30_days">Últimos 30 dias</option>
              <option value="last_90_days">Últimos 90 dias</option>
              <option value="exams">Exames e Laudos</option>
              <option value="no_clinical">Sem Contexto Clínico</option>
            </select>

            {contextScope !== 'no_clinical' && patients.length > 0 && (
              <select
                value={selectedPatientId}
                onChange={e => setSelectedPatientId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700 mt-1"
              >
                <option value="">-- Selecione o Paciente para a Consulta --</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>
                    Paciente: {p.full_name}
                  </option>
                ))}
              </select>
            )}
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
              onClick={() => setActiveTab('improve_text')}
              className={`flex-1 py-2.5 text-center flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'improve_text'
                  ? 'bg-white text-indigo-700 border-b-2 border-indigo-600 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 text-teal-600" /> Melhorar Texto
            </button>
            <button
              onClick={() => setActiveTab('audio_draft')}
              className={`flex-1 py-2.5 text-center flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'audio_draft'
                  ? 'bg-white text-indigo-700 border-b-2 border-indigo-600 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Mic className="w-3.5 h-3.5 text-rose-500" /> Ditado & Voz
            </button>
          </div>

          {/* TAB 1: CHAT */}
          {activeTab === 'chat' && (
            <>
              {/* Quick suggestions pills */}
              <div className="p-2.5 bg-slate-50 border-b border-slate-200 overflow-x-auto flex gap-1.5 no-scrollbar">
                {[
                  '📋 Resuma o prontuário deste paciente',
                  '⏱️ Criar linha do tempo',
                  '📝 Organize esta evolução em SOAP',
                  '📄 Rascunho para encaminhamento',
                  '📊 Atendimentos e cancelamentos do mês'
                ].map((sug, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(sug.replace(/^[^\s]+ /, ''))}
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
                      className={`p-3.5 rounded-2xl text-xs max-w-[90%] leading-relaxed ${
                        m.sender === 'user'
                          ? 'bg-indigo-600 text-white rounded-tr-none shadow-xs'
                          : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>

                    {/* Feedback buttons */}
                    {m.sender === 'assistant' && i > 0 && (
                      <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-slate-400">
                        <span>A resposta ajudou?</span>
                        <button
                          onClick={() => handleFeedback(i, 'up')}
                          className={`hover:text-teal-600 ${m.feedbackGiven === 'up' ? 'text-teal-600 font-bold' : ''}`}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleFeedback(i, 'down')}
                          className={`hover:text-rose-600 ${m.feedbackGiven === 'down' ? 'text-rose-600 font-bold' : ''}`}
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 italic">
                    <Sparkles className="w-4 h-4 animate-spin text-teal-600" />
                    Processando com inteligência contextual...
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
                    title={isRecording ? 'Parar gravação' : 'Gravar por voz'}
                  >
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Escreva sua solicitação clínica ou administrativa..."
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    className="p-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </>
          )}

          {/* TAB 2: MELHORAR COM IA (COMPARAÇÃO LADO A LADO) */}
          {activeTab === 'improve_text' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-teal-50 border border-teal-200 p-3 rounded-2xl text-xs text-teal-900">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <Wand2 className="w-4 h-4 text-teal-700" /> Melhoria Textual Inteligente
                </div>
                Digite ou cole o texto clínico para refinamento gramatical, técnico ou formatação em tópicos/SOAP.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Modo de Aprimoramento:</label>
                <select
                  value={improveMode}
                  onChange={e => setImproveMode(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="technical">Tornar mais técnico (Terminologia médica)</option>
                  <option value="grammar">Corrigir gramática e concordância</option>
                  <option value="objective">Tornar mais objetivo e conciso</option>
                  <option value="summarize">Resumir os pontos essenciais</option>
                  <option value="bullets">Organizar em tópicos destacados</option>
                  <option value="prose">Transformar em texto corrido e coeso</option>
                  <option value="soap">Adequar ao modelo SOAP</option>
                </select>
              </div>

              {/* Texto Original */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Texto Original:</label>
                <textarea
                  rows={4}
                  value={originalToImprove}
                  onChange={e => setOriginalToImprove(e.target.value)}
                  placeholder="Cole aqui o texto da evolução, anotação ou relatório..."
                  className="w-full p-3 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <button
                type="button"
                onClick={handleImproveText}
                disabled={isImproving || !originalToImprove.trim()}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <Wand2 className="w-4 h-4" />
                {isImproving ? 'Processando...' : 'Aprimorar com IA'}
              </button>

              {/* Comparação Lado a Lado (Original vs IA) */}
              {improvedResult && (
                <div className="space-y-3 pt-2 border-t border-slate-200 animate-in fade-in">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Comparação de Versões:
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* Painel Esquerdo: Original */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <span className="font-bold text-slate-600 uppercase text-[10px]">Original</span>
                      <p className="whitespace-pre-wrap text-slate-700">{originalToImprove}</p>
                    </div>

                    {/* Painel Direito: Versão IA */}
                    <div className="p-3 bg-teal-50/60 border-2 border-teal-500 rounded-xl space-y-1 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-teal-800 uppercase text-[10px]">Rascunho IA</span>
                        <span className="text-[10px] text-teal-600 font-bold">✓ Refinado</span>
                      </div>
                      <p className="whitespace-pre-wrap text-slate-800 font-medium">{improvedResult}</p>
                    </div>
                  </div>

                  {/* Ações da Comparação */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(improvedResult);
                        showToast('Versão da IA copiada para a área de transferência!', 'success');
                      }}
                      className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" /> Usar Versão IA
                    </button>
                    <button
                      type="button"
                      onClick={() => setOriginalToImprove(improvedResult)}
                      className="px-3 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setImprovedResult('')}
                      className="px-3 py-2 border border-slate-300 hover:bg-slate-100 text-slate-500 text-xs rounded-xl"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DITADO & VOZ */}
          {activeTab === 'audio_draft' && (
            <div className="flex-1 flex flex-col p-4 space-y-3 overflow-y-auto">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <Stethoscope className="w-4 h-4 text-amber-600" />
                  Ditado em Tempo Real & Transcrição
                </div>
                Grave o atendimento ou dite suas conclusões. O sistema transcreve a fala e permite estruturar em modelo SOAP com 1 clique.
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
                      <Mic className="w-4 h-4" /> Iniciar Ditado por Voz
                    </>
                  )}
                </button>
              </div>

              <div className="flex-1 flex flex-col">
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Rascunho da Fala:</span>
                  {recordedDraft && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(recordedDraft);
                        showToast('Rascunho copiado!', 'success');
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
                  placeholder="A fala captada pelo microfone aparecerá aqui automaticamente..."
                  className="flex-1 w-full border border-slate-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-hidden resize-none min-h-[200px]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!recordedDraft.trim()) return;
                    try {
                      setLoading(true);
                      const res = await ApiClient.post<any>('/v1/ai/chat', {
                        message: `Estruture o seguinte relato em SOAP:\n\n"${recordedDraft}"`
                      });
                      setRecordedDraft(res.reply || recordedDraft);
                      showToast('Rascunho SOAP gerado!', 'success');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading || !recordedDraft.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-teal-200" />
                  {loading ? 'Estruturando...' : 'Organizar em SOAP com IA'}
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
              <strong>Aviso Ético:</strong> Todo conteúdo gerado atua como rascunho de apoio. A validação técnica e decisão clínica são exclusivas do profissional de saúde.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

