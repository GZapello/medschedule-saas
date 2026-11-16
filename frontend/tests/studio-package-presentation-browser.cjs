const { chromium } = require('playwright');
const esbuild = require('esbuild');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const out = path.join(os.tmpdir(), 'zemda-studio-package-presentation');
fs.mkdirSync(out, { recursive: true });
const source = path.join(root, 'frontend/src/components/services/PackageModal.tsx');
// Set this revision explicitly to retain the pre-redesign comparison after committing.
const baselineRef = process.env.STUDIO_PACKAGE_BASELINE_REF || 'HEAD';
const baseline = execFileSync('git', ['show', `${baselineRef}:frontend/src/components/services/PackageModal.tsx`], { cwd: root, encoding: 'utf8' });
let browser, server;
const errors = [];
const field = (scope, label, tag = 'input') => scope.locator('label').filter({ hasText: label }).locator(`xpath=ancestor::div[descendant::${tag}][1]`).locator(tag).first();
const section = (page, key) => page.locator(`[data-package-section="${key}"]`);
async function expand(page, key) {
  const button = section(page, key).locator('h4 > button');
  if (await button.count() && await button.getAttribute('aria-expanded') === 'false') await button.click();
}
async function collapse(page, key) {
  const button = section(page, key).locator('h4 > button');
  if (await button.count() && await button.getAttribute('aria-expanded') === 'true') await button.click();
}
async function open(page, version, { profile = 'studio', edit = false, empty = false } = {}) {
  await page.goto(`http://127.0.0.1:${server.address().port}/${version}?profile=${profile}${empty ? '&empty=1' : ''}`);
  await page.getByRole('button', { name: edit ? 'Abrir edição' : 'Abrir criação', exact: true }).click();
  return page.locator('.mobile-modal');
}
const serviceRow = (modal, name) => modal.locator('label').filter({ has: modal.page().getByRole('checkbox', { name: new RegExp(`^${name}`) }) }).locator('..');
async function scenario(page, version, options) {
  const modal = await open(page, version, options);
  await field(modal, 'Nome do Pacote').fill(options.edit ? 'Pacote revisado' : 'Pilates + Dança');
  await field(modal, 'Descrição', 'textarea').fill('Duas modalidades e instrutores diferentes.');
  await field(modal, 'Tipo de Cobrança', 'select').selectOption(options.oneTime ? 'one_time' : 'recurring_monthly');
  if (!options.oneTime) await field(modal, 'Periodicidade do Pacote', 'select').selectOption(options.frequency || 'monthly');
  await field(modal, 'Valor do Pacote').fill('587.35');
  await field(modal, 'Validade da Matrícula').fill('90');
  if (options.oneTime) await field(modal, 'Parcelamento máximo', 'select').selectOption('6');
  else await field(modal, 'Dia padrão de vencimento').fill('18');
  await expand(page, 'distribution');
  await modal.getByRole('button', { name: /^Limite por Modalidade/ }).click();
  await expand(page, 'services');
  await modal.getByRole('checkbox', { name: /^Pilates/ }).check();
  await modal.getByRole('checkbox', { name: /^Dança/ }).check();
  await field(serviceRow(modal, 'Pilates'), 'Qtd. aulas').fill('7');
  await field(serviceRow(modal, 'Pilates'), 'Por semana').fill('2');
  await field(serviceRow(modal, 'Dança'), 'Qtd. aulas').fill('5');
  await field(serviceRow(modal, 'Dança'), 'Por semana').fill('1');
  await modal.getByRole('checkbox', { name: /^Dança/ }).uncheck();
  await modal.getByRole('checkbox', { name: /^Dança/ }).check();
  assert.equal(await field(serviceRow(modal, 'Dança'), 'Qtd. aulas').inputValue(), '5');
  if (options.pool) {
    await modal.getByRole('button', { name: /^Pacote Livre/ }).click();
    await field(modal, 'Total de aulas no período').fill('16');
    await field(modal, 'Limite semanal global').fill('3');
  }
  await expand(page, 'complementary');
  await field(modal, 'Em caso de falta', 'select').selectOption('refund');
  await field(modal, 'Antecedência de cancelamento').fill('24');
  await modal.getByRole('checkbox', { name: 'Disponibilizar no agendamento público do Studio', exact: true }).uncheck();
  await modal.getByRole('checkbox', { name: 'Pacote ativo no catálogo', exact: true }).check();
  if (version === 'after') {
    const mounted = await modal.locator('input, select, textarea').evaluateAll(nodes => { window.__controlNodes = nodes; return nodes.length; });
    for (const key of ['basics', 'values', 'distribution', 'services', 'complementary']) await collapse(page, key);
    assert.equal(await modal.locator('input, select, textarea').count(), mounted);
    assert.equal(await modal.locator('input, select, textarea').evaluateAll(nodes => nodes.every((node, index) => node === window.__controlNodes[index])), true);
    const summary = await page.getByRole('complementary', { name: 'Resumo do pacote' }).innerText();
    assert.match(summary, /R\$\s587,35/);
    assert.ok(summary.includes(options.pool ? '16 aulas' : '12 aulas'));
    assert.ok(summary.includes('Pilates') && summary.includes('Dança'));
  }
  await modal.locator('button[type="submit"]').click();
  await page.waitForFunction(() => window.__saved === 1);
  return page.evaluate(() => ({ writes: window.__writes, reads: window.__reads, closed: window.__closed, saved: window.__saved }));
}
async function validateHiddenField(page, key, input, invalid, corrected) {
  await expand(page, key);
  await input.fill(invalid);
  await collapse(page, key);
  await page.locator('.mobile-modal button[type="submit"]').click();
  assert.equal(await section(page, key).locator('h4 > button').getAttribute('aria-expanded'), 'true');
  assert.equal(await input.evaluate(el => document.activeElement === el), true);
  assert.equal(await page.evaluate(() => window.__writes.length), 0);
  await input.fill(corrected);
}
(async () => {
  // Prove that the redesign did not edit initialization, calculations or save logic.
  const current = fs.readFileSync(source, 'utf8');
  const business = original => { const text = original.replace(/\r/g, '');return text.slice(text.indexOf('  const [saving,'), text.indexOf('  return (\n    <div className="fixed inset-0')); };
  assert.equal(business(current).replace(/\r/g, ''), business(baseline).replace(/\r/g, ''));
  for (const version of ['before', 'after']) await esbuild.build({
    entryPoints: [path.join(__dirname, 'studio-package-presentation.tsx')], bundle: true, format: 'iife', platform: 'browser',
    outfile: path.join(out, `${version}.js`), define: { 'import.meta.env': '{}' }, jsx: 'automatic',
    plugins: version === 'before' ? [{ name: 'baseline', setup(build) {
      build.onLoad({ filter: /[\\/]services[\\/]PackageModal\.tsx$/ }, () => ({ contents: baseline, loader: 'tsx', resolveDir: path.dirname(source) }));
    } }] : []
  });
  const assets = path.join(root, 'frontend/dist/assets');
  const css = fs.readdirSync(assets).find(file => /^index-.*\.css$/.test(file));
  server = http.createServer((req, res) => {
    const version = req.url.startsWith('/before') ? 'before' : 'after';
    const localCss = path.join(out, `${version}.css`);
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${fs.readFileSync(path.join(assets, css), 'utf8')}\n${fs.existsSync(localCss) ? fs.readFileSync(localCss, 'utf8') : ''}</style></head><body><div id="root"></div><script>${fs.readFileSync(path.join(out, `${version}.js`), 'utf8')}</script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /not focusable|flushSync/i.test(message.text())) errors.push(message.text()); });
  for (const options of [
    { edit: false, pool: false, frequency: 'monthly' },
    { edit: true, pool: true, frequency: 'quarterly' },
    { edit: false, pool: true, frequency: 'semiannual' },
    { edit: true, pool: false, frequency: 'annual' },
    { edit: false, pool: true, oneTime: true },
    { edit: true, pool: false, oneTime: true }
  ]) {
    const before = await scenario(page, 'before', options);
    const after = await scenario(page, 'after', options);
    assert.deepEqual(after, before);
  }
  console.log('PASS same create/edit payloads, API calls and callbacks for all 4 periods, one-time installments and both credit modes');
  let modal = await open(page, 'after');
  assert.deepEqual(await page.locator('[data-package-section] h4 > button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-expanded'))), ['true', 'true', 'false', 'false', 'false']);
  await page.screenshot({ path: path.join(out, 'desktop.png') });
  await validateHiddenField(page, 'basics', page.getByLabel('Nome do pacote', { exact: true }), '', 'Teste');
  await page.getByLabel('Nome do pacote', { exact: true }).fill('   ');
  await collapse(page, 'basics');
  await modal.locator('button[type="submit"]').click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-package-field') === 'name');
  assert.equal(await page.getByText('Informe o nome do pacote.', { exact: true }).isVisible(), true);
  await page.getByLabel('Nome do pacote', { exact: true }).fill('Teste de validação');
  await validateHiddenField(page, 'values', page.getByLabel('Valor do pacote', { exact: true }), '-1', '180');
  await modal.locator('button[type="submit"]').click();
  assert.equal(await section(page, 'services').locator('h4 > button').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.getByText('Selecione ao menos um serviço incluído no pacote.', { exact: true }).isVisible(), true);
  await modal.getByRole('checkbox', { name: /^Pilates/ }).check();
  await validateHiddenField(page, 'services', page.getByLabel('Quantidade de aulas de Pilates'), '501', '4');
  await expand(page, 'distribution');
  await modal.getByRole('button', { name: /^Pacote Livre/ }).click();
  await validateHiddenField(page, 'distribution', page.getByLabel('Total de aulas no período'), '1001', '12');
  await validateHiddenField(page, 'complementary', page.getByLabel('Antecedência de cancelamento'), '169', '12');
  assert.equal(await page.evaluate(() => window.__writes.length), 0);
  console.log('PASS native and custom validation reveal collapsed sections and focus invalid fields without saving');
  const toggle = section(page, 'distribution').locator('h4 > button');
  await collapse(page, 'distribution');await toggle.focus();await page.keyboard.press('Enter');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Space');assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await modal.getByRole('button', { name: 'Fechar', exact: true }).focus();await page.keyboard.press('Shift+Tab');
  assert.equal(await modal.locator('button[type="submit"]').evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Tab');assert.equal(await modal.getByRole('button', { name: 'Fechar', exact: true }).evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('.mobile-modal').count(), 0);
  for (const action of ['Cancelar', 'Fechar']) { modal = await open(page, 'after');await modal.getByRole('button', { name: action, exact: true }).click();assert.equal(await page.evaluate(() => window.__closed), 1);assert.equal(await page.evaluate(() => window.__saved), 0); }
  console.log('PASS keyboard navigation, independent sections, close/cancel and initial state');
  for (const profile of ['clinic', 'mixed', 'solo']) {
    for (const edit of [false, true]) {
      const snapshots = [];
      for (const version of ['before', 'after']) {
        const legacy = await open(page, version, { profile, edit });
        assert.equal(await page.locator('[data-package-section]').count(), 0);
        snapshots.push(await legacy.locator('input,select,textarea,button').evaluateAll(nodes => nodes.map(node => ({ tag: node.tagName, text: node.textContent, value: node.value, checked: node.checked, disabled: node.disabled, min: node.min, max: node.max, required: node.required, className: node.className }))));
      }
      assert.deepEqual(snapshots[1], snapshots[0]);
    }
  }
  console.log('PASS original create/edit controls and styles for clinic, mixed and solo');
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });modal = await open(page, 'after');
    await page.screenshot({ path: path.join(out, `initial-${width}.png`) });
    for (const key of ['distribution', 'services', 'complementary']) await expand(page, key);
    await modal.getByRole('checkbox', { name: /^Pilates/ }).check();
    await modal.getByRole('checkbox', { name: /^Treinamento individual/ }).check();
    const overflow = await modal.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, dialog: el.firstElementChild.clientWidth, dialogScroll: el.firstElementChild.scrollWidth }));
    assert.ok(overflow.scroll <= overflow.width + 1 && overflow.dialogScroll <= overflow.dialog + 1, JSON.stringify({ width, overflow }));
    const save = await modal.locator('button[type="submit"]').boundingBox();assert.ok(save && save.y >= 0 && save.y + save.height <= 844, JSON.stringify({ width, save }));
    await page.screenshot({ path: path.join(out, `expanded-${width}.png`) });
    if (width < 1024) { await modal.locator('summary').click();assert.equal(await modal.locator('details').getAttribute('open'), ''); }
  }
  await page.setViewportSize({ width: 390, height: 430 });
  await page.waitForFunction(() => { const button = document.querySelector('.studio-package-footer button[type="submit"]')?.getBoundingClientRect();return button && button.bottom <= 430; });
  await page.screenshot({ path: path.join(out, 'short-viewport.png') });
  modal = await open(page, 'after', { empty: true });await expand(page, 'services');
  assert.equal(await modal.getByText('Cadastre serviços individuais ou turmas antes de montar um pacote.', { exact: true }).isVisible(), true);
  console.log('PASS desktop/tablet/mobile, fixed footer, collapsed mobile summary and empty catalogue');
  assert.deepEqual(errors, []);
  console.log('PASS no browser errors or hidden invalid controls; business logic unchanged byte-for-byte');
})().catch(error => { console.error(error);process.exitCode = 1; }).finally(async () => { await browser?.close();server?.close(); });
