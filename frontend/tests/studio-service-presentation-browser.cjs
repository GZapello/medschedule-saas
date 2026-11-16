const {chromium}=require('playwright');
const esbuild=require('esbuild');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const out=path.join(require('node:os').tmpdir(),'zemda-studio-service-presentation');
fs.mkdirSync(out,{recursive:true});
const source=path.join(root,'frontend/src/components/services/ServicesView.tsx');
// Override the revision to compare against an earlier implementation after committing.
const baselineRef=process.env.STUDIO_SERVICE_BASELINE_REF||'HEAD';
const baseline=execFileSync('git',['show',`${baselineRef}:frontend/src/components/services/ServicesView.tsx`],{cwd:root,encoding:'utf8'});
const errors=[];
let server,browser;
const field=(scope,label,tag='input')=>scope.locator('label').filter({hasText:label}).locator('xpath=ancestor::div[descendant::'+tag+'][1]').locator(tag).first();
const section=(page,key)=>page.locator(`[data-studio-section="${key}"]`);
async function expand(page,key){const button=section(page,key).locator('h4 > button');if(await button.count() && await button.getAttribute('aria-expanded')==='false')await button.click();}
async function collapse(page,key){const button=section(page,key).locator('h4 > button');if(await button.count() && await button.getAttribute('aria-expanded')==='true')await button.click();}
async function open(page,version,profile='studio',edit=false){
 await page.goto(`http://127.0.0.1:${server.address().port}/${version}?profile=${profile}`);
 if(edit)await page.getByTitle('Editar Serviço',{exact:true}).click();else await page.getByRole('button',{name:['studio','mixed'].includes(profile)?'Serviço Individual':'Novo Serviço',exact:true}).click();
 return page.locator('.mobile-modal').last();
}
async function scenario(page,version,edit=false){
 const modal=await open(page,version,'studio',edit);
 await field(modal,'Nome do Atendimento').fill(edit?'Pilates revisado':'Pilates funcional');
 await field(modal,'Profissional Responsável','select').selectOption('prof-2');
 await modal.getByRole('button',{name:'+ Vincular instrutores',exact:true}).click();
 // Both instructors remain linked after choosing the responsible professional.
 await modal.getByRole('button',{name:'Concluir seleção',exact:true}).click();
 await field(modal,'Preço por Atendimento').fill('80');
 await expand(page,'format');
 await modal.getByRole('button',{name:'Aula coletiva / Turma',exact:true}).click();
 await modal.getByRole('button',{name:'Individual',exact:true}).click();
 await expand(page,'recurrence');
 await modal.getByRole('checkbox',{name:'Quinzenal',exact:true}).check();
 await field(modal,'Frequência padrão','select').selectOption('biweekly');
 await field(modal,'Duração padrão do plano','select').selectOption('3_months');
 await collapse(page,'recurrence');await expand(page,'recurrence');
 assert.equal(await field(modal,'Frequência padrão','select').inputValue(),'biweekly');
 await expand(page,'billing');
 await modal.getByRole('button',{name:/^Mensal \(1 mês\)/}).click();
 await field(modal,'Frequência semanal de referência','select').selectOption('2');
 const price=field(modal,'Valor por período');
 await price.fill('590');
 await field(modal,'Dia padrão de vencimento').fill('12');
 await collapse(page,'billing');await expand(page,'billing');
 assert.equal(await price.inputValue(),'590');
 await expand(page,'templates');
 await modal.getByRole('checkbox',{name:/Fortalecimento/}).check();
 await field(modal,'Template padrão para esta aula','select').selectOption('template-2');
 await collapse(page,'templates');await expand(page,'templates');
 assert.equal(await modal.getByRole('checkbox',{name:/Fortalecimento/}).isChecked(),true);
 await expand(page,'description');
 await field(modal,'Descrição','textarea').fill('Aula com acompanhamento individual.');
 await modal.getByRole('checkbox',{name:'Criar lembrete de retorno/contato'}).check();
 await collapse(page,'description');
 await modal.getByRole('button',{name:edit?'Salvar Alterações':'Salvar Serviço',exact:true}).click();
 await page.waitForFunction(()=>window.__writes.length===1);
 return page.evaluate(()=>({writes:window.__writes,reads:window.__reads.filter(x=>!x.includes('auth')&&!x.includes('clinics'))}));
}
(async()=>{
 for(const version of ['before','after'])await esbuild.build({entryPoints:[path.join(__dirname,'studio-service-presentation.tsx')],bundle:true,format:'iife',platform:'browser',outfile:path.join(out,`${version}.js`),define:{'import.meta.env':'{}'},jsx:'automatic',plugins:version==='before'?[{name:'baseline',setup(build){build.onLoad({filter:/[\\/]services[\\/]ServicesView\.tsx$/},()=>({contents:baseline,loader:'tsx',resolveDir:path.dirname(source)}));}}]:[]});
 const assets=path.join(root,'frontend/dist/assets');const css=fs.readdirSync(assets).find(f=>/^index-.*\.css$/.test(f));
 server=http.createServer((req,res)=>{const version=req.url.startsWith('/before')?'before':'after';res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${fs.readFileSync(path.join(assets,css),'utf8')}\n${fs.existsSync(path.join(out,`${version}.css`))?fs.readFileSync(path.join(out,`${version}.css`),'utf8'):''}</style></head><body><div id="root"></div><script>${fs.readFileSync(path.join(out,`${version}.js`),'utf8')}</script></body></html>`)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 for(const edit of [false,true]){const before=await scenario(page,'before',edit);const after=await scenario(page,'after',edit);assert.deepEqual(after,before);console.log(`PASS identical ${edit?'edit':'create'} payloads and API reads before/after`);}

 const billingStates=[];
 for(const version of ['before','after']){
   const m=await open(page,version);await field(m,'Preço por Atendimento').fill('80');await expand(page,'billing');
   const snapshots=[];
   const modes=['Mensal (1 mês)','Bimestral (2 meses)','Trimestral (3 meses)','Semestral (6 meses)','Anual (12 meses)','Bienal (24 meses)','Data final personalizada','Quantidade fixa de aulas','Utilizar Pacote de Serviços existente','Por Atendimento / Aula'];
   for(const mode of modes){
     await m.getByRole('button').filter({has:page.locator('div.leading-tight').filter({hasText:mode})}).first().click();
     snapshots.push(await m.locator('input,select').evaluateAll(nodes=>nodes.map(n=>({value:n.value,checked:n.checked}))));
     if(version==='after'&&!['Utilizar Pacote de Serviços existente','Por Atendimento / Aula'].includes(mode)){
       const val=await field(m,'Valor por período').inputValue();
       assert.ok(await page.getByRole('complementary',{name:'Resumo do serviço'}).innerText().then(t=>t.includes(Number(val).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))));
     }
   }
   billingStates.push(snapshots);
 }
 assert.deepEqual(billingStates[1],billingStates[0]);console.log('PASS all 10 billing modes retain their calculated values');
 const groupWrites=[];
 for(const version of ['before','after']){
   const m=await open(page,version);await field(m,'Nome do Atendimento').fill('Turma de Pilates');
   await m.getByRole('button',{name:'Aula coletiva / Turma',exact:true}).click();
   await expand(page,'recurrence');
   await m.getByRole('button',{name:'+ Adicionar Dia e Horário',exact:true}).click();
   await m.getByRole('button',{name:'Qua',exact:true}).click();
   await field(m,'Início *').fill('08:00');await field(m,'Término *').fill('08:50');
   await field(m,'Início da vigência').fill('2026-11-16');
   await collapse(page,'recurrence');await expand(page,'recurrence');
   assert.equal(await field(m,'Início *').inputValue(),'08:00');
   await m.getByRole('button',{name:'Confirmar horário',exact:true}).click();
   if(version==='after')assert.ok((await page.getByRole('complementary',{name:'Resumo do serviço'}).innerText()).includes('Segunda • 08:00–08:50'));
   await m.getByRole('button',{name:'Salvar Serviço',exact:true}).click();await page.waitForFunction(()=>window.__writes.length===1);
   groupWrites.push(await page.evaluate(()=>JSON.parse(JSON.stringify(window.__writes), (key,value)=>key==='tempId'?'draft-fixture':value)));
 }
 assert.deepEqual(groupWrites[1],groupWrites[0]);console.log('PASS group schedule draft and payload preserved');
 let modal=await open(page,'after');
 assert.deepEqual(await page.locator('[data-studio-section] h4 > button').evaluateAll(buttons=>buttons.map(b=>b.getAttribute('aria-expanded'))),['true','true','false','false','false','false']);

 const recurrenceToggle=section(page,'recurrence').locator('h4 > button');
 await recurrenceToggle.focus();await page.keyboard.press('Enter');
 assert.equal(await recurrenceToggle.getAttribute('aria-expanded'),'true');
 await page.keyboard.press('Space');assert.equal(await recurrenceToggle.getAttribute('aria-expanded'),'false');
 await modal.getByRole('button',{name:'Fechar',exact:true}).focus();await page.keyboard.press('Shift+Tab');
 assert.equal(await modal.getByRole('button',{name:'Salvar Serviço',exact:true}).evaluate(el=>document.activeElement===el),true);
 await page.keyboard.press('Tab');assert.equal(await modal.getByRole('button',{name:'Fechar',exact:true}).evaluate(el=>document.activeElement===el),true);
 await page.screenshot({path:path.join(out,'desktop.png')});
 await expand(page,'recurrence');await modal.getByRole('checkbox',{name:'Personalizada',exact:true}).check();
 await page.getByLabel('Quantidade do intervalo personalizado').fill('7');
 await page.getByLabel('Unidade do intervalo personalizado').selectOption('months');
 await collapse(page,'recurrence');await expand(page,'recurrence');
 assert.equal(await page.getByLabel('Quantidade do intervalo personalizado').inputValue(),'7');
 assert.equal(await page.getByLabel('Unidade do intervalo personalizado').inputValue(),'months');
 await collapse(page,'recurrence');
 await modal.getByRole('button',{name:'+ Vincular instrutores',exact:true}).click();
 await modal.getByRole('button',{name:/^Bruno/}).click();
 await collapse(page,'basics');await expand(page,'basics');
 assert.equal(await modal.getByRole('button',{name:'Concluir seleção',exact:true}).count(),1);
 await modal.getByRole('button',{name:'Concluir seleção',exact:true}).click();
 await expand(page,'templates');await modal.getByRole('button',{name:'+ Novo Template',exact:true}).click();
 assert.equal(await page.getByText('Criar Modelo de Treino',{exact:true}).isVisible(),true);
 await page.locator('[data-personal-mobile="template"]').getByTitle('Fechar',{exact:true}).click();
 await collapse(page,'templates');
 console.log('PASS local recurrence/instructor drafts and existing template editor');

 await collapse(page,'basics');await modal.getByRole('button',{name:'Salvar Serviço',exact:true}).click();
 assert.equal(await section(page,'basics').locator('h4 > button').getAttribute('aria-expanded'),'true');
 assert.equal(await page.getByLabel('Nome do serviço',{exact:true}).evaluate(el=>document.activeElement===el),true);
 assert.equal(await page.evaluate(()=>window.__writes.length),0);
 await page.getByLabel('Nome do serviço',{exact:true}).fill('Teste validação');
 await expand(page,'billing');await modal.getByRole('button',{name:/^Mensal \(1 mês\)/}).click();
 await field(modal,'Dia padrão de vencimento').fill('29');await collapse(page,'billing');
 await modal.getByRole('button',{name:'Salvar Serviço',exact:true}).click();
 assert.equal(await section(page,'billing').locator('h4 > button').getAttribute('aria-expanded'),'true');
 assert.equal(await page.evaluate(()=>window.__writes.length),0);
 await field(modal,'Dia padrão de vencimento').fill('10');
 await modal.getByRole('button',{name:'Aula coletiva / Turma',exact:true}).click();
 await expand(page,'recurrence');
 await modal.getByRole('button',{name:'+ Adicionar Dia e Horário',exact:true}).click();
 await collapse(page,'recurrence');await modal.getByRole('button',{name:'Salvar Serviço',exact:true}).click();
 assert.equal(await section(page,'recurrence').locator('h4 > button').getAttribute('aria-expanded'),'true');
 assert.equal(await page.evaluate(()=>window.__writes.length),0);
 console.log('PASS initial sections, collapsed field validation and pending schedule preservation');
 await modal.getByRole('button',{name:'Fechar',exact:true}).click();assert.equal(await page.locator('[role="dialog"]').count(),0);
 modal=await open(page,'after');await modal.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await page.locator('[role="dialog"]').count(),0);
 for(const profile of ['clinic','mixed','solo']){
   const snapshots=[];
   for(const version of ['before','after']){const m=await open(page,version,profile);snapshots.push(await m.locator('input,select,textarea,button').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,text:n.textContent,value:n.value,type:n.type,disabled:n.disabled}))));assert.equal(await page.locator('[data-studio-section]').count(),0);}
   assert.deepEqual(snapshots[1],snapshots[0]);
 }
 console.log('PASS original controls preserved for clinic, mixed and solo');
 for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:844});modal=await open(page,'after');
   await page.screenshot({path:path.join(out,`initial-${width}.png`)});
   for(const key of ['basics','format','recurrence','billing','templates','description'])await expand(page,key);
   await modal.getByRole('checkbox',{name:'Criar lembrete de retorno/contato'}).check();
   const overflow=await modal.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,dialog:el.firstElementChild.clientWidth,dialogScroll:el.firstElementChild.scrollWidth}));
   assert.ok(overflow.scroll<=overflow.width+1&&overflow.dialogScroll<=overflow.dialog+1,JSON.stringify({width,overflow}));
   const box=await modal.getByRole('button',{name:'Salvar Serviço',exact:true}).boundingBox();await page.screenshot({path:path.join(out,`check-${width}.png`)});assert.ok(box&&box.y>=0&&box.y+box.height<=844,JSON.stringify({width,box}));
   await page.screenshot({path:path.join(out,`viewport-${width}.png`)});
 }
 await page.setViewportSize({width:390,height:430});
 await page.waitForFunction(()=>{const b=document.querySelector('[data-studio-save]')?.getBoundingClientRect();return b&&b.bottom<=430;});
 await page.screenshot({path:path.join(out,'short-viewport.png')});
 const save=await page.getByRole('button',{name:'Salvar Serviço',exact:true}).boundingBox();assert.ok(save&&save.y+save.height<=430);
 console.log('PASS desktop/tablet/mobile overflow and short viewport footer');
 assert.deepEqual(errors,[]);console.log('PASS no browser runtime errors');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server?.close()});
