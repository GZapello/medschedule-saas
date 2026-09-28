const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5176',api='http://127.0.0.1:3126';
const out=process.env.TEST_OUTPUT_DIR||path.join(__dirname,'results/zemda360');fs.mkdirSync(out,{recursive:true});
const patient={id:'patient-a',full_name:'Paciente A',phone:'11999999999',gender:'female'};
async function main(){
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true}),errors=[],assets=[],saves=[];
  let failSave=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base)return route.abort();
    if(url.pathname.startsWith('/anatomy/')||url.pathname.startsWith('/Corpo_'))assets.push(url.pathname);
    if(url.pathname.startsWith('/api/')){
      const p=url.pathname.slice(4);
      if(p.startsWith('/v1/body-assessments')&&!/anthropometry|therapeutic-plans/.test(p)){
        if(route.request().method()==='POST'){
          if(failSave)return route.fulfill({status:500,json:{error:'Simulated save failure'}});
          saves.push(route.request().postDataJSON());
        }
        const response=await fetch(api+p+url.search,{method:route.request().method(),headers:{'Content-Type':'application/json'},...(route.request().postData()?{body:route.request().postData()}: {})});
        return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
      }
      if(p==='/v1/patients')return route.fulfill({json:{patients:[patient]}});
      if(p==='/v1/patients/patient-a')return route.fulfill({json:patient});
      if(p==='/v1/auth/me')return route.fulfill({json:{user:{id:'user-a',role:'professional',name:'Professional A'},tenant:{id:'a',name:'Clinic A'}}});
      return route.fulfill({json:[]});
    }
    return route.continue();
  });
  const workspace=page.getByTestId('zemda360-workspace');
  const button=(name)=>workspace.getByRole('button',{name,exact:true});
  const draw=async(x=.5,y=.45)=>{
    await button('Caneta').click();
    const surface=workspace.locator('.mapa-corporal-wrapper');await surface.scrollIntoViewIfNeeded();
    const box=await surface.boundingBox();
    await page.mouse.move(box.x+box.width*x,box.y+box.height*y);await page.mouse.down();
    await page.mouse.move(box.x+box.width*(x+.05),box.y+box.height*(y+.04),{steps:8});await page.mouse.up();
  };
  const manualSave=async()=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/body-assessments')&&r.request().method()==='POST');await button('Salvar Avaliação').click();assert.equal((await response).status(),200);await workspace.getByText('Salvo',{exact:true}).waitFor();};
  const lastDoc=()=>JSON.parse(saves.at(-1).notes);
  const select=async(id)=>{await button('Selecionar').click();await workspace.locator(`[data-region-id="${id}"]`).first().click();};
  await page.goto(`${base}/tests/zemda360.html`);
  await page.getByRole('heading',{name:'Zemda360 • Mapeamento Visual & Anatômico',exact:true}).waitFor();
  await page.locator('input').first().fill('Paciente');await page.getByText('Paciente A',{exact:true}).first().click();
  await page.getByRole('button',{name:'Nova Avaliação',exact:true}).click();
  await workspace.waitFor();
  await workspace.locator('img').first().evaluate(img=>img.complete?true:new Promise(r=>img.onload=r));
  assert(!assets.some(p=>p.includes('/face/')),'Body must not download facial assets');
  assert(assets.includes('/Corpo_Feminino.jpg'));assert(!assets.includes('/Corpo_masculino.jpg'));
  await select('knee_right');
  await workspace.getByLabel('Observação da região',{exact:true}).fill('Observação do joelho');
  await button('Adicionar marcação').click();
  await draw(.15,.64);await manualSave();
  const bodyDrawings=lastDoc().layers['BODY:female:all'].drawings;assert.equal(bodyDrawings.length,1);
  for(const view of ['Frente','Costas','Lado E','Lado D','Todas as vistas'])await button(view).click();
  await button('Masculino').click();await select('shoulder_right');
  await button('Feminino').click();
  assert.equal(await workspace.locator('[data-region-id="knee_right"]').first().getAttribute('aria-pressed'),'true');
  await workspace.locator('.mapa-corporal-wrapper').screenshot({path:path.join(out,'body-preserved.png')});
  await button('Face').click();
  await workspace.locator('img[src="/anatomy/face/female/front.webp"]').waitFor();
  assert.equal(assets.filter(p=>p.includes('/face/')).length,1,'Only selected face is loaded');
  await select('face_malar_right');
  await workspace.getByLabel('Tipo de marcação',{exact:true}).selectOption('observation');
  await workspace.getByLabel('Observação da região',{exact:true}).fill('Marcação facial independente');
  await button('Adicionar marcação').click();
  await select('joint_tmj_right');await draw(.5,.3);await manualSave();
  assert.equal(lastDoc().layers['FACE:female:front'].drawings.length,1);
  assert.deepEqual(lastDoc().layers['BODY:female:all'].drawings,bodyDrawings);
  await button('Borracha').click();
  const surface=workspace.locator('.mapa-corporal-wrapper');await surface.scrollIntoViewIfNeeded();const box=await surface.boundingBox();
  await page.mouse.move(box.x+box.width*.525,box.y+box.height*.32);await page.mouse.down();await page.mouse.up();
  await manualSave();assert(lastDoc().layers['FACE:female:front'].drawings.length!==1||lastDoc().layers['FACE:female:front'].drawings[0].points.length<9,'Eraser changes only freehand strokes');
  assert(lastDoc().layers['FACE:female:front'].selectedRegions.includes('joint_tmj_right'));
  await draw(.6,.5);
  for(const sex of ['Feminino','Masculino']){
    await button(sex).click();
    for(const view of ['Frontal','Perfil E','Perfil D','3/4 E','3/4 D']){
      await button(view).click();await button('Selecionar').click();
      await workspace.locator('img').first().evaluate(img=>img.complete?true:new Promise(r=>img.onload=r));
      await workspace.locator('.mapa-corporal-wrapper').scrollIntoViewIfNeeded();
      await workspace.locator('.mapa-corporal-wrapper').screenshot({path:path.join(out,`${sex}-${view.replaceAll('/','-').replaceAll(' ','-')}.png`)});
      const calibration=await page.addStyleTag({content:'.mapa-corporal-wrapper .regiao {fill:rgba(37,99,235,.10)!important;stroke:rgba(37,99,235,.65)!important;stroke-width:1!important;}'});
      await workspace.locator('.mapa-corporal-wrapper').screenshot({path:path.join(out,`overlay-${sex}-${view.replaceAll('/','-').replaceAll(' ','-')}.png`)});
      await calibration.evaluate(e=>e.remove());
      assert.equal(await workspace.locator('[data-region-id^="joint_tmj_"]').count(),view==='Frontal'?2:1);
      assert.equal(await workspace.locator('[data-region-id^="joint_sacroiliac"]').count(),0);
      const ratio=await workspace.locator('.mapa-corporal-wrapper').evaluate(e=>e.clientWidth/e.clientHeight);assert(Math.abs(ratio-.75)<.02);
    }
  }
  await button('Feminino').click();await button('Frontal').click();await manualSave();
  const list=await (await fetch(api+'/v1/body-assessments/patient/patient-a')).json();
  const id=list.find(a=>{try{return JSON.parse(a.notes||'null')?.layers?.['FACE:female:front']?.marks?.some(m=>m.note==='Marcação facial independente');}catch{return false;}}).id;
  const before=lastDoc();
  await page.goto(`${base}/tests/zemda360.html?id=${id}`);await workspace.waitFor();
  assert.equal(await workspace.locator('[data-region-id="face_malar_right"]').getAttribute('aria-pressed'),'true');
  await button('Histórico').click();await page.getByRole('dialog',{name:'Histórico Zemda360'}).waitFor();
  await page.getByRole('button',{name:/Abrir registro/}).first().click();await page.getByLabel('Mapa no histórico').waitFor();
  await page.getByRole('button',{name:'Fechar histórico',exact:true}).click();
  await page.setViewportSize({width:1024,height:768});
  await button('Caneta').tap();
  await workspace.locator('.mapa-corporal-wrapper').scrollIntoViewIfNeeded();
  const touchBox=await workspace.locator('.mapa-corporal-wrapper').boundingBox();
  const cdp=await page.context().newCDPSession(page);
  const touchPoint={x:touchBox.x+touchBox.width*.45,y:touchBox.y+touchBox.height*.45};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchPoint]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchPoint.x+15,y:touchPoint.y+12}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await manualSave();assert(lastDoc().layers['FACE:female:front'].drawings.length>=2,'Touch pen persists its stroke');
  await button('Selecionar').tap();
  await page.screenshot({path:path.join(out,'tablet.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow on tablet');
  await manualSave();assert.deepEqual(lastDoc().layers['BODY:female:all'].drawings,before.layers['BODY:female:all'].drawings);
  failSave=true;await workspace.locator('textarea').last().fill('Alteração com falha');await manualSave().catch(()=>{});
  // Save failure leaves local data on screen, without a success status.
  await page.getByText('Erro ao salvar',{exact:true}).waitFor();failSave=false;await manualSave();
  const legacy=list.find(a=>a.notes==='Texto antigo simples');
  await page.goto(`${base}/tests/zemda360.html?id=${legacy.id}&readonly=1`);await workspace.waitFor();
  assert.equal(await button('Caneta').count(),0);assert.equal(await button('Salvar Avaliação').count(),0);
  assert.equal(await workspace.getByPlaceholder('Sem observações adicionais.').inputValue(),'Texto antigo simples');
  assert.deepEqual(errors,[]);
  console.log('PASS Zemda360 browser: patient, body/sex/views/selection/joints, pen/eraser, observations, real SQLite save/reopen/history, 10 facial assets/overlays, ATM, lazy loading, legacy read-only, tablet and save retry');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
