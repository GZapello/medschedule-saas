const {chromium}=require('playwright'),esbuild=require('esbuild'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../../tmp/personal-report-tests');fs.mkdirSync(out,{recursive:true});
esbuild.buildSync({entryPoints:[path.join(__dirname,'personal-modal.tsx')],bundle:true,format:'iife',platform:'browser',outfile:path.join(out,'modal.js'),define:{'import.meta.env':'{}'},jsx:'automatic'});
const css=fs.readdirSync(path.resolve(__dirname,'../dist/assets')).find(f=>/^index-.*\.css$/.test(f));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta charset="utf-8"><style>${fs.readFileSync(path.resolve(__dirname,'../dist/assets',css),'utf8')}</style></head><body><div id="root"></div><script>${fs.readFileSync(path.join(out,'modal.js'),'utf8')}</script></body></html>`)});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'Relatório de Avaliação Física',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.zemda-assessment-report')?.textContent.includes('80 kg'));
  const select=page.locator('select').first();await select.selectOption('first');
  await page.waitForFunction(()=>document.querySelector('.zemda-assessment-report')?.textContent.includes('75 kg'));
  assert.deepEqual(await page.evaluate(()=>window.__reports),['latest','first']);
  await page.getByRole('button',{name:'Relatório de evolução',exact:true}).click();
  await page.getByRole('combobox',{name:'Comparação de evolução'}).selectOption('previous');
  await page.getByRole('button',{name:/Imprimir/}).click();assert.equal(await page.evaluate(()=>window.__printed),1);
  assert.deepEqual(errors,[]);assert.ok(!/NaN|Infinity|#DIV\/0!/.test(await page.innerText('.zemda-assessment-report')));
  console.log(JSON.stringify({checks:5,selector:'historical ID fetched before printing',errors}));
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1)});
