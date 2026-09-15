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
    setToken(null);
    setCurrentUser(null);
    setCurrentTenant(null);
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

  const isSuperAdmin = currentUser?.role === 'superadmin';
  const isClinicAdmin = currentUser?.role === 'clinic_admin' || isSuperAdmin;
  const isProfessional = currentUser?.role === 'professional';
  const isReceptionist = currentUser?.role === 'receptionist';
  const isPatient = currentUser?.role === 'patient';

  const profId = ((currentUser as any)?.professionId || '').toLowerCase();
  const profSlug = (currentUser?.professionSlug || '').toLowerCase();
  const profName = (currentUser?.professionName || '').toLowerCase();
  const practiceAreas = (currentUser?.practiceAreas || '').toLowerCase();

  // Verifica se o usuário tem área de atuação em Fisioterapia (Regras 1, 3 e 4)
  // Válido tanto para Professional quanto para ClinicAdmin que atua como Fisioterapeuta
  const hasPhysioArea =
    profId === 'prof-fisioterapeuta' ||
    profId === 'prof-fisioterapia' ||
    profId.includes('fisio') ||
    profSlug.includes('fisio') ||
    profName.includes('fisio') ||
    profSlug.includes('physio') ||
    profName.includes('physio') ||
    practiceAreas.includes('fisio') ||
    practiceAreas.includes('physio');

  const userPermissions = (currentUser as any)?.permissions || [];
  const isZemdaFisioAuthorized =
    isClinicAdmin ||
    userPermissions.includes('access_zemda_fisio') ||
    !!(currentUser as any)?.zemdaFisioEnabled;

  // Regra Estrita de Acesso ao ZemdaFisio:
  const isPhysiotherapist = !isSuperAdmin && (isProfessional || isClinicAdmin) && hasPhysioArea && isZemdaFisioAuthorized;
  const isZemdaFisio = isPhysiotherapist;

  // Regra Estrita de Acesso ao ZemdaOdonto:
  // 1. Administrador Global NUNCA tem uso clínico do ZemdaOdonto (nem botão nem tela)
  // 2. Deve pertencer à profissão / área de Odontologia (Cirurgião-Dentista, Odontologia)
  // 3. Deve possuir liberação explícita do gestor da clínica (ou ser gerente com a formação em Odontologia)
  const hasOdontoArea =
    profId === 'prof-dentista' ||
    profId === 'prof-odontologia' ||
    profId.includes('odonto') ||
    profId.includes('dentis') ||
    profSlug.includes('odonto') ||
    profSlug.includes('dentis') ||
    profName.includes('odonto') ||
    profName.includes('dentis') ||
    practiceAreas.includes('odonto') ||
    practiceAreas.includes('dentis') ||
    practiceAreas.includes('cro');

  const isZemdaOdontoAuthorized =
    (currentUser?.role === 'clinic_admin' && hasOdontoArea) ||
    userPermissions.includes('access_zemda_odonto') ||
    !!(currentUser as any)?.zemdaOdontoEnabled;

  const isDentist = !isSuperAdmin && (isProfessional || (currentUser?.role === 'clinic_admin' && hasOdontoArea)) && hasOdontoArea && isZemdaOdontoAuthorized;
  const isZemdaOdonto = isDentist;

  // Regra Estrita de Acesso ao ZemdaNutri:
  // 1. Administrador Global NUNCA tem uso clínico
  // 2. Deve pertencer à profissão / área de Nutrição
  // 3. Deve possuir liberação do gestor (ou ser gestor com formação em Nutrição)
  const hasNutriArea =
    profId === 'prof-nutricionista' ||
    profId === 'prof-nutricao' ||
    profId.includes('nutri') ||
    profSlug.includes('nutri') ||
    profName.includes('nutri') ||
    practiceAreas.includes('nutri') ||
    practiceAreas.includes('crn');

  const isZemdaNutriAuthorized =
    (currentUser?.role === 'clinic_admin' && hasNutriArea) ||
    userPermissions.includes('access_zemda_nutri') ||
    !!(currentUser as any)?.zemdaNutriEnabled;

  const isNutritionist = !isSuperAdmin && (isProfessional || (currentUser?.role === 'clinic_admin' && hasNutriArea)) && hasNutriArea && isZemdaNutriAuthorized;
  const isZemdaNutri = isNutritionist;

  // Regra Estrita de Acesso ao ZemdaTO (Terapia Ocupacional):
  // 1. Administrador Global NUNCA tem uso clínico
  // 2. Deve pertencer à profissão / área de Terapia Ocupacional
  // 3. Deve possuir liberação do gestor (ou ser gestor com formação em TO)
  const hasTOArea =
    profId === 'prof-terapeuta-ocupacional' ||
    profId === 'prof-terapia-ocupacional' ||
    profId.includes('terapia-ocupacional') ||
    profId.includes('terapeuta-ocupacional') ||
    profSlug.includes('ocupacional') ||
    profSlug.includes('terapia_ocupacional') ||
    profName.includes('ocupacional') ||
    practiceAreas.includes('ocupacional') ||
    (practiceAreas.includes('to') && practiceAreas.includes('terapia'));

  const isZemdaTOAuthorized =
    (currentUser?.role === 'clinic_admin' && hasTOArea) ||
    userPermissions.includes('access_zemda_to') ||
    !!(currentUser as any)?.zemdaToEnabled;

  const isOccupationalTherapist = !isSuperAdmin && (isProfessional || (currentUser?.role === 'clinic_admin' && hasTOArea)) && hasTOArea && isZemdaTOAuthorized;
  const isZemdaTO = isOccupationalTherapist;

  // Regra Estrita de Acesso ao ZemdaFono (Fonoaudiologia):
  // 1. Administrador Global NUNCA tem uso clínico
  // 2. Deve pertencer à profissão / área de Fonoaudiologia
  // 3. Deve possuir liberação do gestor (ou ser gestor com formação em Fono)
  const hasFonoArea =
    profId === 'prof-fonoaudiologo' ||
    profId === 'prof-fonoaudiologia' ||
    profId.includes('fono') ||
    profSlug.includes('fono') ||
    profName.includes('fono') ||
    practiceAreas.includes('fono') ||
    practiceAreas.includes('crfa');

  const isZemdaFonoAuthorized =
    (currentUser?.role === 'clinic_admin' && hasFonoArea) ||
    userPermissions.includes('access_zemda_fono') ||
    !!(currentUser as any)?.zemdaFonoEnabled;

  const isSpeechTherapist = !isSuperAdmin && (isProfessional || (currentUser?.role === 'clinic_admin' && hasFonoArea)) && hasFonoArea && isZemdaFonoAuthorized;
  const isZemdaFono = isSpeechTherapist;

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
