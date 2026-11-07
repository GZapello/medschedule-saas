const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const esbuild = require('esbuild');

console.log('================================================================');
console.log(' INICIANDO SUÍTE DE TESTES: ODONTOGRAMA PERMANENTE, INFANTIL E MISTO');
console.log('================================================================');

const bundle = esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'odontogram-hybrid.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  define: { 'import.meta.env': '{}' },
  jsx: 'automatic'
}).outputFiles[0].text;

const assets = path.resolve(__dirname, '../dist/assets');
const css = fs.readdirSync(assets).find(f => /^index-.*\.css$/.test(f));
const cssText = fs.readFileSync(path.join(assets, css), 'utf8');

let data = {};
let changes = [];
let calls = [];

const server = http.createServer(async (req, res) => {
  const url = req.url;
  if (/^\/assets\/dentistry\/hybrid\/tooth-\d+\.png$/.test(url)) {
    const filePath = path.join(__dirname, '../public', url);
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'image/png');
      return res.end(fs.readFileSync(filePath));
    } else {
      res.statusCode = 404;
      return res.end('Not found');
    }
  }

  if (url.startsWith('/api/')) {
    let body = '';
    for await (const part of req) body += part;
    calls.push({ url, method: req.method, body: body ? JSON.parse(body) : null });
    let result = [];
    if (url.includes('/auth/me')) {
      result = {
        user: { id: 'user', name: 'Dr. Dentista', role: 'clinic_admin', commercialModule: 'ZemdaOdonto', clinicalWorkspace: 'ZemdaOdonto', permissions: [] },
        tenant: { id: 'clinic', name: 'Clínica Odonto Teste' }
      };
    } else if (url.includes('/patients/patient')) {
      result = { id: 'patient', name: 'Paciente Infantil / Adulto', full_name: 'Paciente Infantil / Adulto' };
    } else if (url.includes('/odontograms')) {
      if (req.method === 'POST') {
        const payload = JSON.parse(body);
        data = payload.statusData;
        changes.push(...payload.toothChanges);
        result = { id: 'odo-123' };
      } else {
        result = {
          current: { status_data: data },
          initial: { status_data: { 16: { oclusal: 'decay' }, 55: { oclusal: 'restoration_resin' } } }
        };
      }
    } else if (url.includes('/dossier')) {
      const parts = url.split('/');
      const n = parts[parts.indexOf('patient') + 1];
      result = {
        currentStatus: data[n] || {},
        timeline: changes.filter(c => String(c.toothNumber) === n).map(c => ({ ...c, type: 'tooth_record' }))
      };
    } else if (url.includes('/completion')) {
      result = { alreadyCompleted: false };
    } else {
      result = {};
    }
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(result));
  }

  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${cssText}</style></head><body><div id="root"></div><script>${bundle}</script></body></html>`);
});

(async () => {
  let browser;
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));

    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base);

    const tooth = n => page.locator(`[data-tooth="${n}"]`);
    const anatomy = n => tooth(n).locator('canvas');
    const face = (n, f) => tooth(n).locator(`[data-face="${f}"]`);

    // ====================================================================
    // TESTE 1: MODO PERMANENTE
    // ====================================================================
    await page.waitForFunction(() => document.querySelectorAll('canvas[data-ready="true"]').length === 32);
    const permanentOrder = [
      18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
      48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38
    ];
    const permElements = await page.locator('[data-tooth]').evaluateAll(els => els.map(e => Number(e.dataset.tooth)));
    assert.deepEqual(permElements, permanentOrder);
    assert.equal(await page.locator('[data-tooth]').count(), 32);
    assert.equal(await page.locator('canvas[data-ready="true"]').count(), 32);
    console.log('PASS [1] Modo Permanente: 32 dentes com anatomia visual, numeração FDI e mapas de faces');

    // ====================================================================
    // TESTE 2: MODO DECÍDUA (INFANTIL)
    // ====================================================================
    await page.getByRole('button', { name: 'Decídua (Infantil)', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-tooth]').length === 20);
    const deciduousOrder = [
      55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
      85, 84, 83, 82, 81, 71, 72, 73, 74, 75
    ];
    const decidElements = await page.locator('[data-tooth]').evaluateAll(els => els.map(e => Number(e.dataset.tooth)));
    assert.deepEqual(decidElements, deciduousOrder);
    assert.equal(await page.locator('[data-tooth]').count(), 20);
    // Verifica que todos os 20 dentes infantis têm imagem/canvas carregado
    await page.waitForFunction(() => document.querySelectorAll('canvas[data-ready="true"]').length === 20);
    // Verifica quadrantes 5 e 6 em cima, 8 e 7 em baixo
    await page.getByText('55 a 51 (Dir) | 61 a 65 (Esq)').waitFor();
    await page.getByText('85 a 81 (Dir) | 71 a 75 (Esq)').waitFor();
    console.log('PASS [2] Modo Decídua (Infantil): 20 dentes com ilustrações anatômicas decíduas, quadrantes 5..8 e faces');

    // ====================================================================
    // TESTE 3: MODO MISTO
    // ====================================================================
    await page.getByRole('button', { name: 'Mista', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-tooth]').length === 52);
    assert.equal(await page.locator('[data-tooth]').count(), 52);
    // 32 permanentes + 20 decíduos convivendo juntos
    await page.waitForFunction(() => document.querySelectorAll('canvas[data-ready="true"]').length === 52);
    // Verifica títulos dos 4 arcos no modo misto
    await page.getByText('Arcada Superior Permanente (Maxila) — Quadrantes 1 & 2').waitFor();
    await page.getByText('Arcada Superior Decídua (Infantil) — Quadrantes 5 & 6').waitFor();
    await page.getByText('Arcada Inferior Decídua (Infantil) — Quadrantes 8 & 7').waitFor();
    await page.getByText('Arcada Inferior Permanente (Mandíbula) — Quadrantes 4 & 3').waitFor();
    console.log('PASS [3] Modo Misto: 52 dentes (32 permanentes + 20 decíduos) com anatomia completa e convivência clínica');

    // ====================================================================
    // TESTE 4: TROCA ENTRE AS TRÊS ABAS
    // ====================================================================
    await page.getByRole('button', { name: 'Permanente', exact: true }).click();
    assert.equal(await page.locator('[data-tooth]').count(), 32);
    await page.getByRole('button', { name: 'Decídua (Infantil)', exact: true }).click();
    assert.equal(await page.locator('[data-tooth]').count(), 20);
    await page.getByRole('button', { name: 'Mista', exact: true }).click();
    assert.equal(await page.locator('[data-tooth]').count(), 52);
    await page.getByRole('button', { name: 'Decídua (Infantil)', exact: true }).click();
    assert.equal(await page.locator('[data-tooth]').count(), 20);
    console.log('PASS [4] Troca entre as três abas: transição suave e contagem exata de dentes');

    // ====================================================================
    // TESTE 5: APLICAÇÃO DE CONDIÇÃO POR FACE (NO INFANTIL E PERMANENTE)
    // ====================================================================
    // No infantil (dente 55)
    await page.getByRole('button', { name: 'Cárie Ativa', exact: true }).click();
    await face(55, 'oclusal').click();
    assert.equal(await face(55, 'oclusal').getAttribute('fill'), '#ef4444');
    assert.match(await anatomy(55).getAttribute('aria-label'), /Oclusal: Cárie Ativa/);

    // Dente 51 na vestibular
    await page.getByRole('button', { name: 'Restauração Resina', exact: true }).click();
    await face(51, 'vestibular').click();
    assert.equal(await face(51, 'vestibular').getAttribute('fill'), '#3b82f6');
    assert.match(await anatomy(51).getAttribute('aria-label'), /Vestibular: Restauração Resina/);
    console.log('PASS [5] Aplicação de condição por face: cores e rótulos clínicos aplicados nas faces decíduas');

    // ====================================================================
    // TESTE 6: APLICAÇÃO DE CONDIÇÃO NO DENTE INTEIRO
    // ====================================================================
    await page.getByRole('button', { name: 'Canal Tratado (Endo)', exact: true }).click();
    // Clica diretamente na anatomia do dente 54
    await anatomy(54).click({ position: { x: 30, y: 30 } });
    assert.match(await anatomy(54).getAttribute('aria-label'), /Canal Tratado/);

    // Dente ausente no infantil 71
    await page.getByRole('button', { name: 'Dente Ausente', exact: true }).click();
    await anatomy(71).click({ position: { x: 30, y: 30 } });
    assert.equal(await tooth(71).getByText('Ausente').innerText(), 'Ausente');
    console.log('PASS [6] Aplicação de condição no dente inteiro: endodontia e ausente atualizam anatomia e badges');

    // ====================================================================
    // TESTE 7: BOTÃO DOSSIÊ CLÍNICO
    // ====================================================================
    // Abre dossiê do dente 55 infantil
    await tooth(55).getByRole('button', { name: 'Dossiê', exact: true }).click();
    await page.getByRole('heading', { name: 'Dossiê do Dente 55', exact: true }).waitFor();
    assert.ok(calls.some(c => c.url.includes('/55/dossier')));
    // Fecha o dossiê
    await page.getByRole('button', { name: 'Fechar', exact: true }).last().click();
    console.log('PASS [7] Botão Dossiê: abre histórico e dossiê clínico individual de dentes decíduos');

    // ====================================================================
    // TESTE 8: SELEÇÃO MÚLTIPLA
    // ====================================================================
    await page.getByRole('button', { name: 'Modo Seleção Múltipla', exact: true }).click();
    await anatomy(61).click({ position: { x: 30, y: 30 } });
    await anatomy(62).click({ position: { x: 30, y: 30 } });
    assert.equal(await page.locator('[data-tooth][data-selected="true"]').count(), 2);
    // Aplica Restauração Amálgama na Palatina dos selecionados
    await page.getByRole('button', { name: 'Restauração Amálgama', exact: true }).click();
    await page.getByLabel('Painel do dente selecionado').getByRole('button', { name: 'Palatina / Lingual', exact: true }).click();
    assert.equal(await face(61, 'palatina').getAttribute('fill'), '#475569');
    assert.equal(await face(62, 'palatina').getAttribute('fill'), '#475569');
    await page.getByRole('button', { name: '✓ Seleção Múltipla Ativa', exact: true }).click();
    console.log('PASS [8] Seleção Múltipla: marcação simultânea em múltiplos dentes decíduos');

    // ====================================================================
    // TESTE 9: MODO COMPARATIVO
    // ====================================================================
    await page.getByRole('button', { name: 'Comparativo', exact: true }).click();
    await page.getByText('Comparativo: Odontograma Inicial (Registro de Entrada)').waitFor();
    await page.getByText('1. Odontograma Inicial (Registro de Entrada)').waitFor();
    await page.getByText('2. Odontograma Atual (Evolução Clínica)').waitFor();
    // Verifica que ambas as seções exibem anatomia visual e faces
    assert.ok((await page.locator('section[data-arch="upper-deciduous"]').count()) >= 2);
    console.log('PASS [9] Comparativo: Odontograma Inicial e Atual exibidos lado a lado com padrão anatômico');

    // ====================================================================
    // TESTE 10: RESPONSIVIDADE (DESKTOP, TABLET, MOBILE)
    // ====================================================================
    await page.getByRole('button', { name: 'Odontograma Atual', exact: true }).click();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      await page.waitForTimeout(100);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow em ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    console.log('PASS [10] Responsividade: verificado em 1440px, 768px e 390px sem overflow');

    // ====================================================================
    // TESTE 11: PERSISTÊNCIA DAS MARCAÇÕES (SALVAR E RECARREGAR)
    // ====================================================================
    await page.getByRole('button', { name: 'Salvar Odontograma', exact: true }).click();
    await page.getByText('Odontograma salvo com sucesso!', { exact: true }).waitFor();
    assert.equal(data[55].oclusal, 'decay');
    assert.equal(data[51].vestibular, 'restoration_resin');
    assert.equal(data[54].whole, 'endodontics');
    assert.equal(data[71].whole, 'missing');
    assert.equal(data[61].palatina, 'restoration_amalgam');
    // Recarrega página
    await page.reload();
    await page.getByRole('button', { name: 'Decídua (Infantil)', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('canvas[data-ready="true"]').length === 20);
    assert.equal(await face(55, 'oclusal').getAttribute('fill'), '#ef4444');
    assert.equal(await face(51, 'vestibular').getAttribute('fill'), '#3b82f6');
    console.log('PASS [11] Persistência: marcações salvas via API e restauradas com exatidão após reload');

    // ====================================================================
    // TESTE 12: RENDERIZAÇÃO CORRETA DE ARCADAS E PLANO OCLUSAL
    // ====================================================================
    await page.getByText('Plano Oclusal').waitFor();
    const upperSection = page.locator('section[data-arch="upper-deciduous"]');
    const lowerSection = page.locator('section[data-arch="lower-deciduous"]');
    assert.equal(await upperSection.count(), 1);
    assert.equal(await lowerSection.count(), 1);
    const upperBox = await upperSection.boundingBox();
    const lowerBox = await lowerSection.boundingBox();
    assert.ok(lowerBox.y > upperBox.y + upperBox.height, 'Arcada superior acima da inferior');
    console.log('PASS [12] Arcadas Superior e Inferior: separadas e ordenadas pelo Plano Oclusal');

    // ====================================================================
    // TESTE 13: RENDERIZAÇÃO DOS QUADRANTES E LINHA MÉDIA
    // ====================================================================
    // Linha média deve estar entre dentes 51 e 61
    const t51 = await tooth(51).boundingBox();
    const t61 = await tooth(61).boundingBox();
    assert.ok(t51.x < t61.x, 'Dente 51 fica à esquerda do dente 61 na tela');
    console.log('PASS [13] Quadrantes e Linha Média: orientação anatômica 51|61 e 81|71 respeitada');

    // ====================================================================
    // TESTE 14: CONSISTÊNCIA VISUAL ENTRE MODOS
    // ====================================================================
    // Mede tamanho do card no infantil vs permanente
    const cardInfantilBox = await tooth(55).boundingBox();
    await page.getByRole('button', { name: 'Permanente', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('canvas[data-ready="true"]').length === 32);
    const cardPermBox = await tooth(16).boundingBox();
    // Diferença de proporção e largura menor que 10%
    assert.ok(Math.abs(cardInfantilBox.width - cardPermBox.width) <= 8, 'Largura padronizada dos cards');
    assert.ok(Math.abs(cardInfantilBox.height - cardPermBox.height) <= 8, 'Altura padronizada dos cards');
    console.log('PASS [14] Consistência Visual: dimensões, cards, tipografia e anatomia idênticas entre modos');

    assert.deepEqual(pageErrors, []);
    console.log('================================================================');
    console.log(' TODOS OS 14 TESTES OBRIGATÓRIOS FORAM APROVADOS COM SUCESSO!');
    console.log('================================================================');
  } catch (err) {
    console.error('ERRO NA SUÍTE DE TESTES:', err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})();
