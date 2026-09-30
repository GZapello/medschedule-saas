import { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../api/client';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

export interface UseClinicalAutosaveOptions {
  moduleType: string;
  patientId?: string | null;
  appointmentId?: string | null;
  payload: Record<string, any>;
  onRestoreDraft?: (restoredData: any) => void;
  debounceMs?: number;
  enabled?: boolean;
}

export interface UseClinicalAutosaveReturn {
  autosaveStatus: AutosaveStatus;
  lastSavedTime: string | null;
  isDirty: boolean;
  forceSaveDraft: () => Promise<boolean>;
  clearDraft: () => Promise<void>;
  conflictModalOpen: boolean;
  serverDraftData: any;
  localDraftData: any;
  resolveConflict: (choice: 'server' | 'local') => void;
}

export function useClinicalAutosave({
  moduleType,
  patientId,
  appointmentId,
  payload,
  onRestoreDraft,
  debounceMs = 1200,
  enabled = true
}: UseClinicalAutosaveOptions): UseClinicalAutosaveReturn {
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Controle de Conflito de Versões
  const [conflictModalOpen, setConflictModalOpen] = useState<boolean>(false);
  const [serverDraftData, setServerDraftData] = useState<any>(null);
  const [localDraftData, setLocalDraftData] = useState<any>(null);

  const initialLoadedRef = useRef<boolean>(false);
  const clearingDraftRef = useRef(false);
  const pendingSavesRef = useRef(new Set<Promise<unknown>>());
  const debounceTimerRef = useRef<any>(null);
  const payloadRef = useRef<Record<string, any>>(payload);
  payloadRef.current = payload;

  const currentPatientRef = useRef<string | null | undefined>(patientId);
  currentPatientRef.current = patientId;

  const patientVersionRef = useRef<number>(0);
  const lastBaselinePayloadRef = useRef<string>('');

  const resolvedAppId = appointmentId && appointmentId !== 'none' ? appointmentId : null;
  const localDraftKey = patientId ? `zemda_draft_${moduleType}_${patientId}_${resolvedAppId || 'none'}` : null;

  // 1. Recuperação Inicial ao alterar Paciente ou Appointment
  useEffect(() => {
    patientVersionRef.current += 1;
    const activeVersion = patientVersionRef.current;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    lastBaselinePayloadRef.current = '';
    clearingDraftRef.current = false;
    initialLoadedRef.current = false;
    setIsDirty(false);
    setAutosaveStatus('idle');
    setLastSavedTime(null);

    if (!patientId || !enabled) {
      return;
    }

    let isSubscribed = true;

    async function recoverDraft() {
      try {
        const query = resolvedAppId ? `?appointment_id=${resolvedAppId}` : '';
        const res: any = await ApiClient.get(`/v1/clinical/draft/${moduleType}/${patientId}${query}`).catch(() => null);

        let localDraft: any = null;
        if (localDraftKey) {
          try {
            const raw = localStorage.getItem(localDraftKey);
            if (raw) localDraft = JSON.parse(raw);
          } catch {}
        }

        if (!isSubscribed || patientVersionRef.current !== activeVersion) return;

        const backendDraft = res?.draft;

        if (backendDraft && localDraft) {
          const backendTime = new Date(backendDraft.client_updated_at || backendDraft.updated_at).getTime();
          const localTime = new Date(localDraft.clientUpdatedAt).getTime();
          const diffMs = Math.abs(localTime - backendTime);

          // Se ambos existem e diferem significativamente (> 15 segundos de divergência)
          if (diffMs > 15000) {
            setServerDraftData(backendDraft.draftData || backendDraft.draft_data);
            setLocalDraftData(localDraft.draftData);
            setConflictModalOpen(true);
            return;
          }

          // Se diferença for pequena, aplica o mais recente
          const effective = localTime > backendTime ? localDraft.draftData : (backendDraft.draftData || backendDraft.draft_data);
          if (effective && onRestoreDraft) {
            onRestoreDraft(effective);
            setAutosaveStatus('saved');
            const savedDate = backendDraft.updated_at ? new Date(backendDraft.updated_at) : new Date();
            setLastSavedTime(savedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
          }
        } else if (backendDraft) {
          const effective = backendDraft.draftData || backendDraft.draft_data;
          if (effective && onRestoreDraft) {
            onRestoreDraft(effective);
            setAutosaveStatus('saved');
            const savedDate = backendDraft.updated_at ? new Date(backendDraft.updated_at) : new Date();
            setLastSavedTime(savedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
          }
        } else if (localDraft) {
          if (localDraft.draftData && onRestoreDraft) {
            onRestoreDraft(localDraft.draftData);
            setAutosaveStatus('offline');
            if (localDraft.clientUpdatedAt) {
              const savedDate = new Date(localDraft.clientUpdatedAt);
              setLastSavedTime(savedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
            }
          }
        }
      } catch (err) {
        console.warn(`[useClinicalAutosave - ${moduleType}] Erro ao carregar rascunho:`, err);
      } finally {
        if (isSubscribed && patientVersionRef.current === activeVersion) {
          setTimeout(() => {
            if (isSubscribed && patientVersionRef.current === activeVersion) {
              lastBaselinePayloadRef.current = JSON.stringify(payloadRef.current);
              initialLoadedRef.current = true;
            }
          }, 600);
        }
      }
    }

    recoverDraft();

    return () => {
      isSubscribed = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [patientId, resolvedAppId, moduleType, enabled]);

  // 2. Função de Persistência (Backend + Contingência Local)
  const performSaveDraft = useCallback(async (): Promise<boolean> => {
    if (!patientId || !enabled || clearingDraftRef.current) return false;

    const activeVersion = patientVersionRef.current;
    const activePatientId = patientId;
    const now = new Date();
    const clientUpdatedAt = now.toISOString();
    const currentPayload = payloadRef.current;
    const currentSerialized = JSON.stringify(currentPayload);

    // Se o formulário for idêntico à linha de base (virgem ou já salvo), não faz requisição desnecessária
    if (lastBaselinePayloadRef.current && currentSerialized === lastBaselinePayloadRef.current) {
      setIsDirty(false);
      return true;
    }

    // Fallback local imediato
    if (localDraftKey) {
      try {
        localStorage.setItem(localDraftKey, JSON.stringify({
          draftData: currentPayload,
          clientUpdatedAt
        }));
      } catch (err) {
        console.warn(`[useClinicalAutosave - ${moduleType}] Falha ao gravar localmente:`, err);
      }
    }

    // Persistência no Backend
    try {
      setAutosaveStatus('saving');
      if (!navigator.onLine) {
        setAutosaveStatus('offline');
        return true;
      }

      const request = ApiClient.post('/v1/clinical/draft', {
        moduleType,
        patientId,
        appointmentId: resolvedAppId,
        draftData: currentPayload,
        clientUpdatedAt
      });
      pendingSavesRef.current.add(request);
      try { await request; } finally { pendingSavesRef.current.delete(request); }

      // Se o paciente mudou durante o salvamento assíncrono, descarta a atualização de estado
      if (patientVersionRef.current !== activeVersion || currentPatientRef.current !== activePatientId) {
        return false;
      }

      lastBaselinePayloadRef.current = currentSerialized;
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setLastSavedTime(timeStr);
      setAutosaveStatus('saved');
      setIsDirty(false);
      return true;
    } catch (err: any) {
      if (patientVersionRef.current !== activeVersion || currentPatientRef.current !== activePatientId) {
        return false;
      }
      console.warn(`[useClinicalAutosave - ${moduleType}] Erro no autosave do backend:`, err);
      if (!navigator.onLine || err?.message?.includes('conectar') || err?.message?.includes('Failed to fetch')) {
        setAutosaveStatus('offline');
      } else if (err?.status === 409 || err?.message?.includes('409') || err?.message?.includes('mais recente')) {
        // Conflito detectado pelo servidor
        setAutosaveStatus('error');
      } else {
        setAutosaveStatus('error');
      }
      return false;
    }
  }, [patientId, resolvedAppId, moduleType, enabled, localDraftKey]);

  // 3. Debounce Automático ao Modificar Payload
  useEffect(() => {
    if (!initialLoadedRef.current || !patientId || !enabled || clearingDraftRef.current) return;

    const currentSerialized = JSON.stringify(payload);
    if (lastBaselinePayloadRef.current && currentSerialized === lastBaselinePayloadRef.current) {
      return;
    }

    setIsDirty(true);
    setAutosaveStatus('saving');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const activeVersion = patientVersionRef.current;
    debounceTimerRef.current = setTimeout(async () => {
      if (patientVersionRef.current !== activeVersion || currentPatientRef.current !== patientId) {
        return;
      }
      await performSaveDraft();
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [payload, debounceMs, patientId, enabled, performSaveDraft]);

  // 4. Reconexão e Prevenção de Perda
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty || autosaveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = 'Existem alterações em andamento neste atendimento. Deseja realmente sair?';
        return e.returnValue;
      }
    };

    const handleOnline = () => {
      if (autosaveStatus === 'offline' && isDirty) {
        performSaveDraft();
      }
    };

    const handleOffline = () => {
      setAutosaveStatus('offline');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isDirty, autosaveStatus, performSaveDraft]);

  // 5. Resolução de Conflito Manual
  const resolveConflict = (choice: 'server' | 'local') => {
    if (choice === 'server' && serverDraftData && onRestoreDraft) {
      onRestoreDraft(serverDraftData);
      setAutosaveStatus('saved');
    } else if (choice === 'local' && localDraftData && onRestoreDraft) {
      onRestoreDraft(localDraftData);
      performSaveDraft();
    }
    setConflictModalOpen(false);
    setTimeout(() => {
      initialLoadedRef.current = true;
    }, 400);
  };

  // 6. Limpeza de Rascunho (chamado ao concluir atendimento)
  const clearDraft = async () => {
    clearingDraftRef.current = true;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    await Promise.allSettled([...pendingSavesRef.current]);
    lastBaselinePayloadRef.current = '';
    if (localDraftKey) {
      try {
        localStorage.removeItem(localDraftKey);
      } catch {}
    }
    if (patientId) {
      try {
        const query = resolvedAppId ? `?appointment_id=${resolvedAppId}` : '';
        await ApiClient.delete(`/v1/clinical/draft/${moduleType}/${patientId}${query}`);
      } catch {}
    }
    setIsDirty(false);
    setAutosaveStatus('idle');
    clearingDraftRef.current = false;
  };

  return {
    autosaveStatus,
    lastSavedTime,
    isDirty,
    forceSaveDraft: performSaveDraft,
    clearDraft,
    conflictModalOpen,
    serverDraftData,
    localDraftData,
    resolveConflict
  };
}
