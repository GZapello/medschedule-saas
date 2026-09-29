const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto('http://127.0.0.1:5178/tests/landing.html');
 const demo=page.locator('#produto'),nav=demo.getByRole('navigation');
 await demo.locator('.zd-print img').waitFor();
 await demo.locator('.zd-print img').evaluate(img=>img.decode());
 assert.equal(requests.filter(u=>u.includes('/landing/demo/')).length,1,'Only initial print loads');
 assert.equal(await demo.locator('table,input,textarea,form').count(),0,'No reconstructed screens');
 for(const [name,file] of [['Dashboard','dashboard'],['Agenda Interativa','agenda'],['Pacientes','patients'],['Prontuários & Evolução','records'],['Zemda360','zemda360'],['Exames a Receber','exams'],['Orçamentos','quotes']]){
  await nav.getByRole('button',{name,exact:true}).click();
  const img=demo.locator('.zd-print img');await img.evaluate(img=>img.decode());
  assert.ok((await img.getAttribute('src')).endsWith(file+'.png'));
  const ratio=await img.evaluate(img=>{const r=img.getBoundingClientRect();return Math.abs(r.width/r.height-img.naturalWidth/img.naturalHeight)});assert.ok(ratio<0.01);
  assert.equal(await demo.locator('#zd-view button,#zd-view input,#zd-view table').count(),0);
 }
 await nav.getByRole('button',{name:'Módulo Profissional',exact:true}).click();
 const labels=await page.evaluate(async(catalogPath)=>{const m=await import('/src/types/professions.ts');const c=await import(catalogPath);return c.LANDING_MODULES.flatMap(mod=>{const p=m.REGISTRATION_PROFESSIONS.find(p=>p.module===mod.name);return p?[p.label]:[]})}, '/@fs/'+path.resolve(__dirname,'../../backend/src/seo/landingContent.ts').replaceAll('\\','/'));
 assert.deepEqual(await demo.locator('.zd-professions strong').allTextContents(),labels);
 for(let i=0;i<labels.length;i++){
  if(i)await demo.getByRole('button',{name:'Trocar profissão',exact:true}).click();
  await demo.locator('.zd-professions>button').nth(i).click();await demo.locator('.zd-drawer').waitFor({state:'hidden'});
  assert.equal(await demo.locator('.zd-profession-label').textContent(),labels[i]);
  await demo.locator('summary').first().click();assert.equal(await demo.locator('details[open]').count(),1);
 }
 await demo.getByRole('button',{name:'Trocar profissão',exact:true}).click();await page.keyboard.press('Shift+Tab');assert.equal(await demo.locator('.zd-professions>button').last().evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Escape');await demo.locator('.zd-drawer').waitFor({state:'hidden'});
 for(const [width,height] of [[1920,1080],[1600,900],[1440,900],[1366,768],[1280,720],[1024,768],[768,1024],[390,844],[320,720]]){
  await page.setViewportSize({width,height});await nav.getByRole('button',{name:'Dashboard',exact:true}).click();await page.evaluate(()=>scrollTo(0,0));
  await demo.locator('.zd-print img').evaluate(img=>img.decode());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
  const box=await demo.locator('.zd-display').boundingBox();
  const frame=await demo.locator('.zd-frame').evaluate(img=>{const r=img.getBoundingClientRect();return {ratio:r.width/r.height,native:img.naturalWidth/img.naturalHeight}});
  assert.ok(Math.abs(frame.ratio-frame.native)<0.001,`Frame proportion ${width}`);
  const notebook=await demo.locator('.zd-notebook').boundingBox();
  if(width>1100)assert.ok(notebook.y>=65 && notebook.y+notebook.height<=height+20,`Whole notebook in first viewport ${width}: ${JSON.stringify(notebook)}`);
  assert.equal(await page.locator('.zl-care-mosaic,.zl-care-photo').count(),0);
  if(width>1100)assert.ok(box.x+box.width<=width+1,`Screen controls stay visible ${width}`);
  if(width>1100)assert.ok(box.y<height*0.5,`First fold ${width}: ${JSON.stringify(box)}`);
  assert.equal(await page.locator('.zl-modules .zl-care-editorial').count(),0);
  const axes=await page.locator('.zl-hero>.zl-container,#como-funciona>.zl-container,#profissoes>.zl-container').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().left));
  assert.ok(Math.max(...axes)-Math.min(...axes)<1,`Shared section axis ${width}`);
  const transition=await page.evaluate(()=>{const hero=document.querySelector('.zl-hero').getBoundingClientRect();const heading=document.querySelector('#como-funciona .zl-heading').getBoundingClientRect();return heading.top-hero.bottom});
  assert.ok(transition<=43,`Hero transition ${width}: ${transition}`);

  if(width>540){
    for(const selector of ['.zl-step-number','.zl-steps h3','.zl-steps p']){
      const tops=await page.locator(selector).evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
      assert.ok(Math.max(...tops)-Math.min(...tops)<1,`Step alignment ${selector} at ${width}`);
    }
  }
  const desktop=await demo.locator('.zd-display').evaluate(e=>{const r=e.getBoundingClientRect();return {w:e.offsetWidth,h:e.offsetHeight,sx:r.width/e.offsetWidth,sy:r.height/e.offsetHeight}});
  assert.equal(desktop.w,1600);assert.equal(desktop.h,900);assert.ok(Math.abs(desktop.sx-desktop.sy)<0.001,`Uniform scaling ${width}`);
  if(process.env.TEST_OUTPUT_DIR)await page.screenshot({path:path.join(process.env.TEST_OUTPUT_DIR,`demo-${width}.png`)});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests.filter(u=>/\/api\//.test(u)),[]);
 console.log('PASS: 7 original prints, native proportions, initial-only loading, active commercial modules only, drawer keyboard navigation, 9 responsive viewports, desktop first fold, no APIs or JS errors.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
