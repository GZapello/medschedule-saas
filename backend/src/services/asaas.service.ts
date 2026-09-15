import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// ASAAS SERVICE — Serviço Centralizado de Integração com Asaas (Sandbox/Prod)
// ============================================================================
// Encapsula chamadas HTTP para o Asaas utilizando:
// Base URL: process.env.ASAAS_API_URL
// Header: access_token: process.env.ASAAS_API_KEY
// NUNCA expor ASAAS_API_KEY no frontend, respostas da API, logs ou código público.
// ============================================================================

export interface AsaasStatusResult {
  connected: boolean;
  environment: string;
  error?: string;
}

export class AsaasService {
  private static getBaseUrl(): string {
    const rawUrl = process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';
    return rawUrl.trim().replace(/\/+$/, '');
  }

  private static getApiKey(): string {
    return (process.env.ASAAS_API_KEY || '').trim();
  }

  public static getEnvironment(): string {
    return (process.env.ASAAS_ENV || 'sandbox').trim().toLowerCase();
  }

  /**
   * Executa uma requisição HTTP genérica à API do Asaas garantindo segurança de credenciais.
   */
  public static async request<T = any>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: any;
      timeoutMs?: number;
    } = {}
  ): Promise<T> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Chave de API do Asaas (ASAAS_API_KEY) não configurada no ambiente.');
    }

    const baseUrl = this.getBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${cleanEndpoint}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'access_token': apiKey,
        'User-Agent': 'Zemda-SaaS-Integration/1.0'
      };

      const fetchOptions: RequestInit = {
        method: options.method || 'GET',
        headers,
        signal: controller.signal
      };

      if (options.body && ['POST', 'PUT', 'PATCH'].includes(fetchOptions.method || '')) {
        fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        let safeErrorMessage = `Erro na API do Asaas (HTTP ${response.status})`;
        try {
          const errorBody = (await response.json()) as any;
          if (errorBody && Array.isArray(errorBody.errors) && errorBody.errors.length > 0) {
            safeErrorMessage = errorBody.errors.map((e: any) => e.description || e.code).join('; ');
          } else if (errorBody && errorBody.message) {
            safeErrorMessage = errorBody.message;
          }
        } catch {
          // Se não for JSON, mantém o status HTTP genérico
        }

        // Sanitização preventiva: nunca permitir que qualquer trecho da chave apareça na mensagem
        safeErrorMessage = safeErrorMessage.replace(new RegExp(apiKey, 'gi'), '[REDACTED]');
        throw new Error(safeErrorMessage);
      }

      return (await response.json()) as T;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Tempo limite de conexão esgotado ao contatar o Asaas.');
      }
      // Sanitização de chave em eventuais mensagens de exceção de rede
      const safeMsg = (err.message || 'Falha de comunicação com o Asaas').replace(
        new RegExp(apiKey, 'gi'),
        '[REDACTED]'
      );
      throw new Error(safeMsg);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Testa a conexão real e autenticação com o Asaas Sandbox através de uma chamada segura e leve.
   * Endpoint consultado: GET /finance/balance ou GET /customers?limit=1
   */
  public static async checkConnection(): Promise<AsaasStatusResult> {
    const environment = this.getEnvironment();
    const apiKey = this.getApiKey();

    if (!apiKey) {
      return {
        connected: false,
        environment,
        error: 'Chave de API do Asaas não configurada'
      };
    }

    try {
      // Faz uma requisição real de validação simples e rápida (saldo financeiro da conta)
      await this.request('/finance/balance', { method: 'GET', timeoutMs: 8000 });

      return {
        connected: true,
        environment
      };
    } catch (err: any) {
      // Log seguro no backend sem expor chave nem cabeçalhos sensíveis
      console.error('[AsaasService] Falha na validação de conexão com Asaas Sandbox:', {
        environment,
        baseUrl: this.getBaseUrl(),
        errorMessage: err.message || 'Erro desconhecido'
      });

      return {
        connected: false,
        environment,
        error: err.message || 'Falha ao autenticar na API do Asaas'
      };
    }
  }
}
