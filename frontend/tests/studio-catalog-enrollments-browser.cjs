const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..');
  const bundle = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { AuthProvider } from './src/context/AuthContext';
    import { ToastProvider } from './src/context/ToastContext';
    import { ApiClient } from './src/api/client';
    import { ServicesView } from './src/components/services/ServicesView';
    import { StudioEnrollmentsView } from './src/components/studio/StudioEnrollmentsView';
    localStorage.setItem('auth_token','fixture');
    ApiClient.setCustomBaseUrl(location.origin);
    createRoot(document.querySelector('main')).render(<AuthProvider><ToastProvider>{location.pathname === '/servicos'
      ? <ServicesView/> : <StudioEnrollmentsView/>}</ToastProvider></AuthProvider>);
  ` }, bundle: true, write: false, outfile: 'main.js', jsx: 'automatic', define: { 'import.meta.env': '{}' } });
  const assets = path.join(root, 'dist', 'assets');
  const css = fs.readFileSync(path.join(assets, fs.readdirSync(assets).find(s => /^index-.*\.css$/.test(s))), 'utf8');
  const server = http.createServer((req, res) => {
    if (req.url === '/main.js') { res.setHeader('Content-Type','text/javascript'); return res.end(bundle.outputFiles[0].text); }
    res.setHeader('Content-Type','text/html');
    res.end('<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>' + css + '</style><main></main><script src="/main.js"></script>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(7000);
      const tenant = { id: 'studio', name: 'Studio Central', establishment_profile: 'studio' };
      const user = { id: 'manager', name: 'Gestor', role: 'clinic_admin' };
      const permissions = { canViewEnrollments: true, canViewFinancial: true, canManageContracts: true, canReceivePayment: true };
      const enrollment = { id: 'c1', title: 'Plano anual', studentName: 'Maria Silva', lifecycleCategory: 'active', amount: 120,
        startDate: '2025-01-01', endDate: '2027-01-01', accessMode: 'unlimited', contractSource: 'recurring_plan', paymentPeriodicity: 'monthly',
        entitlements: [{ id: 'benefit', entitlement_type: 'facility_access', service_name_snapshot: 'Academia', access_mode_snapshot: 'unlimited' }] };
      let archived = true;
      let paid = false;
      await page.route('**/v1/**', async route => {
        const req = route.request(), routePath = new URL(req.url()).pathname;
        let result = [];
        if (routePath.endsWith('/auth/me')) result = { user, tenant };
        else if (routePath.endsWith('/clinics/current')) result = tenant;
        else if (routePath.endsWith('/services')) result = [{ id: 's1', name: 'Musculação', active: 1 },
          { id: 's2', name: 'Pilates antigo', active: Number(!archived) }].map(s => ({ ...s, service_domain: 'studio', studio_service_type: 'facility_access' }));
        else if (routePath.endsWith('/history')) result = [{ action: 'INACTIVATE_SERVICE', actor: 'Gestor', created_at: '2025-01-01 10:00:00' }];
        else if (routePath.endsWith('/reactivate')) { archived = false; result = { success: true }; }
        else if (routePath.endsWith('/packages')) result = { packages: [] };
        else if (routePath.endsWith('/enrollments')) result = { enrollments: [enrollment], permissions };
        else if (routePath.endsWith('/enrollments/c1')) result = { enrollment, permissions, student: { fullName: 'Maria Silva', phone: '11988887777' },
          payments: [{ id: 'p1', amount: 120, due_date: '2025-01-03', status: paid ? 'paid' : 'pending', payment_method: 'pix', payment_date: paid ? '2025-01-04' : null }],
          history: paid ? [{ id: 'event', action: 'COLLECTION_MARK_PAID', summary: 'Recebimento registrado no Financeiro.' }] : [] };
        else if (routePath.endsWith('/collections/p1/mark-paid')) {
          assert.deepEqual(req.postDataJSON(), { enrollmentId: 'c1', paymentMethod: 'pix', paymentDate: '2025-01-04', amountReceived: 120, notes: 'Recepção' });
          assert.equal(paid, false); paid = true; result = { success: true };
        }
        await route.fulfill({ json: result });
      });
      await page.goto(url + '/servicos');
      await page.getByText('Musculação', { exact: true }).first().waitFor();
      assert.equal(await page.getByText('Pilates antigo', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Desativados', exact: true }).click();
      await page.getByLabel('Buscar serviço no Studio').fill('Pilates');
      await page.getByText('Pilates antigo', { exact: true }).first().waitFor();
      await page.getByRole('button', { name: 'Histórico', exact: true }).click();
      await page.getByLabel('Histórico do serviço').getByText(/Desativado/).waitFor();
      await page.getByRole('button', { name: 'Reativar', exact: true }).click();
      await page.getByText('Nenhum serviço desativado encontrado.').waitFor();
      await page.getByRole('button', { name: 'Ativos', exact: true }).click();
      await page.getByText('Pilates antigo', { exact: true }).first().waitFor();
      await page.goto(url + '/matriculas');
      const benefits = page.locator('summary').filter({ hasText: /Benefícios do Pacote Combinado/ });
      await benefits.click();
      await page.getByText('Acesso Livre incluído', { exact: true }).waitFor();
      await benefits.click();
      await page.getByText('Ações da matrícula', { exact: true }).click();
      await page.getByRole('button', { name: 'Congelar', exact: true }).waitFor();
      await page.getByText('Ações da matrícula', { exact: true }).click();
      await page.getByRole('button', { name: 'Detalhes', exact: true }).click();
      await page.getByText('Vencida', { exact: true }).waitFor();
      await page.evaluate(() => { window.open = url => { window.openedWhatsApp = url; return null; }; });
      await page.getByRole('button', { name: 'WhatsApp', exact: true }).click();
      const message = page.locator('textarea:visible');
      assert.match(await message.inputValue(), /Studio Central.*Plano anual.*120,00.*03\/01\/2025/);
      assert.equal(await page.evaluate(() => window.openedWhatsApp), undefined);
      await message.fill('Mensagem conferida');
      await page.getByRole('button', { name: 'Abrir no WhatsApp', exact: true }).click();
      const opened = new URL(await page.evaluate(() => window.openedWhatsApp));
      assert.equal(opened.searchParams.get('text'), 'Mensagem conferida');
      assert.ok(opened.href.includes('5511988887777'));
      await page.getByRole('button', { name: 'Marcar como pago' }).click();
      await page.getByLabel('Data do recebimento').fill('2025-01-04');
      await page.getByLabel('Observações (opcional)').fill('Recepção');
      await page.getByRole('button', { name: 'Registrar recebimento', exact: true }).click();
      await page.getByText('Recebido em 04/01/2025 · Pix').waitFor();
      await page.getByText('Recebimento registrado no Financeiro.').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Marcar como pago' }).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.close();
      console.log('PASS catálogo, ações da matrícula, WhatsApp, baixa e histórico em ' + width + 'px');
    }
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
