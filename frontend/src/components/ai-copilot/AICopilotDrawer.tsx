import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ChevronDown,
  Search,
  Lightbulb,
  ClipboardList,
  GitCompare,
  FolderOpen,
  FileEdit,
  Download
} from 'lucide-react';

interface AICopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAppointmentCreated?: () => void;
  activePatientId?: string;
  activeAppointmentId?: string;
  initialPrompt?: string;
  initialTab?: 'chat' | 'audio_draft' | 'improve_text';
  autoSend?: boolean;
}

interface Message {
  sender: 'user' | 'assistant';
  text: string;
  actionCard?: any;
  actions?: Array<{ label: string; type?: string; actionType?: string; payload?: any; patientId?: string; target?: string }>;
  feedbackGiven?: 'up' | 'down';
  suggestions?: string[];
  isError?: boolean;
  retryText?: string;
}

export const AICopilotDrawer: React.FC<AICopilotDrawerProps> = ({
  isOpen,
  onClose,
  onAppointmentCreated,
  activePatientId,
  activeAppointmentId,
  initialPrompt,
  initialTab,
  autoSend
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'chat' | 'audio_draft' | 'improve_text'>('chat');
  
  // Seletor de Contexto Inteligente
  const [contextScope, setContextScope] = useState<
    'appointment' | 'full_records' | 'last_30_days' | 'last_90_days' | 'exams' | 'no_clinical'
  >(activeAppointmentId ? 'appointment' : activePatientId ? 'full_records' : 'no_clinical');

  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(activePatientId || '');

  // Conversa ativa com memória
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'assistant',
      text: 'Olá! Sou a **Assistente Zemda**. Estou conectada ao ambiente da sua clínica para apoiar a organização documental, síntese de prontuários, comandos de agenda e transcrição clínica.\n\nComo posso ajudar você agora?'
    }
  ]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('Processando...');

  // Speech Recognition & Ditado por Voz
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedDraft, setRecordedDraft] = useState<string>('');
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef<boolean>(false);
  const initialVoiceTextRef = useRef<string>('');
  const sessionFinalRef = useRef<string>('');
  const activeTabRef = useRef<string>(activeTab);

  // Ferramenta "Melhorar com IA"
  const [improveMode, setImproveMode] = useState<string>('technical');
  const [originalToImprove, setOriginalToImprove] = useState<string>('');
  const [improvedResult, setImprovedResult] = useState<string>('');
  const [isImproving, setIsImproving] = useState<boolean>(false);

  // Ref para auto-scroll
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // Atualiza contexto quando props mudam (contexto automático do App.tsx)
  useEffect(() => {
    if (activePatientId) {
      setSelectedPatientId(activePatientId);
      if (contextScope === 'no_clinical') {
        setContextScope('full_records');
      }
    }
  }, [activePatientId]);

  useEffect(() => {
    if (activeAppointmentId) {
      setContextScope('appointment');
    }
  }, [activeAppointmentId]);

  // Carrega lista de pacientes quando abre
  useEffect(() => {
    if (isOpen) {
      ApiClient.get<any[]>('/v1/patients')
        .then(res => setPatients(res))
        .catch(() => {});
      if (activePatientId) setSelectedPatientId(activePatientId);
    }
  }, [isOpen, activePatientId]);

  // Mantém activeTabRef sempre sincronizado para o motor de voz
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const stopVoiceSession = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }
  }, []);

  const startVoiceSession = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast('Reconhecimento de voz não suportado neste navegador. Recomendamos Google Chrome ou Edge.', 'info');
      return;
    }

    // Encerra qualquer sessão residual
    stopVoiceSession();

    const currentTab = activeTabRef.current;
    const currentBase = (currentTab === 'audio_draft' ? recordedDraft : input).trim();
    initialVoiceTextRef.current = currentBase;
    sessionFinalRef.current = '';
    isRecordingRef.current = true;
    setIsRecording(true);

    const initRecognition = () => {
      if (!isRecordingRef.current) return;
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'pt-BR';
      rec.maxAlternatives = 1;

      rec.onresult = (event: any) => {
        let finals = '';
        let interims = '';

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          const text = (res[0]?.transcript || '').trim();
          if (!text) continue;
          if (res.isFinal) {
            finals += (finals ? ' ' : '') + text;
          } else {
            interims += (interims ? ' ' : '') + text;
          }
        }

        sessionFinalRef.current = finals;

        const base = initialVoiceTextRef.current;
        let combined = base;
        if (finals) combined += (combined ? ' ' : '') + finals;
        if (interims) combined += (combined ? ' ' : '') + interims;

        if (activeTabRef.current === 'audio_draft') {
          setRecordedDraft(combined);
        } else {
          setInput(combined);
        }
      };

      rec.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          // Pausa normal do usuário ao falar; mantém ativo
          return;
        }
        if (event.error === 'not-allowed') {
          isRecordingRef.current = false;
          setIsRecording(false);
          showToast('Permissão de microfone negada. Habilite o acesso ao microfone no navegador.', 'error');
          return;
        }
        if (event.error === 'network') {
          isRecordingRef.current = false;
          setIsRecording(false);
          showToast('Falha de rede na transcrição de voz. Verifique sua conexão.', 'error');
          return;
        }
        if (event.error !== 'aborted') {
          console.warn('[AICopilotDrawer] Aviso no microfone:', event.error);
        }
      };

      rec.onend = () => {
        if (isRecordingRef.current) {
          // Se o navegador finalizou por silêncio mas o usuário ainda quer gravar:
          if (sessionFinalRef.current) {
            const base = initialVoiceTextRef.current;
            initialVoiceTextRef.current = (base ? base + ' ' : '') + sessionFinalRef.current;
            sessionFinalRef.current = '';
          }
          try {
            initRecognition();
          } catch (_) {
            isRecordingRef.current = false;
            setIsRecording(false);
          }
        } else {
          setIsRecording(false);
        }
      };

      try {
        rec.start();
        recognitionRef.current = rec;
      } catch (err) {
        console.warn('[AICopilotDrawer] Falha ao iniciar reconhecimento:', err);
        isRecordingRef.current = false;
        setIsRecording(false);
      }
    };

    initRecognition();
    showToast('Captando áudio em português...', 'info');
  }, [input, recordedDraft, showToast, stopVoiceSession]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopVoiceSession();
      // Consolida o texto final limpo
      const base = initialVoiceTextRef.current;
      const finals = sessionFinalRef.current;
      const finalCombined = (base && finals ? `${base} ${finals}` : (finals || base)).trim();
      if (activeTabRef.current === 'audio_draft') {
        if (finalCombined) setRecordedDraft(finalCombined);
      } else {
        if (finalCombined) setInput(finalCombined);
      }
      showToast('Gravação finalizada.', 'info');
    } else {
      startVoiceSession();
    }
  }, [isRecording, startVoiceSession, stopVoiceSession, showToast]);

  // Se trocar de aba ou fechar, encerra a captação de voz
  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, [activeTab, isOpen, stopVoiceSession]);

  // Iniciar nova conversa — gera conversationId para memória
  const initConversation = async (): Promise<string> => {
    if (conversationId) return conversationId;
    try {
      const res = await ApiClient.post<any>('/v1/ai/conversations', {
        title: 'Conversa com IA',
        patientId: selectedPatientId || undefined,
        contextScope
      });
      const newId = res.id;
      setConversationId(newId);
      return newId;
    } catch (e) {
      // Se falhar, continua sem conversationId
      return '';
    }
  };

  const handleSend = async (userText?: string) => {
    const textToSend = userText || input;
    if (!textToSend.trim() || loading) return;

    const userMessage: Message = { sender: 'user', text: textToSend };
    setMessages(prev => [...prev, userMessage]);
    if (!userText) setInput('');
    setLoading(true);
    setLoadingStatus('Zemda está pensando...');

    const maxRetries = 2;
    let attempt = 0;
    let data: any = null;

    while (attempt <= maxRetries) {
      try {
        if (attempt > 0) {
          setLoadingStatus(`Zemda está pensando... (tentativa ${attempt + 1})`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
        } else {
          setLoadingStatus('Zemda está pensando...');
        }

        // Garantir que temos um conversationId para memória (sem travar em caso de erro)
        const convId = await initConversation().catch(() => '');

        const payload = {
          message: textToSend,
          context: {
            scope: contextScope,
            patientId: selectedPatientId || undefined,
            appointmentId: activeAppointmentId || undefined
          },
          conversationId: convId || undefined
        };

        data = await ApiClient.post<any>('/v1/ai/chat', payload);
        if (data && data.reply && typeof data.reply === 'string' && data.reply.trim().length > 0) {
          break; // Resposta bem-sucedida recebida
        }
        attempt++;
      } catch (err: any) {
        attempt++;
      }
    }

    if (data && data.reply && typeof data.reply === 'string' && data.reply.trim().length > 0) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'assistant',
          text: data.reply,
          actionCard: data.actionCard,
          actions: data.actions,
          suggestions: data.suggestions
        }
      ]);

      // Atualiza conversationId se retornado
      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }
    } else {
      setMessages(prev => [
        ...prev,
        {
          sender: 'assistant',
          text: 'Não consegui processar sua solicitação agora. Nenhuma informação foi perdida. Tente novamente.',
          isError: true,
          retryText: textToSend
        }
      ]);
    }

    setLoading(false);
    setLoadingStatus('Processando...');
  };

  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      if (initialPrompt) {
        if (autoSend) {
          handleSend(initialPrompt);
        } else {
          setInput(initialPrompt);
        }
      }
    }
  }, [isOpen, initialPrompt, initialTab, autoSend]);

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
    setConversationId(null);
    setInput('');
    setRecordedDraft('');
    setOriginalToImprove('');
    setImprovedResult('');
    setMessages([
      {
        sender: 'assistant',
        text: 'Olá! Sou a **Assistente Zemda**. Estou conectada ao ambiente da sua clínica para apoiar a organização documental, síntese de prontuários, comandos de agenda e transcrição clínica.\n\nComo posso ajudar você agora?'
      }
    ]);
    showToast('Nova conversa iniciada. Contexto anterior limpo.', 'info');
  };

  const handleFeedback = async (index: number, type: 'up' | 'down') => {
    setMessages(prev =>
      prev.map((m, i) => (i === index ? { ...m, feedbackGiven: type } : m))
    );
    try {
      const messageText = messages[index]?.text?.slice(0, 200);
      await ApiClient.post('/v1/ai/feedback', {
        feedback: type === 'up' ? 'positive' : 'negative',
        context: { contextScope, patientId: selectedPatientId },
        messageText
      });
      showToast('Obrigado pelo seu feedback!', 'success');
    } catch (e) {}
  };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Resposta copiada!', 'success');
  };

  if (!isOpen) return null;

  // Ações rápidas expandidas
  const quickActions = [
    { emoji: '📋', label: 'Resumir', command: 'Resuma o prontuário deste paciente' },
    { emoji: '⏱️', label: 'Linha do tempo', command: 'Crie uma linha do tempo com os marcos clínicos' },
    { emoji: '📝', label: 'Organizar SOAP', command: 'Organize a última evolução em formato SOAP' },
    { emoji: '🔍', label: 'Localizar', command: 'Localize informações relevantes no histórico deste paciente' },
    { emoji: '📊', label: 'Comparar', command: 'Compare as últimas evoluções clínicas deste paciente' },
    { emoji: '📄', label: 'Relatório', command: 'Crie um rascunho de relatório clínico' },
    { emoji: '📮', label: 'Encaminhamento', command: 'Prepare um rascunho de encaminhamento' },
    { emoji: '❓', label: 'Info faltante', command: 'Identifique informações faltantes no prontuário' },
    { emoji: '💊', label: 'Medicamentos', command: 'Liste os medicamentos ativos deste paciente' },
    { emoji: '📅', label: 'Agenda hoje', command: 'Mostre a agenda de hoje' },
    { emoji: '📅', label: 'Agenda amanhã', command: 'Mostre a agenda de amanhã' },
    { emoji: '💰', label: 'Financeiro', command: 'Resumo financeiro do mês' },
    { emoji: '📊', label: 'Métricas', command: 'Quantos atendimentos e cancelamentos tivemos este mês?' },
    { emoji: '🕐', label: 'Horários', command: 'Mostre os horários livres de amanhã' },
  ];

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
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm text-white">Assistente Zemda</h3>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-teal-400/20 text-teal-200 border border-teal-400/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Gemini AI
                  </span>
                </div>
                <p className="text-[11px] text-teal-200">Inteligência contextual clínica e administrativa</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleNewConversation}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg transition-all cursor-pointer shadow-xs"
                title="Iniciar Nova Conversa (limpa o contexto e histórico anterior)"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova conversa</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Fechar assistente"
              >
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
              {/* Quick Actions — ações rápidas expandidas */}
              <div className="p-2.5 bg-slate-50 border-b border-slate-200 overflow-x-auto flex gap-1.5 no-scrollbar">
                {quickActions.map((qa, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(qa.command)}
                    className="text-[11px] font-semibold bg-white border border-slate-200 hover:border-indigo-400 px-3 py-1 rounded-full whitespace-nowrap text-slate-700 hover:text-indigo-600 transition-colors shadow-2xs cursor-pointer"
                    title={qa.command}
                  >
                    {qa.emoji} {qa.label}
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
                      {/* Renderização de Markdown simples */}
                      <div className="whitespace-pre-wrap ai-markdown">
                        {renderSimpleMarkdown(m.text)}
                      </div>

                      {/* Botões de Ação Contextual */}
                      {m.actions && m.actions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-slate-200/60">
                          {m.actions.map((act, actIdx) => (
                            <button
                              key={actIdx}
                              type="button"
                              onClick={() => {
                                const actionType = act.type || act.actionType;
                                if (actionType === 'VIEW_PATIENT' && act.patientId) {
                                  setSelectedPatientId(act.patientId);
                                  showToast('Contexto fixado no paciente', 'info');
                                } else if (actionType === 'REFRESH_AGENDA' || actionType === 'NAVIGATE') {
                                  if (onAppointmentCreated) onAppointmentCreated();
                                  showToast('Navegando...', 'info');
                                } else {
                                  handleSend(act.label);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-indigo-50 border border-slate-300 hover:border-indigo-500 rounded-xl text-[11px] font-bold text-indigo-700 shadow-2xs transition-all cursor-pointer"
                            >
                              <span>{act.label}</span>
                              <ArrowRight className="w-3 h-3 text-indigo-500" />
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Botão de Tentar Novamente para Erros Controlados */}
                      {m.isError && m.retryText && (
                        <div className="mt-3 pt-2 border-t border-rose-200/80">
                          <button
                            type="button"
                            onClick={() => handleSend(m.retryText)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                            <span>Tentar novamente</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Sugestões proativas da IA */}
                    {m.sender === 'assistant' && m.suggestions && m.suggestions.length > 0 && (
                      <div className="mt-2 space-y-1 max-w-[90%]">
                        {m.suggestions.map((sug, sIdx) => (
                          <button
                            key={sIdx}
                            onClick={() => handleSend(sug.replace(/^[^\s]+ /, ''))}
                            className="flex items-start gap-2 w-full text-left px-3 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-medium transition-colors cursor-pointer"
                          >
                            <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                            <span>{sug}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Feedback + Copiar */}
                    {m.sender === 'assistant' && i > 0 && !m.isError && (
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
                        <span className="text-slate-300">|</span>
                        <button
                          onClick={() => handleCopyMessage(m.text)}
                          className="hover:text-indigo-600 flex items-center gap-1"
                          title="Copiar resposta"
                        >
                          <Copy className="w-3 h-3" /> Copiar
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="flex items-center gap-2.5 text-xs text-teal-800 font-semibold p-3 bg-teal-50/90 border border-teal-200 rounded-2xl w-fit animate-pulse shadow-xs">
                    <Sparkles className="w-4 h-4 animate-spin text-teal-600" />
                    <span>{loadingStatus || 'Zemda está pensando...'}</span>
                  </div>
                )}

                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
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

          {/* TAB 2: MELHORAR COM IA */}
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

              {/* Comparação Lado a Lado */}
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
                      <div className="whitespace-pre-wrap text-slate-800 font-medium">
                        {renderSimpleMarkdown(improvedResult)}
                      </div>
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

// ============================================================================
// RENDERIZADOR DE MARKDOWN SIMPLES
// ============================================================================
// Converte markdown básico em elementos React sem dependência externa.
// Suporta: headers (###), **negrito**, *itálico*, - listas, > citações, `código`
// ============================================================================

function renderSimpleMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<div key={idx} className="font-bold text-sm mt-2 mb-1">{renderInline(line.slice(4))}</div>);
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<div key={idx} className="font-bold text-sm mt-2 mb-1">{renderInline(line.slice(3))}</div>);
      continue;
    }
    if (line.startsWith('#### ')) {
      elements.push(<div key={idx} className="font-bold text-xs mt-2 mb-0.5">{renderInline(line.slice(5))}</div>);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <div key={idx} className="border-l-3 border-amber-400 pl-2 py-1 text-amber-800 bg-amber-50/50 rounded-r-lg my-1 text-[11px] italic">
          {renderInline(line.slice(2))}
        </div>
      );
      continue;
    }

    // List items
    if (line.match(/^[-*•]\s+/)) {
      elements.push(
        <div key={idx} className="flex gap-1.5 ml-1">
          <span className="text-slate-400 shrink-0">•</span>
          <span>{renderInline(line.replace(/^[-*•]\s+/, ''))}</span>
        </div>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={idx} className="h-1" />);
      continue;
    }

    // Regular text
    elements.push(<div key={idx}>{renderInline(line)}</div>);
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  // Process inline formatting: **bold**, *italic*, `code`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
      parts.push(<strong key={key++} className="font-bold">{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }

    // Italic: *text*
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
      parts.push(<em key={key++} className="italic">{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }

    // Inline code: `text`
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/s);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
      parts.push(<code key={key++} className="bg-slate-200 px-1 rounded text-[10px] font-mono">{codeMatch[2]}</code>);
      remaining = codeMatch[3];
      continue;
    }

    // No more matches — output remaining text
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return <>{parts}</>;
}
