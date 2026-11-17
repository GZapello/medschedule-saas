const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'zemda-cons-rec-ui-'));

(async () => {
  await build({
    entryPoints: [path.join(__dirname, 'studio-consumption-recurrence-browser.tsx')],
    bundle: true,
    outfile: path.join(out, 'bundle.js'),
    format: 'iife',
    jsx: 'automatic',
    define: { 'import.meta.env': '{}' }
  });

  const css = fs.readdirSync(path.join(root, 'dist/assets')).find(f => /^index-.*\.css$/.test(f));
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(path.join(root, 'dist/assets', css), 'utf8')}</style><div id="root"></div><script>${fs.readFileSync(path.join(out, 'bundle.js'), 'utf8')}</script>`;

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const browser = await chromium.launch({ headless: true });
  const errors = [];

  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on('pageerror', err => errors.push(err.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);

      // 1. ServiceRecurrenceConfigPanel for Group class: no duplicate weekday picker, displays Seg/Qua/Sex derived summary
      await page.getByTestId('group-derived-weekdays-summary').waitFor();
      assert.equal(await page.getByText('Dias específicos da semana oferecidos').count(), 0);
      assert.equal(await page.getByTestId('group-derived-weekdays-summary').getByText('Seg').count(), 1);
      assert.equal(await page.getByTestId('group-derived-weekdays-summary').getByText('Qua').count(), 1);
      assert.equal(await page.getByTestId('group-derived-weekdays-summary').getByText('Sex').count(), 1);

      // Toggle to individual -> custom_weekdays available when toggled
      await page.getByRole('button', { name: /Alternar Tipo Aula/ }).click();
      await page.getByLabel('Dias específicos da semana').check();
      await page.getByText('Dias específicos da semana oferecidos').waitFor();
      await page.getByRole('button', { name: /Alternar Tipo Aula/ }).click();

      // 2. Clinic Admin scenario: Consumo dos Alunos tab MUST NOT be shown on pure clinic profile
      await page.evaluate(() => window.__setScenario('clinic_admin'));
      await page.locator('[data-scenario="clinic_admin"]').waitFor();
      await page.getByRole('button', { name: 'Lançamentos & Recebimentos' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Consumo dos Alunos' }).count(), 0);

      // 3. Studio Admin scenario: all 4 tabs appear
      await page.evaluate(() => window.__setScenario('studio_admin'));
      await page.locator('[data-scenario="studio_admin"]').waitFor();
      await page.getByRole('button', { name: 'Consumo dos Alunos' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Lançamentos & Recebimentos' }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Contas a Pagar & Despesas' }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Controle de Caixa' }).count(), 1);

      // 4. Studio Employee with ONLY create_student_consumption: ONLY Consumo dos Alunos visible
      await page.evaluate(() => window.__setScenario('studio_staff_only'));
      await page.locator('[data-scenario="studio_staff_only"]').waitFor();
      await page.getByRole('button', { name: 'Consumo dos Alunos' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Lançamentos & Recebimentos' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Exportar CSV' }).count(), 0);

      // Launch Consumption Modal Flow
      await page.getByRole('button', { name: /Lançar Consumo/ }).click();
      const modal = page.locator('.fixed.inset-0');
      await modal.getByPlaceholder('Buscar aluno por nome ou telefone...').fill('João');
      await modal.getByRole('button', { name: /Aluno João Silva/ }).click();

      const prodSelect = modal.locator('select').filter({ hasText: 'Água Mineral 500ml' });
      await prodSelect.selectOption('inv-water');
      await modal.getByText('Disponível: 20 garrafa').waitFor();

      // Set quantity = 2 and verify live R$ 10,00 total & locked price input for staff without manage_financial
      const numberInputs = modal.locator('input[type="number"]');
      await numberInputs.nth(0).fill('2');
      assert.equal(await numberInputs.nth(1).isDisabled(), true);
      await modal.getByText(/R\$\s*10,00/).first().waitFor();

      // Switch to Já Pago & Confirm
      await modal.getByRole('button', { name: /Registrar como já pago/ }).click();
      await modal.getByRole('button', { name: 'Confirmar Consumo' }).click();

      await page.waitForFunction(() => Boolean(window.__postedConsumption));
      const posted = await page.evaluate(() => window.__postedConsumption);
      assert.equal(posted.inventoryItemId, 'inv-water');
      assert.equal(posted.quantity, 2);
      assert.equal(posted.paymentStatus, 'paid');

      // Verify zero horizontal overflow on mobile (390) & desktop (1440)
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        false,
        `Overflow detectado na largura ${width}px`
      );
    }

    assert.deepEqual(errors, []);
    console.log('UI PLAYWRIGHT CHECKS PASSED (390px + 1440px, Recorrência + Consumo dos Alunos + Permissões)');
  } finally {
    await browser.close();
    server.close();
  }
})();
