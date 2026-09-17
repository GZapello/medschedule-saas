import { BillingView, BillingBanner, useBillingSummary } from './components/billing/BillingView';
import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/common/Navbar';
import { Sidebar } from './components/common/Sidebar';
import { AuthPage } from './components/auth/AuthPage';
import { DashboardView } from './components/dashboard/DashboardView';
import { CalendarView } from './components/calendar/CalendarView';
import { PatientsView } from './components/patients/PatientsView';
import { ClinicalRecordsView } from './components/clinical/ClinicalRecordsView';
import { ZemdaBodyRecordsView } from './components/zemda-body/ZemdaBodyRecordsView';
import { ZemdaPersonalView } from './components/personal/ZemdaPersonalView';
import { PhysiotherapyRecordsView } from './components/physiotherapy/PhysiotherapyRecordsView';
import { DentistryWorkspace } from './components/dentistry/DentistryWorkspace';
import { NutritionWorkspace } from './components/nutrition/NutritionWorkspace';
import { OccupationalTherapyWorkspace } from './components/occupational-therapy/OccupationalTherapyWorkspace';
import { SpeechTherapyWorkspace } from './components/speech-therapy/SpeechTherapyWorkspace';
import { ProfessionalsView } from './components/professionals/ProfessionalsView';
import { ServicesView } from './components/services/ServicesView';
import { FinancialView } from './components/financial/FinancialView';
import { ReceiptsView } from './components/receipts/ReceiptsView';
import { StaffManagementView } from './components/staff/StaffManagementView';
import { TaxonomyView } from './components/taxonomy/TaxonomyView';
import { ReportsView } from './components/reports/ReportsView';
import { ImportDataView } from './components/import/ImportDataView';
import { AuditView } from './components/audit/AuditView';
import { SettingsView } from './components/settings/SettingsView';
import { SuperAdminView } from './components/superadmin/SuperAdminView';
import { OnboardingWizardView } from './components/onboarding/OnboardingWizardView';
import { PublicBookingView } from './components/public-booking/PublicBookingView';
import { PublicProfessionalBookingView } from './components/public-booking/PublicProfessionalBookingView';
import { InviteRegisterView } from './components/auth/InviteRegisterView';
import { FreeTrialActivationView } from './components/auth/FreeTrialActivationView';
import { WorkSchedulesView } from './components/schedules/WorkSchedulesView';
import { SupportTicketsView } from './components/support/SupportTicketsView';
import { PendingExamsView } from './components/exams/PendingExamsView';
import { InventoryView } from './components/inventory/InventoryView';
import { BudgetsView } from './components/budgets/BudgetsView';
import { ProfessionalPayrollView } from './components/payroll/ProfessionalPayrollView';
import { ZemdaLandingPage } from './components/public/ZemdaLandingPage';
import { PublicSeoPageView } from './components/public/PublicSeoPageView';
import { SEO_PAGES } from './data/seoPagesData';
import { NewAppointmentModal } from './components/calendar/NewAppointmentModal';
import { NewPatientModal } from './components/patients/NewPatientModal';
import { AICopilotDrawer } from './components/ai-copilot/AICopilotDrawer';
import { QuickAIAssistantShortcut } from './components/ai-copilot/QuickAIAssistantShortcut';
import { NetworkOfflineModal } from './components/common/NetworkOfflineModal';
import { UpdateNotificationModal } from './components/common/UpdateNotificationModal';
import { TermsOfUseView } from './components/public/TermsOfUseView';
import { PrivacyPolicyView } from './components/public/PrivacyPolicyView';
import { CookieBanner } from './components/common/CookieBanner';
import { CookiePreferencesModal } from './components/common/CookiePreferencesModal';
import { LegalReacceptanceModal } from './components/common/LegalReacceptanceModal';
import { trackPageView } from './utils/analytics';
import { Sparkles, AlertCircle } from 'lucide-react';

