const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:5178';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try {
 const fixture=await (await page.request.get(`${base}/tests/landing.html`)).text();
 await page.route(`${base}/`,route=>route.fulfill({contentType:'text/html',body:fixture}));
  await page.goto(base);
  const select=page.getByRole('combobox',{name:'Escolha sua área'});
  await select.waitFor();
  assert.equal(await page.locator('.zl-layer-number').count(),0);
  assert.deepEqual(await page.locator('.zl-layers h3').allTextContents(),['Gestão','Atendimento','Especialidade']);
  assert.ok(await page.evaluate(()=>Boolean(document.getElementById('zemdabody').compareDocumentPosition(document.querySelector('.zl-modules')) & Node.DOCUMENT_POSITION_FOLLOWING)));
  assert.match(await page.locator('#zemdabody').innerText(),/MÓDULO TRANSVERSAL/);
  let navigations=0;page.on('framenavigated',()=>navigations++);
  for(const width of [320,768,1440]){
   await page.setViewportSize({width,height:1000});
   for(const module of ['fono','psico','odonto','nutri','fisio','to','personal','pp','body']){
    await select.selectOption(module);
    const triggers=page.locator('#product-view .zl-feature-trigger');
    assert.equal(await triggers.count(),4);
    assert.equal(await page.locator('.zl-feature-trigger[aria-expanded=true]').count(),0);
    for(let i=0;i<4;i++){
     const trigger=triggers.nth(i);await trigger.click();
     assert.equal(await trigger.getAttribute('aria-expanded'),'true');
     const panel=page.locator(`[id="${await trigger.getAttribute('aria-controls')}"]`);
     assert.equal(await panel.isVisible(),true);
     const explanation=await panel.innerText();
     assert.ok(explanation.length>30&&explanation.length<250);
     assert.equal(await page.locator('.zl-feature-trigger[aria-expanded=true]').count(),1);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow: ${module}/${i} at ${width}`);
    }
    await triggers.last().press('Enter');
    assert.equal(await triggers.last().getAttribute('aria-expanded'),'false');
    await triggers.first().press('Space');
    assert.equal(await triggers.first().getAttribute('aria-expanded'),'true');
   }
   console.log(`Accordion: 9 modules x 4 resources, exclusive expansion, keyboard and layout at ${width}px OK`);
  }
  await page.getByRole('tab',{name:'ZemdaPsico',exact:true}).click();
  assert.equal(await page.locator('.zl-feature-trigger[aria-expanded=true]').count(),0);
  await page.locator('.zl-feature-trigger').first().click();
  await page.locator('.zl-view-picker').getByRole('button',{name:'Agenda',exact:true}).click();
  assert.equal(await page.locator('.zl-feature-trigger').count(),0);
  await page.locator('.zl-view-picker').getByRole('button',{name:'Especialidade',exact:true}).click();
  assert.equal(await page.locator('.zl-feature-trigger[aria-expanded=true]').count(),0);
  assert.equal(navigations,0);
  assert.deepEqual(errors,[]);
  if(process.env.TEST_OUTPUT_DIR){
   const out=process.env.TEST_OUTPUT_DIR;fs.mkdirSync(out,{recursive:true});
   await select.selectOption('fono');await page.locator('.zl-feature-trigger').first().click();
   await page.locator('#produto').screenshot({path:path.join(out,'recursos-desktop.png'),style:'header.sticky,.zl-skip{visibility:hidden!important}'});
   await page.locator('#profissoes').screenshot({path:path.join(out,'zemdabody-acima-da-grade.png'),style:'header.sticky,.zl-skip{visibility:hidden!important}'});
   await page.setViewportSize({width:390,height:844});
   await select.selectOption('psico');await page.locator('.zl-feature-trigger').last().click();
   await page.locator('#produto').screenshot({path:path.join(out,'recursos-mobile.png'),style:'header.sticky,.zl-skip{visibility:hidden!important}'});
  }
  console.log('Layer numbers removed, Body order/label, chip navigation and zero reloads/page errors: OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
