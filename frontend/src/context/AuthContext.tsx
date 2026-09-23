import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Tenant } from '../types';
import { ApiClient } from '../api/client';

interface AuthContextType {
  currentUser: User | null;
  currentTenant: Tenant | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ user: User; tenant: Tenant | null }>;
  loginWithToken: (token: string, user: User, tenant?: Tenant | null) => void;
  logout: () => void;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshTenant: () => Promise<void>;
  reloadSession: () => Promise<void>;
  isSuperAdmin: boolean;
  isClinicAdmin: boolean;
  isProfessional: boolean;
  isReceptionist: boolean;
  isPatient: boolean;
  isPhysiotherapist: boolean;
  isZemdaFisio: boolean;
  isDentist: boolean;
  isZemdaOdonto: boolean;
  isNutritionist: boolean;
  isZemdaNutri: boolean;
  isOccupationalTherapist: boolean;
  isZemdaTO: boolean;
  isSpeechTherapist: boolean;
  isZemdaFono: boolean;
  isPsychologist: boolean;
  isZemdaPsico: boolean;
  isPsychopedagogue: boolean;
  isZemdaPP: boolean;
  isPersonalTrainer: boolean;
  isZemdaPersonal: boolean;
  isDoctor: boolean;
  isZemdaMed: boolean;
  isZemdaBody: boolean;
  commercialModule: string | null;
  capabilities: string[];
  practiceAreaIds: string[];
  selectedOptionalCapabilities: string[];
  hasCapability: (capabilityId: string) => boolean;
  isSandboxSession: boolean;
  startSandboxSession: (sessionData: { token: string; user: User; tenant: Tenant; capabilities: any }) => void;
  exitSandboxSession: () => void;
  userPermissions: string[];
  clientTermLabel: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
  const [loading, setLoading] = useState<boolean>(true);

  // Carrega usuário ao inicializar se já houver token salvo
  useEffect(() => {
    async function loadSession() {
      const savedToken = localStorage.getItem('auth_token');
      if (!savedToken) {
        setLoading(false);
        return;
      }

      try {
        const data = await ApiClient.get<{ user: User; tenant: Tenant | null }>('/v1/auth/me');
        setCurrentUser(data.user);
        if (data.tenant) {
          setCurrentTenant(data.tenant);
          localStorage.setItem('active_tenant_id', data.tenant.id);
        }
      } catch (err) {
        console.error('Sessão expirada:', err);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('active_tenant_id');
        setToken(null);
        setCurrentUser(null);
        setCurrentTenant(null);
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, []);

  const login = async (email: string, password: string) => {
    const data = await ApiClient.post<{ token: string; user: User; tenant: Tenant | null }>('/v1/auth/login', {
      email,
      password
    });

    localStorage.setItem('auth_token', data.token);
    setToken(data.token);
    setCurrentUser(data.user);

    if (data.tenant) {
      localStorage.setItem('active_tenant_id', data.tenant.id);
      setCurrentTenant(data.tenant);
    } else if (data.user.tenantId) {
      localStorage.setItem('active_tenant_id', data.user.tenantId);
    }

    return { user: data.user, tenant: data.tenant };
  };

  const loginWithToken = (authToken: string, userData: User, tenantData?: Tenant | null) => {
    localStorage.setItem('auth_token', authToken);
    setToken(authToken);
    setCurrentUser(userData);

    if (tenantData) {
      localStorage.setItem('active_tenant_id', tenantData.id);
      setCurrentTenant(tenantData);
    } else if (userData.tenantId) {
      localStorage.setItem('active_tenant_id', userData.tenantId);
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('active_tenant_id');
    localStorage.removeItem('sandbox_backup_token');
    localStorage.removeItem('sandbox_backup_tenant');
    setToken(null);
    setCurrentUser(null);
    setCurrentTenant(null);
  };

  const startSandboxSession = (sessionData: { token: string; user: User; tenant: Tenant; capabilities: any }) => {
    const originalToken = localStorage.getItem('auth_token');
    const originalTenant = localStorage.getItem('active_tenant_id');
    if (originalToken && !localStorage.getItem('sandbox_backup_token')) {
      localStorage.setItem('sandbox_backup_token', originalToken);
      if (originalTenant) localStorage.setItem('sandbox_backup_tenant', originalTenant);
    }

    loginWithToken(sessionData.token, sessionData.user, sessionData.tenant);
  };

  const exitSandboxSession = () => {
    const backupToken = localStorage.getItem('sandbox_backup_token');
    const backupTenant = localStorage.getItem('sandbox_backup_tenant');

    localStorage.removeItem('sandbox_backup_token');
    localStorage.removeItem('sandbox_backup_tenant');

    if (backupToken) {
      localStorage.setItem('auth_token', backupToken);
      if (backupTenant) {
        localStorage.setItem('active_tenant_id', backupTenant);
      } else {
        localStorage.removeItem('active_tenant_id');
      }
      setToken(backupToken);
      void reloadSession();
    } else {
      logout();
    }
  };

  const switchTenant = async (tenantId: string) => {
    localStorage.setItem('active_tenant_id', tenantId);
    try {
      const tenantData = await ApiClient.get<Tenant>('/v1/tenants/current');
      setCurrentTenant(tenantData);
    } catch (err) {
      console.error('Erro ao alternar tenant:', err);
    }
  };

  const refreshTenant = async () => {
    if (!localStorage.getItem('active_tenant_id')) return;
    try {
      const tenantData = await ApiClient.get<Tenant>('/v1/tenants/current');
      setCurrentTenant(tenantData);
    } catch (err) {
      console.error('Erro ao recarregar clínica:', err);
    }
  };

  const reloadSession = async () => {
    try {
      const data = await ApiClient.get<{ user: User; tenant: Tenant | null }>('/v1/auth/me');
      setCurrentUser(data.user);
      if (data.tenant) {
        setCurrentTenant(data.tenant);
        localStorage.setItem('active_tenant_id', data.tenant.id);
      }
    } catch (err) {
      console.error('Erro ao recarregar sessão:', err);
    }
  };

  useEffect(() => {
    const refreshSession = () => { if (localStorage.getItem('auth_token')) void reloadSession(); };
    window.addEventListener('focus', refreshSession);
    return () => window.removeEventListener('focus', refreshSession);
  }, []);

  const isSuperAdmin = currentUser?.role === 'superadmin';
  const isClinicAdmin = currentUser?.role === 'clinic_admin' || isSuperAdmin;
  const isProfessional = currentUser?.role === 'professional';
  const isReceptionist = currentUser?.role === 'receptionist';
  const isPatient = currentUser?.role === 'patient';
  const isEligibleStaff = !isPatient && !isSuperAdmin && (isClinicAdmin || isProfessional);

  const profId = ((currentUser as any)?.professionId || '').toLowerCase();
  const profSlug = (currentUser?.professionSlug || '').toLowerCase();
  const profName = (currentUser?.professionName || '').toLowerCase();
  const regType = ((currentUser as any)?.registrationType || '').toUpperCase();

  const combinedProf = `${profId} ${profName} ${profSlug}`.toLowerCase();

  // Dedução estrita do módulo primário ativo baseado na profissão atual
  let activeModule:
    | 'ZemdaFono'
    | 'ZemdaTO'
    | 'ZemdaNutri'
    | 'ZemdaPsico'
    | 'ZemdaPP'
    | 'ZemdaFisio'
    | 'ZemdaOdonto'
    | 'ZemdaPersonal'
    | 'ZemdaMed'
    | null = null;

  if (
    profId === 'prof-psicopedagogo' ||
    profId === 'prof-psicopedagogia' ||
    profSlug === 'psicopedagogo' ||
    profSlug === 'psicopedagogia' ||
    combinedProf.includes('psicopedag') ||
    regType === 'ABPP'
  ) {
    activeModule = 'ZemdaPP';
  } else if (
    profId === 'prof-psicologo' ||
    profId === 'prof-psicologia' ||
    profId === 'prof-neuropsicologo' ||
    profId === 'prof-psicanalista' ||
    profId === 'prof-terapeuta-familiar' ||
    profSlug === 'psicologo' ||
    profSlug === 'psicologia' ||
    profSlug === 'neuropsicologo' ||
    profSlug === 'psicanalista' ||
    combinedProf.includes('psicólog') ||
    combinedProf.includes('psicolog') ||
    combinedProf.includes('neuropsicól') ||
    combinedProf.includes('neuropsicol') ||
    combinedProf.includes('psicanal') ||
    regType === 'CRP'
  ) {
    activeModule = 'ZemdaPsico';
  } else if (
    profId === 'prof-fonoaudiologo' ||
    profId === 'prof-fonoaudiologia' ||
    profSlug === 'fonoaudiologo' ||
    profSlug === 'fonoaudiologia' ||
    combinedProf.includes('fono') ||
    regType === 'CRFA'
  ) {
    activeModule = 'ZemdaFono';
  } else if (
    profId === 'prof-terapeuta-ocupacional' ||
    profId === 'prof-terapia-ocupacional' ||
    profSlug === 'terapeuta-ocupacional' ||
    profSlug === 'terapia-ocupacional' ||
    combinedProf.includes('ocupacional') ||
    combinedProf.includes('terapia ocupacional') ||
    combinedProf.includes('terapeuta ocupacional')
  ) {
    activeModule = 'ZemdaTO';
  } else if (
    profId === 'prof-nutricionista' ||
    profId === 'prof-nutricao' ||
    profSlug === 'nutricionista' ||
    profSlug === 'nutricao' ||
    combinedProf.includes('nutri') ||
    regType === 'CRN'
  ) {
    activeModule = 'ZemdaNutri';
  } else if (
    profId === 'prof-fisioterapeuta' ||
    profId === 'prof-fisioterapia' ||
    profSlug === 'fisioterapeuta' ||
    profSlug === 'fisioterapia' ||
    combinedProf.includes('fisio') ||
    combinedProf.includes('physio')
  ) {
    activeModule = 'ZemdaFisio';
  } else if (
    profId === 'prof-dentista' ||
    profId === 'prof-cirurgiao-dentista' ||
    profId === 'prof-odontologia' ||
    profSlug === 'dentista' ||
    profSlug === 'cirurgiao-dentista' ||
    profSlug === 'odontologia' ||
    combinedProf.includes('odonto') ||
    combinedProf.includes('dentis') ||
    combinedProf.includes('cirurgi') ||
    regType === 'CRO'
  ) {
    activeModule = 'ZemdaOdonto';
  } else if (
    profId === 'prof-personal-trainer' ||
    profId === 'prof-educacao-fisica' ||
    profId === 'prof-educador-fisico' ||
    profId === 'personal_trainer' ||
    profSlug === 'personal-trainer' ||
    profSlug === 'educacao-fisica' ||
    combinedProf.includes('personal') ||
    combinedProf.includes('educação física') ||
    combinedProf.includes('educacao fisica') ||
    combinedProf.includes('educador físico') ||
    combinedProf.includes('educador fisico') ||
    combinedProf.includes('treinamento físico') ||
    combinedProf.includes('musculação') ||
    combinedProf.includes('musculacao') ||
    regType === 'CREF'
  ) {
    activeModule = 'ZemdaPersonal';
  } else if (
    profId === 'prof-medico' ||
    profId === 'prof-medicina' ||
    profId === 'prof-cardiologista' ||
    profId === 'prof-dermatologista' ||
    profId === 'prof-pediatra' ||
    profId === 'prof-psiquiatra' ||
    profId === 'prof-neurologista' ||
    profId === 'prof-geriatra' ||
    profId === 'prof-ortopedista' ||
    profId === 'prof-endocrinologista' ||
    profId === 'prof-reumatologista' ||
    profSlug === 'medico' ||
    profSlug === 'medicina' ||
    profSlug === 'cardiologista' ||
    profSlug === 'dermatologista' ||
    profSlug === 'pediatra' ||
    profSlug === 'psiquiatra' ||
    profSlug === 'neurologista' ||
    profSlug === 'geriatra' ||
    profSlug === 'ortopedista' ||
    profSlug === 'endocrinologista' ||
    profSlug === 'reumatologista' ||
    combinedProf.includes('médic') ||
    combinedProf.includes('medic') ||
    regType === 'CRM'
  ) {
    activeModule = 'ZemdaMed';
  }

  const userPermissions = (currentUser as any)?.permissions || [];

  // Módulos com exclusividade mútua (apenas o módulo correspondente à profissão atual fica ativo)
  const isPhysiotherapist = isEligibleStaff && (activeModule === 'ZemdaFisio' || (activeModule === null && Boolean(currentUser?.zemdaFisioEnabled)));
  const isZemdaFisio = isPhysiotherapist;

  const isDentist = isEligibleStaff && (activeModule === 'ZemdaOdonto' || (activeModule === null && Boolean(currentUser?.zemdaOdontoEnabled)));
  const isZemdaOdonto = isDentist;

  const isNutritionist = isEligibleStaff && (activeModule === 'ZemdaNutri' || (activeModule === null && Boolean(currentUser?.zemdaNutriEnabled)));
  const isZemdaNutri = isNutritionist;

  const isOccupationalTherapist = isEligibleStaff && (activeModule === 'ZemdaTO' || (activeModule === null && Boolean(currentUser?.zemdaToEnabled)));
  const isZemdaTO = isOccupationalTherapist;

  const isSpeechTherapist = isEligibleStaff && (activeModule === 'ZemdaFono' || (activeModule === null && Boolean(currentUser?.zemdaFonoEnabled)));
  const isZemdaFono = isSpeechTherapist;

  const isPsychologist = isEligibleStaff && (activeModule === 'ZemdaPsico' || (activeModule === null && Boolean((currentUser as any)?.zemdaPsicoEnabled)));
  const isZemdaPsico = isPsychologist;

  const isPsychopedagogue = isEligibleStaff && (activeModule === 'ZemdaPP' || (activeModule === null && Boolean(currentUser?.zemdaPPEnabled)));
  const isZemdaPP = isPsychopedagogue;

  const isPersonalTrainer = isEligibleStaff && (
    activeModule === 'ZemdaPersonal' ||
    currentUser?.commercialModule === 'ZemdaPersonal' ||
    Boolean((currentUser as any)?.zemdaPersonalEnabled) ||
    Boolean((currentUser as any)?.zemda_personal_enabled) ||
    Boolean(currentUser?.capabilities?.includes('TRAINING_PRESCRIBE'))
  );
  const isZemdaPersonal = isPersonalTrainer;

  // ZemdaMed: Nova vertical médica integral com 10 especialidades
  const isDoctor = isEligibleStaff && (
    activeModule === 'ZemdaMed' ||
    currentUser?.commercialModule === 'ZemdaMed' ||
    Boolean(currentUser?.zemdaMedEnabled) ||
    Boolean(currentUser?.capabilities?.includes('medical_consultations')) ||
    Boolean(currentUser?.capabilities?.includes('MEDICAL_BASE'))
  );
  const isZemdaMed = isDoctor;

  // ZemdaBody: Módulo complementar universal para TODOS os profissionais clínicos e gestores
  const isZemdaBody = isEligibleStaff && (
    isClinicAdmin ||
    isProfessional ||
    userPermissions.includes('access_zemda_body') ||
    Boolean((currentUser as any)?.zemdaBodyEnabled) ||
    Boolean((currentUser as any)?.zemda_body_enabled)
  );

  const capabilities = currentUser?.capabilities || [];
  const practiceAreaIds = currentUser?.practiceAreaIds || [];
  const selectedOptionalCapabilities = currentUser?.selectedOptionalCapabilities || [];
  const commercialModule = currentUser?.commercialModule || activeModule || null;

  const isSandboxSession = Boolean(
    currentUser?.tenantId?.startsWith('sbx-tenant-') ||
    currentTenant?.id?.startsWith('sbx-tenant-') ||
    localStorage.getItem('sandbox_backup_token')
  );

  const hasCapability = (capId: string): boolean => {
    if (isSuperAdmin && !isSandboxSession) return true;
    return capabilities.includes(capId);
  };

  const clientTermLabel = currentTenant?.client_term_label || 'Paciente';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentTenant,
        token,
        loading,
        login,
        loginWithToken,
        logout,
        switchTenant,
        refreshTenant,
        reloadSession,
        isSuperAdmin,
        isClinicAdmin,
        isProfessional,
        isReceptionist,
        isPatient,
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
        isZemdaBody,
        commercialModule,
        capabilities,
        practiceAreaIds,
        selectedOptionalCapabilities,
        hasCapability,
        isSandboxSession,
        startSandboxSession,
        exitSandboxSession,
        userPermissions,
        clientTermLabel
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
}
