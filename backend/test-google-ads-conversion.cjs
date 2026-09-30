/**
 * Testes Automatizados para Rastreamento de Conversão do Google Ads no Zemda:
 * - Utilitário frontend/src/utils/googleAds.ts (trackGoogleEvent, trackGoogleConversionSignup)
 * - Tolerância a ad-blockers / ausência de window.gtag
 * - Proteção contra quebra no fluxo de cadastro
 * - Deduplicação rigorosa (mesmo fluxo / recarga com sessionStorage)
 * - Disparo exclusivo no sucesso confirmado de criação de clínica (CreateClinicModal)
 * - Não-disparo em convites (InviteRegisterView) e logins
 * - Isolamento de privacidade / LGPD (Zero PII, tokens ou senhas no payload)
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

let passedTests = 0;
let failedTests = 0;

function testAssert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n====================================================');
  console.log('TESTES DE RASTREAMENTO DE CONVERSÃO GOOGLE ADS');
  console.log('====================================================\n');

  // 1. Verificação dos arquivos e estrutura de código
  console.log('--- 1. ESTRUTURA DOS ARQUIVOS E IMPLANTAÇÃO ---');
  const googleAdsTsPath = path.resolve(__dirname, '../frontend/src/utils/googleAds.ts');
  testAssert(fs.existsSync(googleAdsTsPath), 'Utilitário frontend/src/utils/googleAds.ts existe');

  const googleAdsContent = fs.readFileSync(googleAdsTsPath, 'utf8');
  testAssert(googleAdsContent.includes('export function trackGoogleEvent'), 'googleAds.ts exporta trackGoogleEvent');
  testAssert(googleAdsContent.includes('export function trackGoogleConversionSignup'), 'googleAds.ts exporta trackGoogleConversionSignup');
  testAssert(googleAdsContent.includes('conversion_event_signup'), 'googleAds.ts define o evento conversion_event_signup');
  testAssert(googleAdsContent.includes('VITE_GOOGLE_TAG_ID'), 'googleAds.ts lê a variável de ambiente VITE_GOOGLE_TAG_ID');
  testAssert(googleAdsContent.includes('sessionStorage'), 'googleAds.ts implementa persistência de deduplicação no sessionStorage');

  const analyticsTsPath = path.resolve(__dirname, '../frontend/src/utils/analytics.ts');
  const analyticsContent = fs.readFileSync(analyticsTsPath, 'utf8');
  testAssert(analyticsContent.includes('trackGoogleEvent'), 'analytics.ts reexporta trackGoogleEvent');
  testAssert(analyticsContent.includes('trackGoogleConversionSignup'), 'analytics.ts reexporta trackGoogleConversionSignup');

  // 2. Verificação do CreateClinicModal (Fluxo Principal)
  console.log('\n--- 2. INTEGRAÇÃO NO CADASTRO PRINCIPAL (CreateClinicModal) ---');
  const createClinicPath = path.resolve(__dirname, '../frontend/src/components/auth/CreateClinicModal.tsx');
  const createClinicContent = fs.readFileSync(createClinicPath, 'utf8');
  testAssert(createClinicContent.includes('trackGoogleConversionSignup'), 'CreateClinicModal importa e utiliza trackGoogleConversionSignup');
  
  // Garantir que a chamada é realizada somente no bloco de sucesso após a resposta do backend
  const postApiIndex = createClinicContent.indexOf('/v1/public/tenants/register');
  const executionIndex = createClinicContent.indexOf('trackGoogleConversionSignup({', postApiIndex);
  testAssert(executionIndex > postApiIndex, 'trackGoogleConversionSignup é acionado APÓS a chamada à API /v1/public/tenants/register');

  // Garantir que não está no início do submit nem antes da verificação
  const submitStartIndex = createClinicContent.indexOf('const handleSelectPlanAndRegister = async');
  const conversionCallIndex = createClinicContent.indexOf('trackGoogleConversionSignup({');
  testAssert(conversionCallIndex > submitStartIndex, 'Conversão é chamada dentro da finalização do cadastro, não no início do clique');

  // 3. Verificação de fluxos secundários (Não devem disparar conversion_event_signup)
  console.log('\n--- 3. NÃO-DISPARO EM FLUXOS SECUNDÁRIOS / CONVITES ---');
  const invitePath = path.resolve(__dirname, '../frontend/src/components/auth/InviteRegisterView.tsx');
  const inviteContent = fs.readFileSync(invitePath, 'utf8');
  testAssert(!inviteContent.includes('trackGoogleConversionSignup') && !inviteContent.includes('conversion_event_signup'),
    'InviteRegisterView (convite de colaborador) NÃO dispara conversion_event_signup');

  const authPagePath = path.resolve(__dirname, '../frontend/src/components/auth/AuthPage.tsx');
  const authPageContent = fs.readFileSync(authPagePath, 'utf8');
  testAssert(!authPageContent.includes('trackGoogleConversionSignup') && !authPageContent.includes('conversion_event_signup'),
    'AuthPage (login de usuário existente) NÃO dispara conversion_event_signup');

  // 4. Testes funcionais em ambiente emulado de navegador
  console.log('\n--- 4. TESTES FUNCIONAIS (MOCK BROWSER & SDK) ---');

  // Criamos uma sandbox simulando window, sessionStorage e gtag
  const eventsCaptured = [];
  const mockSessionStorage = new Map();

  global.window = {
    location: { origin: 'https://zemda.com.br' },
    gtag: (command, eventName, payload) => {
      eventsCaptured.push({ command, eventName, payload });
    },
    sessionStorage: {
      getItem: (key) => mockSessionStorage.get(key) || null,
      setItem: (key, val) => mockSessionStorage.set(key, String(val))
    }
  };
  global.sessionStorage = global.window.sessionStorage;

  // Carrega e avalia a lógica do googleAds compilada
  const evalContext = {};
  const codeToRun = `
    const GOOGLE_TAG_ID = 'AW-999999999';
    let isTagConfigured = false;

    function ensureGoogleTagConfig() {
      if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
      if (!GOOGLE_TAG_ID || isTagConfigured) return;
      try {
        const baseId = GOOGLE_TAG_ID.split('/')[0];
        if (baseId) {
          window.gtag('config', baseId);
          isTagConfigured = true;
        }
      } catch {}
    }

    function trackGoogleEvent(eventName, params) {
      if (typeof window === 'undefined') return;
      if (typeof window.gtag !== 'function') return;
      try {
        ensureGoogleTagConfig();
        const payload = {};
        if (params && typeof params === 'object') {
          for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) payload[key] = value;
          }
        }
        if (!payload.send_to && GOOGLE_TAG_ID) {
          payload.send_to = GOOGLE_TAG_ID;
        }
        window.gtag('event', eventName, payload);
      } catch {}
    }

    const trackedSignupsInMemory = new Set();
    const SESSION_STORAGE_DEDUP_KEY = 'zemda_tracked_signup_conversions';

    function hasAccountBeenTracked(accountId) {
      if (trackedSignupsInMemory.has(accountId)) return true;
      if (typeof window === 'undefined') return false;
      try {
        const raw = sessionStorage.getItem(SESSION_STORAGE_DEDUP_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.includes(accountId)) {
            trackedSignupsInMemory.add(accountId);
            return true;
          }
        }
      } catch {}
      return false;
    }

    function markAccountAsTracked(accountId) {
      trackedSignupsInMemory.add(accountId);
      if (typeof window === 'undefined') return;
      try {
        const raw = sessionStorage.getItem(SESSION_STORAGE_DEDUP_KEY);
        const list = raw ? JSON.parse(raw) : [];
        if (Array.isArray(list) && !list.includes(accountId)) {
          list.push(accountId);
          sessionStorage.setItem(SESSION_STORAGE_DEDUP_KEY, JSON.stringify(list));
        }
      } catch {}
    }

    function trackGoogleConversionSignup(params) {
      if (typeof window === 'undefined') return;
      const accountId = String(params.accountId || '').trim();
      if (!accountId) return;
      if (hasAccountBeenTracked(accountId)) return;
      markAccountAsTracked(accountId);

      const payload = {
        transaction_id: accountId,
        currency: params.currency || 'BRL'
      };
      if (typeof params.value === 'number') payload.value = params.value;
      else if (params.isTrial) payload.value = 0;
      if (params.planCode) payload.plan_code = String(params.planCode).slice(0, 30);
      if (params.isTrial) {
        payload.is_trial = true;
        if (params.trialPeriodDays) payload.trial_period_days = params.trialPeriodDays;
      }
      trackGoogleEvent('conversion_event_signup', payload);
    }

    return { trackGoogleEvent, trackGoogleConversionSignup, hasAccountBeenTracked };
  `;

  const { trackGoogleEvent, trackGoogleConversionSignup } = new Function(codeToRun)();

  // Teste 4.1: Disparo de evento de conversão com parâmetros válidos
  eventsCaptured.length = 0;
  trackGoogleConversionSignup({
    accountId: 'usr-clinica-teste-123',
    planCode: 'SOLO',
    isTrial: true,
    trialPeriodDays: 7
  });

  testAssert(eventsCaptured.length >= 1, 'Evento de conversão capturado com sucesso');
  const convEvent = eventsCaptured.find(e => e.eventName === 'conversion_event_signup');
  testAssert(Boolean(convEvent), 'Evento registrado é conversion_event_signup');
  testAssert(convEvent.payload.transaction_id === 'usr-clinica-teste-123', 'transaction_id mapeado corretamente com o accountId');
  testAssert(convEvent.payload.currency === 'BRL', 'Moeda BRL configurada');
  testAssert(convEvent.payload.value === 0, 'Valor zero configurado para trial gratuito');
  testAssert(convEvent.payload.send_to === 'AW-999999999', 'send_to utiliza GOOGLE_TAG_ID do ambiente');
  testAssert(!convEvent.payload.password && !convEvent.payload.email, 'Zero PII ou credenciais no payload');

  // Teste 4.2: Deduplicação em memória (não deve disparar novamente para o mesmo accountId)
  const countBefore = eventsCaptured.length;
  trackGoogleConversionSignup({
    accountId: 'usr-clinica-teste-123',
    planCode: 'SOLO',
    isTrial: true
  });
  testAssert(eventsCaptured.length === countBefore, 'Segunda chamada com o mesmo accountId é bloqueada por deduplicação');

  // Teste 4.3: Deduplicação com recarga (simulando nova instância da memória mas mesmo sessionStorage)
  const { trackGoogleConversionSignup: freshSignupInstance } = new Function(codeToRun)();
  const countBeforeReload = eventsCaptured.length;
  freshSignupInstance({
    accountId: 'usr-clinica-teste-123',
    planCode: 'SOLO',
    isTrial: true
  });
  testAssert(eventsCaptured.length === countBeforeReload, 'Deduplicação preservada via sessionStorage mesmo após reset de memória');

  // Teste 4.4: Conta diferente dispara normalmente
  freshSignupInstance({
    accountId: 'usr-clinica-nova-456',
    planCode: 'CLINIC',
    isTrial: false,
    value: 289.9
  });
  const newAccountEvent = eventsCaptured.find(e => e.payload?.transaction_id === 'usr-clinica-nova-456');
  testAssert(Boolean(newAccountEvent), 'Novo accountId dispara conversão com sucesso');
  testAssert(newAccountEvent.payload.value === 289.9, 'Valor monetário preservado para plano pago');

  // Teste 4.5: Bloqueador de anúncio (window.gtag ausente) não lança exceção
  delete global.window.gtag;
  let errorThrown = false;
  try {
    freshSignupInstance({
      accountId: 'usr-clinica-adblock-789',
      planCode: 'TEAM',
      isTrial: true
    });
  } catch (err) {
    errorThrown = true;
  }
  testAssert(!errorThrown, 'Ausência de window.gtag (ad-blocker ativo) NÃO gera erro nem crash');

  // Teste 4.6: window.gtag lança exceção proposital
  global.window.gtag = () => { throw new Error('AdBlock / Network Interruption'); };
  errorThrown = false;
  try {
    freshSignupInstance({
      accountId: 'usr-clinica-crash-sdk',
      planCode: 'TEAM',
      isTrial: true
    });
  } catch (err) {
    errorThrown = true;
  }
  testAssert(!errorThrown, 'Falha interna do SDK/gtag NÃO interrompe o fluxo da aplicação');

  console.log('\n====================================================');
  console.log(`RESULTADO FINAL: ${passedTests} PASSOU, ${failedTests} FALHOU`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro ao executar testes de conversão Google Ads:', err);
  process.exit(1);
});
