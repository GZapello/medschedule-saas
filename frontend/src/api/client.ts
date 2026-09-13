export const getApiBaseUrl = (): string => {
  // 1. Configuração personalizada de URL salva no cliente (ideal para clínicas conectando ao servidor da rede/nuvem)
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('saas_custom_api_url');
    if (customUrl && customUrl.trim()) {
      let clean = customUrl.trim().replace(/\/+$/, '');
      // Se for domínio desatualizado do railway antigo, migra para o oficial zemda.com.br
      if (clean.includes('medschedule-saas-production.up.railway.app')) {
        clean = 'https://zemda.com.br/api';
        localStorage.setItem('saas_custom_api_url', clean);
      }
      // Se for apenas '/' ou vazio, usa o relativo padrão
      if (clean === '' || clean === '/') {
        return '/api';
      }
      // Se for URL HTTP(S) sem o /api ou /v1 no final, acrescenta /api
      if (/^https?:\/\//i.test(clean) && !clean.endsWith('/api') && !clean.endsWith('/v1')) {
        clean = `${clean}/api`;
      }
      return clean;
    }
  }

  // 2. Variável de ambiente (VITE_API_BASE_URL)
  const envApiUrl = (import.meta as any)?.env?.VITE_API_BASE_URL;
  if (envApiUrl) {
    let cleanEnv = envApiUrl.trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(cleanEnv) && !cleanEnv.endsWith('/api') && !cleanEnv.endsWith('/v1')) {
      cleanEnv = `${cleanEnv}/api`;
    }
    return cleanEnv;
  }

  // 3. Detecção de ambiente Desktop Electron ou arquivo local
  if (typeof window !== 'undefined') {
    const isElectron = (window as any).isElectron || 
      (window as any).process?.type === 'renderer' ||
      window.location.protocol === 'file:' ||
      navigator.userAgent.includes('Electron');

    if (isElectron) {
      // No aplicativo Desktop Windows, conecta por padrão diretamente ao servidor oficial na nuvem (Zemda Cloud)
      return 'https://zemda.com.br/api';
    }

    // 4. Detecção de ambiente Mobile Android / Capacitor
    const isCapacitor = (window as any).Capacitor?.isNativePlatform?.() ||
      (window as any).Capacitor?.getPlatform?.() === 'android' ||
      window.location.protocol === 'capacitor:';

    if (isCapacitor) {
      // No aplicativo Android, conecta por padrão diretamente ao servidor oficial na nuvem (Zemda Cloud)
      return 'https://zemda.com.br/api';
    }
  }

  // 5. Modo Web padrão (relativo)
  return '/api';
};

export class ApiClient {
  static getBaseUrl(): string {
    return getApiBaseUrl();
  }

  static setCustomBaseUrl(url: string | null): void {
    if (url && url.trim()) {
      let clean = url.trim().replace(/\/+$/, '');
      if (/^https?:\/\//i.test(clean) && !clean.endsWith('/api') && !clean.endsWith('/v1')) {
        clean = `${clean}/api`;
      }
      localStorage.setItem('saas_custom_api_url', clean);
    } else {
      localStorage.removeItem('saas_custom_api_url');
    }
  }

  private static getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  private static getTenantId(): string | null {
    return localStorage.getItem('active_tenant_id');
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const tenantId = this.getTenantId();
    const baseUrl = getApiBaseUrl();

    // Garante que endpoint comece com /
    const safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${safeEndpoint}`, {
        ...options,
        headers
      });
    } catch (networkErr: any) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('saas-network-error', { detail: networkErr }));
      }
      const err: any = new Error('Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.');
      err.code = 'NETWORK_ERROR';
      throw err;
    }

    if (!response.ok) {
      let errorMsg = `Erro ${response.status}: ${response.statusText}`;
      let errorCode: string | undefined = undefined;
      try {
        const text = await response.text();
        try {
          const errorData = JSON.parse(text);
          if (errorData.error) errorMsg = errorData.error;
          if (errorData.code) errorCode = errorData.code;
        } catch {
          if (text.trim().startsWith('<')) {
            errorMsg = `Erro ${response.status}: O servidor respondeu com uma página de erro (HTML). Verifique o endereço da API.`;
          } else if (text.trim()) {
            errorMsg = text.trim();
          }
        }
      } catch (_) {}
      const err: any = new Error(errorMsg);
      err.code = errorCode;
      err.status = response.status;
      throw err;
    }

    // Retorna vazio para status 204
    if (response.status === 204) return {} as T;

    // Se for CSV ou arquivo binário
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/csv')) {
      return (await response.text()) as unknown as T;
    }

    // Leitura segura da resposta em JSON prevenindo erro "unexpected token '<'"
    const rawText = await response.text();
    try {
      return JSON.parse(rawText) as T;
    } catch {
      if (rawText.trim().startsWith('<')) {
        throw new Error('O servidor respondeu com uma página HTML em vez de dados (JSON). Verifique o endereço do servidor.');
      }
      throw new Error(`Resposta inválida do servidor: ${rawText.slice(0, 100)}`);
    }
  }

  static get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  static post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  static put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  static delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}
