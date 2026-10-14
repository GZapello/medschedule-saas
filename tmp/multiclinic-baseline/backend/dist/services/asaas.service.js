"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsaasService = exports.AsaasError = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class AsaasError extends Error {
    status;
    ambiguous;
    providerCode;
    constructor(status, ambiguous = false, providerCode) {
        super(`Não foi possível concluir a comunicação com Asaas (${status || 'conexão'}).`);
        this.status = status;
        this.ambiguous = ambiguous;
        this.providerCode = providerCode;
    }
}
exports.AsaasError = AsaasError;
class AsaasService {
    static getEnvironment() { return (process.env.ASAAS_ENV || 'sandbox').trim().toLowerCase(); }
    static config() {
        const environment = this.getEnvironment();
        if (!['sandbox', 'production'].includes(environment))
            throw new Error('ASAAS_ENV inválido.');
        const base = new URL((process.env.ASAAS_API_URL || '').trim());
        const allowed = environment === 'sandbox' ? ['api-sandbox.asaas.com', 'sandbox.asaas.com'] : ['api.asaas.com', 'www.asaas.com'];
        if (base.protocol !== 'https:' || base.port || base.username || base.password || base.search || base.hash || !allowed.includes(base.hostname) || !['/v3', '/api/v3'].includes(base.pathname.replace(/\/$/, '')))
            throw new Error('Ambiente e URL do Asaas incompatíveis.');
        const key = (process.env.ASAAS_API_KEY || '').trim();
        if (!key)
            throw new Error('Integração Asaas ainda não configurada.');
        if ((key.includes('_hmlg_') && environment !== 'sandbox') || (key.includes('_prod_') && environment !== 'production'))
            throw new Error('Chave e ambiente do Asaas incompatíveis.');
        return { environment, base: base.toString().replace(/\/$/, ''), key };
    }
    static appUrl() {
        const url = new URL(process.env.APP_URL || '');
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
            throw new Error('Configure APP_URL com a URL pública HTTPS do Zemda.');
        return url.toString().replace(/\/$/, '');
    }
    static safeUrl(value) {
        const url = new URL(value);
        const hosts = this.getEnvironment() === 'sandbox' ? ['sandbox.asaas.com'] : ['asaas.com', 'www.asaas.com'];
        if (url.protocol !== 'https:' || url.port || url.username || url.password || !hosts.includes(url.hostname))
            throw new Error('Link de pagamento inválido.');
        return url.toString();
    }
    static checkoutUrl(id, link) {
        if (link)
            return this.safeUrl(link);
        const host = this.getEnvironment() === 'sandbox' ? 'sandbox.asaas.com' : 'asaas.com';
        return this.safeUrl(`https://${host}/checkoutSession/show?id=${encodeURIComponent(id)}`);
    }
    static async request(endpoint, options = {}) {
        const config = this.config();
        if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('://'))
            throw new Error('Recurso Asaas inválido.');
        try {
            const response = await fetch(config.base + endpoint, {
                method: options.method || 'GET', redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs || 15000),
                headers: { access_token: config.key, 'Content-Type': 'application/json', 'User-Agent': 'Zemda/1.0' },
                body: options.body === undefined ? undefined : JSON.stringify(options.body)
            });
            // Provider error bodies may contain credentials or PII. Retain only the first
            // short machine code for server-side diagnostics; never expose the body.
            if (!response.ok) {
                let providerCode;
                try {
                    const body = await response.clone().json();
                    const value = body?.errors?.[0]?.code;
                    if (typeof value === 'string' && /^[A-Z0-9_-]{1,80}$/i.test(value))
                        providerCode = value;
                }
                catch { }
                throw new AsaasError(response.status, response.status >= 500, providerCode);
            }
            if (response.status === 204)
                return {};
            if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json'))
                throw new AsaasError(response.status, true);
            const text = await response.text();
            return (text ? JSON.parse(text) : {});
        }
        catch (e) {
            if (e instanceof AsaasError)
                throw e;
            throw new AsaasError(0, true);
        }
    }
    static async checkConnection() {
        try {
            await this.request('/finance/balance', { timeoutMs: 8000 });
            return { connected: true, environment: this.getEnvironment() };
        }
        catch {
            return { connected: false, environment: this.getEnvironment(), error: 'Verifique a configuração e as credenciais do ambiente no servidor.' };
        }
    }
}
exports.AsaasService = AsaasService;
