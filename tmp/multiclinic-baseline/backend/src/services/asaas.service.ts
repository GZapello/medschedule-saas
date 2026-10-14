import dotenv from 'dotenv';
dotenv.config();

export class AsaasError extends Error {
  constructor(public status: number, public ambiguous = false, public providerCode?: string) { super(`Não foi possível concluir a comunicação com Asaas (${status || 'conexão'}).`); }
}
export interface AsaasStatusResult { connected: boolean; environment: string; error?: string; }
export class AsaasService {
  static getEnvironment(): string { return (process.env.ASAAS_ENV || 'sandbox').trim().toLowerCase(); }
  static config() {
    const environment = this.getEnvironment();
    if (!['sandbox','production'].includes(environment)) throw new Error('ASAAS_ENV inválido.');
    const base = new URL((process.env.ASAAS_API_URL || '').trim());
    const allowed = environment === 'sandbox' ? ['api-sandbox.asaas.com','sandbox.asaas.com'] : ['api.asaas.com','www.asaas.com'];
    if (base.protocol !== 'https:' || base.port || base.username || base.password || base.search || base.hash || !allowed.includes(base.hostname) || !['/v3','/api/v3'].includes(base.pathname.replace(/\/$/,''))) throw new Error('Ambiente e URL do Asaas incompatíveis.');
    const key = (process.env.ASAAS_API_KEY || '').trim();
    if (!key) throw new Error('Integração Asaas ainda não configurada.');
    if ((key.includes('_hmlg_') && environment !== 'sandbox') || (key.includes('_prod_') && environment !== 'production')) throw new Error('Chave e ambiente do Asaas incompatíveis.');
    return { environment, base: base.toString().replace(/\/$/,''), key };
  }
  static appUrl(): string {
    const url = new URL(process.env.APP_URL || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Configure APP_URL com a URL pública HTTPS do Zemda.');
    return url.toString().replace(/\/$/,'');
  }
  static safeUrl(value: string): string {
    const url = new URL(value);
    const hosts = this.getEnvironment() === 'sandbox' ? ['sandbox.asaas.com'] : ['asaas.com','www.asaas.com'];
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !hosts.includes(url.hostname)) throw new Error('Link de pagamento inválido.');
    return url.toString();
  }
  static checkoutUrl(id: string, link?: string): string {
    if (link) return this.safeUrl(link);
    const host = this.getEnvironment() === 'sandbox' ? 'sandbox.asaas.com' : 'asaas.com';
    return this.safeUrl(`https://${host}/checkoutSession/show?id=${encodeURIComponent(id)}`);
  }
  static async request<T=any>(endpoint: string, options: {method?:'GET'|'POST'|'PUT'|'DELETE';body?:any;timeoutMs?:number} = {}): Promise<T> {
    const config = this.config();
    if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('://')) throw new Error('Recurso Asaas inválido.');
    try {
      const response = await fetch(config.base + endpoint, {
        method: options.method || 'GET', redirect:'error', signal:AbortSignal.timeout(options.timeoutMs || 15000),
        headers: {access_token:config.key,'Content-Type':'application/json','User-Agent':'Zemda/1.0'},
        body:options.body === undefined ? undefined : JSON.stringify(options.body)
      });
      // Provider error bodies may contain credentials or PII. Retain only the first
      // short machine code for server-side diagnostics; never expose the body.
      if (!response.ok) {
        let providerCode:string|undefined;
        try { const body:any=await response.clone().json(); const value=body?.errors?.[0]?.code; if(typeof value==='string' && /^[A-Z0-9_-]{1,80}$/i.test(value)) providerCode=value; } catch {}
        throw new AsaasError(response.status, response.status >= 500, providerCode);
      }
      if(response.status===204) return {} as T;
      if(!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw new AsaasError(response.status,true);
      const text = await response.text(); return (text ? JSON.parse(text) : {}) as T;
    } catch(e) { if (e instanceof AsaasError) throw e; throw new AsaasError(0,true); }
  }
  static async checkConnection(): Promise<AsaasStatusResult> {
    try { await this.request('/finance/balance',{timeoutMs:8000}); return {connected:true,environment:this.getEnvironment()}; }
    catch { return {connected:false,environment:this.getEnvironment(),error:'Verifique a configuração e as credenciais do ambiente no servidor.'}; }
  }
}
