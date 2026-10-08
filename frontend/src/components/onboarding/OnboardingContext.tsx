import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ApiClient } from '../../api/client';
import { TourDefinition, TourStep, TOURS_BY_PROFILE, MODULE_TOURS, ClinicalModuleInfo, ALL_CLINICAL_MODULES, filterTourByPermissions } from './tourRegistry';

export const CURRENT_ONBOARDING_VERSION = 'v1.2';

export interface UserOnboardingData {
  onboardingStatus: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'dismissed';
  onboardingStartedAt: string | null;
  onboardingCompletedAt: string | null;
  onboardingLastStep: number;
  onboardingTourId?: string;
  onboardingStepId?: string;
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
  isModuleSelectorOpen: boolean;

  // Ações do Tour
  startTour: (tourId?: string) => void;
  resumeTour: () => void;
  closeTour: () => void;
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
  openModuleSelector: () => void;
  closeModuleSelector: () => void;

  // Módulos disponíveis ao usuário
  availableModules: ClinicalModuleInfo[];
  clinicalModule: ClinicalModuleInfo | null;
  isPureAdmin: boolean;
  isZemda360: boolean;
  isZemdaBody: boolean;
}


const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);
const initialData = (): UserOnboardingData => ({
  onboardingStatus: 'pending', onboardingStartedAt: null, onboardingCompletedAt: null,
  onboardingLastStep: 1, onboardingVersion: CURRENT_ONBOARDING_VERSION, onboardingDismissed: false,
  moduleToursCompleted: [], whatsNewDismissed: []
});
const writeCache = (key: string, data: UserOnboardingData) => {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* Storage may be disabled. */ }
};

