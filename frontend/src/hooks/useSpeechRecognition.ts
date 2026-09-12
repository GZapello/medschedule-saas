import { useState, useEffect, useRef, useCallback } from 'react';

export type SpeechRecognitionStatus =
  | 'idle'
  | 'listening'
  | 'paused'
  | 'processing'
  | 'completed'
  | 'error';

export interface UseSpeechRecognitionReturn {
  status: SpeechRecognitionStatus;
  statusLabel: string;
  isListening: boolean;
  isPaused: boolean;
  isSupported: boolean;
  finalTranscript: string;
  interimTranscript: string;
  transcript: string;
  recordingSeconds: number;
  errorMessage: string | null;
  startListening: () => void;
  pauseListening: () => void;
  resumeListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  setTranscriptManually: (text: string) => void;
}

export function useSpeechRecognition(options?: {
  lang?: string;
  onFinalTranscript?: (text: string) => void;
  onError?: (err: string) => void;
}): UseSpeechRecognitionReturn {
  const lang = options?.lang || 'pt-BR';

  const [status, setStatus] = useState<SpeechRecognitionStatus>('idle');
  const [finalTranscript, setFinalTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const finalPhrasesRef = useRef<string[]>([]);
  const isPausedRef = useRef<boolean>(false);
  const shouldBeListeningRef = useRef<boolean>(false);

  const isSupported =
    typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Limpa o timer
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Inicia o timer
  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setRecordingSeconds(sec => sec + 1);
    }, 1000);
  }, [stopTimer]);

  // Cria ou inicializa o objeto SpeechRecognition
  const initRecognition = useCallback(() => {
    if (!isSupported) return null;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (isPausedRef.current) {
        setStatus('paused');
      } else {
        setStatus('listening');
        setErrorMessage(null);
      }
    };

    recognition.onresult = (event: any) => {
      let currentInterim = '';
      let hasNewFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = (result[0]?.transcript || '').trim();

        if (result.isFinal) {
          if (text) {
            // Previne duplicações de frases consecutivas idênticas
            const lastPhrase = finalPhrasesRef.current[finalPhrasesRef.current.length - 1];
            if (!lastPhrase || lastPhrase.toLowerCase() !== text.toLowerCase()) {
              finalPhrasesRef.current.push(text);
              hasNewFinal = true;
            }
          }
        } else {
          currentInterim += (currentInterim ? ' ' : '') + text;
        }
      }

      if (hasNewFinal) {
        const updated = finalPhrasesRef.current.join(' ');
        setFinalTranscript(updated);
        if (options?.onFinalTranscript) {
          options.onFinalTranscript(updated);
        }
      }

      setInterimTranscript(currentInterim);
    };

    recognition.onerror = (event: any) => {
      console.warn('[useSpeechRecognition] Erro detectado:', event.error);
      if (event.error === 'no-speech') {
        // Pausa temporária na fala — ignora e mantém ativo se não estiver pausado
        return;
      }

      if (event.error === 'not-allowed') {
        setErrorMessage('Permissão do microfone negada. Permita o microfone no navegador.');
        setStatus('error');
        stopTimer();
        shouldBeListeningRef.current = false;
        if (options?.onError) options.onError('Permissão negada');
      } else if (event.error === 'network') {
        setErrorMessage('Erro de rede na transcrição de voz. Verifique sua conexão.');
        setStatus('error');
        stopTimer();
      }
    };

    recognition.onend = () => {
      // Se o usuário ainda deve estar ouvindo e não pausou, reinicia automaticamente
      if (shouldBeListeningRef.current && !isPausedRef.current) {
        try {
          recognition.start();
        } catch (_) {
          // Ignora se já estiver ativo
        }
      } else if (isPausedRef.current) {
        setStatus('paused');
      } else if (status !== 'completed' && status !== 'error') {
        setStatus('idle');
      }
    };

    return recognition;
  }, [isSupported, lang, options, stopTimer, status]);

  // Iniciar microfone
  const startListening = useCallback(() => {
    if (!isSupported) {
      setErrorMessage('Navegador sem suporte a Web Speech API. Use Chrome ou Edge.');
      setStatus('error');
      return;
    }

    try {
      // Limpa estado anterior para nova gravação
      finalPhrasesRef.current = [];
      setFinalTranscript('');
      setInterimTranscript('');
      setRecordingSeconds(0);
      setErrorMessage(null);
      isPausedRef.current = false;
      shouldBeListeningRef.current = true;

      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }

      const recognition = initRecognition();
      if (recognition) {
        recognitionRef.current = recognition;
        recognition.start();
        startTimer();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha ao iniciar microfone');
      setStatus('error');
    }
  }, [isSupported, initRecognition, startTimer]);

  // Pausar
  const pauseListening = useCallback(() => {
    if (!shouldBeListeningRef.current) return;

    isPausedRef.current = true;
    stopTimer();

    // Se havia algum interim pendente, consolida para não perder
    if (interimTranscript.trim()) {
      const text = interimTranscript.trim();
      const lastPhrase = finalPhrasesRef.current[finalPhrasesRef.current.length - 1];
      if (!lastPhrase || lastPhrase.toLowerCase() !== text.toLowerCase()) {
        finalPhrasesRef.current.push(text);
        setFinalTranscript(finalPhrasesRef.current.join(' '));
      }
      setInterimTranscript('');
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }

    setStatus('paused');
  }, [interimTranscript, stopTimer]);

  // Continuar
  const resumeListening = useCallback(() => {
    if (!isSupported) return;

    isPausedRef.current = false;
    shouldBeListeningRef.current = true;
    startTimer();

    try {
      if (recognitionRef.current) {
        recognitionRef.current.start();
      } else {
        const recognition = initRecognition();
        if (recognition) {
          recognitionRef.current = recognition;
          recognition.start();
        }
      }
      setStatus('listening');
    } catch (err: any) {
      // Se falhar o start no objeto antigo, cria um novo
      const recognition = initRecognition();
      if (recognition) {
        recognitionRef.current = recognition;
        try {
          recognition.start();
          setStatus('listening');
        } catch (_) {}
      }
    }
  }, [isSupported, initRecognition, startTimer]);

  // Finalizar gravação
  const stopListening = useCallback(() => {
    shouldBeListeningRef.current = false;
    isPausedRef.current = false;
    stopTimer();

    // Se havia algum interim pendente, consolida
    if (interimTranscript.trim()) {
      const text = interimTranscript.trim();
      const lastPhrase = finalPhrasesRef.current[finalPhrasesRef.current.length - 1];
      if (!lastPhrase || lastPhrase.toLowerCase() !== text.toLowerCase()) {
        finalPhrasesRef.current.push(text);
        setFinalTranscript(finalPhrasesRef.current.join(' '));
      }
      setInterimTranscript('');
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }

    setStatus('completed');
  }, [interimTranscript, stopTimer]);

  // Resetar
  const resetTranscript = useCallback(() => {
    stopListening();
    finalPhrasesRef.current = [];
    setFinalTranscript('');
    setInterimTranscript('');
    setRecordingSeconds(0);
    setErrorMessage(null);
    setStatus('idle');
  }, [stopListening]);

  // Atualizar manualmente
  const setTranscriptManually = useCallback((text: string) => {
    finalPhrasesRef.current = text.trim() ? [text.trim()] : [];
    setFinalTranscript(text.trim());
    setInterimTranscript('');
  }, []);

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      shouldBeListeningRef.current = false;
      isPausedRef.current = false;
      stopTimer();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
        recognitionRef.current = null;
      }
    };
  }, [stopTimer]);

  // Label amigável do status
  const getStatusLabel = (): string => {
    switch (status) {
      case 'listening':
        return 'Microfone ativo';
      case 'paused':
        return 'Pausado';
      case 'processing':
        return 'Processando…';
      case 'completed':
        return 'Concluído';
      case 'error':
        return 'Erro no microfone';
      default:
        return 'Microfone inativo';
    }
  };

  const combinedTranscript = (
    finalTranscript +
    (interimTranscript ? (finalTranscript ? ' ' : '') + interimTranscript : '')
  ).trim();

  return {
    status,
    statusLabel: getStatusLabel(),
    isListening: status === 'listening',
    isPaused: status === 'paused',
    isSupported,
    finalTranscript,
    interimTranscript,
    transcript: combinedTranscript,
    recordingSeconds,
    errorMessage,
    startListening,
    pauseListening,
    resumeListening,
    stopListening,
    resetTranscript,
    setTranscriptManually
  };
}
