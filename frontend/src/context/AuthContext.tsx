import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Tenant } from '../types';
import { ApiClient } from '../api/client';

interface AuthContextType {
  currentUser: User | null;
  currentTenant: Tenant | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ user: User; tenant: Tenant | null }>;
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

  const profSlug = (currentUser?.professionSlug || '').toLowerCase();
  const profName = (currentUser?.professionName || '').toLowerCase();
  const practiceAreas = (currentUser?.practiceAreas || '').toLowerCase();

  // Verifica se o usuário tem área de atuação em Fisioterapia (Regras 1, 3 e 4)
  // Válido tanto para Professional quanto para ClinicAdmin que atua como Fisioterapeuta
  const hasPhysioArea =
    profSlug.includes('fisio') ||
    profName.includes('fisio') ||
    profSlug.includes('physio') ||
    profName.includes('physio') ||
    practiceAreas.includes('fisio') ||
    practiceAreas.includes('physio');

  const userPermissions = (currentUser as any)?.permissions || [];
  const isZemdaFisioAuthorized = userPermissions.includes('access_zemda_fisio') || !!(currentUser as any)?.zemdaFisioEnabled;

  // Regra Estrita de Acesso ao ZemdaFisio (Itens 8, 9, 10, 11, 15):
  // 1. Administrador Global NUNCA tem uso clínico do ZemdaFisio
  // 2. Deve pertencer à profissão / área de atuação de Fisioterapia
  // 3. Deve possuir liberação explícita do gestor da clínica
  const isPhysiotherapist = !isSuperAdmin && (isProfessional || isClinicAdmin) && hasPhysioArea && isZemdaFisioAuthorized;

  // Ambiente ZemdaFisio ativo EXCLUSIVAMENTE para fisioterapeutas liberados
  const isZemdaFisio = isPhysiotherapist;

  const clientTermLabel = currentTenant?.client_term_label || 'Paciente';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentTenant,
        token,
        loading,
        login,
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
