const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'zemda-avail-ui-'));

(async () => {
  await build({
    entryPoints: [path.join(__dirname, 'studio-service-availability.tsx')],
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
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);

      // Default Option A selected, custom area hidden
      await page.getByTestId('harness-avail-section').waitFor();
      assert.equal(await page.getByTestId('harness-avail-custom-area').count(), 0);

      // Select Option B -> shows Horários específicos por dia
      await page.getByTestId('harness-avail-mode-custom').click();
      await page.getByTestId('harness-avail-custom-area').waitFor();
      await page.getByText('Horários específicos por dia', { exact: true }).waitFor();

      // Add window on Monday (day 1) & adjust to 08:00 - 12:00
      await page.getByTestId('harness-avail-add-day-1').click();
      await page.getByTestId('harness-avail-start-0').fill('08:00');
      await page.getByTestId('harness-avail-end-0').fill('12:00');

      // Add second window on Monday (day 1) -> adjust to overlapping 11:00 - 14:00 -> sees overlap error
      await page.getByTestId('harness-avail-add-day-1').click();
      await page.getByTestId('harness-avail-start-1').fill('11:00');
      await page.getByTestId('harness-avail-end-1').fill('14:00');
      await page.getByText(/sobrepost/i).first().waitFor();

      // Fix second window to valid 14:00 - 18:00 -> error clears
      await page.getByTestId('harness-avail-start-1').fill('14:00');
      await page.getByTestId('harness-avail-end-1').fill('18:00');
      assert.equal(await page.getByTestId('harness-avail-error-0').count(), 0);
      assert.equal(await page.getByTestId('harness-avail-error-1').count(), 0);

      // Add window on Friday (day 5, scale 08:00-12:00) and fill 13:00-15:00 -> out of scale error
      await page.getByTestId('harness-avail-add-day-5').click();
      await page.getByTestId('harness-avail-start-2').fill('13:00');
      await page.getByTestId('harness-avail-end-2').fill('15:00');
      await page.getByText('Este horário está fora da escala de trabalho do profissional.').waitFor();

      // Remove invalid window 2 -> error clears
      await page.getByTestId('harness-avail-remove-2').click();
      assert.equal(await page.getByTestId('harness-avail-error-2').count(), 0);

      // Switch Option B -> Option A -> Option B: saved windows stay preserved!
      await page.getByTestId('harness-avail-mode-professional').click();
      assert.equal(await page.getByTestId('harness-avail-custom-area').count(), 0);
      await page.getByTestId('harness-avail-mode-custom').click();
      assert.equal(await page.getByTestId('harness-avail-start-0').inputValue(), '08:00');
      assert.equal(await page.getByTestId('harness-avail-end-1').inputValue(), '18:00');

      // Custom weekdays filtering: enable 'Dias específicos da semana' (seeds [1, 3, 5]) then deselect Quarta/Sexta -> ONLY Segunda stays!
      await page.getByRole('checkbox', { name: /Dias específicos da semana/i }).check();
      await page.getByRole('button', { name: 'Quarta-feira', exact: true }).click();
      await page.getByRole('button', { name: 'Sexta-feira', exact: true }).click();
      assert.equal(await page.getByTestId('harness-avail-day-1').count(), 1);
      assert.equal(await page.getByTestId('harness-avail-day-3').count(), 0);
      assert.equal(await page.getByTestId('harness-avail-day-5').count(), 0);

      // Mobile & desktop no horizontal overflow
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, `Horizontal overflow detected at width ${width}`);

      // Group mode hides entire Disponibilidade deste serviço section!
      await page.getByRole('button', { name: 'Tipo Coletiva', exact: true }).click();
      assert.equal(await page.getByTestId('harness-avail-section').count(), 0);

      // Switching back to Individual restores section cleanly
      await page.getByRole('button', { name: 'Tipo Individual', exact: true }).click();
      await page.getByTestId('harness-avail-section').waitFor();

      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log('STUDIO_SERVICE_AVAILABILITY_BROWSER_OK');
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(out, { recursive: true, force: true });
  }
})();
