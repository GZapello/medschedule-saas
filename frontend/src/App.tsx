import { updatePublicSeo, clearPublicSeo } from './utils/publicSeo';
import { getRouteByPath } from './data/seoPagesData';
import { useLayoutEffect } from 'react';
import { updateMetaPixelContext } from './utils/metaPixel';
import { BillingView, BillingBanner, useBillingSummary } from './components/billing/BillingView';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ApiClient } from './api/client';
const Navbar = lazyWithRetry(() => import('./components/common/Navbar').then(module => ({ default: module.Navbar })), 'Navbar');
const Sidebar = lazyWithRetry(() => import('./components/common/Sidebar').then(module => ({ default: module.Sidebar })), 'Sidebar');
const AuthPage = lazyWithRetry(() => import('./components/auth/AuthPage').then(module => ({ default: module.AuthPage })), 'AuthPage');
const DashboardView = lazyWithRetry(() => import('./components/dashboard/DashboardView').then(module => ({ default: module.DashboardView })), 'DashboardView');
const CalendarView = lazyWithRetry(() => import('./components/calendar/CalendarView').then(module => ({ default: module.CalendarView })), 'CalendarView');
const PatientsView = lazyWithRetry(() => import('./components/patients/PatientsView').then(module => ({ default: module.PatientsView })), 'PatientsView');
const ClinicalRecordsView = lazyWithRetry(() => import('./components/clinical/ClinicalRecordsView').then(module => ({ default: module.ClinicalRecordsView })), 'ClinicalRecordsView');
const ZemdaBodyRecordsView = lazyWithRetry(() => import('./components/zemda-body/ZemdaBodyRecordsView').then(module => ({ default: module.ZemdaBodyRecordsView })), 'ZemdaBodyRecordsView');
const ZemdaPersonalView = lazyWithRetry(() => import('./components/personal/ZemdaPersonalView').then(module => ({ default: module.ZemdaPersonalView })), 'ZemdaPersonalView');
const PhysiotherapyWorkspace = lazyWithRetry(() => import('./components/physiotherapy/PhysiotherapyWorkspace').then(module => ({ default: module.PhysiotherapyWorkspace })), 'PhysiotherapyWorkspace');
const DentistryWorkspace = lazyWithRetry(() => import('./components/dentistry/DentistryWorkspace').then(module => ({ default: module.DentistryWorkspace })), 'DentistryWorkspace');
const NutritionWorkspace = lazyWithRetry(() => import('./components/nutrition/NutritionWorkspace').then(module => ({ default: module.NutritionWorkspace })), 'NutritionWorkspace');
const OccupationalTherapyWorkspace = lazyWithRetry(() => import('./components/occupational-therapy/OccupationalTherapyWorkspace').then(module => ({ default: module.OccupationalTherapyWorkspace })), 'OccupationalTherapyWorkspace');
const SpeechTherapyWorkspace = lazyWithRetry(() => import('./components/speech-therapy/SpeechTherapyWorkspace').then(module => ({ default: module.SpeechTherapyWorkspace })), 'SpeechTherapyWorkspace');
const PsychologyWorkspace = lazyWithRetry(() => import('./components/psychology/PsychologyWorkspace').then(module => ({ default: module.PsychologyWorkspace })), 'PsychologyWorkspace');
const PsychopedagogyWorkspace = lazyWithRetry(() => import('./components/psychopedagogy/PsychopedagogyWorkspace').then(module => ({ default: module.PsychopedagogyWorkspace })), 'PsychopedagogyWorkspace');
const VerifyDocumentView = lazyWithRetry(() => import('./components/public/VerifyDocumentView').then(module => ({ default: module.VerifyDocumentView })), 'VerifyDocumentView');
const PersonalPublicStudentWorkoutView = lazyWithRetry(() => import('./components/personal/PersonalPublicStudentWorkoutView').then(module => ({ default: module.PersonalPublicStudentWorkoutView })), 'PersonalPublicStudentWorkoutView');
const ProfessionalsView = lazyWithRetry(() => import('./components/professionals/ProfessionalsView').then(module => ({ default: module.ProfessionalsView })), 'ProfessionalsView');
const ServicesView = lazyWithRetry(() => import('./components/services/ServicesView').then(module => ({ default: module.ServicesView })), 'ServicesView');
const FinancialView = lazyWithRetry(() => import('./components/financial/FinancialView').then(module => ({ default: module.FinancialView })), 'FinancialView');
const ReceiptsView = lazyWithRetry(() => import('./components/receipts/ReceiptsView').then(module => ({ default: module.ReceiptsView })), 'ReceiptsView');
const StaffManagementView = lazyWithRetry(() => import('./components/staff/StaffManagementView').then(module => ({ default: module.StaffManagementView })), 'StaffManagementView');
const TaxonomyView = lazyWithRetry(() => import('./components/taxonomy/TaxonomyView').then(module => ({ default: module.TaxonomyView })), 'TaxonomyView');
const ReportsView = lazyWithRetry(() => import('./components/reports/ReportsView').then(module => ({ default: module.ReportsView })), 'ReportsView');
const ImportDataView = lazyWithRetry(() => import('./components/import/ImportDataView').then(module => ({ default: module.ImportDataView })), 'ImportDataView');
const AuditView = lazyWithRetry(() => import('./components/audit/AuditView').then(module => ({ default: module.AuditView })), 'AuditView');
const SettingsView = lazyWithRetry(() => import('./components/settings/SettingsView').then(module => ({ default: module.SettingsView })), 'SettingsView');
const SuperAdminView = lazyWithRetry(() => import('./components/superadmin/SuperAdminView').then(module => ({ default: module.SuperAdminView })), 'SuperAdminView');
const PublicBookingView = lazyWithRetry(() => import('./components/public-booking/PublicBookingView').then(module => ({ default: module.PublicBookingView })), 'PublicBookingView');
const PublicProfessionalBookingView = lazyWithRetry(() => import('./components/public-booking/PublicProfessionalBookingView').then(module => ({ default: module.PublicProfessionalBookingView })), 'PublicProfessionalBookingView');
const InviteRegisterView = lazyWithRetry(() => import('./components/auth/InviteRegisterView').then(module => ({ default: module.InviteRegisterView })), 'InviteRegisterView');
const FreeTrialActivationView = lazyWithRetry(() => import('./components/auth/FreeTrialActivationView').then(module => ({ default: module.FreeTrialActivationView })), 'FreeTrialActivationView');
const WorkSchedulesView = lazyWithRetry(() => import('./components/schedules/WorkSchedulesView').then(module => ({ default: module.WorkSchedulesView })), 'WorkSchedulesView');
const SupportTicketsView = lazyWithRetry(() => import('./components/support/SupportTicketsView').then(module => ({ default: module.SupportTicketsView })), 'SupportTicketsView');
const PendingExamsView = lazyWithRetry(() => import('./components/exams/PendingExamsView').then(module => ({ default: module.PendingExamsView })), 'PendingExamsView');
const InventoryView = lazyWithRetry(() => import('./components/inventory/InventoryView').then(module => ({ default: module.InventoryView })), 'InventoryView');
const BudgetsView = lazyWithRetry(() => import('./components/budgets/BudgetsView').then(module => ({ default: module.BudgetsView })), 'BudgetsView');
const ProfessionalPayrollView = lazyWithRetry(() => import('./components/payroll/ProfessionalPayrollView').then(module => ({ default: module.ProfessionalPayrollView })), 'ProfessionalPayrollView');
const ZemdaMedWorkspace = lazyWithRetry(() => import('./components/medical/ZemdaMedWorkspace').then(module => ({ default: module.ZemdaMedWorkspace })), 'ZemdaMedWorkspace');
const MyResourcesView = lazyWithRetry(() => import('./components/profile/MyResourcesView').then(module => ({ default: module.MyResourcesView })), 'MyResourcesView');
const SuperAdminLaboratoryView = lazyWithRetry(() => import('./components/superadmin/SuperAdminLaboratoryView').then(module => ({ default: module.SuperAdminLaboratoryView })), 'SuperAdminLaboratoryView');
import { ZemdaLandingPage } from './components/public/ZemdaLandingPage';
import { PublicSeoPageView } from './components/public/PublicSeoPageView';
import { PublicHeader } from './components/public/PublicHeader';
import { PublicFooter } from './components/public/PublicFooter';
import { SEO_PAGES, isValidApplicationRoute, buildCanonical } from './data/seoPagesData';
const NewAppointmentModal = lazyWithRetry(() => import('./components/calendar/NewAppointmentModal').then(module => ({ default: module.NewAppointmentModal })), 'NewAppointmentModal');
const NewPatientModal = lazyWithRetry(() => import('./components/patients/NewPatientModal').then(module => ({ default: module.NewPatientModal })), 'NewPatientModal');
const AICopilotDrawer = lazyWithRetry(() => import('./components/ai-copilot/AICopilotDrawer').then(module => ({ default: module.AICopilotDrawer })), 'AICopilotDrawer');
const QuickAIAssistantShortcut = lazyWithRetry(() => import('./components/ai-copilot/QuickAIAssistantShortcut').then(module => ({ default: module.QuickAIAssistantShortcut })), 'QuickAIAssistantShortcut');
import { NetworkOfflineModal } from './components/common/NetworkOfflineModal';
import { UpdateNotificationModal } from './components/common/UpdateNotificationModal';
import { TermsOfUseView } from './components/public/TermsOfUseView';
import { PrivacyPolicyView } from './components/public/PrivacyPolicyView';
import { CookieBanner } from './components/common/CookieBanner';
import { CookiePreferencesModal } from './components/common/CookiePreferencesModal';
const LegalReacceptanceModal = lazyWithRetry(() => import('./components/common/LegalReacceptanceModal').then(module => ({ default: module.LegalReacceptanceModal })), 'LegalReacceptanceModal');
import { OnboardingProvider } from './components/onboarding/OnboardingContext';
const OnboardingSpotlight = lazyWithRetry(() => import('./components/onboarding/OnboardingSpotlight').then(module => ({ default: module.OnboardingSpotlight })), 'OnboardingSpotlight');
const OnboardingWelcomeModal = lazyWithRetry(() => import('./components/onboarding/OnboardingWelcomeModal').then(module => ({ default: module.OnboardingWelcomeModal })), 'OnboardingWelcomeModal');
const OnboardingHelpModal = lazyWithRetry(() => import('./components/onboarding/OnboardingHelpModal').then(module => ({ default: module.OnboardingHelpModal })), 'OnboardingHelpModal');
const WhatsNewModal = lazyWithRetry(() => import('./components/onboarding/WhatsNewModal').then(module => ({ default: module.WhatsNewModal })), 'WhatsNewModal');
const KeyboardShortcutsModal = lazyWithRetry(() => import('./components/onboarding/KeyboardShortcutsModal').then(module => ({ default: module.KeyboardShortcutsModal })), 'KeyboardShortcutsModal');
import { trackPageView } from './utils/analytics';
import { Sparkles, AlertCircle } from 'lucide-react';

