const {chromium}=require('playwright'),esbuild=require('esbuild'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../../tmp/shared-clinical-browser');fs.mkdirSync(out,{recursive:true});
esbuild.buildSync({entryPoints:[path.join(__dirname,'shared-clinical-assessments.tsx')],bundle:true,format:'iife',platform:'browser',outfile:path.join(out,'fixture.js'),define:{'import.meta.env':'{}'},jsx:'automatic'});
const css=fs.readdirSync(path.resolve(__dirname,'../dist/assets')).find(f=>/^index-.*\.css$/.test(f));
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta charset="utf-8"><style>${fs.readFileSync(path.resolve(__dirname,'../dist/assets',css),'utf8')}</style></head><body><div id="root"></div><script>${fs.readFileSync(path.join(out,'fixture.js'),'utf8')}</script></body></html>`);});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
 try{const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('button',{name:'Antropometria e medidas',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Força e testes funcionais',exact:true}).count(),0);
 await page.getByRole('button',{name:'Observações',exact:true}).click();assert.equal(await page.getByText('Modo Avaliação Postural',{exact:true}).count(),0);assert.equal(await page.getByText('Fotos da Avaliação Corporal',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Salvar Avaliação Clínica',exact:true}).click();await page.waitForFunction(()=>window.__saved.length===1);
 const saved=await page.evaluate(()=>window.__saved[0]);assert.equal(saved.path,'/v1/clinical-assessments');assert.equal(saved.body.patient_id,'patient');assert.equal(saved.body.appointment_id,'appointment');assert.ok(!('strength_tests' in saved.body)&&!('posture' in saved.body)&&!('photos' in saved.body));
 await page.getByRole('button',{name:'fisio',exact:true}).click({force:true});await page.getByRole('button',{name:'Mobilidade, dor e marcha',exact:true}).click();await page.getByText('Dor',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Composição corporal · TAV/eVAT · VAI',exact:true}).count(),0);
 await page.getByRole('button',{name:'Força e testes funcionais',exact:true}).click();assert.equal(await page.getByText('Avaliação Cardiovascular & Hemodinâmica',{exact:true}).count(),0);assert.equal(await page.getByText('Testes de Força / Carga Máxima Estimada (1RM - Epley)',{exact:true}).count(),1);
 await page.screenshot({path:path.join(out,'fisio.png'),fullPage:true});assert.deepEqual(errors,[]);
 console.log(JSON.stringify({checks:12,errors,screenshot:path.join(out,'fisio.png')}));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exit(1);});
