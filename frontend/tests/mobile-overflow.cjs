/* Production components, isolated synthetic identity/data. No backend/network mutations. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const baseline = process.env.MOBILE_BASELINE === '1';
const interactions = process.env.MOBILE_INTERACTIONS === '1';
const outputName = process.env.MOBILE_OUTPUT_NAME?.replace(/[^a-z0-9_-]/gi, '_');
const out = path.join(root, outputName ? 'test-results/' + outputName : process.env.DESKTOP_DIAGNOSTIC ? 'test-results/desktop-diagnostic-' + (baseline ? 'before' : 'after') : baseline ? 'test-results/mobile-baseline' : interactions ? 'test-results/mobile-interactions' : process.env.DESKTOP_COMPARE ? 'test-results/mobile-desktop-current' : 'test-results/mobile');
const modalButtons = { '/dashboard': ['Novo Paciente', 'Novo Agendamento'], '/agenda': ['Agendar'], '/pacientes': ['Novo Paciente'], '/financeiro': ['Novo Recebimento'], '/estoque': ['Novo Item de Estoque'], '/orcamentos': ['Novo Orçamento de Paciente'], '/zemda-personal/patient': ['Nova Avaliação'] };
fs.mkdirSync(out, { recursive: true });
const modules = {
  '/zemda-personal': 'ZemdaPersonal', '/zemda-estetic': 'ZemdaEstetic', '/zemda-fisio': 'ZemdaFisio',
  '/zemda-odonto': 'ZemdaOdonto', '/zemda-nutri': 'ZemdaNutri', '/zemda-to': 'ZemdaTO',
  '/zemda-fono': 'ZemdaFono', '/zemda-psico': 'ZemdaPsico', '/zemda-pp': 'ZemdaPP', '/zemda-med': 'ZemdaMed'
};
const routes = ['/', '/login', '/cadastro', '/dashboard', '/agenda', '/pacientes', '/pacientes/patient', '/atendimentos', '/financeiro', '/estoque', '/orcamentos', '/configuracoes', '/relatorios', '/exames-pendentes', ...Object.keys(modules), '/zemda-personal/patient', '/zemda-estetic/patient', '/zemda360', '/superadmin'];
const widths = process.env.MOBILE_WIDTHS ? process.env.MOBILE_WIDTHS.split(',').map(Number) : [320, 360, 375, 390, 412, 430, 480, 600, 768, 1024, 1280, 1440, 1920];
const selectedRoutes = process.env.MOBILE_ROUTES ? process.env.MOBILE_ROUTES.split(',') : routes;
const patient = { id: 'patient', name: 'Maria Silva de Oliveira – paciente de teste com nome extenso', birth_date: '1990-01-15', email: 'maria.silva@example.test', phone: '11999999999', cpf: '00000000000', gender: 'female', active: 1, status: 'active', anamnesis: {}, address: 'Endereço de teste' };
function bootstrap(route) {
  const publicPage = ['/', '/login', '/cadastro'].includes(route);
  const module = modules[route.replace(/\/patient$/, '')] || 'ZemdaMed';
  const superadmin = route === '/superadmin';
  const tenant = { id: 'clinic', name: 'Clínica Zemda de Atendimento Multidisciplinar com nome longo', slug: 'qa', status: 'active', plan: 'clinic', terminology: 'patient', clinicalWorkspace: module, commercialModule: module };
  const user = { id: 'user', name: 'Profissional QA', email: 'qa@example.test', role: superadmin ? 'superadmin' : 'clinic_admin', tenantId: 'clinic', status: 'active', onboardingStatus: 'active', emailVerified: true, needsOnboarding: false, needsLegalAcceptance: false, commercialModule: module, clinicalWorkspace: module, professionalId: 'prof', capabilities: [], practiceAreas: '[]' };
  const auth = { currentUser: publicPage ? null : user, currentTenant: publicPage ? null : tenant, loading: false, token: publicPage ? null : 'synthetic', isSuperAdmin: superadmin, isClinicAdmin: !superadmin && !publicPage, isProfessional: false, isReceptionist: false, isPatient: false, isSandboxSession: false, clientTermLabel: 'Paciente', commercialModule: module, clinicalWorkspace: module, taxonomyCategory: 'health', capabilities: [], practiceAreaIds: [], userPermissions: [], selectedOptionalCapabilities: [], hasPermission: () => true, hasCapability: () => true, reloadSession: async () => {}, refreshTenant: async () => {}, logout: () => {} };
  for (const name of ['ZemdaFisio', 'ZemdaOdonto', 'ZemdaNutri', 'ZemdaTO', 'ZemdaFono', 'ZemdaPsico', 'ZemdaPP', 'ZemdaPersonal', 'ZemdaMed', 'ZemdaEstetic']) auth['is' + name] = module === name;
  auth.isZemda360 = auth.isZemdaBody = true;
  window.qaAuth = auth;
  window.qaPatient = patient;
  const day = new Date().toLocaleDateString('en-CA');
  const appointment = { id: 'appt', patient_id: 'patient', patient_name: patient.name, professional_id: 'prof', professional_name: 'Profissional de teste', service_name: 'Consulta de avaliação multidisciplinar', start_time: `${day}T09:15:00`, end_time: `${day}T10:15:00`, status: 'scheduled', modality: 'presencial', clinical_module: module };
  window.qaGet = async endpoint => {
    const url = endpoint.split('?')[0];
    if (url === '/v1/subscriptions/current') return { canOperate: true, billingRequired: true, access: { allowed: true }, status: 'ACTIVE', subscription: { status: 'active' }, plan: { name: 'Clínica' } };
    if (url === '/v1/user-onboarding') return { onboardingStatus: 'completed', onboardingDismissed: true, moduleToursCompleted: [], whatsNewDismissed: [] };
    if (url === '/v1/dashboard/metrics') return { today: { total: 1, appointments: [appointment] }, monthly: {}, totals: {}, permissions: { finance: true }, chart: [] };
    if (url === '/v1/admin/metrics') return { totalClinics: 1, activeClinics: 1, pendingClinics: 0, totalUsers: 1, totalProfessionals: 1, totalAppointments: 1, totalRevenueEstimate: 180 };
    if (url === '/v1/admin/subscriptions') return { total: 0, counts: [], byPlan: [], rows: [], pendingEvents: 0, mrr: 0 };
    if (url === '/v1/admin/integrity') return { services: [], whatsapp: [], jobs: { pendingNotifications: 0, pendingClinicDeletions: 0, webhookJobs: [] }, recent: [], frequent: [], autosave: [], pagination: { total: 0 }, affectedClinics: 0, deployment: { environment: 'test', status: 'synthetic' }, uploads: [], webhooks: [], notifications: [] };
    if (url === '/v1/tenants') return [{ ...tenant, created_at: '2026-10-14', admin_name: user.name, admin_email: user.email }];
    if (url === '/v1/patients/patient') return { ...patient, patient, guardians: [], recentAppointments: [] };
    if (url === '/v1/patients') return [patient];
    if (url === '/v1/budgets') return [{ id: 'budget', budget_number: 'ZEM-001', patient_name: patient.name, supplier_name: 'Fornecedor de teste', created_at: '2026-10-14', validity_date: '2026-11-14', total_amount: 180, status: 'draft', converted: false }];
    if (url === '/v1/appointments') return [appointment];
    if (url === '/v1/personal/students') return { students: [patient] };
    if (url === '/v1/personal/students/patient') return { student: patient, workouts: [] };
    if (url === '/v1/personal/search') return { students: [patient], exercises: [], workouts: [] };
    if (url === '/v1/professionals') return [{ id: 'prof', name: 'Profissional de teste', active: 1, schedules: [] }];
    if (url === '/v1/payments') return { payments: [{ id: 'payment', patient_name: patient.name, amount: 180, payment_method: 'pix', status: 'paid', created_at: `${day}T09:00:00`, paid_at: day }], totalPaid: 180, totalPending: 0 };
    if (url === '/v1/inventory') return { items: [{ id: 'item', name: 'Material de uso clínico com descrição extensa', quantity: 12, min_quantity: 5, unit: 'un', category: 'Material', cost_price: 12 }], totalItems: 1, metrics: { total: 1, lowStock: 0, zeroStock: 0, totalValue: 144 } };
    if (url === '/v1/cash-register/current') return { openRegister: null, movements: [], totalsByMethod: {} };
    if (url.includes('odontograms')) return { teeth: {}, history: [], odontogram: { teeth: {} } };
    if (url.endsWith('/allergies')) return { allergies: [], alerts: [] };
    return [];
  };
  localStorage.setItem('auth_token', 'synthetic');
  localStorage.setItem('active_tenant_id', 'clinic');
  localStorage.setItem('zemda_cookie_consent', JSON.stringify({ necessary: true, analytics: false, marketing: false, version: '2026.1', timestamp: new Date().toISOString() }));
}

(async () => {
  await esbuild.build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {App} from './src/App';import './src/styles/global.css';import './src/styles/mobile.css';createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, format: 'iife', outfile: path.join(out, 'fixture.js'), jsx: 'automatic', external: ['/landing/*'],
    define: { 'import.meta.env': JSON.stringify({ VITE_ZEMDA_ANDROID_VERSION_NAME: '1.1.2', VITE_ZEMDA_ANDROID_VERSION_CODE: '10102', VITE_ZEMDA_ANDROID_TEST_DOWNLOAD_URL: process.env.TEST_APK_URL || '' }) },
    plugins: [{ name: 'synthetic-api-identity', setup(build) {
      build.onLoad({ filter: /[\\/]context[\\/]AuthContext\.tsx$/ }, () => ({ contents: `export const useAuth=()=>window.qaAuth;export const AuthProvider=({children})=>children;`, loader: 'js' }));
      build.onLoad({ filter: /[\\/]api[\\/]client\.ts$/ }, () => ({ contents: `export const getApiBaseUrl=()=>'/api';export const buildApiUrl=(base,path)=>base+path;export const ApiClient={getBaseUrl:()=>'/api',get:path=>window.qaGet(path),post:async()=>{throw new Error('Mutation blocked in mobile audit')},put:async()=>{throw new Error('Mutation blocked in mobile audit')},delete:async()=>{throw new Error('Mutation blocked in mobile audit')}};`, loader: 'js' }));
      if (baseline) build.onLoad({ filter: /\.(tsx?|css)$/ }, args => {
        const relative = path.relative(root, args.path);
        const original = path.join(root, 'test-results/baseline/frontend', relative);
        if (!relative.startsWith('src' + path.sep) || !fs.existsSync(original)) return;
        return { contents: fs.readFileSync(original, 'utf8'), loader: path.extname(args.path).slice(1), resolveDir: path.dirname(args.path) };
      });
    } }]
  });
  // Tailwind's real production stylesheet supplies all utility classes.
  const productionCss = fs.readdirSync(path.join(root, 'dist/assets')).find(file => /^index-.*\.css$/.test(file));
  const css = fs.readFileSync(baseline && fs.existsSync(path.join(root, 'test-results/baseline-desktop.css')) ? path.join(root, 'test-results/baseline-desktop.css') : path.join(root, 'dist/assets', productionCss), 'utf8');
  const js = fs.readFileSync(path.join(out, 'fixture.js'));
  const fixtureCss = fs.readFileSync(path.join(out, 'fixture.css'), 'utf8');
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(js); return; }
    if (req.url.startsWith('/brand/')) { const file = path.join(root, 'public', req.url); if (fs.existsSync(file)) { res.setHeader('Content-Type', 'image/png'); res.end(fs.readFileSync(file)); return; } }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}\n${fixtureCss}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) }).catch(error => { server.close(); throw error; });
  const results = [], failures = [];
  try {
    for (const route of selectedRoutes) {
      const context = await browser.newContext();
      await context.route('**/*', request => new URL(request.request().url()).hostname === '127.0.0.1' ? request.continue() : request.abort());
      await context.addInitScript({ content: `const patient=${JSON.stringify(patient)};const modules=${JSON.stringify(modules)};(${bootstrap.toString()})(${JSON.stringify(route)});` });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width: widths[0], height: 900 });
      await page.goto(`http://127.0.0.1:${server.address().port}${route}`);
      await page.waitForTimeout(700);
      if (Object.keys(modules).includes(route) && !['/zemda-personal', '/zemda-estetic'].includes(route)) {
        const picker = page.locator('[data-tour="clinical-patient-select"] input');
        if (await picker.count()) {
          await picker.first().fill('Maria');
          await page.waitForTimeout(400);
          await picker.first().press('ArrowDown');
          await picker.first().press('Enter');
          await page.waitForTimeout(400);
        }
      }
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(100);
        if (route === '/agenda' && width >= 1024) await page.getByRole('button', { name: 'Semana', exact: true }).click();
        if (width >= 1024 && !baseline) {
          for (const label of ['Seção atual', 'Seção do aluno', 'Área global']) {
            const nav = page.getByLabel(label, { exact: true }).first();
            if (await nav.count() && await nav.locator('option:not([disabled])').count()) {
              const value = await nav.locator('option:not([disabled])').first().getAttribute('value');
              if (value !== null) await nav.selectOption(value, { force: true });
            }
          }
          await page.waitForTimeout(100);
        }
        const states = [null];
        if (interactions && width < 1024) states.push(...(modalButtons[route] || []).map(button => ({ button })));
        if (interactions && route === '/configuracoes') states.push({ sectionButton: 'Conta & Segurança' });
        if (width < 1024) {
          for (const label of (route === '/zemda-personal/patient' ? ['Seção do aluno'] : ['Seção atual', 'Área global'])) {
            const nav = page.getByLabel(label, { exact: true }).first();
            if (await nav.count() && await nav.isVisible()) states.push(...(await nav.locator('option:not([disabled])').evaluateAll(options => options.map(option => option.value))).map(value => ({ label, value })));
          }
        }
        for (const state of states) {
        let overlayCount = 0;
        if (state?.button) {
          overlayCount = await page.locator('.mobile-modal:visible, [role="dialog"]:visible').count();
          await page.getByRole('button', { name: state.button, exact: true }).first().click();
          await page.waitForTimeout(200);
          assert.ok(await page.locator('.mobile-modal:visible, [role="dialog"]:visible').count() > overlayCount, `Modal não abriu: ${state.button}`);
          await page.setViewportSize({ width, height: 450 });
        } else if (state?.sectionButton) { await page.getByRole('button', { name: new RegExp(state.sectionButton) }).first().click(); await page.waitForTimeout(100); }
        else if (state !== null) { await page.getByLabel(state.label, { exact: true }).first().selectOption(state.value); await page.waitForTimeout(100); }
        const check = await page.evaluate(() => {
          const visible = el => { const r = el.getBoundingClientRect(); return r.width && r.height && getComputedStyle(el).visibility !== 'hidden'; };
          const internal = Array.from(document.querySelectorAll('#root *')).filter(el => visible(el) && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)).map(el => `${el.tagName}.${String(el.className).slice(0, 150)} (${el.scrollWidth}/${el.clientWidth})`);
          const outside = Array.from(document.querySelectorAll('#root *')).filter(el => visible(el) && el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed').slice(0, 12).map(el => `${el.tagName}.${String(el.className).slice(0,130)} right=${Math.round(el.getBoundingClientRect().right)}`);
          const layout = Array.from(document.querySelectorAll('[data-tour]')).filter(visible).map(el => {
            const r = el.getBoundingClientRect(); return { key: el.getAttribute('data-tour'), rect: [r.x, r.y, r.width, r.height].map(value => Math.round(value * 10) / 10) };
          });
          return { html: document.documentElement.scrollWidth, body: document.body.scrollWidth, width: innerWidth, internal: innerWidth < 1024 ? internal : [], outside, layout, headerDebug: Array.from(document.querySelectorAll('main .flex')).slice(0, 20).map(el => { const s=getComputedStyle(el),r=el.getBoundingClientRect();return {class:el.className,rect:[r.x,r.y,r.width,r.height],minWidth:s.minWidth,maxWidth:s.maxWidth,display:s.display,direction:s.flexDirection,gap:s.gap,padding:s.padding,shrink:s.flexShrink,grow:s.flexGrow}; }), main: document.querySelector('main')?.getAttribute('data-tour-page'), text: document.body.innerText.slice(0, 350) };
        });
        const failed = check.html > width || check.body > width || check.internal.length || errors.length || /Ocorreu um erro|Algo deu errado/.test(check.text);
        results.push({ route, width, state, ...check, errors: [...errors], passed: !failed });
        if (failed) { failures.push(results.at(-1)); console.log(JSON.stringify({route,width,html:check.html,body:check.body,internal:check.internal,outside:check.outside,errors})); await page.screenshot({ path: path.join(out, `${route.replaceAll('/', '_') || 'landing'}-${width}.png`), fullPage: true }); }
        if (!baseline && route !== '/superadmin') assert.equal(await page.getByRole('link', { name: 'Baixar APK de teste', exact: true }).count(), 0);
        if (state?.label === 'Área global' && state.value === 'android') {
          if (process.env.TEST_APK_URL) assert.equal(await page.getByRole('link', { name: 'Baixar APK de teste', exact: true }).getAttribute('href'), process.env.TEST_APK_URL);
          else await page.getByText('Nenhuma versão Android de teste disponível.', { exact: true }).waitFor();
        }
        if (state?.button) {
          await page.evaluate(() => window.dispatchEvent(new Event('android-back-button')));
          await page.waitForTimeout(200);
          assert.equal(await page.locator('.mobile-modal:visible, [role="dialog"]:visible').count(), overlayCount, `Voltar não fechou: ${state.button}`);
          await page.setViewportSize({ width, height: 900 });
        }
        if (interactions && state?.sectionButton) {
          await page.evaluate(() => window.dispatchEvent(new Event('android-back-button')));
          await page.getByRole('heading', { name: 'Central de Configurações', exact: true }).waitFor();
        }
        if (interactions && state?.label === 'Área global' && state.value !== 'tenants') {
          await page.evaluate(() => window.dispatchEvent(new Event('android-back-button')));
          await page.waitForTimeout(50);
          assert.equal(await page.getByLabel('Área global', { exact: true }).inputValue(), 'tenants');
        }
      }
      }
      console.log(`${route}: ${results.filter(row => row.route === route && row.passed).length}/${results.filter(row => row.route === route).length}`);
      fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, failures }, null, 2));
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, failures }, null, 2));
    assert.equal(failures.length, 0, JSON.stringify(failures.map(({route,width,html,body,internal,errors})=>({route,width,html,body,internal,errors})), null, 2));
    console.log(`PASS: ${results.length} route/viewport checks`);
  } finally { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, failures }, null, 2)); await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
