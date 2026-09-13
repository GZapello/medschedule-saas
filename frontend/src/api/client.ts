import { Capacitor } from '@capacitor/core';

export const buildApiUrl = (baseUrl: string, endpoint: string): string => {
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  const cleanEp = endpoint.trim().startsWith('/') ? endpoint.trim() : `/${endpoint.trim()}`;

  // Se baseUrl já termina com /api e endpoint começa com /api/
  if (cleanBase.endsWith('/api') && cleanEp.startsWith('/api/')) {
    return `${cleanBase}${cleanEp.substring(4)}`;
  }
  // Se baseUrl não termina com /api nem com /v1 e endpoint começa com /v1/
  if (!cleanBase.endsWith('/api') && !cleanBase.endsWith('/v1') && cleanEp.startsWith('/v1/')) {
    return `${cleanBase}/api${cleanEp}`;
  }
  return `${cleanBase}${cleanEp}`;
};

export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    // 1. Limpeza PROATIVA e IMEDIATA de QUALQUER resquício inválido ou local no localStorage
    try {
      const stored = localStorage.getItem('saas_custom_api_url');
      if (stored) {
        const cleanStored = stored.trim().toLowerCase();
        if (
          cleanStored === '' ||
          cleanStored === '/' ||
          cleanStored === '/api' ||
          cleanStored === 'api' ||
          cleanStored.includes('localhost') ||
          cleanStored.includes('127.0.0.1') ||
          cleanStored.includes('10.0.2.2') ||
          cleanStored.includes('medschedule') ||
          cleanStored.includes('railway.app') ||
          !cleanStored.startsWith('http')
        ) {
          localStorage.removeItem('saas_custom_api_url');
        }
      }
    } catch (_) {}

    const isZemdaWeb = window.location.hostname === 'zemda.com.br' || window.location.hostname.endsWith('.zemda.com.br');

    // 2. Detecção abrangente de ambiente Mobile Android nativo (Capacitor)
    const isAndroidApp = Boolean(
      (window as any).Capacitor?.isNativePlatform?.() ||
      Capacitor.isNativePlatform() ||
      Capacitor.getPlatform() === 'android' ||
      (window as any).androidBridge ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:' ||
      (/android/i.test(navigator.userAgent) && !isZemdaWeb)
    );

    // No APK Android, a API padrão é SEMPRE a nuvem oficial Zemda (nunca relativo nem localhost)
    if (isAndroidApp) {
      try {
        const customUrl = localStorage.getItem('saas_custom_api_url');
        if (customUrl && customUrl.trim().startsWith('http')) {
          let clean = customUrl.trim().replace(/\/+$/, '');
          if (!clean.endsWith('/api') && !clean.endsWith('/v1')) {
            clean = `${clean}/api`;
          }
          return clean;
        }
      } catch (_) {}
      return 'https://zemda.com.br/api';
    }

    // 3. Detecção de Desktop Electron
    const isElectron = Boolean(
      (window as any).isElectron || 
      (window as any).process?.type === 'renderer' ||
      navigator.userAgent.includes('Electron')
    );

    if (isElectron) {
      try {
        const customUrl = localStorage.getItem('saas_custom_api_url');
        if (customUrl && customUrl.trim().startsWith('http')) {
          let clean = customUrl.trim().replace(/\/+$/, '');
          if (!clean.endsWith('/api') && !clean.endsWith('/v1')) {
            clean = `${clean}/api`;
          }
          return clean;
        }
      } catch (_) {}
      return 'https://zemda.com.br/api';
    }

    // 4. No navegador acessando o domínio oficial zemda.com.br, a API relativa é recomendada
    if (isZemdaWeb) {
      try {
        const customUrl = localStorage.getItem('saas_custom_api_url');
        if (customUrl && customUrl.trim().startsWith('http')) {
          let clean = customUrl.trim().replace(/\/+$/, '');
          if (!clean.endsWith('/api') && !clean.endsWith('/v1')) {
            clean = `${clean}/api`;
          }
          return clean;
        }
      } catch (_) {}
      return '/api';
    }

    // 5. Configuração personalizada válida
    try {
      const validCustomUrl = localStorage.getItem('saas_custom_api_url');
      if (validCustomUrl && validCustomUrl.trim().startsWith('http')) {
        let clean = validCustomUrl.trim().replace(/\/+$/, '');
        if (!clean.endsWith('/api') && !clean.endsWith('/v1')) {
          clean = `${clean}/api`;
        }
        return clean;
      }
    } catch (_) {}

    // 6. Desenvolvimento local no PC (Vite dev server)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return '/api';
    }
  }

  // 7. Padrão final seguro
  return 'https://zemda.com.br/api';
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
    const baseUrl = getApiBaseUrl();
    const token = this.getToken();
    const tenantId = this.getTenantId();
    const requestUrl = buildApiUrl(baseUrl, endpoint);

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
      response = await fetch(requestUrl, {
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

    // Validação de Content-Type retornado
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.toLowerCase().includes('application/json');

    if (!response.ok) {
      let errorMsg = `Erro ${response.status}: ${response.statusText}`;
      let errorCode: string | undefined = undefined;
      try {
        const text = await response.text();
        if (isJson) {
          try {
            const errorData = JSON.parse(text);
            if (errorData.error) errorMsg = errorData.error;
            if (errorData.code) errorCode = errorData.code;
          } catch {
            errorMsg = text.trim() || errorMsg;
          }
        } else if (text.trim().startsWith('<') || contentType.includes('text/html')) {
          errorMsg = `Erro ${response.status}: O servidor respondeu com uma página HTML em vez de dados (JSON). Verifique o endereço da API e sua conexão.`;
        } else if (text.trim()) {
          errorMsg = text.trim();
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
    if (contentType.includes('text/csv') || contentType.includes('application/octet-stream')) {
      return (await response.text()) as unknown as T;
    }

    // Validação estrita de Content-Type antes de parsear JSON
    const rawText = await response.text();
    if (!isJson) {
      if (rawText.trim().startsWith('<') || contentType.includes('text/html')) {
        throw new Error('O servidor respondeu com uma página HTML em vez de dados (JSON). Verifique o endereço do servidor.');
      }
      throw new Error(`Esperava JSON da API, mas o servidor retornou ${contentType || 'formato desconhecido'}: ${rawText.slice(0, 100)}`);
    }

    try {
      return JSON.parse(rawText) as T;
    } catch {
      throw new Error(`Resposta JSON inválida do servidor: ${rawText.slice(0, 100)}`);
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
