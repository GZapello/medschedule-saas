const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const esbuild=require('esbuild'),out=fs.mkdtempSync(path.join(os.tmpdir(),'zemda-completion-ui-'));
esbuild.buildSync({entryPoints:[path.join(__dirname,'consultation-completion.tsx')],bundle:true,format:'iife',platform:'browser',outfile:path.join(out,'test.js'),define:{'import.meta.env':'{}'},jsx:'automatic'});
const assets=path.resolve(__dirname,'../dist/assets'),css=fs.readdirSync(assets).find(f=>/^index-.*\.css$/.test(f));
const html=`<!doctype html><html><head><meta charset="utf-8"><style>${fs.readFileSync(path.join(assets,css),'utf8')}</style></head><body><div id="root"></div><script>${fs.readFileSync(path.join(out,'test.js'),'utf8')}</script></body></html>`;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[]; page.on('pageerror',e=>errors.push(e.message));
 const open=async(query)=>{errors.length=0;await page.goto(`http://127.0.0.1:${server.address().port}/?${query}`);await page.waitForTimeout(600);assert.deepEqual(errors,[],query)};
 const finish=()=>page.getByRole('button',{name:/finalizar atendimento/i}).first();

 await open('module=ZemdaNutri&sidebar');
 await page.locator('[data-tour="tab-meal_plans"]').click();
 await page.getByRole('button',{name:'Adicionar alimento manual em Café da Manhã',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Adicionar alimento manual',exact:true});
 await dialog.getByLabel('Nome do alimento',{exact:true}).fill('Receita caseira');
 await dialog.getByLabel('Quantidade',{exact:true}).fill('-1');
 await dialog.getByRole('button',{name:'Salvar alimento',exact:true}).click();
 await dialog.getByRole('alert').waitFor();
 await dialog.getByLabel('Quantidade',{exact:true}).fill('2');
 await dialog.getByLabel('Unidade',{exact:true}).selectOption('colher');
 for(const [label,value] of [['kcal','180'],['Carboidratos (CHO) — g','12,5'],['Proteínas (PTN) — g','8'],['Gorduras (LIP) — g','11'],['Observação (opcional)','Preparação caseira']]) await dialog.getByLabel(label,{exact:true}).fill(value);
 await dialog.screenshot({path:path.join(out,'manual-food.png')});
 console.log('Manual food preview:',path.join(out,'manual-food.png'));
 await dialog.getByRole('button',{name:'Salvar alimento',exact:true}).click();
 await page.getByText('180 kcal planejadas',{exact:true}).waitFor();
 await page.getByText('Preparação caseira',{exact:true}).waitFor();
 await page.getByPlaceholder('Buscar alimento por nome ou categoria (ex: arroz, frango, feijão, aveia, maçã, queijo)...').fill('arroz');
 await page.getByText('Arroz TACO',{exact:true}).waitFor();
 await page.getByText('Arroz TACO',{exact:true}).locator('xpath=../../..').getByRole('button').click();
 await page.getByRole('button',{name:'Confirmar e Inserir',exact:true}).click();
 await page.getByText('280 kcal planejadas',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Editar Receita caseira',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Editar alimento manual',exact:true});
 assert.equal(await dialog.getByLabel('Quantidade',{exact:true}).inputValue(),'2');
 assert.equal(await dialog.getByLabel('Unidade',{exact:true}).inputValue(),'colher');
 await dialog.getByLabel('kcal',{exact:true}).fill('200');
 await dialog.getByRole('button',{name:'Salvar alimento',exact:true}).click();
 await page.getByText('300 kcal planejadas',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Salvar Plano Alimentar no Prontuário',exact:true}).click();
 await page.waitForFunction(()=>window.__completion.calls.some(c=>c.method==='POST'&&c.url==='/v1/nutrition/meal-plans'));
 const plan=await page.evaluate(()=>window.__completion.calls.find(c=>c.method==='POST'&&c.url==='/v1/nutrition/meal-plans').body);
 assert.equal(plan.totalCalories,300);assert.equal(plan.totalCarbs,32.5);assert.equal(plan.totalProtein,11);assert.equal(plan.totalFat,12);
 assert.equal(plan.meals[0].items[0].source,'manual');assert.equal(plan.meals[0].items[0].unit,'colher');assert.equal(plan.meals[0].items[0].notes,'Preparação caseira');
 assert.equal(plan.meals[0].items[1].source,'TACO');
 await page.getByRole('button',{name:'Editar Receita caseira',exact:true}).locator('..').getByTitle('Remover alimento',{exact:true}).click();
 await page.getByText('100 kcal planejadas',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Editar Receita caseira',exact:true}).count(),0);
 console.log('PASS manual validation, quantity/unit, macro totals, catalog coexistence, editing, deletion and save payload');
 for(const [module,field] of [
 ['ZemdaNutri','Descreva a evolução da consulta, conduta terapêutica e recomendações...'],
 ['ZemdaFisio','Descreva detalhadamente a evolução fisioterapêutica da sessão...'],
 ['ZemdaTO','Descreva as atividades realizadas na sessão, desempenho do paciente, respostas sensoriais e nível de engajamento...'],
 ['ZemdaFono','Descreva as atividades fonoterápicas realizadas, resposta aos estímulos, produção fonêmica e evolução vocal...'],
 ['ZemdaPP','Descreva a evolução psicopedagógica completa observada durante a sessão...'],
 ['ZemdaMed','Prescrição de medicamentos, posologia, solicitações de exames laboratoriais ou de imagem, encaminhamentos e orientações gerais ao paciente...']]) {
   await open(`module=${module}&sidebar`);await finish().click();
   await page.getByPlaceholder(field,{exact:true}).fill('Evolução direta completa');
   const submit=()=>page.locator('button:not([data-tour="clinical-finish"]):not([data-tour="tab-finish"])').filter({hasText:/^Finalizar/}).last();
   await submit().click();await page.getByRole('button',{name:'Voltar e editar',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.__completion.calls.filter(c=>c.url==='/v1/clinical/consultations/start').length),0);
   await submit().click();await page.getByRole('button',{name:'Finalizar atendimento',exact:true}).last().click();
   await page.waitForFunction(()=>window.__completion.appointment.status==='completed');
   const calls=await page.evaluate(()=>window.__completion.calls.filter(c=>c.method==='POST'));
   assert.equal(calls.filter(c=>c.url==='/v1/clinical/consultations/start').length,1,module);
   assert.equal(calls.filter(c=>/\/finish$|\/finish-consultation$/.test(c.url)).length,1,module);
   assert.equal(calls.find(c=>c.url==='/v1/clinical/consultations/start').body.walkIn,true);
   assert.deepEqual(errors,[]);console.log('PASS',module,'sidebar review/cancel, context creation and completion');
 }
 for(const module of ['ZemdaPersonal','general']) {
   await open(`module=${module}&sidebar`);
   if(module==='general') await page.getByPlaceholder('Descreva detalhadamente o estado atual do paciente, intervenções executadas, resposta ao tratamento e observações clínicas relevantes...').fill('Evolução geral direta');
   await finish().click();
   if(module==='ZemdaPersonal') await page.getByPlaceholder('Descreva a evolução deste atendimento, exame físico, hipóteses e orientações...').fill('Evolução Personal direta');
   await page.getByRole('button',{name:'Concluir Atendimento',exact:true}).click();
   await page.getByRole('button',{name:'Finalizar atendimento',exact:true}).last().click();
   await page.waitForFunction(()=>window.__completion.appointment.status==='completed');
   assert.equal(await page.evaluate(()=>window.__completion.calls.filter(c=>c.method==='POST'&&c.url==='/v1/clinical/consultations/start').length),1);
   console.log('PASS',module,'sidebar completion');
 }
 await open('module=ZemdaOdonto&sidebar');
 await page.getByPlaceholder('Ex: Realizada profilaxia ultrassônica e restauração em resina composta no dente 16 (oclusal). Paciente orientado quanto à higiene interdental.').fill('Evolução Odonto direta');
 await finish().click();await page.getByRole('button',{name:'Finalizar atendimento',exact:true}).last().click();
 await page.waitForFunction(()=>window.__completion.appointment.status==='completed');
 console.log('PASS ZemdaOdonto sidebar completion');
 await open('module=ZemdaPsico&sidebar');
 await page.locator('[data-tour="tab-sessions"]').click();
 await page.getByPlaceholder('Descreva a escuta psicológica, intervenções técnicas realizadas, resposta do paciente e observações clínicas relevantes...').fill('Evolução Psico direta');
 await finish().click();
 await page.getByRole('button',{name:/^Confirmar|^Sim,|^Concluir e|^Finalizar e/}).last().click();
 await page.getByRole('button',{name:'Finalizar atendimento',exact:true}).last().click();
 await page.waitForFunction(()=>window.__completion.appointment.status==='completed');
 assert.deepEqual(errors,[]);console.log('PASS ZemdaPsico sidebar completion');

})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
