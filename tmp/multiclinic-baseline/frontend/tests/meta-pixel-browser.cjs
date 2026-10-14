const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const bundle=require('esbuild').buildSync({entryPoints:['src/utils/metaPixel.ts'],bundle:true,write:false,format:'iife',globalName:'pixelTest'}).outputFiles[0].text;
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}); let checks=0;
async function setup(path='/',marketing=false,referrer){const p=await browser.newPage();await p.route('https://zemda.com.br/**',r=>r.fulfill({contentType:'text/html',body:'<html><head></head><body>Test</body></html>'}));await p.route('https://connect.facebook.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.calls=[];fbq.callMethod=(...a)=>calls.push(a);'}));await p.goto('https://zemda.com.br'+path,referrer?{referer:referrer}:{});if(marketing)await p.evaluate(()=>localStorage.setItem('zemda_cookie_consent',JSON.stringify({analytics:true,marketing:true})));await p.addScriptTag({content:bundle});return p;}
const context=(p,path)=>p.evaluate(path=>pixelTest.updateMetaPixelContext(path),path);
const grant=(p,value)=>p.evaluate(value=>dispatchEvent(new CustomEvent('zemda-cookie-consent-changed',{detail:{marketing:value}})),value);
const calls=p=>p.evaluate(()=>window.calls||[]);
const count=async p=>(await calls(p)).filter(a=>a[0]==='track').length;
try{let p=await setup();await context(p,'/');assert.equal(await p.locator('#zemda-meta-pixel').count(),0);checks++;
await grant(p,true);await p.waitForFunction(()=>window.calls?.some(a=>a[0]==='track'));await context(p,'/');await context(p,'/');assert.equal(await count(p),1);checks++;
for(const [path,n]of [['/planos',2],['/',3]]){await p.evaluate(path=>history.pushState(null,'',path),path);await context(p,path);assert.equal(await count(p),n);checks++;}
await grant(p,false);await grant(p,true);assert.equal(await count(p),3);checks++;
await context(p,null);assert.deepEqual((await calls(p)).at(-1),['consent','revoke']);await p.evaluate(()=>history.pushState(null,'','/patients/secret'));await context(p,null);assert.equal(await count(p),3);checks++;
assert.equal((await calls(p)).filter(a=>a[0]==='init').length,1);assert.ok((await calls(p)).some(a=>JSON.stringify(a)==='["set","autoConfig",false,"1146672904351523"]'));assert.ok((await calls(p)).filter(a=>a[0]==='track').every(a=>a.length===2&&a[1]==='PageView'));checks++;await p.close();
for(const path of ['/agendar/secret','/convite/secret','/teste-gratis/secret','/verificar-documento/secret','/?trial=secret','/?utm_source=private','/?fbclid=abc','/#private']){p=await setup(path,true);await context(p,path.split(/[?#]/)[0]);assert.equal(await p.locator('#zemda-meta-pixel').count(),0,path);await p.close();checks++;}
p=await setup('/',true,'https://zemda.com.br/agendar/private');await context(p,'/');assert.equal(await p.locator('#zemda-meta-pixel').count(),0);await p.close();checks++;
p=await setup('/',true);await context(p,null);assert.equal(await p.locator('#zemda-meta-pixel').count(),0);await p.close();checks++;
p=await setup();let release;const pending=new Promise(r=>release=r);await p.route('https://connect.facebook.net/**',async r=>{await pending;await r.fulfill({contentType:'application/javascript',body:'window.calls=[];fbq.callMethod=(...a)=>calls.push(a);'});});await context(p,'/');await grant(p,true);await grant(p,false);release();await p.waitForFunction(()=>Array.isArray(window.calls));assert.equal((await calls(p)).length,0);await grant(p,true);assert.equal(await count(p),1);checks++;await p.close();console.log('PASS: '+checks+' checks; Meta requests mocked.');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
