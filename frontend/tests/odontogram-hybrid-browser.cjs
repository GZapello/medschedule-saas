const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const bundle = esbuild.buildSync({entryPoints:[path.join(__dirname,'odontogram-hybrid.tsx')],bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env':'{}'},jsx:'automatic'}).outputFiles[0].text;
const assets=path.resolve(__dirname,'../dist/assets'), css=fs.readdirSync(assets).find(f=>/^index-.*\.css$/.test(f));
const cssText=fs.readFileSync(path.join(assets,css),'utf8');
let data={}, changes=[], calls=[];
const server=http.createServer(async(req,res)=>{
  const url=req.url;
  if(/^\/assets\/dentistry\/hybrid\/tooth-\d+\.png$/.test(url)){res.setHeader('Content-Type','image/png');return res.end(fs.readFileSync(path.join(__dirname,'../public',url)));}
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
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${cssText}</style></head><body><div id="root"></div><script>${bundle}</script></body></html>`);
});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const base=`http://127.0.0.1:${server.address().port}`;
 await page.goto(base);
 const tooth=n=>page.locator(`[data-tooth="${n}"]`);
 const anatomy=n=>tooth(n).locator('canvas');
 const face=(n,f)=>tooth(n).locator(`[data-face="${f}"]`);
 const panel=()=>page.getByLabel('Painel do dente selecionado');
 await page.waitForFunction(()=>document.querySelectorAll('canvas[data-ready="true"]').length===32);
 const order=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28,48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
 assert.deepEqual(await page.locator('[data-tooth]').evaluateAll(els=>els.map(e=>Number(e.dataset.tooth))),order);
 // Physical clicks on opaque anatomy pixels. Also verify transparent corners.
 const clickAnatomy=async(n,region=.5)=>{
  await anatomy(n).scrollIntoViewIfNeeded();
  const point=await anatomy(n).evaluate((el,region)=>{
   const ctx=el.getContext('2d'),pixels=ctx.getImageData(0,0,el.width,el.height).data,b=el.getBoundingClientRect();
   for(let y=Math.floor(el.height*region);y<el.height-8;y++)for(let x=8;x<el.width-8;x++)if(pixels[(y*el.width+x)*4+3]>200 && pixels[(y*el.width+x-5)*4+3]>200 && pixels[(y*el.width+x+5)*4+3]>200 && pixels[((y+5)*el.width+x)*4+3]>200 && pixels[((y-5)*el.width+x)*4+3]>200)return {x:b.left+(x+.5)*b.width/el.width,y:b.top+(y+.5)*b.height/el.height};
   throw Error('No opaque anatomy');
  },region);await page.mouse.click(point.x,point.y);
 };
 for(const n of order){
  await clickAnatomy(n,.25);await page.waitForFunction(n=>document.querySelector('[data-tooth="'+n+'"]')?.dataset.selected==='true',n);
  assert.equal(await page.locator('[data-tooth][data-selected="true"]').count(),1);
  await face(n,'vestibular').click();assert.equal(await tooth(n).getAttribute('data-selected'),'true');
  assert.equal(await face(n,'vestibular').getAttribute('fill'),'#ef4444');
  assert.match(await anatomy(n).getAttribute('aria-label'),/Vestibular: Cárie Ativa/);
  const a=await anatomy(n).boundingBox(),m=await tooth(n).locator('[data-face-map]').boundingBox();
  assert.ok(m.y>=a.y+a.height-1,'map below anatomy '+n);assert.ok(Math.abs(m.x+m.width/2-a.x-a.width/2)<1);
 }
 await clickAnatomy(43);await anatomy(42).click({position:{x:0,y:0}});assert.equal(await tooth(43).getAttribute('data-selected'),'true');
 await face(46,'mesial').hover();assert.equal(await tooth(46).getAttribute('data-highlighted'),'true');
 assert.match(await anatomy(46).getAttribute('style'),/drop-shadow/);
 await page.getByRole('button',{name:'Canal Tratado (Endo)',exact:true}).click();await clickAnatomy(46,.7);
 assert.match(await anatomy(46).getAttribute('aria-label'),/Canal Tratado/);
 await page.getByRole('button',{name:'Restauração Resina',exact:true}).click();await face(46,'oclusal').click();
 assert.equal(await face(46,'oclusal').getAttribute('fill'),'#3b82f6');assert.match(await anatomy(46).getAttribute('aria-label'),/Oclusal: Restauração Resina/);
 assert.equal(await page.getByRole('button',{name:/Faces 2D|Odontograma Híbrido|Ampliar somente faces/}).count(),0);
 assert.doesNotMatch(await page.locator('body').innerText(),/híbrido|2D/i);
 assert.equal(await page.locator('[data-face-map]').count(),32);
 assert.equal(await panel().getByRole('button',{name:'Oclusal',exact:true}).count(),0);
 await face(46,'distal').click();
 assert.match(await anatomy(46).getAttribute('aria-label'),/Distal: Restauração Resina/);
 await page.getByRole('button',{name:'Salvar Odontograma',exact:true}).click();await page.getByText('Odontograma salvo com sucesso!',{exact:true}).waitFor();
 assert.equal(data[46].whole,'endodontics');assert.equal(data[46].oclusal,'restoration_resin');assert.ok(changes.some(c=>c.toothNumber===46&&c.face==='oclusal'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('canvas[data-anatomy="46"]')?.getAttribute('aria-label')?.includes('Oclusal: Restauração Resina'));
 await clickAnatomy(46);await panel().getByRole('button',{name:'Abrir dossiê',exact:true}).click();await page.getByRole('heading',{name:'Dossiê do Dente 46',exact:true}).waitFor();
 assert.ok(calls.some(c=>c.url==='/api/v1/dentistry/teeth/patient/46/dossier'));await page.getByRole('button',{name:'Fechar',exact:true}).last().click();
 await page.getByRole('button',{name:'Hígido',exact:true}).click();await face(46,'oclusal').click();assert.doesNotMatch(await anatomy(46).getAttribute('aria-label'),/Oclusal:/);assert.match(await anatomy(46).getAttribute('aria-label'),/Canal Tratado/);
 await page.getByRole('button',{name:'Modo Seleção Múltipla',exact:true}).click();await clickAnatomy(11);await face(31,'oclusal').click();
 assert.equal(await page.locator('[data-tooth][data-selected="true"]').count(),2);
 await page.getByRole('button',{name:'Cárie Ativa',exact:true}).click();await panel().getByRole('button',{name:'Palatina / Lingual',exact:true}).click();
 assert.equal(await face(11,'palatina').getAttribute('fill'),'#ef4444');assert.equal(await face(31,'lingual').getAttribute('fill'),'#ef4444');
 await page.getByRole('button',{name:'Decídua (Infantil)',exact:true}).click();assert.equal(await page.locator('[data-tooth]').count(),0);await page.getByText('55',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Mista',exact:true}).click();await page.getByText('18',{exact:true}).first().waitFor();await page.getByText('55',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Permanente',exact:true}).click();await anatomy(46).waitFor();
 await page.getByRole('button',{name:'Odontograma Inicial',exact:true}).click();await face(46,'oclusal').click();assert.equal(await face(46,'oclusal').getAttribute('fill'),'#fff');
 await page.getByRole('button',{name:'Comparativo',exact:true}).click();await page.getByText('Comparativo: Odontograma Inicial (Registro de Entrada)',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Odontograma Atual',exact:true}).click();
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:1100});await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.getByRole('region',{name:'Odontograma',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(__dirname,`../../tmp/odontogram-hybrid-${width}.png`)});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width);
 }
 await page.getByRole('button',{name:'Aumentar zoom'}).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.route('**/assets/dentistry/hybrid/tooth-46.png',route=>route.abort());await page.reload();
 await tooth(46).getByText('Anatomia indisponível. Use as faces abaixo.',{exact:true}).waitFor();await face(46,'mesial').click();assert.equal(await face(46,'mesial').getAttribute('fill'),'#ef4444');
 assert.deepEqual(errors,[]);
 console.log('PASS hybrid: 32 anatomy/face pairs, alpha hit testing, alignment, selection and hover sync, all surface edits, whole tooth, legacy 2D, save/reload, audit, dossier, healthy, multiselect, initial, compare, children, responsive zoom, missing asset fallback.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
