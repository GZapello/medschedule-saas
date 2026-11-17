const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'zemda-multi-class-ui-'));

(async () => {
  await build({
    entryPoints: [path.join(__dirname, 'studio-multi-class-schedules.tsx')],
    bundle: true,
    outfile: path.join(out, 'test.js'),
    format: 'iife',
    jsx: 'automatic',
    define: { 'import.meta.env': '{}' }
  });

  const css = fs.readdirSync(path.join(root, 'dist/assets')).find(f => /^index-.*\.css$/.test(f));
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(
        path.join(root, 'dist/assets', css),
        'utf8'
      )}</style><div id="root"></div><script>${fs.readFileSync(path.join(out, 'test.js'), 'utf8')}</script>`
    );
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const browser = await chromium.launch({ headless: true });
  const errors = [];

  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on('pageerror', err => errors.push(err.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);

      // Initial button reads '+ Adicionar Dia e Horário', adds Mon+Wed 08:00-08:50
      await page.getByRole('button', { name: '+ Adicionar Dia e Horário', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar horário', exact: true }).click();
      await page.getByTestId('draft-class-schedules-list').waitFor();

      // Button now reads '+ Adicionar outro horário', pre-fills non-conflicting time (e.g. 17:00), adds 2nd class on same days
      await page.getByRole('button', { name: '+ Adicionar outro horário', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar horário', exact: true }).click();
      await page.getByTestId('draft-schedules-day-summary').waitFor();
      assert.equal(await page.getByTitle('Editar horário').count(), 2);

      // Persisted mode shows grouped 'Horários cadastrados' by weekday (Segunda-feira & Quarta-feira) with 2 classes under Segunda
      await page.getByRole('button', { name: 'Modo Edição', exact: true }).click();
      await page.getByTestId('persisted-class-schedules-list').waitFor();
      await page.getByTestId('class-schedule-day-1').waitFor();
      await page.getByTestId('class-schedule-day-3').waitFor();
      assert.equal(await page.getByTestId('class-schedule-day-1').getByText('2 turmas').count(), 1);

      // Mode 30 turmas (6/day x 5 days): capped at <= 7x, zero '30x' options!
      await page.getByRole('button', { name: 'Modo 30 Turmas', exact: true }).click();
      await page.getByRole('button', { name: 'Personalizar preços por frequência', exact: true }).click();
      assert.equal(await page.getByText(/30x por semana/).count(), 0);
      const optionTexts = await page.locator('option').allTextContents();
      assert.equal(optionTexts.some(t => /30 aula|30x/.test(t)), false, `Unexpected 30x option: ${optionTexts.join(',')}`);

      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);

      // Public booking flow shows both 08:00 (3 vagas) & 17:00 (8 vagas) and recurring plan weekday grouping
      await page.goto(`http://127.0.0.1:${server.address().port}?view=public`);
      await page.getByRole('button', { name: /^Agendar uma aula/ }).click();
      await page.getByRole('button', { name: /Yoga Coletiva/ }).click();
      await page.getByRole('button', { name: /Aula avulsa/ }).click();
      await page.getByText('08:00 às 08:50').waitFor();
      await page.getByText('17:00 às 17:50').waitFor();
      await page.getByText('3 vagas disponíveis').waitFor();
      await page.getByText('8 vagas disponíveis').waitFor();
      await page.getByRole('button', { name: /Plano de aulas/ }).click();
      await page.getByText('Segunda-feira', { exact: true }).waitFor();
      await page.getByText('Quarta-feira', { exact: true }).waitFor();
      await page.getByRole('checkbox', { name: /Seg · 17:00–17:50/ }).check();
      await page.getByRole('checkbox', { name: /Qua · 08:00–08:50/ }).check();
      await page.getByText('2x por semana', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);

      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log('STUDIO_MULTI_CLASS_SCHEDULES_BROWSER_OK');
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(out, { recursive: true, force: true });
  }
})();
