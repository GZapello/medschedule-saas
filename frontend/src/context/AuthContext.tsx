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
  isPersonalTrainer: boolean;
  isZemdaPersonal: boolean;
  isZemdaBody: boolean;
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

  const profId = ((currentUser as any)?.professionId || '').toLowerCase();
  const profSlug = (currentUser?.professionSlug || '').toLowerCase();
  const profName = (currentUser?.professionName || '').toLowerCase();
  const practiceAreas = [
    (currentUser?.practiceAreas || ''),
    currentUser?.role === 'clinic_admin' ? (currentTenant as any)?.manager_profession || '' : '',
    currentUser?.role === 'clinic_admin' ? (currentTenant as any)?.manager_practice_areas || '' : ''
  ].filter(Boolean).join(' ').toLowerCase();

  const userPermissions = (currentUser as any)?.permissions || [];

  // Regra Estrita de Acesso ao ZemdaFisio:
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

  const isPhysiotherapist = !isSuperAdmin && (isProfessional || currentUser?.role === 'clinic_admin') &&
    Boolean(currentUser?.zemdaFisioEnabled || hasPhysioArea);
  const isZemdaFisio = isPhysiotherapist;

  // Regra Estrita de Acesso ao ZemdaOdonto:
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

  const isDentist = !isSuperAdmin && (isProfessional || currentUser?.role === 'clinic_admin') &&
    Boolean(currentUser?.zemdaOdontoEnabled || hasOdontoArea);
  const isZemdaOdonto = isDentist;

  // Regra Estrita de Acesso ao ZemdaNutri:
  const hasNutriArea =
    profId === 'prof-nutricionista' ||
    profId === 'prof-nutricao' ||
    profId.includes('nutri') ||
    profSlug.includes('nutri') ||
    profName.includes('nutri') ||
    practiceAreas.includes('nutri') ||
    practiceAreas.includes('crn') ||
    practiceAreas.includes('diet');

  const isNutritionist = !isSuperAdmin && (isProfessional || currentUser?.role === 'clinic_admin') &&
    Boolean(currentUser?.zemdaNutriEnabled || hasNutriArea);
  const isZemdaNutri = isNutritionist;

  // Regra Estrita de Acesso ao ZemdaTO (Terapia Ocupacional):
  const hasTOArea =
    profId === 'prof-terapeuta-ocupacional' ||
    profId === 'prof-terapia-ocupacional' ||
    profId.includes('terapia-ocupacional') ||
    profId.includes('terapeuta-ocupacional') ||
    profSlug.includes('ocupacional') ||
    profSlug.includes('terapia_ocupacional') ||
    profName.includes('ocupacional') ||
    practiceAreas.includes('terapia ocupacional') ||
    practiceAreas.includes('terapeuta ocupacional') ||
    practiceAreas.includes('ocupacional') ||
    practiceAreas.includes('terapia-ocupacional');

  const isOccupationalTherapist = !isSuperAdmin && (isProfessional || currentUser?.role === 'clinic_admin') &&
    Boolean(currentUser?.zemdaToEnabled || hasTOArea);
  const isZemdaTO = isOccupationalTherapist;

  // Regra Estrita de Acesso ao ZemdaFono (Fonoaudiologia):
  const hasFonoArea =
    profId === 'prof-fonoaudiologo' ||
    profId === 'prof-fonoaudiologia' ||
    profId.includes('fono') ||
    profSlug.includes('fono') ||
    profName.includes('fono') ||
    practiceAreas.includes('fono') ||
    practiceAreas.includes('crfa');

  const isSpeechTherapist = !isSuperAdmin && (isProfessional || currentUser?.role === 'clinic_admin') &&
    Boolean(currentUser?.zemdaFonoEnabled || hasFonoArea);
  const isZemdaFono = isSpeechTherapist;

  // Regra de Acesso ao ZemdaPersonal (Educação Física & Personal Trainer):
  const hasPersonalArea =
    profId === 'prof-educador-fisico' ||
    profId === 'prof-personal-trainer' ||
    profId.includes('personal') ||
    profId.includes('educa') ||
    profSlug.includes('personal') ||
    profSlug.includes('educa') ||
    profName.includes('personal') ||
    profName.includes('educa') ||
    profName.includes('físic') ||
    practiceAreas.includes('personal') ||
    practiceAreas.includes('muscula') ||
    practiceAreas.includes('treina') ||
    practiceAreas.includes('cref');

  const isPersonalTrainer = !isSuperAdmin && (
    (isProfessional && hasPersonalArea) ||
    (currentUser?.role === 'clinic_admin' && hasPersonalArea)
  );

  // ZemdaBody: controlado exclusivamente por permissão manual do gestor ou administrador
  const isZemdaBody = isClinicAdmin || userPermissions.includes('access_zemda_body');

  // ZemdaPersonal: liberado para gestores, profissionais de educação física/personal ou com permissão explícita
  const isZemdaPersonal = isClinicAdmin || isPersonalTrainer || userPermissions.includes('access_zemda_personal');

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
        isPersonalTrainer,
        isZemdaPersonal,
        isZemdaBody,
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
