const {chromium}=require('playwright'),esbuild=require('esbuild'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../..'),out=path.join(repo,'tmp/personal-mobile-layout');fs.mkdirSync(out,{recursive:true});
const phase=process.argv[2]||'after';
const originalFiles=new Map();
if(phase==='before') for(const name of execFileSync('git',['diff','--name-only'],{cwd:repo,encoding:'utf8'}).trim().split('\n').filter(f=>f.endsWith('.tsx')))originalFiles.set(path.resolve(repo,name),execFileSync('git',['show',`HEAD:${name}`],{cwd:repo,encoding:'utf8'}));
const originalPlugin={name:'baseline',setup(build){build.onLoad({filter:/\.tsx$/},args=>originalFiles.has(args.path)?{contents:originalFiles.get(args.path),loader:'tsx'}:undefined);}};
const fill=async(page,label,value)=>page.locator('label').filter({hasText:label}).first().locator('..').locator('input,textarea').first().fill(value);
async function interactions(page,mode,width){
 if(width>=1024)return;
 if(mode==='assessment'){
  await fill(page,'Peso Corporal','70');await fill(page,'Estatura','165');
  const tabs=page.getByRole('combobox',{name:'Seção atual'});
  const options=await tabs.locator('option').evaluateAll(ns=>ns.map(n=>n.value));
  for(const value of options){await tabs.selectOption(value);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);}
  await page.locator('textarea').last().fill('Observação longa de teste: manter os parâmetros e os registros anteriores sem alterações. '.repeat(4));
  // A shortened visual viewport exercises the dialog layout; this does not emulate a real OS keyboard.
  await page.setViewportSize({width,height:430});await page.waitForTimeout(150);await page.locator('textarea').last().focus();
  const save=page.getByRole('button',{name:'Salvar Avaliação Física Completa',exact:true});
  const close=page.getByRole('button',{name:'Fechar',exact:true});
  for(const button of [save,close]){const r=await button.boundingBox();assert.ok(r.y>=0&&r.y+r.height<=431,'fixed actions outside reduced viewport');}
  await page.screenshot({path:path.join(out,`after-assessment-short-${width}.png`)});
  await page.setViewportSize({width,height:900});await save.click();
  await page.waitForFunction(()=>window.__writes.some(w=>w.url==='/v1/personal/assessments'));
  const body=await page.evaluate(()=>window.__writes.findLast(w=>w.url==='/v1/personal/assessments').body);assert.equal(body.weight,70);assert.equal(body.height,165);assert.equal(body.patient_id,'fixture');
  await page.evaluate(()=>window.__reopen());await tabs.selectOption(options[0]);
  assert.equal(await page.locator('label').filter({hasText:'Peso Corporal'}).first().locator('..').locator('input').inputValue(),'70');
 }
 if(mode==='template'){
  await page.getByRole('button',{name:/Nova Divisão|Adicionar Divisão/}).click();
  await page.getByRole('button',{name:/Adicionar Exercício/}).first().click();
  await page.getByRole('button',{name:'Selecionar',exact:true}).click();
  await page.locator('[data-personal-mobile=library]').getByRole('button',{name:'Fechar',exact:true}).click();
  await page.getByRole('textbox',{name:'Nome do exercício',exact:true}).fill('Agachamento com amplitude controlada e apoio unilateral');
  await fill(page,'Séries','4');
  await page.screenshot({path:path.join(out,`after-${mode}-parameters-${width}.png`)});
  await page.getByRole('button',{name:/Salvar Modelo/}).click();
  await page.waitForFunction(()=>window.__writes.some(w=>w.url==='/v1/personal/templates'));
  const payload=await page.evaluate(()=>window.__writes.findLast(w=>w.url==='/v1/personal/templates').body);
  assert.equal(payload.workouts.length,2);assert.equal(payload.workouts[1].exercises[0].sets,4);
  await page.evaluate(()=>window.__editTemplate());
  await fill(page,'Nome do Modelo','Modelo editado preservando as divisões e parâmetros');
  await page.getByRole('button',{name:'Atualizar Modelo',exact:true}).click();
  await page.waitForFunction(()=>window.__writes.some(w=>w.url==='/v1/personal/templates/saved-template'));
 }
 if(mode==='workout'){
  await page.getByRole('textbox',{name:'Nome do exercício',exact:true}).first().fill('Nome longo atualizado sem perder a prescrição original');
  await fill(page,'Séries','4');
  await page.screenshot({path:path.join(out,`after-${mode}-parameters-${width}.png`)});await page.getByRole('button',{name:'Mover para baixo',exact:true}).first().click();
  await page.getByRole('button',{name:'Salvar Prescrição de Treino',exact:true}).click();
  await page.waitForFunction(()=>window.__writes.some(w=>w.url.includes('/workouts/')));
  const payload=await page.evaluate(()=>window.__writes.findLast(w=>w.url.includes('/workouts/')).body);assert.equal(payload.exercises[1].sets,4);
 }
 if(mode==='library'){
  await page.route('**youtube.com/embed/**',route=>route.fulfill({contentType:'text/html',body:'<html><body>Player externo simulado</body></html>'}));
  await page.goto(page.url()+'&media=1');
  await page.getByPlaceholder('Buscar por nome, equipamento ou cinesiologia...').fill('Agachamento');
  await page.getByRole('button',{name:'Ver detalhes',exact:true}).click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('img')).some(img=>img.naturalWidth>0));
  await page.screenshot({path:path.join(out,`after-library-detail-${width}.png`)});
  await page.getByRole('button',{name:'Assistir demonstração em vídeo',exact:true}).last().click();
  await page.locator('[data-personal-mobile=video] iframe').waitFor();
  const player=await page.locator('[data-personal-mobile=video] iframe').boundingBox();assert.ok(player.x>=0&&player.x+player.width<=width);
  await page.screenshot({path:path.join(out,`after-library-video-${width}.png`)});
  await page.getByRole('button',{name:'Fechar modal',exact:true}).click();
  await page.getByRole('button',{name:/Fechar/}).last().click();
  await page.getByRole('button',{name:'Editar exercício',exact:true}).click();
  await page.screenshot({path:path.join(out,`after-library-edit-${width}.png`)});
  assert.ok(await page.getByRole('heading',{name:'Editar Exercício',exact:true}).isVisible());
  await page.getByRole('button',{name:/Cancelar/}).last().click();
 }
 if(mode==='view'){
  await page.getByPlaceholder('Buscar modelos por nome ou descrição...').fill('Condicionamento');
  await page.getByRole('button',{name:'Visualizar estrutura do modelo',exact:true}).click();
  await page.screenshot({path:path.join(out,`after-template-preview-${width}.png`)});
  await page.getByRole('button',{name:'Fechar',exact:true}).last().click();
  await page.getByRole('button',{name:'Aplicar',exact:true}).click();
  await page.getByPlaceholder('Pesquise o aluno pelo nome...').fill('Mariana');
  await page.getByRole('button',{name:/Mariana Aparecida/}).last().click();
  await page.screenshot({path:path.join(out,`after-template-apply-${width}.png`)});
  await page.getByRole('button',{name:'Aplicar Modelo ao Aluno',exact:true}).click();
  await page.waitForFunction(()=>window.__writes.some(w=>w.url.endsWith('/apply')));
 }
 if(mode==='report'){
  await page.getByRole('button',{name:'Relatório de Avaliação Física',exact:true}).click();
  await page.locator('.zemda-assessment-report').waitFor();
  await page.screenshot({path:path.join(out,`after-report-assessment-${width}.png`)});
 }
 if(mode==='profile'){
  await page.getByRole('combobox',{name:'Seção do aluno'}).selectOption('assessments');
  await page.screenshot({path:path.join(out,`after-history-${width}.png`)});
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${mode} overflow after interactions`);
}
(async()=>{
 await esbuild.build({entryPoints:[path.join(__dirname,'personal-mobile-layout.tsx')],bundle:true,format:'iife',platform:'browser',outfile:path.join(out,'app.js'),define:{'import.meta.env':'{}'},jsx:'automatic',plugins:[originalPlugin]});
 execFileSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-i','src/styles/global.css','-o',path.join(out,'app.css')],{cwd:path.resolve(__dirname,'..'),stdio:'pipe'});
 const mobile=phase==='before'?execFileSync('git',['show','HEAD:frontend/src/styles/mobile.css'],{cwd:repo,encoding:'utf8'}):fs.readFileSync(path.resolve(__dirname,'../src/styles/mobile.css'),'utf8');
 const css=fs.readFileSync(path.join(out,'app.css'),'utf8')+'\n'+mobile;
 const js=fs.readFileSync(path.join(out,'app.js'),'utf8');
 const server=http.createServer((req,res)=>{if(req.url==='/fixture-media.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#a7f3d0"/></svg>');return;}if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n*,*::before,*::after{animation:none!important;transition:none!important}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});const results=[];
 try{
 for(const width of (process.env.PERSONAL_TEST_WIDTHS?.split(',').map(Number)||(phase==='before'?[320,1366,1920]:[320,360,375,390,412,430,768,1366,1920]))){
  const page=await browser.newPage({viewport:{width,height:900}});await page.clock.setFixedTime(new Date('2026-11-12T15:00:00-03:00'));const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const mode of (process.env.PERSONAL_TEST_MODES?.split(',')||['assessment','template','workout','library','comparison','profile','view','report'])){
   errors.length=0;await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);await page.waitForTimeout(850);
   if(mode==='view'){if(width<1024)await page.getByRole('combobox',{name:'Seção atual'}).selectOption({label:'Modelos de Treino (Templates)'});else await page.getByRole('button',{name:/Modelos de Treino/}).first().click();await page.waitForTimeout(150);}
   await page.screenshot({path:path.join(out,`${phase}-${mode}-${width}.png`)});
   const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
   if(phase!=='before'){assert.deepEqual(errors,[],`${mode}: ${errors}`);assert.ok(size.scroll<=width,`${mode} overflow ${size.scroll}/${width}`);await interactions(page,mode,width);assert.deepEqual(errors,[],`${mode} interaction errors`);}
   results.push({mode,...size,errors:[...errors]});console.log(`PASS ${phase} ${mode} ${width}`);
  }
  await page.close();
 }
 fs.writeFileSync(path.join(out,`${process.env.PERSONAL_TEST_MODES ? 'focused' : phase}.json`),JSON.stringify(results,null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
