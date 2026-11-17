const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { build } = require('esbuild'), { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'zemda-public-improvements-'));
(async () => {
  await build({ entryPoints: [path.join(__dirname, 'public-booking-improvements.tsx')], bundle: true, outfile: path.join(out, 'test.js'), jsx: 'automatic', define: { 'import.meta.env': '{}' }, plugins: [{ name: 'auth-fixture', setup(b) {
    b.onLoad({ filter: /AuthContext\.tsx$/ }, () => ({ contents: `const q=new URLSearchParams(location.search);const role=q.get('role')||'admin';const user={id:role==='professional'?'owner':'admin',professionalId:role==='professional'?'prof':undefined};const tenant={id:'tenant',slug:'studio',establishment_profile:'studio'};export const useAuth=()=>({currentUser:user,currentTenant:tenant,isClinicAdmin:role==='admin',isProfessional:role==='professional',isReceptionist:role==='reception',hasPermission:()=>false,refreshTenant:async()=>{}});`, loader: 'tsx' }));
    b.onLoad({ filter: /ToastContext\.tsx$/ }, () => ({ contents: `export const useToast=()=>({showToast:(message)=>window.toast=message});`, loader: 'tsx' }));
  } }] });
  const assets = path.join(root, 'dist/assets'), css = fs.readdirSync(assets).find(f => /^index-.*\.css$/.test(f));
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(path.join(assets, css), 'utf8')}</style><div id="root"></div><script>${fs.readFileSync(path.join(out, 'test.js'), 'utf8')}</script>`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true }); const errors = [];
  try {
    for (const width of [390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.on('pageerror', e => errors.push(e.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); }); page.setDefaultTimeout(10000);
      await page.goto(base + '?view=admin'); await page.getByRole('switch').first().waitFor();
      assert.equal(await page.getByRole('switch').first().getAttribute('aria-checked'), 'false');
      await page.getByRole('switch').first().click();
      const policy = 'Texto personalizado.\n<script>window.executed=true</script>';
      await page.getByLabel('Texto da política').first().fill(policy); await page.getByRole('button', { name: 'Salvar política', exact: true }).first().click();
      await page.waitForFunction(() => window.writes.length === 1); await page.reload();
      assert.equal(await page.getByLabel('Texto da política').first().inputValue(), policy);
      await page.getByRole('switch').first().click(); await page.getByRole('button', { name: 'Salvar política', exact: true }).first().click(); await page.waitForFunction(() => window.writes.length === 1);
      await page.goto(base); await page.getByRole('button', { name: /^Agendar uma aula/ }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Ver política de cancelamento', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: /^Conhecer os pacotes/ }).count(), 0);
      await page.goto(base + '?view=admin'); await page.getByRole('switch').first().click(); assert.equal(await page.getByLabel('Texto da política').first().inputValue(), policy);
      await page.getByRole('button', { name: 'Salvar política', exact: true }).first().click(); await page.waitForFunction(() => window.writes.length === 1);
      await page.goto(base + '?packages=public'); await page.getByRole('button', { name: /^Conhecer os pacotes/ }).waitFor();
      const policyButton = page.getByRole('button', { name: 'Ver política de cancelamento', exact: true }); await policyButton.click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor(); assert.equal(await dialog.locator('script').count(), 0); assert.equal(await page.evaluate(() => window.executed), undefined);
      assert.ok((await dialog.textContent()).includes(policy)); await page.screenshot({ path: path.join(out, `policy-${width}.png`), fullPage: true }); await page.getByRole('button', { name: 'Fechar', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: /^Agendar uma aula/ }).click(); await policyButton.click(); await page.keyboard.press('Escape'); await page.getByRole('button', { name: /Pilates/ }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.goto(base + '?view=admin&role=professional'); await page.getByRole('switch').waitFor(); assert.equal(await page.getByRole('switch').count(), 1);
      await page.getByRole('switch').click(); await page.getByLabel('Texto da política').fill('Política exclusiva da Ana.'); await page.getByRole('button', { name: 'Salvar política', exact: true }).click(); await page.waitForFunction(() => window.writes.length === 1);
      await page.goto(base + '?individual=1'); await page.getByRole('button', { name: 'Ver política de cancelamento', exact: true }).click(); assert.ok((await page.getByRole('dialog').textContent()).includes('Política exclusiva da Ana.')); assert.ok(!(await page.getByRole('dialog').textContent()).includes(policy));

      await page.goto(base + '?view=admin&role=reception'); await page.getByText(/Dicas rápidas/).waitFor(); assert.equal(await page.getByRole('switch').count(), 0);
      for (const [status, title] of [['pending', 'Solicitação enviada!'], ['confirmed', 'Agendamento confirmado!'], ['', 'Solicitação recebida!']]) {
        await page.goto(base + '?status=' + status); await page.getByRole('button', { name: /^Agendar uma aula/ }).click(); await page.getByRole('button', { name: /Pilates/ }).click();
        await page.getByRole('button', { name: /08:00/ }).first().click(); await page.getByRole('button', { name: 'Continuar', exact: true }).click();
        await page.getByRole('button', { name: /Informar meus dados/ }).click();
        await page.getByPlaceholder('Digite seu nome completo').fill('Aluno Teste'); await page.getByPlaceholder('(11) 99999-9999').fill('11988776655');
        await page.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click(); await page.getByRole('heading', { name: title, exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: '6. Finalização', exact: true }).count(), 1);
        if (status !== 'confirmed') assert.equal(await page.getByRole('heading', { name: 'Agendamento confirmado!', exact: true }).count(), 0);
        assert.equal(await page.evaluate(() => window.posts.length), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(out, `result-${status || 'neutral'}-${width}.png`), fullPage: true });
      }
      assert.equal(await page.evaluate(() => window.outcome({ paymentPending: false, appointments: [{ status: 'confirmed' }, { status: 'pending' }] }).confirmed), false);
      assert.equal(await page.evaluate(() => window.outcome({ status: 'scheduled' }).confirmed), false);
      await page.close(); console.log(`PASS ${width}px: política, persistência, permissões, modal seguro, pacotes, seis etapas e três resultados reais`);
    }
    assert.deepEqual(errors, []); console.log('PASS browser console. Screenshots:', out);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
