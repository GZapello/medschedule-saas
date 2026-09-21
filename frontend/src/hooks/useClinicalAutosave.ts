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
  const debounceTimerRef = useRef<any>(null);
  const payloadRef = useRef<Record<string, any>>(payload);
  payloadRef.current = payload;

  const currentPatientRef = useRef<string | null | undefined>(patientId);
  currentPatientRef.current = patientId;

  const resolvedAppId = appointmentId && appointmentId !== 'none' ? appointmentId : null;
  const localDraftKey = patientId ? `zemda_draft_${moduleType}_${patientId}_${resolvedAppId || 'none'}` : null;

  // 1. Recuperação Inicial ao alterar Paciente ou Appointment
  useEffect(() => {
    if (!patientId || !enabled) {
      initialLoadedRef.current = false;
      setIsDirty(false);
      setAutosaveStatus('idle');
      return;
    }

    let isSubscribed = true;
    initialLoadedRef.current = false;
    setIsDirty(false);
    setAutosaveStatus('idle');

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

        if (!isSubscribed) return;

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
        if (isSubscribed) {
          setTimeout(() => {
            initialLoadedRef.current = true;
          }, 600);
        }
      }
    }

    recoverDraft();

    return () => {
      isSubscribed = false;
    };
  }, [patientId, resolvedAppId, moduleType, enabled]);

  // 2. Função de Persistência (Backend + Contingência Local)
  const performSaveDraft = useCallback(async (): Promise<boolean> => {
    if (!patientId || !enabled) return false;

    const now = new Date();
    const clientUpdatedAt = now.toISOString();
    const currentPayload = payloadRef.current;

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

      await ApiClient.post('/v1/clinical/draft', {
        moduleType,
        patientId,
        appointmentId: resolvedAppId,
        draftData: currentPayload,
        clientUpdatedAt
      });

      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setLastSavedTime(timeStr);
      setAutosaveStatus('saved');
      setIsDirty(false);
      return true;
    } catch (err: any) {
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
    if (!initialLoadedRef.current || !patientId || !enabled) return;

    setIsDirty(true);
    setAutosaveStatus('saving');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSaveDraft();
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
