const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const bundle = esbuild.buildSync({entryPoints:[path.join(__dirname,'odontogram-3d.tsx')],bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},jsx:'automatic'}).outputFiles[0].text;
const assets=path.resolve(__dirname,'../dist/assets'), css=fs.readdirSync(assets).find(f=>/^index-.*\.css$/.test(f));
let data={}, changes=[], calls=[];
const server=http.createServer(async(req,res)=>{
  const url=req.url;
  if(url.startsWith('/assets/dentistry/')){res.setHeader('Content-Type','image/png');return res.end(fs.readFileSync(path.join(__dirname,'../public/assets/dentistry/odontogram-3d-permanent.png')));}
  if(url.startsWith('/api/')){
    let body='';for await(const part of req)body+=part;
    calls.push({url,method:req.method,body:body?JSON.parse(body):null});
    let result=[];
    if(url.includes('/auth/me'))result={user:{id:'user',name:'Dentista',role:'clinic_admin',commercialModule:'ZemdaOdonto',clinicalWorkspace:'ZemdaOdonto',permissions:[]},tenant:{id:'clinic',name:'Clínica teste'}};
    else if(url.includes('/patients/patient'))result={id:'patient',name:'Paciente teste',full_name:'Paciente teste'};
    else if(url.includes('/odontograms')){
      if(req.method==='POST'){const payload=JSON.parse(body);data=payload.statusData;changes.push(...payload.toothChanges);result={id:'odo'};}
      else result={current:{status_data:data},initial:{status_data:{}}};
    } else if(url.includes('/dossier')){const n=url.split('/').at(-2);result={currentStatus:data[n],timeline:changes.filter(c=>String(c.toothNumber)===n).map(c=>({...c,type:'tooth_record'}))};}
    else if(url.includes('/completion'))result={alreadyCompleted:false};
    else if(url.includes('/draft/')||url.includes('/anamnesis/'))result={};
    res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(result));
  }
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${fs.readFileSync(path.join(assets,css),'utf8')}</style></head><body><div id="root"></div><script>${bundle}</script></body></html>`);
});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}), errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const tooth=n=>page.locator(`[data-tooth="${n}"]`);
 const panel=()=>page.getByLabel('Painel do dente selecionado');
 await tooth(16).waitFor();assert.equal(await page.locator('[data-tooth]').count(),32);
 assert.equal(await page.locator('[data-tooth][aria-pressed="true"]').count(),0);
 await tooth(16).focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-tooth][aria-pressed="true"]').count(),1);
 await page.getByRole('button',{name:'Canal Tratado (Endo)',exact:true}).click();await tooth(16).click();
 await page.getByRole('button',{name:'Faces 2D',exact:true}).click();
 await page.getByRole('button',{name:'Salvar Odontograma',exact:true}).click();
 await page.getByText('Odontograma salvo com sucesso!',{exact:true}).waitFor();assert.equal(data[16].whole,'endodontics');
 await page.getByRole('button',{name:'Odontograma 3D',exact:true}).click();
 await page.getByRole('button',{name:'Cárie Ativa',exact:true}).click();await tooth(26).click();
 assert.equal(await panel().getByText('Hígido',{exact:true}).count(),6);
 await panel().getByRole('button',{name:'Oclusal',exact:true}).click();
 await page.getByRole('button',{name:'Faces 2D',exact:true}).click();
 const card=page.locator('div.relative.flex.flex-col.items-center').filter({has:page.getByText('26',{exact:true})});
 assert.equal(await card.locator('rect').getAttribute('fill'),'#ef4444');
 await page.getByRole('button',{name:'Restauração Resina',exact:true}).click();await card.locator('polygon').first().click();
 await page.getByRole('button',{name:'Odontograma 3D',exact:true}).click();await tooth(26).click();
 assert.match(await tooth(26).getAttribute('aria-label'),/Oclusal: Cárie Ativa/);assert.match(await tooth(26).getAttribute('aria-label'),/Vestibular: Restauração Resina/);
 await page.getByRole('button',{name:'Salvar Odontograma',exact:true}).click();
 await page.waitForFunction(()=>document.body.textContent.includes('Odontograma salvo com sucesso!'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('[data-tooth="26"]')?.getAttribute('aria-label')?.includes('Oclusal: Cárie Ativa'));
 await tooth(26).click();await panel().getByRole('button',{name:'Abrir dossiê',exact:true}).click();await page.getByRole('heading',{name:'Dossiê do Dente 26',exact:true}).waitFor();
 assert.ok(calls.some(c=>c.url==='/api/v1/dentistry/teeth/patient/26/dossier'));await page.getByRole('button',{name:'Fechar',exact:true}).last().click();
 await page.getByRole('button',{name:'Hígido',exact:true}).click();await panel().getByRole('button',{name:'Oclusal',exact:true}).click();
 assert.match(await tooth(26).getAttribute('aria-label'),/Vestibular: Restauração Resina/);assert.doesNotMatch(await tooth(26).getAttribute('aria-label'),/Cárie/);
 await page.getByRole('button',{name:'Modo Seleção Múltipla',exact:true}).click();await tooth(11).click();await tooth(31).click();
 await page.getByRole('button',{name:'Cárie Ativa',exact:true}).click();await panel().getByRole('button',{name:'Palatina / Lingual',exact:true}).click();
 await page.getByRole('button',{name:'Salvar Odontograma',exact:true}).click();await page.waitForTimeout(200);
 assert.equal(data[11].palatina,'decay');assert.equal(data[31].lingual,'decay');assert.equal(data[11].oclusal,undefined);
 await page.getByRole('button',{name:'Decídua (Infantil)',exact:true}).click();assert.equal(await page.locator('[data-tooth]').count(),0);await page.getByText('55',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Mista',exact:true}).click();await page.getByText('18',{exact:true}).first().waitFor();await page.getByText('55',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Permanente',exact:true}).click();await tooth(26).waitFor();
 await page.getByRole('button',{name:'Odontograma Inicial',exact:true}).click();await tooth(26).click();assert.equal(await panel().getByRole('button',{name:'Oclusal',exact:true}).count(),0);
 await page.getByRole('button',{name:'Odontograma Atual',exact:true}).click();
 await page.getByRole('button',{name:'Comparativo',exact:true}).click();await page.getByText('Comparativo: Odontograma Inicial (Registro de Entrada)',{exact:true}).waitFor();assert.equal(await page.locator('[data-tooth]').count(),0);
 await page.getByRole('button',{name:'Odontograma 3D',exact:true}).click();
 for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});await page.getByRole('button',{name:'Reset',exact:true}).click();await tooth(26).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(__dirname,`../../tmp/odontogram-${width}.png`)});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}`);}
 await page.getByRole('button',{name:'Aumentar zoom'}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.route('**/assets/dentistry/**',route=>route.abort());await page.reload();await page.getByText('Não foi possível carregar a visualização 3D.',{exact:true}).waitFor();await page.getByRole('button',{name:'Abrir Mapa de Faces 2D'}).click();await page.getByText('26',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);assert.ok(changes.some(c=>c.toothNumber===26&&c.face==='oclusal'&&c.condition==='decay'));
 console.log('PASS: 32 teeth, selection, shared 3D/2D faces, whole tooth, save/reload, dossier, healthy, multi-selection, deciduous/mixed, initial read-only, responsive/zoom, fallback, audit. HTTP persistence fixture; no production patient data.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
