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
import { ProfessionalsView } from './components/professionals/ProfessionalsView';
import { ServicesView } from './components/services/ServicesView';
import { FinancialView } from './components/financial/FinancialView';
import { ReceiptsView } from './components/receipts/ReceiptsView';
import { StaffManagementView } from './components/staff/StaffManagementView';
import { TaxonomyView } from './components/taxonomy/TaxonomyView';
import { ReportsView } from './components/reports/ReportsView';
import { AuditView } from './components/audit/AuditView';
import { SettingsView } from './components/settings/SettingsView';
import { SuperAdminView } from './components/superadmin/SuperAdminView';
import { OnboardingWizardView } from './components/onboarding/OnboardingWizardView';
import { PublicBookingView } from './components/public-booking/PublicBookingView';
import { NewAppointmentModal } from './components/calendar/NewAppointmentModal';
import { NewPatientModal } from './components/patients/NewPatientModal';
import { AICopilotDrawer } from './components/ai-copilot/AICopilotDrawer';
import { NetworkOfflineModal } from './components/common/NetworkOfflineModal';
import { Sparkles } from 'lucide-react';

const AppContent: React.FC = () => {
  const { currentUser, currentTenant, loading, reloadSession } = useAuth();

  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [isAIOpen, setIsAIOpen] = useState<boolean>(false);
  const [isNewApptOpen, setIsNewApptOpen] = useState<boolean>(false);
  const [isNewPatientOpen, setIsNewPatientOpen] = useState<boolean>(false);

  useEffect(() => {
    if (currentUser?.role === 'superadmin') {
      setCurrentView('superadmin');
    }
  }, [currentUser?.role]);

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
      // 3. Se estiver em visualização secundária, retorna ao dashboard
      if (currentView !== 'dashboard' && currentUser?.role !== 'superadmin') {
        setCurrentView('dashboard');
        return;
      }
    };

    window.addEventListener('android-back-button', handleBackButton);
    window.addEventListener('popstate', handleBackButton);

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
      if (cleanupCapacitorListener) {
        cleanupCapacitorListener();
      }
    };
  }, [isNewApptOpen, isNewPatientOpen, isAIOpen, sidebarOpen, currentView, currentUser]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-300 text-sm font-semibold">Carregando sistema SaaS...</p>
        </div>
      </div>
    );
  }

  // Se o usuário está em modo público de agendamento online
  if (currentView === 'public_preview') {
    return (
      <PublicBookingView
        tenantSlug={currentTenant?.slug || 'clinica-viver-bem'}
        onBackToApp={currentUser ? () => setCurrentView('dashboard') : undefined}
      />
    );
  }

  // Se não estiver logado, exibe a página de autenticação
  if (!currentUser) {
    return <AuthPage onOpenPublicBooking={() => setCurrentView('public_preview')} />;
  }

  // Se o gestor precisa concluir o Onboarding obrigatório da clínica
  if (currentUser.needsOnboarding) {
    return (
      <div className="min-h-screen bg-slate-900 py-10 px-4 sm:px-6 lg:px-8">
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
    <div className="min-h-screen bg-slate-100 flex flex-col">
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
            <PatientsView onOpenNewPatient={() => setIsNewPatientOpen(true)} />
          )}

          {currentView === 'clinical' && <ClinicalRecordsView />}

          {currentView === 'professionals' && <ProfessionalsView />}

          {currentView === 'services' && <ServicesView />}

          {currentView === 'financial' && <FinancialView />}

          {currentView === 'receipts' && <ReceiptsView />}

          {currentView === 'staff' && <StaffManagementView />}

          {currentView === 'taxonomy' && <TaxonomyView />}

          {currentView === 'reports' && <ReportsView />}

          {currentView === 'audit' && <AuditView />}

          {currentView === 'settings' && <SettingsView />}

          {currentView === 'superadmin' && <SuperAdminView />}
        </main>
      </div>

      {/* Floating Action Button para abrir o Assistente de IA */}
      <button
        onClick={() => setIsAIOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-teal-500 to-indigo-600 text-white font-bold text-xs rounded-full shadow-2xl hover:scale-105 transition-all cursor-pointer border border-white/20"
        title="Falar com Assistente de IA"
      >
        <Sparkles className="w-4 h-4 animate-bounce" />
        <span className="hidden sm:inline">Assistente IA</span>
      </button>

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
        onClose={() => setIsAIOpen(false)}
        onAppointmentCreated={() => setCurrentView('calendar')}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
        <NetworkOfflineModal />
      </ToastProvider>
    </AuthProvider>
  );
};

export default App;
