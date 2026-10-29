const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-google-ui-'));
require('esbuild').buildSync({ entryPoints: [path.join(__dirname, 'google-calendar-settings.tsx')], bundle: true, format: 'iife', platform: 'browser', outfile: path.join(out, 'test.js'), define: { 'import.meta.env': '{}' }, jsx: 'automatic' });
const assets = path.resolve(__dirname, '../dist/assets');
const css = fs.readdirSync(assets).find(f => /^index-.*\.css$/.test(f));
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"><style>${fs.readFileSync(path.join(assets, css), 'utf8')}</style></head><body><div id="root"></div><script>${fs.readFileSync(path.join(out, 'test.js'), 'utf8')}</script></body></html>`;
const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 360, 375, 390, 412, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('profissional.teste@example.test', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
    if (width === 320 || width === 1440) await page.screenshot({ path: path.join(out, `${width}.png`), fullPage: true });
  }
  await page.getByLabel('Direção', { exact: true }).selectOption('google_to_zemda');
  await page.getByRole('button', { name: 'Salvar preferências' }).click();
  await page.getByText('Preferências salvas.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__calls[0].body.sync_direction), 'google_to_zemda');
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  await page.getByText('3 atendimentos sincronizados; 1 pendência.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Desconectar', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__calls.some(c => c.url.endsWith('/disconnect'))), false);
  await page.getByRole('button', { name: 'Confirmar desconexão' }).click();
  await page.getByRole('button', { name: 'Conectar Google Agenda', exact: true }).waitFor();
  await page.getByText('Conexão local removida. Revogue o acesso na conta Google.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS Google settings: 8 widths, save, sync, disconnect confirmation and revocation warning. Screenshots:', out);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