function updateDocumentSeo(options: {
  title: string;
  description?: string;
  canonical?: string;
  robots?: 'index, follow' | 'noindex, nofollow';
}) {
  document.title = options.title;

  if (options.description) {
    let descMeta = document.querySelector('meta[name="description"]');
    if (!descMeta) {
      descMeta = document.createElement('meta');
      descMeta.setAttribute('name', 'description');
      document.head.appendChild(descMeta);
    }
    descMeta.setAttribute('content', options.description);
  }

  let canonicalLink = document.querySelector('link[rel="canonical"]');
  if (options.canonical) {
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', options.canonical);
  } else if (canonicalLink) {
    canonicalLink.remove();
  }

  let robotsMeta = document.querySelector('meta[name="robots"]');
  if (options.robots) {
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.setAttribute('name', 'robots');
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.setAttribute('content', options.robots);
  }
}

export const VIEW_TO_PATH: Record<string, string> = {
  dashboard: '/dashboard',
  calendar: '/agenda',
  patients: '/pacientes',
  clinical: '/atendimentos',
  'zemda-body': '/mapa-corporal',
  'zemda-med': '/zemda-med',
  'zemda-personal': '/zemda-personal',
  'zemda-fisio': '/zemda-fisio',
  'zemda-odonto': '/zemda-odonto',
  'nutrition-workspace': '/zemda-nutri',
  'occupational-therapy-workspace': '/zemda-to',
  'speech-therapy-workspace': '/zemda-fono',
  'zemda-psico': '/zemda-psico',
  'psychopedagogy-workspace': '/zemda-pp',
  professionals: '/profissionais',
  services: '/servicos',
  financial: '/financeiro',
  receipts: '/recibos',
  staff: '/equipe',
  schedules: '/horarios',
  budgets: '/orcamentos',
  payroll: '/comissoes',
  inventory: '/estoque',
  'pending-exams': '/exames-pendentes',
  'support-tickets': '/suporte',
  reports: '/relatorios',
  settings: '/configuracoes',
  superadmin: '/superadmin',
  billing: '/assinatura'
};

