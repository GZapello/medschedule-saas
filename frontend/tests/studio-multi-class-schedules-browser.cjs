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

      // Initially NO day card expanded; weekday buttons visible
      await page.getByTestId('class-schedule-weekday-selector').waitFor();
      await page.getByTestId('class-schedule-empty-days').waitFor();
      assert.equal(await page.getByTestId('class-schedule-day-1').count(), 0);

      // Select Segunda -> add 08:00-08:50
      await page.getByTestId('class-schedule-toggle-day-1').click();
      await page.getByTestId('class-schedule-day-1').waitFor();
      await page.getByTestId('class-schedule-add-day-1').click();
      await page.getByTestId('class-schedule-input-start').fill('08:00');
      await page.getByTestId('class-schedule-input-end').fill('08:50');
      await page.getByRole('button', { name: 'Confirmar horário', exact: true }).click();
      await page.getByTestId('class-schedule-day-1').getByText('08:00 às 08:50').waitFor();

      // Select Terça -> different time 10:00-10:50
      await page.getByTestId('class-schedule-toggle-day-2').click();
      await page.getByTestId('class-schedule-day-2').waitFor();
      await page.getByTestId('class-schedule-add-day-2').click();
      await page.getByTestId('class-schedule-input-start').fill('10:00');
      await page.getByTestId('class-schedule-input-end').fill('10:50');
      await page.getByRole('button', { name: 'Confirmar horário', exact: true }).click();
      await page.getByTestId('class-schedule-day-2').getByText('10:00 às 10:50').waitFor();

      // Select Quinta -> add 3 classes on same day with different instructors/rooms/capacities!
      await page.getByTestId('class-schedule-toggle-day-4').click();
      await page.getByTestId('class-schedule-day-4').waitFor();

      // Turma 1 Quinta: 08:00-08:50, 10 vagas, Gabriel, Sala Zen
      await page.getByTestId('class-schedule-add-day-4').click();
      await page.getByTestId('class-schedule-input-start').fill('08:00');
      await page.getByTestId('class-schedule-input-end').fill('08:50');
      await page.getByTestId('class-schedule-input-capacity').fill('10');
      await page.getByTestId('class-schedule-input-professional').selectOption('prof-1');
      await page.getByTestId('class-schedule-input-room').selectOption('room-1');
      await page.getByRole('button', { name: 'Confirmar horário', exact: true }).click();

      // Turma 2 Quinta: 15:00-16:00, 12 vagas, Ana, Sala Fluxo
      await page.getByTestId('class-schedule-add-day-4').click();
      await page.getByTestId('class-schedule-input-start').fill('15:00');
      await page.getByTestId('class-schedule-input-end').fill('16:00');
      await page.getByTestId('class-schedule-input-capacity').fill('12');
      await page.getByTestId('class-schedule-input-professional').selectOption('prof-2');
      await page.getByTestId('class-schedule-input-room').selectOption('room-2');
      await page.getByRole('button', { name: 'Confirmar horário', exact: true }).click();

      // Turma 3 Quinta: 18:00-18:50, 15 vagas
      await page.getByTestId('class-schedule-add-day-4').click();
      await page.getByTestId('class-schedule-input-start').fill('18:00');
      await page.getByTestId('class-schedule-input-end').fill('18:50');
      await page.getByTestId('class-schedule-input-capacity').fill('15');
      await page.getByRole('button', { name: 'Confirmar horário', exact: true }).click();

      await page.getByTestId('class-schedule-day-4').getByText('3 turmas').waitFor();
      assert.equal(await page.getByTestId('class-schedule-day-3').count(), 0); // Quarta não selecionada permanece oculta

      // Edit Turma 1 Quinta (10 -> 14 vagas) without altering Turma 2 or Segunda!
      await page.getByTestId('class-schedule-day-4').getByTitle('Editar horário').first().click();
      await page.getByTestId('class-schedule-input-capacity').fill('14');
      await page.getByRole('button', { name: 'Atualizar horário', exact: true }).click();
      await page.getByTestId('class-schedule-day-4').getByText('14 vagas').waitFor();
      await page.getByTestId('class-schedule-day-4').getByText('12 vagas').waitFor();
      await page.getByTestId('class-schedule-day-1').getByText('10 vagas').waitFor();

      // Persisted mode shows grouped days with independent actions & NO automatic 7 days
      await page.getByRole('button', { name: 'Modo Edição', exact: true }).click();
      await page.getByTestId('persisted-class-schedules-list').waitFor();
      await page.getByTestId('class-schedule-day-1').waitFor();
      await page.getByTestId('class-schedule-day-3').waitFor();
      assert.equal(await page.getByTestId('class-schedule-day-2').count(), 0);
      assert.equal(await page.getByTestId('class-schedule-day-1').getByText('2 turmas').count(), 1);

      // Mode 30 turmas (6/day x 5 days): capped <= 7x, zero '30x' options!
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
