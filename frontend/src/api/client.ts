import { Capacitor } from '@capacitor/core';

export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const isZemdaWeb = window.location.hostname === 'zemda.com.br' || window.location.hostname.endsWith('.zemda.com.br');

    // 1. Detecção rigorosa de ambiente Mobile Android nativo (Capacitor)
    const isAndroidApp = Capacitor.isNativePlatform() ||
      Capacitor.getPlatform() === 'android' ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'file:' ||
      (/android/i.test(navigator.userAgent) && (window.location.hostname === 'localhost' || !window.location.hostname));

    // No APK Android, a API padrão é SEMPRE a nuvem oficial Zemda
    if (isAndroidApp) {
      const customUrl = localStorage.getItem('saas_custom_api_url');
      if (customUrl && customUrl.trim()) {
        let clean = customUrl.trim().replace(/\/+$/, '');
        if (/^https?:\/\//i.test(clean) && !clean.endsWith('/api') && !clean.endsWith('/v1')) {
          clean = `${clean}/api`;
        }
        return clean;
      }
      return 'https://zemda.com.br/api';
    }

    // 2. Detecção de Desktop Electron
    const isElectron = (window as any).isElectron || 
      (window as any).process?.type === 'renderer' ||
      navigator.userAgent.includes('Electron');

    if (isElectron) {
      const customUrl = localStorage.getItem('saas_custom_api_url');
      if (customUrl && customUrl.trim()) {
        let clean = customUrl.trim().replace(/\/+$/, '');
        if (/^https?:\/\//i.test(clean) && !clean.endsWith('/api') && !clean.endsWith('/v1')) {
          clean = `${clean}/api`;
        }
        return clean;
      }
      return 'https://zemda.com.br/api';
    }

    // 3. Limpeza de URLs antigas/inválidas do Railway no localStorage para web
    const customUrl = localStorage.getItem('saas_custom_api_url');
    if (customUrl) {
      if (
        customUrl.includes('medschedule') ||
        customUrl.includes('railway.app') ||
        customUrl === '/' ||
        customUrl === '/api' ||
        (isZemdaWeb && customUrl.includes('localhost'))
      ) {
        localStorage.removeItem('saas_custom_api_url');
      }
    }

    // No navegador acessando zemda.com.br, a API relativa é a mais rápida, segura e nativa
    if (isZemdaWeb && !localStorage.getItem('saas_custom_api_url')) {
      return '/api';
    }

    const validCustomUrl = localStorage.getItem('saas_custom_api_url');
    if (validCustomUrl && validCustomUrl.trim()) {
      let clean = validCustomUrl.trim().replace(/\/+$/, '');
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

  // 4. Variável de ambiente (VITE_API_BASE_URL)
  const envApiUrl = (import.meta as any)?.env?.VITE_API_BASE_URL;
  if (envApiUrl) {
    let cleanEnv = envApiUrl.trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(cleanEnv) && !cleanEnv.endsWith('/api') && !cleanEnv.endsWith('/v1')) {
      cleanEnv = `${cleanEnv}/api`;
    }
    return cleanEnv;
  }

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
    const baseUrl = getApiBaseUrl();
    const token = this.getToken();
    const tenantId = this.getTenantId();

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
