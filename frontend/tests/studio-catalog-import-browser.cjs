const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const { normalizeProposal } = require('../../backend/dist/services/studio-catalog-proposal');

async function main() {
  const root = path.resolve(__dirname, '..');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-studio-catalog-demo-'));
  const assets = path.join(root, 'dist', 'assets');
  const css = fs.readFileSync(path.join(assets, fs.readdirSync(assets).find(name => /^index-.*\.css$/.test(name))), 'utf8');
  const bundle = await build({
    stdin: {
      contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { StudioCatalogImportView } from './src/components/import/StudioCatalogImportView';
        import { ApiClient } from './src/api/client';
        ApiClient.setCustomBaseUrl(location.origin);
        createRoot(document.getElementById('root')).render(<StudioCatalogImportView />);
      `,
      resolveDir: root, loader: 'tsx'
    },
    bundle: true, write: false, jsx: 'automatic', define: { 'import.meta.env': '{}' }
  });
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end(bundle.outputFiles[0].text);
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>' +
      css + '</style><main id="root" class="mx-auto max-w-6xl p-4"></main><script src="/fixture.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const sources = [{ id: 1, fileName: 'precos-pilates.csv', copies: 1 }];
      const catalog = { services: [], packages: [], professionals: [
        { id: 'p-ana', name: 'Ana Ribeiro' }, { id: 'p-bia', name: 'Bia' }
      ] };
      const proposal = normalizeProposal({
        services: [{
          name: 'Pilates Individual', type: 'individual', activity: 'Pilates', modality: 'presential',
          durationMinutes: 50, professionalNames: ['Ana Ribeiro'], sources: [1], prices: [{
            label: '2 aulas por semana', amountCents: 48000, unit: null, duration: '1_month',
            paymentPeriod: 'monthly', frequencyType: 'weekly', frequencyCount: 2, evidence: '2x por semana — R$ 480', sources: [1]
          }], schedules: [3, 5].map(dayOfWeek => ({
            dayOfWeek, startTime: '19:00', endTime: '20:00', professionalName: 'Profa. Ana'
          }))
        }], packages: [{ name: 'Pacote de Pilates', sources: [1], items: [{ serviceName: 'Pilates Individual' }] }]
      }, 1, true);
      let draft;
      let confirmations = 0;
      await page.route('**/v1/studio/catalog-imports**', async route => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const method = request.method();
        let response;
        if (pathname.endsWith('/analyze')) {
          const payload = request.postDataJSON();
          assert.deepEqual(payload.files.map(f => f.fileName), ['precos-pilates.csv']);
          assert.ok(payload.files[0].base64);
          await new Promise(resolve => setTimeout(resolve, 250));
          draft = { id: 'fixture', revision: 1, result: null, proposal, sources, catalog, matches: { services: {}, packages: {} } };
          response = draft;
        } else if (pathname.endsWith('/confirm')) {
          const payload = request.postDataJSON();
          assert.equal(payload.confirmed, true);
          assert.equal(payload.revision, 2);
          const row = payload.proposal.services[0];
          assert.equal(row.prices[0].unit, 'per_month');
          assert.equal(row.professionalId, 'p-ana');
          assert.deepEqual(row.schedules.map(s => s.professionalId), ['', 'p-bia']);
          assert.equal(row.reviewed, true);
          const component = payload.proposal.packages[0].items[0];
          assert.deepEqual([component.includedCredits, component.weeklyFrequency, component.monthlyLimit], [12, 2, 8]);
          confirmations++;
          response = { ...draft, result: { services: [{ name: row.name, id: 'srv-fixture', key: row.key, action: row.action }], packages: [] } };
          draft = response;
        } else if (method === 'PUT') {
          const payload = request.postDataJSON();
          assert.equal(payload.revision, 1);
          draft = { ...draft, revision: 2, proposal: payload.proposal };
          response = draft;
        } else if (pathname.endsWith('/fixture')) {
          response = draft;
        } else {
          response = draft && !draft.result ? [{ id: draft.id, sources, updatedAt: '2026-11-18' }] : [];
        }
        await route.fulfill({ json: response });
      });
      await page.goto('http://127.0.0.1:' + server.address().port);
      await page.locator('input[type=file]').setInputFiles([
        { name: 'precos-pilates.csv', mimeType: 'text/csv', buffer: Buffer.from('Frequência,Valor\n2,480') },
        { name: 'ignorar.csv', mimeType: 'text/csv', buffer: Buffer.from('Frequência,Valor\n2,480') }
      ]);
      await page.getByRole('button', { name: 'Remover ignorar.csv' }).click();
      if (width === 1440) await page.screenshot({ path: path.join(output, '01-arquivos.png'), fullPage: true });
      await page.getByRole('button', { name: 'Analisar com IA' }).click();
      await page.getByText('Analisando os arquivos com IA…').waitFor();
      await page.getByText('Pilates Individual', { exact: true }).click();
      const serviceSummary = page.getByRole('region', { name: 'Serviços identificados' }).locator('summary');
      assert.ok(await serviceSummary.getByText('Precisa de confirmação', { exact: true }).isVisible());
      assert.ok(await page.getByRole('button', { name: 'Confirmar importação', exact: true }).isDisabled());
      await page.getByLabel('Ação para este serviço').selectOption('create');
      await page.getByLabel('Profissional responsável').selectOption('p-ana');
      const instructors = page.getByLabel('Profissional do horário');
      await instructors.first().selectOption('p-bia');
      await instructors.first().selectOption({ label: 'Usar responsável (Ana Ribeiro)' });
      await instructors.nth(1).selectOption('p-bia');
      await page.getByLabel('O que o valor representa').selectOption('per_month');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width === 390) await page.screenshot({ path: path.join(output, '02-revisao-mobile.png'), fullPage: true });
      await page.getByLabel('Conferi as informações e aprovo esta ação').check();
      await page.getByRole('heading', { name: 'Pacote de Pilates' }).click();
      await page.getByLabel('Aulas ou unidades incluídas').fill('12');
      await page.getByLabel('Frequência semanal do componente').fill('2');
      await page.getByLabel('Limite mensal do componente').fill('8');
      await page.getByRole('button', { name: 'Salvar rascunho' }).click();
      await page.getByText('Rascunho salvo.', { exact: false }).waitFor();
      await page.reload();
      await page.getByRole('button', { name: 'precos-pilates.csv' }).click();
      await page.getByRole('button', { name: 'Confirmar importação', exact: true }).click();
      assert.equal(confirmations, 0);
      await page.getByRole('button', { name: 'Confirmar e cadastrar', exact: true }).click();
      await page.getByRole('heading', { name: 'Importação concluída' }).waitFor();
      assert.equal(confirmations, 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (width === 1440) await page.screenshot({ path: path.join(output, '03-confirmacao.png'), fullPage: true });
      await page.close();
      console.log('PASS ' + width + 'px: seleção, remoção, processamento, revisão, rascunho, confirmação e recibo.');
    }
    console.log('Demonstração:', output);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
