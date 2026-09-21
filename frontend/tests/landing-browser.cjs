const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5178';
const out = process.env.TEST_OUTPUT_DIR;
async function main() {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  const page = await browser.newPage({ viewport:{width:1440,height:1000}, reducedMotion:'reduce' });
  const errors=[]; page.on('pageerror', e => errors.push(e.message));
  const response=await page.request.get(`${base}/tests/landing.html`);
  const fixture=await response.text();
  // Exercise the actual public component at / without importing unrelated clinical modules.
  await page.route(`${base}/`, route => route.fulfill({contentType:'text/html',body:fixture}));
  try {
    await page.goto(base);
    await page.locator('h1').waitFor();
    assert.equal(await page.locator('h1').count(),1);
    for (const width of [360,390,640,768,1024,1440]) {
      await page.setViewportSize({width,height:1000});
      const overflow=await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(overflow.scroll<=width,`Horizontal overflow at ${width}: ${JSON.stringify(overflow)}`);
      if(width<1024) {
        const menu=page.getByRole('button',{name:'Abrir menu',exact:true});
        await menu.click();
        await page.locator('#public-mobile-menu').getByRole('link',{name:'Módulos',exact:true}).click();
        assert.equal(await menu.getAttribute('aria-expanded'),'false');
        assert.ok(await page.evaluate(() => location.hash==='#profissoes'));
        await page.evaluate(() => scrollTo(0,0));
      }
      console.log(`Responsive ${width}px: OK`);
    }
    for(const name of ['Agenda','Prontuário','Especialidade','Financeiro','Dashboard']) {
      const button=page.locator('.zl-view-picker').getByRole('button',{name,exact:true});
      await button.click(); assert.equal(await button.getAttribute('aria-pressed'),'true');
    }
    for(const id of ['odonto','to','personal']) {
      await page.locator(`.zl-module-${id} a`).click();
      assert.ok(await page.evaluate(id => {const r=document.getElementById(`modulo-${id}`).getBoundingClientRect();return r.top>=80&&r.top<innerHeight;},id));
    }
    await page.getByRole('link',{name:'Conhecer módulo ZemdaFono',exact:true}).click();
    assert.equal(await page.locator('html').getAttribute('data-test-action'),'sistema-para-fonoaudiologos');
    await page.locator('.zl-hero').getByRole('button',{name:'Começar agora',exact:true}).click();
    assert.equal(await page.locator('html').getAttribute('data-test-action'),'register');
    await page.locator('.zl-final').getByRole('button',{name:'Entrar no Zemda',exact:true}).click();
    assert.equal(await page.locator('html').getAttribute('data-test-action'),'login');
    const faq=page.locator('.zl-faq details').first(); await faq.locator('summary').click();
    assert.ok(await faq.evaluate(el=>el.open)); await faq.locator('summary').press('Enter');
    assert.equal(await faq.evaluate(el=>el.open),false);
    const broken=await page.locator('a[href*="#"]').evaluateAll(links=>links.filter(a=>a.hash&&(!a.pathname||a.pathname==='/')).filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.href));
    assert.deepEqual(broken,[]);
    const text=await page.locator('body').innerText();
    assert.ok(!/SaaS|ZemdaMed|100%|mais escolhido|gerente de conta|Android|ponta a ponta/i.test(text));
    if(out) {
      fs.mkdirSync(out,{recursive:true});
      await page.setViewportSize({width:1440,height:1000}); await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:path.join(out,'zemda-desktop.png'),fullPage:true});
      await page.screenshot({path:path.join(out,'zemda-hero-desktop.png')});
      await page.locator('#profissoes').screenshot({path:path.join(out,'zemda-modulos.png'),style:'header.sticky, .zl-skip { visibility:hidden !important; }'});
      await page.setViewportSize({width:390,height:844}); await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:path.join(out,'zemda-mobile.png'),fullPage:true});
      await page.screenshot({path:path.join(out,'zemda-hero-mobile.png')});
    }
    assert.deepEqual(errors,[]);
    console.log('Navigation, CTAs, preview controls, FAQ, anchors, public copy and console: OK');
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