const AppContent: React.FC = () => {
  const {
    currentUser,
    currentTenant,
    loading,
    reloadSession,
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
    isZemdaPersonal
  } = useAuth();

  const { summary: billingSummary } = useBillingSummary();
  const [currentView, setCurrentView] = useState<string>('dashboard');
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
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [isAIOpen, setIsAIOpen] = useState<boolean>(false);
  const [isNewApptOpen, setIsNewApptOpen] = useState<boolean>(false);
  const [isNewPatientOpen, setIsNewPatientOpen] = useState<boolean>(false);

  // Contexto ativo para a IA — rastreado via eventos de componentes filhos
  const [aiActivePatientId, setAiActivePatientId] = useState<string | undefined>(undefined);
  const [aiActiveAppointmentId, setAiActiveAppointmentId] = useState<string | undefined>(undefined);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>(undefined);
  const [aiInitialTab, setAiInitialTab] = useState<'chat' | 'audio_draft' | 'improve_text' | undefined>(undefined);
  const [aiAutoSend, setAiAutoSend] = useState<boolean>(false);

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
      if (detail?.view) setCurrentView(detail.view);
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
      setCurrentView('superadmin');
    }
  }, [currentUser?.role]);

  // Google Analytics 4: Rastreamento SPA global de páginas/visualizações (100% livre de PII ou dados clínicos)
  useEffect(() => {
    if (activeLegalPage === 'terms') {
      trackPageView('/termos-de-uso', 'Zemda • Termos de Uso');
      return;
    }
    if (activeLegalPage === 'privacy') {
      trackPageView('/privacidade', 'Zemda • Política de Privacidade e LGPD');
      return;
    }

    if (currentUser) {
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
      const title = viewTitles[currentView] ? `Zemda • ${viewTitles[currentView]}` : `Zemda • ${currentView}`;
      trackPageView(`/${currentView}`, title);
    } else {
      if (activeSeoSlug) {
        trackPageView(`/${activeSeoSlug}`, `Zemda • ${SEO_PAGES[activeSeoSlug]?.title || 'Especialidade'}`);
      } else if (activeProfSlug) {
        trackPageView('/agendar', 'Zemda • Agendamento Online');
      } else if (activeInvite) {
        trackPageView('/convite', 'Zemda • Convite');
      } else if (publicView === 'login') {
        trackPageView('/login', 'Zemda • Login e Acesso');
      } else {
        trackPageView('/', 'Zemda • Sistema de Gestão em Saúde');
      }
    }
  }, [currentUser, currentView, publicView, activeSeoSlug, activeProfSlug, activeInvite, activeLegalPage]);

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
      }
    };

    window.addEventListener('android-back-button', handleBackButton);
    window.addEventListener('popstate', handleBackButton);
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
      window.removeEventListener('popstate', handleBackButton);
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
    return (
      <BillingView
        publicPage={window.location.pathname === '/planos' || !currentUser}
        callback={callback}
      />
    );
  }
  // Se não estiver logado, exibe páginas de SEO de nicho, Landing Page ou Login
  if (!currentUser || billingReturnHome) {
    if (activeSeoSlug && SEO_PAGES[activeSeoSlug]) {
      return (
        <PublicSeoPageView
          pageData={SEO_PAGES[activeSeoSlug]}
          onNavigateHome={navigateToHome}
          onNavigatePage={navigateToSeoPage}
          onLogin={() => {
            setAuthInitialAction('login');
            setPublicView('login');
          }}
          onRegisterClinic={() => {
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
          onRegisterClinic={() => {
            leaveBillingHome();
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
      />
    );
  }

  if (currentUser.role !== 'superadmin' && billingSummary && !billingSummary.canOperate) return <BillingView />;
  if (currentView === 'subscription' || window.location.pathname === '/assinatura') return <BillingView />;
  // Se o gestor precisa concluir o Onboarding obrigatório da clínica
  if (currentUser.needsOnboarding) {
    return (
      <div className="min-h-screen bg-[#fafbfc] py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <OnboardingWizardView
            onComplete={async () => {
              await reloadSession();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafbfc] flex flex-col">
      <BillingBanner summary={billingSummary} />
      {/* Top Navbar */}
      <Navbar
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        onOpenAI={() => setIsAIOpen(true)}
        onNavigate={setCurrentView}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Responsive Sidebar */}
        <Sidebar
          currentView={currentView}
          onNavigate={setCurrentView}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main View Container */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {currentView === 'dashboard' && (
            <DashboardView
              onNavigate={setCurrentView}
              onOpenNewAppointment={() => setIsNewApptOpen(true)}
              onOpenNewPatient={() => setIsNewPatientOpen(true)}
            />
          )}

          {currentView === 'calendar' && (
            <CalendarView onOpenNewAppointment={() => setIsNewApptOpen(true)} />
          )}

          {currentView === 'patients' && (
            <PatientsView
              onOpenNewPatient={() => setIsNewPatientOpen(true)}
              onNavigate={setCurrentView}
            />
          )}

          {currentView === 'clinical' && <ClinicalRecordsView />}

          {currentView === 'zemda-body' && <ZemdaBodyRecordsView />}

          {currentView === 'zemda-personal' && (
            isZemdaPersonal ? (
              <ZemdaPersonalView />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-lg mx-auto my-12">
                <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Exclusivo: ZemdaPersonal</h2>
                <p className="text-sm text-slate-600 mb-4">
                  O módulo ZemdaPersonal é de uso exclusivo para profissionais cuja profissão cadastrada seja <strong>Personal Trainer / Educação Física</strong> (CREF) e com permissão ativa concedida pelo gerenciador da clínica.
                </p>
                <button
                  onClick={() => setCurrentView('dashboard')}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  Voltar ao Início
                </button>
              </div>
            )
          )}

          {currentView === 'zemda-fisio' && (
            isPhysiotherapist ? (
              <PhysiotherapyRecordsView />
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
            isDentist ? (
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
            (isNutritionist || isZemdaNutri) ? (
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
            (isOccupationalTherapist || isZemdaTO) ? (
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
            (isSpeechTherapist || isZemdaFono) ? (
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

          {currentView === 'taxonomy' && <TaxonomyView />}

          {currentView === 'reports' && <ReportsView />}

          {currentView === 'support-tickets' && <SupportTicketsView />}

          {currentView === 'import' && <ImportDataView onNavigate={setCurrentView} />}

          {currentView === 'audit' && <AuditView />}

          {currentView === 'settings' && <SettingsView />}

          {currentView === 'superadmin' && <SuperAdminView />}
        </main>
      </div>

      {/* Modais Globais */}
      <NewAppointmentModal
        isOpen={isNewApptOpen}
        onClose={() => setIsNewApptOpen(false)}
        onSuccess={() => setCurrentView('calendar')}
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
        onAppointmentCreated={() => setCurrentView('calendar')}
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

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
        <CookieBanner />
        <CookiePreferencesModal />
        <LegalReacceptanceModal />
        <NetworkOfflineModal />
        <UpdateNotificationModal />
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
