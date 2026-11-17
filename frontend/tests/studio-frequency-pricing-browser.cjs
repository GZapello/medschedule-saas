const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs'), http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'zemda-frequency-ui-'));
const backendCalc = require('../../backend/dist/utils/studio-pricing').calculateStudioRecurringPrice;
(async () => {
  await build({ entryPoints: [path.join(__dirname, 'studio-frequency-pricing.tsx')], bundle: true, outfile: path.join(out, 'test.js'), format: 'iife', jsx: 'automatic', define: { 'import.meta.env': '{}' } });
  const fixtureSchedules = [8,10,14].map((hour,i)=>({id:`cs-${i}`,day_of_week:1,start_time:`${String(hour).padStart(2,'0')}:00`,end_time:`${hour+1}:00`,professional_id:'prof-1',professional_name:'Ana',active:1,modality:'presential',capacity:20}));
  let editFixture = fs.readFileSync(path.join(__dirname,'studio-service-presentation.tsx'),'utf8')
    .replace("service_kind: 'individual'", `service_kind: 'group', class_schedules: ${JSON.stringify(fixtureSchedules)}, frequency_pricing: {version:1,enabled:true,unit:'per_period',tables:{monthly:{1:18000,2:32000,3:45000}}}`)
    .replace('schedules: [], weeklySummary: []', `schedules: ${JSON.stringify(fixtureSchedules)}, weeklySummary: []`);
  await build({stdin:{contents:editFixture,resolveDir:__dirname,loader:'tsx'},bundle:true,outfile:path.join(out,'edit.js'),format:'iife',jsx:'automatic',define:{'import.meta.env':'{}'}});
  const css = fs.readdirSync(path.join(root, 'dist/assets')).find(f => /^index-.*\.css$/.test(f));
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(path.join(root, 'dist/assets', css), 'utf8')}${req.url.startsWith('/edit') ? fs.readFileSync(path.join(out, 'edit.css'), 'utf8') : ''}</style><div id="root"></div><script>${fs.readFileSync(path.join(out, req.url.startsWith('/edit') ? 'edit.js' : 'test.js'), 'utf8')}</script>`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const button = page.getByRole('button', { name: 'Personalizar preços por frequência', exact: true });
      assert.equal(await button.count(), 0);
      await page.getByLabel('Encontros', { exact: true }).fill('0');
      await page.getByText('Configure os dias e horários das aulas para habilitar preços personalizados por frequência.', { exact: true }).waitFor();
      assert.equal(await button.count(), 0);
      for (const count of [2, 3, 5]) {
        await page.getByLabel('Encontros', { exact: true }).fill(String(count));
        if (await button.getAttribute('aria-expanded') === 'false') await button.click();
        assert.equal(await page.getByLabel(/x por semana — valor/).count(), count);
      }
      await page.getByLabel('Encontros', { exact: true }).fill('9');
      assert.equal(await page.getByLabel(/x por semana — valor/).count(), 5);
      await page.getByLabel('Selecionar frequência adicional').selectOption('9');
      await page.getByRole('button', { name: /Adicionar frequência \(9x\)/ }).click();
      assert.equal(await page.getByLabel(/x por semana — valor/).count(), 6);
      await page.getByRole('checkbox', { name: 'Ativar preços por frequência' }).check();
      await page.getByLabel(/^2x por semana —/).fill('320.55');
      await page.getByLabel(/^2x por semana —/).blur();
      assert.equal(await page.evaluate(() => window.config.tables.monthly[2]), 32055);
      await page.getByLabel(/^9x por semana —/).fill('999');
      await page.getByLabel(/^9x por semana —/).blur();
      await page.getByLabel('Encontros', { exact: true }).fill('2');
      await page.getByText(/Há preços salvos para frequências acima/).waitFor();
      assert.equal(await page.evaluate(() => window.config.tables.monthly[9]), 99900);
      await page.getByRole('button', { name: 'Recolher cobrança' }).click();
      await page.getByRole('button', { name: 'Recolher cobrança' }).click();
      assert.equal(await page.getByLabel(/^2x por semana —/).inputValue(), '320,55');
      await page.getByRole('checkbox', { name: 'Ativar preços por frequência' }).uncheck();
      assert.equal(await page.evaluate(() => window.config.tables.monthly[2]), 32055);
      await page.getByRole('checkbox', { name: 'Ativar preços por frequência' }).check();
      await page.getByLabel('Modalidade do preço personalizado').selectOption('per_session');
      await page.getByLabel(/^2x por semana —/).fill('17');
      await page.getByLabel(/^2x por semana —/).blur();
      assert.equal(await page.evaluate(() => window.config.tables.per_session[2]), 1700);
      await page.getByLabel('Modalidade do preço personalizado').selectOption('per_period');
      assert.equal(await page.getByLabel(/^2x por semana —/).inputValue(), '320,55');
      await page.getByRole('button', { name: /Anual \(12 meses\)/ }).click();
      assert.equal(await page.getByLabel(/^2x por semana —/).inputValue(), '');
      await page.getByRole('button', { name: /Mensal \(1 mês\)/ }).click();
      assert.equal(await page.getByLabel(/^2x por semana —/).inputValue(), '320,55');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(out, `panel-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Alternar perfil' }).click();
      assert.equal(await button.count(), 0);
      assert.equal(await page.evaluate(() => window.meetingsCount), 3);
      for (const billingMode of ['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'biennial']) {
        for (const unit of ['per_period', 'per_session']) for (const pricingRule of ['four_weeks', 'annual_average', 'scheduled_sessions']) {
          const input = { serviceName: 'Teste', sessionPrice: 80, weeklySessionsCount: 9, billingMode, pricingRule, scheduledSessionsCount: 40, frequencyPricing: { version: 1, enabled: true, unit, tables: { [unit === 'per_session' ? unit : billingMode]: { 9: 1755 } } } };
          assert.deepEqual(await page.evaluate(input => window.calculatePrice(input), input), backendCalc(input));
        }
      }
      console.log(`PASS ${width}px: grade 0/1/2/3/5/9 progressiva, valores BRL, unidades, ativação, persistência, períodos, perfis e paridade`);
      await page.goto(`http://127.0.0.1:${server.address().port}?view=public`);
      // The actual public flow is exercised with its explicit choice (Aula avulsa vs Plano de aulas).
      await page.screenshot({ path: path.join(out, `public-initial-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: /^Agendar uma aula/ }).click();
      await page.getByRole('button', { name: /Pilates/ }).click();
      await page.getByRole('button', { name: /Plano de aulas/ }).click();
      assert.equal(await page.getByRole('checkbox', { name: /Repetir este horário/ }).count(), 0);
      await page.getByText('1. Escolha os encontros semanais', { exact: true }).waitFor();
      await page.getByRole('checkbox', { name: /Seg · 08:00/ }).check();
      await page.getByRole('checkbox', { name: /Seg · 10:00/ }).check();
      await page.getByText(/2x por semana · R.*320,00/).waitFor();
      await page.waitForFunction(() => window.posts.some(p => p.body.recurrence?.scheduleEntries?.length === 2));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(out, `public-plan-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Continuar', exact: true }).click();
      await page.getByText(/320,00.*período mensal/).waitFor();
      console.log(`PASS ${width}px: seleção pública direta 2x sem checkbox técnico, preview e resumo R$ 320,00`);
      await page.goto(`http://127.0.0.1:${server.address().port}/edit`);
      await page.getByTitle('Editar Serviço',{exact:true}).click();
      await page.locator('[data-studio-section="billing"] h4 > button').click();
      assert.equal(await page.getByLabel(/^2x por semana —/).inputValue(),'320,00');
      await page.getByLabel(/^2x por semana —/).fill('350.55');
      await page.getByLabel(/^2x por semana —/).blur();
      await page.locator('[data-studio-section="billing"] h4 > button').click();
      await page.locator('[data-studio-section="billing"] h4 > button').click();
      assert.equal(await page.getByLabel(/^2x por semana —/).inputValue(),'350,55');
      await page.getByRole('button',{name:'Salvar Alterações',exact:true}).click();
      await page.waitForFunction(()=>window.__writes.length===1);
      assert.equal(await page.evaluate(()=>window.__writes[0].payload.frequencyPricing.tables.monthly[2]),35055);
      console.log(`PASS ${width}px: edição no accordion e payload em centavos`);
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log('PASS browser checks. Screenshots:', out);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
