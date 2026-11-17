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

      // Select Option B -> shows compact weekday pills with NO days pre-expanded
      await page.getByTestId('harness-avail-mode-custom').click();
      await page.getByTestId('harness-avail-custom-area').waitFor();
      await page.getByTestId('harness-avail-weekday-selector').waitFor();
      await page.getByTestId('harness-avail-no-days-hint').waitFor();
      assert.equal(await page.getByTestId('harness-avail-day-1').count(), 0);

      // Select ONLY Segunda -> shows ONLY Segunda (and none of the other 6 days)
      await page.getByTestId('harness-avail-toggle-day-1').click();
      await page.getByTestId('harness-avail-day-1').waitFor();
      assert.equal(await page.getByTestId('harness-avail-day-2').count(), 0);
      assert.equal(await page.getByTestId('harness-avail-day-3').count(), 0);

      // Add 3 windows on Monday without overwriting earlier ones: 08:00-12:00, 14:00-16:00, 16:30-17:30
      await page.getByTestId('harness-avail-add-day-1').click();
      await page.getByTestId('harness-avail-start-0').fill('08:00');
      await page.getByTestId('harness-avail-end-0').fill('12:00');

      await page.getByTestId('harness-avail-add-day-1').click();
      await page.getByTestId('harness-avail-start-1').fill('11:00');
      await page.getByTestId('harness-avail-end-1').fill('14:00');
      await page.getByText(/sobrepost/i).first().waitFor();

      await page.getByTestId('harness-avail-start-1').fill('14:00');
      await page.getByTestId('harness-avail-end-1').fill('16:00');

      await page.getByTestId('harness-avail-add-day-1').click();
      await page.getByTestId('harness-avail-start-2').fill('16:30');
      await page.getByTestId('harness-avail-end-2').fill('17:30');
      assert.equal(await page.getByTestId('harness-avail-start-0').inputValue(), '08:00');
      assert.equal(await page.getByTestId('harness-avail-start-1').inputValue(), '14:00');
      assert.equal(await page.getByTestId('harness-avail-start-2').inputValue(), '16:30');

      // Select Terça & Quinta -> shows Seg, Ter, Qui (and hides Qua, Sex, Sáb, Dom)
      await page.getByTestId('harness-avail-toggle-day-2').click();
      await page.getByTestId('harness-avail-toggle-day-4').click();
      await page.getByTestId('harness-avail-day-2').waitFor();
      await page.getByTestId('harness-avail-day-4').waitFor();
      assert.equal(await page.getByTestId('harness-avail-day-3').count(), 0);

      // Toggle Friday on & enter out-of-scale hours 13:00-15:00 -> inline error
      await page.getByTestId('harness-avail-toggle-day-5').click();
      await page.getByTestId('harness-avail-add-day-5').click();
      await page.getByTestId('harness-avail-start-3').fill('13:00');
      await page.getByTestId('harness-avail-end-3').fill('15:00');
      await page.getByText('Este horário está fora da escala de trabalho do profissional.').waitFor();

      // Remove invalid window & uncheck Friday
      await page.getByTestId('harness-avail-remove-3').click();
      await page.getByTestId('harness-avail-toggle-day-5').click();
      assert.equal(await page.getByTestId('harness-avail-day-5').count(), 0);

      // Switch Option B -> Option A -> Option B preserves Seg ranges!
      await page.getByTestId('harness-avail-mode-professional').click();
      assert.equal(await page.getByTestId('harness-avail-custom-area').count(), 0);
      await page.getByTestId('harness-avail-mode-custom').click();
      assert.equal(await page.getByTestId('harness-avail-start-0').inputValue(), '08:00');
      assert.equal(await page.getByTestId('harness-avail-end-2').inputValue(), '17:30');

      // Mobile & desktop zero horizontal overflow
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, `Horizontal overflow detected at width ${width}`);

      // Group mode hides entire Disponibilidade section
      await page.getByRole('button', { name: 'Tipo Coletiva', exact: true }).click();
      assert.equal(await page.getByTestId('harness-avail-section').count(), 0);

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