export const PATH_TO_VIEW: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/agenda': 'calendar',
  '/pacientes': 'patients',
  '/atendimentos': 'clinical',
  '/mapa-corporal': 'zemda-body',
  '/zemda-med': 'zemda-med',
  '/zemda-personal': 'zemda-personal',
  '/zemda-fisio': 'zemda-fisio',
  '/zemda-odonto': 'zemda-odonto',
  '/zemda-nutri': 'nutrition-workspace',
  '/zemda-to': 'occupational-therapy-workspace',
  '/zemda-fono': 'speech-therapy-workspace',
  '/zemda-psico': 'zemda-psico',
  '/zemda-pp': 'psychopedagogy-workspace',
  '/profissionais': 'professionals',
  '/servicos': 'services',
  '/financeiro': 'financial',
  '/recibos': 'receipts',
  '/equipe': 'staff',
  '/horarios': 'schedules',
  '/orcamentos': 'budgets',
  '/comissoes': 'payroll',
  '/estoque': 'inventory',
  '/exames-pendentes': 'pending-exams',
  '/suporte': 'support-tickets',
  '/relatorios': 'reports',
  '/configuracoes': 'settings',
  '/superadmin': 'superadmin',
  '/assinatura': 'billing'
};

export function parseRouteFromPath(pathname: string): { view: string; subId?: string } | null {
  const clean = pathname.replace(/\/+$/, '') || '/';

  // Sub-rotas específicas
  const personalStudentMatch = clean.match(/^\/zemda-personal\/(?:alunos\/)?([^/]+)$/);
  if (personalStudentMatch) {
    return { view: 'zemda-personal', subId: personalStudentMatch[1] };
  }

  const patientMatch = clean.match(/^\/pacientes\/([^/]+)$/);
  if (patientMatch) {
    return { view: 'patients', subId: patientMatch[1] };
  }

  if (PATH_TO_VIEW[clean]) {
    return { view: PATH_TO_VIEW[clean] };
  }

  // Fallback para views cujo nome direto seja /viewName
  const direct = clean.replace(/^\//, '');
  if (VIEW_TO_PATH[direct]) {
    return { view: direct };
  }

  return null;
}

const AppContent: React.FC = () => {
  const {
    currentUser,
    currentTenant,
    loading,
    reloadSession,
    isSuperAdmin,
    isPhysiotherapist,
    isZemdaFisio,
    isDentist,
    isZemdaOdonto,
    isNutritionist,
    isZemdaNutri,
    isOccupationalTherapist,
    isZemdaTO,
    isSpeechTherapist,
    isZemdaFono,
    isPsychologist,
    isZemdaPsico,
    isPsychopedagogue,
    isZemdaPP,
    isPersonalTrainer,
    isZemdaPersonal,
    isDoctor,
    isZemdaMed,
    hasCapability,
    isSandboxSession,
    exitSandboxSession
  } = useAuth();

  const { summary: billingSummary } = useBillingSummary();

  // Resolução inicial de rota para suportar F5, histórico e links diretos
  const getInitialRoute = () => {
    const parsed = parseRouteFromPath(window.location.pathname);
    if (parsed) return parsed;
    const saved = sessionStorage.getItem('activeView');
    if (saved && (VIEW_TO_PATH[saved] || PATH_TO_VIEW[`/${saved}`])) {
      return { view: saved };
    }
    return { view: 'dashboard' };
  };

  const initialRoute = useRef(getInitialRoute()).current;
  const [currentView, setCurrentView] = useState<string>(initialRoute.view);
  const [subRouteId, setSubRouteId] = useState<string | null>(initialRoute.subId || null);

  const handleNavigateView = (view: string, subId?: string | null) => {
    if ((view === 'superadmin' || view === 'audit') && currentUserRef.current?.role !== 'superadmin') {
      return;
    }
    setCurrentView(view);
    setSubRouteId(subId || null);
    sessionStorage.setItem('activeView', view);

    // Determina URL canônica da rota
    let targetPath = VIEW_TO_PATH[view] || `/${view}`;
    if (view === 'zemda-personal' && subId) {
      targetPath = `/zemda-personal/alunos/${subId}`;
    } else if (view === 'patients' && subId) {
      targetPath = `/pacientes/${subId}`;
    }

    if (window.location.pathname !== targetPath) {
      window.history.pushState({ view, subId }, '', targetPath);
    }
  };

  const [billingReturnHome, setBillingReturnHome] = useState(() => window.location.pathname === '/' && sessionStorage.getItem('zemda-billing-return-home') === '1');
  const leaveBillingHome = () => {
    sessionStorage.removeItem('zemda-billing-return-home');
    setBillingReturnHome(false);
  };
  const [publicView, setPublicView] = useState<'landing' | 'login'>(window.location.pathname.startsWith('/assinatura') ? 'login' : 'landing');

  // Roteamento de páginas públicas de nicho (SEO)
  const getInitialSeoSlug = (): string | null => {
    const cleanPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
    return cleanPath && SEO_PAGES[cleanPath] ? cleanPath : null;
  };
  const [activeSeoSlug, setActiveSeoSlug] = useState<string | null>(getInitialSeoSlug);

  // Roteamento para agendamento individual de profissional (/agendar/:slug)
  const getInitialProfSlug = (): string | null => {
    const match = window.location.pathname.match(/^\/agendar\/([^/]+)/);
    return match ? match[1] : null;
  };
  const [activeProfSlug, setActiveProfSlug] = useState<string | null>(getInitialProfSlug);

  // Roteamento para convite único de clínica (/convite/:clinicSlug/:token ou /convite/:token)
  const getInitialInvite = (): { clinicSlug?: string; token: string } | null => {
    const doubleMatch = window.location.pathname.match(/^\/convite\/([^/]+)\/([^/]+)/);
    if (doubleMatch) return { clinicSlug: doubleMatch[1], token: doubleMatch[2] };
    const singleMatch = window.location.pathname.match(/^\/convite\/([^/]+)/);
    if (singleMatch) return { token: singleMatch[1] };
    return null;
  };
  const [activeInvite, setActiveInvite] = useState<{ clinicSlug?: string; token: string } | null>(getInitialInvite);

  // Roteamento para teste grátis (/teste-gratis/:token ou query params ?teste-gratis=:token / ?trial=:token)
  const getInitialTrialToken = (): string | null => {
    const match = window.location.pathname.match(/^\/teste-gratis\/([^/]+)/);
    if (match) return match[1];
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('teste-gratis') || urlParams.get('trial') || null;
  };
  const [activeTrialToken, setActiveTrialToken] = useState<string | null>(getInitialTrialToken);

  // Roteamento para páginas legais (/termos-de-uso, /privacidade e /cookies)
  const getInitialLegalPage = (): 'terms' | 'privacy' | null => {
    const cleanPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (cleanPath === 'termos-de-uso') return 'terms';
    if (cleanPath === 'privacidade') return 'privacy';
    if (cleanPath === 'cookies') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-cookie-preferences'));
      }, 300);
      return 'privacy';
    }
    return null;
  };
  const [activeLegalPage, setActiveLegalPage] = useState<'terms' | 'privacy' | null>(getInitialLegalPage);

  // Roteamento para verificação pública de documento (/verificar-documento/:token)
  const getInitialVerificationToken = (): string | null => {
    const match = window.location.pathname.match(/^\/verificar-documento\/([^/]+)/);
    return match ? match[1] : null;
  };
  const [activeVerificationToken, setActiveVerificationToken] = useState<string | null>(getInitialVerificationToken);

  // Roteamento para execução de treinos do aluno (/treino/:token)
  const getInitialWorkoutToken = (): string | null => {
    const match = window.location.pathname.match(/^\/treino\/([^/]+)/);
    return match ? match[1] : null;
  };
  const [activeWorkoutToken, setActiveWorkoutToken] = useState<string | null>(getInitialWorkoutToken);

  useLayoutEffect(() => {
    const publicScreen = !loading && !currentUser && publicView === 'landing'
      && currentView !== 'public_preview' && !activeProfSlug && !activeInvite
      && !activeTrialToken && !activeVerificationToken && !activeWorkoutToken;
    updateMetaPixelContext(publicScreen ? window.location.pathname : null);
  });

  const navigateToSeoPage = (slug: string) => {
    if (SEO_PAGES[slug]) {
      setActiveSeoSlug(slug);
      window.history.pushState(null, '', `/${slug}`);
    }
  };

  const navigateToHome = () => {
    setActiveSeoSlug(null);
    window.history.pushState(null, '', '/');
  };

  const [authInitialAction, setAuthInitialAction] = useState<'login' | 'create-clinic' | 'register-user'>('login');
  const [selectedRegistrationPlan, setSelectedRegistrationPlan] = useState<string | undefined>(undefined);
  const [isRegistrationTrial, setIsRegistrationTrial] = useState<boolean | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [isNewApptOpen, setIsNewApptOpen] = useState<boolean>(false);
  const [newApptPrefill, setNewApptPrefill] = useState<{ date?: string; time?: string; professionalId?: string } | undefined>(undefined);
  const [isNewPatientOpen, setIsNewPatientOpen] = useState<boolean>(false);

  const handleOpenNewAppointment = (prefill?: { date?: string; time?: string; professionalId?: string }) => {
    setNewApptPrefill(prefill);
    setIsNewApptOpen(true);
  };

  // Contexto ativo para a IA — rastreado via eventos de componentes filhos
  const [aiActivePatientId, setAiActivePatientId] = useState<string | undefined>(undefined);
  const [aiActiveAppointmentId, setAiActiveAppointmentId] = useState<string | undefined>(undefined);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>(undefined);
  const [aiInitialTab, setAiInitialTab] = useState<'chat' | 'audio_draft' | 'improve_text' | undefined>(undefined);
  const [aiAutoSend, setAiAutoSend] = useState<boolean>(false);
  const [isAIOpen, setIsAIOpen] = useState<boolean>(false);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  // Escuta eventos de contexto disparados por componentes filhos (PatientsView, CalendarView, etc.)
  useEffect(() => {
    const handlePatientContext = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.patientId) setAiActivePatientId(detail.patientId);
      else setAiActivePatientId(undefined);
    };
    const handleAppointmentContext = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.appointmentId) setAiActiveAppointmentId(detail.appointmentId);
      else setAiActiveAppointmentId(undefined);
      if (detail?.patientId) setAiActivePatientId(detail.patientId);
    };
    const handleOpenAI = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.patientId) setAiActivePatientId(detail.patientId);
      if (detail?.appointmentId) setAiActiveAppointmentId(detail.appointmentId);
      if (detail?.tab) setAiInitialTab(detail.tab);
      if (detail?.prompt) {
        setAiInitialPrompt(detail.prompt);
        setAiAutoSend(!!detail.autoSend);
      }
      setIsAIOpen(true);
    };

    const handleNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.view) {
        if ((detail.view === 'superadmin' || detail.view === 'audit') && currentUserRef.current?.role !== 'superadmin') {
          return;
        }
        handleNavigateView(detail.view, detail.subId || null);
      }
    };

    window.addEventListener('zemda-ai-patient-context', handlePatientContext);
    window.addEventListener('zemda-ai-appointment-context', handleAppointmentContext);
    window.addEventListener('open-zemda-ai', handleOpenAI);
    window.addEventListener('zemda-navigate', handleNavigate);
    return () => {
      window.removeEventListener('zemda-ai-patient-context', handlePatientContext);
      window.removeEventListener('zemda-ai-appointment-context', handleAppointmentContext);
      window.removeEventListener('open-zemda-ai', handleOpenAI);
      window.removeEventListener('zemda-navigate', handleNavigate);
    };
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'superadmin') {
      setCurrentView(prev => (prev === 'dashboard' ? 'superadmin' : prev));
    } else {
      setCurrentView(prev => (prev === 'superadmin' ? 'dashboard' : prev));
    }
  }, [currentUser?.role]);

  // Sincronização dinâmica de Metadados de SEO, Canonical e Google Analytics 4 na SPA
  useEffect(() => {
    if (loading) return;
    const path = window.location.pathname;
    const route = getRouteByPath(path);
    const sensitiveScreen = activeProfSlug || activeInvite || activeTrialToken || activeVerificationToken || activeWorkoutToken || currentView === 'public_preview';
    const publicScreen = !currentUser && !sensitiveScreen && (publicView === 'landing' || activeSeoSlug || activeLegalPage || path === '/planos');
    if (publicScreen && route) {
      updatePublicSeo(route);
      trackPageView(route.path, route.title);
      return;
    }
    clearPublicSeo();
      const viewTitles: Record<string, string> = {
        dashboard: 'Painel Operacional',
        calendar: 'Agenda de Atendimentos',
        patients: 'Pacientes',
        'clinical-records': 'Prontuários',
        'physiotherapy-records': 'ZemdaFisio',
        'dentistry-workspace': 'ZemdaOdonto',
        'nutrition-workspace': 'ZemdaNutri',
        'occupational-therapy-workspace': 'ZemdaTO',
        'speech-therapy-workspace': 'ZemdaFono',
        'zemda-psico': 'ZemdaPsico',
        professionals: 'Profissionais',
        services: 'Catálogo de Serviços',
        financial: 'Financeiro',
        receipts: 'Recibos',
        staff: 'Equipe',
        schedules: 'Horários de Atendimento',
        budgets: 'Orçamentos',
        payroll: 'Comissões e Repasses',
        inventory: 'Estoque',
        'pending-exams': 'Exames Pendentes',
        'support-tickets': 'Central de Chamados',
        reports: 'Relatórios Gerenciais',
        settings: 'Configurações da Clínica',
        superadmin: 'Administração Global',
        billing: 'Assinatura e Planos',
        onboarding: 'Configuração Inicial'
      };
    const title = currentUser ? (viewTitles[currentView] ? `Zemda • ${viewTitles[currentView]}` : `Zemda • ${currentView}`) : !isValidApplicationRoute(path) ? 'Página não encontrada (404) | Zemda' : 'Zemda • Acesso Seguro';
    updateDocumentSeo({title, description:'Acesso à plataforma Zemda.', robots:'noindex, nofollow'});
    trackPageView(currentUser ? `/${currentView}` : '/login', title);
  }, [loading, currentUser, currentView, publicView, activeSeoSlug, activeProfSlug, activeInvite, activeLegalPage, activeTrialToken, activeVerificationToken, activeWorkoutToken]);

  // Tratamento do botão Voltar nativo do Android
  useEffect(() => {
    const handleBackButton = () => {
      // 1. Fecha modais de criação/edição se estiverem abertos
      if (isNewApptOpen) {
        setIsNewApptOpen(false);
        return;
      }
      if (isNewPatientOpen) {
        setIsNewPatientOpen(false);
        return;
      }
      if (isAIOpen) {
        setIsAIOpen(false);
        return;
      }
      if (sidebarOpen) {
        setSidebarOpen(false);
        return;
      }
      // 2. Se houver modal genérico com botão Fechar aberto, clica nele
      const modalClose = document.querySelector('[role="dialog"] button[aria-label="Fechar"], button.close-modal') as HTMLElement;
      if (modalClose) {
        modalClose.click();
        return;
      }
      // 3. Se estiver em página legal, volta para a tela anterior / home
      if (activeLegalPage) {
        setActiveLegalPage(null);
        window.history.pushState(null, '', '/');
        return;
      }
      // 3.0 Se estiver em verificação pública de documento, volta para home
      if (activeVerificationToken) {
        setActiveVerificationToken(null);
        window.history.pushState(null, '', '/');
        return;
      }
      // 3.01 Se estiver em treino do aluno, volta para home
      if (activeWorkoutToken) {
        setActiveWorkoutToken(null);
        window.history.pushState(null, '', '/');
        return;
      }
      // 3.1 Se estiver em link de teste grátis, volta para home
      if (activeTrialToken) {
        setActiveTrialToken(null);
        window.history.pushState(null, '', '/');
        return;
      }
      // 4. Se estiver na página pública individual do profissional, volta para a home
      if (activeProfSlug) {
        setActiveProfSlug(null);
        window.history.pushState(null, '', '/');
        return;
      }
      // 5. Se estiver em página de SEO de nicho, retorna para a home pública
      if (!currentUser && activeSeoSlug) {
        navigateToHome();
        return;
      }
      // 6. Se estiver na tela de login deslogado, volta para a landing page institucional Zemda
      if (!currentUser && publicView === 'login') {
        setPublicView('landing');
        return;
      }
      // 7. Se estiver em visualização secundária, retorna ao dashboard
      if (currentView !== 'dashboard' && currentUser?.role !== 'superadmin') {
        setCurrentView('dashboard');
        return;
      }
    };

    const handleSyncUrlState = () => {
      if (currentUserRef.current) {
        const parsed = parseRouteFromPath(window.location.pathname);
        if (parsed) {
          setCurrentView(parsed.view);
          setSubRouteId(parsed.subId || null);
          sessionStorage.setItem('activeView', parsed.view);
        } else if (window.location.pathname === '/' || window.location.pathname === '') {
          setCurrentView('dashboard');
          setSubRouteId(null);
          sessionStorage.setItem('activeView', 'dashboard');
        }
      }

      if (!currentUserRef.current) setPublicView(window.location.pathname === '/login' || window.location.pathname === '/cadastro' ? 'login' : 'landing');
      const cleanPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
      if (cleanPath === 'termos-de-uso') {
        setActiveLegalPage('terms');
      } else if (cleanPath === 'privacidade') {
        setActiveLegalPage('privacy');
      } else {
        setActiveLegalPage(null);
      }

      if (cleanPath && SEO_PAGES[cleanPath]) {
        setActiveSeoSlug(cleanPath);
      } else {
        setActiveSeoSlug(null);
      }

      const verificationMatch = window.location.pathname.match(/^\/verificar-documento\/([^/]+)/);
      setActiveVerificationToken(verificationMatch ? verificationMatch[1] : null);

      const workoutMatch = window.location.pathname.match(/^\/treino\/([^/]+)/);
      setActiveWorkoutToken(workoutMatch ? workoutMatch[1] : null);

      const match = window.location.pathname.match(/^\/agendar\/([^/]+)/);
      setActiveProfSlug(match ? match[1] : null);

      const doubleInviteMatch = window.location.pathname.match(/^\/convite\/([^/]+)\/([^/]+)/);
      if (doubleInviteMatch) {
        setActiveInvite({ clinicSlug: doubleInviteMatch[1], token: doubleInviteMatch[2] });
      } else {
        const singleInviteMatch = window.location.pathname.match(/^\/convite\/([^/]+)/);
        setActiveInvite(singleInviteMatch ? { token: singleInviteMatch[1] } : null);
      }

      const trialMatch = window.location.pathname.match(/^\/teste-gratis\/([^/]+)/);
      if (trialMatch) {
        setActiveTrialToken(trialMatch[1]);
      } else {
        const urlParams = new URLSearchParams(window.location.search);
        setActiveTrialToken(urlParams.get('teste-gratis') || urlParams.get('trial') || null);
      }
    };

    const handleDocumentClick = (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const target = (e.target as HTMLElement).closest('a');
      if (!target || target.getAttribute('target') === '_blank') return;
      const href = target.getAttribute('href');
      if (href === '/termos-de-uso') {
        e.preventDefault();
        window.history.pushState(null, '', '/termos-de-uso');
        setActiveLegalPage('terms');
      } else if (href === '/privacidade') {
        e.preventDefault();
        window.history.pushState(null, '', '/privacidade');
        setActiveLegalPage('privacy');
      } else if (href && href.startsWith('/verificar-documento/')) {
        e.preventDefault();
        const token = href.replace('/verificar-documento/', '');
        window.history.pushState(null, '', href);
        setActiveVerificationToken(token);
      } else if (href && href.startsWith('/treino/')) {
        e.preventDefault();
        const token = href.replace('/treino/', '');
        window.history.pushState(null, '', href);
        setActiveWorkoutToken(token);
      }
    };

    window.addEventListener('android-back-button', handleBackButton);
    window.addEventListener('popstate', handleSyncUrlState);
    document.addEventListener('click', handleDocumentClick);

    let cleanupCapacitorListener: (() => void) | null = null;
    try {
      const capApp = (window as any).Capacitor?.Plugins?.App;
      if (capApp && typeof capApp.addListener === 'function') {
        const result = capApp.addListener('backButton', () => {
          handleBackButton();
        });

        if (result && typeof result.then === 'function') {
          result.then((handle: any) => {
            if (handle && typeof handle.remove === 'function') {
              cleanupCapacitorListener = () => {
                try { handle.remove(); } catch (_) {}
              };
            }
          }).catch(() => {});
        } else if (result && typeof result.remove === 'function') {
          cleanupCapacitorListener = () => {
            try { result.remove(); } catch (_) {}
          };
        }
      }
    } catch (e) {
      console.warn('Listener nativo de backButton indisponível:', e);
    }

    return () => {
      window.removeEventListener('android-back-button', handleBackButton);
      window.removeEventListener('popstate', handleSyncUrlState);
      document.removeEventListener('click', handleDocumentClick);
      if (cleanupCapacitorListener) {
        cleanupCapacitorListener();
      }
    };
  }, [isNewApptOpen, isNewPatientOpen, isAIOpen, sidebarOpen, currentView, currentUser, publicView, activeSeoSlug, activeLegalPage]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-300 text-sm font-semibold">Carregando Zemda...</p>
        </div>
      </div>
    );
  }

  // Se o usuário está acessando verificação pública de autenticidade de documento (/verificar-documento/:token)
  if (activeVerificationToken) {
    return (
      <VerifyDocumentView
        token={activeVerificationToken}
        onBackToHome={() => {
          setActiveVerificationToken(null);
          window.history.pushState(null, '', '/');
          if (!currentUser) setPublicView('landing');
        }}
      />
    );
  }

  // Se o aluno está acessando a área exclusiva de execução de treinos (/treino/:token)
  if (activeWorkoutToken) {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <PersonalPublicStudentWorkoutView token={activeWorkoutToken} />
      </Suspense>
    );
  }

  // Se o usuário está em modo público de agendamento online
  if (currentView === 'public_preview') {
    return (
      <PublicBookingView
        tenantSlug={currentTenant?.slug || 'clinica-viver-bem'}
        onBackToApp={() => {
          if (currentUser) {
            setCurrentView('dashboard');
          } else {
            setCurrentView('dashboard');
            setPublicView('landing');
          }
        }}
      />
    );
  }

  // Se o usuário está acessando páginas legais (/termos-de-uso ou /privacidade)
  if (activeLegalPage === 'terms') {
    return (
      <TermsOfUseView
        onBack={() => {
          setActiveLegalPage(null);
          window.history.pushState(null, '', '/');
          if (!currentUser) setPublicView('landing');
        }}
        onLogin={() => {
          setActiveLegalPage(null);
          window.history.pushState(null, '', '/');
          setAuthInitialAction('login');
          setPublicView('login');
        }}
        onRegisterClinic={() => {
          setActiveLegalPage(null);
          window.history.pushState(null, '', '/');
          setAuthInitialAction('create-clinic');
          setPublicView('login');
        }}
      />
    );
  }

  if (activeLegalPage === 'privacy') {
    return (
      <PrivacyPolicyView
        onBack={() => {
          setActiveLegalPage(null);
          window.history.pushState(null, '', '/');
          if (!currentUser) setPublicView('landing');
        }}
        onLogin={() => {
          setActiveLegalPage(null);
          window.history.pushState(null, '', '/');
          setAuthInitialAction('login');
          setPublicView('login');
        }}
        onRegisterClinic={() => {
          setActiveLegalPage(null);
          window.history.pushState(null, '', '/');
          setAuthInitialAction('create-clinic');
          setPublicView('login');
        }}
      />
    );
  }

  // Se o usuário está acessando a página pública individual do profissional (/agendar/:slug)
  if (activeProfSlug) {
    return (
      <PublicProfessionalBookingView
        slug={activeProfSlug}
        onBackToApp={() => {
          setActiveProfSlug(null);
          window.history.pushState(null, '', '/');
          if (currentUser) {
            setCurrentView('dashboard');
          } else {
            setPublicView('landing');
          }
        }}
      />
    );
  }

  // Se o usuário está acessando link único de convite da clínica (/convite/:clinicSlug/:token ou /convite/:token)
  if (activeInvite) {
    // Se o usuário já está autenticado, não deve permanecer preso no convite: abre diretamente o dashboard
    if (currentUser) {
      setActiveInvite(null);
      setCurrentView('dashboard');
      try {
        sessionStorage.setItem('activeView', 'dashboard');
      } catch (_) {}
      window.history.replaceState({}, '', '/dashboard');
      return null;
    }

    return (
      <InviteRegisterView
        clinicSlug={activeInvite.clinicSlug}
        token={activeInvite.token}
        onBackToLogin={() => {
          setActiveInvite(null);
          window.history.pushState(null, '', '/');
          setPublicView('login');
          setAuthInitialAction('login');
        }}
        onSuccess={() => {
          setActiveInvite(null);
          setCurrentView('dashboard');
          try {
            sessionStorage.setItem('activeView', 'dashboard');
          } catch (_) {}
          window.history.replaceState({}, '', '/dashboard');
        }}
      />
    );
  }

  // Se o usuário está acessando link de teste grátis (/teste-gratis/:token)
  if (activeTrialToken) {
    return (
      <FreeTrialActivationView
        token={activeTrialToken}
        onBackToHome={() => {
          setActiveTrialToken(null);
          window.history.pushState(null, '', '/');
          setPublicView('landing');
        }}
        onSuccess={() => {
          setActiveTrialToken(null);
          window.history.pushState(null, '', '/');
          reloadSession();
        }}
      />
    );
  }

  const callback = window.location.pathname.match(/^\/assinatura\/(sucesso|cancelada|expirada)\/?$/)?.[1];
  if (callback || window.location.pathname === '/planos') {
    if (!currentUser && window.location.pathname === '/planos') {
      return <main><BillingView publicPage /></main>;
    }
    return (
      <BillingView
        publicPage={window.location.pathname === '/planos' || !currentUser}
        callback={callback}
      />
    );
  }
  // Se não estiver logado, exibe páginas de SEO de nicho, Landing Page ou Login
  if (!currentUser || billingReturnHome) {
    // Se a rota acessada for inválida (404 real)
    if (!isValidApplicationRoute(window.location.pathname)) {
      return (
        <div className="min-h-screen bg-[#fafbfc] text-slate-800 font-sans flex flex-col justify-between">
          <PublicHeader
            onLogin={() => {
              window.history.pushState(null, '', '/login');
              setPublicView('login');
            }}
            onRegisterClinic={() => {
              window.history.pushState(null, '', '/cadastro');
              setAuthInitialAction('create-clinic');
              setPublicView('login');
            }}
            isLegalOrAuxiliary={true}
            onNavigateHome={navigateToHome}
          />
          <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 max-w-xl mx-auto">
            <span className="text-6xl sm:text-7xl font-black text-teal-600 mb-2">404</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">Página não encontrada</h1>
            <p className="text-slate-500 mb-8 text-sm leading-relaxed">
              O endereço que você tentou acessar não existe, foi removido ou está temporariamente indisponível.
            </p>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateToHome();
              }}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-sm shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
            >
              Voltar para a página inicial
            </a>
          </main>
          <PublicFooter
            onLogin={() => {
              window.history.pushState(null, '', '/login');
              setPublicView('login');
            }}
            onRegisterClinic={() => {
              window.history.pushState(null, '', '/cadastro');
              setAuthInitialAction('create-clinic');
              setPublicView('login');
            }}
            onNavigateSeoPage={navigateToSeoPage}
            onNavigateHome={navigateToHome}
          />
        </div>
      );
    }

    if (activeSeoSlug && SEO_PAGES[activeSeoSlug]) {
      return (
        <PublicSeoPageView
          pageData={SEO_PAGES[activeSeoSlug]}
          onNavigateHome={navigateToHome}
          onNavigatePage={navigateToSeoPage}
          onLogin={() => {
            setActiveSeoSlug(null);
            window.history.pushState(null, '', '/login');
            setAuthInitialAction('login');
            setPublicView('login');
          }}
          onRegisterClinic={() => {
            setActiveSeoSlug(null);
            window.history.pushState(null, '', '/login');
            setAuthInitialAction('create-clinic');
            setPublicView('login');
          }}
        />
      );
    }

    if (publicView === 'landing') {
      return (
        <ZemdaLandingPage
          onLogin={() => {
            leaveBillingHome();
            setAuthInitialAction('login');
            setPublicView('login');
          }}
          onRegisterClinic={(plan, isTrial) => {
            leaveBillingHome();
            setSelectedRegistrationPlan(plan);
            setIsRegistrationTrial(isTrial);
            setAuthInitialAction('create-clinic');
            setPublicView('login');
          }}
          onRegisterUser={() => {
            leaveBillingHome();
            setAuthInitialAction('register-user');
            setPublicView('login');
          }}
          onOpenPublicBooking={() => setCurrentView('public_preview')}
          onNavigateSeoPage={navigateToSeoPage}
        />
      );
    }

    return (
      <AuthPage
        onOpenPublicBooking={() => setCurrentView('public_preview')}
        onBackToLanding={() => {
          setActiveSeoSlug(null);
          setPublicView('landing');
        }}
        initialAction={authInitialAction}
        initialPlan={selectedRegistrationPlan}
        isTrial={isRegistrationTrial}
      />
    );
  }

  if (currentUser.role !== 'superadmin' && billingSummary && !billingSummary.canOperate) return <BillingView />;
  if (currentView === 'subscription' || window.location.pathname === '/assinatura') return <BillingView />;

  return (
    <div className="min-h-screen bg-[#fafbfc] flex flex-col">
      <BillingBanner summary={billingSummary} />
      {/* Floating Sandbox Simulation Banner */}
      {isSandboxSession && (
        <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-950 text-white px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 shadow-md border-b border-purple-500/30 sticky top-0 z-50">
          <div className="flex items-center gap-2 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>🧪 AMBIENTE DE TESTE — Simulação Ativa:</span>
            <span className="bg-purple-800/80 px-2 py-0.5 rounded-md border border-purple-400/40 text-purple-200">
              {currentUser?.name || currentUser?.professionName || 'Profissional'}
            </span>
            <span className="hidden sm:inline text-purple-300 font-normal">
              (Isolado: WhatsApp, Resend e Asaas bloqueados)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  await ApiClient.post('/v1/sandbox/reset', { tenantId: currentUser?.tenantId });
                  window.location.reload();
                } catch (e: any) {
                  alert(e.message || 'Erro ao resetar sandbox');
                }
              }}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
              title="Limpa e reseta dados de teste simulados neste ambiente"
            >
              Resetar Dados
            </button>
            <button
              onClick={() => setCurrentView('superadmin')}
              className="px-2.5 py-1 bg-purple-700 hover:bg-purple-600 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
            >
              Laboratório
            </button>
            <button
              onClick={exitSandboxSession}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer"
            >
              Encerrar Simulação
            </button>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        onOpenAI={() => setIsAIOpen(true)}
        onNavigate={handleNavigateView}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Responsive Sidebar */}
        <Sidebar
          currentView={currentView}
          onNavigate={handleNavigateView}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main View Container */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {currentView === 'dashboard' && (
            <DashboardView
              onNavigate={handleNavigateView}
              onOpenNewAppointment={handleOpenNewAppointment}
              onOpenNewPatient={() => setIsNewPatientOpen(true)}
            />
          )}

          {currentView === 'calendar' && (
            <CalendarView onOpenNewAppointment={handleOpenNewAppointment} />
          )}

          {currentView === 'patients' && (
            <PatientsView
              onOpenNewPatient={() => setIsNewPatientOpen(true)}
              onNavigate={handleNavigateView}
              initialPatientId={subRouteId}
              onSelectPatient={(pId) => handleNavigateView('patients', pId)}
            />
          )}

          {currentView === 'clinical' && <ClinicalRecordsView />}

          {currentView === 'zemda-med' && (
            (isDoctor || isZemdaMed || hasCapability('MEDICAL_BASE') || hasCapability('medical_consultations') || isSuperAdmin) ? (
              <ZemdaMedWorkspace />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto my-12">
                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Restrito: ZemdaMed</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Este módulo clínico é de uso exclusivo para médicos e especialistas com área de atuação em <strong>Medicina Geral e Especialidades</strong>.
                </p>
              </div>
            )
          )}

          {currentView === 'zemda-body' && <ZemdaBodyRecordsView />}

          {currentView === 'zemda-personal' && (
            (isPersonalTrainer || isZemdaPersonal || currentUser?.commercialModule === 'ZemdaPersonal' || hasCapability('TRAINING_PRESCRIBE') || hasCapability('PHYSICAL_ASSESSMENT') || isSuperAdmin) ? (
              <ZemdaPersonalView
                initialStudentId={subRouteId}
                onSelectStudent={(sId) => handleNavigateView('zemda-personal', sId)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto my-12">
                <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Exclusivo: ZemdaPersonal</h2>
                <p className="text-sm text-slate-600 mb-4">
                  O módulo ZemdaPersonal é de uso exclusivo para profissionais cuja profissão cadastrada seja <strong>Personal Trainer / Educação Física</strong> (CREF) ou com credencial correspondente.
                </p>
                <button
                  onClick={() => handleNavigateView('dashboard')}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  Voltar ao Início
                </button>
              </div>
            )
          )}

          {currentView === 'zemda-fisio' && (
            (isPhysiotherapist || isZemdaFisio || currentUser?.commercialModule === 'ZemdaFisio' || hasCapability('MOBILITY_ASSESSMENT') || isSuperAdmin) ? (
              <PhysiotherapyWorkspace />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto my-12">
                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Restrito: ZemdaFisio</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Este módulo clínico é de uso exclusivo para profissionais e gestores com área de atuação comprovada em <strong>Fisioterapia</strong>.
                </p>
              </div>
            )
          )}

          {currentView === 'zemda-odonto' && (
            (isDentist || isZemdaOdonto || currentUser?.commercialModule === 'ZemdaOdonto' || hasCapability('ODONTOGRAM') || isSuperAdmin) ? (
              <DentistryWorkspace />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto my-12">
                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Restrito: ZemdaOdonto</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Este módulo clínico é de uso exclusivo para cirurgiões-dentistas e gestores autorizados com área de atuação em <strong>Odontologia</strong>.
                </p>
              </div>
            )
          )}

          {currentView === 'zemda-nutri' && (
            (isNutritionist || isZemdaNutri || currentUser?.commercialModule === 'ZemdaNutri' || hasCapability('DIET_PRESCRIBE') || isSuperAdmin) ? (
              <NutritionWorkspace />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto my-12">
                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Restrito: ZemdaNutri</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Este módulo clínico é de uso exclusivo para nutricionistas e profissionais autorizados com área de atuação em <strong>Nutrição</strong>.
                </p>
              </div>
            )
          )}

          {currentView === 'zemda-to' && (
            (isOccupationalTherapist || isZemdaTO || currentUser?.commercialModule === 'ZemdaTO' || hasCapability('SENSORY_INTEGRATION') || isSuperAdmin) ? (
              <OccupationalTherapyWorkspace />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto my-12">
                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Restrito: ZemdaTO</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Este módulo clínico é de uso exclusivo para terapeutas ocupacionais com área de atuação em <strong>Terapia Ocupacional</strong>.
                </p>
              </div>
            )
          )}

          {currentView === 'zemda-fono' && (
            (isSpeechTherapist || isZemdaFono || currentUser?.commercialModule === 'ZemdaFono' || hasCapability('AUDIOMETRY') || isSuperAdmin) ? (
              <SpeechTherapyWorkspace />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto my-12">
                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Restrito: ZemdaFono</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Este módulo clínico é de uso exclusivo para fonoaudiólogos e profissionais com área de atuação em <strong>Fonoaudiologia</strong>.
                </p>
              </div>
            )
          )}

          {currentView === 'zemda-psico' && (
            (isPsychologist || isZemdaPsico || currentUser?.commercialModule === 'ZemdaPsico' || hasCapability('BEHAVIORAL_TRACKING') || isSuperAdmin) ? (
              <PsychologyWorkspace />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto my-12">
                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Restrito: ZemdaPsico</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Este módulo clínico é de uso exclusivo para psicólogos e profissionais com área de atuação em <strong>Psicologia Clínica</strong> (CRP).
                </p>
              </div>
            )
          )}

          {currentView === 'zemda-pp' && (
            (isPsychopedagogue || isZemdaPP || currentUser?.commercialModule === 'ZemdaPP' || hasCapability('LEARNING_ASSESSMENT') || isSuperAdmin) ? (
              <PsychopedagogyWorkspace />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto my-12">
                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Restrito: ZemdaPP</h2>
                <p className="text-sm text-slate-600 mb-4">
                  Este módulo clínico é de uso exclusivo para psicopedagogos com área de atuação em <strong>Psicopedagogia</strong>.
                </p>
              </div>
            )
          )}

          {currentView === 'pending-exams' && <PendingExamsView />}

          {currentView === 'professionals' && <ProfessionalsView />}

          {currentView === 'work-schedules' && <WorkSchedulesView />}

          {currentView === 'services' && <ServicesView />}

          {currentView === 'inventory' && <InventoryView />}

          {currentView === 'budgets' && <BudgetsView />}

          {currentView === 'financial' && <FinancialView />}

          {currentView === 'payroll' && <ProfessionalPayrollView />}

          {currentView === 'receipts' && <ReceiptsView />}

          {currentView === 'staff' && <StaffManagementView />}

          {currentView === 'taxonomy' && isSuperAdmin && <TaxonomyView />}

          {currentView === 'reports' && <ReportsView />}

          {currentView === 'support-tickets' && <SupportTicketsView />}

          {currentView === 'import' && <ImportDataView onNavigate={setCurrentView} />}

          {currentView === 'audit' && <AuditView />}

          {currentView === 'settings' && <SettingsView />}

          {currentView === 'my-resources' && <MyResourcesView />}

          {(currentView === 'sandbox' || currentView === 'laboratory') && isSuperAdmin && (
            <SuperAdminLaboratoryView />
          )}

          {currentView === 'superadmin' && isSuperAdmin && <SuperAdminView />}
        </main>
      </div>

      {/* Modais Globais */}
      <NewAppointmentModal
        isOpen={isNewApptOpen}
        onClose={() => {
          setIsNewApptOpen(false);
          setNewApptPrefill(undefined);
        }}
        initialPrefill={newApptPrefill}
        onSuccess={() => {
          window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
          setCurrentView('calendar');
        }}
      />

      <NewPatientModal
        isOpen={isNewPatientOpen}
        onClose={() => setIsNewPatientOpen(false)}
        onSuccess={() => setCurrentView('patients')}
      />

      <AICopilotDrawer
        isOpen={isAIOpen}
        onClose={() => {
          setIsAIOpen(false);
          setAiInitialPrompt(undefined);
          setAiInitialTab(undefined);
          setAiAutoSend(false);
        }}
        onAppointmentCreated={() => {
          window.dispatchEvent(new CustomEvent('zemda-appointment-updated'));
          setCurrentView('calendar');
        }}
        activePatientId={aiActivePatientId}
        activeAppointmentId={aiActiveAppointmentId}
        initialPrompt={aiInitialPrompt}
        initialTab={aiInitialTab}
        autoSend={aiAutoSend}
      />

      {/* Atalho Rápido Assistente IA com Logo da Clínica e Fundo Transparente */}
      <QuickAIAssistantShortcut
        tenant={currentTenant}
        onOpenCopilot={() => setIsAIOpen(true)}
      />
    </div>
  );
};

const PrivateOverlays: React.FC = () => {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  return <Suspense fallback={null}><LegalReacceptanceModal /><OnboardingSpotlight /><OnboardingWelcomeModal /><OnboardingHelpModal /><WhatsNewModal /><KeyboardShortcutsModal /></Suspense>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <OnboardingProvider>
          <Suspense fallback={<div role="status" className="min-h-screen flex items-center justify-center">Carregando Zemda...</div>}><AppContent /></Suspense>
          <PrivateOverlays />
          <CookieBanner />
          <CookiePreferencesModal />
          <NetworkOfflineModal />
          <UpdateNotificationModal />
        </OnboardingProvider>
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