export const OnboardingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const { currentUser, currentTenant, userPermissions, isClinicAdmin, isProfessional, isReceptionist, isSuperAdmin, isZemda360, isZemdaBody } = auth;
  const identity = currentUser ? `zemda_onboarding_${currentTenant?.id || currentUser.tenantId || 'global'}_${currentUser.id}` : '';
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [loadedIdentity, setLoadedIdentity] = useState('');
  const loading = !identity || loadedIdentity !== identity;
  const [onboardingData, setOnboardingData] = useState(initialData);
  const dataRef = useRef(onboardingData);
  const revision = useRef(0);
  const temporarilyClosed = useRef(false);
  const saveQueue = useRef(Promise.resolve());
  const [isTourActive, setIsTourActive] = useState(false);
  const [currentTour, setCurrentTour] = useState<TourDefinition | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tourAccess, setTourAccess] = useState('');
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const [isModuleSelectorOpen, setIsModuleSelectorOpen] = useState(false);

  // Match the actual route guards, not profession-name guesses or tenant-wide enablement.
  const moduleAccess: Record<string, boolean> = {
    zemda_med: auth.isDoctor || auth.isZemdaMed || auth.hasCapability('MEDICAL_BASE') || auth.hasCapability('medical_consultations'),
    zemda_fono: auth.isSpeechTherapist || auth.isZemdaFono || auth.hasCapability('AUDIOMETRY'),
    zemda_psico: auth.isPsychologist || auth.isZemdaPsico || auth.hasCapability('BEHAVIORAL_TRACKING'),
    zemda_odonto: auth.isDentist || auth.isZemdaOdonto || auth.hasCapability('ODONTOGRAM'),
    zemda_nutri: auth.isNutritionist || auth.isZemdaNutri || auth.hasCapability('DIET_PRESCRIBE'),
    zemda_fisio: auth.isPhysiotherapist || auth.isZemdaFisio || auth.hasCapability('MOBILITY_ASSESSMENT'),
    zemda_to: auth.isOccupationalTherapist || auth.isZemdaTO || auth.hasCapability('SENSORY_INTEGRATION'),
    zemda_personal: auth.isPersonalTrainer || auth.isZemdaPersonal || auth.hasCapability('TRAINING_PRESCRIBE') || auth.hasCapability('PHYSICAL_ASSESSMENT'),
    zemda_pp: auth.isPsychopedagogue || auth.isZemdaPP || auth.hasCapability('LEARNING_ASSESSMENT'),
    zemda_estetic: auth.isEsthetician || auth.isZemdaEstetic || auth.hasCapability('ESTETIC_FACIAL')
  };
  const professionModules: Record<string, boolean> = {
    zemda_med: auth.isDoctor || auth.isZemdaMed,
    zemda_fono: auth.isSpeechTherapist || auth.isZemdaFono,
    zemda_psico: auth.isPsychologist || auth.isZemdaPsico,
    zemda_odonto: auth.isDentist || auth.isZemdaOdonto,
    zemda_nutri: auth.isNutritionist || auth.isZemdaNutri,
    zemda_fisio: auth.isPhysiotherapist || auth.isZemdaFisio,
    zemda_to: auth.isOccupationalTherapist || auth.isZemdaTO,
    zemda_personal: auth.isPersonalTrainer || auth.isZemdaPersonal,
    zemda_pp: auth.isPsychopedagogue || auth.isZemdaPP,
    zemda_estetic: auth.isEsthetician || auth.isZemdaEstetic
  };
  // Shared capabilities (e.g. mobility in Personal) do not imply another profession.
  const availableModules = ALL_CLINICAL_MODULES.filter(m => !isSuperAdmin && (isProfessional || isClinicAdmin) &&
    (professionModules[m.id] || auth.commercialModule?.toLowerCase() === m.id.replace('_', '')) && moduleAccess[m.id]);
  const clinicalModule = availableModules[0] || null;
  const isPureAdmin = isClinicAdmin && availableModules.length === 0;
  const accessSignature = JSON.stringify([identity, currentUser?.role, userPermissions, availableModules.map(m => m.id), isZemdaBody]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const loadRevision = ++revision.current;
    temporarilyClosed.current = false;
    setIsTourActive(false); setCurrentTour(null); setCurrentStepIndex(0);
    setIsWelcomeModalOpen(false); setIsHelpOpen(false); setIsWhatsNewOpen(false); setIsModuleSelectorOpen(false);
    dataRef.current = initialData(); setOnboardingData(dataRef.current); setLoadedIdentity('');
    if (!identity) return;
    const load = async () => {
      let cached = initialData();
      try { cached = { ...cached, ...JSON.parse(localStorage.getItem(identity) || '{}') }; } catch { /* Invalid cache is ignored. */ }
      try {
        const fresh = await ApiClient.get<UserOnboardingData>('/v1/user-onboarding');
        if (cancelled || identityRef.current !== identity || revision.current !== loadRevision) return;
        cached = { ...initialData(), ...fresh };
        writeCache(identity, cached);
      } catch { /* Backend remains primary; scoped cache is an offline fallback only. */ }
      if (cancelled || identityRef.current !== identity || revision.current !== loadRevision) return;
      cached.moduleToursCompleted = Array.isArray(cached.moduleToursCompleted) ? cached.moduleToursCompleted : [];
      cached.whatsNewDismissed = Array.isArray(cached.whatsNewDismissed) ? cached.whatsNewDismissed : [];
      dataRef.current = cached; setOnboardingData(cached); setLoadedIdentity(identity);
      let closed = false;
      try { closed = sessionStorage.getItem(`${identity}_closed`) === '1'; } catch { /* optional */ }
      if (cached.onboardingStatus === 'pending' && !cached.onboardingDismissed && !closed && !temporarilyClosed.current && !currentUser?.needsOnboarding && !isSuperAdmin) {
        timer = setTimeout(() => { if (!cancelled && !temporarilyClosed.current && revision.current === loadRevision) setIsWelcomeModalOpen(true); }, 800);
      }
    };
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [identity, currentUser?.needsOnboarding, isSuperAdmin]);

  const persistState = useCallback((partial: Partial<UserOnboardingData>) => {
    if (!identity || identityRef.current !== identity) return;
    revision.current++;
    const updated = { ...dataRef.current, ...partial };
    dataRef.current = updated; setOnboardingData(updated); writeCache(identity, updated);
    // Serialize writes; an older Next request must never overwrite a newer close/finish.
    saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
      if (identityRef.current !== identity) return;
      try { await ApiClient.post('/v1/user-onboarding', updated); }
      catch (error) { console.warn('Não foi possível sincronizar o guia; progresso salvo nesta conta.', error); }
    });
  }, [identity]);

  const closeTour = useCallback(() => {
    temporarilyClosed.current = true;
    setIsTourActive(false); setIsWelcomeModalOpen(false);
    try { sessionStorage.setItem(`${identity}_closed`, '1'); } catch { /* optional */ }
    window.dispatchEvent(new CustomEvent('zemda-tour-prepare', { detail: { sidebar: false } }));
  }, [identity]);

  useEffect(() => {
    if (isTourActive && tourAccess !== accessSignature) closeTour();
  }, [isTourActive, tourAccess, accessSignature, closeTour]);

  const defaultTourId = isClinicAdmin ? 'clinic_admin' : isReceptionist ? 'receptionist' : isProfessional ? 'solo_professional' : 'financial';
  const buildTour = (id: string): TourDefinition | null => {
    const raw = TOURS_BY_PROFILE[id] || MODULE_TOURS[id];
    if (!raw || isSuperAdmin) return null;
    const routes = new Set((document.querySelector('[data-tour-routes]')?.getAttribute('data-tour-routes') || '').split(' '));
    routes.add('settings');
    if (MODULE_TOURS[id] && !(id === 'zemda_body' ? isZemdaBody : availableModules.some(m => m.id === id))) return null;
    const steps = filterTourByPermissions(raw, currentUser?.role, userPermissions).steps.map(step => {
      if (step.target === '[data-tour="nav-clinical-module"]') {
        return { ...step, route: clinicalModule?.route, target: `[data-tour="nav-${clinicalModule?.route}"]` };
      }
      return step;
    }).filter(step => {
      if (!step.route) return false;
      if (MODULE_TOURS[id]) return true;
      if (step.target.startsWith('[data-tour="settings-')) return isClinicAdmin;
      // Match the current API role gates as well as the menu's granular permissions.
      // See GET /v1/payments, /v1/inventory and /v1/reports/* in backend routes.
      if (step.route === 'reports' && !isClinicAdmin) return false;
      if (['financial', 'inventory'].includes(step.route) && !isClinicAdmin && !isReceptionist) return false;
      return routes.has(step.route);
    });
    return steps.length ? { ...raw, steps } : null;
  };
  const begin = (tourId?: string, resume = false) => {
    if (loading) return;
    const tour = buildTour(tourId || defaultTourId);
    if (!tour) return;
    const saved = dataRef.current;
    const sameTour = !saved.onboardingTourId || saved.onboardingTourId === tour.id;
    const savedIdIndex = tour.steps.findIndex(s => s.id === saved.onboardingStepId);
    const index = resume && sameTour ? (savedIdIndex >= 0 ? savedIdIndex : Math.max(0, Math.min(tour.steps.length - 1, (Number(saved.onboardingLastStep) || 1) - 1))) : 0;
    setCurrentTour(tour); setCurrentStepIndex(index); setTourAccess(accessSignature); setIsTourActive(true);
    setIsWelcomeModalOpen(false); setIsHelpOpen(false); setIsModuleSelectorOpen(false); setIsWhatsNewOpen(false);
    persistState({ onboardingStatus: 'in_progress', onboardingStartedAt: resume ? saved.onboardingStartedAt || new Date().toISOString() : new Date().toISOString(),
      onboardingLastStep: index + 1, onboardingTourId: tour.id, onboardingStepId: tour.steps[index].id, onboardingVersion: CURRENT_ONBOARDING_VERSION });
  };
  const startTour = (id?: string) => begin(id);
  const resumeTour = () => {
    const id = dataRef.current.onboardingTourId || defaultTourId;
    begin(buildTour(id) ? id : defaultTourId, true);
  };
  const finishTour = () => {
    closeTour();
    persistState({ onboardingStatus: 'completed', onboardingCompletedAt: new Date().toISOString(),
      ...(currentTour && MODULE_TOURS[currentTour.id] ? { moduleToursCompleted: Array.from(new Set([...dataRef.current.moduleToursCompleted, currentTour.id])) } : {}) });
  };
  const moveStep = (index: number) => {
    if (!currentTour || index < 0) return;
    if (index >= currentTour.steps.length) { finishTour(); return; }
    setCurrentStepIndex(index);
    persistState({ onboardingLastStep: index + 1, onboardingStepId: currentTour.steps[index].id });
  };
  const skipTour = () => { closeTour(); persistState({ onboardingStatus: 'skipped' }); };
  const dismissPermanently = () => { closeTour(); persistState({ onboardingStatus: 'dismissed', onboardingDismissed: true }); };
  const resetTour = async (resetModules = false) => {
    if (resetModules) {
      await saveQueue.current;
      await ApiClient.post('/v1/user-onboarding/reset', { resetModuleTours: true });
      if (identityRef.current !== identity) return;
      persistState({ moduleToursCompleted: [] });
    }
    startTour();
  };

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isHelpOpen) setIsHelpOpen(false);
      else if (isWhatsNewOpen) setIsWhatsNewOpen(false);
      else if (isModuleSelectorOpen) setIsModuleSelectorOpen(false);
      else if (isTourActive || isWelcomeModalOpen) closeTour();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [isTourActive, isWelcomeModalOpen, isHelpOpen, isWhatsNewOpen, isModuleSelectorOpen, closeTour]);

  return <OnboardingContext.Provider value={{
    onboardingData, loading, isTourActive: isTourActive && !loading && tourAccess === accessSignature, currentTour, currentStepIndex,
    currentStep: currentTour?.steps[currentStepIndex] || null,
    isWelcomeModalOpen: isWelcomeModalOpen && !loading, isHelpOpen, isWhatsNewOpen, isModuleSelectorOpen,
    startTour, resumeTour, closeTour, nextStep: () => moveStep(currentStepIndex + 1), prevStep: () => moveStep(currentStepIndex - 1),
    skipTour, finishTour, dismissPermanently, startModuleTour: startTour, resetTour,
    openWelcomeModal: () => setIsWelcomeModalOpen(true), closeWelcomeModal: closeTour,
    openHelp: () => { closeTour(); setIsHelpOpen(true); }, closeHelp: () => setIsHelpOpen(false),
    openWhatsNew: () => setIsWhatsNewOpen(true), closeWhatsNew: () => setIsWhatsNewOpen(false),
    openModuleSelector: () => setIsModuleSelectorOpen(true), closeModuleSelector: () => setIsModuleSelectorOpen(false),
    availableModules, clinicalModule, isPureAdmin, isZemda360, isZemdaBody
  }}>{children}</OnboardingContext.Provider>;
};

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding deve ser utilizado dentro de um OnboardingProvider');
  return context;
}
