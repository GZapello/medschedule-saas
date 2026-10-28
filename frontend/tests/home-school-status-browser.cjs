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

 for(const module of ['ZemdaTO','ZemdaFono']) {
  await open(`module=${module}&source=orchestrator`);
  await page.getByRole('button',{name:new RegExp('Abrir.*'+module)}).click();
  // The module's actual filter is mounted immediately after the phone chip.
  const topSelect=page.locator('select').first();
  assert.equal(await topSelect.evaluate(el=>el.parentElement.parentElement.previousElementSibling.textContent.includes('WhatsApp')),true);
  assert.equal(await page.getByText('Área:',{exact:true}).count(),1);
  const finishBox=await finish().boundingBox(), previousBox=await page.getByRole('button',{name:'Prontuários Anteriores',exact:true}).boundingBox();
  assert.ok(Math.abs((finishBox.y+finishBox.height/2)-(previousBox.y+previousBox.height/2))<3,'aligned action centers');
  for(const width of [390,360,1440]) {
   await page.setViewportSize({width,height:1000});
   assert.ok(await topSelect.isVisible());
   assert.ok(await topSelect.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),'selector fits '+width);
   assert.ok(await finish().evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),'finish fits '+width);
  }
  console.log('PASS header placement, alignment and mobile:',module);
  await page.evaluate(()=>localStorage.removeItem('test-home-programs'));
  await open(`module=${module}&source=home`);
  const group=id=>page.locator(`[data-status-group="${id}"]`);
  const change=async(from,to)=>{await group(from).locator('select').first().selectOption(to);await page.waitForTimeout(100)};
  assert.equal(await group('active').locator('select').count(),1);
  await change('active','paused');
  assert.ok(await page.getByRole('button',{name:'Imprimir todas',exact:true}).isDisabled());
  assert.equal(await group('paused').locator('select').count(),2);
  await page.reload();await group('paused').waitFor();
  assert.equal(await group('paused').locator('select').count(),2);
  await group('paused').locator('summary').click();
  await change('paused','completed');
  await group('completed').locator('summary').click();
  await change('completed','active');
  assert.equal(await group('active').locator('select').count(),1);
  assert.equal(await page.locator('[data-status-group] select').count(),3);
  await page.getByRole('button',{name:'Imprimir todas',exact:true}).click();
  await page.waitForTimeout(300);
  const print=await page.locator('#zemda-home-programs-consolidated-print-root').textContent();
  assert.ok(print.includes('Orientação 0')&&!print.includes('Orientação 1')&&!print.includes('Orientação 2'));
  await page.getByRole('button',{name:'Fechar visualização consolidada'}).click();
  for(const id of ['active','paused','completed']) {
   if(!await group(id).evaluate(el=>el.open))await group(id).locator('summary').click();
   await group(id).getByRole('button',{name:'Imprimir',exact:true}).click();
   assert.ok(await page.locator('#zemda-home-program-print-root').isVisible());
   await page.getByRole('button',{name:'Fechar visualização',exact:true}).click();
   await group(id).getByRole('button',{name:'Salvar em PDF',exact:true}).click();
   await page.waitForTimeout(100);
   assert.ok((await page.evaluate(()=>window.__completion.pdfUrl)).endsWith('/pdf'));
  }
  await page.evaluate(()=>window.__completion.fail=true);
  await change('active','paused');
  assert.equal(await group('active').locator('select').count(),1,'failed save rolls back');
  console.log('PASS grouping, reload, reactivation, active print, individual export and rollback:',module);
 }
 assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
