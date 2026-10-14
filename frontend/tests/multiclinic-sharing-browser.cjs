const {chromium}=require('playwright'),esbuild=require('esbuild'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../../tmp/multiclinic-browser');fs.mkdirSync(out,{recursive:true});
esbuild.buildSync({entryPoints:[path.join(__dirname,'multiclinic-sharing.tsx')],bundle:true,format:'iife',platform:'browser',outfile:path.join(out,'fixture.js'),define:{'import.meta.env':'{}'},jsx:'automatic'});
const css=fs.readdirSync(path.resolve(__dirname,'../dist/assets')).find(f=>/^index-.*\.css$/.test(f));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>${fs.readFileSync(path.resolve(__dirname,'../dist/assets',css),'utf8')}</style></head><body><div id="root"></div><script>${fs.readFileSync(path.join(out,'fixture.js'),'utf8')}</script></body></html>`);});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:/Vincular pacientes e dados/}).click();
  await page.getByRole('checkbox',{name:/Ana Silva/}).check();
  await page.getByRole('checkbox',{name:/Prontuário/}).check();
  await page.getByRole('button',{name:'Revisar compartilhamento'}).click();
  assert.equal(await page.getByRole('button',{name:'Confirmar compartilhamento e entrar'}).isDisabled(),true);
  await page.getByRole('checkbox',{name:/Confirmo que desejo/}).check();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
  await page.screenshot({path:path.join(out,`confirmation-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'Confirmar compartilhamento e entrar'}).click();await page.waitForFunction(()=>window.finished);
  const saved=await page.evaluate(()=>window.saved);assert.deepEqual(saved[0].body.patientIds,['p1']);assert.equal(saved[0].body.confirmed,true);assert.deepEqual(errors,[]);await page.close();
 }
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:/Somente meu acesso profissional/}).click();await page.waitForFunction(()=>window.finished);assert.deepEqual(await page.evaluate(()=>window.saved),[]);
 console.log('PASS: selected patients, explicit consent, optional sharing, desktop and mobile.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exit(1)});
