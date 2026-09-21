import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../api/client';
import {
  TourDefinition,
  TourStep,
  TOURS_BY_PROFILE,
  MODULE_TOURS,
  filterTourByPermissions
} from './tourRegistry';

export const CURRENT_ONBOARDING_VERSION = 'v1.1';

export interface UserOnboardingData {
  onboardingStatus: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'dismissed';
  onboardingStartedAt: string | null;
  onboardingCompletedAt: string | null;
  onboardingLastStep: number;
  onboardingVersion: string;
  onboardingDismissed: boolean;
  moduleToursCompleted: string[];
  whatsNewDismissed: string[];
}

interface OnboardingContextType {
  // Estado do Onboarding
  onboardingData: UserOnboardingData;
  loading: boolean;

  // Estado do Tour Ativo
  isTourActive: boolean;
  currentTour: TourDefinition | null;
  currentStepIndex: number;
  currentStep: TourStep | null;

  // Modais de Controle
  isWelcomeModalOpen: boolean;
  isHelpOpen: boolean;
  isWhatsNewOpen: boolean;
  isShortcutsOpen: boolean;
  isModuleSelectorOpen: boolean;

  // Ações do Tour
  startTour: (tourId?: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  finishTour: () => void;
  dismissPermanently: () => void;
  startModuleTour: (moduleId: string) => void;
  resetTour: (resetModules?: boolean) => Promise<void>;

  // Ações de Modais
  openWelcomeModal: () => void;
  closeWelcomeModal: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  openWhatsNew: () => void;
  closeWhatsNew: () => void;
  openShortcuts: () => void;
  closeShortcuts: () => void;
  openModuleSelector: () => void;
  closeModuleSelector: () => void;

  // Módulos disponíveis ao usuário
  availableModules: { id: string; name: string; icon?: string }[];
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'zemda_user_onboarding_cache';

export const OnboardingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    currentUser,
    userPermissions,
    isSuperAdmin,
    isClinicAdmin,
    isProfessional,
    isReceptionist,
    isPhysiotherapist,
    isDentist,
    isNutritionist,
    isOccupationalTherapist,
    isSpeechTherapist,
    isPsychologist,
    isPsychopedagogue,
    isPersonalTrainer,
    isZemdaBody
  } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);

  // Estado persistido
  const [onboardingData, setOnboardingData] = useState<UserOnboardingData>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (_) {}
    return {
      onboardingStatus: 'pending',
      onboardingStartedAt: null,
      onboardingCompletedAt: null,
      onboardingLastStep: 1,
      onboardingVersion: CURRENT_ONBOARDING_VERSION,
      onboardingDismissed: false,
      moduleToursCompleted: [],
      whatsNewDismissed: []
    };
  });

  // Tour ativo
  const [isTourActive, setIsTourActive] = useState<boolean>(false);
  const [currentTour, setCurrentTour] = useState<TourDefinition | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);

  // Modais
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState<boolean>(false);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [isModuleSelectorOpen, setIsModuleSelectorOpen] = useState<boolean>(false);

  // Lista dinâmica de módulos clínicos aos quais o usuário tem permissão
  const availableModules = React.useMemo(() => {
    const list: { id: string; name: string }[] = [];
    if (isSpeechTherapist || isClinicAdmin) list.push({ id: 'zemda_fono', name: 'ZemdaFono (Fonoaudiologia)' });
    if (isPsychologist || isClinicAdmin) list.push({ id: 'zemda_psico', name: 'ZemdaPsico (Psicologia)' });
    if (isDentist || isClinicAdmin) list.push({ id: 'zemda_odonto', name: 'ZemdaOdonto (Odontologia)' });
    if (isNutritionist || isClinicAdmin) list.push({ id: 'zemda_nutri', name: 'ZemdaNutri (Nutrição)' });
    if (isPhysiotherapist || isClinicAdmin) list.push({ id: 'zemda_fisio', name: 'ZemdaFisio (Fisioterapia)' });
    if (isOccupationalTherapist || isClinicAdmin) list.push({ id: 'zemda_to', name: 'ZemdaTO (Terapia Ocupacional)' });
    if (isPersonalTrainer || isClinicAdmin) list.push({ id: 'zemda_personal', name: 'ZemdaPersonal (Educação Física)' });
    if (isPsychopedagogue || isClinicAdmin) list.push({ id: 'zemda_pp', name: 'ZemdaPP (Psicopedagogia)' });
    if (isZemdaBody || isClinicAdmin || isProfessional) list.push({ id: 'zemda_body', name: 'ZemdaBody (Mapa Corporal)' });
    return list;
  }, [
    isSpeechTherapist,
    isPsychologist,
    isDentist,
    isNutritionist,
    isPhysiotherapist,
    isOccupationalTherapist,
    isPersonalTrainer,
    isPsychopedagogue,
    isZemdaBody,
    isClinicAdmin,
    isProfessional
  ]);

  // Carrega preferências do backend
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadOnboarding() {
      try {
        const res = await ApiClient.get<any>('/v1/user-onboarding');
        if (isMounted && res) {
          const freshData: UserOnboardingData = {
            onboardingStatus: res.onboardingStatus || 'pending',
            onboardingStartedAt: res.onboardingStartedAt || null,
            onboardingCompletedAt: res.onboardingCompletedAt || null,
            onboardingLastStep: res.onboardingLastStep || 1,
            onboardingVersion: res.onboardingVersion || CURRENT_ONBOARDING_VERSION,
            onboardingDismissed: !!res.onboardingDismissed,
            moduleToursCompleted: Array.isArray(res.moduleToursCompleted) ? res.moduleToursCompleted : [],
            whatsNewDismissed: Array.isArray(res.whatsNewDismissed) ? res.whatsNewDismissed : []
          };

          setOnboardingData(freshData);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(freshData));

          // Se for o primeiro acesso real (pendente, nunca dispensado, e não pulado nesta sessão)
          const sessionSkipped = sessionStorage.getItem('zemda_onboarding_session_skipped') === '1';
          if (
            freshData.onboardingStatus === 'pending' &&
            !freshData.onboardingDismissed &&
            !sessionSkipped &&
            !currentUser?.needsOnboarding
          ) {
            // Abre o modal discreto de primeiro acesso após pequeno delay de montagem
            setTimeout(() => {
              if (isMounted) setIsWelcomeModalOpen(true);
            }, 800);
          }
        }
      } catch (err) {
        console.warn('Fallback para cache local de onboarding:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadOnboarding();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Persiste dados no backend e localStorage
  const persistState = useCallback(async (partial: Partial<UserOnboardingData>) => {
    setOnboardingData(prev => {
      const updated = { ...prev, ...partial };
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      } catch (_) {}

      // Sincroniza em background com o backend
      ApiClient.post('/v1/user-onboarding', updated).catch(e => {
        console.warn('Erro ao sincronizar onboarding com o backend:', e);
      });

      return updated;
    });
  }, []);

  // Determina o tour geral padrão com base no perfil do usuário
  const getDefaultTourId = useCallback((): string => {
    if (isSuperAdmin || isClinicAdmin) return 'clinic_admin';
    if (isReceptionist) return 'receptionist';
    if (userPermissions?.includes('manage_financial') || (currentUser as any)?.role === 'financial') return 'financial';
    if (isProfessional) return 'solo_professional';
    return 'solo_professional';
  }, [currentUser, isSuperAdmin, isClinicAdmin, isReceptionist, isProfessional]);

  // Inicia um tour (geral ou pelo ID fornecido)
  const startTour = useCallback((tourId?: string) => {
    const targetTourId = tourId || getDefaultTourId();
    let rawTour = TOURS_BY_PROFILE[targetTourId] || MODULE_TOURS[targetTourId];

    if (!rawTour) {
      console.warn(`Tour não encontrado: ${targetTourId}`);
      return;
    }

    const filtered = filterTourByPermissions(rawTour, currentUser?.role, userPermissions);
    if (filtered.steps.length === 0) {
      console.warn('Tour sem etapas visíveis para as permissões atuais.');
      return;
    }

    setCurrentTour(filtered);
    setCurrentStepIndex(0);
    setIsTourActive(true);
    setIsWelcomeModalOpen(false);
    setIsHelpOpen(false);

    // Se o primeiro passo requerer navegação para uma rota específica
    const firstStep = filtered.steps[0];
    if (firstStep?.route) {
      window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: firstStep.route } }));
    }

    persistState({
      onboardingStatus: 'in_progress',
      onboardingStartedAt: new Date().toISOString(),
      onboardingLastStep: 1
    });
  }, [getDefaultTourId, currentUser?.role, userPermissions, persistState]);

  // Inicia tour de módulo especializado
  const startModuleTour = useCallback((moduleId: string) => {
    const rawTour = MODULE_TOURS[moduleId];
    if (!rawTour) return;

    const filtered = filterTourByPermissions(rawTour, currentUser?.role, userPermissions);
    setCurrentTour(filtered);
    setCurrentStepIndex(0);
    setIsTourActive(true);
    setIsHelpOpen(false);
    setIsModuleSelectorOpen(false);

    // Navega para a tela do módulo caso o primeiro passo exija
    const firstStep = filtered.steps[0];
    if (firstStep?.route) {
      window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: firstStep.route } }));
    }
  }, [currentUser?.role, userPermissions]);

  // Avança para o próximo passo
  const nextStep = useCallback(() => {
    if (!currentTour) return;
    const nextIdx = currentStepIndex + 1;

    if (nextIdx < currentTour.steps.length) {
      setCurrentStepIndex(nextIdx);
      const step = currentTour.steps[nextIdx];
      if (step?.route) {
        window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: step.route } }));
      }
      persistState({ onboardingLastStep: nextIdx + 1 });
    } else {
      // Concluiu todas as etapas
      finishTour();
    }
  }, [currentTour, currentStepIndex, persistState]);

  // Retorna para o passo anterior
  const prevStep = useCallback(() => {
    if (!currentTour) return;
    const prevIdx = currentStepIndex - 1;

    if (prevIdx >= 0) {
      setCurrentStepIndex(prevIdx);
      const step = currentTour.steps[prevIdx];
      if (step?.route) {
        window.dispatchEvent(new CustomEvent('zemda-navigate', { detail: { view: step.route } }));
      }
      persistState({ onboardingLastStep: prevIdx + 1 });
    }
  }, [currentTour, currentStepIndex, persistState]);

  // Pula o tour por agora (salva 'skipped' na sessão e no backend)
  const skipTour = useCallback(() => {
    sessionStorage.setItem('zemda_onboarding_session_skipped', '1');
    setIsTourActive(false);
    setIsWelcomeModalOpen(false);

    persistState({
      onboardingStatus: 'skipped'
    });
  }, [persistState]);

  // Conclui formalmente o tour ativo
  const finishTour = useCallback(() => {
    setIsTourActive(false);

    const isModuleTour = currentTour?.id && MODULE_TOURS[currentTour.id];
    if (isModuleTour && currentTour) {
      const updatedModules = Array.from(new Set([...onboardingData.moduleToursCompleted, currentTour.id]));
      persistState({
        moduleToursCompleted: updatedModules
      });
    } else {
      persistState({
        onboardingStatus: 'completed',
        onboardingCompletedAt: new Date().toISOString()
      });
    }
  }, [currentTour, onboardingData.moduleToursCompleted, persistState]);

  // Escolha "Não mostrar novamente"
  const dismissPermanently = useCallback(() => {
    setIsWelcomeModalOpen(false);
    setIsTourActive(false);

    persistState({
      onboardingStatus: 'dismissed',
      onboardingDismissed: true
    });
  }, [persistState]);

  // Reinicia o tour através da Central de Ajuda
  const resetTour = useCallback(async (resetModules = false) => {
    try {
      await ApiClient.post('/v1/user-onboarding/reset', { resetModuleTours: resetModules });
      sessionStorage.removeItem('zemda_onboarding_session_skipped');

      setOnboardingData(prev => ({
        ...prev,
        onboardingStatus: 'pending',
        onboardingStartedAt: null,
        onboardingCompletedAt: null,
        onboardingLastStep: 1,
        onboardingDismissed: false,
        moduleToursCompleted: resetModules ? [] : prev.moduleToursCompleted
      }));

      // Inicia imediatamente o tour padrão
      startTour();
    } catch (e) {
      console.warn('Erro ao reiniciar onboarding:', e);
      startTour();
    }
  }, [startTour]);

  // Atalho de Teclado Global (ESC fecha tour, Alt+H abre Ajuda)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC fecha o tour ou modais de onboarding
      if (e.key === 'Escape') {
        if (isTourActive) {
          setIsTourActive(false);
          return;
        }
        if (isHelpOpen) {
          setIsHelpOpen(false);
          return;
        }
        if (isWhatsNewOpen) {
          setIsWhatsNewOpen(false);
          return;
        }
        if (isShortcutsOpen) {
          setIsShortcutsOpen(false);
          return;
        }
        if (isModuleSelectorOpen) {
          setIsModuleSelectorOpen(false);
          return;
        }
        if (isWelcomeModalOpen) {
          setIsWelcomeModalOpen(false);
          sessionStorage.setItem('zemda_onboarding_session_skipped', '1');
          return;
        }
      }

      // Atalho de teclado: Alt + H para abrir a Central de Ajuda
      if (e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setIsHelpOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTourActive, isHelpOpen, isWhatsNewOpen, isShortcutsOpen, isModuleSelectorOpen, isWelcomeModalOpen]);

  const currentStep = currentTour?.steps[currentStepIndex] || null;

  return (
    <OnboardingContext.Provider
      value={{
        onboardingData,
        loading,
        isTourActive,
        currentTour,
        currentStepIndex,
        currentStep,
        isWelcomeModalOpen,
        isHelpOpen,
        isWhatsNewOpen,
        isShortcutsOpen,
        isModuleSelectorOpen,
        startTour,
        nextStep,
        prevStep,
        skipTour,
        finishTour,
        dismissPermanently,
        startModuleTour,
        resetTour,
        openWelcomeModal: () => setIsWelcomeModalOpen(true),
        closeWelcomeModal: () => setIsWelcomeModalOpen(false),
        openHelp: () => setIsHelpOpen(true),
        closeHelp: () => setIsHelpOpen(false),
        openWhatsNew: () => setIsWhatsNewOpen(true),
        closeWhatsNew: () => setIsWhatsNewOpen(false),
        openShortcuts: () => setIsShortcutsOpen(true),
        closeShortcuts: () => setIsShortcutsOpen(false),
        openModuleSelector: () => setIsModuleSelectorOpen(true),
        closeModuleSelector: () => setIsModuleSelectorOpen(false),
        availableModules
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding deve ser utilizado dentro de um OnboardingProvider');
  }
  return context;
}
